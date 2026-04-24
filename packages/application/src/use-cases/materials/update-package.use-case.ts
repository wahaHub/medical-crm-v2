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

export interface UpdateMaterialsPackageInput {
  slug?: string;
  sortOrder?: number;
  isActive?: boolean;
  title?: string;
  subtitle?: string | null;
  coverImageUrl?: string;
  gallery?: Array<{ id?: string; imageUrl: string; sortOrder?: number }>;
  price?: string;
  currency?: string;
  duration?: string | null;
  summary?: string;
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
  title?: string;
  subtitle?: string | null;
  summary?: string;
  includes?: Array<{ text: string }>;
  process?: Array<{ stepTitle: string; description: string }>;
  cases?: Array<{ story: string; result: string }>;
  reviews?: Array<{ comment: string }>;
};

export class UpdateMaterialsPackageUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(
    hospitalId: string,
    packageId: string,
    input: UpdateMaterialsPackageInput,
    actor: Actor,
  ): Promise<Awaited<ReturnType<IMaterialsRepository['updatePackage']>>> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const hospitalType = await this.resolveHospitalType(hospitalId);
    ensureRegularMaterialsPackagesHospital(hospitalType);
    validatePackageNestedContent(input);

    const saved = await this.materialsRepo.updatePackage(packageId, hospitalId, {
      ...input,
      gallery: input.gallery?.map((item, index) => ({
        id: item.id ?? '',
        imageUrl: item.imageUrl,
        sortOrder: item.sortOrder ?? index,
      })),
      tags: input.tags?.map((item) => ({
        id: item.id ?? '',
        label: item.label,
        category: item.category ?? null,
      })),
      includes: input.includes?.map((item, index) => ({
        id: item.id ?? '',
        text: item.text,
        sortOrder: item.sortOrder ?? index,
      })),
      process: input.process?.map((item, index) => ({
        id: item.id ?? '',
        stepTitle: item.stepTitle,
        description: item.description,
        sortOrder: item.sortOrder ?? index,
      })),
      cases: input.cases?.map((item, index) => ({
        id: item.id ?? '',
        patientName: item.patientName,
        patientAge: item.patientAge,
        patientCountry: item.patientCountry,
        story: item.story,
        result: item.result,
        sortOrder: item.sortOrder ?? index,
      })),
      reviews: input.reviews?.map((item, index) => ({
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

    const translationSource: PackageTranslationSource = {};
    if ('title' in input) {
      translationSource.title = input.title;
    }
    if ('subtitle' in input) {
      translationSource.subtitle = input.subtitle;
    }
    if ('summary' in input) {
      translationSource.summary = input.summary;
    }
    if ('includes' in input) {
      translationSource.includes = input.includes?.map((item) => ({ text: item.text })) ?? [];
    }
    if ('process' in input) {
      translationSource.process = input.process?.map((item) => ({
        stepTitle: item.stepTitle,
        description: item.description,
      })) ?? [];
    }
    if ('cases' in input) {
      translationSource.cases = input.cases?.map((item) => ({
        story: item.story,
        result: item.result,
      })) ?? [];
    }
    if ('reviews' in input) {
      translationSource.reviews = input.reviews?.map((item) => ({ comment: item.comment })) ?? [];
    }

    const fieldsToTranslate = buildPackageTranslationFields(translationSource);
    if (Object.keys(fieldsToTranslate).length > 0) {
      await this.translationTaskService.enqueue({
        sourceDb: 'supabase_china',
        entityType: 'package',
        entityId: packageId,
        fieldsToTranslate,
      });
    }

    return saved;
  }
}

function buildPackageTranslationFields(pkg: PackageTranslationSource): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if ('title' in pkg) {
    fields.title = pkg.title ?? null;
  }

  if ('subtitle' in pkg) {
    fields.subtitle = pkg.subtitle ?? null;
  }

  if ('summary' in pkg) {
    fields.summary = pkg.summary ?? null;
  }

  if ('includes' in pkg) {
    fields.includes = (pkg.includes ?? [])
      .filter((item) => hasText(item.text))
      .map((item) => ({ text: item.text }));
  }

  if ('process' in pkg) {
    fields.process = (pkg.process ?? [])
      .filter((item) => hasText(item.stepTitle) && hasText(item.description))
      .map((item) => ({
        stepTitle: item.stepTitle,
        description: item.description,
      }));
  }

  if ('cases' in pkg) {
    fields.cases = (pkg.cases ?? [])
      .filter((item) => hasText(item.story) && hasText(item.result))
      .map((item) => ({
        story: item.story,
        result: item.result,
      }));
  }

  if ('reviews' in pkg) {
    fields.reviews = (pkg.reviews ?? [])
      .filter((item) => hasText(item.comment))
      .map((item) => ({
        comment: item.comment,
      }));
  }

  return fields;
}

function ensureRegularMaterialsPackagesHospital(hospitalType: 'COSMETIC' | 'REGULAR'): void {
  if (hospitalType !== 'REGULAR') {
    throw new ForbiddenError('Materials packages are only available for regular hospitals');
  }
}

function validatePackageNestedContent(input: Pick<UpdateMaterialsPackageInput, 'includes' | 'process' | 'cases' | 'reviews'>): void {
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
