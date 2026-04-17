# Chatbot V3 Supervisor-Led Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-value remaining supervisor-led maturity gaps that still hurt replay/debuggability, semantic regression detection, and user recovery quality in `chatbot-v3`.

**Architecture:** Keep the 2026-04-16 supervisor-led control plane intact. Do not reopen orchestrator-led dual truths. Add targeted hardening around replay/debug lineage, eval fixtures, and degraded/action-loop response quality while reusing the current route/runtime/worker shells.

**Tech Stack:** TypeScript, Vitest, Hono route runtime, current `chatbot-v3` application/domain contracts, existing worker adapters and observability emitters.

---

## Scope

This plan intentionally focuses on the highest-value remaining follow-ups identified in:

- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec/docs/analysis/2026-04-15-chatbot-v3-post-plan-remaining-gaps.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-16-chatbot-v3-supervisor-led-contract-design.md`

It does **not** attempt another control-plane rewrite.

It does **not** attempt to remove all route/business side effects in this batch.

It does:

- make replay/debug output more explanatory
- add regression fixtures for semantically fragile supervisor/FAQ/degraded paths
- make degraded response guidance more failure-aware
- make card action support more explicit and testable

## File Map

### Existing files to modify

- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
  - Add replay/debug lineage fields for authority decisions, supervisor domain reads, and bootstrap overrides.
- `apps/api/src/routes/chatbot-v3/response-composer.ts`
  - Make degraded user guidance family-specific and keep runtime debug rendering aligned with the new lineage fields.
- `apps/api/src/routes/chatbot-v3/observability.ts`
  - Add any missing event/debug payload fields needed for replay lineage without breaking current consumers.
- `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
  - Lock runtime replay/debug lineage behavior end-to-end.
- `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
  - Lock live-path degraded messaging and action-loop behavior.
- `apps/api/src/__tests__/chatbot-v3.observability.test.ts`
  - Verify emitted event shapes for the new replay lineage fields.
- `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
  - Add failure-family degraded guidance coverage.
- `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
  - Add regression fixtures for semantically fragile supervisor decisions.
- `apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts`
  - Add FAQ fallback/degraded evaluation fixtures.
- `docs/analysis/2026-04-15-chatbot-v3-post-plan-remaining-gaps.md`
  - Keep aligned with what actually lands from this plan.

### New files to create

- `packages/application/src/services/__tests__/chatbot-v3/fixtures/supervisor-eval.fixtures.ts`
  - Stable supervisor eval-style fixture cases for ambiguous confirmations, mixed intent, repeat/revisit, and explain requests.
- `apps/api/src/routes/chatbot-v3/__fixtures__/degraded-path.fixtures.ts`
  - Shared degraded-path fixture builders for FAQ/recommendation/consult/handoff failure families.
- `docs/analysis/2026-04-17-chatbot-v3-card-action-closure-checklist.md`
  - Explicit card-by-card action closure audit so the remaining maturity gap is visible and testable.

---

## Chunk 1: Replay And Debug Lineage

### Task 1: Surface authority/read-domain/bootstrap lineage in turn debug and events

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/routes/chatbot-v3/observability.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.ts`
- Test: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Test: `apps/api/src/__tests__/chatbot-v3.observability.test.ts`
- Test: `apps/api/src/routes/chatbot-v3/response-composer.test.ts`

- [ ] **Step 1: Write the failing tests for replay lineage visibility**

Add tests that expect the runtime/result or emitted events to preserve, at minimum:
- authority decision lineage (`matchedRuleId` or explicit equivalent)
- supervisor read-domain requests and resolved domain names
- whether a bootstrap override changed the supervisor path

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.observability.test.ts src/routes/chatbot-v3/response-composer.test.ts
```
Expected: FAIL because the current runtime debug surface does not fully expose these breadcrumbs.

- [ ] **Step 3: Implement minimal replay lineage wiring**

Update runtime/event/result plumbing so that:
- replay-critical breadcrumbs are carried by runtime turn results and/or emitted events
- fields stay compact and deterministic
- no hidden large blob is introduced
- bootstrap overrides and supervisor domain reads are explicit, not inferred later

- [ ] **Step 4: Verify the tests pass**

Run the same command and expect PASS.

- [ ] **Step 5: Run typecheck**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec add \
  apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/routes/chatbot-v3/observability.ts \
  apps/api/src/routes/chatbot-v3/response-composer.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts \
  apps/api/src/__tests__/chatbot-v3.observability.test.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec commit -m "feat(chatbot-v3): add replay lineage breadcrumbs"
```

