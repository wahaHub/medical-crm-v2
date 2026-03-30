import { z } from 'zod';

export const chatbotHospitalTypeSchema = z.enum(['COSMETIC', 'REGULAR']);
export const chatbotNextActionSchema = z.enum([
  'ANSWER',
  'CONSULT_CONVERSION',
  'CREATE_CASE',
  'REQUEST_DOCS',
  'ESCALATE',
  'SAFETY',
]);
export const chatbotIntentSchema = z.enum(['FAQ', 'CONSULT', 'UNKNOWN', 'SAFETY']);
export const chatbotRiskLevelSchema = z.enum(['NORMAL', 'SENSITIVE', 'CRISIS']);
export const chatbotTopicSchema = z.string().min(1).max(80);
export const chatbotResponseModeSchema = z.string().min(1).max(80);

export const chatbotUploadInitSchema = z.object({
  sessionId: z.string().min(1).max(255),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
}).strict();

export const chatbotChatSchema = z.object({
  sessionId: z.string().min(1).max(255),
  hospitalType: chatbotHospitalTypeSchema,
  message: z.string().min(1).max(2000),
}).strict();

const chatbotConversionBaseSchema = z.object({
  sessionId: z.string().min(1).max(255),
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  country: z.string().min(1).max(100),
  conditionSummary: z.string().min(1).max(2000),
  budget: z.string().min(1).max(200),
});

export const chatbotConvertSchema = chatbotConversionBaseSchema.extend({
  requestedAction: z.enum(['CONSULT_CONVERSION', 'CREATE_CASE']).optional(),
}).strict();

export const chatbotEscalateSchema = chatbotConversionBaseSchema.extend({
  reason: z.string().min(1).max(1000).optional(),
}).strict();

export const chatbotCitationSchema = z.object({
  sourceTitle: z.string().optional(),
  snippet: z.string().optional(),
  sourceType: z.string().optional(),
  documentId: z.string().optional(),
}).catchall(z.unknown());

export const chatbotCollectedFieldsSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
  conditionSummary: z.string().optional(),
  budget: z.string().optional(),
}).catchall(z.unknown());

export const chatbotRecommendedProviderSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  reason: z.string().optional(),
  ctaUrl: z.string().optional(),
}).catchall(z.unknown());

export const chatbotShortlistItemSchema = z.object({
  hospitalId: z.string().optional(),
  matchType: z.string().optional(),
  reasonCodes: z.array(z.string()).optional(),
}).catchall(z.unknown());

export const chatbotChatResponseSchema = z.object({
  sessionId: z.string().min(1).max(255),
  messageId: z.string().min(1),
  answer: z.string(),
  intent: chatbotIntentSchema.nullable(),
  topic: chatbotTopicSchema.nullable(),
  riskLevel: chatbotRiskLevelSchema.nullable(),
  canAnswer: z.boolean().nullable(),
  nextAction: chatbotNextActionSchema.nullable(),
  secondaryAction: z.string().nullable(),
  responseMode: chatbotResponseModeSchema.nullable(),
  citations: z.array(chatbotCitationSchema),
  collectedFields: chatbotCollectedFieldsSchema.nullable(),
  missingItems: z.array(z.string()),
  recommendedProviders: z.array(chatbotRecommendedProviderSchema),
  reasonCodes: z.array(z.string()),
  shortlist: z.array(chatbotShortlistItemSchema),
  metadata: z.record(z.string(), z.unknown()),
  history: z.object({
    userMessageId: z.string().min(1),
    assistantMessageId: z.string().min(1),
  }),
}).strict();

export const chatbotConvertResponseSchema = z.object({
  sessionId: z.string().min(1).max(255),
  patientId: z.string().min(1).nullable().optional(),
  caseId: z.string().min(1),
  requestedAction: z.enum(['CONSULT_CONVERSION', 'CREATE_CASE']),
  isExistingPatient: z.boolean().optional(),
  alreadyExists: z.boolean(),
}).strict();

export const chatbotEscalateResponseSchema = z.object({
  sessionId: z.string().min(1).max(255),
  patientId: z.string().min(1).nullable().optional(),
  caseId: z.string().min(1).nullable().optional(),
  ticketId: z.string().min(1),
  alreadyExists: z.boolean(),
}).strict();

export const chatbotHistoryMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['USER', 'ASSISTANT', 'SYSTEM']),
  content: z.string(),
  intent: chatbotIntentSchema.nullable(),
  topic: chatbotTopicSchema.nullable().optional(),
  riskLevel: chatbotRiskLevelSchema.nullable(),
  canAnswer: z.boolean().nullable(),
  nextAction: chatbotNextActionSchema.nullable(),
  secondaryAction: z.string().nullable().optional(),
  responseMode: chatbotResponseModeSchema.nullable().optional(),
  citations: z.array(chatbotCitationSchema),
  reasonCodes: z.array(z.string()).optional(),
  shortlist: z.array(chatbotShortlistItemSchema).optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().min(1),
}).strict();

export const chatbotHistoryResponseSchema = z.object({
  session: z.object({
    sessionId: z.string().min(1).max(255),
    hospitalType: chatbotHospitalTypeSchema,
    status: z.enum(['ACTIVE', 'ESCALATED', 'CLOSED']),
    patientId: z.string().nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  }).strict(),
  messages: z.array(chatbotHistoryMessageSchema),
}).strict();

export const chatbotSessionParamSchema = z.object({
  sessionId: z.string().min(1).max(255),
});

export const chatbotHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(100),
});

export type ChatbotUploadInitInput = z.infer<typeof chatbotUploadInitSchema>;
export type ChatbotChatInput = z.infer<typeof chatbotChatSchema>;
export type ChatbotConvertInput = z.infer<typeof chatbotConvertSchema>;
export type ChatbotEscalateInput = z.infer<typeof chatbotEscalateSchema>;
export type ChatbotChatResponse = z.infer<typeof chatbotChatResponseSchema>;
export type ChatbotConvertResponse = z.infer<typeof chatbotConvertResponseSchema>;
export type ChatbotEscalateResponse = z.infer<typeof chatbotEscalateResponseSchema>;
export type ChatbotHistoryResponse = z.infer<typeof chatbotHistoryResponseSchema>;
