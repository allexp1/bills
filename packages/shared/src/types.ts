/** Cross-package domain enums and small value types. */

/**
 * "utility" is the open category: any metered or subscription bill without a
 * bespoke pack (water, waste, council tax, gym). "statement" is the second
 * document family: insurance policies and pension/savings statements, which
 * are not bills at all — no monthly total, different questions. Both draw
 * their market intelligence from researched per-country playbooks rather
 * than hand-written code.
 */
export const CATEGORIES = ["energy", "broadband", "mobile", "utility", "statement"] as const;
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

/**
 * Statuses that mean work is still in progress. A run that dies mid-flight —
 * function timeout, crash, connection drop — never reaches a terminal status,
 * so it sits in one of these forever. Anything reading invoice state has to
 * treat an old in-flight row as dead rather than as still working.
 */
export const IN_FLIGHT_INVOICE_STATUSES = [
  "collecting",
  "queued",
  "extracting",
  "decoding",
  "guardrail",
] as const satisfies readonly InvoiceStatus[];

export function isInFlightStatus(status: string): boolean {
  return (IN_FLIGHT_INVOICE_STATUSES as readonly string[]).includes(status);
}

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
