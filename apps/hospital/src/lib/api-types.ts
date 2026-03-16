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

/** Case summary returned by the list endpoint */
export interface CaseSummary {
  id: string;
  caseNumber?: string;
  patientName?: string;
  patientCountry?: string | null;
  status?: string;
  assignmentStatus?: string;
  stage?: string;
  treatmentStage?: string | null;
  riskLevel?: string | null;
  medicalCondition?: string | null;
  notes?: string | null;
  assignedHospitalId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Case detail DTO returned by GET /cases/:id for HOSPITAL role */
export interface HospitalCaseDetail {
  id: string;
  caseNumber: string;
  displayStatus: string;
  patient: {
    id: string;
    name: string;
    code: string;
    country: string | null;
    language: string;
    age: number | null;
    gender: string | null;
  };
  medicalCondition: {
    primaryDiagnosis: string | null;
    diagnosisCode: string | null;
    symptoms: string[] | null;
    medicalHistory: string | null;
  };
  aiSummary: string | null;
  riskLevel: string | null;
  diagnoses: DiagnosisItem[];
  documents: DocumentItem[];
  totalMessages: number;
  createdAt: string;
  updatedAt: string;
}

/** Stats shapes */
/** Matches backend CaseStatsDTO */
export interface CaseStats {
  total?: number;
  unassigned?: number;
  assigned?: number;
  inTreatment?: number;
  postTreatment?: number;
  completed?: number;
  followUp?: number;
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
  lastMessagePreview?: string;
  unreadCount?: number;
  updatedAt?: string;
}

/** Document item */
export interface DocumentItem {
  id: string;
  fileName?: string;
  fileUrl?: string;
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

/** Hospital materials info — matches MaterialsHospitalInfo domain type */
export interface MaterialsHospitalInfoDTO {
  id: string;
  name: string;
  slug: string;
  heroImage: string | null;
  photos: string[];
  highlights: Array<{ icon: string; text: string }>;
}

/** Materials procedure — matches MaterialsProcedure domain type */
export interface MaterialsProcedureDTO {
  id: string;
  hospitalId: string;
  procedureName: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceRange: string | null;
  isPopular: boolean;
  sortOrder: number;
}

/** Materials surgeon — matches MaterialsSurgeon domain type */
export interface MaterialsSurgeonDTO {
  id: string;
  hospitalId: string;
  name: string;
  title: string | null;
  imageUrl: string | null;
  experienceYears: number | null;
  specialties: string[];
  languages: string[];
}

/** Materials before/after case — matches MaterialsBeforeAfterCase domain type */
export interface MaterialsBeforeAfterCaseDTO {
  id: string;
  hospitalId: string;
  procedureName: string;
  surgeonName: string | null;
  description: string | null;
  images: Array<{ url: string; type: 'before' | 'after' | 'combined' }>;
}
