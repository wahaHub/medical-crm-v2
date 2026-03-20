import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const caseDocumentPolicy: UploadPolicy = {
  policyId: 'case_document',
  feature: 'case_document',
  backend: 'r2-private',
  keyNamespace: 'cases/documents',
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/dicom',
  ],
  maxFileSize: 25 * 1024 * 1024,
  buildStorageKey: (input, assetId) =>
    `crm/${env}/cases/documents/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
