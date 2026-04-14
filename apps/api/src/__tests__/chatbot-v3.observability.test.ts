import { describe, expect, it } from 'vitest';
import {
  createChatbotV3EventEmitter,
  evaluateM0AlertThresholds,
} from '../routes/chatbot-v3/observability.js';

describe('chatbot-v3 observability', () => {
  it('emits required M0 event set with required decision fields', () => {
    const capturedEvents: unknown[] = [];
    const emitter = createChatbotV3EventEmitter({
      emit: (event) => {
        capturedEvents.push(event);
      },
    });

    const baseContext = {
      traceId: 'trace-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      childRunId: null,
    } as const;

    emitter.emit({
      name: 'supervisor_suggestion_created',
      context: baseContext,
      data: {
        suggestedStage: 'RECOMMENDATION',
        reason: 'x'.repeat(300),
      },
    });
    emitter.emit({
      name: 'orchestrator_decision_finalized',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        suggestedStage: 'RECOMMENDATION',
        finalStage: 'COLLECT_MEDICAL_INPUTS',
        decisionType: 'STAY',
        matchedRuleId: 'rule-explain-gate',
        reason: 'y'.repeat(280),
        whyNotSkip: 'Need to complete EXPLAIN_PROCESS before RECOMMENDATION',
      },
    });
    emitter.emit({
      name: 'journey_transition_committed',
      context: baseContext,
      data: {
        fromStage: 'EXPLAIN_PROCESS',
        toStage: 'COLLECT_MEDICAL_INPUTS',
      },
    });
    emitter.emit({
      name: 'subagent_dispatched',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        agentName: 'RecommendationAgent',
      },
    });
    emitter.emit({
      name: 'subagent_started',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        agentName: 'RecommendationAgent',
      },
    });
    emitter.emit({
      name: 'subagent_completed',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        agentName: 'RecommendationAgent',
      },
    });
    emitter.emit({
      name: 'subagent_failed',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        agentName: 'RecommendationAgent',
        errorDetail: 'token=secret abc '.repeat(80),
      },
    });
    emitter.emit({
      name: 'subagent_timeout',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        agentName: 'RecommendationAgent',
        errorDetail: 'slow upstream timeout',
      },
    });
    emitter.emit({
      name: 'subagent_cancelled',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        agentName: 'RecommendationAgent',
      },
    });
    emitter.emit({
      name: 'tool_call_started',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        toolName: 'recommendation.generate',
      },
    });
    emitter.emit({
      name: 'tool_call_completed',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        toolName: 'recommendation.generate',
      },
    });
    emitter.emit({
      name: 'tool_call_failed',
      context: {
        ...baseContext,
        childRunId: 'child-1',
      },
      data: {
        toolName: 'recommendation.generate',
        errorDetail: 'password=topsecret '.repeat(50),
      },
    });

    const names = capturedEvents.map((event) => (event as { name: string }).name);
    expect(names).toEqual(expect.arrayContaining([
      'supervisor_suggestion_created',
      'orchestrator_decision_finalized',
      'journey_transition_committed',
      'subagent_dispatched',
      'subagent_started',
      'subagent_completed',
      'subagent_failed',
      'subagent_timeout',
      'subagent_cancelled',
      'tool_call_started',
      'tool_call_completed',
      'tool_call_failed',
    ]));

    for (const event of capturedEvents as Array<Record<string, unknown>>) {
      expect(event).toMatchObject({
        traceId: expect.any(String),
        sessionId: expect.any(String),
        turnId: expect.any(String),
      });
      expect(event).toHaveProperty('childRunId');
    }

    const decisionEvent = capturedEvents.find(
      (event) => (event as { name: string }).name === 'orchestrator_decision_finalized',
    ) as Record<string, unknown>;

    expect(decisionEvent).toMatchObject({
      suggestedStage: 'RECOMMENDATION',
      finalStage: 'COLLECT_MEDICAL_INPUTS',
      decisionType: 'STAY',
      matchedRuleId: 'rule-explain-gate',
      reason: expect.any(String),
      whyNotSkip: expect.any(String),
    });
    expect((decisionEvent.reason as string).length).toBe(240);

    const supervisorEvent = capturedEvents.find(
      (event) => (event as { name: string }).name === 'supervisor_suggestion_created',
    ) as Record<string, unknown>;
    expect((supervisorEvent.reason as string).length).toBe(240);

    const failedToolEvent = capturedEvents.find(
      (event) => (event as { name: string }).name === 'tool_call_failed',
    ) as Record<string, unknown>;
    expect((failedToolEvent.errorDetail as string).length).toBeLessThanOrEqual(512);
    expect(failedToolEvent.errorDetail).not.toContain('topsecret');
  });

  it('evaluates M0 alert thresholds from windowed metrics', () => {
    const alerts = evaluateM0AlertThresholds({
      toolCalls: {
        'consult.schedule': {
          windowMinutes: 5,
          total: 20,
          failures: 4,
        },
        'recommendation.generate': {
          windowMinutes: 5,
          total: 20,
          failures: 5,
        },
      },
      subagents: {
        windowMinutes: 10,
        total: 120,
        timeouts: 11,
      },
      handoffs: {
        windowMinutes: 30,
        totalTurns: 100,
        handoffs: 36,
        trailingSevenDayBaselineRate: 0.17,
      },
    });

    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'consult.schedule_failure_rate',
        triggered: true,
      }),
      expect.objectContaining({
        rule: 'recommendation.generate_failure_rate',
        triggered: true,
      }),
      expect.objectContaining({
        rule: 'subagent_timeout_rate',
        triggered: true,
      }),
      expect.objectContaining({
        rule: 'handoff_rate_spike',
        triggered: true,
      }),
    ]));
  });
});
