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

export const caseListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: caseStatusSchema.optional(),
  stage: caseStageSchema.optional(),
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

export const assignCaseSchema = z.object({
  hospitalId: z.string().uuid(),
});

export const updateCaseStatusSchema = z.object({
  status: caseStatusSchema,
});

export const advanceCaseStageSchema = z.object({
  stage: caseStageSchema,
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type AssignCaseInput = z.infer<typeof assignCaseSchema>;
