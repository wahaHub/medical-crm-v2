export const SUPPORTED_LOCALES = ['en', 'zh', 'fr', 'de', 'es', 'bn'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh';
export type Messages = Record<string, unknown>;

const supportedLocaleSet = new Set<string>(SUPPORTED_LOCALES);

/** Load messages for a given locale. Returns flat key-value object. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const mod = await import(`./locales/${locale}.json`);
  return mod.default;
}

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && supportedLocaleSet.has(value));
}

export function normalizeLocale(value: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!value) return fallback;

  const normalized = value.toLowerCase().replace(/_/g, '-');
  const exactMatch = supportedLocaleSet.has(normalized) ? normalized : normalized.split('-')[0];

  return isSupportedLocale(exactMatch) ? exactMatch : fallback;
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

export function getMessageValue(messages: Messages, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((current, part) => (
      current && typeof current === 'object' && part in (current as Record<string, unknown>)
        ? (current as Record<string, unknown>)[part]
        : undefined
    ), messages);
}

export function translateMessage(
  messages: Messages,
  key: string,
  values?: Record<string, string | number>,
  fallback?: string,
): string {
  const message = getMessageValue(messages, key);
  if (typeof message !== 'string') {
    return fallback ?? key;
  }

  return interpolate(message, values);
}
