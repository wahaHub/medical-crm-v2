import type { ChatJourneyStage } from '@medical-crm/domain';
import {
  CHATBOT_V3_JOURNEY_STAGES,
  type ChatbotV3DispatchAgent,
  type ChatbotV3Facts,
  type JourneyRuntimeAuthorityDecision,
  type JourneyRuntimeAuthorityInput,
  type JourneyRuntimeAuthorityWrite,
  resolveChatbotV3DispatchAgent,
} from './types.js';

export class JourneyRuntimeAuthorityService {
  decide(input: JourneyRuntimeAuthorityInput): JourneyRuntimeAuthorityDecision {
    if (shouldEscalateToHuman(input)) {
      return allowDecision({
        input,
        stage: 'HUMAN_HANDOFF',
        action: 'ESCALATE',
        dispatchAgent: 'HandoffAgent',
        reason: 'human handoff escalation was triggered',
        factsPatch: {
          'handoff.active': true,
        },
      });
    }

    const targetStage = input.proposal.suggestedStage;

    if (targetStage === 'HUMAN_HANDOFF' && hasHandoffActive(input.facts)) {
      return denyDecision(input, 'HUMAN_HANDOFF is already active');
    }

    if (isSidePathIntent(input.proposal.intent) && targetStage !== 'EXPLAIN_PROCESS') {
      return denyDecision(input, 'FAQ/resource-only turns do not auto-advance the primary journey');
    }

    switch (targetStage) {
      case 'COLLECT_MINIMAL_MEDICAL_FACTS':
        return allowDecision({
          input,
          stage: targetStage,
          action: deriveAction(input.current.stage, targetStage),
          dispatchAgent: resolveCanonicalDispatchAgent(targetStage),
          reason: input.proposal.reason,
        });
      case 'COLLECT_MEDICAL_INPUTS':
        if (!canCollectMedicalInputs(input)) {
          return denyDecision(
            input,
            'COLLECT_MEDICAL_INPUTS requires RECOMMENDATION and EXPLAIN_PROCESS first',
          );
        }

        return allowDecision({
          input,
          stage: targetStage,
          action: deriveAction(input.current.stage, targetStage),
          dispatchAgent: resolveCanonicalDispatchAgent(targetStage),
          reason: input.proposal.reason,
        });
      case 'RECOMMENDATION':
        if (!hasMinimalTriageComplete(input.facts)) {
          return denyDecision(input, 'Recommendation requires records.minimal_triage.complete');
        }

        return allowDecision({
          input,
          stage: targetStage,
          action: deriveAction(input.current.stage, targetStage),
          dispatchAgent: resolveCanonicalDispatchAgent(targetStage),
          reason: input.proposal.reason,
        });
      case 'EXPLAIN_PROCESS':
        if (!canShowExplainProcess(input)) {
          return denyDecision(
            input,
            'Process explanation is normally post-recommendation unless explicitly requested by the user',
          );
        }

        return allowDecision({
          input,
          stage: targetStage,
          action: deriveAction(input.current.stage, targetStage),
          dispatchAgent: resolveCanonicalDispatchAgent(targetStage),
          reason: input.proposal.reason,
          factsPatch: {
            'process.explained': true,
          },
        });
      case 'ONLINE_CONSULT':
        if (!hasRecommendationSelected(input.facts)) {
          return denyDecision(input, 'Online consult requires recommendation.selected');
        }

        if (!hasProcessExplained(input.facts)) {
          return denyDecision(input, 'Online consult requires process.explained');
        }

        return allowDecision({
          input,
          stage: targetStage,
          action: deriveAction(input.current.stage, targetStage),
          dispatchAgent: resolveCanonicalDispatchAgent(targetStage),
          reason: input.proposal.reason,
        });
      case 'HUMAN_HANDOFF':
        return allowDecision({
          input,
          stage: targetStage,
          action: 'ESCALATE',
          dispatchAgent: 'HandoffAgent',
          reason: input.proposal.reason,
          factsPatch: {
            'handoff.active': true,
          },
        });
      default:
        return denyDecision(input, `Unsupported target stage: ${String(targetStage)}`);
    }
  }
}

