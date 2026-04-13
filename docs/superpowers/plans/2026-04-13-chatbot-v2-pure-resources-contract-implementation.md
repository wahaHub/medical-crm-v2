# Chatbot V2 Pure Resources Contract Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `blocks` and public `nextAction` from the chatbot v2 contract so CRM and the China frontend use `journeySnapshot + resources` as the only UI affordance model.

**Architecture:** The implementation is a coordinated breaking change across CRM v2 and the China frontend. CRM route handlers stop building and returning legacy block affordances, while the frontend stops consuming block-based message data and renders only through the existing `chat-v2/resources` registry. Internal `nextAction` and block cleanup happens after the public contract is already pure-resource.

**Tech Stack:** TypeScript, Hono, pnpm workspace packages, React, existing chat-v2 resource registry, Dify-backed composer workflow

---

## File Map

### CRM v2 repo

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/routes/chatbot.routes.ts`
  - Remove public `blocks` / `nextAction` exposure for chatbot v2 responses and history.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/routes/chatbot-block-builder.ts`
  - Phase 2 cleanup target; remove v2-only callers and eventually delete dead compat branches.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/__tests__/chatbot.routes.test.ts`
  - Update live response assertions to pure-resource contract.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/__tests__/patient-public.routes.test.ts`
  - Update starter/history/public contract tests that currently expect block compat.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/__tests__/chatbot-v2-context.test.ts`
  - Keep route/context tests aligned with pure resource semantics where needed.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/packages/shared/validation/src/...`
  - If response schemas still publicly mention `blocks` / `nextAction`, remove them from v2-facing schemas.

### China frontend repo

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/services/api/patient-chatbot.ts`
  - Remove `blocks` and `nextAction` from public chatbot response/history types.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/PatientChatComposer.tsx`
  - Stop merging response `blocks` into fresh assistant messages and keep only `journeySnapshot + resources`.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/PatientEntryWindow.tsx`
  - Stop recovering chatbot affordances from legacy block fields in live/history message normalization.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/PatientChatMessageList.tsx`
  - Remove block-based chatbot v2 affordance branching and render only from `resources`.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/contexts/PatientEntryContext.tsx`
  - Provide the action hooks needed by resource-driven questionnaire/recommendation/consult affordances.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat-v2/ChatV2MessageResources.tsx`
  - Keep as the primary affordance renderer and thread resource-action handlers into renderers.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat-v2/resources/registry.tsx`
  - Replace placeholder resource shells with actual widget reuse where block-driven widgets were previously used.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx`
  - Rewrite block-era rendering expectations into resource-only expectations.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/__tests__/PatientEntryWindow.rich-blocks.test.tsx`
  - Rewrite message normalization/history restoration tests to stop expecting block fallback.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/__tests__/PatientChatComposer.attachments.test.tsx`
  - Update fresh assistant reply normalization to stop merging or asserting `blocks` / `nextAction`.
- Modify: any additional chat message renderer that still branches on `blocks` or `nextAction`
  - likely under `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat*`
- Modify: frontend tests that still expect `blocks` / `nextAction` in chatbot responses.

### Docs

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/docs/analysis/2026-04-12-chatbot-v2-orchestrator-implementation-detail.md`
  - Update contract language after the public API stops exposing legacy affordances.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/docs/analysis/2026-04-13-chatbot-v2-phase-lifecycle-live-regression.md`
  - Only if needed to clarify that legacy block findings are now obsolete.

## Chunk 1: CRM Public Contract Cleanup

### Task 1: Remove `blocks` and public `nextAction` from live v2 chat response

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/routes/chatbot.routes.ts`

- [ ] **Step 1: Write the failing route assertions**

Update the relevant v2 route tests so they no longer expect:

- `nextAction`
- `blocks`

and instead assert:

- `journeySnapshot` exists when v2 is active
- `resources` is returned as the sole affordance collection

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
pnpm --filter @medical-crm/api test src/__tests__/chatbot.routes.test.ts
```

Expected:
- FAIL because route payload still includes `nextAction` / `blocks`

- [ ] **Step 3: Remove public `nextAction` / `blocks` from `/api/v2/chatbot/chat`**

