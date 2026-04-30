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
  if (input.event.target === 'medical_advice') {
    return { skillId: 'medical_advice_skill', sectionTarget: 'medical_advice' };
  }

  if (input.event.target === 'service_scope' || input.turnPlan.primaryAction.type === 'REDIRECT') {
    return { skillId: 'service_scope_skill', sectionTarget: input.event.target ?? 'service_scope' };
  }

  if (input.turnPlan.primaryAction.type === 'CLARIFY' || input.event.eventType === 'USER_MESSAGE_UNCLEAR') {
    return clarificationRoute();
  }

  if (input.turnPlan.primaryAction.type === 'ESCALATE' || input.event.eventType === 'USER_REQUESTED_HUMAN') {
    return { skillId: 'handoff_skill', sectionTarget: 'handoff' };
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
    case 'payment':
      return { skillId: 'payment_skill', sectionTarget: 'payment' };
    case 'travel':
      return { skillId: 'travel_skill', sectionTarget: 'travel' };
    case 'sales':
      return { skillId: 'sales_skill', sectionTarget: 'sales' };
    case 'faq':
      return { skillId: 'faq_skill', sectionTarget: 'faq' };
    case 'service_scope':
      return { skillId: 'service_scope_skill', sectionTarget: 'service_scope' };
    case 'policy':
      return { skillId: 'policy_skill', sectionTarget: 'policy' };
    case 'medical_advice':
    case 'medical_facts':
    case 'minimal_triage':
      return { skillId: 'medical_advice_skill', sectionTarget: 'medical_advice' };
    case 'treatment':
    case 'documents':
      return { skillId: 'treatment_skill', sectionTarget: 'treatment' };
    case 'process':
    case 'next_step':
      return { skillId: 'policy_skill', sectionTarget: 'policy' };
    case 'recommendation':
    case 'preference':
    case 'hospital':
    case 'hospital_selection':
      return { skillId: 'hospital_skill', sectionTarget: 'hospital' };
    case 'consult':
      return { skillId: 'faq_skill', sectionTarget: 'consult' };
    case 'handoff':
    case 'human':
    case 'contact':
      return { skillId: 'handoff_skill', sectionTarget: 'handoff' };
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
