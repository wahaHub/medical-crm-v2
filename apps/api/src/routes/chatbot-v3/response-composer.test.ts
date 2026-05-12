import { describe, expect, it } from 'vitest';
import type {
  DomainSkillRequest,
} from '@medical-crm/application';
import type {
  ChatbotV3ChatRequest,
} from '@medical-crm/validation';
import type {
  ConversationOrchestratorV3TurnResult,
} from './runtime.service.js';
import {
  composeResponse,
  didShowExplicitProcessExplanation,
  buildAssistantText,
  PROCESS_OVERVIEW_TEXT,
} from './response-composer.js';
import { buildConversationSummaryPatch } from './runtime.service.js';
import {
  DEGRADED_PATH_FIXTURES,
} from './__fixtures__/degraded-path.fixtures.js';
import {
  checkMinimalContract,
  checkSkillBehavior,
} from './response-quality-checker.js';
import type {
  SkillBehaviorCheck,
} from './response-quality-checker.js';

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

  it('does not expose generic FAQ miss text when a skill-grounded pricing fallback exists', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'How much to see a pain specialist? I do not want to come if too expensive.',
      }),
      result: createResult({
        suggestion: {
          intent: 'faq',
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
          reason: 'pricing question during intake',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'Pricing depends on the hospital and doctor review. The online consultation is USD 400.',
            citedFaqIds: [],
            confidence: 'medium',
            policyGrounded: true,
          },
        },
        render: {
          path: 'FAQ_ANSWER',
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('USD 400');
    expect(response.messages[0]?.text).not.toContain('I could not find a reliable answer');
  });

  it('suppresses recommendation cards when faq detours cannot reconstruct the recommendation payload', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'What are your office hours?',
      }),
      result: createResult({
        suggestion: {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'faq answer stays on the persisted recommendation stage',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'RECOMMENDATION', phase: 'active' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'Our office hours are Monday to Friday, 9am to 6pm.',
            citedFaqIds: ['faq-hours-1'],
            confidence: 'high',
          },
        },
      }),
      sessionStatusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
      },
    });

    expect(response.journey).toEqual({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(response.cards).toEqual([]);
  });

  it('uses the persisted primary stage to compute upload counts for faq detours', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'What are your office hours?',
      }),
      result: createResult({
        suggestion: {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'faq answer should preserve the minimal intake stage',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'Our office hours are Monday to Friday, 9am to 6pm.',
            citedFaqIds: ['faq-hours-1'],
            confidence: 'high',
          },
        },
      }),
      sessionStatusSnapshot: {
        journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        journeyCurrentPhase: 'active',
        docUploadStatus: 'READY',
      },
    });

    expect(response.journey).toEqual({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
    expect(response.cards).toEqual([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
        payload: {
          required: true,
          uploadedCount: 1,
        },
      }),
    ]);
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

  it('renders an explicit FAQ miss instead of triage or upload guidance when the FAQ answer is unreliable', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Can I upload the scan now?',
      }),
      result: createResult({
        suggestion: {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'faq answer was not reliable',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: ' ',
            citedFaqIds: [],
            confidence: 'low',
          },
        },
        render: {
          path: 'FAQ_MISS' as any,
        },
      }),
      sessionStatusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
      },
    });

    expect(response.messages[0]?.text).toContain('reliable answer');
    expect(response.messages[0]?.text).not.toContain('3 follow-up questions');
    expect(response.messages[0]?.text).not.toContain('Please upload your diagnosis proof');
    expect(response.cards).toEqual([]);
    expect(response.journey).toEqual({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
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

  it('renders the repaired post-recommendation sequence copy before consult', () => {
    expect(PROCESS_OVERVIEW_TEXT).toContain('hospital recommendation');
    expect(PROCESS_OVERVIEW_TEXT).toContain('explain the Medora medical-travel process and policy');
    expect(PROCESS_OVERVIEW_TEXT).toContain('supporting documents');
    expect(PROCESS_OVERVIEW_TEXT).toContain('consult');
  });

  it('repairs vague RecordsAgent triage follow-up by rendering the actual question', () => {
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
            followUp: 'To help the doctors review your case and suggest next steps, please answer this brief question as clearly as you can.',
            missing: ['symptom_or_diagnosis', 'duration_or_severity', 'existing_tests_or_treatments'],
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('please answer this brief question');
    expect(response.messages[0]?.text).toContain('What is the main symptom, diagnosis, or medical problem right now?');
  });

  it('replaces RecordsAgent answer-format coaching with a natural nerve-pain follow-up', () => {
    const response = composeResponse({
      body: createRequest({
        message: "It gets worse when I sit but also when walking too long, so I don't know how to answer.",
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
          reason: 'collect minimal triage details',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          dispatchAgent: 'RecordsAgent',
          dispatchSource: 'journey-runtime-authority',
          agentTask: {
            agent: 'RecordsAgent',
            currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
            primaryStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
            latestUserMessage: "It gets worse when I sit but also when walking too long, so I don't know how to answer.",
            recentMessages: [{
              id: 'm-1',
              role: 'USER',
              content: 'I have this burning on my left leg, not like muscle pain, more like electric ants? It started after I fell maybe last year.',
              createdAt: '2026-05-01T00:00:00.000Z',
            }, {
              id: 'm-2',
              role: 'USER',
              content: 'Actually not fall, car door hit my knee, but the pain is now thigh to foot sometimes.',
              createdAt: '2026-05-01T00:01:00.000Z',
            }],
            mode: 'minimal_triage',
            minimalTriageComplete: false,
            loadedSkillSections: [],
            readIntents: [],
            retrievedContext: [],
          } as any,
        },
        journey: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            'records.minimal_triage.complete': false,
            questions: ['When did it start, how long has it been going on, and how severe is it?'],
            followUp: 'For example, you could write: "burning electric pain from left thigh to foot, worse when sitting or walking long."',
            missing: ['duration_or_severity', 'existing_tests_or_treatments'],
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('nerve-related leg pain');
    expect(response.messages[0]?.text).toContain('How severe does it get');
    expect(response.messages[0]?.text).not.toContain('For example');
    expect(response.messages[0]?.text).not.toContain('you could write');
  });

  it('does not invent leg-pain location or triggers when repairing RecordsAgent answer-format coaching', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'It is burning leg pain, I am not sure how to answer.',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
          reason: 'collect minimal triage details',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          dispatchAgent: 'RecordsAgent',
          dispatchSource: 'journey-runtime-authority',
          agentTask: {
            agent: 'RecordsAgent',
            currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
            primaryStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
            latestUserMessage: 'It is burning leg pain, I am not sure how to answer.',
            recentMessages: [],
            mode: 'minimal_triage',
            minimalTriageComplete: false,
            loadedSkillSections: [],
            readIntents: [],
            retrievedContext: [],
          } as any,
        },
        journey: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            'records.minimal_triage.complete': false,
            questions: ['How severe is it, and have you had any tests or treatments?'],
            followUp: 'For example, you could write: "burning electric pain from left thigh to foot, worse when sitting or walking long."',
            missing: ['duration_or_severity', 'existing_tests_or_treatments'],
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('nerve-related leg pain');
    expect(response.messages[0]?.text).toContain('How severe does it get');
    expect(response.messages[0]?.text).toContain('tests, medicines, or treatments');
    expect(response.messages[0]?.text).not.toContain('thigh to the foot');
    expect(response.messages[0]?.text).not.toContain('sitting or walking');
  });

  it('uses post-intake opening wording when the current turn has a triage status patch before persistence', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'What do you need from me first?',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
          reason: 'collect post-intake follow-up details',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
        writeIntents: {
          statusPatch: {
            minimalTriageStatus: 'pending',
            minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
            minimalTriageComplete: true,
          },
        } as any,
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('already received your basic intake');
    expect(response.messages[0]?.text).toContain('Please share the main symptom or diagnosis');
    expect(response.messages[0]?.text).not.toContain('share the key medical facts and any records you already have');
  });

  it('explains recommendations as based on intake plus the submitted follow-up summary when triage answers exist', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please recommend hospitals for me.',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'RECOMMENDATION',
          reason: 'show recommendation list',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            recommendations: [
              { hospitalId: 'hospital-1', name: 'Hospital 1', reason: 'Good fit' },
            ],
            recommendationTask: 'generate',
          },
        },
      }),
      sessionStatusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
      } as any,
    });

    expect(response.messages[0]?.text).toContain('based on your submitted intake and the follow-up medical details you just shared');
    expect(response.messages[0]?.text).not.toContain('intake alone');
  });

  it('explains recommendations as intake-only when follow-up triage was explicitly skipped', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please recommend hospitals for me.',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'RECOMMENDATION',
          reason: 'show recommendation list',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            recommendations: [
              { hospitalId: 'hospital-1', name: 'Hospital 1', reason: 'Good fit' },
            ],
            recommendationTask: 'generate',
          },
        },
      }),
      sessionStatusSnapshot: {
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
      } as any,
    });

    expect(response.messages[0]?.text).toContain('initial recommendation based on your submitted intake alone');
    expect(response.messages[0]?.text).toContain('refined later if you share more medical detail');
  });

  it('keeps the conversation summary on the same current-turn wording basis as the visible response', () => {
    const effectiveStatusSnapshot = {
      minimalTriageStatus: 'pending',
      minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
    } as any;
    const result = createResult({
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'show recommendation list',
      },
      decision: {
        action: 'ADVANCE',
        from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
        to: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchAgent: 'RecommendationAgent',
        dispatchSource: 'journey-runtime-authority',
      },
      journey: { stage: 'RECOMMENDATION', phase: 'active' },
      dispatchResult: {
        status: 'ok',
        data: {
          recommendations: [
            { hospitalId: 'hospital-1', name: 'Hospital 1', reason: 'Good fit' },
          ],
          recommendationTask: 'generate',
        },
      },
    });

    const visibleAssistantText = buildAssistantText(result, effectiveStatusSnapshot);
    const summaryPatch = buildConversationSummaryPatch({
      result,
      latestUserMessage: 'Please recommend hospitals for me.',
      summaryUpdatedAt: new Date('2026-04-18T00:00:00.000Z'),
      statusSnapshot: effectiveStatusSnapshot,
    });

    expect(visibleAssistantText).toContain('based on your submitted intake and the follow-up medical details you just shared');
    expect(summaryPatch.statusPatch.conversationSummary).toContain(`assistant=${visibleAssistantText}`);
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
            collectionPrompt: 'Please upload your diagnosis proof, diagnosis certificate, or another supporting diagnosis document so our medical team can prepare the next step.',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('diagnosis proof');
    expect(response.messages[0]?.text).not.toContain('treatment history');
    expect(response.messages[0]?.text).not.toContain('I checked');
  });

  it('uses diagnosis-proof guidance for the medical inputs stage even without a RecordsAgent collection prompt', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'What should I upload next?',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MEDICAL_INPUTS',
          reason: 'collect diagnosis proof',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('diagnosis proof');
    expect(response.messages[0]?.text).toContain('diagnosis certificate');
  });

  it('keeps the persisted primary journey stage visible during a revisit explanation turn', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please explain the process again.',
      }),
      result: createResult({
        suggestion: {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'revisit the process explanation',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'RECOMMENDATION', phase: 'post' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        render: {
          path: 'PROCESS_OVERVIEW',
        },
      }),
      sessionStatusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'post',
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [
          {
            path: 'uploads/supporting-doc-a.pdf',
            name: 'supporting-doc-a.pdf',
          },
        ],
      } as any,
    });

    expect(response.journey).toEqual({
      stage: 'RECOMMENDATION',
      phase: 'post',
    });
  });

  it('does not leak process overview copy when authority denies explain-process progression', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please explain the process.',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'show the process again without a fresh request',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'RECOMMENDATION', phase: 'post' },
          to: { stage: 'RECOMMENDATION', phase: 'post' },
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'post' },
      }),
      sessionStatusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'post',
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      } as any,
    });

    expect(response.messages[0]?.text).not.toBe(PROCESS_OVERVIEW_TEXT);
    expect(response.messages[0]?.text).toContain('hospital options');
    expect(response.messages[0]?.text).not.toContain('recommendation stage');
  });

  it('does not leak process overview copy when an explain-process denial stays on EXPLAIN_PROCESS', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Please explain the process again.',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'show the process again without a fresh request',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      }),
      sessionStatusSnapshot: {
        journeyCurrentStage: 'EXPLAIN_PROCESS',
        journeyCurrentPhase: 'active',
        processExplained: true,
      } as any,
    });

    expect(response.messages[0]?.text).not.toBe(PROCESS_OVERVIEW_TEXT);
    expect(response.messages[0]?.text).toContain('Medora process');
    expect(response.messages[0]?.text).not.toContain('explain process stage');
  });

  it('keeps supporting-document guidance ahead of consult copy when consult is denied for missing documents', () => {
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
          from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      }),
      sessionStatusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      } as any,
    });

    expect(response.messages[0]?.text).not.toContain('online consultation stage');
    expect(response.messages[0]?.text).toContain('diagnosis proof');
    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
      }),
    ]));
  });

  it('does not leak consult copy when supporting documents exist but the authoritative journey stays on COLLECT_MEDICAL_INPUTS', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Can I already book the consultation?',
      }),
      result: createResult({
        suggestion: {
          intent: 'consult',
          suggestedStage: 'ONLINE_CONSULT',
          reason: 'user asked whether the consult can start now',
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
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [{
          path: 'chatbot/session-1/report.pdf',
          name: 'report.pdf',
        }],
      } as any,
    });

    expect(response.messages[0]?.text).not.toContain('online consultation stage');
    expect(response.messages[0]?.text).toContain('diagnosis proof');
  });

  it('counts the first supporting document from the persisted COLLECT_MEDICAL_INPUTS snapshot', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'I uploaded my first supporting document.',
        attachments: [{
          fileName: 'report-a.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-1/report-a.pdf',
        }],
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MEDICAL_INPUTS',
          reason: 'collect diagnosis proof',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          dispatchAgent: 'RecordsAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      }),
      sessionStatusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [{
          path: 'uploads/report-a.pdf',
          name: 'report-a.pdf',
        }],
      } as any,
    });

    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
        payload: expect.objectContaining({
          uploadedCount: 1,
          required: true,
        }),
      }),
    ]));
  });

  it('counts repeated supporting documents from the persisted list instead of the current turn attachment only', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'I uploaded a second supporting document.',
        attachments: [{
          fileName: 'report-b.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-1/report-b.pdf',
        }],
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MEDICAL_INPUTS',
          reason: 'collect diagnosis proof',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          dispatchAgent: 'RecordsAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      }),
      sessionStatusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [
          {
            path: 'uploads/report-a.pdf',
            name: 'report-a.pdf',
          },
          {
            path: 'uploads/report-b.pdf',
            name: 'report-b.pdf',
          },
        ],
      } as any,
    });

    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
        payload: expect.objectContaining({
          uploadedCount: 2,
          required: true,
        }),
      }),
    ]));
  });

  it('does not let stale pre-stage upload residue count as diagnosis-proof completion on stage entry', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'What should I do next?',
      }),
      result: createResult({
        suggestion: {
          intent: 'progression',
          suggestedStage: 'COLLECT_MEDICAL_INPUTS',
          reason: 'collect diagnosis proof',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'RECOMMENDATION', phase: 'active' },
          to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        writeIntents: {
          statusPatch: {
            docUploadStatus: 'none',
          },
        } as any,
      }),
      sessionStatusSnapshot: {
        docUploadStatus: 'submitted',
        formStatus: 'completed',
      } as any,
    });

    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
        payload: expect.objectContaining({
          uploadedCount: 0,
          required: true,
        }),
      }),
    ]));
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
            explanation: 'These options can be compared by condition fit, location, public/private preference, records readiness, timing, and language or follow-up support needs.',
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
        actions: [
          expect.objectContaining({
            actionType: 'SUBMIT',
            label: 'Select Shanghai Chest Hospital',
            params: {
              hospitalId: 'hospital-1',
            },
          }),
          expect.objectContaining({
            actionType: 'SUBMIT',
            label: 'Continue without selecting a hospital',
            params: {
              actionKey: 'RECOMMENDATION_SKIPPED',
            },
          }),
        ],
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

    expect(response.messages[0]?.text).toContain('These recommendations are grounded in the current hospital list');
    expect(response.messages[0]?.text).not.toContain('recommendation stage');
  });

  it('does not render generic hospital recommendation fallback for a direct doctor request', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Can you just recommend a doctor for nerve pain? I do not know what department, maybe bone?',
      }),
      result: createResult({
        suggestion: {
          intent: 'resource',
          suggestedStage: 'RECOMMENDATION',
          reason: 'user asked for doctor recommendation',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
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
                name: 'Shanghai Hospital',
                reason: 'Neurology and spine-related care',
              },
            ],
            recommendationTask: 'generate',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('specific doctor recommendation');
    expect(response.messages[0]?.text).toContain('records');
    expect(response.messages[0]?.text).not.toContain('These recommendations are grounded');
    expect(response.cards).toEqual([]);
  });

  it.each([
    'Can you recommend the best neurologist?',
    'Which spine surgeon should I see?',
    '请帮我推荐神经科专家',
  ])('suppresses recommendation cards for direct provider matching wording: %s', (message) => {
    const response = composeResponse({
      body: createRequest({ message }),
      result: createResult({
        suggestion: {
          intent: 'resource',
          suggestedStage: 'RECOMMENDATION',
          reason: 'user asked for provider matching',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            recommendations: [{
              hospitalId: 'hospital-1',
              name: 'Shanghai Hospital',
              reason: 'Neurology and spine-related care',
            }],
            recommendationTask: 'generate',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('specific doctor recommendation');
    expect(response.cards).toEqual([]);
  });

  it('keeps normal hospital recommendation cards for hospital matching wording', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Which hospital is best for nerve pain?',
      }),
      result: createResult({
        suggestion: {
          intent: 'resource',
          suggestedStage: 'RECOMMENDATION',
          reason: 'user asked for hospital recommendation',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            recommendations: [{
              hospitalId: 'hospital-1',
              name: 'Shanghai Hospital',
              reason: 'Neurology and spine-related care',
            }],
            recommendationTask: 'generate',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
  });

  it('keeps hospital recommendation cards when the user asks Medora team to find a hospital', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'Can your team recommend a hospital for nerve pain?',
      }),
      result: createResult({
        suggestion: {
          intent: 'resource',
          suggestedStage: 'RECOMMENDATION',
          reason: 'user asked for hospital recommendation',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'RecommendationAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchResult: {
          status: 'ok',
          data: {
            recommendations: [{
              hospitalId: 'hospital-1',
              name: 'Shanghai Hospital',
              reason: 'Neurology and spine-related care',
            }],
            recommendationTask: 'generate',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).not.toContain('specific doctor recommendation');
    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
  });

  it('does not expose recommendation submit actions when no candidates are available', () => {
    const response = composeResponse({
      body: createRequest({
        message: 'What are my options?',
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
            recommendations: [],
            recommendationTask: 'generate',
            explanation: 'No recommendation candidates are currently available.',
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
        payload: expect.objectContaining({
          candidates: [],
        }),
        actions: [],
      }),
    ]));
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
            explanation: 'These options can be compared by condition fit, location, public/private preference, records readiness, timing, and language or follow-up support needs.',
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

    expect(response.messages[0]?.text).toBe(PROCESS_OVERVIEW_TEXT);
    expect(response.messages[0]?.text).toContain('review the hospital recommendation');
    expect(response.messages[0]?.text).toContain('supporting documents');
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

  it('renders policy-grounded redirect answers even without FAQ citations', () => {
    const response = composeResponse({
      body: createRequest({
        message: '你们能不能帮我办美国绿卡？',
      }),
      result: createResult({
        render: {
          path: 'FAQ_ANSWER',
        },
        decision: {
          action: 'STAY',
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
        },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'That request is outside Medora scope, but I can help with care in China.',
            citedFaqIds: [],
            confidence: 'medium',
            policyGrounded: true,
          },
        },
      }),
      sessionStatusSnapshot: null,
    });

    expect(response.messages[0]?.text).toContain('outside Medora scope');
    expect(response.messages[0]?.text).not.toContain('could not find a reliable answer');
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
      'I could not load that answer just now. Please try asking again, or ask in a simpler way.',
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
      'I could not refresh the hospital recommendations just now. Please try again in this chat.',
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
      'I could not refresh the hospital recommendations just now. Please try again in this chat.',
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
      'I could not complete the consultation step just now. Please try again in this chat.',
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
      'I could not complete the consultation step just now. Please try again in this chat.',
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
      'I could not complete the consultation step just now. Please try again in this chat.',
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
      'I could not complete that request just now. Please try again, or ask for a human coordinator if needed.',
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

describe('ResponseQualityChecker', () => {
  const pricingSectionHint = {
    eventType: 'USER_ASKED_QUESTION',
    target: 'pricing',
    modifier: 'ask',
    primaryActionType: 'ANSWER',
  } as const;
  const policySection = {
    skillId: 'policy_skill',
    role: 'primary',
    reasonCode: 'policy_question',
    sectionIds: ['insurance_claims_boundary', 'online_consultation_fee'],
    readIntentTypes: [],
    policyText: [
      'Medora does not handle, submit, manage, follow up, guarantee reimbursement, approve coverage, or provide direct billing approval for insurance claims.',
      'The online consultation fee is USD 400, is kept if the user does not come, and is applied toward treatment cost if the user comes.',
    ],
    retrievalGuidance: [],
    handlingGuidance: ['Keep insurance and online consultation fee boundaries clear.'],
  } as const;

  it('accepts and preserves follow-up action types from real domain skill section hints', () => {
    const sectionHint: DomainSkillRequest['sectionHints'] = {
      eventType: 'USER_RESPONDED_TO_REQUEST',
      target: 'treatment',
      modifier: 'confirm',
      primaryActionType: 'HANDLE_RESPONSE',
      followUpActionType: 'REQUEST_RECORDS',
    };

    const checks = checkSkillBehavior(
      'Thanks, we can use those records to prepare the next step.',
      [{
        skillId: 'treatment_skill',
        role: 'auxiliary',
        reasonCode: 'documents_uploaded',
        sectionIds: ['documents_uploaded'],
        readIntentTypes: ['RECORD_REQUIREMENTS'],
        policyText: ['Acknowledge records without pressure.'],
        retrievalGuidance: [],
        handlingGuidance: [],
      }],
      {
        sectionHints: {
          treatment_skill: sectionHint,
        },
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'documents_pressure_after_rejection',
      sectionHint,
    }));
  });

  it('fails max_questions when the response has more questions than the contract allows', () => {
    const checks = checkMinimalContract(
      'What diagnosis are you considering? When did symptoms start?',
      {
        constraints: {
          maxQuestions: 1,
          avoidMultipleCTAs: false,
        },
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'max_questions',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('fails answer_before_ask when the response starts with a CTA before answering', () => {
    const checks = checkMinimalContract(
      'Please upload your records now. Pricing depends on diagnosis, hospital, and treatment plan.',
      {
        constraints: {
          maxQuestions: 1,
          answerBeforeAsk: true,
          avoidMultipleCTAs: true,
        },
        forbiddenClaims: [],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'answer_before_ask',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('passes answer_before_ask when the response answers before asking', () => {
    const checks = checkMinimalContract(
      'Pricing depends on diagnosis, hospital, and treatment plan. Please upload your records now.',
      {
        constraints: {
          maxQuestions: 1,
          answerBeforeAsk: true,
          avoidMultipleCTAs: true,
        },
        forbiddenClaims: [],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'answer_before_ask',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('fails multiple_ctas when the contract forbids multiple CTA-ish asks', () => {
    const checks = checkMinimalContract(
      'Please upload your records now. Also book a consult today so we can continue.',
      {
        constraints: {
          maxQuestions: 2,
          avoidMultipleCTAs: true,
        },
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'multiple_ctas',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('passes multiple_ctas for one overlapping CTA when the contract forbids multiple asks', () => {
    const checks = checkMinimalContract(
      'Please upload your records now.',
      {
        constraints: {
          maxQuestions: 1,
          avoidMultipleCTAs: true,
        },
        forbiddenClaims: [],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'multiple_ctas',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('fails multiple_ctas for two CTA verbs in one sentence', () => {
    const checks = checkMinimalContract(
      'Please upload your records now and book a consult today.',
      {
        constraints: {
          maxQuestions: 1,
          avoidMultipleCTAs: true,
        },
        forbiddenClaims: [],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'multiple_ctas',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('uses observed severity instead of info for passing deterministic contract checks', () => {
    const checks = checkMinimalContract(
      'We can explain the process and review your details first.',
      {
        constraints: {
          maxQuestions: 1,
          avoidMultipleCTAs: true,
        },
        forbiddenClaims: [],
      },
    );

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'max_questions',
        result: 'pass',
        severity: 'observed',
      }),
      expect.objectContaining({
        id: 'multiple_ctas',
        result: 'pass',
        severity: 'observed',
      }),
    ]));
    expect(checks).not.toContainEqual(expect.objectContaining({
      severity: 'info',
    }));
  });

  it('fails preserve-stage language when the primary stage must be preserved', () => {
    const checks = checkMinimalContract(
      'I answered your pricing question and moved you to the recommendation stage.',
      {
        constraints: {
          maxQuestions: 1,
          avoidMultipleCTAs: true,
        },
        forbiddenClaims: [],
      },
      {
        preservePrimaryStage: true,
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'preserve_stage_language',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('uses the response contract preservePrimaryStage constraint for preserve-stage language', () => {
    const checks = checkMinimalContract(
      'I answered your pricing question and moved you to the recommendation stage.',
      {
        constraints: {
          maxQuestions: 1,
          avoidMultipleCTAs: true,
          preservePrimaryStage: true,
        },
        forbiddenClaims: [],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'preserve_stage_language',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('allows llm_judge skill behavior evaluators in the result type', () => {
    const check: SkillBehaviorCheck = {
      id: 'llm-reviewed-boundary',
      skillId: 'medical_advice_skill',
      sectionHint: {
        eventType: 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
        target: 'unknown',
        modifier: 'ask',
        primaryActionType: 'REDIRECT',
      },
      evaluator: 'llm_judge',
      severity: 'soft',
      result: 'warn',
    };

    expect(check.evaluator).toBe('llm_judge');
  });

  it('fails forbidden claims when the response contains a forbidden phrase', () => {
    const checks = checkMinimalContract(
      'We guarantee a cure after this process.',
      {
        constraints: {
          maxQuestions: 1,
          avoidMultipleCTAs: true,
        },
        forbiddenClaims: ['guarantee a cure'],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'forbidden_claim',
      result: 'fail',
      severity: 'hard',
      reason: expect.stringContaining('guarantee a cure'),
    }));
  });

  it('fails hard for pricing_skill when the response gives an unsupported fixed price', () => {
    const checks = checkSkillBehavior(
      'The package is a $10,000 guaranteed fixed price.',
      [{
        skillId: 'pricing_skill',
        role: 'primary',
        reasonCode: 'pricing_question',
        sectionIds: ['pricing_uncertainty'],
        readIntentTypes: ['PRICING_FACTORS'],
        policyText: ['Explain pricing factors without promising a fixed total.'],
        retrievalGuidance: [],
        handlingGuidance: ['Do not give guaranteed fixed prices.'],
      }],
      {
        sectionHints: {
          pricing_skill: pricingSectionHint,
        },
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'pricing_unsupported_fixed_price',
      skillId: 'pricing_skill',
      sectionHint: pricingSectionHint,
      evaluator: 'deterministic',
      severity: 'hard',
      result: 'fail',
    }));
  });

  it('treats pricing uncertainty disclaimers as observed while still failing guaranteed fixed prices', () => {
    const section = {
      skillId: 'pricing_skill',
      role: 'primary',
      reasonCode: 'pricing_question',
      sectionIds: ['pricing_uncertainty'],
      readIntentTypes: ['PRICING_FACTORS'],
      policyText: ['Explain pricing factors without promising a fixed total.'],
      retrievalGuidance: [],
      handlingGuidance: ['Do not give guaranteed fixed prices.'],
    } as const;

    const safeChecks = checkSkillBehavior(
      'We cannot give a fixed price before review, but we can explain the factors that affect cost.',
      [section],
      {
        sectionHints: {
          pricing_skill: pricingSectionHint,
        },
      },
    );
    const unsafeChecks = checkSkillBehavior(
      'The package is a $10,000 guaranteed fixed price.',
      [section],
      {
        sectionHints: {
          pricing_skill: pricingSectionHint,
        },
      },
    );

    expect(safeChecks).toContainEqual(expect.objectContaining({
      id: 'pricing_unsupported_fixed_price',
      result: 'pass',
      severity: 'observed',
      sectionHint: pricingSectionHint,
    }));
    expect(unsafeChecks).toContainEqual(expect.objectContaining({
      id: 'pricing_unsupported_fixed_price',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('fails pricing when the response states an unsupported fixed dollar price', () => {
    const checks = checkSkillBehavior(
      'The treatment will cost $10,000.',
      [{
        skillId: 'pricing_skill',
        role: 'primary',
        reasonCode: 'pricing_question',
        sectionIds: ['pricing_uncertainty'],
        readIntentTypes: ['PRICING_FACTORS'],
        policyText: ['Explain pricing factors without promising a fixed total.'],
        retrievalGuidance: [],
        handlingGuidance: ['Do not give guaranteed fixed prices.'],
      }],
      {
        sectionHints: {
          pricing_skill: pricingSectionHint,
        },
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'pricing_unsupported_fixed_price',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('allows negated fixed-price guidance while still failing fixed-price promises', () => {
    const section = {
      skillId: 'pricing_skill',
      role: 'primary',
      reasonCode: 'pricing_question',
      sectionIds: ['pricing_uncertainty'],
      readIntentTypes: ['PRICING_FACTORS'],
      policyText: ['Explain pricing factors without promising a fixed total.'],
      retrievalGuidance: [],
      handlingGuidance: ['Do not give guaranteed fixed prices.'],
    } as const;

    const safeOfferChecks = checkSkillBehavior(
      'We do not offer a fixed price because final cost depends on the hospital and treatment plan.',
      [section],
      {
        sectionHints: {
          pricing_skill: pricingSectionHint,
        },
      },
    );
    const safeStatementChecks = checkSkillBehavior(
      'This is not a fixed price; it is only a rough estimate until doctors review the case.',
      [section],
      {
        sectionHints: {
          pricing_skill: pricingSectionHint,
        },
      },
    );
    const unsafeChecks = checkSkillBehavior(
      'We can offer a fixed price for the full treatment package.',
      [section],
      {
        sectionHints: {
          pricing_skill: pricingSectionHint,
        },
      },
    );

    expect(safeOfferChecks).toContainEqual(expect.objectContaining({
      id: 'pricing_unsupported_fixed_price',
      result: 'pass',
      severity: 'observed',
    }));
    expect(safeStatementChecks).toContainEqual(expect.objectContaining({
      id: 'pricing_unsupported_fixed_price',
      result: 'pass',
      severity: 'observed',
    }));
    expect(unsafeChecks).toContainEqual(expect.objectContaining({
      id: 'pricing_unsupported_fixed_price',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('allows fixed-price boundary language before doctors review records', () => {
    const checks = checkSkillBehavior(
      'We cannot provide a fixed price before doctors review your records.',
      [{
        skillId: 'pricing_skill',
        role: 'primary',
        reasonCode: 'pricing_question',
        sectionIds: ['pricing_uncertainty'],
        readIntentTypes: ['PRICING_FACTORS'],
        policyText: ['Explain pricing factors without promising a fixed total.'],
        retrievalGuidance: [],
        handlingGuidance: ['Do not give guaranteed fixed prices.'],
      }],
      {
        sectionHints: {
          pricing_skill: pricingSectionHint,
        },
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'pricing_unsupported_fixed_price',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('fails pricing when a disclaimer is followed by a guaranteed fixed price', () => {
    const checks = checkSkillBehavior(
      'We cannot give a fixed price before review. After that, the package is a $10,000 guaranteed fixed price.',
      [{
        skillId: 'pricing_skill',
        role: 'primary',
        reasonCode: 'pricing_question',
        sectionIds: ['pricing_uncertainty'],
        readIntentTypes: ['PRICING_FACTORS'],
        policyText: ['Explain pricing factors without promising a fixed total.'],
        retrievalGuidance: [],
        handlingGuidance: ['Do not give guaranteed fixed prices.'],
      }],
      {
        sectionHints: {
          pricing_skill: pricingSectionHint,
        },
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'pricing_unsupported_fixed_price',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('fails policy_skill when the response claims Medora handles insurance claims or reimbursement', () => {
    const checks = checkSkillBehavior(
      'Medora will submit your insurance claim, follow up with your insurer, and guarantee reimbursement approval.',
      [policySection],
    );

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'policy_insurance_claims_boundary',
        skillId: 'policy_skill',
        evaluator: 'deterministic',
        severity: 'hard',
        result: 'fail',
      }),
    ]));
  });

  it('allows policy_skill insurance boundary language for insurer claims and neutral documents', () => {
    const checks = checkSkillBehavior(
      'For claims, coverage, and reimbursement, please contact your insurer directly. Medora can organize neutral hospital documents and ask the hospital about medical liability insurance.',
      [policySection],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'policy_insurance_claims_boundary',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('allows policy_skill insurance disclaimers that deny direct billing approval', () => {
    const cannotChecks = checkSkillBehavior(
      'Medora cannot provide direct billing approval for insurance claims.',
      [policySection],
    );
    const doesNotChecks = checkSkillBehavior(
      'Medora does not provide direct billing approval for insurance claims.',
      [policySection],
    );

    expect(cannotChecks).toContainEqual(expect.objectContaining({
      id: 'policy_insurance_claims_boundary',
      result: 'pass',
      severity: 'observed',
    }));
    expect(doesNotChecks).toContainEqual(expect.objectContaining({
      id: 'policy_insurance_claims_boundary',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('fails policy_skill when the response promises insurance claims support', () => {
    const supportChecks = checkSkillBehavior(
      'Medora can support your insurance claim.',
      [policySection],
    );
    const genericSupportChecks = checkSkillBehavior(
      'Medora can provide claims support.',
      [policySection],
    );
    const helpChecks = checkSkillBehavior(
      'Medora can help with your insurance claims.',
      [policySection],
    );
    const helpYouChecks = checkSkillBehavior(
      'Medora can help you with insurance claims.',
      [policySection],
    );
    const safeSupportDenialChecks = checkSkillBehavior(
      'Medora does not provide claims support.',
      [policySection],
    );

    expect(supportChecks).toContainEqual(expect.objectContaining({
      id: 'policy_insurance_claims_boundary',
      result: 'fail',
      severity: 'hard',
    }));
    expect(genericSupportChecks).toContainEqual(expect.objectContaining({
      id: 'policy_insurance_claims_boundary',
      result: 'fail',
      severity: 'hard',
    }));
    expect(helpChecks).toContainEqual(expect.objectContaining({
      id: 'policy_insurance_claims_boundary',
      result: 'fail',
      severity: 'hard',
    }));
    expect(helpYouChecks).toContainEqual(expect.objectContaining({
      id: 'policy_insurance_claims_boundary',
      result: 'fail',
      severity: 'hard',
    }));
    expect(safeSupportDenialChecks).toContainEqual(expect.objectContaining({
      id: 'policy_insurance_claims_boundary',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('fails policy_skill when the online consultation fee is described as free, refundable, or optional before standard China travel', () => {
    const checks = checkSkillBehavior(
      'The USD 400 online consultation is free and refundable if you do not come, and it is not required before China travel.',
      [policySection],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'policy_online_consultation_fee_boundary',
      skillId: 'policy_skill',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('allows policy_skill online consultation fee boundary language', () => {
    const checks = checkSkillBehavior(
      'The online consultation fee is USD 400. It is kept if you do not come, and applied toward treatment cost if you come.',
      [policySection],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'policy_online_consultation_fee_boundary',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('allows policy_skill online consultation fee negations', () => {
    const notRefundableChecks = checkSkillBehavior(
      'The online consultation fee is USD 400 and is not refundable if you do not come.',
      [policySection],
    );
    const notFreeChecks = checkSkillBehavior(
      'The online consultation is not free; the fee is USD 400.',
      [policySection],
    );

    expect(notRefundableChecks).toContainEqual(expect.objectContaining({
      id: 'policy_online_consultation_fee_boundary',
      result: 'pass',
      severity: 'observed',
    }));
    expect(notFreeChecks).toContainEqual(expect.objectContaining({
      id: 'policy_online_consultation_fee_boundary',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('fails hard for treatment_skill rejection or hesitation handling when the response pressures upload', () => {
    const checks = checkSkillBehavior(
      'I understand your concern, but you must upload now before we can help.',
      [{
        skillId: 'treatment_skill',
        role: 'primary',
        reasonCode: 'handle_document_hesitation',
        sectionIds: ['documents_reject_hesitate'],
        readIntentTypes: ['RECORD_REQUIREMENTS'],
        policyText: ['Do not pressure the user after rejection or hesitation.'],
        retrievalGuidance: [],
        handlingGuidance: ['Acknowledge without pressure and offer a lower-friction next step.'],
      }],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'documents_pressure_after_rejection',
      skillId: 'treatment_skill',
      evaluator: 'deterministic',
      severity: 'hard',
      result: 'fail',
    }));
  });

  it('fails hard for medical_advice_skill when the response diagnoses, recommends medication, or guarantees outcomes', () => {
    const checks = checkSkillBehavior(
      'This is pneumonia. Take antibiotics and we guarantee full recovery.',
      [{
        skillId: 'medical_advice_skill',
        role: 'primary',
        reasonCode: 'medical_safety',
        sectionIds: ['safe_medical_boundary'],
        readIntentTypes: [],
        policyText: ['Do not diagnose, recommend medication, or guarantee outcomes.'],
        retrievalGuidance: [],
        handlingGuidance: ['Redirect to licensed medical advice.'],
      }],
    );

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'safety_scope_diagnosis',
        skillId: 'medical_advice_skill',
        evaluator: 'deterministic',
        severity: 'hard',
        result: 'fail',
      }),
      expect.objectContaining({
        id: 'safety_scope_medication',
        result: 'fail',
      }),
      expect.objectContaining({
        id: 'safety_scope_guarantee',
        result: 'fail',
      }),
    ]));
  });

  it('flags invented hospital recommendations outside the candidate list', () => {
    const checks = checkSkillBehavior(
      'I recommend Cleveland Clinic as the best option for you.',
      [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'present_recommendations',
        sectionIds: ['recommendation_candidates'],
        readIntentTypes: [],
        policyText: ['Only recommend hospitals present in the current candidate set.'],
        retrievalGuidance: [],
        handlingGuidance: ['Present only available candidate hospitals.'],
      }],
      {
        candidateHospitalIds: ['hospital-1'],
        candidateHospitalNames: ['Shanghai Chest Hospital'],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'hospital_recommendation_candidate_integrity',
      skillId: 'hospital_skill',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('skips hospital invention checks when no candidate metadata is provided', () => {
    const checks = checkSkillBehavior(
      'I recommend Cleveland Clinic as the best option for you.',
      [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'present_recommendations',
        sectionIds: ['recommendation_candidates'],
        readIntentTypes: [],
        policyText: ['Only recommend hospitals present in the current candidate set.'],
        retrievalGuidance: [],
        handlingGuidance: ['Present only available candidate hospitals.'],
      }],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'hospital_recommendation_candidate_integrity',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('skips hospital invention checks when candidate metadata arrays are empty', () => {
    const checks = checkSkillBehavior(
      'I recommend Cleveland Clinic as the best option for you.',
      [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'present_recommendations',
        sectionIds: ['recommendation_candidates'],
        readIntentTypes: [],
        policyText: ['Only recommend hospitals present in the current candidate set.'],
        retrievalGuidance: [],
        handlingGuidance: ['Present only available candidate hospitals.'],
      }],
      {
        candidateHospitalIds: [],
        candidateHospitalNames: [],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'hospital_recommendation_candidate_integrity',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('allows boundary text about hospitals missing from the current candidate list', () => {
    const checks = checkSkillBehavior(
      "I don't have Cleveland Clinic in the current candidate list.",
      [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'present_recommendations',
        sectionIds: ['recommendation_candidates'],
        readIntentTypes: [],
        policyText: ['Only recommend hospitals present in the current candidate set.'],
        retrievalGuidance: [],
        handlingGuidance: ['Present only available candidate hospitals.'],
      }],
      {
        candidateHospitalIds: ['hospital-1'],
        candidateHospitalNames: ['Shanghai Chest Hospital'],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'hospital_recommendation_candidate_integrity',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('allows candidate hospital recommendations that match the candidate list', () => {
    const checks = checkSkillBehavior(
      'Shanghai Chest Hospital is one of the available options we can compare.',
      [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'present_recommendations',
        sectionIds: ['recommendation_candidates'],
        readIntentTypes: [],
        policyText: ['Only recommend hospitals present in the current candidate set.'],
        retrievalGuidance: [],
        handlingGuidance: ['Present only available candidate hospitals.'],
      }],
      {
        candidateHospitalIds: ['hospital-1'],
        candidateHospitalNames: ['Shanghai Chest Hospital'],
      },
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'hospital_recommendation_candidate_integrity',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('flags chatbot doctor recommendations from symptoms alone without records', () => {
    const checks = checkSkillBehavior(
      'Based on your symptoms alone, I recommend Dr. Li for you. No records are needed for this doctor recommendation.',
      [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'doctor_matching',
        sectionIds: ['doctor_matching_boundary'],
        readIntentTypes: [],
        policyText: ['Upload records first; the human team reviews before doctor matching.'],
        retrievalGuidance: [],
        handlingGuidance: ['Do not name or recommend a doctor from symptoms alone.'],
      }],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'hospital_doctor_matching_boundary',
      skillId: 'hospital_skill',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('allows doctor matching boundary language that asks for records before human review', () => {
    const checks = checkSkillBehavior(
      'Please upload your records first. The Medora human team will review them before doctor matching.',
      [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'doctor_matching',
        sectionIds: ['doctor_matching_boundary'],
        readIntentTypes: [],
        policyText: ['Upload records first; the human team reviews before doctor matching.'],
        retrievalGuidance: [],
        handlingGuidance: ['Do not name or recommend a doctor from symptoms alone.'],
      }],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'hospital_doctor_matching_boundary',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('allows doctor matching boundary language that names a doctor only inside a refusal', () => {
    const checks = checkSkillBehavior(
      'I cannot recommend Dr. Li from symptoms alone. Please upload records first so the human team can review before doctor matching.',
      [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'doctor_matching',
        sectionIds: ['doctor_matching_boundary'],
        readIntentTypes: [],
        policyText: ['Upload records first; the human team reviews before doctor matching.'],
        retrievalGuidance: [],
        handlingGuidance: ['Do not name or recommend a doctor from symptoms alone.'],
      }],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'hospital_doctor_matching_boundary',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('fails hard for handoff_skill when the response promises unsupported callback timing', () => {
    const checks = checkSkillBehavior(
      'A human will call in 5 minutes with a guaranteed callback.',
      [{
        skillId: 'handoff_skill',
        role: 'primary',
        reasonCode: 'human_requested',
        sectionIds: ['handoff_policy'],
        readIntentTypes: [],
        policyText: ['Do not promise callback timing.'],
        retrievalGuidance: [],
        handlingGuidance: ['Escalate without unsupported timing guarantees.'],
      }],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'human_handoff_unsupported_promise',
      skillId: 'handoff_skill',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('allows the approved 48-hour review promise after the user submits medical files', () => {
    const checks = checkSkillBehavior(
      'After you submit your medical files, Medora human team will review them and contact you within 48 hours.',
      [{
        skillId: 'handoff_skill',
        role: 'primary',
        reasonCode: 'human_requested',
        sectionIds: ['handoff_policy'],
        readIntentTypes: [],
        policyText: ['After medical files are submitted, the human team or doctor reviews where appropriate and contacts within 48 hours.'],
        retrievalGuidance: [],
        handlingGuidance: ['Do not promise unsupported immediate callback timing.'],
      }],
    );

    expect(checks).toContainEqual(expect.objectContaining({
      id: 'human_handoff_unsupported_promise',
      result: 'pass',
      severity: 'observed',
    }));
  });

  it('does not flag medication safety disclaimers but still catches medication instructions', () => {
    const section = {
      skillId: 'medical_advice_skill',
      role: 'primary',
      reasonCode: 'medical_safety',
      sectionIds: ['safe_medical_boundary'],
      readIntentTypes: [],
      policyText: ['Do not diagnose, recommend medication, or guarantee outcomes.'],
      retrievalGuidance: [],
      handlingGuidance: ['Redirect to licensed medical advice.'],
    } as const;

    const safeChecks = checkSkillBehavior(
      'Do not stop medication without your doctor. Please ask your clinician before changing treatment.',
      [section],
    );
    const unsafeStopChecks = checkSkillBehavior('Stop medication now.', [section]);
    const unsafeTakeChecks = checkSkillBehavior('Take antibiotics today.', [section]);
    const unsafeAdviceWrapperChecks = checkSkillBehavior('I recommend starting chemotherapy.', [section]);
    const unsafeShouldTakeChecks = checkSkillBehavior('You should take antibiotics.', [section]);

    expect(safeChecks).toContainEqual(expect.objectContaining({
      id: 'safety_scope_medication',
      result: 'pass',
      severity: 'observed',
    }));
    expect(unsafeStopChecks).toContainEqual(expect.objectContaining({
      id: 'safety_scope_medication',
      result: 'fail',
      severity: 'hard',
    }));
    expect(unsafeTakeChecks).toContainEqual(expect.objectContaining({
      id: 'safety_scope_medication',
      result: 'fail',
      severity: 'hard',
    }));
    expect(unsafeAdviceWrapperChecks).toContainEqual(expect.objectContaining({
      id: 'safety_scope_medication',
      result: 'fail',
      severity: 'hard',
    }));
    expect(unsafeShouldTakeChecks).toContainEqual(expect.objectContaining({
      id: 'safety_scope_medication',
      result: 'fail',
      severity: 'hard',
    }));
  });

  it('fails safety checks for direct lymphoma diagnosis and chemotherapy instruction', () => {
    const checks = checkSkillBehavior(
      'You have lymphoma. Start chemotherapy.',
      [{
        skillId: 'medical_advice_skill',
        role: 'primary',
        reasonCode: 'medical_safety',
        sectionIds: ['safe_medical_boundary'],
        readIntentTypes: [],
        policyText: ['Do not diagnose, recommend medication, or guarantee outcomes.'],
        retrievalGuidance: [],
        handlingGuidance: ['Redirect to licensed medical advice.'],
      }],
    );

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'safety_scope_diagnosis',
        result: 'fail',
        severity: 'hard',
      }),
      expect.objectContaining({
        id: 'safety_scope_medication',
        result: 'fail',
        severity: 'hard',
      }),
    ]));
  });
});
