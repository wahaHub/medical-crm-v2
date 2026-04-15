import type { ChatJourneyPhase, ChatJourneyStage } from '@medical-crm/domain';
import {
  CHATBOT_V3_JOURNEY_STAGES,
  type ChatbotV3PolicyConfig,
  type ChatbotV3PolicyConfigInput,
  type ChatbotV3StagePrerequisite,
  type ChatbotV3StagePrerequisites,
} from './types.js';
import { parsePolicyConfig } from './policy-config.service.js';

export type OrchestratorV3Intent =
  | 'faq'
  | 'progression'
  | 'resource'
  | 'consult'
  | 'handoff'
  | 'unknown';

export type OrchestratorV3DispatchAgent =
  | 'FaqAgent'
  | 'RecordsAgent'
  | 'RecommendationAgent'
  | 'ConsultAgent'
  | 'HandoffAgent';

export interface OrchestratorV3StageRef {
  stage: ChatJourneyStage;
  phase: ChatJourneyPhase;
}

export interface OrchestratorV3Suggestion {
  intent: OrchestratorV3Intent;
  suggestedStage: ChatJourneyStage;
  reason: string;
}

export interface OrchestratorV3HandoffSignals {
  userRequestedHuman?: boolean;
  consecutiveCriticalToolFailures?: number;
  safetyPolicyHit?: boolean;
}

export type OrchestratorV3Facts = Record<string, boolean | number | string | null | undefined>;

export interface OrchestratorV3DecisionInput {
  current: OrchestratorV3StageRef;
  suggestion: OrchestratorV3Suggestion;
  facts?: OrchestratorV3Facts;
  handoff?: OrchestratorV3HandoffSignals;
}

export interface OrchestratorV3Decision {
  action: 'STAY' | 'ADVANCE' | 'SKIP' | 'HANDOFF';
  from: OrchestratorV3StageRef;
  to: OrchestratorV3StageRef;
  dispatchAgent?: OrchestratorV3DispatchAgent;
  dispatchSource: 'orchestrator';
  matchedRuleId?: string;
  whyNotSkip?: string;
}

export class OrchestratorV3Service {
  private readonly config: ChatbotV3PolicyConfig;

  constructor(configInput: ChatbotV3PolicyConfigInput = {}) {
    this.config = parsePolicyConfig(configInput);
  }

  decide(input: OrchestratorV3DecisionInput): OrchestratorV3Decision {
    const current = cloneStageRef(input.current);
    const targetStage = input.suggestion.suggestedStage;
    const facts = input.facts ?? {};

    if (hitsHandoffHardPolicy(input.handoff, this.config)) {
      return this.handoff(current);
    }

    if (isSemanticHandoffSuggestion(input.suggestion)) {
      if (violatesFactConditions(this.config.globalPolicies.handoffPrerequisites, facts)) {
        return stay(
          current,
          `Semantic handoff blocked by handoffPrerequisites: ${
            describeFactConditionViolations(this.config.globalPolicies.handoffPrerequisites, facts).join(', ')
          }`,
          null,
        );
      }

      return this.handoff(current);
    }

    if (hitsExplainGate(current, targetStage, this.config)) {
      return stay(current, `EXPLAIN_PROCESS must complete before ${targetStage}`);
    }

    if (violatesStagePrerequisites(targetStage, this.config.stagePrerequisites, facts)) {
      return stay(
        current,
        `Missing prerequisites for ${targetStage}: ${
          describeFactConditionViolations(this.config.stagePrerequisites[targetStage], facts).join(', ')
        }`,
      );
    }

    const action = deriveAction(current.stage, targetStage);
    if (action === 'SKIP') {
      const matchedRule = findMatchingJumpRule(current.stage, targetStage, this.config.jumpRules);
      if (!matchedRule) {
        return stay(current, `No jump rule matched for ${current.stage} -> ${targetStage}`);
      }

      return {
        action,
        from: current,
        to: {
          stage: targetStage,
          phase: 'active',
        },
        dispatchAgent: resolveDispatchAgent(targetStage),
        dispatchSource: 'orchestrator',
        matchedRuleId: matchedRule.id,
      };
    }

    const to: OrchestratorV3StageRef = action === 'STAY'
      ? current
      : {
          stage: targetStage,
          phase: 'active',
        };

    return {
      action,
      from: current,
      to,
      dispatchAgent: resolveDispatchAgent(to.stage),
      dispatchSource: 'orchestrator',
    };
  }

  private handoff(from: OrchestratorV3StageRef): OrchestratorV3Decision {
    return {
      action: 'HANDOFF',
      from,
      to: {
        stage: 'HUMAN_HANDOFF',
        phase: 'active',
      },
      dispatchAgent: 'HandoffAgent',
      dispatchSource: 'orchestrator',
    };
  }
}

function cloneStageRef(stageRef: OrchestratorV3StageRef): OrchestratorV3StageRef {
  return {
    stage: stageRef.stage,
    phase: stageRef.phase,
  };
}

function stay(
  from: OrchestratorV3StageRef,
  whyNotSkip: string,
  dispatchAgent: OrchestratorV3DispatchAgent | null = resolveDispatchAgent(from.stage),
): OrchestratorV3Decision {
  return {
    action: 'STAY',
    from,
    to: cloneStageRef(from),
    ...(dispatchAgent ? { dispatchAgent } : {}),
    dispatchSource: 'orchestrator',
    whyNotSkip,
  };
}

