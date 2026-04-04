# Next-Action Memory and Hybrid Recommendation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-scoped action memory, introduce `EXPLAIN_MEDICAL_TRAVEL_PROCESS` and `INVITE_ONLINE_CONSULT`, narrow `SHOW_PACKAGE` out of `REGULAR`, and upgrade hospital recommendation selection to backend-authoritative hybrid retrieval.

**Architecture:** Keep backend as the decision authority. Extend the AI policy contract and session snapshot with explicit action-memory fields, teach action planning to select the best next action while suppressing noisy repetition, and make hospital recommendation a two-stage backend flow: hard filters plus semantic/hybrid candidate ranking before final shortlist selection. Dify remains a response/orchestration layer that follows backend actions and pushes only the chosen soft CTA.

**Tech Stack:** TypeScript, Node.js, pnpm, existing AI policy services/use cases, Drizzle/Postgres session snapshot persistence, Dify workflow YAML, Vitest.

---

## File Map

### Existing files to modify

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/dtos/ai-policy.dto.ts`
  - Add new backend next actions and any DTO fields needed for action memory / recommendation reasoning.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-planner.service.ts`
  - Make next-action selection session-aware and domain-aware.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/recommendation-policy.service.ts`
  - Refactor recommendation from simple eligibility gate into hybrid retrieval orchestration.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/context-builder.service.ts`
  - Rehydrate session action memory and expose recommendation context inputs needed for ranking.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/writeback-planner.service.ts`
  - Plan updates to session action memory fields.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
  - Pass action memory and richer candidate inputs into planner/recommendation logic; expose new next actions to Dify.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`
  - Return action memory so internal debug/context inspection stays truthful.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/apply-ai-policy-writeback.use-case.ts`
  - Accept writeback payload that updates action memory fields.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/domain/src/entities/ai-chat-session.entity.ts`
  - Extend `statusSnapshot` shape with action memory.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/schema/schema.ts`
  - Persist new session action-memory fields.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts`
  - Map action-memory fields to/from DB.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`
  - Accept and return updated action-memory/writeback fields on internal policy routes.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`
  - Add new action mappings and prompt constraints for process explanation / consult invitation; narrow package behavior.

### New files to create

- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-memory.service.ts`
  - Encapsulate “recently done?” checks and update helpers instead of scattering timestamp logic.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/hospital-recommendation-ranker.service.ts`
  - Encapsulate hybrid recommendation ranking after hard filters.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-memory.service.test.ts`
  - Focused tests for repetition suppression semantics.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/hospital-recommendation-ranker.service.test.ts`
  - Tests for hybrid ranking inputs/outputs.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/migrations/028_ai_policy_action_memory.sql`
  - Add session action-memory fields.

### Existing tests to extend

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/context-builder.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts`

## Chunk 1: Contract and Session Action Memory

### Task 1: Add new backend next actions and session action-memory fields

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/dtos/ai-policy.dto.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/domain/src/entities/ai-chat-session.entity.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/schema/schema.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/migrations/028_ai_policy_action_memory.sql`

- [ ] **Step 1: Write the failing shape tests**

Add or extend tests so they fail until the new actions and session fields exist:

- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- `INVITE_ONLINE_CONSULT`
- `actionMemory` timestamps on session status

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts
```

Expected initially:
- FAIL on missing action names or missing session fields.

- [ ] **Step 2: Extend DTOs and domain model**

Add the new backend actions to `AI_POLICY_BACKEND_NEXT_ACTIONS`.

Extend session policy state with:

```ts
actionMemory?: {
  medicalTravelProcessExplainedAt?: string | null;
  consultProcessExplainedAt?: string | null;
  docUploadExplainedAt?: string | null;
  docUploadRequestedAt?: string | null;
  hospitalRecommendationsExploredAt?: string | null;
  hospitalRecommendationsShownAt?: string | null;
  onlineConsultInvitedAt?: string | null;
  packageShownAt?: string | null;
} | null;
```

- [ ] **Step 3: Persist the new fields**

Add nullable columns to `ai_chat_sessions` for each action-memory timestamp.

Map them into `statusSnapshot.actionMemory` in the repository layer.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec tsc --noEmit
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure exec tsc --noEmit
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/dtos/ai-policy.dto.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/domain/src/entities/ai-chat-session.entity.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/schema/schema.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/migrations/028_ai_policy_action_memory.sql
git commit -m "feat: add session action memory fields"
```

## Chunk 2: Action Memory Service and Repetition Rules

### Task 2: Encapsulate action-memory reads/writes and recency checks

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-memory.service.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-memory.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/context-builder.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/writeback-planner.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/apply-ai-policy-writeback.use-case.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`

