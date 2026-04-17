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
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: 'LIGHT_DISCOVERY',
          enteredDeepWorkflowAt: null,
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
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: (patch['engagementMode'] as string | undefined) ?? 'LIGHT_DISCOVERY',
          enteredDeepWorkflowAt: null,
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
      site: 'china',
      sessionDbId: 'db-session-0',
      patientId: null,
      assistantMessageId: 'assistant-light-1',
      policyDecision: {
        engagementMode: 'LIGHT_DISCOVERY',
        writebackDepth: 'minimal',
        nextAction: 'ANSWER_FAQ',
        riskLevel: 'LOW',
        reasonCodes: ['light_discovery_soft_guidance'],
      },
    });

    expect(sessionRepo.patchStatus).toHaveBeenCalledWith('session-0', 'china', expect.objectContaining({
      engagementMode: 'LIGHT_DISCOVERY',
    }));
    expect(timelineRepo.append).not.toHaveBeenCalled();
    expect(followupRepo.createPendingTrigger).not.toHaveBeenCalled();
    expect(messageRepo.updateWritebackMetadata).toHaveBeenCalledWith('assistant-light-1', {
      metadata: expect.objectContaining({
        engagementMode: 'LIGHT_DISCOVERY',
        writebackDepth: 'minimal',
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
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: 'LIGHT_DISCOVERY',
          enteredDeepWorkflowAt: null,
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
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: (patch['engagementMode'] as string | undefined) ?? 'DEEP_WORKFLOW',
          enteredDeepWorkflowAt: patch['enteredDeepWorkflowAt'] instanceof Date
            ? patch['enteredDeepWorkflowAt'] as Date
            : null,
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
      site: 'china',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-1',
      policyDecision: {
        engagementMode: 'DEEP_WORKFLOW',
        writebackDepth: 'complete',
        nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        riskLevel: 'LOW',
        reasonCodes: ['condition_fit'],
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
        shortlist: [{ hospitalId: 'hospital-1', reasonCodes: ['condition_fit'] }],
      }),
      writebackStatus: 'completed',
    });
    expect(result.messageMetadata.shortlist?.[0]?.hospitalId).toBe('hospital-1');
  });

  it('does not persist questionnaire shadow state when REQUEST_DOC_UPLOAD is chosen', async () => {
    const sessionRepo = {
      findBySessionId: vi.fn(async () => new AiChatSession({
        id: 'db-session-docs',
        sessionId: 'session-docs',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: null,
        hospitalType: 'REGULAR',
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
          engagementMode: 'LIGHT_DISCOVERY',
          enteredDeepWorkflowAt: null,
          conversationSummary: '',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      patchStatus: vi.fn(async (_sessionId: string, patch: Record<string, unknown>) => new AiChatSession({
        id: 'db-session-docs',
        sessionId: 'session-docs',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: null,
        hospitalType: 'REGULAR',
        status: 'ACTIVE',
        statusSnapshot: {
          conditionStatus: 'unknown',
          formStatus: 'not_started',
          docUploadStatus: (patch['docUploadStatus'] as string | undefined) ?? 'none',
          recommendationStatus: 'not_started',
          consultationStatus: 'not_introduced',
          packageStatus: 'not_introduced',
          handoffStatus: 'not_needed',
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: (patch['engagementMode'] as string | undefined) ?? 'LIGHT_DISCOVERY',
          enteredDeepWorkflowAt: null,
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

    await executor.execute({
      sessionId: 'session-docs',
      site: 'china',
      sessionDbId: 'db-session-docs',
      patientId: null,
      assistantMessageId: 'assistant-docs-1',
      policyDecision: {
        engagementMode: 'LIGHT_DISCOVERY',
        writebackDepth: 'minimal',
        nextAction: 'REQUEST_DOC_UPLOAD',
        riskLevel: 'LOW',
        reasonCodes: ['documents_required_before_recommendation'],
      },
    });

    expect(sessionRepo.patchStatus).toHaveBeenCalledWith('session-docs', 'china', expect.not.objectContaining({
      pendingQuestion: expect.anything(),
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
          riskLevel: 'low',
          trustOrObjection: 'none',
          engagementMode: 'QUALIFIED_EXPLORATION',
          enteredDeepWorkflowAt: null,
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
      site: 'china',
      sessionDbId: 'db-session-handoff',
      patientId: null,
      assistantMessageId: 'assistant-handoff',
      policyDecision: {
        engagementMode: 'QUALIFIED_EXPLORATION',
        writebackDepth: 'moderate',
        nextAction: 'HUMAN_HANDOFF',
        riskLevel: 'LOW',
        reasonCodes: ['human_handoff_requested'],
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
