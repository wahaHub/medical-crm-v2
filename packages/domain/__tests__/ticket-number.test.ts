import { describe, it, expect } from 'vitest';
import { TicketNumber } from '../src/value-objects/ticket-number.js';

describe('TicketNumber', () => {
  it('accepts valid format TKT-YYYYMMDD-XXXX', () => {
    const tn = new TicketNumber('TKT-20260101-0001');
    expect(tn.value).toBe('TKT-20260101-0001');
  });

  it('accepts another valid format', () => {
    const tn = new TicketNumber('TKT-20261231-9999');
    expect(tn.value).toBe('TKT-20261231-9999');
  });

  it('throws on invalid format - missing prefix', () => {
    expect(() => new TicketNumber('INVALID')).toThrow('Invalid ticket number format: INVALID');
  });

  it('throws on invalid format - wrong prefix', () => {
    expect(() => new TicketNumber('QT-20260101-0001')).toThrow('Invalid ticket number format');
  });

  it('throws on invalid format - short date', () => {
    expect(() => new TicketNumber('TKT-2026011-0001')).toThrow('Invalid ticket number format');
  });

  it('throws on invalid format - short sequence', () => {
    expect(() => new TicketNumber('TKT-20260101-001')).toThrow('Invalid ticket number format');
  });

  it('throws on invalid format - long sequence', () => {
    expect(() => new TicketNumber('TKT-20260101-00001')).toThrow('Invalid ticket number format');
  });

  it('throws on empty string', () => {
    expect(() => new TicketNumber('')).toThrow('Invalid ticket number format');
  });

  it('generate() produces valid ticket number', () => {
    const tn = TicketNumber.generate(1);
    expect(tn.value).toMatch(/^TKT-\d{8}-0001$/);
  });

  it('generate() pads sequence to 4 digits', () => {
    const tn = TicketNumber.generate(42);
    expect(tn.value).toMatch(/^TKT-\d{8}-0042$/);
  });

  it('generate() uses current date', () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const expected = `TKT-${y}${m}${d}-0001`;
    const tn = TicketNumber.generate(1);
    expect(tn.value).toBe(expected);
  });
});
