# Chatbot Rich Blocks And Action Orchestration Design

Date: 2026-04-04

## Summary

We will upgrade the chatbot from a text-first response model to a richer `answer + blocks[]` model shared between:

- `medical-crm-v2` as the backend contract and action authority
- `china` as the patient-facing rich chat renderer

This change will let the chatbot do two things more reliably:

1. choose the right next action at the right time and gently push that next step in the conversation
2. render executable chat UI for the actions that should not remain plain text

The first delivery includes four rich blocks:

- `PROCESS_MODAL_TRIGGER`
- `QUESTIONNAIRE_MODAL_TRIGGER`
- `HOSPITAL_RECOMMENDATION_CARDS`
- `ONLINE_CONSULT_BOOKING_CARD`

`HUMAN_HANDOFF` is intentionally text plus links, not a standalone block.

## MVP Scope

The MVP rich surfaces in this spec are limited to:

- `PROCESS_MODAL_TRIGGER`
- `QUESTIONNAIRE_MODAL_TRIGGER`
- `HOSPITAL_RECOMMENDATION_CARDS`
- `ONLINE_CONSULT_BOOKING_CARD`

Deferred from this iteration:

- rich `SHOW_PACKAGE`
- dedicated `SAFETY_HANDOFF` block
- real-time consultation slot picker
- a full rewrite of the hospital recommendation engine

## Goals

- Make backend-selected chatbot actions the single source of truth for what the assistant should do next.
- Let the patient-facing chat widget render structured rich content directly from backend contract payloads.
- Reuse the existing hospital recommendation card visual language from `china` while moving data sourcing to the chatbot contract.
- Keep conversation memory lightweight by relying on:
  - compact summary
  - recent history
  - existing structured backend state
- Avoid adding many new per-action timestamp fields.

## Non-Goals

- Rebuilding the full hospital recommendation engine in this iteration
- Building real-time consultation slot scheduling in this iteration
- Designing a rich `SHOW_PACKAGE` block in this iteration
- Creating a dedicated rich safety block in this iteration

## Repositories And Ownership

### `medical-crm-v2`

Owns:

- action selection
- Dify/backend normalization
- public chatbot response schema
- block payload generation
- recommendation shortlist contract
- questionnaire lookup contract
- consultation request initiation contract
- human handoff/ticket creation contract

### `china`

Owns:

- chat widget rich message renderer
- modal rendering for process and questionnaire
- direct card interactions
- reuse of existing hospital card visuals

## High-Level Architecture

The response model becomes:

```json
{
  "answer": "text shown to the user",
  "nextAction": "backend-selected action",
  "blocks": []
}
```

The flow is:

```text
user message
-> CRM backend context / decide / writeback
-> Dify grounded text generation
-> CRM public chatbot route normalize
-> answer + blocks[]
-> china rich message renderer
```

The backend decides whether a block should exist. The frontend only renders the block payload it receives.

`nextAction` remains part of the public chatbot response. For this design it is:

- emitted on every assistant turn where backend has resolved a primary action
- stored as API-visible routing metadata
- not a frontend instruction to invent UI independently of `blocks[]`

Relationship between `nextAction` and `blocks[]`:

- `nextAction` expresses backend intent
- `blocks[]` expresses executable or rich UI payloads for that turn
- some actions have no block and remain text-only
- frontend may use `nextAction` for analytics or light presentation logic, but not as the primary source for deciding what block to render

## Block Contract

`blocks[]` is the shared message-scoped contract between `medical-crm-v2` and `china`.

Each block must include:

- `id`: unique within the message
- `type`: discriminant used by the frontend renderer

General rules:

- blocks are message-scoped, not page-global configuration
- a message may have zero or more blocks
- backend controls block ordering
- if backend cannot safely construct a valid block payload, it must omit the block and keep the text answer usable on its own

The first iteration requires these block payloads:

### `PROCESS_MODAL_TRIGGER`

```json
{
  "id": "process-modal-1",
  "type": "PROCESS_MODAL_TRIGGER",
  "modalKey": "MEDICAL_TRAVEL_PROCESS",
  "title": "How the process works",
  "description": "See the overall medical travel journey.",
  "ctaLabel": "Open process guide"
}
```

### `QUESTIONNAIRE_MODAL_TRIGGER`

```json
{
  "id": "questionnaire-trigger-1",
  "type": "QUESTIONNAIRE_MODAL_TRIGGER",
  "questionnaireKey": "ophthalmic-intake",
  "title": "Complete your medical questionnaire",
  "description": "This helps us guide the next step more accurately.",
  "ctaLabel": "Open questionnaire"
}
```

