import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, loadMessages, interpolate } from '../index';

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
