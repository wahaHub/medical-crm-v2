import type {
  AiChatStatusSnapshot,
  AiChatJourneyPhase,
  ChatJourneyPhase,
  ChatJourneyStage,
} from '@medical-crm/domain';
import type { MinimalIntakeSeed } from './minimal-intake.types.js';

export const CHATBOT_V3_JOURNEY_STAGES = [
  'COLLECT_MINIMAL_MEDICAL_FACTS',
  'RECOMMENDATION',
  'EXPLAIN_PROCESS',
  'COLLECT_MEDICAL_INPUTS',
  'ONLINE_CONSULT',
  'HUMAN_HANDOFF',
] as const satisfies readonly ChatJourneyStage[];

export type ChatbotV3Intent =
  | 'faq'
  | 'progression'
  | 'resource'
  | 'consult'
  | 'handoff'
  | 'unknown';

export type ChatbotV3DispatchAgent =
  | 'FaqAgent'
  | 'RecordsAgent'
  | 'RecommendationAgent'
  | 'ConsultAgent'
  | 'HandoffAgent';

export type SupervisorReadDomain =
  | 'records.status'
  | 'recommendation.status'
  | 'consult.status'
  | 'handoff.status';

export type ChatbotV3BootstrapOverride =
  | 'direct_human_request_handoff'
  | 'direct_human_request_faq_fallback'
  | 'attachments_to_minimal_triage';

export interface SupervisorDecisionLineage {
  bootstrapOverride: ChatbotV3BootstrapOverride;
}

export interface SupervisorConversationSummaryContract {
  owner: 'runtime';
  refreshTrigger: 'after_final_assistant_response';
  sizeDiscipline: 'compact';
  freshness: 'latest_committed_turn';
  persistenceStrategy: 'persisted_with_session';
}

export const SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT = {
  owner: 'runtime',
  refreshTrigger: 'after_final_assistant_response',
  sizeDiscipline: 'compact',
  freshness: 'latest_committed_turn',
  persistenceStrategy: 'persisted_with_session',
} as const satisfies SupervisorConversationSummaryContract;

export type ChatbotV3ConversationSummaryContract = SupervisorConversationSummaryContract;
export const CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT = SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT;

export interface ChatbotV3StageRef {
  stage: ChatJourneyStage;
  phase: ChatJourneyPhase;
}

export type ChatbotV3Facts = Record<string, boolean | number | string | null | undefined>;
export type ChatbotV3StatusSnapshot = Partial<Pick<
  AiChatStatusSnapshot,
  | 'minimalTriageStatus'
  | 'minimalTriageAnswersSummary'
  | 'minimalTriageComplete'
  | 'processExplained'
  | 'recommendationSelectionStatus'
  | 'recommendationSelectedHospitalIds'
  | 'supportingDocuments'
>> & {
  journeyCurrentStage?: ChatJourneyStage | null;
  journeyCurrentPhase?: AiChatStatusSnapshot['journeyCurrentPhase'];
};

export interface SupervisorTask {
  goal: string;
  latestUserMessage: string;
  necessaryFacts: ChatbotV3Facts;
}

export interface SupervisorSuggestionSeed {
  intent: ChatbotV3Intent;
  suggestedStage: ChatJourneyStage;
  dispatchAgent?: ChatbotV3DispatchAgent;
  reason: string;
}

export interface SupervisorProposal extends SupervisorSuggestionSeed {
  dispatchAgent: ChatbotV3DispatchAgent;
  task: SupervisorTask;
}

export type ChatbotV3Suggestion = SupervisorProposal;
export type SupervisorOutput = SupervisorProposal;
export type SupervisorReadHints = readonly SupervisorReadDomain[];
export type SupervisorDomainReadResults = Partial<Record<
  SupervisorReadDomain,
  Record<string, unknown>
>>;

export interface ChatbotV3HandoffSignals {
  userRequestedHuman?: boolean;
  consecutiveCriticalToolFailures?: number;
  safetyPolicyHit?: boolean;
}

export interface ChatbotV3BootstrapSignals {
  message: string;
  attachments?: Array<Record<string, unknown>>;
  canCreateHandoff?: boolean;
}

