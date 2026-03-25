import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const emailTemplateAttachmentPolicy: UploadPolicy = {
  policyId: 'email_template_attachment',
  feature: 'email_template_attachment',
  backend: 'r2-private',
  keyNamespace: 'email-templates/attachments',
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  buildStorageKey: (input, assetId) =>
    `crm/${env}/email-templates/attachments/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
