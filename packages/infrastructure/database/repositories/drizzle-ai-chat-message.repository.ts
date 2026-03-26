import { desc, eq } from 'drizzle-orm';
import type { IAiChatMessageRepository } from '@medical-crm/domain';
import { AiChatMessage } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { aiChatMessages } from '../schema/index.js';

export class DrizzleAiChatMessageRepository implements IAiChatMessageRepository {
  constructor(private readonly db: CrmDb) {}

  async create(entity: AiChatMessage, tx?: unknown): Promise<AiChatMessage> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .insert(aiChatMessages)
      .values({
        id: entity.id,
        sessionId: entity.sessionId,
        role: entity.role,
        content: entity.content,
        intent: entity.intent,
        riskLevel: entity.riskLevel,
        canAnswer: entity.canAnswer,
        nextAction: entity.nextAction,
        citations: entity.citations,
        metadata: entity.metadata,
        createdAt: entity.createdAt.toISOString(),
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async listBySession(sessionId: string, limit = 100, tx?: unknown): Promise<AiChatMessage[]> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId))
      .orderBy(desc(aiChatMessages.createdAt))
      .limit(limit);

    return rows.map((row) => this.rowToEntity(row));
  }

  private rowToEntity(row: typeof aiChatMessages.$inferSelect): AiChatMessage {
    return new AiChatMessage({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role as import('@medical-crm/domain').AiChatRole,
      content: row.content,
      intent: (row.intent as import('@medical-crm/domain').AiChatIntent | null) ?? null,
      riskLevel: (row.riskLevel as import('@medical-crm/domain').AiChatRiskLevel | null) ?? null,
      canAnswer: row.canAnswer ?? null,
      nextAction: (row.nextAction as import('@medical-crm/domain').AiChatNextAction | null) ?? null,
      citations: ((row.citations as unknown[]) ?? []) as import('@medical-crm/domain').AiChatCitation[],
      metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      createdAt: new Date(row.createdAt),
    });
  }
}
