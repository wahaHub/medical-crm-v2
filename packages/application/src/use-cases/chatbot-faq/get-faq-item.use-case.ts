import type { IChatbotFaqRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { ChatbotFaqItemDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqItemDTO } from '../../mappers/chatbot-faq.mapper.js';

export class GetFaqItemUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(id: string, actor: Actor): Promise<ChatbotFaqItemDTO> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    const entity = await this.faqRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`ChatbotFaqItem not found: ${id}`);
    }

    // HOSPITAL actors can only access FAQs belonging to their hospital
    if (actor.role === 'HOSPITAL' && entity.hospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Forbidden');
    }

    return toChatbotFaqItemDTO(entity);
  }
}
