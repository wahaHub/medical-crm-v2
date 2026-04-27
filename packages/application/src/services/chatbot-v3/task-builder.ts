import type { ResolvedAgent } from './agent-resolver.js';
import type { ReadPlan } from './read-planner.js';
import type { LoadedSkillPack } from './skill-packs.js';
import type { DomainFacts, SupervisorEvent, TurnPlan } from './supervisor-event.types.js';

export interface ResponseContract {
  structure: 'answer_then_advance' | 'acknowledge_then_advance' | 'redirect_then_advance' | 'clarify_only' | 'notice_only';
  primaryMove: 'answer' | 'acknowledge' | 'clarify' | 'redirect' | 'present_options' | 'handle_objection' | 'escalate';
  followUpMove: 'invite_next_step' | 'go_deep' | 'ask_qualifying_question' | 'none';
  constraints: {
    maxQuestions: 0 | 1 | 2;
    preservePrimaryStage: boolean;
    answerBeforeAsk: boolean;
    avoidMultipleCTAs: boolean;
    language: string;
    tone: 'warm_professional' | 'calm_safety' | 'concise';
  };
  safetyRules: string[];
  forbiddenClaims?: string[];
}

export interface AgentTask {
  event: SupervisorEvent;
  primaryAction: TurnPlan['primaryAction'];
  followUpAction?: TurnPlan['followUpAction'];
  primaryStage: TurnPlan['primaryStage'];
  latestUserMessage: string;
  conversationSummary: string;
  knownFacts: DomainFacts;
  resolvedAgent: ResolvedAgent;
  skillPolicy: {
    allowedSkillPacks: string[];
    maxSkillSnippets: number;
  };
  loadedSkills: LoadedSkillPack[];
  readPlan: ReadPlan;
  retrievedContext?: {
    skillSnippets?: string[];
    knowledgeSnippets?: string[];
  };
  responseContract: ResponseContract;
}

export function buildAgentTask(input: {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  resolvedAgent: ResolvedAgent;
  latestUserMessage: string;
  conversationSummary: string;
  knownFacts: DomainFacts;
  loadedSkills: LoadedSkillPack[];
  readPlan: ReadPlan;
  retrievedContext?: AgentTask['retrievedContext'];
}): AgentTask {
  return {
    event: input.event,
    primaryAction: input.turnPlan.primaryAction,
    followUpAction: input.turnPlan.followUpAction,
    primaryStage: input.turnPlan.primaryStage,
    latestUserMessage: input.latestUserMessage,
    conversationSummary: input.conversationSummary,
    knownFacts: input.knownFacts,
    resolvedAgent: input.resolvedAgent,
    skillPolicy: {
      allowedSkillPacks: input.loadedSkills.map((skill) => skill.id),
      maxSkillSnippets: input.loadedSkills.length,
    },
    loadedSkills: input.loadedSkills,
    readPlan: input.readPlan,
    ...(input.retrievedContext ? { retrievedContext: input.retrievedContext } : {}),
    responseContract: buildResponseContract(input.turnPlan, input.knownFacts),
  };
}

function buildResponseContract(turnPlan: TurnPlan, facts: DomainFacts): ResponseContract {
  const primaryAction = turnPlan.primaryAction;
  const followUpAction = turnPlan.followUpAction;
  const followUpMove = followUpAction?.type === 'INVITE_NEXT_STEP'
    ? 'invite_next_step'
    : followUpAction?.type === 'GO_DEEP'
      ? 'go_deep'
      : followUpAction?.type === 'ASK_QUALIFYING_QUESTION'
        ? 'ask_qualifying_question'
        : 'none';

  if (primaryAction.type === 'REDIRECT') {
    const safetyRules = primaryAction.reasonCode === 'medical_safety'
      ? ['do_not_diagnose', 'do_not_recommend_medication', 'do_not_guarantee_outcome']
      : ['do_not_claim_unsupported_service', 'redirect_to_medora_scope'];

    return contract({
      structure: 'redirect_then_advance',
      primaryMove: 'redirect',
      followUpMove,
      facts,
      preservePrimaryStage: true,
      safetyRules,
      tone: primaryAction.reasonCode === 'medical_safety' ? 'calm_safety' : 'warm_professional',
    });
  }

  if (primaryAction.type === 'CLARIFY') {
    return contract({
      structure: 'clarify_only',
      primaryMove: 'clarify',
      followUpMove: 'none',
      facts,
      preservePrimaryStage: true,
      maxQuestions: 1,
    });
  }

  if (primaryAction.type === 'ANSWER') {
    return contract({
      structure: followUpMove === 'none' ? 'notice_only' : 'answer_then_advance',
      primaryMove: 'answer',
      followUpMove,
      facts,
      preservePrimaryStage: Boolean(turnPlan.sidePath?.primaryStagePreserved),
      answerBeforeAsk: true,
      maxQuestions: followUpMove === 'none' ? 0 : 1,
    });
  }

  if (primaryAction.type === 'HANDLE_RESPONSE') {
    return contract({
      structure: 'acknowledge_then_advance',
      primaryMove: 'handle_objection',
      followUpMove,
      facts,
      preservePrimaryStage: true,
      maxQuestions: 1,
    });
  }

  return contract({
    structure: 'notice_only',
    primaryMove: primaryAction.type === 'ESCALATE'
      ? 'escalate'
      : primaryAction.type === 'PRESENT_OPTIONS'
        ? 'present_options'
        : 'acknowledge',
    followUpMove,
    facts,
    preservePrimaryStage: false,
  });
}

function contract(input: {
  structure: ResponseContract['structure'];
  primaryMove: ResponseContract['primaryMove'];
  followUpMove: ResponseContract['followUpMove'];
  facts: DomainFacts;
  preservePrimaryStage: boolean;
  safetyRules?: string[];
  forbiddenClaims?: string[];
  answerBeforeAsk?: boolean;
  maxQuestions?: 0 | 1 | 2;
  tone?: ResponseContract['constraints']['tone'];
}): ResponseContract {
  return {
    structure: input.structure,
    primaryMove: input.primaryMove,
    followUpMove: input.followUpMove,
    constraints: {
      maxQuestions: input.maxQuestions ?? 1,
      preservePrimaryStage: input.preservePrimaryStage,
      answerBeforeAsk: input.answerBeforeAsk ?? false,
      avoidMultipleCTAs: true,
      language: input.facts.language ?? 'zh',
      tone: input.tone ?? 'warm_professional',
    },
    safetyRules: input.safetyRules ?? [],
    ...(input.forbiddenClaims ? { forbiddenClaims: input.forbiddenClaims } : {}),
  };
}
