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

/**
 * Markets known to split sub-nationally, seeded ahead of the research that
 * would discover them.
 *
 * US electricity is the case that matters: a regulated regional monopoly in
 * most states, a competitive retail-choice market in these. One country-level
 * `switchable` boolean is wrong for whichever side it does not describe, and
 * being wrong towards "monopoly" silently deletes the biggest saving those
 * customers have.
 *
 * These are a hint about WHERE TO LOOK, never the answer — each region is
 * researched on its own terms and decides its own market structure. Country
 * research adds to this list at runtime via `marketStructure.regionsThatDiffer`.
 */
export const REGION_SEEDS: Record<string, Record<string, string[]>> = {
  US: {
    energy: ["TX", "PA", "OH", "IL", "NY", "NJ", "MD", "MA", "CT", "ME", "NH", "RI", "DE", "MI", "DC"],
  },
};

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

export interface Market {
  country: string;
  /** "" for the country-level playbook. */
  region: string;
  utility: string;
}

export interface SeedResult {
  requested: number;
  enqueued: number;
  alreadyPresent: number;
  markets: Market[];
}

/** Bare ISO-3166-2 subdivision code, or "" if it is not one. */
const normRegion = (s: string): string => {
  const v = s.trim().toUpperCase().replace(/^[A-Z]{2}-/, "");
  return /^[A-Z0-9]{1,3}$/.test(v) ? v : "";
};

/**
 * Enqueue the markets that have no row yet. Existing rows — researched or
 * already queued — are left alone, so seeding is safe to repeat and never
 * discards work already paid for.
 *
 * Region rows drain behind every country row of the same utility: the country
 * answer is the one that serves most bills, and a region row only ever refines
 * an answer the fallback already provides.
 */
