# Chatbot V3 Supervisor-Led Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old Orchestrator-led v3 control plane with the new supervisor-led canonical contract while reusing the v3 route/runtime/tooling shell from an explicitly pinned implementation baseline.

**Architecture:** Keep the existing v3 API entrypoints, runtime shell, tool gateway, composer, observability, validation, and BFF routes **from the baseline branch/worktree selected in Chunk 0**. Replace the old control-plane truth with a new flow where `Supervisor` is the main LLM agent, `JourneyRuntimeAuthority` is the single final writer and allow/deny boundary, and `Supervisor`, `FaqAgent`, `RecommendationAgent`, and `RecordsAgent` are the LLM nodes. Delete old contracts that no longer match the 2026-04-16 canonical design instead of preserving dual truths.

**Tech Stack:** Node API on Lightsail, Hono routes, application-layer services in `packages/application`, typed internal tool gateway, OpenAI-backed FAQ/recommendation/records agents, shared validation, shared UI cards, admin/hospital BFF proxy routes, Vitest.

---

## File Structure

This plan reuses the v3 shell only after the execution baseline is explicitly pinned and validated.

### Reuse with major behavior changes

- Modify: `apps/api/src/routes/chatbot-v3.routes.ts`
  - Keep the public route and runtime wiring entrypoint
  - Rewire to supervisor-led flow
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
  - Keep the turn pipeline shell
  - Replace orchestrator-owned dispatch logic
- Modify: `apps/api/src/routes/chatbot-v3/agents.ts`
  - Keep agent class shell
  - Upgrade `RecommendationAgent` and `RecordsAgent` to LLM worker shape
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.ts`
  - Align response behavior to new primary journey and truth flags
- Modify: `apps/api/src/routes/chatbot-v3/observability.ts`
  - Keep event pipeline
  - Update node naming/metadata for the new control plane
- Modify: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
  - Replace suggestion-only semantics with main-agent output contract
- Delete or replace: `packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
  - Old dispatch-owning orchestrator contract must not survive as canonical behavior

### New core files

- Create: `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
  - Single final writer / allow-deny boundary
- Create: `packages/application/src/services/chatbot-v3/supervisor-registry.ts`
  - Supervisor-facing text registry
- Create: `packages/application/src/services/chatbot-v3/minimal-intake.types.ts`
  - Pre-chat intake seed contract
- Create: `apps/api/src/routes/chatbot-v3/recommendation-prompts.ts`
  - Recommendation agent prompt builder(s)
- Create: `apps/api/src/routes/chatbot-v3/records-prompts.ts`
  - Records agent prompt builder(s)
- Create: `apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`
  - Supervisor prompt text/contract builder

### Existing files likely to keep with moderate edits

- Modify: `apps/api/src/routes/chatbot-v3/faq-prompts.ts`
- Modify: `apps/api/src/routes/chatbot-v3/faq-llm-adapter.ts`
- Modify: `apps/api/src/routes/chatbot-v3/faq-route-adapter.ts`
- Modify: `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
- Modify: `packages/shared/ui/src/components/chatbot-v3-cards.tsx`
- Modify: `apps/admin/src/app/api/chatbot-v3/chat/route.ts`
- Modify: `apps/hospital/src/app/api/chatbot-v3/chat/route.ts`

### Delete old contract assumptions

- Delete old “Supervisor only suggests” truth from code and tests
- Delete old “Orchestrator owns dispatch” truth from code and tests
- Delete old debug-tag-only `taskPrompt` assumption
- Delete old phase-heavy control-plane assumptions that do not fit the 2026-04-16 canonical design

## Chunk 0: Baseline & Branching

### Task 0: Lock implementation baseline before any behavior change

**Why this exists:**

- the supervisor-led plan assumes a v3 runtime shell already exists
- `feature/phase-2bc` may contain docs but not the complete executable v3 shell
- implementation must not start from an implicit or missing baseline

**Required baseline declaration (must be written in the implementation PR description):**

- implementation baseline branch
- implementation worktree path
- baseline commit hash
- why this baseline is selected

Recommended default in this repository:

- branch: `feature/phase-2bc-chatbot-v3-exec`
- worktree: `medical-crm-v2/.worktrees/chatbot-v3-exec`
- reason: this line already contains `apps/api/src/routes/chatbot-v3.routes.ts`, `apps/api/src/routes/chatbot-v3/runtime.service.ts`, and `packages/application/src/services/chatbot-v3/*`

