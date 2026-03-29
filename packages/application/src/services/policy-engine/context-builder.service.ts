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
      pendingOffer: summarizePendingState(session.statusSnapshot.pendingOffer),
      pendingQuestion: summarizePendingState(session.statusSnapshot.pendingQuestion),
      lastAssistantAction: session.statusSnapshot.lastNextAction,
      safetyFlags: buildSafetyFlags(session.statusSnapshot),
    } satisfies PolicyConversationContext;

    if (depth === 'light') {
      const recentMessages = await this.messageRepo.listRecentBySession(session.id, 4);
      const lastAssistantMessage = [...recentMessages]
        .reverse()
        .find((message) => message.role.toUpperCase() === 'ASSISTANT');

      return {
        ...baseContext,
        contextDepth: 'light',
        lastAssistantAction: lastAssistantMessage?.nextAction ?? baseContext.lastAssistantAction,
      };
    }

    const [recentMessages, profile, recentTimeline, activeFollowups, recentHandoffs] = await Promise.all([
      this.messageRepo.listRecentBySession(session.id, 12),
      this.profileRepo.findByAnonymousKeyOrPatient({
        anonymousKey: session.sessionId,
        patientId: session.patientId,
      }),
      this.timelineRepo.listRecentBySession(session.id, 12),
      this.followupRepo.listPendingBySession(session.id),
      this.handoffRepo.listRecentBySession(session.id, 5),
    ]);

    const lastAssistantMessage = [...recentMessages]
      .reverse()
      .find((message) => message.role.toUpperCase() === 'ASSISTANT');

    return {
      ...baseContext,
      contextDepth: 'full',
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
    || ['CONSULT_CONVERSION', 'CREATE_CASE', 'REQUEST_DOCS', 'SHOW_PACKAGE'].includes(statusSnapshot.lastNextAction ?? '')
  ) {
    return 'QUALIFIED_EXPLORATION';
  }

  return 'LIGHT_DISCOVERY';
}

function isStarted(value: string | null | undefined, activeStates: string[]): boolean {
  const normalized = normalize(value);
  return normalized.length > 0 && activeStates.includes(normalized);
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}
