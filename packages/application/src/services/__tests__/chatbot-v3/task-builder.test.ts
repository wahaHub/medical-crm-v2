import { describe, expect, it } from 'vitest';
import { buildAgentTask } from '../../chatbot-v3/task-builder.js';
import type { ResolvedAgent } from '../../chatbot-v3/agent-resolver.js';
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

describe('buildAgentTask', () => {
  it('builds a contracted answer-then-advance task with known facts and loaded skills', () => {
    const task = buildAgentTask({
      event,
      turnPlan,
      resolvedAgent,
      latestUserMessage: '大概多少钱？',
      conversationSummary: 'User selected a hospital and needs records guidance.',
      knownFacts: facts,
      loadedSkills: [{
        id: 'explain_pricing_uncertainty',
        kind: 'explanation_method',
        description: 'pricing',
        reasonCodes: ['pricing_question'],
      }],
      readPlan: {
        reasonCode: 'pricing_question',
        readIntents: [{ type: 'GENERAL_FAQ', category: 'pricing', reasonCode: 'search_general_faq_by_category' }],
      },
      retrievedContext: {
        knowledgeSnippets: ['Pricing depends on records and hospital plan.'],
      },
    });

    expect(task.primaryAction).toEqual({ type: 'ANSWER', target: 'pricing', mode: 'faq' });
    expect(task.followUpAction).toEqual({ type: 'INVITE_NEXT_STEP', target: 'documents', reason: 'pricing_requires_records' });
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
    expect(task.skillPolicy.allowedSkillPacks).toEqual(['explain_pricing_uncertainty']);
    expect(task.retrievedContext?.knowledgeSnippets).toEqual(['Pricing depends on records and hospital plan.']);
  });

  it('builds strict redirect contracts for safety actions', () => {
    const task = buildAgentTask({
      event: { eventType: 'USER_ASKED_RISKY_MEDICAL_ADVICE', target: 'medical_facts', modifier: 'ask', confidence: 0.9, source: 'llm' },
      turnPlan: {
        primaryAction: { type: 'REDIRECT', target: 'medical_facts', reasonCode: 'medical_safety' },
        followUpAction: { type: 'NONE' },
        primaryStage: 'COLLECT_MEDICAL_INPUTS',
        factsPatch: {},
        reasonCode: 'safety_redirect',
        sidePath: { type: 'safety', primaryStagePreserved: true },
      },
      resolvedAgent,
      latestUserMessage: '能保证治好吗？',
      conversationSummary: '',
      knownFacts: facts,
      loadedSkills: [],
      readPlan: { reasonCode: 'safety_redirect', readIntents: [] },
    });

    expect(task.responseContract.structure).toBe('redirect_then_advance');
    expect(task.responseContract.primaryMove).toBe('redirect');
    expect(task.responseContract.safetyRules).toEqual(expect.arrayContaining([
      'do_not_diagnose',
      'do_not_recommend_medication',
      'do_not_guarantee_outcome',
    ]));
  });
});
