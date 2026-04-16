import type { IMaterialsRepository, MaterialsHospitalInfo } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export type UpdateHospitalInfoInput = Partial<MaterialsHospitalInfo>;

function pickDefinedFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function buildDepartmentsInfo(input: UpdateHospitalInfoInput): Array<Record<string, unknown>> | undefined {
  const keys = new Set<string>();
  for (const department of input.departments ?? []) keys.add(department);
  for (const key of Object.keys(input.departmentDescriptions ?? {})) keys.add(key);
  for (const key of Object.keys(input.departmentKeyServices ?? {})) keys.add(key);
  for (const key of Object.keys(input.departmentStats ?? {})) keys.add(key);
  for (const key of Object.keys(input.departmentImages ?? {})) keys.add(key);

  if (keys.size === 0) return undefined;

  return Array.from(keys).map((code) => ({
    department_code: code,
    department_name: code,
    description: input.departmentDescriptions?.[code] ?? '',
    image_url: input.departmentImages?.[code] ?? '',
    key_services: input.departmentKeyServices?.[code] ?? [],
    specialists: input.departmentStats?.[code]?.specialists ?? null,
    annual_patients: input.departmentStats?.[code]?.annualPatients ?? null,
  }));
}

function buildHospitalInfoTranslationFields(
  input: UpdateHospitalInfoInput,
  sourceDb: 'supabase_beauty' | 'supabase_china',
): Record<string, unknown> {
  if (sourceDb === 'supabase_beauty') {
    return pickDefinedFields({
      tagline: input.tagline ?? input.taglineEn,
      description: input.description ?? input.descriptionEn,
    });
  }

  return pickDefinedFields({
    name: input.name ?? input.nameEn,
    tagline: input.tagline ?? input.taglineEn,
    description: input.description ?? input.descriptionEn,
    overview: input.overview ?? input.overviewEn,
    full_description: input.fullDescription ?? input.fullDescriptionEn,
    hospital_type: input.hospitalType,
    tier: input.tier,
    ownership_type: input.ownershipType,
    core_specialties: input.coreSpecialties,
    departments_info: buildDepartmentsInfo(input),
    equipment: input.equipment,
  });
}

export class UpdateHospitalInfoUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(hospitalId: string, input: UpdateHospitalInfoInput, actor: Actor): Promise<MaterialsHospitalInfo> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const saved = await this.materialsRepo.updateHospitalInfo(hospitalId, input);

    const hospitalType = await this.resolveHospitalType(hospitalId);
    const sourceDb = hospitalType === 'REGULAR' ? 'supabase_china' as const : 'supabase_beauty' as const;
    const fieldsToTranslate = buildHospitalInfoTranslationFields(input, sourceDb);

    if (Object.keys(fieldsToTranslate).length > 0) {
      await this.translationTaskService.enqueue({
        sourceDb,
        entityType: 'hospital_info',
        entityId: hospitalId,
        fieldsToTranslate,
      });
    }

    return saved;
  }
}
