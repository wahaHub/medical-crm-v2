export interface CaseProgressDTO {
  id: string;
  title: string;
  description: string | null;
  progressType: string;
  metadata: Record<string, unknown> | null;
  recordedAt: string;
  recordedById: string | null;
}

export interface DiagnosisDTO {
  id: string;
  title: string;
  icdCode: string | null;
  severity: string | null;
  treatmentRecommendation: string | null;
  suggestedTests: string | null;
  costEstimate: string | null;
  treatmentDuration: string | null;
  recordedAt: string;
}

export interface PhoneCallDTO {
  id: string;
  title: string;
  callResult: string | null;
  summary: string | null;
  duration: number | null;
  nextFollowUp: string | null;
  recordedAt: string;
}

export interface ConsultationHistoryDTO {
  id: string;
  title: string;
  description: string | null;
  recordedAt: string;
}
