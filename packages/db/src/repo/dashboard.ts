import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "../client.js";
import { withTenant, type TenantDb } from "../tenant.js";
import * as schema from "../schema.js";

/**
 * The dashboard read: bills grouped into services, with trends.
 *
 * The unit here is a SERVICE, not a bill. Three Pelephone bills are three
 * months of one thing you pay for, and the old dashboard listed them as three
 * separate items, which is why it read as noise rather than as a picture of what
 * someone spends.
 *
 * A service is provider + category + country. Account number would belong in
 * that key too, and does not, because it lives only inside the encrypted
 * extraction and never reaches a column. The consequence is honest and worth
 * knowing: two SIM lines on one provider's account merge into one service. That
 * is a migration to fix, not a query.
 *
 * Nothing here computes a figure that is not on a bill. Savings stay null until
 * a negotiation completes and can be cited to the offer it came from.
 */

export type ServiceStatus = "negotiating" | "audited" | "single_bill";

export interface DashboardBill {
  invoiceId: string;
  periodStart: string | null;
  periodEnd: string | null;
  /** The month this bill belongs to, "2026-06". Used to line services up. */
  month: string | null;
  totalMinor: number | null;
  createdAt: Date;
}

export interface DashboardService {
  key: string;
  providerName: string | null;
  category: string | null;
  country: string | null;
  currency: string | null;
  /** Newest billing period first. */
  bills: DashboardBill[];
  latestMinor: number | null;
  previousMinor: number | null;
  /** Mean of every bill with a total. Null when nothing has one. */
  averageMinor: number | null;
  status: ServiceStatus;
  promoEndDate: string | null;
  contractEndDate: string | null;
  /** The invoice to open: the most recent period. */
  latestInvoiceId: string;
}

/**
 * Something with a date or a number attached that the person can act on.
 *
 * Every kind is derived from a field that is actually on a bill. There is
 * deliberately no "looks fine" item and no score: a section that always has
 * something in it teaches people to stop reading it.
 */
export interface DashboardAlert {
  kind: "jump" | "promo_ending" | "contract_ending";
  serviceKey: string;
  providerName: string | null;
  currency: string | null;
  invoiceId: string;
  /** jump only. */
  fromMinor?: number;
  toMinor?: number;
  deltaMinor?: number;
  deltaPct?: number;
  /** promo_ending and contract_ending only. */
  date?: string;
}

export interface CurrencyTotal {
  currency: string;
  /** Latest bill per service, summed. */
  minor: number;
  /** The same sum one month earlier, or null when there is no earlier month. */
  previousMinor: number | null;
}

export interface DashboardChartSeries {
  key: string;
  label: string;
  /** One entry per month in `months`; null where that service has no bill. */
  values: Array<number | null>;
}

export interface DashboardChart {
  currency: string;
  /** Ascending, "2026-02" … "2026-07". */
  months: string[];
  series: DashboardChartSeries[];
}

export interface Dashboard {
  services: DashboardService[];
  alerts: DashboardAlert[];
  /**
   * One entry per currency, never summed across them. A shekel and a euro do
   * not add up, and a single blended number would be exactly the kind of
   * invented figure the product refuses to print.
   */
  totals: CurrencyTotal[];
  /** One chart per currency, for the same reason. */
  charts: DashboardChart[];
  countries: string[];
  categories: string[];
  activeNegotiations: number;
  billCount: number;
}

/* Exported for tests: these are the parts where a wrong answer is a
   fabricated claim rather than a layout glitch. */

/** A bill counts as a jump when it rises by this much AND by this share. */
const JUMP_MIN_PCT = 25;
const JUMP_MIN_MINOR = 1000;
/** How far ahead a promo or contract end is worth surfacing. */
const ENDING_SOON_DAYS = 60;

