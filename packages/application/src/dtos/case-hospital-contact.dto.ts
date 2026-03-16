export interface CaseHospitalContactDTO {
  id: string;
  caseId: string;
  hospitalId: string;
  hospitalName?: string;
  subStatus: string;
  selectedByPatientAt: string | null;
  distributedAt: string | null;
  firstReplyAt: string | null;
  quoteId: string | null;
  patientViewedQuoteAt: string | null;
  patientAcceptedAt: string | null;
  patientRejectedAt: string | null;
  reminderSentAt: string | null;
  removedAt: string | null;
  removedReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
