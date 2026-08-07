import {
  encodeServiceKey,
  insuranceOverview,
  type Dashboard,
  type DashboardAlert,
  type DashboardService,
  type InsuranceFamily,
  type PolicyHolding,
} from "@bills/db/repo/dashboard";
import { Money, NeuBadge, NeuButton, NeuCard } from "../../components/ui/neu.js";
import { BillList } from "./bill-list.js";
import { dateLabel, money, periodLabel } from "./format.js";
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
  pension: "Pension",
  health_insurance: "Health insurance",
  car_insurance: "Car insurance",
  home_insurance: "Home insurance",
  life_insurance: "Life insurance",
  travel_insurance: "Travel insurance",
};

/**
 * What holding the same family at two companies MEANS, per family — because
 * it is not the same fact everywhere. Health, car, home and travel are
 * indemnity: they reimburse a loss, and two policies generally cannot both
 * pay for the same event, so the second premium often buys nothing. Life
 * insurance is NOT indemnity — every policy pays — so overlap there is a
 * question of intent, not waste. Pension overlap means paying two sets of
 * management fees on one salary. Explanation only, never "cancel X".
 */
const OVERLAP_NOTE: Record<InsuranceFamily, string> = {
  health_insurance:
    "Health policies at different companies usually cannot both pay for the same treatment. Worth putting them side by side and checking what the second one adds.",
  car_insurance:
    "Two car policies generally cannot both pay for the same damage. Unless they cover different vehicles, one of them may be buying nothing.",
  home_insurance:
    "Two home policies generally cannot both pay for the same damage. Unless they cover different homes, check what the second adds.",
  travel_insurance:
    "Travel policies overlap easily, especially with cover already included in credit cards. Two rarely pay more than one.",
  life_insurance:
    "Life policies are different: each one pays. Two policies is a choice, not a mistake — just check the total is the cover you mean to pay for.",
  pension:
    "Each fund charges its own management fees. Whether to consolidate is a decision for a licensed pension advisor, but knowing you are paying twice is the first step.",
  insurance: "",
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

  const period = periodLabel(svc.bills[0]?.periodStart ?? null, svc.bills[0]?.periodEnd ?? null, locale);

  return (
    <NeuCard as="li" className="px-5 py-4">
      {/* Stacked on a phone, one row from sm up.
          NOT flex-wrap on the outer row: `flex-1` means `flex-basis: 0`, so the
          text block's hypothetical size is zero, it always "fits", and wrapping
          never triggers. The money, the pill and the link kept their natural
          width and squeezed the name and dates into a column about one word
          wide. Stacking is what actually gives the text the line. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-x-5">
        <div className="min-w-0 sm:flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-base font-bold text-ink">
            {/* A provider name is frequently not Latin. bdi keeps a Hebrew or
                Arabic name from dragging the punctuation around it to the wrong
                side of the line. */}
            <bdi className="min-w-0 truncate">{svc.providerName ?? "Unnamed provider"}</bdi>
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
          </p>
          {/* Its own line rather than a third clause. On a phone the run-on
              version wrapped mid-date, which is where it stopped being a date. */}
          {period ? <p className="mt-0.5 text-sm text-dim">Latest {period}</p> : null}
        </div>

        {/* One group, so these stay on a single line under the name on a phone
            instead of becoming three more stacked rows. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
          {/* More than one bill goes to the provider page, which is the whole
              picture: every bill, what they add up to, the shape over time. It used
              to go straight to the latest bill, so a card saying "5 bills" opened
              one month's statistics. For a single bill the provider page would be
              an empty hop, so that goes straight to the bill. */}
          <a
            href={
              svc.bills.length > 1
                ? `/portfolio/service/${encodeServiceKey(svc.key)}`
                : `/portfolio/open/${svc.latestInvoiceId}`
            }
            className="ms-auto whitespace-nowrap text-sm font-medium text-brand-soft hover:text-brand sm:ms-0"
          >
            {svc.bills.length > 1 ? "See all →" : "Open →"}
          </a>
        </div>
      </div>

      {/* The months, collapsed, for opening or deleting one without leaving the
          dashboard. The row above is about the service as a whole. */}
      <BillList bills={svc.bills} currency={svc.currency} locale={locale} />
    </NeuCard>
  );
}

