import type { DocumentWithUrlDTO } from './document.dto.js';
import type { DiagnosisDTO, PhoneCallDTO, ConsultationHistoryDTO } from './progress.dto.js';

export interface CaseDTO {
  id: string;
  caseNumber: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;
  assignedHospitalId: string | null;
  hospitalName: string | null;
  primaryDiagnosis: string | null;
  status: string;
  stage: string;
  riskLevel: string | null;
  aiSummary: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HospitalCaseDetailDTO {
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
  diagnoses: DiagnosisDTO[];
  phoneCalls: PhoneCallDTO[];
  consultationHistory: ConsultationHistoryDTO[];
  documents: DocumentWithUrlDTO[];
  totalMessages: number;
  createdAt: string;
  updatedAt: string;
}

export interface CaseStatsDTO {
  total: number;
  unassigned: number;
  active: number;
  completed: number;
  cancelled: number;
}
