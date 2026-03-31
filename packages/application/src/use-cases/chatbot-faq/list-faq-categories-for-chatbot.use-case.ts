import type { IChatbotFaqRepository } from '@medical-crm/domain';

export interface ListFaqCategoriesForChatbotInput {
  hospitalType: 'REGULAR' | 'COSMETIC';
  hospitalId?: string;
}

export interface ListFaqCategoriesForChatbotResult {
  hospitalType: 'REGULAR' | 'COSMETIC';
  hospitalId: string | null;
  categories: Array<{
    name: string;
    sortOrder: number;
  }>;
}

export class ListFaqCategoriesForChatbotUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(input: ListFaqCategoriesForChatbotInput): Promise<ListFaqCategoriesForChatbotResult> {
    const generalCategories = await this.faqRepo.listCategories({
      hospitalType: input.hospitalType,
      hospitalId: null,
      isActive: true,
    });

    const hospitalCategories = input.hospitalId
      ? await this.faqRepo.listCategories({
        hospitalType: input.hospitalType,
        hospitalId: input.hospitalId,
        isActive: true,
      })
      : [];

    const deduped = new Map<string, { name: string; sortOrder: number }>();
    for (const category of [...generalCategories, ...hospitalCategories]) {
      const existing = deduped.get(category.name);
      if (!existing || category.sortOrder < existing.sortOrder) {
        deduped.set(category.name, {
          name: category.name,
          sortOrder: category.sortOrder,
        });
      }
    }

    return {
      hospitalType: input.hospitalType,
      hospitalId: input.hospitalId ?? null,
      categories: [...deduped.values()].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.name.localeCompare(b.name);
      }),
    };
  }
}
