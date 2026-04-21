import type { DocumentWithUrlDTO } from './document.dto.js';
import type { DiagnosisDTO, PhoneCallDTO, ConsultationHistoryDTO } from './progress.dto.js';
import type { MessageDTO } from './conversation.dto.js';

export interface CaseDTO {
  id: string;
  caseNumber: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;
  patientSite: 'beauty' | 'china' | null;
  hospitalType: 'COSMETIC' | 'REGULAR' | null;
  patientEmail: string | null;
  patientPhone: string | null;
  gender: string | null;
  country: string | null;
  destination: string | null;
  department: string | null;
  disease: string | null;
  treatmentTime: string | null;
  customHospitalRequest: string | null;
  assignedHospitalId: string | null;
  hospitalName: string | null;
  primaryDiagnosis: string | null;
  /** @deprecated Use assignmentStatus instead */
  status: string;
  /** @deprecated Use treatmentStage instead */
  stage: string;
  assignmentStatus: string;
  treatmentStage: string | null;
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
  messageSections: HospitalCaseMessageSectionDTO[];
  totalMessages: number;
  createdAt: string;
  updatedAt: string;
}

export interface HospitalCaseMessageSectionDTO {
  id: 'admin-patient' | 'hospital-patient';
  title: string;
  conversationCategory: 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
  conversationId: string | null;
  messages: MessageDTO[];
  totalMessages: number;
}

export interface CaseStatsDTO {
  total: number;
  unassigned: number;
  assigned: number;
  inTreatment: number;
  postTreatment: number;
  completed: number;
  followUp: number;
}
