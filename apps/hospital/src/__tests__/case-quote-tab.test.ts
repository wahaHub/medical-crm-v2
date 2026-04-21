import { describe, expect, it } from 'vitest';
import { getQuoteStatusLabel } from '../components/tabs/case-quote-tab';

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
});
