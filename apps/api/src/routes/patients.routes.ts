import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { mergePatientsSchema, patientSearchQuerySchema } from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Case Lifecycle Phase 2: patient search (merge target picker) + patient merge
// ---------------------------------------------------------------------------

// NOTE: must be registered before /{id} routes to avoid matching "search" as id
const searchPatientsRoute = createRoute({
  method: 'get',
  path: '/api/v2/patients/search',
  request: {
    query: patientSearchQuerySchema,
  },
  responses: { 200: { description: 'Patient profiles matching the query (merged profiles excluded)' } },
});

app.openapi(searchPatientsRoute, async (c) => {
  const { q, limit } = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.searchPatients.execute(q, limit, actor);
  return c.json(result, 200);
});

const mergePatientsRoute = createRoute({
  method: 'post',
  path: '/api/v2/patients/{id}/merge',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: { 'application/json': { schema: mergePatientsSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Merge preview (dryRun) or merge result' } },
});

// Path id is the secondary patient (merged away); body.primaryPatientId survives
app.openapi(mergePatientsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.mergePatients.execute({
    secondaryPatientId: id,
    primaryPatientId: body.primaryPatientId,
    dryRun: body.dryRun,
  }, actor);
  return c.json(result, 200);
});

export default app;
