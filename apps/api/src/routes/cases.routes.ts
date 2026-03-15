import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createCaseSchema,
  updateCaseSchema,
  assignCaseSchema,
  updateCaseStatusSchema,
  advanceCaseStageSchema,
  caseListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const caseIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/cases — CreateCase (ADMIN only)
// ---------------------------------------------------------------------------
const createCaseRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases',
  request: {
    body: {
      content: { 'application/json': { schema: createCaseSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Case created' } },
});

app.openapi(createCaseRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createCase.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/cases — ListCases (ADMIN, HOSPITAL)
// ---------------------------------------------------------------------------
const listCasesRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases',
  request: {
    query: caseListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of cases' } },
});

app.openapi(listCasesRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listCases.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/cases/stats — GetCaseStats
//    NOTE: must be registered before /:id to avoid matching "stats" as id
// ---------------------------------------------------------------------------
const getCaseStatsRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/stats',
  responses: { 200: { description: 'Case statistics' } },
});

app.openapi(getCaseStatsRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getCaseStats.execute(actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. GET /api/v2/cases/:id — GetCase or GetHospitalCaseDetail (role-based)
// ---------------------------------------------------------------------------
const getCaseRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{id}',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'Case details' } },
});

app.openapi(getCaseRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  if (actor.role === 'HOSPITAL') {
    const result = await svc.getHospitalCaseDetail.execute(id, actor);
    return c.json(result, 200);
  }
  const result = await svc.getCase.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. PATCH /api/v2/cases/:id — UpdateCase
// ---------------------------------------------------------------------------
const updateCaseRoute = createRoute({
  method: 'patch',
  path: '/api/v2/cases/{id}',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateCaseSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Case updated' } },
});

app.openapi(updateCaseRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateCase.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. PATCH /api/v2/cases/:id/status — UpdateCaseStatus
// ---------------------------------------------------------------------------
const updateCaseStatusRoute = createRoute({
  method: 'patch',
  path: '/api/v2/cases/{id}/status',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateCaseStatusSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Case status updated' } },
});

app.openapi(updateCaseStatusRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { status } = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateCaseStatus.execute(id, status, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 7. PATCH /api/v2/cases/:id/stage — AdvanceCaseStage
// ---------------------------------------------------------------------------
const advanceCaseStageRoute = createRoute({
  method: 'patch',
  path: '/api/v2/cases/{id}/stage',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: advanceCaseStageSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Case stage advanced' } },
});

app.openapi(advanceCaseStageRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { stage } = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.advanceCaseStage.execute(id, stage, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 8. POST /api/v2/cases/:id/assign — AssignCase (ADMIN only)
// ---------------------------------------------------------------------------
const assignCaseRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{id}/assign',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: assignCaseSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Case assigned' } },
});

app.openapi(assignCaseRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { hospitalId } = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.assignCase.execute(id, hospitalId, actor);
  return c.json(result, 200);
});

export default app;
