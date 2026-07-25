import { NextRequest, NextResponse } from "next/server";
import { and, isNull, lt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { mediaStore } from "../../../../server/media-store.js";

export const runtime = "nodejs";
export const maxDuration = 300;

const RETENTION_DAYS = Number(process.env.MEDIA_RETENTION_DAYS ?? 1);

/**
 * Vercel Cron: backstop for the no-retention policy. Successful runs delete
 * their media immediately (purgeInvoiceMedia); this sweeps the stragglers —
 * failed or abandoned invoices — after a short grace window that keeps
 * QStash retries working. Extracted data and decodes stay (encrypted);
 * the raw bill images/PDFs never outlive the day.
 * Configured in vercel.json; protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
  const stale = await db()
    .select()
    .from(schema.mediaObjects)
    .where(and(lt(schema.mediaObjects.createdAt, cutoff), isNull(schema.mediaObjects.deletedAt)))
    .limit(500);

  let purged = 0;
  for (const m of stale) {
    if (m.storageKey) await mediaStore().delete(m.storageKey).catch(() => {});
    await db()
      .update(schema.mediaObjects)
      .set({ deletedAt: new Date(), storageKey: "" })
      .where(eq(schema.mediaObjects.id, m.id));
    purged++;
  }

  // "Private for a week" means gone after a week: once the summary token has
  // expired, delete the encrypted decode + extraction rows too — UNLESS the
  // customer opted in to retention (month-to-month comparison). What always
  // remains is the invoice shell (status/dates) and the anonymous bill_stats.
  let expiredPurged = 0;
  try {
    const { or } = await import("drizzle-orm");
    const expired = await db()
      .selectDistinct({ invoiceId: schema.decodes.invoiceId })
      .from(schema.decodes)
      .innerJoin(schema.summaryTokens, eq(schema.summaryTokens.invoiceId, schema.decodes.invoiceId))
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.decodes.invoiceId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId))
      .where(
        and(
          lt(schema.summaryTokens.expiresAt, new Date()),
          or(isNull(schema.invoices.customerId), isNull(schema.customers.retentionConsentAt)),
        ),
      )
      .limit(500);
    for (const row of expired) {
      await db().delete(schema.decodes).where(eq(schema.decodes.invoiceId, row.invoiceId));
      await db().delete(schema.extractions).where(eq(schema.extractions.invoiceId, row.invoiceId));
      expiredPurged++;
    }
  } catch (err) {
    console.warn("[purge] expiry pass skipped (migration 0003 applied?):", err instanceof Error ? err.message.slice(0, 120) : "");
  }

  return NextResponse.json({ ok: true, purged, expiredPurged, retentionDays: RETENTION_DAYS });
}
