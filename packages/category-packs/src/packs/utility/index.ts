import { z } from "zod";
import type { CategoryPack } from "../../pack.js";

/**
 * The generic utility pack: the extraction shape for every metered or
 * subscription bill we don't have a bespoke pack for — water, waste, sewerage,
 * council tax, insurance, gym, alarm monitoring.
 *
 * It is deliberately fixed and category-neutral. The vision prompt has to stay
 * byte-identical across calls for prompt caching to work, so the SCHEMA cannot
 * vary per country; the market-specific intelligence arrives later, at decode
 * time, from a researched `UtilityPlaybook`.
 *
 * On its own this pack ships no savings levers — proposing "switch supplier"
 * to someone on a municipal water monopoly is worse than saying nothing. The
 * levers come from the playbook, which knows whether switching is even legal.
 */

export const UtilityFieldsSchema = z.object({
  /** What kind of service this is, in English ("water", "waste", "insurance"). */
  serviceType: z.string().nullable(),
  tariffName: z.string().nullable(),
  /** Unit consumption is billed in, exactly as printed ("m³", "kWh", "GB"). */
  unitOfMeasure: z.string().nullable(),
  /** Consumption this period, as printed. */
  usageQuantity: z.string().nullable(),
  /** Same-period consumption a year ago or last period, when the bill prints it. */
  previousUsageQuantity: z.string().nullable(),
  /** Included allowance, if the service has one. */
  usageAllowance: z.string().nullable(),
  ratePerUnit: z.string().nullable(),
  /** Block/step tariffs: each band with its own rate. */
  tiers: z.array(
    z.object({
      band: z.string().nullable(),
      ratePerUnit: z.string().nullable(),
      unit: z.string().nullable(),
    }),
  ),
  /** Fixed charge levied regardless of consumption. */
  standingCharge: z.string().nullable(),
  meterReads: z.array(
    z.object({
      readingDate: z.string().nullable(),
      value: z.string().nullable(),
      kind: z.enum(["actual", "estimated", "customer"]).nullable(),
    }),
  ),
  /** Recurring service charges and add-ons printed separately from consumption. */
  serviceCharges: z.array(
    z.object({
      label: z.string().nullable(),
      amount: z.string().nullable(),
      recurring: z.boolean().nullable(),
    }),
  ),
  contractEndDate: z.string().nullable(),
  exitFee: z.string().nullable(),
  /** People in the household, when the bill states it — many tariffs scale by it. */
  householdSize: z.string().nullable(),
});
export type UtilityFields = z.infer<typeof UtilityFieldsSchema>;

export const utilityPack: CategoryPack<UtilityFields> = {
  id: "utility",
  version: "0.1.0",
  displayName: {
    en: "Utility",
    es: "Suministro",
    fr: "Service",
    pt: "Serviço",
    de: "Versorgung",
    he: "שירות",
    ru: "Коммунальная услуга",
    zh: "公用事业",
  },
  extractionSchema: UtilityFieldsSchema,
  extractionHints: {
    serviceType:
      "What is actually being billed, in English and lowercase: water, sewerage, waste, heating, council_tax, insurance, gym, alarm, parking. Read it off the bill — never guess from the provider's name alone.",
    unitOfMeasure:
      "The unit consumption is billed in, exactly as printed: m³, m3, cubic metres, kWh, litres, GB, units. Capture the unit even when the quantity is missing.",
    usageQuantity: "Consumption for this billing period as printed, with its number formatting untouched.",
    previousUsageQuantity:
      "Many bills print the same period last year, or last period, for comparison — capture it, it is the strongest signal of an unexplained jump.",
    tiers: "Block or step tariffs: capture every band separately with its own rate and unit.",
    standingCharge: "The fixed part of the bill, charged even at zero consumption.",
    "meterReads.kind":
      "Bills mark reads as estimated vs actual with letters or words (E/A, estimada/real, geschätzt, משוער/בפועל). Capture the flag for every read — an estimate means the bill may be wrong.",
    householdSize: "Number of people or occupants, when the bill states it — some tariffs and rebates depend on it.",
    exitFee: "Early-termination or cancellation fee, if printed.",
  },
  decodeHints: {
    lineItemGlossary:
      "standing charge = a fixed amount paid regardless of how much you use; unit rate = the price per unit consumed; estimated read = the provider guessed your consumption rather than measuring it; regulated levies and taxes are pass-through and cannot be negotiated.",
    gotchaChecks: [
      {
        id: "estimated_reads",
        promptFragment:
          "If any meter read is estimated, say plainly that this bill is based on a guess rather than a measurement, and that submitting a real reading corrects it.",
        detect: (f) => (f.meterReads.length ? f.meterReads.some((r) => r.kind === "estimated") : null),
      },
      {
        id: "usage_jump",
        promptFragment:
          "The bill prints a previous-period consumption alongside this one. Compare them and call out a material rise — on a metered service an unexplained jump is the classic signature of a leak or a fault.",
        detect: (f) => (f.usageQuantity !== null && f.previousUsageQuantity !== null ? true : null),
      },
      {
        id: "unclaimed_discount",
        promptFragment:
          "The bill prints one or more discounts. For each, say whether it is actually applied this cycle or merely advertised, and what unlocks it.",
        detect: (_f, common) => (common.printedDiscounts.length > 0 ? true : null),
      },
    ],
  },
  // Intentionally empty: a lever without market knowledge is a guess. The
  // playbook supplies them, filtered by whether switching is even possible.
  savingsLevers: [],
};
