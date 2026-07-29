import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import type { Db } from "../client.js";
import { withTenant, type TenantDb } from "../tenant.js";
import * as schema from "../schema.js";

/**
 * Tenant-scoped reads for the account portfolio.
 *
 * Every function here takes a customerId and runs inside withTenant, and the
 * where clauses still filter on customerId explicitly. That looks redundant
 * next to row level security, and it is deliberate: the filter documents the
 * intent at the call site, RLS enforces it if someone later refactors the
 * filter away, and the guard test fails if a new query in this file forgets
 * one. Three things have to go wrong at once before data crosses tenants.
 */

export type PortfolioStatus = "optimized" | "negotiating" | "audited" | "requires_review";

export interface PortfolioEntry {
  invoiceId: string;
  providerName: string | null;
  category: string | null;
  currency: string | null;
  totalAmountMinor: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  status: PortfolioStatus;
  summaryTokenId: string | null;
  createdAt: Date;
}

export interface PortfolioSummary {
  monthlyOutflowMinor: number;
  currency: string | null;
  activeAudits: number;
  providerCount: number;
  entries: PortfolioEntry[];
}

/**
 * Maps pipeline status onto the four badges in the portfolio design. Anything
 * that failed or is still being worked on is surfaced honestly rather than
 * hidden, because a bill that silently disappeared is worse than one labelled
 * as needing attention.
 */
function toPortfolioStatus(invoiceStatus: string, hasMission: boolean): PortfolioStatus {
  if (invoiceStatus === "failed") return "requires_review";
  if (hasMission) return "negotiating";
  if (invoiceStatus === "decoded" || invoiceStatus === "delivered") return "audited";
  return "requires_review";
}

/**
 * Confirms an invoice belongs to this customer, for the signed-in "open my
 * bill" path.
 *
 * Returns the id or null, nothing else. The caller only needs to know whether
 * it may mint a link, and handing back the row would invite it to be rendered
 * without a second thought about scope.
 */
export async function findOwnedInvoice(
  db: Db,
  customerId: string,
  invoiceId: string,
): Promise<{ id: string; status: string } | null> {
  return withTenant(db, customerId, async (tx: TenantDb) => {
    const rows = await tx
      .select({ id: schema.invoices.id, status: schema.invoices.status })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.customerId, customerId)))
      .limit(1);
    return rows[0] ?? null;
  });
}

/**
 * Which of two bills covers the more recent period.
 *
 * Compares billingPeriodEnd as an ISO date string, which sorts correctly as
 * text and is how the column is stored. Falls back to upload time when a bill
 * carries no period, because something has to break the tie and the alternative
 * is an arbitrary winner.
 */
function isNewerBill(
  a: { billingPeriodEnd: string | null; createdAt: Date },
  b: { billingPeriodEnd: string | null; createdAt: Date },
): boolean {
  if (a.billingPeriodEnd && b.billingPeriodEnd) return a.billingPeriodEnd > b.billingPeriodEnd;
  if (a.billingPeriodEnd) return true;
  if (b.billingPeriodEnd) return false;
  return a.createdAt > b.createdAt;
}

