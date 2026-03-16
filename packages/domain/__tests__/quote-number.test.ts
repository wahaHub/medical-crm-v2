import { describe, it, expect } from 'vitest';
import { QuoteNumber } from '../src/value-objects/quote-number.js';

describe('QuoteNumber', () => {
  it('accepts valid format QT-YYYYMMDD-XXXX', () => {
    const qn = new QuoteNumber('QT-20260101-0001');
    expect(qn.value).toBe('QT-20260101-0001');
  });

  it('accepts another valid format', () => {
    const qn = new QuoteNumber('QT-20261231-9999');
    expect(qn.value).toBe('QT-20261231-9999');
  });

  it('throws on invalid format - missing prefix', () => {
    expect(() => new QuoteNumber('INVALID')).toThrow('Invalid quote number format: INVALID');
  });

  it('throws on invalid format - wrong prefix', () => {
    expect(() => new QuoteNumber('CASE-20260101-0001')).toThrow('Invalid quote number format');
  });

  it('throws on invalid format - short date', () => {
    expect(() => new QuoteNumber('QT-2026011-0001')).toThrow('Invalid quote number format');
  });

  it('throws on invalid format - short sequence', () => {
    expect(() => new QuoteNumber('QT-20260101-001')).toThrow('Invalid quote number format');
  });

  it('throws on invalid format - long sequence', () => {
    expect(() => new QuoteNumber('QT-20260101-00001')).toThrow('Invalid quote number format');
  });

  it('throws on empty string', () => {
    expect(() => new QuoteNumber('')).toThrow('Invalid quote number format');
  });

  it('generate() produces valid quote number', () => {
    const qn = QuoteNumber.generate(1);
    expect(qn.value).toMatch(/^QT-\d{8}-0001$/);
  });

  it('generate() pads sequence to 4 digits', () => {
    const qn = QuoteNumber.generate(42);
    expect(qn.value).toMatch(/^QT-\d{8}-0042$/);
  });

  it('generate() uses current date', () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const expected = `QT-${y}${m}${d}-0001`;
    const qn = QuoteNumber.generate(1);
    expect(qn.value).toBe(expected);
  });
});
