# Phase 1: Medora Chat Entry + Auth + Dashboard Alignment — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the existing Medora Health Beauty patient frontend with the shared 2026-03-26 CRM v2 patient model without rewriting the whole experience. Keep the working marketing-site Chat Widget, case-first onboarding, and PatientMessagePanel, then converge auth, session restore, dashboard IA, and intake contracts toward the shared spec.

**Primary Decision:** Do **not** rebuild Medora from scratch. The existing implementation already contains most of the expensive interaction shell. This phase is a convergence migration, not a greenfield build.

**Shared Spec:** `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-26-china-medical-journeys-crm-integration-design.md`

**Legacy Medora Docs (superseded but useful as implementation history):**
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-17-patient-dashboard-chatwidget-design.md`
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/plans/2026-03-17-patient-dashboard-chatwidget.md`

**Codebase Path:** `/Users/haowang/Desktop/medora-health-beauty`

---

## Why This Is A Migration, Not A Rewrite

Medora already has working pieces that match the target product model:

- floating patient chat entry: `/Users/haowang/Desktop/medora-health-beauty/components/ChatWidget.tsx`
- case-first onboarding flow: `/Users/haowang/Desktop/medora-health-beauty/components/chat/OnboardingFlow.tsx`
- hospital selection and post-selection messaging handoff: `/Users/haowang/Desktop/medora-health-beauty/components/chat/HospitalCards.tsx`
- large message surface: `/Users/haowang/Desktop/medora-health-beauty/components/messaging/PatientMessagePanel.tsx`
- CRM-backed patient auth context: `/Users/haowang/Desktop/medora-health-beauty/contexts/PatientAuthContext.tsx`
- token bootstrap in dashboard guard: `/Users/haowang/Desktop/medora-health-beauty/components/ProtectedRoute.tsx`
- dashboard / case detail / quotes / intake / account pages:
  - `/Users/haowang/Desktop/medora-health-beauty/App.tsx`
  - `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/DashboardHome.tsx`
  - `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/CaseDetail.tsx`
  - `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/IntakePage.tsx`
  - `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/AccountPage.tsx`

Rewriting all of that would throw away real product work while still leaving the same backend contract problems to solve. The only areas that are close to true rebuild work are:

- guest session restore for returning same-browser users
- intake contract migration to QC-style payloads
- dashboard information architecture convergence to the shared 7-tab model

---

## Phase 1 Deliverables

- Keep the global floating Chat Widget on the marketing site
- Update the first-open widget state to the shared hybrid model:
  - one structured onboarding widget with the agreed 5 base fields
  - one assistant opening message such as `What can I help you with?`
- Preserve case-first onboarding and hospital selection flow
- Add same-browser guest restore so returning visitors recover history even before formal login/password setup
- Keep `PatientMessagePanel` as the main post-selection messaging surface
- Converge dashboard routes toward the shared shell:
  - Home
  - Messages
  - Quotes
  - account/settings retained
  - optional per-case detail deep-link retained
- Keep messages text-only in this phase
- Do **not** attempt the full QC dynamic intake rebuild in this phase, but prepare the frontend structure so it can be swapped cleanly in the next phase

---

## Guardrails

- Do **not** rewrite the marketing shell, routing shell, or messaging shell unless there is a concrete contract mismatch.
- Do **not** remove the floating Chat Widget. It is part of the final shared product model.
- Do **not** collapse everything into `/dashboard/messages` if `PatientMessagePanel` already serves the same user need better.
- Do **not** keep guest history only in local component state. Once onboarding submits, history must live in CRM v2.
- Do **not** treat the guest restore handle as a bearer auth token. It is a restore handle only.
- Do **not** over-invest in the current intake renderer. The backend contract is expected to change.

---

## Keep / Change / Rebuild

### Keep

- `/Users/haowang/Desktop/medora-health-beauty/components/ChatWidget.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/components/chat/OnboardingFlow.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/components/chat/HospitalCards.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/components/messaging/PatientMessagePanel.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/components/messaging/ChatView.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/services/wsClient.ts`

These are structurally correct for the target product. They should be refined, not replaced.

### Change

