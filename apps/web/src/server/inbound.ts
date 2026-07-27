import { and, eq } from "drizzle-orm";
import { db, encryptText, schema } from "@bills/db";
import {
  GREETINGS,
  INITIAL_STATE,
  buildPitchMessages,
  buildSavingsMessages,
  nextExplainMore,
  t,
  transition,
  type IntakeEffect,
  type IntakeEvent,
  type IntakeState,
} from "@bills/pipeline";
import { resolveLocale, waHash, type InboundEvent, type SupportedLocale } from "@bills/shared";
import { channelFor, keys } from "./wiring.js";
import { enqueue } from "./jobs.js";
import { env } from "./env.js";
import { loadGuardedDecode } from "./decode-store.js";
import { mediaStore } from "./media-store.js";
import { MAX_PAGES_PER_BILL, PAGE_LIMIT_COPY, QUOTA_COPY, billQuotaExceeded } from "./rate-limit.js";

const SESSION_WINDOW_MS = 24 * 3600 * 1000;

/** Process one normalized inbound event end-to-end. Idempotent per wa_message_id. */
export async function handleInbound(event: InboundEvent): Promise<void> {
  if (event.kind === "status") {
    await db()
      .update(schema.messages)
      .set({ status: event.status })
      .where(eq(schema.messages.waMessageId, event.messageId));
    return;
  }

  const customer = await upsertCustomer(event.from, "profileName" in event ? event.profileName : undefined);
  const conversation = await upsertConversation(customer.id, event.from);
  const locale = resolveLocale(customer.locale) as SupportedLocale;

  // Idempotency: dedupe on wa_message_id (unique index).
  const inserted = await db()
    .insert(schema.messages)
    .values({
      conversationId: conversation.id,
      direction: "in",
      waMessageId: event.messageId,
      type: event.kind,
      bodyEnc:
        event.kind === "text"
          ? encryptText(keys(), event.text)
          : event.kind === "button_reply"
            ? encryptText(keys(), event.buttonId)
            : null,
      status: "delivered",
    })
    .onConflictDoNothing({ target: schema.messages.waMessageId })
    .returning({ id: schema.messages.id });
  if (inserted.length === 0) return; // duplicate webhook delivery

  const state = (conversation.state as IntakeState | null) ?? INITIAL_STATE;

  // Abuse limits before the machine runs: daily bill quota on new bills,
  // page cap while collecting (a capped bill is promoted to processing).
  let machineEvent: IntakeEvent =
    event.kind === "text"
      ? { type: "text", text: event.text }
      : event.kind === "media"
        ? { type: "media", mediaKind: event.mediaKind }
        : { type: "button", buttonId: event.buttonId };
  if (event.kind === "media") {
    if (state.phase !== "collecting") {
      if (await billQuotaExceeded(customer.id)) {
        await channelFor(event.from).sendText(event.from, QUOTA_COPY[locale] ?? QUOTA_COPY.en!);
        return;
      }
    } else if (state.pageCount >= MAX_PAGES_PER_BILL) {
      await channelFor(event.from).sendText(event.from, PAGE_LIMIT_COPY[locale] ?? PAGE_LIMIT_COPY.en!);
      machineEvent = { type: "button", buttonId: `collect_done:${state.invoiceId}` };
    }
  }

  const { state: next, effects } = transition(state, machineEvent);
  const ctx: EffectContext = { customerId: customer.id, conversationId: conversation.id, locale, event, state: next };
  for (const effect of effects) await runEffect(ctx, effect);

  await db()
    .update(schema.conversations)
    .set({ state: ctx.state, sessionExpiresAt: new Date(Date.now() + SESSION_WINDOW_MS) })
    .where(eq(schema.conversations.id, conversation.id));
}

interface EffectContext {
  customerId: string;
  conversationId: string;
  locale: SupportedLocale;
  event: InboundEvent;
  state: IntakeState; // mutated when effects allocate ids (invoice)
}

