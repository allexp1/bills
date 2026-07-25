import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Curated directory of providers' OFFICIAL WhatsApp customer-service numbers,
 * maintained by hand at fixtures/providers/{country}.json. An entry only
 * belongs here when the number is confirmed on the provider's own domain
 * (`source` records where) — a wrong number would point customers at a
 * stranger. The DB `providers` table supersedes this once Part B's
 * verification workflow is live; both feed the same lookup shape.
 */
export interface ProviderWaEntry {
  /** Canonical provider name as it appears on bills. */
  name: string;
  /** Other spellings/brands that appear on bills ("Movistar", "Telefónica"). */
  aliases?: string[];
  /** Categories this number serves; omit = all. */
  categories?: string[];
  /** Official WhatsApp number, E.164-ish (digits, may include +/spaces). */
  waNumber: string;
  /** URL on the provider's own domain confirming the number. */
  source: string;
  notes?: string;
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function matches(entry: ProviderWaEntry, providerName: string): boolean {
  const bill = normalize(providerName);
  if (!bill) return false;
  const candidates = [entry.name, ...(entry.aliases ?? [])].map(normalize);
  // Bill names carry legal noise ("Vodafone España S.A.U.") — containment
  // either way, on word boundaries via the normalized token strings. Min
  // length 2 admits real brands like "o2" and "Oi"; the token boundary and
  // country+category scoping keep short names from false-matching.
  return candidates.some((c) => c.length >= 2 && (` ${bill} `.includes(` ${c} `) || ` ${c} `.includes(` ${bill} `)));
}

export async function lookupProviderWa(
  providerName: string | null | undefined,
  country: string | null | undefined,
  category?: string,
  baseDir?: string,
): Promise<ProviderWaEntry | null> {
  if (!providerName || !country) return null;
  const dirs = baseDir
    ? [baseDir]
    : [path.resolve(process.cwd(), "fixtures/providers"), path.resolve(process.cwd(), "../../fixtures/providers")];
  for (const dir of dirs) {
    let entries: ProviderWaEntry[];
    try {
      entries = JSON.parse(await readFile(path.join(dir, `${country.toUpperCase()}.json`), "utf8")) as ProviderWaEntry[];
    } catch {
      continue; // no directory for this market (or next candidate dir)
    }
    const hit = entries.find(
      (e) => matches(e, providerName) && (!category || !e.categories || e.categories.includes(category)),
    );
    return hit ?? null; // file existed; absent provider = not listed
  }
  return null;
}
