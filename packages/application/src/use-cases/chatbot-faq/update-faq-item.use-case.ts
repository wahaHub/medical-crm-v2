import type { IChatbotFaqRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { ChatbotFaqItemDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqItemDTO } from '../../mappers/chatbot-faq.mapper.js';

export interface UpdateFaqItemInput {
  category?: string;
  questionEn?: string;
  questionZh?: string;
  answerEn?: string;
  answerZh?: string;
  keywords?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

export class UpdateFaqItemUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(id: string, input: UpdateFaqItemInput, actor: Actor): Promise<ChatbotFaqItemDTO> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    const entity = await this.faqRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`ChatbotFaqItem not found: ${id}`);
    }

    // HOSPITAL actors can only update FAQs belonging to their hospital
    if (actor.role === 'HOSPITAL' && entity.hospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Forbidden');
    }

    if (input.category !== undefined) entity.category = input.category;
    if (input.questionEn !== undefined) entity.questionEn = input.questionEn;
    if (input.questionZh !== undefined) entity.questionZh = input.questionZh;
    if (input.answerEn !== undefined) entity.answerEn = input.answerEn;
    if (input.answerZh !== undefined) entity.answerZh = input.answerZh;
    if (input.keywords !== undefined) entity.keywords = input.keywords;
    if (input.sortOrder !== undefined) entity.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) entity.isActive = input.isActive;
    entity.updatedAt = new Date();

    const saved = await this.faqRepo.save(entity);
    return toChatbotFaqItemDTO(saved);
  }
}
