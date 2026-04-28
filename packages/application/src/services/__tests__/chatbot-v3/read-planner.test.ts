import { describe, expect, it } from 'vitest';
import { buildReadPlan } from '../../chatbot-v3/read-planner.js';
import type { SupervisorEvent, TurnPlan } from '../../chatbot-v3/supervisor-event.types.js';
import type { LegacySkillPackId, LoadedSkillPack } from '../../chatbot-v3/skill-packs.js';

describe('buildReadPlan', () => {
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

  function turnPlan(overrides: Partial<TurnPlan>): TurnPlan {
    return {
      primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' },
      followUpAction: { type: 'NONE' },
      primaryStage: 'COLLECT_MEDICAL_INPUTS',
      factsPatch: {},
      reasonCode: 'test_plan',
      ...overrides,
    };
  }

  function skill(id: LegacySkillPackId): LoadedSkillPack {
    return {
      id,
      kind: 'retrieval_strategy',
      description: id,
      reasonCodes: ['test'],
    };
  }

  it('plans admin FAQ reads from FAQ retrieval skills', () => {
    const plan = buildReadPlan({
      event: event({ target: 'pricing' }),
      turnPlan: turnPlan({}),
      loadedSkills: [
        skill('search_general_faq_by_category'),
        skill('answer_general_faq_from_admin_source'),
      ],
    });

    expect(plan.readIntents).toContainEqual({
      type: 'GENERAL_FAQ',
      category: 'pricing',
      reasonCode: 'search_general_faq_by_category',
    });
  });

  it('plans hospital and records reads from skill requests and turn plan', () => {
    const plan = buildReadPlan({
      event: event({ target: 'hospital' }),
      turnPlan: turnPlan({ primaryAction: { type: 'PRESENT_OPTIONS', target: 'hospital' } }),
      loadedSkills: [
        skill('search_hospital_candidates'),
        skill('search_hospital_faq_by_category'),
        skill('load_records_requirement_data'),
      ],
    });

    expect(plan.readIntents).toEqual(expect.arrayContaining([
      { type: 'HOSPITAL_CANDIDATES', reasonCode: 'search_hospital_candidates' },
      { type: 'HOSPITAL_FAQ', category: 'hospital', reasonCode: 'search_hospital_faq_by_category' },
      { type: 'RECORD_REQUIREMENTS', reasonCode: 'load_records_requirement_data' },
    ]));
  });
});
