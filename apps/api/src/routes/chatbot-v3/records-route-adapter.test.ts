import { describe, expect, it, vi } from 'vitest';
import { createChatbotV3RecordsRouteAdapter } from './records-route-adapter.js';
import { RECORDS_COLLECTION_PROMPT_VERSION } from './records-prompts.js';
import type { RecordsWorkerTask } from './worker-task.js';

function createRecordsTask(latestUserMessage: string): RecordsWorkerTask {
  return {
    agent: 'RecordsAgent',
    fromStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    toStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    latestUserMessage,
    mode: 'minimal_triage',
    minimalTriageComplete: false,
  };
}

function createCollectionTask(latestUserMessage: string): RecordsWorkerTask {
  return {
    agent: 'RecordsAgent',
    fromStage: 'COLLECT_MEDICAL_INPUTS',
    toStage: 'COLLECT_MEDICAL_INPUTS',
    latestUserMessage,
    mode: 'medical_collection',
    minimalTriageComplete: true,
  };
}

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
      task: createRecordsTask('I have chest pain, it started 3 days ago, it feels moderate, and I already had a blood test.'),
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

  it('uses collection-specific prompt and metadata semantics for collection mode', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            'records.minimal_triage.complete': true,
            collectionPrompt: 'Please upload your diagnosis proof or diagnosis certificate.',
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
      task: createCollectionTask('I can upload more reports.'),
    })).resolves.toEqual({
      'records.minimal_triage.complete': true,
      collectionPrompt: 'Please upload your diagnosis proof or diagnosis certificate.',
    });

    const request = fetchImpl.mock.calls[0]?.[1];
    const payload = request?.body ? JSON.parse(String(request.body)) : null;
    const prompt = payload?.messages?.[1]?.content ?? '';
    expect(prompt).toContain(`version=${RECORDS_COLLECTION_PROMPT_VERSION}`);
    expect(prompt).toContain('role=diagnosis proof upload worker');
    expect(prompt).toContain('diagnosis proof');
    expect(prompt).not.toContain('treatment history');
    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: `${RECORDS_COLLECTION_PROMPT_VERSION}:openai`,
      nodeModel: 'gpt-4o-mini',
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
  });
});
