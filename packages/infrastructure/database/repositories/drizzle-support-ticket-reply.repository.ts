import { eq, sql } from 'drizzle-orm';
import type { ISupportTicketReplyRepository } from '@medical-crm/domain';
import { SupportTicketReply } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { supportTicketReplies } from '../schema/index.js';

export class DrizzleSupportTicketReplyRepository implements ISupportTicketReplyRepository {
  constructor(private readonly db: CrmDb) {}

  async save(entity: SupportTicketReply): Promise<SupportTicketReply> {
    const rows = await this.db
      .insert(supportTicketReplies)
      .values({
        id: entity.id,
        ticketId: entity.ticketId,
        authorId: entity.authorId,
        authorRole: entity.authorRole as typeof supportTicketReplies.authorRole.enumValues[number],
        content: entity.content,
        isInternalNote: entity.isInternalNote,
        attachments: entity.attachments as typeof supportTicketReplies.$inferInsert['attachments'],
        createdAt: entity.createdAt.toISOString(),
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async findByTicketId(ticketId: string): Promise<SupportTicketReply[]> {
    const rows = await this.db
      .select()
      .from(supportTicketReplies)
      .where(eq(supportTicketReplies.ticketId, ticketId))
      .orderBy(sql`${supportTicketReplies.createdAt} ASC`);

    return rows.map((r) => this.rowToEntity(r));
  }

  private rowToEntity(row: typeof supportTicketReplies.$inferSelect): SupportTicketReply {
    return new SupportTicketReply({
      id: row.id,
      ticketId: row.ticketId,
      authorId: row.authorId,
      authorRole: row.authorRole as import('@medical-crm/domain').TicketReplyRole,
      content: row.content,
      isInternalNote: row.isInternalNote,
      attachments: row.attachments ?? null,
      createdAt: new Date(row.createdAt),
    });
  }
}
