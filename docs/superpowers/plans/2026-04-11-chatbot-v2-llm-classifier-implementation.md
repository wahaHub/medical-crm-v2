# Chatbot V2 LLM Classifier Implementation Plan

> **For agentic workers:** REQUIRED: use subagent-driven development and request review after each completed chunk. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current rule-based `chatbot-v2` request classifier with a dedicated LLM-backed classifier workflow, while reusing the existing journey/resource/composer foundations already implemented in CRM, Dify, and the frontend.

**Primary spec:** `docs/superpowers/specs/2026-04-11-chatbot-v2-llm-classifier-design.md`

**Related architecture spec:** `docs/superpowers/specs/2026-04-10-chat-journey-resource-architecture-design.md`

**Tech stack:** TypeScript, Hono, Vitest, pnpm/turbo, Dify DSL YAML, React

---

## Planning Note

This plan remains incremental.

Chunks 1-6 should stay conceptually intact.

We should not rewrite already-completed classifier/orchestrator/composer work just because FAQ grounding is still missing.

Instead, FAQ grounding is added as a narrow extension after the existing classifier/orchestrator/composer foundation.

That keeps subagent execution stable and avoids unnecessary backtracking.

---

## What Is Already Implemented and Should Be Reused

This plan is intentionally incremental. We are not rebuilding `chatbot-v2` from scratch.

### Reuse as-is or with small extension

- `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`
  - already defines `journeySnapshot`, resource descriptors, resource status, and the top-level assistant envelope
- `packages/application/src/services/chatbot-v2/journey-engine.service.ts`
  - already derives the CRM-owned journey snapshot from truth
- `packages/application/src/services/chatbot-v2/resource-registry.service.ts`
  - already knows the current resource universe and visibility rules
- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
  - should remain the CRM orchestration point, but must stop calling the local rule-based classifier directly
- `apps/api/src/routes/chatbot-v2-context.ts`
  - already bridges `preTurn` and `postTurn` v2 context into the chat routes
- `dify-config/medora-ai-chatbot-v2.dsl.yml`
  - should stay the composer workflow, not be replaced
- China frontend `src/components/chat-v2/*`
  - already consumes `journeySnapshot` and `resources`

### Replace or substantially change

- `packages/application/src/services/chatbot-v2/request-classifier.service.ts`
  - current rule-based keyword matching must be removed
- `packages/application/src/services/__tests__/chatbot-v2/request-classifier.service.test.ts`
  - current tests encode rule-based assumptions and must be rewritten
- `apps/api/src/routes/chatbot-v2-context.ts`
  - must call the new classifier flow before orchestration
- CRM -> Dify call path
  - must add a classifier workflow call before the composer call

### New artifact to add

- `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`
  - dedicated classifier workflow
- `dify-config/medora-ai-chatbot-v2-faq-grounding.dsl.yml`
  - dedicated FAQ grounding workflow

---

## Target End State

For each user turn:

1. CRM gathers:
   - recent messages (last 6, last one is current user message)
   - conversation summary
   - journey snapshot
   - lightweight allowed resource hints
2. CRM calls a dedicated Dify classifier workflow
3. classifier returns:
   - `requestClass`
   - `targetResourceTypes`
   - `includeProgressionFollowUp`
4. CRM conversation orchestrator decides:
   - response intent
   - allowed resources
   - journey update
   - whether progression follow-up is accepted
    - whether FAQ grounding is required
5. if needed, CRM calls the dedicated FAQ grounding workflow
6. CRM calls the existing composer workflow
7. CRM assembles final assistant message and metadata

This preserves the architecture:

- classifier understands
- orchestrator decides
- FAQ grounder retrieves evidence
- composer speaks

---

## File Plan

### CRM backend

**Create**

- `packages/application/src/services/chatbot-v2/llm-request-classifier.service.ts`
  - purpose: call the dedicated classifier workflow and return structured classification output
- `packages/application/src/services/__tests__/chatbot-v2/llm-request-classifier.service.test.ts`
  - purpose: verify classifier input shaping, result parsing, and invalid-output handling
- `apps/api/src/__tests__/dify-classifier-v2.contract.test.ts`
  - purpose: lock the dedicated classifier workflow contract
- `apps/api/src/__tests__/dify-faq-grounding-v2.contract.test.ts`
  - purpose: lock the dedicated FAQ grounding workflow contract

