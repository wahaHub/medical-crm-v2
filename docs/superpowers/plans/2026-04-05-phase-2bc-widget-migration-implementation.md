# Phase 2BC Widget Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the useful widget/auth/messaging improvements from `feature/phase-2bc` and `china-phase-2bc` into the current backend-authoritative chatbot architecture without reintroducing pre-bootstrap chat or frontend-owned business orchestration.

**Architecture:** Keep `medical-crm-v2` as the single source of truth for patient/chatbot business state and make `china` a renderer/executor of formal conversations, statuses, and rich blocks. Pull over the shell/auth/restore/messaging foundation from `phase-2bc`, but delete pre-bootstrap history/import and replace phase-driven business prompt logic with backend-driven block rendering.

**Tech Stack:** Hono API, React, TypeScript, TanStack Query, Supabase auth/session restore, Dify-backed chatbot orchestration, Zod validation, existing patient-entry and messaging APIs.

---

## File Map

### `medical-crm-v2`

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-auth.routes.ts`
  - Ensure base-form submit / login / restore responses provision and return the canonical widget chat target and restore-facing backend truth.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/patient-onboarding/init-onboarding.use-case.ts`
  - Ensure onboarding init creates or restores the canonical widget chat target and includes enough backend state for recovery.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`
  - Keep chatbot session behavior aligned with the patient-auth/onboarding truth.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`
  - If needed, expose or normalize restore-facing chatbot orchestration state.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
  - Keep current action/block contract aligned with the migration.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/patient-auth.routes.test.ts`
  - Add submit/login/restore payload assertions.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/patient-onboarding/init-onboarding.use-case.test.ts`
  - Add canonical-target and restore-state coverage.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`
  - Add restore/canonical-target expectations.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/internal.routes.test.ts`
  - Add orchestration state exposure/shape assertions if touched.

### `china` worktree

- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/contexts/PatientAuthContext.tsx`
  - Keep login/session restore model aligned with backend truth.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/contexts/PatientEntryContext.tsx`
  - Remove pre-bootstrap history/import state and retain only shell/restore/mirror state.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/PatientEntryWindow.tsx`
  - Remove phase-driven business prompt composition and wire in formal chat / rich blocks.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/PatientProfileForm.tsx`
  - Remove temporary-history import flow and keep base-form submission focused on auto-login + formal backend bootstrap.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/PatientChatComposer.tsx`
  - Enforce base-form gating and keep composer limited to text + attachments.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/messaging/PatientMessagePanel.tsx`
  - Load only formal CRM conversations/history and remove temporary import UX.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/*`
  - Reuse visual pieces from `china-phase-2bc` while rendering current backend blocks.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/services/api/patient-entry.ts`
  - Ensure restore/load/select/submit handlers call formal backend endpoints only.
- Modify/Create tests under:
  - `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/**/__tests__`
  - `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/contexts/__tests__`
  - `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/services/api/__tests__`

### Reference-only source files from `china-phase-2bc`

- `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/components/chat/PatientEntryWindow.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/components/chat/HospitalSelectionForm.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/components/chat/MedicalFormPromptCard.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/components/chat/MedicalTravelProcessPromptCard.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/components/messaging/PatientMessagePanel.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/contexts/PatientAuthContext.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/contexts/PatientEntryContext.tsx`

Do not merge these files wholesale. Reuse visual patterns and restore logic selectively.

## Chunk 1: Backend Truth and Restore Contract

### Task 1: Lock canonical onboarding/login/restore behavior in tests

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/patient-auth.routes.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/patient-onboarding/init-onboarding.use-case.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`
- Test: same file

- [ ] **Step 1: Write failing tests for base-form-submit and restore expectations**

Add tests that assert:
- base-form completion / onboarding init yields a canonical chatbot session id for the widget
- login and restore payloads expose both formal conversation state and chatbot orchestration state
- selected hospital state is backend-owned and returned as authoritative data

- [ ] **Step 2: Run focused tests to confirm failure**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/api test -- patient-auth.routes.test.ts chatbot.routes.test.ts
pnpm --filter @medical-crm/application test -- init-onboarding.use-case.test.ts
```

Expected: FAIL on missing or incorrect canonical-target / restore assertions

- [ ] **Step 3: Implement minimal backend changes**

Update:
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-auth.routes.ts`
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/patient-onboarding/init-onboarding.use-case.ts`
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`

