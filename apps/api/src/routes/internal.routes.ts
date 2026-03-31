import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getServerEnv } from '@medical-crm/config';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();
const INTERNAL_SYSTEM_ACTOR = {
  userId: 'internal-mcp',
  email: 'internal@medora.local',
  role: 'ADMIN' as const,
  hospitalId: null,
};

const faqCategoriesQuerySchema = z.object({
  hospitalType: z.enum(['COSMETIC', 'REGULAR']),
  hospitalId: z.string().min(1).optional(),
});

function isAuthorized(secret: string | undefined): boolean {
  const { INTERNAL_API_SECRET } = getServerEnv();
  return Boolean(secret && secret === INTERNAL_API_SECRET);
}

async function parseEnvelope(c: { req: { json(): Promise<any> }; json: (body: unknown, status?: number) => Response }) {
  const body = await c.req.json();
  if (body?.version !== 'v1') {
    return {
      ok: false as const,
      response: c.json({
        ok: false,
        error: {
          code: 'UNSUPPORTED_VERSION',
          retryable: false,
        },
      }, 400),
    };
  }

  return {
    ok: true as const,
    body,
  };
}

// ---------------------------------------------------------------------------
// POST /api/v2/internal/process-message-tasks — Internal worker endpoint
// ---------------------------------------------------------------------------
const processTasksRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/process-message-tasks',
  responses: { 200: { description: 'Tasks processed' } },
});

app.openapi(processTasksRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const svc = getServices();
  const result = await svc.processMessageTasks.execute();
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// POST /api/v2/internal/process-translation-tasks — Internal worker endpoint
// ---------------------------------------------------------------------------
const processTranslationTasksRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/process-translation-tasks',
  responses: { 200: { description: 'Translation tasks processed' } },
});

app.openapi(processTranslationTasksRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const svc = getServices();
  const result = await svc.processTranslationTasks.execute();
  return c.json(result, 200);
});

const processAiSyncOutboxRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/process-ai-sync-outbox',
  responses: { 200: { description: 'AI sync outbox processed' } },
});

app.openapi(processAiSyncOutboxRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const svc = getServices();
  const result = await svc.processAiSyncOutbox.execute();
  return c.json(result, 200);
});

const aiPolicyContextRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/ai-policy/context',
  responses: { 200: { description: 'AI policy context' } },
});

app.openapi(aiPolicyContextRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const parsed = await parseEnvelope(c);
  if (!parsed.ok) {
    return parsed.response;
  }

  const svc = getServices();
  const result = await svc.getAiPolicyContext.execute({
    sessionId: parsed.body.session_id,
    userMessage: parsed.body.payload?.user_message ?? '',
  });

  return c.json({ ok: true, data: result }, 200);
});

const aiPolicyDecideRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/ai-policy/decide',
  responses: { 200: { description: 'AI policy decision' } },
});

app.openapi(aiPolicyDecideRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const parsed = await parseEnvelope(c);
  if (!parsed.ok) {
    return parsed.response;
  }

  const svc = getServices();
  const result = await svc.decideAiPolicy.execute({
    sessionId: parsed.body.session_id,
    userMessage: parsed.body.payload?.user_message ?? '',
    extraction: parsed.body.payload?.candidate_signals ?? {},
    candidateHospitals: parsed.body.payload?.candidate_hospitals ?? [],
  });

  return c.json({ ok: true, data: result }, 200);
});

const aiPolicyWritebackRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/ai-policy/writeback',
  responses: { 200: { description: 'AI policy writeback' } },
});

app.openapi(aiPolicyWritebackRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const parsed = await parseEnvelope(c);
  if (!parsed.ok) {
    return parsed.response;
  }

  const svc = getServices();
  const payload = parsed.body.payload ?? {};
  const decision = payload.policy_decision ?? {};
  const result = await svc.applyAiPolicyWriteback.execute({
    sessionId: parsed.body.session_id,
    assistantMessageId: payload.assistant_message_id,
    idempotencyKey: payload.idempotency_key,
    policyDecision: {
      engagementMode: decision.engagement_mode,
      writebackDepth: decision.writeback_depth,
      nextAction: decision.next_action,
      riskLevel: decision.risk_level,
      reasonCodes: decision.reason_codes ?? [],
      prequalificationReasonCodes: decision.prequalification_reason_codes ?? [],
      shortlist: decision.shortlist ?? [],
    },
  });

  return c.json({ ok: true, data: result }, 200);
});

const searchHospitalsRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/mcp/search-hospitals',
  responses: { 200: { description: 'Hospital candidate pool for Dify orchestration' } },
});

app.openapi(searchHospitalsRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const topicHint = readOptionalString(body?.candidate_signals?.topicHint);
  const query = readOptionalString(body?.query);
  const category = topicHint ?? inferHospitalCategory(query);

  const svc = getServices();
  const result = await svc.matchHospitals.execute({
    category: category ?? undefined,
  });

  return c.json({
    ok: true,
    data: result.hospitals.map((hospital) => ({
      hospitalId: hospital.id,
      name: hospital.name,
      nameEn: hospital.nameEn,
      rating: hospital.rating,
      logoUrl: hospital.logoUrl,
      tags: hospital.tags,
      procedureCount: hospital.procedureCount,
      reasonCodes: ['candidate_pool_match'],
    })),
  }, 200);
});

const faqCategoriesRoute = createRoute({
  method: 'get',
  path: '/api/v2/internal/mcp/faq-categories',
  request: {
    query: faqCategoriesQuerySchema,
  },
  responses: { 200: { description: 'Active FAQ categories for chatbot retrieval' } },
});

app.openapi(faqCategoriesRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const query = c.req.valid('query');
  const svc = getServices();
  const result = await svc.listFaqCategoriesForChatbot.execute({
    hospitalType: query.hospitalType,
    hospitalId: query.hospitalId,
  });

  return c.json(result, 200);
});

const listPackagesRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/mcp/list-packages',
  responses: { 200: { description: 'Compact package cards for Dify orchestration' } },
});

app.openapi(listPackagesRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!isAuthorized(secret)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const svc = getServices();
  const result = await svc.listPackages.execute({
    page: 1,
    limit: 5,
    status: 'PUBLISHED',
  }, INTERNAL_SYSTEM_ACTOR);

  return c.json({
    ok: true,
    data: result.data.map((pkg) => ({
      packageId: pkg.id,
      name: pkg.nameEn,
      type: pkg.type,
      price: pkg.price,
      currency: pkg.currency,
      description: pkg.descriptionEn,
      coverImageUrl: pkg.coverImageUrl,
    })),
  }, 200);
});

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function inferHospitalCategory(query: string | null): string | null {
  if (!query) return null;
  const normalized = query.toLowerCase();
  if (normalized.includes('rhinoplasty')) return 'rhinoplasty';
  if (normalized.includes('hair') || normalized.includes('transplant')) return 'hair transplant';
  if (normalized.includes('ivf') || normalized.includes('fertility')) return 'fertility';
  return null;
}

export default app;
