import {
  ConversationOrchestratorService,
  JourneyEngineService,
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
  requestClass: string;
  responseIntent: string;
};

type JourneyTruth = ReturnType<typeof deriveJourneyTruth>;

type ChatbotV2FoundationContext = {
  scopeId: string;
  journeySnapshot: JourneySnapshot;
  truth: JourneyTruth;
  resources: ChatResourceDescriptor[];
  requestClass?: string;
  responseIntent?: string;
};

export type ChatbotV2TurnContext = {
  preTurn: ChatbotV2Envelope;
  foundation: ChatbotV2FoundationContext;
};

const orchestrator = new ConversationOrchestratorService();
const journeyEngine = new JourneyEngineService();

export async function buildChatbotV2TurnContext(input: {
  services: Services;
  sessionId: string;
  userMessage: string;
  pageContext?: PageContext;
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
        requestClass: 'process_explanation',
        responseIntent: 'process_explanation',
      },
      foundation,
    };
  }

  if (!foundation.requestClass || !foundation.responseIntent) {
    const orchestration = orchestrator.orchestrate({
      scopeId: foundation.scopeId,
      userMessage: input.userMessage,
      journeySnapshot: foundation.journeySnapshot,
      truth: foundation.truth,
    });

    return {
      preTurn: {
        journeySnapshot: orchestration.journeyUpdate ?? foundation.journeySnapshot,
        resources: orchestration.allowedResources.map((resource) => ChatResourceDescriptorSchema.parse(resource)),
        requestClass: orchestration.requestClass,
        responseIntent: orchestration.responseIntent,
      },
      foundation,
    };
  }

  return {
    preTurn: {
      journeySnapshot: foundation.journeySnapshot,
      resources: foundation.resources,
      requestClass: foundation.requestClass ?? 'faq',
      responseIntent: foundation.responseIntent ?? foundation.requestClass ?? 'faq',
    },
    foundation,
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
  const refreshedJourneySnapshot = journeyEngine.deriveSnapshot(refreshedTruth);
  const userMessage = input.userMessage?.trim() ?? '';

  if (compareJourneySnapshots(refreshedJourneySnapshot, input.preTurn.journeySnapshot) < 0) {
    return {
      ...input.preTurn,
      requestClass,
      responseIntent,
    };
  }

  if (userMessage.length === 0) {
    return {
      journeySnapshot: refreshedJourneySnapshot,
      resources: input.preTurn.resources,
      requestClass,
      responseIntent,
    };
  }

  const orchestration = orchestrator.orchestrate({
    scopeId: input.foundation.scopeId,
    userMessage,
    journeySnapshot: refreshedJourneySnapshot,
    truth: refreshedTruth,
  });

  return {
    journeySnapshot: orchestration.journeyUpdate ?? refreshedJourneySnapshot,
    resources: orchestration.allowedResources.map((resource) => ChatResourceDescriptorSchema.parse(resource)),
    requestClass,
    responseIntent,
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
  const journeySnapshot = JourneySnapshotSchema.parse({
    currentStage: asString(asRecord(chatbotV2.journey_snapshot).current_stage) ?? 'EXPLAIN_PROCESS',
    currentPhase: asString(asRecord(chatbotV2.journey_snapshot).current_phase) ?? 'active',
  });
  const resources = asArray(chatbotV2.allowed_resources).map((resource) => ChatResourceDescriptorSchema.parse({
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

  return {
    scopeId: readScopeId(policyContext, fallbackSessionId),
    journeySnapshot,
    truth: deriveJourneyTruth(policyContext),
    resources,
    requestClass: asString(chatbotV2.request_class),
    responseIntent: asString(chatbotV2.response_intent),
  };
}

function readScopeId(policyContext: unknown, fallbackSessionId: string): string {
  const root = asRecord(policyContext);
  const chatbotV2 = asRecord(root.chatbot_v2 ?? root.chatbotV2);
  return asString(chatbotV2.scope_id) ?? fallbackSessionId;
}

function deriveJourneyTruth(policyContext: unknown) {
  const root = asRecord(policyContext);
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
