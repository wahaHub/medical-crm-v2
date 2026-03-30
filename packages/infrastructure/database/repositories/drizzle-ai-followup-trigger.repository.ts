import { and, desc, eq, sql } from 'drizzle-orm';
import type { IAiFollowupTriggerRepository } from '@medical-crm/domain';
import { AiFollowupTrigger } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { aiFollowupTriggers } from '../schema/index.js';

export class DrizzleAiFollowupTriggerRepository implements IAiFollowupTriggerRepository {
  constructor(private readonly db: CrmDb) {}

  async listPendingBySession(sessionId: string, tx?: unknown): Promise<AiFollowupTrigger[]> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiFollowupTriggers)
      .where(and(
        eq(aiFollowupTriggers.sessionId, sessionId),
        eq(aiFollowupTriggers.status, 'pending'),
      ))
      .orderBy(desc(aiFollowupTriggers.createdAt));

    return rows.map((row) => this.rowToEntity(row));
  }

  async createPendingTrigger(entity: AiFollowupTrigger, tx?: unknown): Promise<AiFollowupTrigger> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .insert(aiFollowupTriggers)
      .values({
        id: entity.id,
        sessionId: entity.sessionId,
        patientId: entity.patientId,
        triggerType: entity.triggerType,
        status: entity.status,
        dueAt: entity.dueAt.toISOString(),
        channel: entity.channel,
        reason: entity.reason,
        payload: entity.payload,
        createdAt: entity.createdAt.toISOString(),
        resolvedAt: entity.resolvedAt?.toISOString() ?? null,
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async resolvePendingTrigger(triggerId: string, tx?: unknown): Promise<AiFollowupTrigger | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiFollowupTriggers)
      .set({
        status: 'resolved',
        resolvedAt: sql`NOW()`,
      })
      .where(eq(aiFollowupTriggers.id, triggerId))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  private rowToEntity(row: typeof aiFollowupTriggers.$inferSelect): AiFollowupTrigger {
    return new AiFollowupTrigger({
      id: row.id,
      sessionId: row.sessionId,
      patientId: row.patientId ?? null,
      triggerType: row.triggerType,
      status: row.status,
      dueAt: new Date(row.dueAt),
      channel: row.channel,
      reason: row.reason,
      payload: (row.payload as Record<string, unknown> | null) ?? {},
      createdAt: new Date(row.createdAt),
      resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
    });
  }
}
