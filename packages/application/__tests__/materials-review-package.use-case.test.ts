import { describe, expect, it, vi } from 'vitest';
import type {
  IMaterialsRepository,
  MaterialsBeforeAfterCase,
  MaterialsHospitalInfo,
  MaterialsPackage,
  MaterialsProcedure,
  MaterialsReview,
  MaterialsSurgeon,
} from '@medical-crm/domain';
import { CreateMaterialsReviewUseCase } from '../src/use-cases/materials/create-review.use-case.js';
import { DeleteMaterialsReviewUseCase } from '../src/use-cases/materials/delete-review.use-case.js';
import { GetMaterialsReviewsUseCase } from '../src/use-cases/materials/get-reviews.use-case.js';
import { UpdateMaterialsReviewUseCase } from '../src/use-cases/materials/update-review.use-case.js';
import { CreateMaterialsPackageUseCase } from '../src/use-cases/materials/create-package.use-case.js';
import { DeleteMaterialsPackageUseCase } from '../src/use-cases/materials/delete-package.use-case.js';
import { GetMaterialsPackageUseCase } from '../src/use-cases/materials/get-package.use-case.js';
import { GetMaterialsPackagesUseCase } from '../src/use-cases/materials/get-packages.use-case.js';
import { UpdateMaterialsPackageUseCase } from '../src/use-cases/materials/update-package.use-case.js';

