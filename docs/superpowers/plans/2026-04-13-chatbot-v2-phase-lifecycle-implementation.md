# Chatbot V2 Phase Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the new `pre / active / post` lifecycle so `chatbot-v2` behaves like a guided journey with FAQ overlay, dismiss-to-post confirmation, and automatic bridging into the next stage.

**Architecture:** Keep `journeySnapshot` as the primary conversational state and minimal truth as supporting business facts. Rework orchestration so `pre` waits for consent, `active` executes the current step while allowing FAQ overlay, and `post` confirms completion or dismissal before automatically bridging into the next stage's `pre`.

**Tech Stack:** TypeScript, Vitest, Dify DSL, Hono API routes, application-layer orchestrator services

---

## File Map

**Primary implementation files**
- Modify: `packages/application/src/services/chatbot-v2/types.ts`
  - expand transition decisions and stage-copy structure
- Modify: `packages/application/src/services/chatbot-v2/journey-engine.service.ts`
  - implement the revised snapshot transitions
- Modify: `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
  - implement `pre / active / post` semantics, FAQ overlay behavior, explicit consent gates, dismiss-to-post flow, and automatic bridge rules
- Modify: `packages/application/src/services/chatbot-v2/stage-copy-registry.service.ts`
  - upgrade stage copy from thin sentence registry to lifecycle-aware canonical copy for promotion, action reminder, and post confirmation
- Modify: `apps/api/src/routes/chatbot-v2-context.ts`
  - align `preTurn` and `postTurn` behavior with the new lifecycle and automatic post-to-next-pre bridge
- Modify: `docs/analysis/2026-04-12-chatbot-v2-orchestrator-implementation-detail.md`
  - update documentation to reflect the actual implementation

**Primary tests**
- Modify: `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v2/journey-engine.service.test.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v2/stage-copy-registry.service.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v2-context.test.ts`
- Modify: `apps/api/src/__tests__/chatbot.routes.test.ts`

**Optional verification notes**
- Update or add: `docs/analysis/2026-04-13-chatbot-v2-complex-live-session-report.md` only if we need a new report after implementation

## Chunk 1: Lifecycle Types And Stage Copy

### Task 1: Expand lifecycle types for the new phase model

**Files:**
- Modify: `packages/application/src/services/chatbot-v2/types.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v2/journey-engine.service.test.ts`

- [ ] **Step 1: Write the failing test for lifecycle transition decisions**

Add or update tests so they assert the codebase supports:
- `EXPLAIN_PROCESS.pre -> EXPLAIN_PROCESS.active`
- `EXPLAIN_PROCESS.active -> COLLECT_MEDICAL_INPUTS.pre`
- dismiss-driven `COLLECT_MEDICAL_INPUTS.post`
- dismiss-driven `RECOMMENDATION.post`

- [ ] **Step 2: Run the journey engine test to verify it fails**

Run:

```bash
pnpm --filter @medical-crm/application test src/services/__tests__/chatbot-v2/journey-engine.service.test.ts
```

Expected:
- FAIL because the current transition decision set does not yet express the new lifecycle clearly enough

- [ ] **Step 3: Update `types.ts` with the minimal transition surface**

Implement only the decisions needed by the spec:

```ts
export type JourneyTransitionDecision =
  | { type: 'ENTER_EXPLAIN_PROCESS_ACTIVE' }
  | { type: 'ENTER_COLLECT_MEDICAL_INPUTS_PRE' }
  | { type: 'ENTER_COLLECT_MEDICAL_INPUTS_ACTIVE' }
  | { type: 'ENTER_COLLECT_MEDICAL_INPUTS_POST' }
  | { type: 'ENTER_RECOMMENDATION_PRE' }
  | { type: 'ENTER_RECOMMENDATION_ACTIVE' }
  | { type: 'ENTER_RECOMMENDATION_POST' }
  | { type: 'ENTER_ONLINE_CONSULT_PRE' }
  | { type: 'ENTER_ONLINE_CONSULT_ACTIVE' }
  | { type: 'ENTER_ONLINE_CONSULT_POST' }
  | { type: 'ENTER_HUMAN_HANDOFF_PRE' }
  | { type: 'ENTER_HUMAN_HANDOFF_ACTIVE' }
  | { type: 'ENTER_HUMAN_HANDOFF_POST' };
