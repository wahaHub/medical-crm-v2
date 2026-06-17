import { eq, and, sql, count, ilike, type SQL } from 'drizzle-orm';
import type { IOrderRepository, OrderListQuery } from '@medical-crm/domain';
import { Order, OrderNumber } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { orders, users } from '../schema/index.js';
import { patientSiteScopeSql } from './patient-site-scope-sql.js';

type OrderRow = typeof orders.$inferSelect;

export class DrizzleOrderRepository implements IOrderRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string, tx?: unknown): Promise<Order | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findAll(
    query: OrderListQuery,
  ): Promise<{ data: Order[]; total: number }> {
    const conditions: SQL[] = [];
    this.applyFilters(conditions, query);
    return this.queryWithPagination(conditions, query);
  }

  async save(entity: Order, tx?: unknown): Promise<Order> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      orderNumber: entity.orderNumber.value,
      patientId: entity.patientId,
      caseId: entity.caseId,
      packageId: entity.packageId,
      type: entity.type as typeof orders.type.enumValues[number],
      amount: entity.amount,
      currency: entity.currency,
      status: entity.status as typeof orders.status.enumValues[number],
      paymentMethod: entity.paymentMethod,
      paidAt: entity.paidAt ? entity.paidAt.toISOString() : null,
      completedAt: entity.completedAt ? entity.completedAt.toISOString() : null,
      refundedAmount: entity.refundedAmount,
      refundReason: entity.refundReason,
      metadata: entity.metadata,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(orders)
      .values(values)
      .onConflictDoUpdate({
        target: orders.id,
        set: {
          version: sql`${orders.version} + 1`,
          status: values.status,
          paymentMethod: values.paymentMethod,
          paidAt: values.paidAt,
          completedAt: values.completedAt,
          refundedAmount: values.refundedAmount,
          refundReason: values.refundReason,
          metadata: values.metadata,
          updatedAt: now,
        },
        setWhere: eq(orders.version, entity.version),
      })
      .returning();

    if (rows.length === 0) {
      throw new Error(`Optimistic lock conflict: Order ${entity.id} was modified concurrently`);
    }

    return this.rowToEntity(rows[0]!);
  }

  async nextOrderNumber(): Promise<string> {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const prefix = `ORD-${y}${m}${d}-%`;

    const result = await this.db
      .select({
        maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(${orders.orderNumber}, '-', 3) AS INTEGER)), 0)`,
      })
      .from(orders)
      .where(ilike(orders.orderNumber, prefix));

    const nextSeq = (result[0]?.maxSeq ?? 0) + 1;
    const on = OrderNumber.generate(nextSeq);
    return on.value;
  }

  private applyFilters(
    conditions: SQL[],
    query: OrderListQuery,
  ): void {
    if (query.patientId) {
      conditions.push(eq(orders.patientId, query.patientId));
    }
    if (query.caseId) {
      conditions.push(eq(orders.caseId, query.caseId));
    }
    if (query.status) {
      conditions.push(
        eq(orders.status, query.status as typeof orders.status.enumValues[number]),
      );
    }
    if (query.type) {
      conditions.push(
        eq(orders.type, query.type as typeof orders.type.enumValues[number]),
      );
    }
    const patientSiteCondition = patientSiteScopeSql(sql`${users.patientSite}`, query.patientSiteScope);
    if (patientSiteCondition) conditions.push(patientSiteCondition);
  }

  private async queryWithPagination(
    conditions: SQL[],
    query: OrderListQuery,
  ): Promise<{ data: Order[]; total: number }> {
    const { page, limit } = query;
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = query.patientSiteScope
      ? await Promise.all([
          this.db
            .select({ orders })
            .from(orders)
            .innerJoin(users, eq(orders.patientId, users.id))
            .where(where)
            .orderBy(sql`${orders.createdAt} DESC`)
            .limit(limit)
            .offset((page - 1) * limit),
          this.db
            .select({ total: count() })
            .from(orders)
            .innerJoin(users, eq(orders.patientId, users.id))
            .where(where),
        ])
      : await Promise.all([
          this.db
            .select()
            .from(orders)
            .where(where)
            .orderBy(sql`${orders.createdAt} DESC`)
            .limit(limit)
            .offset((page - 1) * limit),
          this.db
            .select({ total: count() })
            .from(orders)
            .where(where),
        ]);

    return {
      data: query.patientSiteScope
        ? (rows as Array<{ orders: OrderRow }>).map((r) => this.rowToEntity(r.orders))
        : (rows as OrderRow[]).map((r) => this.rowToEntity(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  private rowToEntity(row: typeof orders.$inferSelect): Order {
    return new Order({
      id: row.id,
      orderNumber: new OrderNumber(row.orderNumber),
      patientId: row.patientId,
      caseId: row.caseId ?? null,
      packageId: row.packageId ?? null,
      type: row.type as import('@medical-crm/domain').OrderType,
      amount: row.amount,
      currency: row.currency,
      status: row.status as import('@medical-crm/domain').OrderStatus,
      paymentMethod: row.paymentMethod ?? null,
      paidAt: row.paidAt ? new Date(row.paidAt) : null,
      completedAt: row.completedAt ? new Date(row.completedAt) : null,
      refundedAmount: row.refundedAmount ?? null,
      refundReason: row.refundReason ?? null,
      metadata: row.metadata ?? null,
      version: row.version,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
