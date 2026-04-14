import type { ChatJourneyStage } from '@medical-crm/domain';

export interface ChatbotV3JumpRule {
  id: string;
  priority: number;
  fromStage: ChatJourneyStage;
  toStage: ChatJourneyStage;
  requiresAll?: string[];
  requiresAny?: string[];
  denyIfAny?: string[];
}

export interface ChatbotV3GlobalPolicies {
  forceExplainProcessBefore: ChatJourneyStage[];
  handoffTriggers: {
    userRequestedHuman: boolean;
    consecutiveCriticalToolFailures: number;
    safetyPolicyHit: boolean;
  };
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
  globalPolicies?: Partial<ChatbotV3GlobalPolicies> & {
    handoffTriggers?: Partial<ChatbotV3GlobalPolicies['handoffTriggers']>;
  };
  stagePrerequisites?: ChatbotV3StagePrerequisites;
  jumpRules?: ChatbotV3JumpRule[];
}

export const DEFAULT_POLICY: ChatbotV3PolicyConfig = {
  globalPolicies: {
    forceExplainProcessBefore: ['RECOMMENDATION', 'ONLINE_CONSULT'],
    handoffTriggers: {
      userRequestedHuman: true,
      consecutiveCriticalToolFailures: 2,
      safetyPolicyHit: true,
    },
  },
  stagePrerequisites: {
    RECOMMENDATION: { requiresAll: ['records.saved'] },
    ONLINE_CONSULT: { requiresAll: ['recommendation.picked'] },
  },
  jumpRules: [],
};
