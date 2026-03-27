# China Chat Widget + Messages + Dashboard Design

## Goal

Define the next China phase on top of the new CRM v2 patient auth foundation:

- keep the existing `FreeQuoteFloatingButton` in place
- add a new floating `ChatWidget` beside it
- make the widget the real patient entry flow
- preserve all pre-bootstrap chat history and carry it into the formal patient/admin conversation
- open a large `PatientMessagePanel` after hospital selection
- migrate `/dashboard` to the new patient shell for `Home`, `Quotes`, and `Messages` only

This spec is intentionally narrower than the full March 26 integration spec. It only covers:

- marketing-site patient entry
- patient/admin + patient/hospital messaging bootstrap
- dashboard `Home / Quotes / Messages`

It does not deliver `Tickets`, `Journey`, `AI Summary`, or `Orders`.

## Product Rules

### Entry Points

- The China site keeps the current floating [`FreeQuoteFloatingButton`](/Users/haowang/Desktop/medora-health-beauty/.codex-worktrees/china-medical-journeys-guest-restore/src/components/FreeQuoteFloatingButton.tsx).
- A new patient `ChatWidget` is added beside it.
- These two entry points coexist during this phase.
- The new `ChatWidget` is the shared CRM v2 patient flow. `FreeQuoteFloatingButton` remains a legacy/parallel entry and is not rewritten in this phase.

### Chat Widget Opening State

When the patient opens the new `ChatWidget`, the expanded state must show both:

- a compact form for the agreed 5 base patient fields
- a visible opening message such as `What can I help you with?`

The opening state must also include a standard message input so the patient can chat immediately without filling the form first.
The opening/system message should be written into local pre-bootstrap history as soon as the widget first initializes, so later import semantics are consistent.

### Base Patient Fields

The 5 base patient fields for this phase are:

1. `name`
2. `email`
3. `phone`
4. `disease`
5. `destination`

`destination` means the patient's preferred city/region in China, or `No preference` if they do not have one yet.

### Pre-Bootstrap Chat Behavior

- Before formal conversations are ready, the patient may keep chatting indefinitely in the widget.
- This is true both before the base form is submitted and after submit while the patient is still in `select-hospitals`.
- These messages are stored as local pre-bootstrap widget history.
- They are not discarded when the user later submits the form or selects hospitals.
- Once formal conversations are ready, all accumulated pre-bootstrap chat history becomes part of the formal `patient <-> admin` conversation history.

### Base Form Submit Behavior

- The base form is not just lead capture.
- Submitting it immediately creates or restores the patient session and patient case through CRM v2.
- No extra reply or second confirmation step is required.
- Once submitted successfully, the patient is treated as logged in for the CRM v2 patient flow.

### Post-Login Widget State

After successful base-form submit:

- the top form inside the widget no longer shows base patient info
- it changes into a hospital-selection form
- the chat input remains available
- messages sent in this phase still go into local pre-bootstrap history until formal conversations exist

### Hospital Selection Behavior

- Hospital selection data comes from `matchHospitals`
- the UI allows multi-select
- the matching algorithm itself may still be stubbed in this phase, but the frontend contract and state model must already assume CRM-driven match results

### Post-Selection Behavior

When the patient submits hospital selection:

1. call `selectHospitals`
2. create or load the resulting conversations
3. identify the formal `patient-admin` conversation and all `patient-hospital` conversations
4. attempt to import the local pre-bootstrap chat history into the formal patient/admin conversation
5. open the large `PatientMessagePanel`

The `PatientMessagePanel` must show:

- one `patient <-> admin` conversation first
- then `N` `patient <-> hospital` conversations

The `patient <-> admin` conversation is the place where the pre-bootstrap widget history lands.

## Scope

### In Scope

- New global marketing-site `ChatWidget`
- Local pre-bootstrap chat history before formal conversations are ready
- Base form submit into CRM v2 onboarding/session flow
- Hospital-selection form inside the widget after login
- Large `PatientMessagePanel`
- Formal conversation bootstrap after hospital selection
- Dashboard migration for:
  - `Home`
  - `Quotes`
  - `Messages`

### Out of Scope

