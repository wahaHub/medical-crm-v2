import { describe, expect, it } from 'vitest';
import { buildFaqAnswerPrompt, buildFaqPlanPrompt } from './faq-prompts.js';
import type { FaqWorkerTask } from './worker-task.js';

describe('FAQ prompt skill context', () => {
  it('renders loaded skill guidance and read intents into planning and answer prompts', () => {
    const task: FaqWorkerTask = {
      agent: 'FaqAgent',
      currentStage: 'EXPLAIN_PROCESS',
      primaryStage: 'COLLECT_MEDICAL_INPUTS',
      latestUserMessage: 'How long does online consultation take?',
      primaryAction: { type: 'ANSWER', target: 'consult', mode: 'faq' },
      followUpAction: { type: 'GO_DEEP', target: 'consult', reasonCode: 'user_requested_detail' },
      loadedSkillSections: [{
        skillId: 'consult_skill',
        role: 'primary',
        reasonCode: 'answer_consult_faq',
        sectionIds: ['consult_policy', 'consult_readiness'],
        readIntentTypes: ['GENERAL_FAQ', 'CONSULT_READINESS'],
        policyText: ['Answer consult timing from grounded FAQ policy before asking for records.'],
        retrievalGuidance: ['Retrieve consult readiness criteria and matching FAQ entries.'],
        handlingGuidance: ['Give the answer first, then invite one readiness step.'],
      }],
      readIntents: [
        { type: 'GENERAL_FAQ', category: 'consult', reasonCode: 'answer_consult_faq' },
        { type: 'CONSULT_READINESS', reasonCode: 'consult_skill:consult_readiness' },
      ],
      responseContract: {
        structure: 'answer_then_advance',
        primaryMove: 'answer',
        followUpMove: 'go_deep',
        constraints: {
          maxQuestions: 1,
          preservePrimaryStage: true,
          answerBeforeAsk: true,
          avoidMultipleCTAs: true,
          language: 'zh',
        },
        safetyRules: [],
      },
    };

    const prompts = [
      buildFaqPlanPrompt({ task }),
      buildFaqAnswerPrompt({
        task,
        plan: { query: 'online consultation timing', reason: 'consult faq' },
        matches: [],
        details: [],
      }),
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain('loaded_skill_sections=');
      expect(prompt).toContain('consult_skill');
      expect(prompt).toContain('"sectionIds":["consult_policy","consult_readiness"]');
      expect(prompt).toContain('"readIntentTypes":["GENERAL_FAQ","CONSULT_READINESS"]');
      expect(prompt).toContain('Answer consult timing from grounded FAQ policy before asking for records.');
      expect(prompt).toContain('Retrieve consult readiness criteria and matching FAQ entries.');
      expect(prompt).toContain('Give the answer first, then invite one readiness step.');
      expect(prompt).toContain('read_intents={"type":"GENERAL_FAQ","category":"consult","reasonCode":"answer_consult_faq"}, {"type":"CONSULT_READINESS","reasonCode":"consult_skill:consult_readiness"}');
      expect(prompt).not.toContain('[object Object]');
    }
  });
});
