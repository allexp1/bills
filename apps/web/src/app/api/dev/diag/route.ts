import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { gte, sql } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { MAX_BILLS_PER_DAY, billQuotaUsage } from "../../../../server/rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Deployment diagnostics (no secrets returned — presence booleans only).
 * GET /api/dev/diag?secret=<DEV_TRY_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.DEV_TRY_SECRET;
  if (!secret) return new NextResponse("disabled", { status: 404 });
  const provided = req.nextUrl.searchParams.get("secret") ?? "";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  if (!timingSafeEqual(a, b)) return new NextResponse("wrong secret", { status: 401 });

  const envPresence = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    ENVELOPE_KEK_BASE64: Boolean(process.env.ENVELOPE_KEK_BASE64),
    WA_HASH_PEPPER: Boolean(process.env.WA_HASH_PEPPER),
    SUMMARY_JWT_SECRET: Boolean(process.env.SUMMARY_JWT_SECRET),
    BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  };

  let dbConnect: string = "not_attempted";
  let tables: string[] = [];
  if (envPresence.DATABASE_URL || envPresence.POSTGRES_URL) {
    try {
      const rows = await db().execute(
        sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      );
      dbConnect = "ok";
      tables = (rows as unknown as Array<{ table_name: string }>).map((r) => r.table_name);
    } catch (err) {
      dbConnect = `error: ${sanitize(err)}`;
    }
  } else {
    dbConnect = "no connection string configured";
  }

  // Rolling-24h bill tally per customer — the exact numbers behind a "you've
  // reached today's limit" message. Customer ids are opaque ULIDs; no phone
  // number, name or bill content is returned.
  let quota: unknown = "not_attempted";
  if (dbConnect === "ok") {
    try {
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const customers = await db()
        .selectDistinct({ customerId: schema.invoices.customerId })
        .from(schema.invoices)
        .where(gte(schema.invoices.createdAt, since));
      quota = {
        windowStart: since.toISOString(),
        maxBillsPerDay: MAX_BILLS_PER_DAY,
        customers: await Promise.all(
          customers.map(async (c) => ({ customerId: c.customerId, ...(await billQuotaUsage(c.customerId)) })),
        ),
      };
    } catch (err) {
      quota = `error: ${sanitize(err)}`;
    }
  }

  return NextResponse.json({
    envPresence,
    dbConnect,
    tableCount: tables.length,
    tables,
    expectedTables: 14,
    quota,
    hint:
      dbConnect !== "ok"
        ? "Add the Supabase integration to this Vercel project (injects POSTGRES_URL) and redeploy."
        : tables.length === 0
          ? "Schema missing — run packages/db/src/migrations/0000_big_blackheart.sql in the Supabase SQL editor."
          : envPresence.ANTHROPIC_API_KEY
            ? "All prerequisites look good."
            : "Set ANTHROPIC_API_KEY and redeploy.",
  });
}

function sanitize(err: unknown): string {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  // Never echo credentials that may appear in connection-string errors.
  return msg.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]").slice(0, 300);
}
