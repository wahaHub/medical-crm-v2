import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import {
  JourneyRuntimeAuthorityService,
  type MinimalIntakeSeed,
  SupervisorService,
} from '@medical-crm/application';
import {
  AiChatSession as AiChatSessionEntity,
  deriveCanonicalTruthFlagsFromStatusSnapshot,
} from '@medical-crm/domain';
import type {
  AiChatSession,
  AiChatStatusSnapshot,
  ChatJourneyStage,
} from '@medical-crm/domain';
import {
  chatbotV3ChatRequestSchema,
  chatbotV3ChatResponseSchema,
  chatbotV3UploadInitRequestSchema,
  chatbotV3UploadInitResponseSchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';
import { PatientSiteContextError, resolvePatientSiteContext } from '../patient-site-context.js';
import {
  ConsultAgent,
  FaqAgent,
  HandoffAgent,
  RecommendationAgent,
  RecordsAgent,
} from './chatbot-v3/agents.js';
import {
  type ConversationOrchestratorV3Decision,
  type ConversationOrchestratorV3DecisionInput,
  ConversationOrchestratorV3RuntimeService,
  InvalidChatbotV3ActionError,
  type ConversationOrchestratorV3TurnResult,
  deriveCurrentStageFromStatusSnapshot,
} from './chatbot-v3/runtime.service.js';
import {
  createToolGateway,
} from './chatbot-v3/tool-gateway.js';
import { createChatbotV3RuntimeNodeEventEmitter } from './chatbot-v3/observability.js';
import { createChatbotV3FaqRouteAdapter } from './chatbot-v3/faq-route-adapter.js';
import { createChatbotV3RecordsRouteAdapter } from './chatbot-v3/records-route-adapter.js';
import { createChatbotV3RecommendationRouteAdapter } from './chatbot-v3/recommendation-route-adapter.js';
import { createChatbotV3SupervisorRouteAdapter } from './chatbot-v3/supervisor-route-adapter.js';
import {
  composeResponse,
} from './chatbot-v3/response-composer.js';

type AppServices = ReturnType<typeof getServices>;

let chatbotV3RuntimeSingleton: ConversationOrchestratorV3RuntimeService | null = null;
const CHATBOT_SESSION_SECRET_COOKIE = 'chatbot_session_secret';
const PATIENT_SESSION_COOKIE = 'patient_session';
const TRACE_ID_MAX_LENGTH = 128;
const CANONICAL_JOURNEY_ORDER = [
  'COLLECT_MINIMAL_MEDICAL_FACTS',
  'RECOMMENDATION',
  'EXPLAIN_PROCESS',
  'COLLECT_MEDICAL_INPUTS',
  'ONLINE_CONSULT',
  'HUMAN_HANDOFF',
] as const satisfies readonly ChatJourneyStage[];
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
  const turnId = resolveTurnId(c);
  const services = getServices();
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  let session = await services.aiChatSessionRepo.findBySessionId(body.sessionId, site);
  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }
  const authorization = await authorizeOrBootstrapSessionAccess(c, services, session);
  if (!authorization.ok) {
    return authorization.response;
  }
  session = authorization.session;

  let result: ConversationOrchestratorV3TurnResult;
  try {
    result = await getChatbotV3Runtime().handleTurn({
      traceId,
      sessionId: body.sessionId,
      site,
      turnId,
      message: body.message ?? '',
      userAction: body.action,
      attachments: body.attachments,
      pageContext: body.pageContext,
      statusSnapshot: session?.statusSnapshot,
      facts: resolveFacts(session?.statusSnapshot),
      intake: await resolveSupervisorIntakeSeed(services, session),
      handoff: resolveHandoffSignals(session?.statusSnapshot),
      bootstrap: {
        message: body.message ?? '',
        attachments: body.attachments,
        canCreateHandoff: canCreateHandoffTicket(session, services),
      },
    });
  } catch (error) {
    if (error instanceof InvalidChatbotV3ActionError) {
      return c.json({
        error: {
          code: error.code,
          message: error.message,
          traceId,
        },
      }, error.status);
    }

    throw error;
  }

  if (session && shouldPersistAttachmentUpload(body.attachments, result)) {
    session = await patchSessionStatus(services, session, {
      docUploadStatus: (body.attachments?.length ?? 0) > 0 ? 'SUBMITTED' : 'IN_PROGRESS',
    });
  }

  const response = chatbotV3ChatResponseSchema.parse(composeResponse({
    body,
    result,
    sessionStatusSnapshot: session?.statusSnapshot,
    includeRuntimeDebug: process.env.NODE_ENV !== 'production',
  }));
  if (session) {
    const statusPatch = filterUnchangedStatusPatch(
      session.statusSnapshot,
      Object.assign(
        {},
        result.writeIntents?.statusPatch ?? {},
        result.writeIntents?.canonicalTruthPatch ?? {},
        result.writeIntents?.conversationSummaryPatch?.statusPatch ?? {},
      ),
    );
    if (Object.keys(statusPatch).length > 0) {
      await patchSessionStatus(services, session, statusPatch);
    }
  }
  if (authorization.sessionSecretToSet) {
    setChatbotSessionSecretCookie(c, authorization.sessionSecretToSet);
  }
  return c.json(response);
});