function makeRepo(): IMaterialsRepository {
  const review: MaterialsReview = {
    id: 'review-1',
    hospitalId: 'hospital-1',
    sortOrder: 0,
    isActive: true,
    featured: true,
    patientName: 'Sarah Chen',
    patientCountry: 'Singapore',
    patientAvatarUrl: 'https://example.com/avatar.jpg',
    treatmentName: 'LASIK',
    reviewTitle: 'Smooth recovery',
    reviewComment: 'Great care from the team.',
    rating: 5,
    reviewDate: '2026-04-24',
    media: [
      {
        id: 'media-1',
        type: 'image',
        url: 'https://example.com/review.jpg',
        thumbnailUrl: null,
        caption: 'Day 1',
        sortOrder: 0,
      },
    ],
    translations: {},
  };

  const pkg: MaterialsPackage = {
    id: 'package-1',
    hospitalId: 'hospital-1',
    slug: 'premium-lasik',
    sortOrder: 0,
    isActive: true,
    title: 'Premium LASIK',
    subtitle: 'Bilingual care',
    coverImageUrl: 'https://example.com/cover.jpg',
    gallery: [
      {
        id: 'gallery-1',
        imageUrl: 'https://example.com/gallery.jpg',
        sortOrder: 0,
      },
    ],
    price: '3800',
    currency: 'USD',
    duration: '5 days',
    summary: 'A complete package.',
    tags: [
      {
        id: 'tag-1',
        label: 'Vision Correction',
        category: 'treatment',
      },
    ],
    includes: [
      {
        id: 'include-1',
        text: 'SMILE procedure',
        sortOrder: 0,
      },
    ],
    process: [
      {
        id: 'process-1',
        stepTitle: 'Day 1',
        description: 'Arrival and tests',
        sortOrder: 0,
      },
    ],
    cases: [
      {
        id: 'case-1',
        patientName: 'Mr. Ahmad',
        patientAge: 32,
        patientCountry: 'Malaysia',
        story: 'Wanted to dive without glasses.',
        result: 'Back to diving in two weeks.',
        sortOrder: 0,
      },
    ],
    reviews: [
      {
        id: 'pkg-review-1',
        reviewerName: 'Sarah K.',
        reviewerCountry: 'Singapore',
        rating: 5,
        reviewDate: '2026-04-23',
        comment: 'Excellent experience.',
        sortOrder: 0,
        isActive: true,
      },
    ],
    translations: {},
  };

  const mergeDefined = <T extends object>(base: T, updates: Partial<T>): T => ({
    ...base,
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)),
  });

  const normalizePackageArrays = (value: Partial<MaterialsPackage>): Partial<MaterialsPackage> => ({
    ...value,
    includes: value.includes?.map((item, index) => ({
      ...item,
      id: item.id || `include-${index + 1}`,
    })),
    process: value.process?.map((item, index) => ({
      ...item,
      id: item.id || `process-${index + 1}`,
    })),
    cases: value.cases?.map((item, index) => ({
      ...item,
      id: item.id || `case-${index + 1}`,
    })),
    reviews: value.reviews?.map((item, index) => ({
      ...item,
      id: item.id || `pkg-review-${index + 1}`,
    })),
  });

  return {
    getHospitalInfo: vi.fn<() => Promise<MaterialsHospitalInfo | null>>(),
    updateHospitalInfo: vi.fn<() => Promise<MaterialsHospitalInfo>>(),
    listProcedures: vi.fn<() => Promise<MaterialsProcedure[]>>().mockResolvedValue([]),
    createProcedure: vi.fn<() => Promise<MaterialsProcedure>>(),
    updateProcedure: vi.fn<() => Promise<MaterialsProcedure>>(),
    deleteProcedure: vi.fn<() => Promise<void>>(),
    listSurgeons: vi.fn<() => Promise<MaterialsSurgeon[]>>().mockResolvedValue([]),
    createSurgeon: vi.fn<() => Promise<MaterialsSurgeon>>(),
    updateSurgeon: vi.fn<() => Promise<MaterialsSurgeon>>(),
    deleteSurgeon: vi.fn<() => Promise<void>>(),
    listBeforeAfterCases: vi.fn<() => Promise<MaterialsBeforeAfterCase[]>>().mockResolvedValue([]),
    createBeforeAfterCase: vi.fn<() => Promise<MaterialsBeforeAfterCase>>(),
    updateBeforeAfterCase: vi.fn<() => Promise<MaterialsBeforeAfterCase>>(),
    deleteBeforeAfterCase: vi.fn<() => Promise<void>>(),
    listReviews: vi.fn<() => Promise<MaterialsReview[]>>().mockResolvedValue([review]),
    createReview: vi.fn<(data: Omit<MaterialsReview, 'id'>) => Promise<MaterialsReview>>().mockImplementation(async (data) => ({
      ...data,
      id: review.id,
    })),
    updateReview: vi.fn<(id: string, hospitalId: string, data: Partial<MaterialsReview>) => Promise<MaterialsReview>>().mockImplementation(
      async (id, hospitalId, data) => ({
        ...mergeDefined(review, data),
        id,
        hospitalId,
      }),
    ),
    deleteReview: vi.fn<() => Promise<void>>(),
    listPackages: vi.fn<() => Promise<MaterialsPackage[]>>().mockResolvedValue([pkg]),
    getPackage: vi.fn<(id: string, hospitalId: string) => Promise<MaterialsPackage | null>>().mockImplementation(
      async (id, hospitalId) => ({
        ...pkg,
        id,
        hospitalId,
      }),
    ),
    createPackage: vi.fn<(data: Omit<MaterialsPackage, 'id'>) => Promise<MaterialsPackage>>().mockImplementation(async (data) => ({
      ...normalizePackageArrays(data),
      id: pkg.id,
    })),
    updatePackage: vi.fn<(id: string, hospitalId: string, data: Partial<MaterialsPackage>) => Promise<MaterialsPackage>>().mockImplementation(
      async (id, hospitalId, data) => ({
        ...mergeDefined(pkg, normalizePackageArrays(data)),
        id,
        hospitalId,
      }),
    ),
    deletePackage: vi.fn<() => Promise<void>>(),
  };
}

