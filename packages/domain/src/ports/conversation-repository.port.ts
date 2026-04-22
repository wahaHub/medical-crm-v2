import type { Conversation } from '../entities/conversation.entity.js';
import type { ConversationCategory } from '../enums/index.js';
import type { PaginatedResult } from '@medical-crm/utils';
import type { Transaction } from './transaction-runner.port.js';

export interface ConversationListQuery {
  page: number;
  limit: number;
  category?: ConversationCategory;
  caseId?: string;
}

export interface IConversationRepository {
  findById(id: string, tx?: Transaction): Promise<Conversation | null>;
  findMany(query: ConversationListQuery, hospitalId?: string, tx?: Transaction): Promise<PaginatedResult<Conversation>>;
  findByPatientId(patientId: string, tx?: Transaction): Promise<Conversation[]>;
  findOrCreateAdminPatientConversation(entity: Conversation, tx?: Transaction): Promise<Conversation>;
  findOrCreateHospitalPatientConversation(entity: Conversation, tx?: Transaction): Promise<Conversation>;
  save(entity: Conversation, tx?: Transaction): Promise<Conversation>;
  findByIdForUpdate?(id: string, tx?: Transaction): Promise<Conversation | null>;
  findAdminPatientByCaseId?(caseId: string, tx?: Transaction): Promise<Conversation | null>;
  compareAndSetAssistantMode?(
    id: string,
    fromMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
    toMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
    tx?: Transaction,
  ): Promise<Conversation | null>;
}
