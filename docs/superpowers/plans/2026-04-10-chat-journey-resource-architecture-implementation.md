# Chat Journey Resource Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current chat next-action/widget orchestration with a CRM-owned journey engine plus resource registry, while keeping Dify as a constrained language/classification layer and the frontend as a resource renderer.

**Architecture:** Introduce a minimal `currentStage + currentPhase` journey model, a shared resource contract for both progression and query widgets, and a CRM-side conversation orchestrator that decides allowed resources before Dify writes the answer. Refactor routes, DSL wiring, and frontend widget rendering to consume structured journey/resource output instead of ad hoc `nextAction` heuristics.

**Tech Stack:** TypeScript, Hono, Vitest, pnpm/turbo, Dify DSL YAML, React

---

## File Structure

### CRM backend

**Create**
- `packages/shared/validation/src/chat-journey.schema.ts`
  Purpose: shared schemas for journey stage/phase, resource status, resource descriptors, and orchestration response envelopes.
- `packages/shared/validation/src/__tests__/chat-journey.schema.test.ts`
  Purpose: schema-level guardrails for the new chat journey/resource contract.
- `packages/application/src/services/chat-journey/journey-engine.service.ts`
  Purpose: derive `currentStage`, `currentPhase`, and transition decisions from CRM truth.
- `packages/application/src/services/chat-journey/resource-registry.service.ts`
  Purpose: register resource types, visibility rules, payload builders, and stale/idempotent update behavior.
- `packages/application/src/services/chat-journey/request-classifier.service.ts`
  Purpose: normalize each user turn into `faq`, `process_explanation`, `progression_request`, `resource_request`, `resource_status_question`, or `human_help_request`.
- `packages/application/src/services/chat-journey/conversation-orchestrator.service.ts`
  Purpose: compute `responseIntent`, `allowedResources`, and Dify-safe context before assistant message generation.
- `packages/application/src/services/__tests__/chat-journey/journey-engine.service.test.ts`
- `packages/application/src/services/__tests__/chat-journey/resource-registry.service.test.ts`
- `packages/application/src/services/__tests__/chat-journey/request-classifier.service.test.ts`
- `packages/application/src/services/__tests__/chat-journey/conversation-orchestrator.service.test.ts`

**Modify**
- `packages/domain/src/enums/index.ts`
  Purpose: add/normalize journey stage, phase, and resource-type enums if the domain layer owns shared enum unions.
- `packages/application/src/use-cases/patient-auth/get-patient-session-state.use-case.ts`
  Purpose: return the minimal journey snapshot needed by the chat restore path.
- `apps/api/src/composition-root.ts`
  Purpose: wire the new journey/resource/orchestration services.
- `apps/api/src/routes/chatbot.routes.ts`
  Purpose: replace direct `nextAction -> widget` decisions with journey/resource orchestration output.
- `apps/api/src/routes/chatbot-block-builder.ts`
  Purpose: migrate from hardcoded block mapping to resource-reference mapping, or reduce it to a compatibility adapter.
- `apps/api/src/routes/patient-widget-starter.ts`
  Purpose: seed `EXPLAIN_PROCESS.active` using the journey engine instead of old block heuristics.
- `apps/api/src/routes/patient-protected.routes.ts`
  Purpose: host unified resource action/update endpoints and stale-resource responses.
- `apps/api/src/routes/internal.routes.ts`
  Purpose: trim Dify/internal payloads to journey/resource-safe inputs and outputs.
