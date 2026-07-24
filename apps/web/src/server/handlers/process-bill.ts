import { asc, eq } from "drizzle-orm";
import { db, decryptEnvelope, encryptJson, schema, type EnvelopeCiphertext } from "@bills/db";
import { ManualDataComparisonSource, getPack, type ComparisonOffer } from "@bills/category-packs";
import { decodeBill, extractBill, type BillPage } from "@bills/llm";
import {
  applyGuardrails,
  buildFollowUpButtons,
  buildSummaryMessage,
  computeGotchaFacts,
  mintSummaryToken,
  transition,
  t,
  type IntakeState,
} from "@bills/pipeline";
import { parseAmount, resolveLocale, type SupportedLocale } from "@bills/shared";
import { channel, keys } from "../wiring.js";
import { env } from "../env.js";
import { mediaStore } from "../media-store.js";

/**
 * The Part-A pipeline: extraction → decode → guardrails → delivery.
 * Invoked by QStash (possibly delayed — the multi-page debounce). The seq
 * check makes stale debounce callbacks no-ops.
 */
export async function processBill(payload: { conversationId: string; invoiceId: string; seq: number }): Promise<void> {
  const database = db();
  const [conversation] = await database
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, payload.conversationId))
    .limit(1);
  if (!conversation) return;
  const state = (conversation.state as IntakeState | null) ?? null;
  if (!state || state.invoiceId !== payload.invoiceId) return;

  // Debounce semantics: a delayed callback only fires the machine when the
  // seq still matches (no newer page arrived) and we're still collecting.
  if (state.phase === "collecting") {
    const fired = transition(state, { type: "debounce_expired", seq: payload.seq });
    if (fired.state.phase !== "processing") return; // stale timer
    await database
      .update(schema.conversations)
      .set({ state: fired.state })
      .where(eq(schema.conversations.id, conversation.id));
    if (fired.effects.some((e) => e.effect === "send_processing_started")) {
      const locale = resolveLocale(await customerLocale(conversation.customerId)) as SupportedLocale;
      await channel().sendText(conversation.peerWaId, t(locale, "analyzing"));
    }
  } else if (state.phase !== "processing") {
    return; // delivered/failed/idle — nothing to do
  }

  const locale = resolveLocale(await customerLocale(conversation.customerId)) as SupportedLocale;

  try {
    await database.update(schema.invoices).set({ status: "extracting" }).where(eq(schema.invoices.id, payload.invoiceId));

    // Load and decrypt pages in order.
    const mediaRows = await database
      .select()
      .from(schema.mediaObjects)
      .where(eq(schema.mediaObjects.invoiceId, payload.invoiceId))
      .orderBy(asc(schema.mediaObjects.pageIndex));
    const pages: BillPage[] = [];
    for (const m of mediaRows) {
      if (!m.storageKey) continue; // ingestion race: skip pages not yet stored
      const ciphertext = await mediaStore().get(m.storageKey);
      const envelope = JSON.parse(ciphertext.toString()) as EnvelopeCiphertext;
      pages.push({ data: decryptEnvelope(keys(), envelope), mimeType: m.mimeType });
    }
    if (pages.length === 0) throw new ProcessError("no_pages");

    // 1) Vision extraction (single merged-schema call).
    const { extraction, usage, model, promptVersion } = await extractBill(pages);
    const pack = getPack(extraction.category);
    const [extractionRow] = await database
      .insert(schema.extractions)
      .values({
        invoiceId: payload.invoiceId,
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

    if (!pack) throw new ProcessError("unsupported_category");

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
      .where(eq(schema.invoices.id, payload.invoiceId));

    // 2) Comparison offers (manual data for now) + deterministic gotcha facts.
    const fields = (extraction.category_fields as Record<string, unknown>)[pack.id];
    const comparison = new ManualDataComparisonSource(pack.id);
    let offers: ComparisonOffer[] = [];
    try {
      offers = await comparison.getOffers(fields, extraction.common);
    } catch {
      offers = [];
    }
    const gotchaFacts = computeGotchaFacts(pack, extraction);

    // 3) Decode + savings plan.
    const decodeResult = await decodeBill({ extraction, pack, gotchaFacts, offers, customerLocale: locale });

    // 4) Guardrails — pure code; fabricated numbers do not survive.
    await database.update(schema.invoices).set({ status: "guardrail" }).where(eq(schema.invoices.id, payload.invoiceId));
    const { guarded, report } = applyGuardrails({
      decode: decodeResult.decode,
      extraction,
      pack,
      offers,
      locale,
    });

    await database.insert(schema.decodes).values({
      invoiceId: payload.invoiceId,
      extractionId: extractionRow!.id,
      data: encryptJson(keys(), guarded),
      guardrailReport: report,
      localeRendered: locale,
      model: decodeResult.model,
      promptVersion: decodeResult.promptVersion,
      usage: decodeResult.usage,
    });

    // 5) Signed summary link.
    const minted = mintSummaryToken(payload.invoiceId, env.summaryJwtSecret);
    const [tokenRow] = await database
      .insert(schema.summaryTokens)
      .values({ invoiceId: payload.invoiceId, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt })
      .returning({ id: schema.summaryTokens.id });
    await database
      .update(schema.invoices)
      .set({ status: "delivered", summaryTokenId: tokenRow!.id })
      .where(eq(schema.invoices.id, payload.invoiceId));

    // 6) Deliver: summary + buttons.
    const url = `${env.summaryBaseUrl}/s/${minted.token}`;
    await channel().sendText(conversation.peerWaId, buildSummaryMessage(guarded, locale, url));
    const { body, buttons } = buildFollowUpButtons(payload.invoiceId, locale);
    await channel().sendButtons(conversation.peerWaId, body, buttons);

    await settleState(conversation.id, "processing_delivered");
  } catch (err) {
    const code = err instanceof ProcessError ? err.code : "pipeline_error";
    console.error(`[process-bill] ${payload.invoiceId} failed: ${code}`, err instanceof Error ? err.message : "");
    await database
      .update(schema.invoices)
      .set({ status: "failed", errorCode: code })
      .where(eq(schema.invoices.id, payload.invoiceId));
    await settleState(conversation.id, "processing_failed");
    await channel().sendText(conversation.peerWaId, t(locale, "unreadable"));
    throw err; // let QStash retry transient failures
  }
}

class ProcessError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function customerLocale(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const [c] = await db().select().from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
  return c?.locale ?? null;
}

async function settleState(conversationId: string, event: "processing_delivered" | "processing_failed"): Promise<void> {
  const [conv] = await db().select().from(schema.conversations).where(eq(schema.conversations.id, conversationId)).limit(1);
  if (!conv) return;
  const state = (conv.state as IntakeState | null) ?? null;
  if (!state) return;
  const { state: next } = transition(state, { type: event });
  await db().update(schema.conversations).set({ state: next }).where(eq(schema.conversations.id, conversationId));
}
