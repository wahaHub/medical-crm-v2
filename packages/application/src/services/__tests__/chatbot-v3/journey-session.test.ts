import { describe, expect, it } from 'vitest';
import type { ChatJourneyStage } from '@medical-crm/domain';
import {
  applyFactsPatch,
  reduceJourney,
} from '../../chatbot-v3/journey-reducer.js';
import type {
  DomainFacts,
  SupervisorEvent,
} from '../../chatbot-v3/supervisor-event.types.js';

describe('chatbot-v3 generic event sessions', () => {
  it('runs the happy path across persisted facts and stages', () => {
    const session = createSession();

    session.turn({
      eventType: 'USER_EXPRESSED_NEED',
      target: 'treatment',
      modifier: 'ask',
      confidence: 0.9,
      source: 'llm',
    }, {
      primaryAction: { type: 'REQUEST_INFO', target: 'minimal_triage' },
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    });

    session.turn({
      eventType: 'TRIAGE_SUBMITTED',
      target: 'medical_facts',
      modifier: 'provide',
      confidence: 1,
      source: 'deterministic',
    }, {
      primaryAction: { type: 'PRESENT_OPTIONS', target: 'hospital' },
      stage: 'RECOMMENDATION',
    });

    session.turn({
      eventType: 'RECOMMENDATION_SELECTED',
      target: 'recommendation',
      modifier: 'confirm',
      confidence: 1,
      source: 'deterministic',
      metadata: { selectedHospitalIds: ['hospital-1'] },
    }, {
      primaryAction: { type: 'ANSWER', target: 'process', mode: 'formal_overview' },
      stage: 'EXPLAIN_PROCESS',
    });

    session.turn({
      eventType: 'DOCUMENTS_UPLOADED',
      target: 'documents',
      modifier: 'provide',
      confidence: 1,
      source: 'deterministic',
      metadata: { documentCount: 1 },
    }, {
      primaryAction: { type: 'REQUEST_INFO', target: 'documents' },
      stage: 'COLLECT_MEDICAL_INPUTS',
      facts: { supportingDocumentsCount: 1 },
    });

    session.turn(nextStepEvent(), {
      primaryAction: { type: 'PRESENT_OPTIONS', target: 'consult' },
      stage: 'ONLINE_CONSULT',
    });
  });

  it('answers FAQ detours without losing the records collection stage', () => {
    const session = createSession({
      stage: 'COLLECT_MEDICAL_INPUTS',
      facts: {
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['hospital-1'], generated: true },
        process: { explained: true },
      },
    });

    session.turn({
      eventType: 'USER_ASKED_QUESTION',
      target: 'pricing',
      modifier: 'ask',
      confidence: 0.9,
      source: 'llm',
    }, {
      primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' },
      stage: 'COLLECT_MEDICAL_INPUTS',
      sidePathType: 'faq',
      primaryStagePreserved: true,
    });

    session.turn(nextStepEvent(), {
      primaryAction: { type: 'REQUEST_INFO', target: 'documents' },
      stage: 'COLLECT_MEDICAL_INPUTS',
    });
  });

  it('keeps process FAQ from re-entering the formal process overview', () => {
    const session = createSession({
      stage: 'ONLINE_CONSULT',
      facts: {
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['hospital-1'], generated: true },
        process: { explained: true },
        records: { supportingDocumentsCount: 1 },
      },
    });

    session.turn({
      eventType: 'USER_ASKED_QUESTION',
      target: 'process',
      modifier: 'ask',
      confidence: 0.88,
      source: 'llm',
    }, {
      primaryAction: { type: 'ANSWER', target: 'process', mode: 'faq' },
      stage: 'ONLINE_CONSULT',
      sidePathType: 'faq',
      primaryStagePreserved: true,
    });
  });

  it('keeps uploaded documents as a two-turn transition into consult', () => {
    const session = createSession({
      stage: 'EXPLAIN_PROCESS',
      facts: {
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['hospital-1'], generated: true },
        process: { explained: true },
      },
    });

    session.turn({
      eventType: 'DOCUMENTS_UPLOADED',
      target: 'documents',
      modifier: 'provide',
      confidence: 1,
      source: 'deterministic',
      metadata: { documentCount: 1 },
    }, {
      primaryAction: { type: 'REQUEST_INFO', target: 'documents' },
      stage: 'COLLECT_MEDICAL_INPUTS',
      facts: { supportingDocumentsCount: 1 },
    });

    session.turn(nextStepEvent(), {
      primaryAction: { type: 'PRESENT_OPTIONS', target: 'consult' },
      stage: 'ONLINE_CONSULT',
    });
  });

  it('does not lose documents uploaded before recommendation selection', () => {
    const session = createSession();

    session.turn({
      eventType: 'USER_EXPRESSED_NEED',
      target: 'treatment',
      modifier: 'ask',
      confidence: 0.9,
      source: 'llm',
    }, {
      primaryAction: { type: 'REQUEST_INFO', target: 'minimal_triage' },
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    });

    session.turn({
      eventType: 'DOCUMENTS_UPLOADED',
      target: 'documents',
      modifier: 'provide',
      confidence: 1,
      source: 'deterministic',
      metadata: { documentCount: 1 },
    }, {
      primaryAction: { type: 'REQUEST_INFO', target: 'minimal_triage' },
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      facts: { supportingDocumentsCount: 1 },
    });

    session.turn({
      eventType: 'TRIAGE_SUBMITTED',
      target: 'medical_facts',
      modifier: 'provide',
      confidence: 1,
      source: 'deterministic',
    }, {
      primaryAction: { type: 'PRESENT_OPTIONS', target: 'hospital' },
      stage: 'RECOMMENDATION',
      facts: { supportingDocumentsCount: 1 },
    });

    session.turn({
      eventType: 'RECOMMENDATION_SELECTED',
      target: 'recommendation',
      modifier: 'confirm',
      confidence: 1,
      source: 'deterministic',
    }, {
      primaryAction: { type: 'ANSWER', target: 'process', mode: 'formal_overview' },
      stage: 'EXPLAIN_PROCESS',
      facts: { supportingDocumentsCount: 1 },
    });

    session.turn(nextStepEvent(), {
      primaryAction: { type: 'PRESENT_OPTIONS', target: 'consult' },
      stage: 'ONLINE_CONSULT',
      facts: { supportingDocumentsCount: 1 },
    });
  });

  it('keeps safety detours from interrupting document collection', () => {
    const session = createSession({
      stage: 'COLLECT_MEDICAL_INPUTS',
      facts: {
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'selected', selectedHospitalIds: ['hospital-1'], generated: true },
        process: { explained: true },
      },
    });

    session.turn({
      eventType: 'USER_ASKED_RISKY_MEDICAL_ADVICE',
      target: 'medical_facts',
      modifier: 'ask',
      confidence: 0.9,
      source: 'llm',
    }, {
      primaryAction: { type: 'REDIRECT', target: 'medical_facts', reasonCode: 'medical_safety' },
      stage: 'COLLECT_MEDICAL_INPUTS',
      sidePathType: 'safety',
      primaryStagePreserved: true,
    });

    session.turn({
      eventType: 'DOCUMENTS_UPLOADED',
      target: 'documents',
      modifier: 'provide',
      confidence: 1,
      source: 'deterministic',
      metadata: { documentCount: 1 },
    }, {
      primaryAction: { type: 'REQUEST_INFO', target: 'documents' },
      stage: 'COLLECT_MEDICAL_INPUTS',
      facts: { supportingDocumentsCount: 1 },
    });
  });

  it('treats active human handoff as a strong session state', () => {
    const session = createSession({
      stage: 'RECOMMENDATION',
      facts: {
        intake: { minimalTriageStatus: 'submitted' },
        recommendation: { status: 'generated', selectedHospitalIds: [], generated: true },
      },
    });

    session.turn({
      eventType: 'USER_REQUESTED_HUMAN',
      target: 'human',
      modifier: 'ask',
      confidence: 1,
      source: 'deterministic',
    }, {
      primaryAction: { type: 'ESCALATE', target: 'human', reasonCode: 'human_requested' },
      stage: 'HUMAN_HANDOFF',
      facts: { handoffActive: true },
    });

    session.turn(nextStepEvent(), {
      primaryAction: { type: 'ESCALATE', target: 'human', reasonCode: 'handoff_active' },
      stage: 'HUMAN_HANDOFF',
      facts: { handoffActive: true },
    });
  });

  it('recovers cleanly after unclear fallback without polluting the next turn', () => {
    const session = createSession({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    });

    session.turn({
      eventType: 'USER_MESSAGE_UNCLEAR',
      target: 'unknown',
      modifier: 'unknown',
      confidence: 0,
      source: 'fallback_unknown',
    }, {
      primaryAction: { type: 'CLARIFY', target: 'unknown', reasonCode: 'ambiguous_message' },
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      sidePathType: 'clarification',
      primaryStagePreserved: true,
    });

    session.turn({
      eventType: 'USER_EXPRESSED_NEED',
      target: 'recommendation',
      modifier: 'ask',
      confidence: 0.86,
      source: 'llm',
    }, {
      primaryAction: { type: 'REQUEST_INFO', target: 'minimal_triage' },
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    });
  });
});