- `packages/application/src/services/policy-engine/action-planner.service.ts`
- `packages/application/src/services/policy-engine/context-builder.service.ts`
- `packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- `packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`
  Purpose: bridge the old policy engine into the new CRM-owned journey decisions until the old heuristics are retired.
- `packages/application/src/use-cases/patient-dashboard/submit-patient-qc-response.use-case.ts`
  Purpose: mark resource submission truth in a way the new journey engine can consume directly.
- `apps/api/src/__tests__/chatbot.routes.test.ts`
- `apps/api/src/__tests__/patient-public.routes.test.ts`
- `apps/api/src/__tests__/patient-auth.routes.test.ts`
- `apps/api/src/__tests__/internal.routes.test.ts`
- `apps/api/src/__tests__/dify-workflow.contract.test.ts`
- existing policy-engine tests that currently assert `REQUEST_DOC_UPLOAD`/questionnaire-heavy behavior
  Purpose: lock the new boundaries and remove stale assumptions.

### Dify workflow

**Modify**
- `dify-config/medora-ai-chatbot-v1.dsl.yml`
  Purpose: accept CRM-computed journey/resource context and stop deciding widgets or progression on its own.

### Frontend

**Create**
- `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/resources/registry.tsx`
  Purpose: `resourceType -> renderer` registry for the chat widget.
- `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/resources/types.ts`
  Purpose: frontend resource contract aligned with CRM schemas.
- `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/resources/__tests__/registry.test.tsx`
  Purpose: verify renderer registration and fallback behavior.

**Modify**
- `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/services/api/crmApiClient.ts`
  Purpose: consume the new journey/resource response shape.
- `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/services/api/patient-chatbot.ts`
  Purpose: send resource actions and parse journey snapshots.
- `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/contexts/PatientEntryContext.tsx`
  Purpose: stop inferring flow from `nextAction`; instead track the backend-provided journey/resource state.
- `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/ChatMessageBlocks.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/ChatWidget.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/PatientEntryWindow.tsx`
  Purpose: render resources through the registry instead of block-specific heuristics.
- existing block components and tests under `src/components/chat/blocks/` and `src/components/chat/__tests__/`
  Purpose: migrate current widgets into registry-backed resources.

---

## Chunk 1: Shared Contract and Journey Core

### Task 1: Lock the new journey/resource contract with failing tests

**Files:**
- Modify: `apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `apps/api/src/__tests__/patient-auth.routes.test.ts`
- Modify: `apps/api/src/__tests__/patient-public.routes.test.ts`
- Modify: `apps/api/src/__tests__/internal.routes.test.ts`
- Modify: `apps/api/src/__tests__/dify-workflow.contract.test.ts`
- Modify: `packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts`
- Modify: `packages/application/src/services/__tests__/policy-engine/policy-evaluation.test.ts`
- Test: `packages/shared/validation/src/__tests__/chatbot.schema.test.ts`

- [ ] **Step 1: Add failing API assertions for `journeySnapshot` and `resources`**
  Run: `rg -n "nextAction|blocks|chatbotOrchestrationState" apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/patient-auth.routes.test.ts`
  Expected: locate the current tests that still assume `nextAction`-driven widget behavior.

- [ ] **Step 2: Add failing assertions that FAQ-only turns do not advance the journey**
  Add tests that model:
  - FAQ during `EXPLAIN_PROCESS.active`
  - status-question turn during `COLLECT_MEDICAL_INPUTS.active`
  - non-handoff human-assistance phrasing that should stay informational
  - explicit human-handoff request that must transition immediately
  Expected failure: current system still derives too much from `nextAction`.

- [ ] **Step 3: Add failing assertions that recommendation-pressure turns only surface allowed resources**
  Add coverage for:
  - recommendation request before medical inputs
  - refusal-to-fill-form follow-up
  - process explanation continuing without immediate questionnaire
  - query-resource access from `EXPLAIN_PROCESS`, `COLLECT_MEDICAL_INPUTS`, `RECOMMENDATION`, `ONLINE_CONSULT`, and `HUMAN_HANDOFF`
  - explicit human handoff availability from every stage
  Expected failure: current planner still returns `REQUEST_DOC_UPLOAD` too aggressively.

- [ ] **Step 4: Add failing contract assertions for Dify inputs**
  Add checks that the workflow contract includes:
  - `currentStage`
  - `currentPhase`
  - `allowedResources`
  - request class / response intent
  and no longer relies on widget-specific progression heuristics.

- [ ] **Step 5: Run targeted tests and confirm expected failures**
  Run:
  ```bash
  pnpm --filter @medical-crm/api test -- --runInBand apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/patient-auth.routes.test.ts apps/api/src/__tests__/patient-public.routes.test.ts apps/api/src/__tests__/internal.routes.test.ts apps/api/src/__tests__/dify-workflow.contract.test.ts
  ```
  Expected: FAIL with missing journey/resource fields and outdated next-action expectations.

### Task 2: Add shared journey/resource schemas

**Files:**
- Create: `packages/shared/validation/src/chat-journey.schema.ts`
- Create: `packages/shared/validation/src/__tests__/chat-journey.schema.test.ts`
- Modify: `packages/shared/validation/src/chatbot.schema.ts`
- Modify: `packages/shared/validation/src/__tests__/chatbot.schema.test.ts`

- [ ] **Step 1: Write failing schema tests for journey stage/phase and resource descriptors**
  Cover:
  - stage enum
  - phase enum
  - resource status enum
  - query/progress resource shapes
  - stale-resource error shape

