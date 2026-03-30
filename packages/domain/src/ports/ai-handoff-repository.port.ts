import type { AiHandoff } from '../entities/ai-handoff.entity.js';

export interface IAiHandoffRepository {
  listRecentBySession(sessionId: string, limit?: number, tx?: unknown): Promise<AiHandoff[]>;
  save(entity: AiHandoff, tx?: unknown): Promise<AiHandoff>;
  complete(handoffId: string, tx?: unknown): Promise<AiHandoff | null>;
}