**Modify**

- `packages/application/src/services/chatbot-v2/types.ts`
  - purpose: add structured classifier result types and classifier-input types
- `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`
  - purpose: add schemas for classifier request/result envelopes if shared validation should own them
- `packages/application/src/services/chatbot-v2/request-classifier.service.ts`
  - purpose: remove this old rule-based service entirely and retire its usages; do not keep it as a local keyword fallback
- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
  - purpose: accept classifier output as input instead of self-classifying internally
- `apps/api/src/routes/chatbot-v2-context.ts`
  - purpose: build classifier inputs, invoke classifier service, then invoke orchestrator
- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
  - purpose: decide when FAQ grounding is required without changing the existing journey ownership model
- `apps/api/src/routes/chatbot.routes.ts`
  - purpose: pass the richer classifier-driven v2 context into the FAQ-grounding/composer call chain and final metadata
- `apps/api/src/routes/patient-widget-starter.ts`
  - purpose: use the same classifier-orchestrator-faq-grounding-composer path for the starter turn where applicable
- `apps/api/src/composition-root.ts`
  - purpose: wire separate classifier/composer Dify configuration and services
- `packages/infrastructure/services/dify-api-client.service.ts`
  - purpose: support the dedicated classifier app call path without breaking the composer path
- `packages/infrastructure/__tests__/unit/dify-api-client.service.test.ts`
  - purpose: lock classifier/composer transport behavior and app-key handling
- `.env.example`
  - purpose: document any additional classifier app configuration
- `packages/application/src/index.ts`
  - purpose: remove obsolete request-classifier export and expose the new classifier service
- `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
  - purpose: remove rule-based assumptions and assert classifier-driven orchestration behavior
- `apps/api/src/__tests__/dify-workflow-v2.contract.test.ts`
  - purpose: keep the composer workflow contract aligned after classifier extraction
- `apps/api/src/__tests__/chatbot.routes.test.ts`
- `apps/api/src/__tests__/patient-public.routes.test.ts`
- `apps/api/src/__tests__/patient-auth.routes.test.ts`
  - purpose: assert API behavior under the new classification path

### Dify

**Create**

- `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`
  - purpose: dedicated structured classifier workflow
- `dify-config/medora-ai-chatbot-v2-faq-grounding.dsl.yml`
  - purpose: dedicated FAQ grounding workflow

**Modify**

- `dify-config/medora-ai-chatbot-v2.dsl.yml`
  - purpose: keep it as composer-only and ensure it consumes classifier/orchestrator/grounding outputs cleanly

---

## Chunk 1: Lock the Classifier Contract With Tests

### Task 1: Add failing shared-validation and orchestration tests

**Files**

- Modify: `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`
- Modify: `packages/shared/validation/src/__tests__/chatbot-v2/chat-journey.schema.test.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v2/request-classifier.service.test.ts`

- [ ] **Step 1: Add failing schema assertions for classifier result shape**
  Cover:
  - `requestClass`
  - `targetResourceTypes`
  - `includeProgressionFollowUp`
  - FAQ requiring empty target resources
  - duplicate `targetResourceTypes` rejected

- [ ] **Step 2: Add failing orchestration tests that assume classification is injected, not inferred**
  Cover:
  - FAQ + no progression follow-up
  - FAQ + accepted progression follow-up
  - `process_explanation` targeting `PROCESS_GUIDE`
  - `process_explanation` in a later stage remains informational and does not rewind the journey
  - `progression_request` with empty `targetResourceTypes`
  - explicit `resource_request` beating progression
  - `resource_status_question` remaining distinct from `resource_request`
  - `human_help_request` with and without `HUMAN_HANDOFF` present in hints

- [ ] **Step 3: Remove or rewrite tests that lock in keyword matching**
  The old tests should no longer assert pattern-based routing.

- [ ] **Step 4: Run targeted tests and confirm expected failures**
  Run:
  ```bash
  pnpm --filter @medical-crm/shared-validation test -- --runInBand packages/shared/validation/src/__tests__/chatbot-v2/chat-journey.schema.test.ts
  pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chatbot-v2/request-classifier.service.test.ts packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts
  ```
  Expected: FAIL because the implementation still relies on local rule-based classification.

---

## Chunk 2: Introduce the Structured Classifier Contract

### Task 2: Add classifier types and shared schemas

**Files**

- Modify: `packages/application/src/services/chatbot-v2/types.ts`
- Modify: `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`
- Modify: `packages/shared/validation/src/__tests__/chatbot-v2/chat-journey.schema.test.ts`

- [ ] **Step 1: Define classifier input types**
  Include at minimum:
  - `recentMessages`
  - `conversationSummary`
  - `journeySnapshot`
  - `allowedResourceHints`

- [ ] **Step 2: Define classifier result types**
  Include:
  - `requestClass`
  - `targetResourceTypes`
  - `includeProgressionFollowUp`

- [ ] **Step 3: Encode the spec rules in schema validation**
  Include:
  - FAQ must have empty target resources
  - only `faq` and `process_explanation` may set progression follow-up
  - target resources must be unique

- [ ] **Step 4: Run targeted tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/shared-validation test -- --runInBand packages/shared/validation/src/__tests__/chatbot-v2/chat-journey.schema.test.ts
  ```
  Expected: PASS.