- Replacing or removing `FreeQuoteFloatingButton`
- Rewriting `FreeQuote` page or old quote modal flows
- `Tickets`
- `Journey`
- `AI Summary`
- `Orders`
- Intake contract migration
- Hospital-matching algorithm quality work

## UX Flow

### Flow A: Patient Chats First, Submits Later

1. Patient opens `ChatWidget`
2. Widget shows base-info form + opening message + message input
3. Patient sends one or more messages without submitting the form
4. Messages stay in local temporary history
5. Patient eventually submits the base form
6. Frontend creates/restores CRM patient session and case
7. Widget switches from base-info form to hospital-selection form
8. Patient selects hospitals
9. Frontend calls `selectHospitals`
10. Frontend loads/identifies formal conversations
11. Frontend attempts temporary-history import into the formal patient/admin conversation
12. Large `PatientMessagePanel` opens

### Flow B: Patient Submits Immediately

1. Patient opens `ChatWidget`
2. Patient fills the 5 fields and submits
3. Frontend creates/restores patient session and case
4. Widget switches to hospital-selection form
5. Patient selects hospitals
6. Panel opens with patient/admin plus patient/hospital conversations

### Flow C: Returning Same-Browser Patient

1. Patient returns on the same browser
2. Existing patient auth foundation tries CRM cookie, then restore token
3. If patient session is valid and the patient already has formal conversations, widget skips all forms
4. In that resumed state, the widget behaves as a normal compact chat box for the `patient-admin` conversation and shows prior formal chat history from that conversation
5. Existing messages can reopen through `PatientMessagePanel`

### Flow D: Returning Logged-In Patient Before Hospital Selection

1. Patient already submitted the base form in an earlier session
2. Patient is restored through CRM cookie or restore token
3. Patient has no completed hospital selection / no formal conversation bootstrap yet
4. Widget resumes in `select-hospitals`
5. Prior pre-bootstrap chat history is still present
6. No base-info form is shown again unless the session cannot be restored

## Architecture

### 1. Patient Auth Layer

Existing `PatientAuthContext` remains responsible only for:

- CRM patient identity/session state
- cookie bootstrap
- restore-token bootstrap
- magic-link verification
- logout

It must not own widget UI state, pre-bootstrap chat state, hospital selection UI state, or panel open/close state.

### 2. Patient Entry Layer

Add a dedicated patient-entry UI state layer for the marketing-site flow.

Responsibilities:

- whether the `ChatWidget` is open/minimized
- whether the patient is in `collect-profile` or `select-hospitals`
- whether the patient is in `messages-ready`
- local pre-bootstrap message history before formal conversation bootstrap
- onboarding submit/loading/error state
- match results state
- hospital selection state
- whether `PatientMessagePanel` is open
- which conversation is active by default after bootstrap

This state must be separate from auth state.

It is the single source of truth for:

- whether the panel is closed or open
- which conversation should be the default active conversation when the panel opens for the first time after hospital selection
- whether pre-bootstrap history import is pending, succeeded, or failed

Once the panel is open, the entry layer no longer owns ongoing in-panel conversation switching.

The explicit entry phases are:

- `collect-profile`
- `select-hospitals`
- `messages-ready`
- `bootstrap-error`

Phase rules:

- `collect-profile`: show base-info form + opening message + chat input
- `select-hospitals`: show hospital-selection form + chat input
- `messages-ready`: show normal chat widget history without any form
- `bootstrap-error`: show recoverable error UI with retry action, without discarding temporary state

Returning patients with existing formal conversations should resume into `messages-ready`.

### Resume Matrix

| Session state on return | Widget phase | What is shown |
|---|---|---|
| No CRM patient session, no saved progress | `collect-profile` | base-info form + opening message + empty new-chat state |
| No CRM patient session, but saved local pre-bootstrap history exists | `collect-profile` | base-info form + opening message + restored anonymous pre-bootstrap chat |
| CRM patient restored, onboarding done, hospitals not yet selected | `select-hospitals` | hospital-selection form + preserved pre-bootstrap chat |
| CRM patient restored, hospital selection done, formal conversations exist | `messages-ready` | normal chat widget with prior formal chat history and no forms |
| CRM patient restored, but conversation bootstrap previously failed | `bootstrap-error` | retry UI + preserved temporary state |

