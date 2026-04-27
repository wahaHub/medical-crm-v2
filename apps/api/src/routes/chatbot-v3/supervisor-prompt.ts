import type { SupervisorEventType, SupervisorGatewayInput } from '@medical-crm/application';
import {
  getAllowedSupervisorEvents as getApplicationAllowedSupervisorEvents,
  SUPERVISOR_EVENT_TYPES,
  SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT,
} from '@medical-crm/application';

export const SUPERVISOR_PROMPT_VERSION = 'supervisor-prompt-v3-events';

export function buildSupervisorPrompt(input: SupervisorGatewayInput): string {
  const supportingDocuments = input.supportingDocuments ?? input.statusSnapshot?.supportingDocuments ?? [];
  const supportingDocumentsSummary = supportingDocuments.length === 0
    ? '[]'
    : JSON.stringify(supportingDocuments.map((document) => ({
        name: document.name,
        path: document.path,
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
  const allowedEvents = getAllowedSupervisorEvents(input).join(', ');
  const allEvents = SUPERVISOR_EVENT_TYPES.join(', ');

  return [
    'You are SupervisorRouter for chatbot-v3.',
    'Extract the semantic event from the latest user message only.',
    'Return exactly one SupervisorEvent JSON object. No markdown. No commentary.',
    'Required keys: eventType, confidence, source.',
    'source must be "llm". confidence is non-authoritative.',
    'Do not include metadata in the current strict schema.',
    'Do not return suggestedStage, dispatchAgent, task, intent, requestedReadDomains, or write patches.',
    'Do not decide workflow state, agent dispatch, persistence writes, or reducer output.',
    '',
    'Allowed eventType values:',
    allEvents,
    '',
    'Allowed events for this turn:',
    allowedEvents,
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
