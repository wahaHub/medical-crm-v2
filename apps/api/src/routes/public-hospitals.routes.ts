import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

const publicHospitalListQuerySchema = z.object({
  site: z.enum(['china', 'global']),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(24),
  search: z.string().optional(),
});

const publicHospitalIdParamSchema = z.object({
  id: z.string().uuid(),
});

const publicHospitalSiteQuerySchema = z.object({
  site: z.enum(['china', 'global']),
});

const publicListHospitalsRoute = createRoute({
  method: 'get',
  path: '/api/v2/public/hospitals',
  request: {
    query: publicHospitalListQuerySchema,
  },
  responses: { 200: { description: 'Public list of active regular hospitals' } },
});

app.openapi(publicListHospitalsRoute, async (c) => {
  const query = c.req.valid('query');
  const svc = getServices();
  const result = await svc.publicListHospitals.execute({
    site: query.site,
    page: query.page,
    limit: query.limit,
    search: query.search,
    status: 'ACTIVE',
    type: 'REGULAR',
  });

  return c.json(result, 200);
});

const publicGetHospitalRoute = createRoute({
  method: 'get',
  path: '/api/v2/public/hospitals/{id}',
  request: {
    params: publicHospitalIdParamSchema,
    query: publicHospitalSiteQuerySchema,
  },
  responses: { 200: { description: 'Public active regular hospital detail' } },
});

app.openapi(publicGetHospitalRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { site } = c.req.valid('query');
  const svc = getServices();
  const result = await svc.publicGetHospital.execute(id, site);

  return c.json({ data: result }, 200);
});

export default app;
