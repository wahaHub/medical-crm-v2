# Chatbot V2 State Model Amendment

Date: 2026-04-12

## Purpose

This amendment updates the chat journey architecture after the first `chatbot-v2` implementation pass.

The earlier design still left too much room for confusion between:

- journey position
- business facts
- temporary conversational transitions

The revised model simplifies that boundary.

## Decision Summary

### 1. `journeySnapshot` becomes the primary state

The chat system should treat the following as the primary state:

- `currentStage`
- `currentPhase`

This snapshot is the main source of truth for where the conversation is in the guided journey.

The backend should stop trying to reconstruct the real journey from a small set of business facts.

### 2. Remove `deriveSnapshot(truth)` from the core design

The prior model allowed a function like:

- `deriveSnapshot(truth)`

That function is now removed from the intended design.

Reason:

- a few coarse truth fields cannot reliably reconstruct the true live journey position
- the user may already be in a later stage even though only earlier business facts are persisted
- using truth to back-infer stage encourages incorrect rewinds and overconfident assumptions

If a bootstrap fallback is ever still needed during migration, it should be treated as temporary compatibility logic, not as the long-term model.

### 3. Keep only minimal business facts

Business truth should be reduced to facts that answer receipt / confirmation questions and support downstream constraints.

The minimal truth model is:

- `medicalInputsSubmitted`
- `recommendationConfirmed`
- `onlineConsultSubmitted`

These are not the primary journey state. They are supporting business facts.

### 4. Do not add explanation-state truth

Do not add truth fields such as:

- process explanation shown
- pre explanation consumed
- post acknowledgement consumed

These are not stable business facts.

They should be handled through:

- `journeySnapshot`
- recent message history
- orchestrator decisions

### 5. Events do not directly map to stage transitions

Raw events are inputs into orchestration, not direct stage commands.

Examples:

- a resource submit event may change truth
- a user progression request may suggest moving forward
- a user FAQ question may keep the same stage

The system must not assume:

- `event -> stage transition`

Instead:

- classifier + journey snapshot + truth + context -> orchestrator decision

and then:

- orchestrator decision -> snapshot transition

## Revised State Model

### Primary state

```ts
type JourneySnapshot = {
  currentStage:
    | 'EXPLAIN_PROCESS'
    | 'COLLECT_MEDICAL_INPUTS'
    | 'RECOMMENDATION'
    | 'ONLINE_CONSULT'
    | 'HUMAN_HANDOFF';
  currentPhase:
    | 'active'
    | 'pre'
    | 'post';
};
```

### Supporting business truth

```ts
type JourneyTruth = {
  medicalInputsSubmitted: boolean;
  recommendationConfirmed: boolean;
  onlineConsultSubmitted: boolean;
};
```

This truth model intentionally does not attempt to encode full stage position.

## Revised Event Model

Events are only observation inputs.

### User-language events

- `USER_ASK_FAQ`
- `USER_ASK_PROCESS_EXPLANATION`
- `USER_REQUEST_PROGRESSION`
- `USER_REQUEST_RESOURCE`
- `USER_ASK_RESOURCE_STATUS`
- `USER_REQUEST_HUMAN_HELP`

### Resource interaction events

- `RESOURCE_OPENED`
- `RESOURCE_SUBMITTED`
- `RESOURCE_REFRESHED`
- `RESOURCE_DISMISSED`

### Business-fact change events

- `MEDICAL_INPUTS_SUBMITTED`
- `RECOMMENDATION_CONFIRMED`
- `ONLINE_CONSULT_SUBMITTED`

These events are not themselves stage transitions.

## Revised Orchestration Model

The orchestrator should decide, per turn:

- whether the journey stays where it is
- whether the journey advances
- whether the response is FAQ / process explanation / resource-driven / status-driven
- whether progression follow-up is appropriate
- which resources are allowed for the turn

The orchestrator uses:

- current `journeySnapshot`
- minimal `truth`
- classifier output
- allowed resources
- recent messages
- conversation summary

It then produces a structured transition decision.

## Transition Decisions

Instead of advancing directly from raw events, the system should advance from an orchestrator-owned transition decision.

Examples:

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

`advanceSnapshot()` should consume these transition decisions, not raw user/resource/business events.

## Why This Model Is Better

It supports the intended conversational behavior:

- the journey can remain at `ONLINE_CONSULT.pre` across many FAQ turns
- FAQ answers can end with a gentle progression reminder without changing stages
- resource submission and confirmation questions are answered from business truth, not from guessed stage inference
- the system avoids rewinding because it no longer pretends truth can fully reconstruct journey state

## Migration Consequences

This amendment changes the implementation direction in three important ways:

1. remove `deriveSnapshot()` as a core mechanism
2. shrink truth to a small business-fact set
3. move all stage progression decisions into the orchestrator layer

This is a real architecture amendment, not a wording-only clarification.