If the selected branch/worktree does not contain the complete v3 shell, stop and create/sync the baseline first. Do not treat `feature/phase-2bc` as the default execution baseline when those runtime files are absent.

- [ ] **Step 1: Validate baseline completeness**

Confirm these paths exist in the selected baseline:

- `apps/api/src/routes/chatbot-v3.routes.ts`
- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- `apps/api/src/routes/chatbot-v3/agents.ts`
- `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- `packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
- `packages/shared/validation/src/chatbot-v3/chat.schema.ts`

- [ ] **Step 2: Record baseline metadata**

Record branch/worktree/commit in the implementation PR body and in the first migration commit message footer.

- [ ] **Step 3: Add a baseline guard test or check**

Add one check that fails fast if v3 shell files are missing in CI for the execution branch.

## Chunk 1: Domain Contract Migration

### Task 0.1: Align canonical stage + truth contracts across type, validation, route, and persistence

**Files:**

- Modify: `packages/domain/src/enums/index.ts`
- Modify: `packages/domain/src/entities/ai-chat-session.entity.ts`
- Modify: `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
- Modify: `apps/api/src/routes/chatbot-v3.routes.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `packages/application/src/services/chatbot-v3/types.ts`
- Create or modify tests covering domain + validation + route stage parsing and snapshot contracts

- [ ] **Step 1: Write failing tests for canonical stage and truth shape**

Cover:

- `COLLECT_MINIMAL_MEDICAL_FACTS` is a valid stage in domain unions and validation schemas
- route/runtime stage parsing accepts the new stage and rejects invalid stages
- response contract supports the new primary journey order
- persisted snapshot contains canonical truth flags needed by supervisor-led flow

- [ ] **Step 2: Expand domain and validation contracts**

Must explicitly update:

- stage enum/union
- request/response schema where stage appears
- route shape assumptions derived from old 5-stage model

- [ ] **Step 3: Expand persisted status snapshot contract**

Must explicitly add and wire canonical truth flags (or an equivalent namespaced structure) for:

- minimal triage completion
- recommendation generated/selected
- consult completion
- handoff active
- process explained

No prompt-only truth flags are allowed without persisted/readable runtime backing.

- [ ] **Step 4: Define migration/backfill order**

Document and implement order:

1. extend read path with backward-compatible defaults
2. deploy write path for new fields
3. backfill existing sessions where needed
4. remove old fallback assumptions once reads are stable

- [ ] **Step 5: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/domain test
pnpm --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: PASS with canonical stage + persisted truth contract fully aligned.

## Chunk 2: Authority-Only Write Path

### Task 0.2: Remove route-side control-plane truth and move writes to structured authority outcomes

**Files:**

- Modify: `apps/api/src/routes/chatbot-v3.routes.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`

- [ ] **Step 1: Write failing tests for control-plane ownership**

Cover:

- route layer does not finalize journey stage progression
- route layer does not pre-decide dispatch agent
- authority output is the only source of final journey write + dispatch allow/deny
- FAQ/resource-only turns do not auto-advance the primary journey

- [ ] **Step 2: Remove or downgrade route-side heuristics**

Must list and handle each item explicitly:

- remove route-owned strong decision logic (for example `buildInitialSuggestion`, stage forcing, and fact forcing) as control-plane truth
- keep only bootstrap responsibilities (auth/session, request validation, intake seed extraction, trace/idempotency plumbing)
- move progression/dispatch decisions into supervisor + authority pipeline

- [ ] **Step 3: Convert truth writes to structured path signals**

Must replace brittle content-based writes with structured runtime signals:

- `process.explained` writes must be triggered by explicit process-explanation path outcome
- never gate truth write on assistant text equality
- make write intent explicit in authority/runtime result shape

- [ ] **Step 4: Delete stale tests encoding old truth**

Delete or rewrite tests that still assume:

- orchestrator-owned dispatch truth
- route-owned progression truth
- text-equality-triggered truth writes

- [ ] **Step 5: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.mounting.test.ts src/__tests__/chatbot-v3.observability.test.ts
```

Expected: PASS with single authority write path and no dual truth leakage.

## Chunk 3: Replace The Canonical Control Plane

### Task 1: Introduce the new core contracts

**Files:**
- Create: `packages/application/src/services/chatbot-v3/minimal-intake.types.ts`
- Create: `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
- Modify: `packages/application/src/services/chatbot-v3/types.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`

- [ ] **Step 1: Write the failing authority contract tests**

Cover:

