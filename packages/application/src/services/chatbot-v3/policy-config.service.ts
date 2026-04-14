import {
  DEFAULT_POLICY,
  CHATBOT_V3_JOURNEY_STAGES,
  type ChatbotV3PolicyConfig,
  type ChatbotV3PolicyConfigInput,
  type ChatbotV3StagePrerequisite,
} from './types.js';
import type { ChatJourneyStage } from '@medical-crm/domain';

const CHATBOT_V3_JOURNEY_STAGE_SET: ReadonlySet<ChatJourneyStage> = new Set(CHATBOT_V3_JOURNEY_STAGES);

export function parsePolicyConfig(input: ChatbotV3PolicyConfigInput = {}): ChatbotV3PolicyConfig {
  const globalPolicies = input.globalPolicies ?? {};
  const handoffTriggers: Partial<ChatbotV3PolicyConfig['globalPolicies']['handoffTriggers']> =
    globalPolicies.handoffTriggers ?? {};
  const stagePrerequisites = input.stagePrerequisites ?? {};
  validateForceExplainProcessBefore(globalPolicies.forceExplainProcessBefore);
  validateStagePrerequisiteKeys(stagePrerequisites);
  const mergedStagePrerequisites: ChatbotV3PolicyConfig['stagePrerequisites'] = {};

  for (const stage of uniqueStageKeys(DEFAULT_POLICY.stagePrerequisites, stagePrerequisites)) {
    const defaultStagePrerequisite = DEFAULT_POLICY.stagePrerequisites[stage];
    const inputStagePrerequisite = stagePrerequisites[stage];
    const mergedStagePrerequisite = mergeStagePrerequisite(defaultStagePrerequisite, inputStagePrerequisite);

    if (mergedStagePrerequisite) {
      mergedStagePrerequisites[stage] = mergedStagePrerequisite;
    }
  }

  return {
    globalPolicies: {
      forceExplainProcessBefore: globalPolicies.forceExplainProcessBefore?.slice()
        ?? DEFAULT_POLICY.globalPolicies.forceExplainProcessBefore.slice(),
      handoffTriggers: {
        userRequestedHuman:
          handoffTriggers.userRequestedHuman
          ?? DEFAULT_POLICY.globalPolicies.handoffTriggers.userRequestedHuman,
        consecutiveCriticalToolFailures:
          handoffTriggers.consecutiveCriticalToolFailures
          ?? DEFAULT_POLICY.globalPolicies.handoffTriggers.consecutiveCriticalToolFailures,
        safetyPolicyHit:
          handoffTriggers.safetyPolicyHit
          ?? DEFAULT_POLICY.globalPolicies.handoffTriggers.safetyPolicyHit,
      },
    },
    stagePrerequisites: mergedStagePrerequisites,
    jumpRules: cloneJumpRules(input.jumpRules) ?? DEFAULT_POLICY.jumpRules.slice(),
  };
}

function mergeStagePrerequisite(
  defaultValue: ChatbotV3PolicyConfig['stagePrerequisites'][keyof ChatbotV3PolicyConfig['stagePrerequisites']] | undefined,
  inputValue: ChatbotV3PolicyConfig['stagePrerequisites'][keyof ChatbotV3PolicyConfig['stagePrerequisites']] | undefined,
) : ChatbotV3StagePrerequisite | undefined {
  if (!defaultValue && !inputValue) {
    return undefined;
  }

  const merged: ChatbotV3StagePrerequisite = {};

  const requiresAll = inputValue?.requiresAll ?? defaultValue?.requiresAll;
  if (requiresAll) {
    merged.requiresAll = requiresAll.slice();
  }

  const requiresAny = inputValue?.requiresAny ?? defaultValue?.requiresAny;
  if (requiresAny) {
    merged.requiresAny = requiresAny.slice();
  }

  const denyIfAny = inputValue?.denyIfAny ?? defaultValue?.denyIfAny;
  if (denyIfAny) {
    merged.denyIfAny = denyIfAny.slice();
  }

  return merged;
}

function uniqueStageKeys(
  defaults: ChatbotV3PolicyConfig['stagePrerequisites'],
  overrides: ChatbotV3PolicyConfig['stagePrerequisites'],
): Array<keyof ChatbotV3PolicyConfig['stagePrerequisites']> {
  return [...new Set([
    ...Object.keys(defaults).filter(isKnownJourneyStage),
    ...Object.keys(overrides).filter(isKnownJourneyStage),
  ])] as Array<keyof ChatbotV3PolicyConfig['stagePrerequisites']>;
}

function cloneJumpRules(
  jumpRules: ChatbotV3PolicyConfigInput['jumpRules'],
): ChatbotV3PolicyConfig['jumpRules'] | undefined {
  if (!jumpRules) {
    return undefined;
  }

  return jumpRules.map((rule) => ({
    ...rule,
    requiresAll: rule.requiresAll?.slice(),
    requiresAny: rule.requiresAny?.slice(),
    denyIfAny: rule.denyIfAny?.slice(),
  }));
}

function isKnownJourneyStage(value: string): value is keyof ChatbotV3PolicyConfig['stagePrerequisites'] {
  return CHATBOT_V3_JOURNEY_STAGE_SET.has(value as ChatJourneyStage);
}

function validateForceExplainProcessBefore(values?: readonly string[]): void {
  if (!values) {
    return;
  }

  for (const value of values) {
    if (!CHATBOT_V3_JOURNEY_STAGE_SET.has(value as ChatJourneyStage)) {
      throw new Error(`Invalid chatbot-v3 policy config: globalPolicies.forceExplainProcessBefore contains unknown stage "${value}"`);
    }
  }
}

function validateStagePrerequisiteKeys(
  stagePrerequisites: ChatbotV3PolicyConfigInput['stagePrerequisites'] | undefined,
): void {
  if (!stagePrerequisites) {
    return;
  }

  for (const stage of Object.keys(stagePrerequisites)) {
    if (!isKnownJourneyStage(stage)) {
      throw new Error(`Invalid chatbot-v3 policy config: stagePrerequisites contains unknown stage key "${stage}"`);
    }
  }
}
