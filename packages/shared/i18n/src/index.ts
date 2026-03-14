export const SUPPORTED_LOCALES = ['en', 'zh', 'fr', 'de', 'es', 'bn'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh';

/** Load messages for a given locale. Returns flat key-value object. */
export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const mod = await import(`./locales/${locale}.json`);
  return mod.default;
}

/**
 * Simple interpolation: replace {placeholder} with provided values.
 * Matches v1 behavior from lib/i18n-client.tsx.
 */
export function interpolate(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}