### 3. Formal Messaging Layer

The large `PatientMessagePanel` owns:

- conversation list rendering
- active conversation selection
- patient/admin conversation pinned first
- patient/hospital conversations following behind
- formal message fetch/send behavior

The panel is the main long-form messaging surface after hospital selection. The small widget is not the primary ongoing conversation surface.

The handoff is:

- entry state decides when the panel opens and what the initial active conversation is
- after open, `PatientMessagePanel` becomes the source of truth for conversation switching and message interaction

In `messages-ready`, the small `ChatWidget` shows only the `patient-admin` conversation as a compact ongoing chat surface.
It may continue sending formal messages to that admin conversation.
It does not own multi-conversation navigation.
Switching across hospital conversations remains a responsibility of `PatientMessagePanel` and dashboard `Messages`.

### 4. Patient Dashboard Layer

`/dashboard` becomes the new patient dashboard shell for this phase.

Delivered tabs:

- `Home`
- `Quotes`
- `Messages`

Deferred tabs:

- `Tickets`
- `Journey`
- `AI Summary`
- `Orders`

Deferred tabs must not force broader backend/frontend migration work in this phase.

### Dashboard Tab Requirements

#### Home

The delivered `Home` tab must show CRM-backed patient overview information only. Minimum required content:

- greeting / patient identity summary
- active case summary or empty state
- pending quotes count or empty state
- shortcut CTA into `Messages`
- shortcut CTA into `Quotes`

The old Supabase `dashboard_summary` contract must not remain the data source for this delivered view.

`Home` should be driven by the patient's active case for this phase.
If multiple cases exist, the backend/frontend contract must expose which one is the active/default case instead of making the frontend guess.

#### Quotes

The delivered `Quotes` tab must show CRM-backed quote data. Minimum required content:

- list of quotes grouped by case or clearly labeled by case
- quote status
- primary quote details summary
- accept/reject actions where supported by CRM v2
- empty state pointing back to the widget / message flow if there are no quotes yet

For this phase, quotes should not be assembled only by ad hoc frontend fan-out over `cases + singular case quote fetches`.
The frontend may still use case-linked quote data internally, but implementation planning should assume a patient-friendly quotes summary/list contract is available for dashboard use.

#### Messages

The delivered `Messages` tab must show formal CRM-backed conversations.

For this phase:

- it may reuse the same underlying conversation/message components as `PatientMessagePanel`
- it does not have to render as the exact same modal/panel shell
- it must preserve conversation ordering:
  - first `patient-admin`
  - then `patient-hospital`

The global `PatientMessagePanel` remains the preferred high-focus message surface launched from the widget. The dashboard `Messages` tab is a dashboard page surface over the same formal conversation data.

## Component Design

### Global App Mounting

`App.tsx` should mount globally:

- existing `FreeQuoteFloatingButton`
- new `ChatWidget`
- new `PatientMessagePanel`

The message panel must live outside the dashboard route subtree so it can open from both:

- marketing/public pages
- dashboard pages

### ChatWidget

Responsibilities:

- floating entry button/bubble
- expand/collapse behavior
- opening state container
- switching between:
  - base-info form
  - hospital-selection form
- showing local pre-bootstrap messages while formal conversations are not ready

It should not directly own the full conversation list UI once the big panel is open.

### Base Info Form

Responsibilities:

- collect 5 base patient fields
- submit into CRM onboarding/session flow
- remain visible even while the patient is also chatting

Submitting this form must immediately transition the patient into logged-in CRM patient state.

### Hospital Selection Form

Responsibilities:

- render `matchHospitals` results
- allow multi-select
- submit selected hospitals

This form replaces the base-info form after successful patient onboarding/login.

### PatientMessagePanel

Responsibilities:

- open as the main post-selection messaging surface
- show patient/admin conversation first
- show patient/hospital conversation list after it
- load history and send text messages

The first/admin conversation must absorb the local pre-bootstrap widget history.

### Dashboard Shell

Responsibilities in this phase:

- patient navigation container
- `Home`
- `Quotes`
- `Messages`

The dashboard must not depend on old Supabase `dashboard_summary` data for these delivered areas.

## Data Model