function hitsHandoffHardPolicy(
  handoff: OrchestratorV3HandoffSignals | undefined,
  config: ChatbotV3PolicyConfig,
): boolean {
  if (!handoff) {
    return false;
  }

  const triggers = config.globalPolicies.handoffTriggers;

  if (triggers.userRequestedHuman && handoff.userRequestedHuman) {
    return true;
  }

  if (triggers.safetyPolicyHit && handoff.safetyPolicyHit) {
    return true;
  }

  return (handoff.consecutiveCriticalToolFailures ?? 0) >= triggers.consecutiveCriticalToolFailures;
}

function hitsExplainGate(
  current: OrchestratorV3StageRef,
  targetStage: ChatJourneyStage,
  config: ChatbotV3PolicyConfig,
): boolean {
  return current.stage === 'EXPLAIN_PROCESS'
    && current.phase !== 'post'
    && targetStage !== 'EXPLAIN_PROCESS'
    && config.globalPolicies.forceExplainProcessBefore.includes(targetStage);
}

function violatesStagePrerequisites(
  targetStage: ChatJourneyStage,
  stagePrerequisites: ChatbotV3StagePrerequisites,
  facts: OrchestratorV3Facts,
): boolean {
  const prerequisite = stagePrerequisites[targetStage];

  if (!prerequisite) {
    return false;
  }

  return !matchesFactConditions(prerequisite, facts);
}

function isSemanticHandoffSuggestion(suggestion: OrchestratorV3Suggestion): boolean {
  return suggestion.intent === 'handoff' || suggestion.suggestedStage === 'HUMAN_HANDOFF';
}

function isTruthyFact(value: OrchestratorV3Facts[string]): boolean {
  return Boolean(value);
}

function deriveAction(currentStage: ChatJourneyStage, targetStage: ChatJourneyStage): OrchestratorV3Decision['action'] {
  if (currentStage === targetStage) {
    return 'STAY';
  }

  const currentIndex = CHATBOT_V3_JOURNEY_STAGES.indexOf(currentStage);
  const targetIndex = CHATBOT_V3_JOURNEY_STAGES.indexOf(targetStage);

  if (currentIndex >= 0 && targetIndex >= 0 && targetIndex - currentIndex === 1) {
    return 'ADVANCE';
  }

  return 'SKIP';
}

function findMatchingJumpRule(
  currentStage: ChatJourneyStage,
  targetStage: ChatJourneyStage,
  jumpRules: ChatbotV3PolicyConfig['jumpRules'],
): ChatbotV3PolicyConfig['jumpRules'][number] | undefined {
  return jumpRules
    .filter((rule) => rule.fromStage === currentStage && rule.toStage === targetStage)
    .sort((left, right) => right.priority - left.priority)[0];
}

function matchesFactConditions(
  ruleLike: ChatbotV3StagePrerequisite,
  facts: OrchestratorV3Facts,
): boolean {
  if (ruleLike.requiresAll?.some((factKey) => !isTruthyFact(facts[factKey]))) {
    return false;
  }

  if (ruleLike.requiresAny && ruleLike.requiresAny.length > 0) {
    const hasAnyRequirement = ruleLike.requiresAny.some((factKey) => isTruthyFact(facts[factKey]));
    if (!hasAnyRequirement) {
      return false;
    }
  }

  return !(ruleLike.denyIfAny?.some((factKey) => isTruthyFact(facts[factKey])) ?? false);
}

function violatesFactConditions(
  ruleLike: ChatbotV3StagePrerequisite | undefined,
  facts: OrchestratorV3Facts,
): boolean {
  if (!ruleLike) {
    return false;
  }

  return !matchesFactConditions(ruleLike, facts);
}

function describeFactConditionViolations(
  ruleLike: ChatbotV3StagePrerequisite | undefined,
  facts: OrchestratorV3Facts,
): string[] {
  if (!ruleLike) {
    return [];
  }

  const violations: string[] = [];

  if (ruleLike.requiresAll) {
    for (const factKey of ruleLike.requiresAll) {
      if (!isTruthyFact(facts[factKey])) {
        violations.push(factKey);
      }
    }
  }

  if (ruleLike.requiresAny && ruleLike.requiresAny.length > 0) {
    const hasAnyRequirement = ruleLike.requiresAny.some((factKey) => isTruthyFact(facts[factKey]));
    if (!hasAnyRequirement) {
      violations.push(`any of [${ruleLike.requiresAny.join(', ')}]`);
    }
  }

  if (ruleLike.denyIfAny) {
    for (const factKey of ruleLike.denyIfAny) {
      if (isTruthyFact(facts[factKey])) {
        violations.push(factKey);
      }
    }
  }

  return violations;
}

function resolveDispatchAgent(stage: ChatJourneyStage): OrchestratorV3DispatchAgent {
  switch (stage) {
    case 'EXPLAIN_PROCESS':
      return 'FaqAgent';
    case 'COLLECT_MEDICAL_INPUTS':
      return 'RecordsAgent';
    case 'RECOMMENDATION':
      return 'RecommendationAgent';
    case 'ONLINE_CONSULT':
      return 'ConsultAgent';
    case 'HUMAN_HANDOFF':
      return 'HandoffAgent';
  }
}
