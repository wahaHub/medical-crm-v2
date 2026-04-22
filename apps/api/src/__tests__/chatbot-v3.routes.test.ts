import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import {
  CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT,
  JourneyRuntimeAuthorityService,
  SupervisorService,
} from '@medical-crm/application';
import { FaqLlmAdapter } from '../routes/chatbot-v3/faq-llm-adapter.js';
import { RecordsLlmAdapter } from '../routes/chatbot-v3/records-llm-adapter.js';
import { FaqAgent, RecommendationAgent, RecordsAgent } from '../routes/chatbot-v3/agents.js';
import { buildRecordsMinimalTriagePrompt } from '../routes/chatbot-v3/records-prompts.js';
import { createChatbotV3RuntimeNodeEventEmitter } from '../routes/chatbot-v3/observability.js';
import {
  chatbotV3PublicRoutes,
  deriveRecommendationState,
  filterUnchangedStatusPatch,
  serializeStatusSnapshot,
} from '../routes/chatbot-v3.routes.js';
import {
  buildConversationSummaryPatch,
  ConversationOrchestratorV3RuntimeService,
  InvalidChatbotV3ActionError,
  deriveCurrentStageFromStatusSnapshot,
} from '../routes/chatbot-v3/runtime.service.js';
import { composeResponse, PROCESS_OVERVIEW_TEXT } from '../routes/chatbot-v3/response-composer.js';
import { createToolGateway } from '../routes/chatbot-v3/tool-gateway.js';
import type {
  FaqWorkerTask,
  RecommendationWorkerTask,
  RecordsWorkerTask,
} from '../routes/chatbot-v3/worker-task.js';

const routeMockServices = vi.hoisted(() => ({
  idempotencyExecutor: {
    execute: vi.fn(async (_key: string, _operation: string, fn: () => Promise<unknown>) => fn()),
  },
  aiChatSessionRepo: {
    findBySessionId: vi.fn(),
    save: vi.fn(),
    patchStatus: vi.fn(),
  },
  patientAuthService: {
    verifySessionToken: vi.fn(),
  },
}));

vi.mock('../composition-root.js', () => ({
  getServices: () => routeMockServices,
}));

function createRecordsTask(
  latestUserMessage: string,
  overrides: Partial<RecordsWorkerTask> = {},
): RecordsWorkerTask {
  return {
    agent: 'RecordsAgent',
    fromStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    toStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    latestUserMessage,
    mode: 'minimal_triage',
    minimalTriageComplete: false,
    ...overrides,
  };
}

function createRecommendationTask(
  latestUserMessage: string,
  overrides: Partial<RecommendationWorkerTask> = {},
): RecommendationWorkerTask {
  return {
    agent: 'RecommendationAgent',
    fromStage: 'RECOMMENDATION',
    toStage: 'RECOMMENDATION',
    latestUserMessage,
    recommendationTask: 'generate',
    ...overrides,
  };
}

function createFaqTask(
  latestUserMessage: string,
  overrides: Partial<FaqWorkerTask> = {},
): FaqWorkerTask {
  return {
    agent: 'FaqAgent',
    fromStage: 'EXPLAIN_PROCESS',
    toStage: 'EXPLAIN_PROCESS',
    latestUserMessage,
    intent: 'faq',
    supervisorReason: 'user is asking an faq question',
    ...overrides,
  };
}

type FaqStagePreservationScenario = {
  stage: 'COLLECT_MINIMAL_MEDICAL_FACTS'
    | 'RECOMMENDATION'
    | 'EXPLAIN_PROCESS'
    | 'COLLECT_MEDICAL_INPUTS'
    | 'ONLINE_CONSULT'
    | 'HUMAN_HANDOFF';
  sessionId: string;
  turnId: string;
  traceId: string;
  message: string;
  faqResult: {
    answer: string;
    citedFaqIds: string[];
    confidence: 'high' | 'low';
  };
  statusSnapshot: Partial<any>;
  expectRenderPath: 'FAQ_ANSWER' | 'FAQ_MISS';
  expectAssistantText: string;
  expectHandOffRequired?: boolean;
};

async function runFaqStagePreservationScenario(scenario: FaqStagePreservationScenario) {
  const faqAgent = {
    execute: vi.fn(async () => ({
      status: 'ok' as const,
      data: scenario.faqResult,
    })),
  };
  const runtime = new ConversationOrchestratorV3RuntimeService({
    idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
    supervisor: new SupervisorService(),
    journeyRuntimeAuthority: {
      decide: vi.fn(() => ({
        action: 'ADVANCE' as const,
        from: { stage: scenario.stage, phase: 'active' as const },
        to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
        dispatchAgent: 'FaqAgent' as const,
        dispatchSource: 'journey-runtime-authority' as const,
        write: {
          authority: 'journey-runtime-authority' as const,
          stage: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          factsPatch: {
            'process.explained': true,
          },
        },
      })),
    },
    gateway: {
      status: {
        query: vi.fn(async () => ({
          status: 'ok' as const,
          data: { snapshot: {} },
        })),
      },
    } as any,
    agents: {
      FaqAgent: faqAgent,
    },
  });

  const result = await runtime.handleTurn({
    traceId: scenario.traceId,
    sessionId: scenario.sessionId,
    turnId: scenario.turnId,
    message: scenario.message,
    site: 'china',
    current: {
      stage: scenario.stage,
      phase: 'active',
    },
    statusSnapshot: {
      journeyCurrentStage: scenario.stage,
      journeyCurrentPhase: 'active',
      ...scenario.statusSnapshot,
    } as any,
  });

  const response = composeResponse({
    body: {
      sessionId: scenario.sessionId,
      message: scenario.message,
    } as any,
    result,
    sessionStatusSnapshot: {
      journeyCurrentStage: scenario.stage,
      journeyCurrentPhase: 'active',
      ...scenario.statusSnapshot,
    } as any,
  });

  expect(result.render).toEqual({
    path: scenario.expectRenderPath,
  });
  expect(response.messages[0]?.text).toContain(scenario.expectAssistantText);
  expect(response.journey).toEqual({
    stage: scenario.stage,
    phase: 'active',
  });
  expect(response.cards.map((card) => card.cardType)).toEqual(expectedFaqCardTypes(
    scenario.stage,
    scenario.expectRenderPath,
  ));
  expectFaqCardPayloads(response, scenario.stage, scenario.expectRenderPath);
  expect(result.writeIntents?.statusPatch).not.toEqual(expect.objectContaining({
    journeyCurrentStage: 'EXPLAIN_PROCESS',
  }));

  if (scenario.expectHandOffRequired !== undefined) {
    expect(response.handoff.required).toBe(scenario.expectHandOffRequired);
  }

  return { result, response };
}

function expectedFaqCardTypes(
  stage: FaqStagePreservationScenario['stage'],
  renderPath: FaqStagePreservationScenario['expectRenderPath'],
): string[] {
  if (renderPath === 'FAQ_MISS') {
    return [];
  }

  switch (stage) {
    case 'COLLECT_MINIMAL_MEDICAL_FACTS':
      return ['UPLOAD_RECORDS'];
    case 'RECOMMENDATION':
      return [];
    case 'EXPLAIN_PROCESS':
      return ['PROCESS_GUIDE'];
    case 'COLLECT_MEDICAL_INPUTS':
      return ['UPLOAD_RECORDS'];
    case 'ONLINE_CONSULT':
      return ['CONSULT_BOOKING'];
    case 'HUMAN_HANDOFF':
      return ['HANDOFF_STATUS'];
  }
}

function expectFaqCardPayloads(
  response: { cards: Array<{ cardType: string; payload: Record<string, unknown> }> },
  stage: FaqStagePreservationScenario['stage'],
  renderPath: FaqStagePreservationScenario['expectRenderPath'],
) {
  if (renderPath === 'FAQ_MISS') {
    expect(response.cards).toEqual([]);
    return;
  }

  switch (stage) {
    case 'COLLECT_MINIMAL_MEDICAL_FACTS':
      expect(response.cards).toEqual([
        expect.objectContaining({
          cardType: 'UPLOAD_RECORDS',
          payload: expect.objectContaining({
            required: true,
            uploadedCount: 1,
          }),
        }),
      ]);
      return;
    case 'RECOMMENDATION':
      expect(response.cards).toEqual([]);
      return;
    case 'EXPLAIN_PROCESS':
      expect(response.cards).toEqual([
        expect.objectContaining({
          cardType: 'PROCESS_GUIDE',
          payload: expect.objectContaining({
            guideId: 'medical-travel-process',
            title: 'Medical travel process',
          }),
        }),
      ]);
      return;
    case 'COLLECT_MEDICAL_INPUTS':
      expect(response.cards).toEqual([
        expect.objectContaining({
          cardType: 'UPLOAD_RECORDS',
          payload: expect.objectContaining({
            required: true,
            uploadedCount: 2,
          }),
        }),
      ]);
      return;
    case 'ONLINE_CONSULT':
      expect(response.cards).toEqual([
        expect.objectContaining({
          cardType: 'CONSULT_BOOKING',
          payload: expect.objectContaining({
            status: 'idle',
          }),
        }),
      ]);
      return;
    case 'HUMAN_HANDOFF':
      expect(response.cards).toEqual([
        expect.objectContaining({
          cardType: 'HANDOFF_STATUS',
          payload: expect.objectContaining({
            required: true,
          }),
        }),
      ]);
      expect(response.cards[0]?.payload).not.toHaveProperty('ticketId');
  }
}

describe('chatbot-v3 ToolGateway', () => {
  it('normalizes timeouts into TIMEOUT tool results', async () => {
    const gateway = createToolGateway({
      readTimeoutMs: 5,
      handlers: {
        records: {
          status: vi.fn(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
            return { state: 'processing' };
          }),
        },
      },
    });

    const result = await gateway.records.status({ sessionId: 'session-1' });

    expect(result).toEqual({
      status: 'error',
      code: 'TIMEOUT',
      message: expect.any(String),
    });
  });

  it('aborts mutating tool handlers on timeout and guides callers toward idempotent follow-up', async () => {
    const abortedSignals: boolean[] = [];
    const gateway = createToolGateway({
      writeTimeoutMs: 5,
      handlers: {
        records: {
          save: vi.fn(async (_input, context) => {
            await new Promise((resolve, reject) => {
              context.signal.addEventListener('abort', () => {
                abortedSignals.push(context.signal.aborted);
                reject(new Error('records.save timed out after 5ms'));
              }, { once: true });
            });

            return { saved: true };
          }),
        },
      },
    });

    const result = await gateway.records.save({ sessionId: 'session-1', turnId: 'turn-1' });

    expect(result).toEqual({
      status: 'error',
      code: 'TIMEOUT',
      message: expect.stringContaining('outcome may be unknown'),
    });
    expect(result).toEqual(expect.objectContaining({
      message: expect.stringContaining('idempotency'),
    }));
    expect(abortedSignals).toEqual([true]);
  });

  it('exposes required tool capability matrix', () => {
    const gateway = createToolGateway({ handlers: {} });

    expect(gateway.faq).toHaveProperty('categorySearch');
    expect(gateway.faq).toHaveProperty('search');
    expect(gateway.faq).toHaveProperty('getByIds');
    expect(gateway.records).toHaveProperty('upload');
    expect(gateway.records).toHaveProperty('save');
    expect(gateway.records).toHaveProperty('status');
    expect(gateway.recommendation).toHaveProperty('generate');
    expect(gateway.recommendation).toHaveProperty('pick');
    expect(gateway.recommendation).toHaveProperty('status');
    expect(gateway.consult).toHaveProperty('schedule');
    expect(gateway.consult).toHaveProperty('status');
    expect(gateway.status).toHaveProperty('query');
    expect(gateway.handoff).toHaveProperty('create');
    expect(gateway.handoff).toHaveProperty('status');
  });
});

