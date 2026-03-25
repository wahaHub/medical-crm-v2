import type { IChatbotFaqRepository, ChatbotFaqCategoryListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { ChatbotFaqCategoryDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqCategoryDTO } from '../../mappers/chatbot-faq.mapper.js';

export class ListFaqCategoriesUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(
    query: ChatbotFaqCategoryListQuery,
    actor: Actor,
  ): Promise<ChatbotFaqCategoryDTO[]> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    const scopedQuery: ChatbotFaqCategoryListQuery = { ...query };
    if (actor.role === 'HOSPITAL') {
      scopedQuery.hospitalId = actor.hospitalId;
    } else if (actor.role === 'ADMIN') {
      // Admin only sees global categories (hospitalId=NULL)
      scopedQuery.hospitalId = null;
    }

    const result = await this.faqRepo.listCategories(scopedQuery);
    return result.map((category) => toChatbotFaqCategoryDTO(category));
  }
}
