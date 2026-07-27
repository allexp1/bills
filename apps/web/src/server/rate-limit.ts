import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@bills/db";

/**
 * Per-customer abuse limits, DB-backed (no Redis dependency):
 *  - max bills per rolling 24h (each bill = 2 expensive Opus calls)
 *  - max pages per bill (image tokens dominate cost)
 */
export const MAX_BILLS_PER_DAY = Number(process.env.MAX_BILLS_PER_DAY ?? 10);
export const MAX_PAGES_PER_BILL = Number(process.env.MAX_PAGES_PER_BILL ?? 10);
/**
 * A failed analysis is our problem, not the customer's — it must not burn
 * their daily allowance. Attempts are still bounded (a failure costs us a
 * vision call), just at a looser ceiling.
 */
const ATTEMPT_MULTIPLIER = 3;

export async function billQuotaExceeded(customerId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const rows = await db()
    .select({ status: schema.invoices.status })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.customerId, customerId), gte(schema.invoices.createdAt, since)));
  const successful = rows.filter((r) => r.status !== "failed").length;
  return successful >= MAX_BILLS_PER_DAY || rows.length >= MAX_BILLS_PER_DAY * ATTEMPT_MULTIPLIER;
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
