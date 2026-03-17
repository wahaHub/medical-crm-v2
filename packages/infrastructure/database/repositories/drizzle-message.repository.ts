import { eq, count, sql } from 'drizzle-orm';
import type { IMessageRepository, MessageListQuery, Attachment } from '@medical-crm/domain';
import { Message } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import { messages, users } from '../schema/index.js';

export class DrizzleMessageRepository implements IMessageRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string): Promise<Message | null> {
    const rows = await this.db
      .select({
        message: messages,
        senderRole: users.role,
        senderName: users.name,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByConversationId(
    conversationId: string,
    query: MessageListQuery,
  ): Promise<PaginatedResult<Message>> {
    const { page, limit } = query;

    const [rows, countResult] = await Promise.all([
      this.db
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
      this.db
        .select({ total: count() })
        .from(messages)
        .where(eq(messages.conversationId, conversationId)),
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

  async findPendingReview(): Promise<Message[]> {
    const rows = await this.db
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

  async save(entity: Message): Promise<Message> {
    const now = entity.createdAt.toISOString();
    const values = {
      id: entity.id,
      conversationId: entity.conversationId,
      senderId: entity.senderId,
      content: entity.content,
      originalLanguage: entity.originalLanguage ?? 'en',
      translatedContent: entity.translatedContent,
      messageType: entity.messageType,
      moderationStatus: entity.moderationStatus,
      attachments: entity.attachments as unknown as typeof messages.$inferInsert['attachments'],
      aiSummary: entity.aiSummary,
      createdAt: now,
    };

    const rows = await this.db
      .insert(messages)
      .values(values)
      .onConflictDoUpdate({
        target: messages.id,
        set: {
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

  async delete(id: string): Promise<void> {
    await this.db
      .delete(messages)
      .where(eq(messages.id, id));
  }

  private rowToEntity(row: { message: typeof messages.$inferSelect; senderRole: string | null; senderName: string | null }): Message {
    const message = row.message;
    return new Message({
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderRole: row.senderRole ?? null,
      senderName: row.senderName ?? null,
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
