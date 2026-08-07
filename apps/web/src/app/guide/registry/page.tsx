import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "../../../components/site-nav.js";
import { NeuButton, NeuCard } from "../../../components/ui/neu.js";

export const metadata: Metadata = {
  title: "Get your full insurance list | Fixplo.ai",
  description:
    "Three minutes on Israel's official registry gives you a list of every insurance policy you hold at every company. Upload it and see your whole picture.",
};

/**
 * The Har haBituach guide: how to fetch the official list of everything you
 * hold, and what Fixplo does with it. Static on purpose — the customer does
 * the authenticated part themselves on the government site; Fixplo never
 * asks for credentials and never touches the login. That line is the whole
 * privacy story of this feature, so the page says it out loud.
 */
const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Open Har haBituach",
    body: 'Go to harb.cma.gov.il — "הר הביטוח", the insurance registry run by Israel\'s Capital Market Authority. It is free and it already knows every policy you hold, at every company.',
  },
  {
    title: "Verify it is you",
    body: "The site verifies you with your ID number and a code to your phone. This happens between you and the government site only — Fixplo is not involved and never asks for these details.",
  },
  {
    title: "Download your list",
    body: "You get an instant table of every insurance policy registered to you: company, type, status. Download it — the Excel export is best (it keeps every premium as data), and PDF works too.",
  },
  {
    title: "Upload it here",
    body: "Drop the file on the upload page like any bill. Fixplo recognises it is a registry, lists every policy in your portfolio, and flags families where you hold policies at more than one company — the classic double-coverage waste.",
  },
];

export default function RegistryGuidePage() {
  return (
    <div className="fx min-h-screen">
      <SiteNav />

      <main className="mx-auto max-w-3xl px-5 pb-16 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-soft">Guide</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          See every policy you hold — in 3 minutes
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Insurance statements arrive one company at a time, so nobody sees their whole picture.
          Israel keeps one: an official registry of every policy at every insurer. Fetch your list
          once, upload it here, and your dashboard shows everything you hold — including the
          policies you forgot exist.
        </p>

        <ol className="mt-8 space-y-4">
          {STEPS.map((step, i) => (
            <NeuCard as="li" key={step.title} className="flex gap-4 px-5 py-4">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 flex-none place-items-center rounded-button font-mono text-sm font-bold text-brand-soft neu-inset"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold text-ink">{step.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{step.body}</span>
              </span>
            </NeuCard>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <NeuButton href="https://harb.cma.gov.il" tone="brand">
            Open Har haBituach
          </NeuButton>
          <NeuButton href="/upload" tone="savings">
            I have my list — upload it
          </NeuButton>
        </div>

        <NeuCard className="mt-10" elevation="inset">
          <p className="text-sm leading-relaxed text-muted">
            <strong className="text-ink">Why we do it this way.</strong> Fixplo never asks for your
            government login and never accesses the registry for you — you fetch your own list, we
            explain it. The upload is encrypted like everything else, it is yours to delete, and
            pension savings also have their own registry report (המסלקה הפנסיונית) you can order and
            upload the same way. Fixplo explains what you hold; it does not recommend moving to any
            specific company or fund.
          </p>
        </NeuCard>
      </main>

      <SiteFooter />
    </div>
  );
}
