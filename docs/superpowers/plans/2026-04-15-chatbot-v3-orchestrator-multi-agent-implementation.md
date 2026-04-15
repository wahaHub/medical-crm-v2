# Chatbot V3 Orchestrator + Multi-Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a minimal production-ready `/api/v3/chatbot/chat` runtime using `Supervisor suggests -> Orchestrator decides -> Sub-agent executes`, with configurable stage rules, required M0 observability, and frontend-ready v3 cards/contract.

**Architecture:** Keep v3 isolated from v2 by introducing a new contract and runtime path instead of mutating legacy response fields. Orchestrator remains single writer for journey state, sub-agents execute only bounded actions through a typed ToolGateway, and recoverable failures return HTTP 200 with `turnOutcome=degraded`. Frontend integration is done through shared v3 contract types and a reusable card renderer so website/widget consumers can bind without backend-specific branching.

**Tech Stack:** Hono + Zod OpenAPI (`apps/api`), TypeScript services (`packages/application`), shared schemas (`packages/shared/validation`), shared React UI (`packages/shared/ui`), Vitest.

---

**Spec:** `docs/superpowers/specs/2026-04-15-chatbot-v3-orchestrator-multi-agent-design.md`

## Scope and assumptions

- This plan implements **v3 path only** (`/api/v3/chatbot/chat`) and does not add v2 compatibility shims.
- `EXPLAIN_PROCESS at least once` is enforced by **configurable** policy (`globalPolicies.forceExplainProcessBefore`), not hardcoded branching.
- Frontend code in this repo does not include the public marketing widget app; we still deliver frontend artifacts here via:
  - shared v3 response/card renderer (`@medical-crm/ui`)
  - admin/hospital BFF proxy routes for v3 endpoint smoke-testing and future integration.

## File Structure (locked before implementation)

### Backend contracts

- Create: `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
  - v3 request/response/error/card schemas and inferred types.
- Create: `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`
  - strict contract tests, including legacy-field rejection.
- Modify: `packages/shared/validation/src/index.ts`
  - export v3 schemas/types.

### Application services (pure logic)

- Create: `packages/application/src/services/chatbot-v3/types.ts`
  - journey, decision, supervisor, agent, tool result, policy types.
- Create: `packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
  - deterministic decision engine with precedence and prerequisites.
- Create: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
  - suggestion service interface + deterministic fallback strategy.
- Create: `packages/application/src/services/chatbot-v3/policy-config.service.ts`
  - parsing/validation for runtime-configurable rules.
- Create tests:
  - `packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts`
  - `packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts`
  - `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- Modify: `packages/application/src/index.ts`
  - export new v3 services/types.

### API runtime wiring

- Create: `apps/api/src/routes/chatbot-v3/tool-gateway.ts`
  - typed ToolGateway adapter over existing CRM services/use-cases.
- Create: `apps/api/src/routes/chatbot-v3/agents.ts`
  - `FaqAgent`, `RecordsAgent`, `RecommendationAgent`, `ConsultAgent`, `HandoffAgent`.
- Create: `apps/api/src/routes/chatbot-v3/observability.ts`
  - M0 event logger, metrics aggregation, alert threshold evaluation.
- Create: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
  - turn pipeline, idempotency/single-writer lock, degrade fallback.
- Create: `apps/api/src/routes/chatbot-v3.routes.ts`
  - `POST /api/v3/chatbot/chat`.
- Modify: `apps/api/src/index.ts`
  - mount `chatbotV3PublicRoutes`.
- Modify: `apps/api/src/composition-root.ts`
  - expose dependencies required by v3 runtime (including idempotency executor).
- Create tests:
  - `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
  - `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
  - `apps/api/src/__tests__/chatbot-v3.observability.test.ts`

### Frontend integration artifacts (in-repo)

- Create: `packages/shared/ui/src/components/chatbot-v3-cards.tsx`
  - renderer for `PROCESS_GUIDE | UPLOAD_RECORDS | RECOMMENDATION_LIST | CONSULT_BOOKING | HANDOFF_STATUS`.
- Create: `packages/shared/ui/src/components/chatbot-v3-cards.test.tsx`
  - renderer behavior and action dispatch tests.
- Modify: `packages/shared/ui/src/index.ts`
  - export v3 renderer/types.
- Create BFF proxy routes:
  - `apps/admin/src/app/api/chatbot-v3/chat/route.ts`
  - `apps/hospital/src/app/api/chatbot-v3/chat/route.ts`

### Documentation

- Modify: `README.md`
  - v3 endpoint, new env/config keys, observability notes.
- Create: `docs/analysis/2026-04-15-chatbot-v3-m0-observability-checklist.md`
  - non-prod verification checklist for M0 events/metrics/alerts.

## Chunk 1: Contracts + Orchestration Core

### Task 1: Define V3 Validation Contract

**Files:**
- Create: `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
- Modify: `packages/shared/validation/src/index.ts`
- Test: `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`

