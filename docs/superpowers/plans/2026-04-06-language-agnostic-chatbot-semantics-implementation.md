# Language-Agnostic Chatbot Semantics Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development for execution. Use superpowers:test-driven-development before each task implementation and superpowers:requesting-code-review after each completed task or chunk.

**Goal:** Replace the English-biased backend semantic interpretation layer with an extraction-led, language-agnostic canonical semantic contract while preserving backend-owned safety, state gating, and rich-block orchestration.

**Architecture:** Keep the existing `extraction_llm` node, but change it to emit a strict canonical semantic contract. Update backend policy decision flow to consume the canonical contract directly, use deterministic fallback on invalid output, map semantics to final actions, and remove old intent/engagement resolver main-path logic.

**Tech Stack:** Dify workflow DSL, Hono API, TypeScript, Zod, existing policy-engine services, CRM-backed chatbot orchestration, backend rich-block contract, current Dify integration tests.

---

## File Map

### Dify workflow and extraction contract

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`
  - Replace weak extraction fields with the strict canonical semantic contract.
  - Update prompt examples so equivalent multilingual queries map to the same enums.

### Backend shared schema and DTOs

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
  - Define canonical semantic enums and validation shapes used by backend/public parsing.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/__tests__/chatbot.schema.test.ts`
  - Add strict enum validation and deterministic-fallback-facing parse tests.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/dtos/ai-policy.dto.ts`
  - Align policy DTOs to the canonical semantic fields.

### Backend policy decision flow

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
  - Stop consuming `possibleIntent`, `possibleRisk`, `affirmative`, and `negative` for main-path semantic selection.
  - Parse canonical extraction output, apply deterministic fallback, and pass canonical enums into mapping/planning.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts`
  - Cover invalid extraction fallback and canonical-semantics-driven action routing.

### Backend semantic mapping and workflow gating

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-planner.service.ts`
  - Consume canonical semantic enums instead of old resolver output semantics.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/recommendation-policy.service.ts`
  - Keep recommendation readiness gating driven by canonical semantics and workflow state.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/writeback-planner.service.ts`
  - Ensure writeback expectations still align with canonical final actions.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/recommendation-policy.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/writeback-planner.service.test.ts`

### Old resolver removal

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts`
  - Remove dependency injection wiring for the old semantic resolvers once the canonical path is live.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/index.ts`
  - Remove exported references to the old semantic resolvers once they are no longer shipped.
- Modify or delete: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/intent-resolver.service.ts`
- Modify or delete: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/engagement-mode-resolver.service.ts`
- Modify or delete tests:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/intent-resolver.service.test.ts`
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/engagement-mode-resolver.service.test.ts`

### API and live-contract coverage

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`
  - Keep the live Dify-to-backend decide/context ingress aligned with the canonical semantic contract.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/internal.routes.test.ts`
  - Add ingress-shape coverage for the canonical semantic payload.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`
  - Normalize/expose the new canonical semantics through persisted message metadata and public responses if needed.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`
  - Add canonical semantic response coverage.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts`
  - Enforce the new extraction schema and contract against the Dify DSL.

---

## Chunk 1: Define and Validate the Canonical Semantic Contract

### Task 1: Add canonical semantic enums and strict validation

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/__tests__/chatbot.schema.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/dtos/ai-policy.dto.ts`

- [ ] **Step 1: Write failing schema tests**

Add tests for:
- required canonical fields:
  - `resolvedIntent`
  - `engagementSignal`
  - `progressionSignal`
  - `recommendationSignal`
  - `mentionsCondition`
  - `mentionsDoctorOrHospitalNeed`
- allowed enum values only
- rejection of legacy weak semantic fields as sufficient main-path payload
- deterministic fallback helper shape if the codebase uses one here

