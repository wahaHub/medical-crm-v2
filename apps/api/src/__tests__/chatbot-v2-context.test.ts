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
        recentMessages: [
          { role: 'ASSISTANT', content: 'How can I help?' },
          { role: 'USER', content: 'I want to understand the options.' },
          { role: 'ASSISTANT', content: 'We can guide you step by step.' },
          { role: 'USER', content: 'Okay.' },
          { role: 'ASSISTANT', content: 'We are currently at the recommendation stage.' },
          { role: 'USER', content: 'Why do we still need this step?' },
        ],
        conversationSummary: 'The patient is already discussing recommendation details.',
        journeySnapshot: {
          currentStage: 'RECOMMENDATION',
          currentPhase: 'active',
        },
        allowedResourceHints: [
          {
            resourceType: 'PROCESS_GUIDE',
            description: 'Explains the consultation and treatment process.',
          },
        ],
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
        recentMessages: [
          { role: 'ASSISTANT', content: 'We can walk through the process.' },
          { role: 'USER', content: 'I want to keep going.' },
          { role: 'ASSISTANT', content: 'What would you like to do next?' },
          { role: 'USER', content: 'Okay, continue.' },
        ],
      }),
    }));
  });

  it('uses difyApi as the classifier transport fallback instead of reviving local rule-based classification', async () => {
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

    const result = await buildChatbotV2TurnContext({
      services,
      sessionId: 'widget-chat:patient-1:case-1',
      userMessage: 'How does this work?',
    });

    expect(services.difyApi.createChatMessage).toHaveBeenCalledOnce();
    expect(result.preTurn.requestClass).toBe('process_explanation');
    expect(result.preTurn.responseIntent).toBe('process_explanation');
  });
});
