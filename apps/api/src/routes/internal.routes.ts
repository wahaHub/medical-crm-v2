import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getServerEnv } from '@medical-crm/config';
import { chatbotSemanticSignalsSchema } from '@medical-crm/validation';
import { getServices } from '../composition-root.js';
import internalFaqEvalRoutes from './internal-faq-eval.routes.js';

const app = new OpenAPIHono();
const INTERNAL_SYSTEM_ACTOR = {
  userId: 'internal-mcp',
  email: 'internal@medora.local',
  role: 'ADMIN' as const,
  hospitalId: null,
};

const faqCategoriesQuerySchema = z.object({
  hospitalType: z.enum(['COSMETIC', 'REGULAR']),
  hospitalId: z.preprocess(
    (value) => {
      if (typeof value !== 'string')
        return value;

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().min(1).optional(),
  ),
});

const aiPolicyEngagementModeSchema = z.enum([
  'LIGHT_DISCOVERY',
  'QUALIFIED_EXPLORATION',
  'DEEP_WORKFLOW',
]);

const aiPolicyNextActionSchema = z.enum([
  'ANSWER_FAQ',
  'EXPLAIN_DOC_UPLOAD',
  'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
  'EXPLAIN_CONSULT_PROCESS',
  'SHOW_HOSPITAL_RECOMMENDATIONS',
  'REQUEST_DOC_UPLOAD',
  'INVITE_ONLINE_CONSULT',
  'SHOW_PACKAGE',
  'HUMAN_HANDOFF',
  'SAFETY_HANDOFF',
]);

const aiPolicyWritebackDepthSchema = z.enum(['minimal', 'moderate', 'complete']);
const aiPolicyRiskLevelHintSchema = z.enum(['LOW', 'SENSITIVE', 'HIGH', 'HIGH_RISK', 'CRISIS']);
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
    site: parsed.body.site ?? 'china',
    userMessage: parsed.body.payload?.user_message ?? '',
    pageContext: parsed.body.payload?.page_context ?? null,
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
    site: parsed.body.site ?? 'china',
    userMessage: parsed.body.payload?.user_message ?? '',
    extraction: readAiPolicyExtraction(parsed.body.payload),
    pageContext: parsed.body.payload?.page_context ?? null,
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
  const decision = readAiPolicyWritebackDecision(payload.policy_decision);
  const result = await svc.applyAiPolicyWriteback.execute({
    sessionId: parsed.body.session_id,
    site: parsed.body.site ?? 'china',
    assistantMessageId: payload.assistant_message_id,
    idempotencyKey: payload.idempotency_key,
    policyDecision: {
      engagementMode: readOptionalEnum(
        decision.engagementMode ?? decision.engagement_mode,
        aiPolicyEngagementModeSchema,
      ),
      writebackDepth: readOptionalEnum(
        decision.writebackDepth ?? decision.writeback_depth,
        aiPolicyWritebackDepthSchema,
      ),
      nextAction: readOptionalEnum(
        decision.nextAction ?? decision.next_action,
        aiPolicyNextActionSchema,
      ) ?? 'ANSWER_FAQ',
      riskLevel: readOptionalString(decision.riskLevel ?? decision.risk_level) ?? undefined,
      reasonCodes: readStringArray(decision.reasonCodes ?? decision.reason_codes),
      shortlist: readShortlistItems(decision.shortlist),
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

  const svc = getServices();
  const result = await svc.matchHospitals.execute({});

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

app.route('/', internalFaqEvalRoutes);

function readAiPolicyExtraction(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  const semanticSignals = readCanonicalSemanticSignals(record.semantic_signals);
  const riskLevelHint = readRiskLevelHint(record.semantic_signals);

  return {
    ...(semanticSignals ?? {}),
    ...(riskLevelHint ? { riskLevelHint } : {}),
  };
}

function readCanonicalSemanticSignals(
  value: unknown,
): z.infer<typeof chatbotSemanticSignalsSchema> | null {
  const record = parseRecord(value);
  if (!record) {
    return null;
  }

  const parsed = chatbotSemanticSignalsSchema.safeParse({
    resolvedIntent: record.resolvedIntent,
    engagementSignal: record.engagementSignal,
    progressionSignal: record.progressionSignal,
    recommendationSignal: record.recommendationSignal,
    mentionsCondition: record.mentionsCondition,
    mentionsDoctorOrHospitalNeed: record.mentionsDoctorOrHospitalNeed,
  });

  return parsed.success ? parsed.data : null;
}

function readRiskLevelHint(value: unknown): z.infer<typeof aiPolicyRiskLevelHintSchema> | null {
  const record = parseRecord(value);
  if (!record) {
    return null;
  }

  return readOptionalEnum(record.riskLevelHint, aiPolicyRiskLevelHintSchema) ?? null;
}

function readAiPolicyWritebackDecision(value: unknown): Record<string, unknown> {
  return parseRecord(value) ?? {};
}

function readShortlistItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = parseRecord(item);
      if (!record) {
        return null;
      }

      const shortlistItem: Record<string, unknown> = {};
      const hospitalId = readOptionalString(record.hospitalId ?? record.hospital_id);
      const matchType = readOptionalString(record.matchType ?? record.match_type);
      const reasonCodes = readStringArray(record.reasonCodes ?? record.reason_codes);

      if (hospitalId !== null) {
        shortlistItem.hospitalId = hospitalId;
      }

      if (matchType !== null) {
        shortlistItem.matchType = matchType;
      }

      if (reasonCodes.length > 0) {
        shortlistItem.reasonCodes = reasonCodes;
      }

      return Object.keys(shortlistItem).length > 0 ? shortlistItem : null;
    })
    .filter((item): item is Record<string, unknown> => item !== null);
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalEnum<const T extends [string, ...string[]]>(
  value: unknown,
  schema: z.ZodEnum<T>,
): z.infer<typeof schema> | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

export default app;