- [ ] **Step 2: Define the shared schemas**
  Include at minimum:
  - `JourneyStageSchema`
  - `JourneyPhaseSchema`
  - `ChatResourceStatusSchema`
  - `ChatResourceDescriptorSchema`
  - `JourneySnapshotSchema`
  - `ChatAssistantEnvelopeSchema` for the top-level `{ text, resources, journeySnapshot, metadata }` response shape
  - `ResourceActionResultSchema`

- [ ] **Step 3: Thread the new schemas into the existing chatbot response schema**
  Keep compatibility only where needed for transitional tests; do not preserve old widget-specific fields by default.

- [ ] **Step 4: Run schema tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/shared-validation test -- --runInBand packages/shared/validation/src/__tests__/chat-journey.schema.test.ts packages/shared/validation/src/__tests__/chatbot.schema.test.ts
  ```
  Expected: PASS.

### Task 3: Implement the journey engine

**Files:**
- Create: `packages/application/src/services/chat-journey/journey-engine.service.ts`
- Create: `packages/application/src/services/__tests__/chat-journey/journey-engine.service.test.ts`
- Modify: `packages/application/src/use-cases/patient-auth/get-patient-session-state.use-case.ts`
- Modify: `apps/api/src/composition-root.ts`

- [ ] **Step 1: Write the failing journey-engine tests**
  Cover:
  - new case starts at `EXPLAIN_PROCESS.active`
  - progression into `COLLECT_MEDICAL_INPUTS.pre`
  - transition to `RECOMMENDATION.pre` only after input truth is satisfied
  - package path remaining in `RECOMMENDATION.post` when consult is skipped
  - formal handoff transition from any stage

- [ ] **Step 2: Implement the minimal journey engine**
  The service should read CRM truth only and output:
  - `currentStage`
  - `currentPhase`
  - next transition decision if any

- [ ] **Step 3: Update patient session state use case to surface the minimal journey snapshot**
  Keep `/api/patient/me` thin:
  - no new orchestration cache
  - only minimal journey snapshot and existing business truth

- [ ] **Step 4: Wire the service in `composition-root.ts`**
  Ensure tests can resolve it without touching unrelated hospital/supabase changes already in the repo.

- [ ] **Step 5: Run targeted tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chat-journey/journey-engine.service.test.ts packages/application/__tests__/patient-auth/get-patient-session-state.test.ts
  ```
  Expected: PASS.

### Task 4: Implement the resource registry core

**Files:**
- Create: `packages/application/src/services/chat-journey/resource-registry.service.ts`
- Create: `packages/application/src/services/__tests__/chat-journey/resource-registry.service.test.ts`
- Modify: `apps/api/src/routes/chatbot-block-builder.ts`
- Modify: `packages/application/src/use-cases/patient-dashboard/submit-patient-qc-response.use-case.ts`

- [ ] **Step 1: Write failing tests for progression and query resources**
  Cover:
  - `PROCESS_GUIDE`
  - `MEDICAL_DOC_UPLOAD`
  - `QUESTIONNAIRE`
  - `HOSPITAL_RECOMMENDATION`
  - `PACKAGE_RECOMMENDATION`
  - `ONLINE_CONSULT_BOOKING`
  - `HUMAN_HANDOFF`
  - one query resource such as `MEDICAL_INVITATION_STATUS`

- [ ] **Step 2: Implement registry definitions and visibility rules**
  Include:
  - global-by-default query-resource policy
  - per-resource override support
  - stage-binding support

- [ ] **Step 3: Add minimal payload builders for the first-pass resource set**
  Use only the resources already needed by current UI paths; avoid speculative types beyond the spec list.

- [ ] **Step 4: Add duplicate-submit and stale-resource registry tests**
  Cover:
  - an already-submitted questionnaire resource returning the same successful state
  - a stale recommendation resource resolving to the current valid snapshot

- [ ] **Step 5: Keep `chatbot-block-builder.ts` as a narrow compatibility adapter only**
  During the migration, keep `chatbot-block-builder.ts` solely as a resource-to-legacy-block adapter for old frontend consumers.
  It must not contain independent progression logic or become a second flow engine.

- [ ] **Step 6: Make questionnaire submission feed resource truth**
  Ensure successful questionnaire submit results in resource state that the registry can read as `submitted`.

- [ ] **Step 7: Run targeted tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chat-journey/resource-registry.service.test.ts packages/application/__tests__/patient-protected-use-cases.test.ts
  ```
  Expected: PASS.

---

## Chunk 2: Conversation Orchestration, Routes, DSL, and Frontend

### Task 5: Implement request classification and conversation orchestration

**Files:**
- Create: `packages/application/src/services/chat-journey/request-classifier.service.ts`
- Create: `packages/application/src/services/chat-journey/conversation-orchestrator.service.ts`
- Create: `packages/application/src/services/__tests__/chat-journey/request-classifier.service.test.ts`
- Create: `packages/application/src/services/__tests__/chat-journey/conversation-orchestrator.service.test.ts`
- Modify: `packages/application/src/services/policy-engine/action-planner.service.ts`
- Modify: `packages/application/src/services/policy-engine/context-builder.service.ts`
- Modify: `packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- Modify: `packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`

