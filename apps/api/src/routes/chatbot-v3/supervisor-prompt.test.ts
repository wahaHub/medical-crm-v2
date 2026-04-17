import { describe, expect, it } from 'vitest';
import { buildSupervisorPrompt } from './supervisor-prompt.js';

describe('buildSupervisorPrompt', () => {
  it('requires the full supervisor output contract including task fields', () => {
    const prompt = buildSupervisorPrompt({
      currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      conversationSummary: 'The user just started and no recommendations have been shown.',
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
    });

    expect(prompt).toContain('The object must include: intent, suggestedStage, dispatchAgent, reason, task.');
    expect(prompt).toContain('The task object must include: goal, latestUserMessage, necessaryFacts.');
    expect(prompt).toContain('requestedReadDomains');
    expect(prompt).toContain('requesting at most two');
    expect(prompt).toContain('Available domain reads:');
    expect(prompt).toContain('records.status, recommendation.status');
  });

  it('renders fetched domain read results when runtime has already queried them', () => {
    const prompt = buildSupervisorPrompt({
      currentStage: 'RECOMMENDATION',
      conversationSummary: 'The user is waiting for recommendation refinement.',
      latestUserMessage: 'Can you compare hospitals again?',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      availableReadDomains: ['recommendation.status'],
      domainReadResults: {
        'recommendation.status': {
          state: 'confirmed',
        },
      },
      conversationSummaryContract: {
        owner: 'runtime',
        refreshTrigger: 'after_final_assistant_response',
        sizeDiscipline: 'compact',
        freshness: 'latest_committed_turn',
        persistenceStrategy: 'persisted_with_session',
      },
    });

    expect(prompt).toContain('Fetched domain read results:');
    expect(prompt).toContain('"state":"confirmed"');
    expect(prompt).toContain('If fetched domain reads are already provided below');
  });
});
