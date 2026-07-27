import { NextRequest, NextResponse } from "next/server";
import { and, inArray, isNull, lt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { IN_FLIGHT_INVOICE_STATUSES } from "@bills/shared";
import { mediaStore } from "../../../../server/media-store.js";
import { STALE_IN_FLIGHT_MINUTES } from "../../../../server/rate-limit.js";

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

  // Bury runs that died without ever reaching a terminal status — a function
  // timeout or crash leaves an invoice stuck in `decoding` forever. The quota
  // already ignores stale in-flight rows at read time, so this is about the
  // data telling the truth: a run that will never finish is a failed run.
  let buried = 0;
  try {
    const deadline = new Date(Date.now() - STALE_IN_FLIGHT_MINUTES * 60_000);
    const dead = await db()
      .update(schema.invoices)
      .set({ status: "failed", errorCode: "abandoned" })
      .where(
        and(
          inArray(schema.invoices.status, [...IN_FLIGHT_INVOICE_STATUSES]),
          lt(schema.invoices.createdAt, deadline),
        ),
      )
      .returning({ id: schema.invoices.id });
    buried = dead.length;
  } catch (err) {
    console.warn("[cron] burying abandoned invoices failed:", err instanceof Error ? err.message.slice(0, 160) : "");
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

  return NextResponse.json({ ok: true, purged, buried, expiredPurged, retentionDays: RETENTION_DAYS });
}
