import { eq } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { buildProviderChatCta, formatDelta, t as tPipeline, verifySummaryToken } from "@bills/pipeline";
import { parseGb } from "@bills/category-packs";
import { formatMoney, parseAmount, resolveLocale, type SupportedLocale } from "@bills/shared";
import { loadGuardedDecode } from "../../../server/decode-store.js";
import { env } from "../../../server/env.js";
import { ThemeToggle } from "./theme-toggle.js";
import { CopyButton } from "./copy-button.js";
import {
  IconAlertCircle,
  IconChart,
  IconListCheck,
  IconMegaphone,
  IconPhoneCall,
  IconReceipt,
  IconTrendDown,
} from "../../icons.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEB_STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: { due: "Due", pastDue: "past due", lineItems: "What you're paying for", gotchas: "Worth knowing", savings: "Where you can save", printed: "Printed on your bill", perMonth: "/month", perYear: "/year", oneOff: "one-off", varies: "amount depends on usage", back: "Continue on WhatsApp", expiredTitle: "This link has expired", expiredBody: "Message us on WhatsApp again and we'll send a fresh one.", period: "Billing period", privacy: "This page is private to you. Nothing here is indexed or shared.", glance: "At a glance", saveUpTo: "Save up to {amount} a month", meterLow: "You pay for {allowance}, you use about {used}", meterOk: "You're using {pct}% of your allowance", meterHigh: "You're close to your limit — {pct}% used", printedAs: "on the bill: {v}", stDataUsed: "Data used", stOf: "of {n}", stMinutes: "Minutes used", stFee: "Plan fee", stSpeed: "Speed", stConsumption: "Consumption", meterCaption: "You're using {pct}% of your plan's data allowance", waSupportTitle: "{provider} has official WhatsApp support", waSupportBody: "Tap below to open a chat with them — your message asking for a better deal is already typed, you just press send.", waSupportCta: "Message {provider} on WhatsApp", smsSupportTitle: "{provider} offers support by text message", smsSupportBody: "Tap below on your phone — your message is pre-typed, you just press send.", smsSupportCta: "Text {provider} support", chatSupportTitle: "{provider} has online chat support", chatSupportBody: "Opens the provider's official support chat page — ask about better plans or discounts.", chatSupportCta: "Open {provider} support chat", pitchTitle: "Ask for a better deal", pitchBody: "We wrote the message for you — grounded in your bill and current market offers. Copy it or send it straight away.", pitchCopy: "Copy message", pitchCopied: "Copied ✓", pitchCallTitle: "Prefer to call? Read this script", pitchWebChatHint: "Copy the message, then open their official chat:" },
  es: { due: "Vence", pastDue: "vencido", lineItems: "Qué estás pagando", gotchas: "Conviene saber", savings: "Dónde puedes ahorrar", printed: "Impreso en tu factura", perMonth: "/mes", perYear: "/año", oneOff: "una vez", varies: "el importe depende del consumo", back: "Seguir en WhatsApp", expiredTitle: "Este enlace ha caducado", expiredBody: "Escríbenos de nuevo por WhatsApp y te enviamos uno nuevo.", period: "Periodo de facturación", privacy: "Esta página es privada. Nada aquí se indexa ni se comparte.", glance: "De un vistazo", saveUpTo: "Ahorra hasta {amount} al mes", meterLow: "Pagas por {allowance} y usas unos {used}", meterOk: "Estás usando el {pct}% de tu bono", meterHigh: "Casi al límite — {pct}% consumido", printedAs: "en la factura: {v}", stDataUsed: "Datos usados", stOf: "de {n}", stMinutes: "Minutos usados", stFee: "Cuota del plan", stSpeed: "Velocidad", stConsumption: "Consumo", meterCaption: "Estás usando el {pct}% de los datos de tu plan", waSupportTitle: "{provider} tiene atención oficial por WhatsApp", waSupportBody: "Toca abajo para abrir el chat — tu mensaje pidiendo una oferta mejor ya está escrito, solo pulsa enviar.", waSupportCta: "Escribir a {provider} por WhatsApp", smsSupportTitle: "{provider} atiende por SMS", smsSupportBody: "Toca abajo desde tu teléfono — tu mensaje ya está escrito, solo pulsa enviar.", smsSupportCta: "Enviar SMS a {provider}", chatSupportTitle: "{provider} tiene chat de atención en línea", chatSupportBody: "Abre la página oficial de chat del proveedor — pregunta por planes o descuentos mejores.", chatSupportCta: "Abrir el chat de {provider}", pitchTitle: "Pide una oferta mejor", pitchBody: "Hemos escrito el mensaje por ti — basado en tu factura y en ofertas actuales del mercado. Cópialo o envíalo directamente.", pitchCopy: "Copiar mensaje", pitchCopied: "Copiado ✓", pitchCallTitle: "¿Prefieres llamar? Lee este guion", pitchWebChatHint: "Copia el mensaje y abre su chat oficial:" },
  fr: { due: "Échéance", pastDue: "en retard", lineItems: "Ce que vous payez", gotchas: "Bon à savoir", savings: "Où économiser", printed: "Imprimé sur votre facture", perMonth: "/mois", perYear: "/an", oneOff: "une fois", varies: "montant selon la consommation", back: "Continuer sur WhatsApp", expiredTitle: "Ce lien a expiré", expiredBody: "Écrivez-nous à nouveau sur WhatsApp et nous vous en enverrons un autre.", period: "Période de facturation", privacy: "Cette page est privée. Rien n'est indexé ni partagé.", glance: "En un coup d'œil", saveUpTo: "Économisez jusqu'à {amount} par mois", meterLow: "Vous payez pour {allowance} et utilisez environ {used}", meterOk: "Vous utilisez {pct}% de votre forfait", meterHigh: "Proche de la limite — {pct}% utilisé", printedAs: "sur la facture : {v}", stDataUsed: "Données utilisées", stOf: "sur {n}", stMinutes: "Minutes utilisées", stFee: "Prix du forfait", stSpeed: "Débit", stConsumption: "Consommation", meterCaption: "Vous utilisez {pct}% des données de votre forfait", waSupportTitle: "{provider} propose un support officiel sur WhatsApp", waSupportBody: "Appuyez ci-dessous pour ouvrir la discussion — votre message demandant une meilleure offre est déjà rédigé, il ne reste qu'à envoyer.", waSupportCta: "Écrire à {provider} sur WhatsApp", smsSupportTitle: "{provider} répond par SMS", smsSupportBody: "Appuyez ci-dessous depuis votre téléphone — votre message est déjà rédigé, il ne reste qu'à envoyer.", smsSupportCta: "Envoyer un SMS à {provider}", chatSupportTitle: "{provider} propose un chat d'assistance en ligne", chatSupportBody: "Ouvre la page de chat officielle du fournisseur — demandez un meilleur forfait ou une remise.", chatSupportCta: "Ouvrir le chat {provider}", pitchTitle: "Demandez une meilleure offre", pitchBody: "Nous avons rédigé le message pour vous — fondé sur votre facture et les offres actuelles du marché. Copiez-le ou envoyez-le directement.", pitchCopy: "Copier le message", pitchCopied: "Copié ✓", pitchCallTitle: "Vous préférez appeler ? Lisez ce script", pitchWebChatHint: "Copiez le message, puis ouvrez leur chat officiel :" },
  pt: { due: "Vencimento", pastDue: "em atraso", lineItems: "O que está a pagar", gotchas: "Vale a pena saber", savings: "Onde pode poupar", printed: "Impresso na sua fatura", perMonth: "/mês", perYear: "/ano", oneOff: "uma vez", varies: "o valor depende do consumo", back: "Continuar no WhatsApp", expiredTitle: "Este link expirou", expiredBody: "Escreva-nos novamente no WhatsApp e enviamos um novo.", period: "Período de faturação", privacy: "Esta página é privada. Nada aqui é indexado ou partilhado.", glance: "Num relance", saveUpTo: "Poupe até {amount} por mês", meterLow: "Paga por {allowance} e usa cerca de {used}", meterOk: "Está a usar {pct}% do seu plafond", meterHigh: "Perto do limite — {pct}% usado", printedAs: "na fatura: {v}", stDataUsed: "Dados usados", stOf: "de {n}", stMinutes: "Minutos usados", stFee: "Mensalidade do plano", stSpeed: "Velocidade", stConsumption: "Consumo", meterCaption: "Está a usar {pct}% dos dados do seu plano", waSupportTitle: "A {provider} tem apoio oficial por WhatsApp", waSupportBody: "Toque abaixo para abrir a conversa — a sua mensagem a pedir uma oferta melhor já está escrita, basta enviar.", waSupportCta: "Falar com a {provider} no WhatsApp", smsSupportTitle: "A {provider} atende por SMS", smsSupportBody: "Toque abaixo no seu telefone — a sua mensagem já está escrita, basta enviar.", smsSupportCta: "Enviar SMS à {provider}", chatSupportTitle: "A {provider} tem chat de apoio online", chatSupportBody: "Abre a página oficial de chat do fornecedor — pergunte por planos ou descontos melhores.", chatSupportCta: "Abrir o chat da {provider}", pitchTitle: "Peça uma oferta melhor", pitchBody: "Escrevemos a mensagem por si — com base na sua fatura e nas ofertas atuais do mercado. Copie-a ou envie-a diretamente.", pitchCopy: "Copiar mensagem", pitchCopied: "Copiado ✓", pitchCallTitle: "Prefere ligar? Leia este guião", pitchWebChatHint: "Copie a mensagem e abra o chat oficial:" },
  de: { due: "Fällig", pastDue: "überfällig", lineItems: "Wofür Sie zahlen", gotchas: "Gut zu wissen", savings: "Wo Sie sparen können", printed: "Auf Ihrer Rechnung gedruckt", perMonth: "/Monat", perYear: "/Jahr", oneOff: "einmalig", varies: "Betrag hängt vom Verbrauch ab", back: "Weiter in WhatsApp", expiredTitle: "Dieser Link ist abgelaufen", expiredBody: "Schreiben Sie uns erneut auf WhatsApp und wir senden einen neuen.", period: "Abrechnungszeitraum", privacy: "Diese Seite ist privat. Nichts wird indexiert oder geteilt.", glance: "Auf einen Blick", saveUpTo: "Sparen Sie bis zu {amount} im Monat", meterLow: "Sie zahlen für {allowance} und nutzen etwa {used}", meterOk: "Sie nutzen {pct}% Ihres Volumens", meterHigh: "Fast am Limit — {pct}% verbraucht", printedAs: "auf der Rechnung: {v}", stDataUsed: "Verbrauchte Daten", stOf: "von {n}", stMinutes: "Verbrauchte Minuten", stFee: "Tarifpreis", stSpeed: "Geschwindigkeit", stConsumption: "Verbrauch", meterCaption: "Sie nutzen {pct}% des Datenvolumens Ihres Tarifs", waSupportTitle: "{provider} hat offiziellen WhatsApp-Support", waSupportBody: "Tippen Sie unten, um den Chat zu öffnen — Ihre Nachricht mit der Frage nach einem besseren Angebot ist schon fertig, nur noch senden.", waSupportCta: "{provider} auf WhatsApp schreiben", smsSupportTitle: "{provider} bietet Support per SMS", smsSupportBody: "Tippen Sie unten auf Ihrem Telefon — Ihre Nachricht ist schon fertig, nur noch senden.", smsSupportCta: "SMS an {provider} senden", chatSupportTitle: "{provider} hat Online-Chat-Support", chatSupportBody: "Öffnet die offizielle Support-Chat-Seite des Anbieters — fragen Sie nach besseren Tarifen oder Rabatten.", chatSupportCta: "{provider}-Chat öffnen", pitchTitle: "Fordern Sie ein besseres Angebot", pitchBody: "Wir haben die Nachricht für Sie geschrieben — gestützt auf Ihre Rechnung und aktuelle Marktangebote. Kopieren oder direkt senden.", pitchCopy: "Nachricht kopieren", pitchCopied: "Kopiert ✓", pitchCallTitle: "Lieber anrufen? Lesen Sie dieses Skript", pitchWebChatHint: "Nachricht kopieren, dann den offiziellen Chat öffnen:" },
  he: { due: "לתשלום עד", pastDue: "בפיגור", lineItems: "על מה אתם משלמים", gotchas: "כדאי לדעת", savings: "איפה אפשר לחסוך", printed: "מודפס על החשבון", perMonth: "/חודש", perYear: "/שנה", oneOff: "חד־פעמי", varies: "הסכום תלוי בשימוש", back: "להמשיך בוואטסאפ", expiredTitle: "הקישור פג תוקף", expiredBody: "כתבו לנו שוב ונשלח קישור חדש.", period: "תקופת חיוב", privacy: "הדף הזה פרטי עבורך. שום דבר כאן לא נסרק ולא משותף.", glance: "במבט מהיר", saveUpTo: "אפשר לחסוך עד {amount} בחודש", meterLow: "אתם משלמים על {allowance} ומשתמשים בכ־{used}", meterOk: "אתם משתמשים ב־{pct}% מהחבילה", meterHigh: "קרוב למיצוי — {pct}% נוצלו", printedAs: "בחשבון: {v}", stDataUsed: "שימוש בנתונים", stOf: "מתוך {n}", stMinutes: "דקות שיחה", stFee: "דמי מסלול", stSpeed: "מהירות", stConsumption: "צריכה", meterCaption: "אתם משתמשים ב־{pct}% מחבילת הנתונים שלכם", waSupportTitle: "ל{provider} יש שירות רשמי בוואטסאפ", waSupportBody: "הקישו למטה לפתיחת צ'אט — ההודעה שמבקשת הצעה טובה יותר כבר כתובה, נשאר רק לשלוח.", waSupportCta: "לכתוב ל{provider} בוואטסאפ", smsSupportTitle: "{provider} נותנת שירות ב־SMS", smsSupportBody: "הקישו למטה מהטלפון — ההודעה כבר כתובה, נשאר רק לשלוח.", smsSupportCta: "לשלוח SMS ל{provider}", chatSupportTitle: "ל{provider} יש צ'אט שירות מקוון", chatSupportBody: "נפתח דף הצ'אט הרשמי של הספק — שאלו על מסלולים או הנחות.", chatSupportCta: "לפתוח את הצ'אט של {provider}", pitchTitle: "בקשו הצעה טובה יותר", pitchBody: "כתבנו את ההודעה בשבילכם — מבוססת על החשבון שלכם ועל הצעות עדכניות בשוק. העתיקו או שלחו ישירות.", pitchCopy: "העתקת ההודעה", pitchCopied: "הועתק ✓", pitchCallTitle: "מעדיפים להתקשר? קראו את התסריט", pitchWebChatHint: "העתיקו את ההודעה ואז פתחו את הצ'אט הרשמי:" },
};

