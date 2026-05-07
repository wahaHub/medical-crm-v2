import type { ReadIntent } from './read-planner.js';
import type {
  FollowUpAction,
  PrimaryAction,
  SupervisorEventModifier,
  SupervisorEventTarget,
  SupervisorEventType,
} from './supervisor-event.types.js';

export type DomainSkillId =
  | 'service_scope_skill'
  | 'policy_skill'
  | 'medical_advice_skill'
  | 'hospital_skill'
  | 'treatment_skill'
  | 'pricing_skill'
  | 'payment_skill'
  | 'travel_skill'
  | 'sales_skill'
  | 'handoff_skill'
  | 'clarification_recovery_skill';

export type DomainSkillTarget =
  | 'service_scope'
  | 'policy'
  | 'medical_advice'
  | 'hospital'
  | 'treatment'
  | 'pricing'
  | 'payment'
  | 'travel'
  | 'sales'
  | 'handoff'
  | 'clarification';

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
  readIntentTypes: ReadIntent['type'][];
  policyText: string[];
  retrievalGuidance: string[];
  handlingGuidance: string[];
}

export type SkillPackId = DomainSkillId;

export type LoadedSkillPack = DomainSkillPack & {
  reasonCodes: string[];
};

const appliesToAll: SkillSectionApplicability = {};