describe('chatbot-v3 agents', () => {
  it('rejects actions outside the agent allowlist', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'status.query',
      input: { sessionId: 'session-1' },
    });

    expect(result).toEqual({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('status.query'),
    });
  });

  it('returns the 3 key medical questions on the initial minimal triage path', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'records.status',
      input: { sessionId: 'session-1' },
      meta: {
        task: createRecordsTask('What do you need from me first?'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': false,
        questions: [
          'What is the main symptom, diagnosis, or medical problem right now?',
          'When did it start, how long has it been going on, and how severe is it?',
          'What tests, treatments, medicines, or diagnoses already exist?',
        ],
        followUp: 'We already received your basic intake. Please answer these 3 follow-up questions so we can refine your recommendation, or you can skip them if you prefer.',
        missing: ['symptom_or_diagnosis', 'duration_or_severity', 'existing_tests_or_treatments'],
      },
    });
  });

  it('returns an explicit follow-up for what is still missing when the user answers only two triage questions', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'records.status',
      input: { sessionId: 'session-2' },
      meta: {
        task: createRecordsTask('I have chest pain, it started 3 days ago and feels moderate.'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': false,
        questions: [
          'What is the main symptom, diagnosis, or medical problem right now?',
          'When did it start, how long has it been going on, and how severe is it?',
          'What tests, treatments, medicines, or diagnoses already exist?',
        ],
        followUp: 'Please tell me what tests, treatments, medicines, or diagnoses already exist.',
        missing: ['existing_tests_or_treatments'],
      },
    });
  });

  it('continues from a partially answered initial triage reply without resetting the missing fields', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'records.status',
      input: { sessionId: 'session-2a' },
      meta: {
        task: createRecordsTask('I have chest pain.'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': false,
        questions: [
          'What is the main symptom, diagnosis, or medical problem right now?',
          'When did it start, how long has it been going on, and how severe is it?',
          'What tests, treatments, medicines, or diagnoses already exist?',
        ],
        followUp: 'Please tell me when it started, how long it has been going on, and how severe it is and what tests, treatments, medicines, or diagnoses already exist.',
        missing: ['duration_or_severity', 'existing_tests_or_treatments'],
      },
    });
  });

  it('marks minimal triage complete when the user answers all 3 questions in one reply', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'records.status',
      input: { sessionId: 'session-2b' },
      meta: {
        task: createRecordsTask('I have chest pain, it started 3 days ago, it feels moderate, and I already had a blood test.'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': true,
      },
    });
  });

  it('marks minimal triage complete when the answer spans multiple lines', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'records.status',
      input: { sessionId: 'session-2c' },
      meta: {
        task: createRecordsTask([
          'Main problem: chest pain',
          'Started 3 days ago and feels moderate.',
          'Tests/treatments: had a blood test already.',
        ].join('\n')),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': true,
      },
    });
  });

  it('accepts a valid negative treatment answer like nothing yet as complete triage', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'records.status',
      input: { sessionId: 'session-2d' },
      meta: {
        task: createRecordsTask('I have chest pain, it started 3 days ago, it feels moderate, and nothing yet has been done.'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': true,
      },
    });
  });

  it('does not treat unrelated substrings like reacted as evidence of existing tests or treatment', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'records.status',
      input: { sessionId: 'session-2e' },
      meta: {
        task: createRecordsTask('I have chest pain, it started 3 days ago, it feels moderate, and I reacted badly yesterday.'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': false,
        questions: [
          'What is the main symptom, diagnosis, or medical problem right now?',
          'When did it start, how long has it been going on, and how severe is it?',
          'What tests, treatments, medicines, or diagnoses already exist?',
        ],
        followUp: 'Please tell me what tests, treatments, medicines, or diagnoses already exist.',
        missing: ['existing_tests_or_treatments'],
      },
    });
  });

  it('returns an explicit follow-up for clearer medical detail when the answer is insufficient', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'records.status',
      input: { sessionId: 'session-3' },
      meta: {
        task: createRecordsTask('I am not sure.'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': false,
        questions: [
          'What is the main symptom, diagnosis, or medical problem right now?',
          'When did it start, how long has it been going on, and how severe is it?',
          'What tests, treatments, medicines, or diagnoses already exist?',
        ],
        followUp: 'Please share clearer medical details, including the main problem, how long it has been happening, how severe it is, and any tests, treatments, medicines, or diagnoses so far.',
        missing: ['symptom_or_diagnosis', 'duration_or_severity', 'existing_tests_or_treatments'],
      },
    });
  });

  it('keeps missing fields internally consistent when some medical detail is present but triage is still unclear', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'records.status',
      input: { sessionId: 'session-3b' },
      meta: {
        task: createRecordsTask('Not sure, but I do have chest pain and it started 3 days ago.'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': false,
        questions: [
          'What is the main symptom, diagnosis, or medical problem right now?',
          'When did it start, how long has it been going on, and how severe is it?',
          'What tests, treatments, medicines, or diagnoses already exist?',
        ],
        followUp: 'Please share clearer medical details, including how severe it is and any tests, treatments, medicines, or diagnoses so far.',
        missing: ['duration_or_severity', 'existing_tests_or_treatments'],
      },
    });
  });

  it('uses a recommendation worker contract instead of returning raw tool output unchanged', async () => {
    const gateway = createToolGateway({
      handlers: {
        recommendation: {
          generate: vi.fn(async () => ({
            recommendations: [
              {
                hospitalId: 'hospital-1',
                name: 'Shanghai Chest Hospital',
                reason: 'Thoracic oncology focus',
                score: 0.94,
                internalRank: 1,
              },
              {
                hospitalId: 'hospital-2',
                name: 'Fudan Cancer Center',
                reason: 'Strong multidisciplinary lung cancer team',
                score: 0.91,
                internalRank: 2,
              },
              {
                hospitalId: 'hospital-3',
                name: 'Ruijin Hospital',
                reason: 'Broad oncology and surgery coverage',
                score: 0.87,
                internalRank: 3,
              },
              {
                hospitalId: 'hospital-4',
                name: 'Extra Hospital',
                reason: 'Should be trimmed from the compact worker output',
                score: 0.8,
                internalRank: 4,
              },
            ],
          })),
        },
      },
    });
    const agent = new RecommendationAgent(gateway);

    const result = await agent.execute({
      type: 'recommendation.generate',
      input: {
        sessionId: 'session-recommendation-1',
        turnId: 'turn-recommendation-1',
      },
      meta: {
        task: createRecommendationTask('Compare the best options for me.', {
          recommendationTask: 'compare',
        }),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        recommendations: [
          {
            hospitalId: 'hospital-1',
            name: 'Shanghai Chest Hospital',
            reason: 'Thoracic oncology focus',
          },
          {
            hospitalId: 'hospital-2',
            name: 'Fudan Cancer Center',
            reason: 'Strong multidisciplinary lung cancer team',
          },
          {
            hospitalId: 'hospital-3',
            name: 'Ruijin Hospital',
            reason: 'Broad oncology and surgery coverage',
          },
        ],
        explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
        recommendationTask: 'compare',
      },
    });
  });
});

describe('chatbot-v3 structured action runtime normalization', () => {
  it('treats TRIAGE_SUBMITTED as summary-backed triage completion without persisting answered status', async () => {
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [{ hospitalId: 'hospital-1' }],
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'triage was submitted',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn((input) => {
          expect(input.statusSnapshot).toMatchObject({
            minimalTriageStatus: 'pending',
            minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
            minimalTriageComplete: true,
          });
          expect(input.facts?.['records.minimal_triage.complete']).toBe(true);

          return {
            action: 'ADVANCE' as const,
            from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
            to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
            dispatchAgent: 'RecommendationAgent' as const,
            dispatchSource: 'journey-runtime-authority' as const,
          };
        }),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent as any,
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-triage-submitted-1',
      sessionId: 'session-triage-submitted-1',
      turnId: 'turn-triage-submitted-1',
      message: 'I have chest pain for three days, it feels moderate, and I already had a blood test.',
      userAction: {
        type: 'TRIAGE_SUBMITTED',
      },
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      } as any,
      facts: {
        'records.minimal_triage.complete': false,
      },
    });

    expect(recommendationAgent.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'recommendation.generate',
      meta: {
        task: expect.objectContaining({
          recommendationBasis: 'INTAKE_AND_FOLLOW_UP_SUMMARY',
          minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        }),
      },
    }));
  });

  it('fails RECOMMENDATION_SELECTED before recommendation has been presented', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'user selected a hospital',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        FaqAgent: {
          execute: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              answer: 'Here is the process again.',
              citedFaqIds: ['faq-process-1'],
              confidence: 'high',
            },
          })),
        },
      },
    });

    await expect(runtime.handleTurn({
      traceId: 'trace-invalid-selection-1',
      sessionId: 'session-invalid-selection-1',
      turnId: 'turn-invalid-selection-1',
      message: '',
      userAction: {
        type: 'RECOMMENDATION_SELECTED',
        hospitalId: 'hospital-1',
      },
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        recommendationGenerated: false,
        recommendationSelected: false,
      } as any,
      facts: {
        'recommendation.generated': false,
        'recommendation.selected': false,
      },
    })).rejects.toBeInstanceOf(InvalidChatbotV3ActionError);
  });

  it('fails RECOMMENDATION_SKIPPED before recommendation has been presented', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'user skipped hospital selection',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {},
    });

    await expect(runtime.handleTurn({
      traceId: 'trace-invalid-skip-1',
      sessionId: 'session-invalid-skip-1',
      turnId: 'turn-invalid-skip-1',
      message: '',
      userAction: {
        type: 'RECOMMENDATION_SKIPPED',
      },
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        recommendationGenerated: false,
        recommendationSelectionStatus: null,
        recommendationSelectedHospitalIds: null,
        recommendationSelected: false,
      } as any,
      facts: {
        'recommendation.generated': false,
        'recommendation.selected': false,
      },
    })).rejects.toBeInstanceOf(InvalidChatbotV3ActionError);
  });

  it('persists RECOMMENDATION_SELECTED through the structured action path once recommendation is presented', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'user selected a hospital',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn((input) => {
          expect(input.statusSnapshot).toMatchObject({
            recommendationGenerated: true,
            recommendationSelectionStatus: 'selected',
            recommendationSelectedHospitalIds: ['hospital-1'],
            recommendationSelected: true,
          });
          expect(input.facts).toMatchObject({
            'recommendation.generated': true,
            'recommendation.selected': true,
          });

          return {
            action: 'STAY' as const,
            from: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
            to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
            dispatchSource: 'journey-runtime-authority' as const,
          };
        }),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {},
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-selection-success-1',
      sessionId: 'session-selection-success-1',
      turnId: 'turn-selection-success-1',
      message: '',
      userAction: {
        type: 'RECOMMENDATION_SELECTED',
        hospitalId: 'hospital-1',
      },
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        recommendationGenerated: true,
        recommendationSelectionStatus: 'pending',
        recommendationSelectedHospitalIds: [],
        recommendationSelected: null,
      } as any,
      facts: {
        'recommendation.generated': true,
        'recommendation.selected': false,
      },
    });

    expect(result.writeIntents).toEqual(expect.objectContaining({
      statusPatch: expect.objectContaining({
        recommendationGenerated: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        recommendationSelected: true,
      }),
    }));
  });

  it('rejects RECOMMENDATION_SELECTED when only legacy recommendationGenerated truth is present', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'user selected a hospital from a legacy recommendation session',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn((input) => {
          expect(input.statusSnapshot).toMatchObject({
            recommendationGenerated: true,
            recommendationSelectionStatus: 'selected',
            recommendationSelectedHospitalIds: ['hospital-legacy-1'],
            recommendationSelected: true,
          });

          return {
            action: 'STAY' as const,
            from: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
            to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
            dispatchSource: 'journey-runtime-authority' as const,
          };
        }),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {},
    });

    await expect(runtime.handleTurn({
      traceId: 'trace-selection-legacy-generated-1',
      sessionId: 'session-selection-legacy-generated-1',
      turnId: 'turn-selection-legacy-generated-1',
      message: '',
      userAction: {
        type: 'RECOMMENDATION_SELECTED',
        hospitalId: 'hospital-legacy-1',
      },
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        recommendationGenerated: true,
        recommendationSelectionStatus: null,
        recommendationSelectedHospitalIds: null,
        recommendationSelected: false,
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        supportingDocuments: [],
      } as any,
      facts: {
        'recommendation.generated': true,
        'recommendation.selected': false,
      },
    })).rejects.toBeInstanceOf(InvalidChatbotV3ActionError);
  });

  it('still rejects recommendation selection when legacy recommendation state has already failed', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'user selected a hospital after a failed legacy recommendation state',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {},
    });

    await expect(runtime.handleTurn({
      traceId: 'trace-selection-legacy-failed-1',
      sessionId: 'session-selection-legacy-failed-1',
      turnId: 'turn-selection-legacy-failed-1',
      message: '',
      userAction: {
        type: 'RECOMMENDATION_SELECTED',
        hospitalId: 'hospital-legacy-failed-1',
      },
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        recommendationGenerated: true,
        recommendationStatus: 'FAILED',
        recommendationSelectionStatus: null,
        recommendationSelectedHospitalIds: null,
        recommendationSelected: false,
      } as any,
      facts: {
        'recommendation.generated': true,
        'recommendation.selected': false,
      },
    })).rejects.toBeInstanceOf(InvalidChatbotV3ActionError);
  });

  it('persists RECOMMENDATION_SKIPPED through the same structured action path', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'user skipped hospital selection',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn((input) => {
          expect(input.statusSnapshot).toMatchObject({
            recommendationGenerated: true,
            recommendationSelectionStatus: 'skipped',
            recommendationSelectedHospitalIds: [],
            recommendationSelected: false,
          });
          expect(input.facts).toMatchObject({
            'recommendation.generated': true,
            'recommendation.selected': false,
          });

          return {
            action: 'STAY' as const,
            from: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
            to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
            dispatchSource: 'journey-runtime-authority' as const,
          };
        }),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {},
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-selection-skip-1',
      sessionId: 'session-selection-skip-1',
      turnId: 'turn-selection-skip-1',
      message: '',
      userAction: {
        type: 'RECOMMENDATION_SKIPPED',
      },
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        recommendationGenerated: true,
        recommendationSelectionStatus: 'pending',
        recommendationSelectedHospitalIds: [],
        recommendationSelected: null,
      } as any,
      facts: {
        'recommendation.generated': true,
        'recommendation.selected': false,
      },
    });

    expect(result.writeIntents).toEqual(expect.objectContaining({
      statusPatch: expect.objectContaining({
        recommendationGenerated: true,
        recommendationSelectionStatus: 'skipped',
        recommendationSelectedHospitalIds: [],
        recommendationSelected: false,
      }),
    }));
  });

  it('persists recommendation presentation as a pending structured selection state once results are shown', async () => {
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [
            { hospitalId: 'hospital-1', name: 'Hospital 1', reason: 'Good fit' },
          ],
          recommendationTask: 'generate',
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'show hospital recommendation',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent as any,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-recommendation-presented-1',
      sessionId: 'session-recommendation-presented-1',
      turnId: 'turn-recommendation-presented-1',
      message: 'Please recommend hospitals for me.',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      statusSnapshot: {
        minimalTriageComplete: true,
        recommendationGenerated: false,
        recommendationSelectionStatus: null,
        recommendationSelectedHospitalIds: null,
        recommendationSelected: false,
      } as any,
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.generated': false,
        'recommendation.selected': false,
      },
    });

    expect(result.writeIntents).toEqual(expect.objectContaining({
      statusPatch: expect.objectContaining({
        recommendationGenerated: true,
        recommendationSelectionStatus: 'pending',
        recommendationSelectedHospitalIds: [],
        recommendationSelected: false,
      }),
    }));
  });

  it('does not mark recommendation as presented when every raw candidate is filtered out before rendering', async () => {
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [
            { hospitalId: '', name: 'Broken candidate' },
            { hospitalId: 'hospital-2', name: '' },
          ],
          recommendationTask: 'generate',
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'show hospital recommendation',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent as any,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-recommendation-presented-malformed-1',
      sessionId: 'session-recommendation-presented-malformed-1',
      turnId: 'turn-recommendation-presented-malformed-1',
      message: 'Please recommend hospitals for me.',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      statusSnapshot: {
        minimalTriageComplete: true,
        recommendationGenerated: false,
        recommendationSelectionStatus: null,
        recommendationSelectedHospitalIds: null,
        recommendationSelected: false,
      } as any,
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.generated': false,
        'recommendation.selected': false,
      },
    });

    expect(result.writeIntents?.statusPatch).toEqual({
      journeyCurrentStage: 'RECOMMENDATION',
      journeyCurrentPhase: 'active',
    });
  });
});

