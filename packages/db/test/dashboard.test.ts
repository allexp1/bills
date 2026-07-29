import { describe, expect, it } from "vitest";
import { buildAlerts, buildCharts, buildTotals, type DashboardService } from "../src/repo/dashboard.js";

function svc(over: Partial<DashboardService> = {}): DashboardService {
  return {
    key: "Pelephone|mobile|IL",
    providerName: "Pelephone",
    category: "mobile",
    country: "IL",
    currency: "ILS",
    bills: [],
    latestMinor: 8985,
    previousMinor: 12900,
    averageMinor: 9360,
    medianMinor: 8985,
    status: "audited",
    promoEndDate: null,
    contractEndDate: null,
    latestInvoiceId: "inv1",
    ...over,
  };
}
const bill = (month: string, minor: number | null) => ({
  invoiceId: `i-${month}`,
  periodStart: `${month}-02`,
  periodEnd: `${month}-28`,
  month,
  totalMinor: minor,
  createdAt: new Date("2026-07-01T00:00:00Z"),
});

describe("buildTotals", () => {
  it("never adds two currencies together", () => {
    /* A shekel plus a euro is not a number. One blended total would be exactly
       the kind of invented figure the product refuses to print. */
    const totals = buildTotals([
      svc({ currency: "ILS", latestMinor: 8985, previousMinor: 12900 }),
      svc({ key: "b", currency: "EUR", latestMinor: 2290, previousMinor: 2210 }),
    ]);
    expect(totals).toHaveLength(2);
    expect(totals.find((t) => t.currency === "ILS")?.minor).toBe(8985);
    expect(totals.find((t) => t.currency === "EUR")?.minor).toBe(2290);
  });

  it("counts the latest bill per service, not every bill", () => {
    const totals = buildTotals([svc({ latestMinor: 8985 }), svc({ key: "b", latestMinor: 13990 })]);
    expect(totals[0]!.minor).toBe(8985 + 13990);
  });

  it("only compares against a month where every service has a previous bill of its own", () => {
    /* Otherwise the comparison is a real month against a partial one, and the
       change it reports is an artefact of who happened to have history. */
    const totals = buildTotals([
      svc({ latestMinor: 8985, previousMinor: 12900 }),
      svc({ key: "b", latestMinor: 5000, previousMinor: null }),
    ]);
    expect(totals[0]!.minor).toBe(13985);
    expect(totals[0]!.previousMinor).toBe(12900);
  });
});

describe("buildCharts", () => {
  it("does not draw a chart from one month", () => {
    /* A single column is a stat tile pretending to be a chart. */
    expect(buildCharts([svc({ bills: [bill("2026-06", 8985)] })])).toHaveLength(0);
  });

  it("leaves a missing month empty rather than repeating the last one", () => {
    const charts = buildCharts([
      svc({ bills: [bill("2026-06", 8985), bill("2026-04", 6194)] }),
    ]);
    expect(charts[0]!.months).toEqual(["2026-04", "2026-06"]);
    expect(charts[0]!.series[0]!.values).toEqual([6194, 8985]);

    const gapped = buildCharts([
      svc({ bills: [bill("2026-06", 8985), bill("2026-04", 6194)] }),
      svc({ key: "b", bills: [bill("2026-04", 5000)] }),
    ]);
    /* Service b has nothing in June. Carrying April forward would draw a bill
       that was never sent. */
    expect(gapped[0]!.series.find((s) => s.key === "b")!.values).toEqual([5000, null]);
  });

  it("keeps one chart per currency", () => {
    const charts = buildCharts([
      svc({ bills: [bill("2026-05", 100), bill("2026-06", 110)] }),
      svc({ key: "b", currency: "EUR", bills: [bill("2026-05", 200), bill("2026-06", 210)] }),
    ]);
    expect(charts.map((c) => c.currency).sort()).toEqual(["EUR", "ILS"]);
  });
});

