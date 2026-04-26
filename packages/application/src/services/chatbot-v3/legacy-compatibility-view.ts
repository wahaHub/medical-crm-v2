import type {
  ChatbotV3DispatchAgent,
  ChatbotV3Intent,
  SupervisorProposal,
} from './types.js';
import type { NextActionExecution } from './next-action-resolver.js';
import type { JourneyReducerOutput } from './journey-reducer.js';
import type { NextAction } from './supervisor-event.types.js';
import type { ChatJourneyStage } from '@medical-crm/domain';

export interface LegacyCompatibilityViewInput {
  currentStage: ChatJourneyStage;
  reduction: JourneyReducerOutput;
  execution: NextActionExecution;
}

export interface ProjectedDecision {
  nextAction: NextAction;
  fromStage: ChatJourneyStage;
  toStage: ChatJourneyStage;
  dispatchAgent: ChatbotV3DispatchAgent | null;
  isSystemRendered: boolean;
}

export interface LegacyCompatibilityView {
  projectedProposal: SupervisorProposal;
  projectedDecision: ProjectedDecision;
}

export function projectLegacyCompatibilityView(input: LegacyCompatibilityViewInput): LegacyCompatibilityView {
  const intent = projectIntent(input.reduction.nextAction);
  const reason = input.reduction.reasonCode;
  const dispatchAgent = input.execution.agent;

  return {
    projectedProposal: {
      intent,
      suggestedStage: input.reduction.primaryStage,
      dispatchAgent,
      reason,
      ...(dispatchAgent ? {
        task: {
          goal: reason,
          latestUserMessage: '',
          necessaryFacts: {},
        },
      } : {}),
    },
    projectedDecision: {
      nextAction: input.reduction.nextAction,
      fromStage: input.currentStage,
      toStage: input.reduction.primaryStage,
      dispatchAgent,
      isSystemRendered: input.execution.isSystemRendered,
    },
  };
}

function projectIntent(action: NextAction): ChatbotV3Intent {
  switch (action.type) {
    case 'ANSWER_FAQ':
    case 'SAFE_MEDICAL_REDIRECT':
    case 'OUT_OF_SCOPE_REDIRECT':
    case 'CLARIFY_INTENT':
      return 'faq';
    case 'OFFER_ONLINE_CONSULT':
      return 'consult';
    case 'CREATE_HANDOFF':
      return 'handoff';
    default:
      return 'progression';
  }
}
