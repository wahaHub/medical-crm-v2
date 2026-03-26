import type { DifyDocumentMapping } from '../entities/dify-document-mapping.entity.js';

export interface IDifyDocumentMappingRepository {
  findByEntity(entityType: string, entityKey: string, tx?: unknown): Promise<DifyDocumentMapping | null>;
  save(entity: DifyDocumentMapping, tx?: unknown): Promise<DifyDocumentMapping>;
  deleteByEntity(entityType: string, entityKey: string, tx?: unknown): Promise<void>;
}
