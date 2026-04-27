import type { ChatJourneyStage } from '@medical-crm/domain';
import type {
  DomainFacts,
  JourneyReduction,
  JourneyState,
  MedicalFactPatchCandidate,
  NextAction,
  ReducerReasonCode,
  SupervisorEvent,
} from './supervisor-event.types.js';

export interface ReduceJourneyInput {
  state: JourneyState;
  facts: DomainFacts;
  event: SupervisorEvent;
}

export type DomainFactsPatch = {
  intake?: Partial<DomainFacts['intake']>;
  recommendation?: Partial<DomainFacts['recommendation']>;
  process?: Partial<DomainFacts['process']>;
  records?: Partial<DomainFacts['records']>;
  consult?: Partial<DomainFacts['consult']>;
  handoff?: Partial<DomainFacts['handoff']>;
};

export type JourneyReducerOutput = JourneyReduction & {
  primaryStage: ChatJourneyStage;
  factsPatch: DomainFactsPatch;
};

export function reduceJourney(input: ReduceJourneyInput): JourneyReducerOutput {
  const normalizedFacts = normalizeFacts(input.facts);
  const factsPatch = deriveFactsPatch(input.event, normalizedFacts);
  const nextFacts = applyFactsPatch(normalizedFacts, factsPatch);
  const nextAction = decideNextAction({
    state: input.state,
    facts: nextFacts,
    event: input.event,
  });
  const nextStage = deriveNextStage({
    currentStage: input.state.primaryStage,
    nextAction,
  });
  const reasonCode = buildReasonCode(input.event, nextAction);
  const sidePathType = classifySidePath(nextAction);
  const primaryStagePreserved = input.state.primaryStage === nextStage;

  return {
    state: {
      ...input.state,
      primaryStage: nextStage,
    },
    primaryStage: nextStage,
    facts: nextFacts,
    factsPatch,
    nextAction,
    reasonCode,
    isSidePath: sidePathType !== 'none',
    sidePathType,
    primaryStagePreserved,
  };
}

export function normalizeFacts(facts: DomainFacts): DomainFacts {
  return {
    ...facts,
    intake: {
      ...facts.intake,
      minimalTriageStatus: facts.intake.minimalTriageStatus ?? 'not_started',
    },
    recommendation: {
      ...facts.recommendation,
      selectedHospitalIds: [...(facts.recommendation.selectedHospitalIds ?? [])],
    },
    records: {
      ...facts.records,
      supportingDocumentsCount: Math.max(0, facts.records.supportingDocumentsCount ?? 0),
      availableDocumentTypes: [...(facts.records.availableDocumentTypes ?? [])],
      missingDocumentTypes: [...(facts.records.missingDocumentTypes ?? [])],
    },
  };
}

export function deriveFactsPatch(event: SupervisorEvent, facts: DomainFacts): DomainFactsPatch {
  switch (event.eventType) {
    case 'TRIAGE_SUBMITTED':
      return {
        intake: {
          minimalTriageStatus: 'submitted',
          minimalTriageSummary: resolveTriageSummary(event, facts),
        },
      };
    case 'TRIAGE_SKIPPED':
      return {
        intake: {
          minimalTriageStatus: 'skipped',
        },
      };
    case 'RECOMMENDATION_SELECTED': {
      const selectedHospitalIds = event.metadata?.selectedHospitalIds ?? facts.recommendation.selectedHospitalIds;
      return {
        recommendation: {
          status: 'selected',
          selectedHospitalIds,
          generated: true,
        },
      };
    }
    case 'RECOMMENDATION_SKIPPED':
      return {
        recommendation: {
          status: 'skipped',
          generated: true,
        },
      };
    case 'DOCUMENTS_UPLOADED': {
      const documentCount = Math.max(0, event.metadata?.documentCount ?? 0);
      return {
        records: {
          supportingDocumentsCount: facts.records.supportingDocumentsCount + documentCount,
        },
      };
    }
    case 'USER_PROVIDED_MEDICAL_FACTS':
      return deriveMedicalFactsPatch(event);
    default:
      return {};
  }
}

