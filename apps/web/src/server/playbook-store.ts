import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { isPlaybookFailure, researchUtilityPlaybook } from "@bills/llm";
import {
  establishedTerms,
  mergeObservations,
  PLAYBOOK_SCHEMA_VERSION,
  UtilityPlaybookSchema,
  type PlaybookObservation,
  type PlaybookRecord,
} from "@bills/category-packs";
import { redactRestrictedData } from "@bills/shared";

/**
 * The playbook cache: research a (country, utility) market once, reuse it for
 * every later bill of that kind, and re-research it as volume and staleness
 * warrant.
 *
 * The first bill in a new market pays for the research (a slow web-search
 * pass); every bill after it reads a row. Bills also feed back in — anonymised
 * line-item wording accumulates, and at set volume milestones the market is
 * re-researched with that wording as input, so the glossary and levers get
 * sharper the more bills of that kind the product has seen.
 */

/** Markets change slowly, but tariffs and schemes do move. */
const MAX_AGE_DAYS = 90;
/** Bill counts at which accumulated wording is worth a fresh research pass. */
const REFRESH_AT_BILLS = [5, 25, 100];

export interface PlaybookLookup {
  record: PlaybookRecord | null;
  /** True when this call performed the (slow) research. */
  researched: boolean;
  /** Why research failed, when it did — surfaced by the admin route. */
  error?: string;
  detail?: string;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * Canonical form of a subdivision: bare ISO-3166-2 code, uppercase, no country
 * prefix. Bills print "TX", "US-TX" or "Texas"; only the first is a key, so
 * anything else that is not already a short code becomes "" and falls back to
 * the country playbook — a fallback is always safe, a wrong key is not.
 */
export function normalizeRegion(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toUpperCase().replace(/^[A-Z]{2}-/, "");
  return /^[A-Z0-9]{1,3}$/.test(s) ? s : "";
}

function toRecord(row: typeof schema.utilityPlaybooks.$inferSelect): PlaybookRecord | null {
  const parsed = UtilityPlaybookSchema.safeParse(row.data);
  if (!parsed.success) return null;
  return {
    country: row.country,
    region: row.region,
    utility: row.utility,
    version: row.version,
    schemaVersion: row.schemaVersion,
    playbook: parsed.data,
    billsSeen: row.billsSeen,
    observations: (row.observations ?? []) as PlaybookObservation[],
    researchedAt: row.researchedAt.toISOString(),
  };
}

/** Read one exact (country, region, utility) key. "" region = country-level. */
export async function readPlaybook(
  country: string,
  utility: string,
  region = "",
): Promise<PlaybookRecord | null> {
  const [row] = await db()
    .select()
    .from(schema.utilityPlaybooks)
    .where(
      and(
        eq(schema.utilityPlaybooks.country, country.toUpperCase()),
        eq(schema.utilityPlaybooks.region, normalizeRegion(region)),
        eq(schema.utilityPlaybooks.utility, norm(utility)),
      ),
    )
    .limit(1);
  return row ? toRecord(row) : null;
}

/**
 * The read a bill actually wants: the region's own playbook when one has been
 * researched, otherwise the country's.
 *
 * Most regions never get their own row and never need one — the country answer
 * is already correct for them. Research is spent only where the country-level
 * answer is known to be wrong, and this fallback is what makes that affordable:
 * fifty states, a handful of playbooks.
 */
export async function resolvePlaybook(
  country: string,
  utility: string,
  region: string | null | undefined,
): Promise<PlaybookRecord | null> {
  const r = normalizeRegion(region);
  if (r) {
    const specific = await readPlaybook(country, utility, r);
    if (specific) return specific;
  }
  return readPlaybook(country, utility, "");
}

/**
 * Fetch the playbook for a market, researching it if we have none or if the
 * cached one is stale. Returns null only when research itself failed — callers
 * must stay useful without a playbook rather than failing the bill.
 */
export async function getOrResearchPlaybook(args: {
  country: string;
  utility: string;
  /**
   * Subdivision code. What happens with it depends on `exact`:
   *  - default: a read-with-fallback hint. A researched region row is
   *    preferred, but a missing one is NOT researched on a customer's request
   *    — we fall back to the country row and research that if needed. This is
   *    the cost guard: a bill from any of fifty states must not be able to
   *    trigger a fifty-state research bill.
   *  - `exact: true`: this region IS the row to research. Used by the warming
   *    queue and the admin route, where spending is deliberate.
   */
  region?: string | null;
  exact?: boolean;
  language?: string | null;
  providerName?: string | null;
  /** Skip the research call and return only what is cached. */
  cachedOnly?: boolean;
  force?: boolean;
}): Promise<PlaybookLookup> {
  const country = args.country.toUpperCase();
  const utility = norm(args.utility);
  const region = args.exact ? normalizeRegion(args.region) : "";
  if (!country || !utility) return { record: null, researched: false };

  const existing = args.exact
    ? await readPlaybook(country, utility, region)
    : await resolvePlaybook(country, utility, args.region);
  // A region row satisfying a fallback read is already the best answer there
  // is; never re-research the country row on its behalf.
  if (existing && !args.exact && existing.region !== "") {
    return { record: existing, researched: false };
  }
  if (existing && !args.force) {
    const ageDays = (Date.now() - Date.parse(existing.researchedAt)) / 86_400_000;
    const fresh = ageDays < MAX_AGE_DAYS && existing.schemaVersion === PLAYBOOK_SCHEMA_VERSION;
    if (fresh || args.cachedOnly) return { record: existing, researched: false };
  }
  if (!existing && args.cachedOnly) return { record: null, researched: false };

  const result = await researchUtilityPlaybook({
    country,
    utility,
    region,
    language: args.language ?? null,
    providers: args.providerName ? [args.providerName] : [],
    observedTerms: existing ? establishedTerms(existing.observations) : [],
  });
  if (isPlaybookFailure(result)) {
    return { record: existing, researched: false, error: result.error, detail: result.detail };
  }
  const researched = result;

  const version = (existing?.version ?? 0) + 1;
  await db()
    .insert(schema.utilityPlaybooks)
    .values({
      country,
      region,
      utility,
      version,
      schemaVersion: PLAYBOOK_SCHEMA_VERSION,
      data: researched.playbook,
      observations: existing?.observations ?? [],
      billsSeen: existing?.billsSeen ?? 0,
      providers: args.providerName ? [args.providerName] : [],
      model: "opus",
      promptVersion: researched.promptVersion,
      status: "ok",
      researchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        schema.utilityPlaybooks.country,
        schema.utilityPlaybooks.region,
        schema.utilityPlaybooks.utility,
      ],
      set: {
        version,
        schemaVersion: PLAYBOOK_SCHEMA_VERSION,
        data: researched.playbook,
        promptVersion: researched.promptVersion,
        status: "ok",
        // A row that finally succeeds stops looking like a failing one.
        attempts: 0,
        lastError: null,
        researchedAt: new Date(),
      },
    });

