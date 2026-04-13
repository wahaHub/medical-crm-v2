import {
  ConversationOrchestratorService,
  LlmRequestClassifierService,
  StageCopyRegistryService,
  type ChatbotV2ClassifierInput,
  type ChatbotV2ClassifierResourceHint,
  type ChatbotV2ClassifierMessage,
  type ChatbotV2RequestClassificationResult,
  deriveJourneyTruthFromStatusSnapshot,
} from '@medical-crm/application';
import type { AiChatStatusSnapshot } from '@medical-crm/domain';
import type {
  ChatResourceDescriptor,
  JourneySnapshot,
} from '@medical-crm/validation';
import { ChatResourceDescriptorSchema, JourneySnapshotSchema } from '@medical-crm/validation';
import type { getServices } from '../composition-root.js';

type Services = ReturnType<typeof getServices>;

type PageContext = {
  type: 'HOSPITAL_DETAIL';
  hospitalId: string;
  hospitalName?: string;
} | null | undefined;

type ChatbotV2Envelope = {
  journeySnapshot: JourneySnapshot;
  resources: ChatResourceDescriptor[];
  truthSummary: JourneyTruth;
  stageCopy?: {
    stage: string;
    phase: string;
    referenceText: string;
  } | null;
  requestClass: string;
  responseIntent: string;
  targetResourceTypes: string[];
  includeProgressionFollowUp?: boolean;
};

type JourneyTruth = ReturnType<typeof deriveJourneyTruth>;

type ChatbotV2FoundationContext = {
  scopeId: string;
  journeySnapshot: JourneySnapshot;
  truth: JourneyTruth;
  resources: ChatResourceDescriptor[];
  hasCompletedInitialProcessExplanation: boolean;
  classification: ChatbotV2RequestClassificationResult;
  requiresFaqGrounding: boolean;
  activeHospitalContext: {
    hospitalId: string;
    hospitalName: string | null;
  } | null;
  requestClass?: string;
  responseIntent?: string;
};

const DEFAULT_BOOTSTRAP_CLASSIFICATION: ChatbotV2RequestClassificationResult = {
  requestClass: 'process_explanation',
  targetResourceTypes: ['PROCESS_GUIDE'],
  includeProgressionFollowUp: false,
};

export type ChatbotV2TurnContext = {
  preTurn: ChatbotV2Envelope;
  foundation: ChatbotV2FoundationContext;
};

const orchestrator = new ConversationOrchestratorService();
const stageCopyRegistry = new StageCopyRegistryService();

export function buildChatbotV2StarterEnvelope(input: {
  foundation: ChatbotV2FoundationContext;
}): ChatbotV2Envelope {
  const starterJourneySnapshot: JourneySnapshot = {
    currentStage: 'EXPLAIN_PROCESS',
    currentPhase: 'pre',
  };
  const starterResources = [{
    resourceType: 'PROCESS_GUIDE' as const,
    resourceId: `process-guide:${input.foundation.scopeId}`,
    status: 'available' as const,
    stageBinding: {
      stage: 'EXPLAIN_PROCESS' as const,
      phase: 'active' as const,
    },
    visibility: {
      mode: 'global' as const,
    },
    payload: {
      title: 'Understand our consultation process',
    },
    actions: ['open'],
  }];

  return {
    journeySnapshot: starterJourneySnapshot,
    resources: starterResources,
    truthSummary: input.foundation.truth,
    stageCopy: readStageCopy(starterJourneySnapshot),
    requestClass: 'process_explanation',
    responseIntent: 'process_explanation',
    targetResourceTypes: ['PROCESS_GUIDE'],
    includeProgressionFollowUp: false,
  };
}

