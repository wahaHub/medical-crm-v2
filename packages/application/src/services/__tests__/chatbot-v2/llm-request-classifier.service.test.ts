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
