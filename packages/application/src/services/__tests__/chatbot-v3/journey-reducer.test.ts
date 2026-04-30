import { describe, expect, it } from 'vitest';
import { reduceJourney } from '../../chatbot-v3/journey-reducer.js';
import type { DomainFacts, JourneyState, SupervisorEvent } from '../../chatbot-v3/supervisor-event.types.js';

function facts(overrides: Partial<DomainFacts> = {}): DomainFacts {
  return {
    language: 'zh',
    intake: {
      minimalTriageStatus: 'not_started',
      minimalTriageSummary: null,
      condition: 'brain tumor',
      destination: 'China',
      patientGender: 'female',
      relationToPatient: null,
      ...overrides.intake,
    },
    recommendation: {
      status: 'none',
      selectedHospitalIds: [],
      generated: false,
      ...overrides.recommendation,
    },
    process: {
      explained: false,
      ...overrides.process,
    },
    records: {
      supportingDocumentsCount: 0,
      availableDocumentTypes: [],
      missingDocumentTypes: [],
      ...overrides.records,
    },
    consult: {
      status: 'not_started',
      ...overrides.consult,
    },
    handoff: {
      active: false,
      ...overrides.handoff,
    },
  };
}

function state(primaryStage: JourneyState['primaryStage']): JourneyState {
  return { primaryStage };
}

function event(eventType: SupervisorEvent['eventType'], metadata?: SupervisorEvent['metadata']): SupervisorEvent {
  return {
    eventType,
    confidence: 1,
    source: 'deterministic',
    ...(metadata ? { metadata } : {}),
  };
}

