import type {
  AiChatStatusSnapshot,
} from '@medical-crm/domain';
import type {
  ChatbotV3Card,
  ChatbotV3ChatRequest,
  ChatbotV3ChatResponse,
} from '@medical-crm/validation';
import type {
  ConversationOrchestratorV3TurnResult,
} from './runtime.service.js';
import type {
  ToolResult,
} from './tool-gateway.js';
import {
  RECORDS_DIAGNOSIS_PROOF_UPLOAD_GUIDANCE,
} from './records-prompts.js';

export interface ResponseComposerInput {
  body: ChatbotV3ChatRequest;
  result: ConversationOrchestratorV3TurnResult;
  sessionStatusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined;
  includeRuntimeDebug?: boolean;
}

export const PROCESS_OVERVIEW_TEXT = 'Here is the process: first, review the hospital recommendation, then I will explain the Medora medical-travel process and policy, then you can upload supporting documents, and after that we can move toward online consult.';
const FAQ_DEGRADED_TEXT = 'I could not load that FAQ answer just now, but your current stage is still saved. Please try asking again.';
const RECOMMENDATION_DEGRADED_TEXT = 'I could not refresh the hospital recommendations just now, but your current stage is still saved. Please try again in this chat.';
const CONSULT_DEGRADED_TEXT = 'I could not complete the consultation step just now, but your current stage is still saved. Please try again in this chat.';
const HANDOFF_DENIED_TEXT = 'Before we connect you with a human, please complete the current step first.';
const GENERIC_DEGRADED_TEXT = 'I could not complete the requested step, but your v3 journey state is preserved.';

export function didShowExplicitProcessExplanation(
  result: ConversationOrchestratorV3TurnResult,
): boolean {
  return result.turnOutcome.status === 'ok'
    && result.render.path === 'PROCESS_OVERVIEW';
}

export function composeResponse(input: ResponseComposerInput): ChatbotV3ChatResponse {
  const effectiveStatusSnapshot = buildEffectiveStatusSnapshot(
    input.sessionStatusSnapshot,
    input.result.writeIntents?.statusPatch,
  );
  const visibleJourney = buildVisibleJourney(
    input.result.journey,
    input.sessionStatusSnapshot,
    input.result.writeIntents?.statusPatch,
  );

  const response: ChatbotV3ChatResponse = {
    messages: [{
      role: 'assistant',
      text: buildAssistantText(input.result, effectiveStatusSnapshot),
    }],
    turnOutcome: input.result.turnOutcome,
    cards: buildCards(input.body, input.result, effectiveStatusSnapshot),
    journey: visibleJourney,
    handoff: {
      required: visibleJourney.stage === 'HUMAN_HANDOFF'
        || hasActiveHandoffStatus(effectiveStatusSnapshot)
        || hasCrisisSafetySignal(effectiveStatusSnapshot),
      ticketId: readHandoffId(input.result.dispatchResult),
    },
  };

  if (input.includeRuntimeDebug) {
    response.runtimeDebug = {
      traceId: input.result.runtimeDebug.traceId,
      idempotencyKey: input.result.runtimeDebug.idempotencyKey,
      ...(input.result.runtimeDebug.lastDispatchSource
        ? { lastDispatchSource: input.result.runtimeDebug.lastDispatchSource }
        : {}),
      ...(input.result.runtimeDebug.replayLineage
        ? { replayLineage: input.result.runtimeDebug.replayLineage }
        : {}),
    };
  }

  return response;
}

export function buildAssistantText(
  result: ConversationOrchestratorV3TurnResult,
  statusSnapshot?: Partial<AiChatStatusSnapshot> | null | undefined,
): string {
  const guidanceFamily = classifyGuidanceFamily(result);
  if (guidanceFamily) {
    return renderGuidanceFamilyText(guidanceFamily);
  }

  if (result.render.path === 'FAQ_ANSWER') {
    return readFaqAnswer(result) ?? 'I checked the explain process stage for this session.';
  }

  if (result.render.path === 'PROCESS_OVERVIEW') {
    return PROCESS_OVERVIEW_TEXT;
  }

  const recordsAssistantText = readRecordsAssistantText(result);
  if (recordsAssistantText) {
    return recordsAssistantText;
  }

  const recommendationAssistantText = readRecommendationAssistantText(result, statusSnapshot);
  if (recommendationAssistantText) {
    return recommendationAssistantText;
  }

  switch (result.journey.stage) {
    case 'EXPLAIN_PROCESS':
      return 'I checked the explain process stage for this session.';
    case 'COLLECT_MINIMAL_MEDICAL_FACTS':
      return buildMinimalTriageOpeningText(statusSnapshot);
    case 'COLLECT_MEDICAL_INPUTS':
      return RECORDS_DIAGNOSIS_PROOF_UPLOAD_GUIDANCE;
    case 'RECOMMENDATION':
      return 'I checked the recommendation stage for this session.';
    case 'ONLINE_CONSULT':
      return 'I checked the online consultation stage for this session.';
    case 'HUMAN_HANDOFF':
      return 'This session is currently in human handoff.';
  }
}

