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

  it('accepts only intent/suggestedStage/reason from supervisor llm output', async () => {
    const supervisorWithLlm = new SupervisorService({
      promptVersion: 'supervisor-v1',
      run: async () => ({
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'user is asking an faq',
        dispatchAgent: 'HandoffAgent',
        from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        to: { stage: 'HUMAN_HANDOFF', phase: 'active' },
        factsPatch: { escalated: true },
      }),
    });

    await expect(supervisorWithLlm.suggest(input)).resolves.toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: 'user is asking an faq',
    });
    expect(supervisorWithLlm.getLastLlmRunMetadata()).toMatchObject({
      nodePromptVersion: 'supervisor-v1',
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
  });

  it.each([
    ['blank reason', '   '],
    ['missing reason', undefined],
    ['non-string reason', { details: 'faq trace' }],
  ])(
    'keeps valid intent and stage when supervisor llm returns %s but falls back to heuristic reason',
    async (_label, reason) => {
      const supervisorWithPartialInvalidLlm = new SupervisorService({
        promptVersion: 'supervisor-v1',
        run: async () => ({
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason,
          dispatchAgent: 'HandoffAgent',
        }),
      });

      await expect(supervisorWithPartialInvalidLlm.suggest(input)).resolves.toEqual({
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'medical records are saved and ready for recommendation',
      });
    },
  );

  it('falls back to heuristic when llm output is invalid', async () => {
    const gateway = new SupervisorService({
      promptVersion: 'supervisor-v1',
      run: async () => ({
        intent: 'not-a-real-intent',
        suggestedStage: 'NOT_A_STAGE',
        reason: 'gateway output is invalid',
      }),
    });

    const result = await gateway.suggest(input);

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: 'medical records are saved and ready for recommendation',
    });
    expect(gateway.getLastLlmRunMetadata()).toMatchObject({
      nodePromptVersion: 'supervisor-v1',
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it.each([
    ['throws', new Error('gateway unavailable')],
    ['times out', new Error('gateway timeout')],
  ])('falls back to heuristic when supervisor llm %s', async (_label, error) => {
    const gateway = new SupervisorService({
      promptVersion: 'supervisor-v1',
      run: async () => {
        throw error;
      },
    });

    await expect(gateway.suggest(input)).resolves.toEqual({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: 'medical records are saved and ready for recommendation',
    });
  });

  it('records model metadata for successful supervisor llm runs', async () => {
    const supervisorWithModel = new SupervisorService({
      promptVersion: 'supervisor-v1',
      model: 'gpt-4.1-mini',
      run: async () => ({
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'faq request',
      }),
    });

    await supervisorWithModel.suggest(input);

    expect(supervisorWithModel.getLastLlmRunMetadata()).toMatchObject({
      nodePromptVersion: 'supervisor-v1',
      nodeModel: 'gpt-4.1-mini',
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
  });
});
