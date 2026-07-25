import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { ManualDataComparisonSource, getPack, type ComparisonOffer } from "@bills/category-packs";
import { db, encryptEnvelope, encryptJson, schema } from "@bills/db";
import { decodeBill, extractBill, type BillPage } from "@bills/llm";
import { applyGuardrails, computeGotchaFacts, mintSummaryToken } from "@bills/pipeline";
import { parseAmount, resolveLocale, ulid, waHash, type SupportedLocale } from "@bills/shared";
import { keys } from "../../../../server/wiring.js";
import { env } from "../../../../server/env.js";
import { mediaStore } from "../../../../server/media-store.js";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Dev/test harness: run the full Part-A pipeline on an uploaded bill without
 * WhatsApp. Gated by DEV_TRY_SECRET; intended for pre-WABA testing and demos.
 * Returns the signed summary URL — the same page a customer would receive.
 */
export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    // Pre-pipeline failures (missing env, no DB, missing tables) surface as a
    // diagnosable JSON error instead of an opaque 500.
    const msg = (err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]")
      .slice(0, 300);
    console.error("[dev/process] setup failure:", msg);
    return NextResponse.json({ error: "setup_failure", detail: msg, hint: "GET /api/dev/diag?secret=… for a full check" }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const secret = process.env.DEV_TRY_SECRET;
  if (!secret) return new NextResponse("harness disabled (DEV_TRY_SECRET unset)", { status: 404 });
  const form = await req.formData();
  const provided = String(form.get("secret") ?? "");
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  if (!timingSafeEqual(a, b)) return new NextResponse("wrong secret", { status: 401 });

  const locale = (resolveLocale(String(form.get("locale") ?? "en")) ?? "en") as SupportedLocale;
  const files = form.getAll("pages").filter((f): f is File => f instanceof File);
  if (files.length === 0) return new NextResponse("no pages uploaded", { status: 400 });
  if (files.length > 10) return new NextResponse("max 10 pages", { status: 400 });

  const database = db();

  // Synthetic customer + invoice so the standard summary page works.
  const tryId = `try:${ulid()}`;
  const [customer] = await database
    .insert(schema.customers)
    .values({ waId: tryId, waHash: waHash(tryId, env.waHashPepper), locale })
    .returning();
  const [invoice] = await database
    .insert(schema.invoices)
    .values({ customerId: customer!.id, status: "extracting", pageCount: files.length })
    .returning();

  try {
    // Store pages encrypted (same posture as the WhatsApp path).
    const pages: BillPage[] = [];
    let pageIndex = 1;
    for (const file of files) {
      const data = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      pages.push({ data, mimeType });
      const ciphertext = Buffer.from(JSON.stringify(encryptEnvelope(keys(), data)));
      const { storageKey } = await mediaStore().put(`media/${invoice!.id}/${ulid()}`, ciphertext);
      await database.insert(schema.mediaObjects).values({
        invoiceId: invoice!.id,
        storageKey,
        mimeType,
        byteSize: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
        pageIndex: pageIndex++,
      });
    }

    const { extraction, usage, model, promptVersion } = await extractBill(pages);
    const pack = getPack(extraction.category);
    const [extractionRow] = await database
      .insert(schema.extractions)
      .values({
        invoiceId: invoice!.id,
        packId: pack?.id ?? null,
        packVersion: pack?.version ?? null,
        model,
        promptVersion,
        data: encryptJson(keys(), extraction),
        usage,
        status: extraction.category === "unknown" ? "low_confidence" : "ok",
      })
      .returning({ id: schema.extractions.id });
    if (!pack) {
      await database.update(schema.invoices).set({ status: "failed", errorCode: "unsupported_category" }).where(eqId(invoice!.id));
      return NextResponse.json({ error: "unsupported_category", category: extraction.category }, { status: 422 });
    }

    const fields = (extraction.category_fields as Record<string, unknown>)[pack.id];
    let offers: ComparisonOffer[] = [];
    try {
      offers = await new ManualDataComparisonSource(pack.id).getOffers(fields, extraction.common);
    } catch {
      offers = [];
    }
    const decodeResult = await decodeBill({
      extraction,
      pack,
      gotchaFacts: computeGotchaFacts(pack, extraction),
      offers,
      customerLocale: locale,
    });
    const { guarded, report } = applyGuardrails({ decode: decodeResult.decode, extraction, pack, offers, locale });

    await database.insert(schema.decodes).values({
      invoiceId: invoice!.id,
      extractionId: extractionRow!.id,
      data: encryptJson(keys(), guarded),
      guardrailReport: report,
      localeRendered: locale,
      model: decodeResult.model,
      promptVersion: decodeResult.promptVersion,
      usage: decodeResult.usage,
    });

    const minted = mintSummaryToken(invoice!.id, env.summaryJwtSecret);
    const [tokenRow] = await database
      .insert(schema.summaryTokens)
      .values({ invoiceId: invoice!.id, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt })
      .returning({ id: schema.summaryTokens.id });
    await database
      .update(schema.invoices)
      .set({
        status: "delivered",
        summaryTokenId: tokenRow!.id,
        category: extraction.category,
        currency: extraction.common.currency,
        dueDate: extraction.common.dueDate,
        billingPeriodStart: extraction.common.billingPeriodStart,
        billingPeriodEnd: extraction.common.billingPeriodEnd,
        totalAmountMinor: extraction.common.totalAmount
          ? parseAmount(extraction.common.totalAmount, extraction.common.currency ?? "EUR")
          : null,
      })
      .where(eqId(invoice!.id));

    return NextResponse.json({
      summaryUrl: `${env.summaryBaseUrl}/s/${minted.token}`,
      category: extraction.category,
      guardrail: { claims: report.claims.length, dropped: report.droppedCount, removedSentences: report.removedSentences.length },
      tokens: { extraction: usage, decode: decodeResult.usage },
    });
  } catch (err) {
    await database.update(schema.invoices).set({ status: "failed", errorCode: "pipeline_error" }).where(eqId(invoice!.id));
    const detail = (err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]")
      .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
      .slice(0, 300);
    console.error("[dev/process]", detail);
    return NextResponse.json({ error: "pipeline_error", detail }, { status: 500 });
  }
}

function eqId(id: string) {
  return eq(schema.invoices.id, id);
}