- `/Users/haowang/Desktop/medora-health-beauty/components/chat/OnboardingFlow.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/components/chat/OnboardingDetailsStep.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/components/chat/ContactInfoStep.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/contexts/PatientAuthContext.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/components/ProtectedRoute.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/App.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/DashboardHome.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/CaseDetail.tsx`
- `/Users/haowang/Desktop/medora-health-beauty/services/crmApiClient.ts`

These files already solve part of the problem, but need contract alignment and IA changes.

### Rebuild Or Replace Later

- `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/IntakePage.tsx`

The current intake page still assumes `string | string[]` answers. The shared spec now requires a QC-style payload with eventual support for uploads, dynamic lists, and draft save. Treat the current page as transitional.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `hooks/useGuestSessionRestore.ts` | Restore same-browser guest patient session/history |
| `pages/dashboard/DashboardShell.tsx` | Shared dashboard shell with top-level tabs if existing layout is too case-detail-centric |
| `pages/dashboard/MessagesPage.tsx` | Optional dedicated dashboard messages page that reuses existing messaging primitives |
| `pages/dashboard/QuotesPage.tsx` | Optional dedicated dashboard quotes page grouped by case |

### Modified Files

| File | Change |
|------|--------|
| `App.tsx` | Keep global Chat Widget + PatientMessagePanel, update dashboard route grouping, retain optional deep-link case routes |
| `components/ChatWidget.tsx` | Keep global widget but align opening state and unread behavior to shared spec |
| `components/chat/OnboardingFlow.tsx` | Add opening assistant message context and guest restore-aware bootstrap |
| `components/chat/OnboardingDetailsStep.tsx` | Ensure the 5 agreed base fields are represented in the shared widget model |
| `components/chat/ContactInfoStep.tsx` | Keep onboarding submit but include optional free-text request context |
| `components/messaging/PatientMessagePanel.tsx` | Keep as primary surface; improve bootstrap/default active conversation behavior |
| `contexts/PatientAuthContext.tsx` | Add guest restore path before falling back to logged-out state |
| `components/ProtectedRoute.tsx` | Preserve `/dashboard?token=...` bootstrap and integrate guest restore gracefully |
| `services/crmApiClient.ts` | Add guest restore endpoint, normalize shared contract shapes |
| `pages/dashboard/DashboardHome.tsx` | Add shared action-item semantics and CTA routing |
| `pages/dashboard/CaseDetail.tsx` | Retain as optional deep-link view, not the only IA |
| `pages/dashboard/IntakePage.tsx` | Keep temporary compatibility but isolate old contract assumptions |

---

## Chunk 1: Guest Restore + Auth Hardening

### Task 1: Add Same-Browser Guest Restore

**Files:**
- Create: `hooks/useGuestSessionRestore.ts`
- Modify: `contexts/PatientAuthContext.tsx`
- Modify: `services/crmApiClient.ts`

- [ ] **Step 1: Add restore client method**

Add a CRM API method for the recommended shared endpoint:

`POST /api/patient/session/restore`

Input should be an opaque restore handle stored in browser storage. The response should re-issue a `patient_session` cookie and return patient bootstrap data.

- [ ] **Step 2: Persist opaque restore handle**

After onboarding init or any backend response that provides a restore handle, persist it in browser storage. This handle is not a JWT and must never be used as a JS auth token.

- [ ] **Step 3: Update PatientAuthContext bootstrap order**

Bootstrap order should be:

1. `GET /api/patient/me`
2. guest restore if a restore handle exists
3. logged-out state

- [ ] **Step 4: Preserve magic-link bootstrap**

Do not remove current token verification behavior in `ProtectedRoute`. Keep `/dashboard?token=...` working. Guest restore is an additional return path, not a replacement for email magic link.

---

## Chunk 2: Chat Widget First-Open Alignment

### Task 2: Convert Widget Opening State To Shared Hybrid Model

**Files:**
- Modify: `components/ChatWidget.tsx`
- Modify: `components/chat/OnboardingFlow.tsx`
- Modify: `components/chat/OnboardingDetailsStep.tsx`
- Modify: `components/chat/ContactInfoStep.tsx`

- [ ] **Step 1: Make first-open state explicitly hybrid**

The floating widget should show:

- one structured onboarding widget/form for the agreed 5 base fields
- one companion assistant opening message such as `What can I help you with?`

Do not model the first-open state as only a wizard or only a free-chat transcript.

- [ ] **Step 2: Capture free-text intent**

