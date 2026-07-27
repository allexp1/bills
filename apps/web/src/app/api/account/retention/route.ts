import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { tenantDb } from "@bills/db";
import { setRetentionConsent } from "@bills/db/repo/portfolio";
import { resolveCustomer } from "../../../../server/auth/resolve-customer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ consented: z.boolean() });

/**
 * Retention is the customer's decision, so it is recorded against their own
 * row and nothing else. The customerId comes from the Clerk session, never
 * from the request body: a body-supplied id would let anyone flip retention
 * for a stranger, and turning it off deletes their history.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

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

  await setRetentionConsent(tenantDb(), customerId, parsed.data.consented);

  return NextResponse.json({ ok: true, consented: parsed.data.consented });
}
