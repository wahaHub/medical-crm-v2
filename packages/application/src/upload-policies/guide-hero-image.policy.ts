import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const guideHeroImagePolicy: UploadPolicy = {
  policyId: 'guide_hero_image',
  feature: 'guide_hero_image',
  backend: 'r2-private',
  keyNamespace: 'admin/guides',
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxFileSize: 10 * 1024 * 1024,
  buildStorageKey: (input, assetId) =>
    `crm/${env}/admin/guides/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
