import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import {
  deriveJourneyTruthFromStatusSnapshot,
  OrchestratorV3Service,
  SupervisorService,
} from '@medical-crm/application';
import {
  AiChatSession as AiChatSessionEntity,
} from '@medical-crm/domain';
import type {
  AiChatSession,
  AiChatStatusSnapshot,
  ChatJourneyPhase,
  ChatJourneyStage,
} from '@medical-crm/domain';
import {
  chatbotV3ChatRequestSchema,
  chatbotV3ChatResponseSchema,
  type ChatbotV3Card,
  type ChatbotV3ChatRequest,
  type ChatbotV3ChatResponse,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';
import {
  ConsultAgent,
  FaqAgent,
  HandoffAgent,
  RecommendationAgent,
  RecordsAgent,
} from './chatbot-v3/agents.js';
import {
  ConversationOrchestratorV3RuntimeService,
  type ConversationOrchestratorV3StageRef,
  type ConversationOrchestratorV3TurnResult,
} from './chatbot-v3/runtime.service.js';
import {
  createToolGateway,
  type ToolResult,
} from './chatbot-v3/tool-gateway.js';
import { createChatbotV3RuntimeNodeEventEmitter } from './chatbot-v3/observability.js';
import { createChatbotV3FaqRouteAdapter } from './chatbot-v3/faq-route-adapter.js';

type AppServices = ReturnType<typeof getServices>;

let chatbotV3RuntimeSingleton: ConversationOrchestratorV3RuntimeService | null = null;
const CHATBOT_SESSION_SECRET_COOKIE = 'chatbot_session_secret';
const PATIENT_SESSION_COOKIE = 'patient_session';
const TRACE_ID_MAX_LENGTH = 128;
const DIRECT_HUMAN_REQUEST_PATTERNS = [
  /\bneed (?:a |to talk to a |to speak to a )?(?:human|person|advisor|agent|operator|representative)\b/i,
  /\b(?:want|wanna|would like) (?:a |to talk to a |to speak to a )?(?:human|person|advisor|agent|operator|representative)\b/i,
  /\b(?:talk|speak|chat|connect|transfer|handoff|escalat(?:e|ion)?)\b[\s\w]*\b(?:human|person|advisor|agent|operator|representative)\b/i,
  /\b(?:live|real) (?:agent|person|human)\b/i,
] as const;
const ACTIVE_HANDOFF_STATUSES = ['REQUESTED', 'OPEN', 'IN_PROGRESS'] as const;
const INTERNAL_FAQ_ACTOR = {
  userId: 'chatbot-v3-faq',
  email: 'internal@medora.local',
  role: 'ADMIN' as const,
  hospitalId: null,
};

function buildInternalFaqHospitalActor(hospitalId: string) {
  return {
    userId: 'chatbot-v3-faq-hospital',
    email: 'internal@medora.local',
    role: 'HOSPITAL' as const,
    hospitalId,
  };
}

export const chatbotV3PublicRoutes = new Hono();

chatbotV3PublicRoutes.post('/api/v3/chatbot/chat', async (c) => {
  const body = chatbotV3ChatRequestSchema.parse(await c.req.json());
  const traceId = resolveTraceId(c);
  const services = getServices();
  let session = await services.aiChatSessionRepo.findBySessionId(body.sessionId);
  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }
  const authorization = await authorizeOrBootstrapSessionAccess(c, services, session);
  if (!authorization.ok) {
    return authorization.response;
  }
  session = authorization.session;
  const current = resolveCurrentStage(session?.statusSnapshot);
  const suggestion = buildInitialSuggestion(current, body, {
    canCreateHandoff: canCreateHandoffTicket(session, services),
  });

  const result = await getChatbotV3Runtime().handleTurn({
    traceId,
    sessionId: body.sessionId,
    turnId: resolveTurnId(c),
    message: body.message,
    attachments: body.attachments,
    pageContext: body.pageContext,
    current,
    facts: resolveFacts(session?.statusSnapshot),
    handoff: resolveHandoffSignals(session?.statusSnapshot),
    suggestion,
  });

  const response = chatbotV3ChatResponseSchema.parse(buildResponse(body, result, session));
  if (shouldPersistProcessExplainedFact(session, response)) {
    await patchSessionStatus(services, session, {
      processExplained: true,
    });
  }
  if (authorization.sessionSecretToSet) {
    setChatbotSessionSecretCookie(c, authorization.sessionSecretToSet);
  }
  return c.json(response);
});

