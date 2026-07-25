import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, or, isNotNull } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { reminderDue, reminderDate } from "@bills/pipeline";
import { resolveLocale, type SupportedLocale } from "@bills/shared";
import { channel } from "../../../../server/wiring.js";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron (daily): renegotiation-timing nudges. Leverage peaks when a
 * promo/contract ends, so when a delivered bill's end date falls within the
 * next 10 days, WhatsApp customers get the promo_expiry template (web-only
 * customers have no channel to reach them — skipped, not marked, so they'd
 * still be caught if they later connect on WhatsApp within the window).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const database = db();
  let candidates;
  try {
    candidates = await database
      .select()
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.status, "delivered"),
          isNull(schema.invoices.reminderSentAt),
          or(isNotNull(schema.invoices.promoEndDate), isNotNull(schema.invoices.contractEndDate)),
        ),
      )
      .limit(500);
  } catch {
    return NextResponse.json({ ok: false, needsMigration: "packages/db/migrations/0001_reminder_history.sql" }, { status: 503 });
  }

  const now = new Date();
  let sent = 0;
  let skippedNoChannel = 0;
  for (const invoice of candidates) {
    if (!reminderDue(invoice, now)) continue;
    if (!invoice.customerId) continue;

    const [conversation] = await database
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.customerId, invoice.customerId), eq(schema.conversations.kind, "customer")))
      .limit(1);
    if (!conversation) {
      skippedNoChannel++;
      continue;
    }

    const [customer] = await database
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, invoice.customerId))
      .limit(1);
    const locale = resolveLocale(customer?.locale ?? null) as SupportedLocale;

    try {
      await channel().sendTemplate(conversation.peerWaId, "promo_expiry", locale, [
        invoice.providerName ?? "…",
        reminderDate(invoice) ?? "…",
      ]);
      await database
        .update(schema.invoices)
        .set({ reminderSentAt: new Date() })
        .where(eq(schema.invoices.id, invoice.id));
      sent++;
    } catch (err) {
      console.error(`[promo-reminders] send failed for invoice ${invoice.id}:`, err instanceof Error ? err.message.slice(0, 120) : "");
    }
  }

  return NextResponse.json({ ok: true, considered: candidates.length, sent, skippedNoChannel });
}
