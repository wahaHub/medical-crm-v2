import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const faqAttachmentPolicy: UploadPolicy = {
  policyId: 'faq_attachment',
  feature: 'faq_attachment',
  backend: 'r2-private',
  keyNamespace: 'admin/chatbot-faqs',
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  maxFileSize: 10 * 1024 * 1024,
  buildStorageKey: (input, assetId) =>
    `crm/${env}/admin/chatbot-faqs/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
