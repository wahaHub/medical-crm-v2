// apps/hospital/src/lib/api-types.ts
// Lightweight types for API responses used across the Hospital Portal.

/** Paginated list response envelope */
export interface PaginatedResponse<T> {
  data: T[];
  total?: number;
  nextCursor?: string | null;
}

/** Flat list response that may or may not have a wrapper */
export type ListResponse<T> = PaginatedResponse<T> | T[];

/** Case summary returned by the list / detail endpoints */
export interface CaseSummary {
  id: string;
  caseNumber?: string;
  patientName?: string;
  patientCountry?: string | null;
  status?: string;
  stage?: string;
  riskLevel?: string | null;
  medicalCondition?: string | null;
  notes?: string | null;
  assignedHospitalId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Stats shapes */
export interface CaseStats {
  total?: number;
  new?: number;
  inProgress?: number;
  completed?: number;
}

export interface ConsultationStats {
  total?: number;
  scheduled?: number;
  completed?: number;
  cancelled?: number;
}

/** Consultation summary */
export interface ConsultationSummary {
  id: string;
  caseId?: string;
  patientName?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  status?: string;
  notes?: string | null;
}

/** Conversation summary */
export interface ConversationSummary {
  id: string;
  title?: string;
  patientName?: string;
  category?: string;
  lastMessage?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
  updatedAt?: string;
}

/** Document item */
export interface DocumentItem {
  id: string;
  fileName?: string;
  type?: string;
  status?: string;
}

/** Diagnosis item */
export interface DiagnosisItem {
  condition?: string;
  notes?: string;
}

/** Progress response */
export interface CaseProgressResponse {
  diagnoses?: DiagnosisItem[];
}

/** Hospital materials info */
export interface HospitalInfo {
  name?: string;
  slug?: string;
  heroImageUrl?: string;
  description?: string;
  highlights?: string[];
}