export async function buildChatbotV2TurnContext(input: {
  services: Services;
  sessionId: string;
  userMessage: string;
  pageContext?: PageContext;
  classifierOverride?: ChatbotV2RequestClassificationResult;
}): Promise<ChatbotV2TurnContext> {
  const policyContext = await input.services.getAiPolicyContext.execute({
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    pageContext: input.pageContext ?? null,
  });

  const foundation = readFoundationContext(policyContext, input.sessionId);
  if (input.userMessage.trim().length === 0) {
    return {
      preTurn: {
        journeySnapshot: foundation.journeySnapshot,
        resources: foundation.resources,
        truthSummary: foundation.truth,
        stageCopy: readStageCopy(foundation.journeySnapshot),
        requestClass: 'process_explanation',
        responseIntent: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
      },
      foundation: {
        ...foundation,
        classification: DEFAULT_BOOTSTRAP_CLASSIFICATION,
        requiresFaqGrounding: true,
      },
    };
  }

  const classification = input.classifierOverride ?? await classifyTurn({
    services: input.services,
    sessionId: input.sessionId,
    scopeId: foundation.scopeId,
    userMessage: input.userMessage,
    journeySnapshot: foundation.journeySnapshot,
    resources: foundation.resources,
    conversationSummary: readConversationSummary(policyContext),
    policyContext,
  });
  const orchestration = orchestrator.orchestrate({
    scopeId: foundation.scopeId,
    journeySnapshot: foundation.journeySnapshot,
    truth: foundation.truth,
    classification,
    hasCompletedInitialProcessExplanation: foundation.hasCompletedInitialProcessExplanation,
  });

  return {
    preTurn: {
      journeySnapshot: orchestration.journeyUpdate ?? foundation.journeySnapshot,
      resources: orchestration.allowedResources.map((resource) => ChatResourceDescriptorSchema.parse(resource)),
      truthSummary: foundation.truth,
      stageCopy: readStageCopy(orchestration.journeyUpdate ?? foundation.journeySnapshot),
      requestClass: orchestration.requestClass,
      responseIntent: orchestration.responseIntent,
      targetResourceTypes: [...classification.targetResourceTypes],
      includeProgressionFollowUp: orchestration.includeProgressionFollowUpAccepted ?? false,
    },
    foundation: {
      ...foundation,
      classification,
      requiresFaqGrounding: orchestration.requiresFaqGrounding ?? false,
    },
  };
}

export function buildChatbotV2PostTurnContext(input: {
  foundation: ChatbotV2FoundationContext;
  preTurn: ChatbotV2Envelope;
  userMessage?: string;
  refreshedStatusSnapshot?: Partial<AiChatStatusSnapshot> | null;
  assistantNextAction?: string | null;
  assistantInternalNextAction?: string | null;
}): ChatbotV2Envelope {
  const requestClass = input.preTurn.requestClass
    || input.foundation.requestClass
    || 'faq';
  const responseIntent = input.preTurn.responseIntent
    || input.foundation.responseIntent
    || requestClass;
  const refreshedTruth = input.refreshedStatusSnapshot
    ? deriveJourneyTruthFromStatusSnapshot(input.refreshedStatusSnapshot)
    : input.foundation.truth;
  const currentJourneySnapshot = input.preTurn.journeySnapshot;
  const userMessage = input.userMessage?.trim() ?? '';

  if (userMessage.length === 0) {
    return {
      ...input.preTurn,
      truthSummary: refreshedTruth,
      stageCopy: readStageCopy(input.preTurn.journeySnapshot),
      requestClass,
      responseIntent,
      targetResourceTypes: input.preTurn.targetResourceTypes,
      includeProgressionFollowUp: input.preTurn.includeProgressionFollowUp ?? false,
    };
  }

  const postTurnOrchestration = orchestrator.orchestratePostTurn({
    scopeId: input.foundation.scopeId,
    journeySnapshot: currentJourneySnapshot,
    truth: refreshedTruth,
    assistantNextAction: input.assistantNextAction,
    assistantInternalNextAction: input.assistantInternalNextAction,
  });

  return {
    journeySnapshot: postTurnOrchestration.journeyUpdate ?? currentJourneySnapshot,
    resources: postTurnOrchestration.allowedResources.map((resource) => ChatResourceDescriptorSchema.parse(resource)),
    truthSummary: refreshedTruth,
    stageCopy: readStageCopy(postTurnOrchestration.journeyUpdate ?? currentJourneySnapshot),
    requestClass,
    responseIntent,
    targetResourceTypes: input.preTurn.targetResourceTypes,
    includeProgressionFollowUp: input.preTurn.includeProgressionFollowUp ?? false,
  };
}