```

Do not reintroduce `deriveSnapshot()`.

- [ ] **Step 4: Run the journey engine test again**

Run:

```bash
pnpm --filter @medical-crm/application test src/services/__tests__/chatbot-v2/journey-engine.service.test.ts
```

Expected:
- PASS for the updated transition type coverage

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v2/types.ts \
  packages/application/src/services/__tests__/chatbot-v2/journey-engine.service.test.ts
git commit -m "Refine chatbot v2 lifecycle transition types"
```

### Task 2: Upgrade stage copy from thin text to lifecycle guidance

**Files:**
- Modify: `packages/application/src/services/chatbot-v2/stage-copy-registry.service.ts`
- Modify: `packages/application/src/services/chatbot-v2/types.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v2/stage-copy-registry.service.test.ts`

- [ ] **Step 1: Write the failing stage-copy tests**

Add tests that require:
- `EXPLAIN_PROCESS.pre` to include service-introduction + invitation language
- `EXPLAIN_PROCESS.active` to include process-explanation + automatic bridge intent
- `COLLECT_MEDICAL_INPUTS.post` to support both submitted and dismissed confirmation language
- `ONLINE_CONSULT.pre` to explicitly mark the phase as required

- [ ] **Step 2: Run the stage-copy tests to verify they fail**

Run:

```bash
pnpm --filter @medical-crm/application test src/services/__tests__/chatbot-v2/stage-copy-registry.service.test.ts
```

Expected:
- FAIL because the registry currently only returns a single `referenceText`

- [ ] **Step 3: Implement minimal structured stage copy**

Refine the type and service to support lifecycle-friendly content without overdesigning:

```ts
export interface StageCopyReference {
  stage: ChatJourneyStage;
  phase: ChatJourneyPhase;
  referenceText: string;
}
```

Keep the contract stable for now, but make `referenceText` strong enough to carry:
- promotion language in `pre`
- action reminder in `active`
- completion vs dismissal confirmation in `post`

Use deterministic local copy only. Do not add hospital-context enrichment in this chunk.

- [ ] **Step 4: Run the stage-copy tests again**

Run:

```bash
pnpm --filter @medical-crm/application test src/services/__tests__/chatbot-v2/stage-copy-registry.service.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v2/stage-copy-registry.service.ts \
  packages/application/src/services/chatbot-v2/types.ts \
  packages/application/src/services/__tests__/chatbot-v2/stage-copy-registry.service.test.ts
git commit -m "Strengthen chatbot v2 stage copy lifecycle text"
```

## Chunk 2: Orchestrator And Journey Engine Semantics

### Task 3: Make `EXPLAIN_PROCESS.pre / active` behave like the opening gate

**Files:**
- Modify: `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
- Modify: `packages/application/src/services/chatbot-v2/journey-engine.service.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`

- [ ] **Step 1: Write failing tests for the explain gate**

Add tests that cover:
- discovery FAQ keeps the system in `EXPLAIN_PROCESS.pre`
- explicit agreement moves `EXPLAIN_PROCESS.pre -> EXPLAIN_PROCESS.active`
- `EXPLAIN_PROCESS.active` automatically bridges to `COLLECT_MEDICAL_INPUTS.pre`
- later repeated process explanation while already beyond `EXPLAIN_PROCESS` is informational only

- [ ] **Step 2: Run the orchestrator test to verify it fails**

Run:

```bash
pnpm --filter @medical-crm/application test src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts
```

Expected:
- FAIL because the current orchestrator still uses the older explain gate behavior

- [ ] **Step 3: Implement minimal explain lifecycle logic**

Update orchestration rules so that:
- `EXPLAIN_PROCESS.pre`
  - FAQ stays in `pre`
  - only explicit agreement enters `active`
- `EXPLAIN_PROCESS.active`
  - serves as the one-turn process explanation phase
  - post-turn auto-bridge moves to `COLLECT_MEDICAL_INPUTS.pre`
- later `process_explanation`
  - does not rewind
  - does not progression-push

- [ ] **Step 4: Run the orchestrator tests again**

Run:

```bash
pnpm --filter @medical-crm/application test src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts
```

Expected:
- PASS for explain gate semantics

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts \
  packages/application/src/services/chatbot-v2/journey-engine.service.ts \
  packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts
git commit -m "Implement chatbot v2 explain lifecycle gate"
```

