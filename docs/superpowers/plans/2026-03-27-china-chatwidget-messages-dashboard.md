# China Chat Widget + Messages + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the China patient entry flow as `ChatWidget -> onboarding/login -> hospital selection -> PatientMessagePanel`, and migrate `/dashboard` to CRM v2-backed `Home / Quotes / Messages` without breaking hospital login or legacy public flows.

**Architecture:** Build on top of the China CRM v2 patient auth foundation, then add a dedicated patient-entry state layer, a formal post-selection message panel, and a limited patient dashboard shell. Keep `FreeQuoteFloatingButton` intact, mount the new widget and panel globally, and isolate legacy Supabase/Medplum flows instead of rewriting them.

**Tech Stack:** React 18, Vite 5, TypeScript, React Router 6, TanStack Query 5, Tailwind CSS, CRM v2 Hono API via `/api/patient/*`

---

## Preconditions

- Preferred execution target: the isolated China worktree branch that already contains the patient auth foundation (`codex/china-guest-restore`, latest reviewed head `24c3bf2` or later).
- If implementing from the main China repo instead of that worktree, do **Task 0** first to bring forward the patient auth foundation before touching widget/panel/dashboard work.
- Do **not** repurpose `/login`; it remains the hospital/Medplum login.
- Do **not** remove `FreeQuoteFloatingButton`, `AuthContext`, `supabaseClient`, or old public flows in this phase.
- Do **not** migrate `Tickets / Journey / AI Summary / Orders` in this phase.
- Do **not** add a new test framework in this repo. This codebase currently verifies via `npm run build` plus targeted manual flows. Use helper-level tests only if a native harness is already present in the execution branch.

## Codebase Paths

- Frontend repo: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys` (alias: `$FE`)
- Shared backend repo: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2` (alias: `$BE`)
- Approved spec: [`2026-03-27-china-chatwidget-messages-dashboard-design.md`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-27-china-chatwidget-messages-dashboard-design.md)

## File Structure

### Existing Files To Reuse

| File | Responsibility |
|---|---|
| `$FE/src/components/FreeQuoteFloatingButton.tsx` | Existing floating legacy entry; stays mounted |
| `$FE/src/App.tsx` | Global route/app composition |
| `$FE/src/pages/Dashboard.tsx` | Current patient dashboard shell to replace |
| `$FE/src/components/dashboard/DashboardHome.tsx` | Old Home tab to replace with CRM-backed version |
| `$FE/src/components/dashboard/QuotesEstimates.tsx` | Old Quotes tab to replace |
| `$FE/src/services/api/config.ts` | Current API config; keep only for legacy services |
| `$FE/vite.config.ts` | Add CRM proxy entries |

### Files Expected From The Patient Auth Foundation

If absent, Task 0 must add them first:

| File | Responsibility |
|---|---|
| `$FE/src/contexts/PatientAuthContext.tsx` | Patient cookie/restore auth state |
| `$FE/src/hooks/usePatientAuth.ts` | Hook wrapper over patient auth context |
| `$FE/src/pages/PatientLoginPage.tsx` | Patient magic-link request page |
| `$FE/src/pages/DashboardRoute.tsx` | `/dashboard` entry routing between legacy and patient flows |
| `$FE/src/services/api/crmApiClient.ts` | CRM v2 patient client + restore token helpers |

### New Files For This Phase

