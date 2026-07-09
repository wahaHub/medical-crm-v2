import { eq, and, sql, count, inArray, ne, type SQL } from 'drizzle-orm';
import type { ICHCRepository, CHCListQuery } from '@medical-crm/domain';
import { CaseHospitalContact } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { caseHospitalContacts, cases, users } from '../schema/index.js';

export class DrizzleCHCRepository implements ICHCRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string, tx?: unknown): Promise<CaseHospitalContact | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(caseHospitalContacts)
      .where(eq(caseHospitalContacts.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByCaseAndHospital(
    caseId: string,
    hospitalId: string,
    tx?: unknown,
  ): Promise<CaseHospitalContact | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(caseHospitalContacts)
      .where(
        and(
          eq(caseHospitalContacts.caseId, caseId),
          eq(caseHospitalContacts.hospitalId, hospitalId),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByCaseId(caseId: string, tx?: unknown): Promise<CaseHospitalContact[]> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(caseHospitalContacts)
      .where(eq(caseHospitalContacts.caseId, caseId))
      .orderBy(sql`${caseHospitalContacts.createdAt} DESC`);

    return rows.map((r) => this.rowToEntity(r));
  }

  async findByHospitalId(
    hospitalId: string,
    query: CHCListQuery,
  ): Promise<{ data: CaseHospitalContact[]; total: number }> {
    const { page, limit, subStatus } = query;

    const conditions: SQL[] = [eq(caseHospitalContacts.hospitalId, hospitalId)];
    if (subStatus) {
      conditions.push(
        eq(
          caseHospitalContacts.subStatus,
          subStatus as typeof caseHospitalContacts.subStatus.enumValues[number],
        ),
      );
    }
    const excludedEmailCondition = this.buildExcludedPatientEmailDomainsCondition(query.excludedPatientEmailDomains);
    if (excludedEmailCondition) conditions.push(excludedEmailCondition);

    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(caseHospitalContacts)
        .where(where)
        .orderBy(sql`${caseHospitalContacts.createdAt} DESC`)
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(caseHospitalContacts)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.rowToEntity(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  private buildExcludedPatientEmailDomainsCondition(domains?: readonly string[]) {
    const patterns = (domains ?? [])
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
      .filter((domain) => domain.length > 0)
      .map((domain) => `%@${domain}`);

    if (patterns.length === 0) return undefined;

    return sql`not exists (
      select 1
      from ${cases}
      inner join ${users} on ${cases.patientId} = ${users.id}
      where ${cases.id} = ${caseHospitalContacts.caseId}
        and (${sql.join(
          patterns.map((pattern) => sql`lower(trim(${users.email})) like ${pattern}`),
          sql` or `,
        )})
    )`;
  }

  async save(entity: CaseHospitalContact, tx?: unknown): Promise<CaseHospitalContact> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      caseId: entity.caseId,
      hospitalId: entity.hospitalId,
      subStatus: entity.subStatus as typeof caseHospitalContacts.subStatus.enumValues[number],
      selectedByPatientAt: entity.selectedByPatientAt ? entity.selectedByPatientAt.toISOString() : null,
      distributedAt: entity.distributedAt ? entity.distributedAt.toISOString() : null,
      firstReplyAt: entity.firstReplyAt ? entity.firstReplyAt.toISOString() : null,
      quoteId: entity.quoteId,
      patientViewedQuoteAt: entity.patientViewedQuoteAt ? entity.patientViewedQuoteAt.toISOString() : null,
      patientAcceptedAt: entity.patientAcceptedAt ? entity.patientAcceptedAt.toISOString() : null,
      patientRejectedAt: entity.patientRejectedAt ? entity.patientRejectedAt.toISOString() : null,
      reminderSentAt: entity.reminderSentAt ? entity.reminderSentAt.toISOString() : null,
      removedAt: entity.removedAt ? entity.removedAt.toISOString() : null,
      removedReason: entity.removedReason,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(caseHospitalContacts)
      .values(values)
      .onConflictDoUpdate({
        target: caseHospitalContacts.id,
        set: {
          subStatus: values.subStatus,
          selectedByPatientAt: values.selectedByPatientAt,
          distributedAt: values.distributedAt,
          firstReplyAt: values.firstReplyAt,
          quoteId: values.quoteId,
          patientViewedQuoteAt: values.patientViewedQuoteAt,
          patientAcceptedAt: values.patientAcceptedAt,
          patientRejectedAt: values.patientRejectedAt,
          reminderSentAt: values.reminderSentAt,
          removedAt: values.removedAt,
          removedReason: values.removedReason,
          version: sql`${caseHospitalContacts.version} + 1`,
          updatedAt: now,
        },
        setWhere: eq(caseHospitalContacts.version, entity.version),
      })
      .returning();

    if (rows.length === 0) {
      throw new Error(`Optimistic lock conflict: CHC ${entity.id} was modified concurrently`);
    }

    return this.rowToEntity(rows[0]!);
  }

  async rejectOthersByCaseExcept(
    caseId: string,
    excludeId: string,
    tx?: unknown,
  ): Promise<void> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();

    await db
      .update(caseHospitalContacts)
      .set({
        subStatus: 'REJECTED',
        updatedAt: now,
      })
      .where(
        and(
          eq(caseHospitalContacts.caseId, caseId),
          ne(caseHospitalContacts.id, excludeId),
          inArray(caseHospitalContacts.subStatus, ['DISTRIBUTED', 'NEED_INFO', 'QUOTED']),
        ),
      );
  }

  private rowToEntity(row: typeof caseHospitalContacts.$inferSelect): CaseHospitalContact {
    return new CaseHospitalContact({
      id: row.id,
      caseId: row.caseId,
      hospitalId: row.hospitalId,
      subStatus: row.subStatus as import('@medical-crm/domain').CHCSubStatus,
      selectedByPatientAt: row.selectedByPatientAt ? new Date(row.selectedByPatientAt) : null,
      distributedAt: row.distributedAt ? new Date(row.distributedAt) : null,
      firstReplyAt: row.firstReplyAt ? new Date(row.firstReplyAt) : null,
      quoteId: row.quoteId ?? null,
      patientViewedQuoteAt: row.patientViewedQuoteAt ? new Date(row.patientViewedQuoteAt) : null,
      patientAcceptedAt: row.patientAcceptedAt ? new Date(row.patientAcceptedAt) : null,
      patientRejectedAt: row.patientRejectedAt ? new Date(row.patientRejectedAt) : null,
      reminderSentAt: row.reminderSentAt ? new Date(row.reminderSentAt) : null,
      removedAt: row.removedAt ? new Date(row.removedAt) : null,
      removedReason: row.removedReason ?? null,
      version: row.version,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