export interface SupervisorGatewayInput {
  currentStage: ChatJourneyStage;
  journeyCurrentStage?: ChatJourneyStage | null;
  journeyCurrentPhase?: AiChatStatusSnapshot['journeyCurrentPhase'];
  minimalTriageStatus?: AiChatStatusSnapshot['minimalTriageStatus'] | null;
  minimalTriageAnswersSummary?: string | null;
  processExplained?: boolean | null;
  recommendationSelectionStatus?: AiChatStatusSnapshot['recommendationSelectionStatus'] | null;
  recommendationSelectedHospitalIds?: string[] | null;
  supportingDocuments?: AiChatStatusSnapshot['supportingDocuments'];
  statusSnapshot?: ChatbotV3StatusSnapshot | null;
  conversationSummary: string;
  latestUserMessage: string;
  intake: MinimalIntakeSeed;
  availableReadDomains: SupervisorReadHints;
  domainReadResults?: SupervisorDomainReadResults;
  conversationSummaryContract: SupervisorConversationSummaryContract;
}

export interface OrchestratorV3DecisionInput {
  current: ChatbotV3StageRef;
  currentStage?: ChatJourneyStage;
  journeyCurrentStage?: ChatJourneyStage | null;
  journeyCurrentPhase?: AiChatStatusSnapshot['journeyCurrentPhase'];
  minimalTriageStatus?: AiChatStatusSnapshot['minimalTriageStatus'] | null;
  minimalTriageAnswersSummary?: string | null;
  recommendationSelectionStatus?: AiChatStatusSnapshot['recommendationSelectionStatus'] | null;
  recommendationSelectedHospitalIds?: string[] | null;
  supportingDocuments?: AiChatStatusSnapshot['supportingDocuments'];
  conversationSummary?: string;
  latestUserMessage?: string;
  intake?: MinimalIntakeSeed;
  availableReadDomains?: readonly SupervisorReadDomain[];
  domainReadResults?: SupervisorDomainReadResults;
  suggestion: SupervisorSuggestionSeed;
  facts?: ChatbotV3Facts;
  statusSnapshot?: ChatbotV3StatusSnapshot | null;
  handoff?: ChatbotV3HandoffSignals;
  bootstrap?: ChatbotV3BootstrapSignals;
}

export type OrchestratorV3Intent = ChatbotV3Intent;
export type OrchestratorV3DispatchAgent = ChatbotV3DispatchAgent;
export type OrchestratorV3StageRef = ChatbotV3StageRef;
export type OrchestratorV3Suggestion = SupervisorSuggestionSeed;
export type OrchestratorV3HandoffSignals = ChatbotV3HandoffSignals;
export type OrchestratorV3BootstrapSignals = ChatbotV3BootstrapSignals;
export type OrchestratorV3Facts = ChatbotV3Facts;

export interface JourneyRuntimeAuthorityProposal extends SupervisorSuggestionSeed {
  dispatchAgent?: ChatbotV3DispatchAgent;
}

export interface JourneyRuntimeAuthorityInput {
  current: ChatbotV3StageRef;
  proposal: JourneyRuntimeAuthorityProposal;
  journeyCurrentStage?: ChatJourneyStage | null;
  journeyCurrentPhase?: AiChatStatusSnapshot['journeyCurrentPhase'];
  minimalTriageStatus?: AiChatStatusSnapshot['minimalTriageStatus'] | null;
  minimalTriageAnswersSummary?: string | null;
  recommendationSelectionStatus?: AiChatStatusSnapshot['recommendationSelectionStatus'] | null;
  recommendationSelectedHospitalIds?: string[] | null;
  supportingDocuments?: AiChatStatusSnapshot['supportingDocuments'];
  facts?: ChatbotV3Facts;
  statusSnapshot?: ChatbotV3StatusSnapshot | null;
  handoff?: ChatbotV3HandoffSignals;
  bootstrap?: ChatbotV3BootstrapSignals;
  intake?: MinimalIntakeSeed;
}

export interface JourneyRuntimeAuthorityDispatch {
  outcome: 'ALLOW' | 'DENY';
  agent?: ChatbotV3DispatchAgent;
}