In [`chatbot.routes.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/routes/chatbot.routes.ts):

- stop returning `nextAction` in the JSON response for the v2 chat path
- stop returning `blocks` in the JSON response for the v2 chat path
- keep persisting internal metadata if still needed for Phase 2 cleanup
- keep `journeySnapshot` and `resources`

- [ ] **Step 4: Run the route test and verify it passes**

Run:

```bash
pnpm --filter @medical-crm/api test src/__tests__/chatbot.routes.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression add apps/api/src/routes/chatbot.routes.ts apps/api/src/__tests__/chatbot.routes.test.ts
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression commit -m "Remove chatbot v2 public blocks and nextAction"
```

### Task 2: Remove `blocks` and public `nextAction` from v2 history payloads

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/__tests__/chatbot.routes.integration.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/routes/chatbot.routes.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/packages/shared/validation/src/chatbot.schema.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/packages/shared/validation/src/__tests__/chatbot.schema.test.ts`

- [ ] **Step 1: Write the failing history assertions**

Update history/public tests so v2 assistant messages no longer expect:

- `blocks`
- public `nextAction`

and instead only expect:

- `journeySnapshot`
- `resources`

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
pnpm --filter @medical-crm/validation test src/__tests__/chatbot.schema.test.ts
pnpm --filter @medical-crm/api test src/__tests__/chatbot.routes.test.ts src/__tests__/chatbot.routes.integration.test.ts
```

Expected:
- FAIL because history serializer still emits legacy fields

- [ ] **Step 3: Update history normalization**

In [`chatbot.routes.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/routes/chatbot.routes.ts):

- stop including stored `blocks` in v2 history payloads
- stop including public `nextAction` in v2 history payloads
- keep internal metadata storage untouched until Phase 2
- update shared history response schemas so history parsing matches the new public contract

- [ ] **Step 4: Run the targeted test and verify it passes**

Run:

```bash
pnpm --filter @medical-crm/validation test src/__tests__/chatbot.schema.test.ts
pnpm --filter @medical-crm/api test src/__tests__/chatbot.routes.test.ts src/__tests__/chatbot.routes.integration.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression add apps/api/src/routes/chatbot.routes.ts apps/api/src/__tests__/chatbot.routes.test.ts apps/api/src/__tests__/chatbot.routes.integration.test.ts packages/shared/validation/src/chatbot.schema.ts packages/shared/validation/src/__tests__/chatbot.schema.test.ts
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression commit -m "Strip legacy chatbot v2 history affordances"
```

## Chunk 2: China Frontend Pure-Resources Rendering

### Task 3: Remove `blocks` and `nextAction` from frontend API types

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/services/api/patient-chatbot.ts`

- [ ] **Step 1: Write the failing frontend type/test coverage**

Add or update tests to assert chatbot API consumers rely on:

- `journeySnapshot`
- `resources`

and not:

- `blocks`
- `nextAction`

If no focused tests exist yet, create a small type-level/runtime test near the API layer.

- [ ] **Step 2: Run the targeted test or typecheck to verify failure**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys test -- --runInBand
```

If the suite is too large, run the narrowest relevant test file or use:

```bash
pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys typecheck
```

Expected:
- failure or type breakage because old types still expose legacy fields

- [ ] **Step 3: Simplify frontend API contracts**

