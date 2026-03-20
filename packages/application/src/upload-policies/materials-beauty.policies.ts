import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const materialsBeautyPolicies: UploadPolicy[] = [
  {
    policyId: 'materials_beauty_hospital_image',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/hospital-image',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 10 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/hospital-image/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_beauty_hospital_video',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/hospital-video',
    allowedMimeTypes: ['video/mp4', 'video/webm'],
    maxFileSize: 200 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/hospital-video/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_beauty_testimonial_video',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/testimonial-video',
    allowedMimeTypes: ['video/mp4', 'video/webm'],
    maxFileSize: 200 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/testimonial-video/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_beauty_surgeon_image',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/surgeon-image',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 10 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/surgeon-image/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_beauty_case_media',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/case-media',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    maxFileSize: 50 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/case-media/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
];
