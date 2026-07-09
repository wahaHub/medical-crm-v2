import { eq, and, sql, ne, count, ilike, type SQL } from 'drizzle-orm';
import type { IQuoteRepository, QuoteListQuery } from '@medical-crm/domain';
import { Quote, QuoteNumber } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { cases, quotes, users } from '../schema/index.js';
import { patientSiteScopeSql } from './patient-site-scope-sql.js';

type QuoteRow = typeof quotes.$inferSelect;

export class DrizzleQuoteRepository implements IQuoteRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string, tx?: unknown): Promise<Quote | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByCaseId(caseId: string, tx?: unknown): Promise<Quote[]> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(quotes)
      .where(eq(quotes.caseId, caseId))
      .orderBy(sql`${quotes.createdAt} DESC`);

    return rows.map((r) => this.rowToEntity(r));
  }

  async findByHospitalId(
    hospitalId: string,
    query: QuoteListQuery,
  ): Promise<{ data: Quote[]; total: number }> {
    const { page, limit, status } = query;

    const conditions: SQL[] = [eq(quotes.hospitalId, hospitalId)];
    if (query.caseId) {
      conditions.push(eq(quotes.caseId, query.caseId));
    }
    if (status) {
      conditions.push(
        eq(quotes.status, status as typeof quotes.status.enumValues[number]),
      );
    }
    const patientSiteCondition = patientSiteScopeSql(sql`${users.patientSite}`, query.patientSiteScope);
    if (patientSiteCondition) conditions.push(patientSiteCondition);
    const excludedEmailCondition = this.buildExcludedPatientEmailDomainsCondition(query.excludedPatientEmailDomains);
    if (excludedEmailCondition) conditions.push(excludedEmailCondition);

    const where = and(...conditions);
    const needsPatientJoin = Boolean(
      query.patientSiteScope || query.excludedPatientEmailDomains?.length,
    );

    const [rows, countResult] = needsPatientJoin
      ? await Promise.all([
          this.db
            .select({ quotes })
            .from(quotes)
            .innerJoin(cases, eq(quotes.caseId, cases.id))
            .innerJoin(users, eq(cases.patientId, users.id))
            .where(where)
            .orderBy(sql`${quotes.createdAt} DESC`)
            .limit(limit)
            .offset((page - 1) * limit),
          this.db
            .select({ total: count() })
            .from(quotes)
            .innerJoin(cases, eq(quotes.caseId, cases.id))
            .innerJoin(users, eq(cases.patientId, users.id))
            .where(where),
        ])
      : await Promise.all([
          this.db
            .select()
            .from(quotes)
            .where(where)
            .orderBy(sql`${quotes.createdAt} DESC`)
            .limit(limit)
            .offset((page - 1) * limit),
          this.db
            .select({ total: count() })
            .from(quotes)
            .where(where),
        ]);

    return {
      data: needsPatientJoin
        ? (rows as Array<{ quotes: QuoteRow }>).map((r) => this.rowToEntity(r.quotes))
        : (rows as QuoteRow[]).map((r) => this.rowToEntity(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
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

  async save(entity: Quote, tx?: unknown): Promise<Quote> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      caseId: entity.caseId,
      hospitalId: entity.hospitalId,
      quoteNumber: entity.quoteNumber.value,
      version: entity.version,
      status: entity.status as typeof quotes.status.enumValues[number],
      isDraft: entity.isDraft,
      totalAmount: entity.totalAmount,
      currency: entity.currency,
      validUntil: entity.validUntil.toISOString(),
      treatmentPlan: entity.treatmentPlan,
      lineItems: entity.lineItems as typeof quotes.$inferInsert['lineItems'],
      notes: entity.notes,
      sentAt: entity.sentAt ? entity.sentAt.toISOString() : null,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(quotes)
      .values(values)
      .onConflictDoUpdate({
        target: quotes.id,
        set: {
          version: sql`${quotes.version} + 1`,
          status: values.status,
          isDraft: values.isDraft,
          totalAmount: values.totalAmount,
          currency: values.currency,
          validUntil: values.validUntil,
          treatmentPlan: values.treatmentPlan,
          lineItems: values.lineItems,
          notes: values.notes,
          sentAt: values.sentAt,
          updatedAt: now,
        },
        setWhere: eq(quotes.version, entity.version),
      })
      .returning();

    if (rows.length === 0) {
      throw new Error(`Optimistic lock conflict: Quote ${entity.id} was modified concurrently`);
    }

    return this.rowToEntity(rows[0]!);
  }

  async nextQuoteNumber(): Promise<string> {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const prefix = `QT-${y}${m}${d}-%`;

    // Extract numeric suffix and MAX on integer to avoid lexicographic issues
    const result = await this.db
      .select({
        maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(${quotes.quoteNumber}, '-', 3) AS INTEGER)), 0)`,
      })
      .from(quotes)
      .where(ilike(quotes.quoteNumber, prefix));

    const nextSeq = (result[0]?.maxSeq ?? 0) + 1;
    const qn = QuoteNumber.generate(nextSeq);
    return qn.value;
  }

  async rejectPendingByCaseExcept(
    caseId: string,
    excludeQuoteId: string,
    tx?: unknown,
  ): Promise<void> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();

    await db
      .update(quotes)
      .set({
        status: 'REJECTED' as typeof quotes.status.enumValues[number],
        updatedAt: now,
      })
      .where(
        and(
          eq(quotes.caseId, caseId),
          ne(quotes.id, excludeQuoteId),
          eq(quotes.status, 'PENDING'),
        ),
      );
  }

  private rowToEntity(row: typeof quotes.$inferSelect): Quote {
    return new Quote({
      id: row.id,
      caseId: row.caseId,
      hospitalId: row.hospitalId,
      quoteNumber: new QuoteNumber(row.quoteNumber),
      version: row.version,
      status: row.status as import('@medical-crm/domain').QuoteStatus,
      isDraft: row.isDraft,
      totalAmount: row.totalAmount,
      currency: row.currency,
      validUntil: new Date(row.validUntil),
      treatmentPlan: row.treatmentPlan ?? null,
      lineItems: row.lineItems ?? null,
      notes: row.notes ?? null,
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
      createdBy: row.createdBy ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
