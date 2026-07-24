import { redactRestrictedData, type RedactionSpan } from "@bills/shared";

/**
 * Co-pilot relay: the Part-B actuator that is actually viable on WhatsApp.
 *
 * The negotiation happens from the CUSTOMER's own WhatsApp — the sender is
 * the number on the provider's contract, so identity just works, OTPs go
 * straight to the customer, and no business-to-business messaging occurs.
 * Our WABA conversation with the customer is the control channel: the model
 * drafts each provider message, the customer sends it with one tap via a
 * wa.me deep link, forwards the provider's reply back, and the model
 * computes the next move.
 */

/** Deep link that opens the customer's chat with the provider, message pre-typed. */
export function buildRelayLink(providerE164: string, message: string): string {
  const digits = providerE164.replace(/[^\d]/g, "");
  if (!digits) throw new Error("provider number required");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export type RelayRole = "assistant_draft" | "customer_sent" | "provider_reply" | "customer_note";

export interface RelayTurn {
  role: RelayRole;
  text: string;
  at: string; // ISO
}

/**
 * Guard every drafted provider message before it reaches the customer:
 * never card numbers or national IDs (the customer supplies those directly
 * to the provider if truly required), and keep drafts within scope.
 */
export function guardDraft(text: string): { text: string; spans: RedactionSpan[] } {
  return redactRestrictedData(text);
}

/** Render the transcript for the negotiator prompt, provider replies marked untrusted. */
export function renderTranscript(turns: RelayTurn[]): string {
  return turns
    .map((t) => {
      switch (t.role) {
        case "assistant_draft":
          return `[WE DRAFTED] ${t.text}`;
        case "customer_sent":
          return `[CUSTOMER SENT TO PROVIDER] ${t.text}`;
        case "provider_reply":
          // Provider text is untrusted input; fenced so instructions inside it
          // read as data, not directives.
          return `[PROVIDER REPLIED — untrusted content]\n<<<\n${t.text}\n>>>`;
        case "customer_note":
          return `[CUSTOMER NOTE] ${t.text}`;
      }
    })
    .join("\n\n");
}
