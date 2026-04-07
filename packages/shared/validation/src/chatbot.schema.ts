import { z } from 'zod';
import {
  AI_POLICY_ENGAGEMENT_SIGNALS,
  AI_POLICY_PROGRESSION_SIGNALS,
  AI_POLICY_RECOMMENDATION_SIGNALS,
  AI_POLICY_RESOLVED_INTENTS,
} from '@medical-crm/utils';

export const chatbotHospitalTypeSchema = z.enum(['COSMETIC', 'REGULAR']);
export const chatbotNextActionSchema = z.enum([
  'ANSWER_FAQ',
  'EXPLAIN_DOC_UPLOAD',
  'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
  'EXPLAIN_CONSULT_PROCESS',
  'SHOW_HOSPITAL_RECOMMENDATIONS',
  'REQUEST_DOC_UPLOAD',
  'INVITE_ONLINE_CONSULT',
  'SHOW_PACKAGE',
  'HUMAN_HANDOFF',
  'SAFETY_HANDOFF',
]);
export const chatbotIntentSchema = z.enum(['FAQ', 'CONSULT', 'UNKNOWN', 'SAFETY']);
export const chatbotRiskLevelSchema = z.enum(['NORMAL', 'SENSITIVE', 'CRISIS']);
export const chatbotResolvedIntentSchema = z.enum(AI_POLICY_RESOLVED_INTENTS);
export const chatbotEngagementSignalSchema = z.enum(AI_POLICY_ENGAGEMENT_SIGNALS);
export const chatbotProgressionSignalSchema = z.enum(AI_POLICY_PROGRESSION_SIGNALS);
export const chatbotRecommendationSignalSchema = z.enum(AI_POLICY_RECOMMENDATION_SIGNALS);
export const chatbotSemanticSignalsSchema = z.object({
  resolvedIntent: chatbotResolvedIntentSchema,
  engagementSignal: chatbotEngagementSignalSchema,
  progressionSignal: chatbotProgressionSignalSchema,
  recommendationSignal: chatbotRecommendationSignalSchema,
  mentionsCondition: z.boolean(),
  mentionsDoctorOrHospitalNeed: z.boolean(),
}).strict();
export const chatbotTopicSchema = z.string().min(1).max(80);
export const chatbotResponseModeSchema = z.string().min(1).max(80);
export const chatbotPageContextSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HOSPITAL_DETAIL'),
    hospitalId: z.string().min(1).max(255),
    hospitalName: z.string().min(1).max(255).optional(),
  }).strict(),
]);

export const chatbotUploadInitSchema = z.object({
  sessionId: z.string().min(1).max(255),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
}).strict();

export const chatbotAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
  storageKey: z.string().min(1).max(2048),
}).strict();

export const chatbotHistoryAttachmentSchema = chatbotAttachmentSchema.extend({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  size: z.number().int().positive(),
  url: z.string(),
}).strict();

export const chatbotChatSchema = z.object({
  sessionId: z.string().min(1).max(255),
  hospitalType: chatbotHospitalTypeSchema.optional(),
  message: z.string().max(2000),
  attachments: z.array(chatbotAttachmentSchema).max(10).optional(),
  pageContext: chatbotPageContextSchema.optional(),
}).strict().refine(
  (value) => value.message.trim().length > 0 || (value.attachments?.length ?? 0) > 0,
  {
    message: 'Message text or attachments are required',
    path: ['message'],
  },
);

const chatbotConversionBaseSchema = z.object({
  sessionId: z.string().min(1).max(255),
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  country: z.string().min(1).max(100),
  conditionSummary: z.string().min(1).max(2000),
  budget: z.string().min(1).max(200),
});

