import { describe, expect, it, vi } from 'vitest';
import {
  LlmRequestClassifierService,
  parseClassifierResult,
} from '../../chatbot-v2/llm-request-classifier.service.js';

describe('LlmRequestClassifierService', () => {
  it('passes normalized classifier input to the gateway', async () => {
    const gateway = {
      classify: vi.fn().mockResolvedValue({
        requestClass: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    };
    const service = new LlmRequestClassifierService(gateway);

    await service.classify({
      recentMessages: [
        {
          role: 'ASSISTANT',
          content: 'How can I help?',
        },
        {
          role: 'USER',
          content: 'Please explain the process.',
        },
      ],
      conversationSummary: 'The patient is exploring the journey.',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      allowedResourceHints: [
        {
          resourceType: 'PROCESS_GUIDE',
          description: 'Explains the treatment process.',
        },
      ],
    });

    expect(gateway.classify).toHaveBeenCalledOnce();
    expect(gateway.classify).toHaveBeenCalledWith({
      recentMessages: [
        {
          role: 'ASSISTANT',
          content: 'How can I help?',
        },
        {
          role: 'USER',
          content: 'Please explain the process.',
        },
      ],
      conversationSummary: 'The patient is exploring the journey.',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      allowedResourceHints: [
        {
          resourceType: 'PROCESS_GUIDE',
          description: 'Explains the treatment process.',
        },
      ],
    });
  });

  it('parses direct structured classifier results', async () => {
    const gateway = {
      classify: vi.fn().mockResolvedValue({
        requestClass: 'resource_request',
        targetResourceTypes: ['QUESTIONNAIRE'],
        includeProgressionFollowUp: false,
      }),
    };
    const service = new LlmRequestClassifierService(gateway);

    await expect(service.classify({
      recentMessages: [{
        role: 'USER',
        content: 'Open the questionnaire.',
      }],
      conversationSummary: '',
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      allowedResourceHints: [{
        resourceType: 'QUESTIONNAIRE',
        description: 'Lets the patient fill in a medical intake questionnaire.',
      }],
    })).resolves.toEqual({
      requestClass: 'resource_request',
      targetResourceTypes: ['QUESTIONNAIRE'],
      includeProgressionFollowUp: false,
    });
  });

  it('parses JSON results returned through the Dify answer field', () => {
    expect(parseClassifierResult({
      answer: JSON.stringify({
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: true,
      }),
    })).toEqual({
      requestClass: 'process_explanation',
      targetResourceTypes: ['PROCESS_GUIDE'],
      includeProgressionFollowUp: true,
    });
  });

  it('accepts progression requests that carry candidate next-step resources', () => {
    expect(parseClassifierResult({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: ['MEDICAL_DOC_UPLOAD', 'QUESTIONNAIRE'],
        includeProgressionFollowUp: false,
      }),
    })).toEqual({
      requestClass: 'progression_request',
      targetResourceTypes: ['MEDICAL_DOC_UPLOAD', 'QUESTIONNAIRE'],
      includeProgressionFollowUp: false,
    });
  });

  it('preserves multilingual faq turns as faq with no target resources', async () => {
    const gateway = {
      classify: vi.fn().mockResolvedValue({
        requestClass: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    };
    const service = new LlmRequestClassifierService(gateway);

    await expect(service.classify({
      recentMessages: [
        {
          role: 'ASSISTANT',
          content: 'Comment puis-je vous aider ?',
        },
        {
          role: 'USER',
          content: '我想了解一下你们的服务。',
        },
        {
          role: 'ASSISTANT',
          content: 'How can I help?',
        },
        {
          role: 'USER',
          content: '¿Qué incluye el proceso?',
        },
      ],
      conversationSummary: 'The patient is asking general service questions in multiple languages.',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      allowedResourceHints: [
        {
          resourceType: 'PROCESS_GUIDE',
          description: 'Explains the consultation and treatment process.',
        },
      ],
    })).resolves.toEqual({
      requestClass: 'faq',
      targetResourceTypes: [],
      includeProgressionFollowUp: false,
    });
  });

  it('preserves status questions for submitted resources', async () => {
    const gateway = {
      classify: vi.fn().mockResolvedValue({
        requestClass: 'resource_status_question',
        targetResourceTypes: ['MEDICAL_INVITATION_STATUS'],
        includeProgressionFollowUp: false,
      }),
    };
    const service = new LlmRequestClassifierService(gateway);

    await expect(service.classify({
      recentMessages: [{
        role: 'USER',
        content: 'Can you check the invitation status for me?',
      }],
      conversationSummary: 'The invitation was previously submitted.',
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      },
      allowedResourceHints: [{
        resourceType: 'MEDICAL_INVITATION_STATUS',
        description: 'Lets the patient check the medical invitation status.',
      }],
    })).resolves.toEqual({
      requestClass: 'resource_status_question',
      targetResourceTypes: ['MEDICAL_INVITATION_STATUS'],
      includeProgressionFollowUp: false,
    });
  });

  it('preserves human help requests even when the handoff resource is not present in hints', async () => {
    const gateway = {
      classify: vi.fn().mockResolvedValue({
        requestClass: 'human_help_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    };
    const service = new LlmRequestClassifierService(gateway);

    await expect(service.classify({
      recentMessages: [{
        role: 'USER',
        content: 'I need to talk to a person.',
      }],
      conversationSummary: '',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      allowedResourceHints: [{
        resourceType: 'PROCESS_GUIDE',
        description: 'Explains the consultation and treatment process.',
      }],
    })).resolves.toEqual({
      requestClass: 'human_help_request',
      targetResourceTypes: [],
      includeProgressionFollowUp: false,
    });
  });

  it('rejects invalid classifier result payloads', async () => {
    const gateway = {
      classify: vi.fn().mockResolvedValue({
        answer: '{"requestClass":"faq","targetResourceTypes":["PROCESS_GUIDE"],"includeProgressionFollowUp":false}',
      }),
    };
    const service = new LlmRequestClassifierService(gateway);

    await expect(service.classify({
      recentMessages: [{
        role: 'USER',
        content: 'How long does recovery take?',
      }],
      conversationSummary: '',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      allowedResourceHints: [],
    })).rejects.toThrow('Invalid classifier result payload');
  });
});
