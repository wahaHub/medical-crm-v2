# Chatbot Rich Blocks And Action Orchestration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shared chatbot rich-message contract across `medical-crm-v2` and `china`, so backend-selected actions can render executable chat UI for process guidance, questionnaire intake, hospital selection, and online consultation requests.

**Architecture:** `medical-crm-v2` remains the single source of truth for `nextAction` and `blocks[]`, with Dify continuing to generate grounded text and the public chatbot route normalizing backend intent into the shared response contract. `china` adds a rich message renderer that consumes `blocks[]`, reuses the existing hospital-card visual language, and executes backend-backed actions inline inside the chat stream.

**Tech Stack:** TypeScript, Hono, Zod, Vitest, Dify DSL, React, existing patient-entry widgets in `china`

---

## Worktree Setup

Use isolated worktrees before implementation. Do not continue coding inside the dirty primary workspaces.

- `medical-crm-v2` implementation worktree: create a new `codex/` branch worktree off the current backend branch
- `china` implementation worktree: create a paired `codex/` branch worktree off `feature/phase-2bc`

Suggested working directories:

- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend`
- `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks`

## File Structure Map

### `medical-crm-v2`

Shared/public contract:

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/domain/src/enums/index.ts`

Action policy and decisioning:

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/dtos/ai-policy.dto.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/intent-resolver.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-planner.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/recommendation-policy.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/writeback-planner.service.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/conversation-summary.service.ts`

Public route normalization and executable payloads:

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`
- Reuse: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/question-collector.routes.ts`
- Reuse: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-protected.routes.ts`

Dify orchestration:

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`

Tests:

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/conversation-summary.service.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts`

### `china`

Message model and renderer:

- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/services/api/patient-messages.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/types/chatbot-blocks.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/PatientChatMessageList.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/ChatMessageBlocks.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/ProcessModalTrigger.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/QuestionnaireModalTrigger.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/HospitalRecommendationCards.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/OnlineConsultBookingCard.tsx`

Existing UI to reuse:

- Reference: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/HospitalSelectionForm.tsx`
- Reference: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/services/api/patient-entry.ts`
- Modify as needed: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/contexts/PatientEntryContext.tsx`

Tests:

- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/ChatbotBlocks.contract.test.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/ChatMessageTriggers.test.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/HospitalRecommendationCards.test.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/OnlineConsultBookingCard.test.tsx`

## Chunk 1: Backend Contract And Policy Foundation

### Task 1: Create isolated worktrees before any implementation

**Files:**
- No source edits

- [ ] **Step 1: Create the backend worktree**

Run:

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 worktree add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend -b codex/chatbot-rich-blocks-backend
```

Expected: new clean backend worktree on a fresh `codex/` branch

- [ ] **Step 2: Create the china worktree**

Run:

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc worktree add /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks -b codex/chatbot-rich-blocks feature/phase-2bc
```

Expected: new clean china worktree on a fresh `codex/` branch

- [ ] **Step 3: Verify the backend worktree is clean**

Run:

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend status --short
```

Expected: no output

- [ ] **Step 4: Verify the china worktree is clean**

Run:

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks status --short
```

Expected: no output

- [ ] **Step 5: Commit**

No commit for this setup step

### Task 2: Extend the shared chatbot response contract for `blocks[]`

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/domain/src/enums/index.ts`
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`

- [ ] **Step 1: Write the failing route/schema tests for rich blocks**

Add tests that assert:

- `REQUEST_DOC_UPLOAD` returns `QUESTIONNAIRE_MODAL_TRIGGER`
- `SHOW_HOSPITAL_RECOMMENDATIONS` can return `HOSPITAL_RECOMMENDATION_CARDS`
- `INVITE_ONLINE_CONSULT` can return `ONLINE_CONSULT_BOOKING_CARD`
- `nextAction` still remains public metadata
- new backend actions preserve the same canonical public `nextAction` string names in the response contract

- [ ] **Step 2: Run the focused route test to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts
```

Expected: failures around unknown block types or missing `blocks` payloads

- [ ] **Step 3: Implement the shared validation contract**

Add or finalize Zod support for:

- `PROCESS_MODAL_TRIGGER`
- `QUESTIONNAIRE_MODAL_TRIGGER`
- `HOSPITAL_RECOMMENDATION_CARDS`
- `ONLINE_CONSULT_BOOKING_CARD`

Make sure:

- `PROCESS_MODAL_TRIGGER` formally includes `modalKey`
- `QUESTIONNAIRE_MODAL_TRIGGER` formally includes `templateId`
- `HOSPITAL_RECOMMENDATION_CARDS` formally includes `caseId` and `selectPath`
- `HOSPITAL_RECOMMENDATION_CARDS` constrains `caseId` and `hospitalId` payloads to the UUID-compatible shape required by `/select-hospitals`
- `ONLINE_CONSULT_BOOKING_CARD` formally includes `requestedAction`, `convertPath`, and a complete `conversionDraft`
- route-level `blocks` normalization stays in the public route task, not in the validation task