### `HOSPITAL_RECOMMENDATION_CARDS`

```json
{
  "id": "hospital-cards-1",
  "type": "HOSPITAL_RECOMMENDATION_CARDS",
  "title": "Recommended hospitals",
  "description": "Based on your current information, these look like the closest matches.",
  "hospitals": [
    {
      "hospitalId": "hospital-1",
      "name": "Example Hospital",
      "reason": "Strong fit for the current case",
      "ctaUrl": "/hospitals/hospital-1",
      "thumbnailUrl": "https://example.com/thumbnail.jpg",
      "city": "Shanghai",
      "matchType": "matched",
      "reasonCodes": ["fit"]
    }
  ]
}
```

### `ONLINE_CONSULT_BOOKING_CARD`

```json
{
  "id": "consult-booking-1",
  "type": "ONLINE_CONSULT_BOOKING_CARD",
  "title": "Request online consultation",
  "description": "Submit your consultation request and we will confirm the next step.",
  "requestedAction": "CONSULT_CONVERSION",
  "convertPath": "/api/v2/chatbot/convert",
  "consultationStatus": "not_started"
}
```

Fallback rule for all block types:

- if payload generation fails, the assistant must still produce a useful text response and no malformed block should be returned

Unknown-type handling:

- frontend should ignore unknown block types without breaking the rest of the message
- backend must only emit block types declared in the shared validation package

## Block Schema Appendix

The formal shared union should be implemented in `medical-crm-v2/packages/shared/validation`.

### Common block shape

Required:

- `id: string`
- `type: string`

### `PROCESS_MODAL_TRIGGER`

Required:

- `id: string`
- `type: "PROCESS_MODAL_TRIGGER"`
- `modalKey: "MEDICAL_TRAVEL_PROCESS"`
- `title: string`

Optional:

- `description: string`
- `ctaLabel: string`

Interaction contract:

- clicking this trigger opens the process explainer modal only
- it does not mutate backend state

### `QUESTIONNAIRE_MODAL_TRIGGER`

Required:

- `id: string`
- `type: "QUESTIONNAIRE_MODAL_TRIGGER"`
- `questionnaireKey: string`
- `title: string`

Optional:

- `description: string`
- `ctaLabel: string`

### `HOSPITAL_RECOMMENDATION_CARDS`

Required:

- `id: string`
- `type: "HOSPITAL_RECOMMENDATION_CARDS"`
- `title: string`
- `caseId: string`
- `selectPath: "/select-hospitals"`
- `hospitals: HospitalRecommendationCardItem[]`

Optional:

- `description: string`

Where each hospital item has:

Required:

- `hospitalId: string`

Optional:

- `name: string`
- `reason: string`
- `ctaUrl: string`
- `thumbnailUrl: string`
- `city: string`
- `matchType: string`
- `reasonCodes: string[]`

Card action contract:

- the parent block should also carry:
  - `caseId: string`
  - `selectPath: "/select-hospitals"`
- frontend selection posts the chosen hospital IDs to the existing patient-protected hospital selection endpoint

Selection request:

```json
{
  "caseId": "case-1",
  "hospitalIds": ["hospital-1"]
}
```

Selection success shape:

- reuse the existing `SelectHospitalsResult` response contract

Recoverable selection failure shape:

```json
{
  "ok": false,
  "errorCode": "HOSPITAL_SELECTION_FAILED",
  "message": "Unable to save hospital selection right now. Please try again."
}
```

Idempotency rule:

- selecting the same hospital again should not create duplicate downstream records
- it may return the existing selected state

Selection interaction contract:

- selecting a hospital from a card must mutate backend state by marking or submitting the chosen hospital
- selection is not just navigation
- frontend may also navigate to the hospital detail page after a successful selection, but backend selection state must succeed first or fail visibly

### `ONLINE_CONSULT_BOOKING_CARD`

Required:

- `id: string`
- `type: "ONLINE_CONSULT_BOOKING_CARD"`
- `title: string`
- `requestedAction: "CONSULT_CONVERSION"`
- `convertPath: string`

Optional:

- `description: string`
- `consultationStatus: string`
- `requestState: "idle" | "submitted" | "failed"`

Submission interaction contract:

- clicking submit posts to `convertPath`
- the card stays mounted in the message after submit
- success changes local render state to submitted
- failure changes local render state to failed and exposes retry

