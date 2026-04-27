import type { ChatJourneyStage } from '@medical-crm/domain';
import type { ChatbotV3DispatchAgent } from './types.js';

export const DETERMINISTIC_SUPERVISOR_EVENT_TYPES = [
  'TRIAGE_SUBMITTED',
  'TRIAGE_SKIPPED',
  'RECOMMENDATION_SELECTED',
  'RECOMMENDATION_SKIPPED',
  'DOCUMENTS_UPLOADED',
] as const;

export const SEMANTIC_SUPERVISOR_EVENT_TYPES = [
  'USER_EXPRESSED_NEED',
  'USER_ASKED_QUESTION',
  'USER_PROVIDED_INFORMATION',
  'USER_RESPONDED_TO_REQUEST',
  'USER_REQUESTED_HUMAN',
  'USER_ASKED_RISKY_MEDICAL_ADVICE',
  'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
  'USER_MESSAGE_UNCLEAR',
] as const;

export const SUPERVISOR_EVENT_TYPES = [
  ...DETERMINISTIC_SUPERVISOR_EVENT_TYPES,
  ...SEMANTIC_SUPERVISOR_EVENT_TYPES,
] as const;

export type SupervisorEventType = typeof SUPERVISOR_EVENT_TYPES[number];

export type DeterministicSupervisorEventType = typeof DETERMINISTIC_SUPERVISOR_EVENT_TYPES[number];
export type SemanticSupervisorEventType = typeof SEMANTIC_SUPERVISOR_EVENT_TYPES[number];

export type SupervisorEventSource = 'deterministic' | 'llm' | 'fallback_unknown';
export type FaqTopic =
  | 'pricing'
  | 'process'
  | 'hospital'
  | 'doctor'
  | 'records'
  | 'consult'
  | 'travel'
  | 'other';

export type SupervisorEventTarget =
  | 'treatment'
  | 'recommendation'
  | 'documents'
  | 'consult'
  | 'pricing'
  | 'next_step'
  | 'process'
  | 'travel'
  | 'payment'
  | 'hospital'
  | 'hospital_selection'
  | 'medical_facts'
  | 'contact'
  | 'human'
  | 'unknown';

export type SupervisorEventModifier =
  | 'ask'
  | 'provide'
  | 'confirm'
  | 'reject'
  | 'hesitate'
  | 'revisit'
  | 'unknown';

export interface SupervisorEventMetadata {
  topic?: FaqTopic;
  subtopic?: string;
  condition?: string;
  destination?: string;
  urgency?: 'low' | 'medium' | 'high' | 'unknown';
  extractedFacts?: Record<string, unknown>;
  selectedHospitalIds?: string[];
  documentCount?: number;
  riskType?: string;
  redirectTarget?: string;
  rawText?: string;
}

export interface SupervisorEvent {
  eventType: SupervisorEventType;
  confidence: number;
  source: SupervisorEventSource;
  target?: SupervisorEventTarget;
  modifier?: SupervisorEventModifier;
  metadata?: SupervisorEventMetadata;
}

export function getAllowedSupervisorEvents(input: {
  currentStage: ChatJourneyStage;
}): readonly SupervisorEventType[] {
  const commonSemanticEvents: SupervisorEventType[] = [
    'USER_ASKED_QUESTION',
    'USER_PROVIDED_INFORMATION',
    'USER_RESPONDED_TO_REQUEST',
    'USER_REQUESTED_HUMAN',
    'USER_ASKED_RISKY_MEDICAL_ADVICE',
    'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
    'USER_MESSAGE_UNCLEAR',
  ];

  const stageSpecificEvents: SupervisorEventType[] = (() => {
    switch (input.currentStage) {
      case 'COLLECT_MINIMAL_MEDICAL_FACTS':
        return [
          'USER_EXPRESSED_NEED',
        ];
      case 'RECOMMENDATION':
        return [
          'USER_EXPRESSED_NEED',
        ];
      case 'EXPLAIN_PROCESS':
        return [
          'USER_EXPRESSED_NEED',
        ];
      case 'COLLECT_MEDICAL_INPUTS':
        return [
          'USER_EXPRESSED_NEED',
        ];
      case 'ONLINE_CONSULT':
        return [
          'USER_EXPRESSED_NEED',
        ];
      case 'HUMAN_HANDOFF':
        return [];
    }
  })();

  return [...new Set([...commonSemanticEvents, ...stageSpecificEvents])];
}

