import { describe, expect, it } from 'vitest';
import { mapCaseAssetsToImages, mapSurgeonRowToMaterialsSurgeon } from '../../services/materials-compat.js';

describe('materials mappers', () => {
  it('maps surgeon education, certifications, and bio fields from supabase rows', () => {
    const surgeon = mapSurgeonRowToMaterialsSurgeon(
      {
        id: 'surgeon-1',
        hospital_id: 'hospital-1',
        name: 'Dr. Alice',
        title: 'Chief Surgeon',
        image_url: 'https://example.com/direct.jpg',
        experience_years: 12,
        specialties: ['Rhinoplasty'],
        languages: ['English'],
        education: ['Peking University'],
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
      },
      'hospital-1',
    );

    expect(surgeon.imageUrl).toBe('https://example.com/direct.jpg');
    expect(surgeon.education).toEqual(['Peking University']);
    expect(surgeon.certifications).toEqual(['Board Certified']);
    expect(surgeon.intro).toBe('Intro');
    expect(surgeon.expertise).toBe('Expertise');
    expect(surgeon.philosophy).toBe('Philosophy');
    expect(surgeon.achievements).toEqual(['Achievement']);
  });

  it('falls back to legacy before-after media shapes when case_images are missing', () => {
    const images = mapCaseAssetsToImages({
      caseRow: {
        before_after_image: 'https://example.com/combined.jpg',
        mediaItems: [
          { url: 'https://example.com/before.jpg', type: 'before' },
          { image_url: 'https://example.com/after.jpg', image_type: 'after' },
        ],
      },
      caseImages: [],
      caseMedia: [
        { image_url: 'https://example.com/legacy-before.jpg', image_type: 'before', sort_order: 1 },
        { media_url: 'https://example.com/legacy-after.jpg', media_type: 'after', sort_order: 2 },
      ],
    });

    expect(images).toEqual([
      { url: 'https://example.com/legacy-before.jpg' },
      { url: 'https://example.com/legacy-after.jpg' },
    ]);
  });

  it('uses legacy row fields when no joined media rows exist', () => {
    const images = mapCaseAssetsToImages({
      caseRow: {
        before_after_image: 'https://example.com/combined.jpg',
        mediaItems: [
          { url: 'https://example.com/before.jpg', type: 'before' },
          { image_url: 'https://example.com/after.jpg', image_type: 'after' },
        ],
      },
      caseImages: [],
      caseMedia: [],
    });

    expect(images).toEqual([
      { url: 'https://example.com/before.jpg' },
      { url: 'https://example.com/after.jpg' },
      { url: 'https://example.com/combined.jpg' },
    ]);
  });
});