- [ ] **Step 1: Write failing schema tests for strict v3 contract**

```ts
it('accepts v3 response and rejects legacy fields', () => {
  expect(chatbotV3ChatResponseSchema.safeParse(validResponse).success).toBe(true);
  expect(chatbotV3ChatResponseSchema.safeParse({
    ...validResponse,
    nextAction: 'REQUEST_DOC_UPLOAD',
  }).success).toBe(false);
});

it('rejects any special missing-prerequisite card type', () => {
  expect(chatbotV3ChatResponseSchema.safeParse({
    ...validResponse,
    cards: [{
      cardId: 'x',
      cardType: 'MISSING_PREREQUISITE',
      payload: {},
      actions: [],
    }],
  }).success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts`  
Expected: FAIL with missing schema exports/file.

- [ ] **Step 3: Implement minimal schema + exports**

```ts
export const chatbotV3TurnOutcomeSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  recoverableErrorCode: z.enum(['TIMEOUT', 'UPSTREAM_UNAVAILABLE', 'UNKNOWN']).nullable(),
});
```

- [ ] **Step 4: Re-run schema test**

Run: `pnpm --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/validation/src/chatbot-v3/chat.schema.ts \
  packages/shared/validation/src/index.ts \
  packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts
git commit -m "feat(chatbot-v3): add strict v3 request-response validation contract"
```

### Task 2: Implement Configurable Orchestrator Rule Model