---

## Chunk 3: Build the CRM-Side LLM Classifier Adapter

### Task 3: Implement a dedicated classifier service

**Files**

- Create: `packages/application/src/services/chatbot-v2/llm-request-classifier.service.ts`
- Create: `packages/application/src/services/__tests__/chatbot-v2/llm-request-classifier.service.test.ts`
- Modify: `packages/application/src/services/chatbot-v2/request-classifier.service.ts`
- Modify: `apps/api/src/composition-root.ts`
- Modify: `packages/infrastructure/services/dify-api-client.service.ts`
- Modify: `packages/infrastructure/__tests__/unit/dify-api-client.service.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing unit tests for the LLM classifier service**
  Cover:
  - building the Dify classifier request payload
  - parsing valid classifier results
  - rejecting invalid or schema-breaking output
  - handling missing/empty conversation summary
  - ensuring only 6 recent messages are passed

- [ ] **Step 2: Implement the service as a thin adapter**
  It should:
  - accept already-shaped classifier inputs
  - call the dedicated Dify classifier workflow
  - parse the structured result through shared validation
  - return a typed classifier result

- [ ] **Step 3: Remove the old rule-based classifier service completely**
  Do this explicitly:
  - delete `packages/application/src/services/chatbot-v2/request-classifier.service.ts`
  - delete or replace its rule-based tests
  - remove the old export from `packages/application/src/index.ts`
  - update all consumers to depend on the new classifier path
  Do not keep a local keyword-matching fallback.

- [ ] **Step 4: Wire the new service through composition root**
  Keep construction narrow and avoid touching unrelated services.

- [ ] **Step 5: Add classifier-app transport and configuration support**
  Cover:
  - separate classifier app key/env wiring
  - composition-root construction for classifier vs composer clients
  - client tests proving the existing composer call path remains intact

- [ ] **Step 6: Run targeted tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chatbot-v2/llm-request-classifier.service.test.ts packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts
  pnpm --filter @medical-crm/infrastructure test -- --runInBand packages/infrastructure/__tests__/unit/dify-api-client.service.test.ts
  ```
  Expected: PASS.

---

## Chunk 4: Refactor the Orchestrator to Consume Classifier Output

### Task 4: Decouple orchestration from local text matching

**Files**

- Modify: `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`

- [ ] **Step 1: Change orchestrator input to accept classifier output**
  The orchestrator should stop calling `classify()` internally.

- [ ] **Step 2: Implement progression-follow-up handling**
  Support:
  - `faq` or `process_explanation` with `includeProgressionFollowUp = true`
  - CRM decides whether that follow-up is actually accepted
  - acceptance should be derived from current journey and allowed resources

- [ ] **Step 3: Keep progression ownership in CRM**
  Ensure:
  - classifier does not change stage
  - orchestrator still computes `journeyUpdate`
  - explicit `resource_request` remains separate from `progression_request`
  - `process_explanation` in later stages may return `PROCESS_GUIDE` but must never rewind `currentStage/currentPhase`

