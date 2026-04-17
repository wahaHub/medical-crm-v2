import { describe, expect, it, vi } from 'vitest';
import { RecommendationLlmAdapter } from './recommendation-llm-adapter.js';

describe('RecommendationLlmAdapter', () => {
  it('fails closed to a compact grounded fallback when structured output is invalid', async () => {
    const adapter = new RecommendationLlmAdapter({
      worker: {
        promptVersion: 'recommendation-worker-test',
        run: vi.fn(async () => ({
          recommendations: 'hospital-1',
          explanation: 42,
        })),
      },
    });

    await expect(adapter.runGenerate({
      taskPrompt: [
        'agent=RecommendationAgent',
        'from=RECOMMENDATION',
        'to=RECOMMENDATION',
        'recommendation_task=compare',
        'goal=Refresh grounded hospital recommendations, keep the output small, explain or compare only when requested, and do not mutate records, consult, or handoff state.',
        'latest_user_message=Compare the best options for me.',
      ].join('\n'),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
          score: 0.91,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
        },
      ],
      explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: 'recommendation-worker-test',
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('fails closed when the model invents hospitals outside the supplied candidate list', async () => {
    const adapter = new RecommendationLlmAdapter({
      worker: {
        promptVersion: 'recommendation-worker-test',
        run: vi.fn(async () => ({
          recommendations: [
            {
              hospitalId: 'hallucinated-1',
              name: 'Imaginary Cancer Center',
              reason: 'Invented by the model',
            },
          ],
          explanation: 'This compares the top options.',
        })),
      },
    });

    await expect(adapter.runGenerate({
      taskPrompt: [
        'agent=RecommendationAgent',
        'from=RECOMMENDATION',
        'to=RECOMMENDATION',
        'recommendation_task=compare',
        'goal=Refresh grounded hospital recommendations, keep the output small, explain or compare only when requested, and do not mutate records, consult, or handoff state.',
        'latest_user_message=Compare the best options for me.',
      ].join('\n'),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
          score: 0.91,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
        },
      ],
      explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('fails closed when compare/explain turns omit the required explanation', async () => {
    const adapter = new RecommendationLlmAdapter({
      worker: {
        promptVersion: 'recommendation-worker-test',
        run: vi.fn(async () => ({
          recommendations: [
            {
              hospitalId: 'hospital-1',
              name: 'Shanghai Chest Hospital',
              reason: 'Thoracic oncology focus',
            },
          ],
        })),
      },
    });

    await expect(adapter.runGenerate({
      taskPrompt: [
        'agent=RecommendationAgent',
        'from=RECOMMENDATION',
        'to=RECOMMENDATION',
        'recommendation_task=compare',
        'goal=Compare the current grounded hospital recommendations briefly, keep the output small, and do not mutate records, consult, or handoff state.',
        'latest_user_message=Compare the hospitals for me.',
      ].join('\n'),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
          score: 0.91,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
        },
      ],
      explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('fails closed when explanation mentions cross-domain workflow state', async () => {
    const adapter = new RecommendationLlmAdapter({
      worker: {
        promptVersion: 'recommendation-worker-test',
        run: vi.fn(async () => ({
          recommendations: [
            {
              hospitalId: 'hospital-1',
              name: 'Shanghai Chest Hospital',
              reason: 'Thoracic oncology focus',
            },
          ],
          explanation: 'Your records are complete and online consultation can be booked with this hospital now.',
        })),
      },
    });

    await expect(adapter.runGenerate({
      taskPrompt: [
        'agent=RecommendationAgent',
        'from=RECOMMENDATION',
        'to=RECOMMENDATION',
        'recommendation_task=explain',
        'goal=Explain the current grounded hospital recommendations briefly, keep the output small, and do not mutate records, consult, or handoff state.',
        'latest_user_message=Why this one?',
      ].join('\n'),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
          score: 0.91,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
        },
      ],
      explanation: 'These recommendations are grounded in the current hospital list and can be refreshed if you want different options later.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });
});