function Expired({ locale }: { locale: SupportedLocale }) {
  const s = WEB_STRINGS[locale];
  return (
    <main className="page expired">
      <h1>{s.expiredTitle}</h1>
      <p>{s.expiredBody}</p>
    </main>
  );
}

export default async function SummaryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = verifySummaryToken(decodeURIComponent(token), env.summaryJwtSecret);
  if (!result.ok) return <Expired locale="en" />;

  // Revocation check (deletion revokes) + view accounting.
  const [tokenRow] = await db()
    .select()
    .from(schema.summaryTokens)
    .where(eq(schema.summaryTokens.tokenHash, result.tokenHash))
    .limit(1);
  if (!tokenRow || tokenRow.revokedAt) return <Expired locale="en" />;
  await db()
    .update(schema.summaryTokens)
    .set({ viewCount: tokenRow.viewCount + 1, lastViewedAt: new Date() })
    .where(eq(schema.summaryTokens.id, tokenRow.id));

  const loaded = await loadGuardedDecode(result.claims.inv);
  const [invoice] = await db()
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, result.claims.inv))
    .limit(1);
  if (!loaded || !invoice || invoice.status === "deleted") return <Expired locale="en" />;

  const locale = resolveLocale(loaded.localeRendered) as SupportedLocale;
  const s = WEB_STRINGS[locale];
  const { guarded, extraction } = loaded;
  const currency = extraction.common.currency ?? "EUR";
  const total =
    invoice.totalAmountMinor !== null
      ? formatMoney({ amountMinor: invoice.totalAmountMinor, currency }, locale)
      : (extraction.common.totalAmount ?? "—");
  const pitch = guarded.pitch;
  const chatCta = buildProviderChatCta(guarded, locale, pitch ? { message: pitch.chatMessage } : undefined);
  const ctaKey = chatCta?.channel === "sms" ? "sms" : chatCta?.channel === "web_chat" ? "chat" : "wa";

  // Headline value: the single largest verified monthly saving (never a sum —
  // levers can overlap), shown as "save up to X a month".
  const monthlySavings = guarded.savings
    .filter((sv) => sv.amountMinor !== null)
    .map((sv) => (sv.period === "annual" ? Math.round(sv.amountMinor! / 12) : sv.amountMinor!));
  const topSavingMinor = monthlySavings.length > 0 ? Math.max(...monthlySavings) : null;

  return (
    <main className="page" dir={locale === "he" ? "rtl" : undefined}>
      <ThemeToggle />

      <section className="card hero">
        <div className="provider" dir="auto">
          {extraction.common.providerName ?? ""}
        </div>
        <div className="total">
          <bdi>{total}</bdi>
        </div>
        <div className="chips">
          {invoice.dueDate && (
            <span className="chip-meta">
              {s.due} {invoice.dueDate}
            </span>
          )}
          {invoice.billingPeriodStart && invoice.billingPeriodEnd && (
            <span className="chip-meta">
              {invoice.billingPeriodStart} → {invoice.billingPeriodEnd}
            </span>
          )}
        </div>
        <p className="headline">{guarded.headline}</p>
        {topSavingMinor !== null && (
          <div className="save-pill">
            <IconTrendDown size={18} />
            {s.saveUpTo!.replace("{amount}", formatMoney({ amountMinor: topSavingMinor, currency }, locale))}
          </div>
        )}
      </section>

      {glance(extraction, s, locale)}

      {guarded.history?.vsPrevious && (
        <>
          <h2 className="sec"><IconChart size={15} />{tPipeline(locale, "histTitle")}</h2>
          <section className="card">
            {guarded.history.totalsTrend.length > 1 && (
              <div style={{ fontSize: "1.05rem", marginBottom: 8 }}>
                {guarded.history.totalsTrend
                  .map((p) =>
                    p.totalMinor !== null
                      ? formatMoney({ amountMinor: p.totalMinor, currency: guarded.history!.currency }, locale)
                      : "—",
                  )
                  .join(" → ")}
                {guarded.history.vsPrevious.totalDeltaMinor !== null &&
                  guarded.history.vsPrevious.totalDeltaMinor !== 0 && (
                    <b style={{ marginLeft: 8, color: guarded.history.vsPrevious.totalDeltaMinor > 0 ? "#c0392b" : "#27ae60" }}>
                      {formatDelta(guarded.history.vsPrevious.totalDeltaMinor, guarded.history.currency, locale)}
                    </b>
                  )}
              </div>
            )}
            {guarded.history.vsPrevious.newItems.length > 0 && (
              <p style={{ margin: "6px 0" }}>
                <b>{tPipeline(locale, "histNew")}:</b>{" "}
                <span dir="auto">
                {guarded.history.vsPrevious.newItems
                  .map((i) => `${i.label}${i.amountMinor !== null ? ` (${formatMoney({ amountMinor: i.amountMinor, currency: guarded.history!.currency }, locale)})` : ""}`)
                  .join(", ")}
                </span>
              </p>
            )}
            {guarded.history.vsPrevious.removedItems.length > 0 && (
              <p style={{ margin: "6px 0" }}>
                <b>{tPipeline(locale, "histGone")}:</b>{" "}
                <span dir="auto">{guarded.history.vsPrevious.removedItems.map((i) => i.label).join(", ")}</span>
              </p>
            )}
            {guarded.history.vsPrevious.changedItems.length > 0 && (
              <p style={{ margin: "6px 0" }}>
                <b>{tPipeline(locale, "histChanged")}:</b>{" "}
                <span dir="auto">
                {guarded.history.vsPrevious.changedItems
                  .map(
                    (i) =>
                      `${i.label}: ${formatMoney({ amountMinor: i.fromMinor, currency: guarded.history!.currency }, locale)} → ${formatMoney({ amountMinor: i.toMinor, currency: guarded.history!.currency }, locale)}`,
                  )
                  .join(", ")}
                </span>
              </p>
            )}
            {guarded.history.vsPrevious.dataUsedDeltaGb !== null && guarded.history.vsPrevious.dataUsedDeltaGb !== 0 && (
              <p style={{ margin: "6px 0", color: "var(--text-muted)" }}>
                {tPipeline(locale, "histData")}: {guarded.history.vsPrevious.dataUsedDeltaGb > 0 ? "+" : ""}
                {guarded.history.vsPrevious.dataUsedDeltaGb} GB
              </p>
            )}
            {guarded.history.vsPrevious.usageKwhDelta !== null && guarded.history.vsPrevious.usageKwhDelta !== 0 && (
              <p style={{ margin: "6px 0", color: "var(--text-muted)" }}>
                {tPipeline(locale, "histKwh")}: {guarded.history.vsPrevious.usageKwhDelta > 0 ? "+" : ""}
                {guarded.history.vsPrevious.usageKwhDelta} kWh
              </p>
            )}
          </section>
        </>
      )}

      {extraction.common.lineItems.length > 0 && (
        <>
          <h2 className="sec"><IconReceipt size={15} />{s.lineItems}</h2>
          <section className="card">
            <table className="items">
              <tbody>
                {extraction.common.lineItems.map((item, i) => {
                  const translated = guarded.translation?.lineItemLabels[i];
                  const showOriginal = translated !== undefined && translated !== item.label;
                  return (
                    <tr key={i}>
                      <td>
                        <span dir="auto">{translated ?? item.label}</span>
                        {showOriginal && (
                          <span dir="auto" style={{ display: "block", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                            {item.label}
                          </span>
                        )}
                        {annotationFor(item.label, guarded) && (
                          <span className="note">{annotationFor(item.label, guarded)}</span>
                        )}
                      </td>
                      <td className="amount">{item.amount ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      {guarded.gotchas.length > 0 && (
        <>
          <h2 className="sec"><IconAlertCircle size={15} />{s.gotchas}</h2>
          {guarded.gotchas.map((g) => (
            <div key={g.checkId} className={`gotcha ${g.severity}`}>
              {g.explanation}
            </div>
          ))}
        </>
      )}

      {guarded.savings.length > 0 && (
        <>
          <h2 className="sec"><IconTrendDown size={15} />{s.savings}</h2>
          {guarded.savings.map((saving, i) => (
            <div key={i} className="saving">
              <div className={saving.amountMinor !== null ? "amount" : "qualitative"}>
                {saving.amountMinor !== null
                  ? `~${formatMoney({ amountMinor: saving.amountMinor, currency: saving.currency }, locale)}${
                      saving.period === "monthly" ? s.perMonth : saving.period === "annual" ? s.perYear : ` ${s.oneOff}`
                    }`
                  : s.varies}
              </div>
              <div>{saving.explanation}</div>
              {saving.offer && (
                <div className="offer">
                  <b dir="auto">{saving.offer.provider}</b>{" "}
                  <span dir="auto">{saving.offer.name}</span>
                  <span className="offer-price">
                    {formatMoney({ amountMinor: saving.offer.estMonthlyCostMinor, currency: saving.currency }, locale)}
                    {s.perMonth}
                  </span>
                  {saving.offer.link && (
                    <a href={saving.offer.link} target="_blank" rel="noopener noreferrer nofollow">
                      {new URL(saving.offer.link).hostname.replace(/^www\./, "")}
                    </a>
                  )}
                </div>
              )}
              <div className="next">{saving.nextStep}</div>
            </div>
          ))}
        </>
      )}

      {pitch && (
        <>
          <h2 className="sec"><IconMegaphone size={15} />{s.pitchTitle}</h2>
          <section className="card">
            <p style={{ color: "var(--text-muted)", margin: "0 0 10px", fontSize: "0.92rem" }}>{s.pitchBody}</p>
            <div className="terminal">
              <div className="bar">
                <span className="dot r" />
                <span className="dot y" />
                <span className="dot g" />
              </div>
              <div className="body" dir="auto">
                {pitch.chatMessage}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <CopyButton text={pitch.chatMessage} label={s.pitchCopy!} copiedLabel={s.pitchCopied!} />
              {chatCta && (
                <a
                  className="cta"
                  style={{ display: "inline-block" }}
                  href={chatCta.url}
                  {...(chatCta.channel === "sms" ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}
                >
                  {fill(s[`${ctaKey}SupportCta`]!, chatCta.providerName)}
                </a>
              )}
            </div>
            {chatCta?.channel === "web_chat" && (
              <p style={{ color: "var(--text-muted)", margin: "8px 0 0", fontSize: "0.85rem" }}>{s.pitchWebChatHint}</p>
            )}
          </section>
          {pitch.targetMonthlyMinor !== null && (
            <p style={{ margin: "10px 0 0", fontWeight: 600 }}>
              {tPipeline(locale, "pitchGoal", {
                amount: formatMoney({ amountMinor: pitch.targetMonthlyMinor, currency: pitch.currency }, locale),
              })}
            </p>
          )}
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontWeight: 650, display: "flex", alignItems: "center", gap: 8 }}>
              <IconPhoneCall size={16} />
              {s.pitchCallTitle}
            </summary>
            <section className="card" style={{ marginTop: 8 }}>
              <p>{pitch.callScript.opening}</p>
              <p style={{ fontWeight: 600 }}>🗣 {pitch.callScript.openAsk}</p>
              {pitch.callScript.onFirstOffer && (
                <p>
                  <b>{tPipeline(locale, "pitchOnOffer")}</b> {pitch.callScript.onFirstOffer}
                </p>
              )}
              {pitch.callScript.pushHarder.length > 0 && (
                <ol>
                  {pitch.callScript.pushHarder.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              )}
              {pitch.callScript.evidence.length > 0 && (
                <ul>
                  {pitch.callScript.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {pitch.callScript.objections.map((o, i) => (
                <p key={i} style={{ fontSize: "0.92rem" }}>
                  ❓ <i>&ldquo;{o.ifTheySay}&rdquo;</i>
                  <br />→ {o.youSay}
                </p>
              ))}
              <p>{pitch.callScript.closing}</p>
              <p style={{ whiteSpace: "pre-wrap", color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 12 }}>
                {tPipeline(locale, "pitchTips")}
              </p>
            </section>
          </details>
        </>
      )}

      {!pitch && chatCta && (
        <section className="card" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600 }}>
            {chatCta.channel === "sms" ? "📱" : chatCta.channel === "web_chat" ? "💻" : "💬"}{" "}
            {fill(s[`${ctaKey}SupportTitle`]!, chatCta.providerName)}
          </div>
          <p style={{ color: "var(--text-muted)", margin: "6px 0 12px", fontSize: "0.92rem" }}>
            {s[`${ctaKey}SupportBody`]}
          </p>
          <a
            className="cta"
            style={{ display: "inline-block" }}
            href={chatCta.url}
            {...(chatCta.channel === "sms" ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}
          >
            {fill(s[`${ctaKey}SupportCta`]!, chatCta.providerName)}
          </a>
        </section>
      )}

      {guarded.printedNextSteps.length > 0 && (
        <>
          <h2 className="sec"><IconReceipt size={15} />{s.printed}</h2>
          <section className="card">
            <ul className="printed">
              {(guarded.translation ? extraction.common.printedNextSteps : guarded.printedNextSteps).map((step, i) => {
                // translations index against the EXTRACTION's steps, so render that list when translated
                const translated = guarded.translation?.printedNextSteps[i];
                const showOriginal = translated !== undefined && translated !== step;
                return (
                  <li key={i}>
                    <span dir="auto">{translated ?? step}</span>
                    {showOriginal && (
                      <span dir="auto" style={{ display: "block", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        {step}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <a className="cta" href="https://wa.me/?text=">
        {s.back}
      </a>
      <p className="footer">{s.privacy}</p>
    </main>
  );
}

function fill(template: string, provider: string): string {
  return template.replaceAll("{provider}", provider);
}

/** Human-scale data size: 15043 MB → "15 GB"; keeps small values precise. */
function fmtGb(gb: number): string {
  if (!Number.isFinite(gb)) return "∞";
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(gb * 1024)} MB`;
}

/**
 * "At a glance": the decision-relevant facts as big human numbers, plus a
 * severity meter — low utilization is the money signal, so it reads amber
 * with the verdict spelled out ("you pay for 800 GB, you use about 15 GB"),
 * not a hairline bar with a percentage.
 */
function glance(
  extraction: { category: string; category_fields: unknown; common: { currency: string | null } },
  s: Record<string, string>,
  locale: SupportedLocale,
) {
  const fields =
    ((extraction.category_fields as Record<string, Record<string, unknown> | null>)[extraction.category] ??
      {}) as Record<string, unknown>;
  const printed = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const currency = extraction.common.currency ?? "EUR";
  const money = (raw: string | null): string | null => {
    if (!raw) return null;
    const minor = parseAmount(raw, currency);
    return minor === null ? raw : formatMoney({ amountMinor: minor, currency }, locale);
  };

  const stats: Array<{ label: string; value: string; sub?: string }> = [];
  let meter: { pct: number; severity: "low" | "ok" | "high"; verdict: string; end: string } | null = null;

  if (extraction.category === "mobile") {
    const usedPrinted = printed(fields.dataUsedGb);
    const allowancePrinted = printed(fields.dataAllowanceGb);
    const used = parseGb(usedPrinted);
    const allowance = parseGb(allowancePrinted);

    if (usedPrinted) {
      // Human value first (15 GB), the bill's own string as the footnote.
      const human = used !== null ? fmtGb(used) : usedPrinted;
      const subs = [
        allowancePrinted ? s.stOf!.replace("{n}", allowance !== null ? fmtGb(allowance) : allowancePrinted) : null,
        human !== usedPrinted ? s.printedAs!.replace("{v}", usedPrinted) : null,
      ].filter(Boolean);
      stats.push({ label: s.stDataUsed!, value: human, ...(subs.length ? { sub: subs.join(" · ") } : {}) });
    }

    if (used !== null && allowance !== null && Number.isFinite(allowance) && allowance > 0) {
      const ratio = used / allowance;
      const pct = Math.min(100, Math.round(ratio * 100));
      const severity = ratio < 0.35 ? "low" : ratio > 0.9 ? "high" : "ok";
      const verdict =
        severity === "low"
          ? s.meterLow!.replace("{allowance}", fmtGb(allowance)).replace("{used}", fmtGb(used))
          : severity === "high"
            ? s.meterHigh!.replace("{pct}", String(pct))
            : s.meterOk!.replace("{pct}", String(pct));
      meter = { pct, severity, verdict, end: fmtGb(allowance) };
    }

    if (printed(fields.minutesUsed)) {
      stats.push({
        label: s.stMinutes!,
        value: printed(fields.minutesUsed)!,
        ...(printed(fields.minutesIncluded) ? { sub: s.stOf!.replace("{n}", printed(fields.minutesIncluded)!) } : {}),
      });
    }
    const fee = money(printed(fields.baseFee));
    if (fee) stats.push({ label: s.stFee!, value: fee });
  } else if (extraction.category === "energy") {
    if (printed(fields.usageKwh)) stats.push({ label: s.stConsumption!, value: `${printed(fields.usageKwh)} kWh` });
    if (printed(fields.usageM3)) stats.push({ label: s.stConsumption!, value: `${printed(fields.usageM3)} m³` });
  } else if (extraction.category === "broadband") {
    if (printed(fields.speedTier)) stats.push({ label: s.stSpeed ?? "", value: printed(fields.speedTier)! });
    const price = money(printed(fields.monthlyPrice));
    if (price) stats.push({ label: s.stFee!, value: price });
  }

  if (stats.length === 0 && !meter) return null;
  return (
    <>
      <h2 className="sec"><IconListCheck size={15} />{s.glance}</h2>
      <section className="card">
        {stats.length > 0 && (
          <div className="statgrid">
            {stats.map((st, i) => (
              <div key={i} className="stat">
                <span className="label">{st.label}</span>
                <span className="value" dir="auto">
                  <bdi>{st.value}</bdi>
                </span>
                {st.sub && (
                  <span className="sub" dir="auto">
                    {st.sub}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {meter && (
          <div className={`meter ${meter.severity}`}>
            <p className="meter-verdict">{meter.verdict}</p>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${Math.max(2, meter.pct)}%` }} />
            </div>
            <div className="meter-scale">
              <span>0</span>
              <span>{meter.end}</span>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/** Match a section explanation to a line item by label mention (best-effort annotation). */
function annotationFor(
  label: string,
  guarded: { sections: Array<{ title: string; plainExplanation: string }> },
): string | null {
  const lower = label.toLowerCase();
  const hit = guarded.sections.find(
    (sec) => sec.title.toLowerCase().includes(lower) || sec.plainExplanation.toLowerCase().includes(lower),
  );
  return hit ? hit.plainExplanation : null;
}
