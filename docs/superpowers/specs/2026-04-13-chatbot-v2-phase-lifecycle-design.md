# Chatbot V2 Phase Lifecycle Design

Date: 2026-04-13

## Purpose

This spec refines the `chatbot-v2` journey model into a consistent phase lifecycle:

- `pre`
- `active`
- `post`

The goal is to make the guided medical journey feel natural in live chat:

- users may ask FAQ questions at any stage
- FAQ answers should not break or rewind the main journey
- every stage should explain why it exists before asking the user to act
- completion and dismissal should both receive a confirmation layer
- once a stage is completed or dismissed, the journey should automatically move to the next stage's `pre`

This spec is an amendment to the earlier `chatbot-v2` state-model work. It describes the intended product behavior, not just the current code.

## Decision Summary

### 1. Every main journey stage follows a phase lifecycle

The system should treat these stages as phase-based:

- `EXPLAIN_PROCESS`
- `COLLECT_MEDICAL_INPUTS`
- `RECOMMENDATION`
- `ONLINE_CONSULT`
- `HUMAN_HANDOFF`

All stages use `pre / active / post`, except:

- `EXPLAIN_PROCESS` uses only `pre / active`
- `EXPLAIN_PROCESS.active` is also the completion turn for process explanation
- after `EXPLAIN_PROCESS.active`, the system automatically moves to the next stage's `pre`

### 2. FAQ is an overlay, not the main flow controller

At any phase, the user may ask FAQ or request another explanation.

Those turns should:

- answer the FAQ
- keep the current stage and phase unless an explicit progression or completion rule applies
- end with the current stage's promotion or reminder language from stage copy

This means FAQ does not own progression.

### 3. `pre` waits for user agreement

Each `pre` phase should:

- explain why this step exists
- allow FAQ turns to continue
- end every answer with a short promotion line inviting the user into `active`

The system should move from `pre` to `active` only when the user clearly agrees to proceed.

### 4. `active` executes the stage

Each `active` phase is the stage where the user actually does the work:

- viewing the process
- uploading or filling intake
- reviewing recommendation
- completing online consultation
- confirming human handoff

Users may still ask FAQ in `active`.

When that happens, the assistant should:

- answer the FAQ
- remind the user what the current action is
- explain whether the stage can be skipped or must be completed

### 5. `post` confirms and bridges automatically

Each `post` phase should:

- confirm what just happened
- explain what the next step is
- automatically transition to the next stage's `pre`

This should happen both for:

- completion
- dismissal

The user should not need to manually push the flow forward after a `post` response.

## Phase Semantics

## `EXPLAIN_PROCESS.pre`

This is the opening conversational phase.

It should:

- answer the patient's first discovery question
- explain what the service does at a high level
- avoid full process exposition yet
- end with a fixed invitation such as:
  - `If you'd like, next I can walk you through the overall process.`

If the user keeps asking discovery FAQ, the system stays in `EXPLAIN_PROCESS.pre`.

## `EXPLAIN_PROCESS.active`

This is the one-turn process explanation phase.

It should:

- present the overall journey clearly
- explain why collecting medical information comes before formal recommendation
- answer any FAQ embedded in the same turn

After this phase completes, the system automatically advances to:

- `COLLECT_MEDICAL_INPUTS.pre`

`EXPLAIN_PROCESS` has no separate `post`.

## `COLLECT_MEDICAL_INPUTS.pre`

This phase should:

- explain why medical information is needed
- explain that better inputs lead to more accurate review and recommendation
- allow FAQ turns to continue
- end with promotion language that invites the user to start intake

Only clear agreement should move the user into:

- `COLLECT_MEDICAL_INPUTS.active`

## `COLLECT_MEDICAL_INPUTS.active`

This phase is where the patient:

- fills the questionnaire
- uploads medical materials
- or dismisses this stage

FAQ turns should not change the phase.

Instead, they should:

- answer the user's question
- remind the user that intake is the current action
- explain that this step can be skipped for now if the patient confirms

## `COLLECT_MEDICAL_INPUTS.post`

This phase should exist for both:

- submitted intake
- dismissed intake

If intake was submitted, the confirmation copy should say:

- the information has been received
- it will be used for the next recommendation step

If intake was dismissed, the confirmation copy should say:

- the patient chose not to submit right now
- they can still come back later and submit if they change their mind

After the confirmation response, the system automatically advances to:

- `RECOMMENDATION.pre`

## `RECOMMENDATION.pre`

This phase should:

- explain why recommendation exists
- explain that recommendations are not random and are based on the case context
- allow FAQ turns
- end with promotion language inviting the user into the recommendation step

Only clear agreement should move the user into:

- `RECOMMENDATION.active`

## `RECOMMENDATION.active`

This phase is where the user:

- reviews recommendation guidance
- confirms it
- or dismisses it

FAQ turns stay in this phase and end with a reminder about the current choice.

This stage can be skipped.

## `RECOMMENDATION.post`

This phase should exist for both:

- confirmed recommendation
- dismissed recommendation

If recommendation was confirmed, the confirmation copy should say:

- a recommendation direction has been accepted
- the next step is preparing online consultation

If recommendation was dismissed, the confirmation copy should say:

- the patient chose not to act on recommendation right now
- they can come back later if needed

After the confirmation response, the system automatically advances to:

- `ONLINE_CONSULT.pre`

## `ONLINE_CONSULT.pre`

This phase should:

- explain why online consultation is required
- make clear that this step cannot be skipped
- allow FAQ turns
- end with promotion language inviting the user into online consultation

Only clear agreement should move the user into:

- `ONLINE_CONSULT.active`

## `ONLINE_CONSULT.active`

This phase is where the patient completes the online consultation step.

FAQ turns should:

- answer the question
- remind the patient that online consultation is still the current required action

This stage cannot be dismissed.

## `ONLINE_CONSULT.post`

This phase confirms that the online consultation step has been submitted.

It should:

- confirm receipt
- explain what happens next
- avoid rewinding the journey

If later stages are still undefined in product terms, this phase may remain terminal for now.

## `HUMAN_HANDOFF.pre`

This phase should:

- explain that a human advisor can take over
- allow FAQ turns
- end with a direct confirmation question asking whether the case should be sent now

Only clear agreement should move the user into:

- `HUMAN_HANDOFF.active`

## `HUMAN_HANDOFF.active`

This phase executes the handoff.

FAQ turns should remain informational only and should not leave handoff.

## `HUMAN_HANDOFF.post`

This phase confirms that the case has been sent to the admin team.

It should:

- confirm submission
- state that the team will contact the patient within 24 hours

## FAQ Overlay Rules

FAQ and later process-explanation turns should be handled as overlays.

### In `pre`

If the current snapshot is `X.pre` and the user asks FAQ:

- answer the FAQ
- keep the same snapshot
- end with that stage's promotion line

### In `active`

If the current snapshot is `X.active` and the user asks FAQ:

- answer the FAQ
- keep the same snapshot
- end with an action reminder for the current phase

### In `post`

If the current snapshot is `X.post` and the user asks FAQ:

- answer the FAQ
- still let the `post` confirmation bridge the user into the next stage's `pre`

### Later process explanation

If the system is already beyond `EXPLAIN_PROCESS` and the user asks for the process again:

- treat it as informational overlay
- do not rewind to `EXPLAIN_PROCESS`
- do not push progression by itself
- after answering, return to the current stage's promotion or reminder copy

## Truth And Dismiss Rules

The minimal business truth stays:

- `medicalInputsSubmitted`
- `recommendationConfirmed`
- `onlineConsultSubmitted`

Truth does not derive the current stage.

Truth only helps determine when a stage is completed and when a `post` should be emitted.

### Truth-driven post entry

- `COLLECT_MEDICAL_INPUTS.active` + `medicalInputsSubmitted = true`
  - enters `COLLECT_MEDICAL_INPUTS.post`
- `RECOMMENDATION.active` + `recommendationConfirmed = true`
  - enters `RECOMMENDATION.post`
- `ONLINE_CONSULT.active` + `onlineConsultSubmitted = true`
  - enters `ONLINE_CONSULT.post`

### Dismiss-driven post entry

- `COLLECT_MEDICAL_INPUTS.active` may be dismissed
  - dismissal enters `COLLECT_MEDICAL_INPUTS.post`
- `RECOMMENDATION.active` may be dismissed
  - dismissal enters `RECOMMENDATION.post`
- `ONLINE_CONSULT.active` may not be dismissed

Dismissal should not skip the confirmation layer.

The confirmation layer must explain:

- the user chose not to do that step now
- they may come back later when product rules allow it
- what the next step is

## Stage Copy Requirements

`StageCopyRegistryService` should no longer be treated as a thin sentence registry.

For each stage and phase it should provide at least:

- the purpose of the phase
- the promotion words for `pre`
- the action reminder for `active`
- the confirmation language for `post`
- the bridge language to the next stage

Important stage-copy requirements:

- `EXPLAIN_PROCESS.pre`
  - opening service explanation
  - invitation to show the full process
- `EXPLAIN_PROCESS.active`
  - full process explanation
  - automatic bridge into `COLLECT_MEDICAL_INPUTS.pre`
- `COLLECT_MEDICAL_INPUTS.pre`
  - why materials matter for case review
- `RECOMMENDATION.pre`
  - why recommendations are relevant and curated
- `ONLINE_CONSULT.pre`
  - why this step is required and cannot be skipped
- `COLLECT_MEDICAL_INPUTS.post` and `RECOMMENDATION.post`
  - separate confirmation wording for completion vs dismissal

## Orchestrator Requirements

`ConversationOrchestratorService` must be updated so that:

- `pre` only enters `active` after explicit user agreement
- FAQ overlay does not change stage or phase by itself
- `active` remains active across FAQ turns
- completion or dismissal moves the stage into `post`
- `post` automatically advances to the next stage's `pre`
- `EXPLAIN_PROCESS.active` automatically advances to `COLLECT_MEDICAL_INPUTS.pre`
- later process explanation remains informational only

## Testing Requirements

At minimum, implementation must cover:

- `EXPLAIN_PROCESS.pre` remains stable across multiple discovery FAQ turns
- `EXPLAIN_PROCESS.pre -> active` only after explicit agreement
- `EXPLAIN_PROCESS.active -> COLLECT_MEDICAL_INPUTS.pre` automatically after the process explanation turn
- FAQ overlay in every `pre`
- FAQ overlay in every `active`
- submit -> `post`
- dismiss -> `post`
- `post -> next pre` automatic bridging
- later process explanation does not rewind or push the journey
- `ONLINE_CONSULT.active` cannot be dismissed

## Why This Design Is Better

This model matches the desired user experience:

- the patient can ask questions freely without losing the journey thread
- every stage explains itself before asking for action
- the patient receives a clear confirmation after both completion and dismissal
- automatic bridging keeps the guided flow moving without extra user friction
- `EXPLAIN_PROCESS` finally behaves like a real opening sequence instead of a sticky pseudo-stage