export interface JourneyState {
  primaryStage: ChatJourneyStage;
  lastQuestion?: {
    questionType: string;
    expectedAnswerType?: string;
  };
}

export type MinimalTriageFactsStatus = 'not_started' | 'submitted' | 'skipped';
export type RecommendationFactsStatus = 'none' | 'generated' | 'selected' | 'skipped';
export type ConsultFactsStatus = 'not_started' | 'ready' | 'scheduled';

export interface DomainFacts {
  language: string | null;
  intake: {
    minimalTriageStatus: MinimalTriageFactsStatus;
    minimalTriageSummary?: string | null;
    condition?: string | null;
    destination?: string | null;
    patientGender?: string | null;
    relationToPatient?: string | null;
  };
  recommendation: {
    status: RecommendationFactsStatus;
    selectedHospitalIds: string[];
    generated?: boolean | null;
  };
  process: {
    explained: boolean;
  };
  records: {
    supportingDocumentsCount: number;
    availableDocumentTypes: string[];
    missingDocumentTypes: string[];
  };
  consult: {
    status: ConsultFactsStatus;
  };
  handoff: {
    active: boolean;
  };
}

export interface MedicalFactPatchCandidate {
  condition?: string;
  diagnosis?: string;
  diagnosisDate?: string;
  priorTreatments?: string;
  currentSymptoms?: string;
  imagingFindings?: string;
  pathologyStatus?: string;
}

export type NextAction =
  | { type: 'COLLECT_MINIMAL_TRIAGE' }
  | { type: 'GENERATE_RECOMMENDATION' }
  | { type: 'ASK_RECOMMENDATION_SELECTION' }
  | { type: 'SHOW_PROCESS_OVERVIEW' }
  | { type: 'REQUEST_MEDICAL_DOCUMENTS' }
  | { type: 'OFFER_ONLINE_CONSULT' }
  | { type: 'CREATE_HANDOFF' }
  | { type: 'ANSWER_FAQ'; topic?: FaqTopic; subtopic?: string }
  | { type: 'SAFE_MEDICAL_REDIRECT'; riskType?: string }
  | { type: 'OUT_OF_SCOPE_REDIRECT'; redirectTarget?: string }
  | { type: 'CLARIFY_INTENT' };

export type ReducerReasonCode =
  | 'TRIAGE_SUBMITTED_RECOMMENDATION_READY'
  | 'TRIAGE_SKIPPED_RECOMMENDATION_READY'
  | 'RECOMMENDATION_SELECTED_PROCESS_READY'
  | 'RECOMMENDATION_SKIPPED_PROCESS_READY'
  | 'DOCUMENTS_UPLOADED_RECORDS_UPDATED'
  | 'USER_REQUESTED_HUMAN_HANDOFF'
  | 'USER_ASKED_FAQ_SIDE_PATH'
  | 'USER_ASKED_NEXT_STEP_RESOLVED'
  | 'USER_PROVIDED_MEDICAL_FACTS_RECORDED'
  | 'USER_INTERESTED_IN_CONSULT_READY'
  | 'RISKY_OR_RESTRICTED_REQUEST_REDIRECTED'
  | 'AMBIGUOUS_OR_UNKNOWN_CLARIFY'
  | (string & {});

export interface JourneyReduction {
  state: JourneyState;
  facts: DomainFacts;
  nextAction: NextAction;
  reasonCode: ReducerReasonCode;
  isSidePath: boolean;
  sidePathType: 'none' | 'faq' | 'safety' | 'out_of_scope' | 'clarification';
  primaryStagePreserved: boolean;
  dispatchAgent?: ChatbotV3DispatchAgent | null;
}
