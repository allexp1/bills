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

let tenantSingleton: Db | undefined;
let warnedNoTenantUrl = false;

/**
 * Connection for signed-in account traffic, using the bills_tenant role that
 * row level security policies apply to. Everything else, meaning the ingestion
 * pipeline, the crons and the share page, keeps using db() as the owner and is
 * deliberately exempt: those paths have no session, since a bill arrives from
 * WhatsApp long before anyone visits the website.
 *
 * With DATABASE_URL_TENANT unset this falls back to the owner connection. The
 * repository layer still scopes every query and its guard test still fails the
 * build if one does not, so the fallback loses the second layer rather than
 * all isolation. It warns once, because losing a layer quietly is how you end
 * up believing you have two.
 */
export function tenantDb(): Db {
  const url = process.env.DATABASE_URL_TENANT;
  if (!url) {
    if (!warnedNoTenantUrl) {
      warnedNoTenantUrl = true;
      console.warn(
        "[db] DATABASE_URL_TENANT is not set: account queries fall back to the owner connection, so row level security is not enforced. Repository-level tenant scoping still applies.",
      );
    }
    return db();
  }
  tenantSingleton ??= createDb(url);
  return tenantSingleton;
}
