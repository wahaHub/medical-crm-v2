import type { AiFollowupTrigger } from '../entities/ai-followup-trigger.entity.js';

export interface IAiFollowupTriggerRepository {
  listPendingBySession(sessionId: string, tx?: unknown): Promise<AiFollowupTrigger[]>;
  createPendingTrigger(entity: AiFollowupTrigger, tx?: unknown): Promise<AiFollowupTrigger>;
  resolvePendingTrigger(triggerId: string, tx?: unknown): Promise<AiFollowupTrigger | null>;
}