export const DOMAIN_SKILL_REGISTRY: Record<DomainSkillId, DomainSkillPack> = {
  service_scope_skill: {
    id: 'service_scope_skill',
    target: 'service_scope',
    description: 'Medora supported service scope, unsupported requests, and service-boundary redirects.',
    policySections: [
      {
        id: 'service_scope_supported_work',
        appliesTo: { targets: ['service_scope'] },
        text: 'Medora can support medical-travel coordination, hospital and doctor matching, records-based review preparation, online consult setup, treatment-related travel logistics, pricing/process guidance, and human coordinator handoff.',
      },
      {
        id: 'service_scope_identity_contact',
        appliesTo: { targets: ['service_scope', 'contact', 'human'] },
        text: 'Medora Health is a cross-border medical travel coordination platform for international patients, overseas Chinese, self-pay medical travelers, families, and institutions seeking care in China. Public contact facts for verification or contact requests: address RM H2 4/F CENTURY IND CTR, 33-35 AU PUI WAN ST FOTAN SHA TIN, HONG KONG; phone US +1 4708613825; email contact@medicaltourismchina.health; website https://www.medicaltourismchina.health.',
      },
      {
        id: 'service_scope_catalog',
        appliesTo: { targets: ['service_scope'] },
        text: 'Service catalog includes cross-border medical journey coordination, hospital/department/doctor coordination, medical records organization and translation, remote second-opinion or online consultation setup, treatment journey support, accompanied hospital visits, medical interpretation, visa and invitation document coordination, airport pickup, local transport, accommodation, companion support, payment and billing communication support, medical liability insurance support, follow-up, rehabilitation, health screening, medical aesthetics, and complex disease inquiry coordination.',
      },
      {
        id: 'service_scope_city_coverage',
        appliesTo: { targets: ['service_scope'] },
        text: 'Core China medical resource cities include Beijing, Shanghai, Guangzhou, Shenzhen, Chengdu, and Chongqing. City choice depends on disease area, hospital specialty strength, doctor availability, appointment/admission timing, and the patient travel plan; other cities may be considered when specialty resources and cooperation support the case.',
      },
      {
        id: 'service_scope_response_style',
        appliesTo: { targets: ['service_scope'] },
        text: 'Use relevant service facts rather than full boilerplate. If the user asks generally, summarize Medora role and representative services; if they ask about one service, answer that service only. For trust or hesitation, explain Medora role, public contact facts, and a low-commitment starting option without pressure.',
      },
      {
        id: 'service_scope_redirect',
        appliesTo: { targets: ['service_scope'], primaryActionTypes: ['REDIRECT'] },
        text: 'For requests outside Medora-supported medical travel, briefly state the boundary and offer the closest supported medical-travel alternative without debating the unrelated request.',
      },
      {
        id: 'service_scope_boundary',
        appliesTo: { targets: ['service_scope'] },
        text: 'Medora coordinates journey preparation, communication, logistics, records, and follow-up support. Clinical decisions, final treatment plans, official approvals, exact pricing, hospital acceptance, insurer decisions, and outcomes belong to hospitals, doctors, authorities, insurers, or other responsible parties.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'service_scope_sources',
          appliesTo: { targets: ['service_scope'], primaryActionTypes: ['REDIRECT'] },
          readIntentTypes: ['SERVICE_SCOPE'],
          searchGuidance: 'Use service scope for unsupported service boundaries and supported Medora alternatives.',
        },
      ],
    },
    handling: {
      USER_ASKED_QUESTION: {
        ask: 'Answer within Medora scope; if unsupported, redirect to a supported medical-travel workflow.',
      },
      USER_REQUESTED_ACTION: {
        request_action: 'Decline unsupported action requests and offer a supported Medora next step.',
      },
    },
    futureCms: { editable: true, owner: 'ops' },
  },
  payment_skill: {
    id: 'payment_skill',
    target: 'payment',
    description: 'Payment methods, deposits, billing timing, refunds, and payment hesitation.',
    policySections: [
      {
        id: 'payment_policy_boundary',
        appliesTo: { targets: ['payment'] },
        text: 'Answer payment method, deposit, refund, invoice, and billing-timing questions only from retrieved payment policy. Do not invent discounts, financing terms, fixed totals, or refund guarantees.',
      },
      {
        id: 'payment_payee_distinction',
        appliesTo: { targets: ['payment'] },
        text: 'Payee distinction: online consultation fee is paid to or through the Medora service flow; Medora coordination service fee applies for public hospital coordination and needs human confirmation; private hospital contact has no Medora coordination service fee; hospital medical fees follow hospital rules and may be paid directly to the hospital or through a hospital-approved process; travel, hotel, transport, and third-party fees follow the relevant provider or service arrangement.',
      },
      {
        id: 'payment_online_consultation_policy',
        appliesTo: { targets: ['payment'] },
        text: 'USD 400 online consultation fee is required before coming to China. If the user does not come to China, Medora keeps the USD 400 consultation fee. If the user comes to China for treatment, the USD 400 is applied toward the user treatment cost. This is not a general refundable deposit, and exact payment channel requires coordinator or checkout confirmation.',
      },
      {
        id: 'payment_public_private_policy',
        appliesTo: { targets: ['payment'] },
        text: 'For public hospital cases, public hospital treatment fees are usually cheaper than private hospital treatment fees, but Medora charges a coordination service fee and the exact amount/payment method requires human confirmation. For private hospital cases, Medora does not charge a coordination service fee and can help contact the private hospital for free; the user still pays hospital medical fees according to hospital rules.',
      },
      {
        id: 'payment_insurance_boundary',
        appliesTo: { targets: ['payment'] },
        text: 'Medora does not provide claims support. Insurer-owned payment, coverage, reimbursement, direct-billing, claim approval, claim status, and claims questions should go to the user insurer. Medora can explain the boundary, help with medical liability insurance purchase where applicable, organize neutral hospital documents, or ask the hospital about hospital-provided medical liability insurance.',
      },
      {
        id: 'payment_hesitation',
        appliesTo: { targets: ['payment'], modifiers: ['hesitate', 'reject'] },
        text: 'For payment hesitation, lower pressure and offer policy clarification, coordinator support, or a records-first estimate path.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'payment_policy_sources',
          appliesTo: { targets: ['payment'] },
          readIntentTypes: ['PAYMENT_POLICY'],
          searchGuidance: 'Use payment policy for methods, timing, deposits, refunds, and billing support.',
        },
      ],
    },
    handling: {
      USER_ASKED_QUESTION: {
        ask: 'Answer payment policy questions from retrieved policy and avoid inventing commercial terms.',
      },
    },
    futureCms: { editable: true, owner: 'growth' },
  },
  travel_skill: {
    id: 'travel_skill',
    target: 'travel',
    description: 'Treatment-related travel logistics such as visa timing context, hotels, airport pickup, local transport, and trip coordination.',
    policySections: [
      {
        id: 'travel_treatment_scope',
        appliesTo: { targets: ['travel'] },
        text: 'Keep travel support tied to medical travel: treatment itinerary, visa timing context, flights, hotels, airport pickup, local transport, hospital appointment logistics, and travel document preparation.',
      },
      {
        id: 'travel_medical_path_first',
        appliesTo: { targets: ['travel'] },
        text: 'Use medical path first: online consultation, records review, hospital/city direction, and appointment or admission plausibility should usually be clearer before final flights, hotel booking, pickup timing, or fixed itinerary planning.',
      },
      {
        id: 'travel_supported_logistics',
        appliesTo: { targets: ['travel'] },
        text: 'Medora can coordinate medical invitation or appointment document support when available, visa-support preparation, airport pickup, local transport, hotels near hospitals, companion logistics, mobility/accessibility planning, interpretation/accompanied-visit scheduling, and practical stay support tied to care.',
      },
      {
        id: 'travel_facts_and_boundaries',
        appliesTo: { targets: ['travel'] },
        text: 'Check existing nationality/passport country, current location, destination city or hospital, travel window, length of stay, online consultation status, appointment/admission status, companion count, mobility limits, language needs, accommodation preference, and flight details before asking. Do not guarantee visa approval, entry approval, hotel availability, exact transport timing, immigration outcome, or third-party policy.',
      },
      {
        id: 'travel_scope_boundary',
        appliesTo: { targets: ['travel'] },
        text: 'Do not offer unrelated immigration, long-term housing, school, job, legal, or non-treatment concierge services.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'travel_support_sources',
          appliesTo: { targets: ['travel'] },
          readIntentTypes: ['TRAVEL_SUPPORT_SCOPE'],
          searchGuidance: 'Use treatment-related travel support scope for visa, flight, hotel, pickup, and local logistics questions.',
        },
      ],
    },
    handling: {
      USER_ASKED_QUESTION: {
        ask: 'Answer treatment-related travel logistics and route unrelated service requests to service scope.',
      },
    },
    futureCms: { editable: true, owner: 'ops' },
  },
  sales_skill: {
    id: 'sales_skill',
    target: 'sales',
    description: 'Commercial intent, persuasion boundaries, trust questions, and conversion-sensitive hesitation.',
    policySections: [
      {
        id: 'sales_no_pressure',
        appliesTo: { targets: ['sales'] },
        text: 'Address trust, hesitation, and purchase intent without pressure. Do not overpromise clinical outcome, price, timing, doctor availability, or human response time.',
      },
      {
        id: 'sales_trust_facts',
        appliesTo: { targets: ['sales'] },
        text: 'For trust questions, use public facts when helpful: Medora coordinates medical travel to China, can help prepare records, arrange the required online consultation, coordinate hospitals, explain public/private options, support translation/accompaniment/logistics, and coordinate follow-up. Contact facts may be shared when the user asks to verify Medora: RM H2 4/F CENTURY IND CTR, 33-35 AU PUI WAN ST FOTAN SHA TIN, HONG KONG; US +1 4708613825; contact@medicaltourismchina.health.',
      },
      {
        id: 'sales_hesitation_patterns',
        appliesTo: { targets: ['sales'], modifiers: ['hesitate', 'reject'] },
        text: 'For hesitation, acknowledge the concern and reduce the ask. Offer one smaller start such as diagnosis only, one key report, a symptom summary, one online consultation question, public/private comparison, records-first estimate, or coordinator help when enough context exists.',
      },
      {
        id: 'sales_value_explanation',
        appliesTo: { targets: ['sales'] },
        text: 'Explain value through the user need: hospital selection, records organization, online consultation preparation, public/private comparison, language and hospital navigation, treatment-day logistics, discharge communication, travel coordination around medical reality, and follow-up continuity. Do not invent success stories, celebrity doctors, guaranteed outcomes, visas, exact dates, refunds, insurance coverage, or prices.',
      },
      {
        id: 'sales_next_step',
        appliesTo: { targets: ['sales'] },
        text: 'Offer one low-friction next step such as sharing records, clarifying condition goals, comparing hospitals, asking payment/process questions, or requesting a coordinator.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'sales_faq_sources',
          appliesTo: { targets: ['sales'] },
          readIntentTypes: ['GENERAL_FAQ'],
          searchGuidance: 'Use general FAQ for trust, process, and service positioning questions.',
        },
      ],
    },
    handling: {
      USER_EXPRESSED_INTEREST: {
        ask: 'Acknowledge interest and invite one low-friction supported next step.',
      },
      USER_RESPONDED_TO_REQUEST: {
        hesitate: 'Acknowledge hesitation, avoid pressure, and offer a smaller alternative.',
        reject: 'Respect rejection and keep a supported path open.',
      },
    },
    futureCms: { editable: true, owner: 'growth' },
  },
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
        id: 'pricing_cost_components',
        appliesTo: { targets: ['pricing'] },
        text: 'A medical-travel cost may include hospital medical fees, doctor or hospital consultation/procedure fees, tests, imaging, pathology, labs, surgery/procedure/therapy charges, anesthesia, consumables, implants, medication, inpatient bed/nursing days, follow-up or recheck fees, Medora coordination service fee when applicable, online consultation fee, translation/accompaniment/logistics fees, travel, hotel, local transport, companion costs, green-channel support when applicable, and optional medical liability insurance.',
      },
      {
        id: 'pricing_medical_vs_service_fee',
        appliesTo: { targets: ['pricing'] },
        text: 'Hospital medical cost vs Medora service fee: hospital medical costs are charged according to hospital rules and actual care; Medora service fees cover coordination and support. Public hospital cases usually have cheaper hospital treatment fees but require a Medora coordination service fee with exact amount confirmed by a human. Private hospital cases have no Medora coordination service fee and Medora can help contact the private hospital for free, while the user still pays hospital medical fees.',
      },
      {
        id: 'pricing_online_consultation_fee',
        appliesTo: { targets: ['pricing'] },
        text: 'Online consultation costs USD 400 and can support pre-China treatment feasibility, hospital direction, second opinion, preparation, and whether travel is worth considering. If the user does not come to China, Medora keeps the USD 400 fee; if the user comes to China for treatment, the USD 400 is applied toward treatment cost.',
      },
      {
        id: 'pricing_service_fee_confirmation',
        appliesTo: { targets: ['pricing'] },
        text: 'For exact Medora service fees beyond confirmed policies, ask for a diagnosis report or relevant medical records first, then route fee-specific questions to human confirmation. Do not invent exact hotel, translation, accompanied visit, airport pickup, green-channel, public-hospital coordination, or other support-service prices.',
      },
      {
        id: 'pricing_factor_breakdown',
        appliesTo: { targets: ['pricing'] },
        text: 'When discussing cost, break uncertainty into clinical plan, hospital level, doctor review, tests, procedure or medication choices, inpatient days, travel logistics, and currency/payment timing when relevant.',
      },
      {
        id: 'pricing_no_quote_without_basis',
        appliesTo: { targets: ['pricing'] },
        text: 'Do not quote a package total, discount, deposit, refund, financing, or "typical" price unless retrieved pricing policy or FAQ provides it. Say what information is needed before a reliable estimate.',
      },
      {
        id: 'pricing_hesitation_lower_friction',
        appliesTo: { modifiers: ['hesitate', 'reject'] },
        text: 'For price hesitation or rejection, acknowledge the concern, avoid pressure, and offer a smaller step such as records-first estimate, coordinator explanation, or general factor list.',
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
  treatment_skill: {
    id: 'treatment_skill',
    target: 'treatment',
    description: 'Medical facts, records, document upload, and document hesitation.',
    policySections: [
      {
        id: 'documents_request_scope',
        appliesTo: { targets: ['treatment', 'documents', 'medical_facts'] },
        text: 'Ask only for useful records or facts at the current stage; do not pressure the user.',
      },
      {
        id: 'treatment_journey_overview',
        appliesTo: { targets: ['treatment'] },
        text: 'A typical treatment journey may include inquiry, medical goal clarification, records or case summary preparation, required online consultation before coming to China, doctor or hospital review, preliminary direction or feasibility discussion, hospital selection, appointment/admission planning, travel/logistics after the medical path is clearer, arrival, hospital check-in, updated tests, final doctor-confirmed plan, treatment, discharge documents, and follow-up.',
      },
      {
        id: 'treatment_online_consultation_required',
        appliesTo: { targets: ['treatment'] },
        text: 'Online consultation is the standard required step before coming to China. Use it as the main next step when the user asks about treatment feasibility, options, whether China may help, whether they need surgery, or what plan doctors might recommend; Chinese specialists can review records before travel and decide whether an in-person visit is worthwhile.',
      },
      {
        id: 'treatment_preparation_guidance',
        appliesTo: { targets: ['treatment', 'documents', 'medical_facts'] },
        text: 'Before asking new treatment questions, inspect diagnosis or suspected diagnosis, main symptoms, duration/severity, prior treatments, existing records, uploaded documents, prior surgery/procedure, current medications/comorbidities if already provided, desired treatment goal, target city/time window, and whether the user wants second opinion, surgery, non-surgical option, rehabilitation, checkup, or advanced treatment.',
      },
      {
        id: 'treatment_records_for_review',
        appliesTo: { targets: ['treatment', 'documents'] },
        text: 'Useful treatment-review records may include diagnosis summary, recent imaging report and original images if available, labs, pathology report, surgery/procedure notes, discharge summary, medication list, prior treatment plan, current symptoms and functional status, allergies/comorbidities, relevant photos, prior doctor opinions, and questions for the Chinese specialist.',
      },
      {
        id: 'documents_upload_review_promise',
        appliesTo: { eventTypes: ['DOCUMENTS_UPLOADED'], targets: ['treatment', 'documents'] },
        text: 'When the user uploads medical files or case materials, acknowledge receipt when confirmed and say Medora human team will review them, seek careful doctor review where appropriate, and contact the user within 48 hours. Do not imply the chatbot has clinically reviewed the file, diagnosed from it, or determined treatment.',
      },
      {
        id: 'documents_minimal_medical_facts',
        appliesTo: { targets: ['treatment', 'medical_facts'] },
        text: 'When facts are missing, ask for the smallest useful set: diagnosis or suspected condition, main symptoms and duration, prior tests or treatments, and destination/timing constraints when relevant.',
      },
      {
        id: 'documents_record_inventory',
        appliesTo: { targets: ['treatment', 'documents'] },
        text: 'When records are discussed, distinguish imaging reports, lab results, pathology, discharge summaries, medication lists, treatment history, referral letters, and existing doctor notes.',
      },
      {
        id: 'documents_privacy_and_pressure_boundary',
        appliesTo: { targets: ['treatment', 'documents', 'medical_facts'] },
        text: 'Do not imply care is impossible without immediate upload. Offer alternatives such as a brief symptom summary, one key report, or a coordinator handoff.',
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
          id: 'treatment_requirements',
          appliesTo: { targets: ['treatment', 'documents', 'medical_facts'] },
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
  policy_skill: {
    id: 'policy_skill',
    target: 'policy',
    description: 'Process, next-step, travel, and payment support questions.',
    policySections: [
      {
        id: 'process_answer_and_return',
        appliesTo: { targets: ['policy', 'process', 'next_step'] },
        text: 'Answer the process or next-step question directly, then return to the current workflow. Do not turn a detour answer into a new journey stage unless the reducer primary action explicitly does that.',
      },
      {
        id: 'process_stage_preservation',
        appliesTo: { primaryActionTypes: ['ANSWER'] },
        text: 'For FAQ detours, preserve the current primary journey stage and avoid silently advancing or resetting the user. Make the next Medora step match the existing stage.',
      },
      {
        id: 'process_overview_boundary',
        appliesTo: { primaryActionTypes: ['ANSWER'] },
        text: 'Do not imply process.explained=true for normal FAQ answers. Only reducer-owned formal overview actions set the formal overview flag.',
      },
      {
        id: 'process_next_step_routing',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
        text: 'For next-step questions, map the answer to the current journey state: minimal triage, recommendation review, process overview, records upload, consult readiness, or human handoff. Ask only one next action.',
      },
      {
        id: 'process_timeline_boundary',
        appliesTo: { targets: ['policy', 'process'] },
        text: 'For timeline questions, explain dependencies such as records, hospital review, doctor availability, travel logistics, and payment timing. Do not promise exact turnaround or human response time unless retrieved policy supports it.',
      },
      {
        id: 'policy_online_consultation',
        appliesTo: { targets: ['policy', 'process', 'consult'] },
        text: 'Online consultation is a standard necessary step before coming to China and costs USD 400. If the user does not come to China, Medora keeps the USD 400 consultation fee. If the user comes to China for treatment, the USD 400 is applied toward the user treatment cost. Do not describe this as optional telemedicine for the standard pre-China pathway.',
      },
      {
        id: 'consult_readiness',
        appliesTo: { targets: ['consult'] },
        text: 'Explain what is needed before doctor review and which records help readiness.',
      },
      {
        id: 'consult_scope',
        appliesTo: { targets: ['consult'] },
        text: 'Frame online consult as records-based doctor review, second opinion preparation, or appointment readiness. Do not imply diagnosis, prescription, or treatment plan is confirmed by chat.',
      },
      {
        id: 'consult_next_requirements',
        appliesTo: { targets: ['consult'] },
        text: 'Name concrete readiness inputs when useful: diagnosis or suspected condition, imaging/lab/pathology records, current treatment history, medication list, and the user question for the doctor.',
      },
      {
        id: 'consult_timing_boundary',
        appliesTo: { targets: ['consult'] },
        text: 'Do not promise exact consult scheduling or doctor response time unless retrieved policy supports it. Explain that scheduling depends on records completeness and doctor availability.',
      },
      {
        id: 'consult_confirmation_boundary',
        appliesTo: { targets: ['consult'] },
        text: 'Do not imply an appointment is confirmed unless a tool result confirms it.',
      },
      {
        id: 'policy_document_review',
        appliesTo: { targets: ['policy', 'process'] },
        text: 'When the user submits medical files or case materials, acknowledge receipt when confirmed and say Medora human team will review them, seek careful doctor review where appropriate, and contact the user within 48 hours. Do not imply the chatbot has clinically reviewed the file, diagnosed from it, or determined treatment.',
      },
      {
        id: 'policy_incomplete_information',
        appliesTo: { targets: ['policy', 'process'] },
        text: 'Users may start with incomplete records or uncertainty. With limited information, Medora can usually provide orientation, explain possible paths, and identify the most important missing item. If the user hesitates, ask only for diagnosis, one key record, or the smallest useful fact and explain why it matters.',
      },
      {
        id: 'policy_insurance_boundary',
        appliesTo: { targets: ['policy', 'process', 'payment'] },
        text: 'Medora does not provide claims support. Insurer-owned questions about policy terms, coverage, reimbursement, direct billing, claim approval, claim status, or claims should go to the user insurer. Medora may explain this boundary, help with medical liability insurance purchase where applicable, organize neutral hospital documents such as receipts, bills, reports, or discharge materials, or ask the hospital whether hospital-provided medical liability insurance exists or applies.',
      },
      {
        id: 'policy_privacy_promise_boundary',
        appliesTo: { targets: ['policy', 'process'] },
        text: 'Collect only information needed for medical-travel coordination and share sensitive records only with necessary parties for service coordination, hospital/doctor review, translation, logistics, billing, neutral document organization, medical liability insurance support, or follow-up. Do not invent retention periods, encryption claims, legal certifications, refund outcomes, diagnosis, prescriptions, guaranteed acceptance, exact dates, visa approval, final price, outcome guarantees, or insurance approval.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'policy_sources',
          appliesTo: { targets: ['policy', 'process', 'next_step'] },
          readIntentTypes: ['PROCESS_POLICY', 'GENERAL_FAQ'],
          searchGuidance: 'Use process policy first; use process policy content for direct user questions.',
        },
        {
          id: 'consult_sources',
          appliesTo: { targets: ['consult'] },
          readIntentTypes: ['CONSULT_READINESS', 'GENERAL_FAQ'],
          searchGuidance: 'Use consult readiness first; use consult policy content for direct online consultation questions.',
        },
      ],
    },
    handling: {
      USER_ASKED_QUESTION: {
        ask: 'Answer the detour clearly, preserve the journey stage, and resume with one current next step. If the user asks process, explain the relevant slice; if next_step, choose the current state action; if travel or payment, stay inside treatment-related logistics or payment policy.',
      },
    },
    futureCms: { editable: true, owner: 'ops' },
  },
  hospital_skill: {
    id: 'hospital_skill',
    target: 'hospital',
    description: 'Recommendations, hospital selection, comparison, and preference changes.',
    policySections: [
      {
        id: 'recommendation_grounding',
        appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
        text: 'Use candidate recommendations, retrieved hospital context, known facts, and user preferences.',
      },
      {
        id: 'hospital_api_first',
        appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
        text: 'Use hospital API first when hospital recommendations are requested, filtering mainly by location, public/private preference, relevant department, and follow-up care need. Then use online search with citations for candidate hospitals before making persuasive specialty or clinical-fit claims.',
      },
      {
        id: 'hospital_online_evidence',
        appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
        text: 'After API candidates are available, prefer online evidence from official hospital pages, official department or specialty pages, government/academic/institutional sources, reputable media or public directories, then general web pages only when better sources are unavailable. Tie claims to sources, include links/images when useful, and be transparent when evidence is weak.',
      },
      {
        id: 'hospital_doctor_recommendation_policy',
        appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
        text: 'For a specific doctor or doctor-team recommendation, do not recommend a specific doctor in the chatbot. Ask the user to upload relevant medical records first and explain that Medora needs to review the case before arranging human doctor-matching support. If the user wants a lower-friction start, ask for one key report, diagnosis report, imaging/pathology/lab summary, or prior treatment summary.',
      },
      {
        id: 'hospital_public_private_fee_framing',
        appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
        text: 'Public hospital treatment fees are usually cheaper than private hospital fees, but Medora charges a coordination service fee for public hospital cases and the exact fee requires human confirmation. Private hospital cases have no Medora coordination service fee and Medora can help contact private hospitals for free, while hospital medical fees still follow hospital rules.',
      },
      {
        id: 'recommendation_match_dimensions',
        appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
        text: 'Explain matching using observable dimensions: condition fit, department or specialty relevance, available records, patient destination or timing, consult readiness, and user-stated preferences.',
      },
      {
        id: 'recommendation_compare_without_ranking_invention',
        appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
        text: 'When comparing options, compare only known facts from candidates or retrieved context. Do not invent rankings, success rates, doctor superiority, or hidden quality scores.',
      },
      {
        id: 'recommendation_revisit_handling',
        appliesTo: { modifiers: ['revisit', 'reject', 'hesitate'] },
        text: 'For revisit, rejection, or hesitation, ask what criterion changed and offer to refine by specialty, location, budget, timeline, language support, or consult preference.',
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
          id: 'hospital_sources',
          appliesTo: { targets: ['recommendation', 'hospital', 'hospital_selection'] },
          readIntentTypes: ['HOSPITAL_CANDIDATES', 'HOSPITAL_FAQ', 'DOCTOR_MATCHING_CONTEXT'],
          searchGuidance: 'Use approved recommendation candidates and hospital context before comparing options.',
        },
      ],
    },
    handling: {
      USER_EXPRESSED_INTEREST: {
        provide: 'Connect the expressed need to the current recommendation options.',
      },
      USER_RESPONDED_TO_REQUEST: {
        revisit: 'Revisit the options using the new preference or concern.',
      },
    },
    futureCms: { editable: true, owner: 'clinical' },
  },
  handoff_skill: {
    id: 'handoff_skill',
    target: 'handoff',
    description: 'Human coordinator requests and contact information.',
    policySections: [
      {
        id: 'handoff_confirm',
        appliesTo: { targets: ['handoff', 'human', 'contact'] },
        text: 'Confirm the handoff and summarize what will be passed to the coordinator.',
      },
      {
        id: 'handoff_readiness',
        appliesTo: { targets: ['handoff', 'human', 'contact'] },
        text: 'Before handoff, inspect fact patch, recent conversation, uploaded records summary, journey state, and available user information. If enough context exists, prepare handoff; if not, ask for the smallest useful missing item rather than blind transfer.',
      },
      {
        id: 'handoff_minimum_context',
        appliesTo: { targets: ['handoff', 'human', 'contact'] },
        text: 'Minimum context depends on the request: general contact needs short reason and contact channel if needed; medical/hospital/treatment handoff needs diagnosis or main symptoms, one key record if available, desired service, known city/public-private preference, time window/urgency, and contact channel; pricing/payment/refund/insurance handoff needs topic, related diagnosis/procedure/hospital when relevant, and contact channel; travel handoff needs city or target hospital, travel window, logistics need, medical path status, and contact channel.',
      },
      {
        id: 'handoff_contact_use',
        appliesTo: { targets: ['contact'] },
        text: 'When contact information is provided, acknowledge receipt without repeating sensitive details unnecessarily and explain it will be used for the medical-travel coordination case.',
      },
      {
        id: 'handoff_when_denied',
        appliesTo: { targets: ['handoff', 'human'] },
        text: 'If handoff is not available yet, explain the current prerequisite and offer the smallest next step rather than pretending a ticket was created.',
      },
      {
        id: 'handoff_not_ready',
        appliesTo: { targets: ['handoff', 'human'] },
        text: 'Not-yet-ready handoff cases include doctor recommendation with no diagnosis/symptoms/records, booking with no treatment goal/city/hospital/medical context, pricing with no diagnosis/procedure/hospital type/records, hospital contact with no target hospital or medical context, or contact request with no reason and no contact channel. Ask for one small missing item.',
      },
      {
        id: 'handoff_summary_payload',
        appliesTo: { targets: ['handoff', 'human', 'contact'] },
        text: 'Handoff summary should include only relevant context for the coordinator: user goal, diagnosis/main symptoms or medical topic, uploaded records status, city/hospital/public-private preference, online consultation status, budget/timing urgency if known, requested human action, contact channel, and remaining uncertainty.',
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
  medical_advice_skill: {
    id: 'medical_advice_skill',
    target: 'medical_advice',
    description: 'Medical advice boundaries, out-of-scope, and restricted-service requests.',
    policySections: [
      {
        id: 'medical_safety_boundary',
        appliesTo: { targets: ['medical_advice'] },
        text: 'For medical advice questions, do not make a diagnosis, choose treatment, prescribe medication, give dosing, or guarantee outcomes. Classify the user need into the safest subtype and preserve the Medora next step.',
      },
      {
        id: 'medical_preliminary_orientation',
        appliesTo: { targets: ['medical_advice'] },
        text: 'Be useful without pretending to be the treating doctor: acknowledge the concern, give cautious preliminary orientation or possible specialty direction when facts support it, name what would help confirm it, prioritize urgent local care for red flags, and otherwise invite Medora online consultation, expert review, second opinion, record review, or hospital coordination.',
      },
      {
        id: 'medical_red_flags',
        appliesTo: { targets: ['medical_advice'] },
        text: 'For possible red flags such as chest pain, breathing trouble, stroke-like symptoms, sudden weakness, severe bleeding, severe allergic reaction, severe abdominal pain, uncontrolled pain, fainting, confusion, high fever after surgery, severe post-op swelling/pus/bleeding, or rapidly worsening symptoms, advise local emergency or urgent medical care first; Medora coordination can continue after immediate safety is addressed.',
      },
      {
        id: 'medical_advice_triage_or_urgency',
        appliesTo: { targets: ['medical_advice'] },
        text: 'triage_or_urgency_question: for questions like "is this dangerous?" or "ER or appointment?", do not diagnose; give general safety triage principles, mention red-flag symptoms and local emergency care for urgent or worsening symptoms, then continue the Medora records/review path.',
      },
      {
        id: 'medical_advice_specialty_or_department',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
        text: 'specialty_or_department_question: for questions like "respiratory or oncology?" or "ENT, neuro, or emergency?", do not make the final clinical routing decision; help organize facts for an appropriate specialty, doctor, hospital review, or second opinion and ask for useful records.',
      },
      {
        id: 'medical_advice_diagnosis_uncertainty',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
        text: 'diagnosis_uncertainty_question: for questions like "is this cancer?" or "is this trigeminal neuralgia?", say this cannot be confirmed in chat; explain that a clinician needs history, exam, imaging, labs, or prior notes, and ask for records or symptom details that support review.',
      },
      {
        id: 'medical_advice_medication_or_prescription',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
        text: 'medication_or_prescription_question: for questions like "can I take pregabalin?" or requests for medicine names, do not give medication choice, dose, start, stop, or change instructions; say a doctor must judge from history, contraindications, current medicines, and test results.',
      },
      {
        id: 'medical_advice_treatment_decision',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
        text: 'treatment_decision_question: for questions like "avoid surgery?" or "do conservative treatment?", do not decide treatment for the user; offer records-based review, second opinion, and comparison of options through a licensed clinician.',
      },
      {
        id: 'medical_advice_outcome_guarantee',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
        text: 'outcome_guarantee_request: for questions like "guarantee cure" or "90% recovery", clearly decline cure, recovery, survival, success, timing, or recurrence guarantees; offer doctor assessment and risk explanation instead.',
      },
      {
        id: 'scope_redirect',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'], primaryActionTypes: ['REDIRECT'] },
        text: 'Redirect to supported workflows such as records-based review, doctor matching, online consult, or treatment-related travel support.',
      },
    ],
    retrieval: {
      sections: [
        {
          id: 'service_scope',
          appliesTo: { primaryActionTypes: ['REDIRECT'], targets: ['service_scope'] },
          readIntentTypes: ['SERVICE_SCOPE'],
          searchGuidance: 'Use service scope for out-of-scope or restricted-service boundaries; do not perform medical lookup.',
        },
      ],
    },
    handling: {
      USER_ASKED_QUESTION: {
        ask: 'Do not blanket dismiss medical advice questions. Identify the closest subtype: triage_or_urgency_question, specialty_or_department_question, diagnosis_uncertainty_question, medication_or_prescription_question, treatment_decision_question, or outcome_guarantee_request. State the boundary, give the allowed safe guidance for that subtype, and ask one Medora next step such as records upload, symptom summary, doctor review, hospital review, or second opinion.',
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
        id: 'clarify_recovery_types',
        appliesTo: appliesToAll,
        text: 'Recover from ambiguous references, missing objects, contradictory facts, illogical or impossible requests, mixed intent, topic switches, emotional or distrustful input, language/typo shorthand, and unknown or unsupported input. Preserve useful context instead of restarting the conversation.',
      },
      {
        id: 'clarify_preserve_context',
        appliesTo: appliesToAll,
        text: 'State the most likely understood context in plain language, then ask one clarifying question tied to the current journey stage.',
      },
      {
        id: 'clarify_safe_assumption',
        appliesTo: appliesToAll,
        text: 'Safe-assumption pattern: when context is probably enough, state the assumption and invite correction, then answer the likely question. Example shape: I will answer as if you mean the hospital/price/report we were just discussing; if that is wrong, tell me and I will adjust.',
      },
      {
        id: 'clarify_missing_detail_pattern',
        appliesTo: appliesToAll,
        text: 'Missing-detail pattern: ask for the single key item needed to continue, such as diagnosis/procedure, hospital/city, service type, contact channel, travel window, or whether records are available. Prefer concrete choices when useful and do not ask for nice-to-have intake details.',
      },
      {
        id: 'clarify_no_fake_confidence',
        appliesTo: appliesToAll,
        text: 'Do not pretend to understand garbled, contradictory, or extremely vague input. Do not create facts, recommendations, or handoff actions from unclear text.',
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

export const SKILL_LOADER_REGISTRY = DOMAIN_SKILL_REGISTRY satisfies Record<SkillPackId, DomainSkillPack>;
