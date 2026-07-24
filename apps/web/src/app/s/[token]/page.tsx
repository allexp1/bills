import { eq } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { verifySummaryToken } from "@bills/pipeline";
import { formatMoney, resolveLocale, type SupportedLocale } from "@bills/shared";
import { loadGuardedDecode } from "../../../server/decode-store.js";
import { env } from "../../../server/env.js";
import { ThemeToggle } from "./theme-toggle.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEB_STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: { due: "Due", pastDue: "past due", lineItems: "What you're paying for", gotchas: "Worth knowing", savings: "Where you can save", printed: "Printed on your bill", perMonth: "/month", perYear: "/year", oneOff: "one-off", varies: "amount depends on usage", back: "Continue on WhatsApp", expiredTitle: "This link has expired", expiredBody: "Message us on WhatsApp again and we'll send a fresh one.", period: "Billing period", privacy: "This page is private to you. Nothing here is indexed or shared." },
  es: { due: "Vence", pastDue: "vencido", lineItems: "Qué estás pagando", gotchas: "Conviene saber", savings: "Dónde puedes ahorrar", printed: "Impreso en tu factura", perMonth: "/mes", perYear: "/año", oneOff: "una vez", varies: "el importe depende del consumo", back: "Seguir en WhatsApp", expiredTitle: "Este enlace ha caducado", expiredBody: "Escríbenos de nuevo por WhatsApp y te enviamos uno nuevo.", period: "Periodo de facturación", privacy: "Esta página es privada. Nada aquí se indexa ni se comparte." },
  fr: { due: "Échéance", pastDue: "en retard", lineItems: "Ce que vous payez", gotchas: "Bon à savoir", savings: "Où économiser", printed: "Imprimé sur votre facture", perMonth: "/mois", perYear: "/an", oneOff: "une fois", varies: "montant selon la consommation", back: "Continuer sur WhatsApp", expiredTitle: "Ce lien a expiré", expiredBody: "Écrivez-nous à nouveau sur WhatsApp et nous vous en enverrons un autre.", period: "Période de facturation", privacy: "Cette page est privée. Rien n'est indexé ni partagé." },
  pt: { due: "Vencimento", pastDue: "em atraso", lineItems: "O que está a pagar", gotchas: "Vale a pena saber", savings: "Onde pode poupar", printed: "Impresso na sua fatura", perMonth: "/mês", perYear: "/ano", oneOff: "uma vez", varies: "o valor depende do consumo", back: "Continuar no WhatsApp", expiredTitle: "Este link expirou", expiredBody: "Escreva-nos novamente no WhatsApp e enviamos um novo.", period: "Período de faturação", privacy: "Esta página é privada. Nada aqui é indexado ou partilhado." },
  de: { due: "Fällig", pastDue: "überfällig", lineItems: "Wofür Sie zahlen", gotchas: "Gut zu wissen", savings: "Wo Sie sparen können", printed: "Auf Ihrer Rechnung gedruckt", perMonth: "/Monat", perYear: "/Jahr", oneOff: "einmalig", varies: "Betrag hängt vom Verbrauch ab", back: "Weiter in WhatsApp", expiredTitle: "Dieser Link ist abgelaufen", expiredBody: "Schreiben Sie uns erneut auf WhatsApp und wir senden einen neuen.", period: "Abrechnungszeitraum", privacy: "Diese Seite ist privat. Nichts wird indexiert oder geteilt." },
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

  return (
    <main className="page">
      <ThemeToggle />

      <section className="card hero">
        <div className="provider">{extraction.common.providerName ?? ""}</div>
        <div className="total">{total}</div>
        <div className="due">
          {invoice.dueDate ? `${s.due} ${invoice.dueDate}` : null}
          {invoice.billingPeriodStart && invoice.billingPeriodEnd
            ? ` · ${s.period}: ${invoice.billingPeriodStart} → ${invoice.billingPeriodEnd}`
            : null}
        </div>
        <p className="headline">{guarded.headline}</p>
      </section>

      {extraction.common.lineItems.length > 0 && (
        <>
          <h2>{s.lineItems}</h2>
          <section className="card">
            <table className="items">
              <tbody>
                {extraction.common.lineItems.map((item, i) => (
                  <tr key={i}>
                    <td>
                      {item.label}
                      {annotationFor(item.label, guarded) && (
                        <span className="note">{annotationFor(item.label, guarded)}</span>
                      )}
                    </td>
                    <td className="amount">{item.amount ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {guarded.gotchas.length > 0 && (
        <>
          <h2>{s.gotchas}</h2>
          {guarded.gotchas.map((g) => (
            <div key={g.checkId} className={`gotcha ${g.severity}`}>
              {g.explanation}
            </div>
          ))}
        </>
      )}

      {guarded.savings.length > 0 && (
        <>
          <h2>{s.savings}</h2>
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
              <div className="next">{saving.nextStep}</div>
            </div>
          ))}
        </>
      )}

      {guarded.printedNextSteps.length > 0 && (
        <>
          <h2>{s.printed}</h2>
          <section className="card">
            <ul className="printed">
              {guarded.printedNextSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
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
