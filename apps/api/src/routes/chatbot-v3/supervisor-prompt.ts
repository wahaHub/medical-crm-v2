import type { SupervisorEventType, SupervisorGatewayInput } from '@medical-crm/application';
import {
  getAllowedSupervisorEvents as getApplicationAllowedSupervisorEvents,
  SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT,
} from '@medical-crm/application';

export const SUPERVISOR_PROMPT_VERSION = 'supervisor-prompt-v3-events';

const EVENT_CLASSIFICATION_GUIDE: Record<SupervisorEventType, string> = {
  TRIAGE_SUBMITTED: 'frontend action submitted minimal triage answers.',
  TRIAGE_SKIPPED: 'frontend action skipped minimal triage.',
  RECOMMENDATION_SELECTED: 'frontend action selected a recommendation.',
  RECOMMENDATION_SKIPPED: 'frontend action skipped recommendations.',
  DOCUMENTS_UPLOADED: 'runtime detected uploaded supporting documents.',
  USER_REQUESTED_HUMAN: 'user asks to speak with a human, coordinator, advisor, staff member, or asks to be contacted.',
  USER_ASKED_NEXT_STEP: 'user explicitly asks what to do next.',
  USER_ASKED_FAQ: 'user asks about process, price, documents, timeline, hospital selection, travel support, or Medora service details.',
  USER_WANTS_TREATMENT_IN_CHINA: 'user wants treatment in China or asks whether China treatment is possible.',
  USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING: 'user asks to find, recommend, or compare doctors or hospitals.',
  USER_PROVIDED_MEDICAL_FACTS: 'user provides diagnosis, symptoms, treatment history, imaging/pathology, or document availability.',
  USER_INTERESTED_IN_CONSULT: 'user asks for online consultation, appointment, doctor call, or scheduling.',
  USER_ASKED_RISKY_MEDICAL_ADVICE: 'user asks for diagnosis, treatment decision, medication advice, urgent medical judgment, or cure guarantee.',
  USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE: 'user asks for unsupported service outside Medora scope.',
  USER_AMBIGUOUS_REPLY: 'latest message is vague and cannot be mapped confidently.',
  UNKNOWN_MESSAGE: 'no allowed event fits.',
};

function buildAllowedEventClassificationGuide(allowedEvents: readonly SupervisorEventType[]) {
  return allowedEvents.map((eventType) => `${eventType}: ${EVENT_CLASSIFICATION_GUIDE[eventType]}`);
}

export function buildSupervisorPrompt(input: SupervisorGatewayInput): string {
  const supportingDocuments = input.supportingDocuments ?? input.statusSnapshot?.supportingDocuments ?? [];
  const supportingDocumentsSummary = supportingDocuments.length === 0
    ? '[]'
    : JSON.stringify(supportingDocuments.map((document) => ({
        name: document.name,
      })));
  const recommendationSelectionStatus = input.recommendationSelectionStatus
    ?? input.statusSnapshot?.recommendationSelectionStatus
    ?? 'none';
  const selectedHospitalIds = input.recommendationSelectedHospitalIds
    ?? input.statusSnapshot?.recommendationSelectedHospitalIds
    ?? [];
  const processExplained = input.processExplained
    ?? input.statusSnapshot?.processExplained
    ?? false;
  const minimalTriageAnswersSummary = input.minimalTriageAnswersSummary
    ?? input.statusSnapshot?.minimalTriageAnswersSummary
    ?? null;
  const allowedEvents = getAllowedSupervisorEvents(input);
  const allowedEventGuide = buildAllowedEventClassificationGuide(allowedEvents);

  return [
    'You are SupervisorRouter for chatbot-v3.',
    'Classify the latest user message into exactly one allowed SupervisorEvent.',
    'Return exactly one SupervisorEvent JSON object. No markdown. No commentary.',
    'Required keys: eventType, confidence, source.',
    'source must be "llm". confidence is non-authoritative.',
    'Do not include metadata in the current strict schema.',
    'Do not return suggestedStage, dispatchAgent, task, intent, requestedReadDomains, or write patches.',
    'Do not decide workflow state, agent dispatch, persistence writes, or reducer output.',
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
    'Conversation Summary Contract:',
    `owner=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.owner}`,
    `refresh_trigger=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.refreshTrigger}`,
    `size_discipline=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.sizeDiscipline}`,
    `freshness=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.freshness}`,
    `persistence_strategy=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.persistenceStrategy}`,
    '',
    'Minimal context:',
    `current_stage=${input.currentStage}`,
    `conversation_summary=${input.conversationSummary}`,
    `latest_user_message=${input.latestUserMessage}`,
    `intake_condition=${input.intake.condition ?? ''}`,
    `intake_target_destination=${input.intake.targetDestination ?? ''}`,
    `intake_language=${input.intake.language ?? ''}`,
    `intake_gender=${input.intake.gender ?? ''}`,
    `minimal_triage_answers_summary=${minimalTriageAnswersSummary ?? ''}`,
    '',
    'Structured post-recommendation state:',
    `recommendation_selection_status=${recommendationSelectionStatus}`,
    `process.explained=${processExplained}`,
    `selected_hospital_ids=${JSON.stringify(selectedHospitalIds)}`,
    `supporting_documents_count=${supportingDocuments.length}`,
    `supporting_documents=${supportingDocumentsSummary}`,
  ].join('\n');
}

export function getAllowedSupervisorEvents(input: SupervisorGatewayInput): readonly SupervisorEventType[] {
  return getApplicationAllowedSupervisorEvents(input);
}
