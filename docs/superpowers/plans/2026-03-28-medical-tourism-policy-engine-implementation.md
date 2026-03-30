# Medical Tourism Policy Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing Dify-backed chatbot into a backend-authoritative policy engine with persistent CRM memory, controlled recommendation/handoff logic, and Dify as the medium orchestration and response layer.

**Architecture:** Keep the existing `ai_chat_sessions` / `ai_chat_messages` / Dify sync foundation, then add a policy-engine module inside `medical-crm-v2` that owns intent/risk/next-action/status/writeback truth. Dify will call internal backend policy endpoints for context, decision, and writeback, while FAQ/package retrieval and language generation remain in Dify.

**Tech Stack:** TypeScript, Hono, Zod, Drizzle/Postgres, Vitest, Dify HTTP APIs, existing CRM repositories/use cases.

---

## File Structure Map

### Existing files to extend

- `apps/api/src/routes/chatbot.routes.ts`
  - Keep public chatbot endpoints, but switch `/chat` from direct Dify-authoritative parsing to backend policy + Dify orchestration contract handling.
- `apps/api/src/routes/internal.routes.ts`
  - Add internal AI policy endpoints secured by `X-Internal-Secret`.
- `apps/api/src/composition-root.ts`
  - Wire new policy engine services, repositories, and use cases into the existing service container.
- `apps/api/src/__tests__/chatbot.routes.test.ts`
  - Extend route coverage for new public contract behavior.
- `apps/api/src/__tests__/chatbot.routes.integration.test.ts`
  - Extend DB-backed integration coverage for new writeback/status behavior.
- `apps/api/src/__tests__/internal.routes.test.ts`
  - Add unit tests for `/internal/ai-policy/*` endpoints.
- `packages/infrastructure/database/schema/schema.ts`
  - Extend existing AI-chat tables and add new policy-engine support tables.
- `packages/shared/validation/src/chatbot.schema.ts`
  - Replace the v1 lightweight contract with richer internal/public envelopes.
- `packages/domain/src/entities/ai-chat-session.entity.ts`
  - Add session-level status snapshot and policy-control fields.
- `packages/domain/src/entities/ai-chat-message.entity.ts`
  - Add policy decision metadata fields while preserving the audit trail role/content model.
- `packages/domain/src/index.ts`
  - Export all new policy-engine entities, ports, and types.
- `packages/infrastructure/services/dify-api-client.service.ts`
  - Add Dify workflow invocation helpers aligned to the backend-authoritative contract.

### New database migration and repository files

- `packages/infrastructure/database/migrations/025_ai_policy_engine.sql`
- `packages/domain/src/entities/ai-user-profile.entity.ts`
- `packages/domain/src/entities/ai-chat-timeline-event.entity.ts`
- `packages/domain/src/entities/ai-followup-trigger.entity.ts`
- `packages/domain/src/entities/ai-handoff.entity.ts`
- `packages/domain/src/ports/ai-user-profile-repository.port.ts`
- `packages/domain/src/ports/ai-chat-timeline-event-repository.port.ts`
- `packages/domain/src/ports/ai-followup-trigger-repository.port.ts`
- `packages/domain/src/ports/ai-handoff-repository.port.ts`
- `packages/infrastructure/database/repositories/drizzle-ai-user-profile.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-ai-chat-timeline-event.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-ai-followup-trigger.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-ai-handoff.repository.ts`

### New application-layer policy engine files

- `packages/application/src/dtos/ai-policy.dto.ts`
- `packages/application/src/services/policy-engine/context-builder.service.ts`
- `packages/application/src/services/policy-engine/signal-resolver.service.ts`
- `packages/application/src/services/policy-engine/intent-resolver.service.ts`
- `packages/application/src/services/policy-engine/risk-resolver.service.ts`
- `packages/application/src/services/policy-engine/action-planner.service.ts`
- `packages/application/src/services/policy-engine/recommendation-policy.service.ts`
- `packages/application/src/services/policy-engine/handoff-policy.service.ts`
- `packages/application/src/services/policy-engine/writeback-planner.service.ts`
- `packages/application/src/services/policy-engine/writeback-executor.service.ts`
- `packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`
- `packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- `packages/application/src/use-cases/ai-policy/apply-ai-policy-writeback.use-case.ts`

### New tests to add

- `packages/application/src/services/__tests__/policy-engine/context-builder.service.test.ts`
- `packages/application/src/services/__tests__/policy-engine/intent-resolver.service.test.ts`
- `packages/application/src/services/__tests__/policy-engine/risk-resolver.service.test.ts`
- `packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts`
- `packages/application/src/services/__tests__/policy-engine/recommendation-policy.service.test.ts`
- `packages/application/src/services/__tests__/policy-engine/writeback-executor.service.test.ts`
- `packages/infrastructure/__tests__/integration/drizzle-ai-policy.repository.test.ts`
- `packages/infrastructure/__tests__/unit/dify-api-client.service.test.ts`

## Chunk 1: Schema and Shared Contract Foundation

### Task 1: Add policy-engine persistence schema without breaking existing chatbot flows

**Files:**
- Create: `packages/infrastructure/database/migrations/025_ai_policy_engine.sql`
- Modify: `packages/infrastructure/database/schema/schema.ts`
- Create: `packages/infrastructure/__tests__/integration/builders/ai-policy-test-builders.ts`
- Test: `packages/infrastructure/__tests__/integration/drizzle-ai-policy.repository.test.ts`

- [ ] **Step 1: Write the failing integration test for the new tables and columns**

```ts
import {
  buildAiChatSession,
  buildAiUserProfile,
  buildTimelineEvent,
  buildFollowupTrigger,
  buildRecommendationLog,
  buildHandoff,
} from './builders/ai-policy-test-builders';

