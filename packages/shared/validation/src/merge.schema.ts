import { z } from 'zod';

// Case Lifecycle Phase 2: POST /api/v2/cases/{id}/merge (path id = secondary case)
export const mergeCasesSchema = z.object({
  primaryCaseId: z.string().uuid(),
  confirmDifferentPatients: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});
export type MergeCasesInput = z.infer<typeof mergeCasesSchema>;

// Case Lifecycle Phase 2: POST /api/v2/patients/{id}/merge (path id = secondary patient)
export const mergePatientsSchema = z.object({
  primaryPatientId: z.string().uuid(),
  dryRun: z.boolean().optional(),
});
export type MergePatientsInput = z.infer<typeof mergePatientsSchema>;

// Case Lifecycle Phase 2: GET /api/v2/patients/search (merge target picker)
export const patientSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().positive().max(20).optional(),
});
export type PatientSearchQuery = z.infer<typeof patientSearchQuerySchema>;
