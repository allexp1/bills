import { eq } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { verifySummaryToken } from "@bills/pipeline";
import { resolveLocale, type SupportedLocale } from "@bills/shared";
import { loadGuardedDecode } from "../../../server/decode-store.js";
import { env } from "../../../server/env.js";
import { SummaryView, WEB_STRINGS } from "./summary-view.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return <SummaryView invoice={invoice} guarded={loaded.guarded} extraction={loaded.extraction} locale={locale} />;
}
