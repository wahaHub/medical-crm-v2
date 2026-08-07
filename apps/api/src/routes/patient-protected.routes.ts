import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';
import { AiChatMessage, Message } from '@medical-crm/domain';
import { patientChatCopy } from '@medical-crm/application';
import { ForbiddenError, NotFoundError, generateId } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import { patientAuthMiddleware } from '../middleware/patient-auth.middleware.js';
import { wsManager } from '../ws/ws-manager.js';
import { seedWidgetStarterMessage } from './patient-widget-starter.js';
import { getStripe, reconcileStripeCheckoutOrder } from './patient-payments.routes.js';
import {
  selectHospitalsSchema, sendPatientMessageSchema,
  listMessagesQuerySchema, patientChatEventSchema, patientChatLocaleSchema, quoteActionSchema, submitIntakeSchema,
} from '@medical-crm/validation';

const app = new Hono();
const messageUploadInitSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
  clientMessageId: z.string().min(1).max(120).optional(),
  uploadBatchId: z.string().min(1).max(120).optional(),
  uploadBatchSize: z.number().int().min(1).max(20).optional(),
  locale: patientChatLocaleSchema.default('en'),
});
const PROCESS_CONFIRMATION_MESSAGE_VERSION = 'process-confirmation-v1';
const AI_MIRROR_SENDER_NAME = 'Medora AI';
const AI_MIRROR_SENDER_ROLE = 'AI';
const patientConversationListQuerySchema = z.object({
  caseId: z.string().uuid().optional(),
  locale: patientChatLocaleSchema.optional(),
});
const patientTicketTypeSchema = z.enum([
  'GENERAL_SUPPORT',
  'MEDICAL_QUESTION',
  'QUOTE_PRICING',
  'PACKAGE_ORDER',
  'PAYMENT_REFUND',
  'TRAVEL_JOURNEY',
  'ACCOUNT_TECHNICAL',
]);
const patientTicketPrioritySchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
const patientTicketStatusSchema = z.enum(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_INFO', 'RESOLVED', 'CLOSED']);
const patientCreateTicketSchema = z.object({
  caseId: z.string().uuid().optional(),
  type: patientTicketTypeSchema,
  priority: patientTicketPrioritySchema.optional(),
  subject: z.string().max(500).optional(),
  description: z.string().min(1),
  sourcePage: z.string().max(200).optional(),
});
const patientTicketListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: patientTicketStatusSchema.optional(),
  type: patientTicketTypeSchema.optional(),
});
const patientReplyToTicketSchema = z.object({
  content: z.string().min(1),
});
const patientOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
const patientPackageListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
const patientCreateOrderSchema = z.object({
  caseId: z.string().uuid().optional(),
  packageId: z.string().uuid(),
  idempotencyKey: z.string().max(100).optional(),
});
const writtenReviewCheckoutSchema = z.object({
  caseId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(160),
});

type PatientCheckoutOrder = {
  id: string;
  caseId: string | null;
  patientId: string;
  type: string;
  amount: string;
  currency: string;
  status: string;
  metadata: unknown;
  version: number;
};

function checkoutOrigin(): string {
  const configuredOrigin = process.env['CHINA_ORIGIN'] || process.env['PATIENT_APP_ORIGIN'];
  if (!configuredOrigin) {
    throw new Error('CHINA_ORIGIN or PATIENT_APP_ORIGIN is required for Stripe checkout');
  }
  return configuredOrigin.replace(/\/+$/, '');
}

function orderServiceName(order: PatientCheckoutOrder): string {
  if (order.metadata && typeof order.metadata === 'object') {
    const metadata = order.metadata as Record<string, unknown>;
    if (typeof metadata['serviceName'] === 'string' && metadata['serviceName'].trim()) {
      return metadata['serviceName'];
    }
    if (typeof metadata['packageName'] === 'string' && metadata['packageName'].trim()) {
      return metadata['packageName'];
    }
  }
  return order.type === 'SECOND_OPINION' ? 'Written Review' : 'Health Service';
}

async function createStripeCheckoutForOrder(order: PatientCheckoutOrder) {
  if (order.status !== 'PENDING_PAYMENT') {
    throw new Error(`Order ${order.id} is not awaiting payment`);
  }
  if (!order.caseId) {
    throw new Error(`Order ${order.id} is not linked to a case`);
  }

  const amount = Math.round(Number(order.amount) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`Order ${order.id} has an invalid amount`);
  }

  const origin = checkoutOrigin();
  const serviceName = orderServiceName(order);
  const stripeSession = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: order.currency.toLowerCase(),
        unit_amount: amount,
        product_data: {
          name: `Medora ${serviceName}`,
          description: serviceName === 'Written Review'
            ? 'Specialist review of medical records with a written second-opinion report.'
            : `Medical service for order ${order.id}`,
        },
      },
      quantity: 1,
    }],
    client_reference_id: order.id,
    metadata: {
      orderId: order.id,
      caseId: order.caseId,
      patientId: order.patientId,
      serviceType: order.type,
    },
    success_url: `${origin}/dashboard?tab=orders&orderId=${encodeURIComponent(order.id)}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard?tab=orders&orderId=${encodeURIComponent(order.id)}&checkout=cancelled`,
  }, {
    idempotencyKey: `patient-order-checkout-${order.id}-v${order.version}`,
  });

  if (!stripeSession.url) {
    throw new Error('Stripe did not return a checkout URL');
  }
  return stripeSession.url;
}
const skipMedicalFormSchema = z.object({ caseId: z.string().uuid() });
const qcTemplateByDiseaseQuerySchema = z.object({
  disease: z.string().min(1).max(100),
});
const qcTemplateIdParamSchema = z.object({
  templateId: z.string().uuid(),
});
const qcTemplateByIdQuerySchema = z.object({
  caseId: z.string().uuid(),
});
const submitPatientQCResponseSchema = z.object({
  templateId: z.string().uuid(),
  responses: z.unknown(),
});
const patientProfileUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  phone: z.string().max(80).optional(),
  age: z.string().max(40).optional(),
  gender: z.string().max(80).optional(),
  country: z.string().max(120).optional(),
  whatsapp: z.string().max(120).optional(),
  messenger: z.string().max(120).optional(),
  department: z.string().max(160).optional(),
  departmentCode: z.string().max(120).optional(),
  disease: z.string().max(500).optional(),
  destination: z.string().max(300).optional(),
  treatmentTime: z.string().max(120).optional(),
}).strict();

