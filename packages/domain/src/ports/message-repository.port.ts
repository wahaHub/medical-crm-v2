import type { Message } from '../entities/message.entity.js';
import type { PaginatedResult } from '@medical-crm/utils';

export interface MessageListQuery {
  page: number;
  limit: number;
}

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversationId(conversationId: string, query: MessageListQuery): Promise<PaginatedResult<Message>>;
  findPendingReview(): Promise<Message[]>;
  save(entity: Message): Promise<Message>;
  delete(id: string): Promise<void>;
}
