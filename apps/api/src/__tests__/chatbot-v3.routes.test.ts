import { describe, expect, it, vi } from 'vitest';
import { SupervisorService } from '@medical-crm/application';
import { FaqLlmAdapter } from '../routes/chatbot-v3/faq-llm-adapter.js';
import { FaqAgent, RecordsAgent } from '../routes/chatbot-v3/agents.js';
import { createChatbotV3RuntimeNodeEventEmitter } from '../routes/chatbot-v3/observability.js';
import { ConversationOrchestratorV3RuntimeService } from '../routes/chatbot-v3/runtime.service.js';
import { createToolGateway } from '../routes/chatbot-v3/tool-gateway.js';

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
});

describe('chatbot-v3 runtime', () => {
  it('keeps turn outcomes deterministic for concurrent requests targeting the same session turn', async () => {
    const execute = vi.fn(createConflictOnInflightIdempotencyExecutor());
    const supervisor = {
      suggest: vi.fn(async () => ({
        intent: 'progression' as const,
        suggestedStage: 'RECOMMENDATION' as const,
        reason: 'records are ready',
      })),
    };
    const orchestrator = {
      decide: vi.fn(() => ({
        action: 'ADVANCE' as const,
        from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
        to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
        dispatchAgent: 'RecommendationAgent' as const,
        dispatchSource: 'orchestrator' as const,
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
      orchestrator,
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
    expect(orchestrator.decide).toHaveBeenCalledTimes(1);
    expect(recommendationAgent.execute).toHaveBeenCalledTimes(1);
    expect(first.runtimeDebug.traceId).toBe('trace-concurrency-1');
  });

  it('emits node events for supervisor/orchestrator/subagent/tool and turn_summary', async () => {
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
      orchestrator: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'orchestrator' as const,
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
      expect.objectContaining({ node: 'Orchestrator', action: 'decide', status: 'started' }),
      expect.objectContaining({ node: 'Orchestrator', action: 'decide', status: 'completed' }),
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
      orchestrator: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'orchestrator' as const,
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

  it('dispatches actions only from orchestrator decisions', async () => {
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
      orchestrator: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'orchestrator' as const,
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
        taskPrompt: expect.stringContaining('agent=RecommendationAgent'),
      }),
    }));
    expect(dispatchedAction?.meta).not.toHaveProperty('historySummary');
    expect(dispatchedAction?.input).not.toHaveProperty('context');
    expect(handoffAgent.execute).not.toHaveBeenCalled();
    expect(result.runtimeDebug.lastDispatchSource).toBe('orchestrator');
    expect(result.runtimeDebug.traceId).toBe('trace-dispatch-1');
  });

  it('passes task prompt only to dispatched agents', async () => {
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
      orchestrator: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'orchestrator' as const,
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
    expect(call?.meta?.taskPrompt).toContain('from=COLLECT_MEDICAL_INPUTS');
    expect(call?.meta?.taskPrompt).toContain('to=RECOMMENDATION');
    expect(call?.meta).not.toHaveProperty('historySummary');
  });

  it('builds a compact faq task envelope with goal and latest user message', async () => {
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
      orchestrator: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          dispatchAgent: 'FaqAgent' as const,
          dispatchSource: 'orchestrator' as const,
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
        taskPrompt: expect.stringContaining("goal=Answer the user's FAQ using the FAQ toolset only."),
      }),
    }));
    expect(call?.meta?.taskPrompt).toContain(
      'latest_user_message=How long does online consultation usually take to schedule?',
    );
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
      orchestrator: {
        decide: vi.fn(() => ({
          action: 'STAY' as const,
          from: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
          dispatchAgent: 'FaqAgent' as const,
          dispatchSource: 'orchestrator' as const,
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
