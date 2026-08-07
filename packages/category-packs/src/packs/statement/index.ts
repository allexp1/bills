import { z } from "zod";
import type { CategoryPack } from "../../pack.js";

/**
 * Insurance and pension statements: the second document family after bills.
 *
 * A statement is not a bill. It has no monthly total to argue about; its
 * questions are "what do I have, what does it cost me, what does it cover".
 * The product answer here is EXPLANATION ONLY: plain language, the customer's
 * own numbers, their rights, and where the official registries are. No
 * "switch to X" — in Israel (the launch market) recommending a specific
 * pension or insurance product is a licensed activity, so the decode explains
 * and points at official sources instead of advising.
 *
 * One pack for the whole family, split by `kind`, for two hard reasons: the
 * structured-output grammar has a size ceiling and the wire schema a
 * 16-union-parameter budget, and seven sibling packs would blow both. The
 * market intelligence (fee caps, schemes, common errors, local jargon) comes
 * from researched playbooks per (country, kind-slug), exactly like utilities.
 *
 * PRIVACY BY SCHEMA: statements can carry health data. Nothing here captures
 * a diagnosis, a condition, a treatment or a beneficiary name — coverage
 * LABELS and AMOUNTS only, and beneficiaries reduce to a boolean. That is
 * deliberate data minimisation, not an oversight; do not "improve" it.
 */

export const StatementFieldsSchema = z.object({
  /**
   * What kind of statement, in lowercase English: pension_fund,
   * managers_insurance, provident_fund, study_fund, health, dental, car,
   * home, mortgage_life, life, travel, personal_accident, long_term_care,
   * other. A string rather than an enum to keep the wire-schema union budget.
   */
  kind: z.string().nullable(),
  /** Product/plan name exactly as printed ("מסלול כללי", "מגן זהב"). */
  productName: z.string().nullable(),
  /** Investment track for savings products, as printed. */
  investmentTrack: z.string().nullable(),

  /* ---- policies (insurance) ---- */
  /** Recurring premium as printed. */
  premiumAmount: z.string().nullable(),
  /** How often the premium is charged, as printed: monthly, annual, one-off. */
  premiumFrequency: z.string().nullable(),
  /**
   * What the policy covers: label + insured amount/limit, exactly as printed.
   * Coverage LABELS only ("ניתוחים בחו״ל", "צד ג׳") — never a person's
   * medical information.
   */
  coverages: z.array(
    z.object({
      label: z.string().nullable(),
      amountOrLimit: z.string().nullable(),
    }),
  ),
  deductible: z.string().nullable(),
  renewalDate: z.string().nullable(),

  /* ---- pension / long-term savings ---- */
  employeeContribution: z.string().nullable(),
  employerContribution: z.string().nullable(),
  /** Severance (פיצויים) component deposited this period. */
  severanceContribution: z.string().nullable(),
  /** Management fee on DEPOSITS, percent as printed. */
  feeOnDepositsPercent: z.string().nullable(),
  /** Management fee on ACCRUAL, percent as printed. */
  feeOnAccrualPercent: z.string().nullable(),
  /** Fees actually charged this period, in money, as printed. */
  feesChargedAmount: z.string().nullable(),
  /** Cost of embedded insurance cover (עלות כיסויים ביטוחיים), as printed. */
  insuranceCostAmount: z.string().nullable(),
  /** Total accrued savings (צבירה). */
  accrualTotal: z.string().nullable(),
  /** Return for the period, percent as printed. */
  returnPercent: z.string().nullable(),
  /** Projected monthly pension at retirement, when printed. */
  projectedMonthlyPension: z.string().nullable(),
  /** Disability (נכות) monthly cover amount, when printed. */
  disabilityCoverAmount: z.string().nullable(),
  /** Survivors (שארים) monthly cover amount, when printed. */
  survivorsCoverAmount: z.string().nullable(),
  /**
   * True when the statement shows beneficiaries are registered. The NAMES are
   * never captured — this boolean is all the product needs.
   */
  hasBeneficiariesListed: z.boolean().nullable(),
  /**
   * True when the product carries a guaranteed annuity factor (מקדם מובטח) —
   * mostly pre-2013 managers' insurance. Decides whether "old and expensive"
   * might still be worth keeping, so it must be read, never assumed.
   */
  guaranteedAnnuityFactor: z.boolean().nullable(),
});
export type StatementFields = z.infer<typeof StatementFieldsSchema>;

/**
 * The playbook market key for a statement: pension products share one market
 * ("pension"), each insurance family gets its own. Unknown kinds fall back to
 * the generic insurance market rather than inventing a new key per typo.
 */
export function statementMarketKey(kind: string | null): string {
  const k = (kind ?? "").trim().toLowerCase();
  if (["pension_fund", "managers_insurance", "provident_fund", "study_fund", "pension"].includes(k))
    return "pension";
  if (["health", "dental", "long_term_care"].includes(k)) return "health_insurance";
  if (k === "car") return "car_insurance";
  if (["home", "mortgage_life"].includes(k)) return "home_insurance";
  if (["life", "personal_accident"].includes(k)) return "life_insurance";
  if (k === "travel") return "travel_insurance";
  return "insurance";
}