type GuidanceFamily =
  | 'FAQ_DEGRADED'
  | 'RECOMMENDATION_DEGRADED'
  | 'CONSULT_DEGRADED'
  | 'HANDOFF_DENIED'
  | 'GENERIC_DEGRADED';

function classifyGuidanceFamily(
  result: ConversationOrchestratorV3TurnResult,
): GuidanceFamily | null {
  if (result.turnOutcome.status !== 'degraded') {
    return isDeniedSemanticHandoff(result) ? 'HANDOFF_DENIED' : null;
  }

  if (result.decision.dispatchAgent === 'FaqAgent') {
    return 'FAQ_DEGRADED';
  }

  const attemptedGuidanceFamily = classifyAttemptedDegradedGuidanceFamily(result);
  if (attemptedGuidanceFamily) {
    return attemptedGuidanceFamily;
  }

  const preservedStageGuidanceFamily = classifyPreservedStageDegradedGuidanceFamily(result);
  if (preservedStageGuidanceFamily) {
    return preservedStageGuidanceFamily;
  }

  return 'GENERIC_DEGRADED';
}

function renderGuidanceFamilyText(
  family: GuidanceFamily,
): string {
  switch (family) {
    case 'FAQ_DEGRADED':
      return FAQ_DEGRADED_TEXT;
    case 'RECOMMENDATION_DEGRADED':
      return RECOMMENDATION_DEGRADED_TEXT;
    case 'CONSULT_DEGRADED':
      return CONSULT_DEGRADED_TEXT;
    case 'HANDOFF_DENIED':
      return HANDOFF_DENIED_TEXT;
    case 'GENERIC_DEGRADED':
      return GENERIC_DEGRADED_TEXT;
  }
}

function isDeniedSemanticHandoff(
  result: ConversationOrchestratorV3TurnResult,
): boolean {
  return result.turnOutcome.status !== 'degraded'
    && result.suggestion.intent === 'handoff'
    && result.decision.action !== 'HANDOFF'
    && !result.decision.dispatchAgent
    && result.journey.stage !== 'HUMAN_HANDOFF';
}

function classifyAttemptedDegradedGuidanceFamily(
  result: ConversationOrchestratorV3TurnResult,
): GuidanceFamily | null {
  if (result.decision.dispatchAgent === 'ConsultAgent'
    || result.suggestion.intent === 'consult'
    || result.suggestion.suggestedStage === 'ONLINE_CONSULT') {
    return 'CONSULT_DEGRADED';
  }

  if (result.decision.dispatchAgent === 'RecommendationAgent'
    || result.suggestion.suggestedStage === 'RECOMMENDATION') {
    return 'RECOMMENDATION_DEGRADED';
  }

  return null;
}

function classifyPreservedStageDegradedGuidanceFamily(
  result: ConversationOrchestratorV3TurnResult,
): GuidanceFamily | null {
  if (
    result.journey.stage === 'ONLINE_CONSULT'
    && result.suggestion.intent !== 'handoff'
    && result.suggestion.suggestedStage !== 'HUMAN_HANDOFF'
  ) {
    return 'CONSULT_DEGRADED';
  }

  if (
    result.journey.stage === 'RECOMMENDATION'
    && result.suggestion.intent !== 'consult'
    && result.suggestion.intent !== 'handoff'
    && result.suggestion.suggestedStage !== 'ONLINE_CONSULT'
    && result.suggestion.suggestedStage !== 'HUMAN_HANDOFF'
  ) {
    return 'RECOMMENDATION_DEGRADED';
  }

  return null;
}

function readFaqAnswer(
  result: ConversationOrchestratorV3TurnResult,
): string | null {
  if (result.decision.dispatchAgent !== 'FaqAgent') {
    return null;
  }

  if (result.dispatchResult?.status !== 'ok') {
    return null;
  }

  const data = asRecord(result.dispatchResult.data);
  const answer = asString(data['answer']);
  const citedFaqIds = asArray(data['citedFaqIds'])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);
  const confidence = asString(data['confidence']);

  if (citedFaqIds.length === 0 || confidence === 'low') {
    return null;
  }

  if (!answer) {
    return null;
  }

  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRecordsAssistantText(
  result: ConversationOrchestratorV3TurnResult,
): string | null {
  if (result.decision.dispatchAgent !== 'RecordsAgent') {
    return null;
  }

  if (result.dispatchResult?.status !== 'ok') {
    return null;
  }

  const data = asRecord(result.dispatchResult.data);
  if (result.journey.stage === 'COLLECT_MEDICAL_INPUTS') {
    return asString(data['collectionPrompt']);
  }

  if (result.journey.stage !== 'COLLECT_MINIMAL_MEDICAL_FACTS') {
    return null;
  }

  if (data['records.minimal_triage.complete'] !== false) {
    return null;
  }

  const followUp = asString(data['followUp']);
  const questions = asArray(data['questions'])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((question, index) => `${index + 1}. ${question.trim()}`);

  if (!followUp && questions.length === 0) {
    return null;
  }

  return [followUp, questions.join('\n')]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n');
}