| File | Responsibility |
|---|---|
| `$FE/src/types/patient-entry.ts` | Focused types for pre-bootstrap history, hospital matches, widget phases |
| `$FE/src/contexts/PatientEntryContext.tsx` | Widget/panel state, pre-bootstrap history, onboarding + selection transitions |
| `$FE/src/hooks/usePatientEntry.ts` | Safe hook for patient entry context |
| `$FE/src/services/storage/patient-entry-storage.ts` | Local pre-bootstrap history storage, anonymous-to-patient rebinding, import markers |
| `$FE/src/services/api/patient-entry.ts` | `initOnboarding`, `matchHospitals`, `selectHospitals`, import-history helpers |
| `$FE/src/services/api/patient-messages.ts` | Formal conversations/messages list + send APIs |
| `$FE/src/hooks/usePatientConversations.ts` | Query hooks for formal conversations/messages |
| `$FE/src/hooks/usePatientDashboard.ts` | Query hooks for Home + Quotes data |
| `$FE/src/components/chat/ChatWidget.tsx` | New floating widget entry shell |
| `$FE/src/components/chat/PatientEntryWindow.tsx` | Expanded widget container |
| `$FE/src/components/chat/PatientProfileForm.tsx` | 5-field base-info form |
| `$FE/src/components/chat/HospitalSelectionForm.tsx` | Multi-select hospital form |
| `$FE/src/components/chat/PatientChatComposer.tsx` | Shared input for pre-bootstrap/admin widget chat |
| `$FE/src/components/chat/PatientChatMessageList.tsx` | Widget message list for pre-bootstrap/admin compact chat |
| `$FE/src/components/messaging/PatientMessagePanel.tsx` | Large post-selection conversation surface |
| `$FE/src/components/messaging/ConversationList.tsx` | Formal conversation navigation list |
| `$FE/src/components/messaging/ConversationThread.tsx` | Formal message thread |
| `$FE/src/components/messaging/MessageComposer.tsx` | Formal send input with small retry UI |
| `$FE/src/components/dashboard/PatientDashboardShell.tsx` | New limited patient dashboard shell |
| `$FE/src/components/dashboard/HomePage.tsx` | CRM-backed `Home` tab |
| `$FE/src/components/dashboard/QuotesPage.tsx` | CRM-backed `Quotes` tab |
| `$FE/src/components/dashboard/MessagesPage.tsx` | CRM-backed `Messages` tab |

### Modified Files In This Phase

| File | Change |
|---|---|
| `$FE/src/App.tsx` | Mount patient providers, widget, and message panel globally; route `/dashboard` through the patient shell |
| `$FE/src/pages/Dashboard.tsx` | Replace old sidebar/tab shell with a wrapper around `PatientDashboardShell` or retire in favor of the new shell component |
| `$FE/vite.config.ts` | Add `/api/patient` proxy entry |
| `$FE/src/services/api/config.ts` | Leave legacy behavior intact; do not route CRM traffic through this file |
| `$FE/src/components/FreeQuoteFloatingButton.tsx` | No behavior change expected; only touch if z-index/position conflict with `ChatWidget` |

---

## Chunk 1: Baseline + Patient Entry Flow

### Task 0: Bring Forward The Patient Auth Foundation If Missing

**Files:**
- Verify: `$FE/src/contexts/PatientAuthContext.tsx`
- Verify: `$FE/src/hooks/usePatientAuth.ts`
- Verify: `$FE/src/pages/PatientLoginPage.tsx`
- Verify: `$FE/src/pages/DashboardRoute.tsx`
- Verify: `$FE/src/services/api/crmApiClient.ts`

- [ ] **Step 1: Verify whether the auth foundation already exists**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys
ls src/contexts/PatientAuthContext.tsx src/hooks/usePatientAuth.ts src/pages/PatientLoginPage.tsx src/pages/DashboardRoute.tsx src/services/api/crmApiClient.ts
```

Expected:
- if all files exist, continue to Task 1
- if one or more files are missing, continue with Step 2

- [ ] **Step 2: Bring the foundation into the execution branch**

Preferred sync source:

- worktree branch: `codex/china-guest-restore`
- reviewed final foundation head: `24c3bf2`

Recommended command sequence:

```bash
git cherry-pick a5dd93e1cdfbe4a302223da8bed8106112771f62 \
  1e951cee9b4f6d2412a45b25e717e942f7601c82 \
  ac7c2fb26dce513360996c335d12debeea0a1390 \
  11d80db481d9c5a56b4ae86566b13d03230cbfcf \
  1766c63e75bc268b91223a916e21ac7d3a2977bd \
  861a6011a9f9339837113e473ad23f15cf6cd854 \
  24c3bf2