function readStageCopy(journeySnapshot: JourneySnapshot) {
  const reference = stageCopyRegistry.resolve(journeySnapshot);
  if (!reference) {
    return null;
  }

  return {
    stage: reference.stage,
    phase: reference.phase,
    referenceText: reference.referenceText,
  };
}

function compareJourneySnapshots(left: JourneySnapshot, right: JourneySnapshot): number {
  const leftScore = scoreJourneySnapshot(left);
  const rightScore = scoreJourneySnapshot(right);
  return leftScore - rightScore;
}

function scoreJourneySnapshot(snapshot: JourneySnapshot): number {
  const stageOrder = [
    'EXPLAIN_PROCESS',
    'COLLECT_MEDICAL_INPUTS',
    'RECOMMENDATION',
    'ONLINE_CONSULT',
    'HUMAN_HANDOFF',
  ] as const;
  const phaseOrder = ['pre', 'active', 'post'] as const;
  const stageIndex = stageOrder.indexOf(snapshot.currentStage);
  const phaseIndex = phaseOrder.indexOf(snapshot.currentPhase);
  return (stageIndex < 0 ? 0 : stageIndex) * 10 + (phaseIndex < 0 ? 0 : phaseIndex);
}

function readFoundationContext(policyContext: unknown, fallbackSessionId: string): ChatbotV2FoundationContext {
  const root = asRecord(policyContext);
  const chatbotV2 = asRecord(root.chatbot_v2 ?? root.chatbotV2);
  let journeySnapshot = JourneySnapshotSchema.parse({
    currentStage: asString(asRecord(chatbotV2.journey_snapshot).current_stage) ?? 'EXPLAIN_PROCESS',
    currentPhase: asString(asRecord(chatbotV2.journey_snapshot).current_phase) ?? 'pre',
  });
  const foundationTruth = deriveJourneyTruth(policyContext);
  let resources = asArray(chatbotV2.allowed_resources).map((resource) => ChatResourceDescriptorSchema.parse({
    resourceType: asString(resource.resource_type) ?? 'PROCESS_GUIDE',
    resourceId: asString(resource.resource_id) ?? 'process-guide:unknown',
    status: asString(resource.status) ?? 'available',
    stageBinding: resource.stage_binding == null
      ? undefined
      : {
          stage: asString(asRecord(resource.stage_binding).stage) ?? 'EXPLAIN_PROCESS',
          phase: asNullableString(asRecord(resource.stage_binding).phase) ?? undefined,
        },
    visibility: normalizeVisibility(resource.visibility),
    payload: asRecord(resource.payload),
    actions: asStringArray(resource.actions),
  }));
  const floor = asRecord(root.chatbot_v2_floor ?? root.chatbotV2Floor);
  const floorSnapshot = readJourneySnapshotFromFloor(floor);
  if (
    floorSnapshot
    && shouldPreferFloorSnapshot(floorSnapshot, journeySnapshot)
  ) {
    journeySnapshot = floorSnapshot;
    resources = dedupeChatResources([
      ...resources,
      ...asArray(floor.allowed_resources).map((resource) => ChatResourceDescriptorSchema.parse({
        resourceType: asString(resource.resource_type) ?? 'PROCESS_GUIDE',
        resourceId: asString(resource.resource_id) ?? 'process-guide:unknown',
        status: asString(resource.status) ?? 'available',
        stageBinding: resource.stage_binding == null
          ? undefined
          : {
              stage: asString(asRecord(resource.stage_binding).stage) ?? 'EXPLAIN_PROCESS',
              phase: asNullableString(asRecord(resource.stage_binding).phase) ?? undefined,
            },
        visibility: normalizeVisibility(resource.visibility),
        payload: asRecord(resource.payload),
        actions: asStringArray(resource.actions),
      })),
    ]);
  }

  return {
    scopeId: readScopeId(policyContext, fallbackSessionId),
    journeySnapshot,
    truth: foundationTruth,
    resources,
    hasCompletedInitialProcessExplanation: hasCompletedInitialProcessExplanation(journeySnapshot, floor, chatbotV2),
    classification: DEFAULT_BOOTSTRAP_CLASSIFICATION,
    requiresFaqGrounding: false,
    activeHospitalContext: readActiveHospitalContext(policyContext),
    requestClass: asString(floor.request_class) ?? asString(chatbotV2.request_class),
    responseIntent: asString(floor.response_intent) ?? asString(chatbotV2.response_intent),
  };
}

