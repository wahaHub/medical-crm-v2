import type { SemanticSupervisorEventType, SupervisorEventType, SupervisorGatewayInput } from '@medical-crm/application';
import {
  getAllowedSupervisorEvents as getApplicationAllowedSupervisorEvents,
} from '@medical-crm/application';

export const SUPERVISOR_PROMPT_VERSION = 'supervisor-prompt-v3-events';

const SEMANTIC_EVENT_CLASSIFICATION_GUIDE: Record<SemanticSupervisorEventType, string> = {
  USER_EXPRESSED_INTEREST: 'user expresses a service goal or desire, such as treatment in China, hospital matching, pricing, travel support, or Medora help.',
  USER_ASKED_QUESTION: 'user asks an informational question about service scope, policy, medical advice, hospital, treatment, pricing, payment, travel, sales, FAQ, or handoff.',
  USER_PROVIDED_INFORMATION: 'user gives facts, preferences, records, medical details, document availability, or contact information.',
  USER_RESPONDED_TO_REQUEST: 'user replies to the previous assistant request or CTA; use last_question context when available.',
  USER_REQUESTED_ACTION: 'user asks Medora to do something, such as arrange, prepare, compare, estimate, schedule, or hand off.',
  USER_REQUESTED_HUMAN: 'user asks to speak with a human, coordinator, advisor, staff member, or asks to be contacted.',
  USER_MESSAGE_UNCLEAR: 'no allowed event fits or the latest message is too vague to map confidently.',
};

const EVENT_TARGET_MODIFIER_BOUNDARY_GUIDE = [
  'eventType is the user action shape.',
  'target is the business domain / skill-aligned topic.',
  'modifier is the user posture.',
  'Do not create skill-specific event types.',
  'A medical, pricing, hospital, travel, payment, sales, or policy question can all be USER_ASKED_QUESTION; the domain difference belongs in target.',
].join('\n');

const DETAILED_SEMANTIC_EVENT_GUIDE = [
  'USER_EXPRESSED_INTEREST: goal/desire, not a concrete action.',
  'USER_ASKED_QUESTION: information/explanation/feasibility/policy/medical-orientation question.',
  'USER_PROVIDED_INFORMATION: facts, files, contact details, corrections.',
  'USER_RESPONDED_TO_REQUEST: answer to previous assistant request.',
  'USER_REQUESTED_ACTION: operational request for Medora to do something.',
  'USER_REQUESTED_HUMAN: explicit human/coordinator/contact request, always target=handoff.',
  'USER_MESSAGE_UNCLEAR: too unclear to classify safely.',
].join('\n');

const MEDORA_SUPPORTED_SERVICE_SCOPE = [
  'understanding the patient\'s condition, destination, timing, preferences, and contact details',
  'collecting or explaining needed medical records and supporting documents',
  'matching the patient with hospitals, doctors, packages, or treatment-path options',
  'explaining Medora process, pricing, payments, timelines, travel logistics, or document requirements when related to treatment coordination',
  'arranging or preparing records-based review, online consults, appointments, or human coordinator handoff for the medical-travel case',
] as const;

function isSemanticSupervisorEventType(eventType: SupervisorEventType): eventType is SemanticSupervisorEventType {
  return eventType in SEMANTIC_EVENT_CLASSIFICATION_GUIDE;
}

function buildAllowedEventClassificationGuide(allowedEvents: readonly SupervisorEventType[]) {
  return allowedEvents
    .filter(isSemanticSupervisorEventType)
    .map((eventType) => `${eventType}: ${SEMANTIC_EVENT_CLASSIFICATION_GUIDE[eventType]}`);
}

export function buildSupervisorPrompt(input: SupervisorGatewayInput): string {
  const supportingDocuments = input.supportingDocuments ?? input.statusSnapshot?.supportingDocuments ?? [];
  const recommendationSelectionStatus = input.recommendationSelectionStatus
    ?? input.statusSnapshot?.recommendationSelectionStatus
    ?? 'none';
  const processExplained = input.processExplained
    ?? input.statusSnapshot?.processExplained
    ?? false;
  const allowedEvents = getAllowedSupervisorEvents(input);
  const allowedEventGuide = buildAllowedEventClassificationGuide(allowedEvents);
  const lastQuestion = (input as SupervisorGatewayInput & {
    lastQuestion?: { questionType?: string | null; expectedAnswerType?: string | null };
  }).lastQuestion;

  return [
    'You are SupervisorRouter for chatbot-v3.',
    'Your only job is to classify the latest user message into one allowed eventType, target, and modifier.',
    'Return exactly one JSON object matching the provided schema. No markdown. No commentary.',
    'Required keys: eventType, target, modifier, confidence.',
    '',
    'You may only return one of these allowed eventType values:',
    allowedEvents.join(', '),
    '',
    'Classification guide:',
    ...allowedEventGuide,
    '',
    EVENT_TARGET_MODIFIER_BOUNDARY_GUIDE,
    '',
    'Semantic event guide:',
    DETAILED_SEMANTIC_EVENT_GUIDE,
    '',
    'Important:',
    'If an event is not in the allowed list for this turn, do not return it.',
    'If multiple events seem possible, choose the primary user intent.',
    'medical-advice questions use USER_ASKED_QUESTION with target=medical_advice.',
    'outside Medora scope uses target=service_scope.',
    'USER_REQUESTED_HUMAN always uses target=handoff.',
    'Do not represent human requests as modifier=request_action.',
    'Medora supported service scope:',
    ...MEDORA_SUPPORTED_SERVICE_SCOPE.map((item) => `- ${item}.`),
    'Classify requests for a service outside that supported scope as USER_ASKED_QUESTION or USER_REQUESTED_ACTION with target=service_scope.',
    'Classify guarantee/promise/ensure outcome wording as USER_ASKED_QUESTION with target=medical_advice, not USER_EXPRESSED_INTEREST.',
    'If uncertain, use USER_MESSAGE_UNCLEAR with target=unknown and modifier=unknown.',
    '',
    'Target guide: service_scope, policy, medical_advice, hospital, treatment, pricing, payment, travel, sales, faq, handoff, unknown.',
    'Modifier guide: ask, provide, confirm, reject, hesitate, correct, compare, revisit, request_action, urgent, unknown.',
    '',
    'Context:',
    `current_stage=${input.currentStage}`,
    `latest_user_message=${input.latestUserMessage}`,
    `conversation_summary=${input.conversationSummary}`,
    `recent_messages=${JSON.stringify(input.recentMessages ?? [])}`,
    `last_question_type=${lastQuestion?.questionType ?? ''}`,
    `last_question_expected_answer_type=${lastQuestion?.expectedAnswerType ?? ''}`,
    `known_condition=${input.intake.condition ?? ''}`,
    `known_destination=${input.intake.targetDestination ?? ''}`,
    `recommendation_status=${recommendationSelectionStatus}`,
    `process_explained=${processExplained}`,
    `supporting_documents_count=${supportingDocuments.length}`,
  ].join('\n');
}

export function getAllowedSupervisorEvents(input: SupervisorGatewayInput): readonly SupervisorEventType[] {
  return getApplicationAllowedSupervisorEvents(input);
}
