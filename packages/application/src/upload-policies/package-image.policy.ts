import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const packageImagePolicy: UploadPolicy = {
  policyId: 'package_image',
  feature: 'package_image',
  backend: 'r2-private',
  keyNamespace: 'admin/packages',
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxFileSize: 10 * 1024 * 1024,
  buildStorageKey: (input, assetId) =>
    `crm/${env}/admin/packages/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
