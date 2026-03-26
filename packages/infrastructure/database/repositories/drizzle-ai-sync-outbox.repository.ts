import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { IAiSyncOutboxRepository } from '@medical-crm/domain';
import { AiSyncOutbox } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { aiSyncOutbox } from '../schema/index.js';

export class DrizzleAiSyncOutboxRepository implements IAiSyncOutboxRepository {
  constructor(private readonly db: CrmDb) {}

  async enqueue(entity: AiSyncOutbox, tx?: unknown): Promise<AiSyncOutbox> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .insert(aiSyncOutbox)
      .values({
        id: entity.id,
        entityType: entity.entityType,
        entityKey: entity.entityKey,
        action: entity.action,
        attempts: entity.attempts,
        nextRetryAt: entity.nextRetryAt ? entity.nextRetryAt.toISOString() : null,
        status: entity.status,
        payload: entity.payload,
        createdAt: entity.createdAt.toISOString(),
        updatedAt: entity.updatedAt.toISOString(),
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async claimBatch(limit: number, tx?: unknown): Promise<AiSyncOutbox[]> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiSyncOutbox)
      .where(eq(aiSyncOutbox.status, 'PENDING'))
      .orderBy(asc(aiSyncOutbox.createdAt))
      .limit(limit);

    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    await db
      .update(aiSyncOutbox)
      .set({ status: 'PROCESSING', updatedAt: new Date().toISOString() })
      .where(inArray(aiSyncOutbox.id, ids));

    return rows.map((row) => this.rowToEntity({
      ...row,
      status: 'PROCESSING',
      updatedAt: new Date().toISOString(),
    }));
  }

  async markDone(id: string, tx?: unknown): Promise<void> {
    const db = (tx as CrmDb) ?? this.db;
    await db
      .update(aiSyncOutbox)
      .set({ status: 'DONE', updatedAt: new Date().toISOString() })
      .where(eq(aiSyncOutbox.id, id));
  }

  async markRetry(id: string, nextRetryAt: Date, tx?: unknown): Promise<void> {
    const db = (tx as CrmDb) ?? this.db;
    await db
      .update(aiSyncOutbox)
      .set({
        status: 'PENDING',
        nextRetryAt: nextRetryAt.toISOString(),
        attempts: sql`${aiSyncOutbox.attempts} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(aiSyncOutbox.id, id));
  }

  private rowToEntity(row: typeof aiSyncOutbox.$inferSelect): AiSyncOutbox {
    return new AiSyncOutbox({
      id: row.id,
      entityType: row.entityType,
      entityKey: row.entityKey,
      action: row.action as import('@medical-crm/domain').AiSyncAction,
      attempts: row.attempts,
      nextRetryAt: row.nextRetryAt ? new Date(row.nextRetryAt) : null,
      status: row.status as import('@medical-crm/domain').AiSyncStatus,
      payload: (row.payload as Record<string, unknown> | null) ?? {},
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
