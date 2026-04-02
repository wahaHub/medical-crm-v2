import { z } from 'zod';
import { sanitizeRichText } from '@medical-crm/utils';

// POST /api/patient/onboarding/init
export const initOnboardingSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  phone: z.string().trim().min(5).max(20).optional(),
  preferredLanguage: z.string().min(2).max(10).default('en'),
  procedureId: z.string().uuid().optional(),
  destination: z.string().max(100).optional(),
  category: z.enum(['face', 'body', 'non-surgical']).optional(),
  captchaToken: z.string().min(1),
});

// POST /api/patient/match-hospitals
export const matchHospitalsSchema = z.object({
  procedureId: z.string().optional(),
  procedureName: z.string().optional(),
  destination: z.string().max(100).optional(),
  category: z.enum(['face', 'body', 'non-surgical']).optional(),
});

// POST /api/patient/select-hospitals
export const selectHospitalsSchema = z.object({
  caseId: z.string().uuid(),
  hospitalIds: z.array(z.string().uuid()).min(1).max(5),
});

// POST /api/patient/magic-link
export const magicLinkSchema = z.object({
  email: z.string().email().max(255),
});

// POST /api/patient/verify-token
export const verifyTokenSchema = z.object({
  token: z.string().min(1),
});

// POST /api/patient/set-password
export const setPasswordSchema = z.object({
  password: z.string().min(8).max(100),
});

// POST /api/patient/conversations/:convId/messages
export const sendPatientMessageSchema = z.object({
  content: z.string().max(10000).transform(sanitizeRichText),
  messageType: z.enum(['TEXT', 'IMAGE', 'FILE']).default('TEXT'),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileSize: z.number(),
    mimeType: z.string(),
    storageKey: z.string(),
  })).optional(),
}).superRefine((value, ctx) => {
  const hasContent = value.content.trim().length > 0;
  const hasAttachments = (value.attachments?.length ?? 0) > 0;

  if (!hasContent && !hasAttachments) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content'],
      message: 'Message content or attachments are required',
    });
  }
});

// GET /api/patient/conversations/:convId/messages
export const listMessagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  after: z.string().uuid().optional(),
});

// POST /api/patient/intake/:caseId
export const submitIntakeSchema = z.object({
  responses: z.array(z.object({
    questionId: z.string(),
    answer: z.union([z.string(), z.array(z.string())]),
  })),
});

// POST /api/patient/cases/:id/quote/accept & reject
export const quoteActionSchema = z.object({
  quoteId: z.string().uuid(),
});

export type InitOnboardingInput = z.infer<typeof initOnboardingSchema>;
export type MatchHospitalsInput = z.infer<typeof matchHospitalsSchema>;
export type SelectHospitalsInput = z.infer<typeof selectHospitalsSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type SendPatientMessageInput = z.infer<typeof sendPatientMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SubmitIntakeInput = z.infer<typeof submitIntakeSchema>;
export type QuoteActionInput = z.infer<typeof quoteActionSchema>;
