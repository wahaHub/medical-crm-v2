import { eq, ne, and, desc, sql } from 'drizzle-orm';
import type { IDocumentRepository } from '@medical-crm/domain';
import { Document } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { documents } from '../schema/index.js';
import { withTransientDatabaseRetry } from '../transient-db-retry.js';

export class DrizzleDocumentRepository implements IDocumentRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string): Promise<Document | null> {
    const rows = await withTransientDatabaseRetry(
      'load document by id',
      () => this.db
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1),
    );

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByStorageKey(storageKey: string): Promise<Document | null> {
    const rows = await withTransientDatabaseRetry(
      'load document by storage key',
      () => this.db
        .select()
        .from(documents)
        .where(eq(documents.storageKey, storageKey))
        .limit(1),
    );

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByCaseId(caseId: string): Promise<Document[]> {
    const rows = await withTransientDatabaseRetry(
      'load documents by case id',
      () => this.db
        .select()
        .from(documents)
        .where(and(eq(documents.caseId, caseId), ne(documents.status, 'DELETED')))
        .orderBy(desc(documents.createdAt)),
    );

    return rows.map((r) => this.rowToEntity(r));
  }

  async save(doc: Document): Promise<Document> {
    const rows = await this.db
      .insert(documents)
      .values({
        id: doc.id,
        caseId: doc.caseId,
        uploadedById: doc.uploadedById,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        storageKey: doc.storageKey,
        documentType: doc.documentType,
        sensitivity: doc.sensitivity,
        language: doc.language,
        isTranslated: doc.isTranslated,
        status: doc.status,
        stageTag: doc.stageTag,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(documents)
      .set({ status: 'DELETED', updatedAt: sql`NOW()` })
      .where(eq(documents.id, id));
  }

  private rowToEntity(row: typeof documents.$inferSelect): Document {
    return new Document({
      id: row.id,
      caseId: row.caseId,
      uploadedById: row.uploadedById,
      fileName: row.fileName,
      fileSize: row.fileSize,
      mimeType: row.mimeType,
      storageKey: row.storageKey,
      documentType: row.documentType as import('@medical-crm/domain').DocumentType,
      sensitivity: row.sensitivity as import('@medical-crm/domain').Sensitivity,
      language: row.language,
      isTranslated: row.isTranslated,
      status: row.status as import('@medical-crm/domain').DocumentStatus,
      stageTag: row.stageTag ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
