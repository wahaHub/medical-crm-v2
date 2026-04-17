import type { Attachment, Conversation, Message } from '@medical-crm/domain';
import type { ConversationDTO, MessageAttachmentDTO, MessageDTO } from '../dtos/conversation.dto.js';

export function toConversationDTO(entity: Conversation): ConversationDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    category: entity.category,
    title: entity.title,
    hospitalId: entity.hospitalId,
    assistantMode: entity.assistantMode,
    lastMessageAt: entity.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: entity.lastMessagePreview,
    lastSenderId: entity.lastSenderId,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function resolveAttachmentUrl(
  storageKey: string,
  signedUrls: Record<string, string>,
): string {
  if (storageKey.startsWith('http://') || storageKey.startsWith('https://') || storageKey.startsWith('data:')) {
    return storageKey;
  }
  return signedUrls[storageKey] ?? '';
}

export function toMessageAttachmentDTO(
  attachment: Attachment,
  signedUrls: Record<string, string> = {},
): MessageAttachmentDTO {
  return {
    ...attachment,
    name: attachment.fileName,
    type: attachment.mimeType,
    size: attachment.fileSize,
    url: resolveAttachmentUrl(attachment.storageKey, signedUrls),
  };
}

export function toMessageDTO(
  entity: Message,
  signedUrls: Record<string, string> = {},
): MessageDTO {
  return {
    id: entity.id,
    conversationId: entity.conversationId,
    senderId: entity.senderId,
    senderRole: entity.senderRole,
    senderName: entity.senderName,
    content: entity.content,
    originalLanguage: entity.originalLanguage,
    translatedContent: entity.translatedContent,
    messageType: entity.messageType,
    moderationStatus: entity.moderationStatus,
    attachments: entity.attachments.map((attachment) =>
      toMessageAttachmentDTO(attachment, signedUrls),
    ),
    aiSummary: entity.aiSummary,
    createdAt: entity.createdAt.toISOString(),
  };
}
