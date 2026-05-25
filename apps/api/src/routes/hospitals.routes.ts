import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createHospitalSchema,
  hospitalListQuerySchema,
  updateHospitalSchema,
  updateHospitalStatusSchema,
  generateRegistrationTokenSchema,
  registerHospitalUserSchema,
  forgotHospitalPasswordSchema,
  resetHospitalPasswordSchema,
  validateHospitalPasswordResetTokenSchema,
  caseListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const hospitalIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/hospitals — CreateHospital (ADMIN only)
// ---------------------------------------------------------------------------
const createHospitalRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals',
  request: {
    body: {
      content: { 'application/json': { schema: createHospitalSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Hospital created' } },
});

app.openapi(createHospitalRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createHospital.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/hospitals — ListHospitals (ADMIN only)
// ---------------------------------------------------------------------------
const listHospitalsRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals',
  request: {
    query: hospitalListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of hospitals' } },
});

app.openapi(listHospitalsRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listHospitals.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/hospitals/:id — GetHospital
// ---------------------------------------------------------------------------
const getHospitalRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{id}',
  request: {
    params: hospitalIdParamSchema,
  },
  responses: { 200: { description: 'Hospital details' } },
});

app.openapi(getHospitalRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getHospital.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. PUT /api/v2/hospitals/:id — UpdateHospital
// ---------------------------------------------------------------------------
const updateHospitalRoute = createRoute({
  method: 'put',
  path: '/api/v2/hospitals/{id}',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateHospitalSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Hospital updated' } },
});

app.openapi(updateHospitalRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateHospital.execute({ id, ...body }, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. PATCH /api/v2/hospitals/:id/status — UpdateHospitalStatus
// ---------------------------------------------------------------------------
const updateHospitalStatusRoute = createRoute({
  method: 'patch',
  path: '/api/v2/hospitals/{id}/status',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateHospitalStatusSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Hospital status updated' } },
});

app.openapi(updateHospitalStatusRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateHospitalStatus.execute({ id, status: body.status }, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. GET /api/v2/hospitals/:id/cases — GetHospitalCases
// ---------------------------------------------------------------------------
const getHospitalCasesRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{id}/cases',
  request: {
    params: hospitalIdParamSchema,
    query: caseListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of cases for hospital' } },
});

app.openapi(getHospitalCasesRoute, async (c) => {
  const { id } = c.req.valid('param');
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getHospitalCases.execute(id, query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 7. POST /api/v2/hospitals/:id/registration-token — GenerateRegistrationToken
// ---------------------------------------------------------------------------
const generateRegistrationTokenRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{id}/registration-token',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: { 'application/json': { schema: generateRegistrationTokenSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Registration token generated' } },
});

app.openapi(generateRegistrationTokenRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.generateRegistrationToken.execute(id, body.email, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 8. POST /api/v2/auth/hospital/register — RegisterHospitalUser (PUBLIC)
// ---------------------------------------------------------------------------
const registerHospitalUserRoute = createRoute({
  method: 'post',
  path: '/api/v2/auth/hospital/register',
  request: {
    body: {
      content: { 'application/json': { schema: registerHospitalUserSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Hospital user registered' } },
});

app.openapi(registerHospitalUserRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  const result = await svc.registerHospitalUser.execute(body);
  return c.json(result, 201);
});

const requestHospitalPasswordResetRoute = createRoute({
  method: 'post',
  path: '/api/v2/auth/hospital/forgot-password',
  request: {
    body: {
      content: { 'application/json': { schema: forgotHospitalPasswordSchema } },
      required: true,
    },
  },
  responses: { 202: { description: 'Password reset email requested' } },
});

app.openapi(requestHospitalPasswordResetRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  const result = await svc.requestHospitalPasswordReset.execute(body);
  return c.json(result, 202);
});

const validateHospitalPasswordResetTokenRoute = createRoute({
  method: 'get',
  path: '/api/v2/auth/hospital/reset-password',
  request: {
    query: validateHospitalPasswordResetTokenSchema,
  },
  responses: { 200: { description: 'Password reset token is valid' } },
});

app.openapi(validateHospitalPasswordResetTokenRoute, async (c) => {
  const query = c.req.valid('query');
  const svc = getServices();
  const result = await svc.validateHospitalPasswordResetToken.execute(query.token);
  return c.json(result, 200);
});

const resetHospitalPasswordRoute = createRoute({
  method: 'post',
  path: '/api/v2/auth/hospital/reset-password',
  request: {
    body: {
      content: { 'application/json': { schema: resetHospitalPasswordSchema } },
      required: true,
    },
  },
  responses: { 204: { description: 'Password reset complete' } },
});

app.openapi(resetHospitalPasswordRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  await svc.resetHospitalPassword.execute(body);
  return c.body(null, 204);
});

export default app;
