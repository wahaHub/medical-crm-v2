# Chatbot V3 Supervisor-Led Contract Design

Date: 2026-04-16
Status: Draft
Scope: Minimal supervisor-led contract for `chatbot-v3`
Audience: CRM chatbot maintainers and future v3 implementation owners

## 1. Goal

This document defines a cleaner minimal contract for `chatbot-v3` based on the latest product direction:

- `Supervisor` is the main agent
- the system proactively guides the user through the primary journey
- the user only needs to object if they do not want the proposed next step
- the system starts with minimal medical triage before true recommendation begins
- only a small set of agents are LLM-based

The purpose is to remove unnecessary complexity from the earlier v3 architecture and establish a smaller, cleaner operating model.

This document is the new canonical contract for `chatbot-v3`.

It intentionally supersedes the earlier 2026-04-15 v3 control-plane and journey-order documents where they conflict.

## 2. High-Level Architecture

### 2.1 Main roles

- `Supervisor`
  - the main LLM agent
  - decides what should happen next
  - chooses which subagent should act
  - prepares the task for that subagent

- `JourneyRuntimeAuthority`
  - validates whether the Supervisor's proposed next step is allowed
  - may allow or deny the proposed action
  - is the final writer of authoritative journey state
  - is the final authority for whether dispatch actually happens

`JourneyRuntimeAuthority` is the single final writer for journey state and final dispatch-or-deny decisions.

- Subagents
  - complete bounded domain work
  - update domain-specific truth flags or status
  - do not own global journey progression

### 2.2 LLM agents

The minimal LLM agent set is:

- `Supervisor`
- `FaqAgent`
- `RecommendationAgent`
- `RecordsAgent`

### 2.3 Deterministic agents

The deterministic agent set remains:

- `ConsultAgent`
- `HandoffAgent`

## 3. Primary Journey Order

The primary journey order is:

1. `COLLECT_MINIMAL_MEDICAL_FACTS`
2. `RECOMMENDATION`
3. `EXPLAIN_PROCESS`
4. `COLLECT_MEDICAL_INPUTS`
5. `ONLINE_CONSULT`
6. `HUMAN_HANDOFF`

This order is the main default progression path.

This is a new intentional order, not an accidental carry-over from the earlier v3 design.

In this newer contract:

- minimal medical triage must happen first
- true recommendation happens before default process explanation
- process explanation remains available later and is normally shown once

## 4. Journey Rules

### 4.1 Default progression

The `Supervisor` should actively guide the user to the next useful primary journey step.

If the user does not object, the system should present the next recommended primary journey step.

This default progression rule applies only to the primary journey.

It does not apply to FAQ-only or resource-only turns.

### 4.2 Stage behavior

`COLLECT_MINIMAL_MEDICAL_FACTS`

- this stage is mandatory
- it must complete before true hospital recommendation begins
- it is handled by `RecordsAgent`

`RECOMMENDATION`

- this stage must generate real recommendation results
- this stage may repeat
- this stage may be revisited from later stages when the user wants refreshed or different recommendations

`EXPLAIN_PROCESS`

- this stage is normally shown once
- it may be shown again only when the user explicitly requests another explanation
- process explanation can be handled through `FaqAgent`
- the truth flag `process.explained` should only be written when the explicit process-explanation path is actually shown

`COLLECT_MEDICAL_INPUTS`

- this stage may repeat
- it is used to collect only the medical information needed to make `ONLINE_CONSULT` possible
- it does not require collecting everything

`ONLINE_CONSULT`

- this is a required stage
- it must be completed before the journey can be treated as complete

`HUMAN_HANDOFF`

- this is the escalation stage

### 4.3 Re-entry and repetition

- `RECOMMENDATION` may repeat and may be revisited later
- `EXPLAIN_PROCESS` is normally single-show
- `COLLECT_MEDICAL_INPUTS` may continue across multiple turns until the necessary input level is reached
- `ONLINE_CONSULT` is not an optional completed stage

## 5. Minimal Medical Triage

The journey must begin with minimal medical triage.

Minimal medical triage means collecting the 3 most important medical questions for the current condition.

`RecordsAgent` is responsible for:

