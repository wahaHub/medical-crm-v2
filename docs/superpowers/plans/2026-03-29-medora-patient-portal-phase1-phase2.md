# Medora Patient Portal Phase 1 + Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Medora Health Beauty to the shared CRM v2 patient model in Phase 1, then expand it to the full shared patient portal in Phase 2 without losing Medora's marketing-shell and messaging-shell strengths.

**Architecture:** Reuse Medora's existing `ChatWidget`, onboarding shell, auth foundation, and `PatientMessagePanel`, but converge them onto the same patient entry state machine, auth/restore rules, dashboard IA, and phase-2 contracts already established for the shared CRM v2 patient model. Execute in two waves: Phase 1 hardens the core patient flow and, unlike China Phase 1, also migrates intake; Phase 2 adds the remaining portal capabilities (`Tickets / Orders / Journey / AI Summary / Packages`) on top of the stabilized shell.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, CRM v2 patient APIs, Vite build, existing Medora UI components

---

## Scope Note

This is one plan document, but **not** one implementation batch.

Execution order is fixed:

1. complete Phase 1
2. verify and hand off Phase 1
3. start Phase 2 on top of the accepted Phase 1 branch

Do not interleave unfinished Phase 1 and Phase 2 tasks.

## File Structure

### Medora App Files

| File | Responsibility |
|---|---|
| `/Users/haowang/Desktop/medora-health-beauty/App.tsx` | Global shell, route tree, widget/panel mounting |
| `/Users/haowang/Desktop/medora-health-beauty/components/ChatWidget.tsx` | Floating widget shell |
| `/Users/haowang/Desktop/medora-health-beauty/components/chat/OnboardingFlow.tsx` | Widget state orchestration |
| `/Users/haowang/Desktop/medora-health-beauty/components/chat/ContactInfoStep.tsx` | Patient info form |
| `/Users/haowang/Desktop/medora-health-beauty/components/chat/HospitalCards.tsx` | Hospital selection UI |
| `/Users/haowang/Desktop/medora-health-beauty/components/messaging/PatientMessagePanel.tsx` | Main long-form messaging workspace |
| `/Users/haowang/Desktop/medora-health-beauty/contexts/PatientAuthContext.tsx` | Patient auth/bootstrap/logout state |
| `/Users/haowang/Desktop/medora-health-beauty/services/crmApiClient.ts` | CRM v2 patient API client |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/DashboardLayout.tsx` | Dashboard shell/layout |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/DashboardHome.tsx` | Home tab with Medora-specific semantics |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/IntakePage.tsx` | Dedicated `/dashboard/intake` route with dynamic intake renderer and submit flow |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/CaseDetail.tsx` | Existing legacy page; remove from primary IA |

### New Or Expanded Shared Units

| File | Responsibility |
|---|---|
| `/Users/haowang/Desktop/medora-health-beauty/contexts/PatientEntryContext.tsx` | Shared patient entry state machine for widget stages and handoff |
| `/Users/haowang/Desktop/medora-health-beauty/hooks/usePatientEntry.ts` | Consumer hook for patient entry state |
| `/Users/haowang/Desktop/medora-health-beauty/services/patientPhase2Api.ts` | Medora phase-2 patient API layer, matching China/shared contracts |
| `/Users/haowang/Desktop/medora-health-beauty/hooks/usePatientPhase2.ts` | TanStack Query hooks for tickets/orders/journey/ai summary/packages |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/MessagesPage.tsx` | Dashboard messages tab reusing messaging primitives |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/QuotesPage.tsx` | Dashboard quotes tab if not already split cleanly |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/TicketsPage.tsx` | Phase-2 tickets tab |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/OrdersPage.tsx` | Phase-2 orders tab |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/JourneyPage.tsx` | Phase-2 journey tab |
| `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/AiSummaryPage.tsx` | Phase-2 AI summary tab |
| `/Users/haowang/Desktop/medora-health-beauty/pages/Packages.tsx` | Dedicated `/packages` route outside the 7 dashboard tabs |
| `/Users/haowang/Desktop/medora-health-beauty/components/packages/PatientPackagesCatalog.tsx` | Packages page ordering surface |

### Reference Implementations

When matching shared behavior, use these working references rather than inventing new contracts:

- China phase-1/phase-2 frontend branch behavior:
  - `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc`
- Shared backend/contracts phase-2 design:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-28-shared-patient-phase2-backend-contracts-design.md`
- Medora phase-1 design:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-29-medora-patient-portal-phase1-phase2-design.md`

## Chunk 1: Phase 1 Alignment

### Task 1: Create an Isolated Medora Worktree and Capture Baseline

**Files:**
- Modify: none
- Verify: `/Users/haowang/Desktop/medora-health-beauty`

- [ ] **Step 1: Create a fresh worktree for Medora phase 1**

Run:

```bash
git -C /Users/haowang/Desktop/medora-health-beauty worktree add /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/medora-phase1-portal -b codex/medora-phase1-portal
```

- [ ] **Step 2: Capture baseline status and latest commits**

Run:

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/medora-phase1-portal status --short --branch
git -C /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/medora-phase1-portal log --oneline -n 10
```

