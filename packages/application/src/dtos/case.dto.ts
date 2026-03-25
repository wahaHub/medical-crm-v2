import type { DocumentWithUrlDTO } from './document.dto.js';
import type { DiagnosisDTO, PhoneCallDTO, ConsultationHistoryDTO } from './progress.dto.js';

export interface CaseDTO {
  id: string;
  caseNumber: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;
  patientEmail: string | null;
  patientPhone: string | null;
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

/** Step-based medical intake mirroring the patient questionnaire flow */
export interface MedicalIntakeDTO {
  step1?: {
    symptomLocation?: string;
    symptomNature?: string[];
    onsetTime?: string;
    progressTrend?: string;
    diagnosisStage?: string;
    diseaseCategory?: string;
  };
  step2?: {
    detailedDescription?: string;
    aggravatingFactors?: string[];
    relievingFactors?: string[];
    previousTreatment?: string;
  };
  step3?: {
    medicalHistory?: string[];
    chronicConditions?: string;
    familyHistory?: string;
  };
  step4?: {
    currentMedications?: string;
    drugAllergies?: string;
    foodAllergies?: string;
  };
  step5?: {
    examTypes?: string[];
    examDetails?: string;
    labResults?: string;
    treatmentExpectations?: string[];
    budgetRange?: string;
    expectedTimeline?: string;
  };
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
  medicalIntake: MedicalIntakeDTO;
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
  assigned: number;
  inTreatment: number;
  postTreatment: number;
  completed: number;
  followUp: number;
}
