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
        site: 'china',
        consumerSlug: 'peking-union-medical-college-hospital',
      }),
    ).toBe('https://www.medicaltourismchina.health/hospitals/peking-union-medical-college-hospital');
  });

  it('builds a global regular consumer URL from the hospital slug', () => {
    expect(
      buildConsumerShowcaseUrl({
        id: 'a850398e-f7de-4d59-bb4a-876812ab2056',
        type: 'REGULAR',
        site: 'global',
        consumerSlug: 'mongolian-spinal-hospital',
      }),
    ).toBe('https://globalcareaccess.health/hospitals/mongolian-spinal-hospital');
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
