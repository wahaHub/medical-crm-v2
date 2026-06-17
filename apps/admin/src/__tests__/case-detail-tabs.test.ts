import { describe, expect, it } from 'vitest';
import { shouldShowCaseDetailTab } from '../lib/case-detail-tabs';

describe('CaseDetailTabs visibility', () => {
  it('shows medical intake for regular cases and beauty intake for cosmetic cases', () => {
    expect(shouldShowCaseDetailTab('intake', 'REGULAR')).toBe(true);
    expect(shouldShowCaseDetailTab('beauty', 'REGULAR')).toBe(false);

    expect(shouldShowCaseDetailTab('intake', 'COSMETIC')).toBe(false);
    expect(shouldShowCaseDetailTab('beauty', 'COSMETIC')).toBe(true);
  });

  it('keeps legacy cases with missing hospital type on the medical intake path', () => {
    expect(shouldShowCaseDetailTab('intake', null)).toBe(true);
    expect(shouldShowCaseDetailTab('beauty', null)).toBe(false);
    expect(shouldShowCaseDetailTab('overview', null)).toBe(true);
  });
});
