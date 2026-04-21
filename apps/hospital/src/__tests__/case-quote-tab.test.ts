import { describe, expect, it } from 'vitest';
import {
  calculateQuoteTotal,
  getQuoteStatusLabel,
  isCompleteLineItem,
  isValidLineItemAmount,
  normalizeQuoteLineItems,
} from '../components/tabs/case-quote-tab';

type TranslationFn = (key: string, params?: Record<string, unknown>, fallback?: string) => string;

function createTranslationFn(overrides: Record<string, string>): TranslationFn {
  return (key, _params, fallback) => overrides[key] ?? fallback ?? key;
}

describe('case quote tab helpers', () => {
  it('maps quote statuses through locale-aware labels and hides unknown codes', () => {
    const t = createTranslationFn({
      'hospital.cases.detail.quote.status.pending': 'Localized Pending',
      'hospital.cases.detail.quote.status.accepted': 'Localized Accepted',
      'hospital.common.statuses.unknown': 'Localized Unknown',
    });

    expect(getQuoteStatusLabel('PENDING', t)).toBe('Localized Pending');
    expect(getQuoteStatusLabel('ACCEPTED', t)).toBe('Localized Accepted');
    expect(getQuoteStatusLabel('AWAITING_LEGAL_REVIEW', t)).toBe('Localized Unknown');
  });

  it('normalizes mixed quote line-item payloads so multiple quoted items stay visible', () => {
    expect(
      normalizeQuoteLineItems([
        { name: 'Procedure A', amount: '5000.00' },
        { item: 'Procedure B', amount: '2500.00' },
        null,
      ]),
    ).toEqual([
      { name: 'Procedure A', amount: '5000.00' },
      { name: 'Procedure B', amount: '2500.00' },
    ]);
  });

  it('only counts complete line items in the computed quote total', () => {
    const lineItems = [
      { name: 'Procedure A', amount: '5000.00' },
      { name: '', amount: '2500.00' },
      { name: 'Procedure C', amount: '' },
    ];

    expect(lineItems.filter(isCompleteLineItem)).toEqual([
      { name: 'Procedure A', amount: '5000.00' },
    ]);
    expect(calculateQuoteTotal(lineItems.filter(isCompleteLineItem))).toBe(5000);
  });

  it('rejects malformed amounts from complete quote line items', () => {
    expect(isValidLineItemAmount('100.50')).toBe(true);
    expect(isValidLineItemAmount('abc')).toBe(false);
    expect(isCompleteLineItem({ name: 'Procedure A', amount: 'abc' })).toBe(false);
  });
});