- [ ] **Step 4: Run targeted tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts
  ```
  Expected: PASS.

---

## Chunk 5: Add the Dedicated Dify Classifier Workflow

### Task 5: Implement the classifier DSL

**Files**

- Create: `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`
- Create: `apps/api/src/__tests__/dify-classifier-v2.contract.test.ts`
- Modify: `dify-config/medora-ai-chatbot-v2.dsl.yml`

- [ ] **Step 1: Write the failing classifier workflow contract test**
  Assert:
  - classifier start inputs match the spec
  - output contains only the structured classifier fields
  - workflow does not include writeback or final user-facing answer generation

- [ ] **Step 2: Build the dedicated classifier workflow**
  Recommended node shape:
  - `start`
  - `classifier_llm`
  - `normalize_classifier_output`
  - `final_answer`

- [ ] **Step 3: Keep the prompt description-driven and multilingual**
  Do not add language-specific keyword lists or example-heavy prompting.

- [ ] **Step 4: Keep the composer workflow focused**
  Update `medora-ai-chatbot-v2.dsl.yml` only as needed so it consumes classifier/orchestrator outputs rather than silently re-classifying.
  The existing composer workflow contract test must also assert that any accepted progression-follow-up signal is passed in as an input and consumed there, not re-derived inside the composer workflow.

- [ ] **Step 5: Run targeted tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/api test -- --runInBand apps/api/src/__tests__/dify-classifier-v2.contract.test.ts apps/api/src/__tests__/dify-workflow-v2.contract.test.ts
  ```
  Expected: PASS.

---

## Chunk 6: Thread Classifier -> Orchestrator -> Composer Through the API Routes

### Task 6: Update route-level context building

**Files**

- Modify: `apps/api/src/routes/chatbot-v2-context.ts`
- Modify: `apps/api/src/routes/chatbot.routes.ts`
- Modify: `apps/api/src/routes/patient-widget-starter.ts`
- Modify: `apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `apps/api/src/__tests__/patient-public.routes.test.ts`
- Modify: `apps/api/src/__tests__/patient-auth.routes.test.ts`

- [ ] **Step 1: Build classifier inputs from existing reusable state**
  Reuse:
  - `journeySnapshot`
  - `conversationSummary`
  - recent message history already accessible through the chat session/message repos
  - resource registry output to derive lightweight `allowedResourceHints`

- [ ] **Step 2: Call classifier before orchestration**
  Ensure:
  - empty user message starter flows are still handled safely
  - normal user turns run classifier -> orchestrator -> composer

- [ ] **Step 3: Persist minimal useful metadata**
  Keep metadata small:
  - `chatbotV2`
  - `classifierResult`

- [ ] **Step 4: Preserve current top-level frontend contract**
  Continue returning:
  - `journeySnapshot`
  - `resources`
  - compatible `metadata`

- [ ] **Step 5: Run targeted route tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/api test -- --runInBand apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/patient-public.routes.test.ts apps/api/src/__tests__/patient-auth.routes.test.ts
  ```
  Expected: PASS.

---

## Chunk 7: Regression and Live-Behavior Safety

### Task 7: Prove the new classifier removes the brittle rule-based behavior

If Chunk 8 is added, rerun this chunk after Chunk 8 completes so the final regression pass covers FAQ grounding too.

**Files**

- Modify: existing chatbot-v2 service tests and route tests as needed
- Update smoke-test notes/docs only if necessary

- [ ] **Step 1: Add regression tests for the previously broken behavior**
  Cover:
  - multilingual FAQ that should not map to a resource
  - FAQ turns that require grounding before composition
  - FAQ turns preserving `faqScope = GENERAL_ONLY | HOSPITAL_AWARE`
  - `GENERAL_ONLY` retrieval never silently escalating into `HOSPITAL_AWARE`
  - process explanation targeting `PROCESS_GUIDE`
  - process explanation during later stages remains explanatory only and does not regress journey
  - explicit resource request winning over progression
  - FAQ plus progression follow-up
  - status question for a submitted resource still classifying correctly
  - human request without `HUMAN_HANDOFF` in hints still returning `human_help_request`

- [ ] **Step 2: Run the focused CRM test suites**
  Run:
  ```bash
  pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chatbot-v2/*.test.ts
  pnpm --filter @medical-crm/api test -- --runInBand apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/patient-public.routes.test.ts apps/api/src/__tests__/dify-classifier-v2.contract.test.ts apps/api/src/__tests__/dify-workflow-v2.contract.test.ts
  ```
  Expected: PASS.

