import { eq, and, sql, count, ilike, or } from 'drizzle-orm';
import type { IChatbotFaqRepository, ChatbotFaqListQuery } from '@medical-crm/domain';
import { ChatbotFaqItem } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { chatbotFaqItems } from '../schema/index.js';

export class DrizzleChatbotFaqRepository implements IChatbotFaqRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string): Promise<ChatbotFaqItem | null> {
    const rows = await this.db
      .select()
      .from(chatbotFaqItems)
      .where(eq(chatbotFaqItems.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findAll(
    query: ChatbotFaqListQuery,
  ): Promise<{ data: ChatbotFaqItem[]; total: number }> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.category) {
      conditions.push(eq(chatbotFaqItems.category, query.category));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(chatbotFaqItems.isActive, query.isActive));
    }
    if (query.search) {
      const searchPattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(chatbotFaqItems.questionEn, searchPattern),
          ilike(chatbotFaqItems.questionZh, searchPattern),
          ilike(chatbotFaqItems.answerEn, searchPattern),
          ilike(chatbotFaqItems.answerZh, searchPattern),
        ) as ReturnType<typeof eq>,
      );
    }
    if (query.hospitalId !== undefined) {
      if (query.hospitalId === null) {
        conditions.push(
          sql`${chatbotFaqItems.hospitalId} IS NULL` as unknown as ReturnType<typeof eq>,
        );
      } else {
        conditions.push(eq(chatbotFaqItems.hospitalId, query.hospitalId));
      }
    }

    const { page, limit } = query;
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(chatbotFaqItems)
        .where(where)
        .orderBy(
          sql`${chatbotFaqItems.sortOrder} ASC`,
          sql`${chatbotFaqItems.createdAt} DESC`,
        )
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(chatbotFaqItems)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.rowToEntity(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  async save(entity: ChatbotFaqItem): Promise<ChatbotFaqItem> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      category: entity.category,
      questionEn: entity.questionEn,
      questionZh: entity.questionZh,
      answerEn: entity.answerEn,
      answerZh: entity.answerZh,
      keywords: entity.keywords,
      isActive: entity.isActive,
      sortOrder: entity.sortOrder,
      hospitalId: entity.hospitalId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(chatbotFaqItems)
      .values(values)
      .onConflictDoUpdate({
        target: chatbotFaqItems.id,
        set: {
          category: values.category,
          questionEn: values.questionEn,
          questionZh: values.questionZh,
          answerEn: values.answerEn,
          answerZh: values.answerZh,
          keywords: values.keywords,
          isActive: values.isActive,
          sortOrder: values.sortOrder,
          hospitalId: values.hospitalId,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(chatbotFaqItems)
      .where(eq(chatbotFaqItems.id, id));
  }

  private rowToEntity(row: typeof chatbotFaqItems.$inferSelect): ChatbotFaqItem {
    return new ChatbotFaqItem({
      id: row.id,
      category: row.category,
      questionEn: row.questionEn,
      questionZh: row.questionZh,
      answerEn: row.answerEn,
      answerZh: row.answerZh,
      keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      hospitalId: row.hospitalId ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
