import { describe, expect, it, vi } from 'vitest';
import { ChatbotFaqItem } from '@medical-crm/domain';
import { EvaluateFaqRetrievalUseCase } from './evaluate-faq-retrieval.use-case.js';

describe('EvaluateFaqRetrievalUseCase', () => {
  it('scores a general-only query against general categories and FAQ content', async () => {
    const faqRepo = buildFaqRepo({
      categoriesByScope: {
        'COSMETIC::GENERAL': [
          buildCategory({ name: 'Medical Documents', sortOrder: 10, hospitalId: null, hospitalType: 'COSMETIC' }),
          buildCategory({ name: 'Consultation Process', sortOrder: 20, hospitalId: null, hospitalType: 'COSMETIC' }),
        ],
      },
      faqItemsByScope: {
        'COSMETIC::GENERAL': [
          buildFaq({
            id: '3f7363bc-b3ef-4aa1-a9f8-68fe639f0001',
            category: 'Medical Documents',
            question: 'What documents should I prepare before consultation?',
            keywords: ['documents', 'records', 'consultation'],
            hospitalType: 'COSMETIC',
          }),
          buildFaq({
            id: '3f7363bc-b3ef-4aa1-a9f8-68fe639f0002',
            category: 'Consultation Process',
            question: 'How long does the consultation review usually take?',
            keywords: ['consultation', 'review', 'timeline'],
            hospitalType: 'COSMETIC',
          }),
        ],
      },
    });

    const useCase = new EvaluateFaqRetrievalUseCase(faqRepo as any);
    const result = await useCase.execute({
      queryId: 'eval-1',
      hospitalType: 'COSMETIC',
      query: 'What documents do I need before the consultation and how long does the review take?',
      expectedScope: 'GENERAL_ONLY',
      expectedCategories: ['Medical Documents', 'Consultation Process'],
      expectedHospitalId: null,
    });

    expect(result.actualScope).toBe('GENERAL_ONLY');
    expect(result.activeHospitalId).toBeNull();
    expect(result.actualCategories).toHaveLength(2);
    expect(new Set(result.actualCategories)).toEqual(new Set(['Medical Documents', 'Consultation Process']));
    expect(result.pass).toBe(true);
  });

  it('includes hospital-scoped category lists and marks hospital-aware scope when page context is present', async () => {
    const faqRepo = buildFaqRepo({
      categoriesByScope: {
        'COSMETIC::GENERAL': [
          buildCategory({ name: 'Medical Documents', sortOrder: 20, hospitalId: null, hospitalType: 'COSMETIC' }),
        ],
        'COSMETIC::hospital-123': [
          buildCategory({
            name: 'Hospital Review Requirements',
            sortOrder: 10,
            hospitalId: 'hospital-123',
            hospitalType: 'COSMETIC',
          }),
        ],
      },
      faqItemsByScope: {
        'COSMETIC::GENERAL': [
          buildFaq({
            id: '3f7363bc-b3ef-4aa1-a9f8-68fe639f0011',
            category: 'Medical Documents',
            question: 'Which medical records are usually required?',
            keywords: ['documents', 'records'],
            hospitalType: 'COSMETIC',
          }),
        ],
        'COSMETIC::hospital-123': [
          buildFaq({
            id: '3f7363bc-b3ef-4aa1-a9f8-68fe639f0012',
            category: 'Hospital Review Requirements',
            question: 'This hospital requires CT scans before review.',
            keywords: ['review', 'requirements', 'ct', 'scan'],
            hospitalId: 'hospital-123',
            hospitalType: 'COSMETIC',
          }),
        ],
      },
    });

    const useCase = new EvaluateFaqRetrievalUseCase(faqRepo as any);
    const result = await useCase.execute({
      hospitalType: 'COSMETIC',
      query: 'What does this hospital need before review?',
      expectedScope: 'HOSPITAL_AWARE',
      expectedCategories: ['Hospital Review Requirements'],
      expectedHospitalId: 'hospital-123',
      pageContext: {
        type: 'HOSPITAL_DETAIL',
        hospitalId: 'hospital-123',
      },
    });

    expect(result.actualScope).toBe('HOSPITAL_AWARE');
    expect(result.activeHospitalId).toBe('hospital-123');
    expect(result.categoryListSourceUsed).toBe('GENERAL_PLUS_HOSPITAL');
    expect(result.actualCategories).toContain('Hospital Review Requirements');
    expect(result.pass).toBe(true);
  });

  it('falls back to a stable category when lexical signals are weak', async () => {
    const faqRepo = buildFaqRepo({
      categoriesByScope: {
        'REGULAR::GENERAL': [
          buildCategory({ name: 'Case Review Process', sortOrder: 10, hospitalId: null, hospitalType: 'REGULAR' }),
          buildCategory({
            name: 'Medical Records and Imaging',
            sortOrder: 20,
            hospitalId: null,
            hospitalType: 'REGULAR',
          }),
        ],
      },
      faqItemsByScope: {
        'REGULAR::GENERAL': [],
      },
    });

    const useCase = new EvaluateFaqRetrievalUseCase(faqRepo as any);
    const result = await useCase.execute({
      hospitalType: 'REGULAR',
      query: 'hello there',
    });

    expect(result.actualCategories).toEqual(['Case Review Process']);
    expect(result.pass).toBeNull();
  });
});

function buildFaqRepo(input: {
  categoriesByScope: Record<string, ReturnType<typeof buildCategory>[]>;
  faqItemsByScope: Record<string, ChatbotFaqItem[]>;
}) {
  return {
    listCategories: vi.fn(async (query: { hospitalType?: 'REGULAR' | 'COSMETIC'; hospitalId?: string | null }) => {
      const key = `${query.hospitalType}::${query.hospitalId ?? 'GENERAL'}`;
      return input.categoriesByScope[key] ?? [];
    }),
    findAll: vi.fn(async (query: { hospitalType?: 'REGULAR' | 'COSMETIC'; hospitalId?: string | null }) => {
      const key = `${query.hospitalType}::${query.hospitalId ?? 'GENERAL'}`;
      return {
        data: input.faqItemsByScope[key] ?? [],
        total: (input.faqItemsByScope[key] ?? []).length,
      };
    }),
  };
}

function buildCategory(overrides: {
  name: string;
  sortOrder: number;
  hospitalId: string | null;
  hospitalType: 'REGULAR' | 'COSMETIC';
}) {
  return {
    id: `${overrides.name}:${overrides.hospitalId ?? 'general'}`,
    name: overrides.name,
    hospitalType: overrides.hospitalType,
    hospitalId: overrides.hospitalId,
    sortOrder: overrides.sortOrder,
    isActive: true,
    questionCount: 0,
    translations: {},
    createdAt: new Date('2026-04-03T00:00:00Z'),
    updatedAt: new Date('2026-04-03T00:00:00Z'),
  };
}

function buildFaq(overrides: {
  id: string;
  category: string;
  question: string;
  keywords: string[];
  hospitalType: 'REGULAR' | 'COSMETIC';
  hospitalId?: string | null;
}) {
  return new ChatbotFaqItem({
    id: overrides.id,
    category: overrides.category,
    question: overrides.question,
    answer: 'Seed answer',
    hospitalType: overrides.hospitalType,
    keywords: overrides.keywords,
    sortOrder: 10,
    isActive: true,
    hospitalId: overrides.hospitalId ?? null,
    attachments: [],
    createdAt: new Date('2026-04-03T00:00:00Z'),
    updatedAt: new Date('2026-04-03T00:00:00Z'),
  });
}
