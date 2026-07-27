import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { SiteFooter, SiteNav } from "../../../components/site-nav.js";
import { clerkEnabled } from "../../../lib/clerk-enabled.js";

export const metadata: Metadata = { title: "Create account | Fixplo.ai" };

export default function SignUpPage() {
  return (
    <div className="fx min-h-screen">
      <SiteNav />
      <main className="mx-auto flex max-w-lg flex-col items-center px-5 py-16">
        <h1 className="mb-3 text-2xl font-extrabold text-ink">Create your Fixplo account</h1>
        <p className="mb-9 text-center text-sm leading-relaxed text-muted">
          Use the same phone number you send bills from and your history comes with you.
        </p>
        {clerkEnabled ? (
          <SignUp routing="hash" signInUrl="/sign-in" fallbackRedirectUrl="/portfolio" />
        ) : (
          <p className="text-center text-sm text-muted">
            Accounts are not switched on yet. You can still upload a bill and get it decoded.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
