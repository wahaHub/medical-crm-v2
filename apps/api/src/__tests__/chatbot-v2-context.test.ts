import { describe, expect, it, vi } from 'vitest';
import {
  buildChatbotV2PostTurnContext,
  buildChatbotV2TurnContext,
} from '../routes/chatbot-v2-context.js';

describe('buildChatbotV2TurnContext', () => {
  it('starts new journeys in EXPLAIN_PROCESS.pre and advances to EXPLAIN_PROCESS.active after the first turn is answered', () => {
    const result = buildChatbotV2PostTurnContext({
      foundation: {
        scopeId: 'widget-chat:patient-1:case-1',
        journeySnapshot: {
          currentStage: 'EXPLAIN_PROCESS',
          currentPhase: 'pre',
        },
        truth: {
          medicalInputsSubmitted: false,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        resources: [
          {
            resourceType: 'PROCESS_GUIDE',
            resourceId: 'process-guide:widget-chat:patient-1:case-1',
            status: 'available',
            visibility: { mode: 'global' },
            payload: {},
            actions: ['open'],
          },
        ],
        hasCompletedInitialProcessExplanation: false,
        classification: {
          requestClass: 'faq',
          targetResourceTypes: [],
          includeProgressionFollowUp: false,
        },
        requiresFaqGrounding: true,
        activeHospitalContext: null,
      },
      preTurn: {
        journeySnapshot: {
          currentStage: 'EXPLAIN_PROCESS',
          currentPhase: 'pre',
        },
        resources: [
          {
            resourceType: 'PROCESS_GUIDE',
            resourceId: 'process-guide:widget-chat:patient-1:case-1',
            status: 'available',
            visibility: { mode: 'global' },
            payload: {},
            actions: ['open'],
          },
        ],
        truthSummary: {
          medicalInputsSubmitted: false,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        stageCopy: null,
        requestClass: 'faq',
        responseIntent: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      userMessage: 'What do you do?',
    });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
  });

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
    const firstClassifierCall = difyClassifierApi.createChatMessage.mock.calls[0]?.[0];
    expect(firstClassifierCall.query).toBe('Why do we still need this step?');
    expect(firstClassifierCall.user).toBe('widget-chat:patient-1:case-1');
    expect(firstClassifierCall.inputs.recentMessages).toBe(JSON.stringify([
      { role: 'ASSISTANT', content: 'How can I help?' },
      { role: 'USER', content: 'I want to understand the options.' },
      { role: 'ASSISTANT', content: 'We can guide you step by step.' },
      { role: 'USER', content: 'Okay.' },
      { role: 'ASSISTANT', content: 'We are currently at the recommendation stage.' },
      { role: 'USER', content: 'Why do we still need this step?' },
    ]));
    expect(firstClassifierCall.inputs.conversationSummary).toBe('The patient is already discussing recommendation details.');
    expect(firstClassifierCall.inputs.journeySnapshot).toBe(JSON.stringify({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    }));
    expect(JSON.parse(firstClassifierCall.inputs.allowedResourceHints)).toEqual(expect.arrayContaining([
      {
        resourceType: 'PROCESS_GUIDE',
        description: 'Explains the consultation and treatment process.',
      },
      {
        resourceType: 'MEDICAL_INVITATION_STATUS',
        description: 'Lets the patient check the medical invitation status.',
      },
      {
        resourceType: 'QUESTIONNAIRE',
        description: 'Lets the patient fill in a medical intake questionnaire.',
      },
    ]));
    expect(services.aiChatMessageRepo.listBySession).not.toHaveBeenCalled();

    expect(result.preTurn.requestClass).toBe('process_explanation');
    expect(result.preTurn.responseIntent).toBe('faq');
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

    const secondClassifierCall = difyClassifierApi.createChatMessage.mock.calls[0]?.[0];
    expect(JSON.parse(secondClassifierCall.inputs.allowedResourceHints)).toEqual([
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
      {
        resourceType: 'ONLINE_CONSULT_BOOKING',
        description: 'Lets the patient book an online consultation.',
      },
    ]);
    expect(result.preTurn.requestClass).toBe('resource_request');
    expect(result.preTurn.responseIntent).toBe('process_explanation');
    expect(result.preTurn.targetResourceTypes).toEqual(['QUESTIONNAIRE']);
    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
    expect(result.preTurn.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'PROCESS_GUIDE' }),
    ]));
    expect(result.preTurn.resources).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'QUESTIONNAIRE' }),
      expect.objectContaining({ resourceType: 'MEDICAL_DOC_UPLOAD' }),
    ]));
  });

  it('lets an explicit intake resource request leave EXPLAIN_PROCESS only after a prior process explanation has been completed', async () => {
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
              visibility: { mode: 'global' },
              payload: { title: 'Understand the process' },
              actions: ['open'],
            },
          ],
        },
        chatbot_v2_floor: {
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
          allowed_resources: [
            {
              resource_type: 'PROCESS_GUIDE',
              resource_id: 'process-guide:widget-chat:patient-1:case-1',
              status: 'available',
              visibility: { mode: 'global' },
              payload: { title: 'Understand the process' },
              actions: ['open'],
            },
          ],
          request_class: 'process_explanation',
          response_intent: 'process_explanation',
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
      difyApi: { createChatMessage: vi.fn() },
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

    expect(result.preTurn.responseIntent).toBe('resource_request');
    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(result.preTurn.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'QUESTIONNAIRE' }),
    ]));
  });

  it('keeps the first process explanation mandatory by anchoring pure progression in EXPLAIN_PROCESS until a prior explain turn has been completed', async () => {
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
              visibility: { mode: 'global' },
              payload: { title: 'Understand the process' },
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
          targetResourceTypes: ['QUESTIONNAIRE', 'MEDICAL_DOC_UPLOAD'],
          includeProgressionFollowUp: false,
        }),
      }),
    };
    const services = {
      getAiPolicyContext,
      difyClassifierApi,
      difyApi: { createChatMessage: vi.fn() },
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
      userMessage: 'Before I upload anything, how long does this usually take?',
    });

    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
    expect(result.preTurn.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'PROCESS_GUIDE' }),
    ]));
  });

  it('lets a later pure progression leave EXPLAIN_PROCESS after a prior explain turn has already been persisted in chatbot_v2_floor', async () => {
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
              visibility: { mode: 'global' },
              payload: { title: 'Understand the process' },
              actions: ['open'],
            },
          ],
        },
        chatbot_v2_floor: {
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
          allowed_resources: [
            {
              resource_type: 'PROCESS_GUIDE',
              resource_id: 'process-guide:widget-chat:patient-1:case-1',
              status: 'available',
              visibility: { mode: 'global' },
              payload: { title: 'Understand the process' },
              actions: ['open'],
            },
          ],
          request_class: 'process_explanation',
          response_intent: 'faq',
        },
      }),
    };
    const difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'progression_request',
          targetResourceTypes: ['QUESTIONNAIRE', 'MEDICAL_DOC_UPLOAD'],
          includeProgressionFollowUp: false,
        }),
      }),
    };
    const services = {
      getAiPolicyContext,
      difyClassifierApi,
      difyApi: { createChatMessage: vi.fn() },
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
      userMessage: 'Okay, then what information do you need next?',
    });

    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
  });

  it('keeps explicit questionnaire and upload hints available even after the journey has moved past EXPLAIN_PROCESS', async () => {
    const getAiPolicyContext = {
      execute: vi.fn().mockResolvedValue({
        chatbot_v2: {
          scope_id: 'widget-chat:patient-1:case-1',
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'pre',
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

    await buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'Open the questionnaire for me.',
    });

    const classifierCall = difyClassifierApi.createChatMessage.mock.calls[0]?.[0];
    const allowedResourceHints = JSON.parse(classifierCall.inputs.allowedResourceHints);
    expect(allowedResourceHints).toEqual(expect.arrayContaining([
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
      {
        resourceType: 'ONLINE_CONSULT_BOOKING',
        description: 'Lets the patient book an online consultation.',
      },
    ]));
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
            medical_inputs_submitted: false,
            recommendation_confirmed: false,
            online_consult_submitted: false,
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

  it('prefers the current foundation journey snapshot over an older COLLECT_MEDICAL_INPUTS.post floor', async () => {
    const getAiPolicyContext = {
      execute: vi.fn().mockResolvedValue({
        conversation_summary: 'The patient has just submitted medical inputs.',
        chatbot_v2: {
          scope_id: 'widget-chat:patient-1:case-1',
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
          truth_summary: {
            medical_inputs_submitted: true,
            recommendation_confirmed: false,
            online_consult_submitted: false,
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
            {
              resource_type: 'HOSPITAL_RECOMMENDATION',
              resource_id: 'hospital-recommendation:widget-chat:patient-1:case-1',
              status: 'available',
              stage_binding: {
                stage: 'RECOMMENDATION',
                phase: 'active',
              },
              visibility: {
                mode: 'journey',
              },
              payload: {
                recommendationKind: 'hospital',
              },
              actions: ['open', 'submit'],
            },
          ],
        },
        chatbot_v2_floor: {
          journey_snapshot: {
            current_stage: 'COLLECT_MEDICAL_INPUTS',
            current_phase: 'post',
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
          request_class: 'faq',
          response_intent: 'faq',
        },
      }),
    };
    const difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'faq',
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
        findBySessionId: vi.fn().mockResolvedValue(null),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn(),
      },
    } as any;

    const result = await buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'Did you receive the questionnaire already?',
    });

    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    });
  });

  it('prefers the current foundation journey snapshot over an older RECOMMENDATION.post floor', async () => {
    const getAiPolicyContext = {
      execute: vi.fn().mockResolvedValue({
        conversation_summary: 'The recommendation has just been confirmed.',
        chatbot_v2: {
          scope_id: 'widget-chat:patient-1:case-1',
          journey_snapshot: {
            current_stage: 'ONLINE_CONSULT',
            current_phase: 'pre',
          },
          truth_summary: {
            medical_inputs_submitted: true,
            recommendation_confirmed: true,
            online_consult_submitted: false,
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
            {
              resource_type: 'ONLINE_CONSULT_BOOKING',
              resource_id: 'online-consult-booking:widget-chat:patient-1:case-1',
              status: 'available',
              stage_binding: {
                stage: 'ONLINE_CONSULT',
                phase: 'active',
              },
              visibility: {
                mode: 'journey',
              },
              payload: {
                title: 'Book an online consultation',
              },
              actions: ['open', 'submit'],
            },
          ],
        },
        chatbot_v2_floor: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'post',
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
          request_class: 'faq',
          response_intent: 'faq',
        },
      }),
    };
    const difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'faq',
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
        findBySessionId: vi.fn().mockResolvedValue(null),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn(),
      },
    } as any;

    const result = await buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'What happens after this recommendation?',
    });

    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'pre',
    });
  });

  it('prefers the current foundation journey snapshot over an older COLLECT_MEDICAL_INPUTS.post floor even when the journey has advanced further', async () => {
    const getAiPolicyContext = {
      execute: vi.fn().mockResolvedValue({
        conversation_summary: 'The team has moved quickly from intake review toward consult preparation.',
        chatbot_v2: {
          scope_id: 'widget-chat:patient-1:case-1',
          journey_snapshot: {
            current_stage: 'ONLINE_CONSULT',
            current_phase: 'pre',
          },
          truth_summary: {
            medical_inputs_submitted: true,
            recommendation_confirmed: true,
            online_consult_submitted: false,
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
            {
              resource_type: 'ONLINE_CONSULT_BOOKING',
              resource_id: 'online-consult-booking:widget-chat:patient-1:case-1',
              status: 'available',
              stage_binding: {
                stage: 'ONLINE_CONSULT',
                phase: 'active',
              },
              visibility: {
                mode: 'journey',
              },
              payload: {
                title: 'Book an online consultation',
              },
              actions: ['open', 'submit'],
            },
          ],
        },
        chatbot_v2_floor: {
          journey_snapshot: {
            current_stage: 'COLLECT_MEDICAL_INPUTS',
            current_phase: 'post',
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
          request_class: 'faq',
          response_intent: 'faq',
        },
      }),
    };
    const difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'faq',
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
        findBySessionId: vi.fn().mockResolvedValue(null),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn(),
      },
    } as any;

    const result = await buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'Before we move on, did you receive all my forms?',
    });

    expect(result.preTurn.journeySnapshot).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'pre',
    });
  });

  it('preserves a COLLECT_MEDICAL_INPUTS.post floor over truth-derived RECOMMENDATION.active until the post acknowledgement has been delivered', () => {
    const result = buildChatbotV2PostTurnContext({
      foundation: {
        scopeId: 'widget-chat:patient-1:case-1',
        journeySnapshot: {
          currentStage: 'COLLECT_MEDICAL_INPUTS',
          currentPhase: 'post',
        },
        truth: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        resources: [
          {
            resourceType: 'MEDICAL_INVITATION_STATUS',
            resourceId: 'medical-invitation-status:widget-chat:patient-1:case-1',
            status: 'available',
            visibility: { mode: 'global' },
            payload: {},
            actions: ['refresh'],
          },
        ],
        classification: {
          requestClass: 'faq',
          targetResourceTypes: [],
          includeProgressionFollowUp: false,
        },
        requiresFaqGrounding: true,
        activeHospitalContext: null,
      },
      preTurn: {
        journeySnapshot: {
          currentStage: 'COLLECT_MEDICAL_INPUTS',
          currentPhase: 'post',
        },
        resources: [
          {
            resourceType: 'MEDICAL_INVITATION_STATUS',
            resourceId: 'medical-invitation-status:widget-chat:patient-1:case-1',
            status: 'available',
            visibility: { mode: 'global' },
            payload: {},
            actions: ['refresh'],
          },
        ],
        truthSummary: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        requestClass: 'faq',
        responseIntent: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      userMessage: 'Did you receive everything?',
      refreshedStatusSnapshot: {
        recommendationStatus: 'AVAILABLE',
      },
    });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'post',
    });
  });

  it('preserves a RECOMMENDATION.post floor over truth-derived ONLINE_CONSULT.pre until the recommendation confirmation has been acknowledged', () => {
    const result = buildChatbotV2PostTurnContext({
      foundation: {
        scopeId: 'widget-chat:patient-1:case-1',
        journeySnapshot: {
          currentStage: 'RECOMMENDATION',
          currentPhase: 'post',
        },
        truth: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: true,
          onlineConsultSubmitted: false,
        },
        resources: [
          {
            resourceType: 'PROCESS_GUIDE',
            resourceId: 'process-guide:widget-chat:patient-1:case-1',
            status: 'available',
            visibility: { mode: 'global' },
            payload: {},
            actions: ['open'],
          },
        ],
        classification: {
          requestClass: 'faq',
          targetResourceTypes: [],
          includeProgressionFollowUp: false,
        },
        requiresFaqGrounding: true,
        activeHospitalContext: null,
      },
      preTurn: {
        journeySnapshot: {
          currentStage: 'RECOMMENDATION',
          currentPhase: 'post',
        },
        resources: [
          {
            resourceType: 'PROCESS_GUIDE',
            resourceId: 'process-guide:widget-chat:patient-1:case-1',
            status: 'available',
            visibility: { mode: 'global' },
            payload: {},
            actions: ['open'],
          },
        ],
        truthSummary: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: true,
          onlineConsultSubmitted: false,
        },
        requestClass: 'faq',
        responseIntent: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      userMessage: 'What happens after this?',
      refreshedStatusSnapshot: {
        recommendationStatus: 'CONFIRMED',
        consultationStatus: 'NOT_STARTED',
      },
    });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'post',
    });
  });

  it('preserves a COLLECT_MEDICAL_INPUTS.post floor over truth-derived ONLINE_CONSULT.pre until the intake acknowledgement has been delivered', () => {
    const result = buildChatbotV2PostTurnContext({
      foundation: {
        scopeId: 'widget-chat:patient-1:case-1',
        journeySnapshot: {
          currentStage: 'COLLECT_MEDICAL_INPUTS',
          currentPhase: 'post',
        },
        truth: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: true,
          onlineConsultSubmitted: false,
        },
        resources: [
          {
            resourceType: 'PROCESS_GUIDE',
            resourceId: 'process-guide:widget-chat:patient-1:case-1',
            status: 'available',
            visibility: { mode: 'global' },
            payload: {},
            actions: ['open'],
          },
        ],
        classification: {
          requestClass: 'faq',
          targetResourceTypes: [],
          includeProgressionFollowUp: false,
        },
        requiresFaqGrounding: true,
        activeHospitalContext: null,
      },
      preTurn: {
        journeySnapshot: {
          currentStage: 'COLLECT_MEDICAL_INPUTS',
          currentPhase: 'post',
        },
        resources: [
          {
            resourceType: 'PROCESS_GUIDE',
            resourceId: 'process-guide:widget-chat:patient-1:case-1',
            status: 'available',
            visibility: { mode: 'global' },
            payload: {},
            actions: ['open'],
          },
        ],
        truthSummary: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: true,
          onlineConsultSubmitted: false,
        },
        requestClass: 'faq',
        responseIntent: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      userMessage: 'Before we move on, did you receive all my forms?',
      refreshedStatusSnapshot: {
        recommendationStatus: 'CONFIRMED',
        consultationStatus: 'NOT_STARTED',
      },
    });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'post',
    });
  });

  it('does not apply progression advancement twice in the same turn when preTurn already moved into recommendation pre', () => {
    const result = buildChatbotV2PostTurnContext({
      foundation: {
        scopeId: 'widget-chat:patient-1:case-1',
        journeySnapshot: {
          currentStage: 'COLLECT_MEDICAL_INPUTS',
          currentPhase: 'post',
        },
        truth: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        resources: [
          {
            resourceType: 'HOSPITAL_RECOMMENDATION',
            resourceId: 'hospital-recommendation:widget-chat:patient-1:case-1',
            status: 'available',
            stageBinding: { stage: 'RECOMMENDATION', phase: 'active' },
            visibility: { mode: 'journey' },
            payload: {},
            actions: ['open', 'submit'],
          },
        ],
        classification: {
          requestClass: 'progression_request',
          targetResourceTypes: ['PROCESS_GUIDE'],
          includeProgressionFollowUp: false,
        },
        requiresFaqGrounding: false,
        activeHospitalContext: null,
      },
      preTurn: {
        journeySnapshot: {
          currentStage: 'RECOMMENDATION',
          currentPhase: 'pre',
        },
        resources: [
          {
            resourceType: 'HOSPITAL_RECOMMENDATION',
            resourceId: 'hospital-recommendation:widget-chat:patient-1:case-1',
            status: 'available',
            stageBinding: { stage: 'RECOMMENDATION', phase: 'active' },
            visibility: { mode: 'journey' },
            payload: {},
            actions: ['open', 'submit'],
          },
        ],
        truthSummary: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        requestClass: 'progression_request',
        responseIntent: 'progression_request',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: false,
      },
      userMessage: 'Can you open the questionnaire for me?',
    });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'pre',
    });
  });

  it('does not apply a second progression advancement in postTurn after preTurn already moved recommendation pre into active', () => {
    const result = buildChatbotV2PostTurnContext({
      foundation: {
        scopeId: 'widget-chat:patient-1:case-1',
        journeySnapshot: {
          currentStage: 'RECOMMENDATION',
          currentPhase: 'pre',
        },
        truth: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        resources: [
          {
            resourceType: 'HOSPITAL_RECOMMENDATION',
            resourceId: 'hospital-recommendation:widget-chat:patient-1:case-1',
            status: 'available',
            stageBinding: { stage: 'RECOMMENDATION', phase: 'active' },
            visibility: { mode: 'journey' },
            payload: {},
            actions: ['open', 'submit'],
          },
        ],
        classification: {
          requestClass: 'progression_request',
          targetResourceTypes: ['PROCESS_GUIDE'],
          includeProgressionFollowUp: false,
        },
        requiresFaqGrounding: false,
        activeHospitalContext: null,
      },
      preTurn: {
        journeySnapshot: {
          currentStage: 'RECOMMENDATION',
          currentPhase: 'active',
        },
        resources: [
          {
            resourceType: 'HOSPITAL_RECOMMENDATION',
            resourceId: 'hospital-recommendation:widget-chat:patient-1:case-1',
            status: 'available',
            stageBinding: { stage: 'RECOMMENDATION', phase: 'active' },
            visibility: { mode: 'journey' },
            payload: {},
            actions: ['open', 'submit'],
          },
        ],
        truthSummary: {
          medicalInputsSubmitted: true,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        requestClass: 'progression_request',
        responseIntent: 'progression_request',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: false,
      },
      userMessage: 'Can you open the questionnaire for me?',
    });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    });
  });

  it('keeps a handoff confirmation turn anchored at active before any explicit post-turn execution acknowledgement', () => {
    const result = buildChatbotV2PostTurnContext({
      foundation: {
        scopeId: 'widget-chat:patient-1:case-1',
        journeySnapshot: {
          currentStage: 'HUMAN_HANDOFF',
          currentPhase: 'pre',
        },
        truth: {
          medicalInputsSubmitted: false,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        resources: [
          {
            resourceType: 'HUMAN_HANDOFF',
            resourceId: 'human-handoff:widget-chat:patient-1:case-1',
            status: 'available',
            stageBinding: { stage: 'HUMAN_HANDOFF', phase: 'active' },
            visibility: { mode: 'global' },
            payload: {},
            actions: ['request_human'],
          },
        ],
        classification: {
          requestClass: 'progression_request',
          targetResourceTypes: [],
          includeProgressionFollowUp: false,
        },
        requiresFaqGrounding: false,
        activeHospitalContext: null,
      },
      preTurn: {
        journeySnapshot: {
          currentStage: 'HUMAN_HANDOFF',
          currentPhase: 'active',
        },
        resources: [
          {
            resourceType: 'HUMAN_HANDOFF',
            resourceId: 'human-handoff:widget-chat:patient-1:case-1',
            status: 'available',
            stageBinding: { stage: 'HUMAN_HANDOFF', phase: 'active' },
            visibility: { mode: 'global' },
            payload: {},
            actions: ['request_human'],
          },
        ],
        truthSummary: {
          medicalInputsSubmitted: false,
          recommendationConfirmed: false,
          onlineConsultSubmitted: false,
        },
        requestClass: 'progression_request',
        responseIntent: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      userMessage: 'Yes, please send my case to the administrator team now.',
    });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'active',
    });
  });
});
