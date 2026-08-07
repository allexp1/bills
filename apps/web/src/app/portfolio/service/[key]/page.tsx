import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { tenantDb } from "@bills/db";
import { decodeServiceKey, getDashboard, type DashboardService } from "@bills/db/repo/dashboard";
import { resolveCustomer } from "../../../../server/auth/resolve-customer.js";
import { clerkEnabled } from "../../../../lib/clerk-enabled.js";
import { SiteFooter, SiteNav } from "../../../../components/site-nav.js";
import { Money, NeuBadge, NeuButton, NeuCard } from "../../../../components/ui/neu.js";
import { BillList } from "../../bill-list.js";
import { money, periodLabel } from "../../format.js";
import { SpendChart } from "../../spend-chart.js";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "One provider | Fixplo.ai",
  description: "Every bill you have from one provider, and what they add up to.",
};

/**
 * Everything from one provider, in one place.
 *
 * The dashboard answers "what do I pay and what moved". This answers "show me
 * this company" : every bill, what they add up to, the shape of them over time,
 * and a way into any single one.
 *
 * Open on a service card used to go straight to the latest bill, which showed one
 * month's statistics under a card that said five bills. The card was right and the
 * link was wrong.
 *
 * It reuses getDashboard rather than adding a per-service query. One service is a
 * filter over the same grouping, and a second code path could disagree with the
 * dashboard about the typical month or which bill is latest, which is the kind of
 * inconsistency nobody reports and everybody notices.
 */

const CATEGORY_LABEL: Record<string, string> = {
  mobile: "Mobile",
  internet: "Internet",
  energy: "Energy",
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  insurance: "Insurance",
  utility: "Utilities",
  statement: "Insurance & pension",
};

/** Highest and lowest bill, with the period each covers. */
function extremes(svc: DashboardService) {
  const withTotals = svc.bills.filter((b) => b.totalMinor !== null);
  if (withTotals.length < 2) return null;
  const sorted = [...withTotals].sort((a, b) => (a.totalMinor ?? 0) - (b.totalMinor ?? 0));
  return { low: sorted[0]!, high: sorted[sorted.length - 1]! };
}

function periodOf(
  b: { periodStart: string | null; periodEnd: string | null },
  locale = "en",
): string {
  return periodLabel(b.periodStart, b.periodEnd, locale) ?? "period not on the bill";
}