```

Fallback only if those commits are unavailable:

- manually port the same reviewed foundation behavior before continuing
- do not improvise a different auth architecture in this plan

Minimum behavior to confirm after this step:

- patient magic-link login exists at `/patient-login`
- `/dashboard?token=...` bootstrap exists
- restore token storage/migration exists
- invalid token fails closed
- `/dashboard` still preserves legacy shell for ordinary visits

- [ ] **Step 3: Verify the foundation build**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys
npm run build
git diff --check
```

Expected:
- Vite build succeeds
- `git diff --check` returns no whitespace errors

- [ ] **Step 4: Commit foundation sync only if Step 2 changed files**

```bash
git add src/contexts/PatientAuthContext.tsx src/hooks/usePatientAuth.ts src/pages/PatientLoginPage.tsx src/pages/DashboardRoute.tsx src/services/api/crmApiClient.ts
git commit -m "feat: bring forward China patient auth foundation"
```

If Step 1 found all files already present and no foundation sync was needed, skip this commit step.

### Task 1: Add CRM Proxy And Patient Entry Contracts

**Files:**
- Modify: `$FE/vite.config.ts`
- Create: `$FE/src/types/patient-entry.ts`
- Create: `$FE/src/services/api/patient-entry.ts`
- Create: `$FE/src/services/api/patient-messages.ts`

- [ ] **Step 1: Add Vite proxy entries**

Add to `vite.config.ts`:

```ts
server: {
  host: "localhost",
  port: 3000,
  proxy: {
    "/api/patient": {
      target: "http://localhost:3001",
      changeOrigin: true,
    },
  },
},
```

- [ ] **Step 2: Add focused patient-entry types**

In `src/types/patient-entry.ts`, define only the shapes needed in this phase:

- `PatientEntryPhase = 'collect-profile' | 'select-hospitals' | 'messages-ready' | 'bootstrap-error'`
- `PreBootstrapMessage`
- `PatientProfileDraft`
- `MatchedHospital`
- `SelectHospitalsResult`
- `ImportTemporaryHistoryPayload`

Do not mix these types into legacy Supabase dashboard types.

- [ ] **Step 3: Add patient-entry API helpers**

In `src/services/api/patient-entry.ts`, wrap:

- `initOnboarding`
- `matchHospitals`
- `selectHospitals`
- `importTemporaryHistory`

Use `crmApiClient` underneath, not legacy `getAuthHeaders()`.

Expected minimum signatures:

```ts
initOnboarding(input: {
  name: string;
  email: string;
  phone: string;
  disease: string;
  destination: string;
}): Promise<{
  patientId: string;
  caseId: string;
  restoreToken: string;
  nextStep: 'select-hospitals' | 'messages-ready';
}>
```

```ts
matchHospitals(input: {
  caseId: string;
  profile: {
    name: string;
    email: string;
    phone: string;
    disease: string;
    destination: string;
  };
}): Promise<{
  hospitals: MatchedHospital[];
}>
```

Minimum `MatchedHospital` shape:

```ts
type MatchedHospital = {
  id: string;
  name: string;
  city?: string;
  summary?: string;
}
```

```ts
selectHospitals(input: {
  caseId: string;
  hospitalIds: string[];
}): Promise<{
  nextStep: 'messages-ready';
  conversations: PatientConversationSummary[];
}>
```

For temporary-history import, define the payload explicitly:

```ts
type ImportTemporaryHistoryPayload = {
  conversationId: string;
  importKey: string;
  messages: Array<{
    clientId: string;
    role: 'patient' | 'assistant/system-ui';
    content: string;
    createdAt: string;
  }>;
}
```

Expected minimum response contract:

```ts
type ImportTemporaryHistoryResult = {
  status: 'imported' | 'already-imported';
}
```

Duplicate-retry rule:

- repeated calls with the same `importKey` must return `already-imported` instead of duplicating history
- the frontend should treat both `imported` and `already-imported` as success for local cleanup purposes

For conversation metadata, require enough fields to place `patient-admin` first:

```ts
type PatientConversationSummary = {
  id: string;
  type: 'patient-admin' | 'patient-hospital';
  title: string;
  lastMessagePreview?: string;
  unreadCount?: number;
}
```

- [ ] **Step 4: Add formal message API helpers**

