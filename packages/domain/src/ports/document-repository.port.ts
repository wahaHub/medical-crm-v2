import type { Document } from '../entities/document.entity.js';

export interface IDocumentRepository {
  findById(id: string): Promise<Document | null>;
  findByStorageKey(storageKey: string): Promise<Document | null>;
  findByCaseId(caseId: string): Promise<Document[]>;
  save(doc: Document): Promise<Document>;
  softDelete(id: string): Promise<void>;
}
