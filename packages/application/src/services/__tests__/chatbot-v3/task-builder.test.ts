import { describe, expect, it } from 'vitest';
import { buildAgentTask } from '../../chatbot-v3/task-builder.js';
import type { ResolvedAgent } from '../../chatbot-v3/agent-resolver.js';
import type { ReadPlan } from '../../chatbot-v3/read-planner.js';
import type { LoadedSkillSection } from '../../chatbot-v3/skill-packs.js';
import type { DomainFacts, SupervisorEvent, TurnPlan } from '../../chatbot-v3/supervisor-event.types.js';

const facts: DomainFacts = {
  language: 'zh',
  intake: { minimalTriageStatus: 'submitted', condition: 'brain tumor', destination: 'China' },
  recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
  process: { explained: true },
  records: { supportingDocumentsCount: 0, availableDocumentTypes: [], missingDocumentTypes: [] },
  consult: { status: 'not_started' },
  handoff: { active: false },
};

const event: SupervisorEvent = {
  eventType: 'USER_ASKED_QUESTION',
  target: 'pricing',
  modifier: 'ask',
  confidence: 0.9,
  source: 'llm',
};

const turnPlan: TurnPlan = {
  primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' },
  followUpAction: { type: 'INVITE_NEXT_STEP', target: 'documents', reason: 'pricing_requires_records' },
  primaryStage: 'COLLECT_MEDICAL_INPUTS',
  factsPatch: {},
  reasonCode: 'pricing_question',
  sidePath: { type: 'faq', primaryStagePreserved: true },
};

const resolvedAgent: ResolvedAgent = {
  conceptualRole: 'GeneralResponseAgent',
  physicalAgent: 'FaqAgent',
  reasonCode: 'general_response_default',
};

const loadedSkillSections: LoadedSkillSection[] = [{
  skillId: 'pricing_skill',
  role: 'primary',
  reasonCode: 'pricing_question',
  sectionIds: ['pricing_sources', 'pricing_response_policy'],
  readIntentTypes: ['PRICING_FACTORS', 'GENERAL_FAQ'],
  policyText: ['Never quote fixed prices without records.'],
  retrievalGuidance: ['Use pricing factors before explaining estimated costs.'],
  handlingGuidance: ['Explain why records are needed before inviting upload.'],
}];

const readPlan: ReadPlan = {
  reasonCode: 'pricing_question',
  readIntents: [
    { type: 'PRICING_FACTORS', reasonCode: 'pricing_skill:pricing_sources' },
    { type: 'GENERAL_FAQ', category: 'pricing', reasonCode: 'pricing_skill:pricing_sources' },
  ],
};

describe('buildAgentTask', () => {
  it('builds a skill-section task with stage context and ReadIntent-aligned retrieval', () => {
    const pricingIntent = readPlan.readIntents[0]!;
    const faqIntent = readPlan.readIntents[1]!;
    const task = buildAgentTask({
      event,
      turnPlan,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      resolvedAgent,
      latestUserMessage: '大概多少钱？',
      conversationSummary: 'User selected a hospital and needs records guidance.',
      knownFacts: facts,
      loadedSkillSections,
      readPlan,
      retrievedContext: [
        {
          readIntentId: 'read-0',
          readIntent: pricingIntent,
          snippets: [{ text: 'Pricing depends on records and hospital plan.', source: 'pricing_policy', score: 0.91 }],
        },
        {
          readIntentId: 'read-1',
          readIntent: faqIntent,
          snippets: [{ text: 'Final quotes require case review.', source: 'faq:pricing' }],
        },
      ],
    });

    expect(task.currentStage).toBe('COLLECT_MEDICAL_INPUTS');
    expect(task.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
    expect(task).not.toHaveProperty('fromStage');
    expect(task).not.toHaveProperty('toStage');
    expect(task.primaryAction).toEqual({ type: 'ANSWER', target: 'pricing', mode: 'faq' });
    expect(task.followUpAction).toEqual({ type: 'INVITE_NEXT_STEP', target: 'documents', reason: 'pricing_requires_records' });
    expect(task.loadedSkillSections).toEqual(loadedSkillSections);
    expect(task.loadedSkillSections[0]).toEqual({
      skillId: 'pricing_skill',
      role: 'primary',
      reasonCode: 'pricing_question',
      sectionIds: ['pricing_sources', 'pricing_response_policy'],
      readIntentTypes: ['PRICING_FACTORS', 'GENERAL_FAQ'],
      policyText: ['Never quote fixed prices without records.'],
      retrievalGuidance: ['Use pricing factors before explaining estimated costs.'],
      handlingGuidance: ['Explain why records are needed before inviting upload.'],
    });
    expect(task.readIntents).toBe(readPlan.readIntents);
    expect(task.retrievedContext).toEqual([
      {
        readIntentId: 'read-0',
        readIntent: pricingIntent,
        snippets: [{ text: 'Pricing depends on records and hospital plan.', source: 'pricing_policy', score: 0.91 }],
      },
      {
        readIntentId: 'read-1',
        readIntent: faqIntent,
        snippets: [{ text: 'Final quotes require case review.', source: 'faq:pricing' }],
      },
    ]);
    expect(task.retrievedContext[0]?.readIntent).toBe(pricingIntent);
    expect(task.responseContract.structure).toBe('answer_then_advance');
    expect(task.responseContract.primaryMove).toBe('answer');
    expect(task.responseContract.followUpMove).toBe('invite_next_step');
    expect(task.responseContract.constraints).toMatchObject({
      maxQuestions: 1,
      preservePrimaryStage: true,
      answerBeforeAsk: true,
      avoidMultipleCTAs: true,
      language: 'zh',
    });
    expect(task.responseContract.constraints).not.toHaveProperty('tone');
    expect(task).not.toHaveProperty('loadedSkills');
    expect(task).not.toHaveProperty('skillPolicy');
  });

  it('builds strict redirect contracts for safety actions', () => {
    const task = buildAgentTask({
      event: { eventType: 'USER_ASKED_MEDICAL_ADVICE', target: 'medical_facts', modifier: 'ask', confidence: 0.9, source: 'llm' },
      turnPlan: {
        primaryAction: { type: 'REDIRECT', target: 'medical_facts', reasonCode: 'medical_safety' },
        followUpAction: { type: 'NONE' },
        primaryStage: 'COLLECT_MEDICAL_INPUTS',
        factsPatch: {},
        reasonCode: 'safety_redirect',
        sidePath: { type: 'safety', primaryStagePreserved: true },
      },
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      resolvedAgent,
      latestUserMessage: '能保证治好吗？',
      conversationSummary: '',
      knownFacts: facts,
      loadedSkillSections: [],
      readPlan: { reasonCode: 'safety_redirect', readIntents: [] },
      retrievedContext: [],
    });

    expect(task.responseContract.structure).toBe('redirect_then_advance');
    expect(task.responseContract.primaryMove).toBe('redirect');
    expect(task.currentStage).toBe('COLLECT_MEDICAL_INPUTS');
    expect(task.loadedSkillSections).toEqual([]);
    expect(task.readIntents).toEqual([]);
    expect(task.retrievedContext).toEqual([]);
    expect(task.responseContract.constraints).not.toHaveProperty('tone');
    expect(task.responseContract.safetyRules).toEqual(expect.arrayContaining([
      'do_not_diagnose',
      'do_not_recommend_medication',
      'do_not_guarantee_outcome',
    ]));
  });
});