function shouldPreferFloorSnapshot(
  floorSnapshot: JourneySnapshot,
  foundationSnapshot: JourneySnapshot,
): boolean {
  if (compareJourneySnapshots(floorSnapshot, foundationSnapshot) > 0) {
    return true;
  }

  return (
    floorSnapshot.currentStage === 'EXPLAIN_PROCESS'
    && floorSnapshot.currentPhase === 'pre'
    && foundationSnapshot.currentStage === 'EXPLAIN_PROCESS'
    && foundationSnapshot.currentPhase === 'active'
  );
}

function hasCompletedInitialProcessExplanation(
  journeySnapshot: JourneySnapshot,
  floor: Record<string, unknown>,
  chatbotV2: Record<string, unknown>,
): boolean {
  if (journeySnapshot.currentStage !== 'EXPLAIN_PROCESS') {
    return true;
  }

  if (journeySnapshot.currentPhase === 'pre') {
    return false;
  }

  const floorRequestClass = asString(floor.request_class) ?? asString(chatbotV2.request_class);
  return floorRequestClass === 'process_explanation';
}

function readScopeId(policyContext: unknown, fallbackSessionId: string): string {
  const root = asRecord(policyContext);
  const chatbotV2 = asRecord(root.chatbot_v2 ?? root.chatbotV2);
  return asString(chatbotV2.scope_id) ?? fallbackSessionId;
}

async function classifyTurn(input: {
  services: Services;
  sessionId: string;
  scopeId: string;
  userMessage: string;
  journeySnapshot: JourneySnapshot;
  resources: ChatResourceDescriptor[];
  conversationSummary: string;
  policyContext: unknown;
}): Promise<ChatbotV2RequestClassificationResult> {
  const classifierClient = input.services.difyClassifierApi;
  if (!classifierClient) {
    throw new Error('DIFY_CLASSIFIER_APP_API_KEY is required for chatbot-v2 classification');
  }

  const classifier = new LlmRequestClassifierService({
    classify: async (classifierInput: ChatbotV2ClassifierInput) => {
      const latestUserMessage = classifierInput.recentMessages[classifierInput.recentMessages.length - 1]?.content ?? '';
      return classifierClient.createChatMessage({
        inputs: {
          recentMessages: JSON.stringify(classifierInput.recentMessages),
          conversationSummary: classifierInput.conversationSummary,
          journeySnapshot: JSON.stringify(classifierInput.journeySnapshot),
          allowedResourceHints: JSON.stringify(classifierInput.allowedResourceHints),
        },
        query: latestUserMessage,
        user: input.scopeId,
      });
    },
  });

  return classifier.classify({
    recentMessages: await buildRecentMessages({
      services: input.services,
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      policyContext: input.policyContext,
    }),
    conversationSummary: input.conversationSummary,
    journeySnapshot: input.journeySnapshot,
    allowedResourceHints: buildAllowedResourceHints(input.resources, input.journeySnapshot),
  });
}

