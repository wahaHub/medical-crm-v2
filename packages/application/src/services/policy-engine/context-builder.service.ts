import type {
  AiChatStatusSnapshot,
  AiChatMessage,
  AiChatTimelineEvent,
  AiFollowupTrigger,
  AiHandoff,
  AiUserProfile,
  IAiChatMessageRepository,
  IAiChatSessionRepository,
  IAiChatTimelineEventRepository,
  IAiFollowupTriggerRepository,
  IAiHandoffRepository,
  IAiUserProfileRepository,
} from '@medical-crm/domain';
import type { AiPolicyEngagementMode } from '../../dtos/ai-policy.dto.js';

export interface BuildPolicyContextInput {
  sessionId: string;
  userMessage: string;
  depth?: 'light' | 'full';
  pageContext?: PolicyPageContext | null;
}

export interface PolicyPendingStateSummary {
  exists: boolean;
  type: string | null;
}

export interface PolicySafetyFlags {
  riskLevel: string;
  hasHighRiskSignal: boolean;
  requiresSafetyHandling: boolean;
}

export interface PolicyPageContext {
  type: 'HOSPITAL_DETAIL';
  hospitalId: string;
  hospitalName?: string;
}

export interface ActiveHospitalContext {
  hospitalId: string;
  hospitalName: string | null;
  source: 'page_context' | 'recent_user_message' | 'recent_shortlist';
}

export interface PolicyConversationContext {
  sessionId: string;
  userMessage: string;
  contextDepth: 'light' | 'full';
  sessionRef: {
    id: string;
    sessionId: string;
    patientId: string | null;
  };
  patientId: string | null;
  currentEngagementMode: AiPolicyEngagementMode | null;
  activeHospitalContext: ActiveHospitalContext | null;
  pendingOffer: PolicyPendingStateSummary;
  pendingQuestion: PolicyPendingStateSummary;
  lastAssistantAction: string | null;
  safetyFlags: PolicySafetyFlags;
}

export interface LightPolicyConversationContext extends PolicyConversationContext {
  contextDepth: 'light';
}

export interface FullPolicyConversationContext extends PolicyConversationContext {
  contextDepth: 'full';
  statusSnapshot: AiChatStatusSnapshot;
  profile: AiUserProfile | null;
  recentMessages: AiChatMessage[];
  recentTimeline: AiChatTimelineEvent[];
  activeFollowups: AiFollowupTrigger[];
  recentHandoffs: AiHandoff[];
}

export class ContextBuilderService {
  constructor(
    private readonly sessionRepo: IAiChatSessionRepository,
    private readonly messageRepo: IAiChatMessageRepository,
    private readonly profileRepo: IAiUserProfileRepository,
    private readonly timelineRepo: IAiChatTimelineEventRepository,
    private readonly followupRepo: IAiFollowupTriggerRepository,
    private readonly handoffRepo: IAiHandoffRepository,
  ) {}