### Task 4: Implement `pre / active / post` semantics for collect, recommendation, consult, and handoff

**Files:**
- Modify: `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
- Modify: `packages/application/src/services/chatbot-v2/journey-engine.service.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v2/journey-engine.service.test.ts`

- [ ] **Step 1: Write failing tests for phase behavior**

Add tests covering:
- `X.pre` waits for explicit agreement
- FAQ in `X.pre` answers and stays in `X.pre`
- FAQ in `X.active` answers and stays in `X.active`
- submit enters `X.post`
- dismiss also enters `X.post` for collect and recommendation
- `ONLINE_CONSULT.active` cannot dismiss
- `HUMAN_HANDOFF.pre -> active -> post` semantics remain consistent

- [ ] **Step 2: Run the orchestrator and journey engine tests to verify they fail**

Run:

```bash
pnpm --filter @medical-crm/application test \
  src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts \
  src/services/__tests__/chatbot-v2/journey-engine.service.test.ts
```

Expected:
- FAIL on the new `pre / active / post` semantics

- [ ] **Step 3: Implement the lifecycle rules**

Implement only the behavior in the approved spec:
- `pre` needs user agreement
- `active` tolerates FAQ overlay without changing phase
- submit and dismiss enter `post`
- `post` is the confirmation layer
- `ONLINE_CONSULT` cannot dismiss

Do not add new truth fields such as `processExplained`.

- [ ] **Step 4: Run the orchestrator and journey engine tests again**

Run:

```bash
pnpm --filter @medical-crm/application test \
  src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts \
  src/services/__tests__/chatbot-v2/journey-engine.service.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts \
  packages/application/src/services/chatbot-v2/journey-engine.service.ts \
  packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts \
  packages/application/src/services/__tests__/chatbot-v2/journey-engine.service.test.ts
git commit -m "Implement chatbot v2 phase lifecycle orchestration"
```

## Chunk 3: Turn Context And Automatic Post Bridging

### Task 5: Align `preTurn` and `postTurn` with the new lifecycle

**Files:**
- Modify: `apps/api/src/routes/chatbot-v2-context.ts`
- Test: `apps/api/src/__tests__/chatbot-v2-context.test.ts`

- [ ] **Step 1: Write failing tests for turn-context lifecycle behavior**

Add tests covering:
- starter envelope begins at `EXPLAIN_PROCESS.pre`
- `EXPLAIN_PROCESS.active` post-turn auto-bridges to `COLLECT_MEDICAL_INPUTS.pre`
- `COLLECT_MEDICAL_INPUTS.post` auto-bridges to `RECOMMENDATION.pre`
- `RECOMMENDATION.post` auto-bridges to `ONLINE_CONSULT.pre`
- FAQ overlay does not corrupt the lifecycle bridge

- [ ] **Step 2: Run the context tests to verify they fail**

Run:

```bash
pnpm --filter @medical-crm/api test src/__tests__/chatbot-v2-context.test.ts
```

Expected:
- FAIL because the current `preTurn/postTurn` builder still reflects the older lifecycle

- [ ] **Step 3: Implement minimal `preTurn/postTurn` alignment**

Update:
- `buildChatbotV2StarterEnvelope(...)`
- `buildChatbotV2TurnContext(...)`
- `buildChatbotV2PostTurnContext(...)`

So that:
- `preTurn` reflects the current stage-phase gate correctly
- `postTurn` owns automatic bridge behavior
- FAQ overlay does not accidentally trigger duplicate progression

- [ ] **Step 4: Run the context tests again**

Run:

```bash
pnpm --filter @medical-crm/api test src/__tests__/chatbot-v2-context.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v2-context.ts \
  apps/api/src/__tests__/chatbot-v2-context.test.ts