export default async function ServicePage({ params }: { params: Promise<{ key: string }> }) {
  if (!clerkEnabled) redirect("/portfolio");
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { key: encoded } = await params;
  const key = decodeServiceKey(encoded);
  if (!key) redirect("/portfolio");

  const user = await currentUser();
  const { customerId } = await resolveCustomer({
    userId,
    verifiedPhone:
      user?.phoneNumbers.find((p) => p.verification?.status === "verified")?.phoneNumber ?? null,
    verifiedEmail:
      user?.emailAddresses.find((e) => e.verification?.status === "verified")?.emailAddress ?? null,
    displayName: user?.firstName ?? null,
    locale: "en",
  });

  const dashboard = await getDashboard(tenantDb(), customerId);
  const svc = dashboard.services.find((s) => s.key === key);
  /* Deleting the last bill of a service makes this page's subject cease to
     exist. Back to the dashboard rather than an error: nothing is wrong. */
  if (!svc) redirect("/portfolio");

  const locale = "en";
  /* The chart for this service alone. Taken from the dashboard's own chart so the
     months line up with what the dashboard drew, then filtered to this series. */
  const own = dashboard.charts.find((c) => c.series.some((s) => s.key === svc.key));
  const ownChart = own
    ? {
        currency: own.currency,
        months: own.months,
        series: own.series.filter((s) => s.key === svc.key),
      }
    : null;

  const ext = extremes(svc);
  const totalPaid = svc.bills.reduce((t, b) => t + (b.totalMinor ?? 0), 0);
  const alerts = dashboard.alerts.filter((a) => a.serviceKey === svc.key);

  return (
    <div className="fx min-h-screen">
      <SiteNav />

      <main className="mx-auto max-w-6xl px-5 pb-10 pt-8">
        <a href="/portfolio" className="text-sm font-medium text-muted hover:text-ink">
          ← All your services
        </a>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-soft">
              {svc.category ? (CATEGORY_LABEL[svc.category] ?? svc.category) : "Provider"}
            </p>
            <h1 className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {/* bdi, because a provider name is often Hebrew or Arabic and
                  would otherwise drag the badges beside it to the wrong side. */}
              <bdi className="min-w-0 truncate">{svc.providerName ?? "Unnamed provider"}</bdi>
              {svc.country ? <NeuBadge tone="neutral">{svc.country}</NeuBadge> : null}
              {svc.status === "negotiating" ? <NeuBadge tone="brand">Negotiating</NeuBadge> : null}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {svc.bills.length === 1 ? "1 bill" : `${svc.bills.length} bills`}
              {/* Oldest start to newest end. This used to split a formatted
                  string on " to " and glue an ISO date onto the result, which
                  printed one half of the span in each format. */}
              {svc.bills.length > 1
                ? ` · ${
                    periodLabel(
                      svc.bills[svc.bills.length - 1]?.periodStart ?? null,
                      svc.bills[0]?.periodEnd ?? null,
                      locale,
                    ) ?? "period not on the bill"
                  }`
                : ` · ${periodOf(svc.bills[0]!, locale)}`}
            </p>
          </div>
          <NeuButton href="/upload" tone="savings">
            Upload another bill
          </NeuButton>
        </div>

        <section className="mt-8 grid gap-6 md:grid-cols-3">
          <NeuCard>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">Latest bill</p>
            <p className="mt-3 text-4xl font-extrabold text-ink">
              <Money>{money(svc.latestMinor, svc.currency, locale)}</Money>
            </p>
            <p className="mt-3 text-xs text-dim">{periodOf(svc.bills[0]!, locale)}</p>
          </NeuCard>

          <NeuCard>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">Typical month</p>
            <p className="mt-3 text-4xl font-extrabold text-ink">
              <Money>{money(svc.medianMinor, svc.currency, locale)}</Money>
            </p>
            <p className="mt-3 text-xs text-dim">
              {svc.bills.length < 2
                ? "One bill, so this is that bill."
                : `The middle of your ${svc.bills.length} bills. The average is ${money(
                    svc.averageMinor,
                    svc.currency,
                    locale,
                  )}, which one unusual month can pull well away from what you normally pay.`}
            </p>
          </NeuCard>

          <NeuCard>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">
              Paid across these bills
            </p>
            <p className="mt-3 text-4xl font-extrabold text-ink">
              <Money>{money(totalPaid, svc.currency, locale)}</Money>
            </p>
            <p className="mt-3 text-xs text-dim">
              The {svc.bills.length === 1 ? "bill" : `${svc.bills.length} bills`} you have uploaded, added
              up. Not everything you have ever paid this provider.
            </p>
          </NeuCard>
        </section>

        {ext ? (
          <section className="mt-6 grid gap-6 md:grid-cols-2">
            <NeuCard elevation="inset">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">Highest</p>
              <p className="mt-2 text-2xl font-extrabold text-ink">
                <Money>{money(ext.high.totalMinor, svc.currency, locale)}</Money>
              </p>
              <p className="mt-2 text-xs text-dim">{periodOf(ext.high, locale)}</p>
            </NeuCard>
            <NeuCard elevation="inset">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">Lowest</p>
              <p className="mt-2 text-2xl font-extrabold text-ink">
                <Money>{money(ext.low.totalMinor, svc.currency, locale)}</Money>
              </p>
              <p className="mt-2 text-xs text-dim">{periodOf(ext.low, locale)}</p>
            </NeuCard>
          </section>
        ) : null}

        {alerts.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-bold text-ink">Worth a look</h2>
            <NeuCard className="mt-4 divide-y divide-hairline p-0">
              {alerts.map((a, i) => (
                <div key={`${a.kind}-${i}`} className="px-5 py-4">
                  <a
                    href={`/portfolio/open/${a.invoiceId}`}
                    className="text-base font-bold text-ink hover:text-brand-soft"
                  >
                    {a.kind === "jump"
                      ? `Rose by ${money(a.deltaMinor ?? null, a.currency, locale)}, ${a.deltaPct}% on the latest bill`
                      : a.kind === "outlier"
                        ? `One bill charged ${money(a.toMinor ?? null, a.currency, locale)}, ${a.deltaPct}% above your usual`
                        : a.kind === "promo_ending"
                          ? `A printed discount ends ${a.date}`
                          : `The contract ends ${a.date}`}
                  </a>
                  {a.kind === "outlier" && a.period ? (
                    <p className="mt-1 text-sm text-muted">Covering {a.period}.</p>
                  ) : null}
                </div>
              ))}
            </NeuCard>
          </section>
        )}

        {ownChart && ownChart.months.length > 1 ? (
          <section className="mt-12">
            <h2 className="text-lg font-bold text-ink">What you paid, month by month</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
              One column per billing period. A month with no bill stays empty rather than repeating the
              last one.
            </p>
            <NeuCard className="mt-4">
              <SpendChart chart={ownChart} locale={locale} typicalMinor={svc.medianMinor} />
            </NeuCard>
          </section>
        ) : null}

        <section className="mt-12">
          <h2 className="text-lg font-bold text-ink">
            Every bill
            <span className="ml-2 text-sm font-normal text-dim">{svc.bills.length}</span>
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            Newest first. Open one to see its charges explained, or delete one to erase it.
          </p>
          <NeuCard className="mt-4">
            <BillList bills={svc.bills} currency={svc.currency} locale={locale} startOpen />
          </NeuCard>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
