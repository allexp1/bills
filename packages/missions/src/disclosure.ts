/**
 * Disclosure is structural, not model-optional: the FIRST outbound message of
 * every provider conversation is rendered from these fixed templates, in the
 * provider's language, sent by code before the negotiator loop ever runs.
 * A post-hoc filter additionally blocks impersonation phrasing in any
 * model-generated message.
 */

export interface DisclosureParams {
  customerFirstName: string;
  accountMasked: string; // e.g. "…4821"
  goal: string; // short human phrase, already localized
}

const TEMPLATES: Record<string, (p: DisclosureParams) => string> = {
  en: (p) =>
    `Hello — I'm an AI assistant acting on behalf of your customer ${p.customerFirstName} (account ${p.accountMasked}), with their written authorization. I'd like to discuss: ${p.goal}.`,
  es: (p) =>
    `Hola — soy un asistente de IA que actúa en nombre de su cliente ${p.customerFirstName} (contrato ${p.accountMasked}), con su autorización por escrito. Me gustaría tratar: ${p.goal}.`,
  fr: (p) =>
    `Bonjour — je suis un assistant IA agissant au nom de votre client ${p.customerFirstName} (compte ${p.accountMasked}), avec son autorisation écrite. Je souhaite discuter de : ${p.goal}.`,
  pt: (p) =>
    `Olá — sou um assistente de IA a agir em nome do vosso cliente ${p.customerFirstName} (conta ${p.accountMasked}), com a sua autorização por escrito. Gostaria de tratar de: ${p.goal}.`,
  de: (p) =>
    `Guten Tag — ich bin ein KI-Assistent und handle im Auftrag Ihres Kunden ${p.customerFirstName} (Vertrag ${p.accountMasked}) mit dessen schriftlicher Vollmacht. Es geht um: ${p.goal}.`,
};

export function disclosureMessage(providerLocale: string, params: DisclosureParams): string {
  const render = TEMPLATES[providerLocale] ?? TEMPLATES.en!;
  return render(params);
}

/** Patterns a model-generated outbound provider message must never match. */
const IMPERSONATION_PATTERNS: RegExp[] = [
  /\bI(?:'m| am) (?:the customer|a human|not (?:an? )?(?:AI|bot|assistant))\b/i,
  /\bsoy (?:el cliente|humano|una persona)\b/i,
  /\bje suis (?:le client|humain)\b/i,
  /\bsou (?:o cliente|humano)\b/i,
  /\bich bin (?:der Kunde|ein Mensch|kein(?:e)? (?:KI|Bot))\b/i,
  /\b(?:this is|speaking as) (?:the account holder|the customer)\b/i,
];

export function violatesDisclosure(outboundText: string): boolean {
  return IMPERSONATION_PATTERNS.some((p) => p.test(outboundText));
}