### Pre-Bootstrap Widget Message

Minimum local structure:

- `id`
- `role` (`patient` or `assistant/system-ui`)
- `content`
- `createdAt`

This is local UI state before CRM conversation bootstrap.

### Formal Conversation Model

The panel and dashboard messages tab should use CRM v2 conversation/message models.

The important product distinction is:

- one conversation is `patient-admin`
- remaining conversations are `patient-hospital`

The frontend must preserve that ordering.

### Pre-Bootstrap Import Semantics

All pre-bootstrap widget messages become part of the formal `patient-admin` conversation history, including:

- patient-authored messages
- the opening/system message shown in the widget

Import order must preserve original chronological order.

## Data Flow

### A. Before Base-Form Submit

- Patient sends message in widget
- Frontend appends it to local pre-bootstrap history
- No formal CRM conversation write happens yet
- In this phase, pre-bootstrap history should survive same-browser refresh/navigation by using local browser storage

### B. After Base-Form Submit But Before Formal Conversations

- Patient is already in CRM patient auth state
- Widget phase is typically `select-hospitals`
- Patient may keep chatting
- Frontend continues appending those messages to the same local pre-bootstrap history
- No formal CRM conversation write happens yet

### C. Base-Form Submit

Frontend calls onboarding/init and stores:

- patient identity/session
- case identity
- restore token via auth flow

After success:

- patient auth becomes active
- entry state phase becomes whatever `nextStep` says:
  - `select-hospitals`
  - or `messages-ready`

If `nextStep = messages-ready` and local pre-bootstrap history exists:

- frontend must immediately load/identify the formal `patient-admin` conversation
- frontend must attempt pre-bootstrap history import before entering steady-state resumed messaging
- if import fails, frontend still enters the resumed messaging experience with visible retry/error indication
- if the formal `patient-admin` conversation cannot be loaded or identified on this path, frontend must enter `bootstrap-error`, preserve local pre-bootstrap history, and offer retry

### D. Hospital Matching

Frontend calls `matchHospitals` using the current case/profile context.

For this phase, `matchHospitals` runs automatically when the entry flow first enters `select-hospitals`.
The patient does not need an extra button just to start matching.

For this phase:

- API integration must exist
- request failure must keep the patient in `select-hospitals`, preserve local pre-bootstrap history, show explicit error UI, and allow retry
- empty/stub results must be handled gracefully
- algorithm quality is not required
- if zero hospitals are returned, the UI stays in hospital-selection state and shows:
  - empty-state explanation
  - retry/rematch action
  - optional continue-later path
- the patient cannot submit hospital selection with zero selected hospitals

### E. Hospital Selection

Frontend calls `selectHospitals` with:

- `caseId`
- selected `hospitalIds[]`

On success:

- fetch/load formal conversations
- ensure patient/admin conversation exists and is first
- attempt to import local pre-bootstrap history into that admin conversation
- open `PatientMessagePanel`

If formal conversations cannot be loaded or the frontend cannot identify a `patient-admin` conversation:

- do not silently continue
- keep the patient in the post-selection state
- show an explicit bootstrap error
- provide retry behavior
- do not discard local pre-bootstrap history

### F. Dashboard

The new dashboard uses CRM v2 APIs for:

- case overview/home content
- quotes
- messages

It must not continue to rely on the old `dashboard_summary` contract for the delivered tabs.

If patient auth restore is unavailable or the user lands on `/dashboard` without a valid patient session, the existing non-patient fallback behavior remains in place for this phase; this spec does not require a forced redirect to patient login for ordinary unauthenticated legacy visits.

## API Contract Assumptions

This frontend phase assumes the following CRM v2 endpoints/contracts exist or will exist in the shared backend:

- `POST /api/patient/onboarding/init`
- `POST /api/patient/match-hospitals`
- `POST /api/patient/select-hospitals`
- `POST /api/patient/conversations/:id/import-temporary-history`
- `GET /api/patient/conversations`
- `GET /api/patient/conversations/:id/messages`
- `POST /api/patient/conversations/:id/messages`
- `GET /api/patient/cases`
- `GET /api/patient/cases/:id`
- `GET /api/patient/quotes`
- `GET /api/patient/cases/:id/quote`
- `POST /api/patient/cases/:id/quote/accept`
- `POST /api/patient/cases/:id/quote/reject`

