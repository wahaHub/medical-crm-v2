import { eq, sql } from 'drizzle-orm';
import type { IAiChatSessionRepository } from '@medical-crm/domain';
import { AiChatSession } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { aiChatSessions } from '../schema/index.js';

export class DrizzleAiChatSessionRepository implements IAiChatSessionRepository {
  constructor(private readonly db: CrmDb) {}

  async findBySessionId(sessionId: string, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.sessionId, sessionId))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async findByDifyConversationId(difyConversationId: string, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.difyConversationId, difyConversationId))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async save(entity: AiChatSession, tx?: unknown): Promise<AiChatSession> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .insert(aiChatSessions)
      .values({
        id: entity.id,
        sessionId: entity.sessionId,
        sessionSecretHash: entity.sessionSecretHash,
        difyConversationId: entity.difyConversationId,
        patientId: entity.patientId,
        hospitalType: entity.hospitalType,
        status: entity.status,
        createdAt: entity.createdAt.toISOString(),
        updatedAt: entity.updatedAt.toISOString(),
      })
      .onConflictDoUpdate({
        target: aiChatSessions.id,
        set: {
          sessionSecretHash: entity.sessionSecretHash,
          difyConversationId: entity.difyConversationId,
          patientId: entity.patientId,
          hospitalType: entity.hospitalType,
          status: entity.status,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async attachPatient(sessionId: string, patientId: string, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiChatSessions)
      .set({ patientId, updatedAt: sql`NOW()` })
      .where(eq(aiChatSessions.sessionId, sessionId))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async updateStatus(sessionId: string, status: import('@medical-crm/domain').AiChatSessionStatus, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiChatSessions)
      .set({ status, updatedAt: sql`NOW()` })
      .where(eq(aiChatSessions.sessionId, sessionId))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  private rowToEntity(row: typeof aiChatSessions.$inferSelect): AiChatSession {
    return new AiChatSession({
      id: row.id,
      sessionId: row.sessionId,
      sessionSecretHash: row.sessionSecretHash ?? null,
      difyConversationId: row.difyConversationId ?? null,
      patientId: row.patientId ?? null,
      hospitalType: row.hospitalType as import('@medical-crm/domain').HospitalType,
      status: row.status as import('@medical-crm/domain').AiChatSessionStatus,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
