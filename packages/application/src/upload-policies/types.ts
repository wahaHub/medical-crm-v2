import type { StorageBackend } from '@medical-crm/domain';

export type UploadFeature =
  | 'message_attachment'
  | 'package_image'
  | 'case_document'
  | 'ticket_reply_attachment'
  | 'faq_attachment'
  | 'consultation_recording'
  | 'materials_media';

export type UploadPolicyId =
  | 'message_attachment'
  | 'package_image'
  | 'case_document'
  | 'ticket_reply_attachment'
  | 'faq_attachment'
  | 'consultation_recording'
  | 'materials_beauty_hospital_image'
  | 'materials_beauty_hospital_video'
  | 'materials_beauty_testimonial_video'
  | 'materials_beauty_surgeon_image'
  | 'materials_beauty_case_media'
  | 'materials_regular_hospital_image'
  | 'materials_regular_surgeon_image'
  | 'materials_regular_case_media';

export type UploadOwnerType =
  | 'conversation'
  | 'package'
  | 'case'
  | 'ticket_reply'
  | 'faq'
  | 'hospital_material'
  | 'consultation';

export interface CreateUploadIntentInput {
  policyId: UploadPolicyId;
  ownerType: UploadOwnerType;
  ownerId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface UploadIntentResult {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
  asset: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    storageKey: string;
  };
}

export interface UploadPolicy {
  policyId: UploadPolicyId;
  feature: UploadFeature;
  backend: StorageBackend;
  keyNamespace: string;
  allowedMimeTypes: string[];
  maxFileSize: number;
  buildStorageKey: (input: CreateUploadIntentInput, assetId: string) => string;
}

export function sanitizeFileName(fileName: string): string {
  return (
    fileName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_.\-]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'file'
  );
}
