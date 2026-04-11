import { describe, expect, it } from 'vitest';
import { RequestClassifierService } from '../../chatbot-v2/request-classifier.service.js';

describe('RequestClassifierService', () => {
  const service = new RequestClassifierService();

  function buildInput(userMessage: string, resolvedIntent?: string) {
    return {
      recentMessages: [{
        role: 'USER' as const,
        content: userMessage,
      }],
      conversationSummary: '',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS' as const,
        currentPhase: 'active' as const,
      },
      allowedResourceHints: [],
      userMessage,
      resolvedIntent,
    };
  }

  it('keeps the current compatibility bridge returning a structured result shape', () => {
    expect(service.classify(buildInput('Can you explain how the process works?'))).toEqual({
      requestClass: 'process_explanation',
      targetResourceTypes: ['PROCESS_GUIDE'],
      includeProgressionFollowUp: false,
    });
  });

  it('returns includeProgressionFollowUp=false for the compatibility fallback path', () => {
    expect(service.classify(buildInput('What should I know about recovery time?'))).toEqual({
      requestClass: 'faq',
      targetResourceTypes: [],
      includeProgressionFollowUp: false,
    });
  });

  it('still supports legacy resolvedIntent bridge callers until the LLM classifier replaces it', () => {
    expect(service.classify(buildInput('legacy bridge', 'REQUEST_HUMAN_HANDOFF'))).toEqual({
      requestClass: 'human_help_request',
      targetResourceTypes: ['HUMAN_HANDOFF'],
      includeProgressionFollowUp: false,
    });
  });
});
