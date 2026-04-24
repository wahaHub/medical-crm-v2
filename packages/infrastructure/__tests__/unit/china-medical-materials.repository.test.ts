import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChinaMedicalMaterialsRepository } from '../../supabase-china/china-medical-materials.repository.js';

function makeMockSupabase() {
  const hospitalUpdate = vi.fn().mockResolvedValue({ error: null });
  const hospitalI18nUpsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === 'hospitals') {
      return {
        update: vi.fn(() => ({
          eq: hospitalUpdate,
        })),
      };
    }

    if (table === 'hospital_i18n') {
      return {
        select: vi.fn(),
        upsert: hospitalI18nUpsert,
      };
    }

    throw new Error(`Unexpected table access in test: ${table}`);
  });

  return {
    client: { from } as unknown as SupabaseClient,
    hospitalUpdate,
    hospitalI18nUpsert,
  };
}

function makeMaterialsReadMockSupabase(input: {
  reviewRows?: Array<Record<string, unknown>>;
  packageRows?: Array<Record<string, unknown>>;
}) {
  const reviewRows = input.reviewRows ?? [];
  const packageRows = input.packageRows ?? [];

  const from = vi.fn((table: string) => {
    if (table === 'hospital_material_reviews') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: reviewRows, error: null }),
            })),
          })),
        })),
      };
    }

    if (table === 'hospital_material_packages') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: packageRows, error: null }),
            })),
          })),
        })),
      };
    }

    throw new Error(`Unexpected table access in test: ${table}`);
  });

  return {
    client: { from } as unknown as SupabaseClient,
  };
}

function makePackageCreateMockSupabase() {
  const insert = vi.fn((payload: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: { id: 'package-1', ...payload }, error: null }),
    })),
  }));

  const from = vi.fn((table: string) => {
    if (table === 'hospital_material_packages') {
      return { insert };
    }

    throw new Error(`Unexpected table access in test: ${table}`);
  });

  return {
    client: { from } as unknown as SupabaseClient,
    insert,
  };
}

function makeUpdateMockSupabase(input: {
  table: 'hospital_material_reviews' | 'hospital_material_packages';
  row: Record<string, unknown>;
}) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: input.row, error: null }),
        })),
      })),
    })),
  }));

  const from = vi.fn((table: string) => {
    if (table === input.table) {
      return { update };
    }

    throw new Error(`Unexpected table access in test: ${table}`);
  });

  return {
    client: { from } as unknown as SupabaseClient,
    update,
  };
}

function makeStorage() {
  return {
    getSignedUrl: vi.fn(async (storageKey: string) => `https://signed/${storageKey}`),
    getSignedUrls: vi.fn(async (storageKeys: string[]) => Object.fromEntries(
      storageKeys.map((storageKey) => [storageKey, `https://signed/${storageKey}`]),
    )),
  };
}

describe('ChinaMedicalMaterialsRepository.updateHospitalInfo', () => {
  let repo: ChinaMedicalMaterialsRepository;
  let hospitalI18nUpsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mock = makeMockSupabase();
    repo = new ChinaMedicalMaterialsRepository(mock.client);
    hospitalI18nUpsert = mock.hospitalI18nUpsert;

    vi.spyOn(repo, 'getHospitalInfo').mockResolvedValue({
      id: 'hospital-1',
      name: 'Hospital',
      nameEn: 'Hospital',
      slug: 'hospital',
      heroImage: null,
      photos: [],
      highlights: [],
      status: 'draft',
      isActive: false,
      paymentMethods: [],
      multilingualStaff: [],
      airportServices: [],
      followUpCare: [],
      amenities: [],
      nearbyAttractions: [],
      promotionalVideos: [],
      videoTestimonials: [],
      translations: {},
    } as never);
  });

  it('writes departments_info only into zh when only shared source department content is provided', async () => {
    await repo.updateHospitalInfo('hospital-1', {
      departments: ['orthopedics'],
      departmentDescriptions: { orthopedics: '骨科描述' },
      departmentImages: { orthopedics: 'crm/dev/materials-regular/hospital-image/hospital-1/orthopedics.png' },
      departmentKeyServices: { orthopedics: ['骨科服务'] },
      departmentStats: { orthopedics: { specialists: 12, annualPatients: 3456 } },
    });

    expect(hospitalI18nUpsert).toHaveBeenCalledTimes(1);
    expect(hospitalI18nUpsert).toHaveBeenCalledWith({
      hospital_id: 'hospital-1',
      locale: 'zh',
      departments_info: [
        {
          department_code: 'orthopedics',
          department_name: 'orthopedics',
          description: '骨科描述',
          image_url: 'crm/dev/materials-regular/hospital-image/hospital-1/orthopedics.png',
          key_services: ['骨科服务'],
          specialists: 12,
          annual_patients: 3456,
        },
      ],
    }, { onConflict: 'hospital_id,locale' });
  });
});

