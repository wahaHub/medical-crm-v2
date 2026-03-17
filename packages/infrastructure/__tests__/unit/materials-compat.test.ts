import { describe, expect, it } from 'vitest';
import {
  buildLegacyCaseImageUrl,
  buildSurgeonMutation,
  mapCaseAssetsToImages,
  mapSurgeonRowToMaterialsSurgeon,
} from '../../services/materials-compat.js';

describe('materials compatibility helpers', () => {
  it('maps surgeon legacy jsonb fields into the v2 materials shape', () => {
    const result = mapSurgeonRowToMaterialsSurgeon({
      id: 'surgeon-1',
      hospital_id: 'hospital-1',
      name: 'Dr. Kim',
      title: 'Plastic Surgeon',
      image_url: null,
      experience_years: 18,
      specialties: ['Rhinoplasty'],
      languages: ['English', 'Korean'],
      education: ['Yonsei University'],
      certifications: ['Board Certified'],
      bio: {
        intro: 'Intro',
        expertise: 'Expertise',
        philosophy: 'Philosophy',
        achievements: ['Achievement'],
      },
      images: {
        hero: 'https://example.com/hero.jpg',
      },
    }, 'hospital-1');

    expect(result).toEqual({
      id: 'surgeon-1',
      hospitalId: 'hospital-1',
      name: 'Dr. Kim',
      title: 'Plastic Surgeon',
      imageUrl: 'https://example.com/hero.jpg',
      experienceYears: 18,
      specialties: ['Rhinoplasty'],
      languages: ['English', 'Korean'],
      education: ['Yonsei University'],
      certifications: ['Board Certified'],
      intro: 'Intro',
      expertise: 'Expertise',
      philosophy: 'Philosophy',
      achievements: ['Achievement'],
    });
  });

  it('builds surgeon mutation payloads that preserve jsonb-backed profile fields', () => {
    const payload = buildSurgeonMutation({
      name: 'Dr. Kim',
      imageUrl: 'https://example.com/hero.jpg',
      education: ['Yonsei University'],
      certifications: ['Board Certified'],
      intro: 'Intro',
      expertise: 'Expertise',
      philosophy: 'Philosophy',
      achievements: ['Achievement'],
    });

    expect(payload).toMatchObject({
      name: 'Dr. Kim',
      image_url: 'https://example.com/hero.jpg',
      education: ['Yonsei University'],
      certifications: ['Board Certified'],
      bio: {
        intro: 'Intro',
        expertise: 'Expertise',
        philosophy: 'Philosophy',
        achievements: ['Achievement'],
      },
      images: {
        hero: 'https://example.com/hero.jpg',
      },
    });
  });

  it('falls back to legacy case_media photos when case_images are absent', () => {
    const images = mapCaseAssetsToImages({
      caseMedia: [
        { media_url: 'https://example.com/before.jpg', media_type: 'image', sort_order: 1 },
        { media_url: 'https://example.com/after.jpg', media_type: 'image', sort_order: 2 },
      ],
    });

    expect(images).toEqual([
      { url: 'https://example.com/before.jpg', type: 'before' },
      { url: 'https://example.com/after.jpg', type: 'after' },
    ]);
  });

  it('falls back to the legacy generated before-after asset when rows only have case_number', () => {
    const images = mapCaseAssetsToImages({
      procedureSlug: 'rhinoplasty',
      caseNumber: 'CASE-100',
      hospitalId: 'hospital-1',
      isRegularHospital: false,
    });

    expect(images).toEqual([
      { url: buildLegacyCaseImageUrl({ procedureSlug: 'rhinoplasty', caseNumber: 'CASE-100', hospitalId: 'hospital-1', isRegularHospital: false }), type: 'combined' },
    ]);
  });
});
