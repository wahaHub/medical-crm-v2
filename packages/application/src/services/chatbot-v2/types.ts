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
  medicalInputsStarted: boolean;
  medicalInputsSubmitted: boolean;
  recommendationAvailable: boolean;
  recommendationConfirmed: boolean;
  onlineConsultRequired: boolean;
  onlineConsultStarted: boolean;
  onlineConsultSubmitted: boolean;
  humanHandoffActive: boolean;
  humanHandoffSubmitted: boolean;
}

export type JourneyTransitionEvent =
  | { type: 'START_MEDICAL_INPUTS' }
  | { type: 'REQUEST_HUMAN_HANDOFF' };

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
  truth: Pick<JourneyTruth, 'medicalInputsSubmitted' | 'recommendationConfirmed' | 'onlineConsultSubmitted' | 'humanHandoffSubmitted'>;
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
  resourceUpdates?: ChatbotV2ResourceDescriptor[];
}

export interface ChatbotV2FoundationState {
  source: 'status_snapshot_bridge';
  scopeId: string;
  journeySnapshot: JourneySnapshot;
  truth: JourneyTruth;
  allowedResources: ChatbotV2ResourceDescriptor[];
  requestClass?: ChatbotV2RequestClass;
  responseIntent?: ChatbotV2RequestClass;
}