- supervisor proposal can be allowed
- supervisor proposal can be denied
- authority is the final writer of journey state
- authority is the final decider for dispatch or deny
- new journey order starts with `COLLECT_MINIMAL_MEDICAL_FACTS`

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
```

Expected: FAIL because the new authority service and types do not exist yet.

- [ ] **Step 3: Add the new minimal intake and authority contracts**

Implement:

- minimal intake seed type
- supervisor proposal type
- final authority decision type
- primary journey order constants for the supervisor-led model

- [ ] **Step 4: Implement the smallest possible authority service**

Rules to encode:

- minimal triage must happen first
- recommendation starts only after minimal triage completion
- recommendation may repeat
- explain process is normally post-recommendation and single-show by default
- collect medical inputs may repeat
- online consult is required
- handoff is escalation

- [ ] **Step 5: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/services/chatbot-v3/minimal-intake.types.ts \
  packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts \
  packages/application/src/services/chatbot-v3/types.ts \
  packages/application/src/index.ts \
  packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
git commit -m "feat(chatbot-v3): add journey runtime authority contracts"
```

### Task 2: Delete the old dispatch-owning orchestrator truth

**Files:**
- Delete or replace: `packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts`
- Modify: any imports in `packages/application/src/index.ts`

- [ ] **Step 1: Identify all remaining old orchestrator dispatch assumptions**

Search for:

- `dispatchAgent: resolveDispatchAgent`
- `dispatchSource: 'orchestrator'`
- `OrchestratorV3Service`

- [ ] **Step 2: Remove or replace the old service**

Do not keep the old dispatch-owning contract alive in parallel.

- [ ] **Step 3: Replace stale tests**

Remove tests that lock in the old truth and replace them with authority-service tests where needed.