---

## Chunk 2: Eval Fixture Hardening

### Task 2: Add fixed supervisor and degraded-path regression fixtures

**Files:**
- Create: `packages/application/src/services/__tests__/chatbot-v3/fixtures/supervisor-eval.fixtures.ts`
- Create: `apps/api/src/routes/chatbot-v3/__fixtures__/degraded-path.fixtures.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.test.ts`

- [ ] **Step 1: Write the fixture files and failing test cases first**

Cover at minimum:
- ambiguous short confirmations
- mixed FAQ/handoff/process-explanation turns
- repeat recommendation vs revisit recommendation
- late process explanation request
- FAQ degraded fallback vs low-confidence answer
- degraded-path family classification expectations

- [ ] **Step 2: Run the targeted tests to verify failures**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api test -- src/routes/chatbot-v3/faq-llm-adapter.test.ts src/routes/chatbot-v3/response-composer.test.ts
```
Expected: FAIL until fixtures/assertions and any supporting behavior are aligned.

- [ ] **Step 3: Implement the smallest supporting changes required**

Only change production code if a fixture exposes a real semantic hole. If the current implementation is correct, prefer tightening the tests around current canonical behavior instead of expanding scope.

- [ ] **Step 4: Re-run tests and verify pass**

Use the same commands and expect PASS.

- [ ] **Step 5: Run application and api typecheck**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/application typecheck
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec add \
  packages/application/src/services/__tests__/chatbot-v3/fixtures/supervisor-eval.fixtures.ts \
  apps/api/src/routes/chatbot-v3/__fixtures__/degraded-path.fixtures.ts \
  packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts \
  apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec commit -m "test(chatbot-v3): add supervisor and degraded fixtures"
```

---

## Chunk 3: Degraded Guidance And Card Closure

### Task 3: Split degraded guidance by failure family and document card action closure

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
- Create: `docs/analysis/2026-04-17-chatbot-v3-card-action-closure-checklist.md`
- Modify: `docs/analysis/2026-04-15-chatbot-v3-post-plan-remaining-gaps.md`

- [ ] **Step 1: Write failing tests for failure-family-specific degraded responses**

At minimum cover:
- FAQ degradation
- recommendation generation degradation
- consult failure/degradation
- blocked handoff / denied escalation guidance

- [ ] **Step 2: Run the targeted tests to confirm failure**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts src/__tests__/chatbot-v3.mounting.test.ts
```
Expected: FAIL until guidance becomes failure-family aware.

- [ ] **Step 3: Implement bounded degraded guidance routing**

Keep the envelope deterministic. Do not introduce free-form policy branching. Map existing failure signals into a small, explicit degraded guidance family set.

- [ ] **Step 4: Add the card action closure checklist document**

Document for each v3 card:
- whether it is view-only or action-bearing
- what backend path owns each action
- what retry/revisit/follow-up path exists today
- what is intentionally still missing

- [ ] **Step 5: Verify tests pass**

Re-run the same API test command and expect PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec add \
  apps/api/src/routes/chatbot-v3/response-composer.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts \
  docs/analysis/2026-04-17-chatbot-v3-card-action-closure-checklist.md \
  docs/analysis/2026-04-15-chatbot-v3-post-plan-remaining-gaps.md

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec commit -m "feat(chatbot-v3): harden degraded guidance and card closure"
```

---

## Chunk 4: Post-Implementation Review

### Task 4: Final hardening review and summary

**Files:**
- Modify only if needed based on review findings

- [ ] **Step 1: Request final code review over all hardening commits**
- [ ] **Step 2: Fix any valid findings with focused follow-up commits**
- [ ] **Step 3: Update the remaining-gaps analysis if any items moved from open to closed**
- [ ] **Step 4: Summarize which gaps remain intentionally open**

