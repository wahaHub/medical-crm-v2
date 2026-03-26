import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const chatbotRequestDocsPolicy: UploadPolicy = {
  policyId: 'chatbot_request_docs',
  feature: 'chatbot_request_docs',
  backend: 'r2-private',
  keyNamespace: 'ai-chat/uploads',
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/dicom',
    'text/plain',
  ],
  maxFileSize: 25 * 1024 * 1024,
  buildStorageKey: (input, assetId) =>
    `crm/${env}/ai-chat/uploads/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
