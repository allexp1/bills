import { inflateRawSync } from "node:zlib";

/**
 * Minimal .xlsx → plain text, so spreadsheet exports can enter the same
 * extraction pipeline as photos and PDFs.
 *
 * Exists because Israel's Har haBituach registry exports Excel as its
 * primary format, and the intake only spoke image and PDF — the model was
 * being handed xlsx bytes labelled image/jpeg. Rather than adding a
 * spreadsheet dependency for what is structurally a zip of small XML files,
 * this reads the zip central directory with node's own zlib and flattens
 * every sheet to pipe-separated rows. The extraction model reads that text
 * the way it reads a document.
 *
 * Deliberately NOT a general xlsx library: no styles, no dates-vs-numbers
 * (raw cell values are fine — the extraction model normalises), no
 * formulas' cached values beyond <v>, no xlsb/xls. A file this code cannot
 * read should fail loudly and early, at intake.
 */

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readEntries(buf: Buffer): ZipEntry[] {
  // End-of-central-directory: scan back for its signature (max comment 64k).
  let eocd = -1;
  const stop = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not_a_zip");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("bad_central_directory");
    const method = buf.readUInt16LE(off + 10);
    const compressedSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOffset = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    entries.push({ name, method, compressedSize, localOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readFileData(buf: Buffer, e: ZipEntry): Buffer {
  // Sizes come from the central directory; the local header only tells us
  // where its variable-length fields end.
  if (buf.readUInt32LE(e.localOffset) !== 0x04034b50) throw new Error("bad_local_header");
  const nameLen = buf.readUInt16LE(e.localOffset + 26);
  const extraLen = buf.readUInt16LE(e.localOffset + 28);
  const start = e.localOffset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + e.compressedSize);
  if (e.method === 0) return Buffer.from(raw);
  if (e.method === 8) return inflateRawSync(raw);
  throw new Error(`unsupported_compression_${e.method}`);
}

/**
 * Strip XML namespace prefixes from element names: `<x:row>` → `<row>`.
 * Both spellings are valid SpreadsheetML and both occur in the wild — Excel
 * itself writes unprefixed, the .NET generators behind Israeli government
 * exports write `x:`-prefixed. One normalisation keeps every later pattern
 * blind to the difference.
 */
const stripNs = (xml: string): string => xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, "<$1");

const unescape = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** Every <t> inside one element, concatenated — rich-text runs split them. */
const textOf = (xml: string): string =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1]!)).join("");

/** Column index from a cell ref: "A1" → 0, "AB3" → 27. */
const colOf = (ref: string): number => {
  let n = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
};

/**
 * Flatten a workbook to text: one line per row, cells joined by " | ",
 * sheets separated by name headers when there are several. Throws on
 * anything that is not a readable xlsx — the caller turns that into an
 * intake error, which beats a model politely hallucinating over noise.
 */
export function xlsxToText(file: Buffer, maxChars = 100_000): string {
  const entries = readEntries(file);
  const byName = new Map(entries.map((e) => [e.name, e]));

  const sharedXml = byName.has("xl/sharedStrings.xml")
    ? stripNs(readFileData(file, byName.get("xl/sharedStrings.xml")!).toString("utf8"))
    : "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));

  const sheets = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  if (sheets.length === 0) throw new Error("no_worksheets");

  const out: string[] = [];
  for (const sheet of sheets) {
    if (sheets.length > 1) out.push(`--- ${sheet.name.replace(/^xl\/worksheets\/|\.xml$/g, "")} ---`);
    const xml = stripNs(readFileData(file, sheet).toString("utf8"));
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      /* Two alternatives, because a lazy [\s\S]*? after an optional "/>"
         would swallow the NEXT cell whenever this one is self-closing — an
         empty styled cell would then steal its neighbour's value. */
      for (const cellMatch of rowMatch[1]!.matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = (cellMatch[1] ?? cellMatch[2])!;
        const inner = cellMatch[3] ?? "";
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
        const type = /t="(\w+)"/.exec(attrs)?.[1];
        let value = "";
        if (type === "s") {
          const idx = /<v>(\d+)<\/v>/.exec(inner)?.[1];
          value = idx !== undefined ? (shared[Number(idx)] ?? "") : "";
        } else if (type === "inlineStr") {
          value = textOf(inner);
        } else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          value = v !== undefined ? unescape(v) : "";
        }
        // Keep column positions honest: pad skipped columns so header rows
        // and data rows stay aligned when cells are sparse.
        if (ref) {
          const col = colOf(ref);
          while (cells.length < col) cells.push("");
        }
        cells.push(value.trim());
      }
      const line = cells.join(" | ").replace(/[\s|]+$/, "");
      if (line.trim()) out.push(line);
    }
  }

  const text = out.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated]` : text;
}

export const SPREADSHEET_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

/** True when this upload should go through the text path rather than vision. */
export function isSpreadsheet(mimeType: string): boolean {
  return SPREADSHEET_MIME_TYPES.has(mimeType);
}

/** Text for any supported spreadsheet type; CSV is already text. */
export function spreadsheetToText(data: Buffer, mimeType: string): string {
  return mimeType === "text/csv" ? data.toString("utf8").slice(0, 100_000) : xlsxToText(data);
}
