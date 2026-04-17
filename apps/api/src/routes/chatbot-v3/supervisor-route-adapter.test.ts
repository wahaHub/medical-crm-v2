import { describe, expect, it, vi } from 'vitest';
import { createChatbotV3SupervisorRouteAdapter } from './supervisor-route-adapter.js';

describe('createChatbotV3SupervisorRouteAdapter', () => {
  it('uses an external llm client when configured and parses structured json output', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'progression',
              suggestedStage: 'RECOMMENDATION',
              dispatchAgent: 'RecommendationAgent',
              reason: 'minimal triage is complete and recommendation should begin',
              task: {
                goal: 'Generate hospital recommendations for this user.',
                latestUserMessage: 'Please recommend hospitals for me.',
                necessaryFacts: {
                  'intake.condition': 'lung cancer',
                  'records.minimal_triage.complete': true,
                },
              },
            }),
          },
        }],
      }),
    });

    const adapter = createChatbotV3SupervisorRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-4o-mini',
    });

    await expect(adapter?.run({
      currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      conversationSummary: 'No recommendations have been shown yet.',
      latestUserMessage: 'Please recommend hospitals for me.',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      availableReadDomains: ['records.status', 'recommendation.status'],
      conversationSummaryContract: {
        owner: 'runtime',
        refreshTrigger: 'after_final_assistant_response',
        sizeDiscipline: 'compact',
        freshness: 'latest_committed_turn',
        persistenceStrategy: 'persisted_with_session',
      },
    })).resolves.toEqual({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      dispatchAgent: 'RecommendationAgent',
      reason: 'minimal triage is complete and recommendation should begin',
      task: {
        goal: 'Generate hospital recommendations for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'records.minimal_triage.complete': true,
        },
      },
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns undefined when the supervisor llm route is disabled', () => {
    expect(createChatbotV3SupervisorRouteAdapter({
      enabled: false,
      apiKey: 'test-openai-key',
    })).toBeUndefined();
  });
});