In `src/services/api/patient-messages.ts`, add:

- `listConversations`
- `getConversationMessages`
- `sendConversationMessage`

- [ ] **Step 5: Verify**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys
npm run build
git diff --check
```

Expected:
- build succeeds
- no whitespace errors

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts src/types/patient-entry.ts src/services/api/patient-entry.ts src/services/api/patient-messages.ts
git commit -m "feat: add China patient entry and messaging API contracts"
```

### Task 2: Add Patient Entry State And Local Pre-Bootstrap History

**Files:**
- Create: `$FE/src/contexts/PatientEntryContext.tsx`
- Create: `$FE/src/hooks/usePatientEntry.ts`
- Create: `$FE/src/services/storage/patient-entry-storage.ts`

- [ ] **Step 1: Add dedicated local storage helpers for pre-bootstrap history**

In `src/services/storage/patient-entry-storage.ts`, add explicit helpers and keys for:

- anonymous pre-bootstrap history
- rebound patient/case-scoped pre-bootstrap history
- import-complete marker keyed by patient/case/import key
- stable import key generation + persistence keyed with the same local history

Use browser `localStorage` in this phase, not `sessionStorage` or IndexedDB.

Required key format:

- anonymous history: `patient-entry:anonymous:history`
- rebound patient/case history: `patient-entry:patient:<patientId>:case:<caseId>:history`
- import-complete marker: `patient-entry:patient:<patientId>:case:<caseId>:import:<importKey>`
- stable import key record: `patient-entry:patient:<patientId>:case:<caseId>:active-import-key`

Rules to encode:

- seed opening/system message only for a brand-new local history
- migrate anonymous history into patient/case scope after onboarding
- clear local history only after successful import
- never reuse one patient's stored history for another patient
- reuse the same import key across retry/refresh until import succeeds

Also add an explicit `ensureOpeningMessageSeeded()` helper that:

- runs when the widget history is first initialized for a brand-new anonymous or rebound history scope
- inserts the single opening/system message into local history
- is idempotent across refresh/re-open for an existing history scope

- [ ] **Step 2: Create PatientEntryContext**

`PatientEntryContext` owns:

- `isWidgetOpen`
- `phase`
- `preBootstrapMessages`
- `profileDraft`
- `caseId`
- `matchedHospitals`
- `selectedHospitalIds`
- `isPanelOpen`
- `bootstrapError`
- `activeConversationId`
- `importStatus: 'idle' | 'pending' | 'succeeded' | 'failed'`

Do not move auth state into this context.

- [ ] **Step 3: Implement phase transitions**

Encode transitions:

- first open => `collect-profile`
- onboarding success + `nextStep=select-hospitals` => `select-hospitals`
- onboarding success + `nextStep=messages-ready` => load admin conversation, attempt import, then:
  - success => `messages-ready`
  - import failure => still `messages-ready` with visible retry/error state
  - conversation load/identification failure => `bootstrap-error`
- hospital selection success => import history, then open panel
- conversation/bootstrap failure => `bootstrap-error`

- [ ] **Step 4: Implement returning-patient restore behavior**

Use the authoritative backend phase signal on restore, not frontend inference.

On restore:

- no CRM session + local history => `collect-profile` with restored local history
- restored patient + `nextStep=select-hospitals` => `select-hospitals`
- restored patient + `nextStep=messages-ready` => `messages-ready`
- restored patient + known bootstrap failure marker => `bootstrap-error`

- [ ] **Step 5: Decompose the `messages-ready` resume path**

Implement and verify these sub-behaviors explicitly:

- identify the `patient-admin` conversation from formal conversation summaries
- load prior formal admin history into the compact widget thread
- wire compact widget send behavior to the formal admin conversation
- keep multi-conversation switching out of the widget
- if admin conversation cannot be identified, move to `bootstrap-error`
- if import fails but admin conversation loads, remain in `messages-ready` and surface retry/error UI instead of falling back to `bootstrap-error`

