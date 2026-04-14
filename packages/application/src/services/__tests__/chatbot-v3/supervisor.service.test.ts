import { describe, expect, it } from 'vitest';
import { SupervisorService } from '../../chatbot-v3/supervisor.service.js';

describe('SupervisorService', () => {
  const supervisor = new SupervisorService();

  const input = {
    current: {
      stage: 'COLLECT_MEDICAL_INPUTS' as const,
      phase: 'active' as const,
    },
    suggestion: {
      intent: 'progression' as const,
      suggestedStage: 'RECOMMENDATION' as const,
      reason: 'medical inputs are complete',
    },
    facts: {
      'records.saved': true,
    },
  };

  it('returns suggestion with internal reason and bounded output', async () => {
    const result = await supervisor.suggest(input);

    expect(result.suggestedStage).toBeDefined();
    expect(result.reason.length).toBeLessThanOrEqual(240);
  });

  it('keeps supervisor output suggestion-only without journey mutation fields', async () => {
    const result = await supervisor.suggest(input);
    const record = result as unknown as Record<string, unknown>;

    expect(record.dispatchAgent).toBeUndefined();
    expect(record.from).toBeUndefined();
    expect(record.to).toBeUndefined();
    expect(record.factsPatch).toBeUndefined();
  });

  it('sanitizes gateway output and strips unsafe journey mutation fields', async () => {
    const gateway = new SupervisorService({
      suggest: async () => ({
        intent: 'consult',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'gateway recommendation',
        dispatchAgent: 'HandoffAgent',
        from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        to: { stage: 'HUMAN_HANDOFF', phase: 'active' },
        factsPatch: { escalated: true },
      }),
    });

    const result = await gateway.suggest(input);
    const record = result as unknown as Record<string, unknown>;

    expect(result.intent).toBe('consult');
    expect(result.suggestedStage).toBe('ONLINE_CONSULT');
    expect(result.reason).toBe('gateway recommendation');
    expect(record.dispatchAgent).toBeUndefined();
    expect(record.from).toBeUndefined();
    expect(record.to).toBeUndefined();
    expect(record.factsPatch).toBeUndefined();
  });

  it('falls back deterministically when gateway returns invalid intent or stage', async () => {
    const gateway = new SupervisorService({
      suggest: async () => ({
        intent: 'not-a-real-intent',
        suggestedStage: 'NOT_A_STAGE',
        reason: 'gateway output is invalid',
      }),
    });

    const result = await gateway.suggest(input);

    expect(result.intent).toBe('progression');
    expect(result.suggestedStage).toBe('RECOMMENDATION');
    expect(result.reason).toBe('gateway output is invalid');
  });

  it('returns fallback suggestion when the gateway throws', async () => {
    const gateway = new SupervisorService({
      suggest: async () => {
        throw new Error('gateway unavailable');
      },
    });

    await expect(gateway.suggest(input)).resolves.toEqual({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: 'medical records are saved and ready for recommendation',
    });
  });
});
