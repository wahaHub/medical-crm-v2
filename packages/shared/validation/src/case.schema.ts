import { z } from 'zod';

export const caseStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED']);
export const caseStageSchema = z.enum([
  'PENDING_ASSIGNMENT',
  'TRANSFERRED_TO_HOSPITAL',
  'HOSPITAL_CONTACTED',
  'CONSULTATION_SCHEDULED',
  'IN_TREATMENT',
  'TREATMENT_COMPLETED',
]);
export const riskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const caseAssignmentStatusSchema = z.enum(['UNASSIGNED', 'ASSIGNED']);
export const caseTreatmentStageSchema = z.enum(['CONFIRMED', 'IN_TREATMENT', 'POST_TREATMENT', 'COMPLETED', 'FOLLOW_UP']);

export const caseListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  /** @deprecated Use assignmentStatus */
  status: caseStatusSchema.optional(),
  /** @deprecated Use treatmentStage */
  stage: caseStageSchema.optional(),
  assignmentStatus: caseAssignmentStatusSchema.optional(),
  treatmentStage: caseTreatmentStageSchema.optional(),
  hospitalId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type CaseListQuery = z.infer<typeof caseListQuerySchema>;

export const createCaseSchema = z.object({
  patientId: z.string().uuid(),
  patientName: z.string().min(1).max(100),
  patientCountry: z.string().max(100).optional(),
  patientLanguage: z.string().max(10).default('en'),
  primaryDiagnosis: z.string().optional(),
  symptoms: z.array(z.string()).optional(),
  medicalHistory: z.string().optional(),
});

export const updateCaseSchema = z.object({
  primaryDiagnosis: z.string().optional(),
  diagnosisCode: z.string().max(50).optional(),
  symptoms: z.array(z.string()).optional(),
  medicalHistory: z.string().optional(),
  patientCountry: z.string().max(100).optional(),
  patientLanguage: z.string().max(10).optional(),
});

export const saveCaseDiagnosisSchema = z.object({
  title: z.string().trim().min(1),
  diagnosisType: z.string().optional(),
  icdCode: z.string().max(50).optional(),
  severity: z.string().optional(),
  description: z.string().optional(),
  treatmentRecommendation: z.string().optional(),
  suggestedTests: z.string().optional(),
  costEstimate: z.string().optional(),
  treatmentDuration: z.string().optional(),
});

export const assignCaseSchema = z.object({
  hospitalId: z.string().uuid(),
});

export const updateCaseStatusSchema = z.object({
  assignmentStatus: caseAssignmentStatusSchema,
});

export const advanceCaseStageSchema = z.object({
  treatmentStage: caseTreatmentStageSchema,
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type SaveCaseDiagnosisInput = z.infer<typeof saveCaseDiagnosisSchema>;
export type AssignCaseInput = z.infer<typeof assignCaseSchema>;
