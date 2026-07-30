import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../client.js";
import { withTenant, type TenantDb } from "../tenant.js";
import * as schema from "../schema.js";

/**
 * Deleting one bill.
 *
 * This is the single most dangerous query in the product, so it is scoped twice
 * like every other tenant read, and the ownership check is a precondition rather
 * than a filter: it refuses rather than silently deleting nothing, because
 * "nothing happened and we said it worked" is the failure that loses trust.
 *
 * What "deleted" means here is deliberate and matches the WhatsApp delete-all
 * path, which this now shares:
 *
 *   Gone: the decode, the extraction, the stored pages, and every share link.
 *   These are the bill. Once they are gone nothing can reconstruct what was on
 *   it, including us.
 *
 *   Gone: the identifying columns on the invoice row itself. The provider, the
 *   totals, the dates and the country are cleared. The WhatsApp path used to
 *   leave these behind, which made "permanently deleted" not quite true, so both
 *   paths now clear them.
 *
 *   Kept: the row itself, holding an id, a customer id, a status of "deleted"
 *   and timestamps. It is the record that a bill was here and was deleted, which
 *   is what makes a deletion auditable rather than indistinguishable from a bug.
 *
 *   Kept: the anonymous statistics row, which carries no customer or invoice
 *   linkage and no date finer than a month. It is unlinkable to a person by
 *   construction, which is exactly what lets it outlive the bill. Never add a
 *   linking column to that table.
 */

export type DeleteRefusal = "not_found" | "negotiating";

export interface DeleteBillResult {
  deleted: boolean;
  refused?: DeleteRefusal;
  /**
   * Blob keys the caller should remove from object storage. Usually empty: web
   * uploads never store the pages, and the WhatsApp path purges them as soon as
   * processing succeeds. Returned rather than deleted here because the store
   * lives in the app layer.
   */
  storageKeys: string[];
}

export async function deleteBill(
  db: Db,
  customerId: string,
  invoiceId: string,
): Promise<DeleteBillResult> {
  return withTenant(db, customerId, async (tx: TenantDb) => {
    const owned = await tx
      .select({ id: schema.invoices.id, status: schema.invoices.status })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.customerId, customerId)))
      .limit(1);
    if (!owned[0]) return { deleted: false, refused: "not_found", storageKeys: [] };

    /* A negotiation in flight means a call has been placed with a provider on
       this person's behalf, citing figures from this bill. Deleting it underneath
       that would leave the call unable to say where its numbers came from, and
       the walk-away ceiling it is holding to lives in the decode. Refusing and
       saying so is better than a silent half-deletion. */
    const live = await tx
      .select({ id: schema.missions.id })
      .from(schema.missions)
      .where(
        and(
          eq(schema.missions.customerId, customerId),
          eq(schema.missions.invoiceId, invoiceId),
          isNull(schema.missions.closedAt),
        ),
      )
      .limit(1);
    if (live[0]) return { deleted: false, refused: "negotiating", storageKeys: [] };

    await tx.insert(schema.deletionRequests).values({ customerId, scope: "invoice", invoiceId });

    const media = await tx
      .select({ storageKey: schema.mediaObjects.storageKey })
      .from(schema.mediaObjects)
      .where(eq(schema.mediaObjects.invoiceId, invoiceId));
    const storageKeys = media.map((m) => m.storageKey).filter((k): k is string => Boolean(k));

    /* Children first. decodes and extractions carry the encrypted content, so
       they go before anything that could fail leaves them orphaned. */
    await tx.delete(schema.decodes).where(eq(schema.decodes.invoiceId, invoiceId));
    await tx.delete(schema.extractions).where(eq(schema.extractions.invoiceId, invoiceId));
    await tx.delete(schema.mediaObjects).where(eq(schema.mediaObjects.invoiceId, invoiceId));

    /* Links are revoked rather than deleted. A revoked row is what lets an old
       link answer "this was deleted" instead of "no such bill", and the hash it
       holds cannot be turned back into a token. */
    await tx
      .update(schema.summaryTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.summaryTokens.invoiceId, invoiceId));

    await tx
      .update(schema.invoices)
      .set({
        status: "deleted",
        providerName: null,
        category: null,
        country: null,
        currency: null,
        billingPeriodStart: null,
        billingPeriodEnd: null,
        issueDate: null,
        dueDate: null,
        totalAmountMinor: null,
        pastDueAmountMinor: null,
        promoEndDate: null,
        contractEndDate: null,
        summaryTokenId: null,
        errorCode: null,
        /* The fingerprints go too. Keeping them would let a re-upload of the
           same bill be answered with "you already have this" and a link to
           something that no longer exists. */
        pagesHash: null,
        billFingerprint: null,
      })
      .where(eq(schema.invoices.id, invoiceId));

    await tx
      .update(schema.deletionRequests)
      .set({ completedAt: new Date() })
      .where(
        and(
          eq(schema.deletionRequests.customerId, customerId),
          eq(schema.deletionRequests.invoiceId, invoiceId),
        ),
      );

    return { deleted: true, storageKeys };
  });
}