In [`patient-chatbot.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/services/api/patient-chatbot.ts):

- remove `blocks` from metadata/message/send-response types
- remove `nextAction` from send-response types
- keep `journeySnapshot` and `resources`

- [ ] **Step 4: Run typecheck/tests and verify they pass**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys typecheck
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys add src/services/api/patient-chatbot.ts
git -C /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys commit -m "Adopt pure resources chatbot API contract"
```

### Task 4: Switch chat UI to resource-only rendering

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/PatientChatMessageList.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/PatientChatComposer.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/PatientEntryWindow.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat-v2/ChatV2MessageResources.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat-v2/resources/registry.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/contexts/PatientEntryContext.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/__tests__/PatientEntryWindow.rich-blocks.test.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/__tests__/PatientChatComposer.attachments.test.tsx`
- Modify: any additional chat message components still branching on `blocks` or `nextAction`

- [ ] **Step 1: Write the failing UI/render test**

Add or update tests that cover:

- assistant message with `resources` renders the correct resource widget
- assistant message without `blocks` still renders affordances
- no branch depends on `nextAction`
- block-era fallback tests are either removed or rewritten to expect resource-only rendering
- fresh assistant replies are normalized without `blocks`
- history restore prefers `resources` and no longer falls back to legacy block metadata
- resource-driven widgets still receive the handlers they need to open questionnaire / submit hospitals / request consult

- [ ] **Step 2: Run the focused frontend test and verify failure**

Run the narrowest test command available for the touched chat component, or fallback to:

```bash
pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys test -- --runInBand
```

Expected:
- FAIL because some renderer still expects block-based data

- [ ] **Step 3: Replace block-driven branches with resource-driven rendering**

Implement:

- assistant message affordances render only from `resources`
- resource registry becomes the single selection path
- existing widget UI is reused inside resource renderers where block widgets were previously used
- any `QUESTIONNAIRE_MODAL_TRIGGER` or `REQUEST_DOC_UPLOAD`-specific render branching is removed or migrated into the relevant resource renderer
- `PatientChatMessageList.tsx` stops preferring legacy blocks over v2 resources
- `PatientChatComposer.tsx` stops storing `blocks` from send responses
- `PatientEntryWindow.tsx` stops recovering chatbot affordances from `metadata.blocks`
- `ChatV2MessageResources` / resource renderers gain the action hooks currently wired through `ChatMessageBlocks`

- [ ] **Step 4: Run tests/typecheck and verify pass**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys test src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx src/components/chat/__tests__/PatientEntryWindow.rich-blocks.test.tsx src/components/chat/__tests__/PatientChatComposer.attachments.test.tsx -- --runInBand
pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys typecheck
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys add src/components/chat/PatientChatMessageList.tsx src/components/chat/PatientChatComposer.tsx src/components/chat/PatientEntryWindow.tsx src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx src/components/chat/__tests__/PatientEntryWindow.rich-blocks.test.tsx src/components/chat/__tests__/PatientChatComposer.attachments.test.tsx src/components/chat-v2 src/contexts/PatientEntryContext.tsx src/services/api
git -C /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys commit -m "Render chatbot affordances from resources only"
```

## Chunk 3: Internal Cleanup, Docs, and Regression Verification

### Task 5: Stop v2 route logic from depending on legacy block compat

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/routes/chatbot.routes.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/routes/chatbot-block-builder.ts`
- Modify: related tests in `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/apps/api/src/__tests__/`

- [ ] **Step 1: Write the failing cleanup test**

Add or update a test proving that chatbot v2 route behavior no longer changes based on block generation side effects.

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/api test src/__tests__/chatbot.routes.test.ts src/__tests__/patient-public.routes.test.ts
```

Expected:
- FAIL while route still invokes compat-only block logic for v2

- [ ] **Step 3: Remove dead compat usage from v2 paths**

Implement:

- stop building `blocks` for chatbot v2 public responses
- remove v2-only callsites that exist only to feed block compat
- leave non-v2 or unrelated legacy code alone unless proven dead

- [ ] **Step 4: Run focused tests and verify pass**

Run:

```bash
pnpm --filter @medical-crm/api test src/__tests__/chatbot.routes.test.ts src/__tests__/patient-public.routes.test.ts src/__tests__/chatbot-v2-context.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression add apps/api/src/routes/chatbot.routes.ts apps/api/src/routes/chatbot-block-builder.ts apps/api/src/__tests__
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression commit -m "Remove chatbot v2 block compat routing"
```

### Task 6: Update docs and run end-to-end regression

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression/docs/analysis/2026-04-12-chatbot-v2-orchestrator-implementation-detail.md`
- Modify: any rollout/regression notes that still mention block-driven affordances as active behavior

- [ ] **Step 1: Update docs to match the pure-resource contract**

Document:

- v2 public contract no longer includes `blocks`
- v2 public contract no longer includes public `nextAction`
- frontend now renders only from `resources`

- [ ] **Step 2: Run CRM verification**

Run:

```bash
pnpm --filter @medical-crm/api test src/__tests__/chatbot.routes.test.ts src/__tests__/patient-public.routes.test.ts src/__tests__/chatbot-v2-context.test.ts
pnpm --filter @medical-crm/api typecheck
pnpm --filter @medical-crm/application test src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts
pnpm --filter @medical-crm/application typecheck
```

Expected:
- PASS

- [ ] **Step 3: Run frontend verification**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys typecheck
pnpm --dir /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys test -- --runInBand
```

Expected:
- PASS

- [ ] **Step 4: Run coordinated live regression**

After deploying CRM and the China frontend together, manually verify at least:

- fresh session starts at `EXPLAIN_PROCESS.pre`
- `What do you do?` keeps the session in `EXPLAIN_PROCESS.pre`
- explicit consent enters `EXPLAIN_PROCESS.active`
- `EXPLAIN_PROCESS.active` auto-bridges to `COLLECT_MEDICAL_INPUTS.pre`
- `QUESTIONNAIRE` availability is reflected by `resources` and visible UI together
- no chatbot response or history payload includes `blocks`
- no frontend path depends on `nextAction`

- [ ] **Step 5: Commit final docs if needed**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression add docs
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/chatbot-v2-session-regression commit -m "Document pure resources chatbot contract"
```
