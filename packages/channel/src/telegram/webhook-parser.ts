import type { InboundEvent } from "@bills/shared";

/**
 * Map a Telegram Update to the channel-agnostic InboundEvent. Peer and
 * message ids are namespaced "tg:…" — the rest of the pipeline (idempotency,
 * customers.waId, conversations.peerWaId) never knows the channel.
 */
export function parseTelegramUpdate(update: unknown): InboundEvent[] {
  const u = update as Record<string, any> | null;
  if (!u || typeof u !== "object") return [];

  const message = u.message;
  if (message?.chat?.id !== undefined) {
    const from = `tg:${message.chat.id}`;
    const messageId = `tg:${message.chat.id}:${message.message_id}`;
    const timestamp = (message.date ?? Math.floor(Date.now() / 1000)) * 1000;
    const profileName = message.from?.first_name as string | undefined;

    if (typeof message.text === "string" && message.text.length > 0) {
      // /start (deep-link or first contact) reads as a greeting.
      const text = message.text.startsWith("/start") ? "hello" : message.text;
      return [{ kind: "text", from, messageId, text, profileName, timestamp }];
    }
    if (Array.isArray(message.photo) && message.photo.length > 0) {
      const largest = message.photo[message.photo.length - 1];
      return [
        {
          kind: "media",
          from,
          messageId,
          mediaId: String(largest.file_id),
          mimeType: "image/jpeg",
          mediaKind: "image",
          caption: message.caption ?? undefined,
          timestamp,
        },
      ];
    }
    if (message.document?.file_id) {
      const mime = String(message.document.mime_type ?? "application/octet-stream");
      return [
        {
          kind: "media",
          from,
          messageId,
          mediaId: String(message.document.file_id),
          mimeType: mime,
          mediaKind: mime.startsWith("image/") ? "image" : "document",
          caption: message.caption ?? undefined,
          timestamp,
        },
      ];
    }
    return [];
  }

  const cb = u.callback_query;
  if (cb?.data && cb.message?.chat?.id !== undefined) {
    return [
      {
        kind: "button_reply",
        from: `tg:${cb.message.chat.id}`,
        messageId: `tgcb:${cb.id}`,
        buttonId: String(cb.data),
        timestamp: Date.now(),
      },
    ];
  }

  return [];
}

/** The callback id to acknowledge (spinner clear), when the update is a button press. */
export function callbackQueryId(update: unknown): string | null {
  const cb = (update as Record<string, any> | null)?.callback_query;
  return cb?.id ? String(cb.id) : null;
}
