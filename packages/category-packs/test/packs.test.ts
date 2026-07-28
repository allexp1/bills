import { describe, expect, it } from "vitest";
import type { CommonFields } from "../src/common-schema.js";
import { allPacks, mergedExtractionSchema } from "../src/registry.js";
import { broadbandPack, type BroadbandFields } from "../src/packs/broadband/index.js";
import { formatDataSize, mobilePack, parseGb, type MobileFields } from "../src/packs/mobile/index.js";
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
  region: null,
  paymentMethod: "direct debit",
  printedNextSteps: [],
  printedDiscounts: [],
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
        utility: null,
        mobile: {
          planName: "Fusión",
          baseFee: "45,00",
          addOns: [{ label: "Premium SMS", amount: "9,99", recurring: true }],
          dataAllowanceGb: null,
          dataUsedGb: null,
          minutesIncluded: null,
          minutesUsed: null,
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
      // `utility` is the open category: it ships no levers on purpose,
      // because a lever without market knowledge is a guess. Its levers come
      // from a researched playbook, which knows whether switching is legal.
      if (pack.id === "utility") {
        expect(pack.savingsLevers).toEqual([]);
        continue;
      }
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
    dataAllowanceGb: "800 GB",
    dataUsedGb: "102,4 GB",
    minutesIncluded: null,
    minutesUsed: null,
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

describe("mobile usage right-sizing", () => {
  const fields: MobileFields = {
    planName: "Plan XL",
    baseFee: "45,00",
    dataAllowanceGb: "800 GB",
    dataUsedGb: "102,4 GB",
    minutesIncluded: "unlimited",
    minutesUsed: null,
    addOns: [],
    roamingCharges: null,
    outOfBundleCharges: null,
    lines: [],
    contractEndDate: null,
  };

  it("detects an oversized plan from printed usage, stays undecided without data", () => {
    const check = mobilePack.decodeHints.gotchaChecks.find((g) => g.id === "oversized_plan")!;
    expect(check.detect!(fields, common())).toBe(true); // 102.4 / 800 ≈ 13%
    expect(check.detect!({ ...fields, dataUsedGb: "700 GB" }, common())).toBe(false);
    expect(check.detect!({ ...fields, dataUsedGb: null }, common())).toBeNull();
    expect(check.detect!({ ...fields, dataAllowanceGb: "unlimited" }, common())).toBeNull();
  });

  const lever = mobilePack.savingsLevers.find((l) => l.id === "mobile_lower_tier")!;

  it("applies only under low utilization", () => {
    expect(lever.applies!(fields, common())).toBe(true);
    expect(lever.applies!({ ...fields, dataUsedGb: "700 GB" }, common())).toBe(false);
    expect(lever.applies!({ ...fields, dataAllowanceGb: null }, common())).toBeNull();
  });

  it("stays qualitative without a priced smaller tier, verifies against one", () => {
    const noOffer = lever.validate(claim({ leverId: "mobile_lower_tier", estimatedSavingMinor: 1000 }), fields, common());
    expect(noOffer.verdict).toBe("flagged");

    const offers = [{ id: "o1", provider: "Movistar", name: "Plan S 200GB", estMonthlyCostMinor: 2999, currency: "EUR", country: "ES" }];
    const v = lever.validate(
      claim({
        leverId: "mobile_lower_tier",
        estimatedSavingMinor: 1501,
        basis: { extractionPaths: ["category_fields.mobile.baseFee"], comparisonOfferId: "o1" },
      }),
      fields,
      common(),
      offers,
    );
    expect(v.verdict).toBe("verified"); // 45,00 − 29,99 = 15,01
  });

  it("nextStep states usage and allowance in ONE unit, never mixing MB with GB", () => {
    const step = lever.nextStep(fields, common(), "en");
    expect(step).toContain("102 GB");
    expect(step).toContain("800 GB");
    expect(step).not.toMatch(/\bMB\b/);

    // The MB-printed case is the one that matters: both sides must read as GB.
    const mbBill = { ...fields, dataUsedGb: "20182.039 MB" };
    const mbStep = lever.nextStep(mbBill, common(), "en");
    expect(mbStep).toContain("20 GB");
    expect(mbStep).not.toContain("20182");
  });

  it("formatDataSize normalizes every printed form to a single unit", () => {
    expect(formatDataSize("20182.039 MB")).toBe("20 GB");
    expect(formatDataSize("800GB")).toBe("800 GB");
    expect(formatDataSize("1.5 TB")).toBe("1536 GB");
    expect(formatDataSize("512 Mo")).toBe("512 MB");
    expect(formatDataSize(null)).toBe("?");
  });
});

describe("broadband drop_equipment lever", () => {
  const lever = broadbandPack.savingsLevers.find((l) => l.id === "broadband_drop_equipment")!;
  const fields: BroadbandFields = {
    planName: "Fibra 600",
    monthlyPrice: "54,90",
    contractEndDate: null,
    inContractPrice: null,
    outOfContractPrice: null,
    promoPrice: null,
    promoEndDate: null,
    speedTier: "600 Mbps",
    equipmentFees: [{ label: "Router", amount: "6,00" }],
  };

  it("applies when fees exist and verifies the summed cited fees", () => {
    expect(lever.applies!(fields, common())).toBe(true);
    const v = lever.validate(
      claim({
        leverId: "broadband_drop_equipment",
        estimatedSavingMinor: 600,
        basis: { extractionPaths: ["category_fields.broadband.equipmentFees.0.amount"] },
      }),
      fields,
      common(),
    );
    expect(v).toMatchObject({ verdict: "verified" });
  });

  it("drops when no cited fee resolves", () => {
    const v = lever.validate(
      claim({ leverId: "broadband_drop_equipment", estimatedSavingMinor: 600, basis: { extractionPaths: ["category_fields.broadband.equipmentFees.9.amount"] } }),
      fields,
      common(),
    );
    expect(v.verdict).toBe("dropped");
  });
});

describe("new savings angles", () => {
  it("unclaimed_discount gotcha fires on printed discounts across all packs", () => {
    const withDiscount = common({
      printedDiscounts: [{ label: "Descuento factura electrónica", amount: "2,00", condition: "e-factura", applied: false }],
    });
    for (const pack of [mobilePack, broadbandPack, energyPack]) {
      const check = pack.decodeHints.gotchaChecks.find((g) => g.id === "unclaimed_discount")!;
      expect(check.detect!({} as never, withDiscount)).toBe(true);
      expect(check.detect!({} as never, common())).toBeNull();
    }
  });

  it("social tariff and outage credits stay qualitative (never a number)", () => {
    const social = energyPack.savingsLevers.find((l) => l.id === "energy_social_tariff")!;
    expect(social.validate(claim({ leverId: "energy_social_tariff", estimatedSavingMinor: 5000 }), {} as never, common()).verdict).toBe("flagged");
    expect(social.nextStep({} as never, common(), "es")).toContain("bono social");

    const credits = broadbandPack.savingsLevers.find((l) => l.id === "broadband_claim_outage_credits")!;
    expect(credits.validate(claim({ leverId: "broadband_claim_outage_credits", estimatedSavingMinor: 900 }), {} as never, common()).verdict).toBe("flagged");
  });

  it("multi-line consolidation applies at 2+ lines, qualitative without an offer", () => {
    const lever = mobilePack.savingsLevers.find((l) => l.id === "mobile_consolidate_lines")!;
    const twoLines = {
      planName: null, baseFee: null, dataAllowanceGb: null, dataUsedGb: null, minutesIncluded: null, minutesUsed: null,
      addOns: [], roamingCharges: null, outOfBundleCharges: null,
      lines: [
        { msisdnMasked: "***111", planName: "A", amount: "20,00", dataUsedGb: null },
        { msisdnMasked: "***222", planName: "B", amount: "18,00", dataUsedGb: null },
      ],
      contractEndDate: null,
    };
    expect(lever.applies!(twoLines, common())).toBe(true);
    expect(lever.applies!({ ...twoLines, lines: [twoLines.lines[0]!] }, common())).toBe(false);
    expect(lever.validate(claim({ leverId: "mobile_consolidate_lines", estimatedSavingMinor: 1000 }), twoLines, common()).verdict).toBe("flagged");
    expect(lever.nextStep(twoLines, common(), "en")).toContain("2 lines");
  });
});

describe("parseGb is unit-aware", () => {
  it("normalizes MB-printed usage against GB allowances (the 20182 MB bug)", () => {
    expect(parseGb("20182.039 MB")).toBeCloseTo(19.709, 2);
    expect(parseGb("800GB")).toBe(800);
    // 20182 MB of 800 GB is ~2.5%, not 100%:
    expect(parseGb("20182.039 MB")! / parseGb("800GB")!).toBeLessThan(0.03);
  });

  it("handles separators, TB/KB, French and Hebrew units, unlimited", () => {
    expect(parseGb("20,182 MB")).toBeCloseTo(19.709, 2);
    expect(parseGb("102,4 GB")).toBeCloseTo(102.4, 3);
    expect(parseGb("1.5 TB")).toBe(1536);
    expect(parseGb("512 Mo")).toBeCloseTo(0.5, 3);
    expect(parseGb("50 Go")).toBe(50);
    expect(parseGb("300 ג'יגה")).toBe(300);
    expect(parseGb("ללא הגבלה")).toBe(Infinity);
    expect(parseGb("unlimited")).toBe(Infinity);
    expect(parseGb(null)).toBeNull();
    expect(parseGb("no digits")).toBeNull();
  });
});