export async function getDashboard(db: Db, customerId: string, today = new Date()): Promise<Dashboard> {
  return withTenant(db, customerId, async (tx: TenantDb) => {
    const rows = await tx
      .select({
        id: schema.invoices.id,
        providerName: schema.invoices.providerName,
        category: schema.invoices.category,
        country: schema.invoices.country,
        currency: schema.invoices.currency,
        periodStart: schema.invoices.billingPeriodStart,
        periodEnd: schema.invoices.billingPeriodEnd,
        issueDate: schema.invoices.issueDate,
        totalMinor: schema.invoices.totalAmountMinor,
        promoEndDate: schema.invoices.promoEndDate,
        contractEndDate: schema.invoices.contractEndDate,
        createdAt: schema.invoices.createdAt,
      })
      .from(schema.invoices)
      /* Delivered only. A failed row has no provider, no total and no summary,
         so it cannot be grouped, charted or opened. */
      .where(and(eq(schema.invoices.customerId, customerId), eq(schema.invoices.status, "delivered")))
      .orderBy(asc(schema.invoices.billingPeriodEnd))
      .limit(400);

    const openMissions = await tx
      .select({ invoiceId: schema.missions.invoiceId })
      .from(schema.missions)
      .where(and(eq(schema.missions.customerId, customerId), isNotNull(schema.missions.invoiceId)));
    const negotiating = new Set(openMissions.map((m) => m.invoiceId).filter(Boolean) as string[]);

    /* Group into services. The key is deliberately coarse: an unnamed provider
       falls back to its own invoice id rather than collapsing every
       under-extracted bill into one imaginary service called "null". */
    const byKey = new Map<string, DashboardService>();
    for (const r of rows) {
      const key = r.providerName
        ? `${r.providerName}|${r.category ?? "?"}|${r.country ?? "?"}`
        : `unnamed:${r.id}`;
      const bill: DashboardBill = {
        invoiceId: r.id,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        month: monthOf(r.periodEnd ?? r.issueDate),
        totalMinor: r.totalMinor,
        createdAt: r.createdAt,
      };
      const held = byKey.get(key);
      if (!held) {
        byKey.set(key, {
          key,
          providerName: r.providerName,
          category: r.category,
          country: r.country,
          currency: r.currency,
          bills: [bill],
          latestMinor: null,
          previousMinor: null,
          averageMinor: null,
          status: "audited",
          promoEndDate: r.promoEndDate,
          contractEndDate: r.contractEndDate,
          latestInvoiceId: r.id,
        });
      } else {
        held.bills.push(bill);
        /* Rows arrive oldest first, so the last one seen carries the newest
           promo and contract dates. An old bill's expired promo must not
           overwrite what the current bill says. */
        held.promoEndDate = r.promoEndDate ?? held.promoEndDate;
        held.contractEndDate = r.contractEndDate ?? held.contractEndDate;
        held.currency = r.currency ?? held.currency;
      }
    }

    const services = [...byKey.values()].map((svc) => {
      /* Newest period first for display. Ties fall back to upload order,
         because something has to break them. */
      svc.bills.sort((a, b) => cmpPeriod(b, a));
      svc.latestInvoiceId = svc.bills[0]!.invoiceId;

      const withTotals = svc.bills.filter((b) => b.totalMinor !== null);
      svc.latestMinor = withTotals[0]?.totalMinor ?? null;
      svc.previousMinor = withTotals[1]?.totalMinor ?? null;
      svc.averageMinor =
        withTotals.length > 0
          ? Math.round(withTotals.reduce((s, b) => s + (b.totalMinor ?? 0), 0) / withTotals.length)
          : null;
      svc.status = svc.bills.some((b) => negotiating.has(b.invoiceId))
        ? "negotiating"
        : svc.bills.length === 1
          ? "single_bill"
          : "audited";
      return svc;
    });

    /* Biggest first. On a dashboard the thing worth attention is usually the
       thing costing the most, and alphabetical order buries it. */
    services.sort((a, b) => (b.latestMinor ?? -1) - (a.latestMinor ?? -1));

    return {
      services,
      alerts: buildAlerts(services, today),
      totals: buildTotals(services),
      charts: buildCharts(services),
      countries: unique(services.map((s) => s.country)),
      categories: unique(services.map((s) => s.category)),
      activeNegotiations: services.filter((s) => s.status === "negotiating").length,
      billCount: rows.length,
    };
  });
}

/** "2026-06" from an ISO date, or null if there is not one to read. */
function monthOf(iso: string | null): string | null {
  return typeof iso === "string" && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : null;
}

