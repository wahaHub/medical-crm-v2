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
  checkMinimalContract,
  checkSkillBehavior,
} from './response-quality-checker.js';
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
export const SAFE_MEDICAL_REDIRECT_TEXT = 'Medora can help with hospital or doctor matching and care coordination, but we cannot provide specific medical advice here. A licensed doctor should advise on diagnosis or treatment. Would you like us to help arrange a doctor consultation?';
export const OUT_OF_SCOPE_REDIRECT_TEXT = 'Medora focuses on medical travel coordination, hospital and doctor matching, records collection, and consult setup. I can redirect this back to the care path or connect you with our team if needed.';
const FAQ_DEGRADED_TEXT = 'I could not load that answer just now. Please try asking again, or ask in a simpler way.';
const FAQ_MISS_TEXT = 'I could not find a reliable answer right now. You can ask again in a simpler way, or request a human coordinator if needed.';
const RECOMMENDATION_DEGRADED_TEXT = 'I could not refresh the hospital recommendations just now. Please try again in this chat.';
const CONSULT_DEGRADED_TEXT = 'I could not complete the consultation step just now. Please try again in this chat.';
const HANDOFF_DENIED_TEXT = 'Before we connect you with a human, please complete the current step first.';
const GENERIC_DEGRADED_TEXT = 'I could not complete that request just now. Please try again, or ask for a human coordinator if needed.';

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
  const assistantText = buildAssistantText(input.result, effectiveStatusSnapshot, input.body.message);
  const visibleJourney = buildVisibleJourney(
    input.result.journey,
    input.sessionStatusSnapshot,
    input.result.writeIntents?.statusPatch,
  );

  const response: ChatbotV3ChatResponse = {
    messages: [{
      role: 'assistant',
      text: assistantText,
    }],
    turnOutcome: input.result.turnOutcome,
    cards: buildCards(input.body, input.result, visibleJourney, effectiveStatusSnapshot, input.body.message),
    journey: visibleJourney,
    handoff: {
      required: visibleJourney.stage === 'HUMAN_HANDOFF'
        || hasActiveHandoffStatus(effectiveStatusSnapshot)
        || hasCrisisSafetySignal(effectiveStatusSnapshot),
      ticketId: readHandoffId(input.result.dispatchResult),
    },
  };

  if (input.includeRuntimeDebug) {
    const runtimeDebug = input.result.runtimeDebug;
    response.runtimeDebug = {
      traceId: runtimeDebug.traceId,
      idempotencyKey: runtimeDebug.idempotencyKey,
      ...(runtimeDebug.lastDispatchSource
        ? { lastDispatchSource: runtimeDebug.lastDispatchSource }
        : {}),
      ...(runtimeDebug.replayLineage
        ? { replayLineage: runtimeDebug.replayLineage }
        : {}),
      ...(runtimeDebug.event
        ? { event: runtimeDebug.event }
        : {}),
      ...(runtimeDebug.selectedDomainSkills
        ? { selectedDomainSkills: runtimeDebug.selectedDomainSkills }
        : {}),
      ...(runtimeDebug.loadedSkillSections
        ? { loadedSkillSections: runtimeDebug.loadedSkillSections }
        : {}),
      ...(runtimeDebug.readIntents
        ? { readIntents: runtimeDebug.readIntents }
        : {}),
      ...(runtimeDebug.retrievedContext
        ? { retrievedContext: runtimeDebug.retrievedContext }
        : {}),
      ...(typeof runtimeDebug.retrievedContextCount === 'number'
        ? { retrievedContextCount: runtimeDebug.retrievedContextCount }
        : {}),
      ...(runtimeDebug.responseContract
        ? { responseContract: runtimeDebug.responseContract }
        : {}),
      minimalContractChecks: runtimeDebug.responseContract
        ? checkMinimalContract(
            assistantText,
            runtimeDebug.responseContract,
          )
        : [],
      skillBehaviorChecks: runtimeDebug.loadedSkillSections
        ? checkSkillBehavior(
            assistantText,
            runtimeDebug.loadedSkillSections,
          )
        : [],
      llmJudgeSummary: {
        status: 'not_run',
        summary: 'LLM judge not enabled for this run.',
      },
    };
  }

  return response;
}

