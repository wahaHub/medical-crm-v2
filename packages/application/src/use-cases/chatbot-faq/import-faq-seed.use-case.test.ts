import { describe, expect, it, vi } from 'vitest';
import { ChatbotFaqItem } from '@medical-crm/domain';
import { ImportFaqSeedUseCase } from './import-faq-seed.use-case.js';

describe('ImportFaqSeedUseCase', () => {
  it('creates categories before FAQ items', async () => {
    const callOrder: string[] = [];
    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([]),
      updateCategory: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      createCategory: vi.fn().mockImplementation(async (input: any) => {
        callOrder.push(`category:${input.name}`);
        return buildCategory({
          id: `cat-${input.name}`,
          name: input.name,
          hospitalType: input.hospitalType,
          hospitalId: input.hospitalId ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        });
      }),
      save: vi.fn().mockImplementation(async (entity: ChatbotFaqItem) => {
        callOrder.push(`faq:${entity.id}`);
        return entity;
      }),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any);

    const result = await useCase.execute({
      seed: buildSeed({
        categories: [
          buildSeedCategory({ id: 'general-docs', name: 'Medical Documents' }),
          buildSeedCategory({ id: 'general-consult', name: 'Consultation Process', sortOrder: 20 }),
        ],
        faqItems: [
          buildSeedFaqItem({ id: uuidTail(1), category: 'Medical Documents' }),
          buildSeedFaqItem({ id: uuidTail(2), category: 'Consultation Process', sortOrder: 20 }),
        ],
      }),
    });

    expect(callOrder).toEqual([
      'category:Medical Documents',
      'category:Consultation Process',
      `faq:${uuidTail(1)}`,
      `faq:${uuidTail(2)}`,
    ]);
    expect(result).toMatchObject({
      categoriesCreated: 2,
      categoriesUpdated: 0,
      categoriesSkipped: 0,
      faqItemsCreated: 2,
      faqItemsUpdated: 0,
      faqItemsSkipped: 0,
    });
  });

  it('creates hospital-scoped categories and FAQ items with explicit hospitalId', async () => {
    const faqRepo = {
      listCategories: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      updateCategory: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      createCategory: vi.fn().mockImplementation(async (input: any) => buildCategory({
        id: `cat-${input.name}`,
        name: input.name,
        hospitalType: input.hospitalType,
        hospitalId: input.hospitalId ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      })),
      save: vi.fn().mockImplementation(async (entity: ChatbotFaqItem) => entity),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any);

    await useCase.execute({
      seed: buildSeed({
        categories: [
          buildSeedCategory({ id: 'general-docs', name: 'Medical Documents' }),
          buildSeedCategory({
            id: 'hospital-review',
            name: 'Hospital Review Requirements',
            hospitalId: '11111111-1111-4111-8111-111111111111',
            scope: 'HOSPITAL',
          }),
        ],
        faqItems: [
          buildSeedFaqItem({
            id: uuidTail(101),
            hospitalId: '11111111-1111-4111-8111-111111111111',
            scope: 'HOSPITAL',
            category: 'Hospital Review Requirements',
          }),
        ],
      }),
    });

    expect(faqRepo.createCategory).toHaveBeenNthCalledWith(2, expect.objectContaining({
      name: 'Hospital Review Requirements',
      hospitalType: 'COSMETIC',
      hospitalId: '11111111-1111-4111-8111-111111111111',
    }));
    const saved = faqRepo.save.mock.calls[0]?.[0] as ChatbotFaqItem;
    expect(saved.hospitalId).toBe('11111111-1111-4111-8111-111111111111');
    expect(saved.category).toBe('Hospital Review Requirements');
  });

  it('rejects FAQ items that reference categories not present in the seed', async () => {
    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([]),
      updateCategory: vi.fn(),
      findById: vi.fn(),
      createCategory: vi.fn(),
      save: vi.fn(),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any);

    await expect(useCase.execute({
      seed: buildSeed({
        categories: [buildSeedCategory({ id: 'general-docs', name: 'Medical Documents' })],
        faqItems: [buildSeedFaqItem({ id: uuidTail(1), category: 'Missing Category' })],
      }),
    })).rejects.toThrow('Seed FAQ item references unknown category');

    expect(faqRepo.save).not.toHaveBeenCalled();
  });

  it('skips unchanged rows and updates changed rows on rerun', async () => {
    const existingCategory = buildCategory({
      id: 'existing-docs',
      name: 'Medical Documents',
      hospitalType: 'COSMETIC',
      hospitalId: null,
      sortOrder: 10,
      isActive: true,
    });
    const existingFaq = buildFaqEntity({
      id: uuidTail(1),
      category: 'Medical Documents',
      question: 'What should I know about medical documents before I get started?',
      answer: 'Existing answer',
    });

    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([existingCategory]),
      updateCategory: vi.fn().mockResolvedValue(existingCategory),
      findById: vi.fn().mockImplementation(async (id: string) => (
        id === uuidTail(1) ? existingFaq : null
      )),
      createCategory: vi.fn().mockResolvedValue(existingCategory),
      save: vi.fn().mockImplementation(async (entity: ChatbotFaqItem) => entity),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any);

    const result = await useCase.execute({
      seed: buildSeed({
        categories: [buildSeedCategory({ id: 'general-docs', name: 'Medical Documents' })],
        faqItems: [
          buildSeedFaqItem({
            id: uuidTail(1),
            category: 'Medical Documents',
            question: 'What should I know about medical documents before I get started?',
            answer: 'Existing answer',
          }),
          buildSeedFaqItem({
            id: uuidTail(2),
            category: 'Medical Documents',
            answer: 'Updated answer',
          }),
        ],
      }),
    });

    expect(result).toMatchObject({
      categoriesCreated: 0,
      categoriesUpdated: 0,
      categoriesSkipped: 1,
      faqItemsCreated: 1,
      faqItemsUpdated: 0,
      faqItemsSkipped: 1,
    });
    expect(faqRepo.createCategory).not.toHaveBeenCalled();
    expect(faqRepo.save).toHaveBeenCalledTimes(1);
    const saved = faqRepo.save.mock.calls[0]?.[0] as ChatbotFaqItem;
    expect(saved.id).toBe(uuidTail(2));
    expect(saved.answer).toBe('Updated answer');
  });

  it('updates changed general categories by id instead of re-creating them', async () => {
    const existingCategory = buildCategory({
      id: 'existing-docs',
      name: 'Medical Documents',
      hospitalType: 'COSMETIC',
      hospitalId: null,
      sortOrder: 10,
      isActive: true,
    });
    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([existingCategory]),
      updateCategory: vi.fn().mockResolvedValue(buildCategory({
        ...existingCategory,
        sortOrder: 20,
      })),
      findById: vi.fn().mockResolvedValue(null),
      createCategory: vi.fn(),
      save: vi.fn().mockImplementation(async (entity: ChatbotFaqItem) => entity),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any);

    const result = await useCase.execute({
      seed: buildSeed({
        categories: [buildSeedCategory({ id: 'general-docs', name: 'Medical Documents', sortOrder: 20 })],
        faqItems: [buildSeedFaqItem({ id: uuidTail(2), category: 'Medical Documents', answer: 'Updated answer' })],
      }),
    });

    expect(faqRepo.updateCategory).toHaveBeenCalledWith('existing-docs', {
      sortOrder: 20,
      isActive: true,
    });
    expect(faqRepo.createCategory).not.toHaveBeenCalled();
    expect(result.categoriesUpdated).toBe(1);
  });

  it('rejects inconsistent scope and hospitalId combinations before import', async () => {
    const faqRepo = {
      listCategories: vi.fn(),
      updateCategory: vi.fn(),
      findById: vi.fn(),
      createCategory: vi.fn(),
      save: vi.fn(),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any);

    await expect(useCase.execute({
      seed: buildSeed({
        categories: [
          buildSeedCategory({
            id: 'bad-general',
            name: 'Medical Documents',
            scope: 'GENERAL',
            hospitalId: '11111111-1111-4111-8111-111111111111',
          }),
        ],
      }),
    })).rejects.toThrow('GENERAL seed category must not have hospitalId');

    expect(faqRepo.createCategory).not.toHaveBeenCalled();
  });

  it('rejects invalid scope values before import', async () => {
    const faqRepo = {
      listCategories: vi.fn(),
      updateCategory: vi.fn(),
      findById: vi.fn(),
      createCategory: vi.fn(),
      save: vi.fn(),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any);

    await expect(useCase.execute({
      seed: {
        categories: [
          {
            ...buildSeedCategory({ id: 'bad-scope', name: 'Medical Documents' }),
            scope: 'INVALID' as any,
          },
        ],
        faqItems: [],
        evaluationQueries: [],
      },
    })).rejects.toThrow('Seed category has invalid scope');

    expect(faqRepo.createCategory).not.toHaveBeenCalled();
  });

  it('rejects invalid non-uuid hospitalId values before import', async () => {
    const faqRepo = {
      listCategories: vi.fn(),
      updateCategory: vi.fn(),
      findById: vi.fn(),
      createCategory: vi.fn(),
      save: vi.fn(),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any);

    await expect(useCase.execute({
      seed: buildSeed({
        categories: [
          buildSeedCategory({
            id: 'bad-hospital-id',
            name: 'Hospital Review Requirements',
            scope: 'HOSPITAL',
            hospitalId: 'not-a-uuid',
          }),
        ],
      }),
    })).rejects.toThrow('Seed category has invalid hospitalId');

    expect(faqRepo.createCategory).not.toHaveBeenCalled();
  });

  it('enqueues FAQ sync upserts for created or updated FAQ items', async () => {
    const aiSyncTaskService = {
      enqueueFaqUpsert: vi.fn().mockResolvedValue(undefined),
    };
    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([]),
      updateCategory: vi.fn(),
      findById: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildFaqEntity({
          id: uuidTail(2),
          category: 'Medical Documents',
          question: 'What should I know about medical documents before I get started?',
          answer: 'Old answer',
          attachments: [
            {
              storageKey: 'faq/existing.pdf',
              fileName: 'existing.pdf',
              mimeType: 'application/pdf',
              fileSize: 2048,
            },
          ],
        })),
      createCategory: vi.fn().mockImplementation(async (input: any) => buildCategory({
        id: `cat-${input.name}`,
        name: input.name,
        hospitalType: input.hospitalType,
        hospitalId: input.hospitalId ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      })),
      save: vi.fn().mockImplementation(async (entity: ChatbotFaqItem) => entity),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any, aiSyncTaskService as any);

    await useCase.execute({
      seed: buildSeed({
        categories: [buildSeedCategory({ id: 'general-docs', name: 'Medical Documents' })],
        faqItems: [
          buildSeedFaqItem({ id: uuidTail(1), category: 'Medical Documents', answer: 'Fresh answer' }),
          buildSeedFaqItem({ id: uuidTail(2), category: 'Medical Documents', answer: 'New answer' }),
        ],
      }),
    });

    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenCalledTimes(2);
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenNthCalledWith(1, {
      faqId: uuidTail(1),
      category: 'Medical Documents',
      question: 'What should I know about medical documents before I get started?',
      answer: 'Fresh answer',
      hospitalType: 'COSMETIC',
      hospitalId: null,
      keywords: ['documents'],
      attachments: [],
      isActive: true,
    });
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenNthCalledWith(2, {
      faqId: uuidTail(2),
      category: 'Medical Documents',
      question: 'What should I know about medical documents before I get started?',
      answer: 'New answer',
      hospitalType: 'COSMETIC',
      hospitalId: null,
      keywords: ['documents'],
      attachments: [
        {
          storageKey: 'faq/existing.pdf',
          fileName: 'existing.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
        },
      ],
      isActive: true,
    });
  });

  it('re-enqueues unchanged FAQ items when sync service is present so reruns can recover missed outbox writes', async () => {
    const aiSyncTaskService = {
      enqueueFaqUpsert: vi.fn().mockResolvedValue(undefined),
    };
    const existingFaq = buildFaqEntity({
      id: uuidTail(1),
      category: 'Medical Documents',
      question: 'What should I know about medical documents before I get started?',
      answer: 'Seed answer',
      attachments: [
        {
          storageKey: 'faq/documents.pdf',
          fileName: 'documents.pdf',
          mimeType: 'application/pdf',
          fileSize: 1234,
        },
      ],
    });
    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([buildCategory({
        id: 'existing-docs',
        name: 'Medical Documents',
        hospitalType: 'COSMETIC',
        hospitalId: null,
        sortOrder: 10,
        isActive: true,
      })]),
      updateCategory: vi.fn(),
      findById: vi.fn().mockResolvedValue(existingFaq),
      createCategory: vi.fn(),
      save: vi.fn(),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any, aiSyncTaskService as any);

    const result = await useCase.execute({
      seed: buildSeed({
        categories: [buildSeedCategory({ id: 'general-docs', name: 'Medical Documents' })],
        faqItems: [buildSeedFaqItem({ id: uuidTail(1), category: 'Medical Documents', answer: 'Seed answer' })],
      }),
    });

    expect(result.faqItemsSkipped).toBe(1);
    expect(faqRepo.save).not.toHaveBeenCalled();
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenCalledWith({
      faqId: uuidTail(1),
      category: 'Medical Documents',
      question: 'What should I know about medical documents before I get started?',
      answer: 'Seed answer',
      hospitalType: 'COSMETIC',
      hospitalId: null,
      keywords: ['documents'],
      attachments: [
        {
          storageKey: 'faq/documents.pdf',
          fileName: 'documents.pdf',
          mimeType: 'application/pdf',
          fileSize: 1234,
        },
      ],
      isActive: true,
    });
  });
});

