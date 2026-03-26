import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Body/query schemas
// ---------------------------------------------------------------------------
const retryTranslationBodySchema = z.object({
  sourceDb: z.enum(['crm', 'supabase_beauty', 'supabase_china']),
  entityType: z.string(),
  entityId: z.string(),
});

const translationStatusQuerySchema = z.object({
  sourceDb: z.enum(['crm', 'supabase_beauty', 'supabase_china']),
  entityType: z.string(),
  entityId: z.string(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/translations/retry — Retry failed translation task
// ---------------------------------------------------------------------------
const retryTranslationRoute = createRoute({
  method: 'post',
  path: '/api/v2/translations/retry',
  request: {
    body: {
      content: { 'application/json': { schema: retryTranslationBodySchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Translation task reset for retry' } },
});

app.openapi(retryTranslationRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.retryTranslation.execute(body, actor);
  return c.json({ ok: true }, 200);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/translations/status — Query translation status
// ---------------------------------------------------------------------------
const getTranslationStatusRoute = createRoute({
  method: 'get',
  path: '/api/v2/translations/status',
  request: {
    query: translationStatusQuerySchema,
  },
  responses: { 200: { description: 'Translation status' } },
});

app.openapi(getTranslationStatusRoute, async (c) => {
  const { sourceDb, entityType, entityId } = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getTranslationStatus.execute(sourceDb, entityType, entityId, actor);
  if (!result) {
    return c.json({ status: null }, 200);
  }
  return c.json(result, 200);
});

export default app;
