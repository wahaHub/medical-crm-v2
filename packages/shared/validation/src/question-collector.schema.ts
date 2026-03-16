import { z } from 'zod';

export const qcCompletionStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const createTemplateSchema = z.object({
  templateName: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  procedureTypes: z.array(z.string()).default([]),
  questions: z.any(),
  isActive: z.boolean().default(true),
});

export const updateTemplateSchema = z.object({
  templateName: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  procedureTypes: z.array(z.string()).optional(),
  questions: z.unknown().optional(),
  isActive: z.boolean().optional(),
});

export const templateListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  isActive: z.coerce.boolean().optional(),
  category: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const submitResponseSchema = z.object({
  templateId: z.string().uuid(),
  responses: z.any(),
  riskFlags: z.array(z.string()).optional(),
  extractedData: z.unknown().optional(),
});

export const saveResponseDraftSchema = z.object({
  templateId: z.string().uuid(),
  responses: z.any(),
});

export const responseListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  caseId: z.string().uuid().optional(),
  completionStatus: qcCompletionStatusSchema.optional(),
  hasRiskFlags: z.coerce.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Customizations
// ---------------------------------------------------------------------------

export const customizeQuestionsSchema = z.object({
  customizedQuestions: z.any(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type TemplateListQueryInput = z.infer<typeof templateListQuerySchema>;
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;
export type SaveResponseDraftInput = z.infer<typeof saveResponseDraftSchema>;
export type ResponseListQueryInput = z.infer<typeof responseListQuerySchema>;
export type CustomizeQuestionsInput = z.infer<typeof customizeQuestionsSchema>;
