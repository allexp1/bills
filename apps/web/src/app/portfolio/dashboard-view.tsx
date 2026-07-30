import type {
  Dashboard,
  DashboardAlert,
  DashboardService,
} from "@bills/db/repo/dashboard";
import { Money, NeuBadge, NeuButton, NeuCard } from "../../components/ui/neu.js";
import { BillList } from "./bill-list.js";
import { SpendChart } from "./spend-chart.js";

/**
 * The dashboard.
 *
 * One rule runs through all of it: structure appears only when the data earns
 * it. With one provider in one country there are no group headings, no country
 * badges and no chart, because a single column is a stat tile pretending to be a
 * chart. The old version showed the scaffolding for thirty bills to someone who
 * had three, which is most of why it read as noise.
 *
 * The other rule is the product's first one. Nothing here is a figure that is
 * not on a bill or arithmetic over figures that are. Savings stay "n/a" until a
 * negotiation completes and the number can be cited to the offer it came from.
 */

function money(minor: number | null, currency: string | null, locale = "en"): string {
  if (minor === null) return "n/a";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency ?? ""}`.trim();
  }
}

function dateLabel(iso: string, locale = "en"): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  mobile: "Mobile",
  internet: "Internet",
  energy: "Energy",
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  insurance: "Insurance",
  utility: "Utilities",
};

/** A change, as a pill. Down is good on a bill, so down is the savings colour. */
function Delta({
  latest,
  previous,
  currency,
  locale,
}: {
  latest: number | null;
  previous: number | null;
  currency: string | null;
  locale: string;
}) {
  if (latest === null || previous === null || previous === 0) return null;
  const delta = latest - previous;
  if (delta === 0) {
    return <NeuBadge tone="neutral">No change</NeuBadge>;
  }
  const pct = Math.round(Math.abs(delta / previous) * 100);
  const down = delta < 0;
  return (
    <NeuBadge tone={down ? "savings" : "warning"}>
      {down ? "↓" : "↑"} {money(Math.abs(delta), currency, locale)} · {pct}%
    </NeuBadge>
  );
}

/**
 * A sparkline of a service's bills, oldest to newest.
 *
 * Decoration only, so it is aria-hidden: every figure it traces is also in the
 * card as text, and a screen reader reading a squiggle helps nobody.
 */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = 6 + (i / (values.length - 1)) * 108;
      const y = 30 - ((v - min) / span) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastY = 30 - ((values[values.length - 1]! - min) / span) * 24;
  return (
    <svg viewBox="0 0 120 36" width="108" height="32" aria-hidden="true" className="hidden sm:block">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={114} cy={lastY} r={4} fill="var(--color-brand)" />
    </svg>
  );
}

function alertText(a: DashboardAlert, locale: string): { title: string; body: string; tone: "warning" | "alert" } {
  if (a.kind === "jump") {
    return {
      tone: "alert",
      title: `${a.providerName ?? "This bill"} rose by ${money(a.deltaMinor ?? null, a.currency, locale)}, ${a.deltaPct}%`,
      body: `${money(a.toMinor ?? null, a.currency, locale)} against ${money(a.fromMinor ?? null, a.currency, locale)} the month before. Worth knowing what caused it before it repeats.`,
    };
  }
  if (a.kind === "outlier") {
    return {
      tone: "alert",
      title: `${a.providerName ?? "One bill"} charged ${money(a.toMinor ?? null, a.currency, locale)} once, ${a.deltaPct}% above your usual`,
      body: `Your typical month is ${money(a.fromMinor ?? null, a.currency, locale)}.${
        a.period ? ` This one covers ${a.period}.` : ""
      } Worth opening it and checking the charge is right.`,
    };
  }
  if (a.kind === "promo_ending") {
    return {
      tone: "warning",
      title: `${a.providerName ?? "A provider"} discount ends ${a.date ? dateLabel(a.date, locale) : "soon"}`,
      body: "Printed on the bill itself. The price rises when it lapses, so this is the moment to ask for a better rate.",
    };
  }
  return {
    tone: "warning",
    title: `${a.providerName ?? "A provider"} contract ends ${a.date ? dateLabel(a.date, locale) : "soon"}`,
    body: "The strongest point to negotiate from, because leaving is genuinely an option for you right now.",
  };
}

function ServiceRow({
  svc,
  showCountry,
  locale,
}: {
  svc: DashboardService;
  showCountry: boolean;
  locale: string;
}) {
  /* Oldest to newest for the sparkline; the list itself is newest first. */
  const trend = [...svc.bills]
    .reverse()
    .map((b) => b.totalMinor)
    .filter((v): v is number => v !== null);

  return (
    <NeuCard as="li" className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-base font-bold text-ink">
            <span className="truncate">{svc.providerName ?? "Unnamed provider"}</span>
            {showCountry && svc.country ? <NeuBadge tone="neutral">{svc.country}</NeuBadge> : null}
            {svc.status === "negotiating" ? <NeuBadge tone="brand">Negotiating</NeuBadge> : null}
            {svc.promoEndDate ? (
              <NeuBadge tone="warning">Discount ends {dateLabel(svc.promoEndDate, locale)}</NeuBadge>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-muted">
            {svc.bills.length === 1
              ? "One bill so far"
              : `${svc.bills.length} bills · typically ${money(svc.medianMinor, svc.currency, locale)}`}
            {svc.bills[0]?.periodStart && svc.bills[0]?.periodEnd
              ? ` · latest ${svc.bills[0].periodStart} to ${svc.bills[0].periodEnd}`
              : ""}
          </p>
        </div>

        <Spark values={trend} />

        <span className="text-base font-semibold text-ink">
          <Money>{money(svc.latestMinor, svc.currency, locale)}</Money>
        </span>
        <Delta
          latest={svc.latestMinor}
          previous={svc.previousMinor}
          currency={svc.currency}
          locale={locale}
        />
        <a
          href={`/portfolio/open/${svc.latestInvoiceId}`}
          className="text-sm font-medium text-brand-soft hover:text-brand"
        >
          Open →
        </a>
      </div>

      {/* The months, collapsed. This is where a single bill is opened or
          deleted; the row above is about the service as a whole. */}
      <BillList bills={svc.bills} currency={svc.currency} locale={locale} />
    </NeuCard>
  );
}

export function DashboardView({ data, locale = "en" }: { data: Dashboard; locale?: string }) {
  const { services, alerts, totals, charts } = data;

  /* Country only becomes visible once there is more than one. For a
     single-country customer a row of identical badges is pure noise. */
  const showCountry = data.countries.length > 1;
  /* Same for category headings. One category means the heading would just
     repeat what every card already says. */
  const showGroups = data.categories.length > 1;

  const grouped = showGroups
    ? [...new Map(services.map((s) => [s.category ?? "other", [] as DashboardService[]])).keys()].map(
        (cat) => ({
          category: cat,
          items: services.filter((s) => (s.category ?? "other") === cat),
        }),
      )
    : [{ category: null, items: services }];

  return (
    <>
      <section className="mt-8 grid gap-6 md:grid-cols-3">
        {/* One tile per currency. A shekel and a euro do not add up, and one
            blended number would be an invented figure. */}
        {totals.length === 0 ? (
          <NeuCard>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">Every month</p>
            <p className="mt-3 text-4xl font-extrabold text-muted">
              <Money>n/a</Money>
            </p>
            <p className="mt-3 text-xs text-dim">
              Shown once a bill has a total on it.
            </p>
          </NeuCard>
        ) : (
          totals.map((t) => (
            <NeuCard key={t.currency}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">
                Every month{totals.length > 1 ? ` · ${t.currency}` : ""}
              </p>
              <p className="mt-3 text-4xl font-extrabold text-ink">
                <Money>{money(t.minor, t.currency, locale)}</Money>
              </p>
              <div className="mt-3">
                <Delta
                  latest={t.minor}
                  previous={t.previousMinor}
                  currency={t.currency}
                  locale={locale}
                />
              </div>
              <p className="mt-3 text-xs text-dim">
                Latest bill for each service, added up. Not every bill you have ever sent.
              </p>
            </NeuCard>
          ))
        )}

        <NeuCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">Savings secured</p>
          <p className="mt-3 text-4xl font-extrabold text-muted">
            <Money>n/a</Money>
          </p>
          <p className="mt-3 text-xs text-dim">
            Becomes a number when a negotiation completes and it can be traced to the offer it came from.
            Nothing is claimed before then.
          </p>
        </NeuCard>

        <NeuCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">Being negotiated</p>
          <p className="mt-3 text-4xl font-extrabold text-ink">
            <Money>{String(data.activeNegotiations)}</Money>
          </p>
          <p className="mt-3 text-xs text-dim">Calls placed on your behalf, in progress.</p>
        </NeuCard>
      </section>

      {/* Only rendered when it has something real in it. An empty "all clear"
          card every month teaches people to stop reading the page. */}
      {alerts.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-bold text-ink">Worth a look</h2>
          <NeuCard className="mt-4 divide-y divide-hairline p-0">
            {alerts.map((a, i) => {
              const t = alertText(a, locale);
              return (
                <div key={`${a.kind}-${a.serviceKey}-${i}`} className="flex gap-4 px-5 py-4">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-button neu-inset ${
                      t.tone === "alert" ? "text-alert" : "text-warning"
                    }`}
                  >
                    {t.tone === "alert" ? "▲" : "◆"}
                  </span>
                  <span className="min-w-0">
                    <a
                      href={`/portfolio/open/${a.invoiceId}`}
                      className="block text-base font-bold text-ink hover:text-brand-soft"
                    >
                      {t.title}
                    </a>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">{t.body}</span>
                  </span>
                </div>
              );
            })}
          </NeuCard>
        </section>
      )}

      {charts.map((chart) => (
        <section className="mt-12" key={chart.currency}>
          <h2 className="text-lg font-bold text-ink">
            What you paid, month by month
            {charts.length > 1 ? ` · ${chart.currency}` : ""}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            {chart.series.length === 1
              ? "One column per billing period. A month with no bill stays empty rather than repeating the last one."
              : "Column height is your whole outflow that month; the bands are which service. A month with no bill for a service stays empty."}
          </p>
          <NeuCard className="mt-4">
            {/* Only meaningful for a single service: with several stacked,
                one service's typical month is not a line across the total. */}
            <SpendChart
              chart={chart}
              locale={locale}
              typicalMinor={chart.series.length === 1 ? (services[0]?.medianMinor ?? null) : null}
            />
          </NeuCard>
        </section>
      ))}

      <section className="mt-12">
        <h2 className="text-lg font-bold text-ink">
          {services.length === 1 ? "Your service" : `Your services`}
          {services.length > 1 ? <span className="ml-2 text-sm font-normal text-dim">{services.length}</span> : null}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          One card per service, not per bill. Three bills from one provider are three months of the same
          thing, and the months live inside the card.
        </p>

        {services.length === 0 ? (
          <NeuCard className="mt-5 py-12 text-center">
            <p className="text-base text-muted">Nothing here yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-dim">
              Upload a bill and it will appear here, with every charge explained and a note of whether
              anything is worth negotiating.
            </p>
            <div className="mt-6 flex justify-center">
              <NeuButton href="/upload">Upload a bill</NeuButton>
            </div>
          </NeuCard>
        ) : (
          grouped.map((g) => (
            <div key={g.category ?? "all"}>
              {g.category ? (
                <h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-dim">
                  {CATEGORY_LABEL[g.category] ?? g.category}
                  {g.items.length > 1 ? ` · ${g.items.length} services` : ""}
                </h3>
              ) : null}
              <ul className="mt-4 space-y-3">
                {g.items.map((svc) => (
                  <ServiceRow key={svc.key} svc={svc} showCountry={showCountry} locale={locale} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </>
  );
}