/**
 * The consolidated insurance picture, shown once two or more insurance or
 * pension positions exist — decoded statements and registry-listed holdings
 * together. Families with two companies get the overlap note — worded per
 * family, because duplicate health cover is waste while duplicate life cover
 * is a choice. Registry holdings without a statement render as gaps to fill:
 * the checklist that pulls the rest of the documents in.
 */
function InsuranceOverviewSection({
  services,
  holdings,
}: {
  services: DashboardService[];
  holdings: PolicyHolding[];
}) {
  const overview = insuranceOverview(services, holdings);
  const hasRegistry = holdings.length > 0;

  /* No picture yet: invite the registry fetch instead of rendering nothing.
     One upload turns this section from sales pitch into their actual data. */
  if (!overview) {
    return (
      <section className="mt-12">
        <h2 className="text-lg font-bold text-ink">See ALL your insurance</h2>
        <NeuCard className="mt-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Israel keeps an official registry of every insurance policy you hold at every company —
            Har haBituach. Download your list there and upload it here, and this section becomes your
            full picture: every policy, side by side, with overlaps flagged.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <NeuButton href="/guide/registry">How to get your list (3 minutes)</NeuButton>
            <a
              href="https://harb.cma.gov.il"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand-soft hover:text-brand"
            >
              harb.cma.gov.il →
            </a>
          </div>
        </NeuCard>
      </section>
    );
  }

  const allIsrael = overview.families.every(
    (f) => f.services.every((s) => s.country === "IL") && f.holdings.every((h) => h.country === "IL"),
  );
  const registryInvoiceId = holdings[0]?.invoiceId;

  return (
    <section className="mt-12">
      <h2 className="text-lg font-bold text-ink">Your insurance, side by side</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
        {overview.serviceCount} policies and savings products across companies
        {hasRegistry ? ", from your official registry list and your uploaded statements" : ""}. Each
        statement shows one company&apos;s slice; this is the whole.
      </p>
      <NeuCard className="mt-4 divide-y divide-hairline p-0">
        {overview.families.map((f) => (
          <div key={f.family} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-base font-bold text-ink">
                {CATEGORY_LABEL[f.family] ?? f.family}
              </p>
              {f.overlap ? (
                <NeuBadge tone={f.family === "life_insurance" ? "neutral" : "warning"}>
                  {f.services.length + f.holdings.length} companies
                </NeuBadge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              {f.services.map((s, i) => (
                <span key={s.key}>
                  {i > 0 ? " · " : ""}
                  <bdi>{s.providerName ?? "Unnamed provider"}</bdi>
                </span>
              ))}
              {f.holdings.map((h, i) => (
                <span key={h.id}>
                  {i > 0 || f.services.length > 0 ? " · " : ""}
                  <bdi>{h.company}</bdi>
                  <span className="text-dim"> (no statement yet)</span>
                </span>
              ))}
            </p>
            {f.overlap && OVERLAP_NOTE[f.family] ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dim">{OVERLAP_NOTE[f.family]}</p>
            ) : null}
            {f.holdings.length > 0 && !f.overlap ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dim">
                Listed in your registry, details unknown — forward this company&apos;s statement and it
                gets explained like the rest.
              </p>
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          {allIsrael ? (
            <p className="max-w-xl text-xs leading-relaxed text-dim">
              {hasRegistry
                ? "From Har haBituach, Israel's official registry. Re-fetch and re-upload it after any change to keep this picture fresh."
                : "Israel's official registry, Har haBituach (harb.cma.gov.il), lists every policy you hold at every company — the way to check nothing is missing from this picture."}
            </p>
          ) : (
            <span />
          )}
          {registryInvoiceId ? (
            <a
              href={`/portfolio/open/${registryInvoiceId}`}
              className="whitespace-nowrap text-sm font-medium text-brand-soft hover:text-brand"
            >
              Full registry report →
            </a>
          ) : (
            <a href="/guide/registry" className="whitespace-nowrap text-sm font-medium text-brand-soft hover:text-brand">
              Get your full list →
            </a>
          )}
        </div>
      </NeuCard>
    </section>
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

      <InsuranceOverviewSection services={services} holdings={data.holdings} />

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