const patientTicketTypeToDomain: Record<z.infer<typeof patientTicketTypeSchema>, string> = {
  GENERAL_SUPPORT: 'GENERAL_QUESTIONS',
  MEDICAL_QUESTION: 'HOSPITAL_COMMUNICATION',
  QUOTE_PRICING: 'GENERAL_QUESTIONS',
  PACKAGE_ORDER: 'GENERAL_QUESTIONS',
  PAYMENT_REFUND: 'PAYMENT_PROBLEMS',
  TRAVEL_JOURNEY: 'VISA_TRAVEL',
  ACCOUNT_TECHNICAL: 'ACCOUNT_ISSUES',
};

const domainTicketTypeToPatient: Record<string, z.infer<typeof patientTicketTypeSchema>> = {
  ACCOUNT_ISSUES: 'ACCOUNT_TECHNICAL',
  PAYMENT_PROBLEMS: 'PAYMENT_REFUND',
  HOSPITAL_COMMUNICATION: 'MEDICAL_QUESTION',
  DOCUMENT_HELP: 'GENERAL_SUPPORT',
  VISA_TRAVEL: 'TRAVEL_JOURNEY',
  GENERAL_QUESTIONS: 'GENERAL_SUPPORT',
  FEEDBACK: 'GENERAL_SUPPORT',
  AI_ESCALATION: 'GENERAL_SUPPORT',
};

function toPatientActor(session: { userId: string }) {
  return { userId: session.userId, role: 'PATIENT' as const, email: '', hospitalId: null };
}

function toPatientTicketType(type: string): z.infer<typeof patientTicketTypeSchema> {
  return domainTicketTypeToPatient[type] ?? 'GENERAL_SUPPORT';
}

function parsePatientSessionId(sessionId: string): (
  | { type: 'CARE_TEAM'; caseId: string }
  | { type: 'HOSPITAL'; caseId: string; hospitalId: string }
  | null
) {
  if (sessionId.startsWith('widget-chat:')) {
    const [, , ...rest] = sessionId.split(':');
    const caseId = rest.join(':').trim();
    return caseId ? { type: 'CARE_TEAM', caseId } : null;
  }

  if (sessionId.startsWith('hospital:')) {
    const [, hospitalId, ...rest] = sessionId.split(':');
    const caseId = rest.join(':').trim();
    if (hospitalId && caseId) {
      return { type: 'HOSPITAL', hospitalId, caseId };
    }
  }

  return null;
}

function toPatientTicket<T extends { type: string }>(ticket: T): Omit<T, 'type'> & { type: z.infer<typeof patientTicketTypeSchema> } {
  return {
    ...ticket,
    type: toPatientTicketType(ticket.type),
  };
}

function buildNotificationPreview(content: string | null | undefined): string {
  const normalized = (content ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) return 'Open Medora to read the latest message.';
  return normalized.length > 180 ? `${normalized.slice(0, 179).trimEnd()}...` : normalized;
}

function buildProcessConfirmationMessage(language: string | null | undefined): string {
  return patientChatCopy(language, 'process.confirmationRecords');
}

function buildProcessConfirmationChatbotV3Envelope(content: string) {
  return {
    messages: [{
      role: 'assistant',
      text: content,
    }],
    turnOutcome: {
      status: 'ok',
      recoverableErrorCode: null,
    },
    cards: [{
      cardId: 'process-confirmed-upload-records',
      cardType: 'UPLOAD_RECORDS',
      payload: {
        required: true,
        uploadedCount: 0,
      },
      actions: [{
        actionType: 'REFRESH_STATUS',
        label: 'Refresh upload status',
        params: {
          actionKey: 'UPLOAD_RECORDS',
        },
      }],
    }],
    journey: {
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    },
    handoff: {
      required: false,
      ticketId: null,
    },
  };
}

function isProcessConfirmationMessage(message: { role: string; metadata: Record<string, unknown> }): boolean {
  return message.role === 'ASSISTANT'
    && message.metadata['processConfirmationMessage'] === true
    && message.metadata['processConfirmationMessageVersion'] === PROCESS_CONFIRMATION_MESSAGE_VERSION;
}

