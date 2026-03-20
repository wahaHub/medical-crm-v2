import { describe, it, expect } from 'vitest';
import { resolveMaterialsPolicyId } from '../policy-resolver.js';

describe('resolveMaterialsPolicyId', () => {
  it('resolves COSMETIC surgeon', () => {
    expect(resolveMaterialsPolicyId('COSMETIC', 'surgeon')).toBe('materials_beauty_surgeon_image');
  });

  it('resolves REGULAR case', () => {
    expect(resolveMaterialsPolicyId('REGULAR', 'case')).toBe('materials_regular_case_media');
  });

  it('throws for unknown materialKind', () => {
    expect(() => resolveMaterialsPolicyId('COSMETIC', 'unknown')).toThrow('Unknown materialKind');
  });

  it('resolves COSMETIC testimonial_video', () => {
    expect(resolveMaterialsPolicyId('COSMETIC', 'testimonial_video')).toBe(
      'materials_beauty_testimonial_video',
    );
  });
});
