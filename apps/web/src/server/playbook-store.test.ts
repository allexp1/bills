import { describe, expect, it } from "vitest";
import { normalizeRegion } from "./playbook-store.js";

/**
 * A region is a database key, so it has to be canonical. The rule is
 * deliberately strict-and-forgiving: anything that is not already a bare
 * subdivision code becomes "", which falls back to the country playbook. A
 * fallback is always safe; a wrong key silently reads the wrong market.
 */
describe("normalizeRegion", () => {
  it("accepts a bare subdivision code", () => {
    expect(normalizeRegion("TX")).toBe("TX");
    expect(normalizeRegion(" tx ")).toBe("TX");
  });

  it("strips the country prefix bills sometimes print", () => {
    expect(normalizeRegion("US-TX")).toBe("TX");
    expect(normalizeRegion("es-cat")).toBe("CAT");
  });

  it("falls back to the country for anything that is not a code", () => {
    // A spelled-out name is not a key — better the country answer than a
    // lookup that can never match.
    expect(normalizeRegion("Texas")).toBe("");
    expect(normalizeRegion("Comunidad de Madrid")).toBe("");
    expect(normalizeRegion(null)).toBe("");
    expect(normalizeRegion(undefined)).toBe("");
    expect(normalizeRegion("")).toBe("");
  });
});
