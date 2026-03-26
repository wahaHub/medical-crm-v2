import type { IMaterialsRepository, MaterialsSurgeon } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface CreateSurgeonInput {
  name: string;
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

export class CreateSurgeonUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(hospitalId: string, input: CreateSurgeonInput, actor: Actor): Promise<MaterialsSurgeon> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const saved = await this.materialsRepo.createSurgeon({
      hospitalId,
      name: input.name,
      title: input.title ?? null,
      imageUrl: input.imageUrl ?? null,
      experienceYears: input.experienceYears ?? null,
      specialties: input.specialties ?? [],
      languages: input.languages ?? [],
      education: input.education ?? [],
      certifications: input.certifications ?? [],
      intro: input.intro ?? null,
      expertise: input.expertise ?? null,
      philosophy: input.philosophy ?? null,
      achievements: input.achievements ?? [],
    });

    const hospitalType = await this.resolveHospitalType(hospitalId);
    const sourceDb = hospitalType === 'REGULAR' ? 'supabase_china' as const : 'supabase_beauty' as const;

    await this.translationTaskService.enqueue({
      sourceDb,
      entityType: 'surgeon',
      entityId: saved.id,
      fieldsToTranslate: {
        title: saved.title,
        intro: saved.intro,
        expertise: saved.expertise,
        philosophy: saved.philosophy,
        achievements: saved.achievements,
        specialties: saved.specialties,
        education: saved.education,
        certifications: saved.certifications,
      },
    });

    return saved;
  }
}
