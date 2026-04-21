# Hospital Case Detail Notifications And Uploads Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make hospital case detail fully functional for patient messaging, case-file uploads, quote sending, invitation uploads, and consultation scheduling, with patient email notifications and case document visibility.

**Architecture:** Reuse the existing API-side notification flow and upload intent endpoints wherever possible. Keep hospital portal changes focused on wiring the case detail UI to existing message/document routes, then extend the API notification hooks so hospital-patient messages and case updates notify patients consistently.

**Tech Stack:** Next.js app router, React 19, TanStack Query, Hono API routes, Vitest, shared CRM domain/application packages

---

## Chunk 1: Notification Hooks

### Task 1: Extend message-route notifications to hospital-patient replies

**Files:**
- Modify: `apps/api/src/routes/messages.routes.ts`
- Test: `apps/api/src/__tests__/messages.routes.test.ts`

- [ ] **Step 1: Write the failing route test**

Add a test proving that a `HOSPITAL_PATIENT` conversation sends `notifyPatientOfAdminMessage.execute(...)` when a hospital user replies.

- [ ] **Step 2: Run the API route test to verify it fails**

Run: `pnpm --filter @medical-crm/api test -- messages.routes.test.ts`

Expected: FAIL because `messages.routes.ts` only notifies patients for `ADMIN_PATIENT`.

- [ ] **Step 3: Implement the minimal route change**

Update `messages.routes.ts` so patient notification runs for both `ADMIN_PATIENT` and `HOSPITAL_PATIENT` when the sender is not the patient.

- [ ] **Step 4: Re-run the API route test**

Run: `pnpm --filter @medical-crm/api test -- messages.routes.test.ts`

Expected: PASS.

### Task 2: Add reusable patient case-update email notification entrypoint

**Files:**
- Modify: `packages/domain/src/ports/email-service.port.ts`
- Modify: `packages/application/src/use-cases/notifications/notification-email.service.ts`
- Modify: `packages/application/__tests__/notification-email.service.test.ts`
- Modify: `packages/infrastructure/services/patient-new-message-email.template.ts`
- Modify: `packages/infrastructure/services/resend-email.service.ts`
- Modify: `packages/infrastructure/services/smtp-email.service.ts`
- Modify: `packages/infrastructure/services/stub-email.service.ts`
- Modify: `apps/api/src/composition-root.ts`

- [ ] **Step 1: Write the failing notification-service test**

Add a test covering a generic patient care update email payload so quote / invitation / consultation notifications can reuse one service.

- [ ] **Step 2: Run the notification service test to verify it fails**

Run: `pnpm --filter @medical-crm/application test -- notification-email.service.test.ts`

Expected: FAIL because the generic notification method and email-service contract do not exist yet.

- [ ] **Step 3: Implement the minimal shared notification path**

Add a generic patient case-update email method to the email-service contract and notification service. Keep the 5-minute cooldown behavior available for message notifications, and use a more general patient-facing template title/body for non-message updates.

- [ ] **Step 4: Re-run the notification service test**

Run: `pnpm --filter @medical-crm/application test -- notification-email.service.test.ts`

Expected: PASS.

### Task 3: Trigger patient update emails for quote send, invitation upload, and consultation create

