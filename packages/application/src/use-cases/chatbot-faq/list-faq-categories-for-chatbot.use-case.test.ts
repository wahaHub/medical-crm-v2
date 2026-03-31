import { describe, expect, it, vi } from 'vitest';
import { ListFaqCategoriesForChatbotUseCase } from './list-faq-categories-for-chatbot.use-case.js';

describe('ListFaqCategoriesForChatbotUseCase', () => {
  it('returns only active general categories when hospitalId is absent', async () => {
    const faqRepo = {
      listCategories: vi.fn().mockResolvedValue([
        buildCategory({ id: 'general-1', name: 'Consultation Process', hospitalId: null, sortOrder: 20 }),
        buildCategory({ id: 'general-2', name: 'Documents', hospitalId: null, sortOrder: 10 }),
      ]),
    };

    const useCase = new ListFaqCategoriesForChatbotUseCase(faqRepo as any);

    await expect(useCase.execute({ hospitalType: 'COSMETIC' })).resolves.toEqual({
      hospitalType: 'COSMETIC',
      hospitalId: null,
      categories: [
        { name: 'Documents', sortOrder: 10 },
        { name: 'Consultation Process', sortOrder: 20 },
      ],
    });

    expect(faqRepo.listCategories).toHaveBeenCalledTimes(1);
    expect(faqRepo.listCategories).toHaveBeenCalledWith({
      hospitalType: 'COSMETIC',
      hospitalId: null,
      isActive: true,
    });
  });

  it('returns the union of general and hospital-specific categories with duplicate names collapsed by lowest sort order', async () => {
    const faqRepo = {
      listCategories: vi.fn()
        .mockResolvedValueOnce([
          buildCategory({ id: 'general-1', name: 'Consultation Process', hospitalId: null, sortOrder: 20 }),
          buildCategory({ id: 'general-2', name: 'Documents', hospitalId: null, sortOrder: 40 }),
        ])
        .mockResolvedValueOnce([
          buildCategory({ id: 'hospital-1', name: 'Documents', hospitalId: 'hospital-123', sortOrder: 5 }),
          buildCategory({ id: 'hospital-2', name: 'Hospital Stay', hospitalId: 'hospital-123', sortOrder: 15 }),
        ]),
    };

    const useCase = new ListFaqCategoriesForChatbotUseCase(faqRepo as any);

    await expect(useCase.execute({
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
    })).resolves.toEqual({
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
      categories: [
        { name: 'Documents', sortOrder: 5 },
        { name: 'Hospital Stay', sortOrder: 15 },
        { name: 'Consultation Process', sortOrder: 20 },
      ],
    });

    expect(faqRepo.listCategories).toHaveBeenNthCalledWith(1, {
      hospitalType: 'COSMETIC',
      hospitalId: null,
      isActive: true,
    });
    expect(faqRepo.listCategories).toHaveBeenNthCalledWith(2, {
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
      isActive: true,
    });
  });
});

function buildCategory(overrides: {
  id: string;
  name: string;
  hospitalId: string | null;
  sortOrder: number;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    hospitalType: 'COSMETIC' as const,
    hospitalId: overrides.hospitalId,
    sortOrder: overrides.sortOrder,
    isActive: true,
    questionCount: 0,
    translations: {},
    createdAt: new Date('2026-03-31T00:00:00Z'),
    updatedAt: new Date('2026-03-31T00:00:00Z'),
  };
}
