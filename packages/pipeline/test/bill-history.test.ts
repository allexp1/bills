import { describe, expect, it } from "vitest";
import { buildBillHistory, snapshotAmounts, type BillSnapshot } from "../src/bill-history.js";

const snap = (over: Partial<BillSnapshot>): BillSnapshot => ({
  invoiceId: "INV",
  period: "2026-06-30",
  totalMinor: 4989,
  currency: "ILS",
  lineItems: [
    { label: "Plan 800GB", amountMinor: 4500 },
    { label: "Cloud 100GB", amountMinor: 489 },
  ],
  dataUsedGb: 100,
  usageKwh: null,
  ...over,
});

describe("bill history", () => {
  it("computes total delta, new/removed/changed items, and usage delta", () => {
    const previous = snap({ invoiceId: "P1", period: "2026-05-31", totalMinor: 4500, lineItems: [{ label: "Plan 800GB", amountMinor: 4500 }], dataUsedGb: 240 });
    const current = snap({
      totalMinor: 5789,
      lineItems: [
        { label: "Plan 800GB", amountMinor: 4800 }, // price creep
        { label: "Roaming pack", amountMinor: 989 }, // new
      ],
      dataUsedGb: 100,
    });
    const h = buildBillHistory(current, [previous])!;
    expect(h.previousCount).toBe(1);
    expect(h.vsPrevious!.totalDeltaMinor).toBe(1289);
    expect(h.vsPrevious!.newItems.map((i) => i.label)).toEqual(["Roaming pack"]);
    expect(h.vsPrevious!.removedItems).toEqual([]);
    expect(h.vsPrevious!.changedItems).toEqual([{ label: "Plan 800GB", fromMinor: 4500, toMinor: 4800 }]);
    expect(h.vsPrevious!.dataUsedDeltaGb).toBe(-140);
    expect(h.totalsTrend.map((p) => p.totalMinor)).toEqual([4500, 5789]);
  });

  it("matches labels across number variations and diacritics", () => {
    const previous = snap({ invoiceId: "P1", period: "2026-05-31", lineItems: [{ label: "Descuento fidelización 10%", amountMinor: -200 }] });
    const current = snap({ lineItems: [{ label: "Descuento fidelizacion 15%", amountMinor: -300 }] });
    const h = buildBillHistory(current, [previous])!;
    expect(h.vsPrevious!.newItems).toEqual([]);
    expect(h.vsPrevious!.changedItems).toHaveLength(1);
  });

  it("returns null with no comparable history, ignores other currencies, sorts periods", () => {
    expect(buildBillHistory(snap({}), [])).toBeNull();
    expect(buildBillHistory(snap({}), [snap({ currency: "EUR" })])).toBeNull();
    const h = buildBillHistory(snap({ period: "2026-07-31" }), [
      snap({ invoiceId: "B", period: "2026-06-30", totalMinor: 4700 }),
      snap({ invoiceId: "A", period: "2026-05-31", totalMinor: 4500 }),
    ])!;
    expect(h.totalsTrend.map((p) => p.totalMinor)).toEqual([4500, 4700, 4989]);
    expect(h.vsPrevious!.period).toBe("2026-06-30");
  });

  it("exposes snapshot amounts for the derivable set", () => {
    expect(snapshotAmounts(snap({}))).toEqual([4989, 4500, 489]);
  });
});
