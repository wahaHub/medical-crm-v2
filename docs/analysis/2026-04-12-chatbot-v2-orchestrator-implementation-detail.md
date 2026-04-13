# Chatbot V2 Orchestrator Implementation Detail

Date: 2026-04-12

## Purpose

This note describes the actual implemented `chatbot-v2` orchestration model after the 2026-04-12 state-model amendment.

It reflects the current code, not a future idealized design.

## Current State Model

### Primary journey state

The primary state is now:

- `journeySnapshot.currentStage`
- `journeySnapshot.currentPhase`

This snapshot is the main conversational state. It is no longer derived from a large truth object every turn.

### Minimal truth

The current minimal truth model is:

- `medicalInputsSubmitted`
- `recommendationConfirmed`
- `onlineConsultSubmitted`

Truth is now used as business-fact support only. It does not drive a full reverse derivation of the stage machine.

### No `deriveSnapshot()`

`JourneyEngineService` no longer implements `deriveSnapshot()`.

It only implements:

```ts
advanceSnapshot(currentSnapshot, transitionDecision)
```

This means:

- no `truth -> stage` reverse mapping in the core journey engine
- no attempt to infer the whole current journey from a few boolean facts

## Where The Current Snapshot Comes From

### Foundation snapshot

`ContextBuilderService.buildChatbotV2Foundation()` now bootstraps the foundation snapshot to:

- `EXPLAIN_PROCESS.pre`

and marks the foundation source as:

- `bootstrap`

This foundation snapshot is only the starting point for turn construction.

### Floor override

`buildChatbotV2TurnContext()` reads:

- `chatbot_v2`
- optional `chatbot_v2_floor`

If `chatbot_v2_floor.journey_snapshot` is later than the bootstrapped or current foundation snapshot, that later floor wins.

If the current foundation `journey_snapshot` is already later, the older floor is not preserved.

This is important: the live turn builder now prefers the currently known journey position over an older floor.

## `preTurn` In Practice

`preTurn` is the structured turn context CRM sends to the composer before the assistant writes the reply.

It currently contains:

- `journeySnapshot`
- `resources`
- `truthSummary`
- `stageCopy`
- `requestClass`
- `responseIntent`
- `targetResourceTypes`
- `includeProgressionFollowUp`

This is serialized as `chatbotV2` and passed to the composer workflow.

## Conversation Orchestrator Inputs

`ConversationOrchestratorService.orchestrate()` currently receives:

- `scopeId`
- `journeySnapshot`
- `truth`
- `classification`
  - `requestClass`
  - `targetResourceTypes`
  - `includeProgressionFollowUp`

It does not currently receive `recentMessages` or `conversationSummary` directly. Those are used earlier by the classifier.

## What The Orchestrator Currently Decides

For each turn, the orchestrator currently returns:

- `requestClass`
- `responseIntent`
- `allowedResources`
- `includeProgressionFollowUpAccepted`
- `requiresFaqGrounding`
- `journeyUpdate`

### Important note on `responseIntent`

Right now:

- `responseIntent` is usually equal to `requestClass`
- but there are two important exceptions:
  - during `EXPLAIN_PROCESS.active`, a pure `progression_request` is normalized to `process_explanation` until the mandatory initial process explanation has been completed
  - later repeated `process_explanation` turns are normalized to FAQ-like informational responses so they do not affect the current journey step

## FAQ grounding rule

`requiresFaqGrounding` is currently:

- `true` for `faq`
- `true` for `process_explanation`
- `false` otherwise

## Progression follow-up rule

`includeProgressionFollowUp` is currently accepted only when:

- classifier requested it
- request class is `faq` or `process_explanation`
- current stage is not `HUMAN_HANDOFF`

If accepted:

- the primary `responseIntent` stays unchanged
- journey does not advance because of the follow-up flag alone
- the flag only gives composer permission to add a light “we can continue” style closing line
- resource exposure stays anchored to the current CRM-owned journey snapshot

## Resource selection rule

The orchestrator builds:

1. current allowed resources from the current snapshot
2. projected allowed resources from the projected snapshot after any journey update
3. explicitly targeted resources from `classification.targetResourceTypes`

Then it decides:

- if targeted resources exist:
  - return targeted resources
  - except for accepted FAQ/process follow-up turns, where targeted resources are merged with projected resources
- otherwise:
  - return projected allowed resources

Implicit targeting is currently only implemented for:

- `human_help_request` -> `HUMAN_HANDOFF`
- `progression_request` while already inside `HUMAN_HANDOFF` -> `HUMAN_HANDOFF`

## Transition Model

The orchestrator no longer emits raw events.

It now decides whether to call `JourneyEngineService.advanceSnapshot()` with a transition decision.

