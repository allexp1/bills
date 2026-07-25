import { asc, eq } from "drizzle-orm";
import { db, decryptEnvelope, schema, type EnvelopeCiphertext } from "@bills/db";
import type { BillPage } from "@bills/llm";
import {
  buildFollowUpButtons,
  buildSummaryMessage,
  transition,
  t,
  type IntakeState,
} from "@bills/pipeline";
import { resolveLocale, type SupportedLocale } from "@bills/shared";
import { channel, keys } from "../wiring.js";
import { mediaStore, purgeInvoiceMedia } from "../media-store.js";
import { loadGuardedDecode } from "../decode-store.js";
import { runBillPipeline } from "../run-bill-pipeline.js";

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
    if (pages.length === 0) throw new Error("no_pages");

    // The shared Part-A pipeline (extraction → offers → decode → guardrails → link).
    const result = await runBillPipeline({
      customerId: conversation.customerId!,
      invoiceId: payload.invoiceId,
      pages,
      locale,
    });

    // Deliver: summary + buttons.
    const loaded = await loadGuardedDecode(payload.invoiceId);
    if (loaded) {
      await channel().sendText(conversation.peerWaId, buildSummaryMessage(loaded.guarded, locale, result.summaryUrl));
      const { body, buttons } = buildFollowUpButtons(payload.invoiceId, locale);
      await channel().sendButtons(conversation.peerWaId, body, buttons);
      await maybeAskRetentionConsent(conversation.customerId, conversation.peerWaId, locale);
    }

    await settleState(conversation.id, "processing_delivered");

    // No-retention policy: the structured extraction is stored (encrypted);
    // the bill images/PDFs are deleted the moment processing succeeds. Kept
    // on failure only so QStash retries can re-run; the short-window purge
    // cron sweeps those up.
    await purgeInvoiceMedia(payload.invoiceId).catch(() => {});
  } catch (err) {
    console.error(`[process-bill] ${payload.invoiceId} failed:`, err instanceof Error ? err.message.slice(0, 200) : "");
    await settleState(conversation.id, "processing_failed");
    await channel().sendText(conversation.peerWaId, t(locale, "unreadable"));
    throw err; // invoice status already set by the pipeline; QStash retries transient failures
  }
}

/** One-time opt-in ask: keep decoded data past 7 days for month-to-month comparison. */
async function maybeAskRetentionConsent(customerId: string | null, to: string, locale: SupportedLocale): Promise<void> {
  if (!customerId) return;
  try {
    const [customer] = await db().select().from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
    if (!customer || customer.retentionPromptedAt) return;
    await channel().sendButtons(to, t(locale, "retainAsk"), [
      { id: "retain:yes", title: t(locale, "retainYesBtn") },
      { id: "retain:no", title: t(locale, "retainNoBtn") },
    ]);
    await db()
      .update(schema.customers)
      .set({ retentionPromptedAt: new Date() })
      .where(eq(schema.customers.id, customerId));
  } catch (err) {
    // Pre-migration-0003 databases: skip quietly.
    console.warn("[process-bill] retention prompt skipped:", err instanceof Error ? err.message.slice(0, 120) : "");
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
