import type { IMaterialsRepository, MaterialsBeforeAfterCase } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface CreateBeforeAfterCaseInput {
  procedureName: string;
  surgeonName?: string | null;
  description?: string | null;
  images?: Array<{ url: string }>;
}

export class CreateBeforeAfterCaseUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(hospitalId: string, input: CreateBeforeAfterCaseInput, actor: Actor): Promise<MaterialsBeforeAfterCase> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const saved = await this.materialsRepo.createBeforeAfterCase({
      hospitalId,
      procedureName: input.procedureName,
      surgeonName: input.surgeonName ?? null,
      description: input.description ?? null,
      images: input.images ?? [],
    });

    const hospitalType = await this.resolveHospitalType(hospitalId);
    const sourceDb = hospitalType === 'REGULAR' ? 'supabase_china' as const : 'supabase_beauty' as const;

    await this.translationTaskService.enqueue({
      sourceDb,
      entityType: 'before_after_case',
      entityId: saved.id,
      fieldsToTranslate: {
        description: saved.description,
        provider_name: saved.surgeonName,
      },
    });

    return saved;
  }
}
