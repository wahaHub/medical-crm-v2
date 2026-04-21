import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createQuoteSchema,
  updateQuoteSchema,
  quoteListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const quoteIdParamSchema = z.object({
  id: z.string().uuid(),
});

const caseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/quotes — CreateQuote
// ---------------------------------------------------------------------------
const createQuoteRoute = createRoute({
  method: 'post',
  path: '/api/v2/quotes',
  request: {
    body: {
      content: { 'application/json': { schema: createQuoteSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Quote created' } },
});

app.openapi(createQuoteRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createQuote.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/quotes — ListQuotes
// ---------------------------------------------------------------------------
const listQuotesRoute = createRoute({
  method: 'get',
  path: '/api/v2/quotes',
  request: {
    query: quoteListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of quotes' } },
});

app.openapi(listQuotesRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listQuotes.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/quotes/:id — GetQuote
// ---------------------------------------------------------------------------
const getQuoteRoute = createRoute({
  method: 'get',
  path: '/api/v2/quotes/{id}',
  request: {
    params: quoteIdParamSchema,
  },
  responses: { 200: { description: 'Quote details' } },
});

app.openapi(getQuoteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getQuote.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. PATCH /api/v2/quotes/:id — UpdateQuote
// ---------------------------------------------------------------------------
const updateQuoteRoute = createRoute({
  method: 'patch',
  path: '/api/v2/quotes/{id}',
  request: {
    params: quoteIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateQuoteSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Quote updated' } },
});

app.openapi(updateQuoteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateQuote.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. POST /api/v2/quotes/:id/send — SendQuote
// ---------------------------------------------------------------------------
const sendQuoteRoute = createRoute({
  method: 'post',
  path: '/api/v2/quotes/{id}/send',
  request: {
    params: quoteIdParamSchema,
  },
  responses: { 200: { description: 'Quote sent' } },
});

app.openapi(sendQuoteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.sendQuote.execute(id, actor);

  if (actor.role === 'HOSPITAL') {
    const caseId = 'caseId' in result && typeof result.caseId === 'string' ? result.caseId : null;
    if (caseId) {
      try {
        const caseEntity = await svc.caseRepo.findById(caseId);
        if (caseEntity) {
          const patient = await svc.patientRepo.findById(caseEntity.patientId);
          await svc.notifyPatientOfCaseUpdate.execute({
            caseId,
            patientId: caseEntity.patientId,
            site: patient?.site ?? 'china',
            subject: 'Your treatment quote is ready',
            messagePreview: 'Your hospital sent a treatment quote with one or more quoted items.',
            dedupeKey: `quote:${id}`,
          });
        }
      } catch (error) {
        console.warn('Failed to notify patient about a quote update:', error);
      }
    }
  }

  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. POST /api/v2/quotes/:id/accept — AcceptQuote
// ---------------------------------------------------------------------------
const acceptQuoteRoute = createRoute({
  method: 'post',
  path: '/api/v2/quotes/{id}/accept',
  request: {
    params: quoteIdParamSchema,
  },
  responses: { 200: { description: 'Quote accepted' } },
});

app.openapi(acceptQuoteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.acceptQuote.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 7. POST /api/v2/quotes/:id/reject — RejectQuote
// ---------------------------------------------------------------------------
const rejectQuoteRoute = createRoute({
  method: 'post',
  path: '/api/v2/quotes/{id}/reject',
  request: {
    params: quoteIdParamSchema,
  },
  responses: { 200: { description: 'Quote rejected' } },
});

app.openapi(rejectQuoteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.rejectQuote.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 8. POST /api/v2/quotes/:id/resend — ResendQuote
// ---------------------------------------------------------------------------
const resendQuoteRoute = createRoute({
  method: 'post',
  path: '/api/v2/quotes/{id}/resend',
  request: {
    params: quoteIdParamSchema,
  },
  responses: { 200: { description: 'Quote resent' } },
});

app.openapi(resendQuoteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.resendQuote.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 9. GET /api/v2/cases/:caseId/quotes/compare — CompareQuotes
// ---------------------------------------------------------------------------
const compareQuotesRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/quotes/compare',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'Comparison of quotes for case' } },
});

app.openapi(compareQuotesRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.compareQuotes.execute(caseId, actor);
  return c.json(result, 200);
});

export default app;
