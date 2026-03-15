import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { addProgressSchema } from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const caseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. GET /api/v2/cases/:caseId/progress — GetCaseProgress
// ---------------------------------------------------------------------------
const getCaseProgressRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/progress',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'Case progress timeline' } },
});

app.openapi(getCaseProgressRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getCaseProgress.execute(caseId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 2. POST /api/v2/cases/:caseId/progress — AddCaseProgress
// ---------------------------------------------------------------------------
const addCaseProgressRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{caseId}/progress',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: addProgressSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Progress entry added' } },
});

app.openapi(addCaseProgressRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.addCaseProgress.execute(
    { caseId, ...body },
    actor,
  );
  return c.json(result, 201);
});

export default app;