export async function enqueueMarkets(wanted: Market[]): Promise<SeedResult> {
  if (wanted.length === 0) return { requested: 0, enqueued: 0, alreadyPresent: 0, markets: [] };
  const countries = [...new Set(wanted.map((w) => w.country))];
  const utilities = [...new Set(wanted.map((w) => w.utility))];

  const existing = await db()
    .select({
      country: schema.utilityPlaybooks.country,
      region: schema.utilityPlaybooks.region,
      utility: schema.utilityPlaybooks.utility,
    })
    .from(schema.utilityPlaybooks)
    .where(
      and(
        inArray(schema.utilityPlaybooks.country, countries),
        inArray(schema.utilityPlaybooks.utility, utilities),
      ),
    );
  const key = (m: Market) => `${m.country}/${m.region}/${m.utility}`;
  const have = new Set(existing.map(key));
  const fresh = wanted.filter((w) => !have.has(key(w)));

  if (fresh.length > 0) {
    await db()
      .insert(schema.utilityPlaybooks)
      .values(
        fresh.map((m) => ({
          country: m.country,
          region: m.region,
          utility: m.utility,
          status: "pending",
          data: null,
          priority: (PRIORITY[m.utility] ?? 100) + (m.region ? 50 : 0),
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

/**
 * Enqueue every (country × utility) combination, plus the sub-national rows
 * for any of them that `REGION_SEEDS` says do not have a single national
 * answer.
 */
export async function seedMarkets(args: {
  countries: string[];
  utilities: string[];
  /** Set false to queue country-level rows only. */
  includeRegions?: boolean;
}): Promise<SeedResult> {
  const countries = args.countries.map((c) => c.trim().toUpperCase()).filter(Boolean);
  const utilities = args.utilities.map(norm).filter(Boolean);

  const wanted: Market[] = [];
  for (const country of countries) {
    for (const utility of utilities) {
      wanted.push({ country, region: "", utility });
      if (args.includeRegions === false) continue;
      for (const raw of REGION_SEEDS[country]?.[utility] ?? []) {
        const region = normRegion(raw);
        if (region) wanted.push({ country, region, utility });
      }
    }
  }
  return enqueueMarkets(wanted);
}

/**
 * Distinguish "this market cannot be researched" from "the API is down".
 *
 * The attempt counter exists to stop a genuinely impossible market consuming
 * budget forever. A global outage — no credits, rate limited, provider 5xx —
 * is neither the market's fault nor permanent, and letting it burn attempts
 * would mark the entire queue `failed` during an incident and require a
 * manual reset afterwards. On these, the run aborts with the queue intact.
 */
export function isGlobalOutage(detail: string | undefined): boolean {
  if (!detail) return false;
  return /credit balance|billing|rate.?limit|429|overloaded|529|50\d\s|internal server error|timeout/i.test(
    detail,
  );
}

export interface DrainResult {
  attempted: number;
  researched: number;
  failed: number;
  remaining: number;
  /** Region rows queued because a country pass reported the market splits. */
  regionsDiscovered: Market[];
  /** Set when the run stopped early because the API itself was unavailable. */
  abortedBy?: string;
  results: Array<{
    country: string;
    region: string;
    utility: string;
    ok: boolean;
    switchable?: boolean;
    error?: string;
  }>;
}

/**
 * Research up to `limit` queued markets, stopping early if the time budget
 * runs low. Each row records its own outcome, so a market that keeps failing
 * is visible rather than silently retried forever.
 */
export async function drainQueue(args: { limit?: number; budgetMs?: number } = {}): Promise<DrainResult> {
  const limit = Math.min(args.limit ?? 1, 10);
  // The function itself is killed at maxDuration = 800s.
  const budgetMs = args.budgetMs ?? 780_000;
  const startedAt = Date.now();
  /**
   * Observed worst-case for one research pass, grown as we measure. Starting
   * a market we cannot finish is worse than stopping: the API call still runs
   * and is still billed, the function is killed mid-flight, and the result is
   * thrown away. Assume a slow one until proven otherwise.
   */
  let slowestMs = 600_000;

  const pending = await db()
    .select()
    .from(schema.utilityPlaybooks)
    .where(and(eq(schema.utilityPlaybooks.status, "pending"), sql`${schema.utilityPlaybooks.attempts} < 3`))
    .orderBy(asc(schema.utilityPlaybooks.priority), asc(schema.utilityPlaybooks.createdAt))
    .limit(limit);

  const results: DrainResult["results"] = [];
  const regionsDiscovered: Market[] = [];
  let researched = 0;
  let failed = 0;
  let abortedBy: string | undefined;

  for (const row of pending) {
    // Never START a pass we cannot FINISH — a killed call is billed and lost.
    const elapsed = Date.now() - startedAt;
    if (elapsed + slowestMs > budgetMs) break;

    const itemStartedAt = Date.now();
    const { record, error, detail } = await getOrResearchPlaybook({
      country: row.country,
      region: row.region,
      utility: row.utility,
      exact: true,
      force: true,
    });
    slowestMs = Math.max(slowestMs, Date.now() - itemStartedAt);

    if (record) {
      researched++;
      results.push({
        country: row.country,
        region: row.region,
        utility: row.utility,
        ok: true,
        switchable: record.playbook.marketStructure.switchable,
      });

      /**
       * The queue extending itself: a country pass that found the market
       * splits sub-nationally tells us exactly which subdivisions its own
       * answer does not cover, and those become queued rows. This is how a
       * market we never anticipated — not just US electricity — gets a
       * correct answer without anyone hand-listing its regions.
       *
       * Bounded by the schema's 20-code cap and by the queue itself: they are
       * enqueued at low priority, drained one per cron run like everything
       * else, and never researched inline on a customer's request.
       */
      const ms = record.playbook.marketStructure;
      if (row.region === "" && ms.variesByRegion && ms.regionsThatDiffer.length > 0) {
        const seeded = await enqueueMarkets(
          ms.regionsThatDiffer
            .map((r) => normRegion(r))
            .filter(Boolean)
            .map((region) => ({ country: row.country, region, utility: row.utility })),
        );
        regionsDiscovered.push(...seeded.markets);
        if (seeded.enqueued > 0) {
          console.log(
            `[playbook-queue] ${row.country}/${row.utility} varies by ${ms.regionLabel ?? "region"}; queued ${seeded.enqueued} region(s): ${seeded.markets.map((m) => m.region).join(", ")}`,
          );
        }
      }
    } else {
      failed++;
      const outage = isGlobalOutage(detail);
      await db()
        .update(schema.utilityPlaybooks)
        .set({
          // An outage is not this market's fault — record it, but do not
          // spend one of its three chances on it.
          attempts: outage ? row.attempts : row.attempts + 1,
          lastError: `${error ?? "unknown"}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
          status: !outage && row.attempts + 1 >= 3 ? "failed" : "pending",
        })
        .where(eq(schema.utilityPlaybooks.id, row.id));
      results.push({
        country: row.country,
        region: row.region,
        utility: row.utility,
        ok: false,
        error: error ?? "unknown",
      });
      if (outage) {
        // Every remaining call would fail the same way; stop wasting the run.
        abortedBy = detail?.slice(0, 160) ?? error;
        break;
      }
    }
  }

  const [{ count } = { count: 0 }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.utilityPlaybooks)
    .where(eq(schema.utilityPlaybooks.status, "pending"));

  return {
    attempted: pending.length,
    researched,
    failed,
    remaining: count,
    regionsDiscovered,
    results,
    ...(abortedBy ? { abortedBy } : {}),
  };
}