describe('reduceJourney', () => {
  it('routes TRIAGE_SUBMITTED to recommendation and patches submitted summary', () => {
    const result = reduceJourney({
      state: state('COLLECT_MINIMAL_MEDICAL_FACTS'),
      facts: facts(),
      event: event('TRIAGE_SUBMITTED', { rawText: '1. brain tumor 2. six months 3. no tests' }),
    });

    expect(result).not.toHaveProperty('nextAction');
    expect(result.turnPlan.primaryAction).toEqual({ type: 'PRESENT_OPTIONS', target: 'hospital' });
    expect(result.state.primaryStage).toBe('RECOMMENDATION');
    expect(result.facts.intake.minimalTriageStatus).toBe('submitted');
    expect(result.facts.intake.minimalTriageSummary).toBe('1. brain tumor 2. six months 3. no tests');
    expect(result.factsPatch.intake?.minimalTriageStatus).toBe('submitted');
  });

  it('routes TRIAGE_SKIPPED to recommendation and patches skipped status', () => {
    const result = reduceJourney({
      state: state('COLLECT_MINIMAL_MEDICAL_FACTS'),
      facts: facts(),
      event: event('TRIAGE_SKIPPED'),
    });

    expect(result.turnPlan.primaryAction).toEqual({ type: 'PRESENT_OPTIONS', target: 'hospital' });
    expect(result.state.primaryStage).toBe('RECOMMENDATION');
    expect(result.factsPatch.intake?.minimalTriageStatus).toBe('skipped');
  });

  it('keeps primary stage stable for FAQ detours', () => {
    const result = reduceJourney({
      state: state('COLLECT_MEDICAL_INPUTS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
      }),
      event: {
        eventType: 'USER_ASKED_QUESTION',
        target: 'pricing',
        modifier: 'ask',
        confidence: 0.88,
        source: 'llm',
      },
    });

    expect(result.turnPlan.primaryAction).toEqual({ type: 'ANSWER', target: 'pricing', mode: 'faq' });
    expect(result.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
  });

  it('handles recommendation selection as action-first conditional progression', () => {
    const needsProcess = reduceJourney({
      state: state('RECOMMENDATION'),
      facts: facts({ intake: { minimalTriageStatus: 'submitted' } }),
      event: event('RECOMMENDATION_SELECTED', { selectedHospitalIds: ['h1'] }),
    });

    expect(needsProcess.turnPlan.primaryAction).toEqual({ type: 'ANSWER', target: 'policy', mode: 'formal_overview' });
    expect(needsProcess.state.primaryStage).toBe('EXPLAIN_PROCESS');
    expect(needsProcess.factsPatch.recommendation?.status).toBe('selected');

    const needsDocs = reduceJourney({
      state: state('EXPLAIN_PROCESS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
      }),
      event: event('RECOMMENDATION_SELECTED', { selectedHospitalIds: ['h1'] }),
    });

    expect(needsDocs.turnPlan.primaryAction).toEqual({ type: 'REQUEST_INFO', target: 'treatment' });
    expect(needsDocs.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
  });

  it('keeps uploaded documents in records collection when process is not explained yet', () => {
    const result = reduceJourney({
      state: state('COLLECT_MEDICAL_INPUTS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: false },
      }),
      event: event('DOCUMENTS_UPLOADED', { documentCount: 2 }),
    });

    expect(result.facts.records.supportingDocumentsCount).toBe(2);
    expect(result.turnPlan.primaryAction).toEqual({ type: 'REQUEST_INFO', target: 'treatment' });
    expect(result.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
  });

  it('keeps document upload turns on the records action before a later consult offer', () => {
    const result = reduceJourney({
      state: state('COLLECT_MEDICAL_INPUTS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
      }),
      event: event('DOCUMENTS_UPLOADED', { documentCount: 1 }),
    });

    expect(result.facts.records.supportingDocumentsCount).toBe(1);
    expect(result.turnPlan.primaryAction).toEqual({ type: 'REQUEST_INFO', target: 'treatment' });
    expect(result.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
  });

  it('uses persisted documents on a later next-step turn to offer consult', () => {
    const result = reduceJourney({
      state: state('COLLECT_MEDICAL_INPUTS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
        records: { supportingDocumentsCount: 1, availableDocumentTypes: [], missingDocumentTypes: [] },
      }),
      event: {
        eventType: 'USER_REQUESTED_ACTION',
        target: 'policy',
        modifier: 'request_action',
        confidence: 0.9,
        source: 'llm',
      },
    });

    expect(result.turnPlan.primaryAction).toEqual({ type: 'PRESENT_OPTIONS', target: 'consult' });
    expect(result.state.primaryStage).toBe('ONLINE_CONSULT');
  });

  it('keeps service-scope action requests on the service-scope boundary instead of generic progression', () => {
    const result = reduceJourney({
      state: state('COLLECT_MEDICAL_INPUTS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
        records: { supportingDocumentsCount: 1, availableDocumentTypes: [], missingDocumentTypes: [] },
      }),
      event: {
        eventType: 'USER_REQUESTED_ACTION',
        target: 'service_scope',
        modifier: 'request_action',
        confidence: 0.9,
        source: 'llm',
      },
    });

    expect(result.turnPlan.primaryAction).toEqual({
      type: 'REDIRECT',
      target: 'service_scope',
      reasonCode: 'out_of_scope',
    });
    expect(result.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
  });

  it('keeps hospital action requests on hospital recommendations instead of generic consult progression', () => {
    const result = reduceJourney({
      state: state('COLLECT_MEDICAL_INPUTS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
        records: { supportingDocumentsCount: 1, availableDocumentTypes: [], missingDocumentTypes: [] },
      }),
      event: {
        eventType: 'USER_REQUESTED_ACTION',
        target: 'hospital',
        modifier: 'request_action',
        confidence: 0.9,
        source: 'llm',
      },
    });

    expect(result.turnPlan.primaryAction).toEqual({ type: 'PRESENT_OPTIONS', target: 'hospital' });
    expect(result.state.primaryStage).toBe('RECOMMENDATION');
  });

  it('treats legacy next-step question targets as workflow progression', () => {
    const result = reduceJourney({
      state: state('RECOMMENDATION'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
        records: { supportingDocumentsCount: 0, availableDocumentTypes: [], missingDocumentTypes: [] },
      }),
      event: {
        eventType: 'USER_ASKED_QUESTION',
        target: 'next_step',
        modifier: 'ask',
        confidence: 1,
        source: 'llm',
      },
    });

    expect(result.turnPlan.primaryAction).toEqual({ type: 'REQUEST_INFO', target: 'treatment' });
    expect(result.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
  });

  it('only moves to EXPLAIN_PROCESS through SHOW_PROCESS_OVERVIEW', () => {
    const result = reduceJourney({
      state: state('RECOMMENDATION'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'generated', selectedHospitalIds: [] },
      }),
      event: {
        eventType: 'USER_ASKED_QUESTION',
        target: 'policy',
        modifier: 'ask',
        confidence: 0.9,
        source: 'llm',
      },
    });

    expect(result.turnPlan.primaryAction).toEqual({ type: 'ANSWER', target: 'policy', mode: 'faq' });
    expect(result.state.primaryStage).toBe('RECOMMENDATION');
    expect(result.isSidePath).toBe(true);
    expect(result.sidePathType).toBe('faq');
    expect(result.primaryStagePreserved).toBe(true);
  });

  it('marks progression reductions as non-side-path', () => {
    const result = reduceJourney({
      state: state('COLLECT_MINIMAL_MEDICAL_FACTS'),
      facts: facts(),
      event: event('TRIAGE_SUBMITTED', { rawText: 'brain tumor, six months, no tests' }),
    });

    expect(result.isSidePath).toBe(false);
    expect(result.sidePathType).toBe('none');
    expect(result.primaryStagePreserved).toBe(false);
  });

  it('does not mark handoff active before runtime confirms ticket creation', () => {
    const result = reduceJourney({
      state: state('COLLECT_MEDICAL_INPUTS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
      }),
      event: event('USER_REQUESTED_HUMAN'),
    });

    expect(result.turnPlan.primaryAction).toEqual({ type: 'ESCALATE', target: 'handoff', reasonCode: 'human_requested' });
    expect(result.state.primaryStage).toBe('HUMAN_HANDOFF');
    expect(result.factsPatch.handoff).toBeUndefined();
    expect(result.facts.handoff.active).toBe(false);
  });

  it('downgrades user rejection or hesitation without moving the primary stage', () => {
    const result = reduceJourney({
      state: state('COLLECT_MEDICAL_INPUTS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
      }),
      event: {
        eventType: 'USER_RESPONDED_TO_REQUEST',
        target: 'treatment',
        modifier: 'hesitate',
        confidence: 0.9,
        source: 'llm',
      },
    });

    expect(result.turnPlan.primaryAction).toEqual({ type: 'HANDLE_RESPONSE', target: 'treatment', modifier: 'hesitate' });
    expect(result.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
    expect(result.isSidePath).toBe(true);
    expect(result.sidePathType).toBe('faq');
    expect(result.primaryStagePreserved).toBe(true);
    expect(result.factsPatch).toEqual({});
  });

  it('routes direct contact information to handoff without pre-marking handoff active', () => {
    const result = reduceJourney({
      state: state('RECOMMENDATION'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'generated', selectedHospitalIds: [] },
      }),
      event: {
        eventType: 'USER_PROVIDED_INFORMATION',
        target: 'handoff',
        modifier: 'provide',
        confidence: 0.96,
        source: 'llm',
      },
    });

    expect(result.turnPlan.primaryAction).toEqual({ type: 'ESCALATE', target: 'handoff', reasonCode: 'contact_info_provided' });
    expect(result.state.primaryStage).toBe('HUMAN_HANDOFF');
    expect(result.factsPatch.handoff).toBeUndefined();
    expect(result.facts.handoff.active).toBe(false);
    expect(result.isSidePath).toBe(false);
  });
});