describe('chatbot-v3 records triage prompt', () => {
  it('asks the 3 key medical questions in the minimal triage prompt', () => {
    const prompt = buildRecordsMinimalTriagePrompt(
      createRecordsTask('What do you need from me first?'),
    );

    expect(prompt).toContain('What is the main symptom, diagnosis, or medical problem right now?');
    expect(prompt).toContain('When did it start, how long has it been going on, and how severe is it?');
    expect(prompt).toContain('What tests, treatments, medicines, or diagnoses already exist?');
    expect(prompt).toContain('ask again when answers are incomplete, unclear, or insufficient');
  });
});

describe('chatbot-v3 runtime', () => {
  it('prefers the persisted journey snapshot over a stale caller current', () => {
    expect(deriveCurrentStageFromStatusSnapshot({
      journeyCurrentStage: 'RECOMMENDATION',
      journeyCurrentPhase: 'active',
      minimalTriageStatus: 'pending',
      minimalTriageAnswersSummary: null,
      recommendationSelectionStatus: 'pending',
      recommendationSelectedHospitalIds: [],
      supportingDocuments: [],
      conditionStatus: 'unknown',
      formStatus: 'completed',
      docUploadStatus: 'submitted',
      recommendationStatus: 'in_progress',
      consultationStatus: 'not_introduced',
      packageStatus: 'in_progress',
      handoffStatus: 'not_needed',
      riskLevel: 'low',
      trustOrObjection: 'none',
      engagementMode: 'LIGHT_DISCOVERY',
      enteredDeepWorkflowAt: null,
      minimalTriageComplete: false,
      processExplained: false,
      recommendationGenerated: false,
      recommendationSelected: false,
      consultCompleted: false,
      handoffActive: false,
      conversationSummary: 'Persisted journey state should outrun stale callers.',
      lastPolicyDecisionAt: null,
      lastUserMessageAt: null,
      lastAssistantMessageAt: null,
    } as any)).toEqual({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
  });

  it('keeps turn outcomes deterministic for concurrent requests targeting the same session turn', async () => {
    const execute = vi.fn(createConflictOnInflightIdempotencyExecutor());
    const supervisor = {
      suggest: vi.fn(async () => ({
        intent: 'progression' as const,
        suggestedStage: 'RECOMMENDATION' as const,
        reason: 'records are ready',
      })),
    };
    const journeyRuntimeAuthority = {
      decide: vi.fn(() => ({
        action: 'ADVANCE' as const,
        from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
        to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
        dispatchAgent: 'RecommendationAgent' as const,
        dispatchSource: 'journey-runtime-authority' as const,
      })),
    };
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [{ hospitalId: 'hospital-1' }],
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute },
      supervisor,
      journeyRuntimeAuthority,
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent,
      },
    });
    const input = {
      traceId: 'trace-concurrency-1',
      sessionId: 'session-1',
      site: 'china' as const,
      turnId: 'turn-1',
      message: 'Can you recommend a hospital?',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS' as const,
        phase: 'active' as const,
      },
      facts: {
        'records.saved': true,
      },
    };

    const [first, second] = await Promise.all([
      runtime.handleTurn(input),
      runtime.handleTurn(input),
    ]);

    expect(first).toEqual(second);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      'session-1:turn-1:chatbot-v3-turn',
      'chatbot_v3_turn',
      expect.any(Function),
    );
    expect(supervisor.suggest).toHaveBeenCalledTimes(1);
    expect(journeyRuntimeAuthority.decide).toHaveBeenCalledTimes(1);
    expect(recommendationAgent.execute).toHaveBeenCalledTimes(1);
    expect(first.runtimeDebug.traceId).toBe('trace-concurrency-1');
  });

  it('forwards bootstrap signals to the supervisor boundary without manufacturing route-owned dispatch truth', async () => {
    let capturedInput: Record<string, unknown> | undefined;
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async (input) => {
          capturedInput = input as unknown as Record<string, unknown>;
          return {
            intent: 'handoff' as const,
            suggestedStage: 'HUMAN_HANDOFF' as const,
            reason: 'runtime-owned handoff suggestion',
          };
        }),
        deriveDecisionLineage: vi.fn(() => ({
          bootstrapOverride: 'direct_human_request_handoff' as const,
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'HANDOFF' as const,
          from: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          to: { stage: 'HUMAN_HANDOFF' as const, phase: 'active' as const },
          dispatchAgent: 'HandoffAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        HandoffAgent: {
          execute: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              handoffId: 'ticket-1',
              created: true,
            },
          })),
        },
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-bootstrap-1',
      sessionId: 'session-bootstrap-1',
      turnId: 'turn-bootstrap-1',
      message: 'Need a human now',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-bootstrap-1/report.pdf',
      }],
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      bootstrap: {
        message: 'Need a human now',
        attachments: [{
          fileName: 'report.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-bootstrap-1/report.pdf',
        }],
        canCreateHandoff: true,
      } as any,
    } as any);

    expect(result.journey).toEqual({
      stage: 'HUMAN_HANDOFF',
      phase: 'active',
    });
    expect(capturedInput).toMatchObject({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      suggestion: {
        intent: 'unknown',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      },
      bootstrap: {
        message: 'Need a human now',
        canCreateHandoff: true,
      },
    });
    expect(capturedInput?.suggestion.reason).toContain('Need a human now');
    expect(result.runtimeDebug).toMatchObject({
      replayLineage: {
        bootstrapOverride: 'direct_human_request_handoff',
      },
    });
  });

  it('only emits bootstrap lineage when the supervisor reports it explicitly', async () => {
    const events: Array<Record<string, unknown>> = [];
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
          reason: 'continue triage',
        })),
        deriveDecisionLineage: vi.fn(() => null),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      nodeEventEmitter: createChatbotV3RuntimeNodeEventEmitter({
        emit: (event) => {
          events.push(event as Record<string, unknown>);
        },
      }),
      agents: {},
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-bootstrap-explicit-1',
      sessionId: 'session-bootstrap-explicit-1',
      turnId: 'turn-bootstrap-explicit-1',
      message: 'Here are my documents',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      bootstrap: {
        message: 'Here are my documents',
        attachments: [{
          fileName: 'report.pdf',
          storageKey: 'chatbot/session-bootstrap-explicit-1/report.pdf',
        }],
      } as any,
    } as any);

    expect(result.runtimeDebug.replayLineage).toBeUndefined();

    const supervisorCompleted = events.find(
      (event) => event['node'] === 'Supervisor' && event['action'] === 'suggest' && event['status'] === 'completed',
    );
    const turnSummary = events.find(
      (event) => event['node'] === 'Turn' && event['action'] === 'turn_summary',
    );

    expect(supervisorCompleted?.['replayLineage']).toBeUndefined();
    expect(turnSummary?.['replayLineage']).toBeUndefined();
  });

  it('derives bootstrap replay lineage per call instead of reading mutable supervisor state', async () => {
    const staleLineageGetter = vi.fn(() => ({
      bootstrapOverride: 'direct_human_request_handoff' as const,
    }));

    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
          reason: 'attachments should stay on minimal triage',
        })),
        deriveDecisionLineage: vi.fn(() => null),
        getLastDecisionLineage: staleLineageGetter,
      } as any,
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {},
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-bootstrap-deterministic-1',
      sessionId: 'session-bootstrap-deterministic-1',
      turnId: 'turn-bootstrap-deterministic-1',
      message: 'Here are my documents',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-bootstrap-deterministic-1/report.pdf',
      }],
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      bootstrap: {
        message: 'Here are my documents',
        attachments: [{
          fileName: 'report.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-bootstrap-deterministic-1/report.pdf',
        }],
        canCreateHandoff: true,
      } as any,
    } as any);

    expect(result.runtimeDebug.replayLineage).toBeUndefined();
    expect(staleLineageGetter).not.toHaveBeenCalled();
  });

  it('ignores a stale caller current when statusSnapshot is present and minimal triage is incomplete', async () => {
    let capturedInput: Record<string, unknown> | undefined;
    let capturedDecisionInput: Record<string, unknown> | undefined;
    const recordsAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          'records.minimal_triage.complete': false,
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async (input) => {
          capturedInput = input as unknown as Record<string, unknown>;
          return {
            intent: 'progression' as const,
            suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
            reason: 'triage must stay first',
          };
        }),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn((input) => {
          capturedDecisionInput = input as unknown as Record<string, unknown>;
          return {
          action: 'STAY' as const,
          from: input.current ?? { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: input.current ?? { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          dispatchAgent: 'RecordsAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
          };
        }),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
        records: { status: vi.fn() },
        recommendation: {
          status: vi.fn(),
        },
        consult: {
          status: vi.fn(),
        },
        handoff: {
          status: vi.fn(),
        },
      } as any,
      agents: {
        RecordsAgent: recordsAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-current-derive-1',
      sessionId: 'session-current-derive-1',
      turnId: 'turn-current-derive-1',
      message: 'I need to keep going with triage.',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'completed',
        docUploadStatus: 'submitted',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        journeyCurrentPhase: 'active',
        minimalTriageComplete: false,
        conversationSummary: 'The user is still in minimal triage, even though the caller current is stale.',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      } as any,
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    } as any);

    expect(result.journey).toEqual({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
    expect(capturedInput).toMatchObject({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      conversationSummary: 'The user is still in minimal triage, even though the caller current is stale.',
      latestUserMessage: 'I need to keep going with triage.',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      availableReadDomains: ['records.status'],
    });
    expect(capturedDecisionInput).toMatchObject({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
    });
    expect(recordsAgent.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'records.status',
      input: {
        sessionId: 'session-current-derive-1',
      },
    }));
  });

  it('dispatches records.status instead of records.upload when attachments are present during minimal triage', async () => {
    const recordsAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
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
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
          reason: 'collect minimal triage first',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          dispatchAgent: 'RecordsAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecordsAgent: recordsAgent,
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-minimal-triage-attachments-1',
      sessionId: 'session-minimal-triage-attachments-1',
      turnId: 'turn-minimal-triage-attachments-1',
      message: 'Here is my report.',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-minimal-triage-attachments-1/report.pdf',
      }],
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    });

    expect(recordsAgent.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'records.status',
      input: {
        sessionId: 'session-minimal-triage-attachments-1',
      },
      meta: expect.objectContaining({
        task: expect.objectContaining({
          latestUserMessage: 'Here is my report.',
          mode: 'minimal_triage',
        }),
      }),
    }));
    expect(recordsAgent.execute).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'records.upload',
    }));
  });

  it('keeps later-stage attachment turns on the persisted medical-input stage', async () => {
    let capturedInput: Record<string, unknown> | undefined;
    const recordsAgent = {
      execute: vi.fn(async (action) => {
        capturedInput = action as unknown as Record<string, unknown>;
        return {
          status: 'ok' as const,
          data: {
            'records.minimal_triage.complete': true,
          },
        };
      }),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async (input) => {
          expect(input.current).toEqual({
            stage: 'COLLECT_MEDICAL_INPUTS',
            phase: 'active',
          });
          expect(input.currentStage).toBe('COLLECT_MEDICAL_INPUTS');

          return {
            intent: 'progression' as const,
            suggestedStage: 'COLLECT_MEDICAL_INPUTS' as const,
            reason: 'medical collection should continue',
          };
        }),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn((input) => ({
          action: 'STAY' as const,
          from: input.current ?? { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: input.current ?? { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          dispatchAgent: 'RecordsAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecordsAgent: recordsAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-medical-inputs-attachments-1',
      sessionId: 'session-medical-inputs-attachments-1',
      turnId: 'turn-medical-inputs-attachments-1',
      message: 'Here are my documents.',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-medical-inputs-attachments-1/report.pdf',
      }],
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [{ path: 'chatbot/session-medical-inputs-attachments-1/report.pdf', name: 'report.pdf' }],
      } as any,
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.selected': true,
        'process.explained': true,
      },
    });

    expect(result.journey.stage).not.toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
    expect(capturedInput).toEqual(expect.objectContaining({
      type: 'records.upload',
      input: expect.objectContaining({
        sessionId: 'session-medical-inputs-attachments-1',
      }),
    }));
  });

  it('lets supervisor request compact domain reads before returning the final proposal', async () => {
    const events: Array<Record<string, unknown>> = [];
    const eventEmitter = createChatbotV3RuntimeNodeEventEmitter({
      emit: (event) => {
        events.push(event as Record<string, unknown>);
      },
    });
    const recordsStatus = vi.fn(async () => ({
      status: 'ok' as const,
      data: {
        state: 'ready',
      },
    }));
    const recommendationStatus = vi.fn(async () => ({
      status: 'ok' as const,
      data: {
        state: 'processing',
      },
    }));
    const supervisor = {
      requestDomainReads: vi
        .fn()
        .mockResolvedValueOnce(['records.status', 'recommendation.status'] as const)
        .mockResolvedValueOnce(['recommendation.status'] as const),
      suggest: vi.fn(async (input) => ({
        intent: 'progression' as const,
        suggestedStage: 'RECOMMENDATION' as const,
        reason: (input as any).domainReadResults
          ? 'records are ready after explicit domain reads'
          : 'missing domain reads',
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor,
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
          matchedRuleId: 'rule-minimal-triage-complete' as const,
        })),
      },
      gateway: {
        records: {
          status: recordsStatus,
        },
        recommendation: {
          status: recommendationStatus,
        },
        consult: {
          status: vi.fn(),
        },
        handoff: {
          status: vi.fn(),
        },
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      nodeEventEmitter: eventEmitter,
      agents: {
        RecommendationAgent: {
          execute: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              recommendations: [{ hospitalId: 'hospital-5' }],
            },
          })),
        },
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-supervisor-reads-1',
      sessionId: 'session-supervisor-reads-1',
      turnId: 'turn-supervisor-reads-1',
      message: 'Can you recommend a hospital for me?',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    });

    expect(supervisor.requestDomainReads).toHaveBeenCalledTimes(2);
    expect(recordsStatus).toHaveBeenCalledWith({ sessionId: 'session-supervisor-reads-1' });
    expect(recommendationStatus).toHaveBeenCalledWith({ sessionId: 'session-supervisor-reads-1' });
    expect(supervisor.suggest).toHaveBeenCalledWith(expect.objectContaining({
      domainReadResults: {
        'records.status': {
          state: 'ready',
        },
        'recommendation.status': {
          state: 'processing',
        },
      },
    }));
    expect(result.journey).toEqual({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(result.runtimeDebug).toMatchObject({
      replayLineage: {
        matchedRuleId: 'rule-minimal-triage-complete',
        supervisorReadDomainRequests: [
          ['records.status', 'recommendation.status'],
          ['recommendation.status'],
        ],
        supervisorReadDomainsResolved: ['records.status', 'recommendation.status'],
      },
    });

    const turnSummary = events.find(
      (event) => event['node'] === 'Turn' && event['action'] === 'turn_summary',
    );
    expect(turnSummary).toMatchObject({
      replayLineage: {
        matchedRuleId: 'rule-minimal-triage-complete',
        supervisorReadDomainRequests: [
          ['records.status', 'recommendation.status'],
          ['recommendation.status'],
        ],
        supervisorReadDomainsResolved: ['records.status', 'recommendation.status'],
      },
    });
  });

  it('preserves collected replay lineage when supervisor suggestion fails after domain reads', async () => {
    const events: Array<Record<string, unknown>> = [];
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        requestDomainReads: vi
          .fn()
          .mockResolvedValueOnce(['records.status'] as const)
          .mockResolvedValueOnce([] as const),
        suggest: vi.fn(async () => {
          throw new Error('supervisor failed after reads');
        }),
        deriveDecisionLineage: vi.fn(() => null),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        records: {
          status: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              state: 'ready',
            },
          })),
        },
        recommendation: { status: vi.fn() },
        consult: { status: vi.fn() },
        handoff: { status: vi.fn() },
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      nodeEventEmitter: createChatbotV3RuntimeNodeEventEmitter({
        emit: (event) => {
          events.push(event as Record<string, unknown>);
        },
      }),
      agents: {},
    });

    await expect(runtime.handleTurn({
      traceId: 'trace-supervisor-reads-fail-1',
      sessionId: 'session-supervisor-reads-fail-1',
      turnId: 'turn-supervisor-reads-fail-1',
      message: 'Can you recommend a hospital for me?',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    })).rejects.toThrow('supervisor failed after reads');

    expect(events).toContainEqual(expect.objectContaining({
      node: 'Supervisor',
      action: 'suggest',
      status: 'failed',
      replayLineage: {
        supervisorReadDomainRequests: [['records.status']],
        supervisorReadDomainsResolved: ['records.status'],
      },
    }));
  });

  it('preserves collected replay lineage when authority fails after domain reads', async () => {
    const events: Array<Record<string, unknown>> = [];
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        requestDomainReads: vi
          .fn()
          .mockResolvedValueOnce(['records.status'] as const)
          .mockResolvedValueOnce([] as const),
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'records are ready',
        })),
        deriveDecisionLineage: vi.fn(() => null),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => {
          throw new Error('authority failed after reads');
        }),
      },
      gateway: {
        records: {
          status: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              state: 'ready',
            },
          })),
        },
        recommendation: { status: vi.fn() },
        consult: { status: vi.fn() },
        handoff: { status: vi.fn() },
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      nodeEventEmitter: createChatbotV3RuntimeNodeEventEmitter({
        emit: (event) => {
          events.push(event as Record<string, unknown>);
        },
      }),
      agents: {},
    });

    await expect(runtime.handleTurn({
      traceId: 'trace-authority-reads-fail-1',
      sessionId: 'session-authority-reads-fail-1',
      turnId: 'turn-authority-reads-fail-1',
      message: 'Can you recommend a hospital for me?',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    })).rejects.toThrow('authority failed after reads');

    expect(events).toContainEqual(expect.objectContaining({
      node: 'JourneyRuntimeAuthority',
      action: 'decide',
      status: 'failed',
      replayLineage: {
        supervisorReadDomainRequests: [['records.status']],
        supervisorReadDomainsResolved: ['records.status'],
      },
    }));
  });

  it('requests at most one status read before finalizing the supervisor proposal and keeps the supervisor input minimal', async () => {
    const requestedReadDomains: Array<readonly string[]> = [];
    const supervisorInputs: Array<Record<string, unknown>> = [];
    const finalSupervisorInputs: Array<Record<string, unknown>> = [];

    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        requestDomainReads: vi
          .fn()
          .mockImplementationOnce(async (input) => {
            requestedReadDomains.push(input.availableReadDomains);
            supervisorInputs.push(input as unknown as Record<string, unknown>);
            return ['recommendation.status'] as const;
          }),
        suggest: vi.fn(async (input) => {
          finalSupervisorInputs.push(input as unknown as Record<string, unknown>);
          return {
            intent: 'progression' as const,
            suggestedStage: 'RECOMMENDATION' as const,
            dispatchAgent: 'RecommendationAgent' as const,
            reason: 'records are ready',
            task: {
              goal: 'Generate hospital recommendations for this user.',
              latestUserMessage: 'Please recommend a hospital.',
              necessaryFacts: {
                'intake.condition': 'lung cancer',
                'records.minimal_triage.complete': true,
              },
            },
          };
        }),
      } as any,
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        records: {
          status: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              state: 'COMPLETED',
            },
          })),
        },
        recommendation: {
          status: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              state: 'NOT_STARTED',
            },
          })),
        },
        consult: {
          status: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              state: 'NOT_STARTED',
            },
          })),
        },
        handoff: {
          create: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              created: true,
            },
          })),
        },
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: {
          execute: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              recommendations: [{ hospitalId: 'hospital-4' }],
            },
          })),
        },
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-read-loop-1',
      sessionId: 'session-read-loop-1',
      turnId: 'turn-read-loop-1',
      message: 'Please recommend a hospital.',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'submitted',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        minimalTriageComplete: true,
        processExplained: false,
        recommendationGenerated: false,
        recommendationSelected: false,
        consultCompleted: false,
        handoffActive: false,
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        conversationSummary: 'The user just completed minimal triage and is waiting for recommendations.',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      } as any,
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    } as any);

    expect(result.journey.stage).toBe('RECOMMENDATION');
    expect(requestedReadDomains).toEqual([
      ['recommendation.status'],
    ]);
    expect(supervisorInputs[0]).toMatchObject({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      currentStage: 'RECOMMENDATION',
      conversationSummary: 'The user just completed minimal triage and is waiting for recommendations.',
      latestUserMessage: 'Please recommend a hospital.',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      availableReadDomains: ['recommendation.status'],
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': false,
        'recommendation.generated': false,
        'recommendation.selected': false,
        'consult.completed': false,
        'handoff.active': false,
      },
    });
    expect(finalSupervisorInputs[0]).toMatchObject({
      domainReadResults: {
        'recommendation.status': {
          state: 'NOT_STARTED',
        },
      },
    });
  });

  it('emits a canonical truth patch when authority confirms the process explanation path', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'unknown' as const,
          suggestedStage: 'EXPLAIN_PROCESS' as const,
          reason: 'present the process overview',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          dispatchAgent: null as const,
          dispatchSource: 'journey-runtime-authority' as const,
          write: {
            authority: 'journey-runtime-authority' as const,
            stage: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
            factsPatch: {
              'process.explained': true,
            },
          },
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {},
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-write-intent-derive-1',
      sessionId: 'session-write-intent-derive-1',
      turnId: 'turn-write-intent-derive-1',
      message: 'Please explain the process.',
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
    });

    expect(result.writeIntents).toEqual(expect.objectContaining({
      canonicalTruthPatch: {
        processExplained: true,
      },
      conversationSummaryPatch: {
        contract: CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT,
        statusPatch: expect.objectContaining({
          conversationSummary: 'stage=EXPLAIN_PROCESS | user=Please explain the process. | assistant=Here is the process: first, review the hospital recommendation, then I will explain the Medora medical-travel process...',
          lastUserMessageAt: expect.any(Date),
          lastAssistantMessageAt: expect.any(Date),
        }),
      },
    }));
    expect(result.render).toEqual({
      path: 'PROCESS_OVERVIEW',
    });
  });

  it('renders process overview for a system-rendered EXPLAIN_PROCESS progression with null dispatch', async () => {
    const authority = new JourneyRuntimeAuthorityService();
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'EXPLAIN_PROCESS' as const,
          dispatchAgent: null as any,
          reason: 'present the process overview',
        })),
      },
      journeyRuntimeAuthority: {
        decide(input) {
          const decision = authority.decide({
            current: input.current ?? {
              stage: input.currentStage ?? 'COLLECT_MINIMAL_MEDICAL_FACTS',
              phase: 'active',
            },
            proposal: input.suggestion,
            facts: input.facts,
            handoff: input.handoff,
            bootstrap: input.bootstrap,
            intake: input.intake,
            statusSnapshot: input.statusSnapshot,
          });

          if (decision.outcome === 'DENY') {
            return {
              action: 'STAY' as const,
              from: decision.from,
              to: decision.to,
              dispatchSource: 'journey-runtime-authority' as const,
              whyNotSkip: decision.reason,
              write: decision.write,
            };
          }

          return {
            action: decision.action === 'REPEAT' ? 'STAY' : 'ADVANCE' as const,
            from: decision.from,
            to: decision.to,
            dispatchAgent: decision.dispatch.outcome === 'ALLOW'
              ? decision.dispatch.agent
              : undefined,
            dispatchSource: 'journey-runtime-authority' as const,
            write: decision.write,
          };
        },
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {},
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-write-intent-derive-null-dispatch-1',
      sessionId: 'session-write-intent-derive-null-dispatch-1',
      turnId: 'turn-write-intent-derive-null-dispatch-1',
      message: 'What is next?',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'post',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [],
      } as any,
      facts: {
        'records.minimal_triage.complete': true,
      },
    });

    expect(result.decision.dispatchAgent).toBeNull();
    expect(result.render).toEqual({
      path: 'PROCESS_OVERVIEW',
    });
    expect(result.writeIntents?.statusPatch?.journeyCurrentStage).toBe('EXPLAIN_PROCESS');

    const response = composeResponse({
      body: {
        sessionId: 'session-write-intent-derive-null-dispatch-1',
        message: 'What is next?',
      } as any,
      result,
      sessionStatusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'post',
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      } as any,
    });

    expect(response.messages[0]?.text).toBe(PROCESS_OVERVIEW_TEXT);
    expect(response.messages[0]?.text).not.toContain('reliable FAQ answer');
    expect(response.journey).toEqual({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
  });

  it('persists the null-dispatch EXPLAIN_PROCESS state through the real Hono route', async () => {
    const app = new Hono();
    app.route('/', chatbotV3PublicRoutes);
    app.onError((err, c) => {
      if (err.name === 'ZodError' && 'errors' in err) {
        return c.json({
          error: 'Validation failed',
          code: 'VALIDATION_FAILED',
          details: (err as Error & { errors: unknown[] }).errors,
        }, 400);
      }

      throw err;
    });

    routeMockServices.aiChatSessionRepo.patchStatus.mockClear();
    routeMockServices.aiChatSessionRepo.save.mockClear();
    routeMockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-route-process-overview-1',
      sessionId: 'session-v3-route-process-overview-1',
      site: 'china',
      sessionSecretHash: createHash('sha256').update('secret-v3-route-process-overview-1').digest('hex'),
      patientId: null,
      difyConversationId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'post',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [],
        processExplained: false,
        conversationSummary: 'stage=RECOMMENDATION | user=What is next? | assistant=You should review your recommendation first.',
      },
    });

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-medora-site': 'china',
        Cookie: 'chatbot_session_secret=secret-v3-route-process-overview-1',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-route-process-overview-1',
        message: 'What is next?',
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages[0]?.text).toBe(PROCESS_OVERVIEW_TEXT);
    expect(body.journey).toEqual({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
    expect(routeMockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-route-process-overview-1',
      'china',
      expect.objectContaining({
        journeyCurrentStage: 'EXPLAIN_PROCESS',
        journeyCurrentPhase: 'active',
        processExplained: true,
      }),
    );

    routeMockServices.idempotencyExecutor.execute.mockClear();
    routeMockServices.aiChatSessionRepo.findBySessionId.mockClear();
    routeMockServices.aiChatSessionRepo.save.mockClear();
    routeMockServices.aiChatSessionRepo.patchStatus.mockClear();
  });

  it('does not emit processExplained when faq dispatch returns a bounded faq answer', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'faq' as const,
          suggestedStage: 'EXPLAIN_PROCESS' as const,
          reason: 'faq answer stays in explain process',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          dispatchAgent: 'FaqAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
          write: {
            authority: 'journey-runtime-authority' as const,
            stage: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
            factsPatch: {
              'process.explained': true,
            },
          },
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        FaqAgent: {
          execute: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              answer: 'Online consultations are usually arranged within 24 hours.',
              citedFaqIds: ['faq-1'],
              confidence: 'high',
              'process.explained': true,
            },
          })),
        },
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-write-intent-derive-2',
      sessionId: 'session-write-intent-derive-2',
      turnId: 'turn-write-intent-derive-2',
      message: 'How long does online consultation usually take to schedule?',
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'EXPLAIN_PROCESS',
        journeyCurrentPhase: 'active',
      } as any,
    });

    expect(result.writeIntents).toEqual(expect.objectContaining({
      canonicalTruthPatch: {},
      conversationSummaryPatch: {
        contract: CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT,
        statusPatch: {
          conversationSummary: 'stage=EXPLAIN_PROCESS | user=How long does online consultation usually take to schedule? | assistant=Online consultations are usually arranged within 24 hours.',
          lastUserMessageAt: expect.any(Date),
          lastAssistantMessageAt: expect.any(Date),
        },
      },
    }));
    expect(result.render).toEqual({
      path: 'FAQ_ANSWER',
    });
  });

  it('summarizes the persisted journey stage instead of the raw result journey on preserved revisits', () => {
    const summaryPatch = buildConversationSummaryPatch({
      result: {
        suggestion: {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'revisit the process explanation without changing the primary stage',
        },
        decision: {
          action: 'ADVANCE',
          from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
          write: {
            authority: 'journey-runtime-authority',
            stage: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
            factsPatch: {},
          },
        },
        journey: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        render: { path: 'FAQ_ANSWER' },
        dispatchResult: {
          status: 'ok',
          data: {
            answer: 'Here is the process again.',
            citedFaqIds: ['faq-process-1'],
            confidence: 'high',
          },
        },
        turnOutcome: {
          status: 'ok',
          recoverableErrorCode: null,
        },
        runtimeDebug: {
          traceId: 'trace-summary-preserved-stage-1',
          idempotencyKey: 'idem-summary-preserved-stage-1',
        },
      } as any,
      latestUserMessage: 'Please explain the process again.',
      summaryUpdatedAt: new Date('2026-04-20T00:00:00.000Z'),
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        processExplained: true,
      } as any,
    });

    expect(summaryPatch.statusPatch.conversationSummary).toContain(
      'stage=COLLECT_MEDICAL_INPUTS',
    );
    expect(summaryPatch.statusPatch.conversationSummary).not.toContain(
      'stage=EXPLAIN_PROCESS',
    );
  });

  it('preserves COLLECT_MEDICAL_INPUTS while dispatching a recovered faq detour with attachments', async () => {
    const faqAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          answer: 'We are open from 9 AM to 6 PM Monday through Saturday.',
          citedFaqIds: ['faq-hours-1'],
          confidence: 'high' as const,
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: new SupervisorService(),
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          dispatchAgent: 'FaqAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
          write: {
            authority: 'journey-runtime-authority' as const,
            stage: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
            factsPatch: {
              'process.explained': true,
            },
          },
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        FaqAgent: faqAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-faq-detour-records-1',
      sessionId: 'session-faq-detour-records-1',
      turnId: 'turn-faq-detour-records-1',
      message: 'What are your office hours?',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-faq-detour-records-1/report.pdf',
      }],
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'continue collecting records',
      },
      bootstrap: {
        message: 'What are your office hours?',
        attachments: [{
          fileName: 'report.pdf',
        }],
      },
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.selected': true,
        'process.explained': true,
      },
    });

    expect(result.suggestion).toMatchObject({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
    });
    expect(result.decision).toMatchObject({
      action: 'STAY',
      from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      dispatchAgent: 'FaqAgent',
    });
    expect(result.journey).toEqual({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(result.writeIntents).toEqual(expect.objectContaining({
      canonicalTruthPatch: {},
    }));
    expect(result.render).toEqual({
      path: 'FAQ_ANSWER',
    });
  });

  it('emits a canonical truth patch when the records worker completes minimal triage', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
          reason: 'minimal triage remains active',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          dispatchAgent: 'RecordsAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecordsAgent: {
          execute: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              'records.minimal_triage.complete': true,
            },
          })),
        },
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-write-intent-derive-3',
      sessionId: 'session-write-intent-derive-3',
      turnId: 'turn-write-intent-derive-3',
      message: 'My reports are uploaded.',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    });

    expect(result.writeIntents).toEqual(expect.objectContaining({
      canonicalTruthPatch: {
        minimalTriageComplete: true,
      },
      conversationSummaryPatch: {
        contract: CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT,
        statusPatch: {
          conversationSummary: 'stage=COLLECT_MINIMAL_MEDICAL_FACTS | user=My reports are uploaded. | assistant=Please share the key medical facts and any records you already have so I can guide the next step.',
          lastUserMessageAt: expect.any(Date),
          lastAssistantMessageAt: expect.any(Date),
        },
      },
    }));
    expect(result.render).toEqual({
      path: 'STAGE_GUIDANCE',
    });
  });

  it('emits snapshot-derived canonical truth backfill from runtime-owned write intents', async () => {
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'consult' as const,
          suggestedStage: 'ONLINE_CONSULT' as const,
          reason: 'continue from selected recommendation',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'ONLINE_CONSULT' as const, phase: 'active' as const },
          to: { stage: 'ONLINE_CONSULT' as const, phase: 'active' as const },
          dispatchAgent: 'ConsultAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        ConsultAgent: {
          execute: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              state: 'completed',
            },
          })),
        },
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-write-intent-derive-4',
      sessionId: 'session-write-intent-derive-4',
      turnId: 'turn-write-intent-derive-4',
      message: 'What happens next?',
      current: {
        stage: 'ONLINE_CONSULT',
        phase: 'active',
      },
      statusSnapshot: {
        recommendationStatus: 'accepted',
        consultationStatus: 'completed',
        packageStatus: 'accepted',
        recommendationSelected: false,
        consultCompleted: false,
        processExplained: true,
      } as any,
    });

    expect(result.writeIntents).toEqual(expect.objectContaining({
      canonicalTruthPatch: expect.objectContaining({
        recommendationSelected: true,
        consultCompleted: true,
      }),
      conversationSummaryPatch: {
        contract: CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT,
        statusPatch: {
          conversationSummary: 'stage=ONLINE_CONSULT | user=What happens next? | assistant=I checked the online consultation stage for this session.',
          lastUserMessageAt: expect.any(Date),
          lastAssistantMessageAt: expect.any(Date),
        },
      },
    }));
  });

  it('emits node events for supervisor/journey-runtime-authority/subagent/tool and turn_summary', async () => {
    const events: Array<Record<string, unknown>> = [];
    const eventEmitter = createChatbotV3RuntimeNodeEventEmitter({
      emit: (event) => {
        events.push(event as Record<string, unknown>);
      },
    });

    let nowMs = 0;
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'continue to recommendation',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: {
          execute: vi.fn(async () => ({
            status: 'ok' as const,
            data: {
              recommendations: [{ hospitalId: 'hospital-3' }],
            },
          })),
        },
      },
      nodeEventEmitter: eventEmitter,
      now: () => {
        nowMs += 5;
        return nowMs;
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-events-1',
      sessionId: 'session-events-1',
      site: 'china',
      turnId: 'turn-events-1',
      message: 'continue',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      facts: {
        'records.saved': true,
      },
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: 'Supervisor', action: 'suggest', status: 'started' }),
      expect.objectContaining({ node: 'Supervisor', action: 'suggest', status: 'completed' }),
      expect.objectContaining({ node: 'JourneyRuntimeAuthority', action: 'decide', status: 'started' }),
      expect.objectContaining({ node: 'JourneyRuntimeAuthority', action: 'decide', status: 'completed' }),
      expect.objectContaining({ node: 'Subagent', action: 'RecommendationAgent', status: 'started' }),
      expect.objectContaining({ node: 'Subagent', action: 'RecommendationAgent', status: 'completed' }),
      expect.objectContaining({ node: 'Tool', action: 'recommendation.generate', status: 'started' }),
      expect.objectContaining({ node: 'Tool', action: 'recommendation.generate', status: 'completed' }),
      expect.objectContaining({ node: 'Turn', action: 'turn_summary', status: 'completed' }),
    ]));

    for (const event of events) {
      expect(event).toMatchObject({
        traceId: 'trace-events-1',
        sessionId: 'session-events-1',
        turnId: 'turn-events-1',
        node: expect.any(String),
        action: expect.any(String),
        status: expect.any(String),
      });
      expect(event['latencyMs']).toEqual(expect.any(Number));
      expect(event['occurredAt']).toEqual(expect.any(String));
    }

    const turnSummary = events.find(
      (event) => event['node'] === 'Turn' && event['action'] === 'turn_summary',
    );
    expect(turnSummary).toMatchObject({
      decisionAction: 'ADVANCE',
      fromStage: 'COLLECT_MEDICAL_INPUTS',
      toStage: 'RECOMMENDATION',
      outcomeStatus: 'ok',
      degradedErrorCode: null,
    });
  });

  it('falls back through status.query when agent execution times out', async () => {
    const events: Array<Record<string, unknown>> = [];
    const eventEmitter = createChatbotV3RuntimeNodeEventEmitter({
      emit: (event) => {
        events.push(event as Record<string, unknown>);
      },
    });

    const statusQuery = vi.fn(async () => ({
      status: 'ok' as const,
      data: {
        snapshot: {
          records: { state: 'processing' },
        },
      },
    }));
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'continue to recommendation',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: { query: statusQuery },
      } as any,
      agents: {
        RecommendationAgent: {
          execute: vi.fn(async () => ({
            status: 'error' as const,
            code: 'TIMEOUT' as const,
            message: 'recommendation.generate timed out',
          })),
        },
      },
      nodeEventEmitter: eventEmitter,
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-timeout-1',
      sessionId: 'session-1',
      site: 'china',
      turnId: 'turn-2',
      message: 'What should I do next?',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
    });

    expect(statusQuery).toHaveBeenCalledWith({ sessionId: 'session-1', site: 'china' });
    expect(result.turnOutcome).toEqual({
      status: 'degraded',
      recoverableErrorCode: 'TIMEOUT',
    });
    expect(result.fallbackStatus).toEqual({
      status: 'ok',
      data: {
        snapshot: {
          records: { state: 'processing' },
        },
      },
    });
    expect(result.journey).toEqual({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        node: 'Tool',
        action: 'recommendation.generate',
        status: 'timeout',
        errorCode: 'TIMEOUT',
      }),
      expect.objectContaining({
        node: 'Subagent',
        action: 'RecommendationAgent',
        status: 'timeout',
        errorCode: 'TIMEOUT',
      }),
      expect.objectContaining({
        node: 'Turn',
        action: 'turn_summary',
        status: 'completed',
        decisionAction: 'ADVANCE',
        fromStage: 'COLLECT_MEDICAL_INPUTS',
        toStage: 'RECOMMENDATION',
        outcomeStatus: 'degraded',
        degradedErrorCode: 'TIMEOUT',
      }),
    ]));
  });

  it('dispatches actions only from journey runtime authority decisions', async () => {
    const handoffAgent = {
      execute: vi.fn(),
    };
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [{ hospitalId: 'hospital-2' }],
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'handoff' as const,
          suggestedStage: 'HUMAN_HANDOFF' as const,
          reason: 'supervisor wants a human',
          dispatchAgent: 'HandoffAgent',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent,
        HandoffAgent: handoffAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-dispatch-1',
      sessionId: 'session-9',
      site: 'china',
      turnId: 'turn-4',
      message: 'I need help',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
    });

    const dispatchedAction = recommendationAgent.execute.mock.calls[0]?.[0];
    expect(dispatchedAction).toEqual(expect.objectContaining({
      type: 'recommendation.generate',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          agent: 'RecommendationAgent',
          fromStage: 'COLLECT_MEDICAL_INPUTS',
          toStage: 'RECOMMENDATION',
        }),
      }),
    }));
    expect(dispatchedAction?.meta).not.toHaveProperty('historySummary');
    expect(dispatchedAction?.input).not.toHaveProperty('context');
    expect(handoffAgent.execute).not.toHaveBeenCalled();
    expect(result.runtimeDebug.lastDispatchSource).toBe('journey-runtime-authority');
    expect(result.runtimeDebug.traceId).toBe('trace-dispatch-1');
  });

  it('passes structured worker task metadata only to dispatched agents', async () => {
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [{ hospitalId: 'hospital-3' }],
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'continue',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent,
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-taskprompt-1',
      sessionId: 'session-10',
      site: 'china',
      turnId: 'turn-10',
      message: 'please continue',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      facts: {
        'records.saved': true,
      },
    });

    const call = recommendationAgent.execute.mock.calls[0]?.[0];
    expect(call?.meta?.task).toEqual(expect.objectContaining({
      agent: 'RecommendationAgent',
      fromStage: 'COLLECT_MEDICAL_INPUTS',
      toStage: 'RECOMMENDATION',
      latestUserMessage: 'please continue',
      recommendationTask: 'generate',
    }));
    expect(call?.meta).not.toHaveProperty('historySummary');
  });

  it('dispatches structured worker task metadata instead of a legacy taskPrompt string envelope', async () => {
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [{ hospitalId: 'hospital-3' }],
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'continue',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent,
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-task-structured-1',
      sessionId: 'session-10b',
      turnId: 'turn-10b',
      message: 'please continue',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      facts: {
        'records.saved': true,
      },
    });

    const call = recommendationAgent.execute.mock.calls[0]?.[0];
    expect(call?.meta?.task).toEqual({
      agent: 'RecommendationAgent',
      fromStage: 'COLLECT_MEDICAL_INPUTS',
      toStage: 'RECOMMENDATION',
      intent: 'progression',
      supervisorReason: 'continue',
      latestUserMessage: 'please continue',
      recommendationTask: 'generate',
    });
    expect(call?.meta).not.toHaveProperty('taskPrompt');
  });

  it('keeps recommendation repeats and later revisits on the recommendation.generate worker contract', async () => {
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [{ hospitalId: 'hospital-repeat-1' }],
        },
      })),
    };
    const journeyRuntimeAuthority = {
      decide: vi
        .fn()
        .mockReturnValueOnce({
          action: 'ADVANCE' as const,
          from: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })
        .mockReturnValueOnce({
          action: 'ADVANCE' as const,
          from: { stage: 'ONLINE_CONSULT' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        }),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'refresh recommendations',
        })),
      },
      journeyRuntimeAuthority,
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent,
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-recommend-repeat-1',
      sessionId: 'session-recommend-repeat-1',
      turnId: 'turn-recommend-repeat-1',
      message: 'Show me updated recommendations.',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      facts: {
        'recommendation.generated': true,
      },
    });
    await runtime.handleTurn({
      traceId: 'trace-recommend-repeat-2',
      sessionId: 'session-recommend-repeat-2',
      turnId: 'turn-recommend-repeat-2',
      message: 'Let us go back to recommendations again.',
      current: {
        stage: 'ONLINE_CONSULT',
        phase: 'active',
      },
      facts: {
        'recommendation.generated': true,
        'consult.completed': false,
      },
    });

    expect(recommendationAgent.execute).toHaveBeenCalledTimes(2);
    expect(recommendationAgent.execute.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      type: 'recommendation.generate',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          recommendationTask: 'refresh',
        }),
      }),
    }));
    expect(recommendationAgent.execute.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      type: 'recommendation.generate',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          recommendationTask: 'revisit',
        }),
      }),
    }));
  });

  it('classifies deictic recommendation follow-ups as compare or explain instead of generic refresh', async () => {
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [{ hospitalId: 'hospital-repeat-1' }],
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'stay in recommendation',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent,
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-recommend-followup-1',
      sessionId: 'session-recommend-followup-1',
      turnId: 'turn-recommend-followup-1',
      message: 'Compare them.',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      facts: {
        'recommendation.generated': true,
      },
    });
    await runtime.handleTurn({
      traceId: 'trace-recommend-followup-2',
      sessionId: 'session-recommend-followup-2',
      turnId: 'turn-recommend-followup-2',
      message: 'Why this one?',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      facts: {
        'recommendation.generated': true,
      },
    });
    await runtime.handleTurn({
      traceId: 'trace-recommend-followup-3',
      sessionId: 'session-recommend-followup-3',
      turnId: 'turn-recommend-followup-3',
      message: 'Which is best?',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      facts: {
        'recommendation.generated': true,
      },
    });
    await runtime.handleTurn({
      traceId: 'trace-recommend-followup-4',
      sessionId: 'session-recommend-followup-4',
      turnId: 'turn-recommend-followup-4',
      message: 'Which one is better?',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      facts: {
        'recommendation.generated': true,
      },
    });
    await runtime.handleTurn({
      traceId: 'trace-recommend-followup-5',
      sessionId: 'session-recommend-followup-5',
      turnId: 'turn-recommend-followup-5',
      message: 'Why this hospital?',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      facts: {
        'recommendation.generated': true,
      },
    });

    expect(recommendationAgent.execute.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      type: 'recommendation.generate',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          recommendationTask: 'compare',
        }),
      }),
    }));
    expect(recommendationAgent.execute.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      type: 'recommendation.generate',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          recommendationTask: 'explain',
        }),
      }),
    }));
    expect(recommendationAgent.execute.mock.calls[2]?.[0]).toEqual(expect.objectContaining({
      type: 'recommendation.generate',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          recommendationTask: 'compare',
        }),
      }),
    }));
    expect(recommendationAgent.execute.mock.calls[3]?.[0]).toEqual(expect.objectContaining({
      type: 'recommendation.generate',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          recommendationTask: 'compare',
        }),
      }),
    }));
    expect(recommendationAgent.execute.mock.calls[4]?.[0]).toEqual(expect.objectContaining({
      type: 'recommendation.generate',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          recommendationTask: 'explain',
        }),
      }),
    }));
  });

  it('dispatches COLLECT_MEDICAL_INPUTS records turns with structured collection-mode metadata', async () => {
    const recordsAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          'records.minimal_triage.complete': true,
          collectionPrompt: 'Please upload any records you already have.',
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'COLLECT_MEDICAL_INPUTS' as const,
          reason: 'continue collecting records',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          dispatchAgent: 'RecordsAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecordsAgent: recordsAgent,
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-records-collect-1',
      sessionId: 'session-records-collect-1',
      turnId: 'turn-records-collect-1',
      message: 'I can share more reports.',
      statusSnapshot: {
        minimalTriageComplete: true,
      } as any,
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    });

    const call = recordsAgent.execute.mock.calls[0]?.[0];
    expect(call?.type).toBe('records.status');
    expect(call?.meta?.task).toEqual(expect.objectContaining({
      agent: 'RecordsAgent',
      fromStage: 'COLLECT_MEDICAL_INPUTS',
      toStage: 'COLLECT_MEDICAL_INPUTS',
      latestUserMessage: 'I can share more reports.',
      mode: 'medical_collection',
      minimalTriageComplete: true,
    }));
  });

  it('falls back to caller facts for collection-mode triage truth only when statusSnapshot is absent', async () => {
    const recordsAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          'records.minimal_triage.complete': true,
          collectionPrompt: 'Please upload any records you already have.',
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'COLLECT_MEDICAL_INPUTS' as const,
          reason: 'continue collecting records',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          dispatchAgent: 'RecordsAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecordsAgent: recordsAgent,
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-records-collect-facts-fallback-1',
      sessionId: 'session-records-collect-facts-fallback-1',
      turnId: 'turn-records-collect-facts-fallback-1',
      message: 'I can share more reports.',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    });

    const call = recordsAgent.execute.mock.calls[0]?.[0];
    expect(call?.meta?.task).toEqual(expect.objectContaining({
      mode: 'medical_collection',
      minimalTriageComplete: true,
    }));
  });

  it('prefers statusSnapshot triage completion over stale false facts before progressing to recommendation', async () => {
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [{ hospitalId: 'hospital-1' }],
        },
      })),
    };
    const authority = new JourneyRuntimeAuthorityService();
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: new SupervisorService(),
      journeyRuntimeAuthority: {
        decide(input) {
          const decision = authority.decide({
            current: input.current ?? {
              stage: input.currentStage ?? 'COLLECT_MINIMAL_MEDICAL_FACTS',
              phase: 'active',
            },
            proposal: input.suggestion,
            facts: input.facts,
            handoff: input.handoff,
            bootstrap: input.bootstrap,
            intake: input.intake,
            statusSnapshot: input.statusSnapshot,
          });

          if (decision.outcome === 'DENY') {
            return {
              action: 'STAY' as const,
              from: decision.from,
              to: decision.to,
              dispatchSource: 'journey-runtime-authority' as const,
              whyNotSkip: decision.reason,
              write: decision.write,
            };
          }

          return {
            action: decision.action === 'REPEAT' ? 'STAY' : 'ADVANCE' as const,
            from: decision.from,
            to: decision.to,
            dispatchAgent: decision.dispatch.outcome === 'ALLOW'
              ? decision.dispatch.agent
              : undefined,
            dispatchSource: 'journey-runtime-authority' as const,
            write: decision.write,
          };
        },
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-summary-backed-triage-1',
      sessionId: 'session-summary-backed-triage-1',
      turnId: 'turn-summary-backed-triage-1',
      message: 'Please recommend hospitals for me.',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
        conversationSummary: 'Minimal triage answers are already summarized.',
      } as any,
      facts: {
        'records.minimal_triage.complete': false,
      },
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
    });

    expect(result.suggestion.suggestedStage).toBe('RECOMMENDATION');
    expect(result.decision.to).toEqual({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(recommendationAgent.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'recommendation.generate',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          agent: 'RecommendationAgent',
          toStage: 'RECOMMENDATION',
          recommendationBasis: 'INTAKE_AND_FOLLOW_UP_SUMMARY',
          minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        }),
      }),
    }));
  });

  it('does not progress to recommendation from minimalTriageComplete alone when structured triage state is absent', async () => {
    const recordsAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          collectionPrompt: 'Please answer the triage questions first.',
        },
      })),
    };
    const authority = new JourneyRuntimeAuthorityService();
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: new SupervisorService(),
      journeyRuntimeAuthority: {
        decide(input) {
          const decision = authority.decide({
            current: input.current ?? {
              stage: input.currentStage ?? 'COLLECT_MINIMAL_MEDICAL_FACTS',
              phase: 'active',
            },
            proposal: input.suggestion,
            facts: input.facts,
            handoff: input.handoff,
            bootstrap: input.bootstrap,
            intake: input.intake,
            statusSnapshot: input.statusSnapshot,
          });

          if (decision.outcome === 'DENY') {
            return {
              action: 'STAY' as const,
              from: decision.from,
              to: decision.to,
              dispatchSource: 'journey-runtime-authority' as const,
              whyNotSkip: decision.reason,
              write: decision.write,
            };
          }

          return {
            action: decision.action === 'REPEAT' ? 'STAY' : 'ADVANCE' as const,
            from: decision.from,
            to: decision.to,
            dispatchAgent: decision.dispatch.outcome === 'ALLOW'
              ? decision.dispatch.agent
              : undefined,
            dispatchSource: 'journey-runtime-authority' as const,
            write: decision.write,
          };
        },
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecordsAgent: recordsAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-minimal-triage-boolean-alias-1',
      sessionId: 'session-minimal-triage-boolean-alias-1',
      turnId: 'turn-minimal-triage-boolean-alias-1',
      message: 'Please recommend hospitals for me.',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      statusSnapshot: {
        minimalTriageComplete: true,
        conversationSummary: 'Legacy boolean says triage is complete.',
      } as any,
      facts: {
        'records.minimal_triage.complete': true,
      },
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
    });

    expect(result.suggestion.suggestedStage).toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
    expect(result.decision.to).toEqual({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
    expect(recordsAgent.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'records.status',
      meta: expect.objectContaining({
        task: expect.objectContaining({
          agent: 'RecordsAgent',
          toStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
          minimalTriageComplete: true,
        }),
      }),
    }));
  });

  it('dispatches a recovered later-stage FAQ question to FaqAgent without overwriting the persisted primary stage', async () => {
    const faqAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          answer: 'Our office hours are Monday to Friday, 9am to 6pm.',
          citedFaqIds: ['faq-hours-1'],
          confidence: 'high' as const,
        },
      })),
    };
    const authority = new JourneyRuntimeAuthorityService();
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: new SupervisorService(),
      journeyRuntimeAuthority: {
        decide(input) {
          const decision = authority.decide({
            current: input.current ?? {
              stage: input.currentStage ?? 'COLLECT_MINIMAL_MEDICAL_FACTS',
              phase: 'active',
            },
            proposal: input.suggestion,
            facts: input.facts,
            handoff: input.handoff,
            bootstrap: input.bootstrap,
            intake: input.intake,
            statusSnapshot: input.statusSnapshot,
          });

          if (decision.outcome === 'DENY') {
            return {
              action: 'STAY' as const,
              from: decision.from,
              to: decision.to,
              dispatchSource: 'journey-runtime-authority' as const,
              whyNotSkip: decision.reason,
              write: decision.write,
            };
          }

          return {
            action: decision.action === 'REPEAT' ? 'STAY' : 'ADVANCE' as const,
            from: decision.from,
            to: decision.to,
            dispatchAgent: decision.dispatch.outcome === 'ALLOW'
              ? decision.dispatch.agent
              : undefined,
            dispatchSource: 'journey-runtime-authority' as const,
            write: decision.write,
          };
        },
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        FaqAgent: faqAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-later-stage-faq-recovery-1',
      sessionId: 'session-later-stage-faq-recovery-1',
      turnId: 'turn-later-stage-faq-recovery-1',
      message: 'What are your office hours?',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-later-stage-faq-recovery-1/report.pdf',
      }],
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      } as any,
      facts: {
        'process.explained': true,
      },
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
    });

    expect(result.suggestion).toEqual(expect.objectContaining({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
    }));
    expect(result.dispatchResult).toEqual({
      status: 'ok',
      data: {
        answer: 'Our office hours are Monday to Friday, 9am to 6pm.',
        citedFaqIds: ['faq-hours-1'],
        confidence: 'high',
      },
    });
    expect(result.render).toEqual({
      path: 'FAQ_ANSWER',
    });
    const response = composeResponse({
      body: {
        sessionId: 'session-later-stage-faq-recovery-1',
        message: 'What are your office hours?',
      } as any,
      result,
      sessionStatusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [
          {
            storageKey: 'chatbot/session-later-stage-faq-recovery-1/doc-1.pdf',
          },
          {
            storageKey: 'chatbot/session-later-stage-faq-recovery-1/doc-2.pdf',
          },
        ],
      } as any,
    });
    expect(result.writeIntents?.statusPatch).not.toEqual(expect.objectContaining({
      journeyCurrentStage: 'EXPLAIN_PROCESS',
    }));
    expect(response.cards).toEqual([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
        payload: expect.objectContaining({
          required: true,
          uploadedCount: 2,
        }),
      }),
    ]);
    expect(result.writeIntents?.conversationSummaryPatch?.statusPatch.conversationSummary).toContain(
      'stage=COLLECT_MEDICAL_INPUTS',
    );
  });

  it('preserves COLLECT_MEDICAL_INPUTS and renders explicit FAQ miss text when FAQ retrieval is unreliable', async () => {
    const faqAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          answer: ' ',
          citedFaqIds: [],
          confidence: 'low' as const,
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: new SupervisorService(),
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          dispatchAgent: 'FaqAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
          write: {
            authority: 'journey-runtime-authority' as const,
            stage: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
            factsPatch: {
              'process.explained': true,
            },
          },
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        FaqAgent: faqAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-faq-miss-1',
      sessionId: 'session-faq-miss-1',
      turnId: 'turn-faq-miss-1',
      message: 'What are your office hours?',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      } as any,
      facts: {
        'process.explained': true,
      },
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
    });

    expect(result.render).toEqual({
      path: 'FAQ_MISS',
    });
    expect(result.journey).toEqual({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    const response = composeResponse({
      body: {
        sessionId: 'session-faq-miss-1',
        message: 'What are your office hours?',
      } as any,
      result,
      sessionStatusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
      } as any,
    });
    expect(result.writeIntents?.statusPatch).not.toEqual(expect.objectContaining({
      journeyCurrentStage: 'EXPLAIN_PROCESS',
    }));
    expect(response.cards).toEqual([]);
    expect(result.writeIntents?.conversationSummaryPatch?.statusPatch.conversationSummary).toContain(
      'reliable FAQ answer',
    );
    expect(result.writeIntents?.conversationSummaryPatch?.statusPatch.conversationSummary).not.toContain(
      'Please upload your diagnosis proof',
    );
  });

  it('preserves COLLECT_MINIMAL_MEDICAL_FACTS and renders explicit FAQ miss text when FAQ retrieval is unreliable from the early stage', async () => {
    const faqAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          answer: ' ',
          citedFaqIds: [],
          confidence: 'low' as const,
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: new SupervisorService(),
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const, phase: 'active' as const },
          to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          dispatchAgent: 'FaqAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
          write: {
            authority: 'journey-runtime-authority' as const,
            stage: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
            factsPatch: {
              'process.explained': true,
            },
          },
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        FaqAgent: faqAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-faq-miss-early-1',
      sessionId: 'session-faq-miss-early-1',
      turnId: 'turn-faq-miss-early-1',
      message: 'What are your office hours?',
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      } as any,
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
    });

    const response = composeResponse({
      body: {
        sessionId: 'session-faq-miss-early-1',
        message: 'What are your office hours?',
      } as any,
      result,
      sessionStatusSnapshot: {
        journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      } as any,
    });

    expect(result.render).toEqual({
      path: 'FAQ_MISS',
    });
    expect(response.messages[0]?.text).toContain('reliable FAQ answer');
    expect(response.journey).toEqual({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
    expect(result.writeIntents?.statusPatch?.journeyCurrentStage).toBeUndefined();
    expect(result.writeIntents?.conversationSummaryPatch?.statusPatch.conversationSummary).toContain(
      'stage=COLLECT_MINIMAL_MEDICAL_FACTS',
    );
    expect(result.writeIntents?.conversationSummaryPatch?.statusPatch.conversationSummary).not.toContain(
      'Please upload your diagnosis proof',
    );
  });

  it.each([
    {
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
      sessionId: 'session-faq-preserve-minimal-answer-1',
      turnId: 'turn-faq-preserve-minimal-answer-1',
      traceId: 'trace-faq-preserve-minimal-answer-1',
      message: 'What are your office hours?',
      faqResult: {
        answer: 'Our office hours are Monday to Friday, 9am to 6pm.',
        citedFaqIds: ['faq-hours-1'],
        confidence: 'high' as const,
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageComplete: false,
        docUploadStatus: 'READY',
      } as const,
      expectRenderPath: 'FAQ_ANSWER' as const,
      expectAssistantText: 'Our office hours are Monday to Friday, 9am to 6pm.',
    },
    {
      stage: 'RECOMMENDATION' as const,
      sessionId: 'session-faq-preserve-recommendation-answer-1',
      turnId: 'turn-faq-preserve-recommendation-answer-1',
      traceId: 'trace-faq-preserve-recommendation-answer-1',
      message: 'What are your office hours?',
      faqResult: {
        answer: 'Our office hours are Monday to Friday, 9am to 6pm.',
        citedFaqIds: ['faq-hours-1'],
        confidence: 'high' as const,
      },
      statusSnapshot: {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        recommendationSelected: true,
      } as const,
      expectRenderPath: 'FAQ_ANSWER' as const,
      expectAssistantText: 'Our office hours are Monday to Friday, 9am to 6pm.',
    },
    {
      stage: 'EXPLAIN_PROCESS' as const,
      sessionId: 'session-faq-preserve-process-answer-1',
      turnId: 'turn-faq-preserve-process-answer-1',
      traceId: 'trace-faq-preserve-process-answer-1',
      message: 'What are your office hours?',
      faqResult: {
        answer: 'Our office hours are Monday to Friday, 9am to 6pm.',
        citedFaqIds: ['faq-hours-1'],
        confidence: 'high' as const,
      },
      statusSnapshot: {
        processExplained: true,
      } as const,
      expectRenderPath: 'FAQ_ANSWER' as const,
      expectAssistantText: 'Our office hours are Monday to Friday, 9am to 6pm.',
    },
    {
      stage: 'ONLINE_CONSULT' as const,
      sessionId: 'session-faq-preserve-consult-answer-1',
      turnId: 'turn-faq-preserve-consult-answer-1',
      traceId: 'trace-faq-preserve-consult-answer-1',
      message: 'How long does online consultation usually take to schedule?',
      faqResult: {
        answer: 'Online consultations are usually arranged within 24 hours.',
        citedFaqIds: ['faq-consult-1'],
        confidence: 'high' as const,
      },
      statusSnapshot: {
        consultationStatus: 'not_introduced',
      } as const,
      expectRenderPath: 'FAQ_ANSWER' as const,
      expectAssistantText: 'Online consultations are usually arranged within 24 hours.',
    },
    {
      stage: 'HUMAN_HANDOFF' as const,
      sessionId: 'session-faq-preserve-handoff-answer-1',
      turnId: 'turn-faq-preserve-handoff-answer-1',
      traceId: 'trace-faq-preserve-handoff-answer-1',
      message: 'What are your office hours?',
      faqResult: {
        answer: 'Our office hours are Monday to Friday, 9am to 6pm.',
        citedFaqIds: ['faq-hours-1'],
        confidence: 'high' as const,
      },
      statusSnapshot: {
        handoffStatus: 'in_progress',
      } as const,
      expectRenderPath: 'FAQ_ANSWER' as const,
      expectAssistantText: 'Our office hours are Monday to Friday, 9am to 6pm.',
      expectHandOffRequired: true,
    },
  ])(
    'keeps FAQ answers on the persisted primary stage in %s',
    async (scenario) => {
      await runFaqStagePreservationScenario(scenario);
    },
  );

  it.each([
    {
      stage: 'ONLINE_CONSULT' as const,
      sessionId: 'session-faq-preserve-consult-miss-1',
      turnId: 'turn-faq-preserve-consult-miss-1',
      traceId: 'trace-faq-preserve-consult-miss-1',
      message: 'How long does online consultation usually take to schedule?',
      faqResult: {
        answer: ' ',
        citedFaqIds: [],
        confidence: 'low' as const,
      },
      statusSnapshot: {
        consultationStatus: 'not_introduced',
      } as const,
      expectRenderPath: 'FAQ_MISS' as const,
      expectAssistantText: 'reliable FAQ answer',
    },
  ])(
    'keeps FAQ miss responses on the persisted primary stage in %s',
    async (scenario) => {
      await runFaqStagePreservationScenario(scenario);
    },
  );

  it('does not escalate canonical minimal triage truth from a collection-mode worker hallucination', async () => {
    const recordsAgent = new RecordsAgent(
      createToolGateway({ handlers: {} }),
      new RecordsLlmAdapter({
        worker: {
          promptVersion: 'records-worker-test',
          run: vi.fn(async () => ({
            'records.minimal_triage.complete': true,
            collectionPrompt: 'Please upload any records you already have.',
          })),
        },
      }),
    );
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'COLLECT_MEDICAL_INPUTS' as const,
          reason: 'continue collecting records',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          dispatchAgent: 'RecordsAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        RecordsAgent: recordsAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-records-collect-truth-boundary-1',
      sessionId: 'session-records-collect-truth-boundary-1',
      turnId: 'turn-records-collect-truth-boundary-1',
      message: 'I can upload more reports.',
      statusSnapshot: {
        minimalTriageComplete: false,
      } as any,
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    });

    expect(result.dispatchResult).toEqual({
      status: 'ok',
      data: {
        'records.minimal_triage.complete': false,
        collectionPrompt: 'Please upload your diagnosis proof, diagnosis certificate, or another supporting diagnosis document so our medical team can prepare the next step.',
      },
    });
    expect(result.writeIntents.canonicalTruthPatch).toEqual({});
  });

  it('builds compact structured faq task metadata with the latest user message', async () => {
    const faqAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          answer: 'Online consultations are usually arranged within 24 hours.',
          citedFaqIds: ['faq-1'],
          confidence: 'high' as const,
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'faq' as const,
          suggestedStage: 'EXPLAIN_PROCESS' as const,
          reason: 'user is asking about consult timing',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          dispatchAgent: 'FaqAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        FaqAgent: faqAgent,
      },
    });

    await runtime.handleTurn({
      traceId: 'trace-faq-envelope-1',
      sessionId: 'session-faq-1',
      site: 'china',
      turnId: 'turn-faq-1',
      message: 'How long does online consultation usually take to schedule?',
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      facts: {
        'records.saved': false,
      },
    });

    const call = faqAgent.execute.mock.calls[0]?.[0];
    expect(call).toEqual(expect.objectContaining({
      type: 'faq.answer',
      input: expect.objectContaining({
        latestUserMessage: 'How long does online consultation usually take to schedule?',
        sessionId: 'session-faq-1',
      }),
      meta: expect.objectContaining({
        task: expect.objectContaining({
          agent: 'FaqAgent',
          fromStage: 'EXPLAIN_PROCESS',
          toStage: 'EXPLAIN_PROCESS',
          latestUserMessage: 'How long does online consultation usually take to schedule?',
          intent: 'faq',
          supervisorReason: 'user is asking about consult timing',
        }),
      }),
    }));
    expect(call?.meta).not.toHaveProperty('historySummary');
  });

  it('emits llm observability metadata from supervisor and FAQ worker runtime nodes', async () => {
    const events: Array<Record<string, unknown>> = [];
    const emitter = createChatbotV3RuntimeNodeEventEmitter({
      emit: (event) => {
        events.push(event as Record<string, unknown>);
      },
    });
    const faqGateway = createToolGateway({
      handlers: {
        faq: {
          categorySearch: vi.fn(async () => ({
            categories: [{ name: 'Consultation', sortOrder: 1 }],
          })),
          search: vi.fn(async () => ({
            hits: [{
              id: 'faq-1',
              question: 'How long does online consultation usually take to schedule?',
              answer: 'Online consultations are usually arranged within 24 hours.',
              category: 'Consultation',
            }],
          })),
          getByIds: vi.fn(async () => ({
            items: [{
              id: 'faq-1',
              question: 'How long does online consultation usually take to schedule?',
              answer: 'Online consultations are usually arranged within 24 hours.',
              category: 'Consultation',
            }],
          })),
        },
        status: {
          query: vi.fn(async () => ({})),
        },
      },
    });
    const supervisor = new SupervisorService({
      promptVersion: 'supervisor-prompt-v1',
      model: 'gpt-4.1-mini',
      run: vi.fn(async () => ({
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'user is asking an faq',
      })),
    });
    const faqAgent = new FaqAgent(
      faqGateway,
      new FaqLlmAdapter({
        plan: {
          promptVersion: 'faq-plan-prompt-v1',
          model: 'gpt-4o-mini',
          run: vi.fn(async () => ({
            category: 'Consultation',
            query: 'online consultation schedule timing',
            reason: 'faq timing request',
          })),
        },
        answer: {
          promptVersion: 'faq-answer-prompt-v1',
          model: 'gpt-4o-mini',
          run: vi.fn(async () => ({
            answer: 'Online consultations are usually arranged within 24 hours.',
            citedFaqIds: 'faq-1',
            confidence: 'high',
          })),
        },
      }),
    );

    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor,
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          dispatchAgent: 'FaqAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
      } as any,
      agents: {
        FaqAgent: faqAgent,
      },
      nodeEventEmitter: emitter,
    });

    await runtime.handleTurn({
      traceId: 'trace-observe-1',
      sessionId: 'session-observe-1',
      site: 'china',
      turnId: 'turn-observe-1',
      message: 'How long does online consultation usually take to schedule?',
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        node: 'Supervisor',
        action: 'suggest',
        status: 'completed',
        nodePromptVersion: 'supervisor-prompt-v1',
        nodeModel: 'gpt-4.1-mini',
        fallbackUsed: false,
        schemaValidationFailed: false,
      }),
      expect.objectContaining({
        node: 'Subagent',
        action: 'FaqAgent',
        status: 'completed',
        nodePromptVersion: 'faq-answer-prompt-v1',
        nodeModel: 'gpt-4o-mini',
        fallbackUsed: true,
        schemaValidationFailed: true,
      }),
    ]));
  });
});

