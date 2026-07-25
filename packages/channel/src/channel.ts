import type { SupportedLocale } from "@bills/shared";

/**
 * Transport-agnostic outbound channel. WhatsApp Cloud API is the first
 * implementation; a web or voice channel (or an aggregator like Twilio)
 * implements the same interface and the pipeline never knows the difference.
 */
export interface ChannelAdapter {
  sendText(to: string, text: string): Promise<SendResult>;
  /** WhatsApp caps interactive reply buttons at 3. */
  sendButtons(to: string, body: string, buttons: Button[]): Promise<SendResult>;
  sendTemplate(to: string, template: TemplateName, locale: SupportedLocale, params: string[]): Promise<SendResult>;
  downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }>;
  markRead(messageId: string): Promise<void>;
}

export interface Button {
  id: string; // routed payload, e.g. "explain_more:<invoiceId>"
  title: string; // ≤ 20 chars per WhatsApp
}

export interface SendResult {
  messageId: string;
}

/** Pre-approved template names (see templates.ts for definitions). */
export type TemplateName = "bill_ready" | "savings_reminder" | "promo_expiry" | "mission_update";

export const MAX_BUTTONS = 3;
export const MAX_BUTTON_TITLE = 20;
