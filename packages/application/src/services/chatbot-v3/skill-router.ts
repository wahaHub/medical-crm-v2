import type { AgentRole } from './agent-resolver.js';
import type { DomainFacts, SupervisorEvent, TurnPlan } from './supervisor-event.types.js';
import type { SkillPackId, SkillRequest } from './skill-packs.js';

export interface SkillPolicy {
  requests: SkillRequest[];
  maxSkillSnippets: number;
}

export function buildSkillPolicy(input: {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  agentRole: AgentRole;
  facts: DomainFacts;
}): SkillPolicy {
  const requests: SkillRequest[] = [];
  const add = (skillPackId: SkillPackId, reasonCode: string) => {
    if (!requests.some((request) => request.skillPackId === skillPackId)) {
      requests.push({ skillPackId, reasonCode });
    }
  };

  addSkillsByPrimaryAction(add, input.turnPlan.primaryAction);
  addSkillsByFollowUpAction(add, input.turnPlan.followUpAction);
  addSkillsByEvent(add, input.event);
  addSkillsByAgentRole(add, input.agentRole);

  return {
    requests,
    maxSkillSnippets: 6,
  };
}

function addSkillsByPrimaryAction(
  add: (skillPackId: SkillPackId, reasonCode: string) => void,
  action: TurnPlan['primaryAction'],
) {
  switch (action.type) {
    case 'ANSWER':
      if (action.target === 'pricing') {
        add('search_general_faq_by_category', 'answer_pricing_question');
        add('answer_general_faq_from_admin_source', 'answer_pricing_question');
        add('explain_pricing_uncertainty', 'answer_pricing_question');
      }
      if (action.target === 'process') {
        add('load_process_policy', 'answer_process_question');
        add('explain_medora_process', 'answer_process_question');
      }
      if (action.target === 'documents') {
        add('load_records_requirement_data', 'answer_documents_question');
        add('explain_records_preparation', 'answer_documents_question');
      }
      if (action.target === 'travel' || action.target === 'payment') {
        add('search_general_faq_by_category', 'answer_travel_or_payment_question');
        add('answer_general_faq_from_admin_source', 'answer_travel_or_payment_question');
        add('explain_travel_or_payment_scope', 'answer_travel_or_payment_question');
      }
      if (action.target === 'hospital' || action.target === 'hospital_selection') {
        add('search_hospital_faq_by_category', 'answer_hospital_question');
        add('answer_hospital_faq_from_admin_source', 'answer_hospital_question');
        add('explain_hospital_selection_logic', 'answer_hospital_question');
      }
      if (action.target === 'consult') {
        add('search_general_faq_by_category', 'answer_consult_question');
        add('answer_general_faq_from_admin_source', 'answer_consult_question');
        add('load_consult_readiness_criteria', 'answer_consult_question');
        add('explain_online_consult', 'answer_consult_question');
      }
      return;
    case 'REQUEST_INFO':
      if (action.target === 'documents' || action.target === 'medical_facts' || action.target === 'minimal_triage') {
        add('load_records_requirement_data', 'request_records_owned_info');
        add('explain_records_preparation', 'request_records_owned_info');
      }
      return;
    case 'PRESENT_OPTIONS':
      if (action.target === 'hospital') {
        add('search_hospital_candidates', 'present_hospital_options');
        add('search_doctor_matching_context', 'present_hospital_options');
        add('explain_hospital_selection_logic', 'present_hospital_options');
      } else {
        add('load_consult_readiness_criteria', 'present_consult_options');
        add('explain_online_consult', 'present_consult_options');
      }
      return;
    case 'REDIRECT':
      add(action.reasonCode === 'medical_safety' ? 'medical_safety_boundary' : 'service_scope_boundary', action.reasonCode);
      add('safe_degradation_when_uncertain', action.reasonCode);
      return;
    case 'HANDLE_RESPONSE':
      if (action.target === 'documents') {
        add('handle_document_hesitation', 'handle_documents_objection');
      }
      if (action.target === 'contact') {
        add('handle_contact_hesitation', 'handle_contact_objection');
      }
      if (action.target === 'pricing') {
        add('handle_price_objection', 'handle_price_objection');
      }
      add('low_friction_alternative_step', 'handle_response_to_request');
      return;
    case 'ESCALATE':
      add('build_handoff_payload_context', 'human_escalation');
      add('soft_human_handoff', 'human_escalation');
      return;
    case 'CLARIFY':
      add('clarify_ambiguous_reply', action.reasonCode);
      return;
    case 'ACKNOWLEDGE':
      return;
  }
}

function addSkillsByFollowUpAction(
  add: (skillPackId: SkillPackId, reasonCode: string) => void,
  followUpAction: TurnPlan['followUpAction'],
) {
  if (!followUpAction) {
    return;
  }

  if (followUpAction.type === 'INVITE_NEXT_STEP' && followUpAction.target === 'documents') {
    add('load_records_requirement_data', 'followup_invite_documents');
    add('explain_records_preparation', 'followup_invite_documents');
  }

  if (followUpAction.type === 'GO_DEEP') {
    if (followUpAction.target === 'consult') {
      add('load_consult_readiness_criteria', 'followup_go_deep_consult');
      add('explain_online_consult', 'followup_go_deep_consult');
    }
    if (followUpAction.target === 'hospital') {
      add('search_hospital_faq_by_category', 'followup_go_deep_hospital');
      add('explain_hospital_selection_logic', 'followup_go_deep_hospital');
    }
  }
}

function addSkillsByEvent(
  add: (skillPackId: SkillPackId, reasonCode: string) => void,
  event: SupervisorEvent,
) {
  if (event.eventType === 'DOCUMENTS_UPLOADED' || event.target === 'documents') {
    add('derive_record_inventory_candidate', 'document_or_record_event');
  }

  if (event.eventType === 'USER_PROVIDED_INFORMATION' && event.target === 'medical_facts') {
    add('extract_medical_facts_candidate', 'medical_facts_provided');
  }

  if (event.eventType === 'USER_PROVIDED_INFORMATION' && event.target === 'contact') {
    add('extract_contact_info_candidate', 'contact_info_provided');
    add('build_handoff_payload_context', 'contact_info_provided');
    add('soft_human_handoff', 'contact_info_provided');
  }
}

function addSkillsByAgentRole(
  add: (skillPackId: SkillPackId, reasonCode: string) => void,
  agentRole: AgentRole,
) {
  if (agentRole === 'RecommendationAgent') {
    add('trust_building_for_medical_travel', 'recommendation_agent_context');
  }
  if (agentRole === 'HandoffAgent') {
    add('soft_human_handoff', 'handoff_agent_context');
  }
}
