import { desc, eq } from 'drizzle-orm';
import type { IAiChatTimelineEventRepository } from '@medical-crm/domain';
import { AiChatTimelineEvent } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { aiChatTimelineEvents } from '../schema/index.js';

export class DrizzleAiChatTimelineEventRepository implements IAiChatTimelineEventRepository {
  constructor(private readonly db: CrmDb) {}

  async listRecentBySession(sessionId: string, limit = 20, tx?: unknown): Promise<AiChatTimelineEvent[]> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiChatTimelineEvents)
      .where(eq(aiChatTimelineEvents.sessionId, sessionId))
      .orderBy(desc(aiChatTimelineEvents.createdAt))
      .limit(limit);

    return rows.map((row) => this.rowToEntity(row));
  }

  async append(entity: AiChatTimelineEvent, tx?: unknown): Promise<AiChatTimelineEvent> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .insert(aiChatTimelineEvents)
      .values({
        id: entity.id,
        sessionId: entity.sessionId,
        patientId: entity.patientId,
        eventType: entity.eventType,
        summary: entity.summary,
        payload: entity.payload,
        actor: entity.actor,
        confidence: entity.confidence,
        createdAt: entity.createdAt.toISOString(),
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  private rowToEntity(row: typeof aiChatTimelineEvents.$inferSelect): AiChatTimelineEvent {
    return new AiChatTimelineEvent({
      id: row.id,
      sessionId: row.sessionId,
      patientId: row.patientId ?? null,
      eventType: row.eventType,
      summary: row.summary,
      payload: (row.payload as Record<string, unknown> | null) ?? {},
      actor: row.actor,
      confidence: row.confidence ?? null,
      createdAt: new Date(row.createdAt),
    });
  }
}
