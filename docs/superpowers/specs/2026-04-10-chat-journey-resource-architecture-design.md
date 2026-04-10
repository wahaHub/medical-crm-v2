# Chat Journey Resource Architecture Design

Date: 2026-04-10

## Goal

Redesign the patient-facing chat architecture so it can support:

- category-based FAQ answering
- guided case progression through a clear medical journey
- rich chat widget resources that both load and update state
- history-aware continuation across sessions
- status questions at any time
- human takeover at any time

The new architecture should be simpler than the current Dify-heavy orchestration model, with CRM as the single orchestration authority.

This design applies to:

- CRM backend: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2`
- China frontend: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys`
- Dify workflow: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config`

## Problem

The current system mixes too many responsibilities:

- FAQ answering
- process explanation
- journey progression
- widget triggering
- state lookup
- history continuation
- Dify prompt logic

This creates a few recurring failure modes:

1. widget type gets mistaken for journey truth
2. Dify over-decides progression instead of CRM enforcing rules
3. FAQ and progression logic interfere with each other
4. status questions are treated as conversational intent instead of structured resource reads
5. history restore depends too much on summaries and message interpretation

The live behavior already showed the result:

- questionnaire prompts appeared when users explicitly refused to fill forms
- recommendation-adjacent conversations over-triggered `REQUEST_DOC_UPLOAD`
- truth and chat behavior drifted apart when the chatbot inferred too much from conversation state

## Design Principles

### Principle 1: CRM is the only orchestrator

CRM owns:

- current journey stage
- current phase within the stage
- truth checks for progression
- allowed resources for the current turn

Dify does not own progression.

### Principle 2: Dify is a language layer, not a workflow engine

Dify may:

- classify user intent
- generate natural language
- explain the current step
- package CRM decisions into conversational replies

Dify may not:

- advance journey stages by itself
- decide whether a widget is allowed
- override CRM progression rules

### Principle 3: Journey and resource are separate layers

Journey answers:

- where the case is in the progression
- what phase the current stage is in

Resource answers:

- what widget or structured UI can be shown
- what the user can do inside the chat widget

Displaying a resource does not itself define the journey stage.

### Principle 4: FAQ is a cross-cutting capability

FAQ answering is available at any time.

It does not replace the journey and does not automatically change stage or phase.

### Principle 5: status questions are resource reads

Status questions do not require a special subsystem.

Things like:

- medical invitation status
- ticket status
- doctor review status
- payment status
- logistics/travel status

are modeled as queryable resources.

### Principle 6: keep state minimal

The journey state should stay small.

Do not add extra orchestration fields like:

- per-stage status maps
- stored blocking reasons
- separate lookup-state caches

If something can be derived at runtime from truth, derive it.

## Target Architecture

The system is split into three layers:

1. Journey Layer
2. Resource Layer
3. Conversation Layer

### Journey Layer

Owns:

- `currentStage`
- `currentPhase`

Uses CRM truth to decide:

- whether the current stage should continue
- whether the stage should advance
- which resources are allowed in this turn

### Resource Layer

Owns:

- resource definitions
- resource visibility rules
- resource payload building
- resource update handling

Supports both:

- progression resources
- lookup resources

### Conversation Layer

Owns:

- user request classification
- Dify prompt/context shaping
- natural language generation
- final assistant message assembly

Does not own truth or progression.

## Journey Model

The journey state contains only:

- `currentStage`
- `currentPhase`

### Stages

- `EXPLAIN_PROCESS`
- `COLLECT_MEDICAL_INPUTS`
- `RECOMMENDATION`
- `ONLINE_CONSULT`
- `HUMAN_HANDOFF`

### Phase rules

Not every stage supports every phase.

- `EXPLAIN_PROCESS`
  - supports only `active`
- `COLLECT_MEDICAL_INPUTS`
  - supports `pre`, `active`, `post`
- `RECOMMENDATION`
  - supports `pre`, `active`, `post`
- `ONLINE_CONSULT`
  - supports `pre`, `active`, `post`
- `HUMAN_HANDOFF`
  - supports `pre`, `active`, `post`

### Why `EXPLAIN_PROCESS` is special

`EXPLAIN_PROCESS` is:

- mandatory
- not the same as general FAQ
- not a stage that needs a separate pre or post wrapper

It is an entry-stage explanation step whose job is to:

- explain the service and consultation flow
- absorb light discovery
- give direction without prematurely forcing structured intake

It stays in `active` only.

## Stage Responsibilities

### `EXPLAIN_PROCESS.active`

Responsibilities:

- explain the consultation process
- explain what the service can do
- answer early-stage FAQ
- provide directional guidance
- avoid formal recommendation if progression requirements are not met

This stage may show:

- `PROCESS_GUIDE`
- selected FAQ-related resources if useful

This stage should not require explicit completion confirmation.

### `COLLECT_MEDICAL_INPUTS.pre`

Responsibilities:

- explain why medical inputs are needed
- explain what the step is for
- explain what counts as enough input to continue

### `COLLECT_MEDICAL_INPUTS.active`

Responsibilities:

- collect structured medical inputs
- surface upload and questionnaire resources
- support partial progress and retries

### `COLLECT_MEDICAL_INPUTS.post`

Responsibilities:

- confirm that inputs were received
- explain what happens next
- provide timing expectations when possible

### `RECOMMENDATION.pre`

Responsibilities:

- explain why the system can now recommend
- explain recommendation basis
- explain whether the recommendation is hospital-based or package-based

### `RECOMMENDATION.active`

Responsibilities:

- present recommendation resources
- support confirmation
- answer recommendation comparisons and rationale questions

### `RECOMMENDATION.post`

Responsibilities:

- confirm that a recommendation direction has been accepted
- prepare for online consult or next operational step

### `ONLINE_CONSULT.pre`

Responsibilities:

- explain the purpose of online consult
- explain what the user should expect

### `ONLINE_CONSULT.active`

Responsibilities:

- offer booking or confirmation resources
- capture scheduling-related confirmation

### `ONLINE_CONSULT.post`

Responsibilities:

- confirm booking submission or success
- explain next communication expectations

### `HUMAN_HANDOFF.pre`

Responsibilities:

- explain why human help is being introduced
- set expectations for response and ownership

### `HUMAN_HANDOFF.active`

Responsibilities:

- formally transfer the case into human-assisted handling
- expose handoff/contact resource

### `HUMAN_HANDOFF.post`

Responsibilities:

- confirm handoff completion
- communicate who follows up and when

## Journey Transition Rules

Transitions are derived at runtime.

Do not store a separate transition cache.

### Entry into `EXPLAIN_PROCESS`

All new cases start in:

- `EXPLAIN_PROCESS.active`

### From `EXPLAIN_PROCESS.active` to `COLLECT_MEDICAL_INPUTS.pre`

Move when:

- the user explicitly wants to progress the case
- the user requests formal recommendation but the system still needs medical inputs
- the system has enough conversational signal that the interaction is no longer light discovery

Do not move just because the user asked a simple FAQ.

### Within `COLLECT_MEDICAL_INPUTS`

- `pre -> active`
  - after the system has explained the purpose of the step
- `active -> post`
  - once the minimum truth threshold for medical inputs has been met

The threshold should be based on CRM truth, not message interpretation.

### From `COLLECT_MEDICAL_INPUTS.post` to `RECOMMENDATION.pre`

Move when:

- recommendation eligibility truth is satisfied

### Within `RECOMMENDATION`

- `pre -> active`
  - once the system has framed why recommendation is happening
- `active -> post`
  - once hospital/package direction has been accepted

### From `RECOMMENDATION.post` to `ONLINE_CONSULT.pre`

Move when:

- the selected recommendation path requires online consult

Skip when:

- the selected package path does not require online consult

If online consult is skipped:

- the journey remains in `RECOMMENDATION.post` as the terminal recommendation-confirmed state for that path, unless:
  - a human follow-up is requested, or
  - the business process explicitly transitions to `HUMAN_HANDOFF`

This avoids creating an undefined gap for package-driven flows that do not need consult.

### Entry into `HUMAN_HANDOFF`

Allowed from any stage when:

- the user explicitly requests a human
- the system determines automation cannot continue safely
- the business process requires manual takeover

## Resource Model

Resources are the only structured UI units the frontend should render in chat.

### Resource contract

Each resource should expose:

- `resourceType`
- `resourceId`
- `status`
- `stageBinding`
- `visibilityRule`
- `payload`
- `actions`

### Resource status

Use the minimal shared status set:

- `available`
- `submitted`
- `failed`

Interpretation:

- `available`
  - resource can be rendered and interacted with
- `submitted`
  - the resource has been completed or confirmed enough for truth
- `failed`
  - the last attempt failed and needs retry or escalation

Do not introduce separate `shown`, `completed`, or `confirmed` states in the shared contract.

### Resource classes

Logical classes only. The wire contract remains the same.

#### Explain resources

- `PROCESS_GUIDE`

#### Progress resources

- `MEDICAL_DOC_UPLOAD`
- `QUESTIONNAIRE`
- `HOSPITAL_RECOMMENDATION`
- `PACKAGE_RECOMMENDATION`
- `ONLINE_CONSULT_BOOKING`
- `HUMAN_HANDOFF`

#### Query resources

- `MEDICAL_INVITATION_STATUS`
- `TICKET_STATUS`
- `DOCTOR_REVIEW_STATUS`
- `PAYMENT_STATUS`
- `LOGISTICS_STATUS`

More query resources may be added later without changing the journey model.

### Resource visibility

Default rule:

- query resources are globally available

Override rule:

- any resource may declare stage restrictions or truth-based restrictions

Examples:

- `PROCESS_GUIDE`
  - allowed in `EXPLAIN_PROCESS.active`
- `QUESTIONNAIRE`
  - allowed in `COLLECT_MEDICAL_INPUTS.active`
- `HOSPITAL_RECOMMENDATION`
  - allowed in `RECOMMENDATION.active`
- `MEDICAL_INVITATION_STATUS`
  - globally queryable unless business rules say otherwise

### Resource payload

Payload should be resource-specific but schema-validated per type.

Examples:

- title
- description
- CTA label
- template id
- shortlist entries
- booking window
- timing expectations
- status value for query resources

### Resource actions

Resources may support one or more interaction verbs such as:

- `open`
- `submit`
- `refresh`
- `confirm`
- `request_human`

This is not a separate global action layer.

It is resource-local interaction capability.

## Conversation Model

The conversation layer handles how the system talks, not what the journey truth is.

### User request classes

The system should classify each user turn into one of these buckets:

- `faq`
- `process_explanation`
- `progression_request`
- `resource_request`
- `resource_status_question`
- `human_help_request`

These are operational classes for orchestration, not persisted business truth.

### FAQ behavior

FAQ is available in every stage.

Answering an FAQ:

- does not itself change stage
- does not itself change phase
- may mention currently allowed resources if helpful

### Status-question behavior

Status questions do not use a separate lookup subsystem.

They resolve through query resources.

Examples:

- "What is my invitation status?"
- "Has the doctor reviewed my documents?"
- "Did you receive my form?"

The orchestrator should:

- identify the relevant resource type
- check that it is allowed
- pull its truth-backed payload
- let Dify turn that payload into a natural answer

### Human-help behavior

There are two human-help modes:

1. temporary human help insertion
2. formal human handoff takeover

The former may answer the current request without changing the main stage.

The latter transitions the journey into `HUMAN_HANDOFF`.

## CRM and Dify Cooperation

### Step 1: CRM reads current context

CRM reads:

- `currentStage`
- `currentPhase`
- journey-related truth
- currently available resources
- recent messages
- conversation summary

### Step 2: CRM classifies the user turn

CRM uses structured intent classification to decide which request class the turn belongs to.

An LLM may assist, but the output must be structured.

### Step 3: CRM computes allowed behavior

CRM applies journey rules and produces:

- `responseIntent`
- `allowedResources`
- `journeyUpdate` if any
- `resourceUpdates` if any

This is the key boundary.

CRM decides what is allowed before Dify writes the response.

### Step 4: Dify generates language within CRM limits

Dify receives:

- current stage
- current phase
- request class
- allowed resources
- relevant truth snapshot
- recent messages
- conversation summary

Dify returns:

- natural language
- optional resource references
- optional explanation framing

Dify does not decide progression.

### Step 5: CRM assembles the final assistant message

The final response should be assembled by CRM and should include:

- `text`
- `resources`
- minimal journey snapshot
- metadata needed by the frontend

### Step 6: resource interaction goes back through CRM

When a user interacts with a resource:

- the client calls a unified resource update endpoint
- CRM updates truth
- CRM recalculates stage/phase
- CRM emits the appropriate post or next-step message

This keeps resource updates and journey progression in one place.

### Step 7: CRM owns session resume

When a session is reopened, CRM should rebuild the active chat context in this precedence order:

1. CRM truth
2. `currentStage` and `currentPhase` derived from that truth
3. allowed resources derived from stage/phase and truth
4. recent messages
5. conversation summary

This means:

- CRM truth is authoritative
- recent messages are contextual only
- summary is advisory only

If a restored client state references an outdated resource:

- CRM should either refresh it to the current valid resource representation, or
- reject it as stale and return the currently valid resource set

Session resume must never trust stale widgets, recent-message inference, or summary text over current CRM truth.

### Resource update idempotency

All resource updates should support:

- idempotent retry
- duplicate-submit protection
- stale-resource detection

Minimum contract requirements:

- repeated submits against an already-submitted resource must not create a second truth mutation
- the server should support a resource action idempotency key, or derive a deterministic idempotency key from resource/action context
- stage progression must happen only once per successful truth-changing resource update
- stale resource updates must return the current valid resource snapshot instead of silently mutating old state

## Frontend Contract

The chat widget should become a resource renderer, not a flow engine.

### Frontend responsibilities

- render assistant text
- render resources by `resourceType`
- send resource updates back through CRM
- show the minimal journey snapshot if needed

### Frontend must not do

- journey-stage inference
- progression gating logic
- widget selection based on ad hoc `nextAction` heuristics

### Renderer registration

The frontend should maintain a registry such as:

- `resourceType -> renderer`

Adding a new widget should require:

1. a backend resource definition
2. a frontend renderer for that resource type

No core flow rewrite should be required.

## Error Handling

### Conversation errors

Examples:

- Dify timeout
- malformed LLM output
- FAQ retrieval failure

Behavior:

- do not change journey state
- return a safe fallback answer
- attach `HUMAN_HANDOFF` resource when appropriate

### Resource errors

Examples:

- upload failed
- questionnaire submission failed
- consult booking failed

Behavior:

- set the resource to `failed`
- do not advance the stage
- tell the user what failed and what can be retried

If the client retries after a timeout but the original mutation already succeeded:

- CRM should prefer idempotent success replay over a second mutation or misleading failure
- the user should receive the current successful state when possible

### Journey-rule errors

Examples:

- request is not allowed in the current stage
- recommendation requested before eligibility truth is met
- wrong resource triggered in the wrong stage

Behavior:

- do not advance
- explain the correct current step
- attach only the actually allowed resources

### Stale widget conflicts

Examples:

- the user clicks an old recommendation card after a newer recommendation replaced it
- the user resubmits a questionnaire card that was already accepted
- the user tries to book a consult from an outdated booking resource

Behavior:

- reject the stale resource action in a structured way
- return the current valid resource snapshot
- keep the journey on the CRM-truth-derived stage/phase
- explain the latest valid next step to the user

## Testing Strategy

### 1. Journey rule tests

Test:

- stage entry
- phase transitions
- skip rules
- handoff rules

### 2. Resource visibility tests

Test:

- which resources are available in each stage/phase
- default global availability of query resources
- resource-specific restrictions

### 3. Conversation orchestration tests

Test:

- FAQ does not change stage
- status questions do not change stage
- refusal to fill forms does not automatically force questionnaire if only process explanation is allowed
- recommendation pressure is handled according to journey rules

### 4. Live multi-turn session smoke tests

Test complete flows such as:

- general inquiry -> process explanation -> input collection
- refusal to fill forms -> continue with explanation and FAQ
- submit questionnaire -> ask whether it was received
- recommendation -> confirmation -> consult
- human escalation from any stage

## Migration Direction

This design intentionally moves responsibility out of prompt logic and into CRM.

Implementation should aim to:

1. make CRM the only progression engine
2. reduce Dify to classification + language generation
3. introduce a formal resource registry
4. standardize widget updates through resource actions
5. remove frontend flow heuristics

The system should converge on:

- simple journey truth
- flexible resource expansion
- consistent multi-turn behavior

## Out of Scope

This spec does not define:

- the exact database schema migration plan
- the exact HTTP endpoint naming
- the exact Dify prompt wording
- visual design of the frontend widgets

Those belong to the implementation plan.

## Summary

The target system is:

- a CRM-owned journey engine
- a resource registry for all chat widgets and queryable statuses
- a Dify language layer operating inside CRM constraints
- a frontend that renders resources instead of inferring workflow

This design keeps the journey simple:

- `stage + phase` for progression

and keeps the UI flexible:

- resource registration for both progression and lookup interactions

That combination is the intended long-term architecture.
