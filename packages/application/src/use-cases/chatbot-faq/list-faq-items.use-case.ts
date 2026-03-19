import type { IChatbotFaqRepository, ChatbotFaqListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { ChatbotFaqItemDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqItemDTO } from '../../mappers/chatbot-faq.mapper.js';

export class ListFaqItemsUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(
    query: ChatbotFaqListQuery,
    actor: Actor,
  ): Promise<{ data: ChatbotFaqItemDTO[]; total: number; page: number; limit: number }> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    // HOSPITAL actors only see their own hospital's FAQs
    const scopedQuery: ChatbotFaqListQuery =
      actor.role === 'HOSPITAL'
        ? { ...query, hospitalId: actor.hospitalId }
        : query;

    const result = await this.faqRepo.findAll(scopedQuery);

    return {
      data: result.data.map((e) => toChatbotFaqItemDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
