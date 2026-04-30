import { describe, expect, it } from 'vitest';
import { buildRecommendationWorkerPrompt } from './recommendation-prompts.js';
import type { RecommendationWorkerTask } from './worker-task.js';

describe('Recommendation prompt skill context', () => {
  it('renders loaded skill guidance and read intents into the worker prompt', () => {
    const task: RecommendationWorkerTask = {
      agent: 'RecommendationAgent',
      currentStage: 'RECOMMENDATION',
      primaryStage: 'RECOMMENDATION',
      latestUserMessage: 'Please recommend hospitals.',
      recommendationTask: 'generate',
      loadedSkillSections: [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'recommend_hospitals',
        sectionIds: ['hospital_sources'],
        readIntentTypes: ['HOSPITAL_CANDIDATES', 'HOSPITAL_FAQ', 'DOCTOR_MATCHING_CONTEXT'],
        policyText: ['Use only supplied candidate hospitals and known patient facts.'],
        retrievalGuidance: ['Ground recommendations in the retrieved candidate list.'],
        handlingGuidance: ['Explain uncertainty as a reason to refine, not to invent options.'],
      }],
      readIntents: [
        { type: 'HOSPITAL_CANDIDATES', reasonCode: 'hospital_skill:hospital_sources' },
        { type: 'HOSPITAL_FAQ', category: 'hospital', reasonCode: 'hospital_skill:hospital_sources' },
        { type: 'DOCTOR_MATCHING_CONTEXT', reasonCode: 'hospital_skill:hospital_sources' },
      ],
    };

    const prompt = buildRecommendationWorkerPrompt({
      task,
      recommendations: [],
    });

    expect(prompt).toContain('loaded_skill_sections=');
    expect(prompt).toContain('hospital_skill');
    expect(prompt).toContain('"sectionIds":["hospital_sources"]');
    expect(prompt).toContain('"readIntentTypes":["HOSPITAL_CANDIDATES","HOSPITAL_FAQ","DOCTOR_MATCHING_CONTEXT"]');
    expect(prompt).toContain('Use only supplied candidate hospitals and known patient facts.');
    expect(prompt).toContain('Ground recommendations in the retrieved candidate list.');
    expect(prompt).toContain('Explain uncertainty as a reason to refine, not to invent options.');
    expect(prompt).toContain('read_intents={"type":"HOSPITAL_CANDIDATES","reasonCode":"hospital_skill:hospital_sources"}, {"type":"HOSPITAL_FAQ","category":"hospital","reasonCode":"hospital_skill:hospital_sources"}, {"type":"DOCTOR_MATCHING_CONTEXT","reasonCode":"hospital_skill:hospital_sources"}');
    expect(prompt).not.toContain('[object Object]');
  });
});
