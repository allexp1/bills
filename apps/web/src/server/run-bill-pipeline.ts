import { eq } from "drizzle-orm";
import { getPack, lookupProviderChat } from "@bills/category-packs";
import { db, encryptJson, schema } from "@bills/db";
import { decodeBill, extractBill, gatherOffers, type BillPage } from "@bills/llm";
import { applyGuardrails, computeGotchaFacts, mintSummaryToken } from "@bills/pipeline";
import { parseAmount, type SupportedLocale } from "@bills/shared";
import { keys } from "./wiring.js";
import { env } from "./env.js";

export interface PipelineRunResult {
  summaryUrl: string;
  category: string;
  guardrail: { claims: number; dropped: number; removedSentences: number };
  offersConsidered: number;
  tokens: { extraction: unknown; decode: unknown };
}

export class PipelineError extends Error {
  constructor(
    readonly code: "unsupported_category" | "pipeline_error",
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

/**
 * The Part-A core: store pages (encrypted) → vision extraction → live market
 * offers → decode → guardrails → signed summary link. Shared by the public
 * upload, the dev harness, and the WhatsApp job processor.
 */
export async function runBillPipeline(args: {
  customerId: string;
  invoiceId?: string; // WhatsApp flow passes an existing collecting invoice
  pages: BillPage[];
  locale: SupportedLocale;
}): Promise<PipelineRunResult> {
  const { customerId, locale, pages } = args;
  const database = db();

  let invoiceId = args.invoiceId;
  if (!invoiceId) {
    const [invoice] = await database
      .insert(schema.invoices)
      .values({ customerId, status: "extracting", pageCount: pages.length })
      .returning({ id: schema.invoices.id });
    invoiceId = invoice!.id;
    // No-retention policy: uploaded pages are processed from memory only.
    // What persists is the structured extraction, encrypted, in the DB —
    // never the images/PDFs themselves. (The WhatsApp path stores pages
    // transiently because they arrive over minutes into an async job; it
    // deletes them right after processing.)
  }

  try {
    await database.update(schema.invoices).set({ status: "extracting" }).where(eq(schema.invoices.id, invoiceId));

    const { extraction, usage, model, promptVersion } = await extractBill(pages);
    const pack = getPack(extraction.category);
    const [extractionRow] = await database
      .insert(schema.extractions)
      .values({
        invoiceId,
        packId: pack?.id ?? null,
        packVersion: pack?.version ?? null,
        model,
        promptVersion,
        data: encryptJson(keys(), extraction),
        confidence: extraction.field_confidence ?? null,
        usage,
        status: extraction.category === "unknown" || extraction.category_confidence < 0.7 ? "low_confidence" : "ok",
      })
      .returning({ id: schema.extractions.id });
    if (!pack) throw new PipelineError("unsupported_category", `category=${extraction.category}`);

    await database
      .update(schema.invoices)
      .set({
        status: "decoding",
        category: extraction.category,
        currency: extraction.common.currency,
        country: extraction.common.country,
        billingPeriodStart: extraction.common.billingPeriodStart,
        billingPeriodEnd: extraction.common.billingPeriodEnd,
        issueDate: extraction.common.issueDate,
        dueDate: extraction.common.dueDate,
        totalAmountMinor: extraction.common.totalAmount
          ? parseAmount(extraction.common.totalAmount, extraction.common.currency ?? "EUR")
          : null,
        pastDueAmountMinor: extraction.common.pastDueAmount
          ? parseAmount(extraction.common.pastDueAmount, extraction.common.currency ?? "EUR")
          : null,
      })
      .where(eq(schema.invoices.id, invoiceId));

    // History/reminder metadata — separate best-effort write so the pipeline
    // keeps working on databases where migration 0001 isn't applied yet.
    const isoDate = (v: unknown): string | null =>
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    const rawFields = (extraction.category_fields as Record<string, Record<string, unknown> | null>)[
      extraction.category
    ];
    await database
      .update(schema.invoices)
      .set({
        providerName: extraction.common.providerName,
        promoEndDate: isoDate(rawFields?.promoEndDate),
        contractEndDate: isoDate(rawFields?.contractEndDate),
      })
      .where(eq(schema.invoices.id, invoiceId))
      .catch((err: unknown) => {
        console.warn("[pipeline] history columns write failed (migration 0001 applied?):", err instanceof Error ? err.message.slice(0, 120) : "");
      });

    // Live market research (web search) merged with curated data — best-effort.
    const fields = (extraction.category_fields as Record<string, unknown>)[pack.id];
    const offers = await gatherOffers(pack.id, fields, extraction.common);
    const gotchaFacts = computeGotchaFacts(pack, extraction);

    const decodeResult = await decodeBill({ extraction, pack, gotchaFacts, offers, customerLocale: locale });

    await database.update(schema.invoices).set({ status: "guardrail" }).where(eq(schema.invoices.id, invoiceId));
    const { guarded, report } = applyGuardrails({ decode: decodeResult.decode, extraction, pack, offers, locale });

    // If the provider has a source-confirmed official support-chat channel
    // (WhatsApp, SMS short code, or web chat), attach it so both renderers
    // can offer the customer a way in — preloaded message where possible.
    const providerChat = await lookupProviderChat(extraction.common.providerName, extraction.common.country, pack.id);
    if (providerChat) {
      guarded.providerChat = {
        providerName: extraction.common.providerName ?? providerChat.name,
        channel: providerChat.channel ?? "whatsapp",
        ...(providerChat.waNumber ? { waNumber: providerChat.waNumber } : {}),
        ...(providerChat.smsNumber ? { smsNumber: providerChat.smsNumber } : {}),
        ...(providerChat.smsBody ? { smsBody: providerChat.smsBody } : {}),
        ...(providerChat.chatUrl ? { chatUrl: providerChat.chatUrl } : {}),
        source: providerChat.source,
      };
    }

    await database.insert(schema.decodes).values({
      invoiceId,
      extractionId: extractionRow!.id,
      data: encryptJson(keys(), guarded),
      guardrailReport: report,
      localeRendered: locale,
      model: decodeResult.model,
      promptVersion: decodeResult.promptVersion,
      usage: decodeResult.usage,
    });

    const minted = mintSummaryToken(invoiceId, env.summaryJwtSecret);
    const [tokenRow] = await database
      .insert(schema.summaryTokens)
      .values({ invoiceId, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt })
      .returning({ id: schema.summaryTokens.id });
    await database
      .update(schema.invoices)
      .set({ status: "delivered", summaryTokenId: tokenRow!.id })
      .where(eq(schema.invoices.id, invoiceId));

    return {
      summaryUrl: `${env.summaryBaseUrl}/s/${minted.token}`,
      category: extraction.category,
      guardrail: { claims: report.claims.length, dropped: report.droppedCount, removedSentences: report.removedSentences.length },
      offersConsidered: offers.length,
      tokens: { extraction: usage, decode: decodeResult.usage },
    };
  } catch (err) {
    const code = err instanceof PipelineError ? err.code : "pipeline_error";
    await database.update(schema.invoices).set({ status: "failed", errorCode: code }).where(eq(schema.invoices.id, invoiceId));
    throw err;
  }
}
