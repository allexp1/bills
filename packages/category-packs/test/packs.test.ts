import { describe, expect, it } from "vitest";
import type { CommonFields } from "../src/common-schema.js";
import { allPacks, mergedExtractionSchema } from "../src/registry.js";
import { broadbandPack, type BroadbandFields } from "../src/packs/broadband/index.js";
import { mobilePack, type MobileFields } from "../src/packs/mobile/index.js";
import { energyPack, type EnergyFields } from "../src/packs/energy/index.js";
import type { SavingsClaim } from "../src/pack.js";

const common = (over: Partial<CommonFields> = {}): CommonFields => ({
  providerName: "Movistar",
  accountNumber: "12345",
  customerRefName: null,
  billingPeriodStart: "2026-06-01",
  billingPeriodEnd: "2026-06-30",
  issueDate: "2026-07-01",
  dueDate: "2026-07-15",
  totalAmount: "62,90",
  pastDueAmount: null,
  currency: "EUR",
  country: "ES",
  paymentMethod: "direct debit",
  printedNextSteps: [],
  lineItems: [],
  billLanguage: "es",
  ...over,
});

const claim = (over: Partial<SavingsClaim>): SavingsClaim => ({
  leverId: "x",
  estimatedSavingMinor: 0,
  period: "monthly",
  currency: "EUR",
  basis: { extractionPaths: [] },
  explanation: "",
  ...over,
});

describe("mergedExtractionSchema", () => {
  it("includes every pack plus unknown, and validates a full extraction", () => {
    const schema = mergedExtractionSchema();
    const parsed = schema.parse({
      category: "mobile",
      category_confidence: 0.96,
      common: common(),
      category_fields: {
        energy: null,
        broadband: null,
        mobile: {
          planName: "Fusión",
          baseFee: "45,00",
          addOns: [{ label: "Premium SMS", amount: "9,99", recurring: true }],
          roamingCharges: null,
          outOfBundleCharges: null,
          lines: [],
          contractEndDate: null,
        },
      },
      field_confidence: null,
      pages_used: [1],
    });
    expect(parsed.category).toBe("mobile");
    expect(() => schema.parse({ category: "water" })).toThrow();
  });

  it("every pack declares levers with validators and localized titles", () => {
    for (const pack of allPacks()) {
      expect(pack.savingsLevers.length).toBeGreaterThan(0);
      for (const lever of pack.savingsLevers) {
        expect(typeof lever.validate).toBe("function");
        expect(lever.title.en).toBeTruthy();
        expect(lever.title.de).toBeTruthy();
        expect(lever.nextStep({} as never, common(), "es")).toBeTruthy();
      }
    }
  });
});

describe("mobile remove_addons validation", () => {
  const fields: MobileFields = {
    planName: "Plan M",
    baseFee: "45,00",
    addOns: [
      { label: "Premium SMS", amount: "9,99", recurring: true },
      { label: "Cloud 100GB", amount: "2,99", recurring: true },
    ],
    roamingCharges: null,
    outOfBundleCharges: null,
    lines: [],
    contractEndDate: null,
  };
  const lever = mobilePack.savingsLevers.find((l) => l.id === "mobile_remove_addons")!;

  it("verifies a correct sum over cited add-ons", () => {
    const v = lever.validate(
      claim({
        leverId: lever.id,
        estimatedSavingMinor: 1298,
        basis: { extractionPaths: ["category_fields.mobile.addOns.0.amount", "category_fields.mobile.addOns.1.amount"] },
      }),
      fields,
      common(),
    );
    expect(v).toEqual({ verdict: "verified", recomputedMinor: 1298 });
  });

  it("substitutes the recomputed number when the model's is off", () => {
    const v = lever.validate(
      claim({
        leverId: lever.id,
        estimatedSavingMinor: 2500, // fabricated inflation
        basis: { extractionPaths: ["category_fields.mobile.addOns.0.amount", "category_fields.mobile.addOns.1.amount"] },
      }),
      fields,
      common(),
    );
    expect(v).toEqual({ verdict: "computed", recomputedMinor: 1298 });
  });

  it("drops a claim whose cited paths resolve to nothing", () => {
    const v = lever.validate(
      claim({ leverId: lever.id, estimatedSavingMinor: 999, basis: { extractionPaths: ["category_fields.mobile.addOns.9.amount"] } }),
      fields,
      common(),
    );
    expect(v.verdict).toBe("dropped");
  });
});

