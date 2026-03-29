import { describe, expect, it, vi } from 'vitest';
import {
  AiChatMessage,
  AiChatSession,
  AiChatTimelineEvent,
  AiFollowupTrigger,
  AiHandoff,
  AiUserProfile,
} from '@medical-crm/domain';
import type {
  IAiChatMessageRepository,
  IAiChatSessionRepository,
  IAiChatTimelineEventRepository,
  IAiFollowupTriggerRepository,
  IAiHandoffRepository,
  IAiUserProfileRepository,
} from '@medical-crm/domain';
import { ContextBuilderService } from '../../policy-engine/context-builder.service.js';

describe('ContextBuilderService', () => {
  it('assembles context from session, profile, timeline, and pending state', async () => {
    const sessionRepo: IAiChatSessionRepository = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'session-1',
        sessionId: 'policy-session-1',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: null,
        hospitalType: 'COSMETIC',
        status: 'ACTIVE',
        statusSnapshot: {
          conditionStatus: 'unknown',
          formStatus: 'not_started',
          docUploadStatus: 'none',
          recommendationStatus: 'not_started',
          consultationStatus: 'not_introduced',
          packageStatus: 'not_introduced',
          handoffStatus: 'not_needed',
          leadMaturity: 'browsing',
          riskLevel: 'low',
          trustOrObjection: 'none',
          pendingOffer: {
            type: 'HOSPITAL_RECOMMENDATION',
            payload: { shortlistId: 'rec-1' },
          },
          pendingQuestion: null,
          lastNextAction: null,
          lastResolvedIntent: null,
          conversationSummary: '',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findByDifyConversationId: vi.fn(async () => null),
      save: vi.fn(),
      attachPatient: vi.fn(),
      updateStatus: vi.fn(),
      patchStatus: vi.fn(),
    };

    const messageRepo: IAiChatMessageRepository = {
      create: vi.fn(),
      listBySession: vi.fn(async () => [
        new AiChatMessage({
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'ASSISTANT',
          content: 'Here are the Korea recommendations we discussed earlier.',
          intent: 'CONSULT',
          resolvedIntent: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'CONSULT_CONVERSION',
          secondaryAction: null,
          responseMode: 'grounded_plus_guidance',
          citations: [],
          reasonCodes: [],
          shortlist: [],
          writebackStatus: 'applied',
          toolTrace: [],
          metadata: {},
          createdAt: new Date(),
        }),
      ]),
      listRecentBySession: vi.fn(async () => [
        new AiChatMessage({
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'ASSISTANT',
          content: 'Here are the Korea recommendations we discussed earlier.',
          intent: 'CONSULT',
          resolvedIntent: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'CONSULT_CONVERSION',
          secondaryAction: null,
          responseMode: 'grounded_plus_guidance',
          citations: [],
          reasonCodes: [],
          shortlist: [],
          writebackStatus: 'applied',
          toolTrace: [],
          metadata: {},
          createdAt: new Date(),
        }),
      ]),
    };

    const profileRepo: IAiUserProfileRepository = {
      findByAnonymousKeyOrPatient: vi.fn(async () => new AiUserProfile({
        id: 'profile-1',
        patientId: null,
        anonymousKey: 'policy-session-1',
        conditionOrGoal: null,
        conditionCategory: null,
        preferredDestination: [],
        preferredLanguage: null,
        budgetBand: null,
        urgencyLevel: null,
        existingReportsStatus: 'none',
        objectionTags: [],
        leadStage: 'browsing',
        nextBestAction: null,
        memorySummary: 'Interested in Korea and rhinoplasty.',
        sourceConfidenceMap: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      save: vi.fn(),
      patch: vi.fn(),
    };

    const timelineRepo: IAiChatTimelineEventRepository = {
      listRecentBySession: vi.fn(async () => [
        new AiChatTimelineEvent({
          id: 'timeline-1',
          sessionId: 'session-1',
          patientId: null,
          eventType: 'HOSPITALS_RECOMMENDED',
          summary: 'Shared a Korea shortlist.',
          payload: {},
          actor: 'ai',
          confidence: '0.95',
          createdAt: new Date(),
        }),
      ]),
      append: vi.fn(),
    };

    const followupRepo: IAiFollowupTriggerRepository = {
      listPendingBySession: vi.fn(async () => [] as AiFollowupTrigger[]),
      createPendingTrigger: vi.fn(),
      resolvePendingTrigger: vi.fn(),
    };

    const handoffRepo: IAiHandoffRepository = {
      listRecentBySession: vi.fn(async () => [] as AiHandoff[]),
      save: vi.fn(),
      complete: vi.fn(),
    };

    const builder = new ContextBuilderService(
      sessionRepo,
      messageRepo,
      profileRepo,
      timelineRepo,
      followupRepo,
      handoffRepo,
    );

    const context = await builder.build({
      sessionId: 'policy-session-1',
      userMessage: 'Can we continue with the recommendation you mentioned earlier?',
    });

    expect(context.statusSnapshot.pendingOffer?.type).toBe('HOSPITAL_RECOMMENDATION');
    expect(context.profile?.memorySummary).toContain('Korea');
    expect(context.recentTimeline[0]?.eventType).toBeDefined();
  });
});
