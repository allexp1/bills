import { z } from "zod";
import type { CommonFields } from "./common-schema.js";
import type { CategoryPack, LeverVerdict, SavingsClaim, SavingsLever } from "./pack.js";
import { UtilityFieldsSchema, utilityPack, type UtilityFields } from "./packs/utility/index.js";

/**
 * A utility playbook is researched market knowledge for one (country, utility)
 * pair — "how does water billing work in Israel", "can you switch waste
 * collection in Spain" — cached in the database and refined as more bills of
 * that kind arrive.
 *
 * It exists because bill-saving advice is not universal. Switching supplier is
 * the strongest lever in a competitive market and impossible in a regional
 * monopoly; a social tariff that halves a bill in one country has no analogue
 * in the next. Hard-coding a pack per utility per country does not scale, so
 * the pack becomes data: the playbook supplies the glossary, the gotchas and
 * the savings levers, while the extraction schema and the guardrails stay
 * fixed code.
 *
 * Everything in here is PUBLIC market knowledge from cited sources. No
 * customer data ever enters a playbook — see `PlaybookObservation` for the
 * anonymised, k-anonymous structural signal that feeds the refresh.
 */

export const PLAYBOOK_SCHEMA_VERSION = 1;

const SourcedSchema = z.object({
  claim: z.string(),
  source: z.string(),
});

export const PlaybookLeverSchema = z.object({
  /** Stable slug, namespaced by the pack at runtime ("pb_leak_check"). */
  id: z.string().regex(/^[a-z0-9_]+$/),
  kind: z.enum(["optimize_current", "switch_provider"]),
  /** Short imperative title in the bill's own language. */
  title: z.string(),
  titleEn: z.string(),
  /** Instruction to the decode model: when this lever applies and how to phrase it. */
  promptFragment: z.string(),
  /**
   * Whether a dependable amount can be computed FROM THE BILL. Behaviour
   * advice ("fix a running toilet") is real but unquantifiable; claiming a
   * number for it would be invention, so those levers render without one.
   */
  quantifiable: z.boolean(),
  /** Levers that need supplier switching are dropped in monopoly markets. */
  requiresSwitching: z.boolean(),
});
export type PlaybookLever = z.infer<typeof PlaybookLeverSchema>;

export const UtilityPlaybookSchema = z.object({
  /** What this utility is called locally, for the decode model's vocabulary. */
  localNames: z.array(z.string()).max(6),
  marketStructure: z.object({
    /** THE decisive fact: can a consumer change supplier at all? */
    switchable: z.boolean(),
    model: z.enum(["competitive", "regional_monopoly", "national_monopoly", "municipal", "unknown"]),
    regulator: z.string().nullable(),
    regulatorUrl: z.string().nullable(),
    /** Where to escalate when the provider says no. */
    complaintRoute: z.string().nullable(),
  }),
  billing: z.object({
    /** The unit consumption is measured in — m³, kWh, GB, litres. */
    unit: z.string().nullable(),
    /** Prose: how a bill of this kind is actually built up. */
    structure: z.string(),
    tieredPricing: z.boolean().nullable(),
    estimatedReadsCommon: z.boolean().nullable(),
    typicalLineItems: z
      .array(z.object({ label: z.string(), meaning: z.string(), negotiable: z.boolean() }))
      .max(12),
  }),
  /** Yardsticks that let us say "your usage is high for a household this size". */
  benchmarks: z
    .array(z.object({ label: z.string(), value: z.string(), unit: z.string().nullable(), source: z.string() }))
    .max(8),
  /** Discounts, social tariffs, rebates — the money people leave unclaimed. */
  schemes: z
    .array(
      z.object({
        name: z.string(),
        whoQualifies: z.string(),
        howToApply: z.string(),
        source: z.string(),
      }),
    )
    .max(8),
  /** Overcharges and billing mistakes that are common in THIS market. */
  commonErrors: z.array(z.object({ label: z.string(), howToSpot: z.string() })).max(8),
  levers: z.array(PlaybookLeverSchema).max(10),
  /** Local-language jargon → plain words. */
  glossary: z.array(z.object({ term: z.string(), plain: z.string() })).max(20),
  sources: z.array(SourcedSchema).max(20),
  /** The model's own 0–1 confidence that this market was researched reliably. */
  confidence: z.number().min(0).max(1),
});
export type UtilityPlaybook = z.infer<typeof UtilityPlaybookSchema>;

