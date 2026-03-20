import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const materialsRegularPolicies: UploadPolicy[] = [
  {
    policyId: 'materials_regular_hospital_image',
    feature: 'materials_media',
    backend: 's3-materials',
    keyNamespace: 'materials-regular/hospital-image',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 10 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-regular/hospital-image/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_regular_surgeon_image',
    feature: 'materials_media',
    backend: 's3-materials',
    keyNamespace: 'materials-regular/surgeon-image',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 10 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-regular/surgeon-image/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_regular_case_media',
    feature: 'materials_media',
    backend: 's3-materials',
    keyNamespace: 'materials-regular/case-media',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    maxFileSize: 50 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-regular/case-media/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
];