describe("buildAlerts", () => {
  const today = new Date("2026-07-30T00:00:00Z");

  it("flags a rise that clears both the share and the absolute floor", () => {
    const [a] = buildAlerts([svc({ previousMinor: 6194, latestMinor: 12900 })], today);
    expect(a?.kind).toBe("jump");
    expect(a?.deltaMinor).toBe(6706);
    expect(a?.deltaPct).toBe(108);
  });

  it("ignores a big percentage on a trivial amount", () => {
    /* 200% of nothing is nothing. Percentage alone makes a rounding difference
       on a tiny bill look like an emergency. */
    expect(buildAlerts([svc({ previousMinor: 200, latestMinor: 600 })], today)).toHaveLength(0);
  });

  it("ignores a big amount that is a small share", () => {
    expect(buildAlerts([svc({ previousMinor: 100000, latestMinor: 105000 })], today)).toHaveLength(0);
  });

  it("never flags a bill that went down", () => {
    expect(buildAlerts([svc({ previousMinor: 12900, latestMinor: 8985 })], today)).toHaveLength(0);
  });

  it("says nothing at all when there is nothing to say", () => {
    /* An empty "all clear" card every month teaches people to stop reading. */
    expect(buildAlerts([svc({ previousMinor: null, latestMinor: 8985 })], today)).toEqual([]);
  });

  it("surfaces a promo ending soon and ignores one already gone", () => {
    expect(
      buildAlerts([svc({ previousMinor: null, promoEndDate: "2026-08-20" })], today)[0]?.kind,
    ).toBe("promo_ending");
    /* Already lapsed: the price it was holding down has already moved, so there
       is no longer an action attached to it. */
    expect(buildAlerts([svc({ previousMinor: null, promoEndDate: "2026-06-01" })], today)).toHaveLength(0);
    /* Too far out to act on. */
    expect(buildAlerts([svc({ previousMinor: null, promoEndDate: "2027-06-01" })], today)).toHaveLength(0);
  });

  it("puts a price that already moved above a date in the future", () => {
    const alerts = buildAlerts(
      [
        svc({ key: "a", previousMinor: null, contractEndDate: "2026-08-10" }),
        svc({ key: "b", previousMinor: 6194, latestMinor: 12900 }),
      ],
      today,
    );
    expect(alerts.map((a) => a.kind)).toEqual(["jump", "contract_ending"]);
  });
});

describe("the outlier rule", () => {
  const today = new Date("2026-07-30T00:00:00Z");

  it("finds a spike that is no longer the latest bill", () => {
    /* The real case: a ₪415.17 February bill among four months near ₪90. The
       jump rule compares only the two most recent bills, so it never sees this,
       and it is the most notable figure in the data. */
    const bills = [
      bill("2026-07", 8985),
      bill("2026-06", 12900),
      bill("2026-05", 6194),
      bill("2026-04", 6193),
      bill("2026-03", 41517),
    ];
    const alerts = buildAlerts(
      [svc({ bills, latestMinor: 8985, previousMinor: 12900, medianMinor: 8985, latestInvoiceId: "i-2026-07" })],
      today,
    );
    const outlier = alerts.find((a) => a.kind === "outlier");
    expect(outlier?.toMinor).toBe(41517);
    expect(outlier?.invoiceId).toBe("i-2026-03");
  });

  it("measures against the median so the spike cannot raise its own bar", () => {
    /* Against the mean of that history (₪151.58) the ₪415 bill is 2.7x. Against
       the median (₪89.85) it is 4.6x. Using the mean would let a big enough
       outlier hide itself. */
    const bills = [bill("2026-07", 8985), bill("2026-06", 9000), bill("2026-03", 20000)];
    const alerts = buildAlerts(
      [svc({ bills, latestMinor: 8985, previousMinor: 9000, medianMinor: 9000, latestInvoiceId: "i-2026-07" })],
      today,
    );
    expect(alerts.some((a) => a.kind === "outlier")).toBe(true);
  });

  it("says nothing about a history that is merely varied", () => {
    const bills = [bill("2026-07", 8985), bill("2026-06", 9500), bill("2026-05", 11000)];
    const alerts = buildAlerts(
      [svc({ bills, latestMinor: 8985, previousMinor: 9500, medianMinor: 9500, latestInvoiceId: "i-2026-07" })],
      today,
    );
    expect(alerts).toEqual([]);
  });

  it("needs three bills before calling anything unusual", () => {
    /* With two bills the median IS one of them, so every pair where one is
       double the other would read as an outlier. That is a jump, and the jump
       rule already covers it with a direction. */
    const bills = [bill("2026-07", 8985), bill("2026-03", 41517)];
    const alerts = buildAlerts(
      [svc({ bills, latestMinor: 8985, previousMinor: 41517, medianMinor: 25251, latestInvoiceId: "i-2026-07" })],
      today,
    );
    expect(alerts.some((a) => a.kind === "outlier")).toBe(false);
  });
});
