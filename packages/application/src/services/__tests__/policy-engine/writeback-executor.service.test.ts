import { describe, expect, it, vi } from 'vitest';
import { AiChatSession } from '@medical-crm/domain';
import { HandoffPolicyService } from '../../policy-engine/handoff-policy.service.js';
import { WritebackExecutorService } from '../../policy-engine/writeback-executor.service.js';
import { WritebackPlannerService } from '../../policy-engine/writeback-planner.service.js';

describe('WritebackExecutorService', () => {
  it('writes timeline, session snapshot, shortlist audit, and followup in one backend-controlled pass', async () => {
    const sessionRepo = {
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
    const timelineRepo = { append: vi.fn(async (event) => event) };
    const followupRepo = { createPendingTrigger: vi.fn(async (trigger) => trigger) };
    const handoffRepo = { save: vi.fn(async (handoff) => handoff) };

    const executor = new WritebackExecutorService(
      sessionRepo as any,
      profileRepo as any,
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
        nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        riskLevel: 'LOW',
        reasonCodes: ['condition_fit'],
        shortlist: [{ hospitalId: 'hospital-1', reasonCodes: ['condition_fit'] }],
      },
    });

    expect(result.timelineEventsWritten).toContain('HOSPITALS_RECOMMENDED');
    expect(result.statusUpdated.recommendationStatus).toBe('PRELIMINARY_SHOWN');
    expect(result.messageMetadata.shortlist?.[0]?.hospitalId).toBe('hospital-1');
  });
});
