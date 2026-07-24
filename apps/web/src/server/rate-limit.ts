import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@bills/db";

/**
 * Per-customer abuse limits, DB-backed (no Redis dependency):
 *  - max bills per rolling 24h (each bill = 2 expensive Opus calls)
 *  - max pages per bill (image tokens dominate cost)
 */
export const MAX_BILLS_PER_DAY = Number(process.env.MAX_BILLS_PER_DAY ?? 10);
export const MAX_PAGES_PER_BILL = Number(process.env.MAX_PAGES_PER_BILL ?? 10);

export async function billQuotaExceeded(customerId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const rows = await db()
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.customerId, customerId), gte(schema.invoices.createdAt, since)));
  return rows.length >= MAX_BILLS_PER_DAY;
}

export const QUOTA_COPY: Record<string, string> = {
  en: "You've reached today's limit of analyzed bills — send the next one tomorrow. 🙏",
  es: "Has llegado al límite de facturas analizadas por hoy — envía la siguiente mañana. 🙏",
  fr: "Vous avez atteint la limite de factures analysées aujourd'hui — envoyez la suivante demain. 🙏",
  pt: "Atingiu o limite de faturas analisadas por hoje — envie a próxima amanhã. 🙏",
  de: "Sie haben das heutige Limit analysierter Rechnungen erreicht — senden Sie die nächste morgen. 🙏",
};

export const PAGE_LIMIT_COPY: Record<string, string> = {
  en: `That's the maximum of ${MAX_PAGES_PER_BILL} pages per bill — analyzing what you've sent.`,
  es: `Ese es el máximo de ${MAX_PAGES_PER_BILL} páginas por factura — analizo lo que has enviado.`,
  fr: `C'est le maximum de ${MAX_PAGES_PER_BILL} pages par facture — j'analyse ce que vous avez envoyé.`,
  pt: `É o máximo de ${MAX_PAGES_PER_BILL} páginas por fatura — vou analisar o que enviou.`,
  de: `Das ist das Maximum von ${MAX_PAGES_PER_BILL} Seiten pro Rechnung — ich analysiere das Gesendete.`,
};
