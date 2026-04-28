import type {
  ChatbotV3DispatchAgent,
  ChatbotV3Intent,
  SupervisorProposal,
} from './types.js';
import type { NextActionExecution } from './next-action-resolver.js';
import type { JourneyReducerOutput } from './journey-reducer.js';
import type { PrimaryAction } from './supervisor-event.types.js';
import type { ChatJourneyStage } from '@medical-crm/domain';

export interface LegacyCompatibilityViewInput {
  currentStage: ChatJourneyStage;
  reduction: JourneyReducerOutput;
  execution: NextActionExecution;
}

export interface ProjectedDecision {
  primaryAction: PrimaryAction;
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
  const intent = projectIntent(input.reduction.turnPlan.primaryAction);
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
      primaryAction: input.reduction.turnPlan.primaryAction,
      fromStage: input.currentStage,
      toStage: input.reduction.primaryStage,
      dispatchAgent,
      isSystemRendered: input.execution.isSystemRendered,
    },
  };
}

function projectIntent(action: PrimaryAction): ChatbotV3Intent {
  switch (action.type) {
    case 'ANSWER':
    case 'REDIRECT':
    case 'CLARIFY':
    case 'HANDLE_RESPONSE':
      return 'faq';
    case 'PRESENT_OPTIONS':
      return action.target === 'consult' ? 'consult' : 'progression';
    case 'ESCALATE':
      return 'handoff';
    case 'REQUEST_INFO':
    case 'ACKNOWLEDGE':
      return 'progression';
  }
}