- [ ] **Step 2: Run focused tests to verify failure**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm test packages/shared/validation/src/__tests__/chatbot.schema.test.ts
```

Expected: FAIL because the new canonical schema is not implemented yet.

- [ ] **Step 3: Implement the minimal strict schema**

Update the validation layer to define:
- strict enum schemas
- canonical extraction payload schema
- any DTO aliases the policy layer needs

Do not add compatibility text parsing here. This layer should only validate structure and enums.

- [ ] **Step 4: Re-run the focused tests**

Run the same command and expect PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add packages/shared/validation/src/chatbot.schema.ts packages/shared/validation/src/__tests__/chatbot.schema.test.ts packages/application/src/dtos/ai-policy.dto.ts
git commit -m "feat: add canonical chatbot semantic contract"
```

## Chunk 2: Upgrade Dify Extraction to Emit the Canonical Contract

### Task 2: Rewrite extraction output and prompt examples in the existing Dify node

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts`

- [ ] **Step 1: Add failing contract tests**

Extend the Dify workflow contract test to assert that the extraction output schema:
- no longer treats `possibleIntent`, `possibleRisk`, `affirmative`, or `negative` as the primary extraction contract
- includes the six canonical fields
- constrains enum fields to the approved values

- [ ] **Step 2: Run the focused workflow contract test**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/api test -- dify-workflow.contract.test.ts
```

Expected: FAIL because the Dify DSL still outputs the old weak fields.

- [ ] **Step 3: Update the extraction node**

In the existing extraction node:
- replace the old weak semantic output shape with the canonical contract
- add multilingual examples for the same semantic intent classes
- explicitly instruct the model that semantically equivalent messages across languages must map to the same enums
- keep this in the existing node rather than adding a new node

- [ ] **Step 4: Audit the DSL for old weak semantic-field references**

Verify that `possibleIntent`, `possibleRisk`, `affirmative`, and `negative` no longer appear anywhere in the shipped DSL after the extraction rewrite.

- [ ] **Step 5: Re-run the focused workflow contract test**

Run the same command and expect PASS.

- [ ] **Step 6: Re-import and publish the updated DSL in Dify**

After the DSL file and contract test are green:

- import `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml` into the local Dify app
- publish the workflow so the running chatbot actually uses the new extraction contract

This is required before any later live smoke.

- [ ] **Step 7: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add dify-config/medora-ai-chatbot-v1.dsl.yml apps/api/src/__tests__/dify-workflow.contract.test.ts
git commit -m "feat: upgrade extraction to canonical semantics"
```

## Chunk 3: Rewire Policy Decision Flow to Consume Canonical Semantics

### Task 3: Parse canonical extraction output and apply deterministic fallback

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts`

- [ ] **Step 1: Write failing use-case tests**

Add tests that assert:
- valid canonical extraction output is consumed directly
- invalid enum values trigger deterministic fallback
- missing canonical fields trigger deterministic fallback
- old weak fields alone no longer drive semantic meaning

- [ ] **Step 2: Run the focused use-case tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm test packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts
```

Expected: FAIL because the use case still consumes old weak signals and old resolvers.

- [ ] **Step 3: Implement the new semantic ingestion**

In `decide-ai-policy.use-case.ts`:
- parse the canonical extraction payload
- apply deterministic fallback when parsing fails
- stop using `possibleIntent`, `possibleRisk`, `affirmative`, and `negative` for main-path semantic selection
- feed the canonical fields into action mapping
- remove the old intent and engagement resolver calls from the live decision path in this same task

Do not keep text-based semantic recovery logic here.

- [ ] **Step 4: Re-run the focused use-case tests**

Run the same command and expect PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts
git commit -m "refactor: make policy decisions consume canonical semantics"
```

## Chunk 4: Rewrite Action Mapping to Use Canonical Enums

