import { describe, expect, it, vi } from 'vitest';
import { RecordsAgent } from '../routes/chatbot-v3/agents.js';
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

    expect(gateway.faq).toHaveProperty('search');
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
  });

  it('falls back through status.query when agent execution times out', async () => {
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
    });

    const result = await runtime.handleTurn({
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
      sessionId: 'session-9',
      turnId: 'turn-4',
      message: 'I need help',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
    });

    expect(recommendationAgent.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'recommendation.generate',
    }));
    expect(handoffAgent.execute).not.toHaveBeenCalled();
    expect(result.runtimeDebug.lastDispatchSource).toBe('orchestrator');
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
