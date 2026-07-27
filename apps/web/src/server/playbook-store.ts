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

function toRecord(row: typeof schema.utilityPlaybooks.$inferSelect): PlaybookRecord | null {
  const parsed = UtilityPlaybookSchema.safeParse(row.data);
  if (!parsed.success) return null;
  return {
    country: row.country,
    utility: row.utility,
    version: row.version,
    schemaVersion: row.schemaVersion,
    playbook: parsed.data,
    billsSeen: row.billsSeen,
    observations: (row.observations ?? []) as PlaybookObservation[],
    researchedAt: row.researchedAt.toISOString(),
  };
}

export async function readPlaybook(country: string, utility: string): Promise<PlaybookRecord | null> {
  const [row] = await db()
    .select()
    .from(schema.utilityPlaybooks)
    .where(
      and(
        eq(schema.utilityPlaybooks.country, country.toUpperCase()),
        eq(schema.utilityPlaybooks.utility, norm(utility)),
      ),
    )
    .limit(1);
  return row ? toRecord(row) : null;
}

/**
 * Fetch the playbook for a market, researching it if we have none or if the
 * cached one is stale. Returns null only when research itself failed — callers
 * must stay useful without a playbook rather than failing the bill.
 */
export async function getOrResearchPlaybook(args: {
  country: string;
  utility: string;
  language?: string | null;
  providerName?: string | null;
  /** Skip the research call and return only what is cached. */
  cachedOnly?: boolean;
  force?: boolean;
}): Promise<PlaybookLookup> {
  const country = args.country.toUpperCase();
  const utility = norm(args.utility);
  if (!country || !utility) return { record: null, researched: false };

  const existing = await readPlaybook(country, utility);
  if (existing && !args.force) {
    const ageDays = (Date.now() - Date.parse(existing.researchedAt)) / 86_400_000;
    const fresh = ageDays < MAX_AGE_DAYS && existing.schemaVersion === PLAYBOOK_SCHEMA_VERSION;
    if (fresh || args.cachedOnly) return { record: existing, researched: false };
  }
  if (!existing && args.cachedOnly) return { record: null, researched: false };

  const result = await researchUtilityPlaybook({
    country,
    utility,
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
      target: [schema.utilityPlaybooks.country, schema.utilityPlaybooks.utility],
      set: {
        version,
        schemaVersion: PLAYBOOK_SCHEMA_VERSION,
        data: researched.playbook,
        promptVersion: researched.promptVersion,
        status: "ok",
        researchedAt: new Date(),
      },
    });

  return {
    record: {
      country,
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
  utility: string;
  providerName: string | null;
  lineItemLabels: string[];
  language?: string | null;
}): Promise<void> {
  const country = args.country?.toUpperCase();
  const utility = norm(args.utility);
  if (!country || !utility) return;

  try {
    const existing = await readPlaybook(country, utility);
    if (!existing) return; // nothing to learn into yet

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
        and(eq(schema.utilityPlaybooks.country, country), eq(schema.utilityPlaybooks.utility, utility)),
      );

    if (REFRESH_AT_BILLS.includes(billsSeen)) {
      // Volume milestone: re-research with what these bills actually say.
      await getOrResearchPlaybook({
        country,
        utility,
        language: args.language ?? null,
        providerName: args.providerName,
        force: true,
      });
    }
  } catch (err) {
    console.warn("[playbook] learning write failed:", err instanceof Error ? err.message.slice(0, 160) : "");
  }
}
