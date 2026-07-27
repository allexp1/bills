import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { getOrResearchPlaybook } from "./playbook-store.js";

/**
 * Warming queue for market research.
 *
 * Researching a market takes a minute or more of web searching, so it cannot
 * be done for a whole matrix inside one request. Instead a market is enqueued
 * as a `pending` row and a cron drains the queue a few at a time. By the time
 * a customer sends a bill from a warmed market, the answer is already a
 * database read.
 *
 * Cost is the reason this is a queue and not a loop: every row is a real
 * research call. Seeding is explicit and counted, and the drain is bounded by
 * both a row limit and a wall-clock budget.
 */

/**
 * Bill types worth their own playbook. The three with bespoke packs are here
 * too — a playbook does not replace them, it adds the local market facts
 * (regulator, schemes, common errors, benchmarks) their hand-written levers
 * cannot know.
 */
export const DEFAULT_UTILITIES = [
  "water",
  "waste",
  "energy",
  "mobile",
  "broadband",
  "heating",
  "property_tax",
  "home_insurance",
  "car_insurance",
  "gym",
] as const;

/** Markets the product already has provider data for, plus the home market. */
export const DEFAULT_COUNTRIES = ["IL", "ES", "GB", "DE", "PT", "FR", "US", "BR", "MX"] as const;

/** Warm the everyday, high-volume bills first. */
const PRIORITY: Record<string, number> = {
  water: 10,
  energy: 10,
  mobile: 20,
  broadband: 20,
  waste: 30,
  heating: 40,
  property_tax: 50,
  home_insurance: 60,
  car_insurance: 60,
  gym: 80,
};

const norm = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export interface SeedResult {
  requested: number;
  enqueued: number;
  alreadyPresent: number;
  markets: Array<{ country: string; utility: string }>;
}

/**
 * Enqueue every (country × utility) combination that has no row yet. Existing
 * rows — researched or already queued — are left alone, so seeding is safe to
 * repeat and never discards work already paid for.
 */
export async function seedMarkets(args: {
  countries: string[];
  utilities: string[];
}): Promise<SeedResult> {
  const countries = args.countries.map((c) => c.trim().toUpperCase()).filter(Boolean);
  const utilities = args.utilities.map(norm).filter(Boolean);

  const wanted = countries.flatMap((country) => utilities.map((utility) => ({ country, utility })));
  if (wanted.length === 0) return { requested: 0, enqueued: 0, alreadyPresent: 0, markets: [] };

  const existing = await db()
    .select({ country: schema.utilityPlaybooks.country, utility: schema.utilityPlaybooks.utility })
    .from(schema.utilityPlaybooks)
    .where(
      and(
        inArray(schema.utilityPlaybooks.country, countries),
        inArray(schema.utilityPlaybooks.utility, utilities),
      ),
    );
  const have = new Set(existing.map((e) => `${e.country}/${e.utility}`));
  const fresh = wanted.filter((w) => !have.has(`${w.country}/${w.utility}`));

  if (fresh.length > 0) {
    await db()
      .insert(schema.utilityPlaybooks)
      .values(
        fresh.map((m) => ({
          country: m.country,
          utility: m.utility,
          status: "pending",
          data: null,
          priority: PRIORITY[m.utility] ?? 100,
        })),
      )
      .onConflictDoNothing();
  }

  return {
    requested: wanted.length,
    enqueued: fresh.length,
    alreadyPresent: wanted.length - fresh.length,
    markets: fresh,
  };
}

export interface DrainResult {
  attempted: number;
  researched: number;
  failed: number;
  remaining: number;
  results: Array<{ country: string; utility: string; ok: boolean; switchable?: boolean; error?: string }>;
}

/**
 * Research up to `limit` queued markets, stopping early if the time budget
 * runs low. Each row records its own outcome, so a market that keeps failing
 * is visible rather than silently retried forever.
 */
export async function drainQueue(args: { limit?: number; budgetMs?: number } = {}): Promise<DrainResult> {
  const limit = Math.min(args.limit ?? 3, 10);
  // Leave headroom under the route's maxDuration for the final write.
  const budgetMs = args.budgetMs ?? 640_000;
  const startedAt = Date.now();

  const pending = await db()
    .select()
    .from(schema.utilityPlaybooks)
    .where(and(eq(schema.utilityPlaybooks.status, "pending"), sql`${schema.utilityPlaybooks.attempts} < 3`))
    .orderBy(asc(schema.utilityPlaybooks.priority), asc(schema.utilityPlaybooks.createdAt))
    .limit(limit);

  const results: DrainResult["results"] = [];
  let researched = 0;
  let failed = 0;

  for (const row of pending) {
    // A single research pass can take minutes; never start one we cannot finish.
    if (Date.now() - startedAt > budgetMs) break;

    const { record, error, detail } = await getOrResearchPlaybook({
      country: row.country,
      utility: row.utility,
      force: true,
    });

    if (record) {
      researched++;
      results.push({
        country: row.country,
        utility: row.utility,
        ok: true,
        switchable: record.playbook.marketStructure.switchable,
      });
    } else {
      failed++;
      await db()
        .update(schema.utilityPlaybooks)
        .set({
          attempts: row.attempts + 1,
          lastError: `${error ?? "unknown"}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
          // Three strikes and it stops consuming budget; visible in `list`.
          status: row.attempts + 1 >= 3 ? "failed" : "pending",
        })
        .where(eq(schema.utilityPlaybooks.id, row.id));
      results.push({ country: row.country, utility: row.utility, ok: false, error: error ?? "unknown" });
    }
  }

  const [{ count } = { count: 0 }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.utilityPlaybooks)
    .where(eq(schema.utilityPlaybooks.status, "pending"));

  return { attempted: pending.length, researched, failed, remaining: count, results };
}
