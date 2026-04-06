import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { AiChatCitation, AiChatSession } from '@medical-crm/domain';
import { AiChatMessage, AiChatSession as AiChatSessionEntity } from '@medical-crm/domain';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  chatbotChatSchema,
  chatbotConvertSchema,
  chatbotEscalateSchema,
  chatbotHistoryQuerySchema,
  chatbotSessionParamSchema,
  chatbotUploadInitSchema,
} from '@medical-crm/validation';
import {
  AI_POLICY_ENGAGEMENT_SIGNALS,
  AI_POLICY_PROGRESSION_SIGNALS,
  AI_POLICY_RECOMMENDATION_SIGNALS,
  AI_POLICY_RESOLVED_INTENTS,
  generateId,
} from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import { buildChatbotBlocks, extractStoredChatbotBlocks } from './chatbot-block-builder.js';

export const chatbotPublicRoutes = new OpenAPIHono();
export const chatbotProtectedRoutes = new OpenAPIHono();
const app = new OpenAPIHono();
const CHATBOT_SESSION_SECRET_COOKIE = 'chatbot_session_secret';
const PATIENT_SESSION_COOKIE = 'patient_session';
const PATIENT_RESTORE_COOKIE = 'patient_restore';
const DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK = {
  resolvedIntent: 'UNKNOWN',
  engagementSignal: 'LIGHT_DISCOVERY',
  progressionSignal: 'NONE',
  recommendationSignal: 'NONE',
  mentionsCondition: false,
  mentionsDoctorOrHospitalNeed: false,
} as const satisfies {
  resolvedIntent: import('@medical-crm/utils').AiPolicyResolvedIntent;
  engagementSignal: import('@medical-crm/utils').AiPolicyEngagementSignal;
  progressionSignal: import('@medical-crm/utils').AiPolicyProgressionSignal;
  recommendationSignal: import('@medical-crm/utils').AiPolicyRecommendationSignal;
  mentionsCondition: boolean;
  mentionsDoctorOrHospitalNeed: boolean;
};

function getDifyChatApiKey(): string | null {
  return process.env['DIFY_APP_API_KEY'] ?? process.env['DIFY_API_KEY'] ?? null;
}

const sendChatRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/chat',
  request: {
    body: {
      content: { 'application/json': { schema: chatbotChatSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Chatbot response' },
    401: { description: 'Missing or invalid chatbot session secret' },
    403: { description: 'Logged-in patient does not own this chatbot session' },
    500: { description: 'Chatbot provider unavailable or misconfigured' },
  },
});

chatbotPublicRoutes.openapi(sendChatRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();

  if (!getDifyChatApiKey()) {
    return c.json({ error: 'Dify API key is not configured' }, 500);
  }

  let session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId);
  let sessionSecretToSet: string | null = null;
  let effectiveHospitalType = body.hospitalType ?? null;

  if (!session) {
    if (!effectiveHospitalType) {
      return c.json({ error: 'Hospital type is required when starting a new chatbot session' }, 400);
    }
    sessionSecretToSet = createSessionSecret();
    session = await svc.aiChatSessionRepo.save(new AiChatSessionEntity({
      id: generateId(),
      sessionId: body.sessionId,
      sessionSecretHash: hashSessionSecret(sessionSecretToSet),
      difyConversationId: null,
      patientId: null,
      hospitalType: effectiveHospitalType,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  } else {
    const authorized = await authorizeSessionAccess(c, svc, session, { allowBootstrapWhenSecretMissing: true });
    if (authorized) {
      return authorized;
    }
    if (body.hospitalType && session.hospitalType !== body.hospitalType) {
      return c.json({ error: 'Hospital type does not match existing chatbot session' }, 409);
    }
    effectiveHospitalType = session.hospitalType;
    if (!session.sessionSecretHash) {
      sessionSecretToSet = createSessionSecret();
      session = await svc.aiChatSessionRepo.save(new AiChatSessionEntity({
        ...session,
        sessionSecretHash: hashSessionSecret(sessionSecretToSet),
        updatedAt: new Date(),
      }));
    }
  }

  const patientSync = await attachPatientFromCookie(c, svc, session);
  if (patientSync.error) {
    return patientSync.error;
  }
  session = patientSync.session;
  const userAttachments = body.attachments ?? [];

  const userMessage = await svc.aiChatMessageRepo.create(new AiChatMessage({
    id: generateId(),
    sessionId: session.id,
    role: 'USER',
    content: body.message,
    intent: null,
    riskLevel: null,
    canAnswer: null,
    nextAction: null,
    citations: [],
    metadata: {
      ...(body.pageContext ? { pageContext: body.pageContext } : {}),
      ...(userAttachments.length > 0 ? { attachments: userAttachments } : {}),
    },
    createdAt: new Date(),
  }));

  const assistantMessageId = generateId();
  await svc.aiChatMessageRepo.create(new AiChatMessage({
    id: assistantMessageId,
    sessionId: session.id,
    role: 'ASSISTANT',
    content: '',
    intent: null,
    riskLevel: null,
    canAnswer: null,
    nextAction: null,
    citations: [],
    metadata: {},
    createdAt: new Date(),
  }));

  let difyResponse: Record<string, unknown>;
  try {
    difyResponse = await svc.difyApi.createChatMessage({
      inputs: {
        hospitalType: effectiveHospitalType,
        sessionId: body.sessionId,
        assistantMessageId,
        attachmentsJson: JSON.stringify(userAttachments),
        pageContextJson: body.pageContext ? JSON.stringify(body.pageContext) : 'null',
        currentStatus: session.statusSnapshot,
        conversationSummary: session.statusSnapshot.conversationSummary,
        pendingOffer: session.statusSnapshot.pendingOffer,
        pendingQuestion: session.statusSnapshot.pendingQuestion,
        attachments: userAttachments,
        pageContext: body.pageContext ?? null,
      },
      query: body.message.trim().length > 0 ? body.message : 'Uploaded attachments',
      user: body.sessionId,
      conversationId: session.difyConversationId,
    });
  } catch (error) {
    await svc.aiChatMessageRepo.updateMessage(assistantMessageId, {
      metadata: {
        draftState: 'provider_error',
        failureStage: 'provider_request',
        failureRecordedAt: new Date().toISOString(),
      },
    }).catch(() => undefined);
    return c.json({
      error: error instanceof Error ? error.message : 'Dify request failed',
    }, 502);
  }

  const normalized = normalizeDifyChatResponse(difyResponse);
  if (!session.difyConversationId && normalized.conversationId) {
    session = await svc.aiChatSessionRepo.save(new AiChatSessionEntity({
      ...session,
      difyConversationId: normalized.conversationId,
      updatedAt: new Date(),
    }));
  }

  const richAction = asString((normalized.metadata as Record<string, unknown>).internalNextAction) ?? normalized.nextAction;
  const sessionMessagesRaw = (
    richAction === 'SHOW_HOSPITAL_RECOMMENDATIONS'
    || richAction === 'INVITE_ONLINE_CONSULT'
  )
    ? await svc.aiChatMessageRepo.listBySession(session.id, 100)
    : null;
  const sessionMessages = Array.isArray(sessionMessagesRaw) ? sessionMessagesRaw : [];
  const workflowState = richAction === 'SHOW_HOSPITAL_RECOMMENDATIONS'
    ? extractWorkflowState(sessionMessages)
    : { caseId: null, patientId: null, ticketId: null, lastConvertAction: null };
  const sessionCaseId = workflowState.caseId ?? extractWidgetSessionCaseId(session.sessionId);
  const blocks = buildChatbotBlocks({
    richAction,
    shortlist: normalized.shortlist,
    sessionCaseId,
    sessionConsultationStatus: session.statusSnapshot.consultationStatus,
    templateId: resolvePendingQuestionTemplateId(session.statusSnapshot.pendingQuestion),
    conversionDraft: richAction === 'INVITE_ONLINE_CONSULT'
      ? buildConsultConversionDraft(
          session.sessionId,
          mergeConsultCollectedFields(sessionMessages, normalized.collectedFields),
        )
      : null,
  });

  const assistantMessage = await svc.aiChatMessageRepo.updateMessage(assistantMessageId, {
    content: normalized.answer,
    intent: normalized.intent,
    resolvedIntent: normalized.resolvedIntent ?? null,
    riskLevel: normalized.riskLevel,
    canAnswer: normalized.canAnswer,
    nextAction: normalized.nextAction,
    secondaryAction: normalized.secondaryAction,
    responseMode: normalized.responseMode,
    citations: normalized.citations,
    reasonCodes: normalized.reasonCodes,
    shortlist: normalized.shortlist,
    metadata: {
      ...normalized.metadata,
      ...(blocks.length > 0 ? { blocks } : {}),
    },
  });

  if (!assistantMessage) {
    return c.json({ error: 'Assistant message draft missing after Dify response' }, 500);
  }

  if (sessionSecretToSet) {
    setChatbotSessionSecretCookie(c, sessionSecretToSet);
  }

  return c.json({
    sessionId: session.sessionId,
    messageId: assistantMessage.id,
    answer: assistantMessage.content,
    intent: assistantMessage.intent,
    topic: normalized.topic,
    riskLevel: assistantMessage.riskLevel,
    canAnswer: assistantMessage.canAnswer,
    nextAction: normalized.nextAction,
    secondaryAction: assistantMessage.secondaryAction,
    responseMode: assistantMessage.responseMode,
    citations: assistantMessage.citations,
    collectedFields: normalized.collectedFields,
    missingItems: normalized.missingItems,
    recommendedProviders: normalized.recommendedProviders,
    reasonCodes: assistantMessage.reasonCodes,
    shortlist: assistantMessage.shortlist,
    blocks,
    metadata: normalizePublicMetadataForHistory(assistantMessage.metadata),
    history: {
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    },
  }, 200);
});

const bootstrapChatbotSyncRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/sync',
  responses: {
    200: { description: 'FAQ and package full sync jobs enqueued' },
    403: { description: 'Admin only' },
  },
});

