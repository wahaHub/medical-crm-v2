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
        resolvedIntent: entity.resolvedIntent,
        riskLevel: entity.riskLevel,
        canAnswer: entity.canAnswer,
        nextAction: entity.nextAction,
        secondaryAction: entity.secondaryAction,
        responseMode: entity.responseMode,
        citations: entity.citations,
        metadata: entity.metadata,
        reasonCodes: entity.reasonCodes,
        shortlist: entity.shortlist,
        writebackStatus: entity.writebackStatus,
        toolTrace: entity.toolTrace,
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

  async listRecentBySession(sessionId: string, limit = 100, tx?: unknown): Promise<AiChatMessage[]> {
    return this.listBySession(sessionId, limit, tx);
  }

  async updateMessage(
    messageId: string,
    patch: {
      content?: string;
      intent?: import('@medical-crm/domain').AiChatIntent | null;
      resolvedIntent?: string | null;
      riskLevel?: import('@medical-crm/domain').AiChatRiskLevel | null;
      canAnswer?: boolean | null;
      nextAction?: import('@medical-crm/domain').AiChatNextAction | null;
      secondaryAction?: string | null;
      responseMode?: string | null;
      citations?: import('@medical-crm/domain').AiChatCitation[];
      metadata?: Record<string, unknown>;
      reasonCodes?: string[];
      shortlist?: Array<Record<string, unknown>>;
      writebackStatus?: string;
      toolTrace?: Array<Record<string, unknown>>;
    },
    tx?: unknown,
  ): Promise<AiChatMessage | null> {
    const db = (tx as CrmDb) ?? this.db;
    const existing = await db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.id, messageId))
      .limit(1);

    const row = existing[0];
    if (!row) {
      return null;
    }

    const mergedMetadata = patch.metadata === undefined
      ? ((row.metadata as Record<string, unknown> | null) ?? {})
      : {
          ...((row.metadata as Record<string, unknown> | null) ?? {}),
          ...patch.metadata,
        };

    const updated = await db
      .update(aiChatMessages)
      .set({
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.intent !== undefined ? { intent: patch.intent } : {}),
        ...(patch.resolvedIntent !== undefined ? { resolvedIntent: patch.resolvedIntent } : {}),
        ...(patch.riskLevel !== undefined ? { riskLevel: patch.riskLevel } : {}),
        ...(patch.canAnswer !== undefined ? { canAnswer: patch.canAnswer } : {}),
        ...(patch.nextAction !== undefined ? { nextAction: patch.nextAction } : {}),
        ...(patch.secondaryAction !== undefined ? { secondaryAction: patch.secondaryAction } : {}),
        ...(patch.responseMode !== undefined ? { responseMode: patch.responseMode } : {}),
        ...(patch.citations !== undefined ? { citations: patch.citations } : {}),
        ...(patch.reasonCodes !== undefined ? { reasonCodes: patch.reasonCodes } : {}),
        ...(patch.shortlist !== undefined ? { shortlist: patch.shortlist } : {}),
        ...(patch.toolTrace !== undefined ? { toolTrace: patch.toolTrace } : {}),
        metadata: mergedMetadata,
        ...(patch.writebackStatus !== undefined ? { writebackStatus: patch.writebackStatus } : {}),
      })
      .where(eq(aiChatMessages.id, messageId))
      .returning();

    return updated[0] ? this.rowToEntity(updated[0]) : null;
  }

  async updateWritebackMetadata(
    messageId: string,
    patch: {
      metadata?: Record<string, unknown>;
      writebackStatus?: string;
    },
    tx?: unknown,
  ): Promise<AiChatMessage | null> {
    return this.updateMessage(messageId, patch, tx);
  }

  async deleteById(messageId: string, tx?: unknown): Promise<boolean> {
    const db = (tx as CrmDb) ?? this.db;
    const deleted = await db
      .delete(aiChatMessages)
      .where(eq(aiChatMessages.id, messageId))
      .returning({ id: aiChatMessages.id });

    return deleted.length > 0;
  }

  private rowToEntity(row: typeof aiChatMessages.$inferSelect): AiChatMessage {
    return new AiChatMessage({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role as import('@medical-crm/domain').AiChatRole,
      content: row.content,
      intent: (row.intent as import('@medical-crm/domain').AiChatIntent | null) ?? null,
      resolvedIntent: row.resolvedIntent ?? null,
      riskLevel: (row.riskLevel as import('@medical-crm/domain').AiChatRiskLevel | null) ?? null,
      canAnswer: row.canAnswer ?? null,
      nextAction: (row.nextAction as import('@medical-crm/domain').AiChatNextAction | null) ?? null,
      secondaryAction: row.secondaryAction ?? null,
      responseMode: row.responseMode ?? null,
      citations: ((row.citations as unknown[]) ?? []) as import('@medical-crm/domain').AiChatCitation[],
      reasonCodes: ((row.reasonCodes as unknown[]) ?? []) as string[],
      shortlist: ((row.shortlist as unknown[]) ?? []) as Array<Record<string, unknown>>,
      writebackStatus: row.writebackStatus,
      toolTrace: ((row.toolTrace as unknown[]) ?? []) as Array<Record<string, unknown>>,
      metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      createdAt: new Date(row.createdAt),
    });
  }
}
