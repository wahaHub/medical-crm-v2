import { describe, expect, it, vi } from 'vitest';
import { UpdateHospitalInfoUseCase } from '../src/use-cases/materials/update-hospital-info.use-case.js';
import { TRANSLATION_CONFIG, type IMaterialsRepository } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('UpdateHospitalInfoUseCase', () => {
  const actor: Actor = {
    userId: 'hospital-user-1',
    email: 'hospital@example.com',
    role: 'HOSPITAL',
    hospitalId: 'hospital-1',
  };

  it('enqueues departments and equipment for regular hospital translation', async () => {
    const materialsRepo: IMaterialsRepository = {
      getHospitalInfo: vi.fn(),
      updateHospitalInfo: vi.fn().mockResolvedValue({ id: 'hospital-1' }),
      listProcedures: vi.fn(),
      createProcedure: vi.fn(),
      updateProcedure: vi.fn(),
      deleteProcedure: vi.fn(),
      listSurgeons: vi.fn(),
      createSurgeon: vi.fn(),
      updateSurgeon: vi.fn(),
      deleteSurgeon: vi.fn(),
      listBeforeAfterCases: vi.fn(),
      createBeforeAfterCase: vi.fn(),
      updateBeforeAfterCase: vi.fn(),
      deleteBeforeAfterCase: vi.fn(),
      listReviews: vi.fn(),
      createReview: vi.fn(),
      updateReview: vi.fn(),
      deleteReview: vi.fn(),
      listPackages: vi.fn(),
      getPackage: vi.fn(),
      createPackage: vi.fn(),
      updatePackage: vi.fn(),
      deletePackage: vi.fn(),
    };

    const translationTaskService = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new UpdateHospitalInfoUseCase(
      materialsRepo,
      vi.fn().mockResolvedValue('REGULAR'),
      translationTaskService as never,
    );

    await useCase.execute('hospital-1', {
      name: '医院',
      description: '中文描述',
      departments: ['orthopedics'],
      departmentDescriptions: { orthopedics: '骨科描述' },
      departmentImages: { orthopedics: 'crm/dev/materials-regular/hospital-image/hospital-1/orthopedics.png' },
      departmentKeyServices: { orthopedics: ['骨科服务'] },
      departmentStats: { orthopedics: { specialists: 12, annualPatients: 3456 } },
      equipment: [
        {
          name: '达芬奇手术机器人',
          image_url: 'crm/dev/materials-regular/hospital-image/hospital-1/equipment.png',
          description: '设备中文描述',
        },
      ],
    }, actor);

    expect(translationTaskService.enqueue).toHaveBeenCalledTimes(
      TRANSLATION_CONFIG.hospitalInfoTargetLanguages.length * 3,
    );
    expect(translationTaskService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      sourceDb: 'supabase_china',
      entityType: 'hospital_info',
      entityId: 'hospital-1',
      chunkKey: 'core',
      fieldsToTranslate: expect.objectContaining({
        name: '医院',
        description: '中文描述',
      }),
      targetLanguage: expect.any(String),
    }));
    expect(translationTaskService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      sourceDb: 'supabase_china',
      entityType: 'hospital_info',
      entityId: 'hospital-1',
      chunkKey: 'departments_info',
      fieldsToTranslate: {
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
      },
      targetLanguage: expect.any(String),
    }));
    expect(translationTaskService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      sourceDb: 'supabase_china',
      entityType: 'hospital_info',
      entityId: 'hospital-1',
      chunkKey: 'equipment',
      fieldsToTranslate: {
        equipment: [
          {
            name: '达芬奇手术机器人',
            image_url: 'crm/dev/materials-regular/hospital-image/hospital-1/equipment.png',
            description: '设备中文描述',
          },
        ],
      },
      targetLanguage: expect.any(String),
    }));
  });
});
