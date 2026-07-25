/**
 * WhatsApp click-to-chat deep link: opens the recipient's chat with the
 * message pre-typed (the user still has to press send themselves).
 */
export function buildWaLink(e164: string, message?: string): string {
  const digits = e164.replace(/[^\d]/g, "");
  if (!digits) throw new Error("wa number required");
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}

/**
 * SMS deep link with a pre-typed body. The odd `?&body=` form is deliberate:
 * it's the one separator both iOS and Android parse correctly.
 */
export function buildSmsLink(number: string, body?: string): string {
  const digits = number.replace(/[^\d]/g, "");
  if (!digits) throw new Error("sms number required");
  return body ? `sms:${digits}?&body=${encodeURIComponent(body)}` : `sms:${digits}`;
}
