# Chatbot V2 State Model Amendment Implementation

Date: 2026-04-12

## Goal

Apply the revised `chatbot-v2` state model so that:

- `journeySnapshot` is the only primary journey state
- `JourneyTruth` is reduced to minimal business facts
- raw events do not directly drive stage transitions
- orchestrator decisions become the only path for journey advancement

This amendment should be applied incrementally on top of the existing `chatbot-v2` implementation.

## Scope

This amendment affects:

- `packages/application/src/services/chatbot-v2/types.ts`
- `packages/application/src/services/chatbot-v2/journey-engine.service.ts`
- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
- `apps/api/src/routes/chatbot-v2-context.ts`
- related tests
- relevant docs

It does not require a frontend redesign before backend alignment.

## Core Implementation Changes

### 1. Remove truth-derived snapshot reconstruction

- remove `deriveSnapshot()` from `JourneyEngineService`
- remove call sites that rebuild the live journey snapshot from truth
- keep current snapshot coming from stored `journeySnapshot` / floor / current turn state instead

### 2. Shrink `JourneyTruth`

Reduce `JourneyTruth` to:

- `medicalInputsSubmitted`
- `recommendationConfirmed`
- `onlineConsultSubmitted`

During migration, compatibility readers may still accept the old shape temporarily, but the orchestrator should stop depending on the removed fields.

### 3. Replace raw transition events with orchestrator transition decisions

Refactor `advanceSnapshot()` so it accepts decisions like:

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

It should no longer accept raw business or user events.

### 4. Move all progression judgment into the orchestrator

The orchestrator should decide:

- whether to stay in the same snapshot
- whether to advance
- which transition decision to emit

The orchestrator should use:

- current `journeySnapshot`
- minimal `JourneyTruth`
- classifier output
- resource visibility
- recent messages / summary

### 5. Keep FAQ and process explanation non-destructive

FAQ and process explanation turns should:

- usually keep the same `journeySnapshot`
- optionally attach progression follow-up
- never rewind the journey

## Suggested Implementation Sequence

### Chunk A: Types and docs

- update `JourneyTruth`
- replace raw transition-event types with transition-decision types
- update architecture notes and internal docs

### Chunk B: Journey engine simplification

- remove `deriveSnapshot()` from active use
- keep only `advanceSnapshot(current, decision)`
- update tests to reflect the new responsibility boundary

### Chunk C: Orchestrator ownership

- move all stage progression logic into `ConversationOrchestratorService`
- make the orchestrator emit transition decisions
- ensure FAQ / process explanation / status-question flows preserve current stage

### Chunk D: Context builder and persistence cleanup

- stop rebuilding current journey from truth
- read current journey from persisted snapshot / floor / current turn context
- use truth only for receipt / confirmation answers

### Chunk E: Regression coverage

Add or update tests for:

- FAQ inserted repeatedly during `ONLINE_CONSULT.pre`
- progression request from `EXPLAIN_PROCESS.active`
- progression request from `COLLECT_MEDICAL_INPUTS.post`
- recommendation confirmation moving to `RECOMMENDATION.post`
- online consult submission moving to `ONLINE_CONSULT.post`
- no rewind after later-stage process explanation

## Risks

### Risk 1: temporary dual-model confusion

Until the old truth-derived assumptions are removed from all call sites, the system may have mixed semantics.

Mitigation:

- update tests first
- remove `deriveSnapshot()` usage early
- keep migration localized to `chatbot-v2` surfaces

### Risk 2: persisted journey snapshots may lag behind truth

Once truth no longer reconstructs stage, stale snapshots become more visible.

Mitigation:

- ensure orchestrator updates snapshot intentionally
- treat resource submissions and confirmations as explicit transition opportunities

### Risk 3: overly aggressive transition decisions

If orchestrator rules are too eager, the journey may advance on turns that should remain explanatory.

Mitigation:

- strengthen tests for FAQ / process explanation persistence
- require explicit progression intent or explicit qualifying resource request for advancement

## Expected Outcome

After this amendment:

- `journeySnapshot` behaves like a stable conversational waypoint
- minimal truth still answers receipt / confirmation questions
- FAQ turns no longer fight with stage inference
- stage progression becomes easier to reason about and test

