import type { Case, CaseProgress, Document, CaseStage } from '@medical-crm/domain';
import type { CaseDTO, HospitalCaseDetailDTO } from '../dtos/case.dto.js';
import { splitProgressByType } from './progress.mapper.js';
import { toDocumentDTO } from './document.mapper.js';

const STAGE_DISPLAY_MAP: Record<CaseStage, string> = {
  PENDING_ASSIGNMENT: 'transferred',
  TRANSFERRED_TO_HOSPITAL: 'transferred',
  HOSPITAL_CONTACTED: 'contacted',
  CONSULTATION_SCHEDULED: 'consultation_scheduled',
  IN_TREATMENT: 'in_treatment',
  TREATMENT_COMPLETED: 'completed',
};

export function toCaseDTO(entity: Case, hospitalName?: string): CaseDTO {
  return {
    id: entity.id,
    caseNumber: entity.caseNumber.value,
    patientName: entity.patientName,
    patientCountry: entity.patientCountry,
    patientLanguage: entity.patientLanguage,
    assignedHospitalId: entity.assignedHospitalId,
    hospitalName: hospitalName ?? null,
    primaryDiagnosis: entity.primaryDiagnosis,
    status: entity.status,
    stage: entity.stage,
    riskLevel: entity.riskLevel,
    aiSummary: entity.aiSummary,
    assignedAt: entity.assignedAt?.toISOString() ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export interface PatientInfo {
  id: string;
  code: string;
  age: number | null;
  gender: string | null;
}

export function toHospitalCaseDetailDTO(
  entity: Case,
  progress: CaseProgress[],
  documents: Document[],
  signedUrls: Record<string, string>,
  patient: PatientInfo,
): HospitalCaseDetailDTO {
  const { diagnoses, phoneCalls, consultations } = splitProgressByType(progress);
  return {
    id: entity.id,
    caseNumber: entity.caseNumber.value,
    displayStatus: STAGE_DISPLAY_MAP[entity.stage],
    patient: {
      id: patient.id,
      name: entity.patientName,
      code: patient.code,
      country: entity.patientCountry,
      language: entity.patientLanguage,
      age: patient.age,
      gender: patient.gender,
    },
    medicalCondition: {
      primaryDiagnosis: entity.primaryDiagnosis,
      diagnosisCode: entity.diagnosisCode,
      symptoms: entity.symptoms,
      medicalHistory: entity.medicalHistory,
    },
    aiSummary: entity.aiSummary,
    riskLevel: entity.riskLevel,
    diagnoses,
    phoneCalls,
    consultationHistory: consultations,
    documents: documents.map((d) =>
      toDocumentDTO(d, signedUrls[d.storageKey] ?? ''),
    ),
    totalMessages: 0,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
