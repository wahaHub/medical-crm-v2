import type { ChatbotFaqItem, ChatbotFaqCategory } from '@medical-crm/domain';
import type { ChatbotFaqItemDTO, ChatbotFaqCategoryDTO } from '../dtos/chatbot-faq.dto.js';

function resolveAttachmentUrl(storageKey: string, signedUrls: Record<string, string>): string {
  if (
    storageKey.startsWith('http://') ||
    storageKey.startsWith('https://') ||
    storageKey.startsWith('data:')
  ) {
    return storageKey;
  }
  return signedUrls[storageKey] ?? '';
}

export function toChatbotFaqItemDTO(
  entity: ChatbotFaqItem,
  signedUrls: Record<string, string> = {},
): ChatbotFaqItemDTO {
  return {
    id: entity.id,
    category: entity.category,
    question: entity.question,
    answer: entity.answer,
    hospitalType: entity.hospitalType,
    keywords: entity.keywords,
    sortOrder: entity.sortOrder,
    isActive: entity.isActive,
    hospitalId: entity.hospitalId,
    attachments: entity.attachments.map((a) => ({
      storageKey: a.storageKey,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      url: resolveAttachmentUrl(a.storageKey, signedUrls),
    })),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toChatbotFaqCategoryDTO(entity: ChatbotFaqCategory): ChatbotFaqCategoryDTO {
  return {
    id: entity.id,
    name: entity.name,
    hospitalType: entity.hospitalType,
    hospitalId: entity.hospitalId,
    sortOrder: entity.sortOrder,
    isActive: entity.isActive,
    questionCount: entity.questionCount,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
