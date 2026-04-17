import { eq, and, count, sql, inArray } from 'drizzle-orm';
import type { IConversationRepository, ConversationListQuery } from '@medical-crm/domain';
import { Conversation } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import type { Transaction } from '@medical-crm/domain';
import { conversations } from '../schema/index.js';
import { cases } from '../schema/index.js';

export class DrizzleConversationRepository implements IConversationRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string, tx?: Transaction): Promise<Conversation | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findMany(query: ConversationListQuery, hospitalId?: string, tx?: Transaction): Promise<PaginatedResult<Conversation>> {
    const { page, limit, category, caseId } = query;
    const db = (tx as CrmDb | undefined) ?? this.db;

    const conditions = [];
    if (category) conditions.push(eq(conversations.category, category));
    if (caseId) conditions.push(eq(conversations.caseId, caseId));
    if (hospitalId) conditions.push(eq(conversations.hospitalId, hospitalId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(conversations)
        .where(where)
        .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`)
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ total: count() })
        .from(conversations)
        .where(where),
    ]);

    const total = Number(countResult[0]?.total ?? 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: rows.map((r) => this.rowToEntity(r)),
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  async findByPatientId(patientId: string, tx?: Transaction): Promise<Conversation[]> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    // Conversations are linked to patients via cases.patientId
    const patientCaseIds = db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.patientId, patientId));

    const rows = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.caseId, patientCaseIds))
      .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`);

    return rows.map((r) => this.rowToEntity(r));
  }

  async save(entity: Conversation, tx?: Transaction): Promise<Conversation> {
    const now = new Date().toISOString();
    const db = (tx as CrmDb | undefined) ?? this.db;
    const values = {
      id: entity.id,
      caseId: entity.caseId,
      category: entity.category,
      title: entity.title,
      hospitalId: entity.hospitalId,
      assistantMode: entity.assistantMode,
      lastMessageId: entity.lastMessageId,
      lastMessageAt: entity.lastMessageAt ? entity.lastMessageAt.toISOString() : null,
      lastMessagePreview: entity.lastMessagePreview,
      lastSenderId: entity.lastSenderId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(conversations)
      .values(values)
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          caseId: values.caseId,
          category: values.category,
          title: values.title,
          hospitalId: values.hospitalId,
          assistantMode: values.assistantMode,
          lastMessageId: values.lastMessageId,
          lastMessageAt: values.lastMessageAt,
          lastMessagePreview: values.lastMessagePreview,
          lastSenderId: values.lastSenderId,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async compareAndSetAssistantMode(
    id: string,
    fromMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
    toMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
    tx?: Transaction,
  ): Promise<Conversation | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await db
      .update(conversations)
      .set({
        assistantMode: toMode,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(conversations.id, id),
        eq(conversations.assistantMode, fromMode),
      ))
      .returning();

    if (rows.length === 0) {
      return null;
    }

    return this.rowToEntity(rows[0]!);
  }

  private rowToEntity(row: typeof conversations.$inferSelect): Conversation {
    return new Conversation({
      id: row.id,
      caseId: row.caseId ?? null,
      category: row.category as import('@medical-crm/domain').ConversationCategory,
      title: row.title ?? null,
      hospitalId: row.hospitalId ?? null,
      assistantMode: row.assistantMode,
      lastMessageId: row.lastMessageId ?? null,
      lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt) : null,
      lastMessagePreview: row.lastMessagePreview ?? null,
      lastSenderId: row.lastSenderId ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
