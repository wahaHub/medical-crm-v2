import type { ChatJourneyStage } from '@medical-crm/domain';
import type {
  DomainFacts,
  JourneyReduction,
  JourneyState,
  MedicalFactPatchCandidate,
  NextAction,
  PrimaryAction,
  ReducerReasonCode,
  SidePathType,
  SupervisorEvent,
  TurnPlan,
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
  const primaryAction = decidePrimaryAction({
    state: input.state,
    facts: nextFacts,
    event: input.event,
  });
  const nextStage = derivePrimaryStage({
    currentStage: input.state.primaryStage,
    primaryAction,
  });
  const reasonCode = buildReasonCode(input.event, primaryAction);
  const sidePathType = classifySidePath(primaryAction);
  const primaryStagePreserved = input.state.primaryStage === nextStage;
  const turnPlan: TurnPlan = {
    primaryAction,
    followUpAction: deriveFollowUpAction(primaryAction, nextFacts),
    primaryStage: nextStage,
    factsPatch,
    reasonCode,
    ...(sidePathType !== 'none'
      ? { sidePath: { type: sidePathType, primaryStagePreserved } }
      : {}),
  };

  return {
    state: {
      ...input.state,
      primaryStage: nextStage,
    },
    primaryStage: nextStage,
    facts: nextFacts,
    factsPatch,
    turnPlan,
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
    case 'USER_PROVIDED_INFORMATION':
      if (event.target === 'medical_facts') {
        return deriveMedicalFactsPatch(event);
      }
      return {};
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
  return legacyNextActionFromPrimaryAction(decidePrimaryAction(input));
}

export function decidePrimaryAction(input: {
  state: JourneyState;
  facts: DomainFacts;
  event: SupervisorEvent;
}): PrimaryAction {
  const { event, facts } = input;

  if (facts.handoff.active) {
    return { type: 'ESCALATE', target: 'handoff', reasonCode: 'handoff_active' };
  }

  switch (event.eventType) {
    case 'USER_REQUESTED_HUMAN':
      return { type: 'ESCALATE', target: 'handoff', reasonCode: 'human_requested' };
    case 'USER_REQUESTED_ACTION':
      return decideNextStepFromFacts(facts);
    case 'USER_ASKED_MEDICAL_ADVICE':
      return { type: 'REDIRECT', target: 'medical_advice', reasonCode: 'medical_safety' };
    case 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE':
      return { type: 'REDIRECT', target: 'service_scope', reasonCode: 'out_of_scope' };
    case 'USER_ASKED_QUESTION':
      if (event.target === 'medical_advice') {
        return { type: 'REDIRECT', target: 'medical_advice', reasonCode: 'medical_safety' };
      }
      if (event.target === 'service_scope') {
        return { type: 'REDIRECT', target: 'service_scope', reasonCode: 'out_of_scope' };
      }
      if (event.target === 'next_step' || event.modifier === 'request_action') {
        return decideNextStepFromFacts(facts);
      }
      if (event.target === 'hospital' || event.target === 'hospital_selection') {
        return { type: 'ANSWER', target: event.target, mode: 'faq' };
      }
      if (event.target && event.target !== 'unknown') {
        return { type: 'ANSWER', target: event.target, mode: 'faq' };
      }
      return { type: 'CLARIFY', target: 'unknown', reasonCode: 'ambiguous_message' };
    case 'USER_PROVIDED_INFORMATION':
      if (event.target === 'handoff') {
        return { type: 'ESCALATE', target: 'handoff', reasonCode: 'contact_info_provided' };
      }
      return decideNextStepFromFacts(facts);
    case 'USER_RESPONDED_TO_REQUEST':
      if (event.modifier === 'reject' || event.modifier === 'hesitate') {
        return { type: 'HANDLE_RESPONSE', target: event.target ?? 'unknown', modifier: event.modifier };
      }
      return decideNextStepFromFacts(facts);
    case 'TRIAGE_SUBMITTED':
    case 'TRIAGE_SKIPPED':
      return { type: 'PRESENT_OPTIONS', target: 'hospital' };
    case 'RECOMMENDATION_SELECTED':
      if (!facts.process.explained) {
        return { type: 'ANSWER', target: 'policy', mode: 'formal_overview' };
      }
      if (facts.records.supportingDocumentsCount === 0) {
        return { type: 'REQUEST_INFO', target: 'treatment' };
      }
      return { type: 'PRESENT_OPTIONS', target: 'consult' };
    case 'RECOMMENDATION_SKIPPED':
      return { type: 'ANSWER', target: 'policy', mode: 'formal_overview' };
    case 'DOCUMENTS_UPLOADED':
      return decidePrimaryActionAfterDocuments(facts);
    case 'USER_EXPRESSED_INTEREST':
      if (event.target === 'hospital' && event.modifier === 'revisit') {
        return { type: 'PRESENT_OPTIONS', target: 'hospital' };
      }
      return decideNextStepFromFacts(facts);
    case 'USER_MESSAGE_UNCLEAR':
    default:
      return { type: 'CLARIFY', target: 'unknown', reasonCode: 'ambiguous_message' };
  }
}

export function decideNextStepFromFacts(facts: DomainFacts): PrimaryAction {
  if (facts.intake.minimalTriageStatus === 'not_started') {
    return { type: 'REQUEST_INFO', target: 'minimal_triage' };
  }
  if (facts.recommendation.status === 'none') {
    return { type: 'PRESENT_OPTIONS', target: 'hospital' };
  }
  if (facts.recommendation.status === 'generated') {
    return { type: 'PRESENT_OPTIONS', target: 'hospital' };
  }
  if (facts.recommendation.status === 'selected' && !facts.process.explained) {
    return { type: 'ANSWER', target: 'policy', mode: 'formal_overview' };
  }
  if (facts.records.supportingDocumentsCount === 0) {
    return { type: 'REQUEST_INFO', target: 'treatment' };
  }
  if (facts.consult.status === 'not_started') {
    return { type: 'PRESENT_OPTIONS', target: 'consult' };
  }
  return { type: 'CLARIFY', target: 'unknown', reasonCode: 'missing_context' };
}

export function derivePrimaryStage(input: {
  currentStage: ChatJourneyStage;
  primaryAction: PrimaryAction;
}): ChatJourneyStage {
  switch (input.primaryAction.type) {
    case 'ANSWER':
      return input.primaryAction.mode === 'formal_overview' ? 'EXPLAIN_PROCESS' : input.currentStage;
    case 'REDIRECT':
    case 'CLARIFY':
    case 'HANDLE_RESPONSE':
    case 'ACKNOWLEDGE':
      return input.currentStage;
    case 'REQUEST_INFO':
      if (input.primaryAction.target === 'minimal_triage') {
        return 'COLLECT_MINIMAL_MEDICAL_FACTS';
      }
      return 'COLLECT_MEDICAL_INPUTS';
    case 'PRESENT_OPTIONS':
      return input.primaryAction.target === 'consult' ? 'ONLINE_CONSULT' : 'RECOMMENDATION';
    case 'ESCALATE':
      return 'HUMAN_HANDOFF';
  }
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

export function buildReasonCode(event: SupervisorEvent, action: PrimaryAction | NextAction): ReducerReasonCode {
  return `${event.eventType}_${action.type}`.toLowerCase() as ReducerReasonCode;
}

function decidePrimaryActionAfterDocuments(facts: DomainFacts): PrimaryAction {
  if (facts.intake.minimalTriageStatus === 'not_started') {
    return { type: 'REQUEST_INFO', target: 'minimal_triage' };
  }
  // A document-upload event has a required upload side effect. Keep this turn
  // on RecordsAgent; the next turn can offer consult once the persisted
  // supporting document is visible in DomainFacts.
  return { type: 'REQUEST_INFO', target: 'treatment' };
}

function classifySidePath(action: PrimaryAction): SidePathType {
  switch (action.type) {
    case 'ANSWER':
      return action.mode === 'formal_overview' ? 'none' : 'faq';
    case 'REDIRECT':
      return action.reasonCode === 'medical_safety' ? 'safety' : 'out_of_scope';
    case 'CLARIFY':
      return 'clarification';
    case 'HANDLE_RESPONSE':
      return 'faq';
    default:
      return 'none';
  }
}

function deriveFollowUpAction(action: PrimaryAction, facts: DomainFacts): TurnPlan['followUpAction'] {
  if (action.type === 'ANSWER' && action.mode === 'faq') {
    if (action.target === 'pricing' && facts.records.supportingDocumentsCount === 0) {
      return { type: 'INVITE_NEXT_STEP', target: 'treatment', reason: 'pricing_requires_records' };
    }
    if (action.target === 'consult') {
      return { type: 'GO_DEEP', target: 'consult', reasonCode: 'user_requested_more_detail' };
    }
  }
  return { type: 'NONE' };
}

function legacyNextActionFromPrimaryAction(action: PrimaryAction): NextAction {
  switch (action.type) {
    case 'REQUEST_INFO':
      return action.target === 'minimal_triage'
        ? { type: 'COLLECT_MINIMAL_TRIAGE' }
        : { type: 'REQUEST_MEDICAL_DOCUMENTS' };
    case 'PRESENT_OPTIONS':
      return action.target === 'consult' ? { type: 'OFFER_ONLINE_CONSULT' } : { type: 'GENERATE_RECOMMENDATION' };
    case 'ANSWER':
      return action.mode === 'formal_overview' ? { type: 'SHOW_PROCESS_OVERVIEW' } : { type: 'ANSWER_FAQ' };
    case 'REDIRECT':
      return action.reasonCode === 'medical_safety'
        ? { type: 'SAFE_MEDICAL_REDIRECT' }
        : { type: 'OUT_OF_SCOPE_REDIRECT' };
    case 'ESCALATE':
      return { type: 'CREATE_HANDOFF' };
    case 'CLARIFY':
      return { type: 'CLARIFY_INTENT' };
    case 'ACKNOWLEDGE':
    case 'HANDLE_RESPONSE':
      return { type: 'ANSWER_FAQ' };
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
