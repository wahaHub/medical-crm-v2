import type { ReadIntent } from './read-planner.js';
import type {
  FollowUpAction,
  PrimaryAction,
  SupervisorEventModifier,
  SupervisorEventTarget,
  SupervisorEventType,
} from './supervisor-event.types.js';

export type DomainSkillId =
  | 'pricing_skill'
  | 'documents_skill'
  | 'process_skill'
  | 'hospital_recommendation_skill'
  | 'consult_skill'
  | 'human_handoff_skill'
  | 'safety_scope_skill'
  | 'clarification_recovery_skill';

export type DomainSkillTarget =
  | 'pricing'
  | 'documents'
  | 'process'
  | 'hospital_recommendation'
  | 'consult'
  | 'human_handoff'
  | 'safety_scope'
  | 'clarification';

export type SkillKind =
  | 'retrieval_strategy'
  | 'extraction_strategy'
  | 'payload_strategy'
  | 'degradation_policy'
  | 'boundary_policy'
  | 'explanation_method'
  | 'sales_playbook';

export interface SkillSectionApplicability {
  eventTypes?: SupervisorEventType[];
  targets?: SupervisorEventTarget[];
  modifiers?: SupervisorEventModifier[];
  primaryActionTypes?: PrimaryAction['type'][];
  followUpActionTypes?: FollowUpAction['type'][];
}

export interface DomainSkillPolicySection {
  id: string;
  appliesTo: SkillSectionApplicability;
  text: string;
}

export interface DomainSkillRetrievalSection {
  id: string;
  appliesTo: SkillSectionApplicability;
  readIntentTypes: ReadIntent['type'][];
  searchGuidance: string;
}

export interface DomainSkillPack {
  id: DomainSkillId;
  target: DomainSkillTarget;
  description: string;
  policySections: DomainSkillPolicySection[];
  retrieval: {
    sections: DomainSkillRetrievalSection[];
  };
  handling: Partial<Record<SupervisorEventType, Partial<Record<SupervisorEventModifier, string>>>>;
  futureCms?: {
    editable: boolean;
    owner: 'clinical' | 'ops' | 'growth' | 'engineering';
  };
}

export interface DomainSkillRequest {
  skillId: DomainSkillId;
  role: 'primary' | 'auxiliary';
  reasonCode: string;
  sectionHints: {
    eventType: SupervisorEventType;
    target: SupervisorEventTarget;
    modifier: SupervisorEventModifier;
    primaryActionType: PrimaryAction['type'];
    followUpActionType?: FollowUpAction['type'];
  };
}

export interface LoadedSkillSection {
  skillId: DomainSkillId;
  role: DomainSkillRequest['role'];
  reasonCode: string;
  sectionIds: string[];
  policyText: string[];
  retrievalGuidance: string[];
  handlingGuidance: string[];
}

export type LegacySkillPackId =
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

export type SkillPackId = DomainSkillId | LegacySkillPackId;

export interface LegacySkillPackDefinition {
  id: LegacySkillPackId;
  kind: SkillKind;
  description: string;
}

export type SkillPackDefinition = DomainSkillPack | LegacySkillPackDefinition;

export interface SkillRequest {
  skillPackId: SkillPackId;
  reasonCode: string;
}

export type LoadedSkillPack = (
  | DomainSkillPack
  | LegacySkillPackDefinition
  | { id: SkillPackId; kind: SkillKind; description: string }
) & {
  reasonCodes: string[];
};

const appliesToAll: SkillSectionApplicability = {};

function legacySkill(id: LegacySkillPackId, kind: SkillKind, description: string): LegacySkillPackDefinition {
  return { id, kind, description };
}