**Files:**
- Create: `packages/application/src/services/chatbot-v3/types.ts`
- Create: `packages/application/src/services/chatbot-v3/policy-config.service.ts`
- Create: `packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Write failing tests for policy config parsing**

```ts
it('loads forceExplainProcessBefore and stagePrerequisites from config', () => {
  const cfg = parsePolicyConfig(input);
  expect(cfg.globalPolicies.forceExplainProcessBefore).toContain('RECOMMENDATION');
  expect(cfg.stagePrerequisites.ONLINE_CONSULT?.requiresAll).toContain('recommendation.picked');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @medical-crm/application test -- chatbot-v3/policy-config.service.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Implement parser with defaults (config-driven, not hardcoded service branch)**

```ts
const DEFAULT_POLICY: ChatbotV3PolicyConfig = {
  globalPolicies: {
    forceExplainProcessBefore: ['RECOMMENDATION', 'ONLINE_CONSULT'],
    handoffTriggers: { userRequestedHuman: true, consecutiveCriticalToolFailures: 2, safetyPolicyHit: true },
  },
  stagePrerequisites: {
    RECOMMENDATION: { requiresAll: ['records.saved'] },
    ONLINE_CONSULT: { requiresAll: ['recommendation.picked'] },
  },
  jumpRules: [],
};
```

- [ ] **Step 4: Re-run test**

Run: `pnpm --filter @medical-crm/application test -- chatbot-v3/policy-config.service.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/types.ts \
  packages/application/src/services/chatbot-v3/policy-config.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts \
  packages/application/src/index.ts
git commit -m "feat(chatbot-v3): add configurable policy model and parser defaults"
```

### Task 3: Implement Deterministic Orchestrator Decision Engine

**Files:**
- Create: `packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts`

- [ ] **Step 1: Write failing decision tests**

```ts
it('denies skip when explain gate is not satisfied', () => {
  const decision = service.decide(input);
  expect(decision.action).toBe('STAY');
  expect(decision.whyNotSkip).toContain('EXPLAIN_PROCESS');
});

it('lets handoff hard policy win before explain/prerequisite gates', () => {
  const decision = service.decide(handoffInput);
  expect(decision.action).toBe('HANDOFF');
});

it('keeps agent dispatch owned by orchestrator output', () => {
  const decision = service.decide(recommendationInput);
  expect(decision.dispatchAgent).toBe('RecommendationAgent');
  expect(decision.dispatchSource).toBe('orchestrator');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @medical-crm/application test -- chatbot-v3/orchestrator-v3.service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement precedence-driven decision logic**

```ts
if (suggestion.intent === 'handoff') return handoff();
if (hitsHandoffHardPolicy(facts, policies)) return handoff();
if (hitsExplainGate(current, target, policies, facts)) return stay('explain_not_completed');
if (violatesStagePrerequisites(target, config.stagePrerequisites, facts)) return stay('missing_prerequisite');
```

- [ ] **Step 4: Re-run orchestrator tests**

Run: `pnpm --filter @medical-crm/application test -- chatbot-v3/orchestrator-v3.service.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts
git commit -m "feat(chatbot-v3): implement deterministic orchestrator decision engine"
```

### Task 4: Implement Supervisor Suggestion Service

**Files:**
- Create: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`

- [ ] **Step 1: Write failing supervisor tests**

```ts
it('returns suggestion with internal reason and bounded output', async () => {
  const result = await supervisor.suggest(input);
  expect(result.suggestedStage).toBeDefined();
  expect(result.reason.length).toBeLessThanOrEqual(240);
});

it('keeps supervisor output suggestion-only without journey mutation fields', async () => {
  const result = await supervisor.suggest(input);
  expect((result as Record<string, unknown>).dispatchAgent).toBeUndefined();
  expect((result as Record<string, unknown>).from).toBeUndefined();
  expect((result as Record<string, unknown>).to).toBeUndefined();
  expect((result as Record<string, unknown>).factsPatch).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @medical-crm/application test -- chatbot-v3/supervisor.service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal supervisor with pluggable gateway + deterministic fallback**

```ts
if (!gateway) return heuristicSuggest(input);
const raw = await gateway.suggest(input);
return sanitizeSuggestionOnly(raw);
```

- [ ] **Step 4: Re-run supervisor tests**

Run: `pnpm --filter @medical-crm/application test -- chatbot-v3/supervisor.service.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/supervisor.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts
git commit -m "feat(chatbot-v3): add supervisor suggestion service with safe fallback"
```

## Chunk 2: Runtime + API + Frontend + Observability

### Task 5: Implement ToolGateway and Sub-Agent Action Runtime

**Files:**
- Create: `apps/api/src/routes/chatbot-v3/tool-gateway.ts`
- Create: `apps/api/src/routes/chatbot-v3/agents.ts`
- Test: `apps/api/src/__tests__/chatbot-v3.routes.test.ts` (agent/tool unit sections)

- [ ] **Step 1: Write failing tests for tool result normalization**

```ts
expect(result).toEqual({ status: 'error', code: 'TIMEOUT', message: expect.any(String) });

it('exposes required tool capability matrix', () => {
  expect(gateway.records).toHaveProperty('upload');
  expect(gateway.records).toHaveProperty('save');
  expect(gateway.records).toHaveProperty('status');
  expect(gateway.recommendation).toHaveProperty('generate');
  expect(gateway.recommendation).toHaveProperty('pick');
  expect(gateway.recommendation).toHaveProperty('status');
  expect(gateway.consult).toHaveProperty('schedule');
  expect(gateway.consult).toHaveProperty('status');
  expect(gateway.status).toHaveProperty('query');
});
```

- [ ] **Step 2: Run API tests and confirm failure**

Run: `pnpm --filter @medical-crm/api test -- chatbot-v3.routes.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement typed ToolGateway + bounded agents**

```ts
export type ToolResult<T> = { status: 'ok'; data: T } | { status: 'error'; code: ToolErrorCode; message: string };
```

- [ ] **Step 4: Re-run API tests**

Run: `pnpm --filter @medical-crm/api test -- chatbot-v3.routes.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/tool-gateway.ts \
  apps/api/src/routes/chatbot-v3/agents.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts
git commit -m "feat(chatbot-v3): add typed tool gateway and bounded agent runtime"
```

### Task 6: Build ConversationOrchestratorV3 Turn Pipeline

**Files:**
- Create: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/composition-root.ts` (expose idempotency executor for v3)
- Test: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Add failing tests for single-writer/idempotent turn behavior**

```ts
it('keeps deterministic state under concurrent turns for same session', async () => {
  const [a, b] = await Promise.all([sendTurn(), sendTurn()]);
  expect([a.status, b.status].sort()).toEqual([200, 200]);
});

it('uses status.query fallback when agent execution times out', async () => {
  await sendTurnWithForcedTimeout();
  expect(toolGateway.status.query).toHaveBeenCalled();
});

it('dispatches actions only from orchestrator decisions', async () => {
  await sendTurnWithSupervisorTryingDirectDispatch();
  expect(runtimeDebug.lastDispatchSource).toBe('orchestrator');
});
```

- [ ] **Step 2: Run runtime tests to verify failure**

Run: `pnpm --filter @medical-crm/api test -- chatbot-v3.routes.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement pipeline with idempotency key and degrade fallback**

```ts
const idempotencyKey = `${sessionId}:${turnId}:chatbot-v3-turn`;
return idempotency.execute(idempotencyKey, 'chatbot_v3_turn', () => runTurnPipeline());
```

- [ ] **Step 4: Re-run runtime tests**

Run: `pnpm --filter @medical-crm/api test -- chatbot-v3.routes.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/composition-root.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts
git commit -m "feat(chatbot-v3): implement turn pipeline with idempotency and degrade fallback"
```

### Task 7: Expose `/api/v3/chatbot/chat` and Mount Publicly

**Files:**
- Create: `apps/api/src/routes/chatbot-v3.routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`

- [ ] **Step 1: Write failing mounting and contract tests**

```ts
it('keeps POST /api/v3/chatbot/chat public and returns v3-only fields', async () => {
  expect(body.nextAction).toBeUndefined();
  expect(body.turnOutcome).toBeDefined();
});
```

- [ ] **Step 2: Run mounting tests**

Run: `pnpm --filter @medical-crm/api test -- chatbot-v3.mounting.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement route + mounting**

```ts
app.route('/', chatbotV3PublicRoutes);
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @medical-crm/api test -- chatbot-v3.mounting.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3.routes.ts \
  apps/api/src/index.ts \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts
git commit -m "feat(chatbot-v3): add public v3 chat route and mount"
```

### Task 8: Implement M0 Observability (Events, Metrics, Alerts)

**Files:**
- Create: `apps/api/src/routes/chatbot-v3/observability.ts`
- Test: `apps/api/src/__tests__/chatbot-v3.observability.test.ts`
- Create: `docs/analysis/2026-04-15-chatbot-v3-m0-observability-checklist.md`

- [ ] **Step 1: Write failing observability tests**

```ts
expect(event).toMatchObject({
  name: 'orchestrator_decision_finalized',
  traceId: expect.any(String),
  sessionId: expect.any(String),
  turnId: expect.any(String),
  childRunId: expect.any(String),
});

it('emits required m0 event set with required decision fields', () => {
  const names = capturedEvents.map((e) => e.name);
  expect(names).toEqual(expect.arrayContaining([
    'supervisor_suggestion_created',
    'orchestrator_decision_finalized',
    'journey_transition_committed',
    'subagent_dispatched',
    'subagent_started',
    'subagent_completed',
    'subagent_failed',
    'subagent_timeout',
    'subagent_cancelled',
    'tool_call_started',
    'tool_call_completed',
    'tool_call_failed',
  ]));
  expect(capturedDecisionEvent).toMatchObject({
    suggestedStage: expect.any(String),
    finalStage: expect.any(String),
    decisionType: expect.any(String),
    matchedRuleId: expect.anything(),
    reason: expect.any(String),
  });
  if (capturedDecisionEvent.decisionType === 'STAY') {
    expect(capturedDecisionEvent).toHaveProperty('whyNotSkip');
  }
});

it('evaluates m0 alert thresholds from windowed metrics', () => {
  const alerts = evaluateAlertThresholds(simulatedMetricWindow);
  expect(alerts).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: 'consult.schedule_failure_rate' }),
    expect.objectContaining({ rule: 'recommendation.generate_failure_rate' }),
    expect.objectContaining({ rule: 'subagent_timeout_rate' }),
    expect.objectContaining({ rule: 'handoff_rate_spike' }),
  ]));
});
```

- [ ] **Step 2: Run observability tests**

Run: `pnpm --filter @medical-crm/api test -- chatbot-v3.observability.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement structured event emitter + metric counters + threshold checks**