- generating those 3 questions
- asking them
- deciding whether the answers are sufficient
- continuing to ask again if the answers are incomplete, unclear, or insufficient

The `Supervisor` does not need to know the internal detail of those 3 questions.

The `Supervisor` only needs to know whether minimal medical triage is complete.

## 6. Pre-Chat Intake Contract

Before formal chat begins, the frontend already collects a small intake form.

The minimal intake seed is:

- `condition`
- `targetDestination`
- `language`
- `gender`

These values become stable session seed facts.

## 7. Supervisor Context Contract

The `Supervisor` should not receive a large facts bundle on every turn.

Instead, it should receive only:

- `currentStage`
- `conversationSummary`
- `latestUserMessage`
- pre-chat intake seed facts

If more state is needed, the `Supervisor` should decide whether to fetch it through domain-specific read queries.

Recommended read domains:

- `records.status`
- `recommendation.status`
- `consult.status`
- `handoff.status`

The `Supervisor` should prefer one domain query when possible and only use a second domain query when truly needed.

### 7.1 Conversation summary contract

`conversationSummary` is a compact runtime-owned summary provided to the `Supervisor`.

Minimal contract:

- producer/owner: the chat runtime layer
- refresh trigger: recomputed every turn after the final assistant response is produced
- maximum size: short enough to stay compact for prompt use; do not turn it into a hidden large context bundle
- freshness goal: reflect the most recent committed turn state
- persistence: may be persisted with the session or deterministically recomputed by runtime, but the implementation must choose one clear owner and keep it stable

The purpose of `conversationSummary` is to preserve minimal history awareness without replacing a large facts bundle with a large summary blob.

## 8. Minimal Supervisor-Visible Facts

The `Supervisor` should only rely on a small set of truth flags and intake facts.

Minimum visible facts:

```json
{
  "intake.condition": "lung cancer",
  "intake.target_destination": "Shanghai",
  "intake.language": "en",
  "intake.gender": "female",
  "records.minimal_triage.complete": false,
  "process.explained": false,
  "recommendation.generated": false,
  "recommendation.selected": false,
  "consult.completed": false,
  "handoff.active": false
}
```

This is intentionally small.

Internal domain detail can remain inside the corresponding agent domain and does not need to be exposed to the `Supervisor` by default.

### 8.1 Persistence Contract For Canonical Truth Flags

The minimal visible facts above are not prompt-only fields.

They must map to persisted runtime-readable session truth, with one clear owner for write decisions.

Required contract:

- source of truth: runtime/session persistence layer
- final write authority: `JourneyRuntimeAuthority` (or an authority-owned write path it controls)
- read contract: `Supervisor` and subagents read these flags through runtime/domain reads, not ad-hoc prompt memory
- replay contract: reloading a session must reproduce the same truth flags without requiring hidden prompt state

At minimum, implementation must persist and read:

- `records.minimal_triage.complete`
- `process.explained`
- `recommendation.generated`
- `recommendation.selected`
- `consult.completed`
- `handoff.active`

If implementation uses different storage key names, it must provide a stable one-to-one mapping to this canonical contract and keep that mapping explicit in code and tests.

## 9. Supervisor Output Contract

The `Supervisor` produces a structured suggestion with:

- `intent`
- `suggestedStage`
- `dispatchAgent`
- `reason`
- `task`

Minimal shape:

```json
{
  "intent": "progression",
  "suggestedStage": "RECOMMENDATION",
  "dispatchAgent": "RecommendationAgent",
  "reason": "minimal triage is complete and recommendation should begin",
  "task": {
    "goal": "Generate hospital recommendations for this user.",
    "latestUserMessage": "Okay, show me the recommendation.",
    "necessaryFacts": {
      "intake.condition": "lung cancer",
      "intake.target_destination": "Shanghai",
      "records.minimal_triage.complete": true
    }
  }
}
```

The `task` must remain minimal.

It should contain:

- one-sentence goal
- latest user message
- only the facts necessary for the chosen agent

## 10. Supervisor-Facing Agent Registry

The `Supervisor` should not see low-level tool or API details.

It should only see a small text registry that explains:

- when to use each agent
- how to write the task
- which facts should be sent