- [ ] **Step 3: Verify the baseline app builds before changes**

Run:

```bash
npm install
npm run build
```

Expected: existing baseline passes, or any pre-existing failures are documented before implementation starts.

- [ ] **Step 4: Commit setup notes if any new project-level guardrails are needed**

```bash
git add <only phase1 setup files if touched>
git commit -m "chore: prepare Medora phase 1 worktree"
```

### Task 2: Align CRM Client and Patient Auth Bootstrap

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/services/crmApiClient.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/contexts/PatientAuthContext.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/ProtectedRoute.tsx`
- Test: existing auth-related checks or local verification through build + manual routes

- [ ] **Step 1: Compare Medora auth/bootstrap behavior against the accepted China behavior**

Read:

```bash
sed -n '1,260p' /Users/haowang/Desktop/medora-health-beauty/contexts/PatientAuthContext.tsx
sed -n '1,260p' /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/contexts/PatientAuthContext.tsx
```

- [ ] **Step 2: Add or confirm CRM v2 auth helpers in `crmApiClient.ts`**

Support these calls:

- `getMe`
- `verifyMagicLink`
- `restoreSession`
- `logout`

- [ ] **Step 3: Update bootstrap order in `PatientAuthContext.tsx`**

Bootstrap order must be:

1. `getMe`
2. restore token path
3. logged-out state

- [ ] **Step 4: Preserve `/dashboard?token=...` bootstrap behavior**

Ensure token handling still resolves before redirecting unauthenticated users away from `/dashboard`.

- [ ] **Step 5: Make logout clear patient-scoped cache/query state**

If Medora already uses TanStack Query for patient data, clear patient-only query groups on logout.

- [ ] **Step 6: Run build after auth-layer changes**

Run:

```bash
npm run build
```

- [ ] **Step 7: Commit auth/bootstrap alignment**

```bash
git add services/crmApiClient.ts contexts/PatientAuthContext.tsx components/ProtectedRoute.tsx
git commit -m "feat: align Medora patient auth bootstrap"
```

### Task 3: Add a Dedicated Patient Entry State Layer

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/contexts/PatientEntryContext.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/hooks/usePatientEntry.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/App.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/ChatWidget.tsx`

- [ ] **Step 1: Define the state model**

The entry state must explicitly support:

- `collect-profile`
- `select-hospitals`
- `messages-ready`
- `bootstrap-error`

- [ ] **Step 2: Track pre-bootstrap history separately from auth**

State must include:

- opening/system message seeded once
- patient-authored local messages
- same-browser persistence for pre-bootstrap recovery
- selected hospitals
- whether import into formal admin conversation is pending or finished

- [ ] **Step 3: Mount the provider near the top of `App.tsx`**

The entry provider should wrap the floating widget and `PatientMessagePanel` consumers.

- [ ] **Step 4: Verify provider wiring does not break existing routes**

Run:

```bash
npm run build
```

- [ ] **Step 5: Commit patient entry state layer**

```bash
git add App.tsx contexts/PatientEntryContext.tsx hooks/usePatientEntry.ts components/ChatWidget.tsx
git commit -m "feat: add Medora patient entry state"
```

### Task 4: Align the Widget Opening State and Resume Rules

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/ChatWidget.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/chat/OnboardingFlow.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/chat/ContactInfoStep.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/chat/HospitalCards.tsx`

- [ ] **Step 1: Change the first-open widget state to the shared hybrid model**

Widget must show:

- opening message
- 5-field patient info form
- normal message input

- [ ] **Step 2: Allow chat at all stages**

Patients must still be able to send messages during:

- pre-submit state
- post-submit hospital-selection state
- resumed messages-ready state

- [ ] **Step 3: Implement returning-user stage restoration**

The widget must restore to:

- patient info form
- hospital selection form
- normal compact chat
- or retry-safe `bootstrap-error`

depending on actual patient state.

- [ ] **Step 4: Ensure no form is shown in `messages-ready`**

Returning patients with formal conversations should see only normal chat history in the compact widget.

- [ ] **Step 5: Run build and smoke-check route startup**

Run:

```bash
npm run build
```

- [ ] **Step 6: Commit widget/resume alignment**

```bash
git add components/ChatWidget.tsx components/chat/OnboardingFlow.tsx components/chat/ContactInfoStep.tsx components/chat/HospitalCards.tsx
git commit -m "feat: align Medora widget stages and resume rules"
```

### Task 5: Converge Hospital Selection and Message Panel Handoff

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/chat/HospitalCards.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/messaging/PatientMessagePanel.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/messaging/ChatView.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/services/crmApiClient.ts`