function buildSeed(overrides?: {
  categories?: Array<ReturnType<typeof buildSeedCategory>>;
  faqItems?: Array<ReturnType<typeof buildSeedFaqItem>>;
}) {
  return {
    categories: overrides?.categories ?? [buildSeedCategory({ id: 'general-docs', name: 'Medical Documents' })],
    faqItems: overrides?.faqItems ?? [buildSeedFaqItem({ id: uuidTail(1), category: 'Medical Documents' })],
    evaluationQueries: [],
  };
}

function buildSeedCategory(overrides: {
  id: string;
  name: string;
  hospitalId?: string | null;
  hospitalType?: 'COSMETIC' | 'REGULAR';
  scope?: 'GENERAL' | 'HOSPITAL';
  sortOrder?: number;
  isActive?: boolean;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    hospitalType: overrides.hospitalType ?? 'COSMETIC',
    hospitalId: overrides.hospitalId ?? null,
    scope: overrides.scope ?? 'GENERAL',
    sortOrder: overrides.sortOrder ?? 10,
    isActive: overrides.isActive ?? true,
  };
}

function buildSeedFaqItem(overrides: {
  id: string;
  category: string;
  question?: string;
  answer?: string;
  hospitalId?: string | null;
  hospitalType?: 'COSMETIC' | 'REGULAR';
  scope?: 'GENERAL' | 'HOSPITAL';
  sortOrder?: number;
}) {
  return {
    id: overrides.id,
    hospitalType: overrides.hospitalType ?? 'COSMETIC',
    hospitalId: overrides.hospitalId ?? null,
    scope: overrides.scope ?? 'GENERAL',
    category: overrides.category,
    question: overrides.question ?? 'What should I know about medical documents before I get started?',
    answer: overrides.answer ?? 'Seed answer',
    keywords: ['documents'],
    isActive: true,
    sortOrder: overrides.sortOrder ?? 10,
  };
}

function buildCategory(overrides: {
  id: string;
  name: string;
  hospitalType: 'COSMETIC' | 'REGULAR';
  hospitalId: string | null;
  sortOrder: number;
  isActive: boolean;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    hospitalType: overrides.hospitalType,
    hospitalId: overrides.hospitalId,
    sortOrder: overrides.sortOrder,
    isActive: overrides.isActive,
    questionCount: 0,
    translations: {},
    createdAt: new Date('2026-04-02T00:00:00Z'),
    updatedAt: new Date('2026-04-02T00:00:00Z'),
  };
}

function buildFaqEntity(overrides: {
  id: string;
  category: string;
  question: string;
  answer: string;
  attachments?: Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }>;
}) {
  return new ChatbotFaqItem({
    id: overrides.id,
    category: overrides.category,
    question: overrides.question,
    answer: overrides.answer,
    hospitalType: 'COSMETIC',
    hospitalId: null,
    keywords: ['documents'],
    sortOrder: 10,
    isActive: true,
    attachments: overrides.attachments ?? [],
    createdAt: new Date('2026-04-02T00:00:00Z'),
    updatedAt: new Date('2026-04-02T00:00:00Z'),
  });
}

function uuidTail(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
