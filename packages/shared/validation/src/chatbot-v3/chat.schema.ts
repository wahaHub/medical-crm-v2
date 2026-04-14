import { z } from 'zod';

const chatbotV3PageContextSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HOSPITAL_DETAIL'),
    hospitalId: z.string().min(1).max(255),
  }).strict(),
]);

export const chatbotV3AttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
  storageKey: z.string().min(1).max(2048),
}).strict();

export const chatbotV3ChatRequestSchema = z.object({
  sessionId: z.string().min(1).max(255),
  message: z.string().max(2000),
  attachments: z.array(chatbotV3AttachmentSchema).max(10).optional(),
  pageContext: chatbotV3PageContextSchema.optional(),
}).strict().refine(
  (value) => value.message.trim().length > 0 || (value.attachments?.length ?? 0) > 0,
  {
    message: 'Message text or attachments are required',
    path: ['message'],
  },
);

const chatbotV3MessageSchema = z.object({
  role: z.literal('assistant'),
  text: z.string().min(1),
}).strict();

export const chatbotV3TurnOutcomeSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  recoverableErrorCode: z.enum(['TIMEOUT', 'UPSTREAM_UNAVAILABLE', 'UNKNOWN']).nullable(),
}).strict();

const chatbotV3JourneySchema = z.object({
  stage: z.enum(['EXPLAIN_PROCESS', 'COLLECT_MEDICAL_INPUTS', 'RECOMMENDATION', 'ONLINE_CONSULT', 'HUMAN_HANDOFF']),
  phase: z.enum(['pre', 'active', 'post']),
}).strict();

const chatbotV3HandoffSchema = z.object({
  required: z.boolean(),
  ticketId: z.string().min(1).nullable(),
}).strict();

const chatbotV3ProcessGuideCardSchema = z.object({
  cardId: z.string().min(1),
  cardType: z.literal('PROCESS_GUIDE'),
  payload: z.object({
    guideId: z.string().min(1),
    title: z.string().min(1),
  }).strict(),
  actions: z.array(z.object({
    actionType: z.literal('OPEN_MODAL'),
    label: z.string().min(1),
    params: z.object({
      modalKey: z.literal('MEDICAL_TRAVEL_PROCESS'),
    }).strict(),
  }).strict()).max(5),
}).strict();

const chatbotV3UploadRecordsCardSchema = z.object({
  cardId: z.string().min(1),
  cardType: z.literal('UPLOAD_RECORDS'),
  payload: z.object({
    required: z.boolean(),
    uploadedCount: z.number().int().nonnegative(),
  }).strict(),
  actions: z.array(z.union([
    z.object({
      actionType: z.literal('SUBMIT'),
      label: z.string().min(1),
      params: z.object({
        actionKey: z.literal('UPLOAD_RECORDS'),
      }).strict(),
    }).strict(),
    z.object({
      actionType: z.literal('REFRESH_STATUS'),
      label: z.string().min(1),
      params: z.object({
        actionKey: z.literal('UPLOAD_RECORDS'),
      }).strict(),
    }).strict(),
  ])).max(5),
}).strict();

const chatbotV3RecommendationListCardSchema = z.object({
  cardId: z.string().min(1),
  cardType: z.literal('RECOMMENDATION_LIST'),
  payload: z.object({
    candidates: z.array(z.object({
      hospitalId: z.string().min(1),
      name: z.string().min(1),
      reason: z.string().min(1).optional(),
    }).strict()),
  }).strict(),
  actions: z.array(z.object({
    actionType: z.literal('SUBMIT'),
    label: z.string().min(1),
    params: z.object({
      hospitalId: z.string().min(1),
    }).strict(),
  }).strict()).max(5),
}).strict();

const chatbotV3ConsultBookingCardSchema = z.object({
  cardId: z.string().min(1),
  cardType: z.literal('CONSULT_BOOKING'),
  payload: z.object({
    status: z.enum(['idle', 'scheduled', 'failed']),
  }).strict(),
  actions: z.array(z.union([
    z.object({
      actionType: z.literal('SUBMIT'),
      label: z.string().min(1),
      params: z.object({
        actionKey: z.literal('CONSULT_BOOKING'),
      }).strict(),
    }).strict(),
    z.object({
      actionType: z.literal('REFRESH_STATUS'),
      label: z.string().min(1),
      params: z.object({
        actionKey: z.literal('CONSULT_BOOKING'),
      }).strict(),
    }).strict(),
  ])).max(5),
}).strict();

const chatbotV3HandoffStatusCardSchema = z.object({
  cardId: z.string().min(1),
  cardType: z.literal('HANDOFF_STATUS'),
  payload: z.object({
    required: z.boolean(),
    ticketId: z.string().min(1).optional(),
  }).strict(),
  actions: z.array(z.object({
    actionType: z.literal('OPEN_URL'),
    label: z.string().min(1),
    params: z.object({
      actionKey: z.literal('HANDOFF_PORTAL'),
    }).strict(),
  }).strict()).max(5),
}).strict();

export const chatbotV3CardSchema = z.discriminatedUnion('cardType', [
  chatbotV3ProcessGuideCardSchema,
  chatbotV3UploadRecordsCardSchema,
  chatbotV3RecommendationListCardSchema,
  chatbotV3ConsultBookingCardSchema,
  chatbotV3HandoffStatusCardSchema,
]);

export const chatbotV3ChatResponseSchema = z.object({
  messages: z.array(chatbotV3MessageSchema).min(1),
  turnOutcome: chatbotV3TurnOutcomeSchema,
  cards: z.array(chatbotV3CardSchema),
  journey: chatbotV3JourneySchema,
  handoff: chatbotV3HandoffSchema,
}).strict();

export const chatbotV3ErrorSchema = z.object({
  error: z.object({
    code: z.enum(['INVALID_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'SERVICE_UNAVAILABLE', 'INTERNAL_ERROR']),
    message: z.string().min(1),
    traceId: z.string().min(1),
  }).strict(),
}).strict();

export type ChatbotV3Attachment = z.infer<typeof chatbotV3AttachmentSchema>;
export type ChatbotV3ChatRequest = z.infer<typeof chatbotV3ChatRequestSchema>;
export type ChatbotV3Message = z.infer<typeof chatbotV3MessageSchema>;
export type ChatbotV3TurnOutcome = z.infer<typeof chatbotV3TurnOutcomeSchema>;
export type ChatbotV3Journey = z.infer<typeof chatbotV3JourneySchema>;
export type ChatbotV3Handoff = z.infer<typeof chatbotV3HandoffSchema>;
export type ChatbotV3Card = z.infer<typeof chatbotV3CardSchema>;
export type ChatbotV3ChatResponse = z.infer<typeof chatbotV3ChatResponseSchema>;
export type ChatbotV3Error = z.infer<typeof chatbotV3ErrorSchema>;