describe('chatbot-v3 public route validation', () => {
  it('rejects malformed TRIAGE_SUBMITTED requests at validation time', async () => {
    const app = new Hono();
    app.route('/', chatbotV3PublicRoutes);
    app.onError((err, c) => {
      if (err.name === 'ZodError' && 'errors' in err) {
        return c.json({
          error: 'Validation failed',
          code: 'VALIDATION_FAILED',
          details: (err as Error & { errors: unknown[] }).errors,
        }, 400);
      }

      throw err;
    });

    routeMockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-route-1',
      sessionId: 'session-v3-route-1',
      site: 'china',
      sessionSecretHash: createHash('sha256').update('secret-v3-route-1').digest('hex'),
      patientId: null,
      difyConversationId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      },
    });

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-medora-site': 'china',
        Cookie: 'chatbot_session_secret=secret-v3-route-1',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-route-1',
        action: {
          type: 'TRIAGE_SUBMITTED',
        },
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({
      error: 'Validation failed',
      code: 'VALIDATION_FAILED',
      details: expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('TRIAGE_SUBMITTED'),
          path: ['message'],
        }),
      ]),
    }));
    expect(routeMockServices.idempotencyExecutor.execute).not.toHaveBeenCalled();
  });

  it('accepts attachment-only diagnosis-proof uploads during COLLECT_MEDICAL_INPUTS', async () => {
    const app = new Hono();
    app.route('/', chatbotV3PublicRoutes);
    app.onError((err, c) => {
      if (err.name === 'ZodError' && 'errors' in err) {
        return c.json({
          error: 'Validation failed',
          code: 'VALIDATION_FAILED',
          details: (err as Error & { errors: unknown[] }).errors,
        }, 400);
      }

      throw err;
    });

    routeMockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-route-attachments-1',
      sessionId: 'session-v3-route-attachments-1',
      site: 'china',
      sessionSecretHash: createHash('sha256').update('secret-v3-route-attachments-1').digest('hex'),
      patientId: null,
      difyConversationId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        formStatus: 'completed',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
      },
    });

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-medora-site': 'china',
        Cookie: 'chatbot_session_secret=secret-v3-route-attachments-1',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-route-attachments-1',
        attachments: [{
          fileName: 'diagnosis-certificate.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-v3-route-attachments-1/diagnosis-certificate.pdf',
        }],
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.turnOutcome).toBeDefined();
    expect(routeMockServices.idempotencyExecutor.execute).toHaveBeenCalledOnce();
    expect(routeMockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-route-attachments-1',
      'china',
      expect.objectContaining({
        supportingDocuments: [
          {
            path: 'chatbot/session-v3-route-attachments-1/diagnosis-certificate.pdf',
            name: 'diagnosis-certificate.pdf',
          },
        ],
      }),
    );
  });

  it('advances a supporting-doc follow-up into ONLINE_CONSULT once at least one persisted document exists', async () => {
    const app = new Hono();
    app.route('/', chatbotV3PublicRoutes);
    app.onError((err, c) => {
      if (err.name === 'ZodError' && 'errors' in err) {
        return c.json({
          error: 'Validation failed',
          code: 'VALIDATION_FAILED',
          details: (err as Error & { errors: unknown[] }).errors,
        }, 400);
      }

      throw err;
    });

    routeMockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-route-consult-1',
      sessionId: 'session-v3-route-consult-1',
      site: 'china',
      sessionSecretHash: createHash('sha256').update('secret-v3-route-consult-1').digest('hex'),
      patientId: null,
      difyConversationId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Confirmed lung cancer. Diagnosed three months ago. PET-CT and pathology completed.',
        minimalTriageComplete: true,
        processExplained: true,
        recommendationGenerated: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        recommendationSelected: true,
        consultationStatus: 'not_introduced',
        supportingDocuments: [{
          path: 'chatbot/session-v3-route-consult-1/diagnosis-certificate.pdf',
          name: 'diagnosis-certificate.pdf',
        }],
        conversationSummary: 'stage=COLLECT_MEDICAL_INPUTS | user=I already uploaded the documents. What is next now? | assistant=Please upload your diagnosis proof...',
      },
    });

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-medora-site': 'china',
        Cookie: 'chatbot_session_secret=secret-v3-route-consult-1',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-route-consult-1',
        message: 'I already uploaded the documents. What is next now?',
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.journey).toEqual({
      stage: 'ONLINE_CONSULT',
      phase: 'active',
    });
  });

  it('filters identical recommendation selection arrays out of status patches', () => {
    expect(filterUnchangedStatusPatch(
      {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
      } as any,
      {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
      } as any,
    )).toEqual({});
  });

  it('filters identical supporting document arrays out of status patches', () => {
    expect(filterUnchangedStatusPatch(
      {
        supportingDocuments: [
          {
            path: 'chatbot/session-1/report.pdf',
            name: 'report.pdf',
          },
        ],
      } as any,
      {
        supportingDocuments: [
          {
            path: 'chatbot/session-1/report.pdf',
            name: 'report.pdf',
          },
        ],
      } as any,
    )).toEqual({});
  });
});

