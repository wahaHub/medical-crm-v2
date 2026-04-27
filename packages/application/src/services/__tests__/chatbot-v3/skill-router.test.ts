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

function skillIds(input: { event: SupervisorEvent; turnPlan: TurnPlan; agentRole: AgentRole }) {
  return buildSkillPolicy({ ...input, facts: facts() }).requests.map((request) => request.skillPackId);
}

describe('buildSkillPolicy', () => {
  it('selects admin FAQ and pricing skills for pricing questions', () => {
    expect(skillIds({
      event: event({ target: 'pricing' }),
      turnPlan: plan({}),
      agentRole: 'GeneralResponseAgent',
    })).toEqual(expect.arrayContaining([
      'search_general_faq_by_category',
      'answer_general_faq_from_admin_source',
      'explain_pricing_uncertainty',
      'explain_records_preparation',
    ]));
  });

  it('selects records skills for documents and uploaded records', () => {
    expect(skillIds({
      event: event({ eventType: 'DOCUMENTS_UPLOADED', target: 'documents', modifier: 'provide', source: 'deterministic' }),
      turnPlan: plan({ primaryAction: { type: 'REQUEST_INFO', target: 'documents' } }),
      agentRole: 'RecordsAgent',
    })).toEqual(expect.arrayContaining([
      'load_records_requirement_data',
      'derive_record_inventory_candidate',
      'explain_records_preparation',
    ]));
  });

  it('selects consult skills for consult-owned deep dives', () => {
    expect(skillIds({
      event: event({ target: 'consult' }),
      turnPlan: plan({
        primaryAction: { type: 'ANSWER', target: 'consult', mode: 'faq' },
        followUpAction: { type: 'GO_DEEP', target: 'consult', reasonCode: 'user_requested_more_detail' },
      }),
      agentRole: 'ConsultAgent',
    })).toEqual(expect.arrayContaining([
      'load_consult_readiness_criteria',
      'explain_online_consult',
    ]));
  });

  it('selects handoff payload skills for contact or human handoff', () => {
    expect(skillIds({
      event: event({ eventType: 'USER_PROVIDED_INFORMATION', target: 'contact', modifier: 'provide' }),
      turnPlan: plan({ primaryAction: { type: 'ESCALATE', target: 'human', reasonCode: 'contact_info_provided' } }),
      agentRole: 'HandoffAgent',
    })).toEqual(expect.arrayContaining([
      'extract_contact_info_candidate',
      'build_handoff_payload_context',
      'soft_human_handoff',
    ]));
  });
});
