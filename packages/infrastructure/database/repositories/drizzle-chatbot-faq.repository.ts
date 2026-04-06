import { eq, and, sql, count, ilike, or, isNull } from 'drizzle-orm';
import type {
  IChatbotFaqRepository,
  ChatbotFaqListQuery,
  ChatbotFaqCategory,
  ChatbotFaqCategoryListQuery,
} from '@medical-crm/domain';
import { ChatbotFaqItem } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { chatbotFaqItems, chatbotFaqCategories } from '../schema/index.js';

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
    if (query.hospitalType) {
      conditions.push(eq(chatbotFaqItems.hospitalType, query.hospitalType));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(chatbotFaqItems.isActive, query.isActive));
    }
    if (query.search) {
      const searchPattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(chatbotFaqItems.question, searchPattern),
          ilike(chatbotFaqItems.answer, searchPattern),
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
      question: entity.question,
      answer: entity.answer,
      hospitalType: entity.hospitalType,
      keywords: entity.keywords,
      isActive: entity.isActive,
      sortOrder: entity.sortOrder,
      hospitalId: entity.hospitalId,
      attachments: entity.attachments,
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
          question: values.question,
          answer: values.answer,
          hospitalType: values.hospitalType,
          keywords: values.keywords,
          isActive: values.isActive,
          sortOrder: values.sortOrder,
          hospitalId: values.hospitalId,
          attachments: values.attachments,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async listCategories(query: ChatbotFaqCategoryListQuery): Promise<ChatbotFaqCategory[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.hospitalType) {
      conditions.push(eq(chatbotFaqCategories.hospitalType, query.hospitalType));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(chatbotFaqCategories.isActive, query.isActive));
    }
    if (query.hospitalId !== undefined) {
      if (query.hospitalId === null) {
        conditions.push(
          isNull(chatbotFaqCategories.hospitalId) as ReturnType<typeof eq>,
        );
      } else {
        conditions.push(eq(chatbotFaqCategories.hospitalId, query.hospitalId));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await this.db
      .select()
      .from(chatbotFaqCategories)
      .where(where)
      .orderBy(
        sql`${chatbotFaqCategories.hospitalType} ASC`,
        sql`${chatbotFaqCategories.sortOrder} ASC`,
        sql`${chatbotFaqCategories.name} ASC`,
      );

    // Count questions per category, scoped by hospitalId if present in query
    const countConditions: ReturnType<typeof eq>[] = [];
    if (query.hospitalId !== undefined) {
      if (query.hospitalId === null) {
        countConditions.push(
          sql`${chatbotFaqItems.hospitalId} IS NULL` as unknown as ReturnType<typeof eq>,
        );
      } else {
        countConditions.push(eq(chatbotFaqItems.hospitalId, query.hospitalId));
      }
    }

    const countWhere = countConditions.length > 0 ? and(...countConditions) : undefined;
    const countRows = await this.db
      .select({
        category: chatbotFaqItems.category,
        hospitalType: chatbotFaqItems.hospitalType,
        total: count(),
      })
      .from(chatbotFaqItems)
      .where(countWhere)
      .groupBy(chatbotFaqItems.category, chatbotFaqItems.hospitalType);

    const countMap = new Map(
      countRows.map((row) => [`${row.category}::${row.hospitalType}`, Number(row.total ?? 0)]),
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      hospitalType: row.hospitalType === 'COSMETIC' ? 'COSMETIC' : 'REGULAR',
      hospitalId: row.hospitalId ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      questionCount: countMap.get(`${row.name}::${row.hospitalType}`) ?? 0,
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  async findCategoryById(id: string): Promise<ChatbotFaqCategory | null> {
    const rows = await this.db
      .select()
      .from(chatbotFaqCategories)
      .where(eq(chatbotFaqCategories.id, id))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0]!;
    const questionCount = await this.countItemsForCategory(
      row.name,
      row.hospitalType === 'COSMETIC' ? 'COSMETIC' : 'REGULAR',
      row.hospitalId ?? null,
    );

    return {
      id: row.id,
      name: row.name,
      hospitalType: row.hospitalType === 'COSMETIC' ? 'COSMETIC' : 'REGULAR',
      hospitalId: row.hospitalId ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      questionCount,
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async createCategory(input: {
    name: string;
    hospitalType: 'REGULAR' | 'COSMETIC';
    hospitalId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<ChatbotFaqCategory> {
    const now = new Date().toISOString();
    const rows = await this.db
      .insert(chatbotFaqCategories)
      .values({
        name: input.name,
        hospitalType: input.hospitalType,
        hospitalId: input.hospitalId ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [chatbotFaqCategories.name, chatbotFaqCategories.hospitalType, chatbotFaqCategories.hospitalId],
        set: {
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          updatedAt: now,
        },
      })
      .returning();

    const row = rows[0]!;
    return {
      id: row.id,
      name: row.name,
      hospitalType: row.hospitalType === 'COSMETIC' ? 'COSMETIC' : 'REGULAR',
      hospitalId: row.hospitalId ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      questionCount: 0,
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async updateCategory(id: string, input: {
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<ChatbotFaqCategory> {
    const now = new Date().toISOString();
    const updateSet: {
      sortOrder?: number;
      isActive?: boolean;
      updatedAt: string;
    } = {
      updatedAt: now,
    };

    if (input.sortOrder !== undefined) {
      updateSet.sortOrder = input.sortOrder;
    }
    if (input.isActive !== undefined) {
      updateSet.isActive = input.isActive;
    }

    const rows = await this.db
      .update(chatbotFaqCategories)
      .set(updateSet)
      .where(eq(chatbotFaqCategories.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error(`Chatbot FAQ category not found: ${id}`);
    }

    return {
      id: row.id,
      name: row.name,
      hospitalType: row.hospitalType === 'COSMETIC' ? 'COSMETIC' : 'REGULAR',
      hospitalId: row.hospitalId ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      questionCount: 0,
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async countItemsForCategory(
    name: string,
    hospitalType: 'REGULAR' | 'COSMETIC',
    hospitalId?: string | null,
  ): Promise<number> {
    const conditions: ReturnType<typeof eq>[] = [
      eq(chatbotFaqItems.category, name),
      eq(chatbotFaqItems.hospitalType, hospitalType),
    ];

    if (hospitalId !== undefined) {
      if (hospitalId === null) {
        conditions.push(
          sql`${chatbotFaqItems.hospitalId} IS NULL` as unknown as ReturnType<typeof eq>,
        );
      } else {
        conditions.push(eq(chatbotFaqItems.hospitalId, hospitalId));
      }
    }

    const rows = await this.db
      .select({ total: count() })
      .from(chatbotFaqItems)
      .where(and(...conditions));

    return Number(rows[0]?.total ?? 0);
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(chatbotFaqItems)
      .where(eq(chatbotFaqItems.id, id));
  }

  async deleteCategory(id: string): Promise<void> {
    await this.db
      .delete(chatbotFaqCategories)
      .where(eq(chatbotFaqCategories.id, id));
  }

  private rowToEntity(row: typeof chatbotFaqItems.$inferSelect): ChatbotFaqItem {
    return new ChatbotFaqItem({
      id: row.id,
      category: row.category,
      question: row.question,
      answer: row.answer,
      hospitalType: row.hospitalType === 'COSMETIC' ? 'COSMETIC' : 'REGULAR',
      keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      hospitalId: row.hospitalId ?? null,
      attachments: Array.isArray(row.attachments)
        ? (row.attachments as Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }>)
        : [],
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
