import type { InboundEvent } from "@bills/shared";

/**
 * Normalize a Meta WhatsApp Business webhook payload into InboundEvents.
 * Reference shape: entry[].changes[].value.{messages[], statuses[], contacts[]}
 */
export function parseWebhookPayload(payload: unknown): InboundEvent[] {
  const events: InboundEvent[] = [];
  const body = payload as {
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          messages?: Array<Record<string, any>>;
          statuses?: Array<Record<string, any>>;
        };
      }>;
    }>;
  };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") continue;
      const value = change.value;
      if (!value) continue;
      const profileName = value.contacts?.[0]?.profile?.name;

      for (const msg of value.messages ?? []) {
        const base = {
          from: String(msg.from ?? ""),
          messageId: String(msg.id ?? ""),
          timestamp: Number(msg.timestamp ?? 0) * 1000,
        };
        if (!base.from || !base.messageId) continue;

        switch (msg.type) {
          case "text":
            events.push({ kind: "text", ...base, text: String(msg.text?.body ?? ""), profileName });
            break;
          case "image":
            events.push({
              kind: "media",
              ...base,
              mediaId: String(msg.image?.id ?? ""),
              mimeType: String(msg.image?.mime_type ?? "image/jpeg"),
              mediaKind: "image",
              caption: msg.image?.caption,
            });
            break;
          case "document":
            events.push({
              kind: "media",
              ...base,
              mediaId: String(msg.document?.id ?? ""),
              mimeType: String(msg.document?.mime_type ?? "application/pdf"),
              mediaKind: "document",
              caption: msg.document?.caption ?? msg.document?.filename,
            });
            break;
          case "interactive": {
            const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
            if (reply?.id) events.push({ kind: "button_reply", ...base, buttonId: String(reply.id) });
            break;
          }
          case "button":
            // Template quick-reply
            if (msg.button?.payload) events.push({ kind: "button_reply", ...base, buttonId: String(msg.button.payload) });
            break;
          default:
            // Unsupported message types (audio, sticker, location…) are ignored here;
            // the intake machine replies with guidance on unknown input.
            break;
        }
      }

      for (const st of value.statuses ?? []) {
        if (!st.id || !st.status) continue;
        events.push({
          kind: "status",
          messageId: String(st.id),
          status: st.status as "sent" | "delivered" | "read" | "failed",
          timestamp: Number(st.timestamp ?? 0) * 1000,
        });
      }
    }
  }
  return events;
}