Recoverable failure shape:

```json
{
  "ok": false,
  "errorCode": "CONSULT_REQUEST_FAILED",
  "message": "Unable to create consultation request right now. Please try again."
}
```

Retry rule:

- `china` should keep the card visible and offer retry inline
- retry should resubmit the same request safely

Emission rule:

- backend should only emit `ONLINE_CONSULT_BOOKING_CARD` when the session already has the minimum data needed to satisfy the convert flow
- if required patient/profile fields are missing, backend should choose an explanation or intake action instead of emitting this card

## Action Catalog

The action set for this design is:

- `ANSWER_FAQ`
- `EXPLAIN_DOC_UPLOAD`
- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- `EXPLAIN_CONSULT_PROCESS`
- `REQUEST_DOC_UPLOAD`
- `INVITE_ONLINE_CONSULT`
- `EXPLORE_HOSPITAL_RECOMMENDATIONS`
- `SHOW_HOSPITAL_RECOMMENDATIONS`
- `SHOW_PACKAGE`
- `HUMAN_HANDOFF`
- `SAFETY_HANDOFF`

Additional rules:

- `REGULAR` should not default into `SHOW_PACKAGE`
- `SHOW_HOSPITAL_RECOMMENDATIONS` should be suppressed when `selectedHospitalId` already exists unless the user explicitly asks for alternatives

## Action To Output Mapping

### `ANSWER_FAQ`

Output:

- text only

Use for normal FAQ answers and light guidance.

### `EXPLAIN_DOC_UPLOAD`

Output:

- text only

Use when the assistant should explain why documents or intake information are needed, without yet opening the questionnaire flow.

### `EXPLAIN_MEDICAL_TRAVEL_PROCESS`

Output:

- text
- `PROCESS_MODAL_TRIGGER`

Use when explaining the overall medical travel journey. This action should include a process modal trigger at the top of the message.

### `EXPLAIN_CONSULT_PROCESS`

Output:

- text only

Use when the assistant should explain what online consultation is and why it helps, without yet initiating booking/request flow.

### `EXPLORE_HOSPITAL_RECOMMENDATIONS`

Output:

- text only

Use when recommendation logic should be explained or scoped before the system is ready to show a shortlist.

`SHOW_HOSPITAL_RECOMMENDATIONS` is the preferred next step after this action, but not the only possible next step. The system may still need documents, consultation readiness, or clarification first.

### `REQUEST_DOC_UPLOAD`

Output:

- text
- `QUESTIONNAIRE_MODAL_TRIGGER`

Use when the system is ready to ask the patient for structured intake data. This is not a simple file upload link. It is a questionnaire-first flow.

### `SHOW_HOSPITAL_RECOMMENDATIONS`

Output:

- text
- `HOSPITAL_RECOMMENDATION_CARDS`

Use when backend recommendation logic is ready to produce shortlist cards. Cards must be directly selectable in the chat UI.

### `INVITE_ONLINE_CONSULT`

Output:

- text
- `ONLINE_CONSULT_BOOKING_CARD`

Use when the patient is ready to explicitly move into consultation request flow.

### `SHOW_PACKAGE`

Output:

- text only for this iteration

Gating rule for this spec:

- backend may emit `SHOW_PACKAGE` only for `COSMETIC`
- backend should not emit `SHOW_PACKAGE` for `REGULAR`
- if package presentation is not appropriate, backend should choose another action instead of relying on frontend suppression

### `HUMAN_HANDOFF`

Output:

- text
- dashboard link
- email link

No standalone rich block in the first iteration.

If no active ticket exists, backend creates one and returns copy that confirms handoff and points the patient to dashboard plus:

- `customer@medicaltourismchina.health`

If an active ticket already exists, backend should not create another one and should instead tell the patient that the request is already in progress.

### `SAFETY_HANDOFF`

Output:

- text only for this iteration

This remains separate from normal business handoff.

## Rich Block Definitions

### `PROCESS_MODAL_TRIGGER`

Purpose:

- let the patient open an explainer modal for the medical travel process at any time

Behavior:

- rendered inside a message generated by `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- once that message is present in chat history, the patient can reopen that same process modal from the message later
- opens a process explainer modal in `china`

### `QUESTIONNAIRE_MODAL_TRIGGER`

Purpose:

- start structured intake collection rather than a generic upload-only flow

Behavior:

1. backend determines the likely disease or intake direction from current conversation context
2. backend maps that to the appropriate admin `Question Collector` questionnaire
3. chatbot response returns a trigger block
4. patient opens the modal
5. questionnaire is rendered and submitted with any required attachments

This block replaces the earlier idea of a plain upload card.

Failure handling:

- if backend cannot confidently resolve a questionnaire, it must omit this block
- the assistant should fall back to explanatory text and either ask for clarification or route to `HUMAN_HANDOFF` if safe self-service intake is not appropriate

Questionnaire lookup contract:

- lookup source: admin `Question Collector` questionnaire registry already managed in CRM
- input signals for lookup:
  - resolved hospital type
  - current disease or intake direction inferred from backend context and current user question
  - optional selected hospital context if later needed, but not required for MVP
- tie-breaking:
  - prefer exact disease-specific questionnaire
  - otherwise fall back to the nearest intake-direction questionnaire for the same hospital type
  - if multiple equally good matches remain, do not auto-pick silently; fall back to clarification text
- failure fallback interface:
  - omit the block
  - return text guidance only
  - optionally pivot to `HUMAN_HANDOFF` when self-service intake would likely be misleading

### `HOSPITAL_RECOMMENDATION_CARDS`

Purpose:

- show backend-approved hospital shortlist in the chat stream

Behavior:

- reuse the visual shape of the existing `china` hospital cards where possible
- do not reuse the old patient-entry recommendation data path
- cards must be selectable directly from the chat message

Failure handling:

- if shortlist is empty, backend should omit this block
- the assistant should fall back to explanatory text about what information is still missing or why a shortlist is not ready yet

### `ONLINE_CONSULT_BOOKING_CARD`

Purpose:

- let the patient directly say “I want to book/request online consultation”

Behavior:

- the first version does not require live timeslot scheduling
- it should create or advance a consultation request
- success state can say that time confirmation will follow

Failure handling:

- if consultation request creation fails, the frontend should surface a visible recovery state instead of silently failing
- backend should still return a usable text response even if the block is omitted

Consult request contract for MVP:

- frontend action:
  - submit to `convertPath`
- request body:
  - `sessionId`
  - `requestedAction: "CONSULT_CONVERSION"`
  - plus any fields already required by the existing convert route
- backend behavior:
  - create or reuse the case/patient conversion state
  - mark consultation request as initiated for downstream coordination
- idempotency rule:
  - repeated submissions for the same session should return the existing conversion result rather than duplicating records
- success state:
  - return a success response that lets frontend show a submitted state such as “We will confirm the time with you shortly.”
- failure state:
  - return a recoverable error the card can surface inline without breaking the chat thread

## Memory And Decisioning Model

We intentionally avoid adding many new per-action backend timestamp fields.

Decisioning should rely on:

- compact summary
- recent history
- existing structured state such as:
  - `pendingOffer`
  - `pendingQuestion`
  - `lastNextAction`
  - `docUploadStatus`
  - `consultationStatus`
  - `recommendationStatus`
  - `selectedHospitalId`

### Summary Strategy

- apply a lightweight patch every turn
- keep recent raw history separately
- only run a full summary recompression when compact summary length exceeds `2000` characters

### Repetition Rules

#### Explanation actions

These may repeat if the user is still actively asking about the topic:

- `EXPLAIN_DOC_UPLOAD`
- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- `EXPLAIN_CONSULT_PROCESS`

They should not repeat just because the system lacks a better idea in the next turn.

#### Progression actions

These may also repeat when the user has not completed the action and has not clearly refused:

- `REQUEST_DOC_UPLOAD`
- `INVITE_ONLINE_CONSULT`
- `EXPLORE_HOSPITAL_RECOMMENDATIONS`
- `SHOW_HOSPITAL_RECOMMENDATIONS`

### Special Gating

#### Documents

`REQUEST_DOC_UPLOAD` should only appear when intake/questionnaire/docs are still needed.

#### Consultation

`INVITE_ONLINE_CONSULT` should only appear when consultation is not already booked, started, completed, or otherwise in progress.

#### Recommendation

`SHOW_HOSPITAL_RECOMMENDATIONS` should check readiness and also suppress broad shortlist reopening when a `selectedHospitalId` already exists, unless the user explicitly asks for other hospitals.

#### Human handoff

`HUMAN_HANDOFF` should reuse an existing active ticket when present.

## Backend Contract Strategy

The shared contract should live in:

- `medical-crm-v2/packages/shared/validation`

`china` should consume that contract rather than recreating its own block inference rules.

The chatbot response schema should support:

- existing answer fields
- `blocks[]`
- structured links/payloads for actions that require execution
- `nextAction` as public backend-selected routing metadata

## China Frontend Strategy

`china` should add a rich message renderer that can render:

- plain text
- existing thumbnails/attachments
- `blocks[]`

Hospital recommendation cards should reuse the existing hospital card visual system where practical, but data should come from chatbot message blocks rather than `patient-entry.ts -> hospitalApi`.

Direct interaction rules:

- process trigger: open process modal only
- questionnaire trigger: open modal only
- hospital cards: select hospital, then optionally navigate
- consult booking card: submit request inline

## Existing China Recommendation Path To Replace

Current `china` hospital recommendation UI is phase-driven:

- `PatientEntryWindow`
- `HospitalSelectionForm`
- `patient-entry.ts`

The current data source is:

- `patient-entry.ts -> matchHospitals()`
- `hospitalApi.getHospitals(...)`
- local `recommendHospitalsFromCatalog(...)`

This path should remain as a visual reference, not as the long-term chatbot recommendation source for rich message cards.

## Testing Strategy

### `medical-crm-v2`

Add contract and route coverage for:

- action to block mapping
- `REQUEST_DOC_UPLOAD -> QUESTIONNAIRE_MODAL_TRIGGER`
- `SHOW_HOSPITAL_RECOMMENDATIONS -> HOSPITAL_RECOMMENDATION_CARDS`
- selected hospital suppression logic
- consultation invitation gating
- human handoff deduplication

### Dify / CRM E2E

Validate multi-turn sessions, not only single turns:

- FAQ -> process explanation -> consult explanation
- FAQ -> document explanation -> questionnaire trigger
- recommendation exploration -> shortlist cards -> select hospital
- human handoff
- safety path stays isolated from business blocks
- questionnaire lookup failure falls back to plain text
- empty shortlist falls back to explanation instead of blank cards
- consultation request failure keeps the chat usable and recoverable

### `china`

Validate:

- block rendering
- modal open and close behavior
- direct card actions
- hospital card visual consistency
- no regression in existing patient-entry messaging behavior
- failed block actions show visible recovery states rather than silent no-ops

## Delivery Order

Recommended implementation order:

1. shared chatbot block contract in `medical-crm-v2`
2. backend action normalization and block generation
3. questionnaire trigger integration
4. recommendation cards payload integration
5. online consultation request card
6. china rich message renderer
7. china recommendation card reuse and direct selection flow
8. end-to-end session QA across both repos

## Milestones And Acceptance Criteria

### Milestone 1: Shared Contract And Backend Mapping

Includes:

- shared `blocks[]` schema
- backend action to block mapping
- public chatbot normalization updates

Acceptance:

- chatbot responses can carry validated blocks
- unknown or failed block generation falls back to text-only safely

### Milestone 2: Questionnaire Trigger Flow

Includes:

- `REQUEST_DOC_UPLOAD -> QUESTIONNAIRE_MODAL_TRIGGER`
- questionnaire lookup contract
- frontend modal trigger wiring

Acceptance:

- a qualifying turn can open the correct questionnaire modal
- ambiguous lookup falls back to text instead of a broken modal

### Milestone 3: Recommendation Cards In Chat

Includes:

- backend shortlist payload
- `HOSPITAL_RECOMMENDATION_CARDS`
- china message-level recommendation rendering and selection

Acceptance:

- shortlist cards render inside chat messages
- selection works from the message itself
- selected-hospital suppression prevents redundant re-showing unless alternatives are requested

### Milestone 4: Online Consult Booking Card

Includes:

- `INVITE_ONLINE_CONSULT -> ONLINE_CONSULT_BOOKING_CARD`
- convert/request submission from the card

Acceptance:

- booking card can submit successfully from chat
- duplicate submits are idempotent
- failures are recoverable in-place

### Milestone 5: Human Handoff And End-To-End QA

Includes:

- `HUMAN_HANDOFF` text plus link flow
- active-ticket reuse
- multi-turn end-to-end validation

Acceptance:

- human handoff does not create duplicate active tickets
- patients can reach dashboard ticket tracking and email fallback
- multi-turn sessions remain coherent across process, questionnaire, recommendation, consult, and handoff paths

## Worktree Recommendation

Because the primary `medical-crm-v2` workspace currently contains many unrelated in-flight changes from other agents, implementation should be done in isolated worktrees for both repos before landing.