Current transition decisions are:

- `ENTER_EXPLAIN_PROCESS_ACTIVE`
- `ENTER_COLLECT_MEDICAL_INPUTS_PRE`
- `ENTER_COLLECT_MEDICAL_INPUTS_ACTIVE`
- `ENTER_COLLECT_MEDICAL_INPUTS_POST`
- `ENTER_RECOMMENDATION_PRE`
- `ENTER_RECOMMENDATION_ACTIVE`
- `ENTER_RECOMMENDATION_POST`
- `ENTER_ONLINE_CONSULT_PRE`
- `ENTER_ONLINE_CONSULT_ACTIVE`
- `ENTER_ONLINE_CONSULT_POST`
- `ENTER_HUMAN_HANDOFF_PRE`
- `ENTER_HUMAN_HANDOFF_ACTIVE`
- `ENTER_HUMAN_HANDOFF_POST`

## Actual transition rules in code

### 1. Human help

If:

- `requestClass = human_help_request`
- current stage is not `HUMAN_HANDOFF`

Then:

- transition to `HUMAN_HANDOFF.pre`

If current snapshot is:

- `HUMAN_HANDOFF.pre`

and one of these is true:

- `requestClass = progression_request`
- `requestClass = human_help_request`
- `requestClass = resource_request` targeting `HUMAN_HANDOFF`

Then:

- transition to `HUMAN_HANDOFF.active`

If current snapshot is:

- `HUMAN_HANDOFF.active`

then pre-turn orchestration keeps the journey anchored at `HUMAN_HANDOFF.active`.

Only post-turn reconciliation may move it to:

- `HUMAN_HANDOFF.post`

and only when the assistant execution acknowledgement is explicitly `HUMAN_HANDOFF`

### 2. Truth-driven post acknowledgements

If current snapshot is:

- `COLLECT_MEDICAL_INPUTS.active`
- and `truth.medicalInputsSubmitted = true`

Then:

- transition to `COLLECT_MEDICAL_INPUTS.post`

If current snapshot is:

- `RECOMMENDATION.active`
- and `truth.recommendationConfirmed = true`

Then:

- transition to `RECOMMENDATION.post`

If current snapshot is:

- `ONLINE_CONSULT.active`
- and `truth.onlineConsultSubmitted = true`

Then:

- transition to `ONLINE_CONSULT.post`

### 3. `EXPLAIN_PROCESS.pre`

This is now the initial entry step.

Its purpose is:

- answer the patient initial discovery question
- introduce that the next step is explaining the overall medical journey

Pre-turn orchestration does not leave `EXPLAIN_PROCESS.pre`.

Post-turn reconciliation automatically advances:

- `EXPLAIN_PROCESS.pre -> EXPLAIN_PROCESS.active`

after the first answered user turn.

### 4. `EXPLAIN_PROCESS.active`

This is now the mandatory process explanation step.

Current implemented rule:

- if the patient sends a pure `progression_request` before the initial process explanation has already been completed, the journey stays anchored at `EXPLAIN_PROCESS.active`
- that same turn is normalized to `responseIntent = process_explanation`, so the assistant explains the process instead of advancing
- once a prior assistant turn has completed that mandatory process explanation, a later pure `progression_request` may move to `COLLECT_MEDICAL_INPUTS.pre`
- repeated later `process_explanation` turns become FAQ-like informational turns and do not move the journey
- explicit `resource_request` targeting:
  - `MEDICAL_DOC_UPLOAD`
  - `QUESTIONNAIRE`
  may open `COLLECT_MEDICAL_INPUTS.pre` after the initial explain gate has been satisfied

### 5. From `COLLECT_MEDICAL_INPUTS.pre`

If:

- `requestClass = progression_request`

or:

- `requestClass = resource_request`
- target includes `MEDICAL_DOC_UPLOAD` or `QUESTIONNAIRE`

Then:

- transition to `COLLECT_MEDICAL_INPUTS.active`

### 6. From `COLLECT_MEDICAL_INPUTS.active`

If current snapshot is:

- `COLLECT_MEDICAL_INPUTS.active`

and:

- `truth.medicalInputsSubmitted = false`

and one of these is true:

- `requestClass = progression_request`
- `requestClass = resource_request` targeting:
  - `HOSPITAL_RECOMMENDATION`
  - `PACKAGE_RECOMMENDATION`

Then:

- transition to `RECOMMENDATION.pre`

This is the current implemented dismiss behavior for the collect step.

### 7. From `COLLECT_MEDICAL_INPUTS.post`

If:

- `requestClass = progression_request`

or:
- `requestClass = resource_request`
- target includes `HOSPITAL_RECOMMENDATION` or `PACKAGE_RECOMMENDATION`

