import { z } from 'zod';
import { sanitizeRichText } from '@medical-crm/utils';

const beautyProcedureCategorySchema = z.enum(['face', 'body', 'non-surgical', 'hair']);

// POST /api/patient/onboarding/init
export const initOnboardingSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  phone: z.string().trim().min(5).max(20).optional(),
  age: z.string().trim().max(20).optional(),
  gender: z.string().trim().max(40).optional(),
  country: z.string().trim().max(120).optional(),
  whatsapp: z.string().trim().max(120).optional(),
  messenger: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  departmentCode: z.string().trim().max(120).optional(),
  disease: z.string().trim().max(500).optional(),
  preferredLanguage: z.string().min(2).max(10).default('en'),
  procedureId: z.string().uuid().optional(),
  destination: z.string().max(100).optional(),
  treatmentTime: z.string().trim().max(120).optional(),
  category: beautyProcedureCategorySchema.optional(),
  registerToken: z.string().min(1).optional(),
  captchaToken: z.string().min(1).optional(),
});

// POST /api/patient/match-hospitals
export const matchHospitalsSchema = z.object({
  procedureId: z.string().optional(),
  procedureName: z.string().optional(),
  destination: z.string().max(100).optional(),
  category: beautyProcedureCategorySchema.optional(),
});

// POST /api/patient/select-hospitals
export const selectHospitalsSchema = z.object({
  caseId: z.string().uuid(),
  hospitalIds: z.array(z.string().uuid()).max(5),
  customHospitalRequest: z.string().trim().max(200).optional(),
}).superRefine((value, ctx) => {
  if (value.hospitalIds.length === 0 && !(value.customHospitalRequest && value.customHospitalRequest.trim().length > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['hospitalIds'],
      message: 'Select at least one hospital or provide a custom hospital request',
    });
  }
});

// POST /api/patient/magic-link
export const magicLinkSchema = z.object({
  email: z.string().email().max(255),
});

// POST /api/patient/login
export const patientPasswordLoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
});

// POST /api/patient/verify-token
export const verifyTokenSchema = z.object({
  token: z.string().min(1),
});

// POST /api/patient/register-token/verify
export const verifyRegisterTokenSchema = z.object({
  token: z.string().min(1),
});

// POST /api/patient/session/restore
export const restoreTokenSchema = z.object({
  restoreToken: z.string().min(1),
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
  locale: z.enum(['en', 'zh']).optional(),
});

export const patientChatEventSchema = z.object({
  eventType: z.enum([
    'ACTION_SELECTED',
    'PROCESS_GUIDE_CONFIRMED',
    'PROCESS_GUIDE_DISMISSED',
    'ADVISOR_HANDOFF_REQUESTED',
    'QUESTIONNAIRE_OPENED',
    'QUESTIONNAIRE_SUBMITTED',
    'ATTACHMENT_UPLOAD_STARTED',
    'ATTACHMENT_UPLOAD_COMPLETED',
    'ATTACHMENT_UPLOAD_FAILED',
    'TEXT_MESSAGE_SUBMITTED',
    'BOT_MODE_CHANGED',
    'ADMIN_TAKEOVER_STARTED',
  ]),
  actionKey: z.enum(['VIEW_PROCESS', 'UPLOAD_RECORDS', 'CONTACT_ADVISOR', 'OPEN_QUESTIONNAIRE']).optional(),
  clientMessageId: z.string().min(1).max(120).optional(),
  serverMessageId: z.string().min(1).max(120).optional(),
  locale: z.enum(['en', 'zh']).default('en'),
  payload: z.record(z.unknown()).optional(),
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
export type PatientPasswordLoginInput = z.infer<typeof patientPasswordLoginSchema>;
export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>;
export type VerifyRegisterTokenInput = z.infer<typeof verifyRegisterTokenSchema>;
export type RestoreTokenInput = z.infer<typeof restoreTokenSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type SendPatientMessageInput = z.infer<typeof sendPatientMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type PatientChatEventInput = z.infer<typeof patientChatEventSchema>;
export type SubmitIntakeInput = z.infer<typeof submitIntakeSchema>;
export type QuoteActionInput = z.infer<typeof quoteActionSchema>;