export const chatbotConvertSchema = chatbotConversionBaseSchema.extend({
  requestedAction: z.enum(['INVITE_ONLINE_CONSULT', 'CREATE_CASE']).optional(),
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

const chatbotBlockIdSchema = z.string().min(1).max(255);
const chatbotUuidSchema = z.string().uuid();

export const chatbotMessageBlockSchema = z.discriminatedUnion('type', [
  z.object({
    id: chatbotBlockIdSchema,
    type: z.literal('PROCESS_MODAL_TRIGGER'),
    modalKey: z.literal('MEDICAL_TRAVEL_PROCESS'),
    title: z.string(),
    description: z.string().optional(),
    ctaLabel: z.string().optional(),
  }).strict(),
  z.object({
    id: chatbotBlockIdSchema,
    type: z.literal('QUESTIONNAIRE_MODAL_TRIGGER'),
    templateId: chatbotUuidSchema,
    title: z.string(),
    description: z.string().optional(),
    ctaLabel: z.string().optional(),
  }).strict(),
  z.object({
    id: chatbotBlockIdSchema,
    type: z.literal('HOSPITAL_RECOMMENDATION_CARDS'),
    title: z.string(),
    caseId: chatbotUuidSchema,
    selectPath: z.literal('/select-hospitals'),
    description: z.string().optional(),
    hospitals: z.array(z.object({
      hospitalId: chatbotUuidSchema,
      name: z.string().optional(),
      reason: z.string().optional(),
      summary: z.string().optional(),
      ctaUrl: z.string().optional(),
      thumbnailUrl: z.string().optional(),
      thumbnailFallbackUrls: z.array(z.string()).optional(),
      slug: z.string().optional(),
      city: z.string().optional(),
      matchType: z.string().optional(),
      reasonCodes: z.array(z.string()).optional(),
    }).catchall(z.unknown())),
  }).strict(),
  z.object({
    id: chatbotBlockIdSchema,
    type: z.literal('ONLINE_CONSULT_BOOKING_CARD'),
    title: z.string(),
    description: z.string().optional(),
    requestedAction: z.literal('INVITE_ONLINE_CONSULT'),
    convertPath: z.string().min(1),
    conversionDraft: z.object({
      sessionId: z.string().min(1).max(255),
      name: z.string().min(1).max(255),
      email: z.string().email().max(255),
      country: z.string().min(1).max(255),
      conditionSummary: z.string().min(1).max(2000),
      budget: z.string().min(1).max(255),
    }).strict(),
    consultationStatus: z.string().optional(),
    requestState: z.enum(['idle', 'submitted', 'failed']).optional(),
  }).strict(),
]);

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
  blocks: z.array(chatbotMessageBlockSchema).default([]),
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
  restoreToken: z.string().min(1).optional(),
  requestedAction: z.enum(['INVITE_ONLINE_CONSULT', 'CREATE_CASE']),
  isExistingPatient: z.boolean().optional(),
  alreadyExists: z.boolean(),
}).strict();

export const chatbotEscalateResponseSchema = z.object({
  sessionId: z.string().min(1).max(255),
  patientId: z.string().min(1).nullable().optional(),
  caseId: z.string().min(1).nullable().optional(),
  ticketId: z.string().min(1),
  restoreToken: z.string().min(1).optional(),
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
  blocks: z.array(chatbotMessageBlockSchema).optional(),
  metadata: z.record(z.string(), z.unknown()),
  attachments: z.array(chatbotHistoryAttachmentSchema).optional(),
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
export type ChatbotSemanticSignals = z.infer<typeof chatbotSemanticSignalsSchema>;
export type ChatbotChatResponse = z.infer<typeof chatbotChatResponseSchema>;
export type ChatbotConvertResponse = z.infer<typeof chatbotConvertResponseSchema>;
export type ChatbotEscalateResponse = z.infer<typeof chatbotEscalateResponseSchema>;
export type ChatbotHistoryResponse = z.infer<typeof chatbotHistoryResponseSchema>;
export type ChatbotMessageBlock = z.infer<typeof chatbotMessageBlockSchema>;
