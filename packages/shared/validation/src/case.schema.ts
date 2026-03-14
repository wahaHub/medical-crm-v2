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
