import { createHmac } from "node:crypto";

/** Keys that must never appear in serialized logs. */
export const FORBIDDEN_LOG_KEYS = new Set([
  "phone",
  "wa_id",
  "waId",
  "body",
  "text",
  "account_number",
  "accountNumber",
  "otp",
  "token",
  "access_token",
]);

/** Pino-compatible redaction paths (wildcards cover nested payloads). */
export const PINO_REDACT_PATHS = [...FORBIDDEN_LOG_KEYS].flatMap((k) => [k, `*.${k}`, `*.*.${k}`]);

/** Stable pseudonym for a phone number so logs correlate without PII. */
export function waHash(waId: string, pepper: string): string {
  return createHmac("sha256", pepper).update(waId).digest("hex").slice(0, 16);
}

/** Recursively strip forbidden keys from an object about to be logged. */
export function redactForLog<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactForLog) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = FORBIDDEN_LOG_KEYS.has(k) ? "[redacted]" : redactForLog(v);
    }
    return out as T;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Text redaction: card numbers (Luhn), national-ID patterns, OTP codes.
// Used on Part B transcripts BOTH directions before persistence or LLM input.
// ---------------------------------------------------------------------------

export interface RedactionSpan {
  reason: "card_number" | "national_id" | "otp";
  match: string; // masked form, safe to store
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const CARD_CANDIDATE = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;
// National ID formats for launch markets: ES DNI/NIE, FR INSEE, PT NIF/CC, DE Steuer-ID.
const NATIONAL_ID_PATTERNS: RegExp[] = [
  /\b\d{8}[A-HJ-NP-TV-Z]\b/g, // ES DNI
  /\b[XYZ]\d{7}[A-HJ-NP-TV-Z]\b/g, // ES NIE
  /\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}(?:\s?\d{2})?\b/g, // FR INSEE
  /\bDE\s?\d{11}\b/g, // DE Steuer-ID (prefixed)
];

/**
 * Redact restricted data from free text. Returns the cleaned text plus spans
 * describing what was removed (masked — never the raw value).
 */
export function redactRestrictedData(
  text: string,
  opts: { otpHint?: boolean } = {},
): { text: string; spans: RedactionSpan[] } {
  const spans: RedactionSpan[] = [];
  let out = text;

  out = out.replace(CARD_CANDIDATE, (m) => {
    const digits = m.replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      spans.push({ reason: "card_number", match: `****${digits.slice(-4)}` });
      return "[card number redacted]";
    }
    return m;
  });

  for (const pattern of NATIONAL_ID_PATTERNS) {
    out = out.replace(pattern, (m) => {
      spans.push({ reason: "national_id", match: `${m.slice(0, 2)}…` });
      return "[ID redacted]";
    });
  }

  // OTPs: only when context says a code is expected (avoid eating amounts).
  if (opts.otpHint) {
    out = out.replace(/(?<!\d)\d{4,8}(?!\d)/g, () => {
      spans.push({ reason: "otp", match: "[otp]" });
      return "[OTP redacted]";
    });
  }

  return { text: out, spans };
}