### Task 4: Replace old semantic assumptions in action planning

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-planner.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/recommendation-policy.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/writeback-planner.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/recommendation-policy.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/writeback-planner.service.test.ts`

- [ ] **Step 1: Write failing planner and policy tests**

Add cases for:
- `ASK_CONSULT_PROCESS -> EXPLAIN_CONSULT_PROCESS`
- `ASK_CONSULT_PROCESS + progression readiness -> INVITE_ONLINE_CONSULT`
- `ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION + insufficient readiness -> REQUEST_DOC_UPLOAD`
- `ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION + sufficient readiness -> SHOW_HOSPITAL_RECOMMENDATIONS`
- `ASK_FOR_HOSPITAL_RECOMMENDATION + insufficient readiness -> REQUEST_DOC_UPLOAD`
- `ASK_FOR_HOSPITAL_RECOMMENDATION + sufficient readiness -> SHOW_HOSPITAL_RECOMMENDATIONS`
- `REQUEST_DOC_UPLOAD`
- `ACCEPT_DOC_UPLOAD`
- `REQUEST_HUMAN_HANDOFF -> HUMAN_HANDOFF`

- [ ] **Step 2: Run focused planner tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm test packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts
pnpm test packages/application/src/services/__tests__/policy-engine/recommendation-policy.service.test.ts
pnpm test packages/application/src/services/__tests__/policy-engine/writeback-planner.service.test.ts
```

Expected: FAIL because planner logic still reflects the old semantic model.

- [ ] **Step 3: Implement the minimal mapping rewrite**

Update planner and gating code so:
- canonical semantic enums drive candidate action selection
- workflow state gates whether the action is allowed now
- rich blocks continue to derive from final action

Do not reintroduce natural-language matching here.

- [ ] **Step 4: Re-run the focused tests**

Run the same commands and expect PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add packages/application/src/services/policy-engine/action-planner.service.ts packages/application/src/services/policy-engine/recommendation-policy.service.ts packages/application/src/services/policy-engine/writeback-planner.service.ts packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts packages/application/src/services/__tests__/policy-engine/recommendation-policy.service.test.ts packages/application/src/services/__tests__/policy-engine/writeback-planner.service.test.ts
git commit -m "refactor: map canonical semantics to final chatbot actions"
```

## Chunk 5: Remove Old Resolver Main-Path Logic

### Task 5: Delete intent and engagement resolver main-path usage

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/index.ts`
- Modify or delete: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/intent-resolver.service.ts`
- Modify or delete: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/engagement-mode-resolver.service.ts`
- Modify or delete tests:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/intent-resolver.service.test.ts`
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/engagement-mode-resolver.service.test.ts`
- Modify any imports in:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/policy-evaluation.test.ts`

- [ ] **Step 1: Write or update failing tests around dependency removal**

Add assertions that policy evaluation no longer depends on the old resolver path for primary semantics.

- [ ] **Step 2: Run the focused policy-evaluation tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm test packages/application/src/services/__tests__/policy-engine/policy-evaluation.test.ts
```

Expected: FAIL if deleted imports, DI wiring, or policy-evaluation expectations still assume the old resolvers exist.

- [ ] **Step 3: Remove the old resolver path**

Prefer the more complete cleanup:
- remove main-path calls
- remove composition-root wiring
- remove package-level exports
- delete the old services and their dedicated tests if they are no longer needed anywhere

If a tiny temporary debug helper must survive, it must not affect production decisions.

- [ ] **Step 4: Re-run the focused tests**

Run the same command and expect PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add apps/api/src/composition-root.ts packages/application/src/index.ts packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts packages/application/src/services/__tests__/policy-engine/policy-evaluation.test.ts packages/application/src/services/policy-engine packages/application/src/services/__tests__/policy-engine
git commit -m "refactor: remove legacy semantic resolvers from main path"
```

## Chunk 6: Align API Serialization and Persisted Metadata

### Task 6: Keep route parsing and stored metadata aligned with canonical semantics

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/internal.routes.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify if needed: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/domain/src/entities/ai-chat-message.entity.ts`
- Modify if needed: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/domain/src/ports/ai-chat-message-repository.port.ts`
- Modify if needed: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/repositories/drizzle-ai-chat-message.repository.ts`

- [ ] **Step 1: Write failing route tests**