chatbotProtectedRoutes.openapi(bootstrapChatbotSyncRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  if (actor.role !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const svc = getServices();
  const result = await svc.bootstrapAiSync.execute(actor);
  return c.json(result, 200);
});

const convertChatRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/convert',
  request: {
    body: {
      content: { 'application/json': { schema: chatbotConvertSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Chatbot conversation converted into case-first onboarding' },
    401: { description: 'Missing or invalid chatbot session secret' },
    404: { description: 'Chatbot session not found' },
  },
});

chatbotPublicRoutes.openapi(convertChatRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  let session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session);
  if (authorized) {
    return authorized;
  }

  const messages = await svc.aiChatMessageRepo.listBySession(session.id, 200);
  const existingWorkflow = extractWorkflowState(messages);
  const existingAction = existingWorkflow.lastConvertAction ?? body.requestedAction ?? 'INVITE_ONLINE_CONSULT';

  if (!session.patientId && existingWorkflow.patientId) {
    session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, existingWorkflow.patientId)) ?? session;
  } else {
    const patientSync = await attachPatientFromCookie(c, svc, session);
    if (patientSync.error) {
      return patientSync.error;
    }
    session = patientSync.session;
  }

  if (existingWorkflow.caseId) {
    const { restoreToken } = await ensurePatientSessionCookies(c, svc, existingWorkflow.patientId ?? session.patientId);
    return c.json({
      sessionId: session.sessionId,
      patientId: existingWorkflow.patientId ?? session.patientId,
      caseId: existingWorkflow.caseId,
      restoreToken: restoreToken ?? undefined,
      requestedAction: existingAction,
      alreadyExists: true,
    }, 200);
  }

  const ensured = await ensureCaseForSession(c, svc, session, body);
  session = ensured.session;

  await recordWorkflowMessage(svc, session.id, {
    kind: 'CONVERT',
    requestedAction: body.requestedAction ?? 'INVITE_ONLINE_CONSULT',
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    form: buildLeadFormMetadata(body),
  });

  return c.json({
    sessionId: session.sessionId,
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    restoreToken: ensured.restoreToken,
    requestedAction: body.requestedAction ?? 'INVITE_ONLINE_CONSULT',
    isExistingPatient: ensured.isExistingPatient,
    alreadyExists: false,
  }, 200);
});

const escalateChatRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/escalate',
  request: {
    body: {
      content: { 'application/json': { schema: chatbotEscalateSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Chatbot conversation escalated to support ticket' },
    401: { description: 'Missing or invalid chatbot session secret' },
    404: { description: 'Chatbot session not found' },
  },
});

chatbotPublicRoutes.openapi(escalateChatRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  let session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session);
  if (authorized) {
    return authorized;
  }

  const messages = await svc.aiChatMessageRepo.listBySession(session.id, 200);
  const existingWorkflow = extractWorkflowState(messages);
  if (!session.patientId && existingWorkflow.patientId) {
    session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, existingWorkflow.patientId)) ?? session;
  } else {
    const patientSync = await attachPatientFromCookie(c, svc, session);
    if (patientSync.error) {
      return patientSync.error;
    }
    session = patientSync.session;
  }

  if (existingWorkflow.ticketId) {
    const { restoreToken } = await ensurePatientSessionCookies(c, svc, existingWorkflow.patientId ?? session.patientId);
    if (session.status !== 'ESCALATED') {
      session = (await svc.aiChatSessionRepo.updateStatus(session.sessionId, 'ESCALATED')) ?? session;
    }
    return c.json({
      sessionId: session.sessionId,
      patientId: existingWorkflow.patientId ?? session.patientId,
      caseId: existingWorkflow.caseId,
      ticketId: existingWorkflow.ticketId,
      restoreToken: restoreToken ?? undefined,
      alreadyExists: true,
    }, 200);
  }

  const ensured = existingWorkflow.caseId
    ? await ensureExistingCaseForSession(c, svc, session, existingWorkflow.caseId, body, existingWorkflow.patientId)
    : await ensureCaseForSession(c, svc, session, body);
  session = ensured.session;

  const transcriptMessages = await svc.aiChatMessageRepo.listBySession(session.id, 50);
  const ticket = await svc.createTicket.execute({
    caseId: ensured.caseId,
    type: 'AI_ESCALATION',
    priority: 'MEDIUM',
    subject: buildEscalationSubject(body.conditionSummary),
    description: buildEscalationDescription(body, transcriptMessages),
    sourcePage: '/chatbot',
  }, {
    userId: ensured.patientId,
    email: body.email,
    role: 'PATIENT',
    hospitalId: null,
  });

  session = (await svc.aiChatSessionRepo.updateStatus(session.sessionId, 'ESCALATED')) ?? session;

  await recordWorkflowMessage(svc, session.id, {
    kind: 'ESCALATE',
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    ticketId: ticket.id,
    reason: body.reason ?? null,
    form: buildLeadFormMetadata(body),
  });

  return c.json({
    sessionId: session.sessionId,
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    ticketId: ticket.id,
    restoreToken: ensured.restoreToken ?? undefined,
    alreadyExists: false,
  }, 200);
});

const initChatbotUploadRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/uploads/init',
  request: {
    body: {
      content: { 'application/json': { schema: chatbotUploadInitSchema } },
      required: true,
    },
  },
  responses: {
    201: { description: 'Chatbot document upload initialized' },
    401: { description: 'Missing or invalid chatbot session secret' },
    404: { description: 'Chatbot session not found' },
  },
});

chatbotPublicRoutes.openapi(initChatbotUploadRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  const session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session, { allowBootstrapWhenSecretMissing: true });
  if (authorized) {
    return authorized;
  }

  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'chatbot_request_docs',
    ownerType: 'ai_chat_session',
    ownerId: session.id,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });

  return c.json({
    upload: {
      uploadUrl: result.uploadUrl,
      storageKey: result.storageKey,
      expiresIn: result.expiresIn,
    },
    asset: result.asset,
  }, 201);
});

const getChatbotHistoryRoute = createRoute({
  method: 'get',
  path: '/api/v2/chatbot/history/{sessionId}',
  request: {
    params: chatbotSessionParamSchema,
    query: chatbotHistoryQuerySchema,
  },
  responses: {
    200: { description: 'Chatbot message history' },
    401: { description: 'Missing or invalid chatbot session secret' },
    403: { description: 'Logged-in patient does not own this chatbot session' },
    404: { description: 'Chatbot session not found' },
  },
});

chatbotPublicRoutes.openapi(getChatbotHistoryRoute, async (c) => {
  const { sessionId } = c.req.valid('param');
  const { limit } = c.req.valid('query');
  const svc = getServices();
  const session = await svc.aiChatSessionRepo.findBySessionId(sessionId);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session, { allowBootstrapWhenSecretMissing: true });
  if (authorized) {
    return authorized;
  }

  const messages = await svc.aiChatMessageRepo.listBySession(session.id, limit);
  const visibleMessages = messages.filter((message) => !isProviderFailedDraft(message));
  const attachmentKeys = visibleMessages
    .flatMap((message) => extractChatbotAttachments(message))
    .map((attachment) => attachment.storageKey)
    .filter((storageKey) =>
      storageKey &&
      !storageKey.startsWith('http://') &&
      !storageKey.startsWith('https://') &&
      !storageKey.startsWith('data:'),
    );
  const signedUrls = attachmentKeys.length > 0
    ? await svc.storage.getSignedUrls(Array.from(new Set(attachmentKeys)))
    : {};

  return c.json({
    session: {
      sessionId: session.sessionId,
      hospitalType: session.hospitalType,
      status: session.status,
      patientId: session.patientId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    messages: visibleMessages.reverse().map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      intent: message.intent,
      topic: asString(message.metadata.topic) ?? null,
      riskLevel: message.riskLevel,
      canAnswer: message.canAnswer,
      nextAction: normalizePublicNextAction(message.nextAction ?? undefined),
      secondaryAction: message.secondaryAction,
      responseMode: message.responseMode,
      citations: message.citations,
      reasonCodes: message.reasonCodes,
      shortlist: message.shortlist,
      blocks: extractStoredChatbotBlocks(message.metadata),
      metadata: normalizePublicMetadataForHistory(message.metadata),
      attachments: toPublicChatbotAttachments(extractChatbotAttachments(message), signedUrls),
      createdAt: message.createdAt.toISOString(),
    })),
  }, 200);
});

