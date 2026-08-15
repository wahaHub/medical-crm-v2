import { eq, and, count, sql, inArray } from 'drizzle-orm';
import type { IConversationRepository, ConversationListQuery } from '@medical-crm/domain';
import { Conversation } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import type { Transaction } from '@medical-crm/domain';
import { conversations } from '../schema/index.js';
import { cases } from '../schema/index.js';
import { users } from '../schema/index.js';
import { withTransientDatabaseRetry } from '../transient-db-retry.js';
import { patientSiteScopeSql } from './patient-site-scope-sql.js';

type ConversationRow = typeof conversations.$inferSelect;

export class DrizzleConversationRepository implements IConversationRepository {
  constructor(private readonly db: CrmDb) {}

  private hasUniqueViolation(err: unknown, indexNames: string[]): boolean {
    let current: unknown = err;
    while (current) {
      if (current instanceof Error) {
        const message = current.message.toLowerCase();
        if (
          indexNames.some((indexName) => message.includes(indexName.toLowerCase()))
          || message.includes('duplicate key value')
        ) {
          return true;
        }
      }
      current =
        typeof current === 'object'
          && current !== null
          && 'cause' in current
          ? (current as { cause?: unknown }).cause
          : undefined;
    }

    return false;
  }

  private isAdminPatientCaseUniqueViolation(err: unknown): boolean {
    return this.hasUniqueViolation(err, [
      'conversations_admin_patient_case_unique',
      'conversations_admin_patient_case_unique_idx',
    ]);
  }

  private isHospitalPatientCaseHospitalUniqueViolation(err: unknown): boolean {
    return this.hasUniqueViolation(err, [
      'conversations_hospital_patient_case_hospital_unique',
      'conversations_hospital_patient_case_hospital_unique_idx',
    ]);
  }

