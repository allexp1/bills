import { describe, expect, it } from "vitest";
import {
  statementMarketKey,
  statementPack,
  StatementFieldsSchema,
  type StatementFields,
} from "../src/index.js";

/** A realistic Israeli pension-fund quarterly statement, reduced to fields. */
const pensionFields: StatementFields = {
  kind: "pension_fund",
  docType: "statement",
  productName: "מסלול כללי",
  investmentTrack: "מסלול לבני 50 ומטה",
  premiumAmount: null,
  premiumFrequency: null,
  coverages: [],
  deductible: null,
  renewalDate: null,
  exclusions: [],
  hasPersonalExclusions: null,
  waitingPeriods: [],
  cancellationTerms: null,
  premiumEscalation: null,
  promoEndDate: "2029-10-31",
  maritalStatus: "רווק",
  employeeContribution: "1.740,00",
  employerContribution: "1.885,00",
  severanceContribution: "2.416,00",
  feeOnDepositsPercent: "2,49",
  feeOnAccrualPercent: "0,20",
  feesChargedAmount: "182,30",
  insuranceCostAmount: "96,10",
  disabilityCostAmount: "4.867,01",
  survivorsCostAmount: "1.570,75",
  accrualTotal: "241.503,00",
  returnPercent: "3,1",
  projectedMonthlyPension: "9.870,00",
  disabilityCoverAmount: "14.200,00",
  survivorsCoverAmount: "11.360,00",
  hasBeneficiariesListed: false,
  guaranteedAnnuityFactor: null,
};

describe("statement pack", () => {
  it("parses a pension statement fixture", () => {
    expect(StatementFieldsSchema.parse(pensionFields)).toEqual(pensionFields);
  });

  it("ships no savings levers: explanation only, by design", () => {
    // Recommending a product move is licensed advice in the launch market.
    expect(statementPack.savingsLevers).toEqual([]);
    expect(statementPack.comparisonSource).toBeUndefined();
  });

  it("tells the decode model, unconditionally, that this is explanation only", () => {
    const rule = statementPack.decodeHints.gotchaChecks.find((g) => g.id === "explanation_only");
    expect(rule).toBeDefined();
    // No detect(): the rule must reach the prompt on every statement, not
    // only when some field happens to be present.
    expect(rule!.detect).toBeUndefined();
    expect(rule!.promptFragment).toMatch(/NEVER recommend a specific fund/);
  });

  it("captures no medical detail and no beneficiary names, by schema", () => {
    // Privacy by construction: the schema has nowhere to put a diagnosis or
    // a name, so a model that extracts one has nowhere to write it.
    const keys = Object.keys(StatementFieldsSchema.shape);
    // Beneficiaries reduce to one boolean — no field can hold their names.
    expect(keys.filter((k) => /beneficiar/i.test(k))).toEqual(["hasBeneficiariesListed"]);
    expect(keys.join(",")).not.toMatch(/diagnos|condition|medical|treatment|holder|insured_person/i);
    const coverageKeys = Object.keys(
      (StatementFieldsSchema.shape.coverages as { element: { shape: object } }).element.shape,
    );
    expect(coverageKeys.sort()).toEqual(["amountOrLimit", "label"]);
  });

  it("detects the double fee, the missing beneficiaries and the embedded insurance", () => {
    const facts = Object.fromEntries(
      statementPack.decodeHints.gotchaChecks
        .filter((g) => g.detect)
        .map((g) => [g.id, g.detect!(pensionFields, {} as never)]),
    );
    expect(facts.fees_twice).toBe(true);
    expect(facts.no_beneficiaries).toBe(true);
    expect(facts.insurance_inside_pension).toBe(true);
    expect(facts.check_deposits).toBe(true);
    expect(facts.fee_discount_ending).toBe(true);
    // Not printed on this statement → undecidable, never asserted.
    expect(facts.guaranteed_factor).toBeNull();
  });
});

describe("statementMarketKey", () => {
  it("pools every pension-family product into one market", () => {
    for (const k of ["pension_fund", "managers_insurance", "provident_fund", "study_fund"]) {
      expect(statementMarketKey(k)).toBe("pension");
    }
  });

  it("gives each insurance family its own market", () => {
    expect(statementMarketKey("health")).toBe("health_insurance");
    expect(statementMarketKey("car")).toBe("car_insurance");
    expect(statementMarketKey("mortgage_life")).toBe("home_insurance");
    expect(statementMarketKey("travel")).toBe("travel_insurance");
  });

  it("falls back to the generic insurance market rather than minting keys from typos", () => {
    expect(statementMarketKey("CAR ")).toBe("car_insurance");
    expect(statementMarketKey("weird_thing")).toBe("insurance");
    expect(statementMarketKey(null)).toBe("insurance");
  });
});

