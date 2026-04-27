import { describe, expect, it } from 'vitest';
import { resolveAgent } from '../../chatbot-v3/agent-resolver.js';
import type { DomainFacts, SupervisorEvent, TurnPlan } from '../../chatbot-v3/supervisor-event.types.js';

function facts(): DomainFacts {
  return {
    language: 'zh',
    intake: { minimalTriageStatus: 'submitted' },
    recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
    process: { explained: true },
    records: { supportingDocumentsCount: 1, availableDocumentTypes: [], missingDocumentTypes: [] },
    consult: { status: 'not_started' },
    handoff: { active: false },
  };
}

function event(overrides: Partial<SupervisorEvent>): SupervisorEvent {
  return {
    eventType: 'USER_ASKED_QUESTION',
    target: 'pricing',
    modifier: 'ask',
    confidence: 0.9,
    source: 'llm',
    ...overrides,
  };
}

function plan(overrides: Partial<TurnPlan>): TurnPlan {
  return {
    primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' },
    followUpAction: { type: 'NONE' },
    primaryStage: 'COLLECT_MEDICAL_INPUTS',
    factsPatch: {},
    reasonCode: 'test_plan',
    ...overrides,
  };
}

describe('resolveAgent', () => {
  it('prioritizes human escalation', () => {
    expect(resolveAgent({
      event: event({ eventType: 'USER_REQUESTED_HUMAN', target: 'human', modifier: 'ask' }),
      turnPlan: plan({ primaryAction: { type: 'ESCALATE', target: 'human' }, primaryStage: 'HUMAN_HANDOFF' }),
      facts: facts(),
    }).physicalAgent).toBe('HandoffAgent');
  });

  it('routes document upload and records-owned requests to RecordsAgent', () => {
    expect(resolveAgent({
      event: event({ eventType: 'DOCUMENTS_UPLOADED', target: 'documents', modifier: 'provide', source: 'deterministic' }),
      turnPlan: plan({ primaryAction: { type: 'REQUEST_INFO', target: 'documents' } }),
      facts: facts(),
    }).physicalAgent).toBe('RecordsAgent');
  });

  it('routes hospital and recommendation questions to RecommendationAgent', () => {
    expect(resolveAgent({
      event: event({ target: 'hospital', modifier: 'ask' }),
      turnPlan: plan({ primaryAction: { type: 'ANSWER', target: 'hospital', mode: 'faq' } }),
      facts: facts(),
    }).physicalAgent).toBe('RecommendationAgent');
  });

  it('routes consult options, answers, and consult deep dives to ConsultAgent', () => {
    expect(resolveAgent({
      event: event({ eventType: 'USER_EXPRESSED_NEED', target: 'consult', modifier: 'ask' }),
      turnPlan: plan({ primaryAction: { type: 'PRESENT_OPTIONS', target: 'consult' }, primaryStage: 'ONLINE_CONSULT' }),
      facts: facts(),
    }).physicalAgent).toBe('ConsultAgent');

    expect(resolveAgent({
      event: event({ target: 'consult', modifier: 'ask' }),
      turnPlan: plan({ primaryAction: { type: 'ANSWER', target: 'consult', mode: 'faq' } }),
      facts: facts(),
    }).physicalAgent).toBe('ConsultAgent');

    expect(resolveAgent({
      event: event({ target: 'consult', modifier: 'ask' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'consult', mode: 'faq' },
        followUpAction: { type: 'GO_DEEP', target: 'consult', reasonCode: 'user_requested_more_detail' },
      }),
      facts: facts(),
    }).physicalAgent).toBe('ConsultAgent');
  });

  it('defaults general FAQ and redirect language to FaqAgent', () => {
    expect(resolveAgent({
      event: event({ target: 'pricing', modifier: 'ask' }),
      turnPlan: plan({ primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' } }),
      facts: facts(),
    })).toEqual({
      conceptualRole: 'GeneralResponseAgent',
      physicalAgent: 'FaqAgent',
      reasonCode: 'general_response_default',
    });
  });
});
