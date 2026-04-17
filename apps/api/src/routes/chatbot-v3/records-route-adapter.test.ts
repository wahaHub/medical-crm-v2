import { describe, expect, it, vi } from 'vitest';
import { createChatbotV3RecordsRouteAdapter } from './records-route-adapter.js';
import { buildRecordsMinimalTriagePrompt } from './records-prompts.js';

describe('createChatbotV3RecordsRouteAdapter', () => {
  it('uses the structured route response when the model path is enabled', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            'records.minimal_triage.complete': true,
          }),
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const adapter = createChatbotV3RecordsRouteAdapter({
      enabled: true,
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      fetchImpl,
      timeoutMs: 50,
    });

    await expect(adapter.runStatus({
      taskPrompt: buildRecordsMinimalTriagePrompt([
        'agent=RecordsAgent',
        'from=COLLECT_MINIMAL_MEDICAL_FACTS',
        'to=COLLECT_MINIMAL_MEDICAL_FACTS',
        'latest_user_message=I have chest pain, it started 3 days ago, it feels moderate, and I already had a blood test.',
      ].join('\n')),
    })).resolves.toEqual({
      'records.minimal_triage.complete': true,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodeModel: 'gpt-4o-mini',
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
  });
});
