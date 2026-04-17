import type { IMaterialsRepository, MaterialsHospitalInfo } from '@medical-crm/domain';
import { TRANSLATION_CONFIG } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';
import { buildHospitalInfoTranslationChunks } from './hospital-info-translation-chunks.js';

export type UpdateHospitalInfoInput = Partial<MaterialsHospitalInfo>;

function buildHospitalInfoTranslationFields(
  input: UpdateHospitalInfoInput,
  sourceDb: 'supabase_beauty' | 'supabase_china',
): Record<string, unknown> {
  if (sourceDb === 'supabase_beauty') {
    const fields: Record<string, unknown> = {
      tagline: input.tagline ?? input.taglineEn,
      description: input.description ?? input.descriptionEn,
    };
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  }

  const fields: Record<string, unknown> = {
    name: input.name ?? input.nameEn,
    tagline: input.tagline ?? input.taglineEn,
    description: input.description ?? input.descriptionEn,
    overview: input.overview ?? input.overviewEn,
    full_description: input.fullDescription ?? input.fullDescriptionEn,
    hospital_type: input.hospitalType,
    tier: input.tier,
    ownership_type: input.ownershipType,
    core_specialties: input.coreSpecialties,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
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

    if (sourceDb === 'supabase_china') {
      const chunks = buildHospitalInfoTranslationChunks(input);
      for (const chunk of chunks) {
        for (const targetLanguage of TRANSLATION_CONFIG.hospitalInfoTargetLanguages) {
          await this.translationTaskService.enqueue({
            sourceDb,
            entityType: 'hospital_info',
            entityId: hospitalId,
            chunkKey: chunk.chunkKey,
            fieldsToTranslate: chunk.fieldsToTranslate,
            targetLanguage,
          });
        }
      }
    } else {
      const fieldsToTranslate = buildHospitalInfoTranslationFields(input, sourceDb);

      if (Object.keys(fieldsToTranslate).length > 0) {
        await this.translationTaskService.enqueue({
          sourceDb,
          entityType: 'hospital_info',
          entityId: hospitalId,
          fieldsToTranslate,
        });
      }
    }

    return saved;
  }
}
