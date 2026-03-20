import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const ticketReplyAttachmentPolicy: UploadPolicy = {
  policyId: 'ticket_reply_attachment',
  feature: 'ticket_reply_attachment',
  backend: 'r2-private',
  keyNamespace: 'admin/tickets',
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  maxFileSize: 20 * 1024 * 1024,
  buildStorageKey: (input, assetId) =>
    `crm/${env}/admin/tickets/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
