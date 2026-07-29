import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db, schema, tenantDb } from "@bills/db";
import { findOwnedInvoice } from "@bills/db/repo/portfolio";
import { mintSummaryToken } from "@bills/pipeline";
import { clerkEnabled } from "../../../../lib/clerk-enabled.js";
import { resolveCustomer } from "../../../../server/auth/resolve-customer.js";
import { env } from "../../../../server/env.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens one of your own bills from the portfolio.
 *
 * The dashboard used to link straight to /s/{summaryTokenId}, which was the
 * id of the row that stores the token rather than the token itself. /s/[token]
 * expects a signed JWT, could not parse a ULID, and answered every attempt
 * with "This link has expired. Message us on WhatsApp again and we'll send a
 * fresh one." Wrong twice over: nothing had expired, and the person reading it
 * was signed in, looking at their own dashboard, and may never have used
 * WhatsApp at all.
 *
 * Storing the token itself instead was never an option. The whole point of
 * keeping only sha256(jti) is that a leaked database does not hand over
 * working links to everybody's bills. So ownership is proven here and a fresh
 * token is minted on the spot.
 *
 * /s/[token] stays exactly as it is: unauthenticated, because the link a
 * customer receives in a WhatsApp thread has to work for someone who has never
 * seen the website.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await ctx.params;

  if (!clerkEnabled) return NextResponse.redirect(new URL("/portfolio", env.summaryBaseUrl));

  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", env.summaryBaseUrl));

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

  /* Tenant-scoped, so a guessed invoice id belonging to someone else reads as
     not found rather than as a permission error. Bounce back to the dashboard
     instead of showing an error page: from the portfolio the only honest
     answer is "that bill is not one of yours", and the dashboard says that by
     simply not listing it. */
  const owned = await findOwnedInvoice(tenantDb(), customerId, invoiceId);
  if (!owned || owned.status === "deleted") {
    return NextResponse.redirect(new URL("/portfolio", env.summaryBaseUrl));
  }

  const minted = mintSummaryToken(invoiceId, env.summaryJwtSecret);
  const [tokenRow] = await db()
    .insert(schema.summaryTokens)
    .values({ invoiceId, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt })
    .returning({ id: schema.summaryTokens.id });

  /* Keep the invoice pointing at the newest token. Nothing reads it to build a
     link any more, but leaving it stale would make the column lie. */
  if (tokenRow) {
    await db()
      .update(schema.invoices)
      .set({ summaryTokenId: tokenRow.id })
      .where(eq(schema.invoices.id, invoiceId))
      .catch(() => {});
  }

  return NextResponse.redirect(new URL(`/s/${minted.token}`, env.summaryBaseUrl));
}
