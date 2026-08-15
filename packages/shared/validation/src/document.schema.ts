import { z } from 'zod';

export const documentTypeSchema = z.enum([
  'LAB', 'IMAGING', 'DISCHARGE', 'PRESCRIPTION',
  'ID', 'DIAGNOSIS', 'QUOTE', 'INVITATION', 'OTHER',
]);
export const sensitivitySchema = z.enum(['PHI_HIGH', 'PHI_MED', 'PHI_LOW']);

export const uploadDocumentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
  documentType: documentTypeSchema,
  sensitivity: sensitivitySchema.default('PHI_HIGH'),
  language: z.string().max(10).default('en'),
  // Case Lifecycle Phase 1: optional treatment-stage tag; omitting it keeps current behavior
  stageTag: z.string().trim().min(1).max(50).optional(),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
