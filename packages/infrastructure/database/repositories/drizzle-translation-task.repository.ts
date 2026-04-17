import { eq, sql, and, inArray } from 'drizzle-orm';
import {
  TranslationTask,
  TRANSLATION_CONFIG,
} from '@medical-crm/domain';
import type {
  ITranslationTaskRepository,
  EnqueueTranslationInput,
  TranslationTaskStatus,
  SourceDb,
} from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { translationTasks } from '../schema/index.js';
import { generateId } from '@medical-crm/utils';

type TranslationTaskRow = typeof translationTasks.$inferSelect;

export class DrizzleTranslationTaskRepository implements ITranslationTaskRepository {
  constructor(private readonly db: CrmDb) {}

  async upsert(input: EnqueueTranslationInput): Promise<TranslationTask> {
    const {
      sourceDb,
      entityType,
      entityId,
      hospitalType,
      fieldsToTranslate,
      targetLanguages,
      targetLanguage,
      chunkKey,
    } = input;

    const effectiveChunkKey = chunkKey ?? 'default';
    const effectiveTargetLanguage =
      targetLanguage ?? targetLanguages?.[0] ?? (TRANSLATION_CONFIG.defaultTargetLanguages[0] as string);
    const langs = [effectiveTargetLanguage];

    // Use a transaction: SELECT FOR UPDATE, then INSERT or UPDATE
    const row = await this.db.transaction(async (tx) => {
      // Look for an existing pending/processing task
      const existing = await tx
        .select()
        .from(translationTasks)
        .where(
          and(
            eq(translationTasks.sourceDb, sourceDb),
            eq(translationTasks.entityType, entityType),
            eq(translationTasks.entityId, entityId),
            eq(translationTasks.chunkKey, effectiveChunkKey),
            eq(translationTasks.targetLanguage, effectiveTargetLanguage),
            inArray(translationTasks.status, ['pending', 'processing']),
          ),
        )
        .limit(1)
        .for('update')
        .execute();

      if (existing.length > 0) {
        // Update existing task — merge fields and langs, keep status=pending
        const existingFieldsToTranslate =
          (existing[0] as Record<string, unknown>).fieldsToTranslate ??
          (existing[0] as Record<string, unknown>).fields_to_translate ??
          {};
        const updateResult = await tx
          .update(translationTasks)
          .set({
            fieldsToTranslate: {
              ...(existingFieldsToTranslate as Record<string, unknown>),
              ...fieldsToTranslate,
            },
            targetLanguages: langs,
            targetLanguage: effectiveTargetLanguage,
            chunkKey: effectiveChunkKey,
            status: 'pending',
          })
          .where(eq(translationTasks.id, existing[0]!.id))
          .returning();

        const updated = updateResult[0];
        if (!updated) {
          throw new Error('Failed to update translation task');
        }

        return updated;
      }

      // Insert new task
      const insertResult = await tx
        .insert(translationTasks)
        .values({
          id: generateId(),
          sourceDb,
          entityType,
          entityId,
          hospitalType: hospitalType ?? null,
          chunkKey: effectiveChunkKey,
          fieldsToTranslate,
          targetLanguages: langs,
          targetLanguage: effectiveTargetLanguage,
          status: 'pending',
          retryCount: 0,
          createdAt: new Date().toISOString(),
        })
        .returning();

      const inserted = insertResult[0];
      if (!inserted) {
        throw new Error('Failed to insert translation task');
      }

      return inserted;
    });

    return this.rowToEntity(row);
  }

  async pullPending(limit: number): Promise<TranslationTask[]> {
    // Atomic claim using UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
    const rows = await this.db.execute(sql`
      UPDATE translation_tasks
      SET status = 'processing', started_at = NOW()
      WHERE id IN (
        SELECT id FROM translation_tasks
        WHERE status = 'pending'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING *
    `);

    // db.execute returns { rows: [...] } or directly an array depending on driver
    const rawRows = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows;
    return rawRows.map((r) => this.rowToEntity(r as Record<string, unknown>));
  }

