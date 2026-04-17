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
  patientName: string;
  status: string;
  assignmentStatus: string;
  treatmentStage: string | null;
  patientCountry?: string | null;
  patientLanguage?: string | null;
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
  id: string; name: string; nameEn: string | null; type: string; status: string;
  hasRegisteredUser?: boolean;
  consumerSlug?: string | null;
  specialties: string[] | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; createdAt: string;
}
