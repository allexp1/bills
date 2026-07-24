import type { Button } from "@bills/channel";
import { formatMoney, type SupportedLocale } from "@bills/shared";
import type { GuardedDecode, GuardedSaving } from "./guardrails.js";

/**
 * Render the guarded decode into WhatsApp-sized messages. All strings are
 * either model output (already in the customer's language, already swept by
 * guardrails) or come from the locale tables below.
 */

const STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    fullBreakdown: "Full breakdown",
    buttonsBody: "What next?",
    explainMore: "Explain more",
    showSavings: "Show savings",
    actOnThis: "Act on this",
    savingsIntro: "Here's where your money can come back:",
    perMonth: "per month",
    perYear: "per year",
    oneOff: "one-off",
    noNumber: "amount depends on your usage",
    actWaitlist: "Automatic negotiation is coming soon — for now, here's exactly what to do:",
    noMoreDetail: "That's everything on this bill — send me the next one whenever you like!",
    unreadable: "I couldn't read that bill clearly 😕 — could you try a sharper photo, or send the PDF version?",
    thatsAll: "That's all",
    gotPage: "Got page {n} ✅ — send more pages, or tap when done.",
    analyzing: "Looks like that's everything — analyzing your bill now 🔎 (about a minute)",
  },
  es: {
    fullBreakdown: "Desglose completo",
    buttonsBody: "¿Qué hacemos?",
    explainMore: "Explícame más",
    showSavings: "Ver ahorros",
    actOnThis: "Actuar",
    savingsIntro: "Aquí es donde puedes recuperar dinero:",
    perMonth: "al mes",
    perYear: "al año",
    oneOff: "una vez",
    noNumber: "el importe depende de tu consumo",
    actWaitlist: "La negociación automática llega pronto — de momento, esto es exactamente lo que hay que hacer:",
    noMoreDetail: "Eso es todo en esta factura — ¡envíame la siguiente cuando quieras!",
    unreadable: "No pude leer bien la factura 😕 — ¿puedes probar con una foto más nítida o enviar el PDF?",
    thatsAll: "Es todo",
    gotPage: "Página {n} recibida ✅ — envía más páginas o pulsa al terminar.",
    analyzing: "Parece que está todo — analizando tu factura 🔎 (un minuto aprox.)",
  },
  fr: {
    fullBreakdown: "Détail complet",
    buttonsBody: "On fait quoi ?",
    explainMore: "En savoir plus",
    showSavings: "Voir les économies",
    actOnThis: "Agir",
    savingsIntro: "Voici où récupérer de l'argent :",
    perMonth: "par mois",
    perYear: "par an",
    oneOff: "une fois",
    noNumber: "le montant dépend de votre consommation",
    actWaitlist: "La négociation automatique arrive bientôt — en attendant, voici exactement quoi faire :",
    noMoreDetail: "C'est tout pour cette facture — envoyez-moi la prochaine quand vous voulez !",
    unreadable: "Je n'ai pas pu lire la facture 😕 — une photo plus nette ou le PDF ?",
    thatsAll: "C'est tout",
    gotPage: "Page {n} reçue ✅ — envoyez d'autres pages ou appuyez quand c'est fini.",
    analyzing: "Ça semble complet — analyse de votre facture en cours 🔎 (environ une minute)",
  },
  pt: {
    fullBreakdown: "Detalhe completo",
    buttonsBody: "O que fazemos?",
    explainMore: "Explicar mais",
    showSavings: "Ver poupanças",
    actOnThis: "Agir",
    savingsIntro: "Aqui é onde pode recuperar dinheiro:",
    perMonth: "por mês",
    perYear: "por ano",
    oneOff: "uma vez",
    noNumber: "o valor depende do seu consumo",
    actWaitlist: "A negociação automática chega em breve — por agora, é isto que deve fazer:",
    noMoreDetail: "É tudo nesta fatura — envie a próxima quando quiser!",
    unreadable: "Não consegui ler bem a fatura 😕 — pode tentar uma foto mais nítida ou enviar o PDF?",
    thatsAll: "É tudo",
    gotPage: "Página {n} recebida ✅ — envie mais páginas ou toque quando terminar.",
    analyzing: "Parece estar tudo — a analisar a sua fatura 🔎 (cerca de um minuto)",
  },
  de: {
    fullBreakdown: "Vollständige Aufschlüsselung",
    buttonsBody: "Wie weiter?",
    explainMore: "Mehr erklären",
    showSavings: "Sparpotenzial",
    actOnThis: "Handeln",
    savingsIntro: "Hier können Sie Geld zurückholen:",
    perMonth: "pro Monat",
    perYear: "pro Jahr",
    oneOff: "einmalig",
    noNumber: "Betrag hängt vom Verbrauch ab",
    actWaitlist: "Automatische Verhandlung kommt bald — bis dahin ist genau das zu tun:",
    noMoreDetail: "Das ist alles auf dieser Rechnung — schicken Sie mir jederzeit die nächste!",
    unreadable: "Ich konnte die Rechnung nicht gut lesen 😕 — ein schärferes Foto oder das PDF?",
    thatsAll: "Das ist alles",
    gotPage: "Seite {n} erhalten ✅ — weitere Seiten senden oder tippen, wenn fertig.",
    analyzing: "Sieht vollständig aus — Rechnung wird analysiert 🔎 (ca. eine Minute)",
  },
};