- [ ] **Step 1: Write failing tests for repetition semantics**

Cover:

- `EXPLAIN_MEDICAL_TRAVEL_PROCESS` should count as “already done” after one turn
- `INVITE_ONLINE_CONSULT` may repeat later but not back-to-back
- `REQUEST_DOC_UPLOAD` may repeat after progress stalls

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/action-memory.service.test.ts
```

Expected initially:
- FAIL because the service does not exist.

- [ ] **Step 2: Implement `ActionMemoryService`**

Provide helpers such as:

```ts
wasExplainedThisSession(memory, action): boolean
wasInvitedRecently(memory, action): boolean
markAction(memory, action, at): ActionMemory
```

Keep the rules simple:

- explanation actions are once-per-session by default
- invitation actions can repeat after meaningful progression, not immediately
- recommendation display actions should not fire again unless new progress or new shortlist state exists

- [ ] **Step 3: Rehydrate and write back action memory**

Ensure context building exposes `actionMemory`, and writeback can patch the right timestamps after each authoritative decision.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/action-memory.service.test.ts src/services/__tests__/policy-engine/context-builder.service.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec tsc --noEmit
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-memory.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-memory.service.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/context-builder.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/writeback-planner.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/apply-ai-policy-writeback.use-case.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts
git commit -m "feat: add session action memory service"
```

## Chunk 3: Action Planner Upgrade

### Task 3: Add new actions and remove broad package promotion from REGULAR

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-planner.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts`

- [ ] **Step 1: Write failing planner tests**

Add cases for:

- broad process question -> `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- consultation curiosity -> `EXPLAIN_CONSULT_PROCESS`
- sufficient readiness after consultation explanation -> `INVITE_ONLINE_CONSULT`
- `REGULAR` qualified exploration does not default to `SHOW_PACKAGE`
- recently explained process does not choose `EXPLAIN_MEDICAL_TRAVEL_PROCESS` again

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/action-planner.service.test.ts
```

Expected initially:
- FAIL on missing actions or old package behavior.

- [ ] **Step 2: Upgrade planner inputs**

Extend `ActionPlannerInput` to include at least:

- `hospitalType`
- `actionMemory`
- `pendingOffer`
- `consultationStatus`
- optionally a readiness signal such as `hasMeaningfulCaseDetails`

Avoid overdesign: only add what current planner rules need.

- [ ] **Step 3: Implement the new selection rules**

Key rules:

- `LIGHT_DISCOVERY`
  - prefer `ANSWER_FAQ` or `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
  - never push package in `REGULAR`
- `QUALIFIED_EXPLORATION`
  - may choose:
    - `EXPLAIN_DOC_UPLOAD`
    - `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
    - `EXPLAIN_CONSULT_PROCESS`
    - `EXPLORE_HOSPITAL_RECOMMENDATIONS`
    - `INVITE_ONLINE_CONSULT`
  - `SHOW_PACKAGE` only if `hospitalType = COSMETIC`
- `DEEP_WORKFLOW`
  - may choose:
    - `REQUEST_DOC_UPLOAD`
    - `SHOW_HOSPITAL_RECOMMENDATIONS`
    - `INVITE_ONLINE_CONSULT`
  - do not default to package for `REGULAR`

Use action memory to suppress low-value repeats.

- [ ] **Step 4: Update decision use case expectations**

Ensure:

- `allowed_tools`
- `response_mode`
- `reason_codes`

still align with the chosen action.

- [ ] **Step 5: Run focused verification**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/action-planner.service.test.ts src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec tsc --noEmit
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-planner.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts
git commit -m "feat: improve next-action selection"
```

## Chunk 4: Hybrid Hospital Recommendation

### Task 4: Replace simple candidate gating with backend-authoritative hybrid ranking

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/hospital-recommendation-ranker.service.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/hospital-recommendation-ranker.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/recommendation-policy.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/policy-evaluation.test.ts`

- [ ] **Step 1: Write failing ranking tests**

Cover:

- hard filters drop clearly incompatible hospitals
- semantic preference signals can reorder remaining candidates
- backend still returns shortlist + reason codes, not freeform retrieval output

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/hospital-recommendation-ranker.service.test.ts
```

