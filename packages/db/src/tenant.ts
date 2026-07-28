import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

/**
 * Tenant isolation, enforced twice on purpose.
 *
 * Layer 1, this module: every read or write for a signed-in customer runs
 * inside withTenant, which opens a transaction and sets app.customer_id for
 * its duration. Callers receive a transaction handle, not the raw db, so a
 * query written without a tenant filter still cannot see another customer's
 * rows.
 *
 * Layer 2, migration 0006: row level security policies on every tenant table
 * compare their customer_id against current_setting('app.customer_id'). The
 * policies are FORCEd, so they apply to the table owner too. Without the
 * setting the policies match nothing, which means a query that escapes this
 * module returns zero rows rather than everybody's rows.
 *
 * The failure modes are opposite in the two layers, which is the point. A bug
 * in the repository layer is caught by the database. A misconfigured database
 * role is caught by the repository.
 */

export const TENANT_SETTING = "app.customer_id";

export type TenantDb = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}

/** ULIDs only. Anything else is a bug or an injection attempt. */
const CUSTOMER_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function assertCustomerId(customerId: string): string {
  if (!CUSTOMER_ID.test(customerId)) {
    throw new TenantError("customerId is not a valid ULID");
  }
  return customerId;
}

/**
 * Runs `fn` with the tenant context set. Everything inside sees only that
 * customer's rows. The setting is transaction-scoped (set_config with
 * is_local = true), so it cannot leak to the next request on a pooled
 * connection.
 */
export async function withTenant<T>(
  db: Db,
  customerId: string,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  const id = assertCustomerId(customerId);
  return db.transaction(async (tx) => {
    /* The app connects as bills_app, which holds a permissive ALL policy so the
       pipeline and crons can work without a session. Switching role drops that
       policy for the rest of this transaction and leaves only the tenant
       policies, which key off app.customer_id. Both are transaction-local, so
       they unwind on commit or rollback and cannot leak to the next request on
       a pooled connection. */
    await tx.execute(sql`set local role bills_tenant`);
    await tx.execute(sql`select set_config(${TENANT_SETTING}, ${id}, true)`);
    return fn(tx);
  });
}

/**
 * Marks a query that legitimately spans customers: the crons, the media purge,
 * the ingestion pipeline before a customer has been resolved. It does not
 * change permissions, because exemption is by role now rather than by call
 * site. It exists so these paths are greppable and show up in review, and so
 * the guard test can assert that nothing in the repository layer uses it.
 */
export async function withoutTenant<T>(db: Db, reason: string, fn: (tx: TenantDb) => Promise<T>) {
  if (!reason.trim()) throw new TenantError("withoutTenant requires a reason");
  return db.transaction(async (tx) => fn(tx));
}
