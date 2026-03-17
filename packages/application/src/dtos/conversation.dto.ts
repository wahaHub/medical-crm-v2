import type {
  ConversationCategory,
  MessageType,
  ModerationStatus,
  Attachment,
} from '@medical-crm/domain';

export interface MessageAttachmentDTO extends Attachment {
  name: string;
  type: string;
  size: number;
  url: string;
}

export interface ConversationDTO {
  id: string;
  caseId: string | null;
  category: ConversationCategory;
  title: string | null;
  hospitalId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  originalLanguage: string | null;
  translatedContent: string | null;
  messageType: MessageType;
  moderationStatus: ModerationStatus;
  attachments: MessageAttachmentDTO[];
  aiSummary: string | null;
  createdAt: string;
}