```ts
emit('subagent_timeout', payload);
recordMetric('tool_failure_rate', { toolName, value });
checkAlertThresholds(windowedMetrics);
```

- [ ] **Step 4: Re-run observability tests**

Run: `pnpm --filter @medical-crm/api test -- chatbot-v3.observability.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/observability.ts \
  apps/api/src/__tests__/chatbot-v3.observability.test.ts \
  docs/analysis/2026-04-15-chatbot-v3-m0-observability-checklist.md
git commit -m "feat(chatbot-v3): add m0 observability events metrics and alert checks"
```

### Task 9: Frontend Artifacts (Shared Renderer + BFF Proxies)

**Files:**
- Create: `packages/shared/ui/src/components/chatbot-v3-cards.tsx`
- Create: `packages/shared/ui/src/components/chatbot-v3-cards.test.tsx`
- Modify: `packages/shared/ui/src/index.ts`
- Create: `apps/admin/src/app/api/chatbot-v3/chat/route.ts`
- Create: `apps/hospital/src/app/api/chatbot-v3/chat/route.ts`

- [ ] **Step 1: Write failing UI renderer tests**

```tsx
it('renders recommendation cards and dispatches submit action', async () => {
  render(<ChatbotV3Cards cards={[recommendationCard]} onAction={onAction} />);
  await user.click(screen.getByRole('button', { name: /select/i }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'SUBMIT' }));
});
```

- [ ] **Step 2: Run UI tests and app typechecks**

Run: `pnpm --filter @medical-crm/ui test -- chatbot-v3-cards.test.tsx`  
Expected: FAIL.  
Run: `pnpm --filter @medical-crm/admin typecheck && pnpm --filter @medical-crm/hospital typecheck`  
Expected: PASS or reveal missing route types after implementation.

