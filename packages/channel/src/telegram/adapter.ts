import type { Button, ChannelAdapter, SendResult, TemplateName } from "../channel.js";
import { TEMPLATES } from "../whatsapp/templates.js";
import type { SupportedLocale } from "@bills/shared";

/**
 * Telegram Bot API adapter — the WABA-free conversational channel. Peer ids
 * are namespaced "tg:<chatId>" so multi-channel dispatch is a prefix check.
 * No templates, no 24-hour window, no button-count limit worth caring about;
 * template sends render the same localized bodies as WhatsApp would.
 */
export class TelegramBotApi implements ChannelAdapter {
  constructor(private readonly opts: { botToken: string }) {}

  private api(method: string): string {
    return `https://api.telegram.org/bot${this.opts.botToken}/${method}`;
  }

  private static chatId(to: string): string {
    return to.startsWith("tg:") ? to.slice(3) : to;
  }

  private async call(method: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(this.api(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: any; description?: string } | null;
    if (!res.ok || !json?.ok) throw new Error(`telegram ${method} failed: ${json?.description ?? res.status}`);
    return json.result;
  }

  async sendText(to: string, text: string): Promise<SendResult> {
    const result = await this.call("sendMessage", { chat_id: TelegramBotApi.chatId(to), text });
    return { messageId: `tg:${TelegramBotApi.chatId(to)}:${result.message_id}` };
  }

  async sendButtons(to: string, body: string, buttons: Button[]): Promise<SendResult> {
    const result = await this.call("sendMessage", {
      chat_id: TelegramBotApi.chatId(to),
      text: body,
      reply_markup: { inline_keyboard: buttons.map((b) => [{ text: b.title, callback_data: b.id }]) },
    });
    return { messageId: `tg:${TelegramBotApi.chatId(to)}:${result.message_id}` };
  }

  async sendTemplate(to: string, template: TemplateName, locale: SupportedLocale, params: string[]): Promise<SendResult> {
    // Telegram needs no pre-approved templates — render the same body.
    const def = TEMPLATES[template];
    let text = def.bodies[locale] ?? def.bodies.en!;
    params.forEach((p, i) => {
      text = text.replaceAll(`{{${i + 1}}}`, p);
    });
    return this.sendText(to, text);
  }

  async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    const file = await this.call("getFile", { file_id: mediaId });
    const res = await fetch(`https://api.telegram.org/file/bot${this.opts.botToken}/${file.file_path}`);
    if (!res.ok) throw new Error(`telegram file download ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const path = String(file.file_path ?? "");
    const mimeType = path.endsWith(".pdf")
      ? "application/pdf"
      : path.endsWith(".png")
        ? "image/png"
        : path.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
    return { data, mimeType };
  }

  async markRead(): Promise<void> {
    // Telegram bots have no read receipts — no-op.
  }

  /** Clear the inline-button loading spinner after a callback query. */
  async answerCallback(callbackQueryId: string): Promise<void> {
    await this.call("answerCallbackQuery", { callback_query_id: callbackQueryId }).catch(() => {});
  }
}
