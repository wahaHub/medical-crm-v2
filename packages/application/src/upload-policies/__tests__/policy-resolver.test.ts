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

  it('resolves REGULAR package cover uploads', () => {
    expect(resolveMaterialsPolicyId('REGULAR', 'package_cover')).toBe(
      'materials_regular_hospital_image',
    );
  });

  it('resolves REGULAR review avatar uploads', () => {
    expect(resolveMaterialsPolicyId('REGULAR', 'review_avatar')).toBe(
      'materials_regular_hospital_image',
    );
  });

  it('resolves REGULAR review video uploads', () => {
    expect(resolveMaterialsPolicyId('REGULAR', 'review_video')).toBe(
      'materials_regular_hospital_video',
    );
  });

  it('routes hospital PDF uploads by hospital type', () => {
    expect(resolveMaterialsPolicyId('COSMETIC', 'hospital_pdf')).toBe(
      'materials_beauty_hospital_pdf',
    );
    expect(resolveMaterialsPolicyId('REGULAR', 'hospital_pdf')).toBe(
      'materials_regular_hospital_pdf',
    );
  });
});
