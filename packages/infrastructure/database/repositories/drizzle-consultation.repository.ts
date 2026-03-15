import { eq, and, lt, count, sql } from 'drizzle-orm';
import type {
  IConsultationRepository,
  ConsultationListQueryType as ConsultationListQuery,
  ConsultationCountFilters,
  ConsultationStats,
} from '@medical-crm/domain';
import { Consultation } from '@medical-crm/domain';
import type { CursorPaginatedResult } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import { consultations } from '../schema/index.js';

export class DrizzleConsultationRepository implements IConsultationRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string): Promise<Consultation | null> {
    const rows = await this.db
      .select()
      .from(consultations)
      .where(eq(consultations.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findMany(query: ConsultationListQuery): Promise<CursorPaginatedResult<Consultation>> {
    const { cursor, limit, hospitalId, caseId, status } = query;

    const conditions = [];
    if (hospitalId) conditions.push(eq(consultations.hospitalId, hospitalId));
    if (caseId) conditions.push(eq(consultations.caseId, caseId));
    if (status) conditions.push(eq(consultations.status, status));

    // Cursor-based pagination: composite (scheduledAt, id) DESC
    if (cursor) {
      conditions.push(
        lt(
          sql`(${consultations.scheduledAt}, ${consultations.id})`,
          sql`(${cursor.scheduledAt}::timestamp, ${cursor.id}::uuid)`,
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(consultations)
      .where(where)
      .orderBy(sql`${consultations.scheduledAt} DESC, ${consultations.id} DESC`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: { scheduledAt: string; id: string } | null = null;
    if (hasMore) {
      const last = data[data.length - 1]!;
      nextCursor = {
        scheduledAt: last.scheduledAt,
        id: last.id,
      };
    }

    return {
      data: data.map((r) => this.rowToEntity(r)),
      nextCursor,
      hasMore,
    };
  }

  async findByCaseId(caseId: string): Promise<Consultation[]> {
    const rows = await this.db
      .select()
      .from(consultations)
      .where(eq(consultations.caseId, caseId));

    return rows.map((r) => this.rowToEntity(r));
  }

  async save(entity: Consultation): Promise<Consultation> {
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      caseId: entity.caseId,
      hospitalId: entity.hospitalId,
      patientId: entity.patientId,
      doctorId: entity.doctorId,
      status: entity.status,
      scheduledAt: entity.scheduledAt.toISOString(),
      startedAt: entity.startedAt ? entity.startedAt.toISOString() : null,
      endedAt: entity.endedAt ? entity.endedAt.toISOString() : null,
      durationMinutes: entity.durationMinutes,
      actualDuration: entity.actualDuration,
      consultationLink: entity.consultationLink,
      aiTranslation: entity.aiTranslation,
      patientLanguage: entity.patientLanguage,
      notes: entity.notes,
      videoStorageKey: entity.videoStorageKey,
      videoSize: entity.videoSize,
      videoDuration: entity.videoDuration,
      videoThumbnail: entity.videoThumbnail,
      videoUploadedAt: entity.videoUploadedAt ? entity.videoUploadedAt.toISOString() : null,
      aiSummary: entity.aiSummary as unknown as typeof consultations.$inferInsert['aiSummary'],
      aiSummaryCreatedAt: entity.aiSummaryCreatedAt ? entity.aiSummaryCreatedAt.toISOString() : null,
      aiSummaryStatus: entity.aiSummaryStatus,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(consultations)
      .values(values)
      .onConflictDoUpdate({
        target: consultations.id,
        set: {
          status: values.status,
          startedAt: values.startedAt,
          endedAt: values.endedAt,
          actualDuration: values.actualDuration,
          consultationLink: values.consultationLink,
          aiTranslation: values.aiTranslation,
          notes: values.notes,
          videoStorageKey: values.videoStorageKey,
          videoSize: values.videoSize,
          videoDuration: values.videoDuration,
          videoThumbnail: values.videoThumbnail,
          videoUploadedAt: values.videoUploadedAt,
          aiSummary: values.aiSummary,
          aiSummaryCreatedAt: values.aiSummaryCreatedAt,
          aiSummaryStatus: values.aiSummaryStatus,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async countByFilters(filters: ConsultationCountFilters): Promise<ConsultationStats> {
    const { hospitalId } = filters;

    const baseCondition = hospitalId ? eq(consultations.hospitalId, hospitalId) : undefined;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const result = await this.db
      .select({
        total: count(),
        scheduled: sql<number>`COUNT(*) FILTER (WHERE ${consultations.status} = 'SCHEDULED')`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${consultations.status} = 'COMPLETED')`,
        todayCount: sql<number>`COUNT(*) FILTER (WHERE ${consultations.scheduledAt} >= ${todayIso}::timestamp AND ${consultations.scheduledAt} < (${todayIso}::timestamp + INTERVAL '1 day'))`,
        needsTranslation: sql<number>`COUNT(*) FILTER (WHERE ${consultations.aiTranslation} = true AND ${consultations.status} = 'SCHEDULED')`,
      })
      .from(consultations)
      .where(baseCondition);

    const row = result[0];
    return {
      total: Number(row?.total ?? 0),
      scheduled: Number(row?.scheduled ?? 0),
      completed: Number(row?.completed ?? 0),
      todayCount: Number(row?.todayCount ?? 0),
      needsTranslation: Number(row?.needsTranslation ?? 0),
    };
  }

  private rowToEntity(row: typeof consultations.$inferSelect): Consultation {
    return new Consultation({
      id: row.id,
      caseId: row.caseId,
      hospitalId: row.hospitalId,
      patientId: row.patientId,
      doctorId: row.doctorId ?? null,
      status: row.status as import('@medical-crm/domain').ConsultationStatus,
      scheduledAt: new Date(row.scheduledAt),
      startedAt: row.startedAt ? new Date(row.startedAt) : null,
      endedAt: row.endedAt ? new Date(row.endedAt) : null,
      durationMinutes: row.durationMinutes,
      actualDuration: row.actualDuration ?? null,
      consultationLink: row.consultationLink ?? null,
      aiTranslation: row.aiTranslation,
      patientLanguage: row.patientLanguage,
      notes: row.notes ?? null,
      videoStorageKey: row.videoStorageKey ?? null,
      videoSize: row.videoSize ?? null,
      videoDuration: row.videoDuration ?? null,
      videoThumbnail: row.videoThumbnail ?? null,
      videoUploadedAt: row.videoUploadedAt ? new Date(row.videoUploadedAt) : null,
      aiSummary: row.aiSummary ?? null,
      aiSummaryCreatedAt: row.aiSummaryCreatedAt ? new Date(row.aiSummaryCreatedAt) : null,
      aiSummaryStatus: row.aiSummaryStatus as import('@medical-crm/domain').AISummaryStatus,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
