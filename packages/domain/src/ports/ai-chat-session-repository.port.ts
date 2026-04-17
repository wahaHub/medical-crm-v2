import type { AiChatSession } from '../entities/ai-chat-session.entity.js';
import type { AiChatSessionStatus } from '../enums/index.js';
import type { PatientSite } from './patient-repository.port.js';

export interface IAiChatSessionRepository {
  findBySessionId(sessionId: string, site: PatientSite, tx?: unknown): Promise<AiChatSession | null>;
  findByDifyConversationId(difyConversationId: string, tx?: unknown): Promise<AiChatSession | null>;
  save(entity: AiChatSession, tx?: unknown): Promise<AiChatSession>;
  setDifyConversationId?(sessionId: string, site: PatientSite, difyConversationId: string, tx?: unknown): Promise<AiChatSession | null>;
  attachPatient(sessionId: string, site: PatientSite, patientId: string, tx?: unknown): Promise<AiChatSession | null>;
  updateStatus(sessionId: string, site: PatientSite, status: AiChatSessionStatus, tx?: unknown): Promise<AiChatSession | null>;
  patchStatus(sessionId: string, site: PatientSite, patch: Partial<AiChatSession['statusSnapshot']>, tx?: unknown): Promise<AiChatSession | null>;
}
