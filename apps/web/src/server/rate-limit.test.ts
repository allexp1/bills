import { describe, expect, it } from "vitest";
import { STALE_IN_FLIGHT_MINUTES, summarizeQuota } from "./rate-limit.js";

const NOW = new Date("2026-07-27T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe("summarizeQuota", () => {
  it("counts delivered bills and ignores clean failures", () => {
    const usage = summarizeQuota(
      [
        { status: "delivered", createdAt: minutesAgo(10) },
        { status: "delivered", createdAt: minutesAgo(20) },
        { status: "failed", createdAt: minutesAgo(30) },
      ],
      NOW,
    );
    expect(usage.counted).toBe(2);
    expect(usage.attempts).toBe(3);
    expect(usage.stale).toBe(0);
  });

  it("a run still in flight counts — it may yet deliver", () => {
    const usage = summarizeQuota([{ status: "decoding", createdAt: minutesAgo(2) }], NOW);
    expect(usage.counted).toBe(1);
    expect(usage.stale).toBe(0);
  });

  it("an in-flight run older than the staleness window is presumed dead and stops holding a slot", () => {
    const usage = summarizeQuota(
      [{ status: "decoding", createdAt: minutesAgo(STALE_IN_FLIGHT_MINUTES + 1) }],
      NOW,
    );
    // THE bug: this used to count forever, locking the customer out after a
    // few timeouts even though they never received an analysis.
    expect(usage.counted).toBe(0);
    expect(usage.stale).toBe(1);
  });

  it("every in-flight status is swept, not just decoding", () => {
    const old = minutesAgo(STALE_IN_FLIGHT_MINUTES + 5);
    const usage = summarizeQuota(
      [
        { status: "collecting", createdAt: old },
        { status: "queued", createdAt: old },
        { status: "extracting", createdAt: old },
        { status: "decoding", createdAt: old },
        { status: "guardrail", createdAt: old },
      ],
      NOW,
    );
    expect(usage.stale).toBe(5);
    expect(usage.counted).toBe(0);
  });

  it("a delivered bill never goes stale, however old", () => {
    const usage = summarizeQuota([{ status: "delivered", createdAt: minutesAgo(23 * 60) }], NOW);
    expect(usage.counted).toBe(1);
    expect(usage.stale).toBe(0);
  });

  it("reproduces the real lockout: 6 delivered + 4 dead + 3 failed no longer exceeds a limit of 10", () => {
    const dead = minutesAgo(STALE_IN_FLIGHT_MINUTES + 60);
    const rows = [
      ...Array.from({ length: 6 }, () => ({ status: "delivered", createdAt: minutesAgo(120) })),
      ...Array.from({ length: 4 }, () => ({ status: "decoding", createdAt: dead })),
      ...Array.from({ length: 3 }, () => ({ status: "failed", createdAt: minutesAgo(200) })),
    ];
    const usage = summarizeQuota(rows, NOW);
    expect(usage.counted).toBe(6);
    expect(usage.stale).toBe(4);
    expect(usage.byStatus).toEqual({ delivered: 6, decoding: 4, failed: 3 });
  });

  it("still bounds abuse: attempts include everything, stale rows included", () => {
    const rows = Array.from({ length: 200 }, () => ({
      status: "decoding",
      createdAt: minutesAgo(STALE_IN_FLIGHT_MINUTES + 1),
    }));
    const usage = summarizeQuota(rows, NOW);
    expect(usage.counted).toBe(0);
    // The attempt ceiling is what stops a crash-loop being a free pass.
    expect(usage.exceeded).toBe(true);
  });
});
