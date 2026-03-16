import { eq, and, sql, count, desc } from 'drizzle-orm';
import type { IQuestionCollectorRepository, QCTemplateListQuery, QCResponseListQuery } from '@medical-crm/domain';
import { QCTemplate, QCResponse, QCCustomization } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { questionCollectorTemplates, questionCollectorResponses, questionCollectorCustomizations } from '../schema/index.js';

export class DrizzleQuestionCollectorRepository implements IQuestionCollectorRepository {
  constructor(private readonly db: CrmDb) {}

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  async findTemplateById(id: string): Promise<QCTemplate | null> {
    const rows = await this.db
      .select()
      .from(questionCollectorTemplates)
      .where(eq(questionCollectorTemplates.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToTemplate(rows[0]!);
  }

  async findAllTemplates(query: QCTemplateListQuery): Promise<{ data: QCTemplate[]; total: number }> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.isActive !== undefined) {
      conditions.push(eq(questionCollectorTemplates.isActive, query.isActive));
    }
    if (query.category) {
      conditions.push(eq(questionCollectorTemplates.category, query.category));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const { page, limit } = query;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(questionCollectorTemplates)
        .where(where)
        .orderBy(desc(questionCollectorTemplates.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(questionCollectorTemplates)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.rowToTemplate(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  async saveTemplate(entity: QCTemplate): Promise<QCTemplate> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      templateName: entity.templateName,
      category: entity.category,
      procedureTypes: entity.procedureTypes,
      questions: entity.questions,
      version: entity.version,
      isActive: entity.isActive,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(questionCollectorTemplates)
      .values(values)
      .onConflictDoUpdate({
        target: questionCollectorTemplates.id,
        set: {
          templateName: values.templateName,
          category: values.category,
          procedureTypes: values.procedureTypes,
          questions: values.questions,
          version: values.version,
          isActive: values.isActive,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToTemplate(rows[0]!);
  }

  // ---------------------------------------------------------------------------
  // Responses
  // ---------------------------------------------------------------------------

  async findResponseById(id: string): Promise<QCResponse | null> {
    const rows = await this.db
      .select()
      .from(questionCollectorResponses)
      .where(eq(questionCollectorResponses.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToResponse(rows[0]!);
  }

  async findResponseByCaseId(caseId: string): Promise<QCResponse | null> {
    const rows = await this.db
      .select()
      .from(questionCollectorResponses)
      .where(eq(questionCollectorResponses.caseId, caseId))
      .orderBy(desc(questionCollectorResponses.createdAt))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToResponse(rows[0]!);
  }

  async findAllResponses(query: QCResponseListQuery): Promise<{ data: QCResponse[]; total: number }> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.caseId) {
      conditions.push(eq(questionCollectorResponses.caseId, query.caseId));
    }
    if (query.completionStatus) {
      conditions.push(
        eq(
          questionCollectorResponses.completionStatus,
          query.completionStatus as typeof questionCollectorResponses.completionStatus.enumValues[number],
        ),
      );
    }
    if (query.hasRiskFlags === true) {
      conditions.push(sql`array_length(${questionCollectorResponses.riskFlags}, 1) > 0`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const { page, limit } = query;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(questionCollectorResponses)
        .where(where)
        .orderBy(desc(questionCollectorResponses.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: count() })
        .from(questionCollectorResponses)
        .where(where),
    ]);

    return {
      data: rows.map((r) => this.rowToResponse(r)),
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  async saveResponse(entity: QCResponse): Promise<QCResponse> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      caseId: entity.caseId,
      templateId: entity.templateId,
      userId: entity.userId,
      responses: entity.responses,
      extractedData: entity.extractedData,
      riskFlags: entity.riskFlags,
      completionStatus: entity.completionStatus as typeof questionCollectorResponses.completionStatus.enumValues[number],
      submittedAt: entity.submittedAt ? entity.submittedAt.toISOString() : null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(questionCollectorResponses)
      .values(values)
      .onConflictDoUpdate({
        target: questionCollectorResponses.id,
        set: {
          responses: values.responses,
          extractedData: values.extractedData,
          riskFlags: values.riskFlags,
          completionStatus: values.completionStatus,
          submittedAt: values.submittedAt,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToResponse(rows[0]!);
  }

  // ---------------------------------------------------------------------------
  // Customizations
  // ---------------------------------------------------------------------------

  async findCustomization(templateId: string, hospitalId: string): Promise<QCCustomization | null> {
    const rows = await this.db
      .select()
      .from(questionCollectorCustomizations)
      .where(
        and(
          eq(questionCollectorCustomizations.templateId, templateId),
          eq(questionCollectorCustomizations.hospitalId, hospitalId),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToCustomization(rows[0]!);
  }

  async saveCustomization(entity: QCCustomization): Promise<QCCustomization> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      templateId: entity.templateId,
      hospitalId: entity.hospitalId,
      customizedQuestions: entity.customizedQuestions,
      customizedBy: entity.customizedBy,
      customizedAt: entity.customizedAt ? entity.customizedAt.toISOString() : null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(questionCollectorCustomizations)
      .values(values)
      .onConflictDoUpdate({
        target: [questionCollectorCustomizations.templateId, questionCollectorCustomizations.hospitalId],
        set: {
          customizedQuestions: values.customizedQuestions,
          customizedBy: values.customizedBy,
          customizedAt: values.customizedAt,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToCustomization(rows[0]!);
  }

  // ---------------------------------------------------------------------------
  // Row-to-entity mappers
  // ---------------------------------------------------------------------------

  private rowToTemplate(row: typeof questionCollectorTemplates.$inferSelect): QCTemplate {
    return new QCTemplate({
      id: row.id,
      templateName: row.templateName,
      category: row.category,
      procedureTypes: (row.procedureTypes as string[]) ?? [],
      questions: row.questions,
      version: row.version,
      isActive: row.isActive,
      createdBy: row.createdBy ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  private rowToResponse(row: typeof questionCollectorResponses.$inferSelect): QCResponse {
    return new QCResponse({
      id: row.id,
      caseId: row.caseId,
      templateId: row.templateId,
      userId: row.userId,
      responses: row.responses,
      extractedData: row.extractedData ?? null,
      riskFlags: (row.riskFlags as string[]) ?? [],
      completionStatus: row.completionStatus as import('@medical-crm/domain').QCCompletionStatus,
      submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  private rowToCustomization(row: typeof questionCollectorCustomizations.$inferSelect): QCCustomization {
    return new QCCustomization({
      id: row.id,
      templateId: row.templateId,
      hospitalId: row.hospitalId,
      customizedQuestions: row.customizedQuestions,
      customizedBy: row.customizedBy ?? null,
      customizedAt: row.customizedAt ? new Date(row.customizedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