function cmpPeriod(a: DashboardBill, b: DashboardBill): number {
  if (a.periodEnd && b.periodEnd) return a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0;
  if (a.periodEnd) return 1;
  if (b.periodEnd) return -1;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

/**
 * Latest bill per service, summed per currency.
 *
 * Per service rather than per bill: adding six months of the same phone bill
 * would answer nothing and read six times too high. Per currency because
 * shekels and euros do not add up, and inventing a blended total is exactly the
 * kind of number that must never appear.
 */
export function buildTotals(services: DashboardService[]): CurrencyTotal[] {
  const acc = new Map<string, { minor: number; previousMinor: number | null }>();
  for (const svc of services) {
    if (!svc.currency || svc.latestMinor === null) continue;
    const held = acc.get(svc.currency) ?? { minor: 0, previousMinor: null };
    held.minor += svc.latestMinor;
    /* Only counted when this service actually has a previous bill, so the
       comparison is between two real months rather than against a partial. */
    if (svc.previousMinor !== null) {
      held.previousMinor = (held.previousMinor ?? 0) + svc.previousMinor;
    }
    acc.set(svc.currency, held);
  }
  return [...acc.entries()]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.minor - a.minor);
}

/**
 * One stacked chart per currency: months across, services as bands.
 *
 * Months come from the bills themselves and any gap stays a gap. Carrying the
 * previous month forward would draw a bill that was never sent.
 */
export function buildCharts(services: DashboardService[]): DashboardChart[] {
  const byCurrency = new Map<string, DashboardService[]>();
  for (const svc of services) {
    if (!svc.currency) continue;
    byCurrency.set(svc.currency, [...(byCurrency.get(svc.currency) ?? []), svc]);
  }

  const charts: DashboardChart[] = [];
  for (const [currency, group] of byCurrency) {
    const months = [
      ...new Set(group.flatMap((s) => s.bills.map((b) => b.month).filter((m): m is string => Boolean(m)))),
    ].sort();
    /* One month is not a trend, and a single column is a stat tile pretending
       to be a chart. The caller renders nothing in that case. */
    if (months.length < 2) continue;

    charts.push({
      currency,
      months,
      series: group.map((svc) => ({
        key: svc.key,
        label: `${svc.providerName ?? "Unnamed"}${svc.category ? ` ${svc.category}` : ""}`,
        values: months.map((m) => {
          const hit = svc.bills.find((b) => b.month === m && b.totalMinor !== null);
          return hit ? hit.totalMinor : null;
        }),
      })),
    });
  }
  return charts;
}

/**
 * The things worth telling someone about, each grounded in a field on a bill.
 *
 * A jump needs to clear both a percentage and an absolute floor. Percentage
 * alone makes a rounding difference on a tiny bill look like an emergency;
 * absolute alone flags every large bill for moving at all.
 */
export function buildAlerts(services: DashboardService[], today: Date): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const horizon = new Date(today.getTime() + ENDING_SOON_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  for (const svc of services) {
    if (svc.latestMinor !== null && svc.previousMinor !== null && svc.previousMinor > 0) {
      const delta = svc.latestMinor - svc.previousMinor;
      const pct = (delta / svc.previousMinor) * 100;
      if (delta >= JUMP_MIN_MINOR && pct >= JUMP_MIN_PCT) {
        alerts.push({
          kind: "jump",
          serviceKey: svc.key,
          providerName: svc.providerName,
          currency: svc.currency,
          invoiceId: svc.latestInvoiceId,
          fromMinor: svc.previousMinor,
          toMinor: svc.latestMinor,
          deltaMinor: delta,
          deltaPct: Math.round(pct),
        });
      }
    }
    /* Already past counts as nothing to do: the promo is gone and the price it
       was holding down has already moved. */
    if (svc.promoEndDate && svc.promoEndDate >= todayIso && svc.promoEndDate <= horizon) {
      alerts.push({
        kind: "promo_ending",
        serviceKey: svc.key,
        providerName: svc.providerName,
        currency: svc.currency,
        invoiceId: svc.latestInvoiceId,
        date: svc.promoEndDate,
      });
    }
    if (svc.contractEndDate && svc.contractEndDate >= todayIso && svc.contractEndDate <= horizon) {
      alerts.push({
        kind: "contract_ending",
        serviceKey: svc.key,
        providerName: svc.providerName,
        currency: svc.currency,
        invoiceId: svc.latestInvoiceId,
        date: svc.contractEndDate,
      });
    }
  }

  /* A price that already moved outranks a date in the future. */
  const rank = { jump: 0, promo_ending: 1, contract_ending: 2 } as const;
  return alerts.sort((a, b) => rank[a.kind] - rank[b.kind]);
}
