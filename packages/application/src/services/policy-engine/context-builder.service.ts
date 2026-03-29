import type {
  AiChatSession,
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

export interface BuildPolicyContextInput {
  sessionId: string;
  userMessage: string;
}

export interface PolicyConversationContext {
  sessionId: string;
  userMessage: string;
  session: AiChatSession;
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

  async build(input: BuildPolicyContextInput): Promise<PolicyConversationContext> {
    const session = await this.sessionRepo.findBySessionId(input.sessionId);
    if (!session) {
      throw new Error(`AI chat session not found: ${input.sessionId}`);
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

    return {
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      session,
      statusSnapshot: session.statusSnapshot,
      profile,
      recentMessages,
      recentTimeline,
      activeFollowups,
      recentHandoffs,
    };
  }
}
