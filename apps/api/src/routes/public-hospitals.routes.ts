import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

const publicHospitalListQuerySchema = z.object({
  site: z.enum(['china', 'global']),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(24),
  search: z.string().optional(),
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

export default app;