describe('ChinaMedicalMaterialsRepository reviews/packages reads', () => {
  it('resolves storage-backed review and package media while preserving nested ordering', async () => {
    const mock = makeMaterialsReadMockSupabase({
      reviewRows: [
        {
          id: 'review-1',
          hospital_id: 'hospital-1',
          sort_order: 4,
          is_active: true,
          featured: true,
          patient_name: 'Sarah',
          patient_country: 'SG',
          patient_avatar_url: 'crm/dev/materials-regular/reviews/avatar.jpg',
          treatment_name: 'LASIK',
          review_title: 'Worth it',
          review_comment: 'Great care',
          rating: 5,
          review_date: '2026-04-24',
          media: [
            {
              id: 'media-2',
              type: 'video',
              url: 'crm/dev/materials-regular/reviews/video.mp4',
              thumbnailUrl: 'crm/dev/materials-regular/reviews/video-thumb.jpg',
              caption: 'After',
              sortOrder: 2,
            },
            {
              id: 'media-1',
              type: 'image',
              url: 'https://cdn.example.com/review-image.jpg',
              thumbnailUrl: null,
              caption: null,
              sortOrder: 1,
            },
          ],
          translations: {},
        },
      ],
      packageRows: [
        {
          id: 'package-1',
          hospital_id: 'hospital-1',
          slug: 'premium-lasik',
          sort_order: 3,
          is_active: true,
          title: 'Premium LASIK',
          subtitle: 'Fast recovery',
          cover_image_url: 'crm/dev/materials-regular/packages/cover.jpg',
          gallery: [
            {
              id: 'gallery-2',
              imageUrl: 'crm/dev/materials-regular/packages/gallery-2.jpg',
              sortOrder: 2,
            },
            {
              id: 'gallery-1',
              image_url: 'https://cdn.example.com/gallery-1.jpg',
              sort_order: 1,
            },
          ],
          price: '1200',
          currency: 'USD',
          duration: '3 days',
          summary: 'Complete package',
          tags: [],
          includes: [],
          process: [],
          cases: [
            {
              id: 'case-2',
              patient_name: 'Older format',
              patient_age: '41',
              patient_country: 'TH',
              story: 'Story two',
              result: 'Result two',
              sort_order: 2,
            },
            {
              id: 'case-1',
              patientName: 'Current format',
              patientAge: 29,
              patientCountry: 'SG',
              story: 'Story one',
              result: 'Result one',
              sortOrder: 1,
            },
          ],
          reviews: [],
          translations: {},
        },
      ],
    });
    const storage = makeStorage();
    const repo = new ChinaMedicalMaterialsRepository(mock.client, storage as never);

    const [reviews, packages] = await Promise.all([
      repo.listReviews('hospital-1'),
      repo.listPackages('hospital-1'),
    ]);

    expect(reviews).toEqual([
      {
        id: 'review-1',
        hospitalId: 'hospital-1',
        sortOrder: 4,
        isActive: true,
        featured: true,
        patientName: 'Sarah',
        patientCountry: 'SG',
        patientAvatarUrl: 'https://signed/crm/dev/materials-regular/reviews/avatar.jpg',
        patientAvatarStorageKey: 'crm/dev/materials-regular/reviews/avatar.jpg',
        treatmentName: 'LASIK',
        reviewTitle: 'Worth it',
        reviewComment: 'Great care',
        rating: 5,
        reviewDate: '2026-04-24',
        media: [
          {
            id: 'media-1',
            type: 'image',
            url: 'https://cdn.example.com/review-image.jpg',
            storageKey: null,
            thumbnailUrl: null,
            thumbnailStorageKey: null,
            caption: null,
            sortOrder: 1,
          },
          {
            id: 'media-2',
            type: 'video',
            url: 'https://signed/crm/dev/materials-regular/reviews/video.mp4',
            storageKey: 'crm/dev/materials-regular/reviews/video.mp4',
            thumbnailUrl: 'https://signed/crm/dev/materials-regular/reviews/video-thumb.jpg',
            thumbnailStorageKey: 'crm/dev/materials-regular/reviews/video-thumb.jpg',
            caption: 'After',
            sortOrder: 2,
          },
        ],
        translations: {},
      },
    ]);

    expect(packages).toEqual([
      {
        id: 'package-1',
        hospitalId: 'hospital-1',
        slug: 'premium-lasik',
        sortOrder: 3,
        isActive: true,
        title: 'Premium LASIK',
        subtitle: 'Fast recovery',
        coverImageUrl: 'https://signed/crm/dev/materials-regular/packages/cover.jpg',
        coverImageStorageKey: 'crm/dev/materials-regular/packages/cover.jpg',
        gallery: [
          {
            id: 'gallery-1',
            imageUrl: 'https://cdn.example.com/gallery-1.jpg',
            storageKey: null,
            sortOrder: 1,
          },
          {
            id: 'gallery-2',
            imageUrl: 'https://signed/crm/dev/materials-regular/packages/gallery-2.jpg',
            storageKey: 'crm/dev/materials-regular/packages/gallery-2.jpg',
            sortOrder: 2,
          },
        ],
        price: '1200',
        currency: 'USD',
        duration: '3 days',
        summary: 'Complete package',
        tags: [],
        includes: [],
        process: [],
        cases: [
          {
            id: 'case-1',
            patientName: 'Current format',
            patientAge: 29,
            patientCountry: 'SG',
            story: 'Story one',
            result: 'Result one',
            sortOrder: 1,
          },
          {
            id: 'case-2',
            patientName: 'Older format',
            patientAge: 41,
            patientCountry: 'TH',
            story: 'Story two',
            result: 'Result two',
            sortOrder: 2,
          },
        ],
        reviews: [],
        translations: {},
      },
    ]);
  });

  it('writes numeric package case ages without degrading them to null', async () => {
    const mock = makePackageCreateMockSupabase();
    const repo = new ChinaMedicalMaterialsRepository(mock.client);

    await repo.createPackage({
      hospitalId: 'hospital-1',
      slug: 'premium-lasik',
      sortOrder: 1,
      isActive: true,
      title: 'Premium LASIK',
      subtitle: null,
      coverImageUrl: 'https://cdn.example.com/cover.jpg',
      gallery: [],
      price: '1200',
      currency: 'USD',
      duration: null,
      summary: 'Complete package',
      tags: [],
      includes: [],
      process: [],
      cases: [
        {
          id: 'case-1',
          patientName: 'Alice',
          patientAge: 36,
          patientCountry: 'SG',
          story: 'Story',
          result: 'Result',
          sortOrder: 0,
        },
      ],
      reviews: [],
      translations: {},
    });

    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({
      cases: [
        expect.objectContaining({
          patientName: 'Alice',
          patientAge: 36,
        }),
      ],
    }));
  });

  it('prefers durable review media storage keys over display urls on update', async () => {
    const storage = makeStorage();
    const mock = makeUpdateMockSupabase({
      table: 'hospital_material_reviews',
      row: {
        id: 'review-1',
        hospital_id: 'hospital-1',
        sort_order: 1,
        is_active: true,
        featured: false,
        patient_name: 'Sarah',
        patient_country: 'SG',
        patient_avatar_url: 'crm/dev/materials-regular/reviews/avatar.jpg',
        treatment_name: 'LASIK',
        review_title: 'Updated',
        review_comment: 'Updated comment',
        rating: 5,
        review_date: '2026-04-24',
        media: [
          {
            id: 'media-1',
            type: 'image',
            url: 'crm/dev/materials-regular/reviews/image.jpg',
            thumbnailUrl: 'crm/dev/materials-regular/reviews/thumb.jpg',
            caption: 'Still image',
            sortOrder: 0,
          },
        ],
        translations: {},
      },
    });
    const repo = new ChinaMedicalMaterialsRepository(mock.client, storage as never);

    await repo.updateReview('review-1', 'hospital-1', {
      patientAvatarUrl: 'https://signed/crm/dev/materials-regular/reviews/avatar.jpg?token=expiring',
      patientAvatarStorageKey: 'crm/dev/materials-regular/reviews/avatar.jpg',
      reviewComment: 'Updated comment',
      media: [
        {
          id: 'media-1',
          type: 'image',
          url: 'https://signed/crm/dev/materials-regular/reviews/image.jpg?token=expiring',
          storageKey: 'crm/dev/materials-regular/reviews/image.jpg',
          thumbnailUrl: 'https://signed/crm/dev/materials-regular/reviews/thumb.jpg?token=expiring',
          thumbnailStorageKey: 'crm/dev/materials-regular/reviews/thumb.jpg',
          caption: 'Still image',
          sortOrder: 0,
        },
      ],
    });

    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({
      patient_avatar_url: 'crm/dev/materials-regular/reviews/avatar.jpg',
      media: [
        expect.objectContaining({
          url: 'crm/dev/materials-regular/reviews/image.jpg',
          thumbnailUrl: 'crm/dev/materials-regular/reviews/thumb.jpg',
        }),
      ],
    }));
  });

  it('prefers durable package media storage keys over display urls on update', async () => {
    const storage = makeStorage();
    const mock = makeUpdateMockSupabase({
      table: 'hospital_material_packages',
      row: {
        id: 'package-1',
        hospital_id: 'hospital-1',
        slug: 'premium-lasik',
        sort_order: 1,
        is_active: true,
        title: 'Premium LASIK',
        subtitle: 'Fast recovery',
        cover_image_url: 'crm/dev/materials-regular/packages/cover.jpg',
        gallery: [
          {
            id: 'gallery-1',
            imageUrl: 'crm/dev/materials-regular/packages/gallery-1.jpg',
            sortOrder: 0,
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
        translations: {},
      },
    });
    const repo = new ChinaMedicalMaterialsRepository(mock.client, storage as never);

    await repo.updatePackage('package-1', 'hospital-1', {
      coverImageUrl: 'https://signed/crm/dev/materials-regular/packages/cover.jpg?token=expiring',
      coverImageStorageKey: 'crm/dev/materials-regular/packages/cover.jpg',
      gallery: [
        {
          id: 'gallery-1',
          imageUrl: 'https://signed/crm/dev/materials-regular/packages/gallery-1.jpg?token=expiring',
          storageKey: 'crm/dev/materials-regular/packages/gallery-1.jpg',
          sortOrder: 0,
        },
      ],
    });

    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({
      cover_image_url: 'crm/dev/materials-regular/packages/cover.jpg',
      gallery: [
        expect.objectContaining({
          imageUrl: 'crm/dev/materials-regular/packages/gallery-1.jpg',
        }),
      ],
    }));
  });
});