- [ ] **Step 3: Implement renderer and v3 BFF proxies**

```ts
export const POST = createMutationHandler('POST', () => '/api/v3/chatbot/chat');
```

- [ ] **Step 4: Re-run UI tests + typechecks**

Run: `pnpm --filter @medical-crm/ui test -- chatbot-v3-cards.test.tsx`  
Expected: PASS.  
Run: `pnpm --filter @medical-crm/admin typecheck && pnpm --filter @medical-crm/hospital typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/ui/src/components/chatbot-v3-cards.tsx \
  packages/shared/ui/src/components/chatbot-v3-cards.test.tsx \
  packages/shared/ui/src/index.ts \
  apps/admin/src/app/api/chatbot-v3/chat/route.ts \
  apps/hospital/src/app/api/chatbot-v3/chat/route.ts
git commit -m "feat(chatbot-v3): add shared card renderer and app bff chat proxies"
```

### Task 10: Full Regression Pass + Docs Cutover

**Files:**
- Modify: `README.md`
- Modify (if needed): `docs/superpowers/specs/2026-04-15-chatbot-v3-orchestrator-multi-agent-design.md` (only if implementation-level clarifications are required)

- [ ] **Step 1: Run full targeted suites**

Run:
```bash
pnpm --filter @medical-crm/validation test -- chatbot-v3
pnpm --filter @medical-crm/application test -- chatbot-v3
pnpm --filter @medical-crm/api test -- chatbot-v3
pnpm --filter @medical-crm/ui test -- chatbot-v3-cards
```
Expected: PASS.

- [ ] **Step 2: Run smoke typecheck**

Run: `pnpm typecheck`  
Expected: PASS.

- [ ] **Step 3: Update README cutover notes**

```md
- New public endpoint: POST /api/v3/chatbot/chat
- v3 response fields: messages, turnOutcome, cards, journey, handoff
- v3 runtime does not depend on Dify provider path
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(chatbot-v3): document endpoint cutover and runtime behavior"
```

## Execution notes (must-follow)

- Keep tasks DRY and YAGNI. Do not reintroduce `nextAction`/`secondaryAction`/`blocks` in v3 response.
- Keep `reason` and `errorDetail` internal-only and redacted per spec limits.
- Do not add standalone QueryAgent; use shared `status.query`.
- Do not let Supervisor mutate journey state directly; only orchestrator commits transitions.
- If any task reveals missing production dependency for an action (`recommendation.pick`, `consult.schedule`), keep v3 contract stable and return degraded guidance instead of adding extra contract fields.

## Acceptance gate (before merge)

- `/api/v3/chatbot/chat` returns only v3 fields.
- `EXPLAIN_PROCESS` gate, jump rules, prerequisites, and handoff triggers are config-driven.
- `records.save` and `consult.schedule` persistence is reflected in Supabase-backed status and visible via `status.query`.
- Recoverable failures return HTTP 200 + `turnOutcome.status = degraded`.
- M0 observability checklist verified in non-prod.

Plan complete and saved to `docs/superpowers/plans/2026-04-15-chatbot-v3-orchestrator-multi-agent-implementation.md`. Ready to execute?

---

## Revision Append (2026-04-15, Round 2)

This append captures post-review scope refinements that were requested after the initial plan execution.

- [x] **R2-1: Simplify jump rule model**
  - Removed `requiresAll/requiresAny/denyIfAny` from `jumpRules`.
  - Kept `stagePrerequisites` as the single hard gate for fact-based eligibility.
  - Updated orchestrator matching to `fromStage + toStage + priority` only.

- [x] **R2-2: Keep prerequisites as hard gate**
  - Preserved `stagePrerequisites` checks before skip/advance.
  - Confirmed example path: `ONLINE_CONSULT` still requires `recommendation.picked` via `stagePrerequisites`.

- [x] **R2-3: Main runtime owns history compression and sub-agent tasking**
  - Introduced agent dispatch metadata with:
    - `taskPrompt` (compact task context)
  - Removed reliance on single-message-only semantics for sub-agent context.

- [x] **R2-4: Spec alignment**
  - Updated design spec so `jumpRules` are path-permission only.
  - Clarified phase is orchestrator journey metadata, not sub-agent execution constraint.
  - Updated sub-agent runtime contract to `taskPrompt` and removed obsolete patch fields.

- [x] **R2-5: Verification**
  - `pnpm --filter @medical-crm/application test -- chatbot-v3/policy-config.service.test.ts chatbot-v3/orchestrator-v3.service.test.ts`
  - `pnpm --filter @medical-crm/api test -- chatbot-v3.routes.test.ts`
  - `pnpm --filter @medical-crm/application typecheck`
  - `pnpm --filter @medical-crm/api typecheck`

