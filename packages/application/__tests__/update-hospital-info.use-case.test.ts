import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IMaterialsRepository, MaterialsHospitalInfo } from '@medical-crm/domain';
import { TRANSLATION_CONFIG } from '@medical-crm/domain';
import { UpdateHospitalInfoUseCase } from '../src/use-cases/materials/update-hospital-info.use-case.js';
import type { TranslationTaskService } from '../src/services/translation-task.service.js';

type HospitalInfoInput = Parameters<UpdateHospitalInfoUseCase['execute']>[1];

const hospitalInfoTargetLanguages =
  (TRANSLATION_CONFIG as typeof TRANSLATION_CONFIG & { hospitalInfoTargetLanguages?: string[] }).hospitalInfoTargetLanguages ??
  TRANSLATION_CONFIG.supportedLanguages.filter((language) => language !== 'zh');

const actor = { role: 'HOSPITAL' as const, hospitalId: 'hospital-1' };

function makeHospitalInfo(overrides: Partial<MaterialsHospitalInfo> = {}): MaterialsHospitalInfo {
  return {
    id: 'hospital-1',
    name: 'Base Hospital',
    slug: 'base-hospital',
    heroImage: null,
    photos: [],
    highlights: [],
    ...overrides,
  };
}

function makeRepo(): IMaterialsRepository {
  return {
    getHospitalInfo: vi.fn(),
    updateHospitalInfo: vi.fn().mockImplementation(async (_hospitalId: string, data: Partial<MaterialsHospitalInfo>) =>
      makeHospitalInfo({
        ...data,
        id: 'hospital-1',
        name: data.name ?? 'Base Hospital',
        slug: 'base-hospital',
        heroImage: null,
        photos: [],
        highlights: [],
      }),
    ),
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
  };
}

function makeTranslationTaskService() {
  return { enqueue: vi.fn().mockResolvedValue(undefined) } as unknown as TranslationTaskService;
}

function makeRegularHospitalUpdateInput(): HospitalInfoInput {
  return {
    name: 'Renamed Hospital',
    tagline: 'World-class care',
    description: 'A long description for translation.',
    overview: 'An overview of the hospital.',
    fullDescription: 'A full description of the hospital.',
    hospitalType: 'REGULAR',
    tier: 'A',
    ownershipType: 'Public',
    coreSpecialties: [{ name: 'Orthopedics', slug: 'orthopedics', description: 'Bones and joints', technologies: ['3D imaging'] }],
    departments: ['dept-a', 'dept-b'],
    departmentDescriptions: {
      'dept-a': 'Department A description',
      'dept-b': 'Department B description',
    },
    departmentImages: {
      'dept-a': 'https://example.com/dept-a.jpg',
      'dept-b': 'https://example.com/dept-b.jpg',
    },
    departmentKeyServices: {
      'dept-a': ['Service A1', 'Service A2'],
      'dept-b': ['Service B1', 'Service B2'],
    },
    departmentStats: {
      'dept-a': { specialists: 12, annualPatients: 1200 },
      'dept-b': { specialists: 8, annualPatients: 800 },
    },
    equipment: [
      { name: 'Scanner A', image_url: 'https://example.com/equipment-a.jpg', description: 'Scanner A description' },
      { name: 'Scanner B', image_url: 'https://example.com/equipment-b.jpg', description: 'Scanner B description' },
    ],
  };
}