function allowDecision({
  input,
  stage,
  action,
  dispatchAgent,
  reason,
  factsPatch = {},
}: {
  input: JourneyRuntimeAuthorityInput;
  stage: ChatJourneyStage;
  action: JourneyRuntimeAuthorityDecision['action'];
  dispatchAgent?: ChatbotV3DispatchAgent;
  reason: string;
  factsPatch?: JourneyRuntimeAuthorityWrite['factsPatch'];
}): JourneyRuntimeAuthorityDecision {
  return {
    outcome: 'ALLOW',
    action,
    from: cloneStage(input.current),
    to: {
      stage,
      phase: 'active',
    },
    dispatch: dispatchAgent
      ? {
          outcome: 'ALLOW',
          agent: dispatchAgent,
        }
      : {
          outcome: 'DENY',
        },
    write: {
      authority: 'journey-runtime-authority',
      stage: {
        stage,
        phase: 'active',
      },
      factsPatch,
    },
    reason,
  };
}

function denyDecision(
  input: JourneyRuntimeAuthorityInput,
  reason: string,
): JourneyRuntimeAuthorityDecision {
  return {
    outcome: 'DENY',
    action: 'STAY',
    from: cloneStage(input.current),
    to: cloneStage(input.current),
    dispatch: {
      outcome: 'DENY',
    },
    write: {
      authority: 'journey-runtime-authority',
      stage: cloneStage(input.current),
      factsPatch: {},
    },
    reason,
  };
}

function deriveAction(
  currentStage: ChatJourneyStage,
  targetStage: ChatJourneyStage,
): JourneyRuntimeAuthorityDecision['action'] {
  return currentStage === targetStage ? 'REPEAT' : 'ADVANCE';
}

function cloneStage(stage: JourneyRuntimeAuthorityInput['current']) {
  return {
    stage: stage.stage,
    phase: stage.phase,
  };
}

function shouldEscalateToHuman(input: JourneyRuntimeAuthorityInput): boolean {
  if (hasHandoffActive(input.facts)) {
    return false;
  }

  if (input.proposal.intent === 'handoff' || input.proposal.suggestedStage === 'HUMAN_HANDOFF') {
    return true;
  }

  if (!input.handoff) {
    return false;
  }

  if (input.handoff.userRequestedHuman || input.handoff.safetyPolicyHit) {
    return true;
  }

  return (input.handoff.consecutiveCriticalToolFailures ?? 0) >= 2;
}

function canShowExplainProcess(input: JourneyRuntimeAuthorityInput): boolean {
  if (input.proposal.intent === 'faq' || input.proposal.intent === 'resource') {
    if (hasProcessExplained(input.facts)) {
      return isExplicitRepeatExplainRequest(input.bootstrap?.message);
    }

    return true;
  }

  if (hasProcessExplained(input.facts)) {
    return false;
  }

  if (isPostRecommendationStage(input.current.stage)) {
    return true;
  }

  return hasRecommendationSelected(input.facts);
}

function resolveCanonicalDispatchAgent(stage: ChatJourneyStage): ChatbotV3DispatchAgent {
  const dispatchAgent = resolveChatbotV3DispatchAgent(stage);
  if (!dispatchAgent) {
    throw new Error(`Unable to resolve canonical dispatch agent for stage ${stage}`);
  }
  return dispatchAgent;
}

function canCollectMedicalInputs(input: JourneyRuntimeAuthorityInput): boolean {
  if (input.current.stage === 'COLLECT_MEDICAL_INPUTS') {
    return true;
  }

  return hasRecommendationSelected(input.facts) && hasProcessExplained(input.facts);
}

function isPostRecommendationStage(stage: ChatJourneyStage): boolean {
  return CHATBOT_V3_JOURNEY_STAGES.indexOf(stage) >= CHATBOT_V3_JOURNEY_STAGES.indexOf('RECOMMENDATION');
}

function hasMinimalTriageComplete(facts: ChatbotV3Facts | undefined): boolean {
  return hasAnyTruthyFact(facts, ['records.minimal_triage.complete']);
}

function hasRecommendationSelected(facts: ChatbotV3Facts | undefined): boolean {
  return hasAnyTruthyFact(facts, ['recommendation.selected']);
}

function hasProcessExplained(facts: ChatbotV3Facts | undefined): boolean {
  return hasAnyTruthyFact(facts, ['process.explained']);
}

function isSidePathIntent(intent: JourneyRuntimeAuthorityInput['proposal']['intent']): boolean {
  return intent === 'faq' || intent === 'resource';
}

function isExplicitRepeatExplainRequest(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  return /\b(?:again|repeat|another explanation|one more time)\b/i.test(message);
}

function hasAnyTruthyFact(facts: ChatbotV3Facts | undefined, keys: string[]): boolean {
  if (!facts) {
    return false;
  }

  return keys.some((key) => facts[key] === true);
}

function hasHandoffActive(facts: ChatbotV3Facts | undefined): boolean {
  return hasAnyTruthyFact(facts, ['handoff.active']);
}