function createProcessConfirmationMessageId(aiChatSessionId: string): string {
  const digest = createHash('sha256')
    .update(`patient-process-confirmation:${aiChatSessionId}:${PROCESS_CONFIRMATION_MESSAGE_VERSION}`)
    .digest('hex');
  const variant = ((Number.parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, '0');

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variant}${digest.slice(18, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error
    && (
      error.message.includes('duplicate key')
      || error.message.includes('unique')
      || (error as Error & { code?: string }).code === '23505'
    );
}

function isAllowedUploadTarget(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  const isCloudBackend = hostname.endsWith('.r2.cloudflarestorage.com') || hostname.endsWith('.amazonaws.com');
  if (isCloudBackend) return true;
  // Allow local dev storage endpoints (e.g. LocalFileStorageAdapter) when running locally.
  if (process.env['NODE_ENV'] === 'development' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return true;
  }
  return false;
}

function isMechanicalModeRequest(mode: string | undefined): boolean {
  return mode === 'mechanical';
}

async function resolveFormalConversationForPatientSession(
  patientId: string,
  sessionId: string,
) {
  const parsed = parsePatientSessionId(sessionId);
  if (!parsed) {
    throw new NotFoundError(`Patient session ${sessionId} not found`);
  }

  const { conversationRepo } = getServices();
  const conversations = await conversationRepo.findByPatientId(patientId);

  if (parsed.type === 'CARE_TEAM') {
    const conversation = conversations.find((item) =>
      item.category === 'ADMIN_PATIENT' && item.caseId === parsed.caseId,
    );
    if (!conversation) {
      throw new NotFoundError(`Patient session ${sessionId} not found`);
    }
    return conversation;
  }

  const conversation = conversations.find((item) =>
    item.category === 'HOSPITAL_PATIENT'
    && item.caseId === parsed.caseId
    && item.hospitalId === parsed.hospitalId,
  );
  if (!conversation) {
    throw new NotFoundError(`Patient session ${sessionId} not found`);
  }
  return conversation;
}

// Apply patient auth to ALL routes in this file
app.use('/*', async (c, next) => {
  const { patientAuthService } = getServices();
  return patientAuthMiddleware(patientAuthService)(c, next);
});

// GET /me — patient profile
app.get('/me', async (c) => {
  const session = c.get('patientSession');
  const site = c.get('patientSite');
  const services = getServices();
  const { getPatientSessionState } = services;
  const result = await getPatientSessionState.execute({ patientId: session.userId, site });

  if (result.nextStep === 'select-hospitals' && result.caseId) {
    void seedWidgetStarterMessage({
      services,
      widgetSessionId: result.widgetChatTarget?.sessionId,
      caseId: result.caseId,
      site,
      destination: result.destination,
    }).catch((error) => {
      console.warn('Failed to backfill widget starter message during patient restore:', error);
    });
  }

  return c.json(result);
});

// PATCH /me — update editable intake profile fields on the current patient case
app.patch('/me', async (c) => {
  const body = patientProfileUpdateSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const site = c.get('patientSite');
  const services = getServices();
  const { updatePatientSessionProfile, getPatientSessionState } = services;

  await updatePatientSessionProfile.execute({
    patientId: session.userId,
    profile: body,
  });

  const result = await getPatientSessionState.execute({ patientId: session.userId, site });
  return c.json(result);
});

// GET /qc-templates/by-disease?disease=DEFAULT
// Patient-safe read-only endpoint: resolves the active QC template for a disease selector.
// No mutation is possible through this path.
app.get('/qc-templates/by-disease', async (c) => {
  const query = qcTemplateByDiseaseQuerySchema.parse(c.req.query());
  const { getTemplateByDisease } = getServices();
  const result = await getTemplateByDisease.execute(query.disease);
  return c.json(result);
});

// GET /qc-templates/:templateId
// Patient-safe read-only endpoint: resolves the requested active QC template by id.
app.get('/qc-templates/:templateId', async (c) => {
  const { templateId } = qcTemplateIdParamSchema.parse({ templateId: c.req.param('templateId') });
  const query = qcTemplateByIdQuerySchema.parse(c.req.query());
  const session = c.get('patientSession');
  const { getTemplate } = getServices();
  let result;
  try {
    result = await getTemplate.execute(templateId, toPatientActor(session), query.caseId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: 'Template not found' }, 404);
    }
    if (error instanceof ForbiddenError) {
      return c.json({ error: 'Access denied to this case' }, 403);
    }
    throw error;
  }
  if (!result.template.isActive) {
    return c.json({ error: 'Template not found' }, 404);
  }
  return c.json(result);
});

// POST /medical-form/skip
app.post('/medical-form/skip', async (c) => {
  const body = skipMedicalFormSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { skipMedicalForm } = getServices();
  await skipMedicalForm.execute({ caseId: body.caseId, patientId: session.userId });
  return c.json({ ok: true });
});

// POST /select-hospitals
app.post('/select-hospitals', async (c) => {
  const body = selectHospitalsSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { selectHospitals } = getServices();
  const result = await selectHospitals.execute({
    ...body,
    patientId: session.userId,
  });
  return c.json({ ok: true, contacts: result });
});

// GET /conversations
app.get('/conversations', async (c) => {
  const session = c.get('patientSession');
  const query = patientConversationListQuerySchema.parse(c.req.query());
  const { getPatientConversations } = getServices();
  const result = await getPatientConversations.execute({ patientId: session.userId, caseId: query.caseId, locale: query.locale });
  return c.json(result);
});

// GET /conversations/:convId/messages
app.get('/conversations/:convId/messages', async (c) => {
  const query = listMessagesQuerySchema.parse(c.req.query());
  const session = c.get('patientSession');
  const convId = c.req.param('convId');
  const { listMessages, getConversation } = getServices();
  const actor = toPatientActor(session);
  const result = await listMessages.execute(convId, { page: 1, limit: query.limit }, actor);
  const conversation = await getConversation.execute(convId, actor);
  const data = result.data.map((message) => ({
    ...message,
    senderRole: resolvePatientVisibleSenderRole(message.senderRole, message.senderId, message.messageType, session.userId),
  }));
  const response = { ...result, assistantMode: conversation.assistantMode, data };
  return c.json(response);
});

// GET /sessions/:sessionId/messages
app.get('/sessions/:sessionId/messages', async (c) => {
  const query = listMessagesQuerySchema.parse(c.req.query());
  const session = c.get('patientSession');
  const site = c.get('patientSite');
  const sessionId = c.req.param('sessionId');
  const { getPatientSessionDetail } = getServices();
  const result = await getPatientSessionDetail.execute({
    patientId: session.userId,
    sessionId,
    site,
    limit: query.limit,
    locale: query.locale,
  });
  return c.json(result);
});

