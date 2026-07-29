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

    /* One entry per provider, most recent bill wins, so re-uploading next
       month's bill updates the row instead of adding a duplicate. */
    const latestByProvider = new Map<string, (typeof invoices)[number]>();
    for (const inv of invoices) {
      const key = inv.providerName ?? inv.id;
      if (!latestByProvider.has(key)) latestByProvider.set(key, inv);
    }

    const entries: PortfolioEntry[] = [...latestByProvider.values()].map((inv) => ({
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

    /* Monthly outflow sums one bill per provider. Summing every invoice would
       double count a customer who has uploaded six months of the same bill. */
    const monthlyOutflowMinor = entries.reduce((sum, e) => sum + (e.totalAmountMinor ?? 0), 0);

    return {
      monthlyOutflowMinor,
      currency: entries.find((e) => e.currency)?.currency ?? null,
      activeAudits: entries.filter((e) => e.status === "negotiating").length,
      providerCount: entries.length,
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