- [ ] **Step 6: Verify**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys
npm run build
git diff --check
```

Expected:
- build succeeds
- no whitespace errors

- [ ] **Step 7: Commit**

```bash
git add src/contexts/PatientEntryContext.tsx src/hooks/usePatientEntry.ts src/services/storage/patient-entry-storage.ts
git commit -m "feat: add China patient entry state machine"
```

### Task 3: Build The Chat Widget UI

**Files:**
- Create: `$FE/src/components/chat/ChatWidget.tsx`
- Create: `$FE/src/components/chat/PatientEntryWindow.tsx`
- Create: `$FE/src/components/chat/PatientProfileForm.tsx`
- Create: `$FE/src/components/chat/HospitalSelectionForm.tsx`
- Create: `$FE/src/components/chat/PatientChatComposer.tsx`
- Create: `$FE/src/components/chat/PatientChatMessageList.tsx`
- Modify: `$FE/src/App.tsx`

- [ ] **Step 1: Build the floating widget shell**

`ChatWidget.tsx` should:

- render beside `FreeQuoteFloatingButton`
- render on the public marketing routes and the patient `/dashboard` shell
- do **not** render on these routes in this phase:
  - `/login`
  - `/auth`
  - `/auth/callback`
  - `/hospital/*`
  - `/dashboard/case-intake`
  - `/medical-case-intake`
  - `/case-intake/:id`
- support collapsed and expanded states
- delegate expanded UI to `PatientEntryWindow`

- [ ] **Step 2: Build the entry window**

`PatientEntryWindow.tsx` should:

- render the opening/system message from state
- render the message list
- always render `PatientChatComposer` so the patient can chat immediately on first open and continue chatting in every later phase
- render one inline control block based on phase:
  - `collect-profile` => `PatientProfileForm`
  - `select-hospitals` => `HospitalSelectionForm`
  - `messages-ready` => no form, compact admin chat only
  - `bootstrap-error` => retry/error block

- [ ] **Step 3: Build the 5-field profile form**

Fields:

- `name`
- `email`
- `phone`
- `disease`
- `destination`

Submit calls `initOnboarding`, persists/consumes the returned `restoreToken` through `PatientAuthContext`, waits for patient auth state to become active, and then binds returned patient/case context to the local pre-bootstrap history before transitioning the widget phase.

Failure requirements for this step:

- keep widget open
- preserve form input
- preserve local pre-bootstrap chat history
- show inline error UI

- [ ] **Step 4: Build the hospital selection form**

Requirements:

- auto-trigger `matchHospitals` when entering `select-hospitals`
- allow multi-select
- show explicit request-failure UI
- show zero-results UI
- disallow submit when zero hospitals selected

- [ ] **Step 5: Keep chat active in all widget phases**

`PatientChatComposer.tsx` and `PatientChatMessageList.tsx` must work in:

- `collect-profile`
- `select-hospitals`
- `messages-ready`

In `messages-ready`, the widget is only for the `patient-admin` conversation, not multi-conversation navigation.

- [ ] **Step 6: Mount the widget globally for this chunk**

Update `App.tsx` now so Chunk 1 is independently runnable:

- keep `AuthProvider` and legacy routes intact
- mount providers in this exact order:
  - `AuthProvider`
  - `PatientAuthProvider`
  - `PatientEntryProvider`
- keep `FreeQuoteFloatingButton`
- add `ChatWidget` globally

Do not mount `PatientMessagePanel` yet; that stays in Chunk 2.

- [ ] **Step 7: Verify**

Manual flow to verify:

1. open marketing page in a clean browser state
2. open widget
3. confirm the opening/system message appears exactly once on first initialization
4. send a message without submitting the form
5. refresh
6. confirm the opening/system message is not duplicated
7. confirm local pre-bootstrap history survives
8. submit the base form and confirm the widget switches to `select-hospitals` while chat stays active
9. force `matchHospitals` zero results and confirm zero-results UI + retry
10. restore a patient who has onboarding complete but no conversations and confirm resume into `select-hospitals`
11. restore a patient who already has conversations and confirm resume into `messages-ready`
12. confirm the compact widget shows prior formal `patient-admin` history with no form in that resumed state
13. confirm the widget does not render on `/login`, `/auth`, or `/auth/callback`

Then run:
```bash
npm run build
git diff --check
```

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/chat/ src/contexts/PatientEntryContext.tsx src/hooks/usePatientEntry.ts
git commit -m "feat: add China patient chat widget flow"
```

## Chunk 2: Formal Messaging + Dashboard Migration

### Task 4: Build PatientMessagePanel And Formal Message Components

**Files:**
- Create: `$FE/src/components/messaging/PatientMessagePanel.tsx`
- Create: `$FE/src/components/messaging/ConversationList.tsx`
- Create: `$FE/src/components/messaging/ConversationThread.tsx`
- Create: `$FE/src/components/messaging/MessageComposer.tsx`
- Create: `$FE/src/hooks/usePatientConversations.ts`

- [ ] **Step 1: Add conversation query hooks**

`usePatientConversations.ts` should expose focused hooks:

- `usePatientConversations()`
- `useConversationMessages(conversationId)`
- `useSendConversationMessage(conversationId)`

No dashboard-specific tab state belongs here.

- [ ] **Step 2: Build the large message panel**

`PatientMessagePanel.tsx` should:

- mount globally from `App.tsx`
- open from patient entry state
- show the conversation list on the left
- show the active thread on the right
- default to `patient-admin` first

- [ ] **Step 3: Build formal send/retry behavior**

`MessageComposer.tsx` and the thread UI must:

- send text messages
- show toast on send failure
- keep input content on failure
- render a small retry button next to the failed message/error row

Do **not** add a full outbox system in this phase.

- [ ] **Step 4: Add temporary-history import handoff**

When conversations become available:

- import local pre-bootstrap history into `patient-admin`
- if import succeeds, clear local stored history
- if import fails, still allow panel open and show retry affordance

- [ ] **Step 5: Verify**

Manual flow:

1. complete onboarding
2. select hospitals
3. confirm panel opens
4. confirm `patient-admin` is first
5. confirm pre-bootstrap messages appear in admin conversation
6. force a send failure and confirm toast + retained input + small retry button

Then run:
```bash
npm run build
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git add src/components/messaging/ src/hooks/usePatientConversations.ts src/services/api/patient-messages.ts
git commit -m "feat: add China patient message panel"
```

### Task 5: Mount Widget And Panel Globally In App

**Files:**
- Modify: `$FE/src/App.tsx`

- [ ] **Step 1: Mount the large message panel into the existing global app wiring**

Starting from the widget/provider wiring added in Chunk 1, update `App.tsx` so the global surface set is:

- `AuthProvider` (legacy)
- `PatientAuthProvider`
- `PatientEntryProvider`
- `FreeQuoteFloatingButton`
- `ChatWidget`
- `PatientMessagePanel`

Do not remove legacy hospital routes or move the widget back out of the global tree.

- [ ] **Step 2: Route `/dashboard` through the patient-aware entry**

Ensure `App.tsx` uses the patient-aware dashboard route wrapper already introduced by the auth foundation. Do not wire `/dashboard` directly to the old `Dashboard` shell anymore.

- [ ] **Step 3: Verify**

Run:
```bash
npm run build
git diff --check
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount China patient widget and panel globally"
```

### Task 6: Replace The Dashboard Shell With The Limited Patient Dashboard

**Files:**
- Create: `$FE/src/components/dashboard/PatientDashboardShell.tsx`
- Create: `$FE/src/components/dashboard/HomePage.tsx`
- Create: `$FE/src/components/dashboard/QuotesPage.tsx`
- Create: `$FE/src/components/dashboard/MessagesPage.tsx`
- Create: `$FE/src/hooks/usePatientDashboard.ts`
- Create: `$FE/src/services/api/patient-dashboard.ts`
- Modify: `$FE/src/pages/Dashboard.tsx`
- Modify or retire: `$FE/src/components/dashboard/DashboardHome.tsx`
- Modify or retire: `$FE/src/components/dashboard/QuotesEstimates.tsx`

- [ ] **Step 1: Build the new shell**

`PatientDashboardShell.tsx` should expose only the tabs in scope:

- `Home`
- `Quotes`
- `Messages`

Do not include `Tickets / Journey / AI Summary / Orders` yet.

- [ ] **Step 2: Add focused dashboard API and query hooks**

`src/services/api/patient-dashboard.ts` should stay narrow and only wrap the CRM contracts needed by this phase's patient dashboard:

- `getPatientHomeSummary`
- `listPatientQuotes`
- `getPatientQuoteDetail` only if the quote list/summary contract is too thin for the delivered `QuotesPage`
- `acceptPatientQuote`
- `rejectPatientQuote`

`src/hooks/usePatientDashboard.ts` should expose only the query/mutation hooks that `HomePage.tsx` and `QuotesPage.tsx` consume.

Do not move widget-entry or message-panel API calls into this file.

- [ ] **Step 3: Build CRM-backed Home**

`HomePage.tsx` should show:

- greeting / patient summary
- active case summary or empty state
- pending quotes count or empty state
- CTA into `Messages`
- CTA into `Quotes`
- page-local load/error/empty states that do not block `Quotes` or `Messages`

Use the active/default case contract from `patient-dashboard.ts`.

- [ ] **Step 4: Build CRM-backed Quotes**

`QuotesPage.tsx` should show:

- quotes labeled by case
- quote status
- primary quote details
- accept/reject action where supported
- empty state pointing back to widget/messages
- page-local load/error/empty states that do not block `Home` or `Messages`

- [ ] **Step 5: Build CRM-backed Messages page**

`MessagesPage.tsx` should reuse the same conversation hooks/components as the panel where possible.

Requirements:

- preserve `patient-admin` first ordering
- show formal conversations only
- do not duplicate multi-conversation state logic in a second incompatible way
- show page-local load/error states without breaking `Home` or `Quotes`

- [ ] **Step 6: Rewire `/dashboard`**

`src/pages/Dashboard.tsx` should become a thin wrapper around `PatientDashboardShell`, or be replaced entirely with the new shell component.

Do not leave `DashboardHome`, `QuotesEstimates`, and old Supabase dashboard-summary fetches on the main path.

For valid patient sessions that are restored but not yet `messages-ready`, do not fake a full dashboard:

- show a restricted/guidance state
- direct the user back to the global widget flow to finish hospital selection/bootstrap
- preserve ordinary legacy fallback behavior for non-patient visits

- [ ] **Step 7: Verify**

Manual flow:

1. login as patient through widget/auth foundation
2. open `/dashboard`
3. confirm `Home`, `Quotes`, and `Messages` render from CRM-backed data hooks
4. confirm old `consultation / profile / support` tabs are gone from the patient shell
5. restore a patient who is not yet `messages-ready` and confirm `/dashboard` shows the restricted/guidance state instead of a fake complete dashboard
6. confirm legacy `/login` and hospital portal still work

Then run:
```bash
npm run build
git diff --check
```

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/ src/hooks/usePatientDashboard.ts src/pages/Dashboard.tsx src/services/api/patient-dashboard.ts
git commit -m "feat: migrate China dashboard to CRM patient shell"
```

### Task 7: Final Verification Pass

**Files:**
- Verify impacted files from Tasks 0-6

- [ ] **Step 1: Run final build**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys
npm run build
```

Expected:
- successful Vite production build

- [ ] **Step 2: Run final whitespace check**

```bash
git diff --check
```

Expected:
- no output

- [ ] **Step 3: Manual regression checklist**

Verify all of:

1. `FreeQuoteFloatingButton` still shows on public pages
2. new `ChatWidget` shows beside it
3. patient can chat before base-form submit
4. base-form submit logs patient into the CRM v2 patient flow
5. hospital-selection form appears after submit
6. hospital match request failure and zero-result states are recoverable
7. selecting hospitals opens `PatientMessagePanel`
8. `patient-admin` conversation is first
9. pre-bootstrap history imports once and does not duplicate on refresh
10. `/dashboard` shows only `Home / Quotes / Messages`
11. old hospital `/login` remains untouched

- [ ] **Step 4: Commit final fixes if needed**

```bash
git add .
git commit -m "fix: polish China patient widget and dashboard flow"
```