- [ ] **Step 4: Run application tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/*.test.ts
```

Expected: PASS after old truth is removed.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3 \
  packages/application/src/services/__tests__/chatbot-v3 \
  packages/application/src/index.ts
git commit -m "refactor(chatbot-v3): remove old orchestrator-led dispatch contract"
```

## Chunk 4: Upgrade Supervisor Into The Main Agent

### Task 3: Replace suggestion-only Supervisor with the new output contract

**Files:**
- Modify: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- Create: `packages/application/src/services/chatbot-v3/supervisor-registry.ts`
- Create: `apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- Modify: runtime-facing summary ownership support required by the supervisor contract

- [ ] **Step 1: Write failing supervisor contract tests**

Cover:

- output includes `intent`, `suggestedStage`, `dispatchAgent`, `reason`, `task`
- Supervisor is treated as an LLM node, not a heuristic-only classifier
- supervisor defaults to minimal context
- supervisor can use domain-specific read hints
- no large default facts bundle is required
- conversation summary contract is explicit and stable

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts
```

Expected: FAIL because Supervisor still uses the old suggestion-only contract.

- [ ] **Step 3: Add Supervisor-facing registry**

Implement the fixed three-line template:

- `When to use`
- `Task style`
- `Send these facts`

Do not include low-level tool details in the registry.

- [ ] **Step 4: Define the conversation summary contract**

Make the summary contract explicit:

- owner/producer
- refresh trigger
- maximum size discipline
- freshness requirement
- whether it is persisted or recomputed

Do not leave summary behavior implicit.

This is a required runtime contract, not an optional polish item.

- [ ] **Step 5: Implement the new Supervisor output contract**

Return:

- `intent`
- `suggestedStage`
- `dispatchAgent`
- `reason`
- `task`

The `task` must contain:

- one-sentence goal
- latest user message
- only the necessary facts for the target agent

- [ ] **Step 6: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/services/chatbot-v3/supervisor.service.ts \
  packages/application/src/services/chatbot-v3/supervisor-registry.ts \
  apps/api/src/routes/chatbot-v3/supervisor-prompt.ts \
  packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts
git commit -m "feat(chatbot-v3): upgrade supervisor to main-agent contract"
```

### Task 4: Add domain-specific read model for Supervisor

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/routes/chatbot-v3/tool-gateway.ts`
- Modify: `apps/api/src/routes/chatbot-v3.routes.ts`
- Modify or create: runtime-owned conversation summary support used by the Supervisor
- Modify: tests in `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Modify or create: tests that prove summary refresh and replay stability

- [ ] **Step 1: Write failing runtime tests**

Cover:

- Supervisor starts with minimal context
- Supervisor can request `records.status`
- Supervisor can request `recommendation.status`
- Supervisor can request `consult.status`
- Supervisor can request `handoff.status`
- runtime does not inject a giant default facts bundle
- runtime produces the conversation summary after committed turns
- replay/reload uses a stable conversation summary strategy

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: FAIL because runtime still follows the old input model.

- [ ] **Step 3: Implement domain-specific read support**

Keep it minimal:

- prefer one domain query
- allow a second only when needed
- do not create a new heavy multi-query planner

- [ ] **Step 4: Implement required conversation summary ownership in runtime**

Implement one clear runtime-owned summary path:

- choose persisted summary or deterministic recompute
- make the choice explicit in code
- refresh only after the committed final assistant turn
- keep the summary compact
- ensure replay/reload follows the same stable rule
- do not let summary become a hidden large-context bundle

- [ ] **Step 5: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/routes/chatbot-v3/tool-gateway.ts \
  apps/api/src/routes/chatbot-v3.routes.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts
git commit -m "feat(chatbot-v3): add supervisor domain-status reads"
```

## Chunk 5: Rebuild The Runtime Around Supervisor Proposals

### Task 5: Rewrite the turn pipeline to supervisor-proposes / authority-finalizes

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/routes/chatbot-v3/observability.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.observability.test.ts`

- [ ] **Step 1: Write failing runtime flow tests**

Cover:

- Supervisor proposes dispatch agent
- authority finalizes allow or deny
- runtime executes dispatch only if finalized
- final journey state is written only after authority finalization

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts src/__tests__/chatbot-v3.observability.test.ts
```

Expected: FAIL because runtime still encodes the old control plane.

- [ ] **Step 3: Replace old dispatch flow**

Remove:

- orchestrator-owned dispatch assumptions
- old debug-tag task prompt format

Add:

- supervisor proposal object
- authority final decision object
- agent execution from finalized decision only

- [ ] **Step 4: Update observability metadata**

Keep:

- `traceId`
- node events
- turn summary

Update event semantics to reflect:

- supervisor
- journey runtime authority
- subagent
- tool

- [ ] **Step 5: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts src/__tests__/chatbot-v3.observability.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/routes/chatbot-v3/observability.ts \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts \
  apps/api/src/__tests__/chatbot-v3.observability.test.ts
git commit -m "refactor(chatbot-v3): rebuild runtime around supervisor-led flow"
```

## Chunk 6: Implement The New Journey Rules

### Task 6: Encode the new primary journey and progression rules

**Files:**
- Modify: `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`

- [ ] **Step 1: Write failing authority tests for the new journey**

Cover:

- journey begins with `COLLECT_MINIMAL_MEDICAL_FACTS`
- recommendation requires minimal triage completion
- recommendation may repeat
- explain process is normally once
- collect medical inputs may repeat
- online consult is required
- human handoff is escalation
- FAQ/resource-only turns do not auto-advance the primary journey

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
```

Expected: FAIL until new rules are fully encoded.

- [ ] **Step 3: Implement the new rule set**

Keep it text-driven or small-config-driven.

Do not reintroduce the old phase-heavy model.

- [ ] **Step 4: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
git commit -m "feat(chatbot-v3): add supervisor-led journey rules"
```

## Chunk 7: LLM-ify Records And Recommendation

### Task 7: Turn RecordsAgent into the minimal medical triage + collection worker

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/agents.ts`
- Create: `apps/api/src/routes/chatbot-v3/records-prompts.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Write failing RecordsAgent tests**

Cover:

- initial minimal triage path asks the 3 key medical questions
- RecordsAgent can continue when user answers only 2
- RecordsAgent can continue when answers are insufficient
- RecordsAgent exposes only the truth flag the Supervisor needs:
  - `records.minimal_triage.complete`

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: FAIL because RecordsAgent is still mostly deterministic and not triage-led.

- [ ] **Step 3: Implement minimal LLM RecordsAgent contract**

It should:

- generate the 3 key questions
- ask again if answers are incomplete or insufficient
- update records-domain truth
- keep internal detail out of the Supervisor-visible contract

- [ ] **Step 4: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/agents.ts \
  apps/api/src/routes/chatbot-v3/records-prompts.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts
git commit -m "feat(chatbot-v3): add records triage worker contract"
```

### Task 8: Turn RecommendationAgent into a real LLM worker

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/agents.ts`
- Create: `apps/api/src/routes/chatbot-v3/recommendation-prompts.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: tests in `apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Write failing RecommendationAgent tests**

Cover:

- recommendation is the first true recommendation stage after minimal triage
- recommendation generates real recommendation results
- recommendation may repeat
- recommendation can be revisited later
- recommendation can explain or compare

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: FAIL until RecommendationAgent is upgraded.

- [ ] **Step 3: Implement minimal RecommendationAgent worker contract**

Keep output small and grounded.

Do not introduce consult, handoff, or records mutations into this agent.

- [ ] **Step 4: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/agents.ts \
  apps/api/src/routes/chatbot-v3/recommendation-prompts.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts
git commit -m "feat(chatbot-v3): add recommendation worker contract"
```

## Chunk 8: Align FAQ, Composer, BFF, And Tests To The New Canonical Truth

### Task 9: Keep FAQ and process explanation aligned with the new contract

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/faq-prompts.ts`
- Modify: `apps/api/src/routes/chatbot-v3/faq-llm-adapter.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.ts`
- Modify: tests in `apps/api/src/routes/chatbot-v3/response-composer.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- process explanation is handled through FAQ behavior
- `process.explained` is written only when the explicit process-explanation path is actually shown
- FAQ-only turns do not auto-advance the primary journey

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts src/routes/chatbot-v3/faq-llm-adapter.test.ts
```

Expected: FAIL until process explanation and FAQ contracts are aligned.

- [ ] **Step 3: Implement minimal fixes**

Keep:

- grounded FAQ strategy
- explicit process explanation truth write boundary

Remove:

- any path where generic FAQ handling can accidentally flip process completion

- [ ] **Step 4: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts src/routes/chatbot-v3/faq-llm-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/faq-prompts.ts \
  apps/api/src/routes/chatbot-v3/faq-llm-adapter.ts \
  apps/api/src/routes/chatbot-v3/response-composer.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts
git commit -m "fix(chatbot-v3): align faq and process explanation contract"
```

### Task 10: Align validation, BFF, UI, and delete stale tests

**Files:**
- Modify: `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
- Modify: `packages/shared/ui/src/components/chatbot-v3-cards.tsx`
- Modify: `apps/admin/src/app/api/chatbot-v3/chat/route.ts`
- Modify: `apps/hospital/src/app/api/chatbot-v3/chat/route.ts`
- Modify: relevant tests across validation/UI/admin/hospital/api

- [ ] **Step 1: Write failing tests for the new external shape**

Cover:

- response contract still stays clean
- cards match the new primary journey
- BFF routes remain shape-preserving

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts
pnpm --filter @medical-crm/ui test -- src/components/chatbot-v3-cards.test.tsx
pnpm --filter @medical-crm/admin test -- src/app/api/chatbot-v3/chat/route.test.ts
pnpm --filter @medical-crm/hospital test -- src/app/api/chatbot-v3/chat/route.test.ts
```

Expected: FAIL where old control-plane or old journey assumptions remain.

- [ ] **Step 3: Remove stale tests and implement the new shape**

Delete tests that still encode:

- old orchestrator-led dispatch truth
- old debug-tag task assumptions
- old journey order assumptions

- [ ] **Step 4: Re-run tests**

Run:

```bash
pnpm --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts
pnpm --filter @medical-crm/ui test -- src/components/chatbot-v3-cards.test.tsx
pnpm --filter @medical-crm/admin test -- src/app/api/chatbot-v3/chat/route.test.ts
pnpm --filter @medical-crm/hospital test -- src/app/api/chatbot-v3/chat/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/validation/src/chatbot-v3/chat.schema.ts \
  packages/shared/ui/src/components/chatbot-v3-cards.tsx \
  apps/admin/src/app/api/chatbot-v3/chat/route.ts \
  apps/hospital/src/app/api/chatbot-v3/chat/route.ts \
  packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts \
  packages/shared/ui/src/components/chatbot-v3-cards.test.tsx \
  apps/admin/src/app/api/chatbot-v3/chat/route.test.ts \
  apps/hospital/src/app/api/chatbot-v3/chat/route.test.ts
git commit -m "refactor(chatbot-v3): align external contracts to supervisor-led flow"
```

## Execution Notes

- This plan is intentionally based on the 2026-04-16 canonical contract, not the 2026-04-15 control-plane model.
- Reuse existing v3 infrastructure aggressively, but delete old conflicting truths instead of carrying them forward.
- Keep contracts small.
- Keep prompt ownership clear.
- Keep `JourneyRuntimeAuthority` as the single final writer.

Plan complete and saved to `docs/superpowers/plans/2026-04-16-chatbot-v3-supervisor-led-implementation.md`. Ready to execute?
