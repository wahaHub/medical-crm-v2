import type { Conversation, Message } from '@medical-crm/domain';
import type { ConversationDTO, MessageDTO } from '../dtos/conversation.dto.js';

export function toConversationDTO(entity: Conversation): ConversationDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    category: entity.category,
    title: entity.title,
    hospitalId: entity.hospitalId,
    lastMessageAt: entity.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: entity.lastMessagePreview,
    lastSenderId: entity.lastSenderId,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toMessageDTO(entity: Message): MessageDTO {
  return {
    id: entity.id,
    conversationId: entity.conversationId,
    senderId: entity.senderId,
    content: entity.content,
    originalLanguage: entity.originalLanguage,
    translatedContent: entity.translatedContent,
    messageType: entity.messageType,
    moderationStatus: entity.moderationStatus,
    attachments: entity.attachments,
    aiSummary: entity.aiSummary,
    createdAt: entity.createdAt.toISOString(),
  };
}
