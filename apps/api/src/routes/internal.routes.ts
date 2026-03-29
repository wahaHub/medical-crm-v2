import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { getServerEnv } from '@medical-crm/config';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

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
      nextAction: decision.next_action,
      riskLevel: decision.risk_level,
      reasonCodes: decision.reason_codes ?? [],
      shortlist: decision.shortlist ?? [],
    },
  });

  return c.json({ ok: true, data: result }, 200);
});

export default app;
