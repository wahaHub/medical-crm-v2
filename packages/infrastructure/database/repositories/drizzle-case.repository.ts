import { eq, ilike, or, and, sql, count } from 'drizzle-orm';
import { HOSPITAL_CASE_READ_CHC_STATUSES, type ICaseRepository, type CaseListQuery, type CaseCountFilters, type CaseStats } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import { cases, caseHospitalContacts, users } from '../schema/index.js';
import { withTransientDatabaseRetry } from '../transient-db-retry.js';
import { patientSiteScopeSql } from './patient-site-scope-sql.js';

export class DrizzleCaseRepository implements ICaseRepository {
  constructor(private readonly db: CrmDb) {}

  private buildHospitalAccessCondition(hospitalId: string) {
    return or(
      eq(cases.assignedHospitalId, hospitalId),
      sql`exists (
        select 1
        from ${caseHospitalContacts}
        where ${caseHospitalContacts.caseId} = ${cases.id}
          and ${caseHospitalContacts.hospitalId} = ${hospitalId}
          and ${caseHospitalContacts.subStatus} in (${sql.join(
            HOSPITAL_CASE_READ_CHC_STATUSES.map((status) => sql`${status}`),
            sql`, `,
          )})
          and ${caseHospitalContacts.removedAt} is null
      )`,
    );
  }

  private conn(tx?: unknown): CrmDb {
    return tx ? (tx as CrmDb) : this.db;
  }

  private buildExcludedPatientEmailDomainsCondition(domains?: readonly string[]) {
    const patterns = (domains ?? [])
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
      .filter((domain) => domain.length > 0)
      .map((domain) => `%@${domain}`);

    if (patterns.length === 0) return undefined;

    return sql`(${users.email} is null or not (${sql.join(
      patterns.map((pattern) => sql`lower(trim(${users.email})) like ${pattern}`),
      sql` or `,
    )}))`;
  }

