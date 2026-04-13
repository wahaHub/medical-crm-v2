# Chatbot V2 Orchestrator Implementation Detail

Date: 2026-04-12

## Purpose

This note describes the actual `chatbot-v2` orchestration model currently implemented after Chunks 1-3 of the phase lifecycle redesign.

It documents current code behavior, not an aspirational future design.

## Core Model

The main conversational state is:

- `journeySnapshot.currentStage`
- `journeySnapshot.currentPhase`

The active lifecycle is:

- `EXPLAIN_PROCESS.pre`
- `EXPLAIN_PROCESS.active`
- `COLLECT_MEDICAL_INPUTS.pre / active / post`
- `RECOMMENDATION.pre / active / post`
- `ONLINE_CONSULT.pre / active / post`
- `HUMAN_HANDOFF.pre / active / post`

`EXPLAIN_PROCESS` is the only stage without a `post` phase.

Minimal business truth still exists:

- `medicalInputsSubmitted`
- `recommendationConfirmed`
- `onlineConsultSubmitted`

Truth supports stage completion, but `journeySnapshot` is still the primary state.

## Snapshot Sources

`buildChatbotV2TurnContext()` reads:

- `chatbot_v2`
- optional `chatbot_v2_floor`

The builder prefers a later `chatbot_v2_floor.journey_snapshot` when it is ahead of the current foundation snapshot.

There is also one special-case preference:

- `EXPLAIN_PROCESS.pre` from floor is allowed to win over `EXPLAIN_PROCESS.active` from foundation so a resumed session can stay on the opening invitation turn when needed

If nothing else is present, the lifecycle bootstraps at:

- `EXPLAIN_PROCESS.pre`

## Turn Envelopes

`preTurn` is the CRM-owned turn context sent into composition. It currently includes:

- `journeySnapshot`
- `resources`
- `truthSummary`
- `stageCopy`
- `requestClass`
- `responseIntent`
- `targetResourceTypes`
- `includeProgressionFollowUp`

`postTurn` is rebuilt after the assistant response and may advance the lifecycle again through post-turn reconciliation.

The widget starter now uses a dedicated starter envelope:

- fixed `journeySnapshot = EXPLAIN_PROCESS.pre`
- fixed `requestClass = process_explanation`
- fixed `responseIntent = process_explanation`
- only `PROCESS_GUIDE` is exposed

That prevents the widget starter from consuming the opening lifecycle gate.

## Orchestrator Outputs

`ConversationOrchestratorService.orchestrate()` returns:

- `requestClass`
- `responseIntent`
- `allowedResources`
- `includeProgressionFollowUpAccepted`
- `requiresFaqGrounding`
- `journeyUpdate`

`requiresFaqGrounding` is keyed off `responseIntent`, not raw `requestClass`.

That means FAQ grounding is enabled whenever the assistant is expected to answer as:

- `faq`
- `process_explanation`

## FAQ Overlay Rule

FAQ is now overlay behavior, not the progression owner.

In practice:

- FAQ in `pre` stays in the same `pre`
- FAQ in `active` stays in the same `active`
- FAQ does not move a stage forward on its own
- `includeProgressionFollowUp` only allows a light follow-up close, it does not advance the lifecycle by itself

Repeated later `process_explanation` turns outside `EXPLAIN_PROCESS` are normalized to:

- `responseIntent = faq`

That keeps them informational only and prevents rewind.

## Resource Selection Rule

The orchestrator computes:

1. projected resources from the current or updated snapshot
2. explicitly targeted resources from `classification.targetResourceTypes`
3. implicit targeted resources for human handoff

Then it returns:

- targeted resources when they exist
- merged targeted + projected resources only for FAQ / process-explanation turns with accepted progression follow-up
- otherwise projected resources

This keeps FAQ overlay compatible with the current stage without letting FAQ own progression.

## Lifecycle Semantics

### `EXPLAIN_PROCESS.pre`

This is the discovery and invitation phase.

Current behavior:

- discovery FAQ stays in `EXPLAIN_PROCESS.pre`
- only explicit agreement enters `EXPLAIN_PROCESS.active`
- explicit agreement is currently recognized from:
  - `progression_request`
  - `process_explanation`
  - `resource_request` targeting `PROCESS_GUIDE`

### `EXPLAIN_PROCESS.active`

This is the one-turn process explanation phase.

Current behavior:

- pre-turn orchestration keeps the turn anchored at `EXPLAIN_PROCESS.active`
- `responseIntent` is normalized to `process_explanation`
- explicit intake resource requests do not jump forward during pre-turn
- post-turn reconciliation automatically advances:
  - `EXPLAIN_PROCESS.active -> COLLECT_MEDICAL_INPUTS.pre`

There is no separate `EXPLAIN_PROCESS.post`.

### `COLLECT_MEDICAL_INPUTS.pre`

This phase waits for explicit agreement to start intake.

Current behavior:

- FAQ stays in `COLLECT_MEDICAL_INPUTS.pre`
- explicit agreement enters `COLLECT_MEDICAL_INPUTS.active`
- explicit agreement is recognized from:
  - `progression_request`
  - `resource_request` targeting `MEDICAL_DOC_UPLOAD` or `QUESTIONNAIRE`

### `COLLECT_MEDICAL_INPUTS.active`

This is the intake execution phase.

Current behavior:

- FAQ stays in `COLLECT_MEDICAL_INPUTS.active`
- submitted intake enters `COLLECT_MEDICAL_INPUTS.post` when `medicalInputsSubmitted = true`
- dismiss-style progression also enters `COLLECT_MEDICAL_INPUTS.post`
- dismissal is currently recognized from:
  - `progression_request` not still targeting intake resources
  - `resource_request` targeting recommendation resources

### `COLLECT_MEDICAL_INPUTS.post`

This is the confirmation layer for both completion and dismiss.

Current behavior:

- pre-turn remains at `COLLECT_MEDICAL_INPUTS.post`
- post-turn automatically advances:
  - `COLLECT_MEDICAL_INPUTS.post -> RECOMMENDATION.pre`

### `RECOMMENDATION.pre`

This phase waits for explicit agreement to review recommendation resources.

Current behavior:

- FAQ stays in `RECOMMENDATION.pre`
- explicit agreement enters `RECOMMENDATION.active`
- explicit agreement is recognized from:
  - `progression_request`
  - `resource_request` targeting `HOSPITAL_RECOMMENDATION` or `PACKAGE_RECOMMENDATION`

### `RECOMMENDATION.active`

This is the recommendation execution phase.

Current behavior:

- FAQ stays in `RECOMMENDATION.active`
- confirmation enters `RECOMMENDATION.post` when `recommendationConfirmed = true`
- dismiss-style progression also enters `RECOMMENDATION.post`
- dismissal is currently recognized from:
  - `progression_request` not still targeting recommendation resources
  - `resource_request` targeting `ONLINE_CONSULT_BOOKING`

### `RECOMMENDATION.post`

This is the confirmation layer for both completion and dismiss.

Current behavior:

- pre-turn remains at `RECOMMENDATION.post`
- post-turn automatically advances:
  - `RECOMMENDATION.post -> ONLINE_CONSULT.pre`

### `ONLINE_CONSULT.pre`

This phase waits for explicit agreement to enter booking.

Current behavior:

- FAQ stays in `ONLINE_CONSULT.pre`
- explicit agreement enters `ONLINE_CONSULT.active`
- explicit agreement is recognized from:
  - `progression_request`
  - `resource_request` targeting `ONLINE_CONSULT_BOOKING`

### `ONLINE_CONSULT.active`

This is the booking execution phase.

Current behavior:

- FAQ stays in `ONLINE_CONSULT.active`
- the stage cannot be dismissed by plain progression
- only submission moves it forward:
  - `onlineConsultSubmitted = true` enters `ONLINE_CONSULT.post`

### `ONLINE_CONSULT.post`

This is currently the submitted confirmation phase.

Current behavior:

- the stage remains terminal for now
- there is no implemented automatic bridge beyond `ONLINE_CONSULT.post`

### `HUMAN_HANDOFF.pre`

This phase asks whether the patient wants a human advisor to take over.

Current behavior:

- entering handoff from any non-handoff stage goes to `HUMAN_HANDOFF.pre`
- explicit agreement enters `HUMAN_HANDOFF.active`
- explicit agreement is recognized from:
  - `human_help_request`
  - `progression_request`
  - `resource_request` targeting `HUMAN_HANDOFF`

### `HUMAN_HANDOFF.active`

This is the handoff execution phase.

Current behavior:

- pre-turn stays anchored at `HUMAN_HANDOFF.active`
- it does not auto-complete on FAQ or progression alone
- post-turn enters `HUMAN_HANDOFF.post` only when the assistant execution acknowledgement is explicitly `HUMAN_HANDOFF`

### `HUMAN_HANDOFF.post`

This is the completed handoff confirmation phase.

Current behavior:

- the stage remains terminal after handoff confirmation

## Stage Copy

`StageCopyRegistryService` now provides fixed lifecycle-aware copy for:

- `EXPLAIN_PROCESS.pre`
- `EXPLAIN_PROCESS.active`
- `COLLECT_MEDICAL_INPUTS.pre`
- `COLLECT_MEDICAL_INPUTS.post`
- `RECOMMENDATION.pre`
- `RECOMMENDATION.post`
- `ONLINE_CONSULT.pre`
- `ONLINE_CONSULT.post`
- `HUMAN_HANDOFF.pre`
- `HUMAN_HANDOFF.post`

There is still no fixed copy entry for:

- `COLLECT_MEDICAL_INPUTS.active`
- `RECOMMENDATION.active`
- `ONLINE_CONSULT.active`
- `HUMAN_HANDOFF.active`

Those active phases rely on the current `responseIntent`, resource context, and general composer instructions rather than a dedicated fixed stage-copy record.