  async markProcessing(taskId: string): Promise<void> {
    await this.db
      .update(translationTasks)
      .set({
        status: 'processing',
        startedAt: new Date().toISOString(),
      })
      .where(eq(translationTasks.id, taskId));
  }

  async markCompleted(taskId: string, detectedLanguage: string): Promise<void> {
    await this.db
      .update(translationTasks)
      .set({
        status: 'completed',
        detectedLanguage,
        completedAt: new Date().toISOString(),
      })
      .where(eq(translationTasks.id, taskId));
  }

  async markFailedOrRetry(taskId: string, error: string): Promise<void> {
    const maxRetries = TRANSLATION_CONFIG.retry.maxRetries;

    // Increment retry_count and decide status based on new count
    await this.db.execute(sql`
      UPDATE translation_tasks
      SET
        retry_count = retry_count + 1,
        error_message = ${error},
        status = CASE
          WHEN retry_count + 1 >= ${maxRetries} THEN 'failed'
          ELSE 'pending'
        END
      WHERE id = ${taskId}
    `);
  }

  async resetForRetry(taskId: string): Promise<void> {
    await this.db
      .update(translationTasks)
      .set({
        status: 'pending',
        retryCount: 0,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        detectedLanguage: null,
      })
      .where(
        and(
          eq(translationTasks.id, taskId),
          eq(translationTasks.status, 'failed'),
        ),
      );
  }

  async findByEntity(
    sourceDb: SourceDb,
    entityType: string,
    entityId: string,
  ): Promise<TranslationTask[]> {
    const rows = await this.db
      .select()
      .from(translationTasks)
      .where(
        and(
          eq(translationTasks.sourceDb, sourceDb),
          eq(translationTasks.entityType, entityType),
          eq(translationTasks.entityId, entityId),
        ),
      )
      .orderBy(sql`${translationTasks.createdAt} DESC`);

    return rows.map((r) => this.rowToEntity(r));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Maps a DB row to a TranslationTask entity.
   * Handles both camelCase (Drizzle ORM result) and snake_case (raw SQL result).
   */
  private rowToEntity(row: TranslationTaskRow | Record<string, unknown>): TranslationTask {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;

    const id: string = r.id;
    const sourceDb: SourceDb = (r.sourceDb ?? r.source_db ?? 'crm') as SourceDb;
    const entityType: string = r.entityType ?? r.entity_type;
    const entityId: string = r.entityId ?? r.entity_id;
    const chunkKey: string = r.chunkKey ?? r.chunk_key ?? 'default';
    const hospitalType: string | null = r.hospitalType ?? r.hospital_type ?? null;
    const fieldsToTranslate: Record<string, unknown> =
      r.fieldsToTranslate ?? r.fields_to_translate ?? {};
    const targetLanguages: string[] = r.targetLanguages ?? r.target_languages ?? [];
    const sourceLanguage: string | null = r.sourceLanguage ?? r.source_language ?? null;
    const targetLanguage: string | null = r.targetLanguage ?? r.target_language ?? null;
    const detectedLanguage: string | null = r.detectedLanguage ?? r.detected_language ?? null;
    const status = (r.status ?? 'pending') as TranslationTaskStatus;
    const errorMessage: string | null = r.errorMessage ?? r.error_message ?? null;
    const retryCount: number = r.retryCount ?? r.retry_count ?? 0;

    const parseDate = (val: unknown): Date | null => {
      if (!val) return null;
      if (val instanceof Date) return val;
      return new Date(val as string);
    };

    const createdAt: Date = parseDate(r.createdAt ?? r.created_at) ?? new Date();
    const startedAt: Date | null = parseDate(r.startedAt ?? r.started_at);
    const completedAt: Date | null = parseDate(r.completedAt ?? r.completed_at);

    return new TranslationTask({
      id,
      sourceDb,
      entityType,
      entityId,
      chunkKey,
      hospitalType,
      fieldsToTranslate,
      targetLanguages,
      sourceLanguage,
      targetLanguage,
      detectedLanguage,
      status,
      errorMessage,
      retryCount,
      createdAt,
      startedAt,
      completedAt,
    });
  }
}
