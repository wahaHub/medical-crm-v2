# Medora Patient Portal Phase 1 + Phase 2 Design

## Goal

Define the unified Medora Health Beauty patient-portal design on top of CRM v2.

This spec covers both:

- `Phase 1`: align the existing Medora patient flow to the shared CRM v2 patient model
- `Phase 2`: expand Medora to the full shared patient portal used across both Medora and China

The design deliberately keeps Medora's marketing-shell personality and primary messaging experience, while converging the patient flow, contracts, and dashboard information architecture with the shared CRM v2 model.

## Why This Spec Exists

Medora already has substantial patient-facing implementation:

- floating `ChatWidget`
- case-first onboarding
- `PatientMessagePanel`
- CRM-backed patient auth
- dashboard pages

The work is therefore not a greenfield build.

At the same time, Medora should not continue evolving on a separate patient model from China. The long-term target is:

- one shared CRM v2 patient contract surface
- one shared patient portal IA
- two different site shells and brand expressions

This spec replaces the earlier Medora-only phase-1 migration framing with a complete product design that still executes in two waves.

## Product Direction

### Shared Outcome

By the end of Phase 2, Medora should share the same patient portal model as China:

- `ChatWidget -> patient info -> hospital selection -> PatientMessagePanel`
- returning-user restore based on current patient state
- unified patient auth and restore behavior
- unified dashboard tab model:
  - `Home`
  - `Quotes`
  - `Messages`
  - `Tickets`
  - `Orders`
  - `Journey`
  - `AI Summary`

### Medora-Specific Outcome

Medora keeps its own:

- visual language
- marketing-site shell
- brand expression
- stronger `Home` page semantics such as action items and case context
- `PatientMessagePanel` as the primary long-form messaging workspace

Medora does not keep a separate long-term patient IA.

## Scope

### In Scope

- Medora marketing-site patient entry
- `ChatWidget` first-open state
- patient auth / restore / onboarding alignment
- hospital-selection handoff
- `PatientMessagePanel`
- dashboard convergence
- Phase 1 intake migration to the new dynamic intake contract
- Phase 2 `tickets / orders / journey / ai summary / packages` surfaces

### Out of Scope

- hospital portal changes
- admin portal redesign
- payment provider integration details
- AI chatbot patient UX
- package CMS redesign

## Architecture Direction

The Medora frontend should be treated as four layers:

1. `marketing shell`
2. `patient auth layer`
3. `patient entry layer`
4. `patient portal layer`

### 1. Marketing Shell

The site keeps Medora branding and the floating `ChatWidget`.

This shell owns:

- page chrome
- brand styling
- global widget mount

It does not own patient session state or portal data contracts.

### 2. Patient Auth Layer

The patient auth layer remains responsible for:

- `GET /api/patient/me`
- magic-link verification
- restore-token bootstrap
- cookie-backed session restore
- logout

It must not own widget stage, temporary chat history, hospital selection, or message panel open/close state.

### 3. Patient Entry Layer

The patient entry layer is the source of truth for:

- widget open/minimized state
- current stage:
  - `collect-profile`
  - `select-hospitals`
  - `messages-ready`
  - `bootstrap-error`
- local pre-bootstrap chat history
- onboarding submit state
- hospital match results
- selected hospitals
- handoff into `PatientMessagePanel`

### 4. Patient Portal Layer

The patient portal layer owns:

- dashboard shell and tabs
- formal messages surface inside dashboard
- quotes
- intake
- tickets
- orders
- journey
- AI summary

The final IA must match China.

## Product Rules

### Entry Model

Medora uses the same entry model as China:

- patient opens floating `ChatWidget`
- widget shows:
  - opening message
  - patient info form
  - normal chat input
- patient can chat at any point without completing the form first
- patient can submit the form at any point and immediately enter the CRM v2 patient flow

### Base Patient Fields

The patient info form uses the agreed 5 fields:

1. `name`
2. `email`
3. `phone`
4. `disease`
5. `destination`

### All-Stage Chat Rule

At every stage, the widget continues to allow normal chat input.

This applies to:

- pre-submit patient info state
- post-submit hospital-selection state
- resumed `messages-ready` state

The form is only a control inside the chat stream. It does not replace the conversation surface.

### Pre-Bootstrap History

Before formal conversations are ready, widget messages are stored as local `pre-bootstrap history`.

This includes:

- the opening/system message
- patient-authored messages before patient-info submit
- messages authored while the widget is in `select-hospitals`

When formal conversations are ready, this entire pre-bootstrap history must be imported into the formal `patient-admin` conversation through the dedicated bootstrap/import backend contract.

### Patient Info Submit Behavior

Submitting the patient info form:

- creates or restores the patient session
- creates or restores the current patient case context
- moves the widget into logged-in CRM v2 patient state

No second confirmation step is required.

### Hospital Selection Behavior

After successful patient-info submit:

- the patient-info form is replaced with a hospital-selection form
- hospital options come from `matchHospitals`
- multi-select is allowed
- chat remains available during this stage

### Post-Selection Behavior

Submitting hospital selection must:

1. call `selectHospitals`
2. create or load formal conversations
3. import pre-bootstrap history into the `patient-admin` conversation
4. open the large `PatientMessagePanel`

`PatientMessagePanel` must show:

- the `patient-admin` conversation first
- then patient-hospital conversations

