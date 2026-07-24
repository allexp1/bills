/**
 * Money is always integer minor units + ISO-4217 currency. Floats never enter
 * the domain: extraction emits decimal strings which are parsed here once.
 */
export interface Money {
  amountMinor: number;
  currency: string;
}

const MINOR_DIGITS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  BHD: 3,
  KWD: 3,
  TND: 3,
};

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

/** Parse a human decimal string ("1.234,56" or "1,234.56" or "1234.56") into minor units. */
export function parseAmount(raw: string, currency: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned;
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, "");
  } else {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10 ** minorDigits(currency));
}

export function formatMoney(money: Money, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  }).format(money.amountMinor / 10 ** minorDigits(money.currency));
}

/** True when |a-b| is within `tolerancePct` percent OR one whole currency unit. */
export function withinTolerance(
  aMinor: number,
  bMinor: number,
  currency: string,
  tolerancePct = 2,
): boolean {
  const diff = Math.abs(aMinor - bMinor);
  const oneUnit = 10 ** minorDigits(currency);
  const pct = Math.abs(bMinor) * (tolerancePct / 100);
  return diff <= Math.max(oneUnit, pct);
}
