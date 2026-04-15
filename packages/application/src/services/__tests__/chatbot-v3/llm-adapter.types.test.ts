import { describe, expect, it } from 'vitest';
import type { LlmNodeAdapter } from '../../chatbot-v3/llm-adapter.types.js';
import type {
  OrchestratorV3DecisionInput,
  OrchestratorV3Suggestion,
} from '../../chatbot-v3/orchestrator-v3.service.js';

describe('LlmNodeAdapter', () => {
  const supervisorInput: OrchestratorV3DecisionInput = {
    current: {
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    },
    suggestion: {
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: 'user is asking an faq',
    },
    facts: {
      'records.saved': false,
    },
  };

  it('defines the minimal contract used by supervisor adapters', async () => {
    const adapter: LlmNodeAdapter<OrchestratorV3DecisionInput, OrchestratorV3Suggestion> = {
      promptVersion: 'supervisor-v1',
      run: async (input) => ({
        intent: input.suggestion.intent,
        suggestedStage: input.suggestion.suggestedStage,
        reason: input.suggestion.reason,
      }),
    };

    expect(adapter.promptVersion).toBe('supervisor-v1');
    await expect(adapter.run(supervisorInput)).resolves.toEqual(supervisorInput.suggestion);
  });

  it('defines the same contract for future faq adapters', async () => {
    const adapter: LlmNodeAdapter<
      { goal: string; latestUserMessage: string },
      { answer: string; confidence: 'high' | 'medium' | 'low' }
    > = {
      promptVersion: 'faq-v1',
      run: async (input) => ({
        answer: `${input.goal}: ${input.latestUserMessage}`,
        confidence: 'medium',
      }),
    };

    expect(adapter.promptVersion).toBe('faq-v1');
    await expect(
      adapter.run({
        goal: 'Answer the user with faq tools only',
        latestUserMessage: 'How long does online consult scheduling take?',
      }),
    ).resolves.toEqual({
      answer: 'Answer the user with faq tools only: How long does online consult scheduling take?',
      confidence: 'medium',
    });
  });
});