### Minimum Request / Response Contracts

The frontend depends on the following minimum contract shapes.

#### `POST /api/patient/onboarding/init`

Request:

- `name`
- `email`
- `phone`
- `disease`
- `destination`

Response minimum:

- `patientId`
- `caseId`
- `restoreToken`
- `nextStep: 'select-hospitals' | 'messages-ready'`

`nextStep` is authoritative.
It tells the frontend whether this onboarding result should resume hospital selection or go straight to the resumed messaging-ready state.

#### `POST /api/patient/match-hospitals`

Request minimum:

- `caseId`
- current patient profile context derived from the 5 base fields

Response minimum:

- `hospitals: Array<{ id: string; name: string; city?: string; summary?: string }>`

#### `POST /api/patient/select-hospitals`

Request:

- `caseId`
- `hospitalIds: string[]`

Response minimum:

- enough information to load formal conversations immediately after selection, either:
  - `conversationIds: string[]`
  - or a ready-made conversation summary payload

#### Conversations

Conversation summary minimum:

- `id`
- `type` where frontend can distinguish `patient-admin` vs `patient-hospital`
- `title` or display label
- `lastMessagePreview?`
- `unreadCount?`

If the backend does not literally expose `type`, it must still expose enough metadata for the frontend to deterministically place `patient-admin` first.

#### Dedicated Pre-Bootstrap History Import Endpoint

This phase requires a dedicated import/bootstrap endpoint for pre-bootstrap widget history.

Minimum contract requirement:

- request includes:
  - `conversationId`
  - ordered pre-bootstrap widget messages
  - stable client-side import id / idempotency key
- backend preserves the intended chronology
- backend can represent imported opening/system messages as well as patient-authored messages
- repeated retry with the same import key must not duplicate imported history

#### `GET /api/patient/quotes`

Response minimum:

- a patient-facing quote list/summary suitable for dashboard consumption
- enough information to:
  - render quotes grouped or labeled by case
  - derive pending quote counts for `Home`
  - render quote status and primary quote details in `Quotes`

#### `GET /api/patient/cases/:id`

Response minimum for the active/default case:

- `id`
- `title` or summary label
- `status`
- top-level case summary fields needed by `Home`

If `Home` needs richer case overview than the base case list provides, the backend must expose it here rather than forcing frontend guesswork.

#### `GET /api/patient/cases`

Response minimum:

- a list of patient cases
- enough metadata to identify the active/default case for `Home`

Minimum per-case fields:

- `id`
- `title` or summary label
- `status`
- `isActive` or equivalent authoritative active-case marker

If the backend does not literally expose `isActive`, it must still expose an unambiguous active/default case indicator.

### Pre-Bootstrap History Import

This phase requires a dedicated conversation bootstrap/import endpoint for pre-bootstrap widget history.

The authoritative sequence is:

1. `selectHospitals`
2. load/identify conversations
3. attempt pre-bootstrap history import into `patient-admin`
4. open `PatientMessagePanel`

If pre-bootstrap history import fails:

- the panel still opens
- the UI must indicate that earlier widget history was not fully imported
- the user must have a retry path

If pre-bootstrap history import succeeds:

- local pre-bootstrap widget history should be marked as imported and cleared from local pre-bootstrap storage
- the frontend must avoid re-importing the same local history on later restores

### Pre-Bootstrap Storage And Idempotency Rules

- local pre-bootstrap history must be scoped to the current anonymous widget session before onboarding
- once onboarding returns `patientId` and `caseId`, local pre-bootstrap history must be rebound to that patient/case context
- pre-bootstrap history must not be reused across different patients on the same browser
- the dedicated import endpoint must be idempotent
- successful import clears the local pre-bootstrap history for that patient/case
- failed import keeps the local pre-bootstrap history for retry
- opening/system messages must be imported as formal conversation history in a way the backend can distinguish from normal patient-authored messages if needed

If conversation bootstrap itself fails before import:

- the panel does not open yet
- the widget remains in `select-hospitals` or `messages-ready` bootstrap error state as appropriate
- the user gets a retry path
- local pre-bootstrap history remains intact

