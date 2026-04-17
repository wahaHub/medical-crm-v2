import type { ConversationCategory } from '../enums/index.js';

export interface ConversationProps {
  id: string;
  caseId: string | null;
  category: ConversationCategory;
  title: string | null;
  hospitalId: string | null;
  lastMessageId: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Conversation {
  readonly id: string;
  caseId: string | null;
  category: ConversationCategory;
  title: string | null;
  hospitalId: string | null;
  lastMessageId: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: ConversationProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.category = props.category;
    this.title = props.title;
    this.hospitalId = props.hospitalId;
    this.lastMessageId = props.lastMessageId;
    this.lastMessageAt = props.lastMessageAt;
    this.lastMessagePreview = props.lastMessagePreview;
    this.lastSenderId = props.lastSenderId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  updateLastMessage(message: {
    id: string;
    content: string;
    senderId: string | null;
    createdAt: Date;
  }): void {
    this.lastMessageId = message.id;
    this.lastMessageAt = message.createdAt;
    this.lastMessagePreview = message.content.slice(0, 100);
    this.lastSenderId = message.senderId;
    this.updatedAt = new Date();
  }
}