export function applyFactsPatch(facts: DomainFacts, patch: DomainFactsPatch): DomainFacts {
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

export function decideNextAction(input: {
  state: JourneyState;
  facts: DomainFacts;
  event: SupervisorEvent;
}): NextAction {
  const { event, facts } = input;

  switch (event.eventType) {
    case 'USER_REQUESTED_HUMAN':
    case 'USER_PROVIDED_CONTACT_INFO':
      return { type: 'CREATE_HANDOFF' };
    case 'USER_REJECTED_OR_HESITATED':
      return {
        type: 'ANSWER_FAQ',
        topic: 'other',
        subtopic: 'rejection_or_hesitation',
      };
    case 'USER_ASKED_RISKY_MEDICAL_ADVICE':
      return { type: 'SAFE_MEDICAL_REDIRECT', riskType: event.metadata?.riskType };
    case 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE':
      return { type: 'OUT_OF_SCOPE_REDIRECT', redirectTarget: event.metadata?.redirectTarget };
    case 'USER_ASKED_FAQ':
      return {
        type: 'ANSWER_FAQ',
        topic: event.metadata?.topic,
        subtopic: event.metadata?.subtopic,
      };
    case 'TRIAGE_SUBMITTED':
    case 'TRIAGE_SKIPPED':
      return { type: 'GENERATE_RECOMMENDATION' };
    case 'RECOMMENDATION_SELECTED':
      if (!facts.process.explained) {
        return { type: 'SHOW_PROCESS_OVERVIEW' };
      }
      if (facts.records.supportingDocumentsCount === 0) {
        return { type: 'REQUEST_MEDICAL_DOCUMENTS' };
      }
      return { type: 'OFFER_ONLINE_CONSULT' };
    case 'RECOMMENDATION_SKIPPED':
      return { type: 'SHOW_PROCESS_OVERVIEW' };
    case 'DOCUMENTS_UPLOADED':
      return decideNextActionAfterDocuments(facts);
    case 'USER_ASKED_NEXT_STEP':
    case 'USER_WANTS_TREATMENT_IN_CHINA':
    case 'USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING':
    case 'USER_PROVIDED_MEDICAL_FACTS':
      return decideNextStepFromFacts(facts);
    case 'USER_INTERESTED_IN_CONSULT':
      return facts.records.supportingDocumentsCount === 0
        ? { type: 'REQUEST_MEDICAL_DOCUMENTS' }
        : { type: 'OFFER_ONLINE_CONSULT' };
    case 'USER_AMBIGUOUS_REPLY':
    case 'UNKNOWN_MESSAGE':
    default:
      return { type: 'CLARIFY_INTENT' };
  }
}

export function decideNextStepFromFacts(facts: DomainFacts): NextAction {
  if (facts.intake.minimalTriageStatus === 'not_started') {
    return { type: 'COLLECT_MINIMAL_TRIAGE' };
  }
  if (facts.recommendation.status === 'none') {
    return { type: 'GENERATE_RECOMMENDATION' };
  }
  if (facts.recommendation.status === 'generated') {
    return { type: 'ASK_RECOMMENDATION_SELECTION' };
  }
  if (facts.recommendation.status === 'selected' && !facts.process.explained) {
    return { type: 'SHOW_PROCESS_OVERVIEW' };
  }
  if (facts.records.supportingDocumentsCount === 0) {
    return { type: 'REQUEST_MEDICAL_DOCUMENTS' };
  }
  if (facts.consult.status === 'not_started') {
    return { type: 'OFFER_ONLINE_CONSULT' };
  }
  return { type: 'CLARIFY_INTENT' };
}

export function deriveNextStage(input: {
  currentStage: ChatJourneyStage;
  nextAction: NextAction;
}): ChatJourneyStage {
  switch (input.nextAction.type) {
    case 'ANSWER_FAQ':
    case 'SAFE_MEDICAL_REDIRECT':
    case 'OUT_OF_SCOPE_REDIRECT':
    case 'CLARIFY_INTENT':
      return input.currentStage;
    case 'COLLECT_MINIMAL_TRIAGE':
      return 'COLLECT_MINIMAL_MEDICAL_FACTS';
    case 'GENERATE_RECOMMENDATION':
    case 'ASK_RECOMMENDATION_SELECTION':
      return 'RECOMMENDATION';
    case 'SHOW_PROCESS_OVERVIEW':
      return 'EXPLAIN_PROCESS';
    case 'REQUEST_MEDICAL_DOCUMENTS':
      return 'COLLECT_MEDICAL_INPUTS';
    case 'OFFER_ONLINE_CONSULT':
      return 'ONLINE_CONSULT';
    case 'CREATE_HANDOFF':
      return 'HUMAN_HANDOFF';
  }
}

export function buildReasonCode(event: SupervisorEvent, action: NextAction): ReducerReasonCode {
  return `${event.eventType}_${action.type}`.toLowerCase() as ReducerReasonCode;
}

function decideNextActionAfterDocuments(facts: DomainFacts): NextAction {
  if (facts.intake.minimalTriageStatus === 'not_started') {
    return { type: 'COLLECT_MINIMAL_TRIAGE' };
  }
  // A document-upload event has a required upload side effect. Keep this turn
  // on RecordsAgent; the next turn can offer consult once the persisted
  // supporting document is visible in DomainFacts.
  return { type: 'REQUEST_MEDICAL_DOCUMENTS' };
}

function classifySidePath(action: NextAction): JourneyReducerOutput['sidePathType'] {
  switch (action.type) {
    case 'ANSWER_FAQ':
      return 'faq';
    case 'SAFE_MEDICAL_REDIRECT':
      return 'safety';
    case 'OUT_OF_SCOPE_REDIRECT':
      return 'out_of_scope';
    case 'CLARIFY_INTENT':
      return 'clarification';
    default:
      return 'none';
  }
}

function resolveTriageSummary(event: SupervisorEvent, facts: DomainFacts): string | null {
  const rawText = event.metadata?.rawText;
  if (typeof rawText === 'string' && rawText.trim().length > 0) {
    return rawText;
  }
  return facts.intake.minimalTriageSummary ?? null;
}

function deriveMedicalFactsPatch(event: SupervisorEvent): DomainFactsPatch {
  const candidate = normalizeMedicalFactPatchCandidate(event.metadata?.extractedFacts);
  if (!candidate) {
    return {};
  }

  return {
    intake: {
      condition: candidate.condition ?? candidate.diagnosis,
    },
  };
}

function normalizeMedicalFactPatchCandidate(value: unknown): MedicalFactPatchCandidate | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    condition: asString(record['condition']),
    diagnosis: asString(record['diagnosis']),
    diagnosisDate: asString(record['diagnosisDate']),
    priorTreatments: asString(record['priorTreatments']),
    currentSymptoms: asString(record['currentSymptoms']),
    imagingFindings: asString(record['imagingFindings']),
    pathologyStatus: asString(record['pathologyStatus']),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