- [ ] **Step 1: Ensure hospital options come from the CRM-driven match contract**

Do not preserve Medora-only hospital-selection assumptions if they differ from the shared model.

- [ ] **Step 2: Keep `PatientMessagePanel` as the main messaging workspace**

The panel should open immediately after successful hospital selection and history import bootstrap.

- [ ] **Step 3: Pin the `patient-admin` conversation first**

The admin conversation is the landing place for imported pre-bootstrap history.

- [ ] **Step 4: Keep dashboard messages and panel messages on the same conversation source**

No forked message implementation.

- [ ] **Step 5: Run build**

```bash
npm run build
```

- [ ] **Step 6: Commit panel handoff alignment**

```bash
git add components/chat/HospitalCards.tsx components/messaging/PatientMessagePanel.tsx components/messaging/ChatView.tsx services/crmApiClient.ts
git commit -m "feat: align Medora message panel handoff"
```

### Task 6: Converge Dashboard IA to the Shared First-Stage Shell

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/App.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/DashboardLayout.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/DashboardHome.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/MessagesPage.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/QuotesPage.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/CaseDetail.tsx`

- [ ] **Step 1: Update route structure to shared dashboard tabs**

Phase 1 dashboard should formally center:

- `Home`
- `Quotes`
- `Messages`

- [ ] **Step 2: Keep stronger Medora semantics on `DashboardHome`**

Preserve or add:

- action items
- case context
- message urgency
- next-step CTA blocks

- [ ] **Step 3: Remove `CaseDetail` from the primary IA**

Do not keep case-detail-centric routing as the main patient model after Phase 1.

- [ ] **Step 4: Make dashboard messages reuse the panel/message primitives**

Do not fork a second messages stack.

- [ ] **Step 5: Keep intake on a dedicated route, not a top-level tab**

Expose intake via `/dashboard/intake` or an equivalent nested route, launched from `Home` action items and intake-needed CTAs.

- [ ] **Step 6: Run build**

```bash
npm run build
```

- [ ] **Step 7: Commit dashboard IA alignment**

```bash
git add App.tsx pages/dashboard/DashboardLayout.tsx pages/dashboard/DashboardHome.tsx pages/dashboard/CaseDetail.tsx pages/dashboard/MessagesPage.tsx pages/dashboard/QuotesPage.tsx
git commit -m "feat: align Medora dashboard phase 1 shell"
```

### Task 7: Upgrade Intake to the New Dynamic Contract

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/IntakePage.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/services/crmApiClient.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/hooks/usePatientIntake.ts`
- Reuse backend contract assumptions from CRM v2 patient intake implementation

- [ ] **Step 1: Inspect the current Medora intake assumptions**

Read:

```bash
sed -n '1,260p' /Users/haowang/Desktop/medora-health-beauty/pages/dashboard/IntakePage.tsx
```

- [ ] **Step 2: Replace `string | string[]` assumptions with the new dynamic intake payload model**

The renderer should support the new template-driven contract shape instead of the old fixed-answer model.

- [ ] **Step 3: Support draft/submitted state according to the new contract**

Do not keep old single-submit assumptions if the CRM contract has draft semantics.

- [ ] **Step 4: Keep the UI focused and do not overbuild upload polish before backend support exists**

Honor the new contract, but avoid speculative extra UX that the backend does not yet support.

- [ ] **Step 5: Make the intake route reachable from `DashboardHome`**

Ensure `Home` action items and intake-needed alerts navigate to the dedicated intake route instead of any retired case-detail path.

- [ ] **Step 6: Run build**

```bash
npm run build
```

- [ ] **Step 7: Commit intake migration**

```bash
git add pages/dashboard/IntakePage.tsx services/crmApiClient.ts hooks/usePatientIntake.ts
git commit -m "feat: migrate Medora intake to dynamic contract"
```

### Task 8: Phase 1 Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run final type/build verification**

```bash
npm run build
```

- [ ] **Step 2: Run diff hygiene**

```bash
git diff --check
git status --short --branch
```

- [ ] **Step 3: Capture the Phase 1 handoff summary**

Document:

- routes changed
- retained Medora shell semantics
- any deferred Phase 2 work

- [ ] **Step 4: Commit final Phase 1 hardening if needed**

```bash
git add <phase1 files>
git commit -m "fix: finalize Medora phase 1 portal alignment"
```

## Chunk 2: Phase 2 Portal Expansion

### Task 9: Port the Shared Patient Phase-2 API Layer into Medora

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/services/patientPhase2Api.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/hooks/usePatientPhase2.ts`
- Reference: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/services/api/patient-phase2.ts`
- Reference: `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/hooks/usePatientPhase2.ts`

