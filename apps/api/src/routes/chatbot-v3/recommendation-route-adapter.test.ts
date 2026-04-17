import { describe, expect, it, vi } from 'vitest';
import { createChatbotV3RecommendationRouteAdapter } from './recommendation-route-adapter.js';

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
      taskPrompt: [
        'agent=RecommendationAgent',
        'from=COLLECT_MINIMAL_MEDICAL_FACTS',
        'to=RECOMMENDATION',
        'recommendation_task=generate',
        'goal=Generate grounded hospital recommendations now that minimal triage is complete, keep the output small, explain or compare only when requested, and do not mutate records, consult, or handoff state.',
        'latest_user_message=Please recommend a hospital.',
      ].join('\n'),
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
