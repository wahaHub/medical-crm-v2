import type { SupervisorEventType, SupervisorGatewayInput } from '@medical-crm/application';
import {
  getAllowedSupervisorEvents as getApplicationAllowedSupervisorEvents,
} from '@medical-crm/application';

export const SUPERVISOR_PROMPT_VERSION = 'supervisor-prompt-v3-events';

type SemanticSupervisorEventType = Exclude<
  SupervisorEventType,
  | 'TRIAGE_SUBMITTED'
  | 'TRIAGE_SKIPPED'
  | 'RECOMMENDATION_SELECTED'
  | 'RECOMMENDATION_SKIPPED'
  | 'DOCUMENTS_UPLOADED'
  | 'USER_REQUESTED_HUMAN'
>;

const SEMANTIC_EVENT_CLASSIFICATION_GUIDE: Record<SemanticSupervisorEventType, string> = {
  USER_ASKED_NEXT_STEP: 'user explicitly asks what to do next.',
  USER_ASKED_FAQ: 'user asks about process, price, documents, timeline, hospital selection, travel support, or Medora service details.',
  USER_WANTS_TREATMENT_IN_CHINA: 'user wants treatment in China or asks whether China treatment is possible.',
  USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING: 'user asks to find, recommend, or compare doctors or hospitals.',
  USER_PROVIDED_MEDICAL_FACTS: 'user provides diagnosis, symptoms, treatment history, imaging/pathology, or document availability.',
  USER_INTERESTED_IN_CONSULT: 'user asks for online consultation, appointment, doctor call, or scheduling.',
  USER_REJECTED_OR_HESITATED: 'user hesitates, declines, asks to think about it, objects to price, or refuses documents or contact details.',
  USER_PROVIDED_CONTACT_INFO: 'user provides direct contact information such as phone, email, WeChat, WhatsApp, or another contact handle.',
  USER_ASKED_RISKY_MEDICAL_ADVICE: 'user asks for diagnosis, treatment decision, medication advice, urgent medical judgment, or cure guarantee.',
  USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE: 'user asks for unsupported service outside Medora scope.',
  USER_AMBIGUOUS_REPLY: 'latest message is vague and cannot be mapped confidently.',
  UNKNOWN_MESSAGE: 'no allowed event fits.',
};

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

  return [
    'You are SupervisorRouter for chatbot-v3.',
    'Your only job is to classify the latest user message into one allowed eventType.',
    'Return exactly one JSON object matching the provided schema. No markdown. No commentary.',
    'Required keys: eventType, confidence.',
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
    'If uncertain, use USER_AMBIGUOUS_REPLY or UNKNOWN_MESSAGE.',
    '',
    'Context:',
    `current_stage=${input.currentStage}`,
    `latest_user_message=${input.latestUserMessage}`,
    `conversation_summary=${input.conversationSummary}`,
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
