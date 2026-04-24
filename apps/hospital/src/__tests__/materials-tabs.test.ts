import React from 'react';
import { createRequire } from 'node:module';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackageMutationPayload } from '../components/materials/package-editor';
import { buildReviewMutationPayload } from '../components/materials/reviews-tab';
import {
  extractSafeUserErrorDetail,
  formatUserFacingError,
} from '../components/materials-tabs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const require = createRequire(import.meta.url);

function readMaterialsPageSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/app/(portal)/materials/page.tsx'), 'utf8');
}

function readMaterialsReviewsRouteSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/app/api/materials/reviews/route.ts'), 'utf8');
}

function readMaterialsReviewByIdRouteSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/app/api/materials/reviews/[id]/route.ts'), 'utf8');
}

function readMaterialsPackagesRouteSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/app/api/materials/packages/route.ts'), 'utf8');
}

function readMaterialsPackageByIdRouteSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/app/api/materials/packages/[id]/route.ts'), 'utf8');
}

function readMaterialsApiTypesSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/lib/api-types.ts'), 'utf8');
}

function readMaterialsQueriesSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/queries/use-materials.ts'), 'utf8');
}

function readMaterialsActionsSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/actions/materials-actions.ts'), 'utf8');
}

function readReviewsTabSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/components/materials/reviews-tab.tsx'), 'utf8');
}

function readPackagesTabSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/components/materials/packages-tab.tsx'), 'utf8');
}

function readLocaleBundle(locale: 'en' | 'zh' | 'fr' | 'de' | 'es' | 'bn') {
  return JSON.parse(
    readFileSync(join(ROOT, `packages/shared/i18n/src/locales/${locale}.json`), 'utf8'),
  ) as Record<string, unknown>;
}

function getNestedValue(bundle: Record<string, unknown>, key: string) {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, bundle);
}