export interface JourneyRuntimeAuthorityWrite {
  authority: 'journey-runtime-authority';
  stage: ChatbotV3StageRef;
  journeyCurrentStage: ChatJourneyStage;
  journeyCurrentPhase: AiChatJourneyPhase;
  factsPatch: Partial<Record<string, boolean>>;
}

export interface JourneyRuntimeAuthorityDecision {
  outcome: 'ALLOW' | 'DENY';
  action: 'STAY' | 'ADVANCE' | 'REPEAT' | 'ESCALATE';
  from: ChatbotV3StageRef;
  to: ChatbotV3StageRef;
  dispatch: JourneyRuntimeAuthorityDispatch;
  write: JourneyRuntimeAuthorityWrite;
  reason: string;
}

export function resolveChatbotV3DispatchAgent(
  stage: ChatJourneyStage,
): ChatbotV3DispatchAgent | undefined {
  switch (stage) {
    case 'EXPLAIN_PROCESS':
      return 'FaqAgent';
    case 'COLLECT_MINIMAL_MEDICAL_FACTS':
    case 'COLLECT_MEDICAL_INPUTS':
      return 'RecordsAgent';
    case 'RECOMMENDATION':
      return 'RecommendationAgent';
    case 'ONLINE_CONSULT':
      return 'ConsultAgent';
    case 'HUMAN_HANDOFF':
      return 'HandoffAgent';
    default:
      return undefined;
  }
}

export interface ChatbotV3JumpRule {
  id: string;
  priority: number;
  fromStage: ChatJourneyStage;
  toStage: ChatJourneyStage;
}

export interface ChatbotV3GlobalPolicies {
  forceExplainProcessBefore: ChatJourneyStage[];
  handoffTriggers: {
    userRequestedHuman: boolean;
    consecutiveCriticalToolFailures: number;
    safetyPolicyHit: boolean;
  };
  handoffPrerequisites?: ChatbotV3StagePrerequisite;
}

export interface ChatbotV3StagePrerequisite {
  requiresAll?: string[];
  requiresAny?: string[];
  denyIfAny?: string[];
}

export type ChatbotV3StagePrerequisites = Partial<
  Record<ChatJourneyStage, ChatbotV3StagePrerequisite>
>;

export interface ChatbotV3PolicyConfig {
  globalPolicies: ChatbotV3GlobalPolicies;
  stagePrerequisites: ChatbotV3StagePrerequisites;
  jumpRules: ChatbotV3JumpRule[];
}

export interface ChatbotV3PolicyConfigInput {
  globalPolicies?: {
    forceExplainProcessBefore?: ChatJourneyStage[];
    handoffTriggers?: Partial<ChatbotV3GlobalPolicies['handoffTriggers']>;
    handoffPrerequisites?: ChatbotV3StagePrerequisite;
  };
  stagePrerequisites?: ChatbotV3StagePrerequisites;
  jumpRules?: ChatbotV3JumpRule[];
}

export const DEFAULT_POLICY: ChatbotV3PolicyConfig = {
  globalPolicies: {
    forceExplainProcessBefore: ['ONLINE_CONSULT'],
    handoffTriggers: {
      userRequestedHuman: true,
      consecutiveCriticalToolFailures: 2,
      safetyPolicyHit: true,
    },
    handoffPrerequisites: {
      denyIfAny: ['handoff.active'],
    },
  },
  stagePrerequisites: {
    RECOMMENDATION: { requiresAll: ['records.minimal_triage.complete'] },
    ONLINE_CONSULT: { requiresAll: ['process.explained', 'recommendation.selected'] },
  },
  jumpRules: [],
};

export function hasChatbotV3MinimalTriageComplete(input: {
  facts?: ChatbotV3Facts;
  statusSnapshot?: ChatbotV3StatusSnapshot | null;
}): boolean {
  const status = input.statusSnapshot?.minimalTriageStatus;
  const answersSummary = input.statusSnapshot?.minimalTriageAnswersSummary ?? null;

  if (status === 'skipped') {
    return true;
  }

  if (status === 'pending') {
    return answersSummary !== null && answersSummary.trim().length > 0;
  }

  return false;
}

export function hasChatbotV3RecommendationSelected(input: {
  statusSnapshot?: ChatbotV3StatusSnapshot | null;
}): boolean {
  return input.statusSnapshot?.recommendationSelectionStatus === 'selected';
}