function nextStepEvent(): SupervisorEvent {
  return {
    eventType: 'USER_ASKED_QUESTION',
    target: 'next_step',
    modifier: 'ask',
    confidence: 0.9,
    source: 'llm',
  };
}

function createSession(input: {
  stage?: ChatJourneyStage;
  facts?: PartialFacts;
} = {}) {
  let stage = input.stage ?? 'COLLECT_MINIMAL_MEDICAL_FACTS';
  let facts = mergeFacts(baseFacts(), input.facts);

  return {
    turn(event: SupervisorEvent, expected: TurnExpectation) {
      const result = reduceJourney({
        state: { primaryStage: stage },
        facts,
        event,
      });

      expect(result.turnPlan.primaryAction).toEqual(expected.primaryAction);
      expect(result.primaryStage).toBe(expected.stage);
      if (expected.sidePathType) {
        expect(result.sidePathType).toBe(expected.sidePathType);
      }
      if (expected.primaryStagePreserved !== undefined) {
        expect(result.primaryStagePreserved).toBe(expected.primaryStagePreserved);
      }

      facts = applyFactsPatch(result.facts, result.factsPatch);
      if (result.turnPlan.primaryAction.type === 'ANSWER'
        && result.turnPlan.primaryAction.target === 'process'
        && result.turnPlan.primaryAction.mode === 'formal_overview') {
        facts = {
          ...facts,
          process: { ...facts.process, explained: true },
        };
      }
      if (result.turnPlan.primaryAction.type === 'ESCALATE') {
        facts = {
          ...facts,
          handoff: { ...facts.handoff, active: true },
        };
      }
      stage = result.primaryStage;

      if (expected.facts?.supportingDocumentsCount !== undefined) {
        expect(facts.records.supportingDocumentsCount).toBe(expected.facts.supportingDocumentsCount);
      }
      if (expected.facts?.handoffActive !== undefined) {
        expect(facts.handoff.active).toBe(expected.facts.handoffActive);
      }
    },
    facts() {
      return facts;
    },
  };
}

