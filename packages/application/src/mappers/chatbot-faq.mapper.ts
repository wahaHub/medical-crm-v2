import type { ChatbotFaqItem } from '@medical-crm/domain';
import type { ChatbotFaqItemDTO } from '../dtos/chatbot-faq.dto.js';

export function toChatbotFaqItemDTO(entity: ChatbotFaqItem): ChatbotFaqItemDTO {
  return {
    id: entity.id,
    category: entity.category,
    questionEn: entity.questionEn,
    questionZh: entity.questionZh,
    answerEn: entity.answerEn,
    answerZh: entity.answerZh,
    keywords: entity.keywords,
    sortOrder: entity.sortOrder,
    isActive: entity.isActive,
    hospitalId: entity.hospitalId,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
