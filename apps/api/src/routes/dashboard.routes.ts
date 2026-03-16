import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// 1. GET /api/v2/patient/dashboard — PatientDashboard
// ---------------------------------------------------------------------------
const patientDashboardRoute = createRoute({
  method: 'get',
  path: '/api/v2/patient/dashboard',
  responses: { 200: { description: 'Patient dashboard data' } },
});

app.openapi(patientDashboardRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.patientDashboard.execute(actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/admin/dashboard — AdminDashboard
// ---------------------------------------------------------------------------
const adminDashboardRoute = createRoute({
  method: 'get',
  path: '/api/v2/admin/dashboard',
  responses: { 200: { description: 'Admin dashboard data' } },
});

app.openapi(adminDashboardRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.adminDashboard.execute(actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/hospital/dashboard — HospitalDashboard
// ---------------------------------------------------------------------------
const hospitalDashboardRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospital/dashboard',
  responses: { 200: { description: 'Hospital dashboard data' } },
});

app.openapi(hospitalDashboardRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.hospitalDashboard.execute(actor);
  return c.json(result, 200);
});

export default app;
