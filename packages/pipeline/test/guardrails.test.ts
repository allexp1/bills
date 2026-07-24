import { describe, expect, it } from "vitest";
import { mobilePack, type MergedExtraction } from "@bills/category-packs";
import type { DecodeOutput } from "@bills/llm";
import { applyGuardrails, computeGotchaFacts } from "../src/guardrails.js";

const extraction: MergedExtraction = {
  category: "mobile",
  category_confidence: 0.97,
  common: {
    providerName: "Vodafone",
    accountNumber: "AC-1",
    customerRefName: null,
    billingPeriodStart: "2026-06-01",
    billingPeriodEnd: "2026-06-30",
    issueDate: "2026-07-01",
    dueDate: "2026-07-15",
    totalAmount: "57,98",
    pastDueAmount: null,
    currency: "EUR",
    country: "ES",
    paymentMethod: null,
    printedNextSteps: ["Para cancelar servicios: área cliente > servicios"],
    lineItems: [
      { label: "Plan M", amount: "45,00", page: 1, rawNote: null },
      { label: "Premium SMS", amount: "9,99", page: 1, rawNote: null },
      { label: "Cloud 100GB", amount: "2,99", page: 1, rawNote: null },
    ],
    billLanguage: "es",
  },
  category_fields: {
    energy: null,
    broadband: null,
    mobile: {
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
    },
  },
  field_confidence: null,
  pages_used: [1],
};

const baseDecode: DecodeOutput = {
  language: "es",
  headline: "Pagas 57,98 € este mes; 12,98 € son servicios extra que quizá no uses.",
  sections: [
    {
      title: "Tu plan",
      plainExplanation: "El plan base cuesta 45,00 € al mes.",
      sourceExtractionPaths: ["category_fields.mobile.baseFee"],
    },
  ],
  gotchas: [
    {
      checkId: "addon_creep",
      severity: "warn",
      explanation: "Tienes 2 servicios extra que suman 12,98 € al mes.",
      sourceExtractionPaths: ["category_fields.mobile.addOns"],
    },
  ],
  printedNextSteps: ["Para cancelar servicios: área cliente > servicios"],
  savings: [
    {
      leverId: "mobile_remove_addons",
      estimatedSavingMinor: 1298,
      period: "monthly",
      currency: "EUR",
      basis: {
        extractionPaths: ["category_fields.mobile.addOns.0.amount", "category_fields.mobile.addOns.1.amount"],
        formula: "9,99 + 2,99",
        comparisonOfferId: null,
      },
      explanation: "Premium SMS y Cloud 100GB parecen prescindibles.",
    },
  ],
  explainMoreQueue: ["El IVA está incluido en todos los importes."],
};

describe("applyGuardrails", () => {
  it("verifies a correct claim and keeps grounded prose", () => {
    const { guarded, report } = applyGuardrails({
      decode: baseDecode,
      extraction,
      pack: mobilePack,
      offers: [],
      locale: "es",
    });
    expect(report.claims[0]).toMatchObject({ verdict: "verified", finalMinor: 1298 });
    expect(guarded.savings[0]).toMatchObject({ amountMinor: 1298, kind: "optimize_current" });
    expect(guarded.savings[0]!.nextStep).toContain("Vodafone");
    // 57,98 (total), 45,00 (base) and 12,98 (sum of add-ons) are all derivable:
    expect(guarded.headline).toContain("57,98");
    expect(guarded.gotchas[0]!.explanation).toContain("12,98");
    expect(report.removedSentences).toEqual([]);
  });

  it("substitutes inflated claims with the recomputed number", () => {
    const inflated = structuredClone(baseDecode);
    inflated.savings[0]!.estimatedSavingMinor = 4000;
    const { guarded, report } = applyGuardrails({ decode: inflated, extraction, pack: mobilePack, offers: [], locale: "es" });
    expect(report.claims[0]).toMatchObject({ verdict: "computed", claimedMinor: 4000, finalMinor: 1298 });
    expect(guarded.savings[0]!.amountMinor).toBe(1298);
  });

  it("drops claims citing nonexistent paths", () => {
    const bogus = structuredClone(baseDecode);
    bogus.savings[0]!.basis.extractionPaths = ["category_fields.mobile.addOns.7.amount"];
    const { guarded, report } = applyGuardrails({ decode: bogus, extraction, pack: mobilePack, offers: [], locale: "es" });
    expect(report.droppedCount).toBe(1);
    expect(guarded.savings).toEqual([]);
  });

  it("drops claims for unknown levers", () => {
    const bogus = structuredClone(baseDecode);
    bogus.savings[0]!.leverId = "made_up_lever";
    const { report } = applyGuardrails({ decode: bogus, extraction, pack: mobilePack, offers: [], locale: "es" });
    expect(report.claims[0]).toMatchObject({ verdict: "dropped", reason: "unknown lever" });
  });

  it("sweeps fabricated amounts out of prose", () => {
    const fabricated = structuredClone(baseDecode);
    fabricated.sections.push({
      title: "Invento",
      plainExplanation: "La media nacional es 38,50 € al mes. Tu plan cuesta 45,00 €.",
      sourceExtractionPaths: [],
    });
    const { guarded, report } = applyGuardrails({ decode: fabricated, extraction, pack: mobilePack, offers: [], locale: "es" });
    const section = guarded.sections.find((s) => s.title === "Invento");
    expect(section?.plainExplanation).not.toContain("38,50");
    expect(section?.plainExplanation).toContain("45,00");
    expect(report.removedSentences.some((r) => r.sentence.includes("38,50"))).toBe(true);
  });
});

describe("computeGotchaFacts", () => {
  it("runs deterministic detectors", () => {
    const facts = computeGotchaFacts(mobilePack, extraction);
    expect(facts.addon_creep).toBe(true);
    expect(facts.roaming_charges).toBeNull(); // roamingCharges is null → undecidable
  });
});