// POST /sessions/:sessionId/chat/events
app.post('/sessions/:sessionId/chat/events', async (c) => {
  const body = patientChatEventSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const site = c.get('patientSite');
  const sessionId = c.req.param('sessionId');
  const { handlePatientChatEvent } = getServices();

  const result = await handlePatientChatEvent.execute({
    patientId: session.userId,
    sessionId,
    site,
    eventType: body.eventType,
    actionKey: body.actionKey,
    clientMessageId: body.clientMessageId,
    serverMessageId: body.serverMessageId,
    locale: body.locale,
    payload: body.payload,
  });

  wsManager.broadcast(`conv:${sessionId}`, {
    type: 'patient_chat_state_updated',
    data: result,
  });

  return c.json(result);
});

// POST /sessions/:sessionId/process-confirmation
app.post('/sessions/:sessionId/process-confirmation', async (c) => {
  const patientSession = c.get('patientSession');
  const site = c.get('patientSite');
  const sessionId = c.req.param('sessionId');
  const parsed = parsePatientSessionId(sessionId);

  if (!parsed || parsed.type !== 'CARE_TEAM') {
    return c.json({ error: 'Process confirmation is only available for care-team sessions' }, 400);
  }

  const conversation = await resolveFormalConversationForPatientSession(patientSession.userId, sessionId);

  const services = getServices();
  const aiChatSession = await services.aiChatSessionRepo.findBySessionId(sessionId, site);
  if (!aiChatSession || aiChatSession.patientId !== patientSession.userId) {
    throw new NotFoundError(`Patient session ${sessionId} not found`);
  }

  const patient = await services.patientRepo.findById(patientSession.userId, site);
  const content = buildProcessConfirmationMessage(patient?.preferredLanguage ?? null);
  const recentMessages = await services.aiChatMessageRepo.listRecentBySession(aiChatSession.id, 20);
  const existingConfirmation = recentMessages.find((message) => isProcessConfirmationMessage(message));
  const messageId = createProcessConfirmationMessageId(aiChatSession.id);
  const now = new Date();
  const patchedSession = await services.aiChatSessionRepo.patchStatus(sessionId, site, {
    processExplained: true,
    journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
    journeyCurrentPhase: 'active',
    lastAssistantMessageAt: existingConfirmation ? aiChatSession.statusSnapshot.lastAssistantMessageAt : now,
  }) ?? aiChatSession;

  const metadata = {
    processConfirmationMessage: true,
    processConfirmationMessageVersion: PROCESS_CONFIRMATION_MESSAGE_VERSION,
    chatbotV3: buildProcessConfirmationChatbotV3Envelope(content),
  };
  let assistantMessage: AiChatMessage | undefined = existingConfirmation;
  let createdAssistantMessage = false;
  if (!assistantMessage) {
    const draft = new AiChatMessage({
      id: messageId,
      sessionId: aiChatSession.id,
      role: 'ASSISTANT',
      content,
      intent: null,
      riskLevel: null,
      canAnswer: null,
      nextAction: null,
      secondaryAction: null,
      responseMode: null,
      citations: [],
      reasonCodes: [],
      shortlist: [],
      writebackStatus: 'succeeded',
      metadata,
      createdAt: now,
    });

    try {
      assistantMessage = await services.aiChatMessageRepo.create(draft);
      createdAssistantMessage = true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      assistantMessage = (await services.aiChatMessageRepo.updateMessage(messageId, {})) ?? undefined;
      if (!assistantMessage) {
        throw error;
      }
    }
  }

  const mirroredMessage = await services.messageRepo.save(new Message({
    id: messageId,
    conversationId: conversation.id,
    senderId: null,
    senderRoleOverride: AI_MIRROR_SENDER_ROLE,
    senderNameOverride: AI_MIRROR_SENDER_NAME,
    senderRole: AI_MIRROR_SENDER_ROLE,
    senderName: AI_MIRROR_SENDER_NAME,
    content: assistantMessage.content,
    originalLanguage: null,
    translatedContent: null,
    messageType: 'TEXT',
    moderationStatus: 'ALLOWED',
    attachments: [],
    aiSummary: null,
    createdAt: assistantMessage.createdAt,
  }));

  conversation.updateLastMessage({
    id: mirroredMessage.id,
    content: mirroredMessage.content,
    senderId: mirroredMessage.senderId,
    createdAt: mirroredMessage.createdAt,
  });
  await services.conversationRepo.save(conversation);

  if (createdAssistantMessage) {
    wsManager.broadcast(`conv:${sessionId}`, {
      type: 'new_message',
      data: {
        id: assistantMessage.id,
        sessionId,
        source: 'CHATBOT',
        conversationId: null,
        senderRole: 'AI',
        senderName: 'Medora AI',
        content: assistantMessage.content,
        messageType: 'TEXT',
        moderationStatus: null,
        attachments: [],
        citations: assistantMessage.citations,
        metadata: assistantMessage.metadata,
        createdAt: assistantMessage.createdAt.toISOString(),
      },
    });
    wsManager.broadcast(`conv:${conversation.id}`, {
      type: 'new_message',
      data: {
        id: mirroredMessage.id,
        conversationId: mirroredMessage.conversationId,
        senderId: mirroredMessage.senderId,
        senderRole: mirroredMessage.senderRole,
        senderName: mirroredMessage.senderName,
        content: mirroredMessage.content,
        originalLanguage: mirroredMessage.originalLanguage,
        translatedContent: mirroredMessage.translatedContent,
        messageType: mirroredMessage.messageType,
        moderationStatus: mirroredMessage.moderationStatus,
        attachments: mirroredMessage.attachments,
        aiSummary: mirroredMessage.aiSummary,
        createdAt: mirroredMessage.createdAt.toISOString(),
      },
    });
  }

  return c.json({
    ok: true,
    status: 'confirmed',
    statusSnapshot: patchedSession.statusSnapshot,
    message: assistantMessage,
  });
});

