import type { IMaterialsRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface CreateMaterialsReviewInput {
  sortOrder?: number;
  isActive?: boolean;
  featured?: boolean;
  patientName: string;
  patientCountry?: string | null;
  patientAvatarUrl?: string | null;
  treatmentName?: string | null;
  reviewTitle?: string | null;
  reviewComment: string;
  rating: number;
  reviewDate?: string | null;
  media?: Array<{
    id?: string;
    type: 'image' | 'video';
    url: string;
    thumbnailUrl?: string | null;
    caption?: string | null;
    sortOrder?: number;
  }>;
}

type ReviewTranslationSource = {
  treatmentName?: string | null;
  reviewTitle?: string | null;
  reviewComment?: string | null;
};

export class CreateMaterialsReviewUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(
    hospitalId: string,
    input: CreateMaterialsReviewInput,
    actor: Actor,
  ): Promise<Awaited<ReturnType<IMaterialsRepository['createReview']>>> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const hospitalType = await this.resolveHospitalType(hospitalId);
    ensureRegularMaterialsReviewsHospital(hospitalType);

    const saved = await this.materialsRepo.createReview({
      hospitalId,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      featured: input.featured ?? false,
      patientName: input.patientName,
      patientCountry: input.patientCountry ?? null,
      patientAvatarUrl: input.patientAvatarUrl ?? null,
      treatmentName: input.treatmentName ?? null,
      reviewTitle: input.reviewTitle ?? null,
      reviewComment: input.reviewComment,
      rating: input.rating,
      reviewDate: input.reviewDate ?? null,
      media: (input.media ?? []).map((item, index) => ({
        id: item.id ?? '',
        type: item.type,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl ?? null,
        caption: item.caption ?? null,
        sortOrder: item.sortOrder ?? index,
      })),
    });

    await this.translationTaskService.enqueue({
      sourceDb: 'supabase_china',
      entityType: 'review',
      entityId: saved.id,
      fieldsToTranslate: buildReviewTranslationFields(saved),
    });

    return saved;
  }
}

function buildReviewTranslationFields(review: ReviewTranslationSource): Record<string, unknown> {
  return {
    treatmentName: review.treatmentName ?? null,
    reviewTitle: review.reviewTitle ?? null,
    reviewComment: review.reviewComment ?? null,
  };
}

function ensureRegularMaterialsReviewsHospital(hospitalType: 'COSMETIC' | 'REGULAR'): void {
  if (hospitalType !== 'REGULAR') {
    throw new ForbiddenError('Materials reviews are only available for regular hospitals');
  }
}
