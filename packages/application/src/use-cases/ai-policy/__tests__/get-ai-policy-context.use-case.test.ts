import { describe, expect, it, vi } from 'vitest';
import { GetAiPolicyContextUseCase } from '../get-ai-policy-context.use-case.js';

describe('GetAiPolicyContextUseCase', () => {
  it('serializes chatbot_v2 as a status-snapshot bridge payload', async () => {
    const contextBuilder = {
      build: vi.fn(async () => ({
        profile: null,
        chatbotV2Foundation: {
          source: 'status_snapshot_bridge',
          scopeId: 'session-123',
          journeySnapshot: {
            currentStage: 'EXPLAIN_PROCESS',
            currentPhase: 'active',
          },
          allowedResources: [
            {
              resourceType: 'PROCESS_GUIDE',
              resourceId: 'process-guide',
              status: 'AVAILABLE',
              stageBinding: null,
              visibility: {
                mode: 'global',
              },
              payload: {
                title: 'Process guide',
              },
              actions: ['open'],
            },
          ],
        },
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
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
          conversationSummary: '',
        },
        activeHospitalContext: null,
        recentMessages: [],
        activeFollowups: [],
        recentTimeline: [],
        recentHandoffs: [],
      })),
    } as const;

    const useCase = new GetAiPolicyContextUseCase(contextBuilder as never);

    const result = await useCase.execute({
      sessionId: 'session-123',
      userMessage: 'hello',
    });

    expect(result.chatbot_v2).toEqual({
      source: 'status_snapshot_bridge',
      scope_id: 'session-123',
      journey_snapshot: {
        current_stage: 'EXPLAIN_PROCESS',
        current_phase: 'active',
      },
      allowed_resources: [
        {
          resource_type: 'PROCESS_GUIDE',
          resource_id: 'process-guide',
          status: 'AVAILABLE',
          stage_binding: null,
          visibility: {
            mode: 'global',
          },
          payload: {
            title: 'Process guide',
          },
          actions: ['open'],
        },
      ],
    });
  });
});