  async findById(id: string, tx?: unknown): Promise<Case | null> {
    const rows = await withTransientDatabaseRetry(
      'load case by id',
      () => this.conn(tx)
        .select()
        .from(cases)
        .where(eq(cases.id, id))
        .limit(1),
      { retries: 2, retryDelayMs: 150 },
    );

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findMany(query: CaseListQuery, hospitalId?: string): Promise<PaginatedResult<Case>> {
    const { page, limit, status, stage, search } = query;
    // Auth-derived hospitalId (forced filter) takes priority over query param
    const effectiveHospitalId = hospitalId ?? query.hospitalId;

    const conditions = [];
    if (effectiveHospitalId) conditions.push(this.buildHospitalAccessCondition(effectiveHospitalId));
    const patientSiteCondition = patientSiteScopeSql(sql`${users.patientSite}`, query.patientSiteScope);
    if (patientSiteCondition) conditions.push(patientSiteCondition);
    if (query.patientSite) conditions.push(eq(users.patientSite, query.patientSite));
    const excludedEmailCondition = this.buildExcludedPatientEmailDomainsCondition(query.excludedPatientEmailDomains);
    if (excludedEmailCondition) conditions.push(excludedEmailCondition);

    // New model filters take priority; compat aliases map old → new columns
    if (query.assignmentStatus) {
      conditions.push(eq(cases.assignmentStatus, query.assignmentStatus));
    } else if (status === 'ACTIVE') {
      // Compat: old status=ACTIVE → new assignmentStatus=ASSIGNED (skip old column)
      conditions.push(eq(cases.assignmentStatus, 'ASSIGNED'));
    } else if (status) {
      conditions.push(eq(cases.status, status));
    }

    if (query.treatmentStage) {
      conditions.push(eq(cases.treatmentStage, query.treatmentStage));
    } else if (stage) {
      const OLD_TO_NEW: Record<string, string> = {
        'IN_TREATMENT': 'IN_TREATMENT',
        'TREATMENT_COMPLETED': 'COMPLETED',
        'HOSPITAL_CONTACTED': 'CONFIRMED',
      };
      const mapped = OLD_TO_NEW[stage];
      if (mapped) {
        // Compat: old stage → new treatmentStage (skip old column)
        conditions.push(eq(cases.treatmentStage, mapped as typeof query.treatmentStage & string));
      } else {
        conditions.push(eq(cases.stage, stage));
      }
    }
    if (search) {
      conditions.push(
        or(
          ilike(cases.patientName, `%${search}%`),
          ilike(cases.caseNumber, `%${search}%`),
          ilike(cases.primaryDiagnosis, `%${search}%`),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await withTransientDatabaseRetry(
      'list cases',
      () => Promise.all([
        this.db
          .select()
          .from(cases)
          .innerJoin(users, eq(cases.patientId, users.id))
          .where(where)
          .orderBy(sql`${cases.createdAt} DESC`)
          .limit(limit)
          .offset((page - 1) * limit),
        this.db
          .select({ total: count() })
          .from(cases)
          .innerJoin(users, eq(cases.patientId, users.id))
          .where(where),
      ]),
    );

    const total = Number(countResult[0]?.total ?? 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: rows.map((r) => this.rowToEntity(r.cases)),
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  async save(entity: Case, tx?: unknown): Promise<Case> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      caseNumber: entity.caseNumber.value,
      patientId: entity.patientId,
      patientName: entity.patientName,
      patientCountry: entity.patientCountry,
      patientLanguage: entity.patientLanguage,
      assignedHospitalId: entity.assignedHospitalId,
      primaryDiagnosis: entity.primaryDiagnosis,
      diagnosisCode: entity.diagnosisCode,
      symptoms: entity.symptoms as unknown as typeof cases.$inferInsert['symptoms'],
      medicalHistory: entity.medicalHistory,
      aiSummary: entity.aiSummary,
      aiSummaryLanguage: entity.aiSummaryLanguage,
      riskLevel: entity.riskLevel,
      status: entity.status,
      stage: entity.stage,
      assignedAt: entity.assignedAt ? entity.assignedAt.toISOString() : null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
      assignmentStatus: entity.assignmentStatus,
      treatmentStage: entity.treatmentStage,
      conditionSummary: entity.conditionSummary,
      structuredData: entity.structuredData,
      riskFlags: entity.riskFlags as unknown as typeof cases.$inferInsert['riskFlags'],
      priority: entity.priority,
      lastEventAt: entity.lastEventAt?.toISOString() ?? null,
      aiSummaryStatus: entity.aiSummaryStatus,
      questionCollectorTemplateId: entity.questionCollectorTemplateId,
      // undefined → column omitted on insert so the DB default (WEB_ONBOARDING) applies;
      // both fields are immutable after creation and intentionally excluded from the upsert set below.
      sourceChannel: entity.sourceChannel ?? undefined,
      createdByAdminId: entity.createdByAdminId ?? undefined,
    };

    const rows = await this.conn(tx)
      .insert(cases)
      .values(values)
      .onConflictDoUpdate({
        target: cases.id,
        set: {
          patientName: values.patientName,
          patientCountry: values.patientCountry,
          patientLanguage: values.patientLanguage,
          assignedHospitalId: values.assignedHospitalId,
          primaryDiagnosis: values.primaryDiagnosis,
          diagnosisCode: values.diagnosisCode,
          symptoms: values.symptoms,
          medicalHistory: values.medicalHistory,
          aiSummary: values.aiSummary,
          aiSummaryLanguage: values.aiSummaryLanguage,
          riskLevel: values.riskLevel,
          status: values.status,
          stage: values.stage,
          assignedAt: values.assignedAt,
          updatedAt: now,
          assignmentStatus: values.assignmentStatus,
          treatmentStage: values.treatmentStage,
          conditionSummary: values.conditionSummary,
          structuredData: values.structuredData,
          riskFlags: values.riskFlags,
          priority: values.priority,
          lastEventAt: values.lastEventAt,
          aiSummaryStatus: values.aiSummaryStatus,
          questionCollectorTemplateId: values.questionCollectorTemplateId,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async nextCaseNumber(): Promise<CaseNumber> {
    const year = new Date().getFullYear();
    const prefix = `CASE-${year}-%`;

    // Extract numeric suffix and MAX on integer to avoid lexicographic string comparison issues
    const result = await withTransientDatabaseRetry(
      'compute next case number',
      () => this.db
        .select({
          maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(${cases.caseNumber}, '-', 3) AS INTEGER)), 0)`,
        })
        .from(cases)
        .where(ilike(cases.caseNumber, prefix)),
    );

    const nextSeq = (result[0]?.maxSeq ?? 0) + 1;
    return CaseNumber.generate(year, nextSeq);
  }

  async countByFilters(filters: CaseCountFilters): Promise<CaseStats> {
    const conditions = [];
    if (filters.hospitalId) conditions.push(this.buildHospitalAccessCondition(filters.hospitalId));
    const patientSiteCondition = patientSiteScopeSql(sql`${users.patientSite}`, filters.patientSiteScope);
    if (patientSiteCondition) conditions.push(patientSiteCondition);
    const excludedEmailCondition = this.buildExcludedPatientEmailDomainsCondition(filters.excludedPatientEmailDomains);
    if (excludedEmailCondition) conditions.push(excludedEmailCondition);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await withTransientDatabaseRetry(
      'load case stats',
      () => this.db
        .select({
          total: count(),
          unassigned: sql<number>`COUNT(*) FILTER (WHERE ${cases.assignmentStatus} = 'UNASSIGNED')`,
          assigned: sql<number>`COUNT(*) FILTER (WHERE ${cases.assignmentStatus} = 'ASSIGNED')`,
          inTreatment: sql<number>`COUNT(*) FILTER (WHERE ${cases.treatmentStage} = 'IN_TREATMENT')`,
          postTreatment: sql<number>`COUNT(*) FILTER (WHERE ${cases.treatmentStage} = 'POST_TREATMENT')`,
          completed: sql<number>`COUNT(*) FILTER (WHERE ${cases.treatmentStage} = 'COMPLETED')`,
          followUp: sql<number>`COUNT(*) FILTER (WHERE ${cases.treatmentStage} = 'FOLLOW_UP')`,
        })
        .from(cases)
        .innerJoin(users, eq(cases.patientId, users.id))
        .where(where),
    );

    const r = result[0]!;
    return {
      total: Number(r.total),
      unassigned: Number(r.unassigned),
      assigned: Number(r.assigned),
      inTreatment: Number(r.inTreatment),
      postTreatment: Number(r.postTreatment),
      completed: Number(r.completed),
      followUp: Number(r.followUp),
    };
  }

  async findByPatientId(patientId: string): Promise<Case[]> {
    const rows = await withTransientDatabaseRetry(
      'load cases by patient id',
      () => this.db
        .select()
        .from(cases)
        .where(eq(cases.patientId, patientId))
        .orderBy(sql`${cases.createdAt} DESC`),
    );

    return rows.map((r) => this.rowToEntity(r));
  }

  private rowToEntity(row: typeof cases.$inferSelect): Case {
    return new Case({
      id: row.id,
      caseNumber: new CaseNumber(row.caseNumber),
      patientId: row.patientId,
      patientName: row.patientName,
      patientCountry: row.patientCountry ?? null,
      patientLanguage: row.patientLanguage,
      assignedHospitalId: row.assignedHospitalId ?? null,
      primaryDiagnosis: row.primaryDiagnosis ?? null,
      diagnosisCode: row.diagnosisCode ?? null,
      symptoms: (row.symptoms as string[] | null) ?? null,
      medicalHistory: row.medicalHistory ?? null,
      aiSummary: row.aiSummary ?? null,
      aiSummaryLanguage: row.aiSummaryLanguage ?? null,
      riskLevel: (row.riskLevel as import('@medical-crm/domain').RiskLevel | null) ?? null,
      status: row.status as import('@medical-crm/domain').CaseStatus,
      stage: row.stage as import('@medical-crm/domain').CaseStage,
      assignedAt: row.assignedAt ? new Date(row.assignedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      assignmentStatus: (row.assignmentStatus as import('@medical-crm/domain').CaseAssignmentStatus) ?? 'UNASSIGNED',
      treatmentStage: (row.treatmentStage as import('@medical-crm/domain').CaseTreatmentStage | null) ?? null,
      conditionSummary: (row.conditionSummary as string | null) ?? null,
      structuredData: (row.structuredData as Record<string, unknown> | null) ?? null,
      riskFlags: (row.riskFlags as string[] | null) ?? null,
      priority: row.priority ?? null,
      lastEventAt: row.lastEventAt ? new Date(row.lastEventAt) : null,
      aiSummaryStatus: (row.aiSummaryStatus as import('@medical-crm/domain').AISummaryStatusType) ?? 'PENDING',
      questionCollectorTemplateId: row.questionCollectorTemplateId ?? null,
      sourceChannel: (row.sourceChannel as import('@medical-crm/domain').CaseSourceChannel | null) ?? null,
      createdByAdminId: row.createdByAdminId ?? null,
    });
  }
}
