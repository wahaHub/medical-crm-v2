import { eq, desc } from 'drizzle-orm';
import type { ICaseProgressRepository } from '@medical-crm/domain';
import { CaseProgress } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { caseProgress } from '../schema/index.js';

export class DrizzleCaseProgressRepository implements ICaseProgressRepository {
  constructor(private readonly db: CrmDb) {}

  async findByCaseId(caseId: string): Promise<CaseProgress[]> {
    const rows = await this.db
      .select()
      .from(caseProgress)
      .where(eq(caseProgress.caseId, caseId))
      .orderBy(desc(caseProgress.recordedAt));

    return rows.map((r) => this.rowToEntity(r));
  }

  async save(entity: CaseProgress): Promise<CaseProgress> {
    const rows = await this.db
      .insert(caseProgress)
      .values({
        id: entity.id,
        caseId: entity.caseId,
        title: entity.title,
        description: entity.description,
        progressType: entity.progressType,
        // CRITICAL mapping: entity.metadata → db column video_summary (videoSummary)
        videoSummary: entity.metadata as typeof caseProgress.$inferInsert['videoSummary'],
        recordedAt: entity.recordedAt.toISOString(),
        recordedById: entity.recordedById,
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  private rowToEntity(row: typeof caseProgress.$inferSelect): CaseProgress {
    return new CaseProgress({
      id: row.id,
      caseId: row.caseId,
      title: row.title,
      description: row.description ?? null,
      progressType: row.progressType as import('@medical-crm/domain').ProgressType,
      // CRITICAL mapping: db column video_summary (videoSummary) → entity.metadata
      metadata: (row.videoSummary as Record<string, unknown> | null) ?? null,
      recordedAt: new Date(row.recordedAt),
      recordedById: row.recordedById ?? null,
    });
  }
}
