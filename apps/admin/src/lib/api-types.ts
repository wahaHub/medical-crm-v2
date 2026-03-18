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
  primaryDiagnosis?: string | null;
  riskLevel?: string | null;
  aiSummary?: string | null;
  createdAt: string;
}

export interface CaseStats {
  total: number; unassigned: number; assigned: number; inTreatment: number;
  postTreatment: number; completed: number; followUp: number;
}

export interface HospitalSummary {
  id: string; name: string; nameEn: string | null; type: string; status: string;
  specialties: string[] | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; createdAt: string;
}
