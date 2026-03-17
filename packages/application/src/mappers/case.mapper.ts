import type { Case, CaseProgress, Document, CaseStage } from '@medical-crm/domain';
import type { CaseDTO, HospitalCaseDetailDTO, MedicalIntakeDTO } from '../dtos/case.dto.js';
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
  age: number | null;
  gender: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function appendUnique(values: string[], next?: string) {
  if (next && !values.includes(next)) values.push(next);
}

function looksLikeNormalizedMedicalIntake(value: Record<string, unknown>): boolean {
  return ['step1', 'step2', 'step3', 'step4', 'step5'].some((key) => asRecord(value[key]) !== null);
}

function deriveLegacyMedicalHistory(value: Record<string, unknown> | null): string[] | undefined {
  if (!value) return undefined;

  const history = asRecord(value['past_medical_history']);
  const conditions: string[] = [];
  const labels: Record<string, string> = {
    hypertension: 'Hypertension',
    diabetes: 'Diabetes',
    heart_disease: 'Heart disease',
    stroke: 'Stroke',
    hepatitis: 'Hepatitis',
    kidney_disease: 'Kidney disease',
    cancer: 'Cancer',
    tuberculosis: 'Tuberculosis',
  };

  for (const [key, label] of Object.entries(labels)) {
    if (history?.[key] === true) appendUnique(conditions, label);
  }
  appendUnique(conditions, asString(history?.['other']));
  if (history?.['none'] === true) appendUnique(conditions, 'None');

  return conditions.length > 0 ? conditions : undefined;
}

function formatMedicationList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) return null;
      const name = asString(record['name']);
      if (!name) return null;
      const dosage = asString(record['dosage']);
      return dosage ? `${name} (${dosage})` : name;
    })
    .filter((item): item is string => !!item);

  return items.length > 0 ? items.join('; ') : undefined;
}

function formatAllergyList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) return null;
      const substance = asString(record['substance']);
      if (!substance) return null;
      const reaction = asString(record['reaction']);
      return reaction ? `${substance} (${reaction})` : substance;
    })
    .filter((item): item is string => !!item);

  return items.length > 0 ? items.join('; ') : undefined;
}

function deriveLegacyMedicalIntake(sd: Record<string, unknown>): MedicalIntakeDTO | null {
  const step2 = asRecord(sd['step2_symptom_location']);
  const step3 = asRecord(sd['step3_detailed_symptoms']);
  const step4 = asRecord(sd['step4_medical_history']);
  const step5 = asRecord(sd['step5_medications_allergies']);
  const step6 = asRecord(sd['step6_examinations']);
  const step7 = asRecord(sd['step7_expectations']);

  if (!step2 && !step3 && !step4 && !step5 && !step6 && !step7) {
    return null;
  }

  const symptomNature = [
    ...(asStringArray(step2?.['symptom_nature']) ?? []),
    ...(asString(step2?.['symptom_nature_other']) ? [asString(step2?.['symptom_nature_other'])!] : []),
  ];

  const allergies = asRecord(step5?.['allergies']);

  return {
    step1: {
      symptomLocation: asString(step2?.['primary_location_other']) ?? asString(step2?.['primary_location']),
      symptomNature: symptomNature.length > 0 ? symptomNature : undefined,
      onsetTime: asString(step2?.['onset_time']),
      progressTrend: asString(step2?.['progression_trend']) ?? asString(step3?.['progression']),
      diagnosisStage: asString(step2?.['diagnosis_stage']),
      diseaseCategory: asString(step2?.['main_category']),
    },
    step2: {
      detailedDescription: asString(step3?.['detailed_description']),
      aggravatingFactors: asStringArray(step3?.['aggravating_factors']),
      relievingFactors: asStringArray(step3?.['relieving_factors']),
      previousTreatment: asString(step3?.['previous_treatments']),
    },
    step3: {
      medicalHistory: deriveLegacyMedicalHistory(step4),
      chronicConditions: asString(step4?.['chronic_conditions_description']),
      familyHistory: asString(step4?.['family_history_description']),
    },
    step4: {
      currentMedications: formatMedicationList(step5?.['current_medications']),
      drugAllergies: formatAllergyList(asRecord(allergies)?.['drug_allergies']),
      foodAllergies: formatAllergyList(asRecord(allergies)?.['food_allergies']),
    },
    step5: {
      examTypes: asStringArray(step6?.['exam_types_selected']),
      examDetails: asString(step6?.['exam_details_summary']),
      labResults: asString(step6?.['lab_results_summary']),
      treatmentExpectations: asStringArray(step7?.['treatment_expectations']),
      budgetRange: asString(step7?.['budget_range']),
      expectedTimeline: asString(step7?.['preferred_timing']),
    },
  };
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

/**
 * Derive step-based medical intake from Case entity fields.
 *
 * The v1 API reconstructed a multi-step questionnaire structure from
 * flat case columns.  `structuredData` may contain richer intake info
 * saved during patient onboarding; fall back to the top-level columns.
 */
function deriveMedicalIntake(entity: Case): MedicalIntakeDTO {
  const sd = (entity.structuredData ?? {}) as Record<string, unknown>;

  // If structuredData already contains a fully-formed medicalIntake object,
  // use it directly (this is the case when the intake wizard persists data).
  if (sd['medicalIntake'] && typeof sd['medicalIntake'] === 'object') {
    return sd['medicalIntake'] as MedicalIntakeDTO;
  }

  if (looksLikeNormalizedMedicalIntake(sd)) {
    return sd as MedicalIntakeDTO;
  }

  const legacyIntake = deriveLegacyMedicalIntake(sd);
  if (legacyIntake) {
    return legacyIntake;
  }

  // Otherwise reconstruct from flat Case columns (mirrors v1 behaviour)
  const symptoms = entity.symptoms ?? [];
  return {
    step1: {
      symptomLocation: symptoms[0] ?? undefined,
      symptomNature: symptoms.length > 0 ? symptoms : undefined,
      diagnosisStage: entity.primaryDiagnosis ? 'Diagnosed' : 'Pending Diagnosis',
      diseaseCategory: entity.diagnosisCode ?? undefined,
    },
    step2: entity.medicalHistory
      ? { detailedDescription: entity.medicalHistory }
      : undefined,
  };
}

export function toHospitalCaseDetailDTO(
  entity: Case,
  progress: CaseProgress[],
  documents: Document[],
  signedUrls: Record<string, string>,
  patient: PatientInfo,
  totalMessages = 0,
): HospitalCaseDetailDTO {
  const { diagnoses, phoneCalls, consultations } = splitProgressByType(progress);
  return {
    id: entity.id,
    caseNumber: entity.caseNumber.value,
    displayStatus: deriveDisplayStatus(entity),
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
    medicalIntake: deriveMedicalIntake(entity),
    aiSummary: entity.aiSummary,
    riskLevel: entity.riskLevel,
    diagnoses,
    phoneCalls,
    consultationHistory: consultations,
    documents: documents.map((d) =>
      toDocumentDTO(d, signedUrls[d.storageKey] ?? ''),
    ),
    totalMessages,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