Then:

- transition to `RECOMMENDATION.pre`

### 8. From `RECOMMENDATION.pre`

If:

- `requestClass = progression_request`

or:

- `requestClass = resource_request`
- target includes `HOSPITAL_RECOMMENDATION` or `PACKAGE_RECOMMENDATION`

Then:

- transition to `RECOMMENDATION.active`

### 9. From `RECOMMENDATION.active`

If current snapshot is:

- `RECOMMENDATION.active`

and:

- `truth.recommendationConfirmed = false`

and one of these is true:

- `requestClass = progression_request`
- `requestClass = resource_request` targeting `ONLINE_CONSULT_BOOKING`

Then:

- transition to `ONLINE_CONSULT.pre`

This is the current implemented dismiss behavior for the recommendation step.

### 10. From `RECOMMENDATION.post`

If:

- `requestClass = progression_request`

or:
- `requestClass = resource_request`
- target includes `ONLINE_CONSULT_BOOKING`

Then:

- transition to `ONLINE_CONSULT.pre`

### 11. From `ONLINE_CONSULT.pre`

If:

- `requestClass = progression_request`

or:

- `requestClass = resource_request`
- target includes `ONLINE_CONSULT_BOOKING`

Then:

- transition to `ONLINE_CONSULT.active`

Unlike `COLLECT_MEDICAL_INPUTS` and `RECOMMENDATION`, the current implementation does not allow a dismiss-style transition past `ONLINE_CONSULT.pre`. The stage copy for `ONLINE_CONSULT.pre` now explicitly frames this step as required and not dismissable.

## Stage copy registry

`StageCopyRegistryService` currently returns fixed canonical reference copy for:

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

Notable current wording:

- `EXPLAIN_PROCESS.pre` answers the initial discovery question and introduces that the next step is the overall process explanation
- `EXPLAIN_PROCESS.active` explains the overall medical journey and why collecting medical information is the next required step
- `ONLINE_CONSULT.pre` explicitly says the online consultation step is required and cannot be dismissed or skipped
- `HUMAN_HANDOFF.pre` asks whether the patient wants the case sent to the administrator team now
- `HUMAN_HANDOFF.post` confirms the case has been sent and says the human team will contact the patient within 24 hours

## What `JourneyEngineService` Actually Does

`JourneyEngineService` is now intentionally small.

It does not inspect truth.
It does not interpret raw events.
It only maps a transition decision to the next snapshot.

Examples:

- `ENTER_EXPLAIN_PROCESS_ACTIVE` -> `EXPLAIN_PROCESS.active`
- `ENTER_COLLECT_MEDICAL_INPUTS_PRE` -> `COLLECT_MEDICAL_INPUTS.pre`
- `ENTER_RECOMMENDATION_POST` -> `RECOMMENDATION.post`
- `ENTER_HUMAN_HANDOFF_PRE` -> `HUMAN_HANDOFF.pre`

## Post-turn behavior

`buildChatbotV2PostTurnContext()` now:

1. starts from `preTurn.journeySnapshot`
2. refreshes minimal truth from the latest status snapshot
3. runs a post-turn reconciliation step that only allows:
   - truth-driven `active -> post` acknowledgements
   - explicit `HUMAN_HANDOFF.active -> post` when the assistant action itself is `HUMAN_HANDOFF`

This means post-turn context no longer:

- derives a fresh stage from truth alone
- re-applies the same user classification to advance the journey a second time in the same turn

## Current limitations

The current implementation is much cleaner than the earlier truth-derived model, but it is still intentionally narrow.

Notable current limits:

- `responseIntent` is still mostly close to `requestClass`, except repeated later `process_explanation` turns are intentionally normalized to FAQ-like informational responses
- only a limited set of journey transitions is implemented
- the foundation snapshot now bootstraps at `EXPLAIN_PROCESS.pre`
- the widget starter now preserves `EXPLAIN_PROCESS.pre` instead of consuming the first mandatory explain step
- initial explain completion is now read from the stored `requestClass = process_explanation`, not from `responseIntent`, because the first real explain turn may intentionally normalize `responseIntent` to FAQ-like output
- stage-copy exists only as fixed canonical reference text for current `pre` / `post` phases; it is not yet personalized or localized beyond composer rephrasing

## Files that implement this behavior

- [conversation-orchestrator.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts)
- [journey-engine.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/journey-engine.service.ts)
- [journey-truth.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/journey-truth.service.ts)
- [stage-copy-registry.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/stage-copy-registry.service.ts)
- [chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts)
- [context-builder.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/context-builder.service.ts)
- [get-ai-policy-context.use-case.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts)