// POST /sessions/:sessionId/messages
app.post('/sessions/:sessionId/messages', async (c) => {
  const body = sendPatientMessageSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const sessionId = c.req.param('sessionId');
  const actor = toPatientActor(session);
  const conversation = await resolveFormalConversationForPatientSession(session.userId, sessionId);
  const isMechanicalMode = isMechanicalModeRequest(c.req.query('mode'));

  if (
    conversation.category === 'ADMIN_PATIENT'
    && conversation.assistantMode === 'AI_ACTIVE'
    && !isMechanicalMode
  ) {
    return c.json({ error: 'Care-team AI is still active for this session' }, 409);
  }

  const { sendMessage, caseRepo, notifyAdminsOfPatientMessage } = getServices();
  const executionResult = await sendMessage.execute(conversation.id, {
    content: body.content,
    messageType: body.messageType,
    attachments: body.attachments,
  }, actor);
  const result = 'message' in executionResult ? executionResult.message : executionResult;
  const response = {
    ...result,
    senderRole: 'PATIENT',
  };
  wsManager.broadcast(`conv:${sessionId}`, {
    type: 'new_message',
    data: response,
  });
  if (conversation.caseId && conversation.category === 'ADMIN_PATIENT') {
    const caseEntity = await caseRepo.findById(conversation.caseId);
    if (caseEntity) {
      try {
        await notifyAdminsOfPatientMessage.execute({
          conversationId: conversation.id,
          caseId: conversation.caseId,
          patientId: caseEntity.patientId,
          patientName: null,
          messagePreview: buildNotificationPreview(response.content),
        });
      } catch (error) {
        console.warn('Failed to notify admins about a patient portal session message:', error);
      }
    }
  }
  return c.json(response);
});

// POST /sessions/:sessionId/attachments/upload
app.post('/sessions/:sessionId/attachments/upload', async (c) => {
  const body = messageUploadInitSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const sessionId = c.req.param('sessionId');
  const conversation = await resolveFormalConversationForPatientSession(session.userId, sessionId);
  const isMechanicalMode = isMechanicalModeRequest(c.req.query('mode'));

  if (
    conversation.category === 'ADMIN_PATIENT'
    && conversation.assistantMode === 'AI_ACTIVE'
    && !isMechanicalMode
  ) {
    return c.json({ error: 'Care-team AI is still active for this session' }, 409);
  }

  const { mediaUpload, messageRepo, conversationRepo } = getServices();
  const uploadIntentInput = {
    policyId: 'message_attachment' as const,
    ownerType: 'conversation' as const,
    ownerId: conversation.id,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  };

  if (body.clientMessageId) {
    const existingMessage = await messageRepo.findByConversationClientMessageId(conversation.id, body.clientMessageId);
    const existingAttachment = existingMessage?.attachments[0] ?? null;

    if (existingMessage && existingAttachment) {
      const canResumeUpload = existingMessage.deliveryStatus === 'uploading'
        || existingMessage.deliveryStatus === 'pending'
        || existingMessage.deliveryStatus === 'failed';
      const existingUpload = canResumeUpload
        ? await mediaUpload.createUploadIntentForStorageKey(uploadIntentInput, existingAttachment.storageKey)
        : null;
      const resumedMessage = existingMessage.deliveryStatus === 'failed'
        ? await messageRepo.updateDeliveryStatus(existingMessage.id, 'uploading', {
            eventType: 'ATTACHMENT_UPLOAD_STARTED',
            errorCode: null,
            uploadStatus: 'uploading',
          })
        : existingMessage;

      return c.json({
        upload: existingUpload
          ? {
              uploadUrl: existingUpload.uploadUrl,
              storageKey: existingUpload.storageKey,
              expiresIn: existingUpload.expiresIn,
            }
          : null,
        asset: {
          fileName: existingAttachment.fileName,
          mimeType: existingAttachment.mimeType,
          fileSize: existingAttachment.fileSize,
          storageKey: existingAttachment.storageKey,
        },
        message: {
          serverMessageId: resumedMessage.id,
          clientMessageId: resumedMessage.clientMessageId,
          deliveryStatus: resumedMessage.deliveryStatus,
        },
      }, 200);
    }
  }

  const result = await mediaUpload.createUploadIntent(uploadIntentInput);

  let pendingMessage = null;
  let createdPendingMessage = false;
  let effectiveUpload = result;
  let effectiveAsset = result.asset;
  if (body.clientMessageId) {
    const pendingMessageId = generateId();
    pendingMessage = await messageRepo.createPendingAttachmentMessage({
      id: pendingMessageId,
      conversationId: conversation.id,
      patientId: session.userId,
      clientMessageId: body.clientMessageId,
      content: patientChatCopy(body.locale, 'upload.started'),
      locale: body.locale,
      attachments: [{
        fileName: body.fileName,
        fileSize: body.fileSize,
        mimeType: body.mimeType,
        storageKey: result.storageKey,
      }],
      metadata: {
        eventType: 'ATTACHMENT_UPLOAD_STARTED',
        source: 'patient',
        contentType: 'attachment',
        uploadStatus: 'uploading',
        storageKey: result.storageKey,
        ...(body.uploadBatchId ? { uploadBatchId: body.uploadBatchId } : {}),
        ...(body.uploadBatchSize ? { uploadBatchSize: body.uploadBatchSize } : {}),
      },
      createdAt: new Date(),
    });
    createdPendingMessage = pendingMessage.id === pendingMessageId;
    const pendingAttachment = pendingMessage.attachments[0] ?? null;
    if (pendingAttachment && pendingAttachment.storageKey !== result.storageKey) {
      effectiveUpload = await mediaUpload.createUploadIntentForStorageKey(uploadIntentInput, pendingAttachment.storageKey);
      effectiveAsset = {
        fileName: pendingAttachment.fileName,
        fileSize: pendingAttachment.fileSize,
        mimeType: pendingAttachment.mimeType,
        storageKey: pendingAttachment.storageKey,
      };
    }
    if (createdPendingMessage) {
      conversation.updateLastMessage({
        id: pendingMessage.id,
        content: pendingMessage.content,
        senderId: pendingMessage.senderId,
        createdAt: pendingMessage.createdAt,
      });
      await conversationRepo.save(conversation);
    }
  }

  const response = {
    upload: {
      uploadUrl: effectiveUpload.uploadUrl,
      storageKey: effectiveUpload.storageKey,
      expiresIn: effectiveUpload.expiresIn,
    },
    asset: effectiveAsset,
    message: pendingMessage
      ? {
          serverMessageId: pendingMessage.id,
          clientMessageId: pendingMessage.clientMessageId,
          deliveryStatus: pendingMessage.deliveryStatus,
        }
      : null,
  };

  if (pendingMessage && createdPendingMessage) {
    wsManager.broadcast(`conv:${sessionId}`, {
      type: 'new_message',
      data: {
        id: pendingMessage.id,
        clientMessageId: pendingMessage.clientMessageId,
        deliveryStatus: pendingMessage.deliveryStatus,
        content: pendingMessage.content,
        attachments: pendingMessage.attachments,
        senderRole: 'PATIENT',
        createdAt: pendingMessage.createdAt.toISOString(),
      },
    });
  }

  return c.json(response, 201);
});

