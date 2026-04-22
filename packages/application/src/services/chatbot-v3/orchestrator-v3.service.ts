import type { ChatJourneyStage } from '@medical-crm/domain';
import { JourneyRuntimeAuthorityService } from './journey-runtime-authority.service.js';
import {
  CHATBOT_V3_JOURNEY_STAGES,
  type ChatbotV3PolicyConfigInput,
  type OrchestratorV3DecisionInput,
  type OrchestratorV3DispatchAgent,
  type OrchestratorV3StageRef,
  resolveChatbotV3ProposalDispatchAgent,
} from './types.js';

export type {
  OrchestratorV3BootstrapSignals,
  OrchestratorV3DispatchAgent,
  OrchestratorV3Facts,
  OrchestratorV3HandoffSignals,
  OrchestratorV3Intent,
  OrchestratorV3StageRef,
  OrchestratorV3Suggestion,
} from './types.js';

export interface OrchestratorV3Decision {
  action: 'STAY' | 'ADVANCE' | 'SKIP' | 'HANDOFF';
  from: OrchestratorV3StageRef;
  to: OrchestratorV3StageRef;
  dispatchAgent?: OrchestratorV3DispatchAgent | null;
  dispatchSource: 'orchestrator';
  matchedRuleId?: string;
  whyNotSkip?: string;
  write?: {
    authority: 'journey-runtime-authority';
    stage: OrchestratorV3StageRef;
    factsPatch: Partial<Record<string, boolean>>;
  };
}

export class OrchestratorV3Service {
  private readonly authority = new JourneyRuntimeAuthorityService();

  constructor(configInput: ChatbotV3PolicyConfigInput = {}) {
    assertNoLegacyPolicyOverrides(configInput);
  }

  decide(input: OrchestratorV3DecisionInput): OrchestratorV3Decision {
    const authorityDecision = this.authority.decide({
      current: input.current,
      proposal: {
        ...input.suggestion,
        dispatchAgent: resolveChatbotV3ProposalDispatchAgent(input.suggestion),
      },
      facts: input.facts,
      handoff: input.handoff,
      bootstrap: input.bootstrap,
    });

    if (authorityDecision.outcome === 'DENY') {
      return {
        action: 'STAY',
        from: authorityDecision.from,
        to: authorityDecision.to,
        dispatchSource: 'orchestrator',
        whyNotSkip: authorityDecision.reason,
        write: authorityDecision.write,
      };
    }

    const compatibilityAction = mapAuthorityActionToCompatibilityAction(
      authorityDecision.from.stage,
      authorityDecision.to.stage,
      authorityDecision.action,
    );

    return {
      action: compatibilityAction,
      from: authorityDecision.from,
      to: compatibilityAction === 'STAY' ? authorityDecision.from : authorityDecision.to,
      dispatchAgent: authorityDecision.dispatch.agent,
      dispatchSource: 'orchestrator',
      write: authorityDecision.write,
    };
  }
}

function assertNoLegacyPolicyOverrides(configInput: ChatbotV3PolicyConfigInput): void {
  if (Object.keys(configInput).length === 0) {
    return;
  }

  throw new Error(
    'OrchestratorV3Service no longer accepts policy override config; use JourneyRuntimeAuthorityService canonical rules instead.',
  );
}

function mapAuthorityActionToCompatibilityAction(
  currentStage: ChatJourneyStage,
  targetStage: ChatJourneyStage,
  action: 'STAY' | 'ADVANCE' | 'REPEAT' | 'ESCALATE',
): OrchestratorV3Decision['action'] {
  if (action === 'ESCALATE') {
    return 'HANDOFF';
  }

  if (currentStage === targetStage || action === 'REPEAT') {
    return 'STAY';
  }

  const currentIndex = CHATBOT_V3_JOURNEY_STAGES.indexOf(currentStage);
  const targetIndex = CHATBOT_V3_JOURNEY_STAGES.indexOf(targetStage);

  if (currentIndex >= 0 && targetIndex >= 0 && targetIndex - currentIndex === 1) {
    return 'ADVANCE';
  }

  return 'SKIP';
}
