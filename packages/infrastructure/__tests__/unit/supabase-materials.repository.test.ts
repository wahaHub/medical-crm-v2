import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseMaterialsRepository } from '../../supabase-main/supabase-materials.repository.js';

function makeMockSupabase() {
  const hospitalTranslationsUpsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === 'hospital_translations') {
      return {
        upsert: hospitalTranslationsUpsert,
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }

    throw new Error(`Unexpected table access in test: ${table}`);
  });

  return {
    client: { from } as unknown as SupabaseClient,
    hospitalTranslationsUpsert,
    from,
  };
}

describe('SupabaseMaterialsRepository.updateHospitalInfo', () => {
  let repo: SupabaseMaterialsRepository;
  let hospitalTranslationsUpsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mock = makeMockSupabase();
    repo = new SupabaseMaterialsRepository(mock.client);
    hospitalTranslationsUpsert = mock.hospitalTranslationsUpsert;

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

  it('writes Chinese source fields into the zh row and English source fields into the en row', async () => {
    await repo.updateHospitalInfo('hospital-1', {
      tagline: '中文标语',
      description: '中文描述',
      taglineEn: 'English tagline',
      descriptionEn: 'English description',
    });

    expect(hospitalTranslationsUpsert).toHaveBeenCalledTimes(2);
    expect(hospitalTranslationsUpsert).toHaveBeenNthCalledWith(1, {
      hospital_id: 'hospital-1',
      language_code: 'zh',
      tagline: '中文标语',
      description: '中文描述',
      updated_at: expect.any(String),
    }, { onConflict: 'hospital_id,language_code' });
    expect(hospitalTranslationsUpsert).toHaveBeenNthCalledWith(2, {
      hospital_id: 'hospital-1',
      language_code: 'en',
      tagline: 'English tagline',
      description: 'English description',
      updated_at: expect.any(String),
    }, { onConflict: 'hospital_id,language_code' });
  });

  it('does not write an english row when only Chinese source fields were provided', async () => {
    await repo.updateHospitalInfo('hospital-1', {
      tagline: '仅中文标语',
      description: '仅中文描述',
    });

    expect(hospitalTranslationsUpsert).toHaveBeenCalledTimes(1);
    expect(hospitalTranslationsUpsert).toHaveBeenCalledWith({
      hospital_id: 'hospital-1',
      language_code: 'zh',
      tagline: '仅中文标语',
      description: '仅中文描述',
      updated_at: expect.any(String),
    }, { onConflict: 'hospital_id,language_code' });
  });
});
