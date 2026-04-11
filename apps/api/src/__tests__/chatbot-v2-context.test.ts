import { describe, expect, it, vi } from 'vitest';
import { buildChatbotV2TurnContext } from '../routes/chatbot-v2-context.js';

describe('buildChatbotV2TurnContext', () => {
  it('classifies even when policy context projects legacy request fields and keeps later-stage process explanations from rewinding the journey', async () => {
    const getAiPolicyContext = {
      execute: vi.fn().mockResolvedValue({
        conversation_summary: 'The patient is already discussing recommendation details.',
        recent_messages: [
          { role: 'ASSISTANT', content: 'We are currently at the recommendation stage.' },
          { role: 'USER', content: 'Okay.' },
          { role: 'ASSISTANT', content: 'We can guide you step by step.' },
          { role: 'USER', content: 'I want to understand the options.' },
          { role: 'ASSISTANT', content: 'How can I help?' },
        ],
        chatbot_v2: {
          scope_id: 'widget-chat:patient-1:case-1',
          request_class: 'faq',
          response_intent: 'faq',
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
          allowed_resources: [
            {
              resource_type: 'PROCESS_GUIDE',
              resource_id: 'process-guide:widget-chat:patient-1:case-1',
              status: 'available',
              visibility: {
                mode: 'global',
              },
              payload: {
                title: 'Understand the process',
              },
              actions: ['open'],
            },
          ],
        },
      }),
    };
    const difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'process_explanation',
          targetResourceTypes: ['PROCESS_GUIDE'],
          includeProgressionFollowUp: false,
        }),
      }),
    };
    const services = {
      getAiPolicyContext,
      difyClassifierApi,
      difyApi: {
        createChatMessage: vi.fn(),
      },
      aiChatSessionRepo: {
        findBySessionId: vi.fn().mockResolvedValue(null),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn(),
      },
    } as any;

    const result = await buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'Why do we still need this step?',
    });

    expect(difyClassifierApi.createChatMessage).toHaveBeenCalledOnce();
    expect(difyClassifierApi.createChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      query: 'Why do we still need this step?',
      user: 'widget-chat:patient-1:case-1',
      inputs: {
        recentMessages: JSON.stringify([
          { role: 'ASSISTANT', content: 'How can I help?' },
          { role: 'USER', content: 'I want to understand the options.' },
          { role: 'ASSISTANT', content: 'We can guide you step by step.' },
          { role: 'USER', content: 'Okay.' },
          { role: 'ASSISTANT', content: 'We are currently at the recommendation stage.' },
          { role: 'USER', content: 'Why do we still need this step?' },
        ]),
        conversationSummary: 'The patient is already discussing recommendation details.',
        journeySnapshot: JSON.stringify({
          currentStage: 'RECOMMENDATION',
          currentPhase: 'active',
        }),
        allowedResourceHints: JSON.stringify([
          {
            resourceType: 'PROCESS_GUIDE',
            description: 'Explains the consultation and treatment process.',
          },
          {
            resourceType: 'MEDICAL_INVITATION_STATUS',
            description: 'Lets the patient check the medical invitation status.',
          },
        ]),
      },
    }));
    expect(services.aiChatMessageRepo.listBySession).not.toHaveBeenCalled();

    expect(result.preTurn.requestClass).toBe('process_explanation');
    expect(result.preTurn.responseIntent).toBe('process_explanation');
    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    });
    expect(result.preTurn.resources).toEqual([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
      }),
    ]);
  });

  it('falls back to repository messages in chronological order when policy context omits recent_messages', async () => {
    const getAiPolicyContext = {
      execute: vi.fn().mockResolvedValue({
        conversation_summary: 'The patient needs help moving forward.',
        chatbot_v2: {
          scope_id: 'widget-chat:patient-1:case-1',
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
          allowed_resources: [
            {
              resource_type: 'PROCESS_GUIDE',
              resource_id: 'process-guide:widget-chat:patient-1:case-1',
              status: 'available',
              visibility: {
                mode: 'global',
              },
              payload: {
                title: 'Understand the process',
              },
              actions: ['open'],
            },
          ],
        },
      }),
    };
    const difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'progression_request',
          targetResourceTypes: [],
          includeProgressionFollowUp: false,
        }),
      }),
    };
    const services = {
      getAiPolicyContext,
      difyClassifierApi,
      difyApi: {
        createChatMessage: vi.fn(),
      },
      aiChatSessionRepo: {
        findBySessionId: vi.fn().mockResolvedValue({
          id: 'db-session-1',
          sessionId: 'widget-chat:patient-1:case-1',
        }),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn().mockResolvedValue([
          { role: 'ASSISTANT', content: 'What would you like to do next?' },
          { role: 'USER', content: 'I want to keep going.' },
          { role: 'ASSISTANT', content: 'We can walk through the process.' },
        ]),
      },
    } as any;

    await buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'Okay, continue.',
    });

    expect(services.aiChatMessageRepo.listBySession).toHaveBeenCalledWith('db-session-1', 5);
    expect(difyClassifierApi.createChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      inputs: expect.objectContaining({
        recentMessages: JSON.stringify([
          { role: 'ASSISTANT', content: 'We can walk through the process.' },
          { role: 'USER', content: 'I want to keep going.' },
          { role: 'ASSISTANT', content: 'What would you like to do next?' },
          { role: 'USER', content: 'Okay, continue.' },
        ]),
      }),
    }));
  });

  it('fails explicitly when the dedicated classifier client is missing instead of falling back to difyApi', async () => {
    const getAiPolicyContext = {
      execute: vi.fn().mockResolvedValue({
        chatbot_v2: {
          scope_id: 'widget-chat:patient-1:case-1',
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
          allowed_resources: [
            {
              resource_type: 'PROCESS_GUIDE',
              resource_id: 'process-guide:widget-chat:patient-1:case-1',
              status: 'available',
              visibility: {
                mode: 'global',
              },
              payload: {
                title: 'Understand the process',
              },
              actions: ['open'],
            },
          ],
        },
      }),
    };
    const services = {
      getAiPolicyContext,
      difyApi: {
        createChatMessage: vi.fn().mockResolvedValue({
          answer: JSON.stringify({
            requestClass: 'process_explanation',
            targetResourceTypes: ['PROCESS_GUIDE'],
            includeProgressionFollowUp: false,
          }),
        }),
      },
      aiChatSessionRepo: {
        findBySessionId: vi.fn().mockResolvedValue({
          id: 'db-session-1',
          sessionId: 'widget-chat:patient-1:case-1',
        }),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn().mockResolvedValue([]),
      },
    } as any;

    await expect(buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'How does this work?',
    })).rejects.toThrow('DIFY_CLASSIFIER_APP_API_KEY is required for chatbot-v2 classification');

    expect(services.difyApi.createChatMessage).not.toHaveBeenCalled();
  });

  it('includes non-visible progression resources in classifier hints so explicit resource requests can still classify correctly', async () => {
    const getAiPolicyContext = {
      execute: vi.fn().mockResolvedValue({
        chatbot_v2: {
          scope_id: 'widget-chat:patient-1:case-1',
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
          allowed_resources: [
            {
              resource_type: 'PROCESS_GUIDE',
              resource_id: 'process-guide:widget-chat:patient-1:case-1',
              status: 'available',
              visibility: {
                mode: 'global',
              },
              payload: {
                title: 'Understand the process',
              },
              actions: ['open'],
            },
          ],
        },
      }),
    };
    const difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'resource_request',
          targetResourceTypes: ['QUESTIONNAIRE'],
          includeProgressionFollowUp: false,
        }),
      }),
    };
    const services = {
      getAiPolicyContext,
      difyClassifierApi,
      difyApi: {
        createChatMessage: vi.fn(),
      },
      aiChatSessionRepo: {
        findBySessionId: vi.fn().mockResolvedValue(null),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn(),
      },
    } as any;

    const result = await buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'Open the questionnaire for me.',
    });

    expect(difyClassifierApi.createChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      inputs: expect.objectContaining({
        allowedResourceHints: JSON.stringify([
          {
            resourceType: 'PROCESS_GUIDE',
            description: 'Explains the consultation and treatment process.',
          },
          {
            resourceType: 'MEDICAL_INVITATION_STATUS',
            description: 'Lets the patient check the medical invitation status.',
          },
          {
            resourceType: 'MEDICAL_DOC_UPLOAD',
            description: 'Lets the patient upload medical records and reports.',
          },
          {
            resourceType: 'QUESTIONNAIRE',
            description: 'Lets the patient fill in a medical intake questionnaire.',
          },
          {
            resourceType: 'HOSPITAL_RECOMMENDATION',
            description: 'Lets the patient review or confirm recommended hospitals.',
          },
          {
            resourceType: 'PACKAGE_RECOMMENDATION',
            description: 'Lets the patient review or confirm recommended packages.',
          },
        ]),
      }),
    }));
    expect(result.preTurn.requestClass).toBe('resource_request');
    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(result.preTurn.resources.map((resource) => resource.resourceType)).toEqual(['QUESTIONNAIRE']);
  });

  it('keeps a newer stored chatbot_v2 floor from rewinding back to EXPLAIN_PROCESS on follow-up turns', async () => {
    const getAiPolicyContext = {
      execute: vi.fn().mockResolvedValue({
        conversation_summary: 'A human advisor takeover was already requested.',
        chatbot_v2: {
          scope_id: 'widget-chat:patient-1:case-1',
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
          truth_summary: {
            medical_inputs_started: false,
            medical_inputs_submitted: false,
            recommendation_available: false,
            recommendation_confirmed: false,
            online_consult_required: false,
            online_consult_started: false,
            online_consult_submitted: false,
            human_handoff_active: false,
            human_handoff_submitted: false,
          },
          allowed_resources: [
            {
              resource_type: 'PROCESS_GUIDE',
              resource_id: 'process-guide:widget-chat:patient-1:case-1',
              status: 'available',
              visibility: {
                mode: 'global',
              },
              payload: {
                title: 'Understand the process',
              },
              actions: ['open'],
            },
          ],
        },
        chatbot_v2_floor: {
          journey_snapshot: {
            current_stage: 'HUMAN_HANDOFF',
            current_phase: 'pre',
          },
          allowed_resources: [
            {
              resource_type: 'HUMAN_HANDOFF',
              resource_id: 'human-handoff:widget-chat:patient-1:case-1',
              status: 'available',
              stage_binding: {
                stage: 'HUMAN_HANDOFF',
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
          request_class: 'human_help_request',
          response_intent: 'human_help_request',
        },
      }),
    };
    const difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'resource_status_question',
          targetResourceTypes: ['MEDICAL_INVITATION_STATUS'],
          includeProgressionFollowUp: false,
        }),
      }),
    };
    const services = {
      getAiPolicyContext,
      difyClassifierApi,
      difyApi: {
        createChatMessage: vi.fn(),
      },
      aiChatSessionRepo: {
        findBySessionId: vi.fn().mockResolvedValue(null),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn(),
      },
    } as any;

    const result = await buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'Can you confirm the current status of my medical invitation again?',
    });

    expect(difyClassifierApi.createChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      inputs: expect.objectContaining({
        journeySnapshot: JSON.stringify({
          currentStage: 'HUMAN_HANDOFF',
          currentPhase: 'pre',
        }),
      }),
    }));
    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'pre',
    });
    expect(result.preTurn.resources).toEqual([
      expect.objectContaining({
        resourceType: 'MEDICAL_INVITATION_STATUS',
      }),
    ]);
  });
});
