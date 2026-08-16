/**
 * Case Lifecycle Phase 2: patient merge + case merge.
 * Cross-table repoint/mark operations used by the merge use cases. All write
 * methods require an explicit transaction handle so the use case can keep the
 * whole merge atomic via TransactionRunner.
 */

export interface PatientContactFields {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
}

export interface PatientMergeSnapshot extends PatientContactFields {
  id: string;
  name: string;
  role: string;
  status: string;
  mergedIntoUserId: string | null;
}

export interface CaseMergeSnapshot {
  id: string;
  caseNumber: string;
  patientId: string;
  patientName: string;
  status: string;
  mergedIntoCaseId: string | null;
}

/** Counts of patient-scoped rows that move to the primary patient on merge. */
export interface PatientResourceCounts {
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

/** Counts of case-scoped rows that move to the primary case on merge. */
export interface CaseResourceCounts {
  documents: number;
  caseProgress: number;
  conversations: number;
  emailReplyTokens: number;
  inboundEmailEvents: number;
  consultations: number;
  quotes: number;
  caseHospitalContacts: number;
  /** case_hospital_contacts rows dropped because the primary case already has the same hospital */
  caseHospitalContactConflicts: number;
  caseEvents: number;
  caseJourneys: number;
  /** true when both cases have a journey; the secondary journey then stays on the merged case */
  journeyConflict: boolean;
  journeyMilestones: number;
  questionCollectorResponses: number;
  orders: number;
  supportTickets: number;
}

export interface IMergeRepository {
  getPatientSnapshot(patientId: string, tx?: unknown): Promise<PatientMergeSnapshot | null>;
  getCaseSnapshot(caseId: string, tx?: unknown): Promise<CaseMergeSnapshot | null>;

  /** Read-only previews used by dry-run */
  countPatientResources(patientId: string, tx?: unknown): Promise<PatientResourceCounts>;
  countCaseResources(secondaryCaseId: string, primaryCaseId: string, tx?: unknown): Promise<CaseResourceCounts>;

  transferPatientResources(secondaryPatientId: string, primaryPatientId: string, tx: unknown): Promise<PatientResourceCounts>;
  transferCaseResources(secondaryCaseId: string, primaryCaseId: string, tx: unknown): Promise<CaseResourceCounts>;

  /** Fill only NULL contact fields on the primary patient (primary values always win) */
  fillPrimaryContactFields(primaryPatientId: string, fields: Partial<PatientContactFields>, tx: unknown): Promise<void>;

  markPatientMerged(secondaryPatientId: string, primaryPatientId: string, tx: unknown): Promise<void>;
  markCaseMerged(secondaryCaseId: string, primaryCaseId: string, tx: unknown): Promise<void>;
}
