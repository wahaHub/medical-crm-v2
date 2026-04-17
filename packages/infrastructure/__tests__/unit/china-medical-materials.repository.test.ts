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
