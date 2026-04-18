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
  it('assembles context from session, profile, timeline, and summary state', async () => {
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
          riskLevel: 'low',
          trustOrObjection: 'none',
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
      updateMessage: vi.fn(async () => null),
      deleteById: vi.fn(async () => false),
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
      site: 'china',
      userMessage: 'Can we continue with the recommendation you mentioned earlier?',
    });

    expect(context.statusSnapshot.conversationSummary).toBe('');
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
          engagementMode: 'QUALIFIED_EXPLORATION',
          formStatus: 'not_started',
          docUploadStatus: 'none',
          recommendationStatus: 'not_started',
          packageStatus: 'not_introduced',
          consultationStatus: 'not_introduced',
          handoffStatus: 'not_needed',
          riskLevel: 'low',
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
      updateMessage: vi.fn(async () => null),
      deleteById: vi.fn(async () => false),
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
      site: 'china',
      userMessage: 'hello',
      depth: 'light',
    });

    expect(context.contextDepth).toBe('light');
    expect(context.patientId).toBe('patient-2');
    expect(context.currentEngagementMode).toBe('QUALIFIED_EXPLORATION');
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

  it('does not infer qualified exploration from legacy CONSULT_CONVERSION alone when canonical signals are absent', async () => {
    const sessionRepo: IAiChatSessionRepository = {
      findBySessionId: vi.fn(async () => ({
        id: 'session-legacy-1',
        sessionId: 'policy-session-legacy-1',
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
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: '',
          enteredDeepWorkflowAt: null,
          conversationSummary: '',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as AiChatSession),
      findByDifyConversationId: vi.fn(async () => null),
      save: vi.fn(),
      attachPatient: vi.fn(),
      updateStatus: vi.fn(),
      patchStatus: vi.fn(),
    };

    const messageRepo: IAiChatMessageRepository = {
      create: vi.fn(),
      listBySession: vi.fn(async () => []),
      listRecentBySession: vi.fn(async () => []),
      updateWritebackMetadata: vi.fn(async () => null),
      updateMessage: vi.fn(async () => null),
      deleteById: vi.fn(async () => false),
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
      sessionId: 'policy-session-legacy-1',
      site: 'china',
      userMessage: 'hello',
      depth: 'light',
    });

    expect(context.currentEngagementMode).toBe('LIGHT_DISCOVERY');
  });

  it('ignores provider-failed assistant drafts when deriving light-context hospital focus', async () => {
    const sessionRepo: IAiChatSessionRepository = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'session-3',
        sessionId: 'policy-session-3',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: null,
        hospitalType: 'COSMETIC',
        status: 'ACTIVE',
        statusSnapshot: {
          engagementMode: 'QUALIFIED_EXPLORATION',
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
          id: 'msg-failed',
          sessionId: 'session-3',
          role: 'ASSISTANT',
          content: '',
          intent: 'FAQ',
          resolvedIntent: 'GENERAL_CONSULT',
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'REQUEST_DOCS',
          secondaryAction: null,
          responseMode: 'grounded_answer',
          citations: [],
          reasonCodes: [],
          shortlist: [],
          writebackStatus: 'pending',
          toolTrace: [],
          metadata: {
            draftState: 'provider_error',
            failureStage: 'provider_request',
          },
          createdAt: new Date(),
        }),
      ]),
      updateWritebackMetadata: vi.fn(async () => null),
      updateMessage: vi.fn(async () => null),
      deleteById: vi.fn(async () => false),
    };

    const builder = new ContextBuilderService(
      sessionRepo,
      messageRepo,
      { findByAnonymousKeyOrPatient: vi.fn(), save: vi.fn(), patch: vi.fn() } as unknown as IAiUserProfileRepository,
      { listRecentBySession: vi.fn(), append: vi.fn() } as unknown as IAiChatTimelineEventRepository,
      { listPendingBySession: vi.fn(), createPendingTrigger: vi.fn(), resolvePendingTrigger: vi.fn() } as unknown as IAiFollowupTriggerRepository,
      { listRecentBySession: vi.fn(), save: vi.fn(), complete: vi.fn() } as unknown as IAiHandoffRepository,
    );

    const context = await builder.build({
      sessionId: 'policy-session-3',
      site: 'china',
      userMessage: 'hello',
      depth: 'light',
    });

    expect(context.activeHospitalContext).toBeNull();
  });

  it('excludes provider-failed assistant drafts from full-context recentMessages', async () => {
    const sessionRepo: IAiChatSessionRepository = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'session-4',
        sessionId: 'policy-session-4',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: null,
        hospitalType: 'COSMETIC',
        status: 'ACTIVE',
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
          id: 'msg-failed',
          sessionId: 'session-4',
          role: 'ASSISTANT',
          content: '',
          intent: 'FAQ',
          resolvedIntent: 'GENERAL_CONSULT',
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'ANSWER',
          secondaryAction: null,
          responseMode: 'grounded_answer',
          citations: [],
          reasonCodes: [],
          shortlist: [],
          writebackStatus: 'pending',
          toolTrace: [],
          metadata: {
            draftState: 'provider_error',
          },
          createdAt: new Date(),
        }),
        new AiChatMessage({
          id: 'msg-good',
          sessionId: 'session-4',
          role: 'ASSISTANT',
          content: 'We can continue.',
          intent: 'FAQ',
          resolvedIntent: 'GENERAL_CONSULT',
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'ANSWER',
          secondaryAction: null,
          responseMode: 'grounded_answer',
          citations: [],
          reasonCodes: [],
          shortlist: [],
          writebackStatus: 'completed',
          toolTrace: [],
          metadata: {},
          createdAt: new Date(),
        }),
      ]),
      updateWritebackMetadata: vi.fn(async () => null),
      updateMessage: vi.fn(async () => null),
      deleteById: vi.fn(async () => false),
    };

    const builder = new ContextBuilderService(
      sessionRepo,
      messageRepo,
      { findByAnonymousKeyOrPatient: vi.fn(async () => null), save: vi.fn(), patch: vi.fn() } as unknown as IAiUserProfileRepository,
      { listRecentBySession: vi.fn(async () => []), append: vi.fn() } as unknown as IAiChatTimelineEventRepository,
      { listPendingBySession: vi.fn(async () => []), createPendingTrigger: vi.fn(), resolvePendingTrigger: vi.fn() } as unknown as IAiFollowupTriggerRepository,
      { listRecentBySession: vi.fn(async () => []), save: vi.fn(), complete: vi.fn() } as unknown as IAiHandoffRepository,
    );

    const context = await builder.build({
      sessionId: 'policy-session-4',
      site: 'china',
      userMessage: 'continue',
      depth: 'full',
    });

    expect(context.recentMessages.map((message) => message.id)).toEqual(['msg-good']);
  });

  it('treats persisted deep engagement mode as authoritative on read', async () => {
    const sessionRepo: IAiChatSessionRepository = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'session-3',
        sessionId: 'policy-session-3',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: null,
        hospitalType: 'COSMETIC',
        status: 'ACTIVE',
        statusSnapshot: {
          engagementMode: 'DEEP_WORKFLOW',
          enteredDeepWorkflowAt: new Date('2026-03-29T00:00:00.000Z'),
          formStatus: 'not_started',
          docUploadStatus: 'none',
          recommendationStatus: 'not_started',
          packageStatus: 'not_introduced',
          consultationStatus: 'not_introduced',
          handoffStatus: 'not_needed',
          riskLevel: 'low',
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
      listRecentBySession: vi.fn(async () => []),
      updateWritebackMetadata: vi.fn(async () => null),
      updateMessage: vi.fn(async () => null),
      deleteById: vi.fn(async () => false),
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
      sessionId: 'policy-session-3',
      site: 'china',
      userMessage: 'hello',
      depth: 'light',
    });

    expect(context.currentEngagementMode).toBe('DEEP_WORKFLOW');
  });

  it('prefers request pageContext when deriving the active hospital context', async () => {
    const builder = buildContextBuilder({
      recentMessages: [],
    });

    const context = await builder.build({
      sessionId: 'policy-session-ctx-1',
      site: 'china',
      userMessage: 'Can this hospital help?',
      depth: 'light',
      pageContext: {
        type: 'HOSPITAL_DETAIL',
        hospitalId: 'hospital-123',
        hospitalName: 'Medora Seoul',
      },
    });

    expect(context.activeHospitalContext).toEqual({
      hospitalId: 'hospital-123',
      hospitalName: 'Medora Seoul',
      source: 'page_context',
    });
  });

  it('reactivates hospital-aware context from recent user-message metadata when request pageContext is absent', async () => {
    const builder = buildContextBuilder({
      recentMessages: [
        makeContextMessage({
          id: 'user-msg-1',
          role: 'USER',
          content: 'Tell me more about this hospital.',
          metadata: {
            pageContext: {
              type: 'HOSPITAL_DETAIL',
              hospitalId: 'hospital-abc',
              hospitalName: 'Medora Busan',
            },
          },
        }),
      ],
    });

    const context = await builder.build({
      sessionId: 'policy-session-ctx-1',
      site: 'china',
      userMessage: 'What documents does it need?',
      depth: 'light',
    });

    expect(context.activeHospitalContext).toEqual({
      hospitalId: 'hospital-abc',
      hospitalName: 'Medora Busan',
      source: 'recent_user_message',
    });
  });

  it('can derive hospital-aware context from the latest shortlist when no page context exists', async () => {
    const builder = buildContextBuilder({
      recentMessages: [
        makeContextMessage({
          id: 'assistant-msg-1',
          role: 'ASSISTANT',
          content: 'Here is a shortlist.',
          shortlist: [{ hospitalId: 'hospital-shortlist-1' }],
        }),
      ],
    });

    const context = await builder.build({
      sessionId: 'policy-session-ctx-1',
      site: 'china',
      userMessage: 'What about that hospital?',
      depth: 'full',
    });

    expect(context.activeHospitalContext).toEqual({
      hospitalId: 'hospital-shortlist-1',
      hospitalName: null,
      source: 'recent_shortlist',
    });
  });

  it('still prefers page context over shortlist-derived hospital focus', async () => {
    const builder = buildContextBuilder({
      recentMessages: [
        makeContextMessage({
          id: 'assistant-msg-2',
          role: 'ASSISTANT',
          content: 'Here is another shortlist.',
          shortlist: [{ hospitalId: 'hospital-shortlist-2' }],
        }),
      ],
    });

    const context = await builder.build({
      sessionId: 'policy-session-ctx-1',
      site: 'china',
      userMessage: 'Tell me about this hospital.',
      depth: 'light',
      pageContext: {
        type: 'HOSPITAL_DETAIL',
        hospitalId: 'hospital-page-1',
        hospitalName: 'Medora Tokyo',
      },
    });

    expect(context.activeHospitalContext).toEqual({
      hospitalId: 'hospital-page-1',
      hospitalName: 'Medora Tokyo',
      source: 'page_context',
    });
  });

  it('returns no active hospital context when there is no page or shortlist signal', async () => {
    const builder = buildContextBuilder({
      recentMessages: [],
    });

    const context = await builder.build({
      sessionId: 'policy-session-ctx-1',
      site: 'china',
      userMessage: 'Just tell me about your process.',
      depth: 'light',
    });

    expect(context.activeHospitalContext).toBeNull();
  });

  it('exposes chatbot-v2 foundation state so policy callers do not need route-local journey heuristics', async () => {
    const builder = buildContextBuilder();

    const context = await builder.build({
      sessionId: 'policy-session-ctx-1',
      site: 'china',
      userMessage: 'What should I do next?',
      depth: 'light',
    });

    expect(context.chatbotV2Foundation).toMatchObject({
      scopeId: 'policy-session-ctx-1',
      source: 'bootstrap',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
    });
    expect(context.chatbotV2Foundation.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
      }),
      expect.objectContaining({
        resourceType: 'MEDICAL_INVITATION_STATUS',
      }),
    ]));
  });

  it('restores chatbot-v2 foundation from the latest assistant chatbotV2 floor before orchestration', async () => {
    const builder = buildContextBuilder({
      recentMessages: [
        makeContextMessage({
          id: 'assistant-floor-1',
          role: 'ASSISTANT',
          content: 'We are ready to move into recommendation.',
          metadata: {
            chatbotV2: {
              journeySnapshot: {
                currentStage: 'RECOMMENDATION',
                currentPhase: 'pre',
              },
            },
          },
        }),
      ],
    });

    const context = await builder.build({
      sessionId: 'policy-session-ctx-1',
      site: 'china',
      userMessage: 'Okay, continue.',
      depth: 'light',
    });

    expect(context.chatbotV2Foundation.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'pre',
    });
  });
});

