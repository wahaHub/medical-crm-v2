import type { ChatJourneyStage } from '@medical-crm/domain';

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

export const SUPERVISOR_EVENT_TARGETS = [
  'treatment',
  'recommendation',
  'documents',
  'consult',
  'pricing',
  'next_step',
  'process',
  'travel',
  'payment',
  'hospital',
  'hospital_selection',
  'medical_facts',
  'contact',
  'human',
  'unknown',
] as const satisfies readonly SupervisorEventTarget[];

export type SupervisorEventModifier =
  | 'ask'
  | 'provide'
  | 'confirm'
  | 'reject'
  | 'hesitate'
  | 'revisit'
  | 'unknown';

export const SUPERVISOR_EVENT_MODIFIERS = [
  'ask',
  'provide',
  'confirm',
  'reject',
  'hesitate',
  'revisit',
  'unknown',
] as const satisfies readonly SupervisorEventModifier[];

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

export type PrimaryAction =
  | { type: 'ANSWER'; target: SupervisorEventTarget; mode?: 'faq' | 'formal_overview' }
  | { type: 'ACKNOWLEDGE'; target: SupervisorEventTarget }
  | {
      type: 'CLARIFY';
      target?: SupervisorEventTarget;
      reasonCode: 'ambiguous_message' | 'missing_context' | 'low_confidence' | 'unclear_last_reply';
    }
  | { type: 'REQUEST_INFO'; target: 'minimal_triage' | 'medical_facts' | 'documents' | 'preference'; questionKey?: string }
  | { type: 'PRESENT_OPTIONS'; target: 'hospital' | 'consult' }
  | { type: 'HANDLE_RESPONSE'; target: SupervisorEventTarget; modifier: SupervisorEventModifier }
  | { type: 'REDIRECT'; target: SupervisorEventTarget; reasonCode: 'out_of_scope' | 'medical_safety' | 'cannot_do' }
  | { type: 'ESCALATE'; target: 'human'; reasonCode?: string };

export type FollowUpAction =
  | { type: 'INVITE_NEXT_STEP'; target: 'minimal_triage' | 'recommendation' | 'documents' | 'consult' | 'process' | 'human' | 'unknown'; reason?: string }
  | { type: 'ASK_QUALIFYING_QUESTION'; target: SupervisorEventTarget; questionKey: string }
  | {
      type: 'GO_DEEP';
      target: SupervisorEventTarget;
      questionKey?: string;
      topicKey?: string;
      reasonCode: 'user_requested_more_detail' | 'high_intent_followup' | 'needs_domain_explanation';
    }
  | { type: 'NONE' };

export type SidePathType = 'none' | 'faq' | 'safety' | 'out_of_scope' | 'clarification';

export interface TurnPlan {
  primaryAction: PrimaryAction;
  followUpAction?: FollowUpAction;
  primaryStage: ChatJourneyStage;
  factsPatch: Record<string, unknown>;
  reasonCode: ReducerReasonCode;
  sidePath?: {
    type: SidePathType;
    primaryStagePreserved: boolean;
  };
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
  | 'USER_ASKED_QUESTION_SIDE_PATH'
  | 'USER_ASKED_QUESTION_NEXT_STEP_RESOLVED'
  | 'USER_PROVIDED_INFORMATION_RECORDED'
  | 'USER_EXPRESSED_NEED_CONSULT_READY'
  | 'RISKY_OR_RESTRICTED_REQUEST_REDIRECTED'
  | 'AMBIGUOUS_OR_UNKNOWN_CLARIFY'
  | (string & {});

export interface JourneyReduction {
  state: JourneyState;
  facts: DomainFacts;
  turnPlan: TurnPlan;
  reasonCode: ReducerReasonCode;
  isSidePath: boolean;
  sidePathType: SidePathType;
  primaryStagePreserved: boolean;
}