async function buildRecentMessages(input: {
  services: Services;
  sessionId: string;
  userMessage: string;
  policyContext: unknown;
}): Promise<ChatbotV2ClassifierMessage[]> {
  const trimmedUserMessage = input.userMessage.trim();
  const fromPolicyContext = readRecentMessages(input.policyContext);
  if (fromPolicyContext.length > 0) {
    return appendCurrentUserMessage(fromPolicyContext, trimmedUserMessage);
  }

  const session = await input.services.aiChatSessionRepo.findBySessionId(input.sessionId);
  if (!session) {
    return appendCurrentUserMessage([], trimmedUserMessage);
  }

  const recentMessages = await input.services.aiChatMessageRepo.listBySession(session.id, 5);
  const normalizedRecentMessages = recentMessages
    .slice(0, 5)
    .reverse()
    .map((message) => ({
      role: normalizeClassifierRole(message.role),
      content: message.content ?? '',
    }))
    .filter((message) => message.content.trim().length > 0) as ChatbotV2ClassifierMessage[];

  return appendCurrentUserMessage(normalizedRecentMessages, trimmedUserMessage);
}

function buildAllowedResourceHints(
  resources: ChatResourceDescriptor[],
  journeySnapshot: JourneySnapshot,
): ChatbotV2ClassifierResourceHint[] {
  const orderedResourceTypes = new Set<ChatResourceDescriptor['resourceType']>([
    ...resources.map((resource) => resource.resourceType),
    ...getSupplementalHintResourceTypes(journeySnapshot),
  ]);

  return [...orderedResourceTypes].map((resourceType) => ({
    resourceType,
    description: describeResource(resourceType),
  }));
}

function getSupplementalHintResourceTypes(
  _journeySnapshot: JourneySnapshot,
): ChatResourceDescriptor['resourceType'][] {
  const alwaysVisibleQueryResources: ChatResourceDescriptor['resourceType'][] = [
    'MEDICAL_INVITATION_STATUS',
  ];
  const explicitProgressionResources: ChatResourceDescriptor['resourceType'][] = [
    'MEDICAL_DOC_UPLOAD',
    'QUESTIONNAIRE',
    'HOSPITAL_RECOMMENDATION',
    'PACKAGE_RECOMMENDATION',
    'ONLINE_CONSULT_BOOKING',
  ];

  return [
    ...alwaysVisibleQueryResources,
    ...explicitProgressionResources,
  ];
}

function describeResource(resourceType: ChatResourceDescriptor['resourceType']): string {
  switch (resourceType) {
    case 'PROCESS_GUIDE':
      return 'Explains the consultation and treatment process.';
    case 'MEDICAL_DOC_UPLOAD':
      return 'Lets the patient upload medical records and reports.';
    case 'QUESTIONNAIRE':
      return 'Lets the patient fill in a medical intake questionnaire.';
    case 'HOSPITAL_RECOMMENDATION':
      return 'Lets the patient review or confirm recommended hospitals.';
    case 'PACKAGE_RECOMMENDATION':
      return 'Lets the patient review or confirm recommended packages.';
    case 'ONLINE_CONSULT_BOOKING':
      return 'Lets the patient book an online consultation.';
    case 'HUMAN_HANDOFF':
      return 'Lets the patient request a human care advisor.';
    case 'MEDICAL_INVITATION_STATUS':
      return 'Lets the patient check the medical invitation status.';
    default:
      return 'A structured chat resource available for this turn.';
  }
}

function readConversationSummary(policyContext: unknown): string {
  const root = asRecord(policyContext);
  const chatbotState = asRecord(root.chatbot_orchestration_state ?? root.chatbotOrchestrationState);
  const statusSnapshot = asRecord(root.status_snapshot);
  return asString(root.conversation_summary)
    ?? asString(root.conversationSummary)
    ?? asString(chatbotState.conversation_summary)
    ?? asString(chatbotState.conversationSummary)
    ?? asString(statusSnapshot.conversation_summary)
    ?? asString(statusSnapshot.conversationSummary)
    ?? '';
}

function readRecentMessages(policyContext: unknown): ChatbotV2ClassifierMessage[] {
  const root = asRecord(policyContext);
  const recentMessages = asArray(root.recent_messages)
    .slice(0, 5)
    .reverse()
    .map((message) => ({
      role: normalizeClassifierRole(asString(message.role) ?? 'USER'),
      content: asString(message.content) ?? '',
    }))
    .filter((message) => message.content.trim().length > 0) as ChatbotV2ClassifierMessage[];

  return recentMessages;
}

