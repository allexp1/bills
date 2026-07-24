import { describe, expect, it } from "vitest";
import { parseWebhookPayload } from "../src/whatsapp/webhook-parser.js";

function envelope(value: unknown) {
  return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value }] }] };
}

describe("parseWebhookPayload", () => {
  it("parses text messages with profile name", () => {
    const events = parseWebhookPayload(
      envelope({
        contacts: [{ wa_id: "34600111222", profile: { name: "Ana" } }],
        messages: [{ from: "34600111222", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "hola" } }],
      }),
    );
    expect(events).toEqual([
      { kind: "text", from: "34600111222", messageId: "wamid.1", text: "hola", profileName: "Ana", timestamp: 1700000000000 },
    ]);
  });

  it("parses image and document media", () => {
    const events = parseWebhookPayload(
      envelope({
        messages: [
          { from: "1", id: "m1", timestamp: "1", type: "image", image: { id: "media-1", mime_type: "image/jpeg" } },
          { from: "1", id: "m2", timestamp: "2", type: "document", document: { id: "media-2", mime_type: "application/pdf", filename: "bill.pdf" } },
        ],
      }),
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "media", mediaKind: "image", mediaId: "media-1" });
    expect(events[1]).toMatchObject({ kind: "media", mediaKind: "document", mediaId: "media-2", caption: "bill.pdf" });
  });

  it("parses interactive button replies", () => {
    const events = parseWebhookPayload(
      envelope({
        messages: [{
          from: "1", id: "m3", timestamp: "3", type: "interactive",
          interactive: { type: "button_reply", button_reply: { id: "show_savings:INV1", title: "Show savings" } },
        }],
      }),
    );
    expect(events[0]).toMatchObject({ kind: "button_reply", buttonId: "show_savings:INV1" });
  });

  it("parses delivery statuses and ignores unknown types", () => {
    const events = parseWebhookPayload(
      envelope({
        messages: [{ from: "1", id: "m4", timestamp: "4", type: "sticker" }],
        statuses: [{ id: "wamid.out1", status: "delivered", timestamp: "5" }],
      }),
    );
    expect(events).toEqual([{ kind: "status", messageId: "wamid.out1", status: "delivered", timestamp: 5000 }]);
  });

  it("tolerates empty/malformed payloads", () => {
    expect(parseWebhookPayload({})).toEqual([]);
    expect(parseWebhookPayload({ entry: [{}] })).toEqual([]);
  });
});