function getChatbotV3Runtime(): ConversationOrchestratorV3RuntimeService {
  if (!chatbotV3RuntimeSingleton) {
    chatbotV3RuntimeSingleton = createChatbotV3Runtime(getServices());
  }

  return chatbotV3RuntimeSingleton;
}

function createChatbotV3Runtime(services: AppServices): ConversationOrchestratorV3RuntimeService {
  const nodeEventEmitter = createChatbotV3RuntimeNodeEventEmitter({
    emit: (event) => {
      if (process.env.NODE_ENV !== 'test') {
        console.info('[chatbot-v3.node-event]', JSON.stringify(event));
      }
    },
  });
  const gateway = createToolGateway({
    handlers: {
      faq: {
        categorySearch: async ({ sessionId, query, hospitalId }) =>
          handleFaqCategorySearch(services, sessionId, query, hospitalId),
        search: async ({ sessionId, query, category, hospitalId }) =>
          handleFaqSearch(services, sessionId, query, category, hospitalId),
        getByIds: async ({ ids, hospitalId }) => handleFaqGetByIds(services, ids, hospitalId),
      },
      records: {
        upload: async ({ sessionId, turnId, attachments }) => handleRecordsUpload(services, sessionId, turnId, attachments),
        save: async ({ sessionId, turnId, records }) => handleRecordsSave(services, sessionId, turnId, records),
        status: async ({ sessionId }) => ({
          state: deriveRecordsState((await services.aiChatSessionRepo.findBySessionId(sessionId))?.statusSnapshot),
        }),
      },
      recommendation: {
        generate: async ({ sessionId }) => ({
          recommendations: await generateRecommendations(services, sessionId),
        }),
        status: async ({ sessionId }) => ({
          state: deriveRecommendationState((await services.aiChatSessionRepo.findBySessionId(sessionId))?.statusSnapshot),
        }),
      },
      consult: {
        status: async ({ sessionId }) => ({
          state: deriveConsultState((await services.aiChatSessionRepo.findBySessionId(sessionId))?.statusSnapshot),
        }),
      },
      status: {
        query: async ({ sessionId }) => ({
          snapshot: buildStatusQuerySnapshot(
            await services.aiChatSessionRepo.findBySessionId(sessionId),
          ),
        }),
      },
      handoff: {
        create: async ({ sessionId, turnId, reason }) => createHandoff(services, sessionId, turnId, reason),
      },
    },
  });

  return new ConversationOrchestratorV3RuntimeService({
    idempotency: services.idempotencyExecutor,
    supervisor: new SupervisorService(),
    orchestrator: new OrchestratorV3Service(),
    nodeEventEmitter,
    gateway: {
      status: gateway.status,
    },
    agents: {
      FaqAgent: new FaqAgent(gateway, createChatbotV3FaqRouteAdapter({
        enabled: process.env['CHATBOT_V3_FAQ_LLM_ENABLED'] === 'true',
      })),
      RecordsAgent: new RecordsAgent(gateway),
      RecommendationAgent: new RecommendationAgent(gateway),
      ConsultAgent: new ConsultAgent(gateway),
      HandoffAgent: new HandoffAgent(gateway),
    },
  });
}

function resolveTurnId(c: Context): string {
  return c.req.header('Idempotency-Key')
    ?? c.req.header('X-Idempotency-Key')
    ?? randomUUID();
}

function resolveTraceId(c: Context): string {
  const candidate = c.req.header('x-request-id')
    ?? c.req.header('X-Request-Id');
  if (!candidate) {
    return randomUUID();
  }

  const trimmed = candidate.trim();
  if (trimmed.length === 0 || trimmed.length > TRACE_ID_MAX_LENGTH) {
    return randomUUID();
  }

  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return randomUUID();
  }

  return trimmed;
}

