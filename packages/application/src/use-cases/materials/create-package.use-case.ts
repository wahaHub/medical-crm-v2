import type { IMaterialsRepository } from '@medical-crm/domain';
import { ForbiddenError, ValidationError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

type MaterialsPackageTagCategory =
  | 'treatment'
  | 'service'
  | 'audience'
  | 'city'
  | 'price'
  | 'style';

export interface CreateMaterialsPackageInput {
  slug: string;
  sortOrder?: number;
  isActive?: boolean;
  title: string;
  subtitle?: string | null;
  coverImageUrl: string;
  gallery?: Array<{ id?: string; imageUrl: string; sortOrder?: number }>;
  price: string;
  currency: string;
  duration?: string | null;
  summary: string;
  tags?: Array<{ id?: string; label: string; category?: MaterialsPackageTagCategory | null }>;
  includes?: Array<{ id?: string; text: string; sortOrder?: number }>;
  process?: Array<{ id?: string; stepTitle: string; description: string; sortOrder?: number }>;
  cases?: Array<{
    id?: string;
    patientName: string;
    patientAge: number;
    patientCountry: string;
    story: string;
    result: string;
    sortOrder?: number;
  }>;
  reviews?: Array<{
    id?: string;
    reviewerName: string;
    reviewerCountry: string;
    rating: number;
    reviewDate: string;
    comment: string;
    sortOrder?: number;
    isActive?: boolean;
  }>;
}

type PackageTranslationSource = {
  title: string;
  subtitle?: string | null;
  summary: string;
  includes: Array<{ id?: string; text: string }>;
  process: Array<{ id?: string; stepTitle: string; description: string }>;
  cases: Array<{ id?: string; story: string; result: string }>;
  reviews: Array<{ id?: string; comment: string }>;
};

export class CreateMaterialsPackageUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(
    hospitalId: string,
    input: CreateMaterialsPackageInput,
    actor: Actor,
  ): Promise<Awaited<ReturnType<IMaterialsRepository['createPackage']>>> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const hospitalType = await this.resolveHospitalType(hospitalId);
    ensureRegularMaterialsPackagesHospital(hospitalType);
    validatePackageNestedContent(input);

    const saved = await this.materialsRepo.createPackage({
      hospitalId,
      slug: input.slug,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      title: input.title,
      subtitle: input.subtitle ?? null,
      coverImageUrl: input.coverImageUrl,
      gallery: (input.gallery ?? []).map((item, index) => ({
        id: item.id ?? '',
        imageUrl: item.imageUrl,
        sortOrder: item.sortOrder ?? index,
      })),
      price: input.price,
      currency: input.currency,
      duration: input.duration ?? null,
      summary: input.summary,
      tags: (input.tags ?? []).map((item) => ({
        id: item.id ?? '',
        label: item.label,
        category: item.category ?? null,
      })),
      includes: (input.includes ?? []).map((item, index) => ({
        id: item.id ?? '',
        text: item.text,
        sortOrder: item.sortOrder ?? index,
      })),
      process: (input.process ?? []).map((item, index) => ({
        id: item.id ?? '',
        stepTitle: item.stepTitle,
        description: item.description,
        sortOrder: item.sortOrder ?? index,
      })),
      cases: (input.cases ?? []).map((item, index) => ({
        id: item.id ?? '',
        patientName: item.patientName,
        patientAge: item.patientAge,
        patientCountry: item.patientCountry,
        story: item.story,
        result: item.result,
        sortOrder: item.sortOrder ?? index,
      })),
      reviews: (input.reviews ?? []).map((item, index) => ({
        id: item.id ?? '',
        reviewerName: item.reviewerName,
        reviewerCountry: item.reviewerCountry,
        rating: item.rating,
        reviewDate: item.reviewDate,
        comment: item.comment,
        sortOrder: item.sortOrder ?? index,
        isActive: item.isActive ?? true,
      })),
    });

    await this.translationTaskService.enqueue({
      sourceDb: 'supabase_china',
      entityType: 'package',
      entityId: saved.id,
      fieldsToTranslate: buildPackageTranslationFields(saved),
    });

    return saved;
  }
}

function buildPackageTranslationFields(pkg: PackageTranslationSource): Record<string, unknown> {
  return {
    title: pkg.title,
    subtitle: pkg.subtitle ?? null,
    summary: pkg.summary,
    includes: pkg.includes
      .filter((item) => hasText(item.text))
      .map((item) => ({ ...(item.id ? { id: item.id } : {}), text: item.text })),
    process: pkg.process
      .filter((item) => hasText(item.stepTitle) && hasText(item.description))
      .map((item) => ({
        ...(item.id ? { id: item.id } : {}),
        stepTitle: item.stepTitle,
        description: item.description,
      })),
    cases: pkg.cases
      .filter((item) => hasText(item.story) && hasText(item.result))
      .map((item) => ({
        ...(item.id ? { id: item.id } : {}),
        story: item.story,
        result: item.result,
      })),
    reviews: pkg.reviews
      .filter((item) => hasText(item.comment))
      .map((item) => ({
        ...(item.id ? { id: item.id } : {}),
        comment: item.comment,
      })),
  };
}

function ensureRegularMaterialsPackagesHospital(hospitalType: 'COSMETIC' | 'REGULAR'): void {
  if (hospitalType !== 'REGULAR') {
    throw new ForbiddenError('Materials packages are only available for regular hospitals');
  }
}

function validatePackageNestedContent(input: Pick<CreateMaterialsPackageInput, 'includes' | 'process' | 'cases' | 'reviews'>): void {
  if (input.includes?.some((item) => !hasText(item.text))) {
    throw new ValidationError('Package includes must include text when provided');
  }

  if (input.process?.some((item) => !hasText(item.stepTitle) || !hasText(item.description))) {
    throw new ValidationError('Package process steps must include stepTitle and description when provided');
  }

  if (input.cases?.some((item) => (
    !hasText(item.patientName)
    || !Number.isFinite(item.patientAge)
    || !hasText(item.patientCountry)
    || !hasText(item.story)
    || !hasText(item.result)
  ))) {
    throw new ValidationError('Package cases must include patientName, patientAge, patientCountry, story, and result when provided');
  }

  if (input.reviews?.some((item) => (
    !hasText(item.reviewerName)
    || !hasText(item.reviewerCountry)
    || !hasText(item.reviewDate)
    || !hasText(item.comment)
  ))) {
    throw new ValidationError('Package reviews must include reviewerName, reviewerCountry, reviewDate, and comment when provided');
  }
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
