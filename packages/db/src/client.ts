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
