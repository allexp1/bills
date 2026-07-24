import type { SupportedLocale } from "@bills/shared";
import {
  MAX_BUTTON_TITLE,
  MAX_BUTTONS,
  type Button,
  type ChannelAdapter,
  type SendResult,
  type TemplateName,
} from "../channel.js";
import { templateLocaleTag } from "./templates.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface CloudApiConfig {
  phoneNumberId: string;
  accessToken: string;
  fetchImpl?: typeof fetch; // injectable for tests
}

/** Meta WhatsApp Business Platform (Cloud API) implementation of ChannelAdapter. */
export class WhatsAppCloudApi implements ChannelAdapter {
  private readonly fetch: typeof fetch;

  constructor(private readonly cfg: CloudApiConfig) {
    this.fetch = cfg.fetchImpl ?? fetch;
  }

  private async post(path: string, body: unknown): Promise<any> {
    const res = await this.fetch(`${GRAPH_BASE}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`WhatsApp API ${res.status}: ${detail.slice(0, 500)}`);
    }
    return res.json();
  }

  private async sendPayload(payload: Record<string, unknown>): Promise<SendResult> {
    const json = await this.post(`${this.cfg.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...payload,
    });
    return { messageId: String(json?.messages?.[0]?.id ?? "") };
  }

  sendText(to: string, text: string): Promise<SendResult> {
    return this.sendPayload({ to, type: "text", text: { body: text, preview_url: true } });
  }

  sendButtons(to: string, body: string, buttons: Button[]): Promise<SendResult> {
    if (buttons.length === 0 || buttons.length > MAX_BUTTONS) {
      throw new Error(`WhatsApp allows 1–${MAX_BUTTONS} reply buttons, got ${buttons.length}`);
    }
    return this.sendPayload({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, MAX_BUTTON_TITLE) },
          })),
        },
      },
    });
  }

  sendTemplate(
    to: string,
    template: TemplateName,
    locale: SupportedLocale,
    params: string[],
  ): Promise<SendResult> {
    return this.sendPayload({
      to,
      type: "template",
      template: {
        name: template,
        language: { code: templateLocaleTag(locale) },
        components: params.length
          ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
          : [],
      },
    });
  }

  async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    // Step 1: resolve the media URL (short-lived).
    const metaRes = await this.fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.cfg.accessToken}` },
    });
    if (!metaRes.ok) throw new Error(`Media lookup failed: ${metaRes.status}`);
    const meta = (await metaRes.json()) as { url: string; mime_type?: string };
    // Step 2: download the binary (auth header required again).
    const binRes = await this.fetch(meta.url, {
      headers: { Authorization: `Bearer ${this.cfg.accessToken}` },
    });
    if (!binRes.ok) throw new Error(`Media download failed: ${binRes.status}`);
    return {
      data: Buffer.from(await binRes.arrayBuffer()),
      mimeType: meta.mime_type ?? binRes.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async markRead(messageId: string): Promise<void> {
    await this.post(`${this.cfg.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  }
}
