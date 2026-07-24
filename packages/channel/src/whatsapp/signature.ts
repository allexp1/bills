import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Meta's X-Hub-Signature-256 header against the raw request body.
 * Must run on the exact raw bytes — any re-serialization breaks the MAC.
 */
export function verifyMetaSignature(rawBody: Buffer | string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = header.slice("sha256=".length);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}

/** Handle Meta's webhook GET verification handshake. Returns the challenge to echo, or null. */
export function verifySubscription(
  query: { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string },
  verifyToken: string,
): string | null {
  if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === verifyToken) {
    return query["hub.challenge"] ?? "";
  }
  return null;
}
