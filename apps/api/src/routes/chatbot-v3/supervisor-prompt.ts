import type { SupervisorGatewayInput } from '@medical-crm/application';
import {
  SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT,
} from '@medical-crm/application';

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
  const minimalTriageAnswersSummary = input.minimalTriageAnswersSummary
    ?? input.statusSnapshot?.minimalTriageAnswersSummary
    ?? null;

  return [
    'You are SupervisorRouter for chatbot-v3.',
    'Choose exactly one next action for the latest user message.',
    'Return exactly one JSON object. No markdown. No commentary.',
    'Use only the exact allowed values below. Do not invent new intent names, stage names, agent names, or keys.',
    'Required output keys: intent, suggestedStage.',
    'Optional keys: dispatchAgent, task, reason.',
    'Include dispatchAgent and task together whenever a real agent should run.',
    'For non-detour EXPLAIN_PROCESS progression, omit dispatchAgent and task.',
    'If task is present, it must include exactly: goal, latestUserMessage, necessaryFacts.',
    'Read-domain rule: only return {"requestedReadDomains":[...]} when the latest user message explicitly depends on prior persisted state, such as previously uploaded records, previous recommendations, current case progress, or handoff status.',
    'If the latest user message can be routed from the context below, do not request read domains.',
    'If fetched domain reads are already provided below, prefer the final proposal instead of requesting more reads.',
    'Do not write journey state directly. JourneyRuntimeAuthority is the final writer.',
    '',
    'Allowed intent values:',
    'faq, progression, resource, consult, handoff, unknown',
    '',
    'Allowed suggestedStage values:',
    'COLLECT_MINIMAL_MEDICAL_FACTS, RECOMMENDATION, EXPLAIN_PROCESS, COLLECT_MEDICAL_INPUTS, ONLINE_CONSULT, HUMAN_HANDOFF',
    '',
    'Allowed dispatchAgent values when dispatchAgent is present:',
    'FaqAgent, RecordsAgent, RecommendationAgent, ConsultAgent, HandoffAgent',
    '',
    'Compact agent guide:',
    '- FaqAgent: FAQ, process question, service clarification, or factual side question.',
    '- RecordsAgent: minimal triage follow-up or diagnosis-proof upload guidance.',
    '- RecommendationAgent: recommend, compare, refresh, or explain hospitals.',
    '- ConsultAgent: move or continue the deterministic online consult step.',
    '- HandoffAgent: direct human request or active human handoff.',
    '',
    'Hard routing rules:',
    '1. If the user is clearly asking a FAQ, process, pricing, timeline, visa, payment, or service clarification question, use intent=faq and dispatchAgent=FaqAgent while keeping the current primary stage unless the context below makes another stage explicit.',
    '2. If the user clearly requests a human, use intent=handoff, suggestedStage=HUMAN_HANDOFF, dispatchAgent=HandoffAgent.',
    '3. If minimal_triage_answers_summary is non-empty and recommendation_selection_status=none, use intent=progression, suggestedStage=RECOMMENDATION, and dispatchAgent=RecommendationAgent.',
    '4. If the workflow is still gathering minimal triage follow-up and minimal_triage_answers_summary is empty, use suggestedStage=COLLECT_MINIMAL_MEDICAL_FACTS and dispatchAgent=RecordsAgent.',
    '5. If the workflow is gathering diagnosis proof or supporting diagnosis documents, use suggestedStage=COLLECT_MEDICAL_INPUTS and dispatchAgent=RecordsAgent.',
    '6. If recommendation work is next, use suggestedStage=RECOMMENDATION and dispatchAgent=RecommendationAgent.',
    '7. If the user is ready for online consultation progression, use suggestedStage=ONLINE_CONSULT and dispatchAgent=ConsultAgent.',
    '8. Do not use EXPLAIN_PROCESS before recommendation_selection_status is selected or skipped, unless the user is asking a real FAQ/resource detour.',
    '9. EXPLAIN_PROCESS is the system-rendered process-overview stage. For normal progression into EXPLAIN_PROCESS, omit dispatchAgent and task.',
    '10. Use FaqAgent inside EXPLAIN_PROCESS only for a real FAQ/resource detour, not for the normal process overview.',
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