chatbotV3PublicRoutes.post('/api/v3/chatbot/uploads/init', async (c) => {
  const body = chatbotV3UploadInitRequestSchema.parse(await c.req.json());
  const services = getServices();
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  let session = await services.aiChatSessionRepo.findBySessionId(body.sessionId, site);
  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }
  const authorization = await authorizeOrBootstrapSessionAccess(c, services, session);
  if (!authorization.ok) {
    return authorization.response;
  }
  session = authorization.session;

  const result = await services.mediaUpload.createUploadIntent({
    policyId: 'chatbot_request_docs',
    ownerType: 'ai_chat_session',
    ownerId: session.id,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });
  const response = chatbotV3UploadInitResponseSchema.parse({
    upload: {
      uploadUrl: result.uploadUrl,
      storageKey: result.storageKey,
      expiresIn: result.expiresIn,
    },
    asset: {
      fileName: result.asset.fileName,
      fileSize: result.asset.fileSize,
      mimeType: result.asset.mimeType,
      storageKey: result.asset.storageKey,
    },
  });

  if (authorization.sessionSecretToSet) {
    setChatbotSessionSecretCookie(c, authorization.sessionSecretToSet);
  }

  return c.json(response, 201);
});

function getChatbotV3Runtime(): ConversationOrchestratorV3RuntimeService {
  if (!chatbotV3RuntimeSingleton) {
    chatbotV3RuntimeSingleton = createChatbotV3Runtime(getServices());
  }

  return chatbotV3RuntimeSingleton;
}

