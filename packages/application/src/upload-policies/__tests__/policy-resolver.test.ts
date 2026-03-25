import { describe, it, expect } from 'vitest';
import { resolveMaterialsPolicyId } from '../policy-resolver.js';

describe('resolveMaterialsPolicyId', () => {
  it('resolves COSMETIC surgeon', () => {
    expect(resolveMaterialsPolicyId('COSMETIC', 'surgeon')).toBe('materials_beauty_surgeon_image');
  });

  it('resolves REGULAR case', () => {
    expect(resolveMaterialsPolicyId('REGULAR', 'case')).toBe('materials_regular_case_media');
  });

  it('resolves REGULAR testimonial_video', () => {
    expect(resolveMaterialsPolicyId('REGULAR', 'testimonial_video')).toBe(
      'materials_regular_testimonial_video',
    );
  });

  it('resolves REGULAR hospital_video', () => {
    expect(resolveMaterialsPolicyId('REGULAR', 'hospital_video')).toBe(
      'materials_regular_hospital_video',
    );
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
