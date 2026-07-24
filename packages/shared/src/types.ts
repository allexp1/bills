/** Cross-package domain enums and small value types. */

export const CATEGORIES = ["energy", "broadband", "mobile"] as const;
export type Category = (typeof CATEGORIES)[number];

export type InvoiceStatus =
  | "collecting"
  | "queued"
  | "extracting"
  | "decoding"
  | "guardrail"
  | "delivered"
  | "failed"
  | "deleted";

export type MissionStatus =
  | "draft"
  | "awaiting_authorization"
  | "authorized"
  | "queued"
  | "contacting_provider"
  | "in_progress"
  | "awaiting_customer"
  | "awaiting_provider"
  | "pending_customer_completion"
  | "completed"
  | "failed"
  | "cancelled"
  | "escalated_human";

export type ConversationKind = "customer" | "provider";
export type MessageDirection = "in" | "out";

/** Normalized inbound event produced by any channel's webhook parser. */
export type InboundEvent =
  | { kind: "text"; from: string; messageId: string; text: string; profileName?: string; timestamp: number }
  | {
      kind: "media";
      from: string;
      messageId: string;
      mediaId: string;
      mimeType: string;
      mediaKind: "image" | "document";
      caption?: string;
      timestamp: number;
    }
  | { kind: "button_reply"; from: string; messageId: string; buttonId: string; timestamp: number }
  | { kind: "status"; messageId: string; status: "sent" | "delivered" | "read" | "failed"; timestamp: number };
