import { describe, expect, it } from "vitest";
import { isGlobalOutage, REGION_SEEDS } from "./playbook-queue.js";

describe("isGlobalOutage", () => {
  it("treats an exhausted credit balance as an outage, not a bad market", () => {
    // The real one: this drained 4 markets' attempts before it was caught.
    expect(
      isGlobalOutage(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
      ),
    ).toBe(true);
  });

  it("covers the other ways the API goes away", () => {
    expect(isGlobalOutage("429 rate_limit_error")).toBe(true);
    expect(isGlobalOutage("529 overloaded_error")).toBe(true);
    expect(isGlobalOutage("500 internal server error")).toBe(true);
    expect(isGlobalOutage("request timeout")).toBe(true);
  });

  it("a market that genuinely cannot be researched still burns an attempt", () => {
    expect(isGlobalOutage("invalid_playbook: levers.0.id: Invalid")).toBe(false);
    expect(isGlobalOutage("no JSON object in the reply")).toBe(false);
    expect(isGlobalOutage(undefined)).toBe(false);
  });
});

describe("REGION_SEEDS", () => {
  it("covers the US retail-choice electricity states", () => {
    // The reason sub-national playbooks exist at all: a country-level
    // "regional monopoly" answer is wrong for every one of these.
    expect(REGION_SEEDS.US?.energy).toContain("TX");
    expect(REGION_SEEDS.US?.energy).toContain("PA");
    expect(REGION_SEEDS.US?.energy).toContain("OH");
  });

  it("holds bare uppercase subdivision codes, since they are database keys", () => {
    for (const [, byUtility] of Object.entries(REGION_SEEDS)) {
      for (const [, regions] of Object.entries(byUtility)) {
        for (const r of regions) expect(r).toMatch(/^[A-Z0-9]{1,3}$/);
        expect(new Set(regions).size).toBe(regions.length);
      }
    }
  });
});
