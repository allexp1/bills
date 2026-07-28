import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { asc } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { establishedTerms, type PlaybookObservation } from "@bills/category-packs";
import { getOrResearchPlaybook, readPlaybook } from "../../../../server/playbook-store.js";
import {
  DEFAULT_COUNTRIES,
  DEFAULT_UTILITIES,
  drainQueue,
  REGION_SEEDS,
  seedMarkets,
} from "../../../../server/playbook-queue.js";

export const runtime = "nodejs";
/** Research is a slow multi-search pass; give it Fluid-compute headroom. */
export const maxDuration = 800;

/**
 * The playbook command: inspect and pre-warm researched market knowledge.
 *
 *   GET /api/admin/playbook?secret=…&action=list
 *   GET /api/admin/playbook?secret=…&action=get&country=IL&utility=water
 *   GET /api/admin/playbook?secret=…&action=research&country=IL&utility=water[&force=1]
 *   GET /api/admin/playbook?secret=…&action=research&country=US&region=TX&utility=energy
 *
 * `region` is a bare ISO-3166-2 subdivision and defaults to "" (the country as
 * a whole). It exists because some markets are not national — US electricity is
 * a monopoly in most states and competitive in Texas — and a bill from a region
 * with its own playbook uses it in preference to the country's.
 *
 * Pre-warming matters operationally: the first customer to send a bill in an
 * unresearched market otherwise waits for the whole research pass. Running
 * this ahead of a launch country makes that customer's analysis as fast as
 * everyone else's.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.DEV_TRY_SECRET;
  if (!secret) return new NextResponse("disabled", { status: 404 });
  const provided = req.nextUrl.searchParams.get("secret") ?? "";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  if (!timingSafeEqual(a, b)) return new NextResponse("wrong secret", { status: 401 });

  const params = req.nextUrl.searchParams;
  const action = params.get("action") ?? "list";
  const country = params.get("country") ?? "";
  const utility = params.get("utility") ?? "";
  /** Bare ISO-3166-2 subdivision ("TX"); "" or absent means country-level. */
  const region = params.get("region") ?? "";

  if (action === "seed") {
    const countries = (params.get("countries") ?? DEFAULT_COUNTRIES.join(",")).split(",");
    const utilities = (params.get("utilities") ?? DEFAULT_UTILITIES.join(",")).split(",");
    const includeRegions = params.get("regions") !== "0";
    // The confirm gate must count what will ACTUALLY be researched, region
    // rows included — quoting a cost that leaves half the queue out is worse
    // than not quoting one.
    const cs = countries.map((c) => c.trim().toUpperCase()).filter(Boolean);
    const us = utilities.map((u) => u.trim().toLowerCase()).filter(Boolean);
    const regionRows = includeRegions
      ? cs.reduce((n, c) => n + us.reduce((m, u) => m + (REGION_SEEDS[c]?.[u]?.length ?? 0), 0), 0)
      : 0;
    const total = cs.length * us.length + regionRows;
    // Every queued row becomes a real research call with real cost. Anything
    // beyond a handful needs saying out loud before it is spent.
    if (total > 20 && params.get("confirm") !== "1") {
      return NextResponse.json(
        {
          error: "confirm_required",
          wouldEnqueue: total,
          estimatedCostUsd: `~$${(total * 0.5).toFixed(0)}–$${(total * 1.5).toFixed(0)}`,
          hint: "Each market is a multi-search Opus research pass. Re-send with &confirm=1 to queue them, or narrow with &countries=…&utilities=…",
        },
        { status: 409 },
      );
    }
    const seeded = await seedMarkets({ countries, utilities, includeRegions });
    return NextResponse.json({
      ...seeded,
      note: "Queued. The playbook-warm cron drains a few per run; use action=drain to push it along now.",
    });
  }

  if (action === "drain") {
    const result = await drainQueue({ limit: Number(params.get("limit") ?? 3) });
    return NextResponse.json(result);
  }

  if (action === "list") {
    const rows = await db()
      .select({
        country: schema.utilityPlaybooks.country,
        region: schema.utilityPlaybooks.region,
        utility: schema.utilityPlaybooks.utility,
        version: schema.utilityPlaybooks.version,
        billsSeen: schema.utilityPlaybooks.billsSeen,
        providers: schema.utilityPlaybooks.providers,
        researchedAt: schema.utilityPlaybooks.researchedAt,
        status: schema.utilityPlaybooks.status,
        attempts: schema.utilityPlaybooks.attempts,
        lastError: schema.utilityPlaybooks.lastError,
      })
      .from(schema.utilityPlaybooks)
      .orderBy(
        asc(schema.utilityPlaybooks.country),
        asc(schema.utilityPlaybooks.region),
        asc(schema.utilityPlaybooks.utility),
      );
    return NextResponse.json({
      count: rows.length,
      researched: rows.filter((r) => r.status === "ok").length,
      pending: rows.filter((r) => r.status === "pending").length,
      failed: rows.filter((r) => r.status === "failed").length,
      regionRows: rows.filter((r) => r.region !== "").length,
      markets: rows,
    });
  }

  if (!country || !utility) {
    return NextResponse.json({ error: "country and utility are required" }, { status: 400 });
  }

  if (action === "get") {
    // Exact key: "did WE research this region", not "what would a bill see".
    const record = await readPlaybook(country, utility, region);
    if (!record) return NextResponse.json({ error: "not_researched" }, { status: 404 });
    return NextResponse.json({
      ...record,
      // Surface only vocabulary that cleared the k-anonymity threshold.
      establishedTerms: establishedTerms(record.observations as PlaybookObservation[]),
      observations: undefined,
    });
  }

  if (action === "research") {
    const started = Date.now();
    const { record, researched, error, detail } = await getOrResearchPlaybook({
      country,
      utility,
      region,
      // Spending here is deliberate: research the exact key asked for.
      exact: true,
      language: params.get("language"),
      force: params.get("force") === "1",
    });
    if (!record) {
      return NextResponse.json(
        { error: error ?? "research_failed", detail, tookMs: Date.now() - started },
        { status: 502 },
      );
    }
    return NextResponse.json({
      researched,
      tookMs: Date.now() - started,
      country: record.country,
      region: record.region,
      utility: record.utility,
      version: record.version,
      switchable: record.playbook.marketStructure.switchable,
      marketModel: record.playbook.marketStructure.model,
      variesByRegion: record.playbook.marketStructure.variesByRegion,
      regionsThatDiffer: record.playbook.marketStructure.regionsThatDiffer,
      levers: record.playbook.levers.map((l) => ({
        id: l.id,
        titleEn: l.titleEn,
        quantifiable: l.quantifiable,
        requiresSwitching: l.requiresSwitching,
      })),
      schemes: record.playbook.schemes.map((s) => s.name),
      confidence: record.playbook.confidence,
      sourceCount: record.playbook.sources.length,
    });
  }

  return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
}
