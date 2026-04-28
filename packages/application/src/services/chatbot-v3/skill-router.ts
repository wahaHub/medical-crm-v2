import type { AgentRole } from './agent-resolver.js';
import type { DomainFacts, SupervisorEvent, TurnPlan } from './supervisor-event.types.js';
import type { DomainSkillId, DomainSkillRequest } from './skill-packs.js';

export interface SkillPolicy {
  requests: DomainSkillRequest[];
  maxSkillSnippets: number;
}

export function buildSkillPolicy(input: {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  agentRole: AgentRole;
  facts: DomainFacts;
}): SkillPolicy {
  const requests: DomainSkillRequest[] = [];
  const add = (
    skillId: DomainSkillId,
    role: DomainSkillRequest['role'],
    reasonCode: string,
  ) => {
    if (requests.length >= 2 || requests.some((request) => request.skillId === skillId)) {
      return;
    }

    requests.push({
      skillId,
      role,
      reasonCode,
      sectionHints: {
        eventType: input.event.eventType,
        target: input.event.target ?? 'unknown',
        modifier: input.event.modifier ?? 'unknown',
        primaryActionType: input.turnPlan.primaryAction.type,
        ...(input.turnPlan.followUpAction && input.turnPlan.followUpAction.type !== 'NONE'
          ? { followUpActionType: input.turnPlan.followUpAction.type }
          : {}),
      },
    });
  };

  add(primarySkillFor(input), 'primary', reasonCodeForPrimaryAction(input.turnPlan));

  const followUpAction = input.turnPlan.followUpAction;
  const auxiliarySkill = skillForFollowUpAction(followUpAction);
  if (auxiliarySkill && followUpAction) {
    add(auxiliarySkill, 'auxiliary', reasonCodeForFollowUpAction(followUpAction));
  }

  return {
    requests,
    maxSkillSnippets: 6,
  };
}

function primarySkillFor(input: {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  agentRole: AgentRole;
  facts: DomainFacts;
}): DomainSkillId {
  if (
    input.event.eventType === 'USER_ASKED_RISKY_MEDICAL_ADVICE'
    || input.event.eventType === 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE'
    || input.turnPlan.primaryAction.type === 'REDIRECT'
  ) {
    return 'safety_scope_skill';
  }

  if (input.turnPlan.primaryAction.type === 'CLARIFY' || input.event.eventType === 'USER_MESSAGE_UNCLEAR') {
    return 'clarification_recovery_skill';
  }

  if (input.turnPlan.primaryAction.type === 'ESCALATE' || input.event.eventType === 'USER_REQUESTED_HUMAN') {
    return 'human_handoff_skill';
  }

  const actionTarget = 'target' in input.turnPlan.primaryAction
    ? input.turnPlan.primaryAction.target
    : undefined;
  return skillForTarget(actionTarget ?? input.event.target);
}

function skillForFollowUpAction(followUpAction: TurnPlan['followUpAction']): DomainSkillId | null {
  if (!followUpAction || followUpAction.type === 'NONE') {
    return null;
  }

  return skillForTarget(followUpAction.target);
}

function skillForTarget(target: string | undefined): DomainSkillId {
  switch (target) {
    case 'pricing':
      return 'pricing_skill';
    case 'documents':
    case 'medical_facts':
      return 'documents_skill';
    case 'process':
    case 'next_step':
    case 'travel':
    case 'payment':
      return 'process_skill';
    case 'recommendation':
    case 'hospital':
    case 'hospital_selection':
      return 'hospital_recommendation_skill';
    case 'consult':
      return 'consult_skill';
    case 'human':
    case 'contact':
      return 'human_handoff_skill';
    case 'unknown':
    default:
      return 'clarification_recovery_skill';
  }
}

function reasonCodeForPrimaryAction(turnPlan: TurnPlan): string {
  const action = turnPlan.primaryAction;
  if ('reasonCode' in action && action.reasonCode) {
    return action.reasonCode;
  }
  return turnPlan.reasonCode;
}

function reasonCodeForFollowUpAction(followUpAction: Exclude<TurnPlan['followUpAction'], undefined>): string {
  if (followUpAction.type === 'INVITE_NEXT_STEP') {
    return followUpAction.reason ?? 'followup_invite_next_step';
  }
  if ('reasonCode' in followUpAction && followUpAction.reasonCode) {
    return followUpAction.reasonCode;
  }
  return `followup_${followUpAction.type.toLowerCase()}`;
}
