import { describe, expect, it } from 'vitest';
import { buildConsumerShowcaseUrl } from '@/lib/consumer-showcase-link';

describe('buildConsumerShowcaseUrl', () => {
  it('builds a cosmetic consumer URL from the hospital slug', () => {
    expect(
      buildConsumerShowcaseUrl({
        id: 'hospital-uuid',
        type: 'COSMETIC',
        consumerSlug: 'bangkok-aesthetic-center',
      }),
    ).toBe('https://www.medorabeauty.com/hospital/bangkok-aesthetic-center');
  });

  it('builds a regular consumer URL from the hospital slug', () => {
    expect(
      buildConsumerShowcaseUrl({
        id: 'hospital-uuid',
        type: 'REGULAR',
        consumerSlug: 'peking-union-medical-college-hospital',
      }),
    ).toBe('https://www.medicaltourismchina.health/hospitals/peking-union-medical-college-hospital');
  });

  it('returns null when the consumer slug is missing', () => {
    expect(
      buildConsumerShowcaseUrl({
        id: 'hospital-uuid',
        type: 'COSMETIC',
        consumerSlug: null,
      }),
    ).toBeNull();
  });
});
