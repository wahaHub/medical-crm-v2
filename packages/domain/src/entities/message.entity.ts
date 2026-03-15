import type { MessageType, ModerationStatus } from '../enums/index.js';
import { ValidationError } from '@medical-crm/utils';

export type Attachment = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
};

export interface MessageProps {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  originalLanguage: string | null;
  translatedContent: string | null;
  messageType: MessageType;
  moderationStatus: ModerationStatus;
  attachments: Attachment[];
  aiSummary: string | null;
  createdAt: Date;
}

export class Message {
  readonly id: string;
  conversationId: string;
  senderId: string;
  content: string;
  originalLanguage: string | null;
  translatedContent: string | null;
  messageType: MessageType;
  moderationStatus: ModerationStatus;
  attachments: Attachment[];
  aiSummary: string | null;
  createdAt: Date;

  constructor(props: MessageProps) {
    this.id = props.id;
    this.conversationId = props.conversationId;
    this.senderId = props.senderId;
    this.content = props.content;
    this.originalLanguage = props.originalLanguage;
    this.translatedContent = props.translatedContent;
    this.messageType = props.messageType;
    this.moderationStatus = props.moderationStatus;
    this.attachments = props.attachments;
    this.aiSummary = props.aiSummary;
    this.createdAt = props.createdAt;
  }

  approve(): void {
    if (this.moderationStatus !== 'REVIEW') {
      throw new ValidationError(
        `Cannot approve message with status ${this.moderationStatus}`,
      );
    }
    this.moderationStatus = 'ALLOWED';
  }

  reject(): void {
    if (this.moderationStatus !== 'REVIEW') {
      throw new ValidationError(
        `Cannot reject message with status ${this.moderationStatus}`,
      );
    }
    this.moderationStatus = 'BLOCKED';
  }

  setTranslation(translated: string): void {
    this.translatedContent = translated;
  }

  setAiSummary(summary: string): void {
    this.aiSummary = summary;
  }
}
