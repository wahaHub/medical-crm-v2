import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const consultationRecordingPolicy: UploadPolicy = {
  policyId: 'consultation_recording',
  feature: 'consultation_recording',
  backend: 'r2-private',
  keyNamespace: 'cases/consultations',
  allowedMimeTypes: ['video/mp4', 'video/webm', 'audio/mp4', 'audio/webm'],
  maxFileSize: 500 * 1024 * 1024,
  buildStorageKey: (input, assetId) =>
    `crm/${env}/cases/consultations/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