Ensure:
- canonical widget chat target is explicit at onboarding/login/restore entry points
- restore/read APIs expose enough backend-owned state for widget recovery
- selected hospital is returned as authoritative backend state, not inferred by frontend

- [ ] **Step 4: Re-run focused backend tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/api test -- patient-auth.routes.test.ts chatbot.routes.test.ts
pnpm --filter @medical-crm/application test -- init-onboarding.use-case.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add apps/api/src/routes/patient-auth.routes.ts packages/application/src/use-cases/patient-onboarding/init-onboarding.use-case.ts apps/api/src/routes/chatbot.routes.ts apps/api/src/__tests__/patient-auth.routes.test.ts apps/api/src/__tests__/chatbot.routes.test.ts packages/application/src/use-cases/patient-onboarding/init-onboarding.use-case.test.ts
git commit -m "feat: expose canonical widget onboarding restore state"
```

### Task 2: Verify validation contract stays aligned

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/internal.routes.test.ts`

- [ ] **Step 1: Write or extend schema/route tests**

Add assertions for any newly exposed restore fields or route payload normalization.

- [ ] **Step 2: Run focused tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/api test -- internal.routes.test.ts
```

Expected: FAIL if payload/schema are out of sync

- [ ] **Step 3: Apply minimal schema updates**

Keep the contract DRY and aligned with current rich-block/action model.

- [ ] **Step 4: Re-run tests**

Run the same command and expect PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add packages/shared/validation/src/chatbot.schema.ts apps/api/src/__tests__/internal.routes.test.ts
git commit -m "test: align widget restore contract schema"
```

## Chunk 2: China Shell, Auth Restore, and Formal Messaging Only

### Task 3: Remove pre-bootstrap history/import state from frontend flow

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/contexts/PatientEntryContext.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/PatientProfileForm.tsx`
- Test: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/contexts/__tests__/PatientEntryContext*.test.tsx`
- Test: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/__tests__/PatientProfileForm*.test.tsx`

- [ ] **Step 1: Write failing context tests**

Assert that:
- no pre-bootstrap message queue is kept
- no temporary import/retry state is required for the happy path
- base-form submit does not attempt temporary-history import
- restored state comes from formal backend data only

- [ ] **Step 2: Run focused context tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
npm test -- PatientEntryContext PatientProfileForm
```

Expected: FAIL

- [ ] **Step 3: Strip context responsibilities**

Remove:
- local temporary history
- temporary import bookkeeping
- retry-import UX state
- `PatientProfileForm` importTemporaryHistory path

Keep:
- widget/panel shell state
- active formal conversation
- backend-mirrored status

- [ ] **Step 4: Re-run focused tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
git add src/contexts/PatientEntryContext.tsx src/components/chat/PatientProfileForm.tsx src/contexts/__tests__ src/components/chat/__tests__
git commit -m "refactor: remove temporary widget history state"
```

### Task 4: Enforce base-form gating and keep composer narrow

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/PatientEntryWindow.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/PatientChatComposer.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/patient-entry-widget.helpers.ts`
- Test: component tests near these files

- [ ] **Step 1: Write failing UI tests**

Cover:
- before base-form submit, chat send is disabled
- after base-form submit, formal chat is available
- composer only renders text + attachments and does not host rich blocks

- [ ] **Step 2: Run focused component tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
npm test -- PatientChatComposer PatientEntryWindow
```

Expected: FAIL

- [ ] **Step 3: Implement gating and cleanup**

Ensure:
- no pre-form message send path remains
- no business prompt cards are phase-injected by `PatientEntryWindow`
- composer remains a pure patient input surface

- [ ] **Step 4: Re-run focused tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
git add src/components/chat/PatientEntryWindow.tsx src/components/chat/PatientChatComposer.tsx src/components/chat/patient-entry-widget.helpers.ts
git commit -m "feat: gate formal chat on base profile completion"
```

### Task 5: Preserve shell and formal message panel behavior

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/messaging/PatientMessagePanel.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/messaging/ConversationThread.tsx`
- Test: related messaging tests

- [ ] **Step 1: Add failing tests for formal-only loading**

Assert:
- panel loads formal conversations/history only
- no temporary import warning path remains
- active conversation restore works after login

- [ ] **Step 2: Run focused tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
npm test -- PatientMessagePanel ConversationThread
```

Expected: FAIL