**Files:**
- Modify: `apps/api/src/routes/quotes.routes.ts`
- Modify: `apps/api/src/routes/documents.routes.ts`
- Modify: `apps/api/src/routes/consultations.routes.ts`
- Modify: `apps/api/src/__tests__/quotes.routes.test.ts`
- Modify: `apps/api/src/__tests__/documents.routes.test.ts`
- Modify: `apps/api/src/__tests__/consultations.routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Add route tests for:
- `POST /api/v2/quotes/:id/send` notifying the patient
- `POST /api/v2/cases/:caseId/documents` notifying the patient when `documentType === 'INVITATION'` and the actor is hospital
- `POST /api/v2/consultations` notifying the patient after schedule creation

- [ ] **Step 2: Run those route tests to verify they fail**

Run: `pnpm --filter @medical-crm/api test -- quotes.routes.test.ts documents.routes.test.ts consultations.routes.test.ts`

Expected: FAIL because the routes currently only execute the CRUD use cases.

- [ ] **Step 3: Implement the route-side hooks**

After the core use case succeeds, look up the case/patient context and call the new generic patient-update notification service with clear previews such as:
- quote available
- invitation letter uploaded
- consultation scheduled

- [ ] **Step 4: Re-run the route tests**

Run: `pnpm --filter @medical-crm/api test -- quotes.routes.test.ts documents.routes.test.ts consultations.routes.test.ts`

Expected: PASS.

## Chunk 2: Hospital Portal Upload Wiring

### Task 4: Expose case-document POST through hospital local route handlers

**Files:**
- Modify: `apps/hospital/src/app/api/cases/[id]/documents/route.ts`

- [ ] **Step 1: Add a small failing test if practical; otherwise verify with targeted usage tests in later tasks**

If there is no existing route-handler test pattern in hospital app, cover this through the case-detail component tests below.

- [ ] **Step 2: Implement POST passthrough**

Export `POST` using `createParamMutationHandler('POST', ...)` so hospital client code can initialize case-document uploads from the browser.

- [ ] **Step 3: Verify with hospital tests after the UI wiring lands**

Run the case-detail tests introduced below.

### Task 5: Add client-side case-document upload helper for diagnosis and invitation files

**Files:**
- Create: `apps/hospital/src/actions/document-actions.ts`
- Modify: `apps/hospital/src/lib/api-types.ts` (only if helper/shared types are needed)
- Test: `apps/hospital/src/__tests__/case-detail-panel.test.tsx` or the closest existing case-detail test file

- [ ] **Step 1: Write the failing hospital component test**

Cover that diagnosis/invitation upload actions call the local `/api/cases/:id/documents` route with the right `documentType` and finish by refreshing case data.

- [ ] **Step 2: Run the hospital test to verify it fails**

Run: `pnpm --filter @medical-crm/hospital test -- case-detail-panel`

Expected: FAIL because no client helper exists and the UI is still placeholder-only.

- [ ] **Step 3: Implement the upload helper**

Mirror the existing hospital message attachment upload helper pattern:
- initialize upload via local route
- PUT the file to the presigned URL
- return uploaded asset / document metadata

- [ ] **Step 4: Re-run the hospital test**

Run: `pnpm --filter @medical-crm/hospital test -- case-detail-panel`

Expected: PASS or progress to the next failing UI assertion.

## Chunk 3: Hospital Case Detail UI

### Task 6: Make the message tab send hospital-patient messages with attachments

**Files:**
- Modify: `apps/hospital/src/components/case-detail-panel.tsx`
- Reuse: `apps/hospital/src/actions/message-actions.ts`
- Test: `apps/hospital/src/__tests__/case-detail-panel.test.tsx` or extend an existing case-detail test file

- [ ] **Step 1: Write the failing UI test**

Cover:
- the hospital message composer renders an attachment button
- selected files upload through `uploadFile`
- sending uses `sendMessageWithAttachments`
- plain text sends use `sendMessage`

- [ ] **Step 2: Run the hospital test to verify it fails**

Run: `pnpm --filter @medical-crm/hospital test -- case-detail-panel`

Expected: FAIL because the current case-detail message tab is static.

- [ ] **Step 3: Implement the minimal interactive composer**

Use the existing hospital message actions. Send only into the `hospital-patient` conversation; create it on demand when missing. Refresh the route after success so message history and merged documents stay up to date.

- [ ] **Step 4: Re-run the hospital test**

Run: `pnpm --filter @medical-crm/hospital test -- case-detail-panel`

Expected: PASS.

### Task 7: Wire diagnosis uploads into the modal and documents tab

**Files:**
- Modify: `apps/hospital/src/components/case-detail-panel.tsx`
- Reuse: `apps/hospital/src/actions/case-actions.ts`
- Reuse/Create: `apps/hospital/src/actions/document-actions.ts`
- Test: `apps/hospital/src/__tests__/case-detail-panel.test.tsx`

- [ ] **Step 1: Write the failing UI test**

Cover selecting diagnosis files from the modal and uploading them as `DIAGNOSIS` case documents.

- [ ] **Step 2: Run the hospital test to verify it fails**

Run: `pnpm --filter @medical-crm/hospital test -- case-detail-panel`

Expected: FAIL because the diagnosis attachment area is placeholder-only.

- [ ] **Step 3: Implement the minimal upload flow**

Keep the diagnosis save action as-is for progress creation, but upload selected files through the new case-document helper before or during save, then refresh so they appear in Documents.

- [ ] **Step 4: Re-run the hospital test**

Run: `pnpm --filter @medical-crm/hospital test -- case-detail-panel`

Expected: PASS.

### Task 8: Complete invitation upload UX and document visibility

**Files:**
- Modify: `apps/hospital/src/components/case-detail-panel.tsx`
- Reuse/Create: `apps/hospital/src/actions/document-actions.ts`
- Test: `apps/hospital/src/__tests__/case-detail-panel.test.tsx`

- [ ] **Step 1: Write the failing UI test**

Cover invitation upload, supported file selection, and display of uploaded invitation documents on the invitation tab.

- [ ] **Step 2: Run the hospital test to verify it fails**

Run: `pnpm --filter @medical-crm/hospital test -- case-detail-panel`

Expected: FAIL because the invitation tab is only presentational.

- [ ] **Step 3: Implement the invitation upload flow**

Upload case documents with `documentType: 'INVITATION'`, show current uploaded invitation files from `caseDetail.documents`, and refresh the page after success.

- [ ] **Step 4: Re-run the hospital test**

Run: `pnpm --filter @medical-crm/hospital test -- case-detail-panel`

Expected: PASS.

### Task 9: Fix quote tab behavior so multiple line items are actually usable and send remains patient-notifying

**Files:**
- Modify: `apps/hospital/src/components/tabs/case-quote-tab.tsx`
- Modify: `apps/hospital/src/__tests__/case-quote-tab.test.ts`

- [ ] **Step 1: Write the failing UI/helper test**

Capture the user-visible regression causing quote handling to feel single-item only. This may be:
- only showing the first quote card
- hiding create flow after one quote
- line-item editing not preserving multiple items

- [ ] **Step 2: Run the quote-tab test to verify it fails**

Run: `pnpm --filter @medical-crm/hospital test -- case-quote-tab.test.ts`

Expected: FAIL with the specific behavior observed in the component.

- [ ] **Step 3: Implement the minimal fix**

Preserve and render multiple line items correctly and make sure create/send/edit paths do not collapse back to a single-item interpretation.

- [ ] **Step 4: Re-run the quote-tab test**

Run: `pnpm --filter @medical-crm/hospital test -- case-quote-tab.test.ts`

Expected: PASS.

## Chunk 4: Verification

### Task 10: Run targeted verification

**Files:**
- Verify only

- [ ] **Step 1: Run API tests**

Run: `pnpm --filter @medical-crm/api test -- messages.routes.test.ts quotes.routes.test.ts documents.routes.test.ts consultations.routes.test.ts`

Expected: PASS.

- [ ] **Step 2: Run application-layer notification tests**

Run: `pnpm --filter @medical-crm/application test -- notification-email.service.test.ts`

Expected: PASS.

- [ ] **Step 3: Run hospital tests**

Run: `pnpm --filter @medical-crm/hospital test -- case-quote-tab.test.ts case-detail-panel case-detail-panel-i18n.test.ts`

Expected: PASS.

- [ ] **Step 4: Run typecheck for touched apps if time allows**

Run: `pnpm --filter @medical-crm/api typecheck && pnpm --filter @medical-crm/hospital typecheck`

Expected: PASS.

Plan complete and saved to `docs/superpowers/plans/2026-04-21-hospital-case-detail-notifications-and-uploads.md`. Ready to execute?