/**
 * Anonymised structural signal harvested from analysed bills, used to sharpen
 * the next research pass. Labels only — never amounts, never identifiers, and
 * only after digit-stripping and restricted-data redaction upstream. A term is
 * promoted into the playbook once it has been seen on bills from at least
 * `MIN_DISTINCT_BILLS` different bills, so a one-off string on a single
 * customer's bill can never surface.
 */
export const MIN_DISTINCT_BILLS = 2;

export interface PlaybookObservation {
  /** Normalised line-item label with digits removed. */
  label: string;
  count: number;
}

export interface PlaybookRecord {
  country: string;
  utility: string;
  version: number;
  schemaVersion: number;
  playbook: UtilityPlaybook;
  billsSeen: number;
  observations: PlaybookObservation[];
  researchedAt: string;
}

/** Labels seen on at least MIN_DISTINCT_BILLS distinct bills. */
export function establishedTerms(observations: PlaybookObservation[], limit = 25): string[] {
  return observations
    .filter((o) => o.count >= MIN_DISTINCT_BILLS)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((o) => o.label);
}

/**
 * Merge a new observation batch into the stored counts. Counting DISTINCT
 * bills (one increment per label per bill) is what makes the threshold a
 * k-anonymity guarantee rather than a frequency heuristic.
 */
export function mergeObservations(
  stored: PlaybookObservation[],
  fresh: string[],
  cap = 400,
): PlaybookObservation[] {
  const counts = new Map(stored.map((o) => [o.label, o.count]));
  for (const label of new Set(fresh)) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, cap);
}

/**
 * The generic guardrail for a researched lever. Playbook levers have no
 * bespoke arithmetic — the honest rule is that a quantified claim must land
 * on an amount actually printed on the bill (the numeric sweep in
 * `applyGuardrails` then re-checks every amount in the prose), and anything
 * else keeps its advice but loses its number.
 */
function validatePlaybookLever(lever: PlaybookLever) {
  return (claim: SavingsClaim, fields: UtilityFields, common: CommonFields): LeverVerdict => {
    if (!lever.quantifiable) {
      return { verdict: "flagged", reason: "qualitative lever — advice without a derivable amount" };
    }
    if (claim.estimatedSavingMinor <= 0) {
      return { verdict: "flagged", reason: "no positive amount claimed" };
    }
    // Cited paths must exist; the sweep in applyGuardrails does the rest.
    if (claim.basis.extractionPaths.length === 0) {
      return { verdict: "flagged", reason: "no extraction path cited" };
    }
    return { verdict: "computed", recomputedMinor: claim.estimatedSavingMinor };
  };
}

/**
 * Turn researched knowledge into a runtime CategoryPack. The extraction
 * schema stays the fixed generic one — the vision prompt must remain
 * byte-identical for prompt caching, and a per-country schema would defeat
 * that — while the glossary, gotcha checks and levers all come from the
 * playbook.
 */
