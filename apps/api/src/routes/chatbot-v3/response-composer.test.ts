import { describe, expect, it } from 'vitest';
import type {
  ChatbotV3ChatRequest,
} from '@medical-crm/validation';
import type {
  ConversationOrchestratorV3TurnResult,
} from './runtime.service.js';
import {
  composeResponse,
  didShowExplicitProcessExplanation,
} from './response-composer.js';
import {
  DEGRADED_PATH_FIXTURES,
} from './__fixtures__/degraded-path.fixtures.js';

function getDegradedFixture(
  id: string,
) {
  const fixture = DEGRADED_PATH_FIXTURES.find((candidate) => candidate.id === id);
  expect(fixture).toBeDefined();
  return fixture!;
}

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
      dispatchSource: 'journey-runtime-authority',
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
    render: {
      path: 'STAGE_GUIDANCE',
    },
    ...overrides,
  };
}

describe('ResponseComposer', () => {
  it('keeps the degraded-path fixture set complete', () => {
    expect(DEGRADED_PATH_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'faq-degraded-timeout',
      'faq-low-confidence-answer',
      'recommendation-degraded-timeout',
      'consult-degraded-upstream',
      'handoff-denied-prerequisites',
    ]);
  });

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
          dispatchSource: 'journey-runtime-authority',
        },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'Online consultations are usually arranged within 24 hours.',
            citedFaqIds: ['faq-1'],
            confidence: 'high',
          },
        },
        render: {
          path: 'FAQ_ANSWER',
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
          dispatchSource: 'journey-runtime-authority',
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
          dispatchSource: 'journey-runtime-authority',
        },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'I can help with that, but I could not find an exact FAQ answer yet for "Please explain the process.".',
            citedFaqIds: [],
            confidence: 'low',
          },
        },
        render: {
          path: 'PROCESS_OVERVIEW',
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('Here is the process');
    expect(response.messages[0]?.text).not.toContain('I could not find an exact FAQ answer yet');
  });

  it('uses concise guidance copy for the minimal medical facts stage', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Here are my records.',
        attachments: [{
          fileName: 'report.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-1/report.pdf',
        }],
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
          reason: 'attachments were uploaded',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          dispatchAgent: 'RecordsAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).not.toContain('I checked');
    expect(response.messages[0]?.text).toContain('share');
  });

  it('surfaces RecordsAgent triage follow-up and the 3 key questions on incomplete minimal triage turns', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'What do you need from me first?',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
          reason: 'collect minimal triage details',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          dispatchAgent: 'RecordsAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            'records.minimal_triage.complete': false,
            questions: [
              'What is the main symptom, diagnosis, or medical problem right now?',
              'When did it start, how long has it been going on, and how severe is it?',
              'What tests, treatments, medicines, or diagnoses already exist?',
            ],
            followUp: 'Please answer these 3 questions so I can capture the essential medical details.',
            missing: ['symptom_or_diagnosis', 'duration_or_severity', 'existing_tests_or_treatments'],
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('Please answer these 3 questions');
    expect(response.messages[0]?.text).toContain('1. What is the main symptom');
    expect(response.messages[0]?.text).toContain('2. When did it start');
    expect(response.messages[0]?.text).toContain('3. What tests, treatments');
  });

  it('includes compact replay lineage in runtimeDebug when debug output is enabled', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please keep going.',
      }),
      result: createResult({
        runtimeDebug: {
          traceId: 'trace-lineage-1',
          idempotencyKey: 'session-1:turn-1:chatbot-v3-turn',
          lastDispatchSource: 'journey-runtime-authority',
          replayLineage: {
            matchedRuleId: 'rule-minimal-triage-complete',
            supervisorReadDomainRequests: [
              ['records.status', 'recommendation.status'],
              ['recommendation.status'],
            ],
            supervisorReadDomainsResolved: ['records.status', 'recommendation.status'],
            bootstrapOverride: 'attachments_to_minimal_triage',
          },
        } as any,
      }),
      sessionStatusSnapshot: null,
      includeRuntimeDebug: true,
    });

    expect(response.runtimeDebug).toMatchObject({
      traceId: 'trace-lineage-1',
      lastDispatchSource: 'journey-runtime-authority',
      replayLineage: {
        matchedRuleId: 'rule-minimal-triage-complete',
        supervisorReadDomainRequests: [
          ['records.status', 'recommendation.status'],
          ['recommendation.status'],
        ],
        supervisorReadDomainsResolved: ['records.status', 'recommendation.status'],
        bootstrapOverride: 'attachments_to_minimal_triage',
      },
    });
  });

  it('surfaces RecordsAgent collection prompts during the medical inputs stage', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'I can upload more reports.',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MEDICAL_INPUTS',
          reason: 'continue collecting documents',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          dispatchAgent: 'RecordsAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            'records.minimal_triage.complete': true,
            collectionPrompt: 'Please upload or share any pathology reports, imaging, blood tests, discharge summaries, medication lists, or treatment history you already have.',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('Please upload or share any pathology reports');
    expect(response.messages[0]?.text).not.toContain('I checked');
  });

  it('surfaces recommendation explanation text on recommendation turns', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Compare the hospitals for me.',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'RECOMMENDATION',
          reason: 'compare recommendations',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'RECOMMENDATION', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            recommendations: [
              {
                hospitalId: 'hospital-1',
                name: 'Shanghai Chest Hospital',
                reason: 'Thoracic oncology focus',
              },
            ],
            recommendationTask: 'compare',
            explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('These options can be compared');
    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
        payload: expect.objectContaining({
          candidates: [
            expect.objectContaining({
              hospitalId: 'hospital-1',
              name: 'Shanghai Chest Hospital',
            }),
          ],
        }),
      }),
    ]));
  });

  it('keeps generic recommendation guidance for non-compare recommendation turns', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'What should I do next?',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'RECOMMENDATION',
          reason: 'continue to recommendations',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'RECOMMENDATION', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            recommendations: [
              {
                hospitalId: 'hospital-1',
                name: 'Shanghai Chest Hospital',
                reason: 'Thoracic oncology focus',
              },
            ],
            recommendationTask: 'generate',
            explanation: 'These recommendations are grounded in the current hospital list and can be refreshed if you want different options later.',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('recommendation stage');
  });

  it('trusts the structured recommendationTask signal over the raw user message', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please explain the process.',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'RECOMMENDATION',
          reason: 'process already explained',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'RECOMMENDATION', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            recommendations: [
              {
                hospitalId: 'hospital-1',
                name: 'Shanghai Chest Hospital',
                reason: 'Thoracic oncology focus',
              },
            ],
            recommendationTask: 'explain',
            explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('These options can be compared');
  });

  it('exposes a structured process-explained signal for the explicit explain path', () => {
    expect(didShowExplicitProcessExplanation(createResult({
      render: {
        path: 'PROCESS_OVERVIEW',
      },
    }))).toBe(true);
  });

  it('does not expose the process-explained signal for faq answers that stay in explain stage', () => {
    expect(didShowExplicitProcessExplanation(createResult({
      render: {
        path: 'FAQ_ANSWER',
      },
    }))).toBe(false);
  });

  it('uses the render-path signal for process overview copy', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please explain the process.',
      }),
      result: createResult({
        render: {
          path: 'PROCESS_OVERVIEW',
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('Here is the process');
  });

  it('uses the render-path signal for faq answers', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'How long does online consultation usually take to schedule?',
      }),
      result: createResult({
        render: {
          path: 'FAQ_ANSWER',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
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
  });

  it('uses faq-specific degraded guidance for faq failures', () => {
    const fixture = getDegradedFixture('faq-degraded-timeout');

    const response = composeResponse({
      body: fixture.body,
      result: fixture.result,
      sessionStatusSnapshot: fixture.sessionStatusSnapshot,
    });

    expect(response.turnOutcome.status).toBe('degraded');
    expect(response.messages[0]?.text).toBe(
      'I could not load that FAQ answer just now, but your current stage is still saved. Please try asking again.',
    );
  });

  it('uses recommendation-specific degraded guidance for recommendation failures', () => {
    const fixture = getDegradedFixture('recommendation-degraded-timeout');

    const response = composeResponse({
      body: fixture.body,
      result: fixture.result,
      sessionStatusSnapshot: fixture.sessionStatusSnapshot,
    });

    expect(response.turnOutcome.status).toBe('degraded');
    expect(response.messages[0]?.text).toBe(
      'I could not refresh the hospital recommendations just now, but your current stage is still saved. Please try again in this chat.',
    );
  });

  it('prefers recommendation degraded guidance for recommendation revisits from online consult', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Show me the hospital recommendations again.',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'RECOMMENDATION',
          reason: 'revisit hospital recommendations',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'ONLINE_CONSULT', phase: 'active' },
          to: { stage: 'ONLINE_CONSULT', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'ONLINE_CONSULT', phase: 'active' },
        dispatchResult: {
          status: 'error',
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'recommendation.generate upstream unavailable',
        },
        turnOutcome: {
          status: 'degraded',
          recoverableErrorCode: 'UPSTREAM_UNAVAILABLE',
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.turnOutcome.status).toBe('degraded');
    expect(response.messages[0]?.text).toBe(
      'I could not refresh the hospital recommendations just now, but your current stage is still saved. Please try again in this chat.',
    );
  });

  it('uses consult-specific degraded guidance for consult failures', () => {
    const fixture = getDegradedFixture('consult-degraded-upstream');

    const response = composeResponse({
      body: fixture.body,
      result: fixture.result,
      sessionStatusSnapshot: fixture.sessionStatusSnapshot,
    });

    expect(response.turnOutcome.status).toBe('degraded');
    expect(response.messages[0]?.text).toBe(
      'I could not complete the consultation step just now, but your current stage is still saved. Please try again in this chat.',
    );
  });

  it('prefers consult degraded guidance when a consult failure happens before the stage flips', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please set up the consultation.',
      }),
      result: createResult({
        suggestion: {
          intent: 'consult',
          suggestedStage: 'RECOMMENDATION',
          reason: 'start consult booking',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'RECOMMENDATION', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'error',
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'consult.schedule upstream unavailable',
        },
        turnOutcome: {
          status: 'degraded',
          recoverableErrorCode: 'UPSTREAM_UNAVAILABLE',
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.turnOutcome.status).toBe('degraded');
    expect(response.messages[0]?.text).toBe(
      'I could not complete the consultation step just now, but your current stage is still saved. Please try again in this chat.',
    );
  });

  it('prefers consult degraded guidance when consult intent overlaps preserved recommendation context', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please book the consultation now.',
      }),
      result: createResult({
        suggestion: {
          intent: 'consult',
          suggestedStage: 'ONLINE_CONSULT',
          reason: 'user wants to proceed with consultation booking',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'RECOMMENDATION', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'error',
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'consult.schedule upstream unavailable',
        },
        turnOutcome: {
          status: 'degraded',
          recoverableErrorCode: 'UPSTREAM_UNAVAILABLE',
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.turnOutcome.status).toBe('degraded');
    expect(response.messages[0]?.text).toBe(
      'I could not complete the consultation step just now, but your current stage is still saved. Please try again in this chat.',
    );
  });

  it('does not relabel alternate-dispatch handoff turns as denied guidance', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'I want a human, but can you remind me how this works first?',
      }),
      result: createResult({
        suggestion: {
          intent: 'handoff',
          suggestedStage: 'HUMAN_HANDOFF',
          reason: 'user asked for a human and process clarification',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'RECOMMENDATION', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'Here is how the medical travel process works.',
            citedFaqIds: ['faq-process-1'],
            confidence: 'high',
          },
        },
        render: {
          path: 'FAQ_ANSWER',
        },
      }),
      sessionStatusSnapshot: {
        handoffStatus: 'not_needed',
      },
    });

    expect(response.turnOutcome.status).toBe('ok');
    expect(response.messages[0]?.text).toBe(
      'Here is how the medical travel process works.',
    );
    expect(response.messages[0]?.text).not.toContain('Before we connect you with a human');
  });

  it('keeps denied handoff guidance distinct from degraded failures', () => {
    const fixture = getDegradedFixture('handoff-denied-prerequisites');

    const response = composeResponse({
      body: fixture.body,
      result: fixture.result,
      sessionStatusSnapshot: fixture.sessionStatusSnapshot,
    });

    expect(response.turnOutcome.status).toBe('ok');
    expect(response.messages[0]?.text).toBe(
      'Before we connect you with a human, please complete the current step first.',
    );
    expect(response.messages[0]?.text).not.toContain('current stage is still saved');
  });

  it('does not relabel degraded handoff tool failures as denied guidance', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Connect me with a human now.',
      }),
      result: createResult({
        suggestion: {
          intent: 'handoff',
          suggestedStage: 'HUMAN_HANDOFF',
          reason: 'user requested a human',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'ONLINE_CONSULT', phase: 'active' },
          to: { stage: 'ONLINE_CONSULT', phase: 'active' },
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'ONLINE_CONSULT', phase: 'active' },
        dispatchResult: {
          status: 'error',
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'handoff.create upstream unavailable',
        },
        turnOutcome: {
          status: 'degraded',
          recoverableErrorCode: 'UPSTREAM_UNAVAILABLE',
        },
      }),
      sessionStatusSnapshot: {
        handoffStatus: 'not_needed',
      },
    });

    expect(response.turnOutcome.status).toBe('degraded');
    expect(response.messages[0]?.text).toBe(
      'I could not complete the requested step, but your v3 journey state is preserved.',
    );
    expect(response.messages[0]?.text).not.toContain('Before we connect you with a human');
  });

  it.each(DEGRADED_PATH_FIXTURES)('$id', (fixture) => {
    const response = composeResponse({
      body: fixture.body,
      result: fixture.result,
      sessionStatusSnapshot: fixture.sessionStatusSnapshot,
    });

    expect(response.turnOutcome.status).toBe(fixture.expected.turnOutcomeStatus);
    expect(response.handoff.required).toBe(fixture.expected.handoffRequired);
    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: fixture.expected.cardType,
      }),
    ]));
    expect(response.messages[0]?.text).toContain(fixture.expected.assistantTextContains);
    for (const omitted of fixture.expected.assistantTextOmits ?? []) {
      expect(response.messages[0]?.text).not.toContain(omitted);
    }
  });
});
