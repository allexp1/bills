import { describe, expect, it } from "vitest";
import {
  establishedTerms,
  mergeObservations,
  playbookPack,
  withPlaybookHints,
  mobilePack,
  type PlaybookRecord,
  type UtilityPlaybook,
} from "../src/index.js";

const basePlaybook: UtilityPlaybook = {
  localNames: ["מים וביוב"],
  marketStructure: {
    switchable: false,
    model: "municipal",
    regulator: "רשות המים",
    regulatorUrl: "https://www.gov.il/water",
    complaintRoute: "פנייה לתאגיד ואז לרשות המים",
  },
  billing: {
    unit: "m³",
    structure: "Two consumption blocks per person plus a fixed charge and sewerage.",
    tieredPricing: true,
    estimatedReadsCommon: true,
    typicalLineItems: [
      { label: "כמות מוכרת", meaning: "recognised allowance per registered occupant", negotiable: false },
    ],
  },
  benchmarks: [
    { label: "recognised allowance", value: "3.5", unit: "m³/person/month", source: "https://www.gov.il/water" },
    { label: "unsourced benchmark", value: "9", unit: "m³", source: "hearsay" },
  ],
  schemes: [
    { name: "הנחת נזקק", whoQualifies: "low income", howToApply: "apply at the utility", source: "https://www.gov.il/x" },
    { name: "unsourced scheme", whoQualifies: "x", howToApply: "y", source: "trust me" },
  ],
  commonErrors: [{ label: "occupants not registered", howToSpot: "allowance divided by too few people" }],
  levers: [
    {
      id: "register_occupants",
      kind: "optimize_current",
      title: "לעדכן את מספר הנפשות",
      titleEn: "Register every occupant",
      promptFragment: "If the allowance implies fewer people than the household has, say so.",
      quantifiable: true,
      requiresSwitching: false,
    },
    {
      id: "fix_leak",
      kind: "optimize_current",
      title: "לבדוק נזילה",
      titleEn: "Check for a leak",
      promptFragment: "An unexplained consumption jump is usually a leak.",
      quantifiable: false,
      requiresSwitching: false,
    },
    {
      id: "switch_supplier",
      kind: "switch_provider",
      title: "להחליף ספק",
      titleEn: "Switch supplier",
      promptFragment: "Compare suppliers.",
      quantifiable: true,
      requiresSwitching: true,
    },
  ],
  glossary: [{ term: "כמות מוכרת", plain: "the cheaper allowance you get per registered person" }],
  sources: [{ claim: "allowance is 3.5 m³", source: "https://www.gov.il/water" }],
  confidence: 0.8,
};

const record = (playbook: UtilityPlaybook): PlaybookRecord => ({
  country: "IL",
  utility: "water",
  version: 1,
  schemaVersion: 1,
  playbook,
  billsSeen: 3,
  observations: [],
  researchedAt: new Date().toISOString(),
});

describe("playbookPack", () => {
  it("drops switching levers in a market where switching is impossible", () => {
    const pack = playbookPack({ utility: "water", country: "IL", record: record(basePlaybook) });
    const ids = pack.savingsLevers.map((l) => l.id);
    expect(ids).toContain("pb_register_occupants");
    expect(ids).toContain("pb_fix_leak");
    // The decisive rule: never advise an action the market does not permit.
    expect(ids).not.toContain("pb_switch_supplier");
  });

  it("keeps switching levers when the market really is competitive", () => {
    const competitive: UtilityPlaybook = {
      ...basePlaybook,
      marketStructure: { ...basePlaybook.marketStructure, switchable: true, model: "competitive" },
    };
    const pack = playbookPack({ utility: "water", country: "GB", record: record(competitive) });
    expect(pack.savingsLevers.map((l) => l.id)).toContain("pb_switch_supplier");
  });

  it("tells the decode model not to suggest switching in a monopoly", () => {
    const pack = playbookPack({ utility: "water", country: "IL", record: record(basePlaybook) });
    const fragment = pack.decodeHints.gotchaChecks.find((g) => g.id === "pb_no_switching")?.promptFragment ?? "";
    expect(fragment).toMatch(/CANNOT change supplier/);
  });

  it("a qualitative lever can never carry a money amount", () => {
    const pack = playbookPack({ utility: "water", country: "IL", record: record(basePlaybook) });
    const leak = pack.savingsLevers.find((l) => l.id === "pb_fix_leak")!;
    const verdict = leak.validate(
      {
        leverId: "pb_fix_leak",
        estimatedSavingMinor: 5000,
        period: "monthly",
        currency: "ILS",
        basis: { extractionPaths: ["category_fields.utility.usageQuantity"] },
        explanation: "x",
      },
      {} as never,
      {} as never,
    );
    // "flagged" keeps the advice and strips the number.
    expect(verdict.verdict).toBe("flagged");
    expect(leak.promptFragment).toMatch(/Do NOT attach a money amount/);
  });

  it("a quantifiable lever must cite an extraction path", () => {
    const pack = playbookPack({ utility: "water", country: "IL", record: record(basePlaybook) });
    const lever = pack.savingsLevers.find((l) => l.id === "pb_register_occupants")!;
    const claim = {
      leverId: "pb_register_occupants",
      estimatedSavingMinor: 1200,
      period: "monthly" as const,
      currency: "ILS",
      basis: { extractionPaths: [] as string[] },
      explanation: "x",
    };
    expect(lever.validate(claim, {} as never, {} as never).verdict).toBe("flagged");
    claim.basis.extractionPaths = ["category_fields.utility.standingCharge"];
    expect(lever.validate(claim, {} as never, {} as never).verdict).toBe("computed");
  });

  it("carries the researched glossary into the decode prompt", () => {
    const pack = playbookPack({ utility: "water", country: "IL", record: record(basePlaybook) });
    expect(pack.decodeHints.lineItemGlossary).toContain("כמות מוכרת");
  });
});

describe("withPlaybookHints", () => {
  it("adds market facts to a bespoke pack without touching its levers", () => {
    const enriched = withPlaybookHints(mobilePack, record(basePlaybook));
    expect(enriched.savingsLevers).toEqual(mobilePack.savingsLevers);
    expect(enriched.decodeHints.gotchaChecks.length).toBeGreaterThan(mobilePack.decodeHints.gotchaChecks.length);
    expect(enriched.decodeHints.gotchaChecks.some((g) => g.id === "pb_schemes")).toBe(true);
  });
});

describe("observations (k-anonymity)", () => {
  it("counts distinct bills, not repeats within one bill", () => {
    let obs = mergeObservations([], ["דמי מנוי", "דמי מנוי", "ביוב"]);
    expect(obs.find((o) => o.label === "דמי מנוי")!.count).toBe(1);
    obs = mergeObservations(obs, ["דמי מנוי"]);
    expect(obs.find((o) => o.label === "דמי מנוי")!.count).toBe(2);
  });

  it("only promotes wording seen on at least two distinct bills", () => {
    const obs = mergeObservations(mergeObservations([], ["shared", "once-only"]), ["shared"]);
    expect(establishedTerms(obs)).toEqual(["shared"]);
  });
});
