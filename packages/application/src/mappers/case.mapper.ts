import type { Case, CaseProgress, CaseStage } from '@medical-crm/domain';
import type {
  CaseDTO,
  HospitalCaseDetailDTO,
  HospitalCaseMessageSectionDTO,
} from '../dtos/case.dto.js';
import type { DocumentWithUrlDTO } from '../dtos/document.dto.js';
import { splitProgressByType } from './progress.mapper.js';
import { asRecord } from '../utils/structured-data.js';
import { deriveHospitalTypeFromPatientSite } from '../utils/hospital-type.js';

const STAGE_DISPLAY_MAP: Record<CaseStage, string> = {
  PENDING_ASSIGNMENT: 'transferred',
  TRANSFERRED_TO_HOSPITAL: 'transferred',
  HOSPITAL_CONTACTED: 'contacted',
  CONSULTATION_SCHEDULED: 'consultation_scheduled',
  IN_TREATMENT: 'in_treatment',
  TREATMENT_COMPLETED: 'completed',
};

export function toCaseDTO(
  entity: Case,
  hospitalName?: string,
  patientContact?: {
    email?: string | null;
    phone?: string | null;
    patientSite?: 'beauty' | 'china' | null;
  },
): CaseDTO {
  const entryProfile = getEntryProfile(entity.structuredData ?? null);
  const customHospitalRequest = getCustomHospitalRequest(entity.structuredData ?? null);
  const patientSite = patientContact?.patientSite ?? null;

  return {
    id: entity.id,
    caseNumber: entity.caseNumber.value,
    patientName: entity.patientName,
    patientCountry: entity.patientCountry,
    patientLanguage: entity.patientLanguage,
    patientSite,
    hospitalType: deriveHospitalTypeFromPatientSite(patientSite),
    patientEmail: patientContact?.email ?? null,
    patientPhone: patientContact?.phone ?? null,
    gender: entryProfile?.gender ?? null,
    country: entryProfile?.country ?? entity.patientCountry,
    destination: entryProfile?.destination ?? null,
    department: entryProfile?.department ?? null,
    disease: entryProfile?.disease ?? null,
    treatmentTime: entryProfile?.treatmentTime ?? null,
    customHospitalRequest,
    assignedHospitalId: entity.assignedHospitalId,
    hospitalName: hospitalName ?? null,
    primaryDiagnosis: entity.primaryDiagnosis,
    status: entity.status,
    stage: entity.stage,
    assignmentStatus: entity.assignmentStatus,
    treatmentStage: entity.treatmentStage,
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
  preferredLanguage?: string;
  site?: 'beauty' | 'china' | null;
  age: number | null;
  gender: string | null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getEntryProfile(value: Record<string, unknown> | null): {
  gender: string | null;
  country: string | null;
  destination: string | null;
  department: string | null;
  disease: string | null;
  treatmentTime: string | null;
} | null {
  const entryProfile = asRecord(value?.['entryProfile']);
  if (!entryProfile) return null;

  return {
    gender: asString(entryProfile['gender']) ?? null,
    country: asString(entryProfile['country']) ?? null,
    destination: asString(entryProfile['destination']) ?? null,
    department: asString(entryProfile['department']) ?? null,
    disease: asString(entryProfile['disease']) ?? null,
    treatmentTime: asString(entryProfile['treatmentTime']) ?? null,
  };
}

function getCustomHospitalRequest(value: Record<string, unknown> | null): string | null {
  const patientHospitalSelection = asRecord(value?.['patientHospitalSelection']);
  return asString(patientHospitalSelection?.['customHospitalRequest']) ?? null;
}

function deriveDisplayStatus(entity: Case): string {
  // Prefer new treatment stage if set
  if (entity.treatmentStage) {
    const NEW_STAGE_MAP: Record<string, string> = {
      CONFIRMED: 'contacted',
      IN_TREATMENT: 'in_treatment',
      POST_TREATMENT: 'post_treatment',
      COMPLETED: 'completed',
      FOLLOW_UP: 'follow_up',
    };
    return NEW_STAGE_MAP[entity.treatmentStage] ?? 'unknown';
  }
  // Fall back to old stage
  return STAGE_DISPLAY_MAP[entity.stage];
}

export function toHospitalCaseDetailDTO(
  entity: Case,
  progress: CaseProgress[],
  documents: DocumentWithUrlDTO[],
  patient: PatientInfo,
  messageSections: HospitalCaseMessageSectionDTO[] = [],
  totalMessages = 0,
): HospitalCaseDetailDTO {
  const { diagnoses, phoneCalls, consultations } = splitProgressByType(progress);
  return {
    id: entity.id,
    caseNumber: entity.caseNumber.value,
    displayStatus: deriveDisplayStatus(entity),
    hospitalType: deriveHospitalTypeFromPatientSite(patient.site),
    patient: {
      id: patient.id,
      name: entity.patientName,
      code: patient.code,
      country: entity.patientCountry,
      language: patient.preferredLanguage ?? entity.patientLanguage,
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
    documents,
    messageSections,
    totalMessages,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
