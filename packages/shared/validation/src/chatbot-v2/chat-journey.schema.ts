import { z } from 'zod';

export const JOURNEY_STAGES = [
  'EXPLAIN_PROCESS',
  'COLLECT_MINIMAL_MEDICAL_FACTS',
  'COLLECT_MEDICAL_INPUTS',
  'RECOMMENDATION',
  'ONLINE_CONSULT',
  'HUMAN_HANDOFF',
] as const;

export const JOURNEY_PHASES = ['active', 'pre', 'post'] as const;
export const CHAT_RESOURCE_STATUSES = ['available', 'submitted', 'failed'] as const;
export const CHAT_RESOURCE_TYPES = [
  'PROCESS_GUIDE',
  'MEDICAL_DOC_UPLOAD',
  'QUESTIONNAIRE',
  'HOSPITAL_RECOMMENDATION',
  'PACKAGE_RECOMMENDATION',
  'ONLINE_CONSULT_BOOKING',
  'HUMAN_HANDOFF',
  'MEDICAL_INVITATION_STATUS',
] as const;

export const JourneyStageSchema = z.enum(JOURNEY_STAGES);
export const JourneyPhaseSchema = z.enum(JOURNEY_PHASES);
export const ChatResourceStatusSchema = z.enum(CHAT_RESOURCE_STATUSES);
export const ChatResourceTypeSchema = z.enum(CHAT_RESOURCE_TYPES);
export const ChatbotV2RequestClassSchema = z.enum([
  'faq',
  'process_explanation',
  'progression_request',
  'resource_request',
  'resource_status_question',
  'human_help_request',
]);

export const JourneySnapshotSchema = z.object({
  currentStage: JourneyStageSchema,
  currentPhase: JourneyPhaseSchema,
}).strict();

export const ChatResourceVisibilitySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('journey'),
  }).strict(),
  z.object({
    mode: z.literal('global'),
    allowedStages: z.array(JourneyStageSchema).optional(),
  }).strict(),
]);

export const ChatResourceStageBindingSchema = z.object({
  stage: JourneyStageSchema,
  phase: JourneyPhaseSchema.optional(),
}).strict();

export const ChatResourceDescriptorSchema = z.object({
  resourceType: ChatResourceTypeSchema,
  resourceId: z.string().min(1).max(255),
  status: ChatResourceStatusSchema,
  stageBinding: ChatResourceStageBindingSchema.optional(),
  visibility: ChatResourceVisibilitySchema,
  payload: z.record(z.string(), z.unknown()),
  actions: z.array(z.string().min(1).max(80)).max(10),
}).strict().superRefine((value, ctx) => {
  if (value.visibility.mode === 'journey' && !value.stageBinding) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Journey-scoped resources must include stageBinding',
      path: ['stageBinding'],
    });
  }
});

export const ChatAssistantEnvelopeSchema = z.object({
  text: z.string().min(1),
  resources: z.array(ChatResourceDescriptorSchema).default([]),
  journeySnapshot: JourneySnapshotSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const ChatbotV2RecentMessageSchema = z.object({
  role: z.enum(['USER', 'ASSISTANT', 'SYSTEM']),
  content: z.string().min(1),
}).strict();

export const ChatbotV2AllowedResourceHintSchema = z.object({
  resourceType: ChatResourceTypeSchema,
  description: z.string().min(1),
}).strict();

export const ChatbotV2ClassifierInputSchema = z.object({
  recentMessages: z.array(ChatbotV2RecentMessageSchema).min(1).max(6),
  conversationSummary: z.string(),
  journeySnapshot: JourneySnapshotSchema,
  allowedResourceHints: z.array(ChatbotV2AllowedResourceHintSchema),
}).strict();

export const ChatbotV2ClassifierResultSchema = z.object({
  requestClass: ChatbotV2RequestClassSchema,
  targetResourceTypes: z.array(ChatResourceTypeSchema),
  includeProgressionFollowUp: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.requestClass === 'faq' && value.targetResourceTypes.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'FAQ classifications must not target resources',
      path: ['targetResourceTypes'],
    });
  }

  if (
    value.includeProgressionFollowUp
    && value.requestClass !== 'faq'
    && value.requestClass !== 'process_explanation'
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only faq and process_explanation may include progression follow-up',
      path: ['includeProgressionFollowUp'],
    });
  }

  if (new Set(value.targetResourceTypes).size !== value.targetResourceTypes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'targetResourceTypes must be unique',
      path: ['targetResourceTypes'],
    });
  }

  if (
    value.requestClass === 'process_explanation'
    && value.targetResourceTypes.some((resourceType) => resourceType !== 'PROCESS_GUIDE')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'process_explanation may only target PROCESS_GUIDE',
      path: ['targetResourceTypes'],
    });
  }

  if (
    (value.requestClass === 'resource_request' || value.requestClass === 'resource_status_question')
    && value.targetResourceTypes.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${value.requestClass} must target at least one resource`,
      path: ['targetResourceTypes'],
    });
  }

  if (
    value.requestClass === 'human_help_request'
    && value.targetResourceTypes.some((resourceType) => resourceType !== 'HUMAN_HANDOFF')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'human_help_request may only target HUMAN_HANDOFF when target resources are present',
      path: ['targetResourceTypes'],
    });
  }
});

export const ResourceActionResultSchema = z.object({
  resource: ChatResourceDescriptorSchema,
  journeySnapshot: JourneySnapshotSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const ChatResourceStaleErrorSchema = z.object({
  code: z.literal('STALE_RESOURCE'),
  message: z.string().min(1),
  resource: ChatResourceDescriptorSchema,
  journeySnapshot: JourneySnapshotSchema,
}).strict();

export type JourneyStage = z.infer<typeof JourneyStageSchema>;
export type JourneyPhase = z.infer<typeof JourneyPhaseSchema>;
export type ChatResourceStatus = z.infer<typeof ChatResourceStatusSchema>;
export type ChatResourceType = z.infer<typeof ChatResourceTypeSchema>;
export type ChatbotV2RequestClass = z.infer<typeof ChatbotV2RequestClassSchema>;
export type JourneySnapshot = z.infer<typeof JourneySnapshotSchema>;
export type ChatResourceDescriptor = z.infer<typeof ChatResourceDescriptorSchema>;
export type ChatAssistantEnvelope = z.infer<typeof ChatAssistantEnvelopeSchema>;
export type ResourceActionResult = z.infer<typeof ResourceActionResultSchema>;
export type ChatbotV2RecentMessage = z.infer<typeof ChatbotV2RecentMessageSchema>;
export type ChatbotV2AllowedResourceHint = z.infer<typeof ChatbotV2AllowedResourceHintSchema>;
export type ChatbotV2ClassifierInput = z.infer<typeof ChatbotV2ClassifierInputSchema>;
export type ChatbotV2ClassifierResult = z.infer<typeof ChatbotV2ClassifierResultSchema>;