### Returning User Resume Rules

Resume behavior depends on actual patient state.

| Restored state | Widget state |
|---|---|
| No completed patient-info submit | show `patient info form` + prior chat history |
| Patient info submitted, hospitals not selected | show `hospital selection form` + prior chat history |
| Formal conversations exist | show normal compact chat with no form |

This rule is identical to China.

## Dashboard Information Architecture

### Final IA

The final Medora dashboard IA is identical to China:

- `Home`
- `Quotes`
- `Messages`
- `Tickets`
- `Orders`
- `Journey`
- `AI Summary`

### Medora Home Semantics

Even with shared IA, `Home` should preserve stronger Medora semantics:

- action items
- case context
- unread/message urgency
- next-step guidance
- patient-facing progress framing

This is a content and layout difference, not a structural IA difference.

### Case Detail Decision

Medora does **not** keep the old `CaseDetail` page as an ongoing transitional deep-link model.

After Phase 1:

- primary patient deep links must shift toward unified dashboard tabs
- old case-detail-centric IA should not remain the center of patient navigation

## Phase Boundaries

### Phase 1

### Goal

Converge Medora's existing patient entry, auth, messaging, dashboard shell, and intake onto the shared CRM v2 model.

### Deliverables

- `ChatWidget` first-open state aligned to the shared hybrid model
- all-stage chat behavior
- patient auth / cookie bootstrap / restore-token bootstrap aligned to shared behavior
- returning-user resume rules aligned to China
- hospital-selection handoff aligned to China
- `PatientMessagePanel` retained as the main messaging workspace
- `/dashboard` converged to the shared shell first stage
- `Home / Quotes / Messages` formally working on shared contracts
- intake upgraded to the new dynamic intake contract

### Phase 1 Non-Goals

- no full patient phase-2 tab delivery yet
- no payment integration
- no AI chatbot UX integration

### Phase 2

### Goal

Expand the already-aligned Medora shell into the complete shared patient portal.

### Deliverables

- full 7-tab dashboard
- `Tickets` create/list/detail/reply
- `Orders` list/detail
- `Packages` page ordering flow
- `Journey` read-only
- `AI Summary` read-only
- `PatientMessagePanel` phase-2 entry actions aligned with China

### Phase 2 Rules

- `Packages -> Orders` flow must match China
- `PatientMessagePanel` provides reliable actions into packages/orders
- it does not become a second home for `Journey` or `AI Summary`

## Keep / Change / Replace

### Keep

These are structurally correct and should be reused:

- floating `ChatWidget`
- `PatientMessagePanel`
- patient auth foundation
- dashboard shell groundwork
- existing Medora branding and page shell

### Change

These should be converged to the shared model:

- widget first-open state
- entry-state management
- hospital-selection flow
- restore behavior
- dashboard routing and tabs
- messages/query contract alignment
- package/order/ticket entry paths

### Replace Or Rebuild

These should move directly to the new shared contracts instead of preserving old assumptions:

- intake renderer and submit model
- patient phase-2 API/hooks layer
- final `Tickets / Orders / Journey / AI Summary` tab implementations

## Data Flow

### Anonymous / Pre-Bootstrap

- widget opens
- opening/system message is seeded
- patient can chat immediately
- messages accumulate in local pre-bootstrap history

### Patient Session Bootstrap

- patient submits info form
- frontend creates or restores CRM v2 patient session
- patient is considered logged in
- widget switches to hospital selection

### Formal Conversation Bootstrap

- patient submits hospital selection
- frontend loads formal conversations
- backend imports pre-bootstrap history into `patient-admin`
- panel opens

### Post-Bootstrap

- `PatientMessagePanel` becomes the main long-form messaging surface
- widget becomes compact ongoing admin chat once `messages-ready`
- dashboard `Messages` uses the same underlying conversation contracts

## Implementation Risks

### Phase 1 Risks

- `Intake` is the heaviest Phase 1 item because it is contract-heavy, not just UI-heavy
- Medora currently has existing in-flight edits, so the work must happen in isolated worktrees
- dashboard convergence must not leave Medora with both old and new patient IA in parallel

### Phase 2 Risks

- package/order entry points must stay consistent across widget, message panel, and dashboard
- query/cache state must remain patient-scoped
- `Journey` and `AI Summary` must remain read-only patient surfaces

## Success Criteria

### Phase 1 Is Successful When

- Medora patient entry flow matches the China product model
- returning users restore into the correct widget state
- `PatientMessagePanel` is still the primary messaging surface
- `Home / Quotes / Messages` work on shared contracts
- intake uses the new dynamic contract
- old case-detail-centric IA is no longer the primary patient model

### Phase 2 Is Successful When

- Medora and China share the same patient portal IA
- both frontends consume the shared CRM v2 patient phase-2 contracts
- tickets, orders, journey, and AI summary are all live in Medora
- Medora still feels like Medora at the shell/UI level while sharing the same patient platform model underneath

## References

- Shared backend/contracts phase 2 spec:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-28-shared-patient-phase2-backend-contracts-design.md`
- China phase 1 chat/message/dashboard spec:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-27-china-chatwidget-messages-dashboard-design.md`
- Prior Medora draft docs:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-17-patient-dashboard-chatwidget-design.md`
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/plans/2026-03-26-medora-phase1-chat-entry-auth-dashboard-migration.md`
