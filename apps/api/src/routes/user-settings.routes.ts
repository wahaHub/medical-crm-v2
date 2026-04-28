import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { updateProfileSchema, changePasswordSchema } from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// 1. GET /api/v2/users/me — GetProfile
// ---------------------------------------------------------------------------
const getProfileRoute = createRoute({
  method: 'get',
  path: '/api/v2/users/me',
  responses: { 200: { description: 'Current user profile' } },
});

app.openapi(getProfileRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const profile = await svc.getProfile.execute(actor);
  return c.json(profile, 200);
});

// ---------------------------------------------------------------------------
// 1b. GET /api/v2/admin/settings/admin-emails — ListAdminEmails
// ---------------------------------------------------------------------------
const listAdminEmailsRoute = createRoute({
  method: 'get',
  path: '/api/v2/admin/settings/admin-emails',
  responses: { 200: { description: 'List of admin email addresses' } },
});

app.openapi(listAdminEmailsRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const emails = await svc.listAdminEmails.execute(actor);
  return c.json({ emails }, 200);
});

// ---------------------------------------------------------------------------
// 1c. GET /api/v2/hospital/settings/hospital-emails — ListHospitalEmails
// ---------------------------------------------------------------------------
const listHospitalEmailsRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospital/settings/hospital-emails',
  responses: { 200: { description: 'List of hospital email addresses' } },
});

app.openapi(listHospitalEmailsRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const emails = await svc.listHospitalEmails.execute(actor);
  return c.json({ emails }, 200);
});

// ---------------------------------------------------------------------------
// 1d. POST /api/v2/hospital/settings/hospital-emails/invitations
// ---------------------------------------------------------------------------
const createHospitalEmailInviteSchema = z.object({
  email: z.string().email(),
});

const createHospitalEmailInviteRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospital/settings/hospital-emails/invitations',
  request: {
    body: {
      content: { 'application/json': { schema: createHospitalEmailInviteSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Hospital registration invite generated' } },
});

app.openapi(createHospitalEmailInviteRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  if (!actor.hospitalId) {
    return c.json({ error: 'Hospital actor missing hospitalId' }, 403);
  }

  const body = c.req.valid('json');
  const svc = getServices();
  const result = await svc.generateRegistrationToken.execute(actor.hospitalId, body.email, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. PATCH /api/v2/users/me — UpdateProfile
// ---------------------------------------------------------------------------
const updateProfileRoute = createRoute({
  method: 'patch',
  path: '/api/v2/users/me',
  request: {
    body: {
      content: { 'application/json': { schema: updateProfileSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Updated user profile' } },
});

app.openapi(updateProfileRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const profile = await svc.updateProfile.execute(body, actor);
  return c.json(profile, 200);
});

// ---------------------------------------------------------------------------
// 3. POST /api/v2/users/me/change-password — ChangePassword
// ---------------------------------------------------------------------------
const changePasswordRoute = createRoute({
  method: 'post',
  path: '/api/v2/users/me/change-password',
  request: {
    body: {
      content: { 'application/json': { schema: changePasswordSchema } },
      required: true,
    },
  },
  responses: { 204: { description: 'Password changed successfully' } },
});

app.openapi(changePasswordRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.changePassword.execute(body, actor);
  return c.body(null, 204);
});

export default app;