function buildContextBuilder(overrides: {
  recentMessages?: AiChatMessage[];
} = {}) {
  const sessionRepo: IAiChatSessionRepository = {
    findBySessionId: vi.fn(async () => new AiChatSession({
      id: 'session-ctx-1',
      sessionId: 'policy-session-ctx-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        engagementMode: 'QUALIFIED_EXPLORATION',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
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

  const recentMessages = overrides.recentMessages ?? [];
  const messageRepo: IAiChatMessageRepository = {
    create: vi.fn(),
    listBySession: vi.fn(async () => recentMessages),
    listRecentBySession: vi.fn(async () => recentMessages),
    updateWritebackMetadata: vi.fn(async () => null),
    updateMessage: vi.fn(async () => null),
    deleteById: vi.fn(async () => false),
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
    listPendingBySession: vi.fn(async () => []),
    createPendingTrigger: vi.fn(),
    resolvePendingTrigger: vi.fn(),
  };

  const handoffRepo: IAiHandoffRepository = {
    listRecentBySession: vi.fn(async () => []),
    save: vi.fn(),
    complete: vi.fn(),
  };

  return new ContextBuilderService(
    sessionRepo,
    messageRepo,
    profileRepo,
    timelineRepo,
    followupRepo,
    handoffRepo,
  );
}

function makeContextMessage(overrides: Partial<ConstructorParameters<typeof AiChatMessage>[0]> = {}) {
  return new AiChatMessage({
    id: overrides.id ?? 'msg-default',
    sessionId: overrides.sessionId ?? 'session-ctx-1',
    role: overrides.role ?? 'ASSISTANT',
    content: overrides.content ?? 'stub',
    intent: overrides.intent ?? 'FAQ',
    resolvedIntent: overrides.resolvedIntent ?? 'GENERAL_QUESTION',
    riskLevel: overrides.riskLevel ?? 'NORMAL',
    canAnswer: overrides.canAnswer ?? true,
    nextAction: overrides.nextAction ?? 'ANSWER',
    secondaryAction: overrides.secondaryAction ?? null,
    responseMode: overrides.responseMode ?? 'grounded_answer',
    citations: overrides.citations ?? [],
    reasonCodes: overrides.reasonCodes ?? [],
    shortlist: overrides.shortlist ?? [],
    writebackStatus: overrides.writebackStatus ?? 'pending',
    toolTrace: overrides.toolTrace ?? [],
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? new Date('2026-03-31T00:00:00Z'),
  });
}