- [ ] **Step 4: Run the focused route test again**

Run the same Vitest command.

Expected: schema-related failures move from validation to route behavior

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend add packages/shared/validation/src/chatbot.schema.ts packages/domain/src/enums/index.ts apps/api/src/__tests__/chatbot.routes.test.ts
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend commit -m "feat: add chatbot rich block schema"
```

### Task 3: Align backend action selection with the approved action catalog

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/dtos/ai-policy.dto.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/intent-resolver.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-planner.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/recommendation-policy.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts`
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts`

- [ ] **Step 1: Write or finish failing policy tests**

Cover at least:

- broad journey questions -> `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- `REGULAR` does not default to `SHOW_PACKAGE`
- selected hospital suppresses `SHOW_HOSPITAL_RECOMMENDATIONS` unless alternatives are requested
- recommendation exploration still precedes shortlist when readiness is incomplete

- [ ] **Step 2: Run focused policy tests to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/action-planner.service.test.ts src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts
```

Expected: failures on action routing or recommendation suppression

- [ ] **Step 3: Implement minimal policy changes**

Make these behavioral changes only:

- support `EXPLAIN_MEDICAL_TRAVEL_PROCESS`, `INVITE_ONLINE_CONSULT`, and `HUMAN_HANDOFF` in backend action enums
- keep `SAFETY_HANDOFF` present in backend action enums and policy handling, even though it remains text-only in this MVP
- keep `EXPLAIN_DOC_UPLOAD` and `EXPLAIN_CONSULT_PROCESS` as explicit explanation actions, not accidental fallthroughs
- keep `SHOW_PACKAGE` available only for `COSMETIC`
- ensure recommendation policy suppresses shortlist reopen when `selectedHospitalId` exists unless the intent is for alternatives
- ensure `REQUEST_DOC_UPLOAD` only appears when intake/questionnaire/docs are still needed
- ensure `INVITE_ONLINE_CONSULT` only appears when consultation is not already booked, started, or completed
- keep `nextAction` public while treating `blocks[]` as the rich execution layer

- [ ] **Step 4: Re-run the focused policy tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend add packages/application/src/dtos/ai-policy.dto.ts packages/application/src/services/policy-engine/intent-resolver.service.ts packages/application/src/services/policy-engine/action-planner.service.ts packages/application/src/services/policy-engine/recommendation-policy.service.ts packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts packages/application/src/services/__tests__/policy-engine/action-planner.service.test.ts packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend commit -m "feat: align chatbot action policy"
```

### Task 4: Add compact-summary patching with 2000-character recompress threshold

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/conversation-summary.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/writeback-planner.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/apply-ai-policy-writeback.use-case.ts`
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/conversation-summary.service.test.ts`

- [ ] **Step 1: Write failing summary tests**

Cover:

- patching summary on a normal turn
- preserving recent conversational nuance without adding timestamp fields
- recompress only when the compact summary exceeds `2000` characters

- [ ] **Step 2: Run the summary tests to verify failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/conversation-summary.service.test.ts
```

Expected: FAIL because the service does not exist yet

- [ ] **Step 3: Implement minimal summary patching**

Keep it focused:

- lightweight patch each turn
- recompress only on length overflow
- no per-action timestamp matrix
- read existing structured state as stable inputs:
  - `pendingOffer`
  - `pendingQuestion`
  - `lastNextAction`
  - `docUploadStatus`
  - `consultationStatus`
  - `recommendationStatus`
  - `selectedHospitalId`
- preserve recent raw history outside the compact summary
- patch only the compact summary field; do not replace recent raw history with summarized text

- [ ] **Step 4: Run the summary test again**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend add packages/application/src/services/policy-engine/conversation-summary.service.ts packages/application/src/services/policy-engine/writeback-planner.service.ts packages/application/src/use-cases/ai-policy/apply-ai-policy-writeback.use-case.ts packages/application/src/services/__tests__/policy-engine/conversation-summary.service.test.ts
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend commit -m "feat: patch chatbot conversation summary"
```

## Chunk 2: Backend Rich Payloads And Dify Alignment