function createChatbotV3Runtime(services: AppServices): ConversationOrchestratorV3RuntimeService {
  const journeyRuntimeAuthority = createJourneyRuntimeAuthorityAdapter();
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
        categorySearch: async ({ sessionId, site, query, hospitalId }) =>
          handleFaqCategorySearch(services, sessionId, site, query, hospitalId),
        search: async ({ sessionId, site, query, category, hospitalId }) =>
          handleFaqSearch(services, sessionId, site, query, category, hospitalId),
        getByIds: async ({ ids, hospitalId }) => handleFaqGetByIds(services, ids, hospitalId),
      },
      records: {
        upload: async ({ sessionId, site, turnId, attachments }) =>
          handleRecordsUpload(services, sessionId, site, turnId, attachments),
        save: async ({ sessionId, site, turnId, records }) =>
          handleRecordsSave(services, sessionId, site, turnId, records),
        status: async ({ sessionId, site }) => ({
          state: deriveRecordsState((site ? await services.aiChatSessionRepo.findBySessionId(sessionId, site) : null)?.statusSnapshot),
        }),
      },
      recommendation: {
        generate: async ({ sessionId, site }) => ({
          recommendations: await generateRecommendations(services, sessionId, site),
        }),
        status: async ({ sessionId, site }) => ({
          state: deriveRecommendationState((site ? await services.aiChatSessionRepo.findBySessionId(sessionId, site) : null)?.statusSnapshot),
        }),
      },
      consult: {
        status: async ({ sessionId, site }) => ({
          state: deriveConsultState((site ? await services.aiChatSessionRepo.findBySessionId(sessionId, site) : null)?.statusSnapshot),
        }),
      },
      status: {
        query: async ({ sessionId, site }) => ({
          snapshot: buildStatusQuerySnapshot(
            site ? await services.aiChatSessionRepo.findBySessionId(sessionId, site) : null,
          ),
        }),
      },
      handoff: {
        create: async ({ sessionId, site, turnId, reason }) =>
          createHandoff(services, sessionId, site, turnId, reason),
        status: async ({ sessionId, site }) => ({
          state: deriveHandoffState((site ? await services.aiChatSessionRepo.findBySessionId(sessionId, site) : null)?.statusSnapshot),
        }),
      },
    },
  });

  return new ConversationOrchestratorV3RuntimeService({
    idempotency: services.idempotencyExecutor,
    supervisor: new SupervisorService(createChatbotV3SupervisorRouteAdapter({
      enabled: process.env['CHATBOT_V3_SUPERVISOR_LLM_ENABLED'] === 'true',
    })),
    journeyRuntimeAuthority,
    nodeEventEmitter,
    gateway: {
      records: gateway.records,
      recommendation: gateway.recommendation,
      consult: gateway.consult,
      handoff: gateway.handoff,
      status: gateway.status,
    },
    agents: {
      FaqAgent: new FaqAgent(gateway, createChatbotV3FaqRouteAdapter({
        enabled: process.env['CHATBOT_V3_FAQ_LLM_ENABLED'] === 'true',
      })),
      RecordsAgent: new RecordsAgent(gateway, createChatbotV3RecordsRouteAdapter({
        enabled: process.env['CHATBOT_V3_RECORDS_LLM_ENABLED'] === 'true',
      })),
      RecommendationAgent: new RecommendationAgent(gateway, createChatbotV3RecommendationRouteAdapter({
        enabled: process.env['CHATBOT_V3_RECOMMENDATION_LLM_ENABLED'] === 'true',
      })),
      ConsultAgent: new ConsultAgent(gateway),
      HandoffAgent: new HandoffAgent(gateway),
    },
  });
}

function createJourneyRuntimeAuthorityAdapter() {
  const authority = new JourneyRuntimeAuthorityService();

  return {
    decide(input: ConversationOrchestratorV3DecisionInput): ConversationOrchestratorV3Decision {
      const current = input.current ?? {
        stage: input.currentStage ?? 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      };
      const authorityDecision = authority.decide({
        current,
        proposal: input.suggestion,
        facts: input.facts,
        statusSnapshot: input.statusSnapshot,
        handoff: input.handoff,
        bootstrap: input.bootstrap,
        intake: input.intake,
      });

      if (authorityDecision.outcome === 'DENY') {
        return {
          action: 'STAY',
          from: authorityDecision.from,
          to: authorityDecision.to,
          dispatchSource: 'journey-runtime-authority',
          whyNotSkip: authorityDecision.reason,
          write: authorityDecision.write,
        };
      }

      const action = mapAuthorityActionToRuntimeAction(
        authorityDecision.from.stage,
        authorityDecision.to.stage,
        authorityDecision.action,
      );

      return {
        action,
        from: authorityDecision.from,
        to: action === 'STAY' ? authorityDecision.from : authorityDecision.to,
        dispatchAgent: authorityDecision.dispatch.outcome === 'ALLOW'
          ? authorityDecision.dispatch.agent
          : undefined,
        dispatchSource: 'journey-runtime-authority',
        write: authorityDecision.write,
      };
    },
  };
}

