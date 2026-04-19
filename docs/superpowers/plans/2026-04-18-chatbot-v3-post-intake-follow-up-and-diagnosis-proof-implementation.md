# Chatbot V3 Post-Intake Follow-Up And Diagnosis-Proof Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. This plan supersedes the triage-status and `COLLECT_MEDICAL_INPUTS` portions of `docs/superpowers/plans/2026-04-18-chatbot-v3-post-intake-conversation-implementation.md`.

**Goal:** Implement the refined post-intake flow so triage completion is represented by `answersSummary` or explicit skip, recommendation still runs either way, and `COLLECT_MEDICAL_INPUTS` becomes a diagnosis-proof upload step rather than generic records collection.

**Architecture:** Keep the existing supervisor-led runtime, single-writer authority, and canonical stage order. Replace the triage persistence model from `pending|answered|skipped` to `pending|skipped + answersSummary`, normalize any legacy `'answered'` rows on hydration, use structured action `TRIAGE_SUBMITTED` rather than a persisted `answered` truth, and narrow `RecordsAgent` / composer behavior for `COLLECT_MEDICAL_INPUTS` to diagnosis-proof upload semantics. Reuse existing upload/session fields such as `docUploadStatus` instead of inventing a new diagnosis-proof truth tree in this slice.

**Tech Stack:** TypeScript, Hono, Vitest, Zod, Drizzle ORM, supervisor-led `chatbot-v3` runtime.

---

## Chunk 1: Triage Contract Refinement

### Task 1: Remove persisted `answered` state and derive completion from `answersSummary`

**Files:**
- `packages/domain/src/entities/ai-chat-session.entity.ts`
- `packages/domain/__tests__/ai-chat-session.entity.test.ts`
- `packages/infrastructure/database/schema/schema.ts`
- `packages/infrastructure/database/migrations/035_ai_chat_post_intake_conversation.sql` (or a follow-up migration if 035 already landed elsewhere)
- `packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts`
- `packages/application/src/services/chatbot-v3/types.ts`
- `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
- `packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
- `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- `apps/api/src/routes/chatbot-v3.routes.ts`
- `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`

- [ ] Write failing tests that prove:
  - `minimalTriageStatus` only allows `pending | skipped`
  - `minimalTriageAnswersSummary != null` implies `records.minimal_triage.complete = true`
  - `minimalTriageStatus = 'skipped'` implies `records.minimal_triage.complete = true`
  - legacy persisted `'answered'` hydrates into either:
    - `status='pending' + answersSummary + complete=true` when a reliable summary exists, or
    - `status='pending' + answersSummary=null + complete=false` when no reliable summary can be synthesized
  - `TRIAGE_SUBMITTED` advances to `RECOMMENDATION` without ever persisting `status='answered'`

- [ ] Implement the refined persistence/runtime contract.

Implementation notes:
- Do not newly persist `'answered'` anywhere.
- If the request carries `TRIAGE_SUBMITTED`, runtime should compact the user content into `minimalTriageAnswersSummary` and let authority write:
  - `minimalTriageStatus: 'pending'`
  - `minimalTriageAnswersSummary: <summary>`
  - `minimalTriageComplete: true`
- `TRIAGE_SKIPPED` should write:
  - `minimalTriageStatus: 'skipped'`
  - `minimalTriageAnswersSummary: null`
  - `minimalTriageComplete: true`
- Any compatibility helper or truth derivation must compute completion from `answersSummary != null || status === 'skipped'`.
- If old rows or tests still carry `'answered'`, normalize on read; do not preserve it as canonical output.
- Update the schema/migration boundary too: storage must no longer treat `'answered'` as a newly valid persisted canonical value after this slice lands.

- [ ] Verify with focused suites:
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/domain test -- __tests__/ai-chat-session.entity.test.ts`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.mounting.test.ts`

## Chunk 2: Structured Actions And Recommendation Branching

### Task 2: Rename answer action to `TRIAGE_SUBMITTED` and branch recommendation on summary-vs-skip

**Files:**
- `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
- `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`
- `apps/api/src/routes/chatbot-v3/worker-task.ts`
- `apps/api/src/routes/chatbot-v3/records-prompts.ts`
- `apps/api/src/routes/chatbot-v3/recommendation-prompts.ts`
- `apps/api/src/routes/chatbot-v3/response-composer.ts`
- `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- `apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts`
- `apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts`

- [ ] Write failing tests that prove:
  - request schema accepts `TRIAGE_SUBMITTED` and `TRIAGE_SKIPPED`
  - recommendation wording distinguishes:
    - intake + follow-up summary
    - intake-only after skip
  - no composer branch relies on persisted `status='answered'`

- [ ] Implement the action rename and copy updates.

Implementation notes:
- Canonical action names become:
  - `TRIAGE_SUBMITTED`
  - `TRIAGE_SKIPPED`
  - `RECOMMENDATION_SELECTED`
  - `RECOMMENDATION_SKIPPED`
- Recommendation prompt/composer should branch on:
  - `minimalTriageAnswersSummary != null`
  - or `minimalTriageStatus === 'skipped'`
- Opening copy should continue to acknowledge already-completed intake.

- [ ] Verify with focused suites:
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/routes/chatbot-v3/records-llm-adapter.test.ts src/routes/chatbot-v3/recommendation-llm-adapter.test.ts src/routes/chatbot-v3/response-composer.test.ts src/__tests__/chatbot-v3.routes.test.ts`