describe("broadband renegotiate validation", () => {
  const lever = broadbandPack.savingsLevers.find((l) => l.id === "broadband_renegotiate")!;
  const fields: BroadbandFields = {
    planName: "Fibra 600",
    monthlyPrice: "54,90",
    contractEndDate: "2026-01-01",
    inContractPrice: "34,90",
    outOfContractPrice: "54,90",
    promoPrice: null,
    promoEndDate: null,
    speedTier: "600 Mbps",
    equipmentFees: [],
  };

  it("verifies out-of-contract minus in-contract", () => {
    const v = lever.validate(claim({ leverId: lever.id, estimatedSavingMinor: 2000, basis: { extractionPaths: [] } }), fields, common());
    expect(v).toEqual({ verdict: "verified", recomputedMinor: 2000 });
  });

  it("flags when the price pair is missing", () => {
    const v = lever.validate(
      claim({ leverId: lever.id, estimatedSavingMinor: 2000 }),
      { ...fields, inContractPrice: null, promoPrice: null },
      common(),
    );
    expect(v.verdict).toBe("flagged");
  });

  it("applies() is true when contract already ended", () => {
    expect(lever.applies!(fields, common())).toBe(true);
  });
});

describe("energy pack", () => {
  const fields: EnergyFields = {
    energyType: "electricity",
    tariffName: "Plan Estable",
    unitRates: [{ band: null, ratePerUnit: "0,14", unit: "kWh" }],
    standingChargeDaily: "0,32",
    usageKwh: "310",
    usageM3: null,
    meterReads: [{ readingDate: "2026-06-28", value: "48211", kind: "estimated" }],
    contractEndDate: null,
    exitFee: null,
    estimatedAnnualCost: null,
  };

  it("detects estimated reads deterministically", () => {
    const check = energyPack.decodeHints.gotchaChecks.find((g) => g.id === "estimated_reads")!;
    expect(check.detect!(fields, common())).toBe(true);
  });

  it("never lets the estimated-read lever carry a number", () => {
    const lever = energyPack.savingsLevers.find((l) => l.id === "energy_submit_actual_read")!;
    const v = lever.validate(claim({ leverId: lever.id, estimatedSavingMinor: 5000 }), fields, common());
    expect(v.verdict).toBe("flagged");
  });

  it("verifies a switch saving against a comparison offer", () => {
    const lever = energyPack.savingsLevers.find((l) => l.id === "energy_switch_tariff")!;
    const v = lever.validate(
      claim({ leverId: lever.id, estimatedSavingMinor: 1290, basis: { extractionPaths: ["common.totalAmount"], comparisonOfferId: "of-1" } }),
      fields,
      common({ totalAmount: "62,90" }),
      [{ id: "of-1", provider: "Octopus", name: "Flexible", estMonthlyCostMinor: 5000, currency: "EUR", country: "ES" }],
    );
    expect(v).toEqual({ verdict: "verified", recomputedMinor: 1290 });
  });

  it("drops a switch claim when the offer is not cheaper", () => {
    const lever = energyPack.savingsLevers.find((l) => l.id === "energy_switch_tariff")!;
    const v = lever.validate(
      claim({ leverId: lever.id, estimatedSavingMinor: 500, basis: { extractionPaths: [], comparisonOfferId: "of-2" } }),
      fields,
      common({ totalAmount: "62,90" }),
      [{ id: "of-2", provider: "X", name: "Y", estMonthlyCostMinor: 7000, currency: "EUR", country: "ES" }],
    );
    expect(v.verdict).toBe("dropped");
  });
});
