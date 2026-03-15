import type { Document } from '@medical-crm/domain';
import type { DocumentDTO } from '../dtos/document.dto.js';

export function toDocumentDTO(entity: Document, signedUrl: string): DocumentDTO {
  return {
    id: entity.id,
    fileName: entity.fileName,
    fileSize: entity.fileSize,
    mimeType: entity.mimeType,
    documentType: entity.documentType,
    sensitivity: entity.sensitivity,
    language: entity.language,
    isTranslated: entity.isTranslated,
    downloadUrl: signedUrl,
    createdAt: entity.createdAt.toISOString(),
  };
}
