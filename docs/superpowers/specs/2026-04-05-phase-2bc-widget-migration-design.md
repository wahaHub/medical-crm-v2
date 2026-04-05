# Phase 2BC Widget Migration Design

**Date**: 2026-04-05

## Goal

Migrate the useful widget, auth, and messaging improvements from:

- `medical-crm-v2` branch `feature/phase-2bc`
- `china` worktree `china-phase-2bc`

into the current backend-authoritative chatbot architecture without reintroducing the old phase-driven frontend orchestration.

This migration must preserve the strong UX gains from `phase-2bc`:

- improved widget and panel UI
- patient login/session restore
- automatic loading of formal CRM history and status after login
- blocking chat before the base profile form is submitted

while removing the parts that conflict with the current chatbot design:

- pre-bootstrap local chat history
- temporary-history import and retry flows
- legacy chatbot actions/contracts
- frontend-owned logic for deciding when hospital selection, questionnaire, or medical travel process content should appear

## Source Projects

### China UI source

- `/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-phase-2bc`

### CRM/backend source of truth

- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2`

## Final Product Rules

### 1. Base form is required before chat

The patient cannot send chat messages before submitting the base patient profile form.

The base form remains the onboarding gateway and continues to use the existing `phase-2bc` assumption:

- submit base form
- create or restore patient session
- automatically log the patient in
- unlock formal chat

There is no pre-bootstrap local chat mode in the new design.

### 2. Pre-bootstrap chat is removed

Delete the entire pre-bootstrap local history/import model:

- local pre-bootstrap widget messages
- temporary-history import
- import retry banners
- any logic that assumes messages can exist before formal CRM state exists

Because chat is locked until the base form is submitted, this intermediate history layer is no longer needed.

### 3. Base form submission must provision a formal chat target immediately

Once the base form is submitted successfully, the backend must provision a canonical formal chat target immediately.

For the new widget flow, the default canonical target is:

- a backend-owned chatbot session

This target is created or restored immediately after successful base-form submission and is the default destination for:

- chatbot messages
- chatbot attachments
- rich-block-driven next-step orchestration

A formal `patient-admin` conversation is a downstream artifact that may be created or attached later when the backend determines the workflow has entered a formal human conversation phase. It is not the default first chat target for the widget.

The frontend must never have an unlocked chat composer without knowing where outgoing messages and attachments should be stored.

### 4. Backend is the only source of truth

`medical-crm-v2` remains the only source of truth for all persistent widget and chatbot business state.

`china` is only responsible for:

- rendering UI
- restoring UI from backend state
- executing actions against backend APIs

The frontend must not decide business sequencing.

### 5. Rich interactions are backend-driven

These surfaces are no longer phase-driven frontend logic. They only appear when the backend returns the corresponding block or state:

- hospital recommendation cards
- questionnaire / medical form modal
- medical travel process modal
- consult booking card
- human handoff text/link

`HUMAN_HANDOFF` is not a passive text hint. It has a required backend side effect contract:

- create a new human-handoff ticket when no active ticket exists
- reuse the active ticket when one already exists for the same case/session context
- notify the admin through the existing backend ticket/handoff pipeline
- return user-facing follow-up content that includes:
  - dashboard navigation for tracking the ticket and replies
  - the support email `customer@medicaltourismchina.health`

## State Model

### Backend-persisted state

The backend owns all persistent business state needed for restore and continuity:

- patient session
- case
- selected hospital / selected hospitals
- questionnaire / medical form status
- consult status
- formal conversations
- formal message history
- chatbot orchestration state
- selected-hospital truth

### Chatbot orchestration state

This state must live in `medical-crm-v2`, not in `china`, and must be restored after login:

- `selectedHospitalId`
- `pendingOffer`
- `pendingQuestion`
- `lastNextAction`
- `conversationSummary`
- any other backend-owned state needed to decide the next step and render the correct block

### State separation

Restore logic must explicitly separate:

1. **Formal conversation state**
   - conversation ids
   - active conversation
   - message history
   - attachment history

2. **Chatbot orchestration state**
   - next-step guidance
   - active hospital context
   - block-driving status

These two layers come from the backend, but they are not the same thing and must not be conflated in the frontend.

### Frontend-only transient state

`china` may keep transient UI state only:

- widget open/closed
- panel open/closed
- modal open/closed
- currently viewed conversation/thread
- unsent input draft

This state is not persisted as backend truth.

Any selected-hospital state held in frontend context is only a mirror/cache for rendering or optimistic interaction. It is never the authoritative source of truth. The backend-owned selected-hospital state wins on restore and conflict resolution.

## Composer Rules

The formal chat composer remains intentionally narrow:

- text
- attachments

It does not own rich actions.

Rich interactions live inside assistant messages:

- assistant text
- rich blocks
- block-level action buttons

This preserves a clean separation:

- composer = patient input
- message blocks = system-driven next-step UI

## What To Keep From `china-phase-2bc`

### Keep directly or with minimal reshaping

- `PatientAuthContext` session restore model
- `PatientEntryContext` as the widget UI state container
- `PatientMessagePanel`
- `ConversationThread`
- the improved shell/layout/styling of the widget and message panel
- the gated formal composer model

### Keep conceptually, but simplify

Keep the good parts of `PatientEntryContext`, but remove responsibilities related to:

- pre-bootstrap local history
- temporary import state
- import retry lifecycle

The context should remain responsible for:

- widget/panel shell state
- active formal conversation state
- base-form completion state
- selected hospital UI mirror/cache state
- syncing restored backend status into the UI

## What To Refactor Into Block Renderers

These UI surfaces are worth reusing visually, but their appearance must be driven by backend blocks instead of phase logic:

- hospital selection cards
- questionnaire / medical form prompt
- medical travel process prompt

Concretely:

- `HospitalSelectionForm` becomes a renderer/executor for backend hospital recommendation or selection state
- `MedicalFormPromptCard` becomes the renderer for `QUESTIONNAIRE_MODAL_TRIGGER`
- `MedicalTravelProcessPromptCard` becomes the renderer for `PROCESS_MODAL_TRIGGER`

The visual treatment may be reused. The frontend-owned decision logic may not.

## What To Remove

### Remove from `china-phase-2bc`

- pre-bootstrap local chat history
- temporary-history import
- retry-import UX
- any ability to send chat before the base form is submitted
- phase-driven business orchestration

### Remove from `medical-crm-v2`

Do not reintroduce:

- legacy chatbot action enums
- legacy public chatbot response shapes
- old upload-card semantics that bypass questionnaire-first intake
- frontend-driven sequencing assumptions

## Migration Strategy

### Step 1. Migrate shell and formal messaging foundation

Bring over or align:

- widget shell
- message panel
- thread view
- composer
- auth/session restore
- base-form submission -> auto-login
- base-form-required gating

Do **not** bring over pre-bootstrap history/import logic.

### Step 2. Wire restore to backend truth

Ensure login/session restore fetches enough backend truth to restore:

- formal chat target
- formal conversations
- selected hospital(s)
- questionnaire status
- consult status
- chatbot orchestration state

### Step 3. Replace mechanical phase blocks with backend-driven blocks

Swap out frontend-owned appearance rules for backend-driven rendering:

- process modal trigger
- questionnaire modal trigger
- hospital recommendation cards
- consult booking card
- human handoff text/link

### Step 4. Enforce a clean architectural boundary

Final architecture:

- `medical-crm-v2` decides business state and next-step UI
- `china` renders and executes
- no duplicate business orchestration in the frontend

## Acceptance Criteria

### Patient entry and restore

- Before base form submit, chat is disabled
- After base form submit, patient is automatically logged in
- After base form submit, a formal chat target exists immediately
- Returning logged-in patients restore directly into formal CRM-backed state

### Messaging

- Outgoing text and attachments always go to formal CRM-backed conversations
- No temporary message import path remains
- Message panel and thread load from formal backend data only

### Rich interaction behavior

- Hospital recommendation/questionnaire/process/consult UI appears only when backend says so
- `china` does not guess or schedule these surfaces on its own

### State recovery

- Login restore recovers both formal conversation state and chatbot orchestration state
- Transient UI state remains frontend-only

## Recommendation

Adopt **selective migration (Approach B)**:

- absorb the strong shell/auth/restore/messaging foundation from `phase-2bc`
- discard its local-history and mechanical business-orchestration logic
- re-anchor the experience to the current backend-authoritative chatbot contract

This gives the team the best parts of the `phase-2bc` UX without regressing back into a split-brain system where frontend phase logic competes with backend chatbot orchestration.
