import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { getServerEnv } from '@medical-crm/config';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// POST /api/v2/internal/process-message-tasks — Internal worker endpoint
// ---------------------------------------------------------------------------
const processTasksRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/process-message-tasks',
  responses: { 200: { description: 'Tasks processed' } },
});

app.openapi(processTasksRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  const { INTERNAL_API_SECRET } = getServerEnv();
  if (!secret || secret !== INTERNAL_API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const svc = getServices();
  const result = await svc.processMessageTasks.execute();
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// POST /api/v2/internal/process-translation-tasks — Internal worker endpoint
// ---------------------------------------------------------------------------
const processTranslationTasksRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/process-translation-tasks',
  responses: { 200: { description: 'Translation tasks processed' } },
});

app.openapi(processTranslationTasksRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  const { INTERNAL_API_SECRET } = getServerEnv();
  if (!secret || secret !== INTERNAL_API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const svc = getServices();
  const result = await svc.processTranslationTasks.execute();
  return c.json(result, 200);
});

const processAiSyncOutboxRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/process-ai-sync-outbox',
  responses: { 200: { description: 'AI sync outbox processed' } },
});

app.openapi(processAiSyncOutboxRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  const { INTERNAL_API_SECRET } = getServerEnv();
  if (!secret || secret !== INTERNAL_API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const svc = getServices();
  const result = await svc.processAiSyncOutbox.execute();
  return c.json(result, 200);
});

export default app;
