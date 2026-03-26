import { z } from 'zod';

export const addProgressSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DIAGNOSIS'),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    diagnosisType: z.string().optional(),
    icdCode: z.string().optional(),
    severity: z.string().optional(),
    treatmentRecommendation: z.string().optional(),
    suggestedTests: z.string().optional(),
    costEstimate: z.string().optional(),
    treatmentDuration: z.string().optional(),
  }),
  z.object({
    type: z.literal('PHONE_CALL'),
    callResult: z.string().optional(),
    summary: z.string().optional(),
    duration: z.number().optional(),
    nextFollowUp: z.string().optional(),
  }),
  z.object({
    type: z.literal('STATUS_CHANGE'),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('NOTE'),
    note: z.string().trim().optional(),
    attachmentNames: z.array(z.string().min(1)).optional(),
    documentIds: z.array(z.string().uuid()).optional(),
  }),
  z.object({
    type: z.literal('DOCUMENT_UPLOAD'),
    documentId: z.string().uuid(),
  }),
]);

export type AddProgressInput = z.infer<typeof addProgressSchema>;
