import { describe, expect, it } from 'vitest';
import type {
  ChatbotV3ChatRequest,
} from '@medical-crm/validation';
import type {
  ConversationOrchestratorV3TurnResult,
} from './runtime.service.js';
import { composeResponse } from './response-composer.js';

function createRequest(
  overrides: Partial<ChatbotV3ChatRequest> = {},
): ChatbotV3ChatRequest {
  return {
    sessionId: 'session-1',
    message: 'Please help me',
    ...overrides,
  };
}

function createResult(
  overrides: Partial<ConversationOrchestratorV3TurnResult> = {},
): ConversationOrchestratorV3TurnResult {
  return {
    suggestion: {
      intent: 'progression',
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: 'baseline suggestion',
    },
    decision: {
      action: 'STAY',
      from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      dispatchSource: 'orchestrator',
    },
    journey: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
    dispatchResult: null,
    fallbackStatus: null,
    turnOutcome: {
      status: 'ok',
      recoverableErrorCode: null,
    },
    runtimeDebug: {
      traceId: 'trace-1',
      idempotencyKey: 'session-1:turn-1:chatbot-v3-turn',
    },
    ...overrides,
  };
}

describe('ResponseComposer', () => {
  it('composes faq answer from dispatch result instead of supervisor reason', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'How long does online consultation usually take to schedule?',
      }),
      result: createResult({
        suggestion: {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'focused faq retrieval query',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'orchestrator',
        },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'Online consultations are usually arranged within 24 hours.',
            citedFaqIds: ['faq-1'],
            confidence: 'high',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('Online consultations are usually arranged within 24 hours.');
    expect(response.messages[0]?.text).not.toContain('focused faq retrieval query');
    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'PROCESS_GUIDE',
      }),
    ]));
  });

  it('returns normal guidance when semantic handoff is denied by prerequisites', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'I want a human',
      }),
      result: createResult({
        suggestion: {
          intent: 'handoff',
          suggestedStage: 'HUMAN_HANDOFF',
          reason: 'user requested a human',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          dispatchSource: 'orchestrator',
        },
        journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      }),
      sessionStatusSnapshot: {
        docUploadStatus: 'none',
      },
    });

    expect(response.handoff.required).toBe(false);
    expect(response.messages[0]?.text).toContain('Before we connect you with a human');
    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
      }),
    ]));
  });

  it('keeps stage guidance when faq dispatch result is low-confidence without citations', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please explain the process.',
      }),
      result: createResult({
        suggestion: {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'fallback faq retrieval query',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'orchestrator',
        },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'I can help with that, but I could not find an exact FAQ answer yet for "Please explain the process.".',
            citedFaqIds: [],
            confidence: 'low',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('Here is the process');
    expect(response.messages[0]?.text).not.toContain('I could not find an exact FAQ answer yet');
  });
});
