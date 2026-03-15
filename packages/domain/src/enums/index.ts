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