// The new builder file should contain fixture factories for the session/profile/
// timeline/followup/recommendation/handoff rows used in this test.

it('persists session policy state, profile memory, timeline events, followups, recommendations, and handoffs', async () => {
  const session = await sessionRepo.save(buildAiChatSession({
    sessionId: 'policy-session-1',
    statusSnapshot: {
      formStatus: 'NOT_STARTED',
      recommendationStatus: 'NOT_SHOWN',
      handoffStatus: 'NONE',
      riskLevel: 'LOW',
    },
    pendingOfferType: 'FORM_COMPLETION',
  }));

  const profile = await profileRepo.save(buildAiUserProfile({
    patientId: null,
    anonymousKey: session.sessionId,
    memorySummary: 'Interested in rhinoplasty in Korea with mid-range budget.',
  }));

  const event = await timelineRepo.create(buildTimelineEvent({ sessionId: session.id, eventType: 'DOC_UPLOAD_REQUESTED' }));
  const followup = await followupRepo.create(buildFollowupTrigger({ sessionId: session.id, triggerType: 'DOC_UPLOAD_PENDING' }));
  const handoff = await handoffRepo.create(buildHandoff({ sessionId: session.id, handoffType: 'HIGH_VALUE_LEAD' }));

  expect(profile.memorySummary).toContain('rhinoplasty');
  expect(event.eventType).toBe('DOC_UPLOAD_REQUESTED');
  expect(followup.triggerType).toBe('DOC_UPLOAD_PENDING');
  expect(handoff.handoffType).toBe('HIGH_VALUE_LEAD');
});
```

- [ ] **Step 2: Run the new integration test to verify the schema is missing**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure exec vitest run --config vitest.integration.config.ts __tests__/integration/drizzle-ai-policy.repository.test.ts
```

Expected: FAIL with missing relation/column errors for the new AI policy tables and session/message fields.

- [ ] **Step 3: Add the migration and Drizzle schema changes**

Required schema additions:

- Extend `ai_chat_sessions` with:
  - `condition_status`
  - `form_status`
  - `doc_upload_status`
  - `recommendation_status`
  - `consultation_status`
  - `package_status`
  - `handoff_status`
  - `lead_maturity`
  - `risk_level`
  - `trust_or_objection`
  - `pending_offer_type`
  - `pending_offer_payload jsonb`
  - `pending_question_type`
  - `pending_question_payload jsonb`
  - `last_next_action`
  - `last_resolved_intent`
  - `conversation_summary`
  - `last_policy_decision_at`
  - `last_user_message_at`
  - `last_assistant_message_at`
- Extend `ai_chat_messages` with:
  - widen `intent` to `varchar(80)`
  - `resolved_intent`
  - `secondary_action`
  - `response_mode`
  - `reason_codes jsonb`
  - `shortlist jsonb`
  - `writeback_status`
  - `tool_trace jsonb`
  - keep existing `intent/risk_level/next_action` for compatibility; backfill them from authoritative decision fields
  - backfill rule:
    - copy `resolved_intent` into `intent` when the old compatibility field is empty
    - set compatibility `next_action` from authoritative `next_action`
- Create tables:
  - `ai_user_profiles`
    - `patient_id`
    - `anonymous_key`
    - `condition_or_goal`
    - `condition_category`
    - `preferred_destination jsonb`
    - `preferred_language`
    - `budget_band`
    - `urgency_level`
    - `existing_reports_status`
    - `objection_tags jsonb`
    - `lead_stage`
    - `next_best_action`
    - `memory_summary`
    - `source_confidence_map jsonb`
    - `created_at`
    - `updated_at`
    - unique nullable `patient_id`
    - unique nullable `anonymous_key`
  - `ai_chat_timeline_events`
    - `session_id`
    - `patient_id`
    - `event_type`
    - `summary`
    - `payload jsonb`
    - `actor`
    - `confidence`
    - `created_at`
  - `ai_followup_triggers`
    - `session_id`
    - `patient_id`
    - `trigger_type`
    - `status`
    - `due_at`
    - `channel`
    - `reason`
    - `payload jsonb`
    - `created_at`
    - `resolved_at`
    - enforce only one active pending trigger per `(session_id, trigger_type)` via application rule or partial index
  - `ai_handoffs`
    - `session_id`
    - `patient_id`
    - `support_ticket_id`
    - `handoff_type`
    - `priority`
    - `reason_code`
    - `brief jsonb`
    - `status`
    - `assigned_to`
    - `created_at`
    - `completed_at`

