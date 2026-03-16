import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { chcListQuerySchema } from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const caseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

const chcIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/cases/:caseId/hospital-contacts — AddHospitalToCase
// ---------------------------------------------------------------------------
const addHospitalRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{caseId}/hospital-contacts',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: z.object({ hospitalId: z.string().uuid() }) } },
      required: true,
    },
  },
  responses: { 201: { description: 'Hospital added to case' } },
});

app.openapi(addHospitalRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const { hospitalId } = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.addHospitalToCase.execute(caseId, hospitalId, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/cases/:caseId/hospital-contacts — ListCaseHospitalContacts
// ---------------------------------------------------------------------------
const listHospitalContactsRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/hospital-contacts',
  request: {
    params: caseIdParamSchema,
    query: chcListQuerySchema,
  },
  responses: { 200: { description: 'List of hospital contacts for case' } },
});

app.openapi(listHospitalContactsRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listCaseHospitalContacts.execute({ ...query, caseId }, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. PATCH /api/v2/hospital-contacts/:id/remove — RemoveHospitalFromCase
// ---------------------------------------------------------------------------
const removeHospitalRoute = createRoute({
  method: 'patch',
  path: '/api/v2/hospital-contacts/{id}/remove',
  request: {
    params: chcIdParamSchema,
    body: {
      content: { 'application/json': { schema: z.object({ reason: z.string().optional() }) } },
    },
  },
  responses: { 200: { description: 'Hospital removed from case' } },
});

app.openapi(removeHospitalRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.removeHospitalFromCase.execute(id, body?.reason, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. POST /api/v2/hospital-contacts/:id/remind — SendReminder
// ---------------------------------------------------------------------------
const sendReminderRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospital-contacts/{id}/remind',
  request: {
    params: chcIdParamSchema,
  },
  responses: { 200: { description: 'Reminder sent' } },
});

app.openapi(sendReminderRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.sendReminder.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. POST /api/v2/cases/:caseId/reset-assignment — AdminResetAssignment
// ---------------------------------------------------------------------------
const resetAssignmentRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{caseId}/reset-assignment',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 204: { description: 'Assignment reset' } },
});

app.openapi(resetAssignmentRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.adminResetAssignment.execute(caseId, actor);
  return c.body(null, 204);
});

export default app;
