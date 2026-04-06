import { describe, expect, it, vi } from 'vitest';
import { AiChatSession } from '@medical-crm/domain';
import { HandoffPolicyService } from '../../policy-engine/handoff-policy.service.js';
import { WritebackExecutorService } from '../../policy-engine/writeback-executor.service.js';
import { WritebackPlannerService } from '../../policy-engine/writeback-planner.service.js';

describe('WritebackExecutorService', () => {
  it('keeps low-signal turns free of timeline and followup noise while updating engagement truth', async () => {
    const sessionRepo = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'db-session-0',
        sessionId: 'session-0',
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
          engagementMode: 'LIGHT_DISCOVERY',
          prequalificationReasonCodes: [],
          enteredDeepWorkflowAt: null,
          pendingOffer: null,
          pendingQuestion: null,
          lastNextAction: null,
          lastResolvedIntent: 'GENERAL_CONSULT',
          conversationSummary: '',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      patchStatus: vi.fn(async (_sessionId: string, patch: Record<string, unknown>) => new AiChatSession({
        id: 'db-session-0',
        sessionId: 'session-0',
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
          engagementMode: (patch['engagementMode'] as string | undefined) ?? 'LIGHT_DISCOVERY',
          prequalificationReasonCodes: (patch['prequalificationReasonCodes'] as string[] | undefined) ?? [],
          enteredDeepWorkflowAt: null,
          pendingOffer: null,
          pendingQuestion: null,
          lastNextAction: (patch['lastNextAction'] as string | undefined) ?? 'ANSWER_FAQ',
          lastResolvedIntent: 'GENERAL_CONSULT',
          conversationSummary: '',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };
    const profileRepo = { patch: vi.fn(async () => null) };
    const messageRepo = { updateWritebackMetadata: vi.fn(async (_messageId: string, patch: Record<string, unknown>) => patch) };
    const timelineRepo = { append: vi.fn(async (event) => event) };
    const followupRepo = { createPendingTrigger: vi.fn(async (trigger) => trigger) };
    const handoffRepo = { save: vi.fn(async (handoff) => handoff) };

    const executor = new WritebackExecutorService(
      sessionRepo as any,
      profileRepo as any,
      messageRepo as any,
      timelineRepo as any,
      followupRepo as any,
      handoffRepo as any,
      new WritebackPlannerService(),
      new HandoffPolicyService(),
    );

    const result = await executor.execute({
      sessionId: 'session-0',
      sessionDbId: 'db-session-0',
      patientId: null,
      assistantMessageId: 'assistant-light-1',
      policyDecision: {
        engagementMode: 'LIGHT_DISCOVERY',
        writebackDepth: 'minimal',
        nextAction: 'ANSWER_FAQ',
        riskLevel: 'LOW',
        reasonCodes: ['light_discovery_soft_guidance'],
        prequalificationReasonCodes: ['greeting_detected'],
      },
    });

    expect(sessionRepo.patchStatus).toHaveBeenCalledWith('session-0', expect.objectContaining({
      engagementMode: 'LIGHT_DISCOVERY',
      prequalificationReasonCodes: ['greeting_detected'],
      lastNextAction: 'ANSWER_FAQ',
    }));
    expect(timelineRepo.append).not.toHaveBeenCalled();
    expect(followupRepo.createPendingTrigger).not.toHaveBeenCalled();
    expect(messageRepo.updateWritebackMetadata).toHaveBeenCalledWith('assistant-light-1', {
      metadata: expect.objectContaining({
        engagementMode: 'LIGHT_DISCOVERY',
        writebackDepth: 'minimal',
        prequalificationReasonCodes: ['greeting_detected'],
      }),
      writebackStatus: 'completed',
    });
    expect(result.timelineEventsWritten).toEqual([]);
    expect(result.followupCreated).toBeNull();
  });

  it('writes timeline, session snapshot, shortlist audit, and followup in one backend-controlled pass', async () => {
    const sessionRepo = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'db-session-1',
        sessionId: 'session-1',
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
          engagementMode: 'LIGHT_DISCOVERY',
          prequalificationReasonCodes: [],
          enteredDeepWorkflowAt: null,
          pendingOffer: null,
          pendingQuestion: null,
          lastNextAction: null,
          lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
          conversationSummary: '',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      patchStatus: vi.fn(async (_sessionId: string, patch: Record<string, unknown>) => new AiChatSession({
        id: 'db-session-1',
        sessionId: 'session-1',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: null,
        hospitalType: 'COSMETIC',
        status: 'ACTIVE',
        statusSnapshot: {
          conditionStatus: 'unknown',
          formStatus: 'not_started',
          docUploadStatus: 'none',
          recommendationStatus: (patch['recommendationStatus'] as string | undefined) ?? 'not_started',
          consultationStatus: 'not_introduced',
          packageStatus: 'not_introduced',
          handoffStatus: 'not_needed',
          leadMaturity: 'browsing',
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: (patch['engagementMode'] as string | undefined) ?? 'DEEP_WORKFLOW',
          prequalificationReasonCodes: (patch['prequalificationReasonCodes'] as string[] | undefined) ?? [],
          enteredDeepWorkflowAt: patch['enteredDeepWorkflowAt'] instanceof Date
            ? patch['enteredDeepWorkflowAt'] as Date
            : null,
          pendingOffer: null,
          pendingQuestion: null,
          lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
          conversationSummary: '',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };
    const profileRepo = { patch: vi.fn(async () => null) };
    const messageRepo = { updateWritebackMetadata: vi.fn(async (_messageId: string, patch: Record<string, unknown>) => patch) };
    const timelineRepo = { append: vi.fn(async (event) => event) };
    const followupRepo = { createPendingTrigger: vi.fn(async (trigger) => trigger) };
    const handoffRepo = { save: vi.fn(async (handoff) => handoff) };

    const executor = new WritebackExecutorService(
      sessionRepo as any,
      profileRepo as any,
      messageRepo as any,
      timelineRepo as any,
      followupRepo as any,
      handoffRepo as any,
      new WritebackPlannerService(),
      new HandoffPolicyService(),
    );

    const result = await executor.execute({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-1',
      policyDecision: {
        engagementMode: 'DEEP_WORKFLOW',
        writebackDepth: 'complete',
        nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        riskLevel: 'LOW',
        reasonCodes: ['condition_fit'],
        prequalificationReasonCodes: ['form_completed', 'recommendation_requested'],
        shortlist: [{ hospitalId: 'hospital-1', reasonCodes: ['condition_fit'] }],
      },
    });

    expect(result.timelineEventsWritten).toContain('HOSPITALS_RECOMMENDED');
    expect(result.statusUpdated.recommendationStatus).toBe('PRELIMINARY_SHOWN');
    expect(result.statusUpdated.engagementMode).toBe('DEEP_WORKFLOW');
    expect(result.statusUpdated.enteredDeepWorkflowAt).toBeInstanceOf(Date);
    expect(messageRepo.updateWritebackMetadata).toHaveBeenCalledWith('assistant-1', {
      metadata: expect.objectContaining({
        engagementMode: 'DEEP_WORKFLOW',
        writebackDepth: 'complete',
        prequalificationReasonCodes: ['form_completed', 'recommendation_requested'],
        shortlist: [{ hospitalId: 'hospital-1', reasonCodes: ['condition_fit'] }],
      }),
      writebackStatus: 'completed',
    });
    expect(result.messageMetadata.shortlist?.[0]?.hospitalId).toBe('hospital-1');
  });

  it('persists selectedHospitalId onto the session snapshot when writeback carries an explicit hospital choice', async () => {
    const sessionRepo = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'db-session-selected',
        sessionId: 'session-selected',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: null,
        hospitalType: 'COSMETIC',
        status: 'ACTIVE',
        statusSnapshot: {
          conditionStatus: 'known',
          formStatus: 'completed',
          docUploadStatus: 'uploaded',
          recommendationStatus: 'preliminary_shown',
          consultationStatus: 'not_introduced',
          packageStatus: 'shown',
          handoffStatus: 'not_needed',
          leadMaturity: 'qualified',
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: 'DEEP_WORKFLOW',
          prequalificationReasonCodes: [],
          enteredDeepWorkflowAt: null,
          pendingOffer: null,
          pendingQuestion: null,
          lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
          conversationSummary: '',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      patchStatus: vi.fn(async (_sessionId: string, patch: Record<string, unknown>) => patch),
    };
    const profileRepo = { patch: vi.fn(async () => null) };
    const messageRepo = { updateWritebackMetadata: vi.fn(async (_messageId: string, patch: Record<string, unknown>) => patch) };
    const timelineRepo = { append: vi.fn(async (event) => event) };
    const followupRepo = { createPendingTrigger: vi.fn(async (trigger) => trigger) };
    const handoffRepo = { save: vi.fn(async (handoff) => handoff) };

    const executor = new WritebackExecutorService(
      sessionRepo as any,
      profileRepo as any,
      messageRepo as any,
      timelineRepo as any,
      followupRepo as any,
      handoffRepo as any,
      new WritebackPlannerService(),
      new HandoffPolicyService(),
    );

    await executor.execute({
      sessionId: 'session-selected',
      sessionDbId: 'db-session-selected',
      patientId: null,
      assistantMessageId: 'assistant-selected',
      policyDecision: {
        engagementMode: 'DEEP_WORKFLOW',
        writebackDepth: 'complete',
        nextAction: 'ANSWER_FAQ',
        selectedHospitalId: 'hospital-selected-1',
        riskLevel: 'LOW',
        reasonCodes: ['pending_offer_confirmed'],
        prequalificationReasonCodes: ['recommendation_requested'],
      },
    });

    expect(sessionRepo.patchStatus).toHaveBeenCalledWith('session-selected', expect.objectContaining({
      selectedHospitalId: 'hospital-selected-1',
      lastNextAction: 'ANSWER_FAQ',
    }));
  });

  it('creates the requested-human handoff side effect when the final action is HUMAN_HANDOFF', async () => {
    const sessionRepo = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'db-session-handoff',
        sessionId: 'session-handoff',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: null,
        hospitalType: 'REGULAR',
        status: 'ACTIVE',
        statusSnapshot: {
          conditionStatus: 'known',
          formStatus: 'completed',
          docUploadStatus: 'uploaded',
          recommendationStatus: 'preliminary_shown',
          consultationStatus: 'ready',
          packageStatus: 'shown',
          handoffStatus: 'not_needed',
          leadMaturity: 'qualified',
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: 'QUALIFIED_EXPLORATION',
          prequalificationReasonCodes: [],
          enteredDeepWorkflowAt: null,
          pendingOffer: null,
          pendingQuestion: null,
          lastNextAction: 'ANSWER_FAQ',
          lastResolvedIntent: 'GENERAL_CONSULT',
          conversationSummary: '',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      patchStatus: vi.fn(async (_sessionId: string, patch: Record<string, unknown>) => patch),
    };
    const profileRepo = { patch: vi.fn(async () => null) };
    const messageRepo = { updateWritebackMetadata: vi.fn(async (_messageId: string, patch: Record<string, unknown>) => patch) };
    const timelineRepo = { append: vi.fn(async (event) => event) };
    const followupRepo = { createPendingTrigger: vi.fn(async (trigger) => trigger) };
    const handoffRepo = { save: vi.fn(async (handoff) => ({ ...handoff, id: 'handoff-1' })) };

    const executor = new WritebackExecutorService(
      sessionRepo as any,
      profileRepo as any,
      messageRepo as any,
      timelineRepo as any,
      followupRepo as any,
      handoffRepo as any,
      new WritebackPlannerService(),
      new HandoffPolicyService(),
    );

    const result = await executor.execute({
      sessionId: 'session-handoff',
      sessionDbId: 'db-session-handoff',
      patientId: null,
      assistantMessageId: 'assistant-handoff',
      policyDecision: {
        engagementMode: 'QUALIFIED_EXPLORATION',
        writebackDepth: 'moderate',
        nextAction: 'HUMAN_HANDOFF',
        riskLevel: 'LOW',
        reasonCodes: ['human_handoff_requested'],
        prequalificationReasonCodes: ['trust_building_question'],
      },
    });

    expect(handoffRepo.save).toHaveBeenCalledTimes(1);
    expect(handoffRepo.save.mock.calls[0]?.[0]).toMatchObject({
      handoffType: 'REQUESTED_HUMAN',
      priority: 'MEDIUM',
      reasonCode: 'user_requested_human',
    });
    expect(result.handoffCreated).toBe('handoff-1');
  });
});
