import type { SupervisorGatewayInput } from '@medical-crm/application';
import {
  SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT,
} from '@medical-crm/application';
import { renderSupervisorAgentRegistry } from '@medical-crm/application';

export const SUPERVISOR_PROMPT_VERSION = 'supervisor-prompt-v2';

export function buildSupervisorPrompt(input: SupervisorGatewayInput): string {
  const fetchedDomainReads = input.domainReadResults
    ? Object.entries(input.domainReadResults)
      .map(([domain, value]) => `${domain}=${JSON.stringify(value)}`)
      .join('\n')
    : 'none';
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

  return [
    'You are the Supervisor, the main agent for chatbot-v3.',
    'Decide what should happen next and which agent should act.',
    'Start from minimal context only. Do not assume hidden history or a large facts bundle.',
    'Return a single JSON object only.',
    'The object must include: intent, suggestedStage, dispatchAgent, reason, task.',
    'The task object must include: goal, latestUserMessage, necessaryFacts.',
    'If you truly need more state first, you may instead return {"requestedReadDomains":["records.status"],"reason":"..."} using only allowed domains and requesting at most two.',
    'If fetched domain reads are already provided below, do not request more reads unless the second read is truly necessary. Otherwise return the final proposal contract.',
    'Do not write journey state directly. JourneyRuntimeAuthority is the final writer.',
    '',
    'Conversation Summary Contract:',
    `owner=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.owner}`,
    `refresh_trigger=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.refreshTrigger}`,
    `size_discipline=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.sizeDiscipline}`,
    `freshness=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.freshness}`,
    `persistence_strategy=${SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT.persistenceStrategy}`,
    '',
    'Available domain reads:',
    input.availableReadDomains.join(', ') || 'none',
    '',
    'Fetched domain read results:',
    fetchedDomainReads,
    '',
    'Supervisor-facing agent registry:',
    renderSupervisorAgentRegistry(),
    '',
    'Minimal context:',
    `current_stage=${input.currentStage}`,
    `conversation_summary=${input.conversationSummary}`,
    `latest_user_message=${input.latestUserMessage}`,
    `intake_condition=${input.intake.condition ?? ''}`,
    `intake_target_destination=${input.intake.targetDestination ?? ''}`,
    `intake_language=${input.intake.language ?? ''}`,
    `intake_gender=${input.intake.gender ?? ''}`,
    '',
    'Structured post-recommendation state:',
    `recommendation_selection_status=${recommendationSelectionStatus}`,
    `process.explained=${processExplained}`,
    `selected_hospital_ids=${JSON.stringify(selectedHospitalIds)}`,
    `supporting_documents_count=${supportingDocuments.length}`,
    `supporting_documents=${supportingDocumentsSummary}`,
  ].join('\n');
}