- [ ] **Step 3: Manual smoke checklist after implementation**
  Verify with live or near-live turns:
  - FAQ-only turn
  - FAQ turn with category grounding and `GENERAL_ONLY` scope
  - FAQ turn with category grounding and `HOSPITAL_AWARE` scope
  - process explanation turn
  - “continue / next step” turn
  - explicit questionnaire request
  - explicit recommendation request
  - resource status question
  - human-help request
  - FAQ + progression follow-up turn

---

## Chunk 8: Add FAQ Grounding Without Rewriting Chunks 1-6

### Task 8: Migrate the strong v1 FAQ grounding semantics into v2

This chunk is additive.

Do not revisit or redesign the earlier classifier/orchestrator/composer chunks unless a narrow FAQ-grounding change requires it.

**Files**

- Create: `dify-config/medora-ai-chatbot-v2-faq-grounding.dsl.yml`
- Create: `apps/api/src/__tests__/dify-faq-grounding-v2.contract.test.ts`
- Modify: `apps/api/src/routes/chatbot.routes.ts`
- Modify: `apps/api/src/routes/patient-widget-starter.ts`
- Modify: `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
- Modify: `apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `apps/api/src/__tests__/patient-public.routes.test.ts`
- Modify: `dify-config/medora-ai-chatbot-v2.dsl.yml`

- [ ] **Step 1: Write failing FAQ-grounding contract tests**
  Cover:
  - grounding workflow takes CRM-provided FAQ categories/context
  - grounding workflow preserves `faqScope = GENERAL_ONLY | HOSPITAL_AWARE`
  - grounding workflow does not generate final user-facing text
  - grounding workflow uses a smaller node structure than v1

- [ ] **Step 2: Implement the dedicated FAQ grounding workflow**
  Preferred shape:
  - `start`
  - FAQ categories/context fetch
  - FAQ category + scope resolver
  - one compact code/router node
  - FAQ retrieval nodes
  - grounded output

- [ ] **Step 3: Preserve v1 semantics without preserving v1 graph complexity**
  Ensure:
  - category selection stays within CRM-provided categories
  - `faqScope` stays explicit
  - `HOSPITAL_AWARE` is semantic scope, not fallback after a general retrieval miss
  - v1-style multiple visible gate nodes are not recreated unless truly required

- [ ] **Step 4: Thread FAQ grounding through the CRM route path**
  Ensure:
  - `faq` turns may invoke FAQ grounding before composition
  - `process_explanation` turns may invoke FAQ grounding when evidence is needed
  - later-stage `process_explanation` turns remain explanatory only and do not rewind the journey
  - composer consumes grounded FAQ context instead of re-resolving categories/scopes internally

- [ ] **Step 5: Run targeted tests**
  Run:
  ```bash
  pnpm --filter @medical-crm/api test -- --runInBand apps/api/src/__tests__/dify-faq-grounding-v2.contract.test.ts apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/patient-public.routes.test.ts
  pnpm --filter @medical-crm/application test -- --runInBand packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts
  ```
  Expected: PASS.

---

## Review Requirements

For each completed chunk:

- request code review
- include the classifier spec in the review request
- include the broader chat-journey architecture spec
- include what is already implemented and being reused
- include the exact files changed in that chunk
- apply `receiving-code-review` rigor before accepting reviewer feedback

Do not proceed to the next chunk while important issues remain open in the current chunk.

---

## Definition of Done

This plan is complete when:

1. no rule-based keyword classification remains in `chatbot-v2`
2. a dedicated Dify classifier workflow exists
3. a dedicated FAQ grounding workflow exists for grounded FAQ retrieval
4. CRM calls classifier before orchestration and composer
5. FAQ turns invoke grounding before composition when grounding is required
6. `faqScope = GENERAL_ONLY | HOSPITAL_AWARE` is preserved without recreating the v1 node sprawl
7. `HOSPITAL_AWARE` is not treated as a retrieval fallback from `GENERAL_ONLY`
8. classifier output is strictly structured and schema-validated
9. FAQ/resource/process/progression/human turns are classified through the LLM path
10. the existing journey/resource/composer foundations are reused rather than rebuilt
11. frontend-facing `journeySnapshot` and `resources` behavior remains compatible
