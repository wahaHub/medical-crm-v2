import { eq, and, sql, count, ilike } from 'drizzle-orm';
import type { ISupportTicketRepository, TicketListQuery } from '@medical-crm/domain';
import { SupportTicket, TicketNumber } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { supportTickets } from '../schema/index.js';

export class DrizzleSupportTicketRepository implements ISupportTicketRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string, tx?: unknown): Promise<SupportTicket | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByPatientId(
    patientId: string,
    query: TicketListQuery,
  ): Promise<{ data: SupportTicket[]; total: number }> {
    const conditions = [eq(supportTickets.patientId, patientId)];
    this.applyFilters(conditions, query);
    return this.queryWithPagination(conditions, query);
  }

  async findByAssignedTo(
    assignedTo: string,
    query: TicketListQuery,
  ): Promise<{ data: SupportTicket[]; total: number }> {
    const conditions = [eq(supportTickets.assignedTo, assignedTo)];
    this.applyFilters(conditions, query);
    return this.queryWithPagination(conditions, query);
  }

  async findAll(
    query: TicketListQuery,
  ): Promise<{ data: SupportTicket[]; total: number }> {
    const conditions: ReturnType<typeof eq>[] = [];
    this.applyFilters(conditions, query);
    return this.queryWithPagination(conditions, query);
  }

  async save(entity: SupportTicket, tx?: unknown): Promise<SupportTicket> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      ticketNumber: entity.ticketNumber.value,
      patientId: entity.patientId,
      caseId: entity.caseId,
      type: entity.type as typeof supportTickets.type.enumValues[number],
      priority: entity.priority as typeof supportTickets.priority.enumValues[number],
      status: entity.status as typeof supportTickets.status.enumValues[number],
      subject: entity.subject,
      description: entity.description,
      sourcePage: entity.sourcePage,
      assignedTo: entity.assignedTo,
      slaDeadline: entity.slaDeadline ? entity.slaDeadline.toISOString() : null,
      resolutionNote: entity.resolutionNote,
      resolvedAt: entity.resolvedAt ? entity.resolvedAt.toISOString() : null,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(supportTickets)
      .values(values)
      .onConflictDoUpdate({
        target: supportTickets.id,
        set: {
          version: sql`${supportTickets.version} + 1`,
          status: values.status,
          priority: values.priority,
          subject: values.subject,
          description: values.description,
          assignedTo: values.assignedTo,
          slaDeadline: values.slaDeadline,
          resolutionNote: values.resolutionNote,
          resolvedAt: values.resolvedAt,
          updatedAt: now,
        },
        setWhere: eq(supportTickets.version, entity.version),
      })
      .returning();

    if (rows.length === 0) {
      throw new Error(`Optimistic lock conflict: SupportTicket ${entity.id} was modified concurrently`);
    }

    return this.rowToEntity(rows[0]!);
  }

  async nextTicketNumber(): Promise<string> {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const prefix = `TKT-${y}${m}${d}-%`;

    const result = await this.db
      .select({
        maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(${supportTickets.ticketNumber}, '-', 3) AS INTEGER)), 0)`,
      })
      .from(supportTickets)
      .where(ilike(supportTickets.ticketNumber, prefix));

    const nextSeq = (result[0]?.maxSeq ?? 0) + 1;
    const tn = TicketNumber.generate(nextSeq);
    return tn.value;
  }

  private applyFilters(
    conditions: ReturnType<typeof eq>[],
    query: TicketListQuery,
  ): void {
    if (query.status) {
      conditions.push(
        eq(supportTickets.status, query.status as typeof supportTickets.status.enumValues[number]),
      );
    }
    if (query.type) {
      conditions.push(
        eq(supportTickets.type, query.type as typeof supportTickets.type.enumValues[number]),
      );
    }
    if (query.priority) {
      conditions.push(
        eq(supportTickets.priority, query.priority as typeof supportTickets.priority.enumValues[number]),
      );
    }
    if (query.caseId) {
      conditions.push(eq(supportTickets.caseId, query.caseId));
    }
  }

  private async queryWithPagination(
    conditions: ReturnType<typeof eq>[],
    query: TicketListQuery,
  ): Promise<{ data: SupportTicket[]; total: number }> {
    const { page, limit } = query;
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(supportTickets)
        .where(where)
        .orderBy(sql`${supportTickets.createdAt} DESC`)
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(supportTickets)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.rowToEntity(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  private rowToEntity(row: typeof supportTickets.$inferSelect): SupportTicket {
    return new SupportTicket({
      id: row.id,
      ticketNumber: new TicketNumber(row.ticketNumber),
      patientId: row.patientId,
      caseId: row.caseId ?? null,
      type: row.type as import('@medical-crm/domain').TicketType,
      priority: row.priority as import('@medical-crm/domain').TicketPriority,
      status: row.status as import('@medical-crm/domain').TicketStatus,
      subject: row.subject ?? null,
      description: row.description,
      sourcePage: row.sourcePage ?? null,
      assignedTo: row.assignedTo ?? null,
      slaDeadline: row.slaDeadline ? new Date(row.slaDeadline) : null,
      resolutionNote: row.resolutionNote ?? null,
      resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
      version: row.version,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
