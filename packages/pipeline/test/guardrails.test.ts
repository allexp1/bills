import { describe, expect, it } from "vitest";
import { mobilePack, type MergedExtraction } from "@bills/category-packs";
import type { DecodeOutput, NegotiationPitch } from "@bills/llm";
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
    region: null,
    paymentMethod: null,
    printedNextSteps: ["Para cancelar servicios: área cliente > servicios"],
    printedDiscounts: [],
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
      dataAllowanceGb: "800 GB",
      dataUsedGb: "102,4 GB",
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
  negotiationPitch: null,
};

const basePitch: NegotiationPitch = {
  language: "es",
  strategy: "plan_fit",
  chatMessage:
    "Hola, soy cliente de Vodafone. Mi factura es de 57,98 € al mes y estoy pagando 12,98 € en servicios extra que no uso. ¿Podéis ofrecerme un plan mejor ajustado?",
  callScript: {
    opening: "Hola, llamo por mi tarifa actual. Llevo años pagando puntualmente.",
    openAsk: "¿Qué opciones tenéis para alguien como yo?",
    onFirstOffer: "Gracias — ¿es lo mejor que podéis hacer? (y guarda silencio)",
    pushHarder: ["¿Qué más podéis hacer?", "¿Podéis pasarme con el equipo de retención?"],
    evidence: ["Pago 45,00 € de plan base.", "Pago 12,98 € en extras."],
    objections: [{ ifTheySay: "Es la mejor tarifa disponible.", youSay: "Entonces quiero hablar con el equipo de retención." }],
    closing: "Gracias, quedo a la espera.",
  },
  targetMonthlyMinor: 4500,
  basis: { extractionPaths: ["category_fields.mobile.baseFee"], comparisonOfferIds: [] },
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

describe("guarded pitch", () => {
  const withPitch = (pitch: typeof basePitch): DecodeOutput => ({ ...structuredClone(baseDecode), negotiationPitch: pitch });
  const run = (decode: DecodeOutput, offers: Parameters<typeof applyGuardrails>[0]["offers"] = []) =>
    applyGuardrails({ decode, extraction, pack: mobilePack, offers, locale: "es" });

  it("keeps a fully grounded pitch, target included", () => {
    const { guarded, report } = run(withPitch(basePitch));
    expect(guarded.pitch).toBeDefined();
    expect(guarded.pitch!.chatMessage).toContain("57,98");
    expect(guarded.pitch!.targetMonthlyMinor).toBe(4500); // = base fee, derivable
    expect(report.removedSentences).toEqual([]);
  });

  it("strips fabricated amounts from the pitch and nulls an ungrounded target", () => {
    const bad = structuredClone(basePitch);
    bad.chatMessage += " Un vecino paga solo 19,99 € al mes por lo mismo.";
    bad.targetMonthlyMinor = 1999; // grounds to nothing on this bill
    const { guarded, report } = run(withPitch(bad));
    expect(guarded.pitch!.chatMessage).not.toContain("19,99");
    expect(guarded.pitch!.targetMonthlyMinor).toBeNull();
    expect(report.removedSentences.some((r) => r.where === "pitch:chatMessage")).toBe(true);
  });

  it("accepts an offer-grounded target, but competitor prices are ammunition: banned from the chat message, kept in evidence", () => {
    const offers = [
      { id: "web-mobile-0", provider: "Rival", name: "Plan X", estMonthlyCostMinor: 2999, currency: "EUR", country: "ES", link: "https://rival.example" },
    ];
    const cited = structuredClone(basePitch);
    cited.strategy = "competitor_anchor";
    cited.chatMessage =
      "Hola, soy cliente de Vodafone. Rival ofrece Plan X por 29,99 € al mes. Uso 102,4 GB de mis 800 GB. ¿Qué opciones tenéis para alguien como yo?";
    cited.callScript.evidence = ["Rival: Plan X con datos de sobra para mi uso por 29,99 € al mes."];
    cited.targetMonthlyMinor = 2999;
    cited.basis.comparisonOfferIds = ["web-mobile-0"];
    const { guarded, report } = run(withPitch(cited), offers);
    expect(guarded.pitch!.targetMonthlyMinor).toBe(2999);
    // The competitor sentence is stripped from the opening message…
    expect(guarded.pitch!.chatMessage).not.toContain("29,99");
    expect(guarded.pitch!.chatMessage).toContain("opciones");
    expect(report.removedSentences.some((r) => r.where === "pitch:chatMessage" && r.sentence.includes("29,99"))).toBe(true);
    // …but survives where it belongs: mid-call evidence, deployed after their first offer.
    expect(guarded.pitch!.callScript.evidence[0]).toContain("29,99");
  });

  it("redacts restricted data that leaks into the pitch", () => {
    const leaky = structuredClone(basePitch);
    leaky.chatMessage = "Hola, soy cliente de Vodafone. Mi tarjeta es 4111 1111 1111 1111. ¿Hay ofertas mejores?";
    const { guarded } = run(withPitch(leaky));
    expect(guarded.pitch!.chatMessage).not.toContain("4111");
    expect(guarded.pitch!.chatMessage).toContain("[card number redacted]");
  });

  it("code-enforces a number-free open ask (no self-anchoring)", () => {
    const anchored = structuredClone(basePitch);
    anchored.callScript.openAsk = "¿Podéis dejarme la tarifa en 45,00 € al mes? ¿Qué opciones tenéis para alguien como yo?";
    const { guarded, report } = run(withPitch(anchored));
    // 45,00 is derivable (it's the base fee) — the sweep would keep it, but
    // the open ask must carry NO amounts at all:
    expect(guarded.pitch!.callScript.openAsk).not.toContain("45,00");
    expect(guarded.pitch!.callScript.openAsk).toContain("opciones");
    expect(report.removedSentences.some((r) => r.where === "pitch:openAsk:self-anchor")).toBe(true);
  });

  it("carries the bill currency for private-goal rendering", () => {
    const { guarded } = run(withPitch(basePitch));
    expect(guarded.pitch!.currency).toBe("EUR");
  });

  it("drops the pitch entirely when the chat message doesn't survive the sweep", () => {
    const hollow = structuredClone(basePitch);
    hollow.chatMessage = "Vuestra oferta media es 21,50 € según mis cálculos.";
    const { guarded, report } = run(withPitch(hollow));
    expect(guarded.pitch).toBeUndefined();
    expect(report.removedSentences.some((r) => r.where === "pitch")).toBe(true);
  });
});

describe("computeGotchaFacts", () => {
  it("runs deterministic detectors", () => {
    const facts = computeGotchaFacts(mobilePack, extraction);
    expect(facts.addon_creep).toBe(true);
    expect(facts.roaming_charges).toBeNull(); // roamingCharges is null → undecidable
  });
});
