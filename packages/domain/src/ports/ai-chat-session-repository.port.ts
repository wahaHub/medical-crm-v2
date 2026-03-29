import type { AiChatSession } from '../entities/ai-chat-session.entity.js';
import type { AiChatSessionStatus } from '../enums/index.js';

export interface IAiChatSessionRepository {
  findBySessionId(sessionId: string, tx?: unknown): Promise<AiChatSession | null>;
  findByDifyConversationId(difyConversationId: string, tx?: unknown): Promise<AiChatSession | null>;
  save(entity: AiChatSession, tx?: unknown): Promise<AiChatSession>;
  attachPatient(sessionId: string, patientId: string, tx?: unknown): Promise<AiChatSession | null>;
  updateStatus(sessionId: string, status: AiChatSessionStatus, tx?: unknown): Promise<AiChatSession | null>;
  patchStatus(sessionId: string, patch: Partial<AiChatSession['statusSnapshot']>, tx?: unknown): Promise<AiChatSession | null>;
}