export const LEGACY_SKILL_PACK_REGISTRY: Record<LegacySkillPackId, LegacySkillPackDefinition> = {
  clarify_ambiguous_reply: legacySkill('clarify_ambiguous_reply', 'degradation_policy', 'Clarify vague replies without advancing the journey.'),
  service_scope_boundary: legacySkill('service_scope_boundary', 'boundary_policy', 'Explain Medora service boundaries and redirect to supported medical travel workflows.'),
  medical_safety_boundary: legacySkill('medical_safety_boundary', 'boundary_policy', 'Avoid diagnosis, treatment decisions, medication advice, and outcome guarantees.'),
  safe_degradation_when_uncertain: legacySkill('safe_degradation_when_uncertain', 'degradation_policy', 'Use a conservative fallback when skill routing or data is incomplete.'),
  search_general_faq_by_category: legacySkill('search_general_faq_by_category', 'retrieval_strategy', 'Plan retrieval from admin FAQ categories.'),
  answer_general_faq_from_admin_source: legacySkill('answer_general_faq_from_admin_source', 'retrieval_strategy', 'Ground FAQ answers in admin-maintained general FAQ content.'),
  search_hospital_faq_by_category: legacySkill('search_hospital_faq_by_category', 'retrieval_strategy', 'Plan retrieval from admin hospital FAQ categories.'),
  answer_hospital_faq_from_admin_source: legacySkill('answer_hospital_faq_from_admin_source', 'retrieval_strategy', 'Ground hospital answers in admin-maintained hospital FAQ content.'),
  load_medora_service_scope: legacySkill('load_medora_service_scope', 'retrieval_strategy', 'Load static Medora service scope guidance.'),
  load_pricing_factors: legacySkill('load_pricing_factors', 'retrieval_strategy', 'Load pricing-factor guidance without quoting fixed prices.'),
  load_process_policy: legacySkill('load_process_policy', 'retrieval_strategy', 'Load process policy and journey explanation guidance.'),
  load_travel_support_scope: legacySkill('load_travel_support_scope', 'retrieval_strategy', 'Load travel support scope for treatment-related logistics.'),
  load_payment_policy: legacySkill('load_payment_policy', 'retrieval_strategy', 'Load payment policy guidance.'),
  load_records_requirement_data: legacySkill('load_records_requirement_data', 'retrieval_strategy', 'Load records and document requirement guidance.'),
  search_hospital_candidates: legacySkill('search_hospital_candidates', 'retrieval_strategy', 'Plan hospital candidate search.'),
  search_doctor_matching_context: legacySkill('search_doctor_matching_context', 'retrieval_strategy', 'Plan doctor matching context search.'),
  load_consult_readiness_criteria: legacySkill('load_consult_readiness_criteria', 'retrieval_strategy', 'Load online consult readiness criteria.'),
  extract_medical_facts_candidate: legacySkill('extract_medical_facts_candidate', 'extraction_strategy', 'Extract candidate medical facts for runtime-authority review.'),
  derive_record_inventory_candidate: legacySkill('derive_record_inventory_candidate', 'extraction_strategy', 'Derive candidate record inventory from upload or message context.'),
  extract_contact_info_candidate: legacySkill('extract_contact_info_candidate', 'extraction_strategy', 'Extract candidate phone, email, WeChat, or other contact handles.'),
  build_handoff_payload_context: legacySkill('build_handoff_payload_context', 'payload_strategy', 'Build handoff payload context for runtime-controlled escalation.'),
  explain_pricing_uncertainty: legacySkill('explain_pricing_uncertainty', 'explanation_method', 'Explain why pricing depends on records, hospital, and treatment plan.'),
  explain_medora_process: legacySkill('explain_medora_process', 'explanation_method', 'Explain Medora process and next steps.'),
  explain_records_preparation: legacySkill('explain_records_preparation', 'explanation_method', 'Explain medical record preparation and upload expectations.'),
  explain_online_consult: legacySkill('explain_online_consult', 'explanation_method', 'Explain online consultation purpose and readiness.'),
  explain_travel_or_payment_scope: legacySkill('explain_travel_or_payment_scope', 'explanation_method', 'Explain treatment-related travel or payment support scope.'),
  handle_price_objection: legacySkill('handle_price_objection', 'sales_playbook', 'Handle price hesitation with a lower-friction records-first next step.'),
  handle_document_hesitation: legacySkill('handle_document_hesitation', 'sales_playbook', 'Handle hesitation to upload records without pressure.'),
  handle_contact_hesitation: legacySkill('handle_contact_hesitation', 'sales_playbook', 'Handle reluctance to leave contact information.'),
  low_friction_alternative_step: legacySkill('low_friction_alternative_step', 'sales_playbook', 'Offer a smaller next step when the user hesitates.'),
  trust_building_for_medical_travel: legacySkill('trust_building_for_medical_travel', 'sales_playbook', 'Build trust for international medical travel decisions.'),
  soft_human_handoff: legacySkill('soft_human_handoff', 'sales_playbook', 'Offer human coordinator support without overpromising.'),
  revisit_recommendation_step: legacySkill('revisit_recommendation_step', 'sales_playbook', 'Handle recommendation revisit requests.'),
  compare_recommendation_options: legacySkill('compare_recommendation_options', 'explanation_method', 'Compare recommendation options.'),
  explain_hospital_selection_logic: legacySkill('explain_hospital_selection_logic', 'explanation_method', 'Explain hospital selection logic.'),
};

