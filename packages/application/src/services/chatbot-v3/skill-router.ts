import type { AgentRole } from './agent-resolver.js';
import type { DomainFacts, SupervisorEvent, SupervisorEventTarget, TurnPlan } from './supervisor-event.types.js';
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
    route: SkillRoute,
    role: DomainSkillRequest['role'],
    reasonCode: string,
  ) => {
    if (requests.length >= 2 || requests.some((request) => request.skillId === route.skillId)) {
      return;
    }

    requests.push({
      skillId: route.skillId,
      role,
      reasonCode,
      sectionHints: {
        eventType: input.event.eventType,
        target: route.sectionTarget,
        modifier: input.event.modifier ?? 'unknown',
        primaryActionType: input.turnPlan.primaryAction.type,
        ...(input.turnPlan.followUpAction && input.turnPlan.followUpAction.type !== 'NONE'
          ? { followUpActionType: input.turnPlan.followUpAction.type }
          : {}),
      },
    });
  };

  add(primaryRouteFor(input), 'primary', reasonCodeForPrimaryAction(input.turnPlan));

  const followUpAction = input.turnPlan.followUpAction;
  const auxiliaryRoute = routeForFollowUpAction(followUpAction);
  if (auxiliaryRoute && followUpAction) {
    add(auxiliaryRoute, 'auxiliary', reasonCodeForFollowUpAction(followUpAction));
  }

  return {
    requests,
    maxSkillSnippets: 6,
  };
}

interface SkillRoute {
  skillId: DomainSkillId;
  sectionTarget: SupervisorEventTarget;
}

function primaryRouteFor(input: {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  agentRole: AgentRole;
  facts: DomainFacts;
}): SkillRoute {
  if (
    input.event.eventType === 'USER_ASKED_RISKY_MEDICAL_ADVICE'
    || input.event.eventType === 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE'
    || input.turnPlan.primaryAction.type === 'REDIRECT'
  ) {
    return { skillId: 'safety_scope_skill', sectionTarget: input.event.target ?? 'unknown' };
  }

  if (input.turnPlan.primaryAction.type === 'CLARIFY' || input.event.eventType === 'USER_MESSAGE_UNCLEAR') {
    return { skillId: 'clarification_recovery_skill', sectionTarget: input.event.target ?? 'unknown' };
  }

  if (input.turnPlan.primaryAction.type === 'ESCALATE' || input.event.eventType === 'USER_REQUESTED_HUMAN') {
    return { skillId: 'human_handoff_skill', sectionTarget: 'human' };
  }

  const actionTarget = 'target' in input.turnPlan.primaryAction
    ? input.turnPlan.primaryAction.target
    : undefined;
  const eventRoute = input.event.target && input.event.target !== 'unknown'
    ? routeForTarget(input.event.target)
    : null;
  return eventRoute ?? routeForTarget(actionTarget) ?? clarificationRoute();
}

function routeForFollowUpAction(followUpAction: TurnPlan['followUpAction']): SkillRoute | null {
  if (!followUpAction || followUpAction.type === 'NONE') {
    return null;
  }

  return routeForTarget(followUpAction.target);
}

function routeForTarget(target: string | undefined): SkillRoute | null {
  switch (target) {
    case 'pricing':
      return { skillId: 'pricing_skill', sectionTarget: 'pricing' };
    case 'documents':
      return { skillId: 'documents_skill', sectionTarget: 'documents' };
    case 'medical_facts':
    case 'minimal_triage':
      return { skillId: 'documents_skill', sectionTarget: 'medical_facts' };
    case 'process':
      return { skillId: 'process_skill', sectionTarget: 'process' };
    case 'next_step':
      return { skillId: 'process_skill', sectionTarget: 'next_step' };
    case 'travel':
      return { skillId: 'process_skill', sectionTarget: 'travel' };
    case 'payment':
      return { skillId: 'process_skill', sectionTarget: 'payment' };
    case 'recommendation':
      return { skillId: 'hospital_recommendation_skill', sectionTarget: 'recommendation' };
    case 'preference':
      return { skillId: 'hospital_recommendation_skill', sectionTarget: 'recommendation' };
    case 'hospital':
      return { skillId: 'hospital_recommendation_skill', sectionTarget: 'hospital' };
    case 'hospital_selection':
      return { skillId: 'hospital_recommendation_skill', sectionTarget: 'hospital_selection' };
    case 'consult':
      return { skillId: 'consult_skill', sectionTarget: 'consult' };
    case 'human':
      return { skillId: 'human_handoff_skill', sectionTarget: 'human' };
    case 'contact':
      return { skillId: 'human_handoff_skill', sectionTarget: 'contact' };
    case 'unknown':
    default:
      return null;
  }
}

function clarificationRoute(): SkillRoute {
  return { skillId: 'clarification_recovery_skill', sectionTarget: 'unknown' };
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
