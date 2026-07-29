import { eq } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { withoutTenant } from "@bills/db/tenant";
import { waHash } from "@bills/shared";
import { env } from "../env.js";

/**
 * Maps a Clerk user onto a customer row.
 *
 * Customers predate the web login: every bill sent over WhatsApp or Telegram
 * already belongs to one. So signing in must attach to the existing row rather
 * than create a parallel identity, otherwise a long-standing user logs in and
 * finds an empty portfolio next to months of history they cannot see.
 *
 * Linking happens by VERIFIED phone only. Clerk proves the number belongs to
 * whoever is signing in, and wa_hash is the same peppered hash of the same
 * number, so the match is sound. An unverified phone links nothing: anyone
 * could type a stranger's number and inherit their bills.
 *
 * Runs through withoutTenant because resolution happens before there is a
 * tenant to scope to. It is the one auth path allowed to do that, and it only
 * ever reads or writes the single row it resolves.
 */

export interface ClerkIdentity {
  userId: string;
  /** E.164, and only present here when Clerk reports it as verified. */
  verifiedPhone: string | null;
  verifiedEmail: string | null;
  displayName: string | null;
  locale: string;
}

export interface ResolvedCustomer {
  customerId: string;
  /** True when this sign-in adopted an existing WhatsApp or Telegram history. */
  linkedExisting: boolean;
  /** Null until the customer opts in. Bills are not kept without it. */
  retentionConsentAt: Date | null;
}

export async function resolveCustomer(identity: ClerkIdentity): Promise<ResolvedCustomer> {
  return withoutTenant(db(), "clerk sign-in: resolve or create the customer row", async (tx) => {
    const byClerk = await tx
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.clerkUserId, identity.userId))
      .limit(1);

    const existing = byClerk[0];
    if (existing) {
      /* Someone who signed up with Google or email got a placeholder row, with
         no way to reach the bills they had already sent over WhatsApp. If they
         later verify a phone that matches one of those rows, move the Clerk
         link onto it.

         Only when the placeholder holds no invoices of its own. Otherwise this
         would orphan bills they uploaded from the website in the meantime, and
         merging two histories is a decision for them, not for a login. */
      const isPlaceholder = existing.waId.startsWith("clerk:");
      if (isPlaceholder && identity.verifiedPhone) {
        const hash = waHash(identity.verifiedPhone, env.waHashPepper);
        const prior = (
          await tx.select().from(schema.customers).where(eq(schema.customers.waHash, hash)).limit(1)
        )[0];

        if (prior && !prior.clerkUserId && prior.id !== existing.id) {
          const owned = await tx
            .select({ id: schema.invoices.id })
            .from(schema.invoices)
            .where(eq(schema.invoices.customerId, existing.id))
            .limit(1);

          if (owned.length === 0) {
            await tx
              .update(schema.customers)
              .set({ clerkUserId: null })
              .where(eq(schema.customers.id, existing.id));
            await tx
              .update(schema.customers)
              .set({
                clerkUserId: identity.userId,
                email: identity.verifiedEmail ?? prior.email,
                displayName: prior.displayName ?? identity.displayName,
                linkedAt: new Date(),
              })
              .where(eq(schema.customers.id, prior.id));

            return {
              customerId: prior.id,
              linkedExisting: true,
              retentionConsentAt: prior.retentionConsentAt ?? null,
            };
          }
        }
      }

      return {
        customerId: existing.id,
        linkedExisting: false,
        retentionConsentAt: existing.retentionConsentAt ?? null,
      };
    }

    // Second: adopt the WhatsApp identity, but only on a verified number.
    if (identity.verifiedPhone) {
      const hash = waHash(identity.verifiedPhone, env.waHashPepper);
      const byPhone = await tx
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.waHash, hash))
        .limit(1);

      const prior = byPhone[0];
      if (prior && !prior.clerkUserId) {
        await tx
          .update(schema.customers)
          .set({
            clerkUserId: identity.userId,
            email: identity.verifiedEmail ?? prior.email,
            displayName: prior.displayName ?? identity.displayName,
            linkedAt: new Date(),
          })
          .where(eq(schema.customers.id, prior.id));

        return {
          customerId: prior.id,
          linkedExisting: true,
          retentionConsentAt: prior.retentionConsentAt ?? null,
        };
      }
    }

    // Otherwise this is a genuinely new person.
    const created = await tx
      .insert(schema.customers)
      .values({
        waId: identity.verifiedPhone ?? `clerk:${identity.userId}`,
        waHash: identity.verifiedPhone
          ? waHash(identity.verifiedPhone, env.waHashPepper)
          : waHash(`clerk:${identity.userId}`, env.waHashPepper),
        clerkUserId: identity.userId,
        email: identity.verifiedEmail,
        displayName: identity.displayName,
        locale: identity.locale,
        linkedAt: new Date(),
      })
      .returning({ id: schema.customers.id });

    const row = created[0];
    if (!row) throw new Error("failed to create customer for clerk user");

    return { customerId: row.id, linkedExisting: false, retentionConsentAt: null };
  });
}