function mapAuthorityActionToRuntimeAction(
  currentStage: ChatJourneyStage,
  targetStage: ChatJourneyStage,
  action: 'ADVANCE' | 'ESCALATE' | 'REPEAT' | 'STAY',
): ConversationOrchestratorV3Decision['action'] {
  if (action === 'ESCALATE') {
    return 'HANDOFF';
  }

  if (currentStage === targetStage || action === 'REPEAT' || action === 'STAY') {
    return 'STAY';
  }

  const currentIndex = CANONICAL_JOURNEY_ORDER.indexOf(currentStage);
  const targetIndex = CANONICAL_JOURNEY_ORDER.indexOf(targetStage);

  if (currentIndex >= 0 && targetIndex >= 0 && targetIndex - currentIndex === 1) {
    return 'ADVANCE';
  }

  return 'SKIP';
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

function resolveFacts(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): Record<string, boolean> {
  const canonicalTruthFlags = deriveCanonicalTruthFlagsFromStatusSnapshot(statusSnapshot);
  const consultScheduled = hasAnyStatus(
    statusSnapshot?.consultationStatus,
    ['SCHEDULED', 'BOOKED', 'COMPLETED'],
  );

  return {
    ...canonicalTruthFlags,
    'records.saved': canonicalTruthFlags['records.minimal_triage.complete'],
    'recommendation.picked': canonicalTruthFlags['recommendation.selected'],
    'consult.scheduled': consultScheduled,
  };
}

async function resolveSupervisorIntakeSeed(
  services: AppServices,
  session: AiChatSession | null,
): Promise<MinimalIntakeSeed> {
  if (!session?.patientId) {
    return {
      condition: null,
      targetDestination: null,
      language: null,
      gender: null,
    };
  }

  const profile = await services.aiUserProfileRepo.findByAnonymousKeyOrPatient({
    patientId: session.patientId,
  });

  return {
    condition: profile?.conditionOrGoal ?? profile?.conditionCategory ?? null,
    targetDestination: profile?.preferredDestination[0] ?? null,
    language: profile?.preferredLanguage ?? null,
    gender: null,
  };
}

function resolveHandoffSignals(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
) {
  return {
    safetyPolicyHit: hasCrisisSafetySignal(statusSnapshot),
  };
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
  site: import('@medical-crm/domain').PatientSite | undefined,
  query: string,
  hospitalId: string | undefined,
) {
  const result = await services.listFaqCategoriesForChatbot.execute({
    hospitalType: await resolveFaqHospitalType(services, sessionId, site, hospitalId),
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
  site: import('@medical-crm/domain').PatientSite | undefined,
  query: string,
  category: string | undefined,
  hospitalId: string | undefined,
) {
  const faqQuery = {
    page: 1,
    limit: 5,
    ...(category ? { category } : {}),
    hospitalType: await resolveFaqHospitalType(services, sessionId, site, hospitalId),
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
  site: import('@medical-crm/domain').PatientSite | undefined,
  hospitalId: string | undefined,
): Promise<'COSMETIC' | 'REGULAR'> {
  if (hospitalId) {
    return services.resolveHospitalType(hospitalId);
  }

  if (!sessionId) {
    return 'COSMETIC';
  }

  if (!site) {
    return 'COSMETIC';
  }

  const session = await services.aiChatSessionRepo.findBySessionId(sessionId, site);
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

export function deriveRecommendationState(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): string {
  const selectionStatus = statusSnapshot?.recommendationSelectionStatus;
  if (selectionStatus === 'selected') {
    return 'confirmed';
  }

  if (selectionStatus === 'pending' || selectionStatus === 'skipped') {
    return 'processing';
  }

  const recommendationStatus = normalizeStatus(statusSnapshot?.recommendationStatus);
  const packageStatus = normalizeStatus(statusSnapshot?.packageStatus);

  if (recommendationStatus === 'CONFIRMED' || recommendationStatus === 'ACCEPTED'
    || packageStatus === 'CONFIRMED' || packageStatus === 'ACCEPTED') {
    return 'confirmed';
  }

  if (recommendationStatus === 'FAILED') {
    return 'failed';
  }

  if (statusSnapshot?.recommendationGenerated === true) {
    return 'processing';
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

function deriveHandoffState(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): string {
  const handoffStatus = normalizeStatus(statusSnapshot?.handoffStatus);

  if (handoffStatus === 'CLOSED' || handoffStatus === 'RESOLVED') {
    return 'closed';
  }

  if (handoffStatus === 'REQUESTED' || handoffStatus === 'OPEN' || handoffStatus === 'IN_PROGRESS') {
    return 'active';
  }

  if (handoffStatus === 'FAILED') {
    return 'failed';
  }

  return 'idle';
}

function buildStatusQuerySnapshot(session: AiChatSession | null): Record<string, unknown> {
  return {
    sessionStatus: session?.status ?? null,
    current: deriveCurrentStageFromStatusSnapshot(session?.statusSnapshot),
    truthFlags: session ? deriveCanonicalTruthFlagsFromStatusSnapshot(session.statusSnapshot) : null,
    statusSnapshot: serializeStatusSnapshot(session?.statusSnapshot),
  };
}

export function serializeStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): Record<string, unknown> | null {
  if (!statusSnapshot) {
    return null;
  }

  const canonicalTruthFlags = deriveCanonicalTruthFlagsFromStatusSnapshot(statusSnapshot);

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
    minimalTriageComplete: canonicalTruthFlags['records.minimal_triage.complete'],
    processExplained: canonicalTruthFlags['process.explained'],
    recommendationGenerated: canonicalTruthFlags['recommendation.generated'],
    recommendationSelectionStatus: statusSnapshot.recommendationSelectionStatus ?? null,
    recommendationSelectedHospitalIds: statusSnapshot.recommendationSelectedHospitalIds ?? null,
    recommendationSelected: canonicalTruthFlags['recommendation.selected'],
    consultCompleted: canonicalTruthFlags['consult.completed'],
    handoffActive: canonicalTruthFlags['handoff.active'],
    canonicalTruthFlags,
    conversationSummary: statusSnapshot.conversationSummary ?? '',
    lastPolicyDecisionAt: statusSnapshot.lastPolicyDecisionAt?.toISOString() ?? null,
    lastUserMessageAt: statusSnapshot.lastUserMessageAt?.toISOString() ?? null,
    lastAssistantMessageAt: statusSnapshot.lastAssistantMessageAt?.toISOString() ?? null,
  };
}

function hasActiveHandoffStatus(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  return deriveCanonicalTruthFlagsFromStatusSnapshot(statusSnapshot)['handoff.active'];
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
  return (value ?? '').trim().toUpperCase();
}

async function authorizeOrBootstrapSessionAccess(
  c: Context,
  services: AppServices,
  session: AiChatSession,
): Promise<
  | { ok: true; session: AiChatSession; sessionSecretToSet: string | null }
  | { ok: false; response: Response }
> {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return {
        ok: false,
        response: c.json({ error: error.message }, 400),
      };
    }
    throw error;
  }
  if (session.site && session.site !== site) {
    return {
      ok: false,
      response: c.json({ error: 'Forbidden' }, 403),
    };
  }
  const patientToken = session.patientId ? getCookie(c, PATIENT_SESSION_COOKIE) : undefined;
  if (session.patientId && patientToken && services.patientAuthService) {
    try {
      const payload = await services.patientAuthService.verifySessionToken(patientToken, site);
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
  site: import('@medical-crm/domain').PatientSite | undefined,
): Promise<Array<Record<string, unknown>>> {
  const session = site
    ? await services.aiChatSessionRepo.findBySessionId(sessionId, site)
    : null;
  if (!session) {
    return [];
  }

  const intake = await resolveSupervisorIntakeSeed(services, session);
  const matchedHospitals = await services.matchHospitals.execute({
    destination: intake.targetDestination ?? undefined,
  });
  const recommendations = compactMatchedHospitals(matchedHospitals.hospitals, intake);

  if (
    recommendations.length > 0
    && !deriveCanonicalTruthFlagsFromStatusSnapshot(session.statusSnapshot)['recommendation.generated']
  ) {
    await patchSessionStatus(services, session, {
      recommendationGenerated: true,
    });
  }

  return recommendations;
}

function compactMatchedHospitals(
  hospitals: Array<{
    id: string;
    name: string;
    nameEn: string | null;
    rating: number | null;
    logoUrl: string | null;
    tags: string[];
    procedureCount: number;
  }>,
  intake: MinimalIntakeSeed,
): Array<Record<string, unknown>> {
  return hospitals.slice(0, 3).map((hospital) => {
    const reason = buildRecommendationReason(hospital, intake);
    return {
      hospitalId: hospital.id,
      name: hospital.name,
      ...(reason ? { reason } : {}),
    };
  });
}

function buildRecommendationReason(
  hospital: {
    name: string;
    tags: string[];
    procedureCount: number;
    rating: number | null;
  },
  intake: MinimalIntakeSeed,
): string | null {
  const destination = intake.targetDestination?.trim();
  const firstTag = hospital.tags.find((tag) => tag.trim().length > 0)?.trim();

  if (destination) {
    return `Matched the requested destination: ${destination}.`;
  }

  if (firstTag) {
    return `Active hospital candidate with ${firstTag}.`;
  }

  if (hospital.procedureCount > 0) {
    return `Active hospital candidate in the current pool with ${hospital.procedureCount} procedures.`;
  }

  if (hospital.rating !== null) {
    return `Active hospital candidate in the current pool.`;
  }

  return 'Active hospital candidate in the current pool.';
}

async function createHandoff(
  services: AppServices,
  sessionId: string,
  site: import('@medical-crm/domain').PatientSite | undefined,
  turnId: string | undefined,
  reason: string,
): Promise<{
  handoffId?: string;
  created?: boolean;
  notification?: {
    ticketId: string;
    ticketNumber: string;
    patientId: string;
    patientName: null;
    subject: string;
    descriptionPreview: string;
  };
}> {
  if (!site) {
    return { created: false };
  }

  const session = await services.aiChatSessionRepo.findBySessionId(sessionId, site);
  if (!session || !session.patientId || !services.createTicket) {
    return { created: false };
  }

  const handoffTurnToken = turnId ?? randomUUID();
  const handoffTurnDigest = createHash('sha256')
    .update(`${sessionId}:handoff-ticket:${handoffTurnToken}`)
    .digest('hex');
  const idempotencyKey = `chatbot-v3:handoff:${handoffTurnDigest}`;

  const result = await services.idempotencyExecutor.execute(
    idempotencyKey,
    'chatbot_v3_handoff_ticket',
    async () => {
      const latestSession = await services.aiChatSessionRepo.findBySessionId(sessionId, site);
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
        handoffActive: true,
      });

      return {
        created: true,
        handoffId: ticket.id,
        notification: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          patientId: latestSession.patientId,
          patientName: null,
          subject: 'Chatbot v3 handoff request',
          descriptionPreview: reason,
        },
      };
    },
  );

  if (result.notification) {
    try {
      await services.notifyAdminsOfNewTicket.execute(result.notification);
    } catch (error) {
      console.warn('Failed to notify admins about chatbot v3 handoff ticket:', error);
    }
  }

  return result;
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
  site: import('@medical-crm/domain').PatientSite | undefined,
  turnId: string | undefined,
  attachments: Array<Record<string, unknown>> | undefined,
): Promise<{ uploadId?: string; accepted?: boolean }> {
  if (!site) {
    return { accepted: false };
  }

  const session = await services.aiChatSessionRepo.findBySessionId(sessionId, site);
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
  site: import('@medical-crm/domain').PatientSite | undefined,
  turnId: string | undefined,
  records: Array<Record<string, unknown>> | undefined,
): Promise<{ recordIds?: string[]; saved?: boolean }> {
  if (!site) {
    return { saved: false, recordIds: [] };
  }

  const session = await services.aiChatSessionRepo.findBySessionId(sessionId, site);
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

function shouldPersistAttachmentUpload(
  attachments: Array<Record<string, unknown>> | undefined,
  result: ConversationOrchestratorV3TurnResult,
): boolean {
  return (attachments?.length ?? 0) > 0
    && result.decision.dispatchAgent === 'RecordsAgent'
    && result.journey.stage === 'COLLECT_MINIMAL_MEDICAL_FACTS';
}

async function patchSessionStatus(
  services: AppServices,
  session: AiChatSession,
  patch: Partial<AiChatSession['statusSnapshot']>,
): Promise<AiChatSession> {
  const patched = await services.aiChatSessionRepo.patchStatus(session.sessionId, session.site, patch);
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

export function filterUnchangedStatusPatch(
  statusSnapshot: Partial<AiChatSession['statusSnapshot']> | null | undefined,
  patch: Partial<AiChatSession['statusSnapshot']>,
): Partial<AiChatSession['statusSnapshot']> {
  const filteredEntries = Object.entries(patch).filter(([key, nextValue]) => {
    const currentValue = statusSnapshot?.[key as keyof AiChatSession['statusSnapshot']];

    if (currentValue instanceof Date && nextValue instanceof Date) {
      return currentValue.toISOString() !== nextValue.toISOString();
    }

    if (Array.isArray(currentValue) && Array.isArray(nextValue)) {
      return currentValue.length !== nextValue.length
        || currentValue.some((value, index) => value !== nextValue[index]);
    }

    return currentValue !== nextValue;
  });

  return Object.fromEntries(filteredEntries);
}
