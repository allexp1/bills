/**
 * Formatting shared by the dashboard, the provider page and the bill list, so
 * a billing period cannot be written one way in the card and another way in the
 * list inside it.
 */

export function money(minor: number | null, currency: string | null, locale = "en"): string {
  if (minor === null) return "n/a";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency ?? ""}`.trim();
  }
}

export function dateLabel(iso: string, locale = "en"): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

/**
 * A billing period as a person would say it: "2 Jun to 1 Jul 2026", with the
 * year written once when both ends share it.
 *
 * The raw ISO pair was the single longest string on a service card, and on a
 * phone "2026-06-02 to 2026-07-01" is nine characters longer than the answer it
 * gives. It also reads as machine output on a screen whose whole job is to make
 * a bill legible.
 */
export function periodLabel(start: string | null, end: string | null, locale = "en"): string | null {
  if (!start || !end) return null;
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return `${start} to ${end}`;
  try {
    const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
    const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    return `${sameYear ? short.format(from) : dateLabel(start, locale)} to ${dateLabel(end, locale)}`;
  } catch {
    return `${start} to ${end}`;
  }
}
