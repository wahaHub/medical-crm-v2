import type { Attachment, Message, MessageDeliveryStatus } from '../entities/message.entity.js';
import type { PaginatedResult } from '@medical-crm/utils';
import type { Transaction } from './transaction-runner.port.js';

export interface MessageListQuery {
  page: number;
  limit: number;
}

export interface IMessageRepository {
  findById(id: string, tx?: Transaction): Promise<Message | null>;
  findByConversationId(conversationId: string, query: MessageListQuery, tx?: Transaction): Promise<PaginatedResult<Message>>;
  findByConversationClientMessageId(conversationId: string, clientMessageId: string, tx?: Transaction): Promise<Message | null>;
  findPendingReview(tx?: Transaction): Promise<Message[]>;
  createPendingAttachmentMessage(input: {
    id: string;
    conversationId: string;
    patientId: string;
    clientMessageId: string;
    content: string;
    locale?: string | null;
    attachments: Attachment[];
    metadata: Record<string, unknown>;
    createdAt: Date;
  }, tx?: Transaction): Promise<Message>;
  claimDeliveryStatus(
    messageId: string,
    fromStatuses: MessageDeliveryStatus[],
    toStatus: MessageDeliveryStatus,
    metadataPatch?: Record<string, unknown>,
    tx?: Transaction,
  ): Promise<Message | null>;
  updateDeliveryStatus(
    messageId: string,
    status: MessageDeliveryStatus,
    metadataPatch?: Record<string, unknown>,
    tx?: Transaction,
  ): Promise<Message>;
  updateMetadata(messageId: string, metadataPatch: Record<string, unknown>, tx?: Transaction): Promise<Message>;
  save(entity: Message, tx?: Transaction): Promise<Message>;
  delete(id: string, tx?: Transaction): Promise<void>;
}
