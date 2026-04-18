import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  loadMessages,
  interpolate,
  normalizeLocale,
  getMessageValue,
  translateMessage,
} from '../index';

describe('i18n', () => {
  it('exports supported locales', () => {
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(SUPPORTED_LOCALES).toContain('zh');
    expect(SUPPORTED_LOCALES).toHaveLength(6);
  });

  it('default locale is zh', () => {
    expect(DEFAULT_LOCALE).toBe('zh');
  });

  it('loads en messages', async () => {
    const messages = await loadMessages('en');
    expect(messages).toBeDefined();
    expect(typeof messages).toBe('object');
  });

  it('loads zh messages', async () => {
    const messages = await loadMessages('zh');
    expect(messages).toBeDefined();
  });
});

describe('interpolate', () => {
  it('replaces placeholders', () => {
    expect(interpolate('Hello {name}!', { name: 'World' })).toBe('Hello World!');
  });

  it('replaces numeric placeholders', () => {
    expect(interpolate('Count: {n}', { n: 42 })).toBe('Count: 42');
  });

  it('leaves unreplaced placeholders', () => {
    expect(interpolate('Hello {name}!', {})).toBe('Hello {name}!');
  });

  it('returns template when no values', () => {
    expect(interpolate('Hello World!')).toBe('Hello World!');
  });
});

describe('normalizeLocale', () => {
  it('keeps supported locales', () => {
    expect(normalizeLocale('fr')).toBe('fr');
  });

  it('normalizes locale variants', () => {
    expect(normalizeLocale('fr-CA')).toBe('fr');
    expect(normalizeLocale('ZH_hans')).toBe('zh');
  });

  it('falls back for unsupported locales', () => {
    expect(normalizeLocale('ja')).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
  });
});

describe('message lookup', () => {
  it('reads nested message keys', async () => {
    const messages = await loadMessages('en');
    expect(getMessageValue(messages, 'common.nav.dashboard')).toBe('Dashboard');
  });

  it('returns undefined for missing keys', async () => {
    const messages = await loadMessages('en');
    expect(getMessageValue(messages, 'hospital.fake.missing')).toBeUndefined();
  });

  it('translates with interpolation and fallback', async () => {
    const messages = await loadMessages('en');
    expect(translateMessage(messages, 'timeDate.minutesAgo', { count: 5 }, 'fallback')).toBe('5 minutes ago');
    expect(translateMessage(messages, 'common.nav.dashboard')).toBe('Dashboard');
    expect(translateMessage(messages, 'missing.key', undefined, 'Fallback')).toBe('Fallback');
  });
});