async function renderMaterialsTabsForRole(role: 'hospital' | 'regular_hospital') {
  vi.resetModules();
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  vi.doMock('@tanstack/react-query', () => ({
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  }));
  vi.doMock('@/lib/hospital-i18n', () => ({
    useHospitalI18n: () => ({
      locale: 'en',
      t: (_key: string, values?: Record<string, string | number>, fallback?: string) => {
        if (!fallback) {
          return '';
        }

        return values
          ? Object.entries(values).reduce(
            (message, [token, value]) => message.replace(`{${token}}`, String(value)),
            fallback,
          )
          : fallback;
      },
    }),
  }));
  vi.doMock('@/lib/auth-context', () => ({
    useAuth: () => ({
      user: {
        roles: [role],
      },
    }),
  }));
  vi.doMock('@/queries/use-materials', () => ({
    useMaterialsInfo: () => ({
      data: {
        slug: 'demo-hospital',
      },
    }),
    useProcedures: () => ({
      data: [],
      isLoading: false,
      error: null,
    }),
    useSurgeons: () => ({
      data: [],
      isLoading: false,
      error: null,
    }),
    useBeforeAfterCases: () => ({
      data: [],
      isLoading: false,
      error: null,
    }),
  }));
  vi.doMock('@/components/materials/reviews-tab', () => ({
    ReviewsTab: () => React.createElement('div', null, '__reviews_component__'),
  }));
  vi.doMock('@/components/materials/packages-tab', () => ({
    PackagesTab: () => React.createElement('div', null, '__packages_component__'),
  }));

  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (element: React.ReactElement) => string;
  };
  const { MaterialsTabs } = await import('../components/materials-tabs');

  return renderToStaticMarkup(React.createElement(MaterialsTabs));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('materials tabs hook ordering', () => {
  it('keeps only validation-style details and hides backend-ish messages', () => {
    const translate = (key: string, values?: Record<string, string | number>, fallback?: string) => {
      if (key === 'hospital.materials.errors.withDetail' && values) {
        return `${values.summary} Details: ${values.detail}`;
      }
      return fallback ?? key;
    };

    expect(extractSafeUserErrorDetail(new Error('Connection refused to database'))).toBeUndefined();
    expect(extractSafeUserErrorDetail(new Error('Name is required.'))).toBe('Name is required.');
    expect(extractSafeUserErrorDetail(new Error('Name is required.\nPlease try again.'))).toBeUndefined();

    expect(
      formatUserFacingError(
        new Error('Connection refused to database'),
        translate,
        'hospital.materials.surgeons.saveFailed',
        'Failed to save surgeon.',
      ),
    ).toBe('Failed to save surgeon.');

    expect(
      formatUserFacingError(
        new Error('Name is required.'),
        translate,
        'hospital.materials.surgeons.saveFailed',
        'Failed to save surgeon.',
      ),
    ).toBe('Failed to save surgeon. Details: Name is required.');

    expect(
      formatUserFacingError(
        new Error('Name is required.\nPlease try again.'),
        translate,
        'hospital.materials.surgeons.saveFailed',
        'Failed to save surgeon.',
      ),
    ).toBe('Failed to save surgeon.');
  });

  it('routes the materials page heading through translation keys', () => {
    const source = readMaterialsPageSource();

    expect(source).toContain("hospital.materials.page.title");
    expect(source).toContain("hospital.materials.page.description");
  });

  it('adds proxy routes for hospital materials reviews and packages collections and items', () => {
    const reviewsCollection = readMaterialsReviewsRouteSource();
    const reviewsItem = readMaterialsReviewByIdRouteSource();
    const packagesCollection = readMaterialsPackagesRouteSource();
    const packagesItem = readMaterialsPackageByIdRouteSource();

    expect(reviewsCollection).toContain('/api/v2/hospitals/${hospitalId}/materials/reviews');
    expect(reviewsItem).toContain('/api/v2/hospitals/${hospitalId}/materials/reviews/${id}');
    expect(packagesCollection).toContain('/api/v2/hospitals/${hospitalId}/materials/packages');
    expect(packagesItem).toContain('/api/v2/hospitals/${hospitalId}/materials/packages/${id}');
    expect(reviewsItem).not.toContain('export async function GET(');
    expect(packagesItem).toContain('export async function GET(');
  });

  it('exposes materials review and package hooks that point at the new proxy routes', () => {
    const source = readMaterialsQueriesSource();

    expect(source).toContain("queryKey: ['materials', 'reviews']");
    expect(source).toContain("queryKey: ['materials', 'packages']");
    expect(source).toContain("queryKey: ['materials', 'packages', id]");
    expect(source).toContain("/api/materials/reviews");
    expect(source).toContain("/api/materials/packages");
    expect(source).toContain("/api/materials/packages/${id}");
    expect(source).toContain('export function useReviews()');
    expect(source).toContain('export function usePackages()');
    expect(source).toContain('export function usePackage(id: string | null)');
  });

  it('declares explicit nested DTOs for materials reviews and packages', () => {
    const source = readMaterialsApiTypesSource();

    expect(source).toContain('export interface MaterialsReviewDTO');
    expect(source).toContain('translations?: Record<string, Record<string, unknown>>');
    expect(source).toContain("type: 'image' | 'video'");
    expect(source).toContain('reviewComment: string');
    expect(source).toContain('export interface MaterialsPackageDTO');
    expect(source).toContain('gallery: MaterialsPackageGalleryItemDTO[]');
    expect(source).toContain('tags: MaterialsPackageTagDTO[]');
    expect(source).toContain('includes: MaterialsPackageIncludeDTO[]');
    expect(source).toContain('process: MaterialsPackageProcessDTO[]');
    expect(source).toContain('cases: MaterialsPackageCaseDTO[]');
    expect(source).toContain('reviews: MaterialsPackageReviewDTO[]');
  });

  it('builds review save payloads with durable storage keys while keeping display urls in editor state', () => {
    const payload = buildReviewMutationPayload({
      id: 'review-1',
      sortOrder: 1,
      isActive: true,
      featured: false,
      patientName: 'Sarah',
      patientCountry: 'SG',
      patientAvatarUrl: 'https://signed/crm/dev/materials-regular/reviews/avatar.jpg?token=expiring',
      patientAvatarStorageKey: 'crm/dev/materials-regular/reviews/avatar.jpg',
      treatmentName: 'LASIK',
      reviewTitle: 'Worth it',
      reviewComment: 'Great care',
      rating: 5,
      reviewDate: '2026-04-24',
      media: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          type: 'video',
          url: 'https://signed/crm/dev/materials-regular/reviews/video.mp4?token=expiring',
          storageKey: 'crm/dev/materials-regular/reviews/video.mp4',
          thumbnailUrl: 'https://signed/crm/dev/materials-regular/reviews/video-thumb.jpg?token=expiring',
          thumbnailStorageKey: 'crm/dev/materials-regular/reviews/video-thumb.jpg',
          caption: 'After',
          sortOrder: 2,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          type: 'image',
          url: 'https://cdn.example.com/review-image.jpg',
          storageKey: null,
          thumbnailUrl: '',
          thumbnailStorageKey: null,
          caption: '',
          sortOrder: 1,
        },
      ],
    });

    expect(payload.patientAvatarUrl).toBe('crm/dev/materials-regular/reviews/avatar.jpg');
    expect(payload.patientCountry).toBe('SG');
    expect(payload.treatmentName).toBe('LASIK');
    expect(payload.reviewTitle).toBe('Worth it');
    expect(payload.reviewDate).toBe('2026-04-24');
    expect(payload.media).toEqual([
      expect.objectContaining({
        id: '22222222-2222-4222-8222-222222222222',
        url: 'https://cdn.example.com/review-image.jpg',
        storageKey: null,
        sortOrder: 0,
      }),
      expect.objectContaining({
        id: '11111111-1111-4111-8111-111111111111',
        url: 'crm/dev/materials-regular/reviews/video.mp4',
        storageKey: 'crm/dev/materials-regular/reviews/video.mp4',
        thumbnailUrl: 'crm/dev/materials-regular/reviews/video-thumb.jpg',
        thumbnailStorageKey: 'crm/dev/materials-regular/reviews/video-thumb.jpg',
        sortOrder: 1,
      }),
    ]);
  });

  it('converts cleared optional review fields to null in the mutation payload', () => {
    const payload = buildReviewMutationPayload({
      id: 'review-1',
      sortOrder: 0,
      isActive: true,
      featured: false,
      patientName: 'Sarah',
      patientCountry: '',
      patientAvatarUrl: '',
      patientAvatarStorageKey: null,
      treatmentName: '',
      reviewTitle: '',
      reviewComment: 'Still keeping the main comment',
      rating: 5,
      reviewDate: '',
      media: [
        {
          id: 'media-1',
          type: 'image',
          url: 'https://cdn.example.com/review-image.jpg',
          storageKey: null,
          thumbnailUrl: '',
          thumbnailStorageKey: null,
          caption: '',
          sortOrder: 0,
        },
      ],
    });

    expect(payload.patientCountry).toBeNull();
    expect(payload.patientAvatarUrl).toBeNull();
    expect(payload.treatmentName).toBeNull();
    expect(payload.reviewTitle).toBeNull();
    expect(payload.reviewDate).toBeNull();
    expect(payload.media).toEqual([
      expect.objectContaining({
        thumbnailUrl: null,
        caption: null,
      }),
    ]);
  });

  it('keeps review mutation payload building null-safe after a clear-and-reload cycle', () => {
    const payload = buildReviewMutationPayload({
      id: 'review-1',
      sortOrder: 0,
      isActive: false,
      featured: false,
      patientName: 'Sarah',
      patientCountry: null as unknown as string,
      patientAvatarUrl: null as unknown as string,
      patientAvatarStorageKey: null,
      treatmentName: null as unknown as string,
      reviewTitle: null as unknown as string,
      reviewComment: 'Still keeping the main comment',
      rating: 5,
      reviewDate: null as unknown as string,
      media: [],
    });

    expect(payload.patientCountry).toBeNull();
    expect(payload.patientAvatarUrl).toBeNull();
    expect(payload.treatmentName).toBeNull();
    expect(payload.reviewTitle).toBeNull();
    expect(payload.reviewDate).toBeNull();
  });

  it('drops placeholder review media ids while preserving persisted UUID ids', () => {
    const payload = buildReviewMutationPayload({
      id: 'review-1',
      sortOrder: 0,
      isActive: true,
      featured: false,
      patientName: 'Sarah',
      patientCountry: 'SG',
      patientAvatarUrl: '',
      patientAvatarStorageKey: null,
      treatmentName: 'LASIK',
      reviewTitle: 'Worth it',
      reviewComment: 'Great care',
      rating: 5,
      reviewDate: '2026-04-24',
      media: [
        {
          id: 'media-local123',
          type: 'image',
          url: 'https://cdn.example.com/new-image.jpg',
          storageKey: null,
          thumbnailUrl: '',
          thumbnailStorageKey: null,
          caption: '',
          sortOrder: 0,
        },
        {
          id: '11111111-1111-4111-8111-111111111111',
          type: 'image',
          url: 'https://cdn.example.com/existing-image.jpg',
          storageKey: null,
          thumbnailUrl: '',
          thumbnailStorageKey: null,
          caption: '',
          sortOrder: 1,
        },
      ],
    });

    expect(payload.media).toEqual([
      expect.objectContaining({
        id: undefined,
        url: 'https://cdn.example.com/new-image.jpg',
      }),
      expect.objectContaining({
        id: '11111111-1111-4111-8111-111111111111',
        url: 'https://cdn.example.com/existing-image.jpg',
      }),
    ]);
  });

  it('builds package save payloads with durable storage keys for cover and gallery media', () => {
    const payload = buildPackageMutationPayload({
      id: 'package-1',
      slug: 'premium-lasik',
      sortOrder: 1,
      isActive: true,
      title: 'Premium LASIK',
      subtitle: 'Fast recovery',
      coverImageUrl: 'https://signed/crm/dev/materials-regular/packages/cover.jpg?token=expiring',
      coverImageStorageKey: 'crm/dev/materials-regular/packages/cover.jpg',
      gallery: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          imageUrl: 'https://signed/crm/dev/materials-regular/packages/gallery-2.jpg?token=expiring',
          storageKey: 'crm/dev/materials-regular/packages/gallery-2.jpg',
          sortOrder: 2,
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          imageUrl: 'https://cdn.example.com/gallery-1.jpg',
          storageKey: null,
          sortOrder: 1,
        },
      ],
      price: '1200',
      currency: 'USD',
      duration: '3 days',
      summary: 'Complete package',
      tags: [],
      includes: [],
      process: [],
      cases: [],
      reviews: [],
    });

    expect(payload.coverImageUrl).toBe('crm/dev/materials-regular/packages/cover.jpg');
    expect(payload.subtitle).toBe('Fast recovery');
    expect(payload.gallery).toEqual([
      expect.objectContaining({
        id: '44444444-4444-4444-8444-444444444444',
        imageUrl: 'https://cdn.example.com/gallery-1.jpg',
        storageKey: null,
        sortOrder: 0,
      }),
      expect.objectContaining({
        id: '33333333-3333-4333-8333-333333333333',
        imageUrl: 'crm/dev/materials-regular/packages/gallery-2.jpg',
        storageKey: 'crm/dev/materials-regular/packages/gallery-2.jpg',
        sortOrder: 1,
      }),
    ]);
  });

  it('converts a cleared package subtitle to null in the mutation payload', () => {
    const payload = buildPackageMutationPayload({
      id: 'package-1',
      slug: 'premium-lasik',
      sortOrder: 1,
      isActive: true,
      title: 'Premium LASIK',
      subtitle: '',
      coverImageUrl: 'crm/dev/materials-regular/packages/cover.jpg',
      coverImageStorageKey: 'crm/dev/materials-regular/packages/cover.jpg',
      gallery: [],
      price: '1200',
      currency: 'USD',
      duration: '3 days',
      summary: 'Complete package',
      tags: [],
      includes: [],
      process: [],
      cases: [],
      reviews: [],
    });

    expect(payload.subtitle).toBeNull();
  });

  it('keeps package mutation payload building null-safe after a clear-and-reload cycle', () => {
    const payload = buildPackageMutationPayload({
      id: 'package-1',
      slug: 'premium-lasik',
      sortOrder: 1,
      isActive: true,
      title: 'Premium LASIK',
      subtitle: null as unknown as string,
      coverImageUrl: 'crm/dev/materials-regular/packages/cover.jpg',
      coverImageStorageKey: 'crm/dev/materials-regular/packages/cover.jpg',
      gallery: [],
      price: '1200',
      currency: 'USD',
      duration: '3 days',
      summary: 'Complete package',
      tags: [],
      includes: [],
      process: [],
      cases: [],
      reviews: [],
    });

    expect(payload.subtitle).toBeNull();
  });

  it('keeps partially filled package case and review rows in the save payload for backend validation', () => {
    const payload = buildPackageMutationPayload({
      id: 'package-1',
      slug: 'premium-lasik',
      sortOrder: 1,
      isActive: true,
      title: 'Premium LASIK',
      subtitle: 'Fast recovery',
      coverImageUrl: 'crm/dev/materials-regular/packages/cover.jpg',
      coverImageStorageKey: 'crm/dev/materials-regular/packages/cover.jpg',
      gallery: [],
      price: '1200',
      currency: 'USD',
      duration: '3 days',
      summary: 'Complete package',
      tags: [],
      includes: [],
      process: [],
      cases: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          patientName: '',
          patientAge: 42,
          patientCountry: 'SG',
          story: '',
          result: '',
          sortOrder: 0,
        },
      ],
      reviews: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          reviewerName: '',
          reviewerCountry: 'SG',
          rating: 5,
          reviewDate: '2026-04-24',
          comment: '',
          sortOrder: 0,
          isActive: true,
        },
      ],
    });

    expect(payload.cases).toEqual([
      expect.objectContaining({
        id: '55555555-5555-4555-8555-555555555555',
        patientAge: 42,
        patientCountry: 'SG',
      }),
    ]);
    expect(payload.reviews).toEqual([
      expect.objectContaining({
        id: '66666666-6666-4666-8666-666666666666',
        reviewerCountry: 'SG',
        reviewDate: '2026-04-24',
      }),
    ]);
  });

  it('drops placeholder nested package ids while preserving persisted UUID ids', () => {
    const payload = buildPackageMutationPayload({
      id: 'package-1',
      slug: 'premium-lasik',
      sortOrder: 1,
      isActive: true,
      title: 'Premium LASIK',
      subtitle: 'Fast recovery',
      coverImageUrl: 'crm/dev/materials-regular/packages/cover.jpg',
      coverImageStorageKey: 'crm/dev/materials-regular/packages/cover.jpg',
      gallery: [
        {
          id: 'gallery-local123',
          imageUrl: 'https://cdn.example.com/new-gallery.jpg',
          storageKey: null,
          sortOrder: 0,
        },
      ],
      price: '1200',
      currency: 'USD',
      duration: '3 days',
      summary: 'Complete package',
      tags: [
        { id: 'tag-local123', label: 'Premium', category: 'service' },
        { id: '22222222-2222-4222-8222-222222222222', label: 'Vision', category: 'treatment' },
      ],
      includes: [
        { id: 'include-local123', text: 'Consultation', sortOrder: 0 },
      ],
      process: [
        { id: 'process-local123', stepTitle: 'Day 1', description: 'Arrival', sortOrder: 0 },
      ],
      cases: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          patientName: 'Pat',
          patientAge: 42,
          patientCountry: 'SG',
          story: 'Needed treatment',
          result: 'Recovered',
          sortOrder: 0,
        },
        {
          id: 'case-local123',
          patientName: '',
          patientAge: 43,
          patientCountry: 'MY',
          story: '',
          result: '',
          sortOrder: 1,
        },
      ],
      reviews: [
        {
          id: 'review-local123',
          reviewerName: '',
          reviewerCountry: 'SG',
          rating: 5,
          reviewDate: '2026-04-24',
          comment: '',
          sortOrder: 0,
          isActive: true,
        },
      ],
    });

    expect(payload.gallery[0]?.id).toBeUndefined();
    expect(payload.tags).toEqual([
      expect.objectContaining({ id: undefined, label: 'Premium' }),
      expect.objectContaining({ id: '22222222-2222-4222-8222-222222222222', label: 'Vision' }),
    ]);
    expect(payload.includes[0]?.id).toBeUndefined();
    expect(payload.process[0]?.id).toBeUndefined();
    expect(payload.cases).toEqual([
      expect.objectContaining({ id: '33333333-3333-4333-8333-333333333333' }),
      expect.objectContaining({ id: undefined, patientAge: 43, patientCountry: 'MY' }),
    ]);
    expect(payload.reviews[0]?.id).toBeUndefined();
  });

  it('wires materials reviews and packages server actions to the hospital-scoped API routes', () => {
    const source = readMaterialsActionsSource();

    expect(source).toContain('export async function createReview(');
    expect(source).toContain('export async function updateReview(');
    expect(source).toContain('export async function deleteReview(');
    expect(source).toContain('export async function createMaterialsPackage(');
    expect(source).toContain('export async function updateMaterialsPackage(');
    expect(source).toContain('export async function deleteMaterialsPackage(');
    expect(source).toContain('/api/v2/hospitals/${hospitalId}/materials/reviews');
    expect(source).toContain('/api/v2/hospitals/${hospitalId}/materials/packages');
    expect(source).toContain('/materials');
    expect(source).toContain('slug collision');
  });

  it('uses minimal metadata patches for review list toggles and reorders', () => {
    const source = readReviewsTabSource();

    expect(source).toContain('body: JSON.stringify(patch)');
    expect(source).toContain('body: JSON.stringify({ sortOrder: item.sortOrder })');
  });

  it('uses minimal metadata patches for package list toggles and reorders', () => {
    const source = readPackagesTabSource();

    expect(source).toContain('body: JSON.stringify(patch)');
    expect(source).toContain('body: JSON.stringify({ sortOrder: item.sortOrder })');
  });

  it('shows reviews and packages tabs for regular hospitals at runtime', async () => {
    const markup = await renderMaterialsTabsForRole('regular_hospital');

    expect(markup).toContain('Hospital Info');
    expect(markup).toContain('Reviews');
    expect(markup).toContain('Packages');
    expect(markup).not.toContain('Procedures');
  });

  it('hides reviews and packages tabs for cosmetic hospitals at runtime', async () => {
    const markup = await renderMaterialsTabsForRole('hospital');

    expect(markup).toContain('Hospital Info');
    expect(markup).toContain('Procedures');
    expect(markup).not.toContain('Reviews');
    expect(markup).not.toContain('Packages');
  });

  it('defines the scoped reviews and packages locale keys in every supported bundle', () => {
    const requiredKeys = [
      'hospital.materials.tabs.reviews',
      'hospital.materials.tabs.packages',
      'hospital.materials.reviews.sections.basicInfo',
      'hospital.materials.reviews.sections.content',
      'hospital.materials.reviews.sections.media',
      'hospital.materials.packages.sections.basic',
      'hospital.materials.packages.sections.commercial',
      'hospital.materials.packages.sections.overview',
      'hospital.materials.packages.sections.includes',
      'hospital.materials.packages.sections.treatmentProcess',
      'hospital.materials.packages.sections.patientEvidence',
      'hospital.materials.packages.slugCollision',
      'hospital.materials.packages.sectionErrors.basic',
      'hospital.materials.packages.sectionErrors.patientEvidence',
    ];

    for (const locale of ['en', 'zh', 'fr', 'de', 'es', 'bn'] as const) {
      const bundle = readLocaleBundle(locale);

      for (const key of requiredKeys) {
        expect(getNestedValue(bundle, key), `${locale} missing ${key}`).toBeDefined();
      }
    }
  });
});