describe('chatbot-v3 route recommendation read-side helpers', () => {
  it('derives recommendation state from structured selection status before legacy workflow fields', () => {
    expect(deriveRecommendationState({
      recommendationSelectionStatus: 'selected',
      recommendationStatus: 'NOT_STARTED',
      packageStatus: 'NOT_INTRODUCED',
    } as any)).toBe('confirmed');

    expect(deriveRecommendationState({
      recommendationSelectionStatus: 'pending',
      recommendationStatus: 'NOT_STARTED',
      packageStatus: 'NOT_INTRODUCED',
    } as any)).toBe('processing');

    expect(deriveRecommendationState({
      recommendationSelectionStatus: 'skipped',
      recommendationStatus: 'NOT_STARTED',
      packageStatus: 'NOT_INTRODUCED',
    } as any)).toBe('processing');

    expect(deriveRecommendationState({
      recommendationGenerated: true,
      recommendationStatus: 'NOT_STARTED',
      packageStatus: 'NOT_INTRODUCED',
    } as any)).toBe('processing');

    expect(deriveRecommendationState({
      recommendationGenerated: true,
      recommendationStatus: 'FAILED',
      packageStatus: 'NOT_INTRODUCED',
    } as any)).toBe('failed');
  });

  it('serializes structured recommendation selection fields in status.query snapshots', () => {
    expect(serializeStatusSnapshot({
      recommendationGenerated: true,
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['hospital-1'],
      recommendationSelected: true,
    } as any)).toEqual(expect.objectContaining({
      recommendationGenerated: true,
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['hospital-1'],
      recommendationSelected: true,
    }));
  });
});

function createConflictOnInflightIdempotencyExecutor() {
  const inflight = new Set<string>();
  const completed = new Map<string, unknown>();

  return async <T>(key: string, _operation: string, fn: () => Promise<T>): Promise<T> => {
    if (completed.has(key)) {
      return completed.get(key) as T;
    }

    if (inflight.has(key)) {
      throw new Error('Request is already being processed');
    }

    inflight.add(key);
    try {
      const result = await fn();
      completed.set(key, result);
      return result;
    } finally {
      inflight.delete(key);
    }
  };
}
