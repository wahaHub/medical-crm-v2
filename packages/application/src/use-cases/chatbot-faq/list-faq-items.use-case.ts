import type { IChatbotFaqRepository, ChatbotFaqListQuery } from '@medical-crm/domain';
import type { ChatbotFaqItemDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqItemDTO } from '../../mappers/chatbot-faq.mapper.js';

export class ListFaqItemsUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(
    query: ChatbotFaqListQuery,
    actor: Actor,
  ): Promise<{ data: ChatbotFaqItemDTO[]; total: number; page: number; limit: number }> {
    if (actor.role !== 'ADMIN') {
      throw new Error('Forbidden: only ADMIN can list FAQ items');
    }

    const result = await this.faqRepo.findAll(query);

    return {
      data: result.data.map((e) => toChatbotFaqItemDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
