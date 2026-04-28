import type { SemanticSupervisorEventType, SupervisorEventType, SupervisorGatewayInput } from '@medical-crm/application';
import {
  getAllowedSupervisorEvents as getApplicationAllowedSupervisorEvents,
} from '@medical-crm/application';

export const SUPERVISOR_PROMPT_VERSION = 'supervisor-prompt-v3-events';

const SEMANTIC_EVENT_CLASSIFICATION_GUIDE: Record<SemanticSupervisorEventType, string> = {
  USER_EXPRESSED_NEED: 'user asks for a result, service, or goal, such as treatment in China, hospital recommendation, consult, or human help.',
  USER_ASKED_QUESTION: 'user asks a question about next step, process, pricing, documents, payment, travel, hospital, or consult.',
  USER_PROVIDED_INFORMATION: 'user gives facts, preferences, records, medical details, document availability, or contact information.',
  USER_RESPONDED_TO_REQUEST: 'user replies to the previous assistant request or CTA; use last_question context when available.',
  USER_REQUESTED_HUMAN: 'user asks to speak with a human, coordinator, advisor, staff member, or asks to be contacted.',
  USER_ASKED_RISKY_MEDICAL_ADVICE: 'user asks for diagnosis, treatment decision, medication advice, urgent medical judgment, or outcome guarantee.',
  USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE: 'user asks Medora to perform a service that is not part of the supported medical-travel coordination workflows listed below.',
  USER_MESSAGE_UNCLEAR: 'no allowed event fits or the latest message is too vague to map confidently.',
};

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
    'Important:',
    'If an event is not in the allowed list for this turn, do not return it.',
    'If multiple events seem possible, choose the primary user intent.',
    'Medora supported service scope:',
    ...MEDORA_SUPPORTED_SERVICE_SCOPE.map((item) => `- ${item}.`),
    'Classify requests for a service outside that supported scope as USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE.',
    'Classify guarantee/promise/ensure outcome wording as USER_ASKED_RISKY_MEDICAL_ADVICE, not USER_EXPRESSED_NEED.',
    'If uncertain, use USER_MESSAGE_UNCLEAR with target=unknown and modifier=unknown.',
    '',
    'Target guide: treatment, recommendation, documents, consult, pricing, next_step, process, travel, payment, hospital, hospital_selection, medical_facts, contact, human, unknown.',
    'Modifier guide: ask, provide, confirm, reject, hesitate, revisit, unknown.',
    '',
    'Context:',
    `current_stage=${input.currentStage}`,
    `latest_user_message=${input.latestUserMessage}`,
    `conversation_summary=${input.conversationSummary}`,
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
