import type { IMaterialsRepository, MaterialsHospitalInfo } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface UpdateHospitalInfoInput {
  heroImage?: string | null;
  photos?: string[];
  highlights?: Array<{ icon: string; text: string }>;
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

    if (input.highlights && input.highlights.length > 0) {
      await this.translationTaskService.enqueue({
        sourceDb,
        entityType: 'hospital_info',
        entityId: hospitalId,
        fieldsToTranslate: {
          highlights: input.highlights,
        },
      });
    }

    return saved;
  }
}