- [ ] **Step 1: Review the China phase-2 hooks and reuse the contract shapes**

Read:

```bash
sed -n '1,260p' /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/services/api/patient-phase2.ts
sed -n '1,320p' /Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc/src/hooks/usePatientPhase2.ts
```

- [ ] **Step 2: Port only the shared patient contract layer**

Support:

- tickets
- orders
- packages
- journey
- ai summary
- patient cases lookup for selectors

- [ ] **Step 3: Keep query keys patient-scoped**

Do not repeat the cache leakage problem already found in China.

- [ ] **Step 4: Run build**

```bash
npm run build
```

- [ ] **Step 5: Commit phase-2 API layer**

```bash
git add services/patientPhase2Api.ts hooks/usePatientPhase2.ts
git commit -m "feat: add Medora patient phase 2 data layer"
```

### Task 10: Expand the Dashboard to the Full Shared 7-Tab Portal

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/DashboardLayout.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/TicketsPage.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/OrdersPage.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/JourneyPage.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/pages/dashboard/AiSummaryPage.tsx`

- [ ] **Step 1: Add the final shared tabs to the dashboard shell**

Tabs must become:

- `Home`
- `Quotes`
- `Messages`
- `Tickets`
- `Orders`
- `Journey`
- `AI Summary`

- [ ] **Step 2: Build the tickets tab**

Support:

- create
- list
- detail
- reply

- [ ] **Step 3: Build the orders tab**

Support:

- list
- detail
- payment-init action for orders awaiting payment

- [ ] **Step 4: Build the journey tab**

Support:

- case selector
- read-only journey view
- visible milestones only

- [ ] **Step 5: Build the AI summary tab**

Support:

- case selector
- `EMPTY / PENDING / READY / FAILED` states

- [ ] **Step 6: Run build**

```bash
npm run build
```

- [ ] **Step 7: Commit dashboard phase-2 tabs**

```bash
git add pages/dashboard/DashboardLayout.tsx pages/dashboard/TicketsPage.tsx pages/dashboard/OrdersPage.tsx pages/dashboard/JourneyPage.tsx pages/dashboard/AiSummaryPage.tsx
git commit -m "feat: add Medora patient phase 2 dashboard tabs"
```

### Task 11: Add the Shared Packages Route and Ordering Flow

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/components/packages/PatientPackagesCatalog.tsx`
- Create: `/Users/haowang/Desktop/medora-health-beauty/pages/Packages.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/App.tsx`

- [ ] **Step 1: Add a dedicated `/packages` route outside the 7 dashboard tabs**

This route is the executable package surface for Medora Phase 2.

- [ ] **Step 2: Port the China packages catalog pattern into Medora**

Reuse the shared contract shape, not a Medora-specific order path.

- [ ] **Step 3: Support package browse/detail and ordering from the packages route**

Order creation must go through the shared patient order contract.

- [ ] **Step 4: Route successful order creation to dashboard orders**

Use the same success handoff pattern as China.

- [ ] **Step 5: Run build**

```bash
npm run build
```

- [ ] **Step 6: Commit packages ordering flow**

```bash
git add components/packages/PatientPackagesCatalog.tsx pages/Packages.tsx App.tsx
git commit -m "feat: add Medora packages ordering flow"
```

### Task 12: Add Reliable Phase-2 Entry Actions to PatientMessagePanel

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/messaging/PatientMessagePanel.tsx`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/components/messaging/ChatView.tsx`

- [ ] **Step 1: Add reliable phase-2 entry actions into the message workspace**

Support actions such as:

- `Browse Packages`
- `View Orders`

- [ ] **Step 2: Do not stuff `Journey` or `AI Summary` into the panel**

Those stay dashboard-only.

- [ ] **Step 3: Keep actions contract-realistic**

Do not invent brittle hidden-text parsing for package references unless the backend has a formal structured message contract.

- [ ] **Step 4: Run build**

```bash
npm run build
```

- [ ] **Step 5: Commit message-panel phase-2 actions**

```bash
git add components/messaging/PatientMessagePanel.tsx components/messaging/ChatView.tsx
git commit -m "feat: add Medora phase 2 message actions"
```

### Task 13: Phase 2 Final Verification and Handoff

**Files:**
- Verify only

- [ ] **Step 1: Run final build**

```bash
npm run build
```

- [ ] **Step 2: Run diff hygiene**

```bash
git diff --check
git status --short --branch
```

- [ ] **Step 3: Confirm final portal behavior against the spec**

Check:

- unified 7-tab IA
- Medora `Home` still carries stronger context semantics
- packages ordering works
- tickets/orders/journey/ai summary are all reachable
- message panel still feels like Medora's primary workspace

- [ ] **Step 4: Commit final hardening if needed**

```bash
git add <phase2 files>
git commit -m "fix: finalize Medora patient portal phase 2"
```