Expected initially:
- FAIL because the ranker does not exist.

- [ ] **Step 2: Implement a minimal hybrid ranker**

For v1, do not overbuild embeddings infrastructure inside this task.

Implement a minimal backend-owned structure that supports:

- hard filter inputs:
  - destination
  - hospital/service line compatibility
  - international patient support
- semantic preference inputs:
  - extracted preference phrases
  - capability/style keywords

If the codebase does not yet have a full vector retrieval system, implement a deterministic hybrid scoring layer over candidate profiles and leave the profile index behind a focused service boundary so it can be upgraded later without rewriting policy logic.

- [ ] **Step 3: Refactor recommendation policy**

Change `RecommendationPolicyService` so it:

- checks eligibility/risk/docs/readiness
- asks the ranker for ordered candidates
- returns a backend-owned shortlist with reason codes

Do not let Dify decide shortlist contents.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/hospital-recommendation-ranker.service.test.ts src/services/__tests__/policy-engine/policy-evaluation.test.ts src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec tsc --noEmit
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/hospital-recommendation-ranker.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/hospital-recommendation-ranker.service.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/recommendation-policy.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/policy-evaluation.test.ts
git commit -m "feat: add hybrid hospital recommendation"
```

## Chunk 5: Dify Workflow and Public Contract Alignment

### Task 5: Align Dify workflow and public response mapping with the new backend actions

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`

- [ ] **Step 1: Write failing contract tests**

Add assertions for:

- new actions appear in Dify prompt rules
- CTA rules cover:
  - process explanation
  - consultation invitation
- `SHOW_PACKAGE` branch is not used for `REGULAR`

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/dify-workflow.contract.test.ts src/__tests__/chatbot.routes.test.ts
```

Expected initially:
- FAIL on missing prompt/action strings.

- [ ] **Step 2: Update Dify workflow**

Make the composer and routing logic reflect:

- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- `INVITE_ONLINE_CONSULT`
- package narrowing

The response composer should:

- explain first
- append one soft CTA aligned with backend action
- never invent a different progression step

- [ ] **Step 3: Update internal route / writeback glue if needed**

If the internal writeback or public response mapping assumes the old action set, patch it here.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/dify-workflow.contract.test.ts src/__tests__/chatbot.routes.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec tsc --noEmit
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts
git commit -m "feat: align chatbot workflow with new actions"
```

## Chunk 6: End-to-End Verification

### Task 6: Verify real multi-turn session behavior

**Files:**
- Reuse existing tests and local runbooks; no required new source file for this chunk unless regressions demand one.

- [ ] **Step 1: Run unit and contract suites**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/action-memory.service.test.ts src/services/__tests__/policy-engine/action-planner.service.test.ts src/services/__tests__/policy-engine/hospital-recommendation-ranker.service.test.ts src/services/__tests__/policy-engine/policy-evaluation.test.ts src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts src/__tests__/dify-workflow.contract.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec tsc --noEmit
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec tsc --noEmit
```

Expected:
- PASS

- [ ] **Step 2: Re-import and publish the updated Dify workflow**

Use:

- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`

Confirm in Dify console that:

- the new action prompts are present
- package behavior is restricted
- the app is published and the API key is synced into:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.env`
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/.env`

- [ ] **Step 3: Run real session tests**

At minimum test these sessions:

1. process learning session
   - broad process question
   - consultation curiosity
   - readiness statement
   - expect:
     - `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
     - then `EXPLAIN_CONSULT_PROCESS`
     - then `INVITE_ONLINE_CONSULT`

2. recommendation session with low readiness
   - recommendation request
   - expect doc explanation/request instead of immediate shortlist

3. recommendation session with richer constraints
   - destination + specialty + preference language
   - expect exploration or shortlist, not generic FAQ fallback

4. repeated process question in same session
   - ensure process explanation is not mechanically replayed

5. `REGULAR` flow
   - verify `SHOW_PACKAGE` does not appear as the default progression

6. safety flow
   - verify `SAFETY_HANDOFF` still suppresses commercial CTA

- [ ] **Step 4: Record observed gaps**

If runtime behavior still misses the target, capture:

- backend next action
- response CTA
- action memory state
- Dify node path

Only then queue follow-up tuning.

- [ ] **Step 5: Final commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git commit -m "feat: add session-aware next action policy"
```

