import { desc, eq, sql } from 'drizzle-orm';
import type { IAiHandoffRepository } from '@medical-crm/domain';
import { AiHandoff } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { aiHandoffs } from '../schema/index.js';

export class DrizzleAiHandoffRepository implements IAiHandoffRepository {
  constructor(private readonly db: CrmDb) {}

  async listRecentBySession(sessionId: string, limit = 20, tx?: unknown): Promise<AiHandoff[]> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiHandoffs)
      .where(eq(aiHandoffs.sessionId, sessionId))
      .orderBy(desc(aiHandoffs.createdAt))
      .limit(limit);

    return rows.map((row) => this.rowToEntity(row));
  }

  async save(entity: AiHandoff, tx?: unknown): Promise<AiHandoff> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .insert(aiHandoffs)
      .values({
        id: entity.id,
        sessionId: entity.sessionId,
        patientId: entity.patientId,
        supportTicketId: entity.supportTicketId,
        handoffType: entity.handoffType,
        priority: entity.priority,
        reasonCode: entity.reasonCode,
        brief: entity.brief,
        status: entity.status,
        assignedTo: entity.assignedTo,
        createdAt: entity.createdAt.toISOString(),
        completedAt: entity.completedAt?.toISOString() ?? null,
      })
      .onConflictDoUpdate({
        target: aiHandoffs.id,
        set: {
          supportTicketId: entity.supportTicketId,
          handoffType: entity.handoffType,
          priority: entity.priority,
          reasonCode: entity.reasonCode,
          brief: entity.brief,
          status: entity.status,
          assignedTo: entity.assignedTo,
          completedAt: entity.completedAt?.toISOString() ?? null,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async complete(handoffId: string, tx?: unknown): Promise<AiHandoff | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiHandoffs)
      .set({
        status: 'completed',
        completedAt: sql`NOW()`,
      })
      .where(eq(aiHandoffs.id, handoffId))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  private rowToEntity(row: typeof aiHandoffs.$inferSelect): AiHandoff {
    return new AiHandoff({
      id: row.id,
      sessionId: row.sessionId,
      patientId: row.patientId ?? null,
      supportTicketId: row.supportTicketId ?? null,
      handoffType: row.handoffType,
      priority: row.priority,
      reasonCode: row.reasonCode,
      brief: (row.brief as Record<string, unknown> | null) ?? {},
      status: row.status,
      assignedTo: row.assignedTo ?? null,
      createdAt: new Date(row.createdAt),
      completedAt: row.completedAt ? new Date(row.completedAt) : null,
    });
  }
}
