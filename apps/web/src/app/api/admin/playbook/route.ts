import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { asc } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { establishedTerms, type PlaybookObservation } from "@bills/category-packs";
import { getOrResearchPlaybook, readPlaybook } from "../../../../server/playbook-store.js";

export const runtime = "nodejs";
/** Research is a slow multi-search pass; give it Fluid-compute headroom. */
export const maxDuration = 800;

/**
 * The playbook command: inspect and pre-warm researched market knowledge.
 *
 *   GET /api/admin/playbook?secret=…&action=list
 *   GET /api/admin/playbook?secret=…&action=get&country=IL&utility=water
 *   GET /api/admin/playbook?secret=…&action=research&country=IL&utility=water[&force=1]
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

  if (action === "list") {
    const rows = await db()
      .select({
        country: schema.utilityPlaybooks.country,
        utility: schema.utilityPlaybooks.utility,
        version: schema.utilityPlaybooks.version,
        billsSeen: schema.utilityPlaybooks.billsSeen,
        providers: schema.utilityPlaybooks.providers,
        researchedAt: schema.utilityPlaybooks.researchedAt,
        status: schema.utilityPlaybooks.status,
      })
      .from(schema.utilityPlaybooks)
      .orderBy(asc(schema.utilityPlaybooks.country), asc(schema.utilityPlaybooks.utility));
    return NextResponse.json({ count: rows.length, markets: rows });
  }

  if (!country || !utility) {
    return NextResponse.json({ error: "country and utility are required" }, { status: 400 });
  }

  if (action === "get") {
    const record = await readPlaybook(country, utility);
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
      utility: record.utility,
      version: record.version,
      switchable: record.playbook.marketStructure.switchable,
      marketModel: record.playbook.marketStructure.model,
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