## Revision Append (2026-04-15, Round 3)

- [x] **R3-1: Remove history summary from sub-agent contract**
  - Deleted `meta.historySummary` from agent runtime interface.
  - Runtime dispatch now sends only `meta.taskPrompt`.
  - Removed `conversationSummary` passthrough from `/api/v3/chatbot/chat` runtime call.

- [x] **R3-2: Tighten tests to prevent regression**
  - Updated chatbot-v3 runtime tests to assert:
    - task prompt is present
    - `historySummary` is absent
    - `recommendation.generate.input.context` remains absent

- [x] **R3-3: Spec/plan sync**
  - Spec updated: sub-agent MVP context is `taskPrompt` only.
  - Plan append updated to reflect final minimal contract.

## Revision Append (2026-04-15, Round 4)

- [x] **R4-1: Trace ID贯通主链路（最小）**
  - `POST /api/v3/chatbot/chat` 优先读取 `x-request-id`，缺失时使用 `randomUUID()`.
  - `traceId` 传入 runtime，并写入 `runtimeDebug.traceId` 与节点事件。

- [x] **R4-2: 节点事件最小闭环**
  - 复用 `observability.ts` 增加 runtime 节点事件 emitter（不另起并行模型）。
  - runtime 发出 `Supervisor / Orchestrator / Subagent / Tool` 的 `started|completed|failed|timeout` 事件（按场景适用）。
  - 统一字段：`traceId/sessionId/turnId/node/action/status/latencyMs/errorCode?`。

- [x] **R4-3: 每轮 turn_summary**
  - runtime 在每轮结束输出一条 `turn_summary` 事件。
  - 包含 `decisionAction/fromStage/toStage/outcomeStatus/degradedErrorCode?`。

- [x] **R4-4: 非生产 runtimeDebug 暴露策略**
  - 响应 schema 新增可选 `runtimeDebug`。
  - 非生产返回 `runtimeDebug`（至少 `traceId` + 现有调试字段）；生产不返回新增调试细节。

- [x] **R4-5: 回归验证**
  - 新增 runtime 节点事件链测试（覆盖 supervisor/orchestrator/subagent/tool/turn_summary 及统一字段）。
  - 新增 mount 行为测试（非生产含 `runtimeDebug.traceId`、生产不含 `runtimeDebug`）。

## Revision Append (2026-04-15, Round 5)

This append captures the approved shift to option `B`: keep the current orchestrator architecture, add a minimal reusable LLM adapter layer for `Supervisor + FaqAgent`, add configurable semantic handoff gating, and introduce a dedicated `ResponseComposer`.

### Chunk 5: LLM Supervisor + FAQ Worker + Response Composition

### Task R5-1: Extend policy config for semantic handoff gating

**Files:**
- Modify: `packages/application/src/services/chatbot-v3/types.ts`
- Modify: `packages/application/src/services/chatbot-v3/policy-config.service.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts`

- [ ] **Step 1: Write failing tests for handoff prerequisites**

```ts
it('loads handoffPrerequisites from config', () => {
  const cfg = parsePolicyConfig({
    globalPolicies: {
      handoffPrerequisites: { denyIfAny: ['handoff.active'] },
    },
  });
  expect(cfg.globalPolicies.handoffPrerequisites?.denyIfAny).toContain('handoff.active');
});

it('denies semantic handoff when handoffPrerequisites fail', () => {
  const decision = service.decide({
    current: { stage: 'EXPLAIN_PROCESS' },
    suggestion: { intent: 'handoff', suggestedStage: 'HUMAN_HANDOFF', reason: 'user asks for human' },
    facts: { 'handoff.active': true },
  });
  expect(decision.action).toBe('STAY');
});

it('requires process.explained before downstream stages', () => {
  const decision = service.decide({
    current: { stage: 'EXPLAIN_PROCESS' },
    suggestion: { intent: 'progression', suggestedStage: 'RECOMMENDATION', reason: 'continue' },
    facts: { 'records.saved': true, 'process.explained': false },
  });
  expect(decision.action).toBe('STAY');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/policy-config.service.test.ts src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts`  
Expected: FAIL because `handoffPrerequisites` is not modeled or enforced yet.

- [ ] **Step 3: Implement minimal handoff prerequisite support**

```ts
type GlobalPolicies = {
  forceExplainProcessBefore: JourneyStage[];
  handoffTriggers: { userRequestedHuman: boolean; consecutiveCriticalToolFailures: number; safetyPolicyHit: boolean };
  handoffPrerequisites?: { requiresAll?: string[]; requiresAny?: string[]; denyIfAny?: string[] };
};
```

