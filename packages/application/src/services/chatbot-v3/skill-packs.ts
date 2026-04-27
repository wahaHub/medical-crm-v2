export type SkillKind =
  | 'retrieval_strategy'
  | 'extraction_strategy'
  | 'payload_strategy'
  | 'degradation_policy'
  | 'boundary_policy'
  | 'explanation_method'
  | 'sales_playbook';

export type SkillPackId =
  | 'clarify_ambiguous_reply'
  | 'service_scope_boundary'
  | 'medical_safety_boundary'
  | 'safe_degradation_when_uncertain'
  | 'search_general_faq_by_category'
  | 'answer_general_faq_from_admin_source'
  | 'search_hospital_faq_by_category'
  | 'answer_hospital_faq_from_admin_source'
  | 'load_medora_service_scope'
  | 'load_pricing_factors'
  | 'load_process_policy'
  | 'load_travel_support_scope'
  | 'load_payment_policy'
  | 'load_records_requirement_data'
  | 'search_hospital_candidates'
  | 'search_doctor_matching_context'
  | 'load_consult_readiness_criteria'
  | 'extract_medical_facts_candidate'
  | 'derive_record_inventory_candidate'
  | 'extract_contact_info_candidate'
  | 'build_handoff_payload_context'
  | 'explain_pricing_uncertainty'
  | 'explain_medora_process'
  | 'explain_records_preparation'
  | 'explain_online_consult'
  | 'explain_travel_or_payment_scope'
  | 'handle_price_objection'
  | 'handle_document_hesitation'
  | 'handle_contact_hesitation'
  | 'low_friction_alternative_step'
  | 'trust_building_for_medical_travel'
  | 'soft_human_handoff'
  | 'revisit_recommendation_step'
  | 'compare_recommendation_options'
  | 'explain_hospital_selection_logic';

export interface SkillPackDefinition {
  id: SkillPackId;
  kind: SkillKind;
  description: string;
}

export interface SkillRequest {
  skillPackId: SkillPackId;
  reasonCode: string;
}

export type LoadedSkillPack = SkillPackDefinition & {
  reasonCodes: string[];
};

function skill(id: SkillPackId, kind: SkillKind, description: string): SkillPackDefinition {
  return { id, kind, description };
}

export const SKILL_PACK_REGISTRY: Record<SkillPackId, SkillPackDefinition> = {
  clarify_ambiguous_reply: skill('clarify_ambiguous_reply', 'degradation_policy', 'Clarify vague replies without advancing the journey.'),
  service_scope_boundary: skill('service_scope_boundary', 'boundary_policy', 'Explain Medora service boundaries and redirect to supported medical travel workflows.'),
  medical_safety_boundary: skill('medical_safety_boundary', 'boundary_policy', 'Avoid diagnosis, treatment decisions, medication advice, and outcome guarantees.'),
  safe_degradation_when_uncertain: skill('safe_degradation_when_uncertain', 'degradation_policy', 'Use a conservative fallback when skill routing or data is incomplete.'),
  search_general_faq_by_category: skill('search_general_faq_by_category', 'retrieval_strategy', 'Plan retrieval from admin FAQ categories.'),
  answer_general_faq_from_admin_source: skill('answer_general_faq_from_admin_source', 'retrieval_strategy', 'Ground FAQ answers in admin-maintained general FAQ content.'),
  search_hospital_faq_by_category: skill('search_hospital_faq_by_category', 'retrieval_strategy', 'Plan retrieval from admin hospital FAQ categories.'),
  answer_hospital_faq_from_admin_source: skill('answer_hospital_faq_from_admin_source', 'retrieval_strategy', 'Ground hospital answers in admin-maintained hospital FAQ content.'),
  load_medora_service_scope: skill('load_medora_service_scope', 'retrieval_strategy', 'Load static Medora service scope guidance.'),
  load_pricing_factors: skill('load_pricing_factors', 'retrieval_strategy', 'Load pricing-factor guidance without quoting fixed prices.'),
  load_process_policy: skill('load_process_policy', 'retrieval_strategy', 'Load process policy and journey explanation guidance.'),
  load_travel_support_scope: skill('load_travel_support_scope', 'retrieval_strategy', 'Load travel support scope for treatment-related logistics.'),
  load_payment_policy: skill('load_payment_policy', 'retrieval_strategy', 'Load payment policy guidance.'),
  load_records_requirement_data: skill('load_records_requirement_data', 'retrieval_strategy', 'Load records and document requirement guidance.'),
  search_hospital_candidates: skill('search_hospital_candidates', 'retrieval_strategy', 'Plan hospital candidate search.'),
  search_doctor_matching_context: skill('search_doctor_matching_context', 'retrieval_strategy', 'Plan doctor matching context search.'),
  load_consult_readiness_criteria: skill('load_consult_readiness_criteria', 'retrieval_strategy', 'Load online consult readiness criteria.'),
  extract_medical_facts_candidate: skill('extract_medical_facts_candidate', 'extraction_strategy', 'Extract candidate medical facts for runtime-authority review.'),
  derive_record_inventory_candidate: skill('derive_record_inventory_candidate', 'extraction_strategy', 'Derive candidate record inventory from upload or message context.'),
  extract_contact_info_candidate: skill('extract_contact_info_candidate', 'extraction_strategy', 'Extract candidate phone, email, WeChat, or other contact handles.'),
  build_handoff_payload_context: skill('build_handoff_payload_context', 'payload_strategy', 'Build handoff payload context for runtime-controlled escalation.'),
  explain_pricing_uncertainty: skill('explain_pricing_uncertainty', 'explanation_method', 'Explain why pricing depends on records, hospital, and treatment plan.'),
  explain_medora_process: skill('explain_medora_process', 'explanation_method', 'Explain Medora process and next steps.'),
  explain_records_preparation: skill('explain_records_preparation', 'explanation_method', 'Explain medical record preparation and upload expectations.'),
  explain_online_consult: skill('explain_online_consult', 'explanation_method', 'Explain online consultation purpose and readiness.'),
  explain_travel_or_payment_scope: skill('explain_travel_or_payment_scope', 'explanation_method', 'Explain treatment-related travel or payment support scope.'),
  handle_price_objection: skill('handle_price_objection', 'sales_playbook', 'Handle price hesitation with a lower-friction records-first next step.'),
  handle_document_hesitation: skill('handle_document_hesitation', 'sales_playbook', 'Handle hesitation to upload records without pressure.'),
  handle_contact_hesitation: skill('handle_contact_hesitation', 'sales_playbook', 'Handle reluctance to leave contact information.'),
  low_friction_alternative_step: skill('low_friction_alternative_step', 'sales_playbook', 'Offer a smaller next step when the user hesitates.'),
  trust_building_for_medical_travel: skill('trust_building_for_medical_travel', 'sales_playbook', 'Build trust for international medical travel decisions.'),
  soft_human_handoff: skill('soft_human_handoff', 'sales_playbook', 'Offer human coordinator support without overpromising.'),
  revisit_recommendation_step: skill('revisit_recommendation_step', 'sales_playbook', 'Handle recommendation revisit requests.'),
  compare_recommendation_options: skill('compare_recommendation_options', 'explanation_method', 'Compare recommendation options.'),
  explain_hospital_selection_logic: skill('explain_hospital_selection_logic', 'explanation_method', 'Explain hospital selection logic.'),
};