interface TurnExpectation {
  primaryAction: ReturnType<typeof reduceJourney>['turnPlan']['primaryAction'];
  stage: ChatJourneyStage;
  sidePathType?: ReturnType<typeof reduceJourney>['sidePathType'];
  primaryStagePreserved?: boolean;
  facts?: {
    supportingDocumentsCount?: number;
    handoffActive?: boolean;
  };
}

type PartialFacts = {
  intake?: Partial<DomainFacts['intake']>;
  recommendation?: Partial<DomainFacts['recommendation']>;
  process?: Partial<DomainFacts['process']>;
  records?: Partial<DomainFacts['records']>;
  consult?: Partial<DomainFacts['consult']>;
  handoff?: Partial<DomainFacts['handoff']>;
};

function baseFacts(): DomainFacts {
  return {
    language: 'zh',
    intake: {
      minimalTriageStatus: 'not_started',
      minimalTriageSummary: null,
      condition: null,
      destination: null,
      patientGender: null,
      relationToPatient: null,
    },
    recommendation: {
      status: 'none',
      selectedHospitalIds: [],
      generated: false,
    },
    process: {
      explained: false,
    },
    records: {
      supportingDocumentsCount: 0,
      availableDocumentTypes: [],
      missingDocumentTypes: [],
    },
    consult: {
      status: 'not_started',
    },
    handoff: {
      active: false,
    },
  };
}

function mergeFacts(facts: DomainFacts, patch: PartialFacts | undefined): DomainFacts {
  if (!patch) {
    return facts;
  }

  return {
    ...facts,
    intake: { ...facts.intake, ...patch.intake },
    recommendation: { ...facts.recommendation, ...patch.recommendation },
    process: { ...facts.process, ...patch.process },
    records: { ...facts.records, ...patch.records },
    consult: { ...facts.consult, ...patch.consult },
    handoff: { ...facts.handoff, ...patch.handoff },
  };
}
