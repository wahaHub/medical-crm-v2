import { describe, expect, it, vi } from 'vitest';
import { GetAiPolicyContextUseCase } from '../get-ai-policy-context.use-case.js';

describe('GetAiPolicyContextUseCase', () => {
  it('serializes chatbot_v2 as a bootstrap payload', async () => {
    const contextBuilder = {
      build: vi.fn(async () => ({
        profile: null,
        chatbotV2Foundation: {
          source: 'bootstrap',
          scopeId: 'session-123',
          truth: {
            medicalInputsSubmitted: false,
            recommendationConfirmed: false,
            onlineConsultSubmitted: false,
          },
          journeySnapshot: {
            currentStage: 'EXPLAIN_PROCESS',
            currentPhase: 'active',
          },
          allowedResources: [
            {
              resourceType: 'PROCESS_GUIDE',
              resourceId: 'process-guide:session-123',
              status: 'available',
              stageBinding: {
                stage: 'EXPLAIN_PROCESS',
                phase: 'active',
              },
              visibility: {
                mode: 'global',
              },
              payload: {
                title: 'Understand our consultation process',
              },
              actions: ['open'],
            },
            {
              resourceType: 'HUMAN_HANDOFF',
              resourceId: 'human-handoff:session-123',
              status: 'available',
              stageBinding: {
                stage: 'EXPLAIN_PROCESS',
                phase: 'active',
              },
              visibility: {
                mode: 'global',
              },
              payload: {
                title: 'Talk to a care advisor',
              },
              actions: ['request_human'],
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

    expect(result.chatbot_v2).toMatchObject({
      source: 'bootstrap',
      scope_id: 'session-123',
      truth_summary: {
        medical_inputs_submitted: false,
        recommendation_confirmed: false,
        online_consult_submitted: false,
      },
      journey_snapshot: {
        current_stage: 'EXPLAIN_PROCESS',
        current_phase: 'active',
      },
    });
    expect(result.chatbot_v2).not.toHaveProperty('request_class');
    expect(result.chatbot_v2).not.toHaveProperty('response_intent');
    expect(result.chatbot_v2.allowed_resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resource_type: 'PROCESS_GUIDE',
        resource_id: 'process-guide:session-123',
        status: 'available',
        stage_binding: {
          stage: 'EXPLAIN_PROCESS',
          phase: 'active',
        },
        payload: {
          title: 'Understand our consultation process',
        },
      }),
      expect.objectContaining({
        resource_type: 'HUMAN_HANDOFF',
      }),
    ]));
  });

  it('surfaces the latest stored chatbot_v2 assistant context as a floor for non-regressing follow-up turns', async () => {
    const contextBuilder = {
      build: vi.fn(async () => ({
        profile: null,
        chatbotV2Foundation: {
          source: 'bootstrap',
          scopeId: 'session-123',
          truth: {
            medicalInputsSubmitted: false,
            recommendationConfirmed: false,
            onlineConsultSubmitted: false,
          },
          journeySnapshot: {
            currentStage: 'EXPLAIN_PROCESS',
            currentPhase: 'active',
          },
          allowedResources: [
            {
              resourceType: 'PROCESS_GUIDE',
              resourceId: 'process-guide:session-123',
              status: 'available',
              stageBinding: {
                stage: 'EXPLAIN_PROCESS',
                phase: 'active',
              },
              visibility: {
                mode: 'global',
              },
              payload: {
                title: 'Understand our consultation process',
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
        recentMessages: [
          {
            id: 'assistant-1',
            role: 'ASSISTANT',
            content: 'A human advisor will take over next.',
            resolvedIntent: null,
            nextAction: 'HUMAN_HANDOFF',
            secondaryAction: null,
            responseMode: null,
            createdAt: new Date('2026-04-11T10:00:00.000Z'),
            metadata: {
              chatbotV2: {
                journeySnapshot: {
                  currentStage: 'HUMAN_HANDOFF',
                  currentPhase: 'pre',
                },
                resources: [
                  {
                    resourceType: 'HUMAN_HANDOFF',
                    resourceId: 'human-handoff:session-123',
                    status: 'available',
                    stageBinding: {
                      stage: 'HUMAN_HANDOFF',
                      phase: 'active',
                    },
                    visibility: {
                      mode: 'global',
                    },
                    payload: {
                      title: 'Talk to a human care advisor',
                    },
                    actions: ['request_human'],
                  },
                ],
                requestClass: 'human_help_request',
                responseIntent: 'human_help_request',
                includeProgressionFollowUp: false,
                truthSummary: {
                  medicalInputsSubmitted: false,
                  recommendationConfirmed: false,
                  onlineConsultSubmitted: false,
                },
              },
            },
          },
        ],
        activeFollowups: [],
        recentTimeline: [],
        recentHandoffs: [],
      })),
    } as const;

    const useCase = new GetAiPolicyContextUseCase(contextBuilder as never);

    const result = await useCase.execute({
      sessionId: 'session-123',
      userMessage: 'Can you confirm the current status again?',
    });

    expect(result.chatbot_v2_floor).toMatchObject({
      journey_snapshot: {
        current_stage: 'HUMAN_HANDOFF',
        current_phase: 'pre',
      },
      allowed_resources: [
        expect.objectContaining({
          resource_type: 'HUMAN_HANDOFF',
        }),
      ],
      request_class: 'human_help_request',
      response_intent: 'human_help_request',
    });
  });

  it('reads the newest assistant chatbot_v2 floor instead of an older assistant snapshot', async () => {
    const contextBuilder = {
      build: vi.fn(async () => ({
        profile: null,
        chatbotV2Foundation: {
          source: 'bootstrap',
          scopeId: 'session-123',
          truth: {
            medicalInputsSubmitted: false,
            recommendationConfirmed: false,
            onlineConsultSubmitted: false,
          },
          journeySnapshot: {
            currentStage: 'EXPLAIN_PROCESS',
            currentPhase: 'active',
          },
          allowedResources: [],
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
        recentMessages: [
          {
            id: 'assistant-newest',
            role: 'ASSISTANT',
            content: 'A human advisor will take over next.',
            resolvedIntent: null,
            nextAction: 'HUMAN_HANDOFF',
            secondaryAction: null,
            responseMode: null,
            createdAt: new Date('2026-04-11T10:10:00.000Z'),
            metadata: {
              chatbotV2: {
                journeySnapshot: {
                  currentStage: 'HUMAN_HANDOFF',
                  currentPhase: 'pre',
                },
                resources: [],
                requestClass: 'human_help_request',
                responseIntent: 'human_help_request',
              },
            },
          },
          {
            id: 'assistant-older',
            role: 'ASSISTANT',
            content: 'Here is the earlier process context.',
            resolvedIntent: null,
            nextAction: 'ANSWER_FAQ',
            secondaryAction: null,
            responseMode: null,
            createdAt: new Date('2026-04-11T10:00:00.000Z'),
            metadata: {
              chatbotV2: {
                journeySnapshot: {
                  currentStage: 'EXPLAIN_PROCESS',
                  currentPhase: 'active',
                },
                resources: [],
                requestClass: 'process_explanation',
                responseIntent: 'process_explanation',
              },
            },
          },
        ],
        activeFollowups: [],
        recentTimeline: [],
        recentHandoffs: [],
      })),
    } as const;

    const useCase = new GetAiPolicyContextUseCase(contextBuilder as never);

    const result = await useCase.execute({
      sessionId: 'session-123',
      userMessage: 'What happens next?',
    });

    expect(result.chatbot_v2_floor).toMatchObject({
      journey_snapshot: {
        current_stage: 'HUMAN_HANDOFF',
        current_phase: 'pre',
      },
      request_class: 'human_help_request',
      response_intent: 'human_help_request',
    });
  });

  it('prefers a stored chatbotV2Floor over the current-turn chatbotV2 envelope when restoring the next-turn floor', async () => {
    const contextBuilder = {
      build: vi.fn(async () => ({
        profile: null,
        chatbotV2Foundation: {
          source: 'bootstrap',
          scopeId: 'session-123',
          truth: {
            medicalInputsSubmitted: false,
            recommendationConfirmed: false,
            onlineConsultSubmitted: false,
          },
          journeySnapshot: {
            currentStage: 'EXPLAIN_PROCESS',
            currentPhase: 'active',
          },
          allowedResources: [],
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
        activeFollowups: [],
        recentTimeline: [],
        recentHandoffs: [],
        recentMessages: [
          {
            id: 'assistant-1',
            role: 'ASSISTANT',
            content: 'Here is how the process works.',
            resolvedIntent: null,
            nextAction: null,
            secondaryAction: null,
            responseMode: null,
            createdAt: new Date('2026-04-14T10:00:00.000Z'),
            metadata: {
              chatbotV2: {
                journeySnapshot: {
                  currentStage: 'EXPLAIN_PROCESS',
                  currentPhase: 'active',
                },
                resources: [{
                  resourceType: 'PROCESS_GUIDE',
                  resourceId: 'process-guide:session-123',
                  status: 'available',
                  visibility: { mode: 'global' },
                  payload: { title: 'Understand our consultation process' },
                  actions: ['open'],
                }],
                requestClass: 'progression_request',
                responseIntent: 'process_explanation',
              },
              chatbotV2Floor: {
                journeySnapshot: {
                  currentStage: 'COLLECT_MEDICAL_INPUTS',
                  currentPhase: 'pre',
                },
                resources: [{
                  resourceType: 'QUESTIONNAIRE',
                  resourceId: 'questionnaire:session-123',
                  status: 'available',
                  visibility: { mode: 'journey' },
                  payload: { title: 'Complete your medical questionnaire' },
                  actions: ['open'],
                }],
                requestClass: 'progression_request',
                responseIntent: 'process_explanation',
              },
            },
          },
        ],
      })),
    } as const;

    const useCase = new GetAiPolicyContextUseCase(contextBuilder as never);

    const result = await useCase.execute({
      sessionId: 'session-123',
      userMessage: 'What happens next?',
    });

    expect(result.chatbot_v2_floor).toMatchObject({
      journey_snapshot: {
        current_stage: 'COLLECT_MEDICAL_INPUTS',
        current_phase: 'pre',
      },
      allowed_resources: [
        expect.objectContaining({
          resource_type: 'QUESTIONNAIRE',
        }),
      ],
    });
  });
});
