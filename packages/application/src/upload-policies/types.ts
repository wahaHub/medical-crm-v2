import type { StorageBackend } from '@medical-crm/domain';

export type UploadFeature =
  | 'message_attachment'
  | 'package_image'
  | 'case_document'
  | 'chatbot_request_docs'
  | 'ticket_reply_attachment'
  | 'faq_attachment'
  | 'consultation_recording'
  | 'materials_media'
  | 'email_template_attachment';

export type UploadPolicyId =
  | 'message_attachment'
  | 'package_image'
  | 'case_document'
  | 'chatbot_request_docs'
  | 'ticket_reply_attachment'
  | 'faq_attachment'
  | 'consultation_recording'
  | 'materials_beauty_hospital_image'
  | 'materials_beauty_hospital_pdf'
  | 'materials_beauty_hospital_video'
  | 'materials_beauty_testimonial_video'
  | 'materials_beauty_surgeon_image'
  | 'materials_beauty_case_media'
  | 'materials_regular_hospital_image'
  | 'materials_regular_hospital_pdf'
  | 'materials_regular_hospital_video'
  | 'materials_regular_testimonial_video'
  | 'materials_regular_surgeon_image'
  | 'materials_regular_case_media'
  | 'email_template_attachment';

export type UploadOwnerType =
  | 'conversation'
  | 'package'
  | 'case'
  | 'ai_chat_session'
  | 'ticket_reply'
  | 'faq'
  | 'hospital_material'
  | 'consultation'
  | 'email_template';

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