## Error Handling

### Base Form Submit Failure

- keep the widget open
- preserve local pre-bootstrap messages
- preserve form input if practical
- show inline error
- do not discard the patient's in-progress chat

### Hospital Match Failure

- keep patient logged in
- keep the widget in hospital-selection phase
- show retry state
- allow empty-state copy if match results are not yet available

### Hospital Selection Failure

- keep selected hospitals in UI state
- do not drop pre-bootstrap history
- do not open the large panel until selection succeeds

### Conversation Bootstrap Failure

- if `selectHospitals` succeeds but conversations cannot be loaded, identified, or ordered correctly, show a dedicated bootstrap error state
- keep the patient logged in
- keep hospital selection context intact
- keep pre-bootstrap history intact
- provide retry action
- do not silently downgrade into a broken or empty message panel

### Pre-Bootstrap History Import Failure

- do not silently drop the local history
- surface an error/retry path
- still open the `PatientMessagePanel`
- clearly indicate if historical import is incomplete

### Formal Message History Load Failure

- if the panel or dashboard `Messages` tab cannot load message history for a formal conversation, show an inline load error in the message area
- keep the conversation list visible if available
- provide retry action
- do not close the panel or destroy the active conversation selection automatically

### Formal Message Send Failure

- show toast feedback
- keep the input content so the patient does not have to retype it
- render a small retry button next to the failed message/error state
- the user manually triggers resend
- this phase does not require a full pending/outbox system

### Dashboard Data Failure

- each delivered tab should fail independently
- `Home` failure must not break `Quotes`
- `Quotes` failure must not break `Messages`

## Testing Expectations

Implementation planning must cover at least:

- widget opens/closes correctly
- patient can chat before submitting the form
- patient can keep chatting through `collect-profile` and `select-hospitals`
- pre-bootstrap messages survive until formal conversations are ready
- pre-bootstrap messages survive same-browser refresh/navigation in this phase
- base form submit activates patient auth
- widget switches to hospital-selection form after login
- hospital list handles zero-result state without broken progression
- hospital selection opens `PatientMessagePanel`
- patient/admin conversation appears first
- pre-bootstrap widget history is present in the formal admin conversation
- `/dashboard` renders new patient shell
- `Home / Quotes / Messages` use CRM v2 data flow, not old `dashboard_summary`

## Implementation Boundaries

### Must Preserve

- current `FreeQuoteFloatingButton`
- hospital portal `/login`
- Medplum auth
- unrelated Supabase-backed public flows

### Must Replace In This Phase

- old patient dashboard path for `Home / Quotes / Messages`
- old dashboard-summary-based patient data flow for those delivered tabs

### Must Not Be Pulled Into This Phase

- full dashboard expansion for deferred tabs
- intake migration
- broad legacy quote-flow rewrites
- hospital matching algorithm design work

## Recommendation

Implementation should proceed in this order:

1. build the new `ChatWidget` + patient entry state + local pre-bootstrap message model
2. connect onboarding submit and hospital selection
3. build `PatientMessagePanel` and pre-bootstrap history import path
4. migrate `/dashboard` to the new patient shell for `Home / Quotes / Messages`

That ordering keeps the real user entry flow working before the dashboard migration is finalized.

## Planning Assumptions

The following assumptions are intentionally frozen for implementation planning in this phase:

1. Later patient restore should use the same phase signal as onboarding:
   - restore/bootstrap responses should expose `nextStep`
   - frontend should not infer `select-hospitals` vs `messages-ready` by guesswork

2. `selectHospitals` is treated as synchronous-ready for this phase:
   - after success, conversations are expected to be immediately available or immediately loadable
   - this phase does not plan for an asynchronous job / polling workflow

3. The opening/system message seeds only once for a brand-new local pre-bootstrap history:
   - if local pre-bootstrap history already exists, frontend must not seed another opening/system message
   - this avoids duplicate widget history and duplicate imported admin-history entries

4. `/dashboard` is not the primary recovery path for patients who are restored but not yet `messages-ready`:
   - those patients remain driven by the global widget flow
   - dashboard may show a restricted / guidance state in that situation
   - this phase does not require full dashboard behavior for partially bootstrapped patient flows
