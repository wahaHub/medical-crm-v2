export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface DashboardData {
  stats: { totalCases: number; unassignedCases: number; assignedCases: number; openTickets: number; pendingOrders: number; };
  recentCases: Array<{ id: string; caseNumber: string; assignmentStatus: string; createdAt: string; }>;
}

export interface CaseSummary {
  id: string;
  caseNumber: string;
  patientId: string;
  patientName: string;
  status: string;
  assignmentStatus: string;
  treatmentStage: string | null;
  patientCountry?: string | null;
  patientLanguage?: string | null;
  patientSite?: 'beauty' | 'china' | null;
  hospitalType?: 'COSMETIC' | 'REGULAR' | null;
  patientEmail?: string | null;
  patientPhone?: string | null;
  gender?: string | null;
  country?: string | null;
  destination?: string | null;
  department?: string | null;
  disease?: string | null;
  treatmentTime?: string | null;
  customHospitalRequest?: string | null;
  primaryDiagnosis?: string | null;
  riskLevel?: string | null;
  aiSummary?: string | null;
  assignedHospitalId?: string | null;
  hospitalName?: string | null;
  createdAt: string;
  updatedAt?: string;
  /** Case Lifecycle Phase 2: set when this case was merged into another case */
  mergedIntoCaseId?: string | null;
  mergedIntoCaseNumber?: string | null;
}

// ── Case Lifecycle Phase 2: merges ────────────────────────────────────

export interface CaseMergeTransferCounts {
  documents: number;
  caseProgress: number;
  conversations: number;
  emailReplyTokens: number;
  inboundEmailEvents: number;
  consultations: number;
  quotes: number;
  caseHospitalContacts: number;
  caseHospitalContactConflicts: number;
  caseEvents: number;
  caseJourneys: number;
  journeyConflict: boolean;
  journeyMilestones: number;
  questionCollectorResponses: number;
  orders: number;
  supportTickets: number;
}

export interface CaseMergeCaseSummary {
  id: string;
  caseNumber: string;
  patientId: string;
  patientName: string;
  status: string;
}

export interface CaseMergeResult {
  dryRun: boolean;
  merged: boolean;
  primary: CaseMergeCaseSummary;
  secondary: CaseMergeCaseSummary;
  transferred: CaseMergeTransferCounts;
  differentPatients: boolean;
  warnings: string[];
}

export interface PatientMergeTransferCounts {
  cases: number;
  consultations: number;
  supportTickets: number;
  orders: number;
  emailReplyTokens: number;
  aiChatSessions: number;
  aiUserProfiles: number;
  aiChatTimelineEvents: number;
  aiFollowupTriggers: number;
  aiHandoffs: number;
}

export interface PatientMergeProfile {
  id: string;
  name: string;
  role: string;
  status: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  mergedIntoUserId: string | null;
}

export interface PatientMergeResult {
  dryRun: boolean;
  merged: boolean;
  primary: PatientMergeProfile;
  secondary: PatientMergeProfile;
  transferred: PatientMergeTransferCounts;
  movedCases: Array<{ id: string; caseNumber: string }>;
  contactResolution: {
    filledOnPrimary: { email?: string; phone?: string; whatsapp?: string };
    conflicts: Array<{ field: 'email' | 'phone' | 'whatsapp'; primaryValue: string; secondaryValue: string }>;
  };
}

export interface PatientSearchResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  patientCode: string | null;
  site: 'beauty' | 'china' | null;
}

export interface CaseProgressItem {
  id: string;
  title: string;
  description: string | null;
  progressType: string;
  metadata: Record<string, unknown> | null;
  recordedAt: string;
  recordedById: string | null;
}

export interface CaseStats {
  total: number; unassigned: number; assigned: number; inTreatment: number;
  postTreatment: number; completed: number; followUp: number;
}

export interface HospitalSummary {
  id: string; name: string; nameEn: string | null; type: string; site: string | null; status: string;
  hasRegisteredUser?: boolean;
  consumerSlug?: string | null;
  specialties: string[] | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; createdAt: string;
}
