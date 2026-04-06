import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getServerEnv } from '@medical-crm/config';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

const envelopeSchema = z.object({
  version: z.literal('v1'),
  request_id: z.string(),
  session_id: z.string().optional(),
  actor: z.string().optional(),
  source_channel: z.string().optional(),
  hospital_type: z.enum(['COSMETIC', 'REGULAR']),
  payload: z.object({
    query_id: z.string().optional(),
    query: z.string(),
    notes: z.string().optional(),
    page_context: z.object({
      type: z.literal('HOSPITAL_DETAIL'),
      hospitalId: z.string(),
      hospitalName: z.string().nullable().optional(),
    }).nullable().optional(),
    expected_scope: z.enum(['GENERAL_ONLY', 'HOSPITAL_AWARE']).optional(),
    expected_categories: z.array(z.string()).optional(),
    expected_hospital_id: z.string().nullable().optional(),
  }),
});

function isAuthorized(secret: string | undefined): boolean {
  const { INTERNAL_API_SECRET } = getServerEnv();
  return Boolean(secret && secret === INTERNAL_API_SECRET);
}

const faqEvalRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/faq-retrieval/evaluate',
  request: {
    body: {
      content: {
        'application/json': {
          schema: envelopeSchema,
        },
      },
    },
  },
  responses: { 200: { description: 'FAQ retrieval evaluation debug payload' } },
});

app.openapi(faqEvalRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = envelopeSchema.parse(await c.req.json());
  const svc = getServices();
  const pageContext = body.payload.page_context
    ? {
      type: 'HOSPITAL_DETAIL' as const,
      hospitalId: body.payload.page_context.hospitalId,
      ...(body.payload.page_context.hospitalName ? { hospitalName: body.payload.page_context.hospitalName } : {}),
    }
    : null;
  const result = await svc.evaluateFaqRetrieval.execute({
    queryId: body.payload.query_id,
    hospitalType: body.hospital_type,
    query: body.payload.query,
    pageContext,
    expectedScope: body.payload.expected_scope,
    expectedCategories: body.payload.expected_categories,
    expectedHospitalId: body.payload.expected_hospital_id,
    notes: body.payload.notes,
  });

  return c.json({
    ok: true,
    data: result,
  }, 200);
});

export default app;
