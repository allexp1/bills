import { describe, expect, it } from "vitest";
import { callbackQueryId, parseTelegramUpdate } from "../src/telegram/webhook-parser.js";

describe("telegram webhook parser", () => {
  it("maps text messages, with /start as a greeting", () => {
    const events = parseTelegramUpdate({
      update_id: 1,
      message: { message_id: 10, date: 1750000000, chat: { id: 12345 }, from: { first_name: "Alex" }, text: "hola" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "text", from: "tg:12345", messageId: "tg:12345:10", text: "hola", profileName: "Alex" });

    const start = parseTelegramUpdate({ update_id: 2, message: { message_id: 11, date: 1, chat: { id: 12345 }, text: "/start" } });
    expect(start[0]).toMatchObject({ kind: "text", text: "hello" });
  });

  it("picks the largest photo size and maps documents with their mime", () => {
    const photo = parseTelegramUpdate({
      update_id: 3,
      message: {
        message_id: 12,
        date: 1,
        chat: { id: 9 },
        photo: [{ file_id: "small" }, { file_id: "large" }],
        caption: "my bill",
      },
    });
    expect(photo[0]).toMatchObject({ kind: "media", mediaId: "large", mediaKind: "image", mimeType: "image/jpeg", caption: "my bill" });

    const pdf = parseTelegramUpdate({
      update_id: 4,
      message: { message_id: 13, date: 1, chat: { id: 9 }, document: { file_id: "doc1", mime_type: "application/pdf" } },
    });
    expect(pdf[0]).toMatchObject({ kind: "media", mediaId: "doc1", mediaKind: "document", mimeType: "application/pdf" });
  });

  it("maps callback queries to button replies and exposes the callback id", () => {
    const update = {
      update_id: 5,
      callback_query: { id: "cb99", data: "savings:INV1", message: { chat: { id: 77 } } },
    };
    const events = parseTelegramUpdate(update);
    expect(events[0]).toMatchObject({ kind: "button_reply", from: "tg:77", buttonId: "savings:INV1", messageId: "tgcb:cb99" });
    expect(callbackQueryId(update)).toBe("cb99");
    expect(callbackQueryId({ update_id: 6, message: { chat: { id: 1 }, message_id: 1, text: "x" } })).toBeNull();
  });

  it("ignores unsupported updates", () => {
    expect(parseTelegramUpdate(null)).toEqual([]);
    expect(parseTelegramUpdate({ update_id: 7, edited_message: {} })).toEqual([]);
    expect(parseTelegramUpdate({ update_id: 8, message: { message_id: 1, date: 1, chat: { id: 1 }, sticker: {} } })).toEqual([]);
  });
});
