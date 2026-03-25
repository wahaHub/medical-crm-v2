import { eq, and, sql, count } from 'drizzle-orm';
import type { IPackageRepository, PackageListQuery } from '@medical-crm/domain';
import { Package } from '@medical-crm/domain';
import { ConflictError } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import { orders, packages } from '../schema/index.js';

export class DrizzlePackageRepository implements IPackageRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string, tx?: unknown): Promise<Package | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(packages)
      .where(eq(packages.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findAll(
    query: PackageListQuery,
  ): Promise<{ data: Package[]; total: number }> {
    const conditions: ReturnType<typeof eq>[] = [];
    this.applyFilters(conditions, query);
    return this.queryWithPagination(conditions, query);
  }

  async save(entity: Package, tx?: unknown): Promise<Package> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      nameEn: entity.nameEn,
      nameZh: entity.nameZh,
      type: entity.type as typeof packages.type.enumValues[number],
      price: entity.price,
      currency: entity.currency,
      descriptionEn: entity.descriptionEn,
      descriptionZh: entity.descriptionZh,
      inclusions: entity.inclusions,
      coverImageUrl: entity.coverImageUrl,
      sortWeight: entity.sortWeight,
      status: entity.status as typeof packages.status.enumValues[number],
      publishAt: entity.publishAt ? entity.publishAt.toISOString() : null,
      takedownAt: entity.takedownAt ? entity.takedownAt.toISOString() : null,
      config: entity.config,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(packages)
      .values(values)
      .onConflictDoUpdate({
        target: packages.id,
        set: {
          nameEn: values.nameEn,
          nameZh: values.nameZh,
          type: values.type,
          price: values.price,
          currency: values.currency,
          descriptionEn: values.descriptionEn,
          descriptionZh: values.descriptionZh,
          inclusions: values.inclusions,
          coverImageUrl: values.coverImageUrl,
          sortWeight: values.sortWeight,
          status: values.status,
          publishAt: values.publishAt,
          takedownAt: values.takedownAt,
          config: values.config,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async delete(id: string, tx?: unknown): Promise<void> {
    const db = (tx as CrmDb) ?? this.db;
    const orderRefs = await db
      .select({ total: count() })
      .from(orders)
      .where(eq(orders.packageId, id));

    if (Number(orderRefs[0]?.total ?? 0) > 0) {
      throw new ConflictError('Package cannot be deleted because it is referenced by orders');
    }

    await db
      .delete(packages)
      .where(eq(packages.id, id));
  }

  private applyFilters(
    conditions: ReturnType<typeof eq>[],
    query: PackageListQuery,
  ): void {
    if (query.status) {
      conditions.push(
        eq(packages.status, query.status as typeof packages.status.enumValues[number]),
      );
    }
    if (query.type) {
      conditions.push(
        eq(packages.type, query.type as typeof packages.type.enumValues[number]),
      );
    }
  }

  private async queryWithPagination(
    conditions: ReturnType<typeof eq>[],
    query: PackageListQuery,
  ): Promise<{ data: Package[]; total: number }> {
    const { page, limit } = query;
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(packages)
        .where(where)
        .orderBy(sql`${packages.createdAt} DESC`)
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(packages)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.rowToEntity(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  private rowToEntity(row: typeof packages.$inferSelect): Package {
    return new Package({
      id: row.id,
      nameEn: row.nameEn,
      nameZh: row.nameZh ?? null,
      type: row.type as import('@medical-crm/domain').PackageType,
      price: row.price,
      currency: row.currency,
      descriptionEn: row.descriptionEn ?? null,
      descriptionZh: row.descriptionZh ?? null,
      inclusions: row.inclusions ?? null,
      coverImageUrl: row.coverImageUrl ?? null,
      sortWeight: row.sortWeight ?? 0,
      status: row.status as import('@medical-crm/domain').PackageStatus,
      publishAt: row.publishAt ? new Date(row.publishAt) : null,
      takedownAt: row.takedownAt ? new Date(row.takedownAt) : null,
      config: row.config ?? null,
      createdBy: row.createdBy ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
