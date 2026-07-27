import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "../components/site-nav.js";
import { CallShowcase } from "../components/landing/call-showcase.js";
import { SavingsEstimator } from "../components/landing/savings-estimator.js";
import { Money, NeuBadge, NeuButton, NeuCard, SectionHeading } from "../components/ui/neu.js";

export const metadata: Metadata = {
  title: "Fixplo.ai | The AI that calls your provider and negotiates your bill",
  description:
    "Upload any utility bill. Fixplo explains every line item, works out what the same plan should cost today, then phones your provider and negotiates a better rate while you listen in.",
  openGraph: {
    title: "Fixplo.ai",
    description:
      "Upload any utility bill. Fixplo decodes it, then calls your provider and negotiates a better rate on your behalf.",
    url: "https://fixplo.ai",
    siteName: "Fixplo.ai",
    type: "website",
  },
};

const billTypes = ["Phone", "Internet", "Electricity", "Water", "Gas", "Insurance"];

const steps = [
  {
    n: "01",
    title: "Upload",
    body: "A photo or a PDF, from any country, in any language. Several pages are fine. Nothing needs retyping.",
  },
  {
    n: "02",
    title: "Decode",
    body: "Every line item explained in plain language, with expiring discounts, estimated readings and quiet price rises called out.",
  },
  {
    n: "03",
    title: "Negotiate",
    body: "Set a target and a walk away price. Fixplo calls your provider, says it is an automated assistant, and stays inside your limits.",
  },
];

const features = [
  {
    title: "Line by line decoding",
    body: "Each charge is traced back to the place on your bill it came from, so you can check the reasoning rather than trust it.",
  },
  {
    title: "It makes the call",
    body: "Most people never negotiate because the call is tedious. Fixplo waits in the queue and does the asking for you.",
  },
  {
    title: "Step in whenever",
    body: "Watch the transcript as it happens. Accept an offer, move the call to your own phone, or end it outright.",
  },
  {
    title: "One view of everything",
    body: "Phone, internet, power, water and insurance in a single portfolio, with a note of when each one is worth revisiting.",
  },
  {
    title: "Private by default",
    body: "Bill images are analysed and then discarded rather than stored. Nothing about you is sold, indexed or shared.",
  },
  {
    title: "Built for more than one market",
    body: "Multiple currencies and languages, including right to left layouts, because bills do not stop at one border.",
  },
];

const trust = [
  {
    title: "The AI says what it is",
    body: "Every call opens by stating that the caller is an automated assistant acting with your authorisation. It never pretends to be you.",
  },
  {
    title: "Calls are recorded in full",
    body: "The whole conversation is yours afterwards, including the parts where the negotiation did not go your way.",
  },
  {
    title: "GDPR and encryption",
    body: "Data is encrypted in transit and at rest. You can delete everything Fixplo holds about you at any time, without asking first.",
  },
  {
    title: "No invented savings",
    body: "If your plan is already competitive, Fixplo says so and makes no call. A number you cannot check is worse than no number.",
  },
];

export default function LandingPage() {
  return (
    <div className="fx min-h-screen">
      <SiteNav />

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <NeuBadge tone="brand">Bill decoder and price negotiator</NeuBadge>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-6xl">
              The AI that phones your provider
              <br className="hidden sm:block" /> and asks for a better price
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
              Upload any utility bill. Fixplo reads every line, works out what your plan should cost
              today, then calls your provider and negotiates while you listen in.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <NeuButton href="/upload" size="lg">
                Upload a bill
              </NeuButton>
              <NeuButton href="#how-it-works" tone="quiet" size="lg">
                See how it works
              </NeuButton>
            </div>

            <ul className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
              {billTypes.map((t) => (
                <li
                  key={t}
                  className="rounded-pill bg-card px-4 py-2 text-sm font-medium text-muted neu-raised-sm"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="the-gap" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
          <SectionHeading
            eyebrow="Why this exists"
            title="Staying put is the expensive option"
            lede="Providers keep their better prices for the people who ask. These are published figures for the UK market, not our own claims."
          />

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <NeuCard>
              <p className="text-4xl font-extrabold text-ink">
                <Money>£4.1bn</Money>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Lost each year by customers who stay with their existing supplier, across mobile,
                broadband, home insurance, mortgages and savings.
              </p>
              <p className="mt-4 text-xs text-dim">Citizens Advice super complaint, 2018</p>
            </NeuCard>

            <NeuCard>
              <p className="text-4xl font-extrabold text-ink">
                <Money>£877</Money>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                The average yearly loyalty penalty per household, which is roughly three percent of
                everything a household spends in a year.
              </p>
              <p className="mt-4 text-xs text-dim">Citizens Advice, 2018</p>
            </NeuCard>

            <NeuCard>
              <p className="text-4xl font-extrabold text-savings">
                <Money>£325</Money>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                The typical yearly saving on mobile and broadband for people who do renegotiate.
                Around 18 percent of people never negotiate or switch at all.
              </p>
              <p className="mt-4 text-xs text-dim">Citizens Advice, September 2025</p>
            </NeuCard>
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-dim">
            Those are market averages, and they are somebody else&rsquo;s research. Your number is
            whatever your own bill says once Fixplo has read it.
          </p>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
          <SectionHeading eyebrow="How it works" title="Three steps, and one of them is a phone call" />

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <NeuCard key={s.n}>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-card font-mono text-sm font-bold text-brand neu-inset">
                  {s.n}
                </span>
                <h3 className="mt-5 text-xl font-bold text-ink">{s.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </NeuCard>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <SectionHeading
            eyebrow="The part nobody else does"
            title="Watch the negotiation happen"
            lede="The transcript updates while the call runs. If you do not like where it is going, take it over or end it."
          />
          <div className="mt-12">
            <CallShowcase />
          </div>
          <p className="mt-6 text-center text-xs text-dim">
            Illustration of the live call view. The figures shown are examples, not a customer
            result.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <SectionHeading
            eyebrow="Rough maths"
            title="What the gap might look like"
            lede="A quick sense of scale before you upload anything. The honest version comes afterwards."
          />
          <div className="mt-12">
            <SavingsEstimator />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <SectionHeading eyebrow="What you get" title="Built around the awkward phone call" />

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <NeuCard key={f.title}>
                <h3 className="text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{f.body}</p>
              </NeuCard>
            ))}
          </div>
        </section>

        <section id="privacy" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
          <SectionHeading
            eyebrow="Trust"
            title="An AI calling on your behalf needs rules"
            lede="Letting software speak for you is a real thing to ask of someone. Here is what it will and will not do."
          />

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {trust.map((t) => (
              <NeuCard key={t.title}>
                <h3 className="text-lg font-bold text-ink">{t.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{t.body}</p>
              </NeuCard>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <NeuCard className="px-8 py-14 text-center sm:px-14">
            <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Start with one bill
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
              Pick the bill that annoys you most. Reading it costs nothing, and within a minute you
              will know whether there is anything worth calling about.
            </p>
            <div className="mt-8 flex justify-center">
              <NeuButton href="/upload" size="lg">
                Upload a bill
              </NeuButton>
            </div>
          </NeuCard>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