```ts
stagePrerequisites: {
  RECOMMENDATION: { requiresAll: ['process.explained', 'records.saved'] },
  ONLINE_CONSULT: { requiresAll: ['process.explained', 'recommendation.picked'] },
}
```

- [ ] **Step 4: Enforce precedence in orchestrator**

```ts
if (hitsHandoffHardPolicy(input.handoff, config)) return handoff(current);
if (input.suggestion.intent === 'handoff' || targetStage === 'HUMAN_HANDOFF') {
  if (violatesFactConditions(config.globalPolicies.handoffPrerequisites, facts)) {
    return stay(current, 'Missing prerequisites for HUMAN_HANDOFF');
  }
  return handoff(current);
}
```

- [ ] **Step 5: Re-run tests**

Run: `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/policy-config.service.test.ts src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/services/chatbot-v3/types.ts \
  packages/application/src/services/chatbot-v3/policy-config.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts \
  packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts
git commit -m "feat(chatbot-v3): add semantic handoff prerequisite gating"
```

### Task R5-2: Add minimal LLM adapter contracts for Supervisor and FAQ

**Files:**
- Create: `packages/application/src/services/chatbot-v3/llm-adapter.types.ts`
- Modify: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- Create: `packages/application/src/services/__tests__/chatbot-v3/llm-adapter.types.test.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`

- [ ] **Step 1: Write failing tests for schema-validated LLM adapter outputs**

```ts
it('accepts only intent/suggestedStage/reason from supervisor llm output', async () => {
  const result = await supervisor.suggest(input);
  expect(result).toEqual({
    intent: 'faq',
    suggestedStage: 'EXPLAIN_PROCESS',
    reason: expect.any(String),
  });
});

it('falls back to heuristic when llm output is invalid', async () => {
  expect(await supervisor.suggest(input)).toEqual(heuristicResult);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts src/services/__tests__/chatbot-v3/llm-adapter.types.test.ts`  
Expected: FAIL because adapter contracts do not exist yet.

- [ ] **Step 3: Implement minimal adapter interfaces**

```ts
export interface LlmNodeAdapter<TInput, TOutput> {
  promptVersion: string;
  run(input: TInput): Promise<TOutput>;
}
```

- [ ] **Step 4: Wire supervisor to adapter + heuristic fallback**

```ts
const raw = await this.gateway?.suggest(input);
return sanitizeSuggestionOnly(raw, heuristicSuggest(input));
```

- [ ] **Step 5: Re-run tests**

Run: `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts src/services/__tests__/chatbot-v3/llm-adapter.types.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/services/chatbot-v3/llm-adapter.types.ts \
  packages/application/src/services/chatbot-v3/supervisor.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/llm-adapter.types.test.ts \
  packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts
git commit -m "feat(chatbot-v3): add minimal llm adapter contracts"
```

### Task R5-3: Expand FAQ internal tool surface

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/tool-gateway.ts`
- Modify: `apps/api/src/routes/chatbot-v3/agents.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Write failing tests for FAQ tool surface**

```ts
it('exposes faq categorySearch and getByIds tools', () => {
  const gateway = createToolGateway({ handlers: {} });
  expect(gateway.faq).toHaveProperty('categorySearch');
  expect(gateway.faq).toHaveProperty('getByIds');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/runtime.service.test.ts src/__tests__/chatbot-v3.routes.test.ts`  
Expected: FAIL because the FAQ tool surface is still `search`-only.

- [ ] **Step 3: Implement FAQ tool-style interface**

```ts
faq: {
  categorySearch(...),
  search(...),
  getByIds(...),
}
```

- [ ] **Step 4: Update task envelope builder**

```ts
goal=Answer the user's FAQ using the FAQ toolset only.
latest_user_message=...
```

- [ ] **Step 5: Re-run tests**

Run: `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/runtime.service.test.ts src/__tests__/chatbot-v3.routes.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/tool-gateway.ts \
  apps/api/src/routes/chatbot-v3/agents.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.test.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts
git commit -m "feat(chatbot-v3): expand faq tools for llm worker runtime"
```

### Task R5-4: Implement FAQ LLM worker with tool loop and safe fallback

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/agents.ts`
- Create: `apps/api/src/routes/chatbot-v3/faq-llm-adapter.ts`
- Create: `apps/api/src/routes/chatbot-v3/faq-prompts.ts`
- Create: `apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.test.ts`

- [ ] **Step 1: Write failing FAQ worker tests**

```ts
it('lets FaqAgent choose category/query and call faq tools before returning answer', async () => {
  const result = await agent.execute(faqAction);
  expect(categorySearch).toHaveBeenCalled();
  expect(search).toHaveBeenCalled();
  expect(result).toEqual({
    status: 'ok',
    data: { answer: expect.any(String), citedFaqIds: expect.any(Array), confidence: 'high' },
  });
});