  return {
    record: {
      country,
      region,
      utility,
      version,
      schemaVersion: PLAYBOOK_SCHEMA_VERSION,
      playbook: researched.playbook,
      billsSeen: existing?.billsSeen ?? 0,
      observations: existing?.observations ?? [],
      researchedAt: new Date().toISOString(),
    },
    researched: true,
  };
}

/**
 * Strip a line-item label down to reusable market vocabulary: no digits (so no
 * amounts, phone numbers, account or meter numbers survive), restricted data
 * redacted, length-capped. "תשלום חודשי קבוע (דמי מנוי) - 050-6570997"
 * becomes "תשלום חודשי קבוע (דמי מנוי)".
 */
export function normalizeLabel(raw: string): string | null {
  const redacted = redactRestrictedData(raw).text;
  const stripped = redacted
    .replace(/\d+/g, " ")
    .replace(/[\s ]+/g, " ")
    .replace(/[-–—:·|/\\]+\s*$/, "")
    .trim();
  // Needs real words to be vocabulary rather than punctuation debris.
  const letters = (stripped.match(/\p{L}/gu) ?? []).length;
  if (letters < 6 || stripped.length > 80) return null;
  return stripped;
}

/**
 * Feed one analysed bill back into its market's playbook: count the bill,
 * remember the provider, and merge its (digit-free) line-item wording. When a
 * volume milestone is crossed, re-research the market with that accumulated
 * wording so the playbook gets sharper.
 *
 * Best-effort throughout — learning must never fail a customer's analysis.
 */
export async function recordBillForPlaybook(args: {
  country: string | null;
  region?: string | null;
  utility: string;
  providerName: string | null;
  lineItemLabels: string[];
  language?: string | null;
}): Promise<void> {
  const country = args.country?.toUpperCase();
  const utility = norm(args.utility);
  if (!country || !utility) return;

  try {
    // Learn into the row this bill was actually decoded with — the region's
    // own playbook when it has one, the country's otherwise.
    const existing = await resolvePlaybook(country, utility, args.region);
    if (!existing) return; // nothing to learn into yet
    const region = existing.region;

    const fresh = args.lineItemLabels
      .map(normalizeLabel)
      .filter((l): l is string => l !== null);
    const observations = mergeObservations(existing.observations, fresh);
    const billsSeen = existing.billsSeen + 1;

    await db()
      .update(schema.utilityPlaybooks)
      .set({
        observations,
        billsSeen,
        ...(args.providerName
          ? {
              providers: sql`(
                select jsonb_agg(distinct value)
                from jsonb_array_elements(coalesce(${schema.utilityPlaybooks.providers}, '[]'::jsonb) || ${JSON.stringify([args.providerName])}::jsonb) as value
              )`,
            }
          : {}),
      })
      .where(
        and(
          eq(schema.utilityPlaybooks.country, country),
          eq(schema.utilityPlaybooks.region, region),
          eq(schema.utilityPlaybooks.utility, utility),
        ),
      );

    if (REFRESH_AT_BILLS.includes(billsSeen)) {
      // Volume milestone: re-research with what these bills actually say.
      await getOrResearchPlaybook({
        country,
        utility,
        region,
        exact: true,
        language: args.language ?? null,
        providerName: args.providerName,
        force: true,
      });
    }
  } catch (err) {
    console.warn("[playbook] learning write failed:", err instanceof Error ? err.message.slice(0, 160) : "");
  }
}
