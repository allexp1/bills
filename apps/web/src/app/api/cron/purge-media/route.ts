import { NextRequest, NextResponse } from "next/server";
import { and, isNull, lt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { mediaStore } from "../../../../server/media-store.js";

export const runtime = "nodejs";
export const maxDuration = 300;

const RETENTION_DAYS = Number(process.env.MEDIA_RETENTION_DAYS ?? 90);

/**
 * Vercel Cron: purge bill media older than the retention window. Extracted
 * data and decodes stay (they're what the customer keeps using); the raw
 * bill images/PDFs are the most sensitive artifact and the first to go.
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
