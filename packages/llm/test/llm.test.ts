import { describe, expect, it } from "vitest";
import { usageFrom } from "../src/client.js";
import { extractionSystemPrompt } from "../src/prompts/extraction.js";
import { DecodeOutputSchema } from "../src/decode.js";
import { lqaMerge } from "../src/translate.js";

describe("translation LQA (numeric invariance)", () => {
  it("keeps faithful translations, falls back on changed numbers", () => {
    const source = ["Cuota Plan 800GB", "Descuento 2,00 € por e-factura", "Seguro móvil"];
    const translated = ["800GB plan fee", "2.00 € discount for e-billing", "Mobile insurance"];
    const { merged, fellBack } = lqaMerge(source, translated);
    expect(merged).toEqual(translated);
    expect(fellBack).toBe(0);
  });

  it("a number changed in translation → that item falls back to the original", () => {
    const { merged, fellBack } = lqaMerge(["Cuota 45,00 €"], ["Fee of 54.00 €"]);
    expect(merged).toEqual(["Cuota 45,00 €"]);
    expect(fellBack).toBe(1);
  });

  it("length mismatch → full fallback; empty translation of non-empty source falls back", () => {
    expect(lqaMerge(["a", "b"], ["only one"])).toEqual({ merged: ["a", "b"], fellBack: 2 });
    expect(lqaMerge(["Cuota fija"], ["  "])).toEqual({ merged: ["Cuota fija"], fellBack: 1 });
  });

  it("separator changes are fine as long as digits survive", () => {
    const { fellBack } = lqaMerge(["Consumo 1.234,56"], ["Usage 1,234.56"]);
    expect(fellBack).toBe(0);
  });
});

describe("usageFrom", () => {
  it("maps API usage with null cache fields", () => {
    expect(usageFrom({ input_tokens: 100, output_tokens: 20, cache_read_input_tokens: null })).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });
});

describe("extraction system prompt", () => {
  it("is static (cacheable) and carries the hard rules plus every pack's hints", () => {
    const a = extractionSystemPrompt();
    const b = extractionSystemPrompt();
    expect(a).toBe(b); // byte-identical across calls — prompt caching depends on this
    expect(a).toContain("NEVER guess");
    expect(a).toContain("### energy");
    expect(a).toContain("### broadband");
    expect(a).toContain("### mobile");
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no dates → no silent cache invalidation
  });
});

describe("DecodeOutputSchema", () => {
  it("accepts a well-formed decode and rejects unknown periods", () => {
    const good = {
      language: "es",
      headline: "h",
      sections: [],
      gotchas: [],
      printedNextSteps: [],
      savings: [
        {
          leverId: "x",
          estimatedSavingMinor: 100,
          period: "monthly",
          currency: "EUR",
          basis: { extractionPaths: [], formula: null, comparisonOfferId: null },
          explanation: "e",
        },
      ],
      explainMoreQueue: [],
      negotiationPitch: null,
    };
    expect(DecodeOutputSchema.parse(good).savings).toHaveLength(1);
    const bad = structuredClone(good);
    (bad.savings[0] as { period: string }).period = "weekly";
    expect(() => DecodeOutputSchema.parse(bad)).toThrow();
  });

  it("accepts a decode with a negotiation pitch and rejects unknown strategies", () => {
    const pitch = {
      language: "es",
      strategy: "competitor_anchor",
      chatMessage: "Hola…",
      callScript: {
        opening: "o",
        openAsk: "What options do you have for someone like me?",
        onFirstOffer: "Is that the best you can do?",
        pushHarder: ["What else can you do?"],
        evidence: ["e1"],
        objections: [{ ifTheySay: "no", youSay: "retención" }],
        closing: "c",
      },
      targetMonthlyMinor: 2999,
      basis: { extractionPaths: ["common.totalAmount"], comparisonOfferIds: ["web-mobile-0"] },
    };
    const good = {
      language: "es",
      headline: "h",
      sections: [],
      gotchas: [],
      printedNextSteps: [],
      savings: [],
      explainMoreQueue: [],
      negotiationPitch: pitch,
    };
    expect(DecodeOutputSchema.parse(good).negotiationPitch?.strategy).toBe("competitor_anchor");
    const bad = structuredClone(good);
    (bad.negotiationPitch as { strategy: string }).strategy = "guilt_trip";
    expect(() => DecodeOutputSchema.parse(bad)).toThrow();
  });
});
