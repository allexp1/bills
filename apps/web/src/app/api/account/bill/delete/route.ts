import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { tenantDb } from "@bills/db";
import { deleteBill } from "@bills/db/repo/delete-bill";
import { resolveCustomer } from "../../../../../server/auth/resolve-customer.js";
import { mediaStore } from "../../../../../server/media-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A ULID, and nothing else. The id is interpolated into no SQL, but validating
   the shape here means a malformed request is a 400 rather than a query. */
const Body = z.object({ invoiceId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/) });

/**
 * Delete one bill.
 *
 * The customerId comes from the Clerk session and never from the body. A
 * body-supplied id on this endpoint would let anyone delete a stranger's bills,
 * which is the worst thing this application could be made to do.
 *
 * The repository is tenant-scoped on top of that, so an id belonging to someone
 * else is not found rather than forbidden: a distinguishable "forbidden" would
 * confirm that the bill exists.
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

  const result = await deleteBill(tenantDb(), customerId, parsed.data.invoiceId);

  if (!result.deleted) {
    if (result.refused === "negotiating") {
      return NextResponse.json(
        {
          error: "negotiating",
          detail:
            "A negotiation is in progress for this bill, and it quotes figures from it. Finish or cancel that first, then delete.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  /* Blobs after the rows, and best effort. The database is the authoritative
     record of what was deleted, so it goes first; a blob left behind is swept by
     the purge cron. Almost always empty in any case: web uploads never store the
     pages at all. */
  for (const key of result.storageKeys) {
    await mediaStore()
      .delete(key)
      .catch((err: unknown) => {
        console.warn(
          "[delete-bill] blob left for the purge cron:",
          err instanceof Error ? err.message.slice(0, 120) : "",
        );
      });
  }

  return NextResponse.json({ ok: true });
}
