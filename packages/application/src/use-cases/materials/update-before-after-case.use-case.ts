import type { IMaterialsRepository, MaterialsBeforeAfterCase, MaterialsCaseMediaItem } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface UpdateBeforeAfterCaseInput {
  procedureName?: string;
  surgeonName?: string | null;
  description?: string | null;
  images?: Array<{ url: string }>;
  media?: MaterialsCaseMediaItem[];
}

function normalizeCaseUpdate(input: UpdateBeforeAfterCaseInput): UpdateBeforeAfterCaseInput {
  if (input.media === undefined) {
    return input;
  }

  return {
    ...input,
    images: input.media.filter((item) => item.type === 'image').map((item) => ({ url: item.url })),
  };
}

export class UpdateBeforeAfterCaseUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(hospitalId: string, caseId: string, input: UpdateBeforeAfterCaseInput, actor: Actor): Promise<MaterialsBeforeAfterCase> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const saved = await this.materialsRepo.updateBeforeAfterCase(caseId, hospitalId, normalizeCaseUpdate(input));

    const hospitalType = await this.resolveHospitalType(hospitalId);
    const sourceDb = hospitalType === 'REGULAR' ? 'supabase_china' as const : 'supabase_beauty' as const;

    await this.translationTaskService.enqueue({
      sourceDb,
      entityType: 'procedure_case',
      entityId: caseId,
      fieldsToTranslate: {
        ...(input.procedureName !== undefined ? { procedure_name: input.procedureName } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.surgeonName !== undefined ? { provider_name: input.surgeonName } : {}),
      },
    });

    return saved;
  }
}
