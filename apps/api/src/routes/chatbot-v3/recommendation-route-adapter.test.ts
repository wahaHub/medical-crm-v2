import { describe, expect, it, vi } from 'vitest';
import { createChatbotV3RecommendationRouteAdapter } from './recommendation-route-adapter.js';
import type { RecommendationWorkerTask } from './worker-task.js';

function createRecommendationTask(latestUserMessage: string): RecommendationWorkerTask {
  return {
    agent: 'RecommendationAgent',
    fromStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    toStage: 'RECOMMENDATION',
    latestUserMessage,
    recommendationTask: 'generate',
    intent: 'progression',
    supervisorReason: 'minimal triage is complete',
  };
}

describe('createChatbotV3RecommendationRouteAdapter', () => {
  it('uses the structured route response when the model path is enabled', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendations: [
              {
                hospitalId: 'hospital-1',
                name: 'Shanghai Chest Hospital',
                reason: 'Thoracic oncology focus',
              },
            ],
            explanation: 'This is the strongest specialist option in the current list.',
          }),
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const adapter = createChatbotV3RecommendationRouteAdapter({
      enabled: true,
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      fetchImpl,
      timeoutMs: 50,
    });

    await expect(adapter.runGenerate({
      task: createRecommendationTask('Please recommend a hospital.'),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
      ],
      explanation: 'This is the strongest specialist option in the current list.',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodeModel: 'gpt-4o-mini',
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
  });
});