async function runEffect(ctx: EffectContext, effect: IntakeEffect): Promise<void> {
  const to = "from" in ctx.event ? ctx.event.from : null;
  switch (effect.effect) {
    case "send_greeting":
      if (to) await sendAndRecord(ctx, to, GREETINGS[ctx.locale]);
      return;

    case "send_unsupported_input":
      if (to) await sendAndRecord(ctx, to, t(ctx.locale, "unreadable"));
      return;

    case "create_invoice": {
      const [invoice] = await db()
        .insert(schema.invoices)
        .values({ customerId: ctx.customerId, status: "collecting" })
        .returning({ id: schema.invoices.id });
      ctx.state = { ...ctx.state, invoiceId: invoice!.id };
      return;
    }

    case "attach_media": {
      if (ctx.event.kind !== "media" || !ctx.state.invoiceId) return;
      const [media] = await db()
        .insert(schema.mediaObjects)
        .values({
          invoiceId: ctx.state.invoiceId,
          storageKey: "",
          mimeType: ctx.event.mimeType,
          byteSize: 0,
          sha256: "",
          pageIndex: ctx.state.pageCount,
          waMediaId: ctx.event.mediaId,
        })
        .returning({ id: schema.mediaObjects.id });
      await db()
        .update(schema.invoices)
        .set({ pageCount: ctx.state.pageCount })
        .where(eq(schema.invoices.id, ctx.state.invoiceId));
      await enqueue("ingest-media", { mediaObjectId: media!.id, waMediaId: ctx.event.mediaId, peerId: ctx.event.from });
      return;
    }

    case "ack_page":
      if (to) {
        await channelFor(to).sendButtons(to, t(ctx.locale, "gotPage", { n: effect.pageNumber }), [
          { id: `collect_done:${ctx.state.invoiceId}`, title: t(ctx.locale, "thatsAll") },
        ]);
      }
      return;

    case "schedule_debounce":
      if (ctx.state.invoiceId) {
        await enqueue(
          "process-bill",
          { conversationId: ctx.conversationId, invoiceId: ctx.state.invoiceId, seq: effect.seq },
          { delayMs: effect.delayMs },
        );
      }
      return;

    case "send_processing_started":
      if (to) await sendAndRecord(ctx, to, t(ctx.locale, "analyzing"));
      return;

    case "start_processing":
      if (ctx.state.invoiceId) {
        await enqueue("process-bill", {
          conversationId: ctx.conversationId,
          invoiceId: ctx.state.invoiceId,
          seq: ctx.state.collectSeq, // immediate run matches current seq
        });
      }
      return;

    case "ask_delete_confirm":
      if (to) {
        await channelFor(to).sendButtons(to, deleteConfirmCopy(ctx.locale), [
          { id: "delete_yes", title: "✅" },
          { id: "delete_no", title: "❌" },
        ]);
      }
      return;

    case "execute_deletion":
      await executeDeletion(ctx.customerId);
      if (to) await sendAndRecord(ctx, to, deletionDoneCopy(ctx.locale));
      return;

    case "send_delete_cancelled":
      if (to) await sendAndRecord(ctx, to, "👍");
      return;

    case "route_follow_up":
      if (to) await routeFollowUp(ctx, to, effect.buttonId);
      return;
  }
}

async function routeFollowUp(ctx: EffectContext, to: string, buttonId: string): Promise<void> {
  const [action, invoiceId] = buttonId.split(":");
  if (!invoiceId) return;

  // Retention consent buttons carry a choice, not an invoice id.
  if (action === "retain") {
    if (invoiceId === "yes") {
      await db()
        .update(schema.customers)
        .set({ retentionConsentAt: new Date() })
        .where(eq(schema.customers.id, ctx.customerId))
        .catch(() => {});
      await sendAndRecord(ctx, to, t(ctx.locale, "retainSaved"));
    } else {
      await sendAndRecord(ctx, to, t(ctx.locale, "retainDeclined"));
    }
    return;
  }
  const loaded = await loadGuardedDecode(invoiceId);
  if (!loaded) {
    await sendAndRecord(ctx, to, t(ctx.locale, "unreadable"));
    return;
  }
  const { guarded } = loaded;

  if (action === "savings") {
    for (const msg of buildSavingsMessages(guarded, ctx.locale)) await sendAndRecord(ctx, to, msg);
    return;
  }
  if (action === "explain") {
    const sent = await countExplainSent(ctx.conversationId, invoiceId);
    await sendAndRecord(ctx, to, nextExplainMore(guarded, sent, ctx.locale), `explain_sent:${invoiceId}`);
    return;
  }
  if (action === "act") {
    // Preferred: the guarded negotiation pitch (ready-to-send message +
    // channel CTA + call script). Fallback when no pitch survived: DIY
    // next steps. Phase 2 layers the mission authorization flow on top.
    const pitchMessages = buildPitchMessages(guarded, ctx.locale);
    if (pitchMessages) {
      for (const msg of pitchMessages) await sendAndRecord(ctx, to, msg);
      return;
    }
    const steps = guarded.savings.map((s) => `➡️ ${s.nextStep}`);
    const body = [t(ctx.locale, "actWaitlist"), ...new Set(steps)].join("\n\n");
    await sendAndRecord(ctx, to, body);
  }
}

/** Count prior explain-more sends for an invoice to drain the queue in order. */
async function countExplainSent(conversationId: string, invoiceId: string): Promise<number> {
  const rows = await db()
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.templateName, `explain_sent:${invoiceId}`),
      ),
    );
  return rows.length;
}

