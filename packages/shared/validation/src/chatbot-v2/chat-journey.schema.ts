import { z } from 'zod';

export const JOURNEY_STAGES = [
  'EXPLAIN_PROCESS',
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
export type JourneySnapshot = z.infer<typeof JourneySnapshotSchema>;
export type ChatResourceDescriptor = z.infer<typeof ChatResourceDescriptorSchema>;
export type ChatAssistantEnvelope = z.infer<typeof ChatAssistantEnvelopeSchema>;
export type ResourceActionResult = z.infer<typeof ResourceActionResultSchema>;
