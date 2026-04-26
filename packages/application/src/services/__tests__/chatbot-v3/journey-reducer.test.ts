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

    expect(result.nextAction).toEqual({ type: 'GENERATE_RECOMMENDATION' });
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

    expect(result.nextAction).toEqual({ type: 'GENERATE_RECOMMENDATION' });
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
        eventType: 'USER_ASKED_FAQ',
        confidence: 0.88,
        source: 'llm',
        metadata: { topic: 'pricing', subtopic: 'deposit' },
      },
    });

    expect(result.nextAction).toEqual({ type: 'ANSWER_FAQ', topic: 'pricing', subtopic: 'deposit' });
    expect(result.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
  });

  it('handles recommendation selection as action-first conditional progression', () => {
    const needsProcess = reduceJourney({
      state: state('RECOMMENDATION'),
      facts: facts({ intake: { minimalTriageStatus: 'submitted' } }),
      event: event('RECOMMENDATION_SELECTED', { selectedHospitalIds: ['h1'] }),
    });

    expect(needsProcess.nextAction).toEqual({ type: 'SHOW_PROCESS_OVERVIEW' });
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

    expect(needsDocs.nextAction).toEqual({ type: 'REQUEST_MEDICAL_DOCUMENTS' });
    expect(needsDocs.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
  });

  it('routes uploaded documents to records collection before offering consult', () => {
    const result = reduceJourney({
      state: state('COLLECT_MEDICAL_INPUTS'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
        process: { explained: true },
      }),
      event: event('DOCUMENTS_UPLOADED', { documentCount: 2 }),
    });

    expect(result.facts.records.supportingDocumentsCount).toBe(2);
    expect(result.nextAction).toEqual({ type: 'REQUEST_MEDICAL_DOCUMENTS' });
    expect(result.state.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
  });

  it('only moves to EXPLAIN_PROCESS through SHOW_PROCESS_OVERVIEW', () => {
    const result = reduceJourney({
      state: state('RECOMMENDATION'),
      facts: facts({
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'generated', selectedHospitalIds: [] },
      }),
      event: { eventType: 'USER_ASKED_FAQ', confidence: 0.9, source: 'llm', metadata: { topic: 'process' } },
    });

    expect(result.nextAction.type).toBe('ANSWER_FAQ');
    expect(result.state.primaryStage).toBe('RECOMMENDATION');
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

    expect(result.nextAction).toEqual({ type: 'CREATE_HANDOFF' });
    expect(result.state.primaryStage).toBe('HUMAN_HANDOFF');
    expect(result.factsPatch.handoff).toBeUndefined();
    expect(result.facts.handoff.active).toBe(false);
  });
});
