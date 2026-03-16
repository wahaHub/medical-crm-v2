import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  updateJourneySchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  milestoneListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const caseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

const caseIdMilestoneIdParamSchema = z.object({
  caseId: z.string().uuid(),
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. GET /api/v2/cases/{caseId}/journey — GetCaseJourney
// ---------------------------------------------------------------------------
const getCaseJourneyRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/journey',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'Case journey or null' } },
});

app.openapi(getCaseJourneyRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getCaseJourney.execute(caseId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 2. PUT /api/v2/cases/{caseId}/journey — UpdateCaseJourney
// ---------------------------------------------------------------------------
const updateCaseJourneyRoute = createRoute({
  method: 'put',
  path: '/api/v2/cases/{caseId}/journey',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateJourneySchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Updated journey' } },
});

app.openapi(updateCaseJourneyRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateCaseJourney.execute(caseId, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/cases/{caseId}/milestones — ListMilestones
// ---------------------------------------------------------------------------
const listMilestonesRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/milestones',
  request: {
    params: caseIdParamSchema,
    query: milestoneListQuerySchema,
  },
  responses: { 200: { description: 'List of milestones' } },
});

app.openapi(listMilestonesRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listMilestones.execute(caseId, actor, {
    visibleOnly: query.visibleOnly,
  });
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. POST /api/v2/cases/{caseId}/milestones — CreateMilestone
// ---------------------------------------------------------------------------
const createMilestoneRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{caseId}/milestones',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: createMilestoneSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Milestone created' } },
});

app.openapi(createMilestoneRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createMilestone.execute(caseId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 5. PATCH /api/v2/cases/{caseId}/milestones/{id} — UpdateMilestone
// ---------------------------------------------------------------------------
const updateMilestoneRoute = createRoute({
  method: 'patch',
  path: '/api/v2/cases/{caseId}/milestones/{id}',
  request: {
    params: caseIdMilestoneIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateMilestoneSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Milestone updated' } },
});

app.openapi(updateMilestoneRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateMilestone.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. DELETE /api/v2/cases/{caseId}/milestones/{id} — DeleteMilestone
// ---------------------------------------------------------------------------
const deleteMilestoneRoute = createRoute({
  method: 'delete',
  path: '/api/v2/cases/{caseId}/milestones/{id}',
  request: {
    params: caseIdMilestoneIdParamSchema,
  },
  responses: { 204: { description: 'Milestone deleted' } },
});

app.openapi(deleteMilestoneRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteMilestone.execute(id, actor);
  return c.body(null, 204);
});

export default app;