git commit -m "Align chatbot v2 turn context with phase lifecycle"
```

### Task 6: Protect route-level behavior with regression tests

**Files:**
- Modify: `apps/api/src/__tests__/chatbot.routes.test.ts`

- [ ] **Step 1: Write failing route tests for lifecycle regression paths**

Add route-level tests for:
- discovery FAQ in `EXPLAIN_PROCESS.pre`
- consent into `EXPLAIN_PROCESS.active`
- automatic bridge into `COLLECT_MEDICAL_INPUTS.pre`
- FAQ in `COLLECT_MEDICAL_INPUTS.pre`
- dismiss -> `COLLECT_MEDICAL_INPUTS.post`
- post -> `RECOMMENDATION.pre`

- [ ] **Step 2: Run the route tests to verify they fail**

Run:

```bash
pnpm --filter @medical-crm/api test src/__tests__/chatbot.routes.test.ts
```

Expected:
- FAIL on the newly added lifecycle expectations

- [ ] **Step 3: Make the minimal route-level compatibility adjustments**

Only fix route-specific serialization or metadata persistence issues exposed by the new tests.

Do not move orchestration logic into the route.

- [ ] **Step 4: Run the route tests again**

Run:

```bash
pnpm --filter @medical-crm/api test src/__tests__/chatbot.routes.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/__tests__/chatbot.routes.test.ts
git commit -m "Add chatbot v2 phase lifecycle route regressions"
```

## Chunk 4: Documentation, Verification, And Live Regression

### Task 7: Update implementation detail documentation

**Files:**
- Modify: `docs/analysis/2026-04-12-chatbot-v2-orchestrator-implementation-detail.md`

- [ ] **Step 1: Rewrite the implementation detail note to match the actual lifecycle**

Update the document so it reflects:
- `EXPLAIN_PROCESS.pre / active`
- FAQ overlay in `pre / active / post`
- dismiss entering `post`
- automatic bridge from `post` to the next `pre`

- [ ] **Step 2: Review the document against the spec**

Check that the doc does not describe:
- the old explain gate
- direct dismiss-to-next-pre without `post`
- the old process-explanation wording

- [ ] **Step 3: Commit**

```bash
git add docs/analysis/2026-04-12-chatbot-v2-orchestrator-implementation-detail.md
git commit -m "Update chatbot v2 lifecycle implementation notes"
```

### Task 8: Run the full targeted verification suite

**Files:**
- No code changes expected

- [ ] **Step 1: Run application targeted tests**

```bash
pnpm --filter @medical-crm/application test \
  src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts \
  src/services/__tests__/chatbot-v2/journey-engine.service.test.ts \
  src/services/__tests__/chatbot-v2/stage-copy-registry.service.test.ts
```

Expected:
- PASS

- [ ] **Step 2: Run API targeted tests**

```bash
pnpm --filter @medical-crm/api test \
  src/__tests__/chatbot-v2-context.test.ts \
  src/__tests__/chatbot.routes.test.ts \
  src/__tests__/dify-workflow-v2.contract.test.ts
```

Expected:
- PASS

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @medical-crm/application typecheck
pnpm --filter @medical-crm/api typecheck
```

Expected:
- PASS

- [ ] **Step 4: Commit any final plan-aligned fixes**

```bash
git status --short
git add -A
git commit -m "Finalize chatbot v2 phase lifecycle implementation"
```

### Task 9: Live regression after deployment

**Files:**
- Optionally add/update: `docs/analysis/2026-04-13-chatbot-v2-complex-live-session-report.md`

- [ ] **Step 1: Deploy CRM changes**

Use the existing CRM v2 deployment flow for the current branch.

- [ ] **Step 2: Re-publish the composer DSL if the lifecycle text or parser contract changed**

File:

```text
dify-config/medora-ai-chatbot-v2.dsl.yml
```

- [ ] **Step 3: Run the complex live session matrix**

Run these scenarios:
- `What do you do?` -> stays `EXPLAIN_PROCESS.pre`
- discovery FAQ -> stays `EXPLAIN_PROCESS.pre` and ends with the process invitation
- explicit agreement -> enters `EXPLAIN_PROCESS.active`
- process explanation turn -> auto-bridges to `COLLECT_MEDICAL_INPUTS.pre`
- FAQ in `COLLECT_MEDICAL_INPUTS.pre` -> stays there and ends with intake promotion
- explicit intake agreement -> enters `COLLECT_MEDICAL_INPUTS.active`
- dismiss intake -> `COLLECT_MEDICAL_INPUTS.post` -> auto-bridge to `RECOMMENDATION.pre`
- dismiss recommendation -> `RECOMMENDATION.post` -> auto-bridge to `ONLINE_CONSULT.pre`
- later process explanation while already in a later stage -> informational only
- `ONLINE_CONSULT` cannot dismiss

- [ ] **Step 4: Record the final live results**

Write or update a short analysis note with:
- passes
- remaining issues
- the exact turn where any live drift begins

