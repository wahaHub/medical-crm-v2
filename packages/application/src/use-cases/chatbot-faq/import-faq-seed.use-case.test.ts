import { describe, expect, it, vi } from 'vitest';
import { ChatbotFaqItem } from '@medical-crm/domain';
import { ImportFaqSeedUseCase } from './import-faq-seed.use-case.js';

describe('ImportFaqSeedUseCase', () => {
  it('creates categories before FAQ items', async () => {
    const callOrder: string[] = [];
    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([]),
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
          buildSeedFaqItem({ id: 'faq-1', category: 'Medical Documents' }),
          buildSeedFaqItem({ id: 'faq-2', category: 'Consultation Process', sortOrder: 20 }),
        ],
      }),
    });

    expect(callOrder).toEqual([
      'category:Medical Documents',
      'category:Consultation Process',
      'faq:faq-1',
      'faq:faq-2',
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
            hospitalId: 'hospital-123',
            scope: 'HOSPITAL',
          }),
        ],
        faqItems: [
          buildSeedFaqItem({
            id: 'hospital-faq-1',
            hospitalId: 'hospital-123',
            scope: 'HOSPITAL',
            category: 'Hospital Review Requirements',
          }),
        ],
      }),
    });

    expect(faqRepo.createCategory).toHaveBeenNthCalledWith(2, expect.objectContaining({
      name: 'Hospital Review Requirements',
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
    }));
    const saved = faqRepo.save.mock.calls[0]?.[0] as ChatbotFaqItem;
    expect(saved.hospitalId).toBe('hospital-123');
    expect(saved.category).toBe('Hospital Review Requirements');
  });

  it('rejects FAQ items that reference categories not present in the seed', async () => {
    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      createCategory: vi.fn(),
      save: vi.fn(),
    };

    const useCase = new ImportFaqSeedUseCase(faqRepo as any);

    await expect(useCase.execute({
      seed: buildSeed({
        categories: [buildSeedCategory({ id: 'general-docs', name: 'Medical Documents' })],
        faqItems: [buildSeedFaqItem({ id: 'faq-1', category: 'Missing Category' })],
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
      id: 'faq-1',
      category: 'Medical Documents',
      question: 'What should I know about medical documents before I get started?',
      answer: 'Existing answer',
    });

    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([existingCategory]),
      findById: vi.fn().mockImplementation(async (id: string) => (
        id === 'faq-1' ? existingFaq : null
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
            id: 'faq-1',
            category: 'Medical Documents',
            question: 'What should I know about medical documents before I get started?',
            answer: 'Existing answer',
          }),
          buildSeedFaqItem({
            id: 'faq-2',
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
    expect(saved.id).toBe('faq-2');
    expect(saved.answer).toBe('Updated answer');
  });

  it('enqueues FAQ sync upserts for created or updated FAQ items', async () => {
    const aiSyncTaskService = {
      enqueueFaqUpsert: vi.fn().mockResolvedValue(undefined),
    };
    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([]),
      findById: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildFaqEntity({
          id: 'faq-2',
          category: 'Medical Documents',
          question: 'What should I know about medical documents before I get started?',
          answer: 'Old answer',
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
          buildSeedFaqItem({ id: 'faq-1', category: 'Medical Documents', answer: 'Fresh answer' }),
          buildSeedFaqItem({ id: 'faq-2', category: 'Medical Documents', answer: 'New answer' }),
        ],
      }),
    });

    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenCalledTimes(2);
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenNthCalledWith(1, {
      faqId: 'faq-1',
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
      faqId: 'faq-2',
      category: 'Medical Documents',
      question: 'What should I know about medical documents before I get started?',
      answer: 'New answer',
      hospitalType: 'COSMETIC',
      hospitalId: null,
      keywords: ['documents'],
      attachments: [],
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
    faqItems: overrides?.faqItems ?? [buildSeedFaqItem({ id: 'faq-1', category: 'Medical Documents' })],
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
    attachments: [],
    createdAt: new Date('2026-04-02T00:00:00Z'),
    updatedAt: new Date('2026-04-02T00:00:00Z'),
  });
}
