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
import { generateId } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();
const CHATBOT_SESSION_SECRET_COOKIE = 'chatbot_session_secret';
const PATIENT_SESSION_COOKIE = 'patient_session';

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

app.openapi(sendChatRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();

  if (!getDifyChatApiKey()) {
    return c.json({ error: 'Dify API key is not configured' }, 500);
  }

  let session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId);
  let sessionSecretToSet: string | null = null;

  if (!session) {
    sessionSecretToSet = createSessionSecret();
    session = await svc.aiChatSessionRepo.save(new AiChatSessionEntity({
      id: generateId(),
      sessionId: body.sessionId,
      sessionSecretHash: hashSessionSecret(sessionSecretToSet),
      difyConversationId: null,
      patientId: null,
      hospitalType: body.hospitalType,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  } else {
    const authorized = await authorizeSessionAccess(c, svc, session, { allowBootstrapWhenSecretMissing: true });
    if (authorized) {
      return authorized;
    }
    if (session.hospitalType !== body.hospitalType) {
      return c.json({ error: 'Hospital type does not match existing chatbot session' }, 409);
    }
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
    metadata: {},
    createdAt: new Date(),
  }));

  let difyResponse: Record<string, unknown>;
  try {
    difyResponse = await svc.difyApi.createChatMessage({
      inputs: {
        hospitalType: body.hospitalType,
        sessionId: body.sessionId,
      },
      query: body.message,
      user: body.sessionId,
      conversationId: session.difyConversationId,
    });
  } catch (error) {
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

  const assistantMessage = await svc.aiChatMessageRepo.create(new AiChatMessage({
    id: generateId(),
    sessionId: session.id,
    role: 'ASSISTANT',
    content: normalized.answer,
    intent: normalized.intent,
    riskLevel: normalized.riskLevel,
    canAnswer: normalized.canAnswer,
    nextAction: normalized.nextAction,
    citations: normalized.citations,
    metadata: normalized.metadata,
    createdAt: new Date(),
  }));

  if (sessionSecretToSet) {
    setChatbotSessionSecretCookie(c, sessionSecretToSet);
  }

  return c.json({
    sessionId: session.sessionId,
    messageId: assistantMessage.id,
    answer: assistantMessage.content,
    intent: assistantMessage.intent,
    riskLevel: assistantMessage.riskLevel,
    canAnswer: assistantMessage.canAnswer,
    nextAction: assistantMessage.nextAction,
    citations: assistantMessage.citations,
    collectedFields: normalized.collectedFields,
    missingItems: normalized.missingItems,
    recommendedProviders: normalized.recommendedProviders,
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

app.openapi(bootstrapChatbotSyncRoute, async (c) => {
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

app.openapi(convertChatRoute, async (c) => {
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

  const patientSync = await attachPatientFromCookie(c, svc, session);
  if (patientSync.error) {
    return patientSync.error;
  }
  session = patientSync.session;

  const messages = await svc.aiChatMessageRepo.listBySession(session.id, 200);
  const existingWorkflow = extractWorkflowState(messages);
  const existingAction = existingWorkflow.lastConvertAction ?? body.requestedAction ?? 'CONSULT_CONVERSION';

  if (existingWorkflow.caseId) {
    if (!session.patientId && existingWorkflow.patientId) {
      session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, existingWorkflow.patientId)) ?? session;
    }
    await ensurePatientSessionCookie(c, svc, existingWorkflow.patientId ?? session.patientId);
    return c.json({
      sessionId: session.sessionId,
      patientId: existingWorkflow.patientId ?? session.patientId,
      caseId: existingWorkflow.caseId,
      requestedAction: existingAction,
      alreadyExists: true,
    }, 200);
  }

  const ensured = await ensureCaseForSession(c, svc, session, body);
  session = ensured.session;

  await recordWorkflowMessage(svc, session.id, {
    kind: 'CONVERT',
    requestedAction: body.requestedAction ?? 'CONSULT_CONVERSION',
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    form: buildLeadFormMetadata(body),
  });

  return c.json({
    sessionId: session.sessionId,
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    requestedAction: body.requestedAction ?? 'CONSULT_CONVERSION',
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

app.openapi(escalateChatRoute, async (c) => {
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

  const patientSync = await attachPatientFromCookie(c, svc, session);
  if (patientSync.error) {
    return patientSync.error;
  }
  session = patientSync.session;

  const messages = await svc.aiChatMessageRepo.listBySession(session.id, 200);
  const existingWorkflow = extractWorkflowState(messages);
  if (existingWorkflow.ticketId) {
    await ensurePatientSessionCookie(c, svc, existingWorkflow.patientId ?? session.patientId);
    if (session.status !== 'ESCALATED') {
      session = (await svc.aiChatSessionRepo.updateStatus(session.sessionId, 'ESCALATED')) ?? session;
    }
    return c.json({
      sessionId: session.sessionId,
      patientId: existingWorkflow.patientId ?? session.patientId,
      caseId: existingWorkflow.caseId,
      ticketId: existingWorkflow.ticketId,
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

app.openapi(initChatbotUploadRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  const session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session);
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

app.openapi(getChatbotHistoryRoute, async (c) => {
  const { sessionId } = c.req.valid('param');
  const { limit } = c.req.valid('query');
  const svc = getServices();
  const session = await svc.aiChatSessionRepo.findBySessionId(sessionId);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session);
  if (authorized) {
    return authorized;
  }

  const messages = await svc.aiChatMessageRepo.listBySession(session.id, limit);

  return c.json({
    session: {
      sessionId: session.sessionId,
      hospitalType: session.hospitalType,
      status: session.status,
      patientId: session.patientId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    messages: messages.reverse().map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      intent: message.intent,
      riskLevel: message.riskLevel,
      canAnswer: message.canAnswer,
      nextAction: message.nextAction,
      citations: message.citations,
      metadata: message.metadata,
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
  const rawSecret = getCookie(c, CHATBOT_SESSION_SECRET_COOKIE);
  if (!session?.sessionSecretHash && options?.allowBootstrapWhenSecretMissing) {
    return null;
  }
  if (!session?.sessionSecretHash || !rawSecret || hashSessionSecret(rawSecret) !== session.sessionSecretHash) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (session.patientId) {
    const patientToken = getCookie(c, PATIENT_SESSION_COOKIE);
    if (patientToken) {
      try {
        const payload = await svc.patientAuthService.verifySessionToken(patientToken);
        if (payload.userId !== session.patientId) {
          return c.json({ error: 'Forbidden' }, 403);
        }
      } catch {
        return c.json({ error: 'Invalid or expired patient session' }, 401);
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
    return { session, error: c.json({ error: 'Invalid or expired patient session' }, 401) };
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

function setPatientSessionCookie(c: Context, value: string): void {
  setCookie(c, PATIENT_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
}

async function ensurePatientSessionCookie(
  c: Context,
  svc: ReturnType<typeof getServices>,
  patientId: string | null | undefined,
): Promise<void> {
  if (!patientId || getCookie(c, PATIENT_SESSION_COOKIE)) {
    return;
  }

  const token = await svc.patientAuthService.createSessionToken(patientId);
  setPatientSessionCookie(c, token);
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
}> {
  const onboarding = await svc.initOnboarding.execute({
    email: input.email,
    name: input.name,
    preferredLanguage: 'en',
    destination: input.country,
  });

  setPatientSessionCookie(c, onboarding.token);
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
}> {
  const caseEntity = await svc.caseRepo.findById(caseId);
  if (!caseEntity) {
    throw new Error('Existing chatbot case was not found');
  }

  const patientId = preferredPatientId ?? caseEntity.patientId;
  await ensurePatientSessionCookie(c, svc, patientId);

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
      ? normalizeNextAction(asString(workflow.requestedAction)) ?? 'CONSULT_CONVERSION'
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
  lastConvertAction: 'CONSULT_CONVERSION' | 'CREATE_CASE' | null;
} {
  let caseId: string | null = null;
  let patientId: string | null = null;
  let ticketId: string | null = null;
  let lastConvertAction: 'CONSULT_CONVERSION' | 'CREATE_CASE' | null = null;

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
      if (requestedAction === 'CONSULT_CONVERSION' || requestedAction === 'CREATE_CASE') {
        lastConvertAction = requestedAction;
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

function normalizeDifyChatResponse(response: Record<string, unknown>) {
  const metadata = asRecord(response.metadata);
  const parsedAnswer = parseStructuredAnswer(response.answer);
  const citations = parsedAnswer?.citations ?? deriveCitations(metadata);

  return {
    answer: parsedAnswer?.answer ?? asString(response.answer) ?? '',
    intent: normalizeIntent(parsedAnswer?.intent),
    riskLevel: normalizeRiskLevel(parsedAnswer?.riskLevel),
    canAnswer: parsedAnswer?.canAnswer ?? null,
    nextAction: normalizeNextAction(parsedAnswer?.nextAction),
    collectedFields: parsedAnswer?.collectedFields ?? null,
    missingItems: parsedAnswer?.missingItems ?? [],
    recommendedProviders: parsedAnswer?.recommendedProviders ?? [],
    citations,
    conversationId: asString(response.conversation_id),
    messageId: asString(response.message_id),
    taskId: asString(response.task_id),
      metadata: {
        ...metadata,
        structuredOutput: parsedAnswer ?? null,
        rawResponse: response,
      },
  };
}

function parseStructuredAnswer(value: unknown): {
  answer?: string;
  intent?: string;
  riskLevel?: string;
  canAnswer?: boolean;
  nextAction?: string;
  citations?: AiChatCitation[];
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
      intent: asString(parsed.intent),
      riskLevel: asString(parsed.riskLevel),
      canAnswer: typeof parsed.canAnswer === 'boolean' ? parsed.canAnswer : undefined,
      nextAction: asString(parsed.nextAction),
      citations: Array.isArray(parsed.citations) ? parsed.citations as AiChatCitation[] : undefined,
      collectedFields: asRecord(parsed.collectedFields),
      missingItems: Array.isArray(parsed.missingItems) ? parsed.missingItems.filter((item): item is string => typeof item === 'string') : undefined,
      recommendedProviders: Array.isArray(parsed.recommendedProviders)
        ? parsed.recommendedProviders.map((item) => asRecord(item))
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
  if (value === 'NORMAL' || value === 'SENSITIVE' || value === 'CRISIS') return value;
  return null;
}

function normalizeNextAction(value: string | undefined): import('@medical-crm/domain').AiChatNextAction | null {
  if (value === 'ANSWER' || value === 'CONSULT_CONVERSION' || value === 'CREATE_CASE' || value === 'REQUEST_DOCS' || value === 'ESCALATE' || value === 'SAFETY') return value;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export default app;
