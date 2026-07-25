import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Curated directory of providers' OFFICIAL support-chat channels, maintained
 * by hand at fixtures/providers/{country}.json. Three channel kinds:
 *
 *  - "whatsapp" (default): wa.me deep link with a preloaded message
 *  - "sms":      sms: deep link (US short codes like Xfinity 266278)
 *  - "web_chat": plain link to the provider's official chat/contact page
 *                (no preloaded text possible)
 *
 * An entry only belongs here when the number/URL is confirmed on the
 * provider's own domain (`source` records where) — a wrong number would
 * point customers at a stranger. The DB `providers` table supersedes this
 * once Part B's verification workflow is live.
 */
export type ProviderChatChannel = "whatsapp" | "sms" | "web_chat";

export interface ProviderChatEntry {
  /** Canonical provider name as it appears on bills. */
  name: string;
  /** Other spellings/brands that appear on bills ("Movistar", "Telefónica"). */
  aliases?: string[];
  /** Categories this channel serves; omit = all. */
  categories?: string[];
  /** Defaults to "whatsapp" (legacy entries omit it). */
  channel?: ProviderChatChannel;
  /** whatsapp: official number, E.164-ish (digits, may include +/spaces). */
  waNumber?: string;
  /** sms: conversational short code or number. */
  smsNumber?: string;
  /** sms: fixed body the short code expects (e.g. a keyword); overrides the localized draft. */
  smsBody?: string;
  /** web_chat: the provider's official chat/contact page. */
  chatUrl?: string;
  /** URL on the provider's own domain confirming the channel. */
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

function matches(entry: ProviderChatEntry, providerName: string): boolean {
  const bill = normalize(providerName);
  if (!bill) return false;
  const candidates = [entry.name, ...(entry.aliases ?? [])].map(normalize);
  // Bill names carry legal noise ("Vodafone España S.A.U.") — containment
  // either way, on word boundaries via the normalized token strings. Min
  // length 2 admits real brands like "o2" and "Oi"; the token boundary and
  // country+category scoping keep short names from false-matching.
  return candidates.some((c) => c.length >= 2 && (` ${bill} `.includes(` ${c} `) || ` ${c} `.includes(` ${bill} `)));
}

/** An entry is shippable only when its channel has its required endpoint. */
function usable(e: ProviderChatEntry): boolean {
  const channel = e.channel ?? "whatsapp";
  if (channel === "whatsapp") return Boolean(e.waNumber);
  if (channel === "sms") return Boolean(e.smsNumber);
  return Boolean(e.chatUrl);
}

export async function lookupProviderChat(
  providerName: string | null | undefined,
  country: string | null | undefined,
  category?: string,
  baseDir?: string,
): Promise<ProviderChatEntry | null> {
  if (!providerName || !country) return null;
  const dirs = baseDir
    ? [baseDir]
    : [path.resolve(process.cwd(), "fixtures/providers"), path.resolve(process.cwd(), "../../fixtures/providers")];
  for (const dir of dirs) {
    let entries: ProviderChatEntry[];
    try {
      entries = JSON.parse(await readFile(path.join(dir, `${country.toUpperCase()}.json`), "utf8")) as ProviderChatEntry[];
    } catch {
      continue; // no directory for this market (or next candidate dir)
    }
    const hit = entries.find(
      (e) => usable(e) && matches(e, providerName) && (!category || !e.categories || e.categories.includes(category)),
    );
    return hit ?? null; // file existed; absent provider = not listed
  }
  return null;
}