function readActiveHospitalContext(policyContext: unknown): {
  hospitalId: string;
  hospitalName: string | null;
} | null {
  const root = asRecord(policyContext);
  const activeHospitalContext = asRecord(root.active_hospital_context ?? root.activeHospitalContext);
  const hospitalId = asString(activeHospitalContext.hospital_id ?? activeHospitalContext.hospitalId);
  if (!hospitalId) {
    return null;
  }

  return {
    hospitalId,
    hospitalName: asString(activeHospitalContext.hospital_name ?? activeHospitalContext.hospitalName) ?? null,
  };
}

function appendCurrentUserMessage(
  recentMessages: ChatbotV2ClassifierMessage[],
  trimmedUserMessage: string,
): ChatbotV2ClassifierMessage[] {
  if (trimmedUserMessage.length === 0) {
    return recentMessages.slice(-6);
  }

  const currentUserMessage: ChatbotV2ClassifierMessage = {
    role: 'USER',
    content: trimmedUserMessage,
  };
  return [...recentMessages, currentUserMessage].slice(-6);
}

function normalizeClassifierRole(value: unknown): ChatbotV2ClassifierMessage['role'] {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'ASSISTANT' || normalized === 'SYSTEM') {
    return normalized;
  }

  return 'USER';
}

function deriveJourneyTruth(policyContext: unknown) {
  const root = asRecord(policyContext);
  const chatbotV2 = asRecord(root.chatbot_v2 ?? root.chatbotV2);
  const truthSummary = asRecord(chatbotV2.truth_summary ?? chatbotV2.truthSummary);
  if (Object.keys(truthSummary).length > 0) {
    return {
      medicalInputsSubmitted: asBoolean(truthSummary.medical_inputs_submitted ?? truthSummary.medicalInputsSubmitted),
      recommendationConfirmed: asBoolean(truthSummary.recommendation_confirmed ?? truthSummary.recommendationConfirmed),
      onlineConsultSubmitted: asBoolean(truthSummary.online_consult_submitted ?? truthSummary.onlineConsultSubmitted),
    };
  }
  const statusSnapshot = asRecord(root.status_snapshot);
  return deriveJourneyTruthFromStatusSnapshot({
    formStatus: normalizeStatus(statusSnapshot.form_status),
    docUploadStatus: normalizeStatus(statusSnapshot.doc_upload_status),
    recommendationStatus: normalizeStatus(statusSnapshot.recommendation_status),
    consultationStatus: normalizeStatus(statusSnapshot.consultation_status),
    packageStatus: normalizeStatus(statusSnapshot.package_status),
    handoffStatus: normalizeStatus(statusSnapshot.handoff_status),
  });
}

function readJourneySnapshotFromFloor(floor: Record<string, unknown>): JourneySnapshot | null {
  const journey = asRecord(floor.journey_snapshot ?? floor.journeySnapshot);
  const currentStage = asString(journey.current_stage ?? journey.currentStage);
  const currentPhase = asString(journey.current_phase ?? journey.currentPhase);
  if (!currentStage || !currentPhase) {
    return null;
  }

  return JourneySnapshotSchema.parse({
    currentStage,
    currentPhase,
  });
}

function dedupeChatResources(resources: ChatResourceDescriptor[]): ChatResourceDescriptor[] {
  const byId = new Map<string, ChatResourceDescriptor>();
  for (const resource of resources) {
    byId.set(resource.resourceId, resource);
  }
  return [...byId.values()];
}

function normalizeVisibility(value: unknown): ChatResourceDescriptor['visibility'] {
  const record = asRecord(value);
  const mode = asString(record.mode) === 'global' ? 'global' : 'journey';
  const allowedStages = asStringArray(record.allowedStages);
  return mode === 'global' && allowedStages.length > 0
    ? { mode, allowedStages: allowedStages as ChatResourceDescriptor['visibility'] extends { allowedStages?: infer T } ? T : never }
    : { mode };
}

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map((item) => asRecord(item)) : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return asString(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function asBoolean(value: unknown): boolean {
  return value === true;
}
