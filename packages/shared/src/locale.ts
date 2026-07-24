/** Launch locales. Copy, WhatsApp templates and web strings exist for each. */
export const SUPPORTED_LOCALES = ["en", "es", "fr", "pt", "de"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

/** Map a BCP-47 tag (e.g. WhatsApp profile locale "pt_BR") to a supported locale. */
export function resolveLocale(tag: string | null | undefined): SupportedLocale {
  if (!tag) return DEFAULT_LOCALE;
  const base = tag.toLowerCase().replace("_", "-").split("-")[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base ?? "")
    ? (base as SupportedLocale)
    : DEFAULT_LOCALE;
}

/** Localized string bundle: every supported locale must be present. */
export type Localized = Record<SupportedLocale, string>;

export function pickLocalized(bundle: Partial<Localized>, locale: SupportedLocale): string {
  return bundle[locale] ?? bundle[DEFAULT_LOCALE] ?? Object.values(bundle)[0] ?? "";
}
