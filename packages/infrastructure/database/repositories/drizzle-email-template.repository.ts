import { eq, and, sql, count, isNull } from 'drizzle-orm';
import type { IEmailTemplateRepository, EmailTemplateListQuery } from '@medical-crm/domain';
import { EmailTemplate } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { emailTemplates } from '../schema/index.js';

export class DrizzleEmailTemplateRepository implements IEmailTemplateRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string): Promise<EmailTemplate | null> {
    const rows = await this.db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByHospital(
    hospitalId: string,
    query: EmailTemplateListQuery,
  ): Promise<{ data: EmailTemplate[]; total: number }> {
    const conditions: ReturnType<typeof eq>[] = [
      eq(emailTemplates.hospitalId, hospitalId),
      isNull(emailTemplates.deletedAt) as ReturnType<typeof eq>,
    ];

    if (query.type) {
      conditions.push(eq(emailTemplates.type, query.type));
    }
    if (query.status) {
      conditions.push(eq(emailTemplates.status, query.status));
    }

    const { page, limit } = query;
    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(emailTemplates)
        .where(where)
        .orderBy(sql`${emailTemplates.createdAt} DESC`)
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(emailTemplates)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.rowToEntity(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  async save(entity: EmailTemplate): Promise<EmailTemplate> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      hospitalId: entity.hospitalId,
      name: entity.name,
      type: entity.type,
      subject: entity.subject,
      body: entity.body,
      variables: entity.variables,
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
      deletedAt: entity.deletedAt ? entity.deletedAt.toISOString() : null,
    };

    const rows = await this.db
      .insert(emailTemplates)
      .values(values)
      .onConflictDoUpdate({
        target: emailTemplates.id,
        set: {
          name: values.name,
          type: values.type,
          subject: values.subject,
          body: values.body,
          variables: values.variables,
          status: values.status,
          updatedAt: now,
          deletedAt: values.deletedAt,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async softDelete(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(emailTemplates)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(emailTemplates.id, id));
  }

  private rowToEntity(row: typeof emailTemplates.$inferSelect): EmailTemplate {
    return new EmailTemplate({
      id: row.id,
      hospitalId: row.hospitalId,
      name: row.name,
      type: row.type,
      subject: row.subject,
      body: row.body,
      variables: Array.isArray(row.variables) ? (row.variables as string[]) : [],
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      deletedAt: row.deletedAt ? new Date(row.deletedAt) : null,
    });
  }
}