- [ ] **Step 4: Re-run the integration test to verify the schema passes**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure exec vitest run --config vitest.integration.config.ts __tests__/integration/drizzle-ai-policy.repository.test.ts
```

Expected: PASS for table creation, insert, update, and relation access.

- [ ] **Step 5: Commit the schema foundation**

```bash
git add packages/infrastructure/database/migrations/025_ai_policy_engine.sql packages/infrastructure/database/schema/schema.ts packages/infrastructure/__tests__/integration/builders/ai-policy-test-builders.ts packages/infrastructure/__tests__/integration/drizzle-ai-policy.repository.test.ts
git commit -m "feat: add ai policy engine schema foundation"
```

### Task 2: Extend domain entities and repository ports for policy-engine objects

**Files:**
- Modify: `packages/domain/src/entities/ai-chat-session.entity.ts`
- Modify: `packages/domain/src/entities/ai-chat-message.entity.ts`
- Create: `packages/domain/src/entities/ai-user-profile.entity.ts`
- Create: `packages/domain/src/entities/ai-chat-timeline-event.entity.ts`
- Create: `packages/domain/src/entities/ai-followup-trigger.entity.ts`
- Create: `packages/domain/src/entities/ai-handoff.entity.ts`
- Create: `packages/domain/src/ports/ai-user-profile-repository.port.ts`
- Create: `packages/domain/src/ports/ai-chat-timeline-event-repository.port.ts`
- Create: `packages/domain/src/ports/ai-followup-trigger-repository.port.ts`
- Create: `packages/domain/src/ports/ai-handoff-repository.port.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/application/src/services/__tests__/policy-engine/context-builder.service.test.ts`

- [ ] **Step 1: Write the failing policy-context test against the missing entities/ports**

```ts
it('assembles context from session, profile, timeline, and pending state', async () => {
  const context = await builder.build({
    sessionId: 'policy-session-1',
    userMessage: 'Can we continue with the recommendation you mentioned earlier?',
  });

  expect(context.statusSnapshot.pendingOffer?.type).toBe('HOSPITAL_RECOMMENDATION');
  expect(context.profile.memorySummary).toContain('Korea');
  expect(context.recentTimeline[0]?.eventType).toBeDefined();
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/context-builder.service.test.ts
```

Expected: FAIL because the new entities/ports are not defined/exported yet.

- [ ] **Step 3: Add the domain models and ports**

Key interface rules:

- `AiChatSession` must expose a structured `statusSnapshot` view, not a giant `Record<string, unknown>`.
- `AiChatMessage` must expose both:
  - compatibility fields for current routes (`intent`, `riskLevel`, `nextAction`)
  - authoritative fields (`resolvedIntent`, `secondaryAction`, `responseMode`, `toolTrace`)
- New repository ports must support the minimum operations used by policy context and writeback:
  - `findBySessionId`
  - `save`
  - `patchStatus`
  - `listRecentBySession`
  - `findByAnonymousKeyOrPatient`
  - `append`
  - `createPendingTrigger`
  - `resolvePendingTrigger`

- [ ] **Step 4: Re-run the application test**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/context-builder.service.test.ts
```

Expected: FAIL moves forward to missing implementation details instead of missing types/exports.

- [ ] **Step 5: Commit the domain contract changes**

```bash
git add packages/domain/src/entities packages/domain/src/ports packages/domain/src/index.ts packages/application/src/services/__tests__/policy-engine/context-builder.service.test.ts
git commit -m "feat: add ai policy engine domain contracts"
```

### Task 3: Upgrade shared validation and internal policy DTOs

**Files:**
- Modify: `packages/shared/validation/src/chatbot.schema.ts`
- Create: `packages/application/src/dtos/ai-policy.dto.ts`
- Modify: `packages/shared/validation/src/index.ts`
- Test: `apps/api/src/__tests__/chatbot.routes.test.ts`
- Test: `apps/api/src/__tests__/internal.routes.test.ts`

- [ ] **Step 1: Write failing route tests for the new public and internal envelopes**

```ts
it('returns topic, responseMode, and policy-backed metadata in public chat responses', async () => {
  const res = await app.request('/api/v2/chatbot/chat', { method: 'POST', body: JSON.stringify(validBody) });
  const body = await res.json();

  expect(body.topic).toBe('PROCEDURE');
  expect(body.responseMode).toBe('grounded_plus_guidance');
  expect(body.history.assistantMessageId).toBeDefined();
});

it('rejects internal ai-policy decide requests with unsupported version', async () => {
  const res = await app.request('/api/v2/internal/ai-policy/decide', {
    method: 'POST',
    headers: { 'X-Internal-Secret': validSecret },
    body: JSON.stringify({ version: 'old', payload: {} }),
  });

  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run the route tests to verify the new contract is absent**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts src/__tests__/internal.routes.test.ts
```

Expected: FAIL because the schemas do not yet include the richer contract.

- [ ] **Step 3: Update the public schemas and add internal DTOs**

Public additions:

- `topic`
- `secondaryAction`
- `responseMode`
- `reasonCodes`
- `shortlist`
- richer `metadata`

Internal DTO additions:

- envelope schema with:
  - `version`
  - `request_id`
  - `session_id`
  - `message_id`
  - `actor`
  - `source_channel`
  - `hospital_type`
  - `payload`
- error envelope with:
  - `code`
  - `retryable`
  - `safeFallback`
  - `details`

- [ ] **Step 4: Re-run the route tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts src/__tests__/internal.routes.test.ts
```

Expected: FAIL shifts to missing route implementation, not missing schema fields.

- [ ] **Step 5: Commit the shared contract layer**

```bash
git add packages/shared/validation/src/chatbot.schema.ts packages/shared/validation/src/index.ts packages/application/src/dtos/ai-policy.dto.ts apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/internal.routes.test.ts
git commit -m "feat: add ai policy engine shared contracts"
```

## Chunk 2: Backend Policy Engine Core

### Task 4: Add infrastructure repositories for policy-engine truth objects

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-ai-user-profile.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-ai-chat-timeline-event.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-ai-followup-trigger.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-ai-handoff.repository.ts`
- Modify: `packages/infrastructure/database/repositories/index.ts`
- Test: `packages/infrastructure/__tests__/integration/drizzle-ai-policy.repository.test.ts`

- [ ] **Step 1: Extend the integration test to hit the new repository classes**

```ts
it('updates session snapshot and links profile/timeline/followup rows through repository classes', async () => {
  await sessionRepo.patchStatus(sessionId, {
    formStatus: 'IN_PROGRESS',
    pendingQuestionType: 'ASK_BUDGET',
  });

  const persisted = await sessionRepo.findBySessionId('policy-session-1');
  expect(persisted?.statusSnapshot.formStatus).toBe('IN_PROGRESS');
  expect(persisted?.pendingQuestion?.type).toBe('ASK_BUDGET');
});
```

- [ ] **Step 2: Run the integration test**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure exec vitest run --config vitest.integration.config.ts packages/infrastructure/__tests__/integration/drizzle-ai-policy.repository.test.ts
```

Expected: FAIL because the repository implementations do not exist yet.

- [ ] **Step 3: Implement the Drizzle repositories**

Implementation notes:

- Follow the existing repository style in:
  - `drizzle-ai-chat-session.repository.ts`
  - `drizzle-ai-chat-message.repository.ts`
- Keep repository methods narrow:
  - `save`
  - `findBySessionId`
  - `patchStatus`
  - `listRecentBySession`
  - `append`
  - `create`
  - `resolve`
- Do not add policy logic into repositories.

- [ ] **Step 4: Re-run the integration test**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure exec vitest run --config vitest.integration.config.ts packages/infrastructure/__tests__/integration/drizzle-ai-policy.repository.test.ts
```

Expected: PASS for repository persistence and patch behavior.

- [ ] **Step 5: Commit the new repositories**

```bash
git add packages/infrastructure/database/repositories packages/infrastructure/__tests__/integration/drizzle-ai-policy.repository.test.ts
git commit -m "feat: add ai policy engine repositories"
```

### Task 5: Implement context building, intent/risk resolution, and action planning services

**Files:**
- Create: `packages/application/src/services/policy-engine/context-builder.service.ts`
- Create: `packages/application/src/services/policy-engine/signal-resolver.service.ts`
- Create: `packages/application/src/services/policy-engine/intent-resolver.service.ts`
- Create: `packages/application/src/services/policy-engine/risk-resolver.service.ts`
- Create: `packages/application/src/services/policy-engine/action-planner.service.ts`
- Create: `packages/application/src/services/__tests__/policy-engine/context-builder.service.test.ts`
- Create: `packages/application/src/services/__tests__/policy-engine/intent-resolver.service.test.ts`
- Create: `packages/application/src/services/__tests__/policy-engine/risk-resolver.service.test.ts`
- Create: `packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts`

- [ ] **Step 1: Write the failing unit tests for context, intent, risk, and action planning**

```ts
it('resolves a follow-up "yes" to the active pending hospital recommendation offer', async () => {
  const decision = await intentResolver.resolve({
    userMessage: 'Yes, show me that option.',
    pendingOffer: { type: 'HOSPITAL_RECOMMENDATION', status: 'active' },
    recentMessages: [assistantAskedAboutRecommendation()],
  });

  expect(decision.resolvedIntent).toBe('ACCEPT_HOSPITAL_RECOMMENDATION');
});

it('overrides planning to SAFETY_HANDOFF when crisis signals are present', async () => {
  const risk = await riskResolver.resolve({
    userMessage: 'I want to hurt myself.',
    candidateSignals: { possibleRisk: 'CRISIS' },
  });

  expect(risk.riskLevel).toBe('CRISIS');
  expect(risk.overrideAction).toBe('SAFETY_HANDOFF');
});

it('prefers REQUEST_DOC_UPLOAD over SHOW_PACKAGE when reports are missing for a high-intent lead', async () => {
  const plan = planner.plan(buildPolicyContext({
    statusSnapshot: { docUploadStatus: 'NOT_STARTED', packageStatus: 'NOT_SHOWN' },
    resolvedIntent: 'ASK_FOR_RECOMMENDATION',
  }));

  expect(plan.nextAction).toBe('REQUEST_DOC_UPLOAD');
});
```

- [ ] **Step 2: Run the new unit tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/context-builder.service.test.ts src/services/__tests__/policy-engine/intent-resolver.service.test.ts src/services/__tests__/policy-engine/risk-resolver.service.test.ts src/services/__tests__/policy-engine/action-planner.service.test.ts
```

Expected: FAIL because the policy-engine services do not exist yet.

- [ ] **Step 3: Implement the core policy services**

Service responsibilities:

- `ContextBuilderService`
  - read session, profile, timeline, followups, and recent messages
- `SignalResolverService`
  - normalize Dify extraction into backend candidate signals
- `IntentResolverService`
  - handle history-aware resolution against pending offer/question and recent assistant prompts
- `RiskResolverService`
  - apply deterministic safety overrides before action planning
- `ActionPlannerService`
  - score candidate actions using status readiness, safety, fatigue, and business value

Keep v1 scoring deterministic:

- no LLM calls inside backend policy services
- use explicit reason codes
- return both `nextAction` and optional `secondaryAction`

- [ ] **Step 4: Re-run the unit tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/context-builder.service.test.ts src/services/__tests__/policy-engine/intent-resolver.service.test.ts src/services/__tests__/policy-engine/risk-resolver.service.test.ts src/services/__tests__/policy-engine/action-planner.service.test.ts
```

Expected: PASS for the core decision pipeline.

- [ ] **Step 5: Commit the policy core**

```bash
git add packages/application/src/services/policy-engine packages/application/src/services/__tests__/policy-engine
git commit -m "feat: add ai policy engine core services"
```

### Task 6: Implement recommendation, handoff, and writeback planning/execution

**Files:**
- Create: `packages/application/src/services/policy-engine/recommendation-policy.service.ts`
- Create: `packages/application/src/services/policy-engine/handoff-policy.service.ts`
- Create: `packages/application/src/services/policy-engine/writeback-planner.service.ts`
- Create: `packages/application/src/services/policy-engine/writeback-executor.service.ts`
- Create: `packages/application/src/services/__tests__/policy-engine/recommendation-policy.service.test.ts`
- Create: `packages/application/src/services/__tests__/policy-engine/writeback-executor.service.test.ts`

- [ ] **Step 1: Write failing tests for shortlist gating and writeback behavior**

```ts
it('returns a short authoritative shortlist with reason codes when eligibility is satisfied', async () => {
  const result = await recommendationPolicy.decide(buildPolicyContext({
    statusSnapshot: { recommendationStatus: 'NOT_SHOWN', riskLevel: 'LOW' },
    resolvedIntent: 'ASK_FOR_RECOMMENDATION',
  }));

  expect(result.shortlist.length).toBeLessThanOrEqual(3);
  expect(result.shortlist[0]?.reasonCodes.length).toBeGreaterThan(0);
});

it('writes timeline, session snapshot, shortlist audit, and followup in one backend-controlled pass', async () => {
  const result = await writebackExecutor.execute(buildWritebackInput({
    nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
    shortlist: [buildShortlistItem('hospital-1')],
  }));

  expect(result.timelineEventsWritten).toContain('HOSPITALS_RECOMMENDED');
  expect(result.statusUpdated.recommendationStatus).toBe('PRELIMINARY_SHOWN');
  expect(result.messageMetadata.shortlist?.[0]?.hospitalId).toBe('hospital-1');
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/recommendation-policy.service.test.ts src/services/__tests__/policy-engine/writeback-executor.service.test.ts
```

Expected: FAIL because recommendation/handoff/writeback services do not exist yet.

- [ ] **Step 3: Implement the recommendation, handoff, and writeback services**

Implementation rules:

- recommendation:
  - backend-authoritative shortlist only
  - keep shortlist length `1-3`
  - block recommendations for `CRISIS`, `HIGH_RISK`, or insufficient readiness
  - in Phase 1A, persist shortlist audit in `ai_chat_messages.shortlist` plus timeline payload; defer a dedicated recommendation-log table
- handoff:
  - support `SAFETY_ESCALATION`, `COMPLEX_CASE`, `HIGH_VALUE_LEAD`, `REQUESTED_HUMAN`, `TRUST_RECOVERY`
- writeback:
  - update session snapshot
  - patch profile summary only when confidence/rules allow
  - append timeline events
  - create followup triggers
  - create handoff rows
  - persist shortlist/reason-code audit onto assistant message rows and timeline payload

- [ ] **Step 4: Re-run the tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/recommendation-policy.service.test.ts src/services/__tests__/policy-engine/writeback-executor.service.test.ts
```

Expected: PASS for authoritative shortlist generation and writeback orchestration.

- [ ] **Step 5: Commit the policy decision tails**

```bash
git add packages/application/src/services/policy-engine/recommendation-policy.service.ts packages/application/src/services/policy-engine/handoff-policy.service.ts packages/application/src/services/policy-engine/writeback-planner.service.ts packages/application/src/services/policy-engine/writeback-executor.service.ts packages/application/src/services/__tests__/policy-engine/recommendation-policy.service.test.ts packages/application/src/services/__tests__/policy-engine/writeback-executor.service.test.ts
git commit -m "feat: add ai policy recommendation and writeback services"
```

## Chunk 3: API Wiring and Dify Orchestration

### Task 7: Add backend policy use cases and secure internal AI policy routes

**Files:**
- Create: `packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`
- Create: `packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- Create: `packages/application/src/use-cases/ai-policy/apply-ai-policy-writeback.use-case.ts`
- Modify: `apps/api/src/composition-root.ts`
- Modify: `apps/api/src/routes/internal.routes.ts`
- Modify: `apps/api/src/__tests__/internal.routes.test.ts`

- [ ] **Step 1: Add failing internal route tests for context/decide/writeback**

```ts
it('returns policy context through the shared envelope', async () => {
  const res = await app.request('/api/v2/internal/ai-policy/context', {
    method: 'POST',
    headers: validHeaders,
    body: JSON.stringify(validEnvelope),
  });

  expect(res.status).toBe(200);
  expect((await res.json()).ok).toBe(true);
});

it('rejects decide requests without internal secret', async () => {
  const res = await app.request('/api/v2/internal/ai-policy/decide', {
    method: 'POST',
    body: JSON.stringify(validEnvelope),
  });

  expect(res.status).toBe(401);
});

it('returns a writeback envelope and stays idempotent for the same writeback key', async () => {
  const body = {
    ...validEnvelope,
    payload: {
      assistant_message_id: 'assistant-1',
      idempotency_key: 'session-1:assistant-1:v1',
      policy_decision: { next_action: 'REQUEST_DOC_UPLOAD' },
      tool_results: [],
      final_response_metadata: {},
    },
  };

  const first = await app.request('/api/v2/internal/ai-policy/writeback', {
    method: 'POST',
    headers: validHeaders,
    body: JSON.stringify(body),
  });

  const second = await app.request('/api/v2/internal/ai-policy/writeback', {
    method: 'POST',
    headers: validHeaders,
    body: JSON.stringify(body),
  });

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(await first.json()).toEqual(await second.json());
});
```

- [ ] **Step 2: Run the route tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/internal.routes.test.ts
```

Expected: FAIL because the internal AI policy endpoints are not registered.

- [ ] **Step 3: Implement the use cases and internal routes**

Rules:

- keep policy logic in application services/use cases, not in Hono handlers
- reuse existing internal secret pattern from `/api/v2/internal/process-ai-sync-outbox`
- all three endpoints must use the shared envelope
- on unsupported `version`, return `400` with `ok: false`
- `writeback` must remain idempotent for the same `(session_id, assistant_message_id, writeback_version/idempotency_key)`

- [ ] **Step 4: Re-run the internal route tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/internal.routes.test.ts
```

Expected: PASS for auth, validation, and shared envelopes.

- [ ] **Step 5: Commit the internal policy API**

```bash
git add packages/application/src/use-cases/ai-policy apps/api/src/composition-root.ts apps/api/src/routes/internal.routes.ts apps/api/src/__tests__/internal.routes.test.ts
git commit -m "feat: add internal ai policy endpoints"
```

### Task 8: Rework public chatbot chat flow around backend-authoritative policy decisions

**Files:**
- Modify: `apps/api/src/routes/chatbot.routes.ts`
- Modify: `packages/infrastructure/services/dify-api-client.service.ts`
- Modify: `packages/infrastructure/__tests__/unit/dify-api-client.service.test.ts`
- Modify: `apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `apps/api/src/__tests__/chatbot.routes.integration.test.ts`

- [ ] **Step 1: Write failing public route tests for policy-backed chat behavior**

```ts
it('stores authoritative policy metadata on assistant messages while still returning the public response contract', async () => {
  const res = await app.request('/api/v2/chatbot/chat', {
    method: 'POST',
    body: JSON.stringify(validBody),
    headers: { 'Content-Type': 'application/json' },
  });

  const body = await res.json();
  expect(body.nextAction).toBe('REQUEST_DOCS');
  expect(body.topic).toBe('DOCUMENTS');
  expect(body.responseMode).toBe('grounded_plus_guidance');
});
```

- [ ] **Step 2: Run the public route and Dify client tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts src/__tests__/chatbot.routes.integration.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure exec vitest run __tests__/unit/dify-api-client.service.test.ts
```

Expected: FAIL because the public route still assumes Dify is the authoritative decision source.

- [ ] **Step 3: Rework `/api/v2/chatbot/chat` and the Dify client integration**

Implementation rules:

- keep session/dify conversation binding server-side only
- call Dify workflow with:
  - user message
  - session ID
  - hospital type
  - minimal current-session metadata
- parse richer Dify response fields:
  - `topic`
  - `secondaryAction`
  - `responseMode`
  - `reasonCodes`
  - `shortlist`
- store authoritative fields on `ai_chat_messages`
- preserve public API compatibility where reasonable:
  - `answer`
  - `intent`
  - `riskLevel`
  - `nextAction`
  - `citations`

- [ ] **Step 4: Re-run the public route and Dify client tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts src/__tests__/chatbot.routes.integration.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure exec vitest run __tests__/unit/dify-api-client.service.test.ts
```

Expected: PASS for policy-backed route behavior and Dify payload parsing.

- [ ] **Step 5: Commit the public orchestration refactor**

```bash
git add apps/api/src/routes/chatbot.routes.ts packages/infrastructure/services/dify-api-client.service.ts packages/infrastructure/__tests__/unit/dify-api-client.service.test.ts apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/chatbot.routes.integration.test.ts
git commit -m "feat: rework chatbot chat flow around policy engine"
```

### Task 9: Update the Dify workflow asset and tool contract docs for backend-authoritative orchestration

**Files:**
- Modify: `dify-config/medora-ai-chatbot-v1.dsl.yml`
- Modify: `docs/superpowers/specs/2026-03-28-medical-tourism-policy-engine-design.md`
- Test: manual import and preview checklist recorded in plan notes

- [ ] **Step 1: Add a failing checklist entry in the spec/notes for Dify tool orchestration**

Checklist items to capture:

- Dify calls `context`, `decide`, and `writeback` internal tools
- Dify only calls downstream retrieval tools listed in `allowed_tools`
- Dify never self-decides recommendation eligibility or handoff
- Dify final output remains strict JSON for the CRM backend/parser

- [ ] **Step 2: Update the DSL asset and related notes**

Required workflow structure:

- `User Input`
- `Lightweight Extraction`
- `Load CRM Context`
- `Backend Policy Decide`
- conditional branches for:
  - `search_faq`
  - `search_hospitals`
  - `get_hospital_details`
  - `list_packages`
  - `safety-only response`
- `Response Composer`
- `Backend Writeback`

- [ ] **Step 3: Validate the DSL file shape locally**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file("/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml"); puts "yaml ok"'
```

Expected: `yaml ok`

- [ ] **Step 4: Commit the Dify orchestration asset refresh**

```bash
git add dify-config/medora-ai-chatbot-v1.dsl.yml docs/superpowers/specs/2026-03-28-medical-tourism-policy-engine-design.md
git commit -m "chore: align Dify workflow with backend policy engine"
```

## Chunk 4: Verification, Evaluation, and Rollout Safety

### Task 10: Add end-to-end policy evaluation and regression fixtures

**Files:**
- Create: `packages/application/src/services/__tests__/policy-engine/fixtures/policy-eval.fixtures.ts`
- Create: `packages/application/src/services/__tests__/policy-engine/policy-evaluation.test.ts`
- Modify: `apps/api/src/__tests__/chatbot.routes.integration.test.ts`

- [ ] **Step 1: Write the failing evaluation suite for the core buckets**

```ts
it.each([
  ['FAQ grounded answer', buildFaqFixture()],
  ['history-aware yes/no follow-up', buildPendingOfferFixture()],
  ['hospital recommendation eligibility', buildRecommendationFixture()],
  ['request docs path', buildRequestDocsFixture()],
  ['trust recovery handoff', buildTrustRecoveryFixture()],
  ['crisis override', buildSafetyFixture()],
])('%s', async (_label, fixture) => {
  const result = await runPolicyFixture(fixture);
  expect(result.hardFail).toBe(false);
});
```

- [ ] **Step 2: Run the evaluation tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/policy-evaluation.test.ts
```

Expected: FAIL because the fixture runner and policy expectations are not yet encoded.

- [ ] **Step 3: Add the fixture runner and baseline regression cases**

Required buckets:

- `FAQ`
- `Hospital Recommendation`
- `History-aware Intent`
- `Risk / Safety`
- `Objection Handling`
- `Human Handoff`
- `Writeback`
- `Follow-up`
- `Failure / Recovery`

Required red-line assertions:

- no recommendation in crisis mode
- no handoff omission when user explicitly asks for a human
- no incorrect pending-offer resolution for vague affirmations
- no confirmed-fact writeback from unconfirmed inference
- malformed Dify extraction payload falls back to safe candidate-signal defaults
- malformed tool payload does not corrupt status truth
- `decide_next_action` timeout triggers safe fallback rather than self-deciding in Dify
- retrieval timeout falls back to safe apology/handoff path
- writeback failure after response generation is visible and retry-safe
- duplicate writeback retry remains idempotent
- zero-hospital shortlist produces a non-hallucinated fallback response
- handoff creation failure preserves user-safe messaging and retryable operator state

- [ ] **Step 4: Re-run the evaluation suite**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/policy-evaluation.test.ts
```

Expected: PASS for the baseline regression set.

- [ ] **Step 5: Commit the evaluation baseline**

```bash
git add packages/application/src/services/__tests__/policy-engine/fixtures/policy-eval.fixtures.ts packages/application/src/services/__tests__/policy-engine/policy-evaluation.test.ts apps/api/src/__tests__/chatbot.routes.integration.test.ts
git commit -m "test: add policy engine regression coverage"
```

### Task 11: Run full verification for compile, unit, integration, and DB-backed chatbot flows

**Files:**
- Modify: no code changes expected; update only if verification uncovers real defects
- Test: existing and newly added suites

- [ ] **Step 1: Run TypeScript verification across touched packages**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 --filter @medical-crm/domain exec tsc --noEmit
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 --filter @medical-crm/application exec tsc --noEmit
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 --filter @medical-crm/infrastructure exec tsc --noEmit
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 --filter @medical-crm/api exec tsc --noEmit
```

Expected: PASS in all four packages.

- [ ] **Step 2: Run unit and integration suites**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure exec vitest run --config vitest.integration.config.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts src/__tests__/chatbot.routes.integration.test.ts src/__tests__/internal.routes.test.ts
```

Expected: PASS with no skipped critical suites.

- [ ] **Step 2.1: Run the failure and recovery regression subset explicitly**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/policy-evaluation.test.ts --testNamePattern="Failure|Recovery|timeout|writeback|handoff"
```

Expected:

- malformed extraction/tool payload cases PASS with safe fallback assertions
- timeout cases PASS with no Dify self-decision behavior
- duplicate writeback case PASS with idempotent result
- zero-shortlist and handoff-failure cases PASS with explicit fallback behavior

- [ ] **Step 3: Run database migration verification**

Run:

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm db:migrate
```

Expected: PASS with `025_ai_policy_engine.sql` applied on the local database.

- [ ] **Step 4: Execute manual API smoke tests**

Run:

```bash
curl -i -c /tmp/chatbot.cookies \
  -X POST http://localhost:3000/api/v2/chatbot/chat \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"policy-manual-1","hospitalType":"COSMETIC","message":"I want to consult about rhinoplasty and may need help choosing a hospital."}'

curl -b /tmp/chatbot.cookies \
  "http://localhost:3000/api/v2/chatbot/history/policy-manual-1?limit=20"
```

Expected:

- `chat` returns `topic`, `nextAction`, `responseMode`, and policy-backed metadata
- `history` shows persisted assistant/user turns with authoritative fields

- [ ] **Step 5: Commit only if verification uncovered and fixed defects**

```bash
git add <only-files-fixed-during-verification>
git commit -m "fix: address policy engine verification issues"
```

If no fixes were needed, skip the commit and document the successful verification in the execution log.

### Task 12: Prepare rollout checklist and operator handoff notes

**Files:**
- Modify: `docs/superpowers/specs/2026-03-28-medical-tourism-policy-engine-design.md`
- Create: `docs/superpowers/plans/2026-03-28-medical-tourism-policy-engine-rollout-checklist.md`

- [ ] **Step 1: Write the rollout checklist draft**

Required sections:

- env vars to configure
- Dify DSL import steps
- dataset binding steps
- internal secret requirements
- migration order
- backfill expectations
- safety sanity checks
- evaluation suite commands
- manual QA prompts

- [ ] **Step 2: Validate that checklist steps map to real commands/files**

Run:

```bash
test -f /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml && echo "dsl exists"
test -f /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/migrations/025_ai_policy_engine.sql && echo "migration exists"
```

Expected:

- `dsl exists`
- `migration exists`

- [ ] **Step 3: Commit the rollout support docs**

```bash
git add docs/superpowers/specs/2026-03-28-medical-tourism-policy-engine-design.md docs/superpowers/plans/2026-03-28-medical-tourism-policy-engine-rollout-checklist.md
git commit -m "docs: add policy engine rollout checklist"
```
