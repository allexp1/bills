import { z } from "zod";
import type { CategoryPack } from "../../pack.js";
import { statementMarketKey } from "../statement/index.js";

/**
 * A registry export: one document listing EVERY policy a person holds, from
 * an official source — Israel's Har haBituach (harb.cma.gov.il) is the
 * launch case; other countries have equivalents.
 *
 * The third document family, and structurally unlike the other two: a bill
 * details one charge cycle, a statement details one product, a registry
 * details nothing — it enumerates. Its value is coverage of the whole:
 * overlap detection ("health policies at two companies") runs on everything
 * held rather than everything uploaded, and each listed policy without a
 * decoded statement becomes a visible gap the customer can fill.
 *
 * EXPLANATION ONLY, like statements — and the registry makes that easy: it
 * carries no amounts to argue about and no coverage detail to compare. It
 * also carries nothing medical, so the privacy posture is the statement
 * pack's or better; the ID number printed on the export is masked by the
 * extraction's standing rules and never stored in plain columns.
 */

export const RegistryFieldsSchema = z.object({
  /** Which registry produced this export ("har_habituach"), as identifiable. */
  source: z.string().nullable(),
  /** The date the registry says the picture is true for, ISO. */
  asOfDate: z.string().nullable(),
  holdings: z.array(
    z.object({
      /** Insurer / fund name, exactly as printed. */
      company: z.string().nullable(),
      /**
       * Product kind in lowercase English, same vocabulary as
       * statement.kind: health, dental, car, home, life, travel,
       * personal_accident, long_term_care, pension_fund, managers_insurance,
       * provident_fund, study_fund, other.
       */
      productType: z.string().nullable(),
      /** Product/plan name as printed, when the registry shows one. */
      productName: z.string().nullable(),
      /** active | inactive, as printed (בתוקף / מבוטל), normalised. */
      status: z.string().nullable(),
      /** Premium as printed, when the registry lists one. */
      premiumAmount: z.string().nullable(),
      premiumFrequency: z.string().nullable(),
    }),
  ),
});
export type RegistryFields = z.infer<typeof RegistryFieldsSchema>;
export type RegistryHolding = RegistryFields["holdings"][number];

/** The family a holding files under — same mapping statements use. */
export function registryHoldingFamily(h: { productType: string | null }): string {
  return statementMarketKey(h.productType);
}

export const registryPack: CategoryPack<RegistryFields> = {
  id: "registry",
  version: "0.1.0",
  displayName: {
    en: "Insurance registry",
    es: "Registro de seguros",
    fr: "Registre d'assurances",
    pt: "Registo de seguros",
    de: "Versicherungsregister",
    he: "הר הביטוח",
    ru: "Реестр страховок",
    zh: "保险登记册",
  },
  extractionSchema: RegistryFieldsSchema,
  extractionHints: {
    source:
      'Which official registry produced this export, lowercase: "har_habituach" for Israel\'s הר הביטוח (harb.cma.gov.il), otherwise the site name as printed. A registry export lists MANY policies across MANY companies in one table — that is how you recognise it against a single policy statement.',
    holdings:
      "One entry per listed policy row, even when the same company appears many times. Transcribe the company and product names exactly. NEVER transcribe the holder's ID number, address, or any beneficiary detail — the list of products is all that is captured.",
    "holdings.productType":
      "Lowercase English, same vocabulary as statement.kind: health, dental, car, home, life, travel, personal_accident, long_term_care, pension_fund, managers_insurance, provident_fund, study_fund, other. Map the Hebrew branch names: בריאות=health, שיניים=dental, רכב=car, דירה=home, חיים=life, נסיעות לחו\"ל=travel, תאונות אישיות=personal_accident, סיעוד=long_term_care.",
    "holdings.status":
      'active for policies in force (בתוקף / פעיל), inactive for cancelled or lapsed ones (מבוטל / מסולק) — keep inactive rows too, marked as such; they answer "did I ever have…" questions.',
  },
  decodeHints: {
    lineItemGlossary:
      "registry = the official list of every policy you hold, maintained by the regulator; a policy listed here but never explained means we know it exists but not what it costs or covers; duplicate coverage = the same kind of insurance at two companies, which for most kinds cannot both pay for the same event.",
    gotchaChecks: [
      {
        id: "explanation_only",
        promptFragment:
          "This is an official registry listing the customer's policies. EXPLAIN the picture: how many policies, at which companies, in which families. NEVER recommend cancelling a specific policy or moving to a specific company — flag overlaps as something to CHECK, with the questions to ask. Life insurance overlap is a choice (every policy pays), not waste; indemnity overlap (health, car, home, travel) usually is waste and say so plainly.",
      },
      {
        id: "registry_overlaps",
        promptFragment:
          "Group the holdings by product family and name every family held at more than one company, with the company names. This is the single most valuable fact in the document.",
        detect: (f) => {
          const active = f.holdings.filter((h) => h.status !== "inactive");
          const families = active.map((h) => registryHoldingFamily(h));
          return new Set(families).size < families.length;
        },
      },
      {
        id: "registry_next_steps",
        promptFragment:
          "For each ACTIVE policy, the customer can forward that company's statement to get it explained in full — say so, as the natural next step. By law every insurer sends one periodically.",
      },
    ],
  },
  /** Explanation only, stricter than anywhere: there is nothing here to optimise. */
  savingsLevers: [],
};
