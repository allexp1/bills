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
  return NextResponse.json({ ok: true, purged, retentionDays: RETENTION_DAYS });
}
