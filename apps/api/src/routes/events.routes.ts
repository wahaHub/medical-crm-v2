import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const caseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. GET /api/v2/cases/:caseId/events — ListCaseEvents
// ---------------------------------------------------------------------------
const listCaseEventsRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/events',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'List of case events' } },
});

app.openapi(listCaseEventsRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listCaseEvents.execute(caseId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/cases/:caseId/timeline — GetCaseTimeline
// ---------------------------------------------------------------------------
const getCaseTimelineRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/timeline',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'Case timeline' } },
});

app.openapi(getCaseTimelineRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getCaseTimeline.execute(caseId, actor);
  return c.json(result, 200);
});

export default app;
