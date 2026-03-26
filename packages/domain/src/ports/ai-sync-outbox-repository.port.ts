import type { AiSyncOutbox } from '../entities/ai-sync-outbox.entity.js';

export interface IAiSyncOutboxRepository {
  enqueue(entity: AiSyncOutbox, tx?: unknown): Promise<AiSyncOutbox>;
  claimBatch(limit: number, tx?: unknown): Promise<AiSyncOutbox[]>;
  markDone(id: string, tx?: unknown): Promise<void>;
  markRetry(id: string, nextRetryAt: Date, tx?: unknown): Promise<void>;
  markFailed(id: string, tx?: unknown): Promise<void>;
}
