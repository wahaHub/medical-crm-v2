import { describe, expect, it } from 'vitest';
import { buildSkillPolicy } from '../../chatbot-v3/skill-router.js';
import type { AgentRole } from '../../chatbot-v3/agent-resolver.js';
import type { DomainFacts, SupervisorEvent, TurnPlan } from '../../chatbot-v3/supervisor-event.types.js';

function facts(): DomainFacts {
  return {
    language: 'zh',
    intake: { minimalTriageStatus: 'submitted' },
    recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
    process: { explained: true },
    records: { supportingDocumentsCount: 0, availableDocumentTypes: [], missingDocumentTypes: [] },
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
    followUpAction: { type: 'INVITE_NEXT_STEP', target: 'documents', reason: 'pricing_requires_records' },
    primaryStage: 'COLLECT_MEDICAL_INPUTS',
    factsPatch: {},
    reasonCode: 'test_plan',
    ...overrides,
  };
}

function requests(input: { event: SupervisorEvent; turnPlan: TurnPlan; agentRole: AgentRole }) {
  return buildSkillPolicy({ ...input, facts: facts() }).requests;
}

describe('buildSkillPolicy', () => {
  it('routes pricing answers with document next steps to primary and auxiliary domain skills', () => {
    expect(requests({
      event: event({ target: 'pricing' }),
      turnPlan: plan({}),
      agentRole: 'GeneralResponseAgent',
    })).toMatchObject([
      { skillId: 'pricing_skill', role: 'primary', sectionHints: { target: 'pricing' } },
      { skillId: 'documents_skill', role: 'auxiliary', sectionHints: { target: 'documents' } },
    ]);
  });

  it('routes document rejection to documents as the primary domain skill', () => {
    expect(requests({
      event: event({ eventType: 'USER_RESPONDED_TO_REQUEST', target: 'documents', modifier: 'reject' }),
      turnPlan: plan({
        primaryAction: { type: 'HANDLE_RESPONSE', target: 'documents', modifier: 'reject' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'RecordsAgent',
    })).toMatchObject([
      { skillId: 'documents_skill', role: 'primary' },
    ]);
  });

  it('routes next-step questions during records collection to process with documents auxiliary', () => {
    expect(requests({
      event: event({ target: 'next_step' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'next_step', mode: 'faq' },
        followUpAction: { type: 'INVITE_NEXT_STEP', target: 'documents', reason: 'resume_records' },
      }),
      agentRole: 'RecordsAgent',
    })).toMatchObject([
      { skillId: 'process_skill', role: 'primary' },
      { skillId: 'documents_skill', role: 'auxiliary' },
    ]);
  });

  it('routes out-of-scope redirects to the safety scope domain skill', () => {
    expect(requests({
      event: event({ eventType: 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE', target: 'unknown' }),
      turnPlan: plan({
        primaryAction: { type: 'REDIRECT', target: 'unknown', reasonCode: 'out_of_scope' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'safety_scope_skill',
      role: 'primary',
    });
  });

  it('routes provided contact information to human handoff as the primary domain skill', () => {
    expect(requests({
      event: event({ eventType: 'USER_PROVIDED_INFORMATION', target: 'contact', modifier: 'provide' }),
      turnPlan: plan({
        primaryAction: { type: 'ACKNOWLEDGE', target: 'contact' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'HandoffAgent',
    })[0]).toMatchObject({
      skillId: 'human_handoff_skill',
      role: 'primary',
    });
  });

  it('routes recommendation revisits to the hospital recommendation domain skill', () => {
    expect(requests({
      event: event({ eventType: 'USER_RESPONDED_TO_REQUEST', target: 'recommendation', modifier: 'revisit' }),
      turnPlan: plan({
        primaryAction: { type: 'HANDLE_RESPONSE', target: 'recommendation', modifier: 'revisit' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'RecommendationAgent',
    })[0]).toMatchObject({
      skillId: 'hospital_recommendation_skill',
      role: 'primary',
    });
  });

  it('routes travel questions to the process domain skill', () => {
    expect(requests({
      event: event({ target: 'travel' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'travel', mode: 'faq' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'process_skill',
      role: 'primary',
    });
  });

  it('uses the primary action target for section hints when the event target is unknown', () => {
    expect(requests({
      event: event({ target: 'unknown' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'pricing_skill',
      role: 'primary',
      sectionHints: { target: 'pricing' },
    });
  });

  it('prefers a known event target over the primary action target for primary routing', () => {
    expect(requests({
      event: event({ target: 'pricing' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'documents', mode: 'faq' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'pricing_skill',
      role: 'primary',
      sectionHints: { target: 'pricing' },
    });
  });

  it('routes minimal triage requests to documents with medical facts section hints', () => {
    expect(requests({
      event: event({ target: 'unknown' }),
      turnPlan: plan({
        primaryAction: { type: 'REQUEST_INFO', target: 'minimal_triage' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'documents_skill',
      role: 'primary',
      sectionHints: { target: 'medical_facts' },
    });
  });

  it('falls back to minimal triage action routing when the event target is unmapped treatment', () => {
    expect(requests({
      event: event({ eventType: 'USER_EXPRESSED_NEED', target: 'treatment', modifier: 'ask' }),
      turnPlan: plan({
        primaryAction: { type: 'REQUEST_INFO', target: 'minimal_triage' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'documents_skill',
      role: 'primary',
      sectionHints: { target: 'medical_facts' },
    });
  });

  it('routes preference requests to hospital recommendation with recommendation section hints', () => {
    expect(requests({
      event: event({ target: 'unknown' }),
      turnPlan: plan({
        primaryAction: { type: 'REQUEST_INFO', target: 'preference' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'hospital_recommendation_skill',
      role: 'primary',
      sectionHints: { target: 'recommendation' },
    });
  });

  it('deduplicates primary and auxiliary collisions and caps requests at two', () => {
    expect(requests({
      event: event({ target: 'pricing' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' },
        followUpAction: { type: 'GO_DEEP', target: 'pricing', reasonCode: 'user_requested_more_detail' },
      }),
      agentRole: 'GeneralResponseAgent',
    })).toHaveLength(1);
  });
});