## Chunk 3: Diagnosis-Proof Upload Semantics For `COLLECT_MEDICAL_INPUTS`

### Task 3: Narrow `COLLECT_MEDICAL_INPUTS` from generic records collection to diagnosis-proof upload

**Files:**
- `apps/api/src/routes/chatbot-v3/records-prompts.ts`
- `apps/api/src/routes/chatbot-v3/records-llm-adapter.ts`
- `apps/api/src/routes/chatbot-v3/records-route-adapter.ts`
- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- `apps/api/src/routes/chatbot-v3/response-composer.ts`
- `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- `apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts`
- `apps/api/src/routes/chatbot-v3/records-route-adapter.test.ts`
- `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
- `packages/application/src/services/chatbot-v3/supervisor-registry.ts`

- [ ] Write failing tests that prove:
  - `COLLECT_MEDICAL_INPUTS` copy asks for diagnosis proof / diagnosis certificate / supporting diagnosis document
  - `COLLECT_MEDICAL_INPUTS` does not reopen generic symptom-history prompts
  - entering `COLLECT_MEDICAL_INPUTS` resets stale pre-stage upload residue so an earlier unrelated upload cannot satisfy the diagnosis-proof step
  - upload cards and the reset `docUploadStatus` still drive the stage correctly

- [ ] Implement the narrowed semantics.

Implementation notes:
- You may keep the same stage name `COLLECT_MEDICAL_INPUTS`.
- You may reuse the existing upload card and `docUploadStatus` workflow.
- But on entry into `COLLECT_MEDICAL_INPUTS`, you must explicitly guard against inherited generic-upload truth; either reset `docUploadStatus` on stage entry or otherwise prove provenance so earlier uploads do not count as diagnosis proof for this stage.
- But prompts, composer text, registry text, and records worker mode semantics must explicitly refer to diagnosis-proof upload, not broad record history collection.
- Avoid inventing a new truth tree unless the code is blocked without it.

- [ ] Verify with focused suites:
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/routes/chatbot-v3/records-llm-adapter.test.ts src/routes/chatbot-v3/records-route-adapter.test.ts src/routes/chatbot-v3/response-composer.test.ts src/__tests__/chatbot-v3.mounting.test.ts`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api typecheck`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application typecheck`

## Final Verification

- [ ] Run the targeted end-to-end stack after all three chunks:
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/domain test -- __tests__/ai-chat-session.entity.test.ts`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.mounting.test.ts src/routes/chatbot-v3/records-llm-adapter.test.ts src/routes/chatbot-v3/records-route-adapter.test.ts src/routes/chatbot-v3/recommendation-llm-adapter.test.ts src/routes/chatbot-v3/response-composer.test.ts`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/domain typecheck`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application typecheck`
  - `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api typecheck`
