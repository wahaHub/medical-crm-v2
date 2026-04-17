import { describe, expect, it } from 'vitest';
import type { LlmNodeAdapter } from '../../../index.js';
import type {
  SupervisorGatewayInput,
  SupervisorOutput,
} from '../../chatbot-v3/types.js';

describe('LlmNodeAdapter', () => {
  const supervisorInput: SupervisorGatewayInput = {
    currentStage: 'EXPLAIN_PROCESS',
    conversationSummary: 'The user is asking how the process works.',
    latestUserMessage: 'How long does online consult scheduling take?',
    intake: {
      condition: 'lung cancer',
      targetDestination: 'Shanghai',
      language: 'en',
      gender: 'female',
    },
    availableReadDomains: ['records.status'],
    conversationSummaryContract: {
      owner: 'runtime',
      refreshTrigger: 'after_final_assistant_response',
      sizeDiscipline: 'compact',
      freshness: 'latest_committed_turn',
      persistenceStrategy: 'persisted_with_session',
    },
  };

  it('defines the minimal contract used by supervisor adapters', async () => {
    const adapter: LlmNodeAdapter<SupervisorGatewayInput, Partial<SupervisorOutput>> = {
      promptVersion: 'supervisor-v2',
      run: async (input) => ({
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: `faq for ${input.latestUserMessage}`,
      }),
    };

    expect(adapter.promptVersion).toBe('supervisor-v2');
    await expect(adapter.run(supervisorInput)).resolves.toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: 'faq for How long does online consult scheduling take?',
    });
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
