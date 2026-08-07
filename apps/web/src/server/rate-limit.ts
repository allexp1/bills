import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { isInFlightStatus } from "@bills/shared";

/**
 * Per-customer abuse limits, DB-backed (no Redis dependency):
 *  - max bills per rolling 24h (each bill = 2 expensive Opus calls)
 *  - max pages per bill (image tokens dominate cost)
 */
/**
 * Raised from 10 to 50 while the product is in active development — the old
 * ceiling was being hit by our own testing. Worth revisiting before real
 * traffic: 50 bills a day is ~100 Opus calls per customer.
 */
export const MAX_BILLS_PER_DAY = Number(process.env.MAX_BILLS_PER_DAY ?? 50);
/**
 * Raised from 10 to 30 when insurance CONTRACTS became a supported document:
 * a bill fits in 10 pages, a policy booklet does not, and truncating one
 * silently drops the exclusions section — the part the customer most needs
 * read. The cost ceiling this guards is still bounded by MAX_BILLS_PER_DAY;
 * the worst-case tokens per customer-day tripled, knowingly.
 */
export const MAX_PAGES_PER_BILL = Number(process.env.MAX_PAGES_PER_BILL ?? 30);
/**
 * A failed analysis is our problem, not the customer's — it must not burn
 * their daily allowance. Attempts are still bounded (a failure costs us a
 * vision call), just at a looser ceiling.
 */
const ATTEMPT_MULTIPLIER = 3;

/**
 * How long an in-flight invoice may sit before it is presumed dead.
 *
 * A whole analysis runs inside one function invocation capped at
 * `maxDuration = 800s`, so nothing legitimately stays in-flight beyond ~13
 * minutes. 30 gives generous headroom for queue hand-offs and retries while
 * still reclaiming a slot the same hour rather than never.
 */
export const STALE_IN_FLIGHT_MINUTES = Number(process.env.STALE_IN_FLIGHT_MINUTES ?? 30);

export interface QuotaUsage {
  /** Bills that counted against the allowance. */
  counted: number;
  /**
   * In-flight rows old enough to be presumed dead. They are excluded from
   * `counted` — a run that crashed is our failure, not the customer's.
   */
  stale: number;
  /** Every intake attempt in the window, failures included. */
  attempts: number;
  countedLimit: number;
  attemptLimit: number;
  exceeded: boolean;
  byStatus: Record<string, number>;
  /**
   * When the oldest row in the window ages out — the moment one slot frees
   * up. The limit is a rolling 24h window, not a calendar day.
   */
  oldestAt: string | null;
  nextSlotAt: string | null;
}

/**
 * Decide a customer's quota state from their recent invoice rows. Pure so the
 * rule — not just the query — can be tested.
 *
 * Two kinds of row do NOT count against the allowance:
 *  - `failed`: a clean failure is our problem, not the customer's
 *  - an in-flight row older than STALE_IN_FLIGHT_MINUTES: a run that died
 *    without ever reaching a terminal status. Before this, such a row held a
 *    slot permanently, so a handful of timeouts could lock someone out for
 *    good while they had received nothing.
 */
export function summarizeQuota(
  rows: Array<{ status: string; createdAt: Date }>,
  now: Date = new Date(),
): QuotaUsage {
  const staleBefore = now.getTime() - STALE_IN_FLIGHT_MINUTES * 60_000;
  const byStatus: Record<string, number> = {};
  let counted = 0;
  let stale = 0;

  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.status === "failed") continue;
    if (isInFlightStatus(r.status) && r.createdAt.getTime() < staleBefore) {
      stale++;
      continue;
    }
    counted++;
  }

  const attemptLimit = MAX_BILLS_PER_DAY * ATTEMPT_MULTIPLIER;
  const oldest = rows.reduce<Date | null>(
    (acc, r) => (acc === null || r.createdAt < acc ? r.createdAt : acc),
    null,
  );

  return {
    counted,
    stale,
    attempts: rows.length,
    countedLimit: MAX_BILLS_PER_DAY,
    attemptLimit,
    exceeded: counted >= MAX_BILLS_PER_DAY || rows.length >= attemptLimit,
    byStatus,
    oldestAt: oldest?.toISOString() ?? null,
    nextSlotAt: oldest ? new Date(oldest.getTime() + 24 * 3600 * 1000).toISOString() : null,
  };
}

/** The rolling-24h tally behind `billQuotaExceeded`, for diagnostics. */
export async function billQuotaUsage(customerId: string): Promise<QuotaUsage> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const rows = await db()
    .select({ status: schema.invoices.status, createdAt: schema.invoices.createdAt })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.customerId, customerId), gte(schema.invoices.createdAt, since)));
  return summarizeQuota(rows);
}

export async function billQuotaExceeded(customerId: string): Promise<boolean> {
  return (await billQuotaUsage(customerId)).exceeded;
}

export const QUOTA_COPY: Record<string, string> = {
  en: "You've reached today's limit of analyzed bills — send the next one tomorrow. 🙏",
  es: "Has llegado al límite de facturas analizadas por hoy — envía la siguiente mañana. 🙏",
  fr: "Vous avez atteint la limite de factures analysées aujourd'hui — envoyez la suivante demain. 🙏",
  pt: "Atingiu o limite de faturas analisadas por hoje — envie a próxima amanhã. 🙏",
  de: "Sie haben das heutige Limit analysierter Rechnungen erreicht — senden Sie die nächste morgen. 🙏",
  he: "הגעתם למכסת החשבונות המנותחים להיום — שלחו את הבא מחר. 🙏",
  ru: "Вы исчерпали дневной лимит анализов — пришлите следующий счёт завтра. 🙏",
  zh: "您已达到今天的账单分析上限 —— 明天再发下一张吧。🙏",
};

export const PAGE_LIMIT_COPY: Record<string, string> = {
  en: `That's the maximum of ${MAX_PAGES_PER_BILL} pages per bill — analyzing what you've sent.`,
  es: `Ese es el máximo de ${MAX_PAGES_PER_BILL} páginas por factura — analizo lo que has enviado.`,
  fr: `C'est le maximum de ${MAX_PAGES_PER_BILL} pages par facture — j'analyse ce que vous avez envoyé.`,
  pt: `É o máximo de ${MAX_PAGES_PER_BILL} páginas por fatura — vou analisar o que enviou.`,
  de: `Das ist das Maximum von ${MAX_PAGES_PER_BILL} Seiten pro Rechnung — ich analysiere das Gesendete.`,
  he: `זה המקסימום של ${MAX_PAGES_PER_BILL} עמודים לחשבון — מנתח את מה ששלחתם.`,
  ru: `Это максимум — ${MAX_PAGES_PER_BILL} страниц на счёт. Анализирую то, что вы прислали.`,
  zh: `每张账单最多 ${MAX_PAGES_PER_BILL} 页 —— 正在分析您已发送的内容。`,
};
