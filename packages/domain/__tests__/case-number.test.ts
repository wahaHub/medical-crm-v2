import { describe, it, expect } from 'vitest';
import { CaseNumber } from '../src/value-objects/case-number.js';

describe('CaseNumber', () => {
  it('accepts valid format CASE-YYYY-NNNN', () => {
    const cn = new CaseNumber('CASE-2026-0001');
    expect(cn.value).toBe('CASE-2026-0001');
  });

  it('accepts longer sequences CASE-2026-12345', () => {
    const cn = new CaseNumber('CASE-2026-12345');
    expect(cn.value).toBe('CASE-2026-12345');
  });

  it('accepts 3-digit sequences (legacy data)', () => {
    const cn = new CaseNumber('CASE-2024-001');
    expect(cn.value).toBe('CASE-2024-001');
  });

  it('throws on invalid format', () => {
    expect(() => new CaseNumber('INVALID')).toThrow('Invalid case number format');
    expect(() => new CaseNumber('CASE-26-001')).toThrow('Invalid case number format');
    expect(() => new CaseNumber('CASE-2026-01')).toThrow('Invalid case number format');
    expect(() => new CaseNumber('')).toThrow('Invalid case number format');
  });

  it('generates with correct format', () => {
    const cn = CaseNumber.generate(2026, 1);
    expect(cn.value).toBe('CASE-2026-0001');
  });

  it('generates with large sequence numbers', () => {
    const cn = CaseNumber.generate(2026, 99999);
    expect(cn.value).toBe('CASE-2026-99999');
  });

  it('pads sequence to minimum 4 digits', () => {
    const cn = CaseNumber.generate(2026, 42);
    expect(cn.value).toBe('CASE-2026-0042');
  });
});