  async build(input: BuildPolicyContextInput & { depth: 'light' }): Promise<LightPolicyConversationContext>;
  async build(input: BuildPolicyContextInput & { depth?: 'full' }): Promise<FullPolicyConversationContext>;
  async build(input: BuildPolicyContextInput): Promise<LightPolicyConversationContext | FullPolicyConversationContext> {
    const depth = input.depth ?? 'full';
    const session = await this.sessionRepo.findBySessionId(input.sessionId);
    if (!session) {
      throw new Error(`AI chat session not found: ${input.sessionId}`);
    }

    const baseContext = {
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      contextDepth: depth,
      sessionRef: {
        id: session.id,
        sessionId: session.sessionId,
        patientId: session.patientId,
      },
      patientId: session.patientId,
      currentEngagementMode: inferCurrentEngagementMode(session.statusSnapshot),
      activeHospitalContext: null,
      pendingOffer: summarizePendingState(session.statusSnapshot.pendingOffer),
      pendingQuestion: summarizePendingState(session.statusSnapshot.pendingQuestion),
      lastAssistantAction: session.statusSnapshot.lastNextAction,
      safetyFlags: buildSafetyFlags(session.statusSnapshot),
    } satisfies PolicyConversationContext;

    if (depth === 'light') {
      const recentMessages = (await this.messageRepo.listRecentBySession(session.id, 4))
        .filter((message) => !isProviderFailedDraft(message));
      const lastAssistantMessage = [...recentMessages]
        .reverse()
        .find((message) => message.role.toUpperCase() === 'ASSISTANT');

      return {
        ...baseContext,
        contextDepth: 'light',
        activeHospitalContext: deriveActiveHospitalContext({
          pageContext: input.pageContext,
          recentMessages,
        }),
        lastAssistantAction: lastAssistantMessage?.nextAction ?? baseContext.lastAssistantAction,
      };
    }

    const [rawRecentMessages, profile, recentTimeline, activeFollowups, recentHandoffs] = await Promise.all([
      this.messageRepo.listRecentBySession(session.id, 12),
      this.profileRepo.findByAnonymousKeyOrPatient({
        anonymousKey: session.sessionId,
        patientId: session.patientId,
      }),
      this.timelineRepo.listRecentBySession(session.id, 12),
      this.followupRepo.listPendingBySession(session.id),
      this.handoffRepo.listRecentBySession(session.id, 5),
    ]);
    const recentMessages = rawRecentMessages.filter((message) => !isProviderFailedDraft(message));

    const lastAssistantMessage = [...recentMessages]
      .reverse()
      .find((message) => message.role.toUpperCase() === 'ASSISTANT');

    return {
      ...baseContext,
      contextDepth: 'full',
      activeHospitalContext: deriveActiveHospitalContext({
        pageContext: input.pageContext,
        recentMessages,
      }),
      lastAssistantAction: lastAssistantMessage?.nextAction ?? baseContext.lastAssistantAction,
      statusSnapshot: session.statusSnapshot,
      profile,
      recentMessages,
      recentTimeline,
      activeFollowups,
      recentHandoffs,
    };
  }
}

function deriveActiveHospitalContext(input: {
  pageContext?: PolicyPageContext | null;
  recentMessages: AiChatMessage[];
}): ActiveHospitalContext | null {
  if (input.pageContext?.type === 'HOSPITAL_DETAIL' && input.pageContext.hospitalId) {
    return {
      hospitalId: input.pageContext.hospitalId,
      hospitalName: input.pageContext.hospitalName ?? null,
      source: 'page_context',
    };
  }

  for (const message of [...input.recentMessages].reverse()) {
    if (message.role.toUpperCase() !== 'USER') {
      continue;
    }
    const pageContext = readPageContextFromMetadata(message.metadata);
    if (pageContext) {
      return {
        hospitalId: pageContext.hospitalId,
        hospitalName: pageContext.hospitalName ?? null,
        source: 'recent_user_message',
      };
    }
  }

  for (const message of [...input.recentMessages].reverse()) {
    const shortlistHospitalId = readShortlistHospitalId(message.shortlist);
    if (shortlistHospitalId) {
      return {
        hospitalId: shortlistHospitalId,
        hospitalName: null,
        source: 'recent_shortlist',
      };
    }
  }

  return null;
}

function summarizePendingState(
  pendingState: AiChatStatusSnapshot['pendingOffer'] | AiChatStatusSnapshot['pendingQuestion'],
): PolicyPendingStateSummary {
  return {
    exists: Boolean(pendingState),
    type: pendingState?.type ?? null,
  };
}

function buildSafetyFlags(statusSnapshot: AiChatStatusSnapshot): PolicySafetyFlags {
  const riskLevel = normalize(statusSnapshot.riskLevel);
  return {
    riskLevel,
    hasHighRiskSignal: riskLevel === 'HIGH_RISK' || riskLevel === 'HIGH' || riskLevel === 'CRISIS',
    requiresSafetyHandling: riskLevel === 'HIGH_RISK' || riskLevel === 'HIGH' || riskLevel === 'CRISIS',
  };
}