- [ ] **Step 1: Write failing tests for the request classes**
  Cover:
  - `faq`
  - `process_explanation`
  - `progression_request`
  - `resource_request`
  - `resource_status_question`
  - `human_help_request`

- [ ] **Step 2: Implement a structured classifier interface**
  Allow LLM assistance, but require a bounded structured output before orchestration logic continues.

- [ ] **Step 3: Implement the conversation orchestrator**
  It should compute:
  - `responseIntent`
  - `allowedResources`
  - optional `journeyUpdate`
  - optional `resourceUpdates`

- [ ] **Step 4: Reduce old policy-engine ownership**
  Keep Dify-facing context focused on:
  - stage
  - phase
  - request class
  - allowed resources
  - truth snapshot
  - recent messages / summary

- [ ] **Step 5: Run targeted tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chat-journey/request-classifier.service.test.ts packages/application/src/services/__tests__/chat-journey/conversation-orchestrator.service.test.ts packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts packages/application/src/services/__tests__/policy-engine/policy-evaluation.test.ts
  ```
  Expected: PASS.

### Task 6: Refactor chat routes and widget seeding around journey/resources

**Files:**
- Modify: `apps/api/src/routes/chatbot.routes.ts`
- Modify: `apps/api/src/routes/patient-widget-starter.ts`
- Modify: `apps/api/src/routes/chatbot-block-builder.ts`
- Modify: `apps/api/src/routes/internal.routes.ts`
- Modify: `apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `apps/api/src/__tests__/patient-public.routes.test.ts`
- Modify: `apps/api/src/__tests__/internal.routes.test.ts`

- [ ] **Step 1: Make `chatbot.routes.ts` ask the orchestrator what is allowed before calling Dify**
  Remove direct route-local progression heuristics where possible.

- [ ] **Step 2: Replace block-building assumptions with resource references**
  Keep `chatbot-block-builder.ts` as the temporary compatibility shim for legacy block envelopes during rollout, but route all progression decisions through the journey/resource orchestration path first.

- [ ] **Step 3: Update the widget starter to seed `EXPLAIN_PROCESS.active`**
  It should no longer seed questionnaire-first behavior by default.

- [ ] **Step 4: Update internal routes to accept/send journey/resource context**
  Trim old `nextAction`-driven payload assumptions.

- [ ] **Step 5: Run targeted API tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/api test -- --runInBand apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/patient-public.routes.test.ts apps/api/src/__tests__/internal.routes.test.ts
  ```
  Expected: PASS.

### Task 7: Add unified resource update handling with idempotency and stale checks

**Files:**
- Modify: `apps/api/src/routes/patient-protected.routes.ts`
- Modify: `packages/application/src/services/chat-journey/resource-registry.service.ts`
- Modify: `packages/application/src/services/chat-journey/journey-engine.service.ts`
- Add tests in:
  - `apps/api/src/__tests__/patient-protected.routes.test.ts`
  - `packages/application/src/services/__tests__/chat-journey/resource-registry.service.test.ts`

- [ ] **Step 1: Write failing tests for duplicate submit and stale resource cases**
  Cover:
  - double questionnaire submit
  - stale recommendation confirm
  - retrying a successful resource submit after timeout

- [ ] **Step 2: Add a unified resource action/update endpoint contract**
  Include:
  - resource identifier
  - action
  - optional idempotency key

- [ ] **Step 3: Implement stale-resource rejection and success replay**
  Return the current valid resource snapshot instead of mutating outdated state.

- [ ] **Step 4: Ensure journey transitions happen only once per truth-changing update**
  Verify that retries do not re-advance stages.

- [ ] **Step 5: Run targeted tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/api test -- --runInBand apps/api/src/__tests__/patient-protected.routes.test.ts && pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chat-journey/resource-registry.service.test.ts
  ```
  Expected: PASS.

### Task 8: Update the Dify DSL contract

**Files:**
- Modify: `dify-config/medora-ai-chatbot-v1.dsl.yml`
- Modify: `apps/api/src/__tests__/dify-workflow.contract.test.ts`

- [ ] **Step 1: Write failing workflow contract assertions**
  Require the workflow to consume:
  - stage
  - phase
  - request class
  - allowed resources
  and to stop deciding widgets/progression itself.

