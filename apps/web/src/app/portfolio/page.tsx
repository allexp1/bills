import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { tenantDb } from "@bills/db";
import { getDashboard } from "@bills/db/repo/dashboard";
import { resolveCustomer } from "../../server/auth/resolve-customer.js";
import { clerkEnabled } from "../../lib/clerk-enabled.js";
import { SiteFooter, SiteNav } from "../../components/site-nav.js";
import { Money, NeuBadge, NeuButton, NeuCard } from "../../components/ui/neu.js";
import { RetentionNotice } from "./retention-notice.js";
import { DashboardView } from "./dashboard-view.js";

/* Reads a session, so it can never be prerendered. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your portfolio | Fixplo.ai",
  description: "Every bill you have decoded, what you pay, and what is being negotiated.",
};

/* Shown to anyone without a session, and to everyone when Clerk is switched
   off. Middleware no longer force-protects this route, because auth.protect()
   answers a signed-out visitor with a 404, which is both unhelpful and untrue:
   the page exists, they just need to sign in. */
function SignedOutView({ reason }: { reason: "signed-out" | "unconfigured" }) {
  return (
    <div className="fx min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="text-3xl font-extrabold text-ink">
          {reason === "signed-out" ? "Sign in to see your bills" : "Accounts are not switched on yet"}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          {reason === "signed-out"
            ? "If you have sent bills through WhatsApp before, signing in with that same number brings the whole history with it."
            : "You can still upload a bill and get it decoded. Saved history arrives once accounts are enabled."}
        </p>
        <div className="mt-8 flex justify-center">
          <NeuButton href={reason === "signed-out" ? "/sign-in" : "/upload"} size="lg">
            {reason === "signed-out" ? "Sign in" : "Upload a bill"}
          </NeuButton>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function PortfolioPage() {
  /* auth() throws when Clerk is not configured, so it must not be reached. */
  if (!clerkEnabled) return <SignedOutView reason="unconfigured" />;

  const { userId } = await auth();

  if (!userId) return <SignedOutView reason="signed-out" />;

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

  const dashboard = await getDashboard(tenantDb(), customerId);

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

        <RetentionNotice consented={retentionConsentAt !== null} billCount={dashboard.billCount} />

        <DashboardView data={dashboard} />

      </main>

      <SiteFooter />
    </div>
  );
}
