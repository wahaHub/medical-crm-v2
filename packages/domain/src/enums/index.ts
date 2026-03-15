export type CaseStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
export type CaseStage =
  | 'PENDING_ASSIGNMENT'
  | 'TRANSFERRED_TO_HOSPITAL'
  | 'HOSPITAL_CONTACTED'
  | 'CONSULTATION_SCHEDULED'
  | 'IN_TREATMENT'
  | 'TREATMENT_COMPLETED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type DocumentType =
  | 'LAB' | 'IMAGING' | 'DISCHARGE' | 'PRESCRIPTION'
  | 'ID' | 'DIAGNOSIS' | 'QUOTE' | 'INVITATION' | 'OTHER';
export type Sensitivity = 'PHI_HIGH' | 'PHI_MED' | 'PHI_LOW';
export type DocumentStatus = 'PENDING' | 'ACTIVE' | 'DELETED';
export type ProgressType =
  | 'STATUS_CHANGE' | 'DOCUMENT_UPLOAD' | 'VIDEO_CONSULTATION'
  | 'MESSAGE' | 'APPOINTMENT';

// Hospital
export type HospitalStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';
export type HospitalType = 'COSMETIC' | 'REGULAR';

// Messaging
export type ConversationCategory = 'HOSPITAL' | 'PATIENT' | 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
export type ModerationStatus = 'ALLOWED' | 'BLOCKED' | 'REVIEW';

// Consultations
export type ConsultationStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type AISummaryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Message Tasks
export type MessageTaskKind = 'TRANSLATE' | 'SUMMARIZE';
export type MessageTaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
