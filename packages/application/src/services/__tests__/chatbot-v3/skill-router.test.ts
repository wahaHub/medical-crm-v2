import { describe, expect, it } from 'vitest';
import { loadSkillSections } from '../../chatbot-v3/skill-loader.js';
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
    followUpAction: { type: 'INVITE_NEXT_STEP', target: 'treatment', reason: 'pricing_requires_records' },
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
      { skillId: 'treatment_skill', role: 'auxiliary', sectionHints: { target: 'treatment' } },
    ]);
  });

  it('routes treatment input rejection to treatment as the primary domain skill', () => {
    expect(requests({
      event: event({ eventType: 'USER_RESPONDED_TO_REQUEST', target: 'treatment', modifier: 'reject' }),
      turnPlan: plan({
        primaryAction: { type: 'HANDLE_RESPONSE', target: 'treatment', modifier: 'reject' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'RecordsAgent',
    })).toMatchObject([
      { skillId: 'treatment_skill', role: 'primary' },
    ]);
  });

  it('routes next-step questions during treatment input collection to policy with treatment auxiliary', () => {
    expect(requests({
      event: event({ target: 'policy' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'policy', mode: 'faq' },
        followUpAction: { type: 'INVITE_NEXT_STEP', target: 'treatment', reason: 'resume_records' },
      }),
      agentRole: 'RecordsAgent',
    })).toMatchObject([
      { skillId: 'policy_skill', role: 'primary' },
      { skillId: 'treatment_skill', role: 'auxiliary' },
    ]);
  });

  it('routes service-scope redirects to the service scope domain skill', () => {
    expect(requests({
      event: event({ eventType: 'USER_ASKED_QUESTION', target: 'service_scope' }),
      turnPlan: plan({
        primaryAction: { type: 'REDIRECT', target: 'service_scope', reasonCode: 'out_of_scope' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'service_scope_skill',
      role: 'primary',
    });
  });

  it('routes provided contact information to human handoff as the primary domain skill', () => {
    expect(requests({
      event: event({ eventType: 'USER_PROVIDED_INFORMATION', target: 'handoff', modifier: 'provide' }),
      turnPlan: plan({
        primaryAction: { type: 'ACKNOWLEDGE', target: 'handoff' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'HandoffAgent',
    })[0]).toMatchObject({
      skillId: 'handoff_skill',
      role: 'primary',
    });
  });

  it('routes hospital revisits to the hospital domain skill', () => {
    expect(requests({
      event: event({ eventType: 'USER_RESPONDED_TO_REQUEST', target: 'hospital', modifier: 'revisit' }),
      turnPlan: plan({
        primaryAction: { type: 'HANDLE_RESPONSE', target: 'hospital', modifier: 'revisit' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'RecommendationAgent',
    })[0]).toMatchObject({
      skillId: 'hospital_skill',
      role: 'primary',
    });
  });

  it('routes travel questions to the travel domain skill', () => {
    expect(requests({
      event: event({ target: 'travel' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'travel', mode: 'faq' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'travel_skill',
      role: 'primary',
    });
  });

  it('routes consult FAQ turns to consult FAQ skill sections', () => {
    const policy = buildSkillPolicy({
      event: event({ target: 'unknown' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'consult', mode: 'faq' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
      facts: facts(),
    });

    expect(policy.requests[0]).toMatchObject({
      skillId: 'faq_skill',
      role: 'primary',
      sectionHints: { target: 'consult' },
    });

    const loaded = loadSkillSections({ requests: policy.requests });
    expect(loaded.skillSections[0]?.sectionIds).toEqual(expect.arrayContaining([
      'consult_readiness',
      'consult_scope',
      'consult_sources',
    ]));
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('online consult');
    expect(loaded.skillSections[0]?.readIntentTypes).toContain('CONSULT_READINESS');
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
        primaryAction: { type: 'ANSWER', target: 'treatment', mode: 'faq' },
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
      skillId: 'medical_advice_skill',
      role: 'primary',
      sectionHints: { target: 'medical_advice' },
    });
  });

  it('routes medical-advice events to the medical advice skill before action fallback', () => {
    expect(requests({
      event: event({ eventType: 'USER_ASKED_QUESTION', target: 'medical_advice', modifier: 'ask' }),
      turnPlan: plan({
        primaryAction: { type: 'REQUEST_INFO', target: 'minimal_triage' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'medical_advice_skill',
      role: 'primary',
      sectionHints: { target: 'medical_advice' },
    });
  });

  it('routes preference requests to hospital with hospital section hints', () => {
    expect(requests({
      event: event({ target: 'unknown' }),
      turnPlan: plan({
        primaryAction: { type: 'REQUEST_INFO', target: 'preference' },
        followUpAction: { type: 'NONE' },
      }),
      agentRole: 'GeneralResponseAgent',
    })[0]).toMatchObject({
      skillId: 'hospital_skill',
      role: 'primary',
      sectionHints: { target: 'hospital' },
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
