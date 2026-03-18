import type { IChatbotFaqRepository } from '@medical-crm/domain';
import type { ChatbotFaqItemDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqItemDTO } from '../../mappers/chatbot-faq.mapper.js';

export class GetFaqItemUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(id: string, actor: Actor): Promise<ChatbotFaqItemDTO> {
    if (actor.role !== 'ADMIN') {
      throw new Error('Forbidden: only ADMIN can get FAQ items');
    }

    const entity = await this.faqRepo.findById(id);
    if (!entity) {
      throw new Error(`ChatbotFaqItem not found: ${id}`);
    }

    return toChatbotFaqItemDTO(entity);
  }
}