async function sendAndRecord(ctx: EffectContext, to: string, text: string, tag?: string): Promise<void> {
  const result = await channelFor(to).sendText(to, text);
  await db()
    .insert(schema.messages)
    .values({
      conversationId: ctx.conversationId,
      direction: "out",
      waMessageId: result.messageId || null,
      type: "text",
      bodyEnc: encryptText(keys(), text),
      templateName: tag ?? null,
      status: "sent",
    })
    .onConflictDoNothing({ target: schema.messages.waMessageId });
}

async function upsertCustomer(waId: string, profileName?: string) {
  const found = await db().select().from(schema.customers).where(eq(schema.customers.waId, waId)).limit(1);
  if (found[0]) return found[0];
  const [created] = await db()
    .insert(schema.customers)
    .values({
      waId,
      waHash: waHash(waId, env.waHashPepper),
      displayName: profileName ?? null,
      locale: "en",
    })
    .onConflictDoNothing({ target: schema.customers.waId })
    .returning();
  if (created) return created;
  const [existing] = await db().select().from(schema.customers).where(eq(schema.customers.waId, waId)).limit(1);
  return existing!;
}

async function upsertConversation(customerId: string, peerWaId: string) {
  const found = await db()
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.peerWaId, peerWaId), eq(schema.conversations.kind, "customer")))
    .limit(1);
  if (found[0]) return found[0];
  const [created] = await db()
    .insert(schema.conversations)
    .values({ kind: "customer", channel: "whatsapp", customerId, peerWaId, state: INITIAL_STATE })
    .returning();
  return created!;
}

/** Hard-delete customer data: media (storage + rows), extractions, decodes, messages; revoke links. */
async function executeDeletion(customerId: string): Promise<void> {
  const database = db();
  await database.insert(schema.deletionRequests).values({ customerId, scope: "all" });
  const invoices = await database
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(eq(schema.invoices.customerId, customerId));
  for (const inv of invoices) {
    const media = await database
      .select()
      .from(schema.mediaObjects)
      .where(eq(schema.mediaObjects.invoiceId, inv.id));
    for (const m of media) {
      if (m.storageKey) await mediaStore().delete(m.storageKey).catch(() => {});
    }
    await database.delete(schema.mediaObjects).where(eq(schema.mediaObjects.invoiceId, inv.id));
    await database.delete(schema.decodes).where(eq(schema.decodes.invoiceId, inv.id));
    await database.delete(schema.extractions).where(eq(schema.extractions.invoiceId, inv.id));
    await database
      .update(schema.summaryTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.summaryTokens.invoiceId, inv.id));
    await database
      .update(schema.invoices)
      .set({ status: "deleted", errorCode: null })
      .where(eq(schema.invoices.id, inv.id));
  }
  const convs = await database
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.customerId, customerId));
  for (const c of convs) {
    await database.delete(schema.messages).where(eq(schema.messages.conversationId, c.id));
  }
  await database
    .update(schema.customers)
    .set({ displayName: null, deletedAt: new Date() })
    .where(eq(schema.customers.id, customerId));
  await database
    .update(schema.deletionRequests)
    .set({ completedAt: new Date() })
    .where(eq(schema.deletionRequests.customerId, customerId));
}

function deleteConfirmCopy(locale: SupportedLocale): string {
  const copy: Record<SupportedLocale, string> = {
    en: "This permanently deletes your bills, analyses and messages. Confirm?",
    es: "Esto elimina permanentemente tus facturas, análisis y mensajes. ¿Confirmas?",
    fr: "Cela supprime définitivement vos factures, analyses et messages. Confirmer ?",
    pt: "Isto elimina permanentemente as suas faturas, análises e mensagens. Confirma?",
    de: "Dies löscht Ihre Rechnungen, Analysen und Nachrichten endgültig. Bestätigen?",
    he: "פעולה זו מוחקת לצמיתות את החשבונות, הניתוחים וההודעות שלך. לאשר?",
    ru: "Это навсегда удалит ваши счета, анализы и сообщения. Подтвердить?",
    zh: "此操作将永久删除您的账单、分析和消息。确认吗？",
  };
  return copy[locale];
}

function deletionDoneCopy(locale: SupportedLocale): string {
  const copy: Record<SupportedLocale, string> = {
    en: "Done — everything is deleted. 🗑️",
    es: "Hecho — todo eliminado. 🗑️",
    fr: "C'est fait — tout est supprimé. 🗑️",
    pt: "Feito — tudo eliminado. 🗑️",
    de: "Erledigt — alles gelöscht. 🗑️",
    he: "בוצע — הכול נמחק. 🗑️",
    ru: "Готово — всё удалено. 🗑️",
    zh: "已完成 —— 全部删除。🗑️",
  };
  return copy[locale];
}