### Task 5: Generate rich block payloads in the public chatbot route

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`

- [ ] **Step 1: Extend the route test with block payload expectations**

Add assertions for:

- process action -> `PROCESS_MODAL_TRIGGER`
- questionnaire action -> `QUESTIONNAIRE_MODAL_TRIGGER`
- shortlist action -> `HOSPITAL_RECOMMENDATION_CARDS`
- consult invite -> `ONLINE_CONSULT_BOOKING_CARD`
- human handoff -> text/link only, no rich block
- process block includes `modalKey`
- questionnaire block includes `templateId`
- hospital recommendation block includes `caseId` and `selectPath`
- hospital recommendation block carries UUID-compatible `caseId` and `hospitalId` values
- online consult block includes `requestedAction`, `convertPath`, and a complete `conversionDraft`
- new backend actions preserve the expected public `nextAction` values in the normalized response

- [ ] **Step 2: Run the route test to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts
```

Expected: FAIL on missing blocks or incorrect normalization

- [ ] **Step 3: Implement block synthesis in `chatbot.routes.ts`**

Add focused helpers for:

- block derivation from normalized action + metadata
- hospital shortlist payload shaping
- handoff link text shaping
- safe omission when payload generation fails

If `chatbot.routes.ts` grows awkwardly during this task, split helper logic into focused route-adjacent modules instead of keeping all block synthesis inline.

- [ ] **Step 4: Re-run the route test**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend add apps/api/src/routes/chatbot.routes.ts apps/api/src/__tests__/chatbot.routes.test.ts
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend commit -m "feat: synthesize chatbot rich blocks"
```

### Task 6: Wire questionnaire lookup and questionnaire trigger payloads

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`
- Reuse/inspect: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/question-collector.routes.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`

- [ ] **Step 1: Add failing tests for questionnaire lookup success and fallback**

Cover:

- exact questionnaire lookup returns a trigger block with `templateId`
- ambiguous lookup omits the block and falls back to text

- [ ] **Step 2: Run the chatbot route test to confirm failure**

Use the same route Vitest command.

- [ ] **Step 3: Implement the minimal questionnaire lookup layer**

Use the existing Question Collector registry instead of inventing a new store. Keep lookup deterministic:

- exact `procedureTypes` match first
- `category`-level intake fallback second
- resolved output is the existing QC `templateId`, not a new slug layer
- ambiguity -> omit block and return text fallback

- [ ] **Step 4: Re-run the route test**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend add apps/api/src/routes/internal.routes.ts apps/api/src/routes/chatbot.routes.ts apps/api/src/__tests__/chatbot.routes.test.ts
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend commit -m "feat: add questionnaire trigger lookup"
```

### Task 7: Align Dify with the expanded action catalog and rich-response contract

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts`

- [ ] **Step 1: Write or extend failing workflow contract tests**

Assert that the workflow supports:

- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- `EXPLAIN_DOC_UPLOAD`
- `EXPLAIN_CONSULT_PROCESS`
- `REQUEST_DOC_UPLOAD`
- `INVITE_ONLINE_CONSULT`
- `HUMAN_HANDOFF`
- recommendation exploration vs shortlist

- [ ] **Step 2: Run the Dify contract test**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/dify-workflow.contract.test.ts
```

Expected: FAIL on missing selectors, unsupported actions, or stale workflow nodes

- [ ] **Step 3: Update the DSL minimally**

Keep Dify responsible for:

- grounded text
- FAQ/process/questionnaire/recommendation explanation routing

Keep backend/public route responsible for:

- final block generation

- [ ] **Step 4: Re-run the Dify contract test**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend add dify-config/medora-ai-chatbot-v1.dsl.yml apps/api/src/__tests__/dify-workflow.contract.test.ts
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend commit -m "feat: align dify workflow with chatbot rich actions"
```

## Chunk 3: China Rich Renderer And Cross-Repo E2E

### Task 8: Extend the `china` chat message model to carry blocks

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/services/api/patient-messages.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/PatientChatMessageList.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/ChatMessageBlocks.tsx`
- Test: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx`

- [ ] **Step 1: Write the failing renderer test**

Cover:

- text-only assistant message still renders
- message with `PROCESS_MODAL_TRIGGER` renders block above text
- unknown block type is ignored safely

- [ ] **Step 2: Run the renderer test to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks exec vitest run src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx src/components/chat/__tests__/ChatbotBlocks.contract.test.ts
```

Expected: FAIL because the message type has no `blocks` support

- [ ] **Step 3: Implement the renderer shell**

Add:

- a concrete `ChatbotMessageBlock[]` type in `src/types/chatbot-blocks.ts`
- make that local type intentionally mirror `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
- add a small fixture/parity test that parses backend-shaped sample block payloads so cross-repo contract drift fails fast in `china`
- use `blocks?: ChatbotMessageBlock[]` in the china message model
- a dedicated `ChatMessageBlocks` component
- safe rendering before/above message text

- [ ] **Step 4: Re-run the renderer test**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks add src/services/api/patient-messages.ts src/types/chatbot-blocks.ts src/components/chat/PatientChatMessageList.tsx src/components/chat/ChatMessageBlocks.tsx src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx src/components/chat/__tests__/ChatbotBlocks.contract.test.ts
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks commit -m "feat: render chatbot rich message blocks"
```

