# Hospital Review Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the remaining hospital portal regressions in messages and materials, and expand surgeon editing to parity with CRM v1.

**Architecture:** Fix the data contracts first so the API returns stable, explicit message and materials shapes, then update the hospital UI to consume those shapes with clear loading and error states. Reuse CRM v1 surgeon form structure, but keep the implementation aligned with v2 repository and DTO boundaries.

**Tech Stack:** Next.js, React, TanStack Query, application/domain packages, Supabase repositories, Vitest, TypeScript

---

## Chunk 1: Messages Detail Correctness

### Task 1: Restore sender metadata and detail fetch visibility

**Files:**
- Modify: `packages/application/src/dtos/conversation.dto.ts`
- Modify: `packages/application/src/mappers/conversation.mapper.ts`
- Modify: `packages/application/src/use-cases/messages/list-messages.use-case.ts`
- Modify: `packages/application/src/use-cases/messages/get-message.use-case.ts`
- Modify: `packages/infrastructure/database/repositories/drizzle-message.repository.ts`
- Modify: `apps/hospital/src/components/messages-view.tsx`
- Modify: `apps/hospital/src/components/case-detail-panel.tsx`
- Modify: `packages/shared/ui/src/components/chat-layout.tsx`
- Test: `packages/application/__tests__/message-crud.use-case.test.ts`

- [ ] Step 1: Write failing tests that require message DTOs to preserve sender role/name and signed attachment URLs.
- [ ] Step 2: Run the targeted application tests and confirm the new assertions fail for the expected reason.
- [ ] Step 3: Extend repository/query/mapping code so message detail payloads include sender metadata from the real user records.
- [ ] Step 4: Update hospital UI to consume returned sender metadata, add explicit loading/error states for detail fetches, and stop inferring role from Keycloak `sub`.
- [ ] Step 5: Re-run targeted message tests and hospital typecheck.

## Chunk 2: Materials Cases Compatibility

### Task 2: Make the materials cases tab load legacy and current data

**Files:**
- Modify: `packages/infrastructure/supabase-main/supabase-materials.repository.ts`
- Modify: `packages/infrastructure/supabase-china/china-medical-materials.repository.ts`
- Modify: `apps/hospital/src/components/materials-tabs.tsx`
- Test: `packages/infrastructure` materials repository tests if present, otherwise add targeted tests under `packages/application/__tests__` or repository-adjacent coverage

- [ ] Step 1: Write a failing test or minimal reproduction for legacy before/after records that only have `case_media`, `beforeAfterImage`, or `mediaItems`.
- [ ] Step 2: Run the targeted test and verify it fails because v2 only reads `case_images`.
- [ ] Step 3: Implement compatibility reads in the relevant materials repositories and preserve the current `case_images` path.
- [ ] Step 4: Add visible loading/error handling in the materials cases tab so detail fetch failures are not silently rendered as empty state.
- [ ] Step 5: Re-run targeted tests and any affected typechecks.

## Chunk 3: Surgeon Parity With CRM v1

### Task 3: Widen surgeon contract and port the richer editor

**Files:**
- Modify: `packages/domain/src/ports/materials-repository.port.ts`
- Modify: `packages/application/src/use-cases/materials/create-surgeon.use-case.ts`
- Modify: `packages/application/src/use-cases/materials/update-surgeon.use-case.ts`
- Modify: `packages/infrastructure/services/routing-materials.repository.ts`
- Modify: `packages/infrastructure/supabase-main/supabase-materials.repository.ts`
- Modify: `packages/infrastructure/supabase-china/china-medical-materials.repository.ts`
- Modify: `apps/hospital/src/lib/api-types.ts`
- Modify: `apps/hospital/src/components/materials-tabs.tsx`

- [ ] Step 1: Write failing tests for create/update surgeon flows covering the v1-only fields: education, certifications, intro, expertise, philosophy, achievements.
- [ ] Step 2: Run those tests and confirm the failures reflect the narrowed v2 contract.
- [ ] Step 3: Expand the domain and use-case inputs, then teach both materials repositories to read/write the wider surgeon payload without breaking existing rows.
- [ ] Step 4: Port the v1 surgeon modal behavior into v2, including repeatable field groups and richer form state, while staying within current v2 UI patterns.
- [ ] Step 5: Re-run targeted tests and hospital typecheck.

## Chunk 4: Verification and Delivery

### Task 4: Verify end-to-end and prepare a clean commit

**Files:**
- Modify: `docs/codex-review-fixes-summary.md` if this round needs addendum

- [ ] Step 1: Run the targeted application, infrastructure, API, and hospital typecheck commands for the changed areas.
- [ ] Step 2: Inspect `git diff --stat` and verify only intended files were touched.
- [ ] Step 3: Update documentation only if the scope changed materially.
- [ ] Step 4: Commit this round as one coherent change after verification passes.
