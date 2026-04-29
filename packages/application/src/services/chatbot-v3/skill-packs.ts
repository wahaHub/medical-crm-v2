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
  | 'faq_skill'
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
  | 'faq'
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
        id: 'service_scope_redirect',
        appliesTo: { targets: ['service_scope'], primaryActionTypes: ['REDIRECT'] },
        text: 'For requests outside Medora-supported medical travel, briefly state the boundary and offer the closest supported medical-travel alternative without debating the unrelated request.',
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
        id: 'process_travel_scope',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
        text: 'For travel logistics, stay within treatment-related support such as visa timing context, flights, hotels, local transport, hospital appointment logistics, and travel document preparation. Do not offer unrelated immigration, housing, school, job, or legal services.',
      },
      {
        id: 'process_payment_scope',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
        text: 'For payment questions, explain payment timing, methods, deposits, refunds, and billing uncertainty only from retrieved payment policy. Do not invent discounts, fixed totals, guarantees, or financing terms.',
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
          id: 'policy_sources',
          appliesTo: { targets: ['policy', 'process', 'next_step'] },
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
  faq_skill: {
    id: 'faq_skill',
    target: 'faq',
    description: 'Online consult questions and consult readiness.',
    policySections: [
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
  handoff_skill: {
    id: 'handoff_skill',
    target: 'handoff',
    description: 'Human coordinator requests and contact information.',
    policySections: [
      {
        id: 'handoff_confirm',
        appliesTo: { targets: ['human', 'contact'] },
        text: 'Confirm the handoff and summarize what will be passed to the coordinator.',
      },
      {
        id: 'handoff_contact_use',
        appliesTo: { targets: ['contact'] },
        text: 'When contact information is provided, acknowledge receipt without repeating sensitive details unnecessarily and explain it will be used for the medical-travel coordination case.',
      },
      {
        id: 'handoff_when_denied',
        appliesTo: { targets: ['human'] },
        text: 'If handoff is not available yet, explain the current prerequisite and offer the smallest next step rather than pretending a ticket was created.',
      },
      {
        id: 'handoff_summary_payload',
        appliesTo: { targets: ['human', 'contact'] },
        text: 'Summarize only relevant context for the coordinator: condition summary, current stage, documents status, recommendation or consult status, and user request.',
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
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
        text: 'For medical advice questions, do not make a diagnosis, choose treatment, prescribe medication, give dosing, or guarantee outcomes. Classify the user need into the safest subtype and preserve the Medora next step.',
      },
      {
        id: 'medical_advice_triage_or_urgency',
        appliesTo: { eventTypes: ['USER_ASKED_QUESTION'] },
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
          appliesTo: { primaryActionTypes: ['REDIRECT'] },
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
        id: 'clarify_preserve_context',
        appliesTo: appliesToAll,
        text: 'State the most likely understood context in plain language, then ask one clarifying question tied to the current journey stage.',
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
