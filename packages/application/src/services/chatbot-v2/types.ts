import type {
  ChatJourneyPhase,
  ChatJourneyStage,
  ChatResourceStatus,
  ChatResourceType,
} from '@medical-crm/domain';

export interface JourneySnapshot {
  currentStage: ChatJourneyStage;
  currentPhase: ChatJourneyPhase;
}

export interface JourneyTruth {
  medicalInputsSubmitted: boolean;
  recommendationConfirmed: boolean;
  onlineConsultSubmitted: boolean;
}

export interface StageCopyReference {
  stage: ChatJourneyStage;
  phase: ChatJourneyPhase;
  referenceText: string;
}

export type JourneyTransitionDecision =
  | { type: 'ENTER_COLLECT_MEDICAL_INPUTS_PRE' }
  | { type: 'ENTER_COLLECT_MEDICAL_INPUTS_ACTIVE' }
  | { type: 'ENTER_COLLECT_MEDICAL_INPUTS_POST' }
  | { type: 'ENTER_RECOMMENDATION_PRE' }
  | { type: 'ENTER_RECOMMENDATION_ACTIVE' }
  | { type: 'ENTER_RECOMMENDATION_POST' }
  | { type: 'ENTER_ONLINE_CONSULT_PRE' }
  | { type: 'ENTER_ONLINE_CONSULT_ACTIVE' }
  | { type: 'ENTER_ONLINE_CONSULT_POST' }
  | { type: 'ENTER_HUMAN_HANDOFF_PRE' }
  | { type: 'ENTER_HUMAN_HANDOFF_ACTIVE' }
  | { type: 'ENTER_HUMAN_HANDOFF_POST' };

export type ChatbotV2RequestClass =
  | 'faq'
  | 'process_explanation'
  | 'progression_request'
  | 'resource_request'
  | 'resource_status_question'
  | 'human_help_request';

export interface ChatbotV2ResourceDescriptor {
  resourceType: ChatResourceType;
  resourceId: string;
  status: ChatResourceStatus;
  stageBinding?: {
    stage: ChatJourneyStage;
    phase?: ChatJourneyPhase;
  };
  visibility: {
    mode: 'journey' | 'global';
    allowedStages?: ChatJourneyStage[];
  };
  payload: Record<string, unknown>;
  actions: string[];
}

export interface ResourceRegistryInput {
  scopeId: string;
  journeySnapshot: JourneySnapshot;
  truth: JourneyTruth;
}

export interface RequestClassificationInput {
  recentMessages: ChatbotV2ClassifierMessage[];
  conversationSummary: string;
  journeySnapshot: JourneySnapshot;
  allowedResourceHints: ChatbotV2ClassifierResourceHint[];
  userMessage?: string;
  resolvedIntent?: string;
}

export interface RequestClassificationResult {
  requestClass: ChatbotV2RequestClass;
  targetResourceTypes: ChatResourceType[];
  includeProgressionFollowUp: boolean;
}

export interface ChatbotV2ClassifierResourceHint {
  resourceType: ChatResourceType;
  description: string;
}

export interface ChatbotV2ClassifierMessage {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
}

export interface ChatbotV2ClassifierInput {
  recentMessages: ChatbotV2ClassifierMessage[];
  conversationSummary: string;
  journeySnapshot: JourneySnapshot;
  allowedResourceHints: ChatbotV2ClassifierResourceHint[];
}

export interface ConversationOrchestratorInput {
  scopeId: string;
  journeySnapshot: JourneySnapshot;
  truth: JourneyTruth;
  classification: RequestClassificationResult;
}

export interface ConversationOrchestrationResult {
  requestClass: ChatbotV2RequestClass;
  responseIntent: ChatbotV2RequestClass;
  allowedResources: ChatbotV2ResourceDescriptor[];
  includeProgressionFollowUpAccepted?: boolean;
  requiresFaqGrounding?: boolean;
  journeyUpdate?: JourneySnapshot;
}

export interface ChatbotV2FoundationState {
  source: 'bootstrap';
  scopeId: string;
  journeySnapshot: JourneySnapshot;
  truth: JourneyTruth;
  allowedResources: ChatbotV2ResourceDescriptor[];
  requestClass?: ChatbotV2RequestClass;
  responseIntent?: ChatbotV2RequestClass;
  targetResourceTypes?: ChatResourceType[];
  stageCopy?: StageCopyReference | null;
}