function inferCurrentEngagementMode(statusSnapshot: AiChatStatusSnapshot): AiPolicyEngagementMode {
  if (statusSnapshot.enteredDeepWorkflowAt) {
    return 'DEEP_WORKFLOW';
  }

  const persistedMode = normalizePersistedEngagementMode(statusSnapshot.engagementMode);
  if (persistedMode) {
    return persistedMode;
  }

  if (
    isStarted(statusSnapshot.formStatus, ['COMPLETED', 'SUBMITTED', 'IN_PROGRESS', 'STARTED'])
    || isStarted(statusSnapshot.docUploadStatus, ['UPLOADED', 'UPLOADING', 'IN_PROGRESS', 'SUBMITTED', 'STARTED'])
    || isStarted(statusSnapshot.consultationStatus, ['SCHEDULED', 'INTRODUCED', 'READY', 'BOOKED'])
    || isStarted(statusSnapshot.handoffStatus, ['REQUESTED', 'OPEN', 'IN_PROGRESS'])
  ) {
    return 'DEEP_WORKFLOW';
  }

  if (
    statusSnapshot.pendingOffer
    || statusSnapshot.pendingQuestion
    || isStarted(statusSnapshot.recommendationStatus, ['NOT_SHOWN', 'PRELIMINARY_SHOWN', 'SHORTLIST_SHOWN', 'EXPLORED'])
    || isStarted(statusSnapshot.packageStatus, ['NOT_SHOWN', 'SHOWN', 'INTERESTED', 'EXPLORED'])
    || [
      'CONSULT_CONVERSION',
      'CREATE_CASE',
      'REQUEST_DOCS',
      'SHOW_PACKAGE',
      'EXPLORE_HOSPITAL_RECOMMENDATIONS',
      'EXPLAIN_DOC_UPLOAD',
      'EXPLAIN_CONSULT_PROCESS',
    ].includes(statusSnapshot.lastNextAction ?? '')
  ) {
    return 'QUALIFIED_EXPLORATION';
  }

  return 'LIGHT_DISCOVERY';
}

function normalizePersistedEngagementMode(
  value: AiChatStatusSnapshot['engagementMode'],
): AiPolicyEngagementMode | null {
  const normalized = normalize(value);
  switch (normalized) {
    case 'LIGHT_DISCOVERY':
    case 'QUALIFIED_EXPLORATION':
    case 'DEEP_WORKFLOW':
      return normalized;
    default:
      return null;
  }
}

function isStarted(value: string | null | undefined, activeStates: string[]): boolean {
  const normalized = normalize(value);
  return normalized.length > 0 && activeStates.includes(normalized);
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function isProviderFailedDraft(message: AiChatMessage): boolean {
  return message.role.toUpperCase() === 'ASSISTANT'
    && message.content === ''
    && normalizeRecordString(message.metadata, 'draftState') === 'provider_error';
}

function normalizeRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPageContextFromMetadata(metadata: Record<string, unknown>): PolicyPageContext | null {
  const raw = metadata['pageContext'];
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (record['type'] !== 'HOSPITAL_DETAIL' || typeof record['hospitalId'] !== 'string' || record['hospitalId'].length === 0) {
    return null;
  }

  return {
    type: 'HOSPITAL_DETAIL',
    hospitalId: record['hospitalId'],
    hospitalName: typeof record['hospitalName'] === 'string' && record['hospitalName'].length > 0
      ? record['hospitalName']
      : undefined,
  };
}

function readShortlistHospitalId(shortlist: Array<Record<string, unknown>>): string | null {
  for (const item of shortlist) {
    const hospitalId = item['hospitalId'];
    if (typeof hospitalId === 'string' && hospitalId.length > 0) {
      return hospitalId;
    }
  }

  return null;
}
