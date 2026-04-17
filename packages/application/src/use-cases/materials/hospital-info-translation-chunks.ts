import type { MaterialsHospitalInfo } from '@medical-crm/domain';

export type HospitalInfoTranslationChunkKey = 'core' | 'departments_info' | 'equipment';

export interface HospitalInfoTranslationChunk {
  chunkKey: HospitalInfoTranslationChunkKey;
  fieldsToTranslate: Record<string, unknown>;
}

type HospitalInfoTranslationInput = Partial<MaterialsHospitalInfo>;

function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function pickMeaningfulFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isMeaningfulValue(value)) {
      result[key] = value;
    }
  }
  return result;
}

function buildDepartmentsInfo(input: HospitalInfoTranslationInput): Array<Record<string, unknown>> | undefined {
  const codes = new Set<string>();
  for (const department of input.departments ?? []) codes.add(department);
  for (const key of Object.keys(input.departmentDescriptions ?? {})) codes.add(key);
  for (const key of Object.keys(input.departmentKeyServices ?? {})) codes.add(key);
  for (const key of Object.keys(input.departmentStats ?? {})) codes.add(key);
  for (const key of Object.keys(input.departmentImages ?? {})) codes.add(key);

  const sortedCodes = Array.from(codes).sort((left, right) => left.localeCompare(right));
  if (sortedCodes.length === 0) return undefined;

  return sortedCodes.map((code) => ({
    department_code: code,
    department_name: code,
    description: input.departmentDescriptions?.[code] ?? '',
    image_url: input.departmentImages?.[code] ?? '',
    key_services: input.departmentKeyServices?.[code] ?? [],
    specialists: input.departmentStats?.[code]?.specialists ?? null,
    annual_patients: input.departmentStats?.[code]?.annualPatients ?? null,
  }));
}

export function buildHospitalInfoTranslationChunks(input: HospitalInfoTranslationInput): HospitalInfoTranslationChunk[] {
  const chunks: HospitalInfoTranslationChunk[] = [];

  const coreFields = pickMeaningfulFields({
    name: input.name ?? input.nameEn,
    tagline: input.tagline ?? input.taglineEn,
    description: input.description ?? input.descriptionEn,
    overview: input.overview ?? input.overviewEn,
    full_description: input.fullDescription ?? input.fullDescriptionEn,
    hospital_type: input.hospitalType,
    tier: input.tier,
    ownership_type: input.ownershipType,
    core_specialties: input.coreSpecialties,
  });
  if (Object.keys(coreFields).length > 0) {
    chunks.push({ chunkKey: 'core', fieldsToTranslate: coreFields });
  }

  const departmentsInfo = buildDepartmentsInfo(input);
  if (departmentsInfo !== undefined) {
    chunks.push({
      chunkKey: 'departments_info',
      fieldsToTranslate: { departments_info: departmentsInfo },
    });
  }

  const equipment = Array.isArray(input.equipment) && input.equipment.length > 0 ? input.equipment : undefined;
  if (equipment !== undefined) {
    chunks.push({
      chunkKey: 'equipment',
      fieldsToTranslate: { equipment },
    });
  }

  return chunks;
}