function readRecommendationAssistantText(
  result: ConversationOrchestratorV3TurnResult,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): string | null {
  if (result.decision.dispatchAgent !== 'RecommendationAgent') {
    return null;
  }

  if (result.dispatchResult?.status !== 'ok') {
    return null;
  }

  if (result.journey.stage !== 'RECOMMENDATION' && result.suggestion.suggestedStage !== 'RECOMMENDATION') {
    return null;
  }

  const data = asRecord(result.dispatchResult.data);
  const recommendationTask = asString(data['recommendationTask']);
  if (recommendationTask === 'generate') {
    return buildRecommendationGenerateText(statusSnapshot);
  }

  if (recommendationTask !== 'compare' && recommendationTask !== 'explain') {
    return null;
  }

  return asString(data['explanation']);
}

function buildMinimalTriageOpeningText(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): string {
  if (statusSnapshot?.minimalTriageStatus === 'pending') {
    return 'We already received your basic intake. Please answer these 3 follow-up questions so we can refine your recommendation, or you can skip them if you prefer.';
  }

  return 'Please share the key medical facts and any records you already have so I can guide the next step.';
}

function buildRecommendationGenerateText(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): string | null {
  if (asString(statusSnapshot?.minimalTriageAnswersSummary)) {
    return 'This recommendation is based on your submitted intake and the follow-up medical details you just shared.';
  }

  if (statusSnapshot?.minimalTriageStatus === 'skipped') {
    return 'This is an initial recommendation based on your submitted intake alone, and it can be refined later if you share more medical detail.';
  }

  return null;
}

function buildCards(
  body: ChatbotV3ChatRequest,
  result: ConversationOrchestratorV3TurnResult,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): ChatbotV3Card[] {
  switch (result.journey.stage) {
    case 'EXPLAIN_PROCESS':
      return [{
        cardId: 'card-process-guide',
        cardType: 'PROCESS_GUIDE',
        payload: {
          guideId: 'medical-travel-process',
          title: 'Medical travel process',
        },
        actions: [{
          actionType: 'OPEN_MODAL',
          label: 'View process',
          params: {
            modalKey: 'MEDICAL_TRAVEL_PROCESS',
          },
        }],
      }];
    case 'COLLECT_MINIMAL_MEDICAL_FACTS':
    case 'COLLECT_MEDICAL_INPUTS':
      return [{
        cardId: 'card-upload-records',
        cardType: 'UPLOAD_RECORDS',
        payload: {
          required: true,
          uploadedCount: readUploadedCount(body, statusSnapshot, result.journey.stage),
        },
        actions: [],
      }];
    case 'RECOMMENDATION':
      return [{
        cardId: 'card-recommendations',
        cardType: 'RECOMMENDATION_LIST',
        payload: {
          candidates: readRecommendations(result.dispatchResult),
        },
        actions: buildRecommendationActions(result.dispatchResult),
      }];
    case 'ONLINE_CONSULT':
      return [{
        cardId: 'card-consult-booking',
        cardType: 'CONSULT_BOOKING',
        payload: {
          status: readConsultCardStatus(result.dispatchResult, statusSnapshot),
        },
        actions: [],
      }];
    case 'HUMAN_HANDOFF':
      return [{
        cardId: 'card-handoff-status',
        cardType: 'HANDOFF_STATUS',
        payload: {
          required: true,
          ...(readHandoffId(result.dispatchResult) ? { ticketId: readHandoffId(result.dispatchResult) ?? undefined } : {}),
        },
        actions: [],
      }];
  }
}

function buildRecommendationActions(
  dispatchResult: ToolResult<unknown> | null,
): Extract<ChatbotV3Card, { cardType: 'RECOMMENDATION_LIST' }>['actions'] {
  const candidates = readRecommendations(dispatchResult);
  if (candidates.length === 0) {
    return [];
  }

  const selectionActions = candidates.map((candidate) => ({
    actionType: 'SUBMIT' as const,
    label: `Select ${candidate.name}`,
    params: {
      hospitalId: candidate.hospitalId,
    },
  }));

  return [
    ...selectionActions,
    {
      actionType: 'SUBMIT' as const,
      label: 'Continue without selecting a hospital',
      params: {
        actionKey: 'RECOMMENDATION_SKIPPED' as const,
      },
    },
  ];
}