describe('UpdateHospitalInfoUseCase', () => {
  let repo: IMaterialsRepository;
  let translationTaskService: TranslationTaskService;
  let resolveHospitalType: ReturnType<typeof vi.fn>;
  let useCase: UpdateHospitalInfoUseCase;

  beforeEach(() => {
    repo = makeRepo();
    translationTaskService = makeTranslationTaskService();
    resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    useCase = new UpdateHospitalInfoUseCase(repo, resolveHospitalType, translationTaskService);
  });

  it('enqueues core, departments_info, and equipment chunks once per supported target language for REGULAR hospitals', async () => {
    const input = makeRegularHospitalUpdateInput();

    await useCase.execute('hospital-1', input, actor);

    expect(translationTaskService.enqueue).toHaveBeenCalledTimes(hospitalInfoTargetLanguages.length * 3);

    for (const language of hospitalInfoTargetLanguages) {
      expect(translationTaskService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDb: 'supabase_china',
          entityType: 'hospital_info',
          entityId: 'hospital-1',
          targetLanguage: language,
          chunkKey: 'core',
          fieldsToTranslate: expect.objectContaining({
            name: 'Renamed Hospital',
            tagline: 'World-class care',
            description: 'A long description for translation.',
            overview: 'An overview of the hospital.',
            full_description: 'A full description of the hospital.',
            hospital_type: 'REGULAR',
            tier: 'A',
            ownership_type: 'Public',
            core_specialties: input.coreSpecialties,
          }),
        }),
      );
      expect(translationTaskService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDb: 'supabase_china',
          entityType: 'hospital_info',
          entityId: 'hospital-1',
          targetLanguage: language,
          chunkKey: 'departments_info',
          fieldsToTranslate: {
            departments_info: [
              {
                department_code: 'dept-a',
                department_name: 'dept-a',
                description: 'Department A description',
                image_url: 'https://example.com/dept-a.jpg',
                key_services: ['Service A1', 'Service A2'],
                specialists: 12,
                annual_patients: 1200,
              },
              {
                department_code: 'dept-b',
                department_name: 'dept-b',
                description: 'Department B description',
                image_url: 'https://example.com/dept-b.jpg',
                key_services: ['Service B1', 'Service B2'],
                specialists: 8,
                annual_patients: 800,
              },
            ],
          },
        }),
      );
      expect(translationTaskService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDb: 'supabase_china',
          entityType: 'hospital_info',
          entityId: 'hospital-1',
          targetLanguage: language,
          chunkKey: 'equipment',
          fieldsToTranslate: {
            equipment: input.equipment,
          },
        }),
      );
    }
  });

  it('does not enqueue empty hospital chunks when only core fields are present', async () => {
    await useCase.execute(
      'hospital-1',
      {
        name: 'Core Only Hospital',
        tagline: 'Core only tagline',
        description: 'Core only description',
      },
      actor,
    );

    expect(translationTaskService.enqueue).toHaveBeenCalledTimes(hospitalInfoTargetLanguages.length);
    expect(translationTaskService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkKey: 'core',
        fieldsToTranslate: expect.objectContaining({
          name: 'Core Only Hospital',
          tagline: 'Core only tagline',
          description: 'Core only description',
        }),
      }),
    );
    expect(translationTaskService.enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ chunkKey: 'departments_info' }),
    );
    expect(translationTaskService.enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ chunkKey: 'equipment' }),
    );
  });

  it('keeps long departments_info and equipment payloads in separate chunks instead of merging them', async () => {
    const departments = Array.from({ length: 18 }, (_, index) => `dept-${index + 1}`);
    const input: HospitalInfoInput = {
      departments,
      departmentDescriptions: Object.fromEntries(
        departments.map((department, index) => [department, `Department ${index + 1} description ${'x'.repeat(40)}`]),
      ),
      departmentImages: Object.fromEntries(
        departments.map((department, index) => [department, `https://example.com/departments/${index + 1}.jpg`]),
      ),
      departmentKeyServices: Object.fromEntries(
        departments.map((department, index) => [department, [`Service ${index + 1}A`, `Service ${index + 1}B`]]),
      ),
      departmentStats: Object.fromEntries(
        departments.map((department, index) => [department, { specialists: index + 1, annualPatients: (index + 1) * 100 }]),
      ),
      equipment: Array.from({ length: 14 }, (_, index) => ({
        name: `Equipment ${index + 1}`,
        image_url: `https://example.com/equipment/${index + 1}.jpg`,
        description: `Equipment ${index + 1} description ${'y'.repeat(60)}`,
      })),
    };

    await useCase.execute('hospital-1', input, actor);

    expect(translationTaskService.enqueue).toHaveBeenCalledTimes(hospitalInfoTargetLanguages.length * 2);

    for (const call of (translationTaskService.enqueue as ReturnType<typeof vi.fn>).mock.calls) {
      const payload = call[0] as { chunkKey?: string; fieldsToTranslate?: Record<string, unknown> };
      expect(payload.chunkKey === 'departments_info' || payload.chunkKey === 'equipment').toBe(true);
      expect(payload.fieldsToTranslate).toBeDefined();
      expect(Object.keys(payload.fieldsToTranslate ?? {})).toHaveLength(1);
      expect(payload.fieldsToTranslate).not.toMatchObject({ departments_info: expect.anything(), equipment: expect.anything() });
    }
  });
});
