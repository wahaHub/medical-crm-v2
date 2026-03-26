import { eq, and, sql } from 'drizzle-orm';
import type { IDifyDocumentMappingRepository } from '@medical-crm/domain';
import { DifyDocumentMapping } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { difyDocumentMappings } from '../schema/index.js';

export class DrizzleDifyDocumentMappingRepository implements IDifyDocumentMappingRepository {
  constructor(private readonly db: CrmDb) {}

  async findByEntity(entityType: string, entityKey: string, tx?: unknown): Promise<DifyDocumentMapping | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(difyDocumentMappings)
      .where(and(
        eq(difyDocumentMappings.entityType, entityType),
        eq(difyDocumentMappings.entityKey, entityKey),
      ))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async save(entity: DifyDocumentMapping, tx?: unknown): Promise<DifyDocumentMapping> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .insert(difyDocumentMappings)
      .values({
        id: entity.id,
        entityType: entity.entityType,
        entityKey: entity.entityKey,
        difyDatasetId: entity.difyDatasetId,
        difyDocumentId: entity.difyDocumentId,
        lastSyncedAt: entity.lastSyncedAt ? entity.lastSyncedAt.toISOString() : null,
        createdAt: entity.createdAt.toISOString(),
        updatedAt: entity.updatedAt.toISOString(),
      })
      .onConflictDoUpdate({
        target: [difyDocumentMappings.entityType, difyDocumentMappings.entityKey],
        set: {
          difyDatasetId: entity.difyDatasetId,
          difyDocumentId: entity.difyDocumentId,
          lastSyncedAt: entity.lastSyncedAt ? entity.lastSyncedAt.toISOString() : null,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async deleteByEntity(entityType: string, entityKey: string, tx?: unknown): Promise<void> {
    const db = (tx as CrmDb) ?? this.db;
    await db
      .delete(difyDocumentMappings)
      .where(and(
        eq(difyDocumentMappings.entityType, entityType),
        eq(difyDocumentMappings.entityKey, entityKey),
      ));
  }

  private rowToEntity(row: typeof difyDocumentMappings.$inferSelect): DifyDocumentMapping {
    return new DifyDocumentMapping({
      id: row.id,
      entityType: row.entityType,
      entityKey: row.entityKey,
      difyDatasetId: row.difyDatasetId,
      difyDocumentId: row.difyDocumentId,
      lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