### Task 9: Implement the four MVP block renderers

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/ProcessModalTrigger.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/QuestionnaireModalTrigger.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/HospitalRecommendationCards.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/OnlineConsultBookingCard.tsx`
- Reference: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/HospitalSelectionForm.tsx`
- Test: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/HospitalRecommendationCards.test.tsx`
- Test: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/OnlineConsultBookingCard.test.tsx`

- [ ] **Step 1: Write failing component tests**

Cover:

- process trigger opens modal only
- questionnaire trigger opens modal only
- hospital cards render reusable card shape and allow selection
- consult booking card shows idle/submitted/failed states
- trigger components do not mutate backend state on open

- [ ] **Step 2: Run the component tests to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks exec vitest run src/components/chat/__tests__/ChatMessageTriggers.test.tsx src/components/chat/__tests__/HospitalRecommendationCards.test.tsx src/components/chat/__tests__/OnlineConsultBookingCard.test.tsx
```

Expected: FAIL because the block components do not exist yet

- [ ] **Step 3: Implement minimal block components**

Rules:

- hospital cards must mutate backend selection first, then optionally navigate
- process and questionnaire triggers must not mutate backend state on open
- consult card must show inline retry on failure
- reuse `HospitalSelectionForm` styling and field shape rather than inventing a new card language

- [ ] **Step 4: Re-run the component tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks add src/components/chat/blocks/ProcessModalTrigger.tsx src/components/chat/blocks/QuestionnaireModalTrigger.tsx src/components/chat/blocks/HospitalRecommendationCards.tsx src/components/chat/blocks/OnlineConsultBookingCard.tsx src/components/chat/__tests__/ChatMessageTriggers.test.tsx src/components/chat/__tests__/HospitalRecommendationCards.test.tsx src/components/chat/__tests__/OnlineConsultBookingCard.test.tsx
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks commit -m "feat: add chatbot block components"
```

### Task 10: Connect inline actions to existing backend flows

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/services/api/patient-entry.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/contexts/PatientEntryContext.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/HospitalRecommendationCards.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/OnlineConsultBookingCard.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/ChatMessageBlockActions.test.tsx`

- [ ] **Step 1: Add failing integration-style tests or mocks**

Cover:

- hospital selection posts to `/select-hospitals`
- selection is idempotent when re-choosing the same hospital
- consult request posts a complete `conversionDraft` payload to `/api/v2/chatbot/convert`
- failed consult request surfaces retry state
- successful consult request moves the card into submitted state

- [ ] **Step 2: Run the focused frontend tests**

Run the same Vitest command plus any new integration-focused component tests.

- [ ] **Step 3: Implement minimal action wiring**

Use existing APIs:

- hospital selection -> reuse `/select-hospitals`
- consult request -> reuse `/api/v2/chatbot/convert` with the block-provided `conversionDraft`

Do not create new frontend-side business logic beyond request state management.

- [ ] **Step 4: Re-run the focused frontend tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks add src/services/api/patient-entry.ts src/contexts/PatientEntryContext.tsx src/components/chat/blocks/HospitalRecommendationCards.tsx src/components/chat/blocks/OnlineConsultBookingCard.tsx src/components/chat/__tests__/ChatMessageBlockActions.test.tsx
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks commit -m "feat: wire chatbot block actions"
```

### Task 11: Run cross-repo verification and manual E2E

**Files:**
- No planned source changes unless bugs are found

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/action-planner.service.test.ts src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts src/services/__tests__/policy-engine/conversation-summary.service.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts src/__tests__/dify-workflow.contract.test.ts
```

Expected: PASS

- [ ] **Step 2: Run china focused tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks exec vitest run src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx src/components/chat/__tests__/ChatbotBlocks.contract.test.ts src/components/chat/__tests__/HospitalRecommendationCards.test.tsx src/components/chat/__tests__/OnlineConsultBookingCard.test.tsx
```

Expected: PASS

- [ ] **Step 3: Re-import and publish the updated Dify DSL**

Manual:

- import `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-rich-blocks-backend/dify-config/medora-ai-chatbot-v1.dsl.yml`
- publish the chatbot app
- update CRM app key envs if Dify generated a new key

- [ ] **Step 4: Run multi-turn manual E2E**

Validate at least:

- process explanation -> process modal trigger
- document request -> questionnaire trigger
- recommendation exploration -> shortlist cards -> select hospital
- consult invite -> request submitted
- human handoff -> ticket created or reused

- [ ] **Step 5: Commit any bugfixes discovered during QA**

Use narrowly scoped follow-up commits only if new defects are found
