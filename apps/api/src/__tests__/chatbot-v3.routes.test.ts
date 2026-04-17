import { describe, expect, it, vi } from 'vitest';
import {
  CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT,
  SupervisorService,
} from '@medical-crm/application';
import { FaqLlmAdapter } from '../routes/chatbot-v3/faq-llm-adapter.js';
import { RecordsLlmAdapter } from '../routes/chatbot-v3/records-llm-adapter.js';
import { FaqAgent, RecommendationAgent, RecordsAgent } from '../routes/chatbot-v3/agents.js';
import { buildRecordsMinimalTriagePrompt } from '../routes/chatbot-v3/records-prompts.js';
import { createChatbotV3RuntimeNodeEventEmitter } from '../routes/chatbot-v3/observability.js';
import {
  ConversationOrchestratorV3RuntimeService,
  deriveCurrentStageFromStatusSnapshot,
} from '../routes/chatbot-v3/runtime.service.js';
import { createToolGateway } from '../routes/chatbot-v3/tool-gateway.js';
import type {
  FaqWorkerTask,
  RecommendationWorkerTask,
  RecordsWorkerTask,
} from '../routes/chatbot-v3/worker-task.js';

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
        followUp: 'Please answer these 3 questions so I can capture the essential medical details.',
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
  it('hard-locks the derived current stage to minimal triage until the canonical triage fact is true', () => {
    expect(deriveCurrentStageFromStatusSnapshot({
      chatbot_v2: {
        journey_snapshot: {
          current_stage: 'RECOMMENDATION',
          current_phase: 'active',
        },
      },
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
      conversationSummary: 'Legacy workflow state should not outrun minimal triage.',
      lastPolicyDecisionAt: null,
      lastUserMessageAt: null,
      lastAssistantMessageAt: null,
    } as any)).toEqual({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
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
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      suggestion: {
        intent: 'unknown',
        suggestedStage: 'EXPLAIN_PROCESS',
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
        deriveDecisionLineage: vi.fn(() => ({
          bootstrapOverride: 'attachments_to_minimal_triage' as const,
        })),
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

    expect(result.runtimeDebug).toMatchObject({
      replayLineage: {
        bootstrapOverride: 'attachments_to_minimal_triage',
      },
    });
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
        minimalTriageComplete: false,
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
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
        statusPatch: {
          conversationSummary: 'stage=EXPLAIN_PROCESS | user=Please explain the process. | assistant=Here is the process: first, share your medical records, then review hospital recommendations, and finally arrange an...',
          lastUserMessageAt: expect.any(Date),
          lastAssistantMessageAt: expect.any(Date),
        },
      },
    }));
    expect(result.render).toEqual({
      path: 'PROCESS_OVERVIEW',
    });
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
      turnId: 'turn-2',
      message: 'What should I do next?',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
    });

    expect(statusQuery).toHaveBeenCalledWith({ sessionId: 'session-1' });
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
        collectionPrompt: 'Please upload any records you already have.',
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
