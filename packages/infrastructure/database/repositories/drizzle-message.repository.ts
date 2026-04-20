import { eq, count, sql, inArray } from 'drizzle-orm';
import type { IMessageRepository, MessageListQuery, Attachment, Transaction } from '@medical-crm/domain';
import { Message } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import { messages, users } from '../schema/index.js';
import { withTransientDatabaseRetry } from '../transient-db-retry.js';

export class DrizzleMessageRepository implements IMessageRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string, tx?: Transaction): Promise<Message | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await withTransientDatabaseRetry(
      'load message by id',
      () => db
        .select({
          message: messages,
          senderRole: users.role,
          senderName: users.name,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.id, id))
        .limit(1),
    );

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByConversationId(
    conversationId: string,
    query: MessageListQuery,
    tx?: Transaction,
  ): Promise<PaginatedResult<Message>> {
    const { page, limit } = query;
    const db = (tx as CrmDb | undefined) ?? this.db;

    const [rows, countResult] = await withTransientDatabaseRetry(
      'list messages by conversation id',
      () => Promise.all([
        db
          .select({
            message: messages,
            senderRole: users.role,
            senderName: users.name,
          })
          .from(messages)
          .leftJoin(users, eq(messages.senderId, users.id))
          .where(eq(messages.conversationId, conversationId))
          .orderBy(sql`${messages.createdAt} DESC`)
          .limit(limit)
          .offset((page - 1) * limit),
        db
          .select({ total: count() })
          .from(messages)
          .where(eq(messages.conversationId, conversationId)),
      ]),
    );

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

  async countByConversationIds(
    conversationIds: string[],
    tx?: Transaction,
  ): Promise<Record<string, number>> {
    if (conversationIds.length === 0) {
      return {};
    }

    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await withTransientDatabaseRetry(
      'count messages by conversation ids',
      () => db
        .select({
          conversationId: messages.conversationId,
          total: count(),
        })
        .from(messages)
        .where(inArray(messages.conversationId, conversationIds))
        .groupBy(messages.conversationId),
    );

    return rows.reduce<Record<string, number>>((accumulator, row) => {
      accumulator[row.conversationId] = Number(row.total ?? 0);
      return accumulator;
    }, {});
  }

  async findPendingReview(tx?: Transaction): Promise<Message[]> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await db
      .select({
        message: messages,
        senderRole: users.role,
        senderName: users.name,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.moderationStatus, 'REVIEW'));

    return rows.map((r) => this.rowToEntity(r));
  }

  async save(entity: Message, tx?: Transaction): Promise<Message> {
    const now = entity.createdAt.toISOString();
    const db = (tx as CrmDb | undefined) ?? this.db;
    const values = {
      id: entity.id,
      conversationId: entity.conversationId,
      senderId: entity.senderId,
      senderRoleOverride: entity.senderRoleOverride,
      senderNameOverride: entity.senderNameOverride,
      content: entity.content,
      originalLanguage: entity.originalLanguage ?? 'en',
      translatedContent: entity.translatedContent,
      messageType: entity.messageType,
      moderationStatus: entity.moderationStatus,
      attachments: entity.attachments as unknown as typeof messages.$inferInsert['attachments'],
      aiSummary: entity.aiSummary,
      createdAt: now,
    };

    const rows = await db
      .insert(messages)
      .values(values)
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          senderId: values.senderId,
          senderRoleOverride: values.senderRoleOverride,
          senderNameOverride: values.senderNameOverride,
          content: values.content,
          translatedContent: values.translatedContent,
          moderationStatus: values.moderationStatus,
          attachments: values.attachments,
          aiSummary: values.aiSummary,
        },
      })
      .returning();

    return this.rowToEntity({
      message: rows[0]!,
      senderRole: entity.senderRole,
      senderName: entity.senderName,
    });
  }

  async delete(id: string, tx?: Transaction): Promise<void> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    await db
      .delete(messages)
      .where(eq(messages.id, id));
  }

  private rowToEntity(row: { message: typeof messages.$inferSelect; senderRole: string | null; senderName: string | null }): Message {
    const message = row.message;
    return new Message({
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderRoleOverride: message.senderRoleOverride ?? null,
      senderNameOverride: message.senderNameOverride ?? null,
      senderRole: message.senderRoleOverride ?? row.senderRole ?? null,
      senderName: message.senderNameOverride ?? row.senderName ?? null,
      content: message.content,
      originalLanguage: message.originalLanguage ?? null,
      translatedContent: message.translatedContent ?? null,
      messageType: message.messageType as import('@medical-crm/domain').MessageType,
      moderationStatus: message.moderationStatus as import('@medical-crm/domain').ModerationStatus,
      attachments: (message.attachments as Attachment[] | null) ?? [],
      aiSummary: message.aiSummary ?? null,
      createdAt: new Date(message.createdAt),
    });
  }
}