export function playbookPack(args: {
  utility: string;
  country: string;
  record: PlaybookRecord;
}): CategoryPack<UtilityFields> {
  const { utility, country, record } = args;
  const pb = record.playbook;

  // A lever that requires switching is worse than useless in a monopoly: it
  // sends the customer to do something the market does not permit.
  const usableLevers = pb.levers.filter((l) => !(l.requiresSwitching && !pb.marketStructure.switchable));

  const levers: SavingsLever<UtilityFields>[] = usableLevers.map((lever) => ({
    id: `pb_${lever.id}`,
    kind: lever.kind,
    title: {
      en: lever.titleEn,
      es: lever.title,
      fr: lever.title,
      pt: lever.title,
      de: lever.title,
      he: lever.title,
      ru: lever.title,
      zh: lever.title,
    },
    promptFragment: lever.quantifiable
      ? `${lever.promptFragment} Cite the exact extraction paths the amount comes from.`
      : `${lever.promptFragment} Do NOT attach a money amount to this lever — explain the action and its effect in words only.`,
    validate: validatePlaybookLever(lever),
    nextStep: () => lever.title,
  }));

  const glossary = [
    pb.billing.structure,
    ...pb.billing.typicalLineItems.map((li) => `${li.label} = ${li.meaning}${li.negotiable ? "" : " (not negotiable)"}`),
    ...pb.glossary.map((g) => `${g.term} = ${g.plain}`),
  ].join("; ");

  return {
    ...utilityPack,
    id: utility,
    version: `${PLAYBOOK_SCHEMA_VERSION}.${record.version}.0`,
    countries: [country],
    extractionSchema: UtilityFieldsSchema,
    extractionHints: {
      ...utilityPack.extractionHints,
      serviceType: `This is a ${utility} bill in ${country}. Locally it may be called: ${pb.localNames.join(", ")}.`,
      ...(pb.billing.unit ? { usageQuantity: `Consumption is normally measured in ${pb.billing.unit} in this market.` } : {}),
    },
    decodeHints: {
      lineItemGlossary: glossary,
      gotchaChecks: [
        ...utilityPack.decodeHints.gotchaChecks,
        ...pb.commonErrors.map((err) => ({
          id: `pb_${slug(err.label)}`,
          promptFragment: `KNOWN ISSUE IN THIS MARKET — ${err.label}: ${err.howToSpot}. Flag it only if this bill actually shows it.`,
        })),
        ...(pb.schemes.length > 0
          ? [
              {
                id: "pb_schemes",
                promptFragment: `Discounts and support schemes that exist in this market: ${pb.schemes
                  .map((s) => `${s.name} (for ${s.whoQualifies}; ${s.howToApply})`)
                  .join("; ")}. Mention any the customer might be eligible for, with NO invented amount.`,
              },
            ]
          : []),
        ...(pb.marketStructure.switchable
          ? []
          : [
              {
                id: "pb_no_switching",
                promptFragment: `IMPORTANT: ${utility} in ${country} is a ${pb.marketStructure.model.replace(/_/g, " ")} — the customer CANNOT change supplier. Never suggest switching, comparing suppliers, or threatening to leave. Savings must come from usage, tariff choice, allowances, rebates and billing corrections.${pb.marketStructure.complaintRoute ? ` Escalation route: ${pb.marketStructure.complaintRoute}.` : ""}`,
              },
            ]),
        ...(pb.benchmarks.length > 0
          ? [
              {
                id: "pb_benchmarks",
                promptFragment: `Published benchmarks for this market: ${pb.benchmarks
                  .map((b) => `${b.label} = ${b.value}${b.unit ? ` ${b.unit}` : ""}`)
                  .join("; ")}. Use them to judge whether this customer's usage is high, and say so plainly.`,
              },
            ]
          : []),
      ],
    },
    savingsLevers: levers,
    // In a monopoly there is nothing to compare against — skip the search.
    ...(pb.marketStructure.switchable ? {} : { comparisonSource: undefined }),
  };
}

/**
 * Additive variant for the hand-written packs. Their levers and validators are
 * bespoke and stay exactly as they are — this only hands the decode model the
 * researched local facts (what the regulator is, which schemes exist, what
 * goes wrong in this market, what normal consumption looks like) so a Spanish
 * energy bill and an Israeli one stop getting identical generic advice.
 */
export function withPlaybookHints<T>(pack: CategoryPack<T>, record: PlaybookRecord): CategoryPack<T> {
  const pb = record.playbook;
  const extra: CategoryPack<T>["decodeHints"]["gotchaChecks"] = [];

  if (pb.schemes.length > 0) {
    extra.push({
      id: "pb_schemes",
      promptFragment: `Support schemes and discounts that exist in ${record.country} for this service: ${pb.schemes
        .map((s) => `${s.name} (for ${s.whoQualifies}; ${s.howToApply})`)
        .join("; ")}. Mention any this customer plausibly qualifies for, with NO invented amount.`,
    });
  }
  for (const err of pb.commonErrors) {
    extra.push({
      id: `pb_${slug(err.label)}`,
      promptFragment: `KNOWN ISSUE IN ${record.country} — ${err.label}: ${err.howToSpot}. Flag it only if this bill actually shows it.`,
    });
  }
  if (pb.benchmarks.length > 0) {
    extra.push({
      id: "pb_benchmarks",
      promptFragment: `Published benchmarks for ${record.country}: ${pb.benchmarks
        .map((b) => `${b.label} = ${b.value}${b.unit ? ` ${b.unit}` : ""}`)
        .join("; ")}. Use them to judge whether this customer's usage or price is high.`,
    });
  }
  if (!pb.marketStructure.switchable) {
    extra.push({
      id: "pb_no_switching",
      promptFragment: `IMPORTANT: this service in ${record.country} is a ${pb.marketStructure.model.replace(/_/g, " ")} — the customer CANNOT change supplier. Never suggest switching or comparing suppliers.`,
    });
  }
  if (extra.length === 0) return pack;

  const local = pb.glossary.map((g) => `${g.term} = ${g.plain}`).join("; ");
  return {
    ...pack,
    decodeHints: {
      lineItemGlossary: local ? `${pack.decodeHints.lineItemGlossary} Local terms: ${local}` : pack.decodeHints.lineItemGlossary,
      gotchaChecks: [...pack.decodeHints.gotchaChecks, ...extra],
    },
  };
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "issue";