If the visitor types a concern or request, persist it and include it in onboarding/case bootstrap. It should be treated as patient request context and eventually visible to staff or downstream workflow.

- [ ] **Step 3: Keep case-first behavior**

Do not defer case creation until later dashboard usage. Preserve the current behavior where onboarding submit creates or resumes the patient and case early.

---

## Chunk 3: Message Surface Convergence

### Task 3: Keep PatientMessagePanel As The Main Conversation Surface

**Files:**
- Modify: `components/messaging/PatientMessagePanel.tsx`
- Modify: `components/messaging/ConversationList.tsx`
- Modify: `components/messaging/ChatView.tsx`
- Modify: `hooks/usePatientConversations.ts`
- Modify: `hooks/useMessages.ts`

- [ ] **Step 1: Improve default conversation selection**

When the panel opens and conversations exist, auto-select the best default conversation instead of forcing an empty right pane.

- [ ] **Step 2: Keep text-only messages for Phase 1**

Do not add attachment UI yet unless backend contract is extended. Align copy and error handling with the shared spec.

- [ ] **Step 3: Keep dashboard messages page optional**

If a dedicated `/dashboard/messages` page is added, it should reuse the same query hooks and message primitives instead of forking another chat implementation.

---

## Chunk 4: Dashboard IA Alignment

### Task 4: Shift From Case-Only IA To Shared Dashboard IA

**Files:**
- Modify: `App.tsx`
- Modify: `pages/dashboard/DashboardLayout.tsx`
- Modify: `pages/dashboard/DashboardHome.tsx`
- Modify: `pages/dashboard/CaseDetail.tsx`
- Create optional: `pages/dashboard/MessagesPage.tsx`
- Create optional: `pages/dashboard/QuotesPage.tsx`

- [ ] **Step 1: Keep deep-link case detail, but stop making it the only primary IA**

The shared product now centers on dashboard-level tabs such as Home / Messages / Quotes. Retain `/dashboard/cases/:caseId` for drill-down, but do not force users through that route for common tasks.

- [ ] **Step 2: Restore Medora semantics on DashboardHome**

Add or preserve:

- welcome header
- action-item banner
- unread/message urgency
- intake-needed CTA
- quote-expiring CTA

- [ ] **Step 3: Route empty states back to the marketing entry flow**

If the user has no cases or no conversations, CTAs should point toward the floating widget / patient-entry path, not a dead-end login route.

---

## Chunk 5: Intake Isolation For The Next Contract

### Task 5: Prepare Intake For Future QC Migration

**Files:**
- Modify: `pages/dashboard/IntakePage.tsx`
- Modify: `services/crmApiClient.ts`

- [ ] **Step 1: Isolate old answer-shape assumptions**

Keep the page working for the current backend, but isolate the code that assumes:

`Record<string, string | string[]>`

so it can be swapped out later without rewriting the whole page.

- [ ] **Step 2: Add clear transitional comments or adapter boundaries**

Mark the current intake renderer as transitional. The next phase is expected to replace the request contract with:

```typescript
{
  templateId: string;
  responses: QCResponsePayload;
}
```

- [ ] **Step 3: Do not overbuild UI for obsolete types**

Avoid investing in complex UI around the old intake shape. The real effort belongs in the future QC-backed rebuild.

---

## Verification

- [ ] Marketing pages still render the floating Chat Widget globally
- [ ] Widget first-open state shows the form widget plus assistant opening message
- [ ] Onboarding still creates/resumes a patient and case
- [ ] Returning same-browser guest can recover session/history without forced login when restore handle is valid
- [ ] Magic-link flow still works via `/dashboard?token=...`
- [ ] Selected hospitals still open `PatientMessagePanel`
- [ ] Existing conversations load in the panel
- [ ] Dashboard Home still shows cases and useful action states
- [ ] Optional `/dashboard/messages` and `/dashboard/quotes` routes reuse the same CRM-backed hooks
- [ ] Current intake still works for the old backend shape while remaining easy to replace

---

## Recommended Follow-On Plans

This document is intentionally Medora-specific. It should be followed by:

1. **Shared Phase 2 backend/frontend plan**
   Focus: tickets, orders, journey, AI summary, and formal guest restore backend hardening
2. **Medora intake migration plan**
   Focus: replace the current intake page with QC-backed dynamic questionnaire rendering

