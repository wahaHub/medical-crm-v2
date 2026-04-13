# Chatbot V2 Pure Resources Contract Design

Date: 2026-04-13

## Purpose

This spec removes the legacy `blocks` and `nextAction` UI contract from chatbot v2 and makes `resources` the single source of truth for assistant-driven UI.

The goal is to eliminate the current semantic split between:

- journey state
- resource availability
- legacy block rendering
- legacy next-action heuristics

After this change:

- CRM will expose a single UI contract: `journeySnapshot + resources`
- the China frontend will render assistant UI only from `resources`
- composer will only need to reason about journey state and resource availability
- legacy `blocks` and public `nextAction` will no longer interfere with live behavior

This is an intentional breaking change.

## Problem Statement

The current chatbot v2 stack still carries three parallel concepts for the same user-facing step:

- `resources`
- `blocks`
- `nextAction`

This creates recurring product and implementation problems:

- composer may correctly see that a resource is available, while the frontend still depends on block generation
- route-level compat logic may surface or suppress widgets independently of the CRM-owned resource set
- legacy starter and widget paths can bypass journey rules such as `EXPLAIN_PROCESS.pre`
- debugging becomes harder because UI behavior may be caused by any of three separate contracts

The system is currently harder to reason about than the intended architecture.

## Decision Summary

### 1. `resources` becomes the only public UI contract

For chatbot v2 assistant responses and history payloads, the frontend should render only from:

- `journeySnapshot`
- `resources`

The API should stop returning:

- `blocks`
- `nextAction`

### 2. Existing widgets are reused, but no longer block-driven

This change does not require rebuilding all patient-facing UI widgets.

Instead:

- existing questionnaire, upload, recommendation, consult, and handoff widgets may be reused
- widget selection should be driven by `resourceType`
- any old `block.type -> widget` mapping should be removed

The renderer should be:

- `resourceType -> resource renderer -> existing widget UI`

### 3. CRM remains the sole owner of journey state and allowed resources

CRM should continue to own:

- `journeySnapshot`
- `truthSummary`
- `stageCopy`
- resource availability

Composer should continue to compose language from CRM-owned context.

However, route-level compat logic should no longer translate composer output into legacy blocks for the frontend.

### 4. Public `nextAction` is removed from chatbot v2

`nextAction` is no longer part of the chatbot v2 UI contract.

It should not be used to:

- choose widgets
- decide which assistant affordance to render
- recover resource availability

As a migration detail, internal composer output may temporarily still include a `nextAction` field, but:

- route handlers must stop exposing it publicly
- frontend code must stop depending on it
- no UI rendering decision should be based on it

Once the rest of the stack is stable, internal composer schema can remove `nextAction` too.

## Target Contract

## Assistant Chat Response

The assistant response contract should be reduced to the data needed for:

- answer text
- citations / metadata
- journey display
- resource rendering

For chatbot v2, the frontend-relevant fields are:

- `answer`
- `journeySnapshot`
- `resources`
- supporting metadata that is not used for UI routing

The following should not be present in the public v2 contract:

- `blocks`
- `nextAction`

## Assistant History Response

Stored assistant history for v2 should expose the same contract:

- `content`
- `journeySnapshot`
- `resources`

History responses should stop replaying:

- stored `blocks`
- stored public `nextAction`

This keeps live messages and historical messages aligned.

## Frontend Rendering Contract

The China frontend should treat `resources` as the only assistant-affordance source.

Each assistant message should render:

- text answer
- optional `journeySnapshot`
- zero or more resources

The frontend should not inspect:

- `blocks`
- `nextAction`

for rendering, widget choice, or state progression.

This applies both to:

- top-level assistant response fields
- message metadata fallback paths

The frontend should stop recovering assistant affordances from legacy block copies in message metadata.

## Resource Rendering Model

The current `chat-v2/resources` layer is the correct long-term direction and should become the only rendering path.

Typical mappings are:

- `PROCESS_GUIDE`
- `QUESTIONNAIRE`
- `MEDICAL_DOC_UPLOAD`
- `HOSPITAL_RECOMMENDATION`
- `PACKAGE_RECOMMENDATION`
- `ONLINE_CONSULT_BOOKING`
- `HUMAN_HANDOFF`

Each resource renderer may continue to reuse existing widget UI where appropriate.

This is a contract change, not a visual redesign.

Where reused widgets require interaction handlers, the resource rendering layer must own that integration explicitly.

That means the resource renderer path must either:

- receive the necessary handlers as props
- or read them from the same patient entry context currently used by block-driven widgets

The old block-only handler wiring must not remain the only place where questionnaire, hospital selection, or consult actions can be triggered.

## CRM Responsibilities

After this change, CRM route handlers should:

- build v2 turn context
- call classifier / FAQ grounding / composer as needed
- persist CRM-owned assistant metadata
- return only `journeySnapshot + resources` as the public assistant affordance model

CRM route handlers should stop:

- calling legacy block builders for v2 responses
- exposing public `nextAction` for v2 responses
- using legacy block compat to compensate for missing resource rendering

If an affordance must appear for the user, it should appear as a resource.

## Composer Responsibilities

Composer should continue to answer from CRM-owned context.

This change simplifies composer semantics because:

- `allowedResources` now directly means "available and renderable in this turn"
- composer no longer needs to indirectly account for a separate block-surfacing layer
- wording about resource availability becomes easier to stabilize

Examples:

- if `QUESTIONNAIRE` appears in `allowedResources`, the assistant should answer as though questionnaire access is available now
- if `QUESTIONNAIRE` does not appear in `allowedResources`, the assistant should not claim it is available

Composer should not be asked to infer whether a separate legacy block has also been surfaced.

## Migration Strategy

This is a one-way breaking change for the public contract, but the internal rollout should still be staged carefully.

### Phase 1: Public contract cleanup

Implement the following together:

- API stops returning `blocks`
- API stops returning public `nextAction`
- frontend stops consuming `blocks`
- frontend stops consuming `nextAction`
- frontend renders only from `resources`

This phase delivers the main architectural cleanup.

### Phase 2: Internal cleanup

After Phase 1 is stable:

- remove block-builder code paths that are no longer used
- remove public-next-action normalization for v2
- simplify tests that only exist for compat behavior
- remove `nextAction` from composer output schema if no remaining internal consumer needs it

This keeps the risky breaking change separate from non-essential internal cleanup.

## Breaking Change Scope

This spec assumes we accept a temporary compatibility break in order to simplify the system.

That means:

- legacy chatbot consumers that still expect `blocks` must be migrated together
- frontend and API need to ship as one coordinated change
- there is no requirement to keep old block-driven rendering alive during rollout

This is intentional because the compatibility layer is now causing real product ambiguity.

## Expected Benefits

After the contract is pure-resource:

- assistant wording and visible UI should align more often
- `QUESTIONNAIRE` and similar resources will be easier to reason about
- `EXPLAIN_PROCESS.pre` and later journey gates will no longer be bypassed by legacy widget paths
- debugging will get simpler because assistant affordances come from one place only
- future stage copy, orchestrator, and composer work will have a cleaner surface area

## Non-Goals

This spec does not itself redesign:

- the phase lifecycle model
- FAQ overlay semantics
- consent gating
- stage copy quality

Those remain governed by the phase-lifecycle and journey-orchestration specs.

This spec only removes the legacy contract layers that interfere with those systems.
