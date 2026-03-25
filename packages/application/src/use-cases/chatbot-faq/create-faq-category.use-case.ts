import type { IChatbotFaqRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { ChatbotFaqCategoryDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqCategoryDTO } from '../../mappers/chatbot-faq.mapper.js';

export interface CreateFaqCategoryInput {
  name: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  sortOrder?: number;
  isActive?: boolean;
}

export class CreateFaqCategoryUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(input: CreateFaqCategoryInput, actor: Actor): Promise<ChatbotFaqCategoryDTO> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    const hospitalId = actor.role === 'HOSPITAL' ? actor.hospitalId : null;

    const created = await this.faqRepo.createCategory({
      name: input.name.trim(),
      hospitalType: input.hospitalType,
      hospitalId,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    });

    return toChatbotFaqCategoryDTO(created);
  }
}