export function t(locale: SupportedLocale, key: string, vars: Record<string, string | number> = {}): string {
  let s = STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function periodLabel(locale: SupportedLocale, period: GuardedSaving["period"]): string {
  return t(locale, period === "monthly" ? "perMonth" : period === "annual" ? "perYear" : "oneOff");
}

/** Message 1: the tidy summary + signed link. Kept well under WhatsApp's 4096-char cap. */
export function buildSummaryMessage(guarded: GuardedDecode, locale: SupportedLocale, summaryUrl: string): string {
  const topGotcha = [...guarded.gotchas].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  )[0];
  const parts = [
    guarded.headline,
    topGotcha ? `⚠️ ${topGotcha.explanation}` : null,
    `🔗 ${t(locale, "fullBreakdown")}: ${summaryUrl}`,
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, 1000);
}

function severityRank(s: "info" | "warn" | "alert"): number {
  return s === "alert" ? 2 : s === "warn" ? 1 : 0;
}

/** Message 2: the three follow-up buttons (WhatsApp max). */
export function buildFollowUpButtons(invoiceId: string, locale: SupportedLocale): { body: string; buttons: Button[] } {
  return {
    body: t(locale, "buttonsBody"),
    buttons: [
      { id: `explain:${invoiceId}`, title: t(locale, "explainMore") },
      { id: `savings:${invoiceId}`, title: t(locale, "showSavings") },
      { id: `act:${invoiceId}`, title: t(locale, "actOnThis") },
    ],
  };
}

/** "Show savings" flow: one message per item, verified numbers only. */
export function buildSavingsMessages(guarded: GuardedDecode, locale: SupportedLocale): string[] {
  if (guarded.savings.length === 0) return [];
  const messages = [t(locale, "savingsIntro")];
  for (const saving of guarded.savings) {
    const amount =
      saving.amountMinor !== null
        ? `💰 ~${formatMoney({ amountMinor: saving.amountMinor, currency: saving.currency }, locale)} ${periodLabel(locale, saving.period)}`
        : `💡 ${t(locale, "noNumber")}`;
    messages.push([amount, saving.explanation, `➡️ ${saving.nextStep}`].join("\n"));
  }
  return messages;
}

/** "Explain more" drains one queued section per tap. */
export function nextExplainMore(guarded: GuardedDecode, alreadySent: number, locale: SupportedLocale): string {
  return guarded.explainMoreQueue[alreadySent] ?? t(locale, "noMoreDetail");
}