describe('materials review and package translation flow', () => {
  const actor = { role: 'HOSPITAL' as const, hospitalId: 'hospital-1' };

  it('rejects cosmetic hospitals when listing materials reviews', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('COSMETIC');
    const useCase = new GetMaterialsReviewsUseCase(repo, resolveHospitalType);

    await expect(useCase.execute('hospital-1', actor))
      .rejects.toThrow('Materials reviews are only available for regular hospitals');

    expect(repo.listReviews).not.toHaveBeenCalled();
  });

  it('rejects cosmetic hospitals when listing materials packages', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('COSMETIC');
    const useCase = new GetMaterialsPackagesUseCase(repo, resolveHospitalType);

    await expect(useCase.execute('hospital-1', actor))
      .rejects.toThrow('Materials packages are only available for regular hospitals');

    expect(repo.listPackages).not.toHaveBeenCalled();
  });

  it('rejects cosmetic hospitals when fetching a materials package', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('COSMETIC');
    const useCase = new GetMaterialsPackageUseCase(repo, resolveHospitalType);

    await expect(useCase.execute('hospital-1', 'package-1', actor))
      .rejects.toThrow('Materials packages are only available for regular hospitals');

    expect(repo.getPackage).not.toHaveBeenCalled();
  });

  it('rejects cosmetic hospitals when deleting a materials review', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('COSMETIC');
    const useCase = new DeleteMaterialsReviewUseCase(repo, resolveHospitalType);

    await expect(useCase.execute('hospital-1', 'review-1', actor))
      .rejects.toThrow('Materials reviews are only available for regular hospitals');

    expect(repo.deleteReview).not.toHaveBeenCalled();
  });

  it('rejects cosmetic hospitals when deleting a materials package', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('COSMETIC');
    const useCase = new DeleteMaterialsPackageUseCase(repo, resolveHospitalType);

    await expect(useCase.execute('hospital-1', 'package-1', actor))
      .rejects.toThrow('Materials packages are only available for regular hospitals');

    expect(repo.deletePackage).not.toHaveBeenCalled();
  });

  it('rejects cosmetic hospitals when creating a materials review', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('COSMETIC');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new CreateMaterialsReviewUseCase(repo, resolveHospitalType, translationTaskService as any);

    await expect(useCase.execute('hospital-1', {
      patientName: 'Sarah Chen',
      patientCountry: 'Singapore',
      treatmentName: 'LASIK',
      reviewTitle: 'Smooth recovery',
      reviewComment: 'Great care from the team.',
      rating: 5,
      reviewDate: '2026-04-24',
      media: [
        {
          type: 'image',
          url: 'https://example.com/review.jpg',
          caption: 'Day 1',
        },
      ],
    }, actor)).rejects.toThrow('Materials reviews are only available for regular hospitals');

    expect(repo.createReview).not.toHaveBeenCalled();
    expect(translationTaskService.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues the agreed review translation payload when creating a materials review', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new CreateMaterialsReviewUseCase(repo, resolveHospitalType, translationTaskService as any);

    await useCase.execute('hospital-1', {
      patientName: 'Sarah Chen',
      patientCountry: 'Singapore',
      treatmentName: 'LASIK',
      reviewTitle: 'Smooth recovery',
      reviewComment: 'Great care from the team.',
      rating: 5,
      reviewDate: '2026-04-24',
      media: [
        {
          type: 'image',
          url: 'https://example.com/review.jpg',
          caption: 'Day 1',
        },
      ],
    }, actor);

    expect(translationTaskService.enqueue).toHaveBeenCalledWith({
      sourceDb: 'supabase_china',
      entityType: 'review',
      entityId: 'review-1',
      fieldsToTranslate: {
        treatmentName: 'LASIK',
        reviewTitle: 'Smooth recovery',
        reviewComment: 'Great care from the team.',
      },
    });
  });

  it('enqueues explicit null replacements when clearing review translation fields', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new UpdateMaterialsReviewUseCase(repo, resolveHospitalType, translationTaskService as any);

    await useCase.execute('hospital-1', 'review-1', {
      treatmentName: null,
      reviewTitle: null,
      reviewComment: 'Updated story',
    }, actor);

    expect(translationTaskService.enqueue).toHaveBeenCalledWith({
      sourceDb: 'supabase_china',
      entityType: 'review',
      entityId: 'review-1',
      fieldsToTranslate: {
        treatmentName: null,
        reviewTitle: null,
        reviewComment: 'Updated story',
      },
    });
  });

  it('does not enqueue review translations for metadata-only updates', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new UpdateMaterialsReviewUseCase(repo, resolveHospitalType, translationTaskService as any);

    await useCase.execute('hospital-1', 'review-1', {
      isActive: false,
      sortOrder: 3,
      featured: false,
    }, actor);

    expect(translationTaskService.enqueue).not.toHaveBeenCalled();
  });

  it('rejects incomplete package case items before persisting', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new CreateMaterialsPackageUseCase(repo, resolveHospitalType, translationTaskService as any);

    await expect(useCase.execute('hospital-1', {
      slug: 'premium-lasik',
      title: 'Premium LASIK',
      coverImageUrl: 'https://example.com/cover.jpg',
      price: '3800',
      currency: 'USD',
      summary: 'A complete package.',
      cases: [{
        patientName: 'Mr. Ahmad',
        patientAge: 32,
        patientCountry: 'Malaysia',
        story: '',
        result: 'Back to diving in two weeks.',
      }],
    }, actor)).rejects.toThrow('Package cases must include patientName, patientAge, patientCountry, story, and result when provided');

    expect(repo.createPackage).not.toHaveBeenCalled();
    expect(translationTaskService.enqueue).not.toHaveBeenCalled();
  });

  it('rejects incomplete package review items before persisting', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new UpdateMaterialsPackageUseCase(repo, resolveHospitalType, translationTaskService as any);

    await expect(useCase.execute('hospital-1', 'package-1', {
      reviews: [{
        reviewerName: 'Sarah K.',
        reviewerCountry: 'Singapore',
        rating: 5,
        reviewDate: '2026-04-23',
        comment: '',
      }],
    }, actor)).rejects.toThrow('Package reviews must include reviewerName, reviewerCountry, reviewDate, and comment when provided');

    expect(repo.updatePackage).not.toHaveBeenCalled();
    expect(translationTaskService.enqueue).not.toHaveBeenCalled();
  });

  it('rejects package cases without age and country before persisting', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new CreateMaterialsPackageUseCase(repo, resolveHospitalType, translationTaskService as any);

    await expect(useCase.execute('hospital-1', {
      slug: 'premium-lasik',
      title: 'Premium LASIK',
      coverImageUrl: 'https://example.com/cover.jpg',
      price: '3800',
      currency: 'USD',
      summary: 'A complete package.',
      cases: [{
        patientName: 'Mr. Ahmad',
        patientAge: undefined as never,
        patientCountry: '',
        story: 'Wanted to dive without glasses.',
        result: 'Back to diving in two weeks.',
      }],
    }, actor)).rejects.toThrow('Package cases must include patientName, patientAge, patientCountry, story, and result when provided');
  });

  it('rejects package reviews without country and date before persisting', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new CreateMaterialsPackageUseCase(repo, resolveHospitalType, translationTaskService as any);

    await expect(useCase.execute('hospital-1', {
      slug: 'premium-lasik',
      title: 'Premium LASIK',
      coverImageUrl: 'https://example.com/cover.jpg',
      price: '3800',
      currency: 'USD',
      summary: 'A complete package.',
      reviews: [{
        reviewerName: 'Sarah K.',
        reviewerCountry: '',
        rating: 5,
        reviewDate: '',
        comment: 'Excellent experience.',
      }],
    }, actor)).rejects.toThrow('Package reviews must include reviewerName, reviewerCountry, reviewDate, and comment when provided');
  });

  it('rejects cosmetic hospitals when creating a materials package', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('COSMETIC');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new CreateMaterialsPackageUseCase(repo, resolveHospitalType, translationTaskService as any);

    await expect(useCase.execute('hospital-1', {
      slug: 'premium-lasik',
      title: 'Premium LASIK',
      subtitle: 'Bilingual care',
      coverImageUrl: 'https://example.com/cover.jpg',
      price: '3800',
      currency: 'USD',
      duration: '5 days',
      summary: 'A complete package.',
      includes: [{ text: 'SMILE procedure' }],
    }, actor)).rejects.toThrow('Materials packages are only available for regular hospitals');

    expect(repo.createPackage).not.toHaveBeenCalled();
    expect(translationTaskService.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues the agreed package translation payload when creating a materials package', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new CreateMaterialsPackageUseCase(repo, resolveHospitalType, translationTaskService as any);

    await useCase.execute('hospital-1', {
      slug: 'premium-lasik',
      title: 'Premium LASIK',
      subtitle: 'Bilingual care',
      coverImageUrl: 'https://example.com/cover.jpg',
      price: '3800',
      currency: 'USD',
      duration: '5 days',
      summary: 'A complete package.',
      tags: [{ label: 'Vision Correction', category: 'treatment' }],
      includes: [{ text: 'SMILE procedure' }],
      process: [{ stepTitle: 'Day 1', description: 'Arrival and tests' }],
      cases: [{ patientName: 'Mr. Ahmad', patientAge: 32, patientCountry: 'Malaysia', story: 'Wanted to dive without glasses.', result: 'Back to diving in two weeks.' }],
      reviews: [{ reviewerName: 'Sarah K.', reviewerCountry: 'Singapore', rating: 5, reviewDate: '2026-04-23', comment: 'Excellent experience.' }],
    }, actor);

    expect(translationTaskService.enqueue).toHaveBeenCalledWith({
      sourceDb: 'supabase_china',
      entityType: 'package',
      entityId: 'package-1',
      fieldsToTranslate: {
        title: 'Premium LASIK',
        subtitle: 'Bilingual care',
        summary: 'A complete package.',
        includes: [{ id: 'include-1', text: 'SMILE procedure' }],
        process: [{ id: 'process-1', stepTitle: 'Day 1', description: 'Arrival and tests' }],
        cases: [{ id: 'case-1', story: 'Wanted to dive without glasses.', result: 'Back to diving in two weeks.' }],
        reviews: [{ id: 'pkg-review-1', comment: 'Excellent experience.' }],
      },
    });
  });

  it('enqueues explicit empty replacements when clearing package translation arrays', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new UpdateMaterialsPackageUseCase(repo, resolveHospitalType, translationTaskService as any);

    await useCase.execute('hospital-1', 'package-1', {
      subtitle: null,
      summary: 'Updated package summary.',
      includes: [],
      process: [],
      cases: [],
      reviews: [],
    }, actor);

    expect(translationTaskService.enqueue).toHaveBeenCalledWith({
      sourceDb: 'supabase_china',
      entityType: 'package',
      entityId: 'package-1',
      fieldsToTranslate: {
        subtitle: null,
        summary: 'Updated package summary.',
        includes: [],
        process: [],
        cases: [],
        reviews: [],
      },
    });
  });

  it('hydrates normalized nested ids from the saved package before enqueuing update translations', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new UpdateMaterialsPackageUseCase(repo, resolveHospitalType, translationTaskService as any);

    await useCase.execute('hospital-1', 'package-1', {
      includes: [{ text: 'Updated include' }],
      process: [{ stepTitle: 'Updated day', description: 'Updated process' }],
      cases: [{ patientName: 'Mr. Ahmad', patientAge: 32, patientCountry: 'Malaysia', story: 'Updated story', result: 'Updated result' }],
      reviews: [{ reviewerName: 'Sarah K.', reviewerCountry: 'Singapore', rating: 5, reviewDate: '2026-04-23', comment: 'Updated review' }],
    }, actor);

    expect(translationTaskService.enqueue).toHaveBeenCalledWith({
      sourceDb: 'supabase_china',
      entityType: 'package',
      entityId: 'package-1',
      fieldsToTranslate: {
        includes: [{ id: 'include-1', text: 'Updated include' }],
        process: [{ id: 'process-1', stepTitle: 'Updated day', description: 'Updated process' }],
        cases: [{ id: 'case-1', story: 'Updated story', result: 'Updated result' }],
        reviews: [{ id: 'pkg-review-1', comment: 'Updated review' }],
      },
    });
  });

  it('does not enqueue package translations for metadata-only updates', async () => {
    const repo = makeRepo();
    const resolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const translationTaskService = { enqueue: vi.fn() };
    const useCase = new UpdateMaterialsPackageUseCase(repo, resolveHospitalType, translationTaskService as any);

    await useCase.execute('hospital-1', 'package-1', {
      isActive: false,
      sortOrder: 2,
    }, actor);

    expect(translationTaskService.enqueue).not.toHaveBeenCalled();
  });
});
