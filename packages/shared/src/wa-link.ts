/**
 * WhatsApp click-to-chat deep link: opens the recipient's chat with the
 * message pre-typed (the user still has to press send themselves).
 */
export function buildWaLink(e164: string, message?: string): string {
  const digits = e164.replace(/[^\d]/g, "");
  if (!digits) throw new Error("wa number required");
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}
