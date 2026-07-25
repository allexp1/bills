import type { MergedExtraction } from "@bills/category-packs";
import { parseAmount } from "@bills/shared";

/**
 * Multi-month bill comparison, pure code: snapshots of prior bills (from
 * their stored extractions) diffed against the current one. Everything here
 * is arithmetic over extracted amounts — no model involvement, so the
 * numbers render without needing the guardrail sweep (they're added to the
 * derivable set anyway so the decode may narrate them).
 */

export interface BillSnapshot {
  invoiceId: string;
  /** Best period label available: billingPeriodEnd, else issueDate. */
  period: string | null;
  totalMinor: number | null;
  currency: string;
  lineItems: Array<{ label: string; amountMinor: number | null }>;
  dataUsedGb: number | null;
  usageKwh: number | null;
}

export interface BillHistory {
  previousCount: number;
  currency: string;
  /** Oldest → current, for a mini trend line. */
  totalsTrend: Array<{ period: string | null; totalMinor: number | null }>;
  vsPrevious: {
    period: string | null;
    totalDeltaMinor: number | null;
    newItems: Array<{ label: string; amountMinor: number | null }>;
    removedItems: Array<{ label: string; amountMinor: number | null }>;
    changedItems: Array<{ label: string; fromMinor: number; toMinor: number }>;
    dataUsedDeltaGb: number | null;
    usageKwhDelta: number | null;
  } | null;
}

const normLabel = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d+[.,]?\d*/g, "#") // "Cloud 100GB" ≈ "Cloud 200GB" label-wise
    .replace(/[^a-z#]+/g, " ")
    .trim();

const num = (printed: string | null): number | null => {
  if (!printed) return null;
  const m = printed.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return m ? Number.parseFloat(m[0]) : null;
};

export function snapshotFromExtraction(invoiceId: string, extraction: MergedExtraction): BillSnapshot {
  const common = extraction.common;
  const currency = common.currency ?? "EUR";
  const fields = (extraction.category_fields as Record<string, Record<string, unknown> | null>)[extraction.category];
  return {
    invoiceId,
    period: common.billingPeriodEnd ?? common.issueDate ?? null,
    totalMinor: common.totalAmount ? parseAmount(common.totalAmount, currency) : null,
    currency,
    lineItems: common.lineItems.map((li) => ({
      label: li.label,
      amountMinor: li.amount ? parseAmount(li.amount, currency) : null,
    })),
    dataUsedGb: num((fields?.dataUsedGb as string | null) ?? null),
    usageKwh: num((fields?.usageKwh as string | null) ?? null),
  };
}

/** All parseable amounts of a snapshot — fed into the guardrail derivable set. */
export function snapshotAmounts(s: BillSnapshot): number[] {
  return [s.totalMinor, ...s.lineItems.map((li) => li.amountMinor)].filter((v): v is number => v !== null);
}

export function buildBillHistory(current: BillSnapshot, previous: BillSnapshot[]): BillHistory | null {
  const prior = previous
    .filter((p) => p.currency === current.currency)
    .sort((a, b) => (a.period ?? "").localeCompare(b.period ?? ""));
  if (prior.length === 0) return null;

  const last = prior[prior.length - 1]!;
  const currentByLabel = new Map(current.lineItems.map((li) => [normLabel(li.label), li]));
  const lastByLabel = new Map(last.lineItems.map((li) => [normLabel(li.label), li]));

  const newItems = current.lineItems.filter((li) => !lastByLabel.has(normLabel(li.label)));
  const removedItems = last.lineItems.filter((li) => !currentByLabel.has(normLabel(li.label)));
  const changedItems: Array<{ label: string; fromMinor: number; toMinor: number }> = [];
  for (const li of current.lineItems) {
    const before = lastByLabel.get(normLabel(li.label));
    if (before && before.amountMinor !== null && li.amountMinor !== null && before.amountMinor !== li.amountMinor) {
      changedItems.push({ label: li.label, fromMinor: before.amountMinor, toMinor: li.amountMinor });
    }
  }

  return {
    previousCount: prior.length,
    currency: current.currency,
    totalsTrend: [...prior, current].map((s) => ({ period: s.period, totalMinor: s.totalMinor })),
    vsPrevious: {
      period: last.period,
      totalDeltaMinor:
        current.totalMinor !== null && last.totalMinor !== null ? current.totalMinor - last.totalMinor : null,
      newItems: newItems.map((li) => ({ label: li.label, amountMinor: li.amountMinor })),
      removedItems: removedItems.map((li) => ({ label: li.label, amountMinor: li.amountMinor })),
      changedItems,
      dataUsedDeltaGb:
        current.dataUsedGb !== null && last.dataUsedGb !== null
          ? Math.round((current.dataUsedGb - last.dataUsedGb) * 10) / 10
          : null,
      usageKwhDelta:
        current.usageKwh !== null && last.usageKwh !== null ? Math.round(current.usageKwh - last.usageKwh) : null,
    },
  };
}