describe("registry pack", async () => {
  const { registryPack, registryHoldingFamily, RegistryFieldsSchema } = await import("../src/index.js");

  const fields = {
    source: "har_habituach",
    asOfDate: "2026-08-01",
    holdings: [
      { company: "הראל", productType: "health", productName: "מגן זהב", status: "active", premiumAmount: null, premiumFrequency: null },
      { company: "כלל", productType: "health", productName: null, status: "active", premiumAmount: null, premiumFrequency: null },
      { company: "מגדל מקפת", productType: "pension_fund", productName: null, status: "active", premiumAmount: null, premiumFrequency: null },
      { company: "מנורה", productType: "car", productName: null, status: "inactive", premiumAmount: null, premiumFrequency: null },
    ],
  };

  it("parses a registry fixture and maps holdings to families", () => {
    const parsed = RegistryFieldsSchema.parse(fields);
    expect(parsed.holdings).toHaveLength(4);
    expect(registryHoldingFamily(parsed.holdings[0]!)).toBe("health_insurance");
    expect(registryHoldingFamily(parsed.holdings[2]!)).toBe("pension");
  });

  it("detects same-family overlap among ACTIVE holdings only", () => {
    const detect = registryPack.decodeHints.gotchaChecks.find((g) => g.id === "registry_overlaps")!.detect!;
    // Two active health policies → overlap.
    expect(detect(RegistryFieldsSchema.parse(fields), {} as never)).toBe(true);
    // Drop one health policy: remaining actives are all distinct families,
    // and the inactive car policy must not create an overlap.
    const single = { ...fields, holdings: fields.holdings.filter((h) => h.company !== "כלל") };
    expect(detect(RegistryFieldsSchema.parse(single), {} as never)).toBe(false);
  });

  it("is explanation-only like statements", () => {
    expect(registryPack.savingsLevers).toEqual([]);
    expect(registryPack.comparisonSource).toBeUndefined();
    const rule = registryPack.decodeHints.gotchaChecks.find((g) => g.id === "explanation_only");
    expect(rule).toBeDefined();
    expect(rule!.detect).toBeUndefined();
  });
});

describe("a fresh insurance contract", () => {
  /** A newly signed private health policy, reduced to fields. */
  const contract: StatementFields = {
    ...pensionFields,
    kind: "health",
    docType: "contract",
    productName: "בריאות פרטית פלוס",
    premiumAmount: "127,00",
    premiumFrequency: "monthly",
    coverages: [
      { label: "ניתוחים בישראל", amountOrLimit: "מלא" },
      { label: "תרופות מחוץ לסל", amountOrLimit: "3.000.000" },
    ],
    exclusions: ["ניתוחים קוסמטיים", "ספורט אתגרי"],
    hasPersonalExclusions: true,
    waitingPeriods: [{ coverageLabel: "ניתוחים", period: "90 ימים" }],
    cancellationTerms: "ביטול בהודעה של 3 ימי עסקים, החזר יחסי",
    premiumEscalation: "הפרמיה עולה במדרגות גיל 41, 51, 61",
    // Not a pension doc: none of these appear.
    employeeContribution: null,
    employerContribution: null,
    severanceContribution: null,
    feeOnDepositsPercent: null,
    feeOnAccrualPercent: null,
    feesChargedAmount: null,
    insuranceCostAmount: null,
    disabilityCostAmount: null,
    survivorsCostAmount: null,
    accrualTotal: null,
    returnPercent: null,
    projectedMonthlyPension: null,
    disabilityCoverAmount: null,
    survivorsCoverAmount: null,
    hasBeneficiariesListed: null,
    guaranteedAnnuityFactor: null,
    promoEndDate: null,
    maritalStatus: null,
  };

  it("fires the contract facts and stays silent on the pension ones", () => {
    const facts = Object.fromEntries(
      statementPack.decodeHints.gotchaChecks
        .filter((g) => g.detect)
        .map((g) => [g.id, g.detect!(contract, {} as never)]),
    );
    expect(facts.fresh_contract).toBe(true);
    expect(facts.waiting_periods).toBe(true);
    expect(facts.exclusions_exist).toBe(true);
    expect(facts.personal_exclusions).toBe(true);
    expect(facts.premium_escalation).toBe(true);
    // Pension-only facts stay undecided, so no pension prose leaks into a
    // health contract's explanation.
    expect(facts.fees_twice).toBeNull();
    expect(facts.check_deposits).toBeNull();
  });

  it("a periodic statement does not get the contract treatment", () => {
    const facts = Object.fromEntries(
      statementPack.decodeHints.gotchaChecks
        .filter((g) => g.detect)
        .map((g) => [g.id, g.detect!(pensionFields, {} as never)]),
    );
    expect(facts.fresh_contract).toBeNull();
    expect(facts.personal_exclusions).toBeNull();
  });

  it("a personal medical exclusion is a boolean, never text", () => {
    // The schema's only home for personal exclusions is the boolean; the
    // condition behind it cannot be stored anywhere.
    expect(typeof contract.hasPersonalExclusions).toBe("boolean");
    expect(Object.keys(StatementFieldsSchema.shape)).not.toContain("personalExclusions");
  });
});
