import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createTicketSchema,
  ticketListQuerySchema,
  assignTicketSchema,
  replyToTicketSchema,
  updateTicketStatusSchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const ticketIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/tickets — CreateTicket
// ---------------------------------------------------------------------------
const createTicketRoute = createRoute({
  method: 'post',
  path: '/api/v2/tickets',
  request: {
    body: {
      content: { 'application/json': { schema: createTicketSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Ticket created' } },
});

app.openapi(createTicketRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createTicket.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/tickets — ListTickets
// ---------------------------------------------------------------------------
const listTicketsRoute = createRoute({
  method: 'get',
  path: '/api/v2/tickets',
  request: {
    query: ticketListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of tickets' } },
});

app.openapi(listTicketsRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listTickets.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/tickets/{id} — GetTicket
// ---------------------------------------------------------------------------
const getTicketRoute = createRoute({
  method: 'get',
  path: '/api/v2/tickets/{id}',
  request: {
    params: ticketIdParamSchema,
  },
  responses: { 200: { description: 'Ticket details with replies' } },
});

app.openapi(getTicketRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getTicket.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. POST /api/v2/tickets/{id}/assign — AssignTicket
// ---------------------------------------------------------------------------
const assignTicketRoute = createRoute({
  method: 'post',
  path: '/api/v2/tickets/{id}/assign',
  request: {
    params: ticketIdParamSchema,
    body: {
      content: { 'application/json': { schema: assignTicketSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Ticket assigned' } },
});

app.openapi(assignTicketRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.assignTicket.execute(id, body.assignedTo, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. POST /api/v2/tickets/{id}/reply — ReplyToTicket
// ---------------------------------------------------------------------------
const replyToTicketRoute = createRoute({
  method: 'post',
  path: '/api/v2/tickets/{id}/reply',
  request: {
    params: ticketIdParamSchema,
    body: {
      content: { 'application/json': { schema: replyToTicketSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Reply created' } },
});

app.openapi(replyToTicketRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.replyToTicket.execute(id, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 6. PATCH /api/v2/tickets/{id}/status — UpdateTicketStatus
// ---------------------------------------------------------------------------
const updateTicketStatusRoute = createRoute({
  method: 'patch',
  path: '/api/v2/tickets/{id}/status',
  request: {
    params: ticketIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateTicketStatusSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Ticket status updated' } },
});

app.openapi(updateTicketStatusRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateTicketStatus.execute(id, body.status, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 7. POST /api/v2/tickets/{id}/close — CloseTicket
// ---------------------------------------------------------------------------
const closeTicketRoute = createRoute({
  method: 'post',
  path: '/api/v2/tickets/{id}/close',
  request: {
    params: ticketIdParamSchema,
  },
  responses: { 200: { description: 'Ticket closed' } },
});

app.openapi(closeTicketRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.closeTicket.execute(id, actor);
  return c.json(result, 200);
});

export default app;
