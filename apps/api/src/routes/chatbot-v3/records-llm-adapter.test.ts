import { describe, expect, it, vi } from 'vitest';
import { RecordsLlmAdapter } from './records-llm-adapter.js';
import { buildRecordsWorkerPrompt } from './records-prompts.js';
import type { RecordsWorkerTask } from './worker-task.js';

function createRecordsTask(
  latestUserMessage: string,
  overrides: Partial<RecordsWorkerTask> = {},
): RecordsWorkerTask {
  return {
    agent: 'RecordsAgent',
    fromStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    toStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    latestUserMessage,
    mode: 'minimal_triage',
    minimalTriageComplete: false,
    ...overrides,
  };
}

describe('RecordsLlmAdapter', () => {
  it('frames minimal triage as a post-intake follow-up instead of a cold-start intake', () => {
    expect(buildRecordsWorkerPrompt(createRecordsTask('What do you need from me first?'))).toContain(
      'We already have the submitted intake, so this step is only the 3-question follow-up needed to refine recommendation.',
    );
  });

  it('uses structured task metadata to choose collection mode without parsing string envelopes', async () => {
    const adapter = new RecordsLlmAdapter();

    await expect(adapter.runStatus({
      task: {
        agent: 'RecordsAgent',
        fromStage: 'COLLECT_MEDICAL_INPUTS',
        toStage: 'COLLECT_MEDICAL_INPUTS',
        latestUserMessage: 'I can upload more reports.',
        mode: 'medical_collection',
        minimalTriageComplete: true,
      },
    } as any)).resolves.toEqual({
      'records.minimal_triage.complete': true,
      collectionPrompt: 'Please upload or share any pathology reports, imaging, blood tests, discharge summaries, medication lists, or treatment history you already have.',
    });
  });

  it('falls back to the deterministic worker result when the structured output is invalid', async () => {
    const adapter = new RecordsLlmAdapter({
      worker: {
        promptVersion: 'records-worker-test',
        run: vi.fn(async () => ({
          'records.minimal_triage.complete': 'yes',
          missing: 'existing_tests_or_treatments',
        })),
      },
    });

    await expect(adapter.runStatus({
      task: createRecordsTask('I have chest pain, it started 3 days ago and feels moderate.'),
    })).resolves.toEqual({
      'records.minimal_triage.complete': false,
      questions: [
        'What is the main symptom, diagnosis, or medical problem right now?',
        'When did it start, how long has it been going on, and how severe is it?',
        'What tests, treatments, medicines, or diagnoses already exist?',
      ],
      followUp: 'Please tell me what tests, treatments, medicines, or diagnoses already exist.',
      missing: ['existing_tests_or_treatments'],
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: 'records-worker-test',
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('fails closed when minimal triage mode returns incomplete false without questions follow-up and missing', async () => {
    const adapter = new RecordsLlmAdapter({
      worker: {
        promptVersion: 'records-worker-test',
        run: vi.fn(async () => ({
          'records.minimal_triage.complete': false,
        })),
      },
    });

    await expect(adapter.runStatus({
      task: createRecordsTask('What do you need from me first?'),
    })).resolves.toEqual({
      'records.minimal_triage.complete': false,
      questions: [
        'What is the main symptom, diagnosis, or medical problem right now?',
        'When did it start, how long has it been going on, and how severe is it?',
        'What tests, treatments, medicines, or diagnoses already exist?',
      ],
      followUp: 'We already received your basic intake. Please answer these 3 follow-up questions so we can refine your recommendation, or you can skip them if you prefer.',
      missing: ['symptom_or_diagnosis', 'duration_or_severity', 'existing_tests_or_treatments'],
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('fails closed when collection mode returns incomplete output without collectionPrompt', async () => {
    const adapter = new RecordsLlmAdapter({
      worker: {
        promptVersion: 'records-worker-test',
        run: vi.fn(async () => ({
          'records.minimal_triage.complete': true,
        })),
      },
    });

    await expect(adapter.runStatus({
      task: createRecordsTask('I can upload more reports.', {
        fromStage: 'COLLECT_MEDICAL_INPUTS',
        toStage: 'COLLECT_MEDICAL_INPUTS',
        mode: 'medical_collection',
        minimalTriageComplete: true,
      }),
    })).resolves.toEqual({
      'records.minimal_triage.complete': true,
      collectionPrompt: 'Please upload or share any pathology reports, imaging, blood tests, discharge summaries, medication lists, or treatment history you already have.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('pins collection-mode triage truth to the structured task value when the worker hallucinates true', async () => {
    const adapter = new RecordsLlmAdapter({
      worker: {
        promptVersion: 'records-worker-test',
        run: vi.fn(async () => ({
          'records.minimal_triage.complete': true,
          collectionPrompt: 'Please upload any records you already have.',
        })),
      },
    });

    await expect(adapter.runStatus({
      task: createRecordsTask('I can upload more reports.', {
        fromStage: 'COLLECT_MEDICAL_INPUTS',
        toStage: 'COLLECT_MEDICAL_INPUTS',
        mode: 'medical_collection',
        minimalTriageComplete: false,
      }),
    })).resolves.toEqual({
      'records.minimal_triage.complete': false,
      collectionPrompt: 'Please upload any records you already have.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
  });

  it('pins collection-mode triage truth to the structured task value when the worker hallucinates false', async () => {
    const adapter = new RecordsLlmAdapter({
      worker: {
        promptVersion: 'records-worker-test',
        run: vi.fn(async () => ({
          'records.minimal_triage.complete': false,
          collectionPrompt: 'Please upload any records you already have.',
        })),
      },
    });

    await expect(adapter.runStatus({
      task: createRecordsTask('I can upload more reports.', {
        fromStage: 'COLLECT_MEDICAL_INPUTS',
        toStage: 'COLLECT_MEDICAL_INPUTS',
        mode: 'medical_collection',
        minimalTriageComplete: true,
      }),
    })).resolves.toEqual({
      'records.minimal_triage.complete': true,
      collectionPrompt: 'Please upload any records you already have.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
  });
});
