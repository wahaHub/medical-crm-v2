import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';
import { getServices } from '../composition-root.js';
import { patientAuthMiddleware } from '../middleware/patient-auth.middleware.js';
import { wsManager } from '../ws/ws-manager.js';
import {
  selectHospitalsSchema, sendPatientMessageSchema,
  listMessagesQuerySchema, quoteActionSchema, submitIntakeSchema,
} from '@medical-crm/validation';

const app = new Hono();
const messageUploadInitSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
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
const skipMedicalFormSchema = z.object({ caseId: z.string().uuid() });
const qcTemplateByDiseaseQuerySchema = z.object({
  disease: z.string().min(1).max(100),
});
const submitPatientQCResponseSchema = z.object({
  templateId: z.string().uuid(),
  responses: z.unknown(),
});

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

function toPatientTicket<T extends { type: string }>(ticket: T): Omit<T, 'type'> & { type: z.infer<typeof patientTicketTypeSchema> } {
  return {
    ...ticket,
    type: toPatientTicketType(ticket.type),
  };
}

// Apply patient auth to ALL routes in this file
app.use('/*', async (c, next) => {
  const { patientAuthService } = getServices();
  return patientAuthMiddleware(patientAuthService)(c, next);
});

// GET /me — patient profile
app.get('/me', async (c) => {
  const session = c.get('patientSession');
  const { getPatientSessionState } = getServices();
  const result = await getPatientSessionState.execute({ patientId: session.userId });
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
  const { getPatientConversations } = getServices();
  const result = await getPatientConversations.execute({ patientId: session.userId });
  return c.json(result);
});

// GET /conversations/:convId/messages
app.get('/conversations/:convId/messages', async (c) => {
  const query = listMessagesQuerySchema.parse(c.req.query());
  const session = c.get('patientSession');
  const convId = c.req.param('convId');
  const { listMessages } = getServices();
  const actor = toPatientActor(session);
  const result = await listMessages.execute(convId, { page: 1, limit: query.limit }, actor);
  const data = result.data.map((message) => ({
    ...message,
    senderRole: message.senderId === session.userId ? 'PATIENT' : 'HOSPITAL',
  }));
  const response = { ...result, data };
  return c.json(response);
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

// POST /conversations/:convId/messages
app.post('/conversations/:convId/messages', async (c) => {
  const body = sendPatientMessageSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const convId = c.req.param('convId');
  const { sendMessage } = getServices();
  const actor = toPatientActor(session);
  const result = await sendMessage.execute(convId, {
    content: body.content,
    messageType: body.messageType,
    attachments: body.attachments,
  }, actor);
  const response = {
    ...result,
    senderRole: 'PATIENT',
  };
  wsManager.broadcast(`conv:${convId}`, {
    type: 'new_message',
    data: response,
  });
  return c.json(response);
});

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
  const { createTicket } = getServices();
  const result = await createTicket.execute({
    caseId: body.caseId,
    type: patientTicketTypeToDomain[body.type],
    priority: body.priority,
    subject: body.subject,
    description: body.description,
    sourcePage: body.sourcePage,
  }, toPatientActor(session));

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
  const { createPaymentIntent } = getServices();
  const result = await createPaymentIntent.execute(orderId, toPatientActor(session));
  return c.json(result);
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
  const { submitPatientQCResponse } = getServices();
  const result = await submitPatientQCResponse.execute({
    caseId,
    patientId: session.userId,
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

export default app;
