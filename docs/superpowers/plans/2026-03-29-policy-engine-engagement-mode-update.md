# Policy Engine Engagement Mode Update Plan

> This addendum updates the 2026-03-28 policy-engine direction with a backend-authoritative pre-validator and `engagement_mode` model. It is intended to be executed alongside the main policy-engine implementation work on this branch.

**Goal:** Add a backend-owned pre-validator that routes early turns into `LIGHT_DISCOVERY`, `QUALIFIED_EXPLORATION`, or `DEEP_WORKFLOW`, reducing token cost and over-selling while preserving strong users who are still building trust.

**Decision:** `engagement_mode` is authoritative in backend. Dify may provide lightweight candidate signals, but it must not self-decide deep workflow entry.

---

## Scope

- Add a backend `EngagementModeResolver`
- Extend the authoritative decision contract with `engagement_mode`
- Use mode-aware action planning and writeback depth
- Update Dify workflow to respect backend-selected mode
- Add regression coverage for false escalation and false suppression

Out of scope for this addendum:

- changing the hospital shortlist policy
- changing handoff types
- changing package recommendation business rules

---

## Files to Extend

- `packages/application/src/dtos/ai-policy.dto.ts`
- `packages/application/src/services/policy-engine/context-builder.service.ts`
- `packages/application/src/services/policy-engine/signal-resolver.service.ts`
- `packages/application/src/services/policy-engine/action-planner.service.ts`
- `packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- `packages/domain/src/entities/ai-chat-session.entity.ts`
- `packages/infrastructure/database/schema/schema.ts`
- `apps/api/src/routes/internal.routes.ts`
- `apps/api/src/routes/chatbot.routes.ts`
- `dify-config/medora-ai-chatbot-v1.dsl.yml`

## New Files

- `packages/application/src/services/policy-engine/engagement-mode-resolver.service.ts`
- `packages/application/src/services/__tests__/policy-engine/engagement-mode-resolver.service.test.ts`
- `packages/application/src/services/__tests__/policy-engine/engagement-mode-regression.test.ts`

---

## Chunk A: Contract and Resolver

### Task A1: Add the `engagement_mode` enum and resolver service

- [ ] Add `engagement_mode` to the shared backend policy DTOs
- [ ] Define allowed values:
  - `LIGHT_DISCOVERY`
  - `QUALIFIED_EXPLORATION`
  - `DEEP_WORKFLOW`
- [ ] Implement `EngagementModeResolver` using:
  - current user message
  - recent interaction pattern
  - pending offer / pending question
  - structured status
  - previously known user details
  - candidate signals from Dify extraction

### Task A2: Test the resolver first

- [ ] Add failing unit tests that cover:
  - greeting-only input -> `LIGHT_DISCOVERY`
  - cautious trust-building question -> `QUALIFIED_EXPLORATION`
  - explicit "start now / upload now / connect me to a person" -> `DEEP_WORKFLOW`
  - explicit risk cases can still force deep handling even without commercial signals

Verification command:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/policy-engine-impl/packages/application exec vitest run src/services/__tests__/policy-engine/engagement-mode-resolver.service.test.ts
```

---

## Chunk B: Policy Pipeline Integration

### Task B1: Insert engagement mode ahead of full policy planning

- [ ] Update `decide-ai-policy.use-case.ts` to:
  1. build context
  2. merge candidate signals
  3. resolve `engagement_mode`
  4. resolve intent/risk/action using that mode
- [ ] Ensure the authoritative policy response returned to Dify includes `engagement_mode`

### Task B2: Make action planning mode-aware

- [ ] `LIGHT_DISCOVERY`
  - allow lightweight FAQ, process explanation, why-us, and soft trust-building
  - avoid shortlist push and deep workflow side effects
- [ ] `QUALIFIED_EXPLORATION`
  - allow recommendation exploration, consult explanation, docs explanation, package exploration
  - allow moderate writeback and summary refresh
- [ ] `DEEP_WORKFLOW`
  - allow full recommendation, docs upload, handoff, follow-up, and complete writeback depth

### Task B3: Add regression tests for mode-aware planning

- [ ] Add failing tests for:
  - low-signal greeting incorrectly producing `SHOW_HOSPITAL_RECOMMENDATIONS`
  - careful but high-value user incorrectly stuck in `LIGHT_DISCOVERY`
  - form completion treated as strong signal but not sole gateway

Verification command:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/policy-engine-impl/packages/application exec vitest run src/services/__tests__/policy-engine/engagement-mode-regression.test.ts
```

---

## Chunk C: Status and Writeback Depth

### Task C1: Persist session-level engagement mode

- [ ] Add `engagement_mode` to the session truth model
- [ ] Store the latest resolved mode on `ai_chat_sessions`
- [ ] Include the mode in message-level decision metadata when useful for audit

### Task C2: Make writeback depth mode-aware

- [ ] `LIGHT_DISCOVERY`
  - minimal session metadata only
- [ ] `QUALIFIED_EXPLORATION`
  - targeted summary/status updates
- [ ] `DEEP_WORKFLOW`
  - full structured writeback, timeline, handoff, and follow-up side effects

### Task C3: Add writeback tests

- [ ] Verify that low-signal turns do not create heavy timeline/follow-up noise
- [ ] Verify that deep turns still create the expected business records

---

## Chunk D: Dify Workflow Alignment

### Task D1: Update Dify workflow contract

- [ ] Ensure Dify consumes backend `engagement_mode`
- [ ] Add an explicit cheap-path rule:
  - if `engagement_mode = LIGHT_DISCOVERY`, do not force deep branches
- [ ] Keep backend as authority for escalation into heavy flows

### Task D2: Verify workflow behavior

- [ ] Greeting question stays in lightweight path
- [ ] Trust-building question can still move into qualified exploration
- [ ] Explicit progression request enters deep workflow

---

## Chunk E: Final Verification

- [ ] Run application unit tests
- [ ] Run API route tests for policy endpoint envelopes
- [ ] Run chatbot route tests to confirm public contract remains compatible
- [ ] Re-import/publish updated Dify DSL
- [ ] Run manual E2E smoke tests:
  - greeting
  - trust-building question
  - hospital question
  - package question
  - explicit start-now conversion
  - explicit human request
  - crisis input

Verification commands:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/policy-engine-impl/packages/application exec tsc --noEmit
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/policy-engine-impl/apps/api exec tsc --noEmit
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/policy-engine-impl/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts src/__tests__/internal.routes.test.ts
```

---

## Expected Outcome

After this update:

- early low-signal turns stay cheap and natural
- cautious but valuable users are not wrongly dismissed
- deep workflow entry is explicit and auditable
- backend remains the source of truth for conversation progression
- Dify remains a medium-weight orchestration and response layer rather than the business decision-maker
