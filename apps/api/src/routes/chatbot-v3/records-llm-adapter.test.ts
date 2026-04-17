import { describe, expect, it, vi } from 'vitest';
import { RecordsLlmAdapter } from './records-llm-adapter.js';
import { buildRecordsMinimalTriagePrompt } from './records-prompts.js';

describe('RecordsLlmAdapter', () => {
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
      taskPrompt: buildRecordsMinimalTriagePrompt([
        'agent=RecordsAgent',
        'from=COLLECT_MINIMAL_MEDICAL_FACTS',
        'to=COLLECT_MINIMAL_MEDICAL_FACTS',
        'latest_user_message=I have chest pain, it started 3 days ago and feels moderate.',
      ].join('\n')),
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
      taskPrompt: buildRecordsMinimalTriagePrompt([
        'agent=RecordsAgent',
        'from=COLLECT_MINIMAL_MEDICAL_FACTS',
        'to=COLLECT_MINIMAL_MEDICAL_FACTS',
        'latest_user_message=What do you need from me first?',
      ].join('\n')),
    })).resolves.toEqual({
      'records.minimal_triage.complete': false,
      questions: [
        'What is the main symptom, diagnosis, or medical problem right now?',
        'When did it start, how long has it been going on, and how severe is it?',
        'What tests, treatments, medicines, or diagnoses already exist?',
      ],
      followUp: 'Please answer these 3 questions so I can capture the essential medical details.',
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
      taskPrompt: [
        'agent=RecordsAgent',
        'from=COLLECT_MEDICAL_INPUTS',
        'to=COLLECT_MEDICAL_INPUTS',
        'facts=records.minimal_triage.complete:true',
        'goal=Continue medical records collection',
        'latest_user_message=I can upload more reports.',
      ].join('\n'),
    })).resolves.toEqual({
      'records.minimal_triage.complete': true,
      collectionPrompt: 'Please upload or share any pathology reports, imaging, blood tests, discharge summaries, medication lists, or treatment history you already have.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });
});
