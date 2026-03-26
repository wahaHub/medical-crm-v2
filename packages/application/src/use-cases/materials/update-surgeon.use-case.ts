import type { IMaterialsRepository, MaterialsSurgeon } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface UpdateSurgeonInput {
  name?: string;
  title?: string | null;
  imageUrl?: string | null;
  experienceYears?: number | null;
  specialties?: string[];
  languages?: string[];
  education?: string[];
  certifications?: string[];
  intro?: string | null;
  expertise?: string | null;
  philosophy?: string | null;
  achievements?: string[];
}

export class UpdateSurgeonUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(hospitalId: string, surgeonId: string, input: UpdateSurgeonInput, actor: Actor): Promise<MaterialsSurgeon> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const saved = await this.materialsRepo.updateSurgeon(surgeonId, hospitalId, input);

    const hospitalType = await this.resolveHospitalType(hospitalId);
    const sourceDb = hospitalType === 'REGULAR' ? 'supabase_china' as const : 'supabase_beauty' as const;

    await this.translationTaskService.enqueue({
      sourceDb,
      entityType: 'surgeon',
      entityId: surgeonId,
      fieldsToTranslate: {
        title: input.title ?? saved.title,
        intro: input.intro ?? saved.intro,
        expertise: input.expertise ?? saved.expertise,
        philosophy: input.philosophy ?? saved.philosophy,
        achievements: input.achievements ?? saved.achievements,
        specialties: input.specialties ?? saved.specialties,
        education: input.education ?? saved.education,
        certifications: input.certifications ?? saved.certifications,
      },
    });

    return saved;
  }
}
