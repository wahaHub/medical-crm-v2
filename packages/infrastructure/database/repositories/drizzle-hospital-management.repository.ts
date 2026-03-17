import { eq, and, or, ilike, count, sql } from 'drizzle-orm';
import type { IHospitalManagementRepository, HospitalListQuery, HospitalStatus } from '@medical-crm/domain';
import { Hospital } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import { hospitals } from '../schema/index.js';

export class DrizzleHospitalManagementRepository implements IHospitalManagementRepository {
  constructor(private readonly db: CrmDb) {}

  async findFullById(id: string): Promise<Hospital | null> {
    const rows = await this.db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findMany(query: HospitalListQuery): Promise<PaginatedResult<Hospital>> {
    const { page, limit, status, type, search } = query;

    const conditions = [];
    if (status) conditions.push(eq(hospitals.status, status));
    if (type) conditions.push(eq(hospitals.type, type));
    if (search) {
      conditions.push(
        or(
          ilike(hospitals.name, `%${search}%`),
          ilike(hospitals.nameEn, `%${search}%`),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(hospitals)
        .where(where)
        .orderBy(sql`${hospitals.createdAt} DESC`)
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(hospitals)
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

  async save(entity: Hospital): Promise<Hospital> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      name: entity.name,
      nameEn: entity.nameEn,
      address: entity.address,
      city: entity.city,
      phone: entity.phone,
      email: entity.email,
      description: entity.description,
      logoUrl: entity.logoUrl,
      specialties: entity.specialties as unknown as typeof hospitals.$inferInsert['specialties'],
      status: entity.status,
      type: entity.type,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(hospitals)
      .values(values)
      .onConflictDoUpdate({
        target: hospitals.id,
        set: {
          name: values.name,
          nameEn: values.nameEn,
          address: values.address,
          city: values.city,
          phone: values.phone,
          email: values.email,
          description: values.description,
          logoUrl: values.logoUrl,
          specialties: values.specialties,
          status: values.status,
          type: values.type,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async updateStatus(id: string, status: HospitalStatus): Promise<Hospital> {
    const now = new Date().toISOString();
    const rows = await this.db
      .update(hospitals)
      .set({ status, updatedAt: now })
      .where(eq(hospitals.id, id))
      .returning();

    if (rows.length === 0) {
      throw new Error(`Hospital not found: ${id}`);
    }
    return this.rowToEntity(rows[0]!);
  }

  private rowToEntity(row: typeof hospitals.$inferSelect): Hospital {
    return new Hospital({
      id: row.id,
      name: row.name,
      nameEn: row.nameEn ?? '',
      address: row.address ?? null,
      city: row.city ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      description: row.description ?? null,
      logoUrl: row.logoUrl ?? null,
      specialties: (row.specialties as string[] | null) ?? null,
      status: row.status as import('@medical-crm/domain').HospitalStatus,
      type: row.type as import('@medical-crm/domain').HospitalType,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