export function buildEffectiveStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  statusPatch: Partial<AiChatStatusSnapshot> | null | undefined,
): Partial<AiChatStatusSnapshot> | null {
  if (!statusSnapshot && !statusPatch) {
    return null;
  }

  return {
    ...(statusSnapshot ?? {}),
    ...(statusPatch ?? {}),
  };
}

function readUploadedCount(
  body: ChatbotV3ChatRequest,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  stage: ConversationOrchestratorV3TurnResult['journey']['stage'],
): number {
  if (stage === 'COLLECT_MEDICAL_INPUTS') {
    if (Array.isArray(statusSnapshot?.supportingDocuments)) {
      return statusSnapshot.supportingDocuments.length;
    }

    return body.attachments?.length ?? 0;
  }

  if ((body.attachments?.length ?? 0) > 0) {
    return body.attachments?.length ?? 0;
  }

  if (hasAnyStatus(statusSnapshot?.docUploadStatus, ['COMPLETED', 'SUBMITTED', 'READY'])) {
    return 1;
  }

  return hasAnyStatus(statusSnapshot?.formStatus, ['COMPLETED', 'SUBMITTED', 'READY']) ? 1 : 0;
}

function buildVisibleJourney(
  resultJourney: ConversationOrchestratorV3TurnResult['journey'],
  sessionStatusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  statusPatch: Partial<AiChatStatusSnapshot> | null | undefined,
): ConversationOrchestratorV3TurnResult['journey'] {
  const persistedJourneyStage = readJourneyStage(statusPatch)
    ?? readJourneyStage(sessionStatusSnapshot)
    ?? resultJourney.stage;
  const persistedJourneyPhase = readJourneyPhase(statusPatch)
    ?? readJourneyPhase(sessionStatusSnapshot)
    ?? resultJourney.phase;

  return {
    stage: persistedJourneyStage,
    phase: persistedJourneyPhase,
  };
}

function readJourneyStage(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): ConversationOrchestratorV3TurnResult['journey']['stage'] | null {
  const stage = statusSnapshot?.journeyCurrentStage;
  return typeof stage === 'string' ? stage as ConversationOrchestratorV3TurnResult['journey']['stage'] : null;
}

function readJourneyPhase(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): ConversationOrchestratorV3TurnResult['journey']['phase'] | null {
  const phase = statusSnapshot?.journeyCurrentPhase;
  return phase === 'active' || phase === 'post' ? phase : null;
}

function readRecommendations(dispatchResult: ToolResult<unknown> | null) {
  if (dispatchResult?.status !== 'ok') {
    return [];
  }

  const recommendations = asArray(asRecord(dispatchResult.data)['recommendations']);
  return recommendations.flatMap((candidate) => {
    const record = asRecord(candidate);
    const hospitalId = asString(record['hospitalId']);
    const name = asString(record['name']);

    if (!hospitalId || !name) {
      return [];
    }

    return [{
      hospitalId,
      name,
      ...(asString(record['reason']) ? { reason: asString(record['reason']) ?? undefined } : {}),
    }];
  });
}

function readConsultCardStatus(
  dispatchResult: ToolResult<unknown> | null,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): 'idle' | 'scheduled' | 'failed' {
  if (dispatchResult?.status === 'ok') {
    const state = normalizeStatus(asString(asRecord(dispatchResult.data)['state']));
    if (state === 'FAILED') {
      return 'failed';
    }
    if (state === 'SCHEDULED' || state === 'BOOKED' || state === 'COMPLETED') {
      return 'scheduled';
    }
  }

  const consultationStatus = normalizeStatus(statusSnapshot?.consultationStatus);
  if (consultationStatus === 'FAILED' || consultationStatus === 'CANCELLED') {
    return 'failed';
  }
  if (consultationStatus === 'SCHEDULED' || consultationStatus === 'BOOKED' || consultationStatus === 'COMPLETED') {
    return 'scheduled';
  }
  return 'idle';
}

function readHandoffId(dispatchResult: ToolResult<unknown> | null): string | null {
  if (dispatchResult?.status !== 'ok') {
    return null;
  }

  return asString(asRecord(dispatchResult.data)['handoffId']);
}

function hasActiveHandoffStatus(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  return hasAnyStatus(statusSnapshot?.handoffStatus, ['REQUESTED', 'OPEN', 'IN_PROGRESS']);
}

function hasCrisisSafetySignal(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  return normalizeStatus(statusSnapshot?.riskLevel) === 'CRISIS';
}

function hasAnyStatus(value: string | null | undefined, expectedStates: string[]): boolean {
  return expectedStates.includes(normalizeStatus(value));
}

function normalizeStatus(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