Cover:
- internal Dify ingress accepts/parses the canonical semantic fields
- canonical semantic fields can be parsed from Dify responses
- public chat responses expose the updated semantics consistently
- persisted message metadata still records the right semantic/action values

- [ ] **Step 2: Run focused route tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/api test -- internal.routes.test.ts
pnpm --filter @medical-crm/api test -- chatbot.routes.test.ts
```

Expected: FAIL if parsing/serialization still assumes the old weak fields.

- [ ] **Step 3: Implement the minimal route/entity changes**

Normalize:
- internal ingress validation/parsing
- route parsing
- stored metadata
- response serialization

Avoid widening free-form string surfaces if enums can be preserved.

- [ ] **Step 4: Re-run the focused tests**

Run the same command and expect PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add apps/api/src/routes/internal.routes.ts apps/api/src/__tests__/internal.routes.test.ts apps/api/src/routes/chatbot.routes.ts apps/api/src/__tests__/chatbot.routes.test.ts packages/domain/src/entities/ai-chat-message.entity.ts packages/domain/src/ports/ai-chat-message-repository.port.ts packages/infrastructure/database/repositories/drizzle-ai-chat-message.repository.ts
git commit -m "feat: persist canonical chatbot semantics through api routes"
```

## Chunk 7: Multilingual Regression and End-to-End Coverage

### Task 7: Add multilingual regression cases and validate live-chain semantics

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts`
- Modify if needed: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.integration.test.ts`

- [ ] **Step 1: Write failing multilingual regression tests**

Required regression set:
- Chinese and English service-overview prompts
- Chinese and English consult-process prompts
- Chinese and English doctor/hospital-direction prompts
- Chinese and English recommendation asks

Assertions should verify:
- same canonical semantic contract
- same final action when workflow state is equivalent
- correct rich-block-triggering action when readiness permits

- [ ] **Step 2: Run focused tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/api test -- chatbot.routes.test.ts
pnpm --filter @medical-crm/application test -- decide-ai-policy.use-case.test.ts
```

Expected: FAIL until the new behavior is fully wired.

- [ ] **Step 3: Implement any minimal missing fixes**

Only if the preceding chunks still leave gaps:
- tighten mapping
- tighten fallback behavior
- tighten multilingual extraction normalization

Avoid adding new heuristic text rules.

- [ ] **Step 4: Re-run the focused tests**

Expect PASS.

- [ ] **Step 5: Run a live local smoke**

Run a real local chat flow against:
- `POST /api/v2/chatbot/chat`

Use the regression prompts:
- `你好 我想来了解下你们的服务内容`
- `我想知道咨询流程`
- `我得了颈椎病，我想找颈椎病方向的医生`
- English equivalents

Record:
- canonical semantic fields
- final actions
- whether blocks are present when expected

- [ ] **Step 6: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add apps/api/src/__tests__/chatbot.routes.test.ts packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts apps/api/src/__tests__/chatbot.routes.integration.test.ts
git commit -m "test: add multilingual chatbot semantic regressions"
```

---

## Review Loop

After finishing each chunk:

1. Use `superpowers:requesting-code-review`
2. Fix all valid important findings before moving on
3. Use `superpowers:receiving-code-review` to evaluate reviewer claims before implementing them
4. Re-request review until no important findings remain

## Final Verification

Before calling the migration complete:

- run the updated schema tests
- run Dify workflow contract tests
- run focused policy-engine and route tests
- run multilingual regression tests
- run at least one live local `/api/v2/chatbot/chat` smoke covering Chinese and English
- confirm the old resolver path is no longer part of the main decision flow

## Expected Outcome

After this plan is complete:

- semantic interpretation is language-agnostic
- backend consumes canonical enums instead of English phrase rules
- consult-process questions no longer collapse to generic FAQ
- doctor/hospital-direction questions no longer collapse to generic FAQ
- docs/recommendation/consult/handoff flows remain backend-authoritative and state-aware
- future language support is primarily improved through extraction examples and regression coverage, not backend regex growth
