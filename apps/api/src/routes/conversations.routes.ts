import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createConversationSchema,
  updateConversationSchema,
  conversationListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';
import { wsManager } from '../ws/ws-manager.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/conversations — CreateConversation
// ---------------------------------------------------------------------------
const createConversationRoute = createRoute({
  method: 'post',
  path: '/api/v2/conversations',
  request: {
    body: {
      content: { 'application/json': { schema: createConversationSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Conversation created' } },
});

app.openapi(createConversationRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createConversation.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/conversations — ListConversations
// ---------------------------------------------------------------------------
const listConversationsRoute = createRoute({
  method: 'get',
  path: '/api/v2/conversations',
  request: {
    query: conversationListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of conversations' } },
});

app.openapi(listConversationsRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listConversations.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/conversations/:id — GetConversation
// ---------------------------------------------------------------------------
const getConversationRoute = createRoute({
  method: 'get',
  path: '/api/v2/conversations/{id}',
  request: {
    params: conversationIdParamSchema,
  },
  responses: { 200: { description: 'Conversation details' } },
});

app.openapi(getConversationRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getConversation.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. PUT /api/v2/conversations/:id — UpdateConversation
// ---------------------------------------------------------------------------
const updateConversationRoute = createRoute({
  method: 'put',
  path: '/api/v2/conversations/{id}',
  request: {
    params: conversationIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateConversationSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Conversation updated' } },
});

app.openapi(updateConversationRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  if (body.assistantMode === 'AI_ACTIVE') {
    const result = await svc.resumeConversationAi.execute(id, actor);
    if (result.resumeNotice) {
      wsManager.broadcast(`conv:${id}`, {
        type: 'new_message',
        data: result.resumeNotice,
      });
    }
    return c.json(result.conversation, 200);
  }

  const result = await svc.updateConversation.execute(id, body, actor);
  return c.json(result, 200);
});

export default app;
