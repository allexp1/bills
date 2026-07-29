import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

let singleton: Db | undefined;

export function createDb(
  // Vercel's Supabase marketplace integration injects POSTGRES_URL instead
  // of DATABASE_URL — accept either.
  url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
) {
  if (!url) throw new Error("DATABASE_URL (or POSTGRES_URL) is not set");
  // Serverless-friendly: small pool, no prepared statements — required by
  // transaction-mode poolers (Supabase Supavisor :6543, pgbouncer).
  const sql = postgres(url, { max: 5, prepare: false });
  return drizzle(sql, { schema });
}

export function db(): Db {
  singleton ??= createDb();
  return singleton;
}

/**
 * Handle for signed-in account traffic. Deliberately the same connection as
 * db(): isolation comes from the role switch, not from a second pool.
 *
 * withTenant runs `set local role bills_tenant` inside its transaction, which
 * drops the permissive bills_app policy for the rest of that transaction and
 * leaves only the tenant policies keyed on app.customer_id. Both the role and
 * the setting are transaction-local, so they unwind on commit and cannot leak
 * across a pooled connection.
 *
 * An earlier design dialled a second connection from DATABASE_URL_TENANT and
 * warned on every cold start that "row level security is not enforced" when
 * that variable was unset. It was never going to be set, because bills_tenant
 * was created NOLOGIN, and the claim was false in any case: every account read
 * goes through withTenant and does switch role. The warning has been sitting in
 * the production logs saying the opposite of the truth.
 *
 * Kept as its own function rather than collapsed into db() because the call
 * sites document which traffic is account traffic, and the tenant guard test
 * asserts on them.
 */
export function tenantDb(): Db {
  return db();
}