- [ ] **Step 2: Update the workflow nodes**
  Remove or simplify nodes that currently infer progression from old `nextAction`/questionnaire pressure heuristics.

- [ ] **Step 3: Keep Dify output constrained**
  Ensure Dify returns language-oriented structure, not workflow ownership.

- [ ] **Step 4: Run contract tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/api test -- --runInBand apps/api/src/__tests__/dify-workflow.contract.test.ts
  ```
  Expected: PASS.

### Task 9: Convert the frontend into a resource renderer

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/resources/registry.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/resources/types.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/resources/__tests__/registry.test.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/ChatMessageBlocks.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/ChatWidget.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/PatientEntryWindow.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/contexts/PatientEntryContext.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/services/api/crmApiClient.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/services/api/patient-chatbot.ts`
- Modify: existing block components/tests as needed

- [ ] **Step 1: Write failing frontend tests for registry-based rendering**
  Cover:
  - process guide resource
  - questionnaire resource
  - recommendation resource
  - query-resource rendering fallback

- [ ] **Step 2: Add resource types and renderer registry**
  Keep the first pass limited to currently existing widget families plus one query-resource example.

- [ ] **Step 3: Update the chat context to consume `journeySnapshot` and `resources`**
  Remove remaining front-end `nextAction`-driven flow inference.

- [ ] **Step 4: Wire resource actions through CRM**
  Ensure uploads, questionnaire submit, recommendation confirm, and consult booking use the unified update path where available.

- [ ] **Step 5: Run targeted frontend tests**
  Run:
  ```bash
  pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys test -- --runInBand src/components/chat/resources/__tests__/registry.test.tsx src/components/chat/__tests__/PatientEntryWindow.rich-blocks.test.tsx src/components/chat/__tests__/ChatMessageTriggers.test.tsx src/contexts/__tests__/PatientEntryContext.bootstrap.test.tsx src/services/api/__tests__/patient-chatbot.test.ts
  ```
  Expected: PASS.

### Task 10: Final smoke tests, docs sync, and release notes

**Files:**
- Modify: `docs/analysis/2026-04-08-live-dify-session-smoke-report.md` only if rerun evidence should be appended
- Modify: this plan file checkboxes during execution
- Optional docs updates only if implementation changes public workflow expectations

- [ ] **Step 1: Run targeted backend test sweep**
  Run:
  ```bash
  pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chat-journey/*.test.ts packages/application/src/services/__tests__/policy-engine/*.test.ts
  ```
  Expected: PASS.

- [ ] **Step 2: Run targeted API test sweep**
  Run:
  ```bash
  pnpm --filter @medical-crm/api test -- --runInBand apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/patient-public.routes.test.ts apps/api/src/__tests__/patient-protected.routes.test.ts apps/api/src/__tests__/patient-auth.routes.test.ts apps/api/src/__tests__/internal.routes.test.ts apps/api/src/__tests__/dify-workflow.contract.test.ts
  ```
  Expected: PASS.

- [ ] **Step 3: Run targeted frontend checks**
  Run:
  ```bash
  pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys test -- --runInBand src/components/chat/resources/__tests__/registry.test.tsx src/components/chat/__tests__ src/contexts/__tests__/PatientEntryContext.bootstrap.test.tsx src/services/api/__tests__/patient-chatbot.test.ts
  ```
  Expected: PASS.

- [ ] **Step 4: Rerun live multi-turn smoke sessions**
  Verify:
  - process explanation remains stable
  - refusal-to-fill-form no longer force-spawns questionnaire during explanation-only turns
  - questionnaire submit is recognized immediately
  - recommendation and query resources render from CRM-owned journey state

- [ ] **Step 5: Validate rollout compatibility order**
  Verify the implementation can be deployed in this order without breaking production mid-rollout:
  1. CRM backend exposing both resource envelopes and legacy block compatibility
  2. Dify workflow switched to CRM-owned journey/resource inputs
  3. frontend switched to the registry-driven resource renderer
  Expected: no intermediate deployment should leave the chat widget without a renderable response shape.

- [ ] **Step 6: Commit in small batches during execution**
  Suggested sequence:
  1. `feat: add chat journey schemas and engine`
  2. `feat: add chat resource registry and orchestration`
  3. `feat: migrate chatbot routes to journey resources`
  4. `feat: convert frontend chat to resource registry`
  5. `chore: sync dify workflow with CRM journey contract`

---

Plan complete and saved to `docs/superpowers/plans/2026-04-10-chat-journey-resource-architecture-implementation.md`. Ready to review and then execute.
