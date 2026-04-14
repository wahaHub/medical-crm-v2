import {
  DEFAULT_POLICY,
  type ChatbotV3PolicyConfig,
  type ChatbotV3PolicyConfigInput,
  type ChatbotV3StagePrerequisite,
} from './types.js';

export function parsePolicyConfig(input: ChatbotV3PolicyConfigInput = {}): ChatbotV3PolicyConfig {
  const globalPolicies = input.globalPolicies ?? {};
  const handoffTriggers: Partial<ChatbotV3PolicyConfig['globalPolicies']['handoffTriggers']> =
    globalPolicies.handoffTriggers ?? {};
  const stagePrerequisites = input.stagePrerequisites ?? {};
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
    jumpRules: input.jumpRules?.slice() ?? DEFAULT_POLICY.jumpRules.slice(),
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
  return [...new Set([...Object.keys(defaults), ...Object.keys(overrides)])] as Array<
    keyof ChatbotV3PolicyConfig['stagePrerequisites']
  >;
}