Each entry uses the same template:

```text
Agent: <name>
When to use: ...
Task style: ...
Send these facts: ...
```

### 10.1 FaqAgent

```text
Agent: FaqAgent
When to use: Use when the user is asking for factual information, process explanation, service clarification, or FAQ-style questions.
Task style: Ask it to answer or explain the user's question using FAQ knowledge only.
Send these facts: current stage, process explanation status, destination context, and hospital context if present.
```

### 10.2 RecommendationAgent

```text
Agent: RecommendationAgent
When to use: Use when the user wants hospital recommendations, wants recommendations refreshed, wants hospitals compared, or asks why a hospital is suitable.
Task style: Ask it to generate, refresh, compare, or explain hospital recommendations.
Send these facts: condition, destination, language, gender, minimal triage completion, recommendation progress, and any available records summary if relevant.
```

### 10.3 RecordsAgent

```text
Agent: RecordsAgent
When to use: Use when the system needs to complete minimal medical triage, collect missing medical input, process uploaded records, or determine whether medical input is sufficient for online consultation.
Task style: Ask it to ask the next most important required medical questions, interpret uploaded records, or evaluate collection completeness.
Send these facts: intake facts, minimal triage completion, record upload/save status, and collection progress relevant to online consultation readiness.
```

### 10.4 ConsultAgent

```text
Agent: ConsultAgent
When to use: Use when the user wants to arrange an online consultation or check consultation status.
Task style: Ask it to schedule consultation or check consultation progress.
Send these facts: recommendation completion, consultation progress, and selected hospital if available.
```

### 10.5 HandoffAgent

```text
Agent: HandoffAgent
When to use: Use when the user explicitly wants human support or when handoff has already been approved by policy.
Task style: Ask it to create or continue human handoff handling.
Send these facts: handoff status, handoff reason, and current journey context.
```

## 11. Runtime-Facing Allowlist

Low-level execution permissions should exist separately from the `Supervisor` registry.

This is a runtime-facing allowlist, not a prompt-facing one.

Its purpose is to enforce which tool domain each agent may use.

Minimal separation:

- `FaqAgent` -> FAQ domain only
- `RecommendationAgent` -> recommendation domain only
- `RecordsAgent` -> records domain only
- `ConsultAgent` -> consult domain only
- `HandoffAgent` -> handoff domain only

## 12. Agent Domain Truth Responsibilities

Agents should update only their own domain truth or status.

Examples:

- `FaqAgent`
  - may return process explanation content
  - does not itself own the write decision for `process.explained`

- `RecommendationAgent`
  - may update recommendation-domain truth such as recommendation generated or selected

- `RecordsAgent`
  - may update `records.minimal_triage.complete`
  - may update records-domain completeness status

- `ConsultAgent`
  - may update consult progress and completion

- `HandoffAgent`
  - may update handoff activity state

The `Supervisor` should consume these truth flags, not micromanage how they were produced.

The write of `process.explained` must stay tied to the explicit process-explanation path rather than generic FAQ handling.

Route-level heuristics must not become a second truth writer.

Any route bootstrap logic may prepare input context, but final allow/deny and authoritative truth writes must remain in the authority-owned path.

## 13. Prompt Style Guidance

Prompt text should prefer:

- clear role description
- explicit job-to-be-done
- explicit allowed context
- explicit output schema
- a small number of hard boundaries

Prompt text should avoid overloading each prompt with long lists of negative statements.

The preferred style is:

- `Your job is ...`
- `Use when ...`
- `Return ...`
- `Send these facts ...`

Rather than large blocks of:

- `do not ...`
- `cannot ...`

Negative constraints should still exist, but only for the most important hard boundaries.

## 14. Summary

This new contract simplifies v3 in four important ways:

1. `Supervisor` becomes the real main agent
2. the journey begins with mandatory minimal medical triage
3. the `Supervisor` no longer depends on a large default facts bundle
4. agent routing knowledge is separated from runtime tool permissions

This design keeps the system small while still supporting:

- proactive guided progression
- repeatable recommendation behavior
- once-only process explanation by default
- multi-turn medical collection
- required online consultation
- escalation to human support
