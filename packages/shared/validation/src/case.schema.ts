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
export const caseSourceChannelSchema = z.enum(['WEB_ONBOARDING', 'MANUAL', 'EMAIL', 'WHATSAPP', 'PHONE_CALL', 'REFERRAL']);
export const patientSiteSchema = z.enum(['beauty', 'china']);

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
  patientSite: patientSiteSchema.optional(),
  /** Case Lifecycle Phase 2: merged cases are excluded unless includeMerged=true */
  includeMerged: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
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

// Case Lifecycle Phase 1: manual case creation by an admin (offline channels)
export const createManualCaseSchema = z.object({
  patientName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().min(1).max(20).optional(),
  whatsapp: z.string().trim().min(1).max(50).optional(),
  sourceChannel: caseSourceChannelSchema.exclude(['WEB_ONBOARDING']),
  conditionSummary: z.string().trim().max(5000).optional(),
  patientCountry: z.string().trim().max(100).optional(),
  patientLanguage: z.string().max(10).default('en'),
  patientSite: patientSiteSchema.default('china'),
}).refine(
  (value) => Boolean(value.email || value.phone || value.whatsapp),
  { message: 'At least one contact method (email, phone, or whatsapp) is required', path: ['email'] },
);

// Case Lifecycle Phase 1: admin note recorded on the case timeline
export const addCaseNoteSchema = z.object({
  note: z.string().trim().min(1).max(5000),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type CreateManualCaseInput = z.infer<typeof createManualCaseSchema>;
export type AddCaseNoteInput = z.infer<typeof addCaseNoteSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type SaveCaseDiagnosisInput = z.infer<typeof saveCaseDiagnosisSchema>;
export type AssignCaseInput = z.infer<typeof assignCaseSchema>;
