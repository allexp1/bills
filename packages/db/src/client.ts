import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

let singleton: Db | undefined;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  // Serverless-friendly: small pool, no prepared statements (pgbouncer/Neon pooler).
  const sql = postgres(url, { max: 5, prepare: false });
  return drizzle(sql, { schema });
}

export function db(): Db {
  singleton ??= createDb();
  return singleton;
}
