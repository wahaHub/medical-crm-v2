import type { IChatbotFaqRepository } from '@medical-crm/domain';
import { ChatbotFaqItem } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { ChatbotFaqItemDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqItemDTO } from '../../mappers/chatbot-faq.mapper.js';

export interface CreateFaqItemInput {
  category: string;
  questionEn: string;
  questionZh: string;
  answerEn: string;
  answerZh: string;
  keywords?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

export class CreateFaqItemUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(input: CreateFaqItemInput, actor: Actor): Promise<ChatbotFaqItemDTO> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    // Derive hospitalId from actor — never accept from input
    const hospitalId = actor.role === 'HOSPITAL' ? actor.hospitalId : null;

    const entity = new ChatbotFaqItem({
      id: generateId(),
      category: input.category,
      questionEn: input.questionEn,
      questionZh: input.questionZh,
      answerEn: input.answerEn,
      answerZh: input.answerZh,
      keywords: input.keywords ?? [],
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      hospitalId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.faqRepo.save(entity);
    return toChatbotFaqItemDTO(saved);
  }
}