it('falls back safely when faq llm output is invalid', async () => {
  expect(result.status).toBe('ok');
  expect(result.data.answer).toContain('I can help');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/faq-llm-adapter.test.ts src/routes/chatbot-v3/runtime.service.test.ts`  
Expected: FAIL because `FaqAgent` is still deterministic-only.

- [ ] **Step 3: Implement role prompt + structured plan/result contracts**

```ts
type FaqPlan = { category?: string; query: string; reason: string };
type FaqAnswerResult = { answer: string; citedFaqIds: string[]; confidence: 'high' | 'medium' | 'low' };
```

- [ ] **Step 4: Implement tool loop with bounded allowlist**

```ts
const plan = await adapter.plan(task);
const categories = plan.category ? null : await gateway.faq.categorySearch(...);
const matches = await gateway.faq.search(...);
const details = shouldFetchDetails(matches) ? await gateway.faq.getByIds(...) : null;
return await adapter.answer({ plan, matches, details, latestUserMessage });
```

- [ ] **Step 5: Add deterministic fallback**

```ts
return {
  status: 'ok',
  data: {
    answer: composeFallbackFaqAnswer(matches),
    citedFaqIds: matches.slice(0, 3).map((item) => item.id),
    confidence: 'medium',
  },
};
```

- [ ] **Step 6: Re-run tests**

Run: `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/faq-llm-adapter.test.ts src/routes/chatbot-v3/runtime.service.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/agents.ts \
  apps/api/src/routes/chatbot-v3/faq-llm-adapter.ts \
  apps/api/src/routes/chatbot-v3/faq-prompts.ts \
  apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.test.ts
git commit -m "feat(chatbot-v3): add llm-driven faq worker with safe fallback"
```

### Task R5-5: Add ResponseComposer as envelope/card renderer

**Files:**
- Create: `apps/api/src/routes/chatbot-v3/response-composer.ts`
- Create: `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3.routes.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Write failing response composition tests**

```ts
it('composes faq answer from dispatch result instead of supervisor reason', () => {
  const response = composeResponse(input);
  expect(response.messages[0].text).toContain('online consultation');
});

it('returns normal guidance when semantic handoff is denied by prerequisites', () => {
  const response = composeResponse(input);
  expect(response.handoff.required).toBe(false);
  expect(response.messages[0].text).toContain('before we connect you');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts src/__tests__/chatbot-v3.mounting.test.ts src/__tests__/chatbot-v3.routes.test.ts`  
Expected: FAIL because response composition is still implicit.

- [ ] **Step 3: Implement minimal ResponseComposer**

```ts
export function composeResponse(input: ResponseComposerInput): ResponseComposerOutput {
  if (isFaqResult(input.dispatchResult)) return faqResponseFromAgentText(...);
  if (input.decision.action === 'HANDOFF') return handoffResponse(...);
  return defaultGuidanceResponse(...);
}
```

- [ ] **Step 4: Wire route/runtime through ResponseComposer**

```ts
const response = composeResponse({
  decision,
  suggestion,
  dispatchResult,
  fallbackStatus,
});
```

- [ ] **Step 5: Re-run tests**

Run: `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts src/__tests__/chatbot-v3.mounting.test.ts src/__tests__/chatbot-v3.routes.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/response-composer.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts \
  apps/api/src/routes/chatbot-v3.routes.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts
git commit -m "feat(chatbot-v3): add response composer envelope renderer"
```

### Task R5-6: Add LLM observability fields and regression verification

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/observability.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.observability.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing observability tests**

```ts
it('emits prompt version/model/fallback fields for llm nodes', async () => {
  expect(events).toContainEqual(expect.objectContaining({
    node: 'Supervisor',
    nodePromptVersion: expect.any(String),
    nodeModel: expect.any(String),
  }));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.observability.test.ts src/routes/chatbot-v3/runtime.service.test.ts`  
Expected: FAIL because LLM observability fields are not emitted yet.

- [ ] **Step 3: Implement minimal LLM observability fields**

```ts
type LlmNodeEvent = {
  nodePromptVersion?: string;
  nodeModel?: string;
  fallbackUsed?: boolean;
  schemaValidationFailed?: boolean;
  toolPlanUsed?: boolean;
};
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.observability.test.ts src/routes/chatbot-v3/runtime.service.test.ts`  
Expected: PASS.

- [ ] **Step 5: Run focused end-to-end regression set**

Run: `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/*.test.ts && pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3*.test.ts src/routes/chatbot-v3/*.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/observability.ts \
  apps/api/src/__tests__/chatbot-v3.observability.test.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.test.ts \
  README.md
git commit -m "feat(chatbot-v3): add llm node observability for supervisor and faq worker"
```
