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
  userMessage: string;
  resolvedIntent?: string;
}

export interface RequestClassificationResult {
  requestClass: ChatbotV2RequestClass;
  targetResourceTypes: ChatResourceType[];
}

export interface ConversationOrchestratorInput {
  scopeId: string;
  userMessage: string;
  journeySnapshot: JourneySnapshot;
  truth: JourneyTruth;
  resolvedIntent?: string;
}

export interface ConversationOrchestrationResult {
  requestClass: ChatbotV2RequestClass;
  responseIntent: ChatbotV2RequestClass;
  allowedResources: ChatbotV2ResourceDescriptor[];
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
