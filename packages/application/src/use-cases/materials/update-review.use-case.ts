import type { IMaterialsRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface UpdateMaterialsReviewInput {
  sortOrder?: number;
  isActive?: boolean;
  featured?: boolean;
  patientName?: string;
  patientCountry?: string | null;
  patientAvatarUrl?: string | null;
  treatmentName?: string | null;
  reviewTitle?: string | null;
  reviewComment?: string;
  rating?: number;
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

export class UpdateMaterialsReviewUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(
    hospitalId: string,
    reviewId: string,
    input: UpdateMaterialsReviewInput,
    actor: Actor,
  ): Promise<Awaited<ReturnType<IMaterialsRepository['updateReview']>>> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const hospitalType = await this.resolveHospitalType(hospitalId);
    ensureRegularMaterialsReviewsHospital(hospitalType);

    const saved = await this.materialsRepo.updateReview(reviewId, hospitalId, {
      ...input,
      media: input.media?.map((item, index) => ({
        id: item.id ?? '',
        type: item.type,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl ?? null,
        caption: item.caption ?? null,
        sortOrder: item.sortOrder ?? index,
      })),
    });

    const fieldsToTranslate = buildReviewTranslationFields(input);
    if (Object.keys(fieldsToTranslate).length > 0) {
      await this.translationTaskService.enqueue({
        sourceDb: 'supabase_china',
        entityType: 'review',
        entityId: reviewId,
        fieldsToTranslate,
      });
    }

    return saved;
  }
}

function buildReviewTranslationFields(review: ReviewTranslationSource): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if ('treatmentName' in review) {
    fields.treatmentName = review.treatmentName ?? null;
  }

  if ('reviewTitle' in review) {
    fields.reviewTitle = review.reviewTitle ?? null;
  }

  if ('reviewComment' in review) {
    fields.reviewComment = review.reviewComment ?? null;
  }

  return fields;
}

function ensureRegularMaterialsReviewsHospital(hospitalType: 'COSMETIC' | 'REGULAR'): void {
  if (hospitalType !== 'REGULAR') {
    throw new ForbiddenError('Materials reviews are only available for regular hospitals');
  }
}
