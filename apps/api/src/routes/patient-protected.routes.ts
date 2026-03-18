import { Hono } from 'hono';
import { getServices } from '../composition-root.js';
import { patientAuthMiddleware } from '../middleware/patient-auth.middleware.js';
import {
  selectHospitalsSchema, sendPatientMessageSchema,
  listMessagesQuerySchema, quoteActionSchema, submitIntakeSchema,
} from '@medical-crm/validation';

const app = new Hono();

// Apply patient auth to ALL routes in this file
app.use('/*', async (c, next) => {
  const { patientAuthService } = getServices();
  return patientAuthMiddleware(patientAuthService)(c, next);
});

// GET /me — patient profile
app.get('/me', async (c) => {
  const session = c.get('patientSession');
  const { patientRepo } = getServices();
  const patient = await patientRepo.findById(session.userId);
  if (!patient) return c.json({ error: 'Patient not found' }, 404);
  return c.json(patient);
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
  const actor = { userId: session.userId, role: 'PATIENT' as const, email: '', hospitalId: null };
  const result = await listMessages.execute(convId, { page: 1, limit: query.limit }, actor);
  return c.json(result);
});

// POST /conversations/:convId/messages
app.post('/conversations/:convId/messages', async (c) => {
  const body = sendPatientMessageSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const convId = c.req.param('convId');
  const { sendMessage } = getServices();
  const actor = { userId: session.userId, role: 'PATIENT' as const, email: '', hospitalId: null };
  const result = await sendMessage.execute(convId, {
    content: body.content,
    messageType: 'TEXT',
  }, actor);
  return c.json(result);
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
  const actor = { userId: session.userId, role: 'PATIENT' as const, email: '', hospitalId: null };
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
  const { getIntakeTemplate } = getServices();
  const result = await getIntakeTemplate.execute({ caseId: c.req.param('caseId') });
  return c.json(result);
});

// POST /intake/:caseId
app.post('/intake/:caseId', async (c) => {
  const body = submitIntakeSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { submitIntake } = getServices();
  await submitIntake.execute({ caseId: c.req.param('caseId'), patientId: session.userId, responses: body.responses });
  return c.json({ ok: true });
});

export default app;
