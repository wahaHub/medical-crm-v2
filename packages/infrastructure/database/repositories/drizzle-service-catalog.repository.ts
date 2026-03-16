import { eq, and, sql, count } from 'drizzle-orm';
import type {
  IServiceCatalogRepository,
  ServiceCatalogListQuery,
  QuoteTemplateListQuery,
} from '@medical-crm/domain';
import { ServiceCatalogItem, QuoteTemplate } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { serviceCatalogItems, quoteTemplates } from '../schema/index.js';

export class DrizzleServiceCatalogRepository implements IServiceCatalogRepository {
  constructor(private readonly db: CrmDb) {}

  // ---------------------------------------------------------------------------
  // Service Catalog Items
  // ---------------------------------------------------------------------------

  async findItemById(id: string): Promise<ServiceCatalogItem | null> {
    const rows = await this.db
      .select()
      .from(serviceCatalogItems)
      .where(eq(serviceCatalogItems.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToItem(rows[0]!);
  }

  async findItemsByHospitalId(
    hospitalId: string,
    query: ServiceCatalogListQuery,
  ): Promise<{ data: ServiceCatalogItem[]; total: number }> {
    const conditions: ReturnType<typeof eq>[] = [
      eq(serviceCatalogItems.hospitalId, hospitalId),
    ];
    this.applyItemFilters(conditions, query);
    return this.queryItemsWithPagination(conditions, query);
  }

  async findAllItems(
    query: ServiceCatalogListQuery,
  ): Promise<{ data: ServiceCatalogItem[]; total: number }> {
    const conditions: ReturnType<typeof eq>[] = [];
    if (query.hospitalId) {
      conditions.push(eq(serviceCatalogItems.hospitalId, query.hospitalId));
    }
    this.applyItemFilters(conditions, query);
    return this.queryItemsWithPagination(conditions, query);
  }

  async saveItem(entity: ServiceCatalogItem): Promise<ServiceCatalogItem> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      hospitalId: entity.hospitalId,
      nameEn: entity.nameEn,
      nameZh: entity.nameZh,
      category: entity.category as typeof serviceCatalogItems.category.enumValues[number],
      priceMin: entity.priceMin,
      priceMax: entity.priceMax,
      currency: entity.currency,
      estimatedStayDays: entity.estimatedStayDays,
      estimatedRecoveryDays: entity.estimatedRecoveryDays,
      inclusions: entity.inclusions,
      isPublic: entity.isPublic,
      isActive: entity.isActive,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(serviceCatalogItems)
      .values(values)
      .onConflictDoUpdate({
        target: serviceCatalogItems.id,
        set: {
          nameEn: values.nameEn,
          nameZh: values.nameZh,
          category: values.category,
          priceMin: values.priceMin,
          priceMax: values.priceMax,
          currency: values.currency,
          estimatedStayDays: values.estimatedStayDays,
          estimatedRecoveryDays: values.estimatedRecoveryDays,
          inclusions: values.inclusions,
          isPublic: values.isPublic,
          isActive: values.isActive,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToItem(rows[0]!);
  }

  // ---------------------------------------------------------------------------
  // Quote Templates
  // ---------------------------------------------------------------------------

  async findTemplateById(id: string): Promise<QuoteTemplate | null> {
    const rows = await this.db
      .select()
      .from(quoteTemplates)
      .where(eq(quoteTemplates.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToTemplate(rows[0]!);
  }

  async findTemplatesByHospitalId(
    hospitalId: string,
    query: QuoteTemplateListQuery,
  ): Promise<{ data: QuoteTemplate[]; total: number }> {
    const conditions: ReturnType<typeof eq>[] = [
      eq(quoteTemplates.hospitalId, hospitalId),
    ];
    this.applyTemplateFilters(conditions, query);
    return this.queryTemplatesWithPagination(conditions, query);
  }

  async saveTemplate(entity: QuoteTemplate): Promise<QuoteTemplate> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      hospitalId: entity.hospitalId,
      name: entity.name,
      conditionCategory: entity.conditionCategory,
      lineItemsTemplate: entity.lineItemsTemplate,
      defaultValidDays: entity.defaultValidDays,
      isActive: entity.isActive,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(quoteTemplates)
      .values(values)
      .onConflictDoUpdate({
        target: quoteTemplates.id,
        set: {
          name: values.name,
          conditionCategory: values.conditionCategory,
          lineItemsTemplate: values.lineItemsTemplate,
          defaultValidDays: values.defaultValidDays,
          isActive: values.isActive,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToTemplate(rows[0]!);
  }

  // ---------------------------------------------------------------------------
  // Private helpers — Items
  // ---------------------------------------------------------------------------

  private applyItemFilters(
    conditions: ReturnType<typeof eq>[],
    query: ServiceCatalogListQuery,
  ): void {
    if (query.category) {
      conditions.push(
        eq(serviceCatalogItems.category, query.category as typeof serviceCatalogItems.category.enumValues[number]),
      );
    }
    if (query.isPublic !== undefined) {
      conditions.push(eq(serviceCatalogItems.isPublic, query.isPublic));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(serviceCatalogItems.isActive, query.isActive));
    }
  }

  private async queryItemsWithPagination(
    conditions: ReturnType<typeof eq>[],
    query: ServiceCatalogListQuery,
  ): Promise<{ data: ServiceCatalogItem[]; total: number }> {
    const { page, limit } = query;
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(serviceCatalogItems)
        .where(where)
        .orderBy(sql`${serviceCatalogItems.createdAt} DESC`)
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(serviceCatalogItems)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.rowToItem(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  private rowToItem(row: typeof serviceCatalogItems.$inferSelect): ServiceCatalogItem {
    return new ServiceCatalogItem({
      id: row.id,
      hospitalId: row.hospitalId,
      nameEn: row.nameEn,
      nameZh: row.nameZh ?? null,
      category: row.category as import('@medical-crm/domain').ServiceCatalogCategory,
      priceMin: row.priceMin,
      priceMax: row.priceMax,
      currency: row.currency,
      estimatedStayDays: row.estimatedStayDays ?? null,
      estimatedRecoveryDays: row.estimatedRecoveryDays ?? null,
      inclusions: row.inclusions ?? null,
      isPublic: row.isPublic,
      isActive: row.isActive,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers — Templates
  // ---------------------------------------------------------------------------

  private applyTemplateFilters(
    conditions: ReturnType<typeof eq>[],
    query: QuoteTemplateListQuery,
  ): void {
    if (query.conditionCategory) {
      conditions.push(eq(quoteTemplates.conditionCategory, query.conditionCategory));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(quoteTemplates.isActive, query.isActive));
    }
  }

  private async queryTemplatesWithPagination(
    conditions: ReturnType<typeof eq>[],
    query: QuoteTemplateListQuery,
  ): Promise<{ data: QuoteTemplate[]; total: number }> {
    const { page, limit } = query;
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(quoteTemplates)
        .where(where)
        .orderBy(sql`${quoteTemplates.createdAt} DESC`)
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(quoteTemplates)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.rowToTemplate(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  private rowToTemplate(row: typeof quoteTemplates.$inferSelect): QuoteTemplate {
    return new QuoteTemplate({
      id: row.id,
      hospitalId: row.hospitalId,
      name: row.name,
      conditionCategory: row.conditionCategory ?? null,
      lineItemsTemplate: row.lineItemsTemplate,
      defaultValidDays: row.defaultValidDays,
      isActive: row.isActive,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
