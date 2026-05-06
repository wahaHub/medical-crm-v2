import { describe, expect, it } from 'vitest';
import {
  buildLegacyCaseImageUrl,
  mapCaseAssetsToMedia,
  buildSurgeonMutation,
  mapCaseAssetsToImages,
  mapSurgeonRowToMaterialsSurgeon,
  shouldIgnoreCaseMediaError,
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
      translations: {},
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
      { url: 'https://example.com/before.jpg' },
      { url: 'https://example.com/after.jpg' },
    ]);
  });

  it('ignores non-image case_media entries when building gallery images', () => {
    const images = mapCaseAssetsToImages({
      caseMedia: [
        { media_url: 'https://example.com/intro.mp4', media_type: 'video', sort_order: 1 },
        { media_url: 'https://example.com/cover.jpg', media_type: 'image', sort_order: 2 },
      ],
    });

    expect(images).toEqual([
      { url: 'https://example.com/cover.jpg' },
    ]);
  });

  it('preserves video case_media entries when building mixed case media', () => {
    const media = mapCaseAssetsToMedia({
      caseMedia: [
        { media_url: 'https://example.com/intro.mp4', media_type: 'video', thumbnail_url: 'https://example.com/intro.jpg', sort_order: 1 },
        { media_url: 'https://example.com/cover.jpg', media_type: 'image', sort_order: 2 },
      ],
    });

    expect(media).toEqual([
      {
        type: 'video',
        url: 'https://example.com/intro.mp4',
        thumbnailUrl: 'https://example.com/intro.jpg',
      },
      {
        type: 'image',
        url: 'https://example.com/cover.jpg',
        thumbnailUrl: null,
      },
    ]);
  });

  it('converts relative table-backed case media thumbnails to absolute URLs', () => {
    const media = mapCaseAssetsToMedia({
      caseMedia: [
        {
          media_url: '/hospitals/h-1/cases/demo/case-video.mp4',
          media_type: 'video',
          thumbnail_url: '/hospitals/h-1/cases/demo/case-video.jpg',
          sort_order: 1,
        },
      ],
      isRegularHospital: false,
    });

    expect(media[0]?.url).toMatch(/^https?:\/\//);
    expect(media[0]?.url).toContain('/hospitals/h-1/cases/demo/case-video.mp4');
    expect(media[0]?.thumbnailUrl).toMatch(/^https?:\/\//);
    expect(media[0]?.thumbnailUrl).toContain('/hospitals/h-1/cases/demo/case-video.jpg');
  });

  it('converts relative json-backed case media thumbnails to absolute regular-hospital URLs', () => {
    const media = mapCaseAssetsToMedia({
      caseRow: {
        mediaItems: [
          {
            type: 'video',
            url: 'hospital_photos/public/h-1/cases/demo/case-video.mp4',
            thumbnailUrl: 'hospital_photos/public/h-1/cases/demo/case-video.jpg',
          },
        ],
      },
      isRegularHospital: true,
    });

    expect(media[0]?.url).toMatch(/^https?:\/\//);
    expect(media[0]?.url).toContain('/hospital_photos/public/h-1/cases/demo/case-video.mp4');
    expect(media[0]?.thumbnailUrl).toMatch(/^https?:\/\//);
    expect(media[0]?.thumbnailUrl).toContain('/hospital_photos/public/h-1/cases/demo/case-video.jpg');
  });

  it('merges case_images and case_media by global sort order for mixed media', () => {
    const media = mapCaseAssetsToMedia({
      caseImages: [
        { image_url: 'https://example.com/after.jpg', sort_order: 1 },
      ],
      caseMedia: [
        { media_url: 'https://example.com/intro.mp4', media_type: 'video', sort_order: 0 },
      ],
    });

    expect(media).toEqual([
      { type: 'video', url: 'https://example.com/intro.mp4', thumbnailUrl: null },
      { type: 'image', url: 'https://example.com/after.jpg', thumbnailUrl: null },
    ]);
  });

  it('preserves image-video-image ordering across case_images and case_media', () => {
    const media = mapCaseAssetsToMedia({
      caseImages: [
        { image_url: 'https://example.com/before.jpg', sort_order: 0 },
        { image_url: 'https://example.com/after.jpg', sort_order: 2 },
      ],
      caseMedia: [
        { media_url: 'https://example.com/progress.mp4', media_type: 'video', sort_order: 1 },
      ],
    });

    expect(media).toEqual([
      { type: 'image', url: 'https://example.com/before.jpg', thumbnailUrl: null },
      { type: 'video', url: 'https://example.com/progress.mp4', thumbnailUrl: null },
      { type: 'image', url: 'https://example.com/after.jpg', thumbnailUrl: null },
    ]);
  });

  it('converts relative case image paths to absolute URLs for hospital role', () => {
    const images = mapCaseAssetsToImages({
      caseImages: [
        { image_url: '/hospitals/h-1/cases/demo/case-1.png', sort_order: 1 },
      ],
      isRegularHospital: false,
    });

    expect(images[0]?.url).toMatch(/^https?:\/\//);
    expect(images[0]?.url).toContain('/hospitals/h-1/cases/demo/case-1.png');
  });

  it('falls back to the legacy generated before-after asset when rows only have case_number', () => {
    const images = mapCaseAssetsToImages({
      procedureSlug: 'rhinoplasty',
      caseNumber: 'CASE-100',
      hospitalId: 'hospital-1',
      isRegularHospital: false,
    });

    expect(images).toEqual([
      { url: buildLegacyCaseImageUrl({ procedureSlug: 'rhinoplasty', caseNumber: 'CASE-100', hospitalId: 'hospital-1', isRegularHospital: false }) },
    ]);
  });

  it('ignores missing case_media table/column errors so cases can still load from case_images', () => {
    expect(shouldIgnoreCaseMediaError({ code: 'PGRST200', message: 'Could not find the table case_media' })).toBe(true);
    expect(shouldIgnoreCaseMediaError({ code: '42703', message: 'column case_media.image_url does not exist' })).toBe(true);
    expect(shouldIgnoreCaseMediaError({ code: '42501', message: 'permission denied for table case_media' })).toBe(true);
    expect(shouldIgnoreCaseMediaError({ code: 'PGRST200', message: 'Could not find the table case_images' })).toBe(true);
    expect(shouldIgnoreCaseMediaError({ code: '42703', message: 'column case_images.image_url does not exist' })).toBe(true);
    expect(shouldIgnoreCaseMediaError({ code: '42501', message: 'permission denied for table case_images' })).toBe(true);
    expect(shouldIgnoreCaseMediaError({ code: 'XX000', message: 'unexpected db error' })).toBe(false);
  });
});