export const statementPack: CategoryPack<StatementFields> = {
  id: "statement",
  version: "0.1.0",
  displayName: {
    en: "Insurance & pension",
    es: "Seguros y pensión",
    fr: "Assurance et retraite",
    pt: "Seguros e pensão",
    de: "Versicherung & Rente",
    he: "ביטוח ופנסיה",
    ru: "Страхование и пенсия",
    zh: "保险与养老金",
  },
  extractionSchema: StatementFieldsSchema,
  extractionHints: {
    kind: "What kind of statement this is, lowercase English: pension_fund, managers_insurance, provident_fund, study_fund, health, dental, car, home, mortgage_life, life, travel, personal_accident, long_term_care, other. Read it off the document — Israeli pension funds say קרן פנסיה, managers' insurance ביטוח מנהלים, study funds קרן השתלמות, provident קופת גמל.",
    coverages:
      "Coverage LABELS and insured amounts/limits only, exactly as printed. NEVER transcribe a diagnosis, a medical condition, a treatment, or any detail about a person's health — if a coverage line contains one, keep the generic label and drop the medical detail.",
    feeOnDepositsPercent:
      "Pension products charge management fees TWICE: a percent of each deposit (דמי ניהול מהפקדה) and a percent of the accumulated savings (דמי ניהול מצבירה). Capture each under its own field — confusing them is the most common reading error on these statements.",
    feeOnAccrualPercent: "The percent charged on the accumulated balance (מצבירה), NOT the deposit fee.",
    feesChargedAmount: "The fee actually taken this period in money, when the statement prints it.",
    insuranceCostAmount:
      "Pension statements price the embedded disability and survivors cover separately (עלות כיסויים ביטוחיים) — capture it; it is not a management fee.",
    hasBeneficiariesListed:
      "true if the statement shows beneficiaries are registered, false if it explicitly shows none. Do NOT transcribe beneficiary names — the boolean is all that is captured.",
    guaranteedAnnuityFactor:
      "true only if the document states a guaranteed annuity factor (מקדם קצבה מובטח). Mostly pre-2013 managers' insurance. Never infer it from the product's age.",
    premiumFrequency: "monthly, annual or one-off, as printed — a ₪90 monthly premium and a ₪90 annual one are different products.",
  },
  decodeHints: {
    lineItemGlossary:
      "management fee on deposits = a percent taken from every shekel paid in; management fee on accrual = a percent of the whole savings taken every year, the one that compounds; accrual = total saved so far; investment track = where the savings are invested; disability cover = monthly payment if you cannot work; survivors cover = monthly payment to family if you die; deductible = what you pay before the insurance pays; premium = what you pay for the coverage; supplementary (שב\"ן) = the health fund's paid add-on plan, a different thing from private insurance.",
    gotchaChecks: [
      {
        id: "explanation_only",
        promptFragment:
          "This is an insurance or pension statement. EXPLAIN ONLY: what the customer has, what it costs, what it covers, in their own numbers. NEVER recommend a specific fund, insurer or product to move to — in this market that is regulated financial advice. You may state published facts with sources, explain the customer's rights (fee reduction requests, cancellation, official registries, the regulator's complaint route), and suggest questions to ask.",
      },
      {
        id: "fees_twice",
        promptFragment:
          "If both management-fee rates are present, explain that the fee is charged twice — on deposits and on accrual — and translate each into shekels using the printed contributions and accrual, labelled as arithmetic on the statement's own numbers.",
        detect: (f) => (f.feeOnDepositsPercent !== null && f.feeOnAccrualPercent !== null ? true : null),
      },
      {
        id: "insurance_inside_pension",
        promptFragment:
          "A pension product embeds disability and survivors insurance whose cost appears separately. Explain what each cover pays and that the survivors cover mainly serves a partner or children — someone without either can ask their fund about adjusting it (a request to their OWN fund, not a product change).",
        detect: (f) => (f.survivorsCoverAmount !== null || f.insuranceCostAmount !== null ? true : null),
      },
      {
        id: "guaranteed_factor",
        promptFragment:
          "This product has a guaranteed annuity factor. Say clearly that this guarantee no longer exists in new products and can make the policy worth keeping even if its fees look high — a decision for a licensed professional, not this report.",
        detect: (f) => (f.guaranteedAnnuityFactor === true ? true : null),
      },
      {
        id: "no_beneficiaries",
        promptFragment:
          "The statement shows no registered beneficiaries. Explain plainly what that means for who receives the money and that registering beneficiaries is a form to the fund, free.",
        detect: (f) => (f.hasBeneficiariesListed === false ? true : null),
      },
      {
        id: "check_deposits",
        promptFragment:
          "Contribution amounts are printed. Remind the customer to check them against their payslips — missing employer deposits are a known, common problem, and the fund and the regulator both handle such complaints.",
        detect: (f) => (f.employerContribution !== null ? true : null),
      },
    ],
  },
  /**
   * Empty on purpose, same reasoning as the utility pack but stronger: for
   * statements even researched switching levers must not run — explanation
   * only. Market facts still arrive via withPlaybookHints (schemes, common
   * errors, benchmarks, glossary), which is additive and advice-free.
   */
  savingsLevers: [],
};
