import type { Conversation } from '../entities/conversation.entity.js';
import type { ConversationCategory } from '../enums/index.js';
import type { PaginatedResult } from '@medical-crm/utils';

export interface ConversationListQuery {
  page: number;
  limit: number;
  category?: ConversationCategory;
  caseId?: string;
}

export interface IConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findMany(query: ConversationListQuery, hospitalId?: string): Promise<PaginatedResult<Conversation>>;
  findByPatientId(patientId: string): Promise<Conversation[]>;
  save(entity: Conversation): Promise<Conversation>;
}