async function authorizeSessionAccess(
  c: Context,
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
  options?: { allowBootstrapWhenSecretMissing?: boolean },
) {
  const patientToken = session.patientId ? getCookie(c, PATIENT_SESSION_COOKIE) : undefined;
  if (session.patientId) {
    if (patientToken) {
      try {
        const payload = await svc.patientAuthService.verifySessionToken(patientToken);
        if (payload.userId === session.patientId) {
          return null;
        }
        return c.json({ error: 'Forbidden' }, 403);
      } catch {
        // Ignore stale patient cookies here and fall back to chatbot-session authorization.
      }
    }
  }

  const rawSecret = getCookie(c, CHATBOT_SESSION_SECRET_COOKIE);
  const allowBootstrapAccess = !session?.sessionSecretHash && options?.allowBootstrapWhenSecretMissing;
  if (allowBootstrapAccess) {
    if (!session.patientId) {
      return null;
    }
    if (patientToken) {
      return c.json({ error: 'Invalid or expired patient session' }, 401);
    }
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (!allowBootstrapAccess && (!session?.sessionSecretHash || !rawSecret || hashSessionSecret(rawSecret) !== session.sessionSecretHash)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (session.patientId) {
    if (patientToken) {
      try {
        const payload = await svc.patientAuthService.verifySessionToken(patientToken);
        if (payload.userId !== session.patientId) {
          return c.json({ error: 'Forbidden' }, 403);
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}

async function attachPatientFromCookie(
  c: Context,
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
): Promise<{ session: AiChatSession; error: Response | null }> {
  const patientToken = getCookie(c, PATIENT_SESSION_COOKIE);
  if (!patientToken) {
    return { session, error: null };
  }

  try {
    const payload = await svc.patientAuthService.verifySessionToken(patientToken);
    if (session.patientId && session.patientId !== payload.userId) {
      return { session, error: c.json({ error: 'Forbidden' }, 403) };
    }
    if (!session.patientId) {
      session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, payload.userId)) ?? session;
    }
    return { session, error: null };
  } catch {
    return { session, error: null };
  }
}

function hashSessionSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createSessionSecret(): string {
  return randomBytes(24).toString('hex');
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

function setPatientSessionCookies(c: Context, sessionToken: string, restoreCookie: string): void {
  setCookie(c, PATIENT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
  setCookie(c, PATIENT_RESTORE_COOKIE, restoreCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
}

async function ensurePatientSessionCookies(
  c: Context,
  svc: ReturnType<typeof getServices>,
  patientId: string | null | undefined,
): Promise<{ restoreToken: string | null }> {
  if (!patientId) {
    return { restoreToken: null };
  }

  const currentSessionCookie = getCookie(c, PATIENT_SESSION_COOKIE);
  let hasMatchingSession = false;

  if (currentSessionCookie) {
    try {
      const session = await svc.patientAuthService.verifySessionToken(currentSessionCookie);
      hasMatchingSession = session.userId === patientId;
    } catch {
      hasMatchingSession = false;
    }
  }

  const restoreArtifacts = await svc.patientAuthService.createGuestRestoreArtifacts(patientId);

  if (hasMatchingSession) {
    setCookie(c, PATIENT_RESTORE_COOKIE, restoreArtifacts.restoreCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });
    return { restoreToken: restoreArtifacts.restoreToken };
  }

  const sessionToken = await svc.patientAuthService.createSessionToken(patientId);
  setPatientSessionCookies(c, sessionToken, restoreArtifacts.restoreCookie);
  return { restoreToken: restoreArtifacts.restoreToken };
}

async function ensureCaseForSession(
  c: Context,
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
  input: {
    email: string;
    name: string;
    country: string;
    conditionSummary: string;
    budget: string;
  },
): Promise<{
  session: AiChatSession;
  patientId: string;
  caseId: string;
  isExistingPatient: boolean;
  restoreToken: string;
}> {
  const onboarding = await svc.initOnboarding.execute({
    email: input.email,
    name: input.name,
    preferredLanguage: 'en',
    destination: input.country,
    authenticatedPatientId: session.patientId ?? undefined,
  });

  setPatientSessionCookies(c, onboarding.token, onboarding.restoreCookie);
  session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, onboarding.patientId)) ?? session;

  const caseEntity = await svc.caseRepo.findById(onboarding.caseId);
  if (!caseEntity) {
    throw new Error('Newly created case was not found');
  }

  hydrateCaseFromChatbot(caseEntity, session, input);
  await svc.caseRepo.save(caseEntity);

  return {
    session,
    patientId: onboarding.patientId,
    caseId: onboarding.caseId,
    isExistingPatient: onboarding.isExistingPatient,
    restoreToken: onboarding.restoreToken,
  };
}

async function ensureExistingCaseForSession(
  c: Context,
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
  caseId: string,
  input: {
    email: string;
    name: string;
    country: string;
    conditionSummary: string;
    budget: string;
  },
  preferredPatientId?: string | null,
): Promise<{
  session: AiChatSession;
  patientId: string;
  caseId: string;
  isExistingPatient: boolean;
  restoreToken: string | null;
}> {
  const caseEntity = await svc.caseRepo.findById(caseId);
  if (!caseEntity) {
    throw new Error('Existing chatbot case was not found');
  }

  const patientId = preferredPatientId ?? caseEntity.patientId;
  const { restoreToken } = await ensurePatientSessionCookies(c, svc, patientId);

  if (!session.patientId) {
    session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, patientId)) ?? session;
  }

  hydrateCaseFromChatbot(caseEntity, session, input);
  await svc.caseRepo.save(caseEntity);

  return {
    session,
    patientId,
    caseId,
    isExistingPatient: true,
    restoreToken,
  };
}

function hydrateCaseFromChatbot(
  caseEntity: Awaited<ReturnType<ReturnType<typeof getServices>['caseRepo']['findById']>> extends infer T
    ? T extends null
      ? never
      : T
    : never,
  session: AiChatSession,
  input: {
    name: string;
    country: string;
    conditionSummary: string;
    budget: string;
  },
): void {
  caseEntity.patientName = input.name;
  caseEntity.patientCountry = input.country;
  caseEntity.conditionSummary = input.conditionSummary;
  caseEntity.structuredData = {
    ...(caseEntity.structuredData ?? {}),
    chatbot: {
      ...(asRecord(caseEntity.structuredData?.chatbot)),
      source: 'chatbot',
      sessionId: session.sessionId,
      budget: input.budget,
      lastSubmittedAt: new Date().toISOString(),
    },
  };
}

async function recordWorkflowMessage(
  svc: ReturnType<typeof getServices>,
  sessionDbId: string,
  workflow: Record<string, unknown> & { kind: 'CONVERT' | 'ESCALATE' },
): Promise<void> {
  await svc.aiChatMessageRepo.create(new AiChatMessage({
    id: generateId(),
    sessionId: sessionDbId,
    role: 'SYSTEM',
    content: workflow.kind === 'CONVERT'
      ? 'Chatbot consultation details submitted.'
      : 'Chatbot conversation escalated to support.',
    intent: null,
    riskLevel: null,
    canAnswer: null,
    nextAction: workflow.kind === 'CONVERT'
      ? normalizeNextAction(asString(workflow.requestedAction)) ?? 'INVITE_ONLINE_CONSULT'
      : 'ESCALATE',
    citations: [],
    metadata: { workflow },
    createdAt: new Date(),
  }));
}

function extractWorkflowState(messages: AiChatMessage[]): {
  caseId: string | null;
  patientId: string | null;
  ticketId: string | null;
  lastConvertAction: 'INVITE_ONLINE_CONSULT' | 'CREATE_CASE' | null;
} {
  let caseId: string | null = null;
  let patientId: string | null = null;
  let ticketId: string | null = null;
  let lastConvertAction: 'INVITE_ONLINE_CONSULT' | 'CREATE_CASE' | null = null;

  for (const message of messages) {
    const workflow = asRecord(message.metadata.workflow);
    const kind = asString(workflow.kind);

    if (!caseId) {
      caseId = asString(workflow.caseId) ?? caseId;
    }
    if (!patientId) {
      patientId = asString(workflow.patientId) ?? patientId;
    }
    if (kind === 'ESCALATE' && !ticketId) {
      ticketId = asString(workflow.ticketId) ?? ticketId;
    }
    if (kind === 'CONVERT' && !lastConvertAction) {
      const requestedAction = asString(workflow.requestedAction);
      if (requestedAction === 'CONSULT_CONVERSION' || requestedAction === 'INVITE_ONLINE_CONSULT') {
        lastConvertAction = 'INVITE_ONLINE_CONSULT';
      } else if (requestedAction === 'CREATE_CASE') {
        lastConvertAction = 'CREATE_CASE';
      }
    }
  }

  return { caseId, patientId, ticketId, lastConvertAction };
}

function buildLeadFormMetadata(input: {
  name: string;
  email: string;
  country: string;
  conditionSummary: string;
  budget: string;
}): Record<string, unknown> {
  return {
    name: input.name,
    email: input.email,
    country: input.country,
    conditionSummary: input.conditionSummary,
    budget: input.budget,
  };
}

function buildConsultConversionDraft(
  sessionId: string,
  collectedFields: Record<string, unknown> | null,
): {
  sessionId: string;
  name?: string;
  email?: string;
  country?: string;
  conditionSummary?: string;
  budget?: string;
} | null {
  if (!collectedFields) {
    return null;
  }

  const draft = {
    sessionId,
    name: asString(collectedFields['name']),
    email: asString(collectedFields['email']),
    country: asString(collectedFields['country']),
    conditionSummary: asString(collectedFields['conditionSummary']),
    budget: asString(collectedFields['budget']),
  };

  if (
    !draft.name
    || !draft.email
    || !draft.country
    || !draft.conditionSummary
    || !draft.budget
  ) {
    return null;
  }

  return draft;
}

function mergeConsultCollectedFields(
  sessionMessages: Array<{ metadata?: Record<string, unknown> | null }>,
  currentCollectedFields: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const merged: Record<string, unknown> = {};

  for (const message of [...sessionMessages].reverse()) {
    const metadata = asRecord(message.metadata ?? {});
    const structuredOutput = asRecord(metadata.structuredOutput ?? metadata.structured_output);
    const historicalFields = asRecord(
      metadata.collectedFields
      ?? metadata.collected_fields
      ?? structuredOutput.collectedFields
      ?? structuredOutput.collected_fields,
    );

    if (!historicalFields) {
      continue;
    }

    Object.assign(merged, historicalFields);
  }

  if (currentCollectedFields) {
    Object.assign(merged, currentCollectedFields);
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function extractWidgetSessionCaseId(sessionId: string): string | null {
  if (!sessionId.startsWith('widget-chat:')) {
    return null;
  }

  const [, , caseId] = sessionId.split(':');
  return typeof caseId === 'string' && caseId.length > 0 && caseId !== 'pending'
    ? caseId
    : null;
}

function buildEscalationSubject(conditionSummary: string): string {
  const normalized = conditionSummary.trim().replace(/\s+/g, ' ');
  const snippet = normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
  return `AI chatbot escalation: ${snippet}`;
}

function buildEscalationDescription(
  input: {
    name: string;
    email: string;
    country: string;
    conditionSummary: string;
    budget: string;
    reason?: string;
  },
  messages: AiChatMessage[],
): string {
  const transcript = messages
    .reverse()
    .filter((message) => message.role !== 'SYSTEM')
    .slice(-12)
    .map((message) => `[${message.role}] ${message.content}`)
    .join('\n');

  const sections = [
    'Escalated from AI chatbot conversation.',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Country: ${input.country}`,
    `Condition Summary: ${input.conditionSummary}`,
    `Budget: ${input.budget}`,
  ];

  if (input.reason) {
    sections.push(`Escalation Reason: ${input.reason}`);
  }

  if (transcript) {
    sections.push('', 'Recent Chat Transcript:', transcript);
  }

  return sections.join('\n');
}

function resolvePendingQuestionTemplateId(
  pendingQuestion: { type: string; payload: Record<string, unknown> } | null,
): string | null {
  if (!pendingQuestion || pendingQuestion.type !== 'QUESTIONNAIRE') {
    return null;
  }

  const templateId = asString(pendingQuestion.payload['templateId']);
  return templateId ?? null;
}

function extractChatbotAttachments(message: AiChatMessage): Array<{
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
}> {
  const attachments = message.role === 'USER'
    ? asArray(message.metadata.attachments)
    : [];

  return attachments
    .map((attachment) => asRecord(attachment))
    .map((attachment) => ({
      fileName: asString(attachment.fileName) ?? '',
      fileSize: asNumber(attachment.fileSize) ?? 0,
      mimeType: asString(attachment.mimeType) ?? '',
      storageKey: asString(attachment.storageKey) ?? '',
    }))
    .filter((attachment) =>
      attachment.fileName.length > 0
      && attachment.mimeType.length > 0
      && attachment.storageKey.length > 0
      && attachment.fileSize > 0,
    );
}

function toPublicChatbotAttachments(
  attachments: Array<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    storageKey: string;
  }>,
  signedUrls: Record<string, string>,
) {
  return attachments.map((attachment) => ({
    ...attachment,
    name: attachment.fileName,
    type: attachment.mimeType,
    size: attachment.fileSize,
    url: resolveAttachmentUrl(attachment.storageKey, signedUrls),
  }));
}

function resolveAttachmentUrl(storageKey: string, signedUrls: Record<string, string>): string {
  if (storageKey.startsWith('http://') || storageKey.startsWith('https://') || storageKey.startsWith('data:')) {
    return storageKey;
  }

  return signedUrls[storageKey] ?? '';
}

function normalizeDifyChatResponse(response: Record<string, unknown>) {
  const metadata = asRecord(response.metadata);
  const parsedAnswer = parseStructuredAnswer(response.answer);
  const citations = parsedAnswer?.citations ?? deriveCitations(metadata);
  const topic = parsedAnswer?.topic ?? null;
  const structuredMetadata = asRecord(parsedAnswer?.metadata ?? {});
  const rawNextAction = parsedAnswer?.nextAction ?? null;
  const rawPublicNextAction = asString(structuredMetadata.publicNextAction)
    ?? asString(structuredMetadata.public_next_action)
    ?? rawNextAction;
  const engagementMode = parsedAnswer?.engagementMode
    ?? asString(structuredMetadata.engagementMode)
    ?? asString(structuredMetadata.engagement_mode)
    ?? null;
  const internalNextAction = parsedAnswer?.internalNextAction
    ?? asString(structuredMetadata.internalNextAction)
    ?? asString(structuredMetadata.internal_next_action)
    ?? null;
  const canonicalResolvedIntent = normalizeCanonicalResolvedIntent(
    parsedAnswer?.canonicalResolvedIntent
    ?? parsedAnswer?.resolvedIntent
    ?? asString(structuredMetadata.resolvedIntent)
    ?? asString(structuredMetadata.resolved_intent),
  );
  const canonicalSemanticMetadata = buildCanonicalSemanticMetadata({
    resolvedIntent: canonicalResolvedIntent,
    engagementSignal: parsedAnswer?.engagementSignal
      ?? asString(structuredMetadata.engagementSignal)
      ?? asString(structuredMetadata.engagement_signal),
    progressionSignal: parsedAnswer?.progressionSignal
      ?? asString(structuredMetadata.progressionSignal)
      ?? asString(structuredMetadata.progression_signal),
    recommendationSignal: parsedAnswer?.recommendationSignal
      ?? asString(structuredMetadata.recommendationSignal)
      ?? asString(structuredMetadata.recommendation_signal),
    mentionsCondition: parsedAnswer?.mentionsCondition
      ?? asBoolean(structuredMetadata.mentionsCondition)
      ?? asBoolean(structuredMetadata.mentions_condition),
    mentionsDoctorOrHospitalNeed: parsedAnswer?.mentionsDoctorOrHospitalNeed
      ?? asBoolean(structuredMetadata.mentionsDoctorOrHospitalNeed)
      ?? asBoolean(structuredMetadata.mentions_doctor_or_hospital_need),
  });
  const normalizedInternalNextAction = normalizeNextAction(internalNextAction ?? undefined);
  const publicNextAction = normalizePublicNextAction(rawPublicNextAction ?? undefined);
  const canonicalActionMetadata = buildCanonicalActionMetadata({
    nextAction: publicNextAction,
    internalNextAction: normalizedInternalNextAction,
  });
  const normalizedStructuredMetadata = composeCanonicalMetadataEnvelope(
    structuredMetadata,
    canonicalSemanticMetadata,
    canonicalActionMetadata,
  );
  const normalizedMetadata = composeCanonicalMetadataEnvelope(
    {
      ...metadata,
      ...structuredMetadata,
    },
    canonicalSemanticMetadata,
    canonicalActionMetadata,
  );
  const publicRiskLevel = normalizeRiskLevel(parsedAnswer?.riskLevel);
  const collectedFields = sanitizeNullableRecord(parsedAnswer?.collectedFields);
  const recommendedProviders = sanitizeRecordArray(parsedAnswer?.recommendedProviders);
  const shortlist = sanitizeRecordArray(parsedAnswer?.shortlist);
  const citationsSafe = sanitizeCitationArray(citations);
  const publicStructuredOutput = parsedAnswer
    ? {
        answer: parsedAnswer.answer ?? asString(response.answer) ?? '',
        intent: normalizeIntent(parsedAnswer.intent),
        resolvedIntent: canonicalSemanticMetadata['resolvedIntent'] as string,
        topic,
        riskLevel: publicRiskLevel,
        canAnswer: parsedAnswer.canAnswer ?? null,
        nextAction: publicNextAction,
        secondaryAction: parsedAnswer.secondaryAction ?? null,
        responseMode: parsedAnswer.responseMode ?? null,
        collectedFields,
        missingItems: parsedAnswer.missingItems ?? [],
        recommendedProviders,
        reasonCodes: parsedAnswer.reasonCodes ?? [],
        shortlist,
        citations: citationsSafe,
        metadata: {
          ...normalizedStructuredMetadata,
          engagementMode,
          internalRiskLevel: parsedAnswer.riskLevel ?? null,
          topic,
        },
      }
    : null;

  return {
    answer: parsedAnswer?.answer ?? asString(response.answer) ?? '',
    intent: normalizeIntent(parsedAnswer?.intent),
    resolvedIntent: canonicalSemanticMetadata['resolvedIntent'] as string,
    topic,
    riskLevel: publicRiskLevel,
    canAnswer: parsedAnswer?.canAnswer ?? null,
    nextAction: publicNextAction,
    secondaryAction: parsedAnswer?.secondaryAction ?? null,
    responseMode: parsedAnswer?.responseMode ?? null,
    collectedFields,
    missingItems: parsedAnswer?.missingItems ?? [],
    recommendedProviders,
    reasonCodes: parsedAnswer?.reasonCodes ?? [],
    shortlist,
    citations: citationsSafe,
    conversationId: asString(response.conversation_id),
    messageId: asString(response.message_id),
    taskId: asString(response.task_id),
    metadata: {
      ...normalizedMetadata,
      engagementMode,
      internalRiskLevel: parsedAnswer?.riskLevel ?? null,
      topic,
      structuredOutput: publicStructuredOutput,
    },
    storedNextAction: publicNextAction,
  };
}

function parseStructuredAnswer(value: unknown): {
  answer?: string;
  intent?: string;
  canonicalResolvedIntent?: string;
  resolvedIntent?: string;
  topic?: string;
  riskLevel?: string;
  canAnswer?: boolean;
  nextAction?: string;
  secondaryAction?: string;
  responseMode?: string;
  reasonCodes?: string[];
  shortlist?: Array<Record<string, unknown>>;
  citations?: AiChatCitation[];
  engagementMode?: string;
  engagementSignal?: string;
  progressionSignal?: string;
  recommendationSignal?: string;
  mentionsCondition?: boolean;
  mentionsDoctorOrHospitalNeed?: boolean;
  internalNextAction?: string;
  metadata?: Record<string, unknown>;
  collectedFields?: Record<string, unknown>;
  missingItems?: string[];
  recommendedProviders?: Record<string, unknown>[];
} | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      answer: asString(parsed.answer),
      intent: asString(parsed.intent) ?? asString(parsed['intent']),
      canonicalResolvedIntent: asString(parsed.canonicalResolvedIntent) ?? asString(parsed.canonical_resolved_intent),
      resolvedIntent: asString(parsed.resolvedIntent) ?? asString(parsed.resolved_intent),
      topic: asString(parsed.topic),
      riskLevel: asString(parsed.riskLevel) ?? asString(parsed.risk_level),
      canAnswer: typeof parsed.canAnswer === 'boolean'
        ? parsed.canAnswer
        : typeof parsed.can_answer === 'boolean'
          ? parsed.can_answer
          : undefined,
      nextAction: asString(parsed.nextAction) ?? asString(parsed.next_action),
      secondaryAction: asString(parsed.secondaryAction) ?? asString(parsed.secondary_action),
      responseMode: asString(parsed.responseMode) ?? asString(parsed.response_mode),
      reasonCodes: Array.isArray(parsed.reasonCodes)
        ? parsed.reasonCodes.filter((item): item is string => typeof item === 'string')
        : Array.isArray(parsed.reason_codes)
          ? parsed.reason_codes.filter((item): item is string => typeof item === 'string')
          : undefined,
      engagementMode: asString(parsed.engagementMode) ?? asString(parsed.engagement_mode),
      engagementSignal: asString(parsed.engagementSignal) ?? asString(parsed.engagement_signal),
      progressionSignal: asString(parsed.progressionSignal) ?? asString(parsed.progression_signal),
      recommendationSignal: asString(parsed.recommendationSignal) ?? asString(parsed.recommendation_signal),
      mentionsCondition: asBoolean(parsed.mentionsCondition) ?? asBoolean(parsed.mentions_condition),
      mentionsDoctorOrHospitalNeed: asBoolean(parsed.mentionsDoctorOrHospitalNeed) ?? asBoolean(parsed.mentions_doctor_or_hospital_need),
      internalNextAction: asString(parsed.internalNextAction) ?? asString(parsed.internal_next_action),
      metadata: asRecord(parsed.metadata),
      shortlist: Array.isArray(parsed.shortlist)
        ? parsed.shortlist.map((item) => asRecord(item))
        : undefined,
      citations: Array.isArray(parsed.citations) ? parsed.citations as AiChatCitation[] : undefined,
      collectedFields: asRecord(parsed.collectedFields ?? parsed.collected_fields),
      missingItems: Array.isArray(parsed.missingItems) ? parsed.missingItems.filter((item): item is string => typeof item === 'string') : undefined,
      recommendedProviders: Array.isArray(parsed.recommendedProviders)
        ? parsed.recommendedProviders.map((item) => asRecord(item))
        : Array.isArray(parsed.recommended_providers)
          ? parsed.recommended_providers.map((item) => asRecord(item))
        : undefined,
    };
  } catch {
    return null;
  }
}

function deriveCitations(metadata: Record<string, unknown>): AiChatCitation[] {
  const resources = Array.isArray(metadata.retriever_resources)
    ? metadata.retriever_resources
    : [];

  return resources.map((resource) => {
    const record = asRecord(resource);
    return {
      sourceTitle: asString(record.document_name) ?? asString(record.dataset_name) ?? asString(record.title),
      snippet: asString(record.segment_content) ?? asString(record.content),
      sourceType: asString(record.data_source_type) ?? 'KNOWLEDGE',
      documentId: asString(record.document_id),
    };
  }).filter((item) => item.sourceTitle || item.snippet);
}

function normalizeIntent(value: string | undefined): import('@medical-crm/domain').AiChatIntent | null {
  if (value === 'FAQ' || value === 'CONSULT' || value === 'UNKNOWN' || value === 'SAFETY') return value;
  return null;
}

function normalizeRiskLevel(value: string | undefined): import('@medical-crm/domain').AiChatRiskLevel | null {
  if (value === 'HIGH_RISK' || value === 'HIGH') return 'CRISIS';
  if (value === 'NORMAL' || value === 'SENSITIVE' || value === 'CRISIS') return value;
  return null;
}

function normalizeNextAction(value: string | undefined): import('@medical-crm/domain').AiChatNextAction | null {
  if (
    value === 'ANSWER'
    || value === 'CREATE_CASE'
    || value === 'REQUEST_DOCS'
    || value === 'ESCALATE'
    || value === 'SAFETY'
    || value === 'CONSULT_CONVERSION'
    || value === 'ANSWER_FAQ'
    || value === 'EXPLAIN_DOC_UPLOAD'
    || value === 'EXPLAIN_MEDICAL_TRAVEL_PROCESS'
    || value === 'EXPLAIN_CONSULT_PROCESS'
    || value === 'EXPLORE_HOSPITAL_RECOMMENDATIONS'
    || value === 'SHOW_HOSPITAL_RECOMMENDATIONS'
    || value === 'REQUEST_DOC_UPLOAD'
    || value === 'INVITE_ONLINE_CONSULT'
    || value === 'SHOW_PACKAGE'
    || value === 'HUMAN_HANDOFF'
    || value === 'SAFETY_HANDOFF'
  ) return value === 'CONSULT_CONVERSION' ? 'INVITE_ONLINE_CONSULT' : value;
  return null;
}

function normalizePublicNextAction(value: string | undefined): import('@medical-crm/domain').AiChatNextAction | null {
  if (value === 'ANSWER' || value === 'ANSWER_FAQ') return 'ANSWER_FAQ';
  if (value === 'REQUEST_DOCS' || value === 'REQUEST_DOC_UPLOAD') return 'REQUEST_DOC_UPLOAD';
  if (value === 'ESCALATE' || value === 'HUMAN_HANDOFF') return 'HUMAN_HANDOFF';
  if (value === 'SAFETY' || value === 'SAFETY_HANDOFF') return 'SAFETY_HANDOFF';
  if (value === 'CONSULT_CONVERSION' || value === 'INVITE_ONLINE_CONSULT') return 'INVITE_ONLINE_CONSULT';
  if (
    value === 'EXPLAIN_DOC_UPLOAD'
    || value === 'EXPLAIN_MEDICAL_TRAVEL_PROCESS'
    || value === 'EXPLAIN_CONSULT_PROCESS'
    || value === 'EXPLORE_HOSPITAL_RECOMMENDATIONS'
    || value === 'SHOW_HOSPITAL_RECOMMENDATIONS'
    || value === 'SHOW_PACKAGE'
  ) return value;
  return null;
}

function normalizeCanonicalResolvedIntent(value: string | undefined): import('@medical-crm/utils').AiPolicyResolvedIntent | null {
  return isAllowedEnumValue(value, AI_POLICY_RESOLVED_INTENTS) ? value : null;
}

function normalizeCanonicalEngagementSignal(value: string | undefined): import('@medical-crm/utils').AiPolicyEngagementSignal | null {
  return isAllowedEnumValue(value, AI_POLICY_ENGAGEMENT_SIGNALS) ? value : null;
}

function normalizeCanonicalProgressionSignal(value: string | undefined): import('@medical-crm/utils').AiPolicyProgressionSignal | null {
  return isAllowedEnumValue(value, AI_POLICY_PROGRESSION_SIGNALS) ? value : null;
}

function normalizeCanonicalRecommendationSignal(value: string | undefined): import('@medical-crm/utils').AiPolicyRecommendationSignal | null {
  return isAllowedEnumValue(value, AI_POLICY_RECOMMENDATION_SIGNALS) ? value : null;
}

function buildCanonicalSemanticMetadata(input: {
  resolvedIntent?: string | null;
  engagementSignal?: string | null;
  progressionSignal?: string | null;
  recommendationSignal?: string | null;
  mentionsCondition?: boolean;
  mentionsDoctorOrHospitalNeed?: boolean;
}): Record<string, unknown> {
  const resolvedIntent = normalizeCanonicalResolvedIntent(input.resolvedIntent ?? undefined)
    ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.resolvedIntent;
  const engagementSignal = normalizeCanonicalEngagementSignal(input.engagementSignal ?? undefined)
    ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.engagementSignal;
  const progressionSignal = normalizeCanonicalProgressionSignal(input.progressionSignal ?? undefined)
    ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.progressionSignal;
  const recommendationSignal = normalizeCanonicalRecommendationSignal(input.recommendationSignal ?? undefined)
    ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.recommendationSignal;
  const mentionsCondition = input.mentionsCondition
    ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.mentionsCondition;
  const mentionsDoctorOrHospitalNeed = input.mentionsDoctorOrHospitalNeed
    ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.mentionsDoctorOrHospitalNeed;

  const normalized: Record<string, unknown> = {
    resolvedIntent,
    resolved_intent: resolvedIntent,
    engagementSignal,
    engagement_signal: engagementSignal,
    progressionSignal,
    progression_signal: progressionSignal,
    recommendationSignal,
    recommendation_signal: recommendationSignal,
    mentionsCondition,
    mentions_condition: mentionsCondition,
    mentionsDoctorOrHospitalNeed,
    mentions_doctor_or_hospital_need: mentionsDoctorOrHospitalNeed,
    semanticSignals: {
      resolvedIntent,
      engagementSignal,
      progressionSignal,
      recommendationSignal,
      mentionsCondition,
      mentionsDoctorOrHospitalNeed,
    },
  };

  return normalized;
}

function buildCanonicalActionMetadata(input: {
  nextAction: import('@medical-crm/domain').AiChatNextAction | null;
  internalNextAction: import('@medical-crm/domain').AiChatNextAction | null;
}): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  if (input.nextAction) {
    normalized['nextAction'] = input.nextAction;
    normalized['next_action'] = input.nextAction;
    normalized['publicNextAction'] = input.nextAction;
    normalized['public_next_action'] = input.nextAction;
  }
  if (input.internalNextAction) {
    normalized['internalNextAction'] = input.internalNextAction;
    normalized['internal_next_action'] = input.internalNextAction;
  }
  return normalized;
}

function composeCanonicalMetadataEnvelope(
  source: Record<string, unknown>,
  canonicalSemanticMetadata: Record<string, unknown>,
  canonicalActionMetadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...stripCanonicalOverlayKeys(source),
    ...canonicalSemanticMetadata,
    ...canonicalActionMetadata,
  };
}

function stripCanonicalOverlayKeys(source: Record<string, unknown>): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (isCanonicalOverlayKey(key)) {
      continue;
    }
    stripped[key] = stripCanonicalOverlayValue(value);
  }
  return stripped;
}

function stripCanonicalOverlayValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripCanonicalOverlayValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return stripCanonicalOverlayKeys(value as Record<string, unknown>);
}

function isCanonicalOverlayKey(key: string): boolean {
  return key === 'resolvedIntent'
    || key === 'resolved_intent'
    || key === 'engagementSignal'
    || key === 'engagement_signal'
    || key === 'progressionSignal'
    || key === 'progression_signal'
    || key === 'recommendationSignal'
    || key === 'recommendation_signal'
    || key === 'mentionsCondition'
    || key === 'mentions_condition'
    || key === 'mentionsDoctorOrHospitalNeed'
    || key === 'mentions_doctor_or_hospital_need'
    || key === 'semanticSignals'
    || key === 'nextAction'
    || key === 'next_action'
    || key === 'publicNextAction'
    || key === 'public_next_action'
    || key === 'internalNextAction'
    || key === 'internal_next_action';
}

function normalizePublicMetadataForHistory(value: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeHistoryMetadataValue(sanitizeUnknownValue(value));
  const normalizedRecord = asRecord(normalized);
  const structuredOutputSource = asRecord(normalizedRecord.structuredOutput);
  const root = applyStrictHistoryCanonicalEnvelope(normalizedRecord);
  if (Object.keys(structuredOutputSource).length > 0) {
    root.structuredOutput = applyStrictHistoryStructuredOutput(structuredOutputSource);
  }
  return root;
}


function normalizeHistoryMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeHistoryMetadataValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(source)) {
    if (
      key === 'requestedAction'
      || key === 'requested_action'
    ) {
      sanitized[key] = normalizePublicNextAction(asString(nestedValue));
      continue;
    }

    sanitized[key] = normalizeHistoryMetadataValue(nestedValue);
  }

  return sanitized;
}

function applyStrictHistoryCanonicalEnvelope(source: Record<string, unknown>): Record<string, unknown> {
  return composeCanonicalMetadataEnvelope(
    source,
    buildCanonicalSemanticMetadata({
      resolvedIntent: asString(source.resolvedIntent) ?? asString(source.resolved_intent),
      engagementSignal: asString(source.engagementSignal) ?? asString(source.engagement_signal),
      progressionSignal: asString(source.progressionSignal) ?? asString(source.progression_signal),
      recommendationSignal: asString(source.recommendationSignal) ?? asString(source.recommendation_signal),
      mentionsCondition: asBoolean(source.mentionsCondition) ?? asBoolean(source.mentions_condition),
      mentionsDoctorOrHospitalNeed: asBoolean(source.mentionsDoctorOrHospitalNeed) ?? asBoolean(source.mentions_doctor_or_hospital_need),
    }),
    buildCanonicalActionMetadata({
      nextAction: normalizePublicNextAction(
        asString(source.publicNextAction)
        ?? asString(source.public_next_action)
        ?? asString(source.nextAction)
        ?? asString(source.next_action),
      ),
      internalNextAction: normalizeNextAction(
        asString(source.internalNextAction)
        ?? asString(source.internal_next_action),
      ),
    }),
  );
}

function applyStrictHistoryStructuredOutput(source: Record<string, unknown>): Record<string, unknown> {
  const metadataSource = asRecord(source.metadata);
  const strictStructuredOutput = composeCanonicalMetadataEnvelope(
    source,
    buildCanonicalSemanticMetadata({
      resolvedIntent: asString(source.resolvedIntent) ?? asString(source.resolved_intent),
    }),
    buildCanonicalActionMetadata({
      nextAction: normalizePublicNextAction(
        asString(source.publicNextAction)
        ?? asString(source.public_next_action)
        ?? asString(source.nextAction)
        ?? asString(source.next_action),
      ),
      internalNextAction: normalizeNextAction(
        asString(source.internalNextAction)
        ?? asString(source.internal_next_action),
      ),
    }),
  );
  if (Object.keys(metadataSource).length > 0) {
    strictStructuredOutput.metadata = applyStrictHistoryCanonicalEnvelope(metadataSource);
  }
  return strictStructuredOutput;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isAllowedEnumValue<const TValues extends readonly string[]>(
  value: string | undefined,
  allowedValues: TValues,
): value is TValues[number] {
  return typeof value === 'string' && (allowedValues as readonly string[]).includes(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sanitizeNullableRecord(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  return sanitizeUnknownValue(value) as Record<string, unknown>;
}

function sanitizeRecordArray(value: Array<Record<string, unknown>> | undefined): Array<Record<string, unknown>> {
  if (!value) return [];
  return sanitizeUnknownValue(value) as Array<Record<string, unknown>>;
}

function sanitizeCitationArray(value: AiChatCitation[]): AiChatCitation[] {
  return sanitizeUnknownValue(value) as AiChatCitation[];
}

function isProviderFailedDraft(message: { role?: string | null; content?: string | null; metadata?: Record<string, unknown> | null }): boolean {
  return (message.role ?? '').toUpperCase() === 'ASSISTANT'
    && (message.content ?? '') === ''
    && asString(message.metadata?.draftState) === 'provider_error';
}

function sanitizeUnknownValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknownValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (
      key === 'rawResponse'
      || key === 'raw_response'
      || key === 'conversation_id'
      || key === 'message_id'
      || key === 'task_id'
    ) {
      continue;
    }

    sanitized[key] = sanitizeUnknownValue(nestedValue);
  }

  return sanitized;
}

export default app;

app.route('/', chatbotPublicRoutes);
app.route('/', chatbotProtectedRoutes);