export const DOMAIN_SKILL_REGISTRY: Record<DomainSkillId, DomainSkillPack> = {
  pricing_skill: {
    id: 'pricing_skill',
    target: 'pricing',
    description: 'Pricing questions, uncertainty, and price hesitation.',
    policySections: [
      {
        id: 'pricing_explain_uncertainty',
        appliesTo: { targets: ['pricing'], modifiers: ['ask', 'hesitate', 'reject'] },
        text: 'Explain that pricing depends on records, hospital choice, and treatment plan; avoid fixed prices unless retrieved policy supports them.',
      },
      {
        id: 'pricing_next_step',
        appliesTo: { followUpActionTypes: ['INVITE_NEXT_STEP'] },
        text: 'Offer a low-friction next step such as uploading records, sharing diagnosis details, or asking a coordinator.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'pricing_sources',
          appliesTo: { targets: ['pricing'] },
          readIntentTypes: ['PRICING_FACTORS', 'GENERAL_FAQ', 'RECORD_REQUIREMENTS'],
          searchGuidance: 'Use pricing factors first; use pricing FAQ only when the user asks a policy question.',
        },
      ],
    },
    handling: {
      USER_ASKED_QUESTION: {
        ask: 'Answer the pricing question, then invite records or coordinator support.',
      },
      USER_RESPONDED_TO_REQUEST: {
        hesitate: 'Acknowledge concern and offer a smaller records-first step.',
        reject: 'Respect refusal and offer human support or a general explanation.',
      },
    },
    futureCms: { editable: true, owner: 'growth' },
  },
  documents_skill: {
    id: 'documents_skill',
    target: 'documents',
    description: 'Medical facts, records, document upload, and document hesitation.',
    policySections: [
      {
        id: 'documents_request_scope',
        appliesTo: { targets: ['documents', 'medical_facts'] },
        text: 'Ask only for useful records or facts at the current stage; do not pressure the user.',
      },
      {
        id: 'documents_lower_friction',
        appliesTo: { modifiers: ['hesitate', 'reject'] },
        text: 'Offer alternatives such as describing the diagnosis, uploading one key report, or asking a coordinator.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'document_requirements',
          appliesTo: { targets: ['documents', 'medical_facts'] },
          readIntentTypes: ['RECORD_REQUIREMENTS'],
          searchGuidance: 'Use record requirements to name the next useful document set.',
        },
      ],
    },
    handling: {
      DOCUMENTS_UPLOADED: {
        provide: 'Acknowledge the upload and explain the next review step.',
      },
      USER_RESPONDED_TO_REQUEST: {
        hesitate: 'Reduce pressure and suggest one smaller action.',
        reject: 'Respect the choice and keep the workflow open.',
      },
    },
    futureCms: { editable: true, owner: 'clinical' },
  },
  process_skill: {
    id: 'process_skill',
    target: 'process',
    description: 'Process, next-step, travel, and payment support questions.',
    policySections: [
      {
        id: 'process_answer_and_return',
        appliesTo: { targets: ['process', 'next_step'] },
        text: 'Answer the process or next-step question, then return to the current workflow when appropriate.',
      },
      {
        id: 'process_state_boundary',
        appliesTo: { primaryActionTypes: ['ANSWER'] },
        text: 'Do not imply process.explained=true for normal FAQ answers; only reducer-owned formal overview actions set it.',
      },
      {
        id: 'travel_payment_scope',
        appliesTo: { targets: ['travel', 'payment'] },
        text: 'Keep travel and payment support under process ownership; answer from retrieved treatment-related logistics or payment policy.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'process_policy',
          appliesTo: { targets: ['process', 'next_step'] },
          readIntentTypes: ['PROCESS_POLICY', 'GENERAL_FAQ'],
          searchGuidance: 'Use process policy first; use process FAQ for direct user questions.',
        },
        {
          id: 'travel_support_scope',
          appliesTo: { targets: ['travel'] },
          readIntentTypes: ['TRAVEL_SUPPORT_SCOPE'],
          searchGuidance: 'Use treatment-related travel support scope for visa, flight, hotel, or trip questions.',
        },
        {
          id: 'payment_policy',
          appliesTo: { targets: ['payment'] },
          readIntentTypes: ['PAYMENT_POLICY'],
          searchGuidance: 'Use payment policy for payment method, timing, and payment support questions.',
        },
      ],
    },
    handling: {
      USER_ASKED_QUESTION: {
        ask: 'Answer the detour clearly, then resume the journey step.',
      },
    },
    futureCms: { editable: true, owner: 'ops' },
  },
  hospital_recommendation_skill: {
    id: 'hospital_recommendation_skill',
    target: 'hospital_recommendation',
    description: 'Recommendations, hospital selection, comparison, and preference changes.',
    policySections: [
      {
        id: 'recommendation_grounding',
        appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
        text: 'Use candidate recommendations, retrieved hospital context, known facts, and user preferences.',
      },
      {
        id: 'recommendation_no_invention',
        appliesTo: appliesToAll,
        text: 'Do not invent hospitals, scores, rankings, medical facts, or outcome guarantees.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'recommendation_sources',
          appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
          readIntentTypes: ['HOSPITAL_CANDIDATES', 'HOSPITAL_FAQ', 'DOCTOR_MATCHING_CONTEXT'],
          searchGuidance: 'Use approved recommendation candidates and hospital context before comparing options.',
        },
      ],
    },
    handling: {
      USER_EXPRESSED_NEED: {
        provide: 'Connect the expressed need to the current recommendation options.',
      },
      USER_RESPONDED_TO_REQUEST: {
        revisit: 'Revisit the options using the new preference or concern.',
      },
    },
    futureCms: { editable: true, owner: 'clinical' },
  },
  consult_skill: {
    id: 'consult_skill',
    target: 'consult',
    description: 'Online consult questions and consult readiness.',
    policySections: [
      {
        id: 'consult_readiness',
        appliesTo: { targets: ['consult'] },
        text: 'Explain what is needed before doctor review and which records help readiness.',
      },
      {
        id: 'consult_confirmation_boundary',
        appliesTo: appliesToAll,
        text: 'Do not imply an appointment is confirmed unless a tool result confirms it.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'consult_sources',
          appliesTo: { targets: ['consult'] },
          readIntentTypes: ['CONSULT_READINESS', 'GENERAL_FAQ'],
          searchGuidance: 'Use consult readiness first; use consult FAQ for direct policy questions.',
        },
      ],
    },
    handling: {
      USER_ASKED_QUESTION: {
        ask: 'Explain the consult step and invite the next readiness action.',
      },
    },
    futureCms: { editable: true, owner: 'ops' },
  },
  human_handoff_skill: {
    id: 'human_handoff_skill',
    target: 'human_handoff',
    description: 'Human coordinator requests and contact information.',
    policySections: [
      {
        id: 'handoff_confirm',
        appliesTo: { targets: ['human', 'contact'] },
        text: 'Confirm the handoff and summarize what will be passed to the coordinator.',
      },
      {
        id: 'handoff_no_overpromise',
        appliesTo: appliesToAll,
        text: 'Avoid repeated information requests and do not promise outcomes or exact response times unless policy supports it.',
      },
    ],
    retrieval: {
      sections: [],
    },
    handling: {
      USER_REQUESTED_HUMAN: {
        ask: 'Move toward coordinator support without adding pressure.',
      },
      USER_PROVIDED_INFORMATION: {
        provide: 'Acknowledge contact information and state the handoff purpose.',
      },
    },
    futureCms: { editable: true, owner: 'ops' },
  },
  safety_scope_skill: {
    id: 'safety_scope_skill',
    target: 'safety_scope',
    description: 'Risky medical advice, out-of-scope, and restricted-service requests.',
    policySections: [
      {
        id: 'medical_safety_boundary',
        appliesTo: { eventTypes: ['USER_ASKED_RISKY_MEDICAL_ADVICE'] },
        text: 'Avoid diagnosis, medication advice, treatment decisions, and outcome guarantees; advise local emergency care for urgent symptoms.',
      },
      {
        id: 'scope_redirect',
        appliesTo: { eventTypes: ['USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE'], primaryActionTypes: ['REDIRECT'] },
        text: 'Redirect to supported workflows such as records-based review, doctor matching, online consult, or treatment-related travel support.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'service_scope',
          appliesTo: { primaryActionTypes: ['REDIRECT'] },
          readIntentTypes: ['SERVICE_SCOPE'],
          searchGuidance: 'Use service scope for out-of-scope or restricted-service boundaries; do not perform medical lookup.',
        },
      ],
    },
    handling: {
      USER_ASKED_RISKY_MEDICAL_ADVICE: {
        ask: 'Decline risky advice and redirect to safe support.',
      },
      USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE: {
        ask: 'Explain the service boundary and offer a supported alternative.',
      },
    },
    futureCms: { editable: true, owner: 'clinical' },
  },
  clarification_recovery_skill: {
    id: 'clarification_recovery_skill',
    target: 'clarification',
    description: 'Unclear messages, unknown targets, and low-confidence recovery.',
    policySections: [
      {
        id: 'clarify_without_advancing',
        appliesTo: { targets: ['unknown'], eventTypes: ['USER_MESSAGE_UNCLEAR'] },
        text: 'Ask a focused clarifying question and do not advance the journey on ambiguous input.',
      },
      {
        id: 'safe_recovery',
        appliesTo: appliesToAll,
        text: 'When context is incomplete, state what is understood and ask for the missing detail.',
      },
    ],
    retrieval: {
      sections: [],
    },
    handling: {
      USER_MESSAGE_UNCLEAR: {
        unknown: 'Clarify the user intent before choosing a domain next step.',
      },
    },
    futureCms: { editable: false, owner: 'engineering' },
  },
};

export const SKILL_PACK_REGISTRY = LEGACY_SKILL_PACK_REGISTRY;

export const SKILL_LOADER_REGISTRY = {
  ...LEGACY_SKILL_PACK_REGISTRY,
  ...DOMAIN_SKILL_REGISTRY,
} satisfies Record<SkillPackId, SkillPackDefinition>;
