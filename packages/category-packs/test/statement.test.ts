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
  productName: "מסלול כללי",
  investmentTrack: "מסלול לבני 50 ומטה",
  premiumAmount: null,
  premiumFrequency: null,
  coverages: [],
  deductible: null,
  renewalDate: null,
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
