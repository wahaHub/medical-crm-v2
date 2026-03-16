import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const hospitalIdParamSchema = z.object({
  hospitalId: z.string().uuid(),
});

const hospitalIdAndIdParamSchema = z.object({
  hospitalId: z.string().uuid(),
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. GET /api/v2/hospitals/:hospitalId/materials/info — GetHospitalInfo
// ---------------------------------------------------------------------------
const getHospitalInfoRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/info',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'Hospital materials info' } },
});

app.openapi(getHospitalInfoRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getHospitalInfo.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 2. POST /api/v2/hospitals/:hospitalId/materials/info — UpdateHospitalInfo
// ---------------------------------------------------------------------------
const updateHospitalInfoRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/info',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            heroImage: z.string().nullable().optional(),
            photos: z.array(z.string()).optional(),
            highlights: z.array(z.object({ icon: z.string(), text: z.string() })).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Hospital info updated' } },
});

app.openapi(updateHospitalInfoRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateHospitalInfo.execute(hospitalId, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/hospitals/:hospitalId/materials/procedures — GetProcedures
// ---------------------------------------------------------------------------
const getProceduresRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/procedures',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'List of procedures' } },
});

app.openapi(getProceduresRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getProcedures.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. POST /api/v2/hospitals/:hospitalId/materials/procedures — CreateProcedure
// ---------------------------------------------------------------------------
const createProcedureRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/procedures',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            procedureName: z.string().min(1),
            description: z.string().nullable().optional(),
            priceMin: z.number().nullable().optional(),
            priceMax: z.number().nullable().optional(),
            priceRange: z.string().nullable().optional(),
            isPopular: z.boolean().optional(),
            sortOrder: z.number().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 201: { description: 'Procedure created' } },
});

app.openapi(createProcedureRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createProcedure.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 5. PUT /api/v2/hospitals/:hospitalId/materials/procedures/:id — UpdateProcedure
// ---------------------------------------------------------------------------
const updateProcedureRoute = createRoute({
  method: 'put',
  path: '/api/v2/hospitals/{hospitalId}/materials/procedures/{id}',
  request: {
    params: hospitalIdAndIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            procedureName: z.string().min(1).optional(),
            description: z.string().nullable().optional(),
            priceMin: z.number().nullable().optional(),
            priceMax: z.number().nullable().optional(),
            priceRange: z.string().nullable().optional(),
            isPopular: z.boolean().optional(),
            sortOrder: z.number().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Procedure updated' } },
});

app.openapi(updateProcedureRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateProcedure.execute(hospitalId, id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. DELETE /api/v2/hospitals/:hospitalId/materials/procedures/:id — DeleteProcedure
// ---------------------------------------------------------------------------
const deleteProcedureRoute = createRoute({
  method: 'delete',
  path: '/api/v2/hospitals/{hospitalId}/materials/procedures/{id}',
  request: { params: hospitalIdAndIdParamSchema },
  responses: { 204: { description: 'Procedure deleted' } },
});

app.openapi(deleteProcedureRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteProcedure.execute(hospitalId, id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 7. GET /api/v2/hospitals/:hospitalId/materials/surgeons — GetSurgeons
// ---------------------------------------------------------------------------
const getSurgeonsRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/surgeons',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'List of surgeons' } },
});

app.openapi(getSurgeonsRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getSurgeons.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 8. POST /api/v2/hospitals/:hospitalId/materials/surgeons — CreateSurgeon
// ---------------------------------------------------------------------------
const createSurgeonRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/surgeons',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1),
            title: z.string().nullable().optional(),
            imageUrl: z.string().nullable().optional(),
            experienceYears: z.number().nullable().optional(),
            specialties: z.array(z.string()).optional(),
            languages: z.array(z.string()).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 201: { description: 'Surgeon created' } },
});

app.openapi(createSurgeonRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createSurgeon.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 9. PUT /api/v2/hospitals/:hospitalId/materials/surgeons/:id — UpdateSurgeon
// ---------------------------------------------------------------------------
const updateSurgeonRoute = createRoute({
  method: 'put',
  path: '/api/v2/hospitals/{hospitalId}/materials/surgeons/{id}',
  request: {
    params: hospitalIdAndIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1).optional(),
            title: z.string().nullable().optional(),
            imageUrl: z.string().nullable().optional(),
            experienceYears: z.number().nullable().optional(),
            specialties: z.array(z.string()).optional(),
            languages: z.array(z.string()).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Surgeon updated' } },
});

app.openapi(updateSurgeonRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateSurgeon.execute(hospitalId, id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 10. DELETE /api/v2/hospitals/:hospitalId/materials/surgeons/:id — DeleteSurgeon
// ---------------------------------------------------------------------------
const deleteSurgeonRoute = createRoute({
  method: 'delete',
  path: '/api/v2/hospitals/{hospitalId}/materials/surgeons/{id}',
  request: { params: hospitalIdAndIdParamSchema },
  responses: { 204: { description: 'Surgeon deleted' } },
});

app.openapi(deleteSurgeonRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteSurgeon.execute(hospitalId, id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 11. GET /api/v2/hospitals/:hospitalId/materials/cases — GetBeforeAfterCases
// ---------------------------------------------------------------------------
const getBeforeAfterCasesRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/cases',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'List of before/after cases' } },
});

app.openapi(getBeforeAfterCasesRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getBeforeAfterCases.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 12. POST /api/v2/hospitals/:hospitalId/materials/cases — CreateBeforeAfterCase
// ---------------------------------------------------------------------------
const createBeforeAfterCaseRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/cases',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            procedureName: z.string().min(1),
            surgeonName: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            images: z.array(z.object({
              url: z.string(),
              type: z.enum(['before', 'after', 'combined']),
            })).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 201: { description: 'Before/after case created' } },
});

app.openapi(createBeforeAfterCaseRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createBeforeAfterCase.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 13. PUT /api/v2/hospitals/:hospitalId/materials/cases/:id — UpdateBeforeAfterCase
// ---------------------------------------------------------------------------
const updateBeforeAfterCaseRoute = createRoute({
  method: 'put',
  path: '/api/v2/hospitals/{hospitalId}/materials/cases/{id}',
  request: {
    params: hospitalIdAndIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            procedureName: z.string().min(1).optional(),
            surgeonName: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            images: z.array(z.object({
              url: z.string(),
              type: z.enum(['before', 'after', 'combined']),
            })).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Before/after case updated' } },
});

app.openapi(updateBeforeAfterCaseRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateBeforeAfterCase.execute(hospitalId, id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 14. DELETE /api/v2/hospitals/:hospitalId/materials/cases/:id — DeleteBeforeAfterCase
// ---------------------------------------------------------------------------
const deleteBeforeAfterCaseRoute = createRoute({
  method: 'delete',
  path: '/api/v2/hospitals/{hospitalId}/materials/cases/{id}',
  request: { params: hospitalIdAndIdParamSchema },
  responses: { 204: { description: 'Before/after case deleted' } },
});

app.openapi(deleteBeforeAfterCaseRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteBeforeAfterCase.execute(hospitalId, id, actor);
  return c.body(null, 204);
});

export default app;