- [ ] **Step 3: Apply minimal implementation**

Keep the good shell UX, remove import-temp assumptions.

- [ ] **Step 4: Re-run focused tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
git add src/components/messaging/PatientMessagePanel.tsx src/components/messaging/ConversationThread.tsx
git commit -m "refactor: load formal crm conversations only"
```

## Chunk 3: Rich Block Migration and Phase-Driven Logic Removal

### Task 6: Convert reused prompt UIs into block renderers

**Files:**
- Modify/Create: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/blocks/*`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/components/chat/ChatMessageBlocks.tsx`
- Test: block renderer tests

- [ ] **Step 1: Write failing renderer tests**

Cover:
- `PROCESS_MODAL_TRIGGER`
- `QUESTIONNAIRE_MODAL_TRIGGER`
- `HOSPITAL_RECOMMENDATION_CARDS`
- `ONLINE_CONSULT_BOOKING_CARD`

and verify that these surfaces are rendered only from backend blocks, not phase conditions.

- [ ] **Step 2: Run focused tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
npm test -- ChatMessageBlocks
```

Expected: FAIL

- [ ] **Step 3: Reuse visuals, replace triggers**

Reuse visual patterns from `china-phase-2bc`, but ensure:
- hospital cards are renderer/executor only
- questionnaire prompt is block-driven
- travel process prompt is block-driven

- [ ] **Step 4: Re-run focused tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
git add src/components/chat/blocks src/components/chat/ChatMessageBlocks.tsx
git commit -m "feat: render backend-driven widget rich blocks"
```

### Task 7: Wire action handlers to formal backend APIs only

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/services/api/patient-entry.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/contexts/PatientEntryContext.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks/src/contexts/PatientAuthContext.tsx`
- Test: related API/context tests

- [ ] **Step 1: Add failing tests for formal action execution**

Assert:
- hospital selection uses formal backend selection APIs
- questionnaire submit uses formal backend intake/questionnaire path
- consult booking uses formal convert/consult request path
- restore reloads backend-owned chatbot orchestration state

- [ ] **Step 2: Run focused tests**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
npm test -- patient-entry PatientAuthContext
```

Expected: FAIL

- [ ] **Step 3: Implement minimal action wiring**

Ensure no handler depends on:
- temporary local widget history
- phase-based business prompt scheduling
- frontend-authored selected hospital truth

- [ ] **Step 4: Re-run focused tests**

Expected: PASS

- [ ] **Step 5: Run typecheck**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
git add src/services/api/patient-entry.ts src/contexts/PatientEntryContext.tsx src/contexts/PatientAuthContext.tsx src/services/api/__tests__ src/contexts/__tests__
git commit -m "feat: wire widget actions to formal backend state"
```

## Chunk 4: End-to-End Verification

### Task 8: Verify backend and frontend flows together

**Files:**
- No new production files required unless fixes are found
- Test/update existing E2E or focused integration tests as needed

- [ ] **Step 1: Run backend-focused verification**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/api test -- chatbot.routes.test.ts internal.routes.test.ts
```

Expected: PASS

- [ ] **Step 2: Run china focused verification**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-chatbot-rich-blocks
npm test -- PatientEntryWindow PatientChatComposer PatientMessagePanel ChatMessageBlocks
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: Manual E2E checklist**

Verify manually:
- base form submit auto-logs in and unlocks chat
- chat remains disabled before base-form submit
- login restore reloads formal conversations and chatbot statuses
- questionnaire/process/recommendation/consult surfaces appear only from backend-driven blocks
- human handoff creates/reuses backend ticket and shows dashboard/email follow-up

- [ ] **Step 4: Commit any verification fixes**

```bash
git add <files>
git commit -m "fix: address widget migration verification issues"
```

Only if changes were required.

## Plan Review Notes

- Review each chunk independently before execution.
- Reject any implementation that reintroduces pre-bootstrap local chat.
- Reject any implementation that lets frontend phase logic decide business block timing.
- Reject any implementation that makes frontend-selected hospital state authoritative.

## Execution Notes

- Use `superpowers:subagent-driven-development` for implementation.
- Keep backend and `china` worktree changes logically separated.
- Prefer small commits after each task or tightly related task pair.
- Verify before claiming any task is complete.

Plan complete and saved to `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/plans/2026-04-05-phase-2bc-widget-migration-implementation.md`. Ready to execute?
