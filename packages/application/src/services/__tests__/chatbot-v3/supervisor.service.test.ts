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
});