export function buildAssistantText(
  result: ConversationOrchestratorV3TurnResult,
  statusSnapshot?: Partial<AiChatStatusSnapshot> | null | undefined,
  latestUserMessage?: string,
): string {
  const guidanceFamily = classifyGuidanceFamily(result);
  if (guidanceFamily) {
    return renderGuidanceFamilyText(guidanceFamily);
  }

  if (isFaqMiss(result)) {
    return FAQ_MISS_TEXT;
  }

  if (result.render.path === 'FAQ_ANSWER') {
    return readFaqAnswer(result) ?? 'I could not load that answer just now. Please ask again in a simpler way.';
  }

  if (result.render.path === 'PROCESS_OVERVIEW') {
    return PROCESS_OVERVIEW_TEXT;
  }

  if (result.render.path === 'SAFE_MEDICAL_REDIRECT') {
    return SAFE_MEDICAL_REDIRECT_TEXT;
  }

  if (result.render.path === 'OUT_OF_SCOPE_REDIRECT') {
    return OUT_OF_SCOPE_REDIRECT_TEXT;
  }

  const recordsAssistantText = readRecordsAssistantText(result);
  if (recordsAssistantText) {
    return recordsAssistantText;
  }

  const recommendationAssistantText = readRecommendationAssistantText(result, statusSnapshot, latestUserMessage);
  if (recommendationAssistantText) {
    return recommendationAssistantText;
  }

  switch (result.journey.stage) {
    case 'EXPLAIN_PROCESS':
      return 'I can help explain the Medora process. Please ask again or tell me which part is unclear.';
    case 'COLLECT_MINIMAL_MEDICAL_FACTS':
      return buildMinimalTriageOpeningText(statusSnapshot);
    case 'COLLECT_MEDICAL_INPUTS':
      return RECORDS_DIAGNOSIS_PROOF_UPLOAD_GUIDANCE;
    case 'RECOMMENDATION':
      return 'I can continue with hospital options or answer a specific question about your care path.';
    case 'ONLINE_CONSULT':
      return 'I can help continue the online consultation step. Please try again or tell me what you need help with.';
    case 'HUMAN_HANDOFF':
      return 'Your request for a human coordinator is noted. Please share what you need help with, and we can continue from here.';
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
  const policyGrounded = data['policyGrounded'] === true;

  if ((!policyGrounded && citedFaqIds.length === 0) || confidence === 'low') {
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
  const questionTexts = asArray(data['questions'])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((question) => question.trim());
  const questions = questionTexts
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((question, index) => `${index + 1}. ${question}`);

  if (!followUp && questions.length === 0) {
    return null;
  }

  if (followUp) {
    return repairRecordsMinimalTriageFollowUp(followUp, questionTexts, result);
  }

  return questions[0] ?? null;
}

function repairRecordsMinimalTriageFollowUp(
  followUp: string,
  questions: readonly string[],
  result: ConversationOrchestratorV3TurnResult,
): string {
  const naturalReply = buildNaturalRecordsMinimalTriageReply(followUp, result);
  if (naturalReply) {
    return naturalReply;
  }

  const firstQuestion = questions[0];
  if (firstQuestion && shouldAppendRecordsQuestion(followUp)) {
    return `${followUp}\n\n${firstQuestion}`;
  }

  return followUp;
}

function shouldAppendRecordsQuestion(followUp: string): boolean {
  const normalized = followUp.toLowerCase();
  return /\b(?:this|the)\s+(?:brief\s+)?question\b/.test(normalized)
    || /\bfollow[-\s]?up questions?\b/.test(normalized)
    || (
      !/[?？]/.test(followUp)
      && /\b(?:answer|reply|respond)\b/.test(normalized)
      && /\bquestion\b/.test(normalized)
    );
}

function buildNaturalRecordsMinimalTriageReply(
  followUp: string,
  result: ConversationOrchestratorV3TurnResult,
): string | null {
  if (!isRecordsAnswerFormatCoaching(followUp)) {
    return null;
  }

  const context = readRecordsConversationContext(result);
  if (!hasLegNervePainContext(context)) {
    return null;
  }

  return [
    'That detail is useful. Burning, electric, numb, tingling, or shooting leg pain can fit nerve-related leg pain, even if back pain is mild or absent.',
    'How severe does it get at worst (mild, moderate, severe, or 0-10), and have you had any tests, medicines, or treatments so far?',
  ].join(' ');
}

function isRecordsAnswerFormatCoaching(followUp: string): boolean {
  return /\bfor example\b/i.test(followUp)
    || /\byou could write\b/i.test(followUp)
    || /\byou can answer in your own words\b/i.test(followUp)
    || /\bfor example,?\s+you could\b/i.test(followUp);
}

function readRecordsConversationContext(
  result: ConversationOrchestratorV3TurnResult,
): string {
  const task = asRecord(result.decision.agentTask);
  const latest = asString(task['latestUserMessage']) ?? '';
  const recentMessages = asArray(task['recentMessages'])
    .map((message) => asString(asRecord(message)['content']))
    .filter((content): content is string => Boolean(content));
  return [...recentMessages, latest].join(' ').toLowerCase();
}

function hasLegNervePainContext(context: string): boolean {
  return /\b(?:burning|electric|numb|numbness|tingling|sciatica|shooting)\b/.test(context)
    && /\b(?:leg|thigh|foot|feet|knee)\b/.test(context);
}

function readRecommendationAssistantText(
  result: ConversationOrchestratorV3TurnResult,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  latestUserMessage?: string,
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
    return buildRecommendationGenerateText(data, statusSnapshot, latestUserMessage);
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
    return 'We already received your basic intake. Please share the main symptom or diagnosis, when it started and how severe it is, plus any tests, treatments, medicines, or diagnoses so far.';
  }

  return 'Please share the key medical facts and any records you already have so I can guide the next step.';
}

function buildRecommendationGenerateText(
  data: Record<string, unknown>,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  latestUserMessage?: string,
): string | null {
  if (isDirectDoctorRecommendationRequest(latestUserMessage)) {
    return 'For a specific doctor recommendation, please share relevant medical records first; if you do not have records yet, a short symptom summary is enough to start, and our human team can review before matching a suitable doctor.';
  }

  if (asString(statusSnapshot?.minimalTriageAnswersSummary)) {
    return 'This recommendation is based on your submitted intake and the follow-up medical details you just shared.';
  }

  if (statusSnapshot?.minimalTriageStatus === 'skipped') {
    return 'This is an initial recommendation based on your submitted intake alone, and it can be refined later if you share more medical detail.';
  }

  return asString(data['explanation'])
    ?? 'These recommendations are grounded in the current hospital list and can be refined after you share more medical detail.';
}

function isDirectDoctorRecommendationRequest(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const explicitHospitalTarget = /\b(?:hospital|clinic|medical center)\b/i.test(value)
    || /(?:医院|诊所|医疗中心)/.test(value);
  const strongProviderOrSpecialty = /\b(?:doctor|specialist|physician|surgeon|department|neurologist|oncologist|cardiologist|orthop(?:a)?edist|spine surgeon|neurosurgeon|thoracic surgeon|urologist|dermatologist|hematologist|gastroenterologist|endocrinologist|rheumatologist|ent|pulmonologist|respiratory specialist)\b/i
    .test(value)
    || /(?:医生|专家|医师|主任|科室|神经|脊柱|肿瘤|心内|心脏|心血管|骨科|胸外|呼吸|消化|血液|泌尿|皮肤|风湿|内分泌|耳鼻喉)/.test(value);
  const providerTeamPhrase = /\b(?:doctor|specialist|surgical|clinical) team\b/i.test(value)
    || /(?:医生团队|专家团队|手术团队|临床团队)/.test(value);
  const matchingRequest = /\b(?:recommend|best|match|which|who|find|arrange|see|choose)\b/i.test(value)
    || /(?:推荐|最好|最佳|匹配|哪个|哪位|找|安排|看哪|选哪)/.test(value);

  if (explicitHospitalTarget && !strongProviderOrSpecialty) {
    return false;
  }

  return (strongProviderOrSpecialty || providerTeamPhrase) && matchingRequest;
}

function buildCards(
  body: ChatbotV3ChatRequest,
  result: ConversationOrchestratorV3TurnResult,
  visibleJourney: ConversationOrchestratorV3TurnResult['journey'],
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  latestUserMessage?: string,
): ChatbotV3Card[] {
  if (isFaqMiss(result)) {
    return [];
  }

  switch (visibleJourney.stage) {
    case 'EXPLAIN_PROCESS':
      return [];
    case 'COLLECT_MINIMAL_MEDICAL_FACTS':
    case 'COLLECT_MEDICAL_INPUTS':
      return [{
        cardId: 'card-upload-records',
        cardType: 'UPLOAD_RECORDS',
        payload: {
          required: true,
          uploadedCount: readUploadedCount(body, statusSnapshot, visibleJourney.stage),
        },
        actions: [],
      }];
    case 'RECOMMENDATION': {
      if (isDirectDoctorBoundaryRecommendation(result, latestUserMessage)) {
        return [];
      }

      const candidates = readRecommendations(result.dispatchResult);
      if (result.decision.dispatchAgent === 'FaqAgent' && candidates.length === 0) {
        return [];
      }

      return [{
        cardId: 'card-recommendations',
        cardType: 'RECOMMENDATION_LIST',
        payload: {
          candidates,
        },
        actions: buildRecommendationActions(result.dispatchResult),
      }];
    }
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

function isDirectDoctorBoundaryRecommendation(
  result: ConversationOrchestratorV3TurnResult,
  latestUserMessage?: string,
): boolean {
  if (result.decision.dispatchAgent !== 'RecommendationAgent' || result.dispatchResult?.status !== 'ok') {
    return false;
  }

  const data = asRecord(result.dispatchResult.data);
  return asString(data['recommendationTask']) === 'generate'
    && isDirectDoctorRecommendationRequest(latestUserMessage);
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
  const effectiveStatusSnapshot = buildEffectiveStatusSnapshot(sessionStatusSnapshot, statusPatch);
  if (hasActiveHandoffStatus(effectiveStatusSnapshot) || hasCrisisSafetySignal(effectiveStatusSnapshot)) {
    return {
      stage: 'HUMAN_HANDOFF',
      phase: 'active',
    };
  }

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

function isFaqMiss(result: ConversationOrchestratorV3TurnResult): boolean {
  return result.decision.dispatchAgent === 'FaqAgent'
    && (result.render.path === 'FAQ_MISS' || result.faqResolution === 'miss');
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
