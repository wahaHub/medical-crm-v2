import type { AiChatJourneyPhase, ChatJourneyStage } from '@medical-crm/domain';
import {
  CHATBOT_V3_JOURNEY_STAGES,
  type ChatbotV3DispatchAgent,
  type ChatbotV3Facts,
  hasChatbotV3RecommendationSelected,
  hasChatbotV3MinimalTriageComplete,
  type JourneyRuntimeAuthorityDecision,
  type JourneyRuntimeAuthorityInput,
  type JourneyRuntimeAuthorityWrite,
  resolveChatbotV3DispatchAgent,
  resolveChatbotV3ProposalDispatchAgent,
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
        if (!hasChatbotV3MinimalTriageComplete(input)) {
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
          dispatchAgent: resolveExplainProcessDispatchAgent(input),
          reason: input.proposal.reason,
          factsPatch: {
            'process.explained': true,
          },
        });
      case 'ONLINE_CONSULT':
        if (!canAdvanceToConsult(input)) {
          return denyDecision(
            input,
            'Online consult requires selected recommendation, process explanation, and at least one supporting document',
          );
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
  dispatchAgent?: ChatbotV3DispatchAgent | null;
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
    dispatch: {
      outcome: 'ALLOW',
      agent: dispatchAgent ?? null,
    },
      write: {
        authority: 'journey-runtime-authority',
        stage: {
          stage,
          phase: 'active',
        },
        journeyCurrentStage: stage,
        journeyCurrentPhase: 'active',
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
      journeyCurrentStage: input.current.stage,
      journeyCurrentPhase: normalizePersistedJourneyPhase(
        input.journeyCurrentPhase ?? input.current.phase,
      ),
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

function normalizePersistedJourneyPhase(
  phase: JourneyRuntimeAuthorityInput['journeyCurrentPhase'] | JourneyRuntimeAuthorityInput['current']['phase'],
): AiChatJourneyPhase {
  return phase === 'post' ? 'post' : 'active';
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
    return true;
  }

  if (hasProcessExplained(input.facts)) {
    return false;
  }

  if (isPostRecommendationStage(input.current.stage)) {
    return true;
  }

  return hasChatbotV3RecommendationSelected(input);
}

function resolveCanonicalDispatchAgent(stage: ChatJourneyStage): ChatbotV3DispatchAgent {
  const dispatchAgent = resolveChatbotV3DispatchAgent(stage);
  if (!dispatchAgent) {
    throw new Error(`Unable to resolve canonical dispatch agent for stage ${stage}`);
  }
  return dispatchAgent;
}

function resolveExplainProcessDispatchAgent(
  input: JourneyRuntimeAuthorityInput,
): ChatbotV3DispatchAgent | null {
  const dispatchAgent = resolveChatbotV3ProposalDispatchAgent({
    intent: input.proposal.intent,
    suggestedStage: input.proposal.suggestedStage,
    dispatchAgent: input.proposal.dispatchAgent,
  });

  return dispatchAgent;
}

function canCollectMedicalInputs(input: JourneyRuntimeAuthorityInput): boolean {
  if (input.current.stage === 'COLLECT_MEDICAL_INPUTS') {
    return true;
  }

  return hasChatbotV3RecommendationSelected(input) && hasProcessExplained(input.facts);
}

function canAdvanceToConsult(input: JourneyRuntimeAuthorityInput): boolean {
  return hasChatbotV3RecommendationSelected(input)
    && hasProcessExplained(input.facts)
    && hasSupportingDocuments(input.supportingDocuments);
}

function isPostRecommendationStage(stage: ChatJourneyStage): boolean {
  return CHATBOT_V3_JOURNEY_STAGES.indexOf(stage) >= CHATBOT_V3_JOURNEY_STAGES.indexOf('RECOMMENDATION');
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

function hasSupportingDocuments(
  supportingDocuments: JourneyRuntimeAuthorityInput['supportingDocuments'],
): boolean {
  return Array.isArray(supportingDocuments) && supportingDocuments.length > 0;
}