// POST /conversations/:convId/attachments/upload
app.post('/conversations/:convId/attachments/upload', async (c) => {
  const body = messageUploadInitSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const convId = c.req.param('convId');
  const { getConversation, mediaUpload } = getServices();
  const actor = toPatientActor(session);

  await getConversation.execute(convId, actor);

  const result = await mediaUpload.createUploadIntent({
    policyId: 'message_attachment',
    ownerType: 'conversation',
    ownerId: convId,
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

// POST /uploads/proxy
app.post('/uploads/proxy', async (c) => {
  const formData = await c.req.formData();
  const uploadUrl = formData.get('uploadUrl');
  const file = formData.get('file');

  if (typeof uploadUrl !== 'string' || !(file instanceof File)) {
    return c.json({ error: 'uploadUrl and file are required' }, 400);
  }

  let normalizedUrl: URL;
  try {
    normalizedUrl = new URL(uploadUrl);
  } catch {
    return c.json({ error: 'uploadUrl must be a valid absolute URL' }, 400);
  }

  const isLocalDevTarget =
    process.env['NODE_ENV'] === 'development' &&
    (normalizedUrl.hostname === 'localhost' || normalizedUrl.hostname === '127.0.0.1');
  if ((normalizedUrl.protocol !== 'https:' && !isLocalDevTarget) || !isAllowedUploadTarget(normalizedUrl)) {
    return c.json({ error: 'uploadUrl target is not allowed' }, 400);
  }

  const upstream = await fetch(normalizedUrl.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: Buffer.from(await file.arrayBuffer()),
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    return new Response(
      JSON.stringify({ error: body || 'Failed to upload file', status: upstream.status }),
      {
        status: upstream.status || 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return new Response(null, { status: 204 });
});

// POST /conversations/:convId/messages
app.post('/conversations/:convId/messages', async (c) => {
  const body = sendPatientMessageSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const convId = c.req.param('convId');
  const { sendMessage, getConversation, caseRepo, notifyAdminsOfPatientMessage } = getServices();
  const actor = toPatientActor(session);
  const conversation = await getConversation.execute(convId, actor);
  const executionResult = await sendMessage.execute(convId, {
    content: body.content,
    messageType: body.messageType,
    attachments: body.attachments,
  }, actor);
  const result = 'message' in executionResult ? executionResult.message : executionResult;
  const response = {
    ...result,
    senderRole: 'PATIENT',
  };
  wsManager.broadcast(`conv:${convId}`, {
    type: 'new_message',
    data: response,
  });
  if (conversation.caseId && conversation.category === 'ADMIN_PATIENT') {
    const caseEntity = await caseRepo.findById(conversation.caseId);
    if (caseEntity) {
      try {
        await notifyAdminsOfPatientMessage.execute({
          conversationId: convId,
          caseId: conversation.caseId,
          patientId: caseEntity.patientId,
          patientName: null,
          messagePreview: buildNotificationPreview(response.content),
        });
      } catch (error) {
        console.warn('Failed to notify admins about a patient portal message:', error);
      }
    }
  }
  return c.json(response);
});

function resolvePatientVisibleSenderRole(
  senderRole: string | null,
  senderId: string | null,
  messageType: string,
  patientId: string,
): 'AI' | 'PATIENT' | 'ADMIN' | 'HOSPITAL' | 'SYSTEM' {
  if (messageType === 'SYSTEM' || senderRole?.toUpperCase() === 'SYSTEM') return 'SYSTEM';
  if (senderRole?.toUpperCase() === 'AI') return 'AI';
  if (senderRole?.toUpperCase() === 'ADMIN') return 'ADMIN';
  if (senderId === patientId) return 'PATIENT';
  return 'HOSPITAL';
}

// GET /cases
app.get('/cases', async (c) => {
  const session = c.get('patientSession');
  const { getPatientCases } = getServices();
  const result = await getPatientCases.execute({ patientId: session.userId });
  return c.json(result);
});

// GET /cases/:id
app.get('/cases/:id', async (c) => {
  const session = c.get('patientSession');
  const { getPatientCaseDetail } = getServices();
  const result = await getPatientCaseDetail.execute({ caseId: c.req.param('id'), patientId: session.userId });
  return c.json(result);
});

// GET /cases/:id/quote
app.get('/cases/:id/quote', async (c) => {
  const session = c.get('patientSession');
  const caseId = c.req.param('id');
  const { listQuotes } = getServices();
  const actor = toPatientActor(session);
  const result = await listQuotes.execute({ caseId, page: 1, limit: 50 }, actor);
  return c.json(result);
});

// POST /cases/:id/quote/accept
app.post('/cases/:id/quote/accept', async (c) => {
  const body = quoteActionSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { patientAcceptQuote } = getServices();
  await patientAcceptQuote.execute({ quoteId: body.quoteId, patientId: session.userId });
  return c.json({ ok: true });
});

// POST /cases/:id/quote/reject
app.post('/cases/:id/quote/reject', async (c) => {
  const body = quoteActionSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { patientRejectQuote } = getServices();
  await patientRejectQuote.execute({ quoteId: body.quoteId, patientId: session.userId });
  return c.json({ ok: true });
});

// GET /intake/:caseId/template
app.get('/intake/:caseId/template', async (c) => {
  const session = c.get('patientSession');
  const caseId = c.req.param('caseId');
  const { caseRepo } = getServices();
  const caseEntity = await caseRepo.findById(caseId);
  if (!caseEntity || caseEntity.patientId !== session.userId) {
    return c.json({ error: 'Access denied to this case' }, 403);
  }
  const { getIntakeTemplate } = getServices();
  const result = await getIntakeTemplate.execute({ caseId });
  return c.json(result);
});

// POST /intake/:caseId
app.post('/intake/:caseId', async (c) => {
  const body = submitIntakeSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const caseId = c.req.param('caseId');
  const { caseRepo } = getServices();
  const caseEntity = await caseRepo.findById(caseId);
  if (!caseEntity || caseEntity.patientId !== session.userId) {
    return c.json({ error: 'Access denied to this case' }, 403);
  }
  const { submitIntake } = getServices();
  await submitIntake.execute({ caseId, patientId: session.userId, responses: body.responses });
  return c.json({ ok: true });
});

// GET /tickets
app.get('/tickets', async (c) => {
  const query = patientTicketListQuerySchema.parse(c.req.query());
  const session = c.get('patientSession');
  const { listTickets } = getServices();
  const result = await listTickets.execute({
    page: query.page,
    limit: query.limit,
    status: query.status,
    type: query.type ? patientTicketTypeToDomain[query.type] : undefined,
  }, toPatientActor(session));

  return c.json({
    ...result,
    data: result.data.map(toPatientTicket),
  });
});

// GET /tickets/:ticketId
app.get('/tickets/:ticketId', async (c) => {
  const session = c.get('patientSession');
  const ticketId = c.req.param('ticketId');
  const { getTicket } = getServices();
  const result = await getTicket.execute(ticketId, toPatientActor(session));

  return c.json({
    ticket: toPatientTicket(result.ticket),
    replies: result.replies,
  });
});

// POST /tickets
app.post('/tickets', async (c) => {
  const body = patientCreateTicketSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { createTicket, notifyAdminsOfNewTicket } = getServices();
  const result = await createTicket.execute({
    caseId: body.caseId,
    type: patientTicketTypeToDomain[body.type],
    priority: body.priority,
    subject: body.subject,
    description: body.description,
    sourcePage: body.sourcePage,
  }, toPatientActor(session));
  try {
    await notifyAdminsOfNewTicket.execute({
      ticketId: result.id,
      ticketNumber: result.ticketNumber,
      patientId: result.patientId,
      patientName: null,
      subject: result.subject ?? null,
      descriptionPreview: result.description,
    });
  } catch (error) {
    console.warn('Failed to notify admins about a patient-created ticket:', error);
  }

  return c.json(toPatientTicket(result), 201);
});

// POST /tickets/:ticketId/replies
app.post('/tickets/:ticketId/replies', async (c) => {
  const body = patientReplyToTicketSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const ticketId = c.req.param('ticketId');
  const { replyToTicket } = getServices();
  const result = await replyToTicket.execute(ticketId, { content: body.content }, toPatientActor(session));
  return c.json(result, 201);
});

// GET /orders
app.get('/orders', async (c) => {
  const query = patientOrderListQuerySchema.parse(c.req.query());
  const session = c.get('patientSession');
  const { listOrders } = getServices();
  const result = await listOrders.execute(query, toPatientActor(session));
  return c.json(result);
});

// POST /orders/written-review/checkout
app.post('/orders/written-review/checkout', async (c) => {
  const body = writtenReviewCheckoutSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const services = getServices();
  const caseEntity = await services.caseRepo.findById(body.caseId);
  if (!caseEntity || caseEntity.patientId !== session.userId) {
    return c.json({ error: 'Access denied to this case' }, 403);
  }

  const order = await services.createOrder.execute({
    caseId: body.caseId,
    type: 'SECOND_OPINION',
    amount: '99.00',
    currency: 'USD',
    idempotencyKey: body.idempotencyKey,
    metadata: {
      source: 'WRITTEN_REVIEW_INTAKE',
      serviceName: 'Written Review',
    },
  }, toPatientActor(session));

  const checkoutUrl = await createStripeCheckoutForOrder(order);

  return c.json({
    orderId: order.id,
    checkoutUrl,
  }, 201);
});

// POST /orders/checkout-session/:sessionId/confirm
app.post('/orders/checkout-session/:sessionId/confirm', async (c) => {
  const patientSession = c.get('patientSession');
  const stripeSession = await getStripe().checkout.sessions.retrieve(c.req.param('sessionId'));
  if (stripeSession.metadata?.patientId !== patientSession.userId) {
    return c.json({ error: 'Access denied to this checkout session' }, 403);
  }

  const orderId = await reconcileStripeCheckoutOrder(stripeSession);
  if (!orderId) {
    return c.json({ error: 'Payment is not complete' }, 409);
  }

  return c.json({ orderId, paymentStatus: stripeSession.payment_status });
});

// GET /orders/:orderId
app.get('/orders/:orderId', async (c) => {
  const session = c.get('patientSession');
  const orderId = c.req.param('orderId');
  const { getOrder } = getServices();
  const result = await getOrder.execute(orderId, toPatientActor(session));
  return c.json(result);
});

// POST /orders
app.post('/orders', async (c) => {
  const body = patientCreateOrderSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const actor = toPatientActor(session);
  const { createOrder, getPackage } = getServices();
  const pkg = await getPackage.execute(body.packageId, actor);
  const result = await createOrder.execute({
    caseId: body.caseId,
    packageId: body.packageId,
    type: pkg.type,
    amount: pkg.price,
    currency: pkg.currency,
    idempotencyKey: body.idempotencyKey,
    metadata: {
      source: 'PATIENT_PACKAGE',
      packageName: pkg.nameEn,
    },
  }, actor);
  return c.json(result, 201);
});

// POST /orders/:orderId/payment-intents
app.post('/orders/:orderId/payment-intents', async (c) => {
  const session = c.get('patientSession');
  const orderId = c.req.param('orderId');
  const { getOrder } = getServices();
  const order = await getOrder.execute(orderId, toPatientActor(session));
  const checkoutUrl = await createStripeCheckoutForOrder(order);
  return c.json({ orderId: order.id, checkoutUrl });
});

// GET /packages
app.get('/packages', async (c) => {
  const query = patientPackageListQuerySchema.parse(c.req.query());
  const session = c.get('patientSession');
  const { listPackages } = getServices();
  const result = await listPackages.execute(query, toPatientActor(session));
  return c.json(result);
});

// GET /packages/:packageId
app.get('/packages/:packageId', async (c) => {
  const session = c.get('patientSession');
  const packageId = c.req.param('packageId');
  const { getPackage } = getServices();
  const result = await getPackage.execute(packageId, toPatientActor(session));
  return c.json(result);
});

// GET /cases/:caseId/journey
app.get('/cases/:caseId/journey', async (c) => {
  const session = c.get('patientSession');
  const caseId = c.req.param('caseId');
  const { getCaseJourney } = getServices();
  const result = await getCaseJourney.execute(caseId, toPatientActor(session));
  return c.json(result);
});

// GET /cases/:caseId/milestones
app.get('/cases/:caseId/milestones', async (c) => {
  const session = c.get('patientSession');
  const caseId = c.req.param('caseId');
  const { listMilestones } = getServices();
  const result = await listMilestones.execute(caseId, toPatientActor(session), { visibleOnly: true });
  return c.json(result);
});

const intakeCaseIdParamSchema = z.object({ caseId: z.string().uuid() });

// GET /intake/:caseId/response — patient-safe QC response retrieval
app.get('/intake/:caseId/response', async (c) => {
  const { caseId } = intakeCaseIdParamSchema.parse({ caseId: c.req.param('caseId') });
  const session = c.get('patientSession');
  const { getPatientQCResponse } = getServices();
  const result = await getPatientQCResponse.execute({ caseId, patientId: session.userId });
  if (result === null) {
    return c.json({ response: null });
  }
  return c.json({ response: result });
});

// POST /intake/:caseId/response — submit QC answers, marks case medicalFormStatus = SUBMITTED
app.post('/intake/:caseId/response', async (c) => {
  const { caseId } = intakeCaseIdParamSchema.parse({ caseId: c.req.param('caseId') });
  const body = submitPatientQCResponseSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const site = c.get('patientSite');
  const { submitPatientQCResponse } = getServices();
  const result = await submitPatientQCResponse.execute({
    caseId,
    patientId: session.userId,
    site,
    templateId: body.templateId,
    responses: body.responses,
  });
  return c.json({ response: result }, 201);
});

// GET /cases/:caseId/ai-summary
app.get('/cases/:caseId/ai-summary', async (c) => {
  const session = c.get('patientSession');
  const caseId = c.req.param('caseId');
  const { caseRepo } = getServices();
  const caseEntity = await caseRepo.findById(caseId);
  if (!caseEntity || caseEntity.patientId !== session.userId) {
    return c.json({ error: 'Access denied to this case' }, 403);
  }

  const status =
    caseEntity.aiSummaryStatus === 'FAILED'
      ? 'FAILED'
      : caseEntity.aiSummaryStatus === 'PENDING' || caseEntity.aiSummaryStatus === 'PROCESSING'
        ? 'PENDING'
        : caseEntity.aiSummary
          ? 'READY'
          : 'EMPTY';

  return c.json({
    caseId,
    status,
    summary: caseEntity.aiSummary,
    language: caseEntity.aiSummaryLanguage,
    updatedAt: caseEntity.updatedAt.toISOString(),
  });
});

// Video consultation routes (bypasses PostgREST schema cache by using direct Postgres)
import videoConsultationPatientRoutes from './video-consultations-patient.routes.js';
app.route('/video-consultations', videoConsultationPatientRoutes);

export default app;
