import { describe, expect, it } from 'vitest';
import { buildRecordsWorkerPrompt } from './records-prompts.js';
import type { RecordsWorkerTask } from './worker-task.js';

const recordsSkillContext: Pick<
  RecordsWorkerTask,
  'loadedSkillSections' | 'readIntents' | 'responseContract'
> = {
  loadedSkillSections: [{
    skillId: 'treatment_skill',
    role: 'primary',
    reasonCode: 'collect_records',
    sectionIds: ['treatment_requirements'],
    readIntentTypes: ['RECORD_REQUIREMENTS'],
    policyText: ['Collect only the record or medical fact needed for the active stage.'],
    retrievalGuidance: ['Use record requirements to name the next useful document.'],
    handlingGuidance: ['Acknowledge what the user shared and ask one focused next step.'],
  }],
  readIntents: [
    { type: 'RECORD_REQUIREMENTS', reasonCode: 'treatment_skill:treatment_requirements' },
  ],
  responseContract: {
    structure: 'acknowledge_then_advance',
    primaryMove: 'acknowledge',
    followUpMove: 'ask_qualifying_question',
    constraints: {
      maxQuestions: 1,
      preservePrimaryStage: true,
      answerBeforeAsk: false,
      avoidMultipleCTAs: true,
      language: 'zh',
    },
    safetyRules: [],
  },
};

function createRecordsTask(
  overrides: Partial<RecordsWorkerTask>,
): RecordsWorkerTask {
  return {
    agent: 'RecordsAgent',
    currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    primaryStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    latestUserMessage: 'I can share my records.',
    mode: 'minimal_triage',
    minimalTriageComplete: false,
    ...recordsSkillContext,
    ...overrides,
  };
}

describe('Records prompt skill context', () => {
  it('renders loaded skill guidance and read intents into minimal triage prompts', () => {
    const prompt = buildRecordsWorkerPrompt(createRecordsTask({
      mode: 'minimal_triage',
      minimalTriageComplete: false,
    }));

    expectRecordsSkillContext(prompt);
  });

  it('renders loaded skill guidance and read intents into medical collection prompts', () => {
    const prompt = buildRecordsWorkerPrompt(createRecordsTask({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      primaryStage: 'COLLECT_MEDICAL_INPUTS',
      mode: 'medical_collection',
      minimalTriageComplete: true,
    }));

    expectRecordsSkillContext(prompt);
  });
});

function expectRecordsSkillContext(prompt: string): void {
  expect(prompt).toContain('loaded_skill_sections=');
  expect(prompt).toContain('treatment_skill');
  expect(prompt).toContain('"sectionIds":["treatment_requirements"]');
  expect(prompt).toContain('"readIntentTypes":["RECORD_REQUIREMENTS"]');
  expect(prompt).toContain('Collect only the record or medical fact needed for the active stage.');
  expect(prompt).toContain('Use record requirements to name the next useful document.');
  expect(prompt).toContain('Acknowledge what the user shared and ask one focused next step.');
  expect(prompt).toContain('read_intents={"type":"RECORD_REQUIREMENTS","reasonCode":"treatment_skill:treatment_requirements"}');
  expect(prompt).not.toContain('[object Object]');
}
