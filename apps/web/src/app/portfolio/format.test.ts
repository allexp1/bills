import { describe, expect, it } from "vitest";
import { periodLabel } from "./format.js";

describe("periodLabel", () => {
  it("writes the year once when both ends share it", () => {
    expect(periodLabel("2026-06-02", "2026-07-01")).toBe("Jun 2 to Jul 1, 2026");
  });

  it("writes both years when the period crosses one", () => {
    expect(periodLabel("2025-12-02", "2026-02-01")).toBe("Dec 2, 2025 to Feb 1, 2026");
  });

  it("is null when the bill does not print a period", () => {
    // The caller decides the wording for a missing period; there is no sensible
    // date to invent here.
    expect(periodLabel(null, "2026-07-01")).toBeNull();
    expect(periodLabel("2026-06-02", null)).toBeNull();
  });

  it("falls back to the raw values rather than printing Invalid Date", () => {
    expect(periodLabel("not-a-date", "2026-07-01")).toBe("not-a-date to 2026-07-01");
  });
});
