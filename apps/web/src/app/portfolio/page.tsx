import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@bills/db";
import { getPortfolio, type PortfolioEntry } from "@bills/db/repo/portfolio";
import { resolveCustomer } from "../../server/auth/resolve-customer.js";
import { SiteFooter, SiteNav } from "../../components/site-nav.js";
import { Money, NeuBadge, NeuButton, NeuCard } from "../../components/ui/neu.js";
import { RetentionNotice } from "./retention-notice.js";

/* Reads a session, so it can never be prerendered. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your portfolio | Fixplo.ai",
  description: "Every bill you have decoded, what you pay, and what is being negotiated.",
};

function formatMoney(minor: number | null, currency: string | null): string {
  if (minor === null) return "n/a";
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

const statusLabel: Record<PortfolioEntry["status"], { text: string; tone: "savings" | "brand" | "neutral" | "warning" }> = {
  optimized: { text: "Optimised", tone: "savings" },
  negotiating: { text: "Negotiating", tone: "brand" },
  audited: { text: "Audited", tone: "neutral" },
  requires_review: { text: "Requires review", tone: "warning" },
};

export default async function PortfolioPage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="fx min-h-screen">
        <SiteNav />
        <main className="mx-auto max-w-2xl px-5 py-24 text-center">
          <h1 className="text-3xl font-extrabold text-ink">Sign in to see your bills</h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            If you have sent bills through WhatsApp before, signing in with that same number brings
            the whole history with it.
          </p>
          <div className="mt-8 flex justify-center">
            <NeuButton href="/sign-in" size="lg">
              Sign in
            </NeuButton>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const user = await currentUser();
  const verifiedPhone =
    user?.phoneNumbers.find((p) => p.verification?.status === "verified")?.phoneNumber ?? null;
  const verifiedEmail =
    user?.emailAddresses.find((e) => e.verification?.status === "verified")?.emailAddress ?? null;

  const { customerId, linkedExisting, retentionConsentAt } = await resolveCustomer({
    userId,
    verifiedPhone,
    verifiedEmail,
    displayName: user?.firstName ?? null,
    locale: "en",
  });

  const portfolio = await getPortfolio(db(), customerId);

  return (
    <div className="fx min-h-screen">
      <SiteNav />

      <main className="mx-auto max-w-6xl px-5 pb-10 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-soft">
              Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Utility portfolio overview
            </h1>
          </div>
          <NeuButton href="/upload" tone="savings">
            Upload another bill
          </NeuButton>
        </div>

        {linkedExisting ? (
          <NeuCard className="mt-6" elevation="inset">
            <p className="text-sm leading-relaxed text-muted">
              We matched your verified phone number to bills you had already sent over WhatsApp, so
              your history is here rather than starting empty.
            </p>
          </NeuCard>
        ) : null}

        <RetentionNotice consented={retentionConsentAt !== null} />

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <NeuCard>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">
              Monthly outflow
            </p>
            <p className="mt-3 text-4xl font-extrabold text-ink">
              <Money>{formatMoney(portfolio.monthlyOutflowMinor, portfolio.currency)}</Money>
            </p>
            <p className="mt-3 text-xs text-dim">
              Across {portfolio.providerCount}{" "}
              {portfolio.providerCount === 1 ? "provider" : "providers"}, latest bill each
            </p>
          </NeuCard>

          <NeuCard>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">
              Savings secured
            </p>
            <p className="mt-3 text-4xl font-extrabold text-muted">
              <Money>n/a</Money>
            </p>
            <p className="mt-3 text-xs text-dim">
              Populated once a negotiation completes. Nothing is claimed before then.
            </p>
          </NeuCard>

          <NeuCard>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">
              Active audits
            </p>
            <p className="mt-3 text-4xl font-extrabold text-ink">
              <Money>{portfolio.activeAudits}</Money>
            </p>
            <p className="mt-3 text-xs text-dim">Currently being worked on</p>
          </NeuCard>
        </div>

        <h2 className="mt-12 text-lg font-bold text-ink">Decoded utilities</h2>

        {portfolio.entries.length === 0 ? (
          <NeuCard className="mt-5 py-12 text-center">
            <p className="text-base text-muted">Nothing here yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-dim">
              Upload a bill and it will appear here, with every charge explained and a note of
              whether anything is worth negotiating.
            </p>
            <div className="mt-6 flex justify-center">
              <NeuButton href="/upload">Upload a bill</NeuButton>
            </div>
          </NeuCard>
        ) : (
          <ul className="mt-5 space-y-4">
            {portfolio.entries.map((entry) => {
              const badge = statusLabel[entry.status];
              return (
                <NeuCard as="li" key={entry.invoiceId} className="px-6 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-ink">
                        {entry.providerName ?? "Unnamed provider"}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted">
                        {entry.billingPeriodStart && entry.billingPeriodEnd
                          ? `${entry.billingPeriodStart} to ${entry.billingPeriodEnd}`
                          : (entry.category ?? "Bill")}
                      </p>
                    </div>

                    <div className="flex items-center gap-5">
                      <span className="text-base font-semibold text-ink">
                        <Money>{formatMoney(entry.totalAmountMinor, entry.currency)}</Money>
                      </span>
                      <NeuBadge tone={badge.tone}>{badge.text}</NeuBadge>
                      {entry.summaryTokenId ? (
                        <a
                          href={`/s/${entry.summaryTokenId}`}
                          className="text-sm font-medium text-brand-soft hover:text-brand"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  </div>
                </NeuCard>
              );
            })}
          </ul>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