export async function getPortfolio(db: Db, customerId: string): Promise<PortfolioSummary> {
  return withTenant(db, customerId, async (tx: TenantDb) => {
    const invoices = await tx
      .select({
        id: schema.invoices.id,
        providerName: schema.invoices.providerName,
        category: schema.invoices.category,
        currency: schema.invoices.currency,
        totalAmountMinor: schema.invoices.totalAmountMinor,
        billingPeriodStart: schema.invoices.billingPeriodStart,
        billingPeriodEnd: schema.invoices.billingPeriodEnd,
        status: schema.invoices.status,
        summaryTokenId: schema.invoices.summaryTokenId,
        createdAt: schema.invoices.createdAt,
      })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.customerId, customerId),
          /* A row the duplicate check stopped. It exists so we can tell that
             someone sent the same bill twice, and it holds no decoded data of
             its own: the provider and total are written after the point where
             it was stopped, so including it would put an empty "Unnamed
             provider" card at the top of the dashboard, above the real bill it
             is a copy of. */
          ne(schema.invoices.status, "duplicate"),
        ),
      )
      .orderBy(desc(schema.invoices.createdAt))
      .limit(200);

    const openMissions = await tx
      .select({ invoiceId: schema.missions.invoiceId })
      .from(schema.missions)
      .where(and(eq(schema.missions.customerId, customerId), isNotNull(schema.missions.invoiceId)));

    const negotiating = new Set(openMissions.map((m) => m.invoiceId).filter(Boolean) as string[]);

    /* Every bill is listed, newest first.

       This used to collapse to one entry per provider, latest bill wins, on the
       reasoning that next month's bill should update the row rather than add
       one. It hid real bills. Two Pelephone bills for May and June are two
       bills, and the second upload made the first vanish.

       The bug also lied about itself: provider_name is written in a later,
       best-effort step of the pipeline, so immediately after an upload the new
       row still had a null provider and keyed on its own id. Both bills showed.
       By the next visit the name had landed, the two collapsed, and one
       disappeared with no action from anyone in between.

       Genuine re-sends of the SAME bill are now caught upstream by the
       duplicate check, which is where that belongs: it can tell the difference
       between the same bill twice and two months of the same provider. This
       function should not be guessing at it from provider names. */
    const entries: PortfolioEntry[] = invoices.map((inv) => ({
      invoiceId: inv.id,
      providerName: inv.providerName,
      category: inv.category,
      currency: inv.currency,
      totalAmountMinor: inv.totalAmountMinor,
      billingPeriodStart: inv.billingPeriodStart,
      billingPeriodEnd: inv.billingPeriodEnd,
      status: toPortfolioStatus(inv.status, negotiating.has(inv.id)),
      summaryTokenId: inv.summaryTokenId,
      createdAt: inv.createdAt,
    }));

    /* Outflow still counts one bill per provider, and that has to stay true
       even though the list no longer does. "Monthly outflow" answers what you
       pay each month; adding six months of the same phone bill would answer
       nothing and read six times too high.

       "Latest" means the latest BILLING PERIOD, not the latest upload. Those
       come apart the moment someone uploads an old bill after a new one, which
       is exactly what happened here: June was decoded first, May second, and
       the dashboard reported May's total as the current monthly outflow. Upload
       order is a fact about the person's afternoon; the billing period is a
       fact about the bill.

       createdAt is the tiebreak, for bills with no period on them. */
    const latestByProvider = new Map<string, (typeof invoices)[number]>();
    for (const inv of invoices) {
      const key = inv.providerName ?? inv.id;
      const held = latestByProvider.get(key);
      if (!held || isNewerBill(inv, held)) latestByProvider.set(key, inv);
    }
    const monthlyOutflowMinor = [...latestByProvider.values()].reduce(
      (sum, inv) => sum + (inv.totalAmountMinor ?? 0),
      0,
    );

    return {
      monthlyOutflowMinor,
      currency: entries.find((e) => e.currency)?.currency ?? null,
      activeAudits: entries.filter((e) => e.status === "negotiating").length,
      providerCount: latestByProvider.size,
      entries,
    };
  });
}

export async function getRetentionConsent(db: Db, customerId: string): Promise<Date | null> {
  return withTenant(db, customerId, async (tx) => {
    const rows = await tx
      .select({ at: schema.customers.retentionConsentAt })
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId))
      .limit(1);
    return rows[0]?.at ?? null;
  });
}

export async function setRetentionConsent(
  db: Db,
  customerId: string,
  consented: boolean,
): Promise<void> {
  await withTenant(db, customerId, async (tx) => {
    await tx
      .update(schema.customers)
      .set({ retentionConsentAt: consented ? new Date() : null })
      .where(eq(schema.customers.id, customerId));
  });
}
