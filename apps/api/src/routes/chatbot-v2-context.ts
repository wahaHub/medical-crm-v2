import { ConversationOrchestratorService, ResourceRegistryService } from '@medical-crm/application';
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
};

type JourneyTruth = ReturnType<typeof deriveJourneyTruth>;

type ChatbotV2FoundationContext = {
  scopeId: string;
  journeySnapshot: JourneySnapshot;
  truth: JourneyTruth;
  resources: ChatResourceDescriptor[];
};

export type ChatbotV2TurnContext = {
  preTurn: ChatbotV2Envelope;
  foundation: ChatbotV2FoundationContext;
};

const orchestrator = new ConversationOrchestratorService();
const resourceRegistry = new ResourceRegistryService();

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
      },
      foundation,
    };
  }

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
    },
    foundation,
  };
}

export function buildChatbotV2PostTurnContext(input: {
  foundation: ChatbotV2FoundationContext;
  preTurn: ChatbotV2Envelope;
  assistantNextAction?: string | null;
  assistantInternalNextAction?: string | null;
}): ChatbotV2Envelope {
  const journeySnapshot = derivePostTurnJourneySnapshot(
    input.preTurn.journeySnapshot,
    input.assistantInternalNextAction ?? input.assistantNextAction,
  );
  if (
    journeySnapshot.currentStage === input.preTurn.journeySnapshot.currentStage
    && journeySnapshot.currentPhase === input.preTurn.journeySnapshot.currentPhase
  ) {
    return {
      journeySnapshot,
      resources: input.preTurn.resources,
    };
  }

  return {
    journeySnapshot,
    resources: resourceRegistry.listResources({
      scopeId: input.foundation.scopeId,
      journeySnapshot,
      truth: {
        medicalInputsSubmitted: input.foundation.truth.medicalInputsSubmitted,
        recommendationConfirmed: input.foundation.truth.recommendationConfirmed,
        onlineConsultSubmitted: input.foundation.truth.onlineConsultSubmitted,
        humanHandoffSubmitted: input.foundation.truth.humanHandoffSubmitted,
      },
    }).map((resource) => ChatResourceDescriptorSchema.parse(resource)),
  };
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

  const medicalInputsSubmitted = hasStatus(statusSnapshot.form_status, ['COMPLETED', 'SUBMITTED']);
  const recommendationAvailable = hasStatus(statusSnapshot.recommendation_status, ['PRELIMINARY_SHOWN', 'SHORTLIST_SHOWN', 'EXPLORED'])
    || hasStatus(statusSnapshot.package_status, ['SHOWN', 'INTERESTED', 'EXPLORED']);
  const medicalInputsStarted = medicalInputsSubmitted
    || hasStatus(statusSnapshot.form_status, ['IN_PROGRESS', 'STARTED'])
    || hasStatus(statusSnapshot.doc_upload_status, ['REQUESTED', 'UPLOADING', 'UPLOADED', 'IN_PROGRESS', 'SUBMITTED', 'STARTED']);
  const onlineConsultSubmitted = hasStatus(statusSnapshot.consultation_status, ['SCHEDULED', 'BOOKED', 'COMPLETED']);
  const onlineConsultStarted = onlineConsultSubmitted
    || hasStatus(statusSnapshot.consultation_status, ['INTRODUCED', 'READY']);
  const humanHandoffActive = hasStatus(statusSnapshot.handoff_status, ['REQUESTED', 'OPEN', 'IN_PROGRESS']);
  const humanHandoffSubmitted = humanHandoffActive
    || hasStatus(statusSnapshot.handoff_status, ['COMPLETED']);

  return {
    medicalInputsStarted,
    medicalInputsSubmitted,
    recommendationAvailable,
    recommendationConfirmed: false,
    onlineConsultRequired: onlineConsultStarted || onlineConsultSubmitted,
    onlineConsultStarted,
    onlineConsultSubmitted,
    humanHandoffActive,
    humanHandoffSubmitted,
  };
}

function derivePostTurnJourneySnapshot(current: JourneySnapshot, assistantAction: string | null | undefined): JourneySnapshot {
  const actionSnapshot = mapAssistantActionToJourneySnapshot(assistantAction);
  if (!actionSnapshot) {
    return current;
  }

  return stageRank(actionSnapshot.currentStage) >= stageRank(current.currentStage)
    ? actionSnapshot
    : current;
}

function mapAssistantActionToJourneySnapshot(action: string | null | undefined): JourneySnapshot | null {
  switch (action) {
    case 'REQUEST_DOC_UPLOAD':
      return {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      };
    case 'SHOW_HOSPITAL_RECOMMENDATIONS':
    case 'SHOW_PACKAGE':
      return {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      };
    case 'INVITE_ONLINE_CONSULT':
      return {
        currentStage: 'ONLINE_CONSULT',
        currentPhase: 'active',
      };
    case 'HUMAN_HANDOFF':
    case 'SAFETY_HANDOFF':
      return {
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'active',
      };
    default:
      return null;
  }
}

function stageRank(stage: JourneySnapshot['currentStage']): number {
  switch (stage) {
    case 'EXPLAIN_PROCESS':
      return 0;
    case 'COLLECT_MEDICAL_INPUTS':
      return 1;
    case 'RECOMMENDATION':
      return 2;
    case 'ONLINE_CONSULT':
      return 3;
    case 'HUMAN_HANDOFF':
      return 4;
    default:
      return 0;
  }
}

function normalizeVisibility(value: unknown): ChatResourceDescriptor['visibility'] {
  const record = asRecord(value);
  const mode = asString(record.mode) === 'global' ? 'global' : 'journey';
  const allowedStages = asStringArray(record.allowedStages);
  return mode === 'global' && allowedStages.length > 0
    ? { mode, allowedStages: allowedStages as ChatResourceDescriptor['visibility'] extends { allowedStages?: infer T } ? T : never }
    : { mode };
}

function hasStatus(value: unknown, allowed: string[]): boolean {
  const normalized = normalizeStatus(value);
  return normalized.length > 0 && allowed.includes(normalized);
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
