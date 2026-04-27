import type { DomainFacts, SupervisorEvent, TurnPlan } from './supervisor-event.types.js';

export type AgentRole =
  | 'GeneralResponseAgent'
  | 'RecordsAgent'
  | 'RecommendationAgent'
  | 'ConsultAgent'
  | 'HandoffAgent';

export type PhysicalAgent =
  | 'FaqAgent'
  | 'RecordsAgent'
  | 'RecommendationAgent'
  | 'ConsultAgent'
  | 'HandoffAgent';

export interface ResolvedAgent {
  conceptualRole: AgentRole;
  physicalAgent: PhysicalAgent;
  reasonCode: string;
}

export function resolveAgent(input: {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  facts: DomainFacts;
}): ResolvedAgent {
  const { event, turnPlan } = input;
  const action = turnPlan.primaryAction;
  const followUpAction = turnPlan.followUpAction;

  if (action.type === 'ESCALATE' && action.target === 'human') {
    return handoff('primary_action_escalate_human');
  }

  if (action.type === 'REDIRECT') {
    return general('redirect_language_boundary');
  }

  if (event.eventType === 'DOCUMENTS_UPLOADED') {
    return records('documents_uploaded_side_effect_first');
  }

  if (action.type === 'REQUEST_INFO'
    && ['minimal_triage', 'medical_facts', 'documents'].includes(action.target)) {
    return records('request_info_records_owned_target');
  }

  if (event.eventType === 'USER_PROVIDED_INFORMATION'
    && (event.target === 'medical_facts' || event.target === 'documents')) {
    return records('provided_records_or_medical_facts');
  }

  if (action.type === 'PRESENT_OPTIONS' && action.target === 'hospital') {
    return recommendation('present_hospital_options');
  }

  if (event.target === 'recommendation'
    || event.target === 'hospital'
    || event.target === 'hospital_selection') {
    if (event.modifier === 'revisit'
      || action.type === 'PRESENT_OPTIONS'
      || followUpAction?.target === 'recommendation') {
      return recommendation('recommendation_or_hospital_revisit');
    }

    if (action.type === 'ANSWER' || followUpAction?.type === 'GO_DEEP') {
      return recommendation('hospital_or_selection_question');
    }
  }

  if ((action.type === 'PRESENT_OPTIONS' && action.target === 'consult')
    || (action.type === 'ANSWER' && action.target === 'consult')
    || (action.type === 'ACKNOWLEDGE' && event.target === 'consult')
    || (followUpAction?.type === 'GO_DEEP' && followUpAction.target === 'consult')
    || (followUpAction?.type === 'INVITE_NEXT_STEP' && followUpAction.target === 'consult')) {
    return consult('consult_followup_or_need');
  }

  return general('general_response_default');
}

function general(reasonCode: string): ResolvedAgent {
  return {
    conceptualRole: 'GeneralResponseAgent',
    physicalAgent: 'FaqAgent',
    reasonCode,
  };
}

function records(reasonCode: string): ResolvedAgent {
  return {
    conceptualRole: 'RecordsAgent',
    physicalAgent: 'RecordsAgent',
    reasonCode,
  };
}

function recommendation(reasonCode: string): ResolvedAgent {
  return {
    conceptualRole: 'RecommendationAgent',
    physicalAgent: 'RecommendationAgent',
    reasonCode,
  };
}

function consult(reasonCode: string): ResolvedAgent {
  return {
    conceptualRole: 'ConsultAgent',
    physicalAgent: 'ConsultAgent',
    reasonCode,
  };
}

function handoff(reasonCode: string): ResolvedAgent {
  return {
    conceptualRole: 'HandoffAgent',
    physicalAgent: 'HandoffAgent',
    reasonCode,
  };
}