  async findById(id: string, tx?: Transaction): Promise<Conversation | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await withTransientDatabaseRetry(
      'load conversation by id',
      () => db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id))
        .limit(1),
    );

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByIdForUpdate(id: string, tx?: Transaction): Promise<Conversation | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1)
      .for('update');

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findMany(query: ConversationListQuery, hospitalId?: string, tx?: Transaction): Promise<PaginatedResult<Conversation>> {
    const { page, limit, category, caseId, patientSiteScope } = query;
    const db = (tx as CrmDb | undefined) ?? this.db;

    const conditions = [];
    if (category) conditions.push(eq(conversations.category, category));
    if (caseId) conditions.push(eq(conversations.caseId, caseId));
    if (hospitalId) conditions.push(eq(conversations.hospitalId, hospitalId));
    const siteCondition = patientSiteScopeSql(sql`${users.patientSite}`, patientSiteScope);
    if (siteCondition) conditions.push(siteCondition);
    const excludedEmailCondition = this.buildExcludedPatientEmailDomainsCondition(query.excludedPatientEmailDomains);
    if (excludedEmailCondition) conditions.push(excludedEmailCondition);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const needsPatientJoin = Boolean(patientSiteScope);

    const [rows, countResult] = needsPatientJoin
      ? await withTransientDatabaseRetry(
          'list conversations',
          () => Promise.all([
            db
              .select({ conversations })
              .from(conversations)
              .innerJoin(cases, eq(conversations.caseId, cases.id))
              .innerJoin(users, eq(cases.patientId, users.id))
              .where(where)
              .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`)
              .limit(limit)
              .offset((page - 1) * limit),
            db
              .select({ total: count() })
              .from(conversations)
              .innerJoin(cases, eq(conversations.caseId, cases.id))
              .innerJoin(users, eq(cases.patientId, users.id))
              .where(where),
          ]),
        )
      : await withTransientDatabaseRetry(
          'list conversations',
          () => Promise.all([
            db
              .select()
              .from(conversations)
              .where(where)
              .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`)
              .limit(limit)
              .offset((page - 1) * limit),
            db
              .select({ total: count() })
              .from(conversations)
              .where(where),
          ]),
        );

    const total = Number(countResult[0]?.total ?? 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: patientSiteScope
        ? (rows as Array<{ conversations: ConversationRow }>).map((r) => this.rowToEntity(r.conversations))
        : (rows as ConversationRow[]).map((r) => this.rowToEntity(r)),
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  private buildExcludedPatientEmailDomainsCondition(domains?: readonly string[]) {
    const patterns = (domains ?? [])
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
      .filter((domain) => domain.length > 0)
      .map((domain) => `%@${domain}`);

    if (patterns.length === 0) return undefined;

    return sql`(
      ${conversations.caseId} is null
      or not exists (
        select 1
        from ${cases}
        inner join ${users} on ${cases.patientId} = ${users.id}
        where ${cases.id} = ${conversations.caseId}
          and (${sql.join(
            patterns.map((pattern) => sql`lower(trim(${users.email})) like ${pattern}`),
            sql` or `,
          )})
      )
    )`;
  }

  async findByPatientId(patientId: string, tx?: Transaction): Promise<Conversation[]> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    // Conversations are linked to patients via cases.patientId
    const patientCaseIds = db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.patientId, patientId));

    const rows = await withTransientDatabaseRetry(
      'list conversations by patient id',
      () => db
        .select()
        .from(conversations)
        .where(inArray(conversations.caseId, patientCaseIds))
        .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`),
    );

    return rows.map((r) => this.rowToEntity(r));
  }

  async hasPatientAccess(patientId: string, conversationId: string, tx?: Transaction): Promise<boolean> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await withTransientDatabaseRetry(
      'check patient conversation access',
      () => db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(cases, eq(conversations.caseId, cases.id))
        .where(and(
          eq(cases.patientId, patientId),
          eq(conversations.id, conversationId),
        ))
        .limit(1),
    );

    return rows.length > 0;
  }

  async findAdminPatientByCaseId(caseId: string, tx?: Transaction): Promise<Conversation | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.caseId, caseId),
        eq(conversations.category, 'ADMIN_PATIENT'),
      ))
      .orderBy(conversations.createdAt)
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return this.rowToEntity(rows[0]!);
  }

  async findHospitalPatientByCaseAndHospitalId(
    caseId: string,
    hospitalId: string,
    tx?: Transaction,
  ): Promise<Conversation | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.caseId, caseId),
        eq(conversations.hospitalId, hospitalId),
        eq(conversations.category, 'HOSPITAL_PATIENT'),
      ))
      .orderBy(conversations.createdAt)
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return this.rowToEntity(rows[0]!);
  }

  async save(entity: Conversation, tx?: Transaction): Promise<Conversation> {
    const now = new Date().toISOString();
    const db = (tx as CrmDb | undefined) ?? this.db;
    const values = {
      id: entity.id,
      caseId: entity.caseId,
      category: entity.category,
      title: entity.title,
      hospitalId: entity.hospitalId,
      assistantMode: entity.assistantMode,
      lastMessageId: entity.lastMessageId,
      lastMessageAt: entity.lastMessageAt ? entity.lastMessageAt.toISOString() : null,
      lastMessagePreview: entity.lastMessagePreview,
      lastSenderId: entity.lastSenderId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(conversations)
      .values(values)
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          caseId: values.caseId,
          category: values.category,
          title: values.title,
          hospitalId: values.hospitalId,
          assistantMode: values.assistantMode,
          lastMessageId: values.lastMessageId,
          lastMessageAt: values.lastMessageAt,
          lastMessagePreview: values.lastMessagePreview,
          lastSenderId: values.lastSenderId,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async compareAndSetAssistantMode(
    id: string,
    fromMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
    toMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
    tx?: Transaction,
  ): Promise<Conversation | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await db
      .update(conversations)
      .set({
        assistantMode: toMode,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(conversations.id, id),
        eq(conversations.assistantMode, fromMode),
      ))
      .returning();

    if (rows.length === 0) {
      return null;
    }

    return this.rowToEntity(rows[0]!);
  }

  async findOrCreateAdminPatientConversation(entity: Conversation, tx?: Transaction): Promise<Conversation> {
    if (entity.category !== 'ADMIN_PATIENT' || !entity.caseId) {
      return this.save(entity, tx);
    }

    if (!tx) {
      return this.db.transaction(async (innerTx) =>
        this.findOrCreateAdminPatientConversation(entity, innerTx as unknown as Transaction),
      );
    }

    const db = tx as CrmDb;
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${entity.caseId}), hashtext('ADMIN_PATIENT'))`,
    );

    const existing = await this.findAdminPatientByCaseId(entity.caseId, tx);
    if (existing) {
      return existing;
    }

    try {
      return await this.save(entity, tx);
    } catch (err) {
      if (!this.isAdminPatientCaseUniqueViolation(err)) {
        throw err;
      }

      const resolved = await this.findAdminPatientByCaseId(entity.caseId, tx);
      if (resolved) {
        return resolved;
      }

      throw err;
    }
  }

  async findOrCreateHospitalPatientConversation(entity: Conversation, tx?: Transaction): Promise<Conversation> {
    if (entity.category !== 'HOSPITAL_PATIENT' || !entity.caseId || !entity.hospitalId) {
      return this.save(entity, tx);
    }

    if (!tx) {
      return this.db.transaction(async (innerTx) =>
        this.findOrCreateHospitalPatientConversation(entity, innerTx as unknown as Transaction),
      );
    }

    const db = tx as CrmDb;
    const conversationKey = `${entity.caseId}:${entity.hospitalId}`;
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${conversationKey}), hashtext('HOSPITAL_PATIENT'))`,
    );

    const existing = await this.findHospitalPatientByCaseAndHospitalId(
      entity.caseId,
      entity.hospitalId,
      tx,
    );
    if (existing) {
      return existing;
    }

    try {
      return await this.save(entity, tx);
    } catch (err) {
      if (!this.isHospitalPatientCaseHospitalUniqueViolation(err)) {
        throw err;
      }

      const resolved = await this.findHospitalPatientByCaseAndHospitalId(
        entity.caseId,
        entity.hospitalId,
        tx,
      );
      if (resolved) {
        return resolved;
      }

      throw err;
    }
  }

  private rowToEntity(row: typeof conversations.$inferSelect): Conversation {
    return new Conversation({
      id: row.id,
      caseId: row.caseId ?? null,
      category: row.category as import('@medical-crm/domain').ConversationCategory,
      title: row.title ?? null,
      hospitalId: row.hospitalId ?? null,
      assistantMode: row.assistantMode,
      lastMessageId: row.lastMessageId ?? null,
      lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt) : null,
      lastMessagePreview: row.lastMessagePreview ?? null,
      lastSenderId: row.lastSenderId ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
