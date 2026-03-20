import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const messageAttachmentPolicy: UploadPolicy = {
  policyId: 'message_attachment',
  feature: 'message_attachment',
  backend: 'r2-private',
  keyNamespace: 'communications/messages',
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  maxFileSize: 20 * 1024 * 1024,
  buildStorageKey: (input, assetId) =>
    `crm/${env}/communications/messages/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
