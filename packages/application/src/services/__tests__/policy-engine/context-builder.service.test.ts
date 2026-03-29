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
      updateWritebackMetadata: vi.fn(async () => null),
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

  it('builds light context without loading profile, timeline, followups, or handoffs', async () => {
    const sessionRepo: IAiChatSessionRepository = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'session-2',
        sessionId: 'policy-session-2',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: 'patient-2',
        hospitalType: 'COSMETIC',
        status: 'ACTIVE',
        statusSnapshot: {
          formStatus: 'not_started',
          docUploadStatus: 'none',
          recommendationStatus: 'not_started',
          packageStatus: 'not_introduced',
          consultationStatus: 'not_introduced',
          handoffStatus: 'not_needed',
          riskLevel: 'low',
          pendingOffer: {
            type: 'HOSPITAL_RECOMMENDATION',
            payload: {},
          },
          lastNextAction: 'CONSULT_CONVERSION',
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
      listBySession: vi.fn(async () => []),
      listRecentBySession: vi.fn(async () => [
        new AiChatMessage({
          id: 'msg-2',
          sessionId: 'session-2',
          role: 'ASSISTANT',
          content: 'If you want, I can explain how recommendations work.',
          intent: 'CONSULT',
          resolvedIntent: 'GENERAL_CONSULT',
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'CONSULT_CONVERSION',
          secondaryAction: null,
          responseMode: 'grounded_answer',
          citations: [],
          reasonCodes: [],
          shortlist: [],
          writebackStatus: 'pending',
          toolTrace: [],
          metadata: {},
          createdAt: new Date(),
        }),
      ]),
      updateWritebackMetadata: vi.fn(async () => null),
    };

    const profileRepo: IAiUserProfileRepository = {
      findByAnonymousKeyOrPatient: vi.fn(async () => null),
      save: vi.fn(),
      patch: vi.fn(),
    };

    const timelineRepo: IAiChatTimelineEventRepository = {
      listRecentBySession: vi.fn(async () => []),
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
      sessionId: 'policy-session-2',
      userMessage: 'hello',
      depth: 'light',
    });

    expect(context.contextDepth).toBe('light');
    expect(context.patientId).toBe('patient-2');
    expect(context.currentEngagementMode).toBe('QUALIFIED_EXPLORATION');
    expect(context.pendingOffer.type).toBe('HOSPITAL_RECOMMENDATION');
    expect(context.lastAssistantAction).toBe('CONSULT_CONVERSION');
    expect(context.sessionRef).toEqual({
      id: 'session-2',
      sessionId: 'policy-session-2',
      patientId: 'patient-2',
    });
    expect('session' in context).toBe(false);
    expect('statusSnapshot' in context).toBe(false);
    expect('profile' in context).toBe(false);
    expect('recentTimeline' in context).toBe(false);
    expect('activeFollowups' in context).toBe(false);
    expect('recentHandoffs' in context).toBe(false);
    expect(profileRepo.findByAnonymousKeyOrPatient).not.toHaveBeenCalled();
    expect(timelineRepo.listRecentBySession).not.toHaveBeenCalled();
    expect(followupRepo.listPendingBySession).not.toHaveBeenCalled();
    expect(handoffRepo.listRecentBySession).not.toHaveBeenCalled();
  });
});
