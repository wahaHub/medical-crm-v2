import { describe, expect, it } from 'vitest';
import { buildReadPlan } from '../../chatbot-v3/read-planner.js';
import type { SupervisorEvent, TurnPlan } from '../../chatbot-v3/supervisor-event.types.js';
import type {
  DomainSkillId,
  LoadedSkillSection,
} from '../../chatbot-v3/skill-packs.js';

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

  function loadedSection(
    skillId: DomainSkillId,
    overrides: Partial<LoadedSkillSection> = {},
  ): LoadedSkillSection {
    return {
      skillId,
      role: 'primary',
      reasonCode: `${skillId}_loaded`,
      sectionIds: [],
      readIntentTypes: [],
      policyText: [],
      retrievalGuidance: [],
      handlingGuidance: [],
      ...overrides,
    };
  }

  it('plans admin FAQ reads from loaded pricing skill sections', () => {
    const plan = buildReadPlan({
      event: event({ target: 'pricing' }),
      turnPlan: turnPlan({}),
      loadedSkillSections: [
        loadedSection('pricing_skill', {
          sectionIds: ['pricing_sources'],
          readIntentTypes: ['GENERAL_FAQ'],
        }),
      ],
    });

    expect(plan.readIntents).toContainEqual({
      type: 'GENERAL_FAQ',
      category: 'pricing',
      reasonCode: 'pricing_skill:pricing_sources',
    });
  });

  it('plans hospital and records reads from loaded domain skill sections', () => {
    const plan = buildReadPlan({
      event: event({ target: 'hospital' }),
      turnPlan: turnPlan({ primaryAction: { type: 'PRESENT_OPTIONS', target: 'hospital' } }),
      loadedSkillSections: [
        loadedSection('hospital_skill', {
          sectionIds: ['hospital_sources'],
          readIntentTypes: ['HOSPITAL_CANDIDATES', 'HOSPITAL_FAQ'],
        }),
        loadedSection('treatment_skill', {
          sectionIds: ['treatment_requirements'],
          readIntentTypes: ['RECORD_REQUIREMENTS'],
        }),
      ],
    });

    expect(plan.readIntents).toEqual(expect.arrayContaining([
      { type: 'HOSPITAL_CANDIDATES', reasonCode: 'hospital_skill:hospital_sources' },
      { type: 'HOSPITAL_FAQ', category: 'hospital', reasonCode: 'hospital_skill:hospital_sources' },
      { type: 'RECORD_REQUIREMENTS', reasonCode: 'treatment_skill:treatment_requirements' },
    ]));
  });

  it('plans pricing factors and pricing FAQ from loaded pricing skill sections', () => {
    const plan = buildReadPlan({
      event: event({ target: 'pricing' }),
      turnPlan: turnPlan({ primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' } }),
      loadedSkillSections: [
        loadedSection('pricing_skill', {
          sectionIds: ['pricing_sources'],
          retrievalGuidance: [
            'Use pricing factors first; use pricing FAQ only when the user asks a policy question.',
          ],
        }),
      ],
    });

    expect(plan.readIntents).toEqual(expect.arrayContaining([
      { type: 'PRICING_FACTORS', reasonCode: 'pricing_skill:pricing_sources' },
      { type: 'GENERAL_FAQ', category: 'pricing', reasonCode: 'pricing_skill:pricing_sources' },
    ]));
  });

  it('plans record requirements from loaded documents skill sections', () => {
    const plan = buildReadPlan({
      event: event({ target: 'treatment' }),
      turnPlan: turnPlan({ primaryAction: { type: 'HANDLE_RESPONSE', target: 'treatment', modifier: 'reject' } }),
      loadedSkillSections: [
        loadedSection('treatment_skill', {
          sectionIds: ['treatment_requirements'],
          retrievalGuidance: ['Use record requirements to name the next useful document set.'],
        }),
      ],
    });

    expect(plan.readIntents).toContainEqual({
      type: 'RECORD_REQUIREMENTS',
      reasonCode: 'treatment_skill:treatment_requirements',
    });
  });

  it('plans process, travel, and payment reads from loaded process sections and hints', () => {
    const processPlan = buildReadPlan({
      event: event({ target: 'policy' }),
      turnPlan: turnPlan({ primaryAction: { type: 'ANSWER', target: 'policy', mode: 'faq' } }),
      loadedSkillSections: [
        loadedSection('policy_skill', {
          sectionIds: ['policy_sources'],
          retrievalGuidance: ['Use process policy first; use process FAQ for direct user questions.'],
        }),
      ],
    });
    const travelPlan = buildReadPlan({
      event: event({ target: 'travel' }),
      turnPlan: turnPlan({ primaryAction: { type: 'ANSWER', target: 'travel', mode: 'faq' } }),
      loadedSkillSections: [
        loadedSection('policy_skill', {
          sectionIds: ['travel_support_scope'],
          retrievalGuidance: ['Use treatment-related travel support scope for visa, flight, hotel, or trip questions.'],
        }),
      ],
    });
    const paymentPlan = buildReadPlan({
      event: event({ target: 'payment' }),
      turnPlan: turnPlan({ primaryAction: { type: 'ANSWER', target: 'payment', mode: 'faq' } }),
      loadedSkillSections: [
        loadedSection('policy_skill', {
          sectionIds: ['payment_policy'],
          retrievalGuidance: ['Use payment policy for payment method, timing, and payment support questions.'],
        }),
      ],
    });

    expect(processPlan.readIntents).toContainEqual({
      type: 'PROCESS_POLICY',
      reasonCode: 'policy_skill:policy_sources',
    });
    expect(travelPlan.readIntents).toContainEqual({
      type: 'TRAVEL_SUPPORT_SCOPE',
      reasonCode: 'policy_skill:travel_support_scope',
    });
    expect(paymentPlan.readIntents).toContainEqual({
      type: 'PAYMENT_POLICY',
      reasonCode: 'policy_skill:payment_policy',
    });
  });

  it('plans hospital candidates and hospital FAQ from loaded recommendation guidance', () => {
    const plan = buildReadPlan({
      event: event({ target: 'hospital' }),
      turnPlan: turnPlan({ primaryAction: { type: 'PRESENT_OPTIONS', target: 'hospital' } }),
      loadedSkillSections: [
        loadedSection('hospital_skill', {
          sectionIds: ['hospital_sources'],
          retrievalGuidance: [
            'Use approved recommendation candidates and hospital context before comparing options.',
          ],
        }),
      ],
    });

    expect(plan.readIntents).toEqual(expect.arrayContaining([
      { type: 'HOSPITAL_CANDIDATES', reasonCode: 'hospital_skill:hospital_sources' },
      {
        type: 'HOSPITAL_FAQ',
        category: 'hospital',
        reasonCode: 'hospital_skill:hospital_sources',
      },
    ]));
  });

  it('plans doctor matching context from structured recommendation read intent types without prose signals', () => {
    const plan = buildReadPlan({
      event: event({ target: 'hospital' }),
      turnPlan: turnPlan({ primaryAction: { type: 'PRESENT_OPTIONS', target: 'hospital' } }),
      loadedSkillSections: [
        loadedSection('hospital_skill', {
          sectionIds: ['hospital_sources'],
          retrievalGuidance: [
            'Use approved recommendation candidates and hospital context before comparing options.',
          ],
          readIntentTypes: [
            'HOSPITAL_CANDIDATES',
            'HOSPITAL_FAQ',
            'DOCTOR_MATCHING_CONTEXT',
          ],
        }),
      ],
    });

    expect(plan.readIntents).toContainEqual({
      type: 'DOCTOR_MATCHING_CONTEXT',
      reasonCode: 'hospital_skill:hospital_sources',
    });
  });

  it('plans consult readiness from loaded consult sections', () => {
    const plan = buildReadPlan({
      event: event({ target: 'treatment' }),
      turnPlan: turnPlan({ primaryAction: { type: 'PRESENT_OPTIONS', target: 'treatment' } }),
      loadedSkillSections: [
        loadedSection('treatment_skill', {
          sectionIds: ['treatment_sources'],
          retrievalGuidance: ['Use consult readiness first; use consult FAQ for direct policy questions.'],
        }),
      ],
    });

    expect(plan.readIntents).toContainEqual({
      type: 'CONSULT_READINESS',
      reasonCode: 'treatment_skill:treatment_sources',
    });
  });

  it('plans service scope from loaded safety scope sections', () => {
    const plan = buildReadPlan({
      event: event({ eventType: 'USER_ASKED_QUESTION', target: 'service_scope' }),
      turnPlan: turnPlan({ primaryAction: { type: 'REDIRECT', target: 'service_scope', reasonCode: 'out_of_scope' } }),
      loadedSkillSections: [
        loadedSection('service_scope_skill', {
          sectionIds: ['service_scope'],
          retrievalGuidance: [
            'Use service scope for out-of-scope or restricted-service boundaries; do not perform medical lookup.',
          ],
        }),
      ],
    });

    expect(plan.readIntents).toContainEqual({
      type: 'SERVICE_SCOPE',
      reasonCode: 'service_scope_skill:service_scope',
    });
  });

  it('dedupes identical reads from loaded skill sections deterministically', () => {
    const plan = buildReadPlan({
      event: event({ target: 'pricing' }),
      turnPlan: turnPlan({ primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' } }),
      loadedSkillSections: [
        loadedSection('pricing_skill', {
          sectionIds: ['pricing_sources'],
          retrievalGuidance: ['Use pricing factors first; use pricing FAQ only when the user asks a policy question.'],
        }),
        loadedSection('pricing_skill', {
          role: 'auxiliary',
          reasonCode: 'duplicate_pricing',
          sectionIds: ['pricing_sources'],
          retrievalGuidance: ['Use pricing factors first; use pricing FAQ only when the user asks a policy question.'],
        }),
      ],
    });

    expect(plan.readIntents).toEqual([
      { type: 'PRICING_FACTORS', reasonCode: 'pricing_skill:pricing_sources' },
      { type: 'GENERAL_FAQ', category: 'pricing', reasonCode: 'pricing_skill:pricing_sources' },
    ]);
  });

});