function buildInitialSuggestion(
  current: ConversationOrchestratorV3StageRef,
  body: ChatbotV3ChatRequest,
  options: {
    canCreateHandoff: boolean;
  },
): {
  intent: 'handoff' | 'progression' | 'unknown';
  suggestedStage: ChatJourneyStage;
  reason: string;
} {
  if (isDirectHumanRequest(body.message)) {
    if (!options.canCreateHandoff) {
      return {
        intent: 'unknown',
        suggestedStage: current.stage,
        reason: 'direct human request cannot create handoff ticket for this session',
      };
    }

    return {
      intent: 'handoff',
      suggestedStage: 'HUMAN_HANDOFF',
      reason: 'direct user request for a human',
    };
  }

  if ((body.attachments?.length ?? 0) > 0) {
    return {
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      reason: 'attachments provided by user',
    };
  }

  return {
    intent: 'unknown',
    suggestedStage: current.stage,
    reason: 'session-derived baseline',
  };
}

function isDirectHumanRequest(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return DIRECT_HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function resolveCurrentStage(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): ConversationOrchestratorV3StageRef {
  const storedJourney = readStoredJourneySnapshot(statusSnapshot);
  if (storedJourney) {
    return storedJourney;
  }

  const truth = deriveJourneyTruthFromStatusSnapshot(statusSnapshot);

  if (hasActiveHandoffStatus(statusSnapshot) || hasCrisisSafetySignal(statusSnapshot)) {
    return { stage: 'HUMAN_HANDOFF', phase: 'active' };
  }

  if (hasWorkflowStatus(statusSnapshot?.consultationStatus, ['NOT_INTRODUCED', 'NOT_STARTED'])) {
    return {
      stage: 'ONLINE_CONSULT',
      phase: truth.onlineConsultSubmitted ? 'post' : 'active',
    };
  }

  if (hasWorkflowStatus(statusSnapshot?.recommendationStatus, ['NOT_STARTED'])
    || hasWorkflowStatus(statusSnapshot?.packageStatus, ['NOT_INTRODUCED'])) {
    return {
      stage: 'RECOMMENDATION',
      phase: truth.recommendationConfirmed ? 'post' : 'active',
    };
  }

  if (hasWorkflowStatus(statusSnapshot?.docUploadStatus, ['NONE', 'NOT_STARTED'])
    || hasWorkflowStatus(statusSnapshot?.formStatus, ['NOT_STARTED'])) {
    return {
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: truth.medicalInputsSubmitted ? 'post' : 'active',
    };
  }

  return {
    stage: 'EXPLAIN_PROCESS',
    phase: 'active',
  };
}

function resolveFacts(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): Record<string, boolean> {
  const truth = deriveJourneyTruthFromStatusSnapshot(statusSnapshot);
  const uploadedRecordsReady = hasAnyStatus(
    statusSnapshot?.docUploadStatus,
    ['COMPLETED', 'SUBMITTED', 'READY'],
  );

  return {
    'records.saved': truth.medicalInputsSubmitted || uploadedRecordsReady,
    'recommendation.picked': truth.recommendationConfirmed,
    'consult.scheduled': truth.onlineConsultSubmitted,
    'process.explained': readProcessExplainedFact(statusSnapshot),
    'handoff.active': hasActiveHandoffStatus(statusSnapshot),
  };
}

function resolveHandoffSignals(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
) {
  return {
    userRequestedHuman: false,
    safetyPolicyHit: hasCrisisSafetySignal(statusSnapshot),
  };
}

function buildResponse(
  body: ChatbotV3ChatRequest,
  result: ConversationOrchestratorV3TurnResult,
  session: AiChatSession | null,
): ChatbotV3ChatResponse {
  const response: ChatbotV3ChatResponse = {
    messages: [{
      role: 'assistant',
      text: buildAssistantText(result),
    }],
    turnOutcome: result.turnOutcome,
    cards: buildCards(body, result, session?.statusSnapshot),
    journey: result.journey,
    handoff: {
      required: result.journey.stage === 'HUMAN_HANDOFF'
        || hasActiveHandoffStatus(session?.statusSnapshot)
        || hasCrisisSafetySignal(session?.statusSnapshot),
      ticketId: readHandoffId(result.dispatchResult),
    },
  };

  if (process.env.NODE_ENV !== 'production') {
    response.runtimeDebug = {
      traceId: result.runtimeDebug.traceId,
      idempotencyKey: result.runtimeDebug.idempotencyKey,
      ...(result.runtimeDebug.lastDispatchSource
        ? { lastDispatchSource: result.runtimeDebug.lastDispatchSource }
        : {}),
    };
  }

  return response;
}

function shouldPersistProcessExplainedFact(
  session: AiChatSession | null,
  response: ChatbotV3ChatResponse,
): session is AiChatSession {
  return session !== null
    && !readProcessExplainedFact(session.statusSnapshot)
    && response.journey.stage === 'EXPLAIN_PROCESS'
    && response.cards.some((card) => card.cardType === 'PROCESS_GUIDE');
}

function buildAssistantText(result: ConversationOrchestratorV3TurnResult): string {
  if (result.turnOutcome.status === 'degraded') {
    return 'I could not complete the requested step, but your v3 journey state is preserved.';
  }

  switch (result.journey.stage) {
    case 'EXPLAIN_PROCESS':
      return 'Here is the process: first, share your medical records, then review hospital recommendations, and finally arrange an online consultation if you want one.';
    case 'COLLECT_MEDICAL_INPUTS':
      return 'I checked the medical input stage for this session.';
    case 'RECOMMENDATION':
      return 'I checked the recommendation stage for this session.';
    case 'ONLINE_CONSULT':
      return 'I checked the online consultation stage for this session.';
    case 'HUMAN_HANDOFF':
      return 'This session is currently in human handoff.';
  }
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
    case 'COLLECT_MEDICAL_INPUTS':
      return [{
        cardId: 'card-upload-records',
        cardType: 'UPLOAD_RECORDS',
        payload: {
          required: true,
          uploadedCount: readUploadedCount(body, statusSnapshot),
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
        actions: [],
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

function readUploadedCount(
  body: ChatbotV3ChatRequest,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): number {
  if ((body.attachments?.length ?? 0) > 0) {
    return body.attachments?.length ?? 0;
  }

  return resolveFacts(statusSnapshot)['records.saved'] ? 1 : 0;
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

function deriveRecordsState(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): string {
  const docUploadStatus = normalizeStatus(statusSnapshot?.docUploadStatus);
  if (docUploadStatus === 'NONE' || docUploadStatus === 'NOT_STARTED' || docUploadStatus.length === 0) {
    return 'idle';
  }

  if (docUploadStatus === 'FAILED') {
    return 'failed';
  }

  if (docUploadStatus === 'COMPLETED' || docUploadStatus === 'SUBMITTED') {
    return 'ready';
  }

  return 'processing';
}

async function handleFaqCategorySearch(
  services: AppServices,
  sessionId: string | undefined,
  query: string,
  hospitalId: string | undefined,
) {
  const result = await services.listFaqCategoriesForChatbot.execute({
    hospitalType: await resolveFaqHospitalType(services, sessionId, hospitalId),
    hospitalId,
  });

  const normalizedQuery = query.trim().toLowerCase();
  const matchedCategories = normalizedQuery.length === 0
    ? result.categories
    : result.categories.filter((category) => category.name.toLowerCase().includes(normalizedQuery));
  const categories = matchedCategories.length > 0 ? matchedCategories : result.categories;

  return {
    categories: categories.map((category) => ({
      name: category.name,
      sortOrder: category.sortOrder,
    })),
  };
}

async function handleFaqSearch(
  services: AppServices,
  sessionId: string | undefined,
  query: string,
  category: string | undefined,
  hospitalId: string | undefined,
) {
  const faqQuery = {
    page: 1,
    limit: 5,
    ...(category ? { category } : {}),
    hospitalType: await resolveFaqHospitalType(services, sessionId, hospitalId),
    isActive: true,
    search: query,
  };

  const generalResult = await services.listFaqItems.execute(faqQuery, INTERNAL_FAQ_ACTOR);
  const scopedResult = hospitalId
    ? await services.listFaqItems.execute(faqQuery, buildInternalFaqHospitalActor(hospitalId))
    : { data: [] };

  return {
    hits: dedupeFaqItemsById([
      ...scopedResult.data.map(mapFaqItemRecord),
      ...generalResult.data.map(mapFaqItemRecord),
    ]),
  };
}

async function handleFaqGetByIds(
  services: AppServices,
  ids: string[],
  hospitalId: string | undefined,
) {
  const items = (await Promise.all(ids.map(async (id) => {
    try {
      const scopedActor = hospitalId
        ? buildInternalFaqHospitalActor(hospitalId)
        : INTERNAL_FAQ_ACTOR;
      const item = await services.getFaqItem.execute(id, scopedActor);
      return mapFaqItemRecord(item);
    } catch {
      if (hospitalId) {
        try {
          const fallbackItem = await services.getFaqItem.execute(id, INTERNAL_FAQ_ACTOR);
          return mapFaqItemRecord(fallbackItem);
        } catch {
          return null;
        }
      }
      return null;
    }
  }))).flatMap((item) => item ? [item] : []);

  return { items };
}

async function resolveFaqHospitalType(
  services: AppServices,
  sessionId: string | undefined,
  hospitalId: string | undefined,
): Promise<'COSMETIC' | 'REGULAR'> {
  if (hospitalId) {
    return services.resolveHospitalType(hospitalId);
  }

  if (!sessionId) {
    return 'COSMETIC';
  }

  const session = await services.aiChatSessionRepo.findBySessionId(sessionId);
  return session?.hospitalType === 'REGULAR' ? 'REGULAR' : 'COSMETIC';
}

function mapFaqItemRecord(item: {
  id: string;
  question: string;
  answer: string;
  category?: string | null;
}) {
  return {
    id: item.id,
    question: item.question,
    answer: item.answer,
    ...(item.category ? { category: item.category } : {}),
  };
}

function dedupeFaqItemsById(items: Array<ReturnType<typeof mapFaqItemRecord>>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function deriveRecommendationState(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): string {
  const recommendationStatus = normalizeStatus(statusSnapshot?.recommendationStatus);
  const packageStatus = normalizeStatus(statusSnapshot?.packageStatus);

  if (recommendationStatus === 'CONFIRMED' || recommendationStatus === 'ACCEPTED'
    || packageStatus === 'CONFIRMED' || packageStatus === 'ACCEPTED') {
    return 'confirmed';
  }

  if (recommendationStatus === 'FAILED') {
    return 'failed';
  }

  if (recommendationStatus.length === 0 || recommendationStatus === 'NOT_STARTED') {
    return 'idle';
  }

  return 'processing';
}

function deriveConsultState(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): string {
  const consultationStatus = normalizeStatus(statusSnapshot?.consultationStatus);

  if (consultationStatus === 'FAILED' || consultationStatus === 'CANCELLED') {
    return 'failed';
  }
  if (consultationStatus === 'SCHEDULED' || consultationStatus === 'BOOKED' || consultationStatus === 'COMPLETED') {
    return 'scheduled';
  }
  if (consultationStatus.length === 0 || consultationStatus === 'NOT_INTRODUCED' || consultationStatus === 'NOT_STARTED') {
    return 'idle';
  }

  return 'processing';
}

function buildStatusQuerySnapshot(session: AiChatSession | null): Record<string, unknown> {
  return {
    sessionStatus: session?.status ?? null,
    current: resolveCurrentStage(session?.statusSnapshot),
    statusSnapshot: serializeStatusSnapshot(session?.statusSnapshot),
  };
}

function serializeStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): Record<string, unknown> | null {
  if (!statusSnapshot) {
    return null;
  }

  return {
    conditionStatus: statusSnapshot.conditionStatus ?? null,
    formStatus: statusSnapshot.formStatus ?? null,
    docUploadStatus: statusSnapshot.docUploadStatus ?? null,
    recommendationStatus: statusSnapshot.recommendationStatus ?? null,
    consultationStatus: statusSnapshot.consultationStatus ?? null,
    packageStatus: statusSnapshot.packageStatus ?? null,
    handoffStatus: statusSnapshot.handoffStatus ?? null,
    riskLevel: statusSnapshot.riskLevel ?? null,
    trustOrObjection: statusSnapshot.trustOrObjection ?? null,
    engagementMode: statusSnapshot.engagementMode ?? null,
    enteredDeepWorkflowAt: statusSnapshot.enteredDeepWorkflowAt?.toISOString() ?? null,
    processExplained: readProcessExplainedFact(statusSnapshot),
    conversationSummary: statusSnapshot.conversationSummary ?? '',
    lastPolicyDecisionAt: statusSnapshot.lastPolicyDecisionAt?.toISOString() ?? null,
    lastUserMessageAt: statusSnapshot.lastUserMessageAt?.toISOString() ?? null,
    lastAssistantMessageAt: statusSnapshot.lastAssistantMessageAt?.toISOString() ?? null,
  };
}

function readStoredJourneySnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): ConversationOrchestratorV3StageRef | null {
  const record = asRecord(statusSnapshot);
  const chatbotV2 = asRecord(record['chatbot_v2'] ?? record['chatbotV2']);
  const journey = asRecord(
    chatbotV2['journey_snapshot']
      ?? chatbotV2['journeySnapshot']
      ?? record['journey_snapshot']
      ?? record['journeySnapshot'],
  );

  const stage = asString(journey['current_stage'] ?? journey['currentStage']);
  const phase = asString(journey['current_phase'] ?? journey['currentPhase']);

  if (!isStage(stage) || !isPhase(phase)) {
    return null;
  }

  return { stage, phase };
}

function hasActiveHandoffStatus(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  return ACTIVE_HANDOFF_STATUSES.includes(
    normalizeStatus(statusSnapshot?.handoffStatus) as (typeof ACTIVE_HANDOFF_STATUSES)[number],
  );
}

function hasCrisisSafetySignal(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  return normalizeStatus(statusSnapshot?.riskLevel) === 'CRISIS';
}

function readProcessExplainedFact(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  return statusSnapshot?.processExplained === true;
}

function hasWorkflowStatus(value: string | null | undefined, emptyStates: string[]): boolean {
  const normalized = normalizeStatus(value);
  return normalized.length > 0 && !emptyStates.includes(normalized);
}

function hasAnyStatus(value: string | null | undefined, expectedStates: string[]): boolean {
  return expectedStates.includes(normalizeStatus(value));
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function isStage(value: string | null): value is ChatJourneyStage {
  return value === 'EXPLAIN_PROCESS'
    || value === 'COLLECT_MEDICAL_INPUTS'
    || value === 'RECOMMENDATION'
    || value === 'ONLINE_CONSULT'
    || value === 'HUMAN_HANDOFF';
}

function isPhase(value: string | null): value is ChatJourneyPhase {
  return value === 'pre' || value === 'active' || value === 'post';
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

async function authorizeOrBootstrapSessionAccess(
  c: Context,
  services: AppServices,
  session: AiChatSession,
): Promise<
  | { ok: true; session: AiChatSession; sessionSecretToSet: string | null }
  | { ok: false; response: Response }
> {
  const patientToken = session.patientId ? getCookie(c, PATIENT_SESSION_COOKIE) : undefined;
  if (session.patientId && patientToken && services.patientAuthService) {
    try {
      const payload = await services.patientAuthService.verifySessionToken(patientToken);
      if (payload.userId !== session.patientId) {
        return {
          ok: false,
          response: c.json({ error: 'Forbidden' }, 403),
        };
      }

      return {
        ok: true,
        session,
        sessionSecretToSet: null,
      };
    } catch {
      // Fall back to chatbot-session-secret auth on stale patient cookies.
    }
  }

  if (!session.sessionSecretHash) {
    if (session.patientId) {
      return {
        ok: false,
        response: c.json({ error: 'Unauthorized' }, 401),
      };
    }
    const sessionSecretToSet = createSessionSecret();
    const updatedSession = await services.aiChatSessionRepo.save(new AiChatSessionEntity({
      ...session,
      sessionSecretHash: hashSessionSecret(sessionSecretToSet),
      updatedAt: new Date(),
    }));

    return {
      ok: true,
      session: updatedSession ?? session,
      sessionSecretToSet,
    };
  }

  const rawSecret = getCookie(c, CHATBOT_SESSION_SECRET_COOKIE);
  if (!rawSecret || hashSessionSecret(rawSecret) !== session.sessionSecretHash) {
    return {
      ok: false,
      response: c.json({ error: 'Unauthorized' }, 401),
    };
  }

  return {
    ok: true,
    session,
    sessionSecretToSet: null,
  };
}

function createSessionSecret(): string {
  return randomBytes(24).toString('hex');
}

function hashSessionSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function setChatbotSessionSecretCookie(c: Context, value: string): void {
  setCookie(c, CHATBOT_SESSION_SECRET_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

async function generateRecommendations(
  services: AppServices,
  sessionId: string,
): Promise<Array<Record<string, unknown>>> {
  const session = await services.aiChatSessionRepo.findBySessionId(sessionId);
  const snapshot = session?.statusSnapshot;

  if (hasAnyStatus(snapshot?.recommendationStatus, ['CONFIRMED', 'ACCEPTED'])) {
    return [{
      hospitalId: 'existing-selection',
      name: 'Existing recommended hospital',
      reason: 'Recommendation already confirmed in the session state.',
    }];
  }

  if (hasAnyStatus(snapshot?.docUploadStatus, ['COMPLETED', 'SUBMITTED', 'READY'])
    || hasAnyStatus(snapshot?.formStatus, ['COMPLETED', 'SUBMITTED'])) {
    return [{
      hospitalId: 'pending-review',
      name: 'Recommendation review pending',
      reason: 'Records are available and ready for recommendation review.',
    }];
  }

  return [];
}

async function createHandoff(
  services: AppServices,
  sessionId: string,
  turnId: string | undefined,
  reason: string,
): Promise<{ handoffId?: string; created?: boolean }> {
  const session = await services.aiChatSessionRepo.findBySessionId(sessionId);
  if (!session || !session.patientId || !services.createTicket) {
    return { created: false };
  }

  const handoffTurnToken = turnId ?? randomUUID();
  const handoffTurnDigest = createHash('sha256')
    .update(`${sessionId}:handoff-ticket:${handoffTurnToken}`)
    .digest('hex');
  const idempotencyKey = `chatbot-v3:handoff:${handoffTurnDigest}`;

  return services.idempotencyExecutor.execute(
    idempotencyKey,
    'chatbot_v3_handoff_ticket',
    async () => {
      const latestSession = await services.aiChatSessionRepo.findBySessionId(sessionId);
      if (!latestSession?.patientId || !services.createTicket) {
        return { created: false };
      }
      if (hasActiveHandoffStatus(latestSession.statusSnapshot)) {
        return { created: false };
      }

      const ticket = await services.createTicket.execute({
        type: 'AI_ESCALATION',
        priority: 'MEDIUM',
        subject: 'Chatbot v3 handoff request',
        description: reason,
        sourcePage: '/api/v3/chatbot/chat',
      }, {
        userId: latestSession.patientId,
        email: 'chatbot-v3@local',
        role: 'PATIENT',
        hospitalId: null,
      });
      await patchSessionStatus(services, latestSession, {
        handoffStatus: 'REQUESTED',
      });

      return {
        created: true,
        handoffId: ticket.id,
      };
    },
  );
}

function canCreateHandoffTicket(
  session: AiChatSession | null,
  services: AppServices,
): boolean {
  return Boolean(session?.patientId && services.createTicket);
}

async function handleRecordsUpload(
  services: AppServices,
  sessionId: string,
  turnId: string | undefined,
  attachments: Array<Record<string, unknown>> | undefined,
): Promise<{ uploadId?: string; accepted?: boolean }> {
  const session = await services.aiChatSessionRepo.findBySessionId(sessionId);
  if (!session) {
    return { accepted: false };
  }

  await patchSessionStatus(services, session, {
    docUploadStatus: (attachments?.length ?? 0) > 0 ? 'SUBMITTED' : 'IN_PROGRESS',
  });

  return {
    accepted: true,
    uploadId: turnId ?? `${sessionId}-records-upload`,
  };
}

async function handleRecordsSave(
  services: AppServices,
  sessionId: string,
  turnId: string | undefined,
  records: Array<Record<string, unknown>> | undefined,
): Promise<{ recordIds?: string[]; saved?: boolean }> {
  const session = await services.aiChatSessionRepo.findBySessionId(sessionId);
  if (!session) {
    return { saved: false, recordIds: [] };
  }

  await patchSessionStatus(services, session, {
    docUploadStatus: 'COMPLETED',
    formStatus: (records?.length ?? 0) > 0 ? 'COMPLETED' : session.statusSnapshot.formStatus,
  });

  return {
    saved: true,
    recordIds: [turnId ?? `${sessionId}-records-save`],
  };
}

async function patchSessionStatus(
  services: AppServices,
  session: AiChatSession,
  patch: Partial<AiChatSession['statusSnapshot']>,
): Promise<AiChatSession> {
  const patched = await services.aiChatSessionRepo.patchStatus(session.sessionId, patch);
  if (patched) {
    return patched;
  }

  return services.aiChatSessionRepo.save(new AiChatSessionEntity({
    ...session,
    statusSnapshot: {
      ...session.statusSnapshot,
      ...patch,
    },
    updatedAt: new Date(),
  }));
}
