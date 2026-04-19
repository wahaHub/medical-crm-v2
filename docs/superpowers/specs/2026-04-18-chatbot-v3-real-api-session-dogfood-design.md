# Chatbot V3 Real API Session Dogfood Design

## Purpose

Design a repeatable, real-deployment API dogfood workflow for `chatbot-v3` that exercises patient-gated chat sessions end to end without browser E2E. The focus is to validate real session access, multi-turn journey behavior, response quality, and continuity on the deployed CRM v2 branch.

This spec is for testing and diagnostic coverage only. It does not change chatbot product behavior.

## Goal

Create a small real-environment session dogfood runner that:
- acquires or verifies a patient session through the real patient-side API flow
- validates that chat is blocked when patient prerequisites are not satisfied
- validates that chat is allowed once the patient prerequisites are satisfied
- runs scripted multi-turn `chatbot-v3` conversations against the deployed API
- records both high-level judgments and raw request/response transcripts for later debugging

## Non-Goals

This spec does not include:
- browser E2E or UI automation
- visual testing
- load or performance benchmarking
- changing chatbot runtime contracts
- replacing the existing repo-local mounted/session tests

## Current Context

The current codebase already has:
- strong local mounted/session regression coverage for `chatbot-v3`
- a patient-side route surface with public, auth, and protected endpoints
- `chatbot-v3` access rules that depend on patient/session state and site-aware cookies
- supervisor intake seed facts read from persisted patient/profile state rather than a large facts bundle

The gap is that we do not yet have a clean, repeatable, real-deployment API dogfood workflow that proves the deployed environment behaves correctly under patient-gated session conditions.

## Scope

This work covers one bounded subsystem: real-environment API dogfood for patient-gated `chatbot-v3` sessions.

It includes:
- real API bootstrap for a chat-capable patient session
- real API chat scripts over deployed `chatbot-v3`
- gate-path validation
- allowed-path multi-turn journey validation
- transcript and report generation
- a bug backlog artifact for failures

It excludes:
- browser orchestration
- admin workflows
- unrelated CRM domains outside what is needed to establish patient-chat eligibility

## Users

Primary users are:
- developers debugging deployed chatbot behavior
- reviewers validating whether a redeployed branch is safe enough for deeper dogfood
- product/ops collaborators who need a readable session report rather than raw console output alone

## Design Principles

1. Use the real deployed API, not in-process mocks.
2. Treat patient prerequisite completion as a hard gate.
3. Keep the workflow API-level only; no browser automation.
4. Prefer scripted, repeatable sessions over ad hoc manual requests.
5. Preserve enough raw evidence to debug failures later.
6. Separate “blocked correctly” from “allowed but semantically wrong”.
7. Keep the runner small and diagnostic, not a second test framework.

## Recommended Approach

### Option A: Pure manual cURL/Postman dogfood

Pros:
- fastest to start
- very close to how a human inspects responses

Cons:
- weak repeatability
- hard to compare runs
- high risk of missing cookies/session continuity details
- weak artifact generation

### Option B: Scripted real API session dogfood runner

Pros:
- repeatable
- captures cookies/session continuity correctly
- easy to add more sessions over time
- naturally produces raw transcripts and summarized judgments

Cons:
- requires a small amount of runner design
- needs explicit fixture/session scenario definitions

### Option C: Expand local regression only

Pros:
- fastest code-level feedback
- easy CI integration

Cons:
- does not answer whether the deployed environment is behaving correctly
- misses deployment/configuration issues

### Recommendation

Choose **Option B**.

It gives the best balance for the current need: real deployment validation without browser E2E. It also lets us dogfood repeatedly after future redeploys and directly compare blocked-vs-allowed patient gating behavior.

## High-Level Architecture

The system has four units.

### 1. Session Bootstrap Unit

Responsibility:
- obtain the right cookies, identifiers, and patient/session state needed before chat begins
- explicitly support both blocked and allowed prerequisite scenarios

Inputs:
- target base URL
- site identifier
- scenario bootstrap instructions

Outputs:
- bootstrap result with cookies, session identifiers, and a classification:
  - `blocked_expected`
  - `chat_allowed`
  - `bootstrap_failed`

Boundary:
- only handles patient-side prerequisite/session acquisition
- does not perform multi-turn chat assertions

### 2. Chat Session Runner Unit

Responsibility:
- execute multi-turn `chatbot-v3` sessions against the deployed API using the bootstrap result
- preserve cookie continuity and per-session state

Inputs:
- base URL
- site
- session bootstrap result
- scripted turn sequence

Outputs:
- ordered turn results with:
  - request payload
  - response status
  - response body
  - response headers of interest
  - parsed journey summary when available

Boundary:
- does not decide pass/fail by itself
- only executes and records

### 3. Session Evaluator Unit

Responsibility:
- judge each scripted session against expected behavior

Evaluation dimensions:
- access correctness
- journey correctness
- response correctness
- continuity correctness

Output classification:
- `PASS`
- `SOFT_FAIL`
- `HARD_FAIL`

Boundary:
- pure evaluation logic over captured transcripts
- no network access

### 4. Reporting Unit

Responsibility:
- generate human-readable artifacts from the evaluated runs

Outputs:
- summary session report
- raw transcript artifact
- bug backlog artifact

Boundary:
- presentation only
- must not hide raw evidence

## Session Matrix

The first version should cover three groups.

### V1 Scope Table

| Scenario | Group | V1 Status | Why |
|----------|-------|-----------|-----|
| `blocked_without_prereq` | Gate | Required | Proves backend gate still rejects chat before patient chat eligibility exists. |
| `allowed_after_patient_session` | Gate | Required | Proves we can bootstrap a real patient-linked chat-capable session. |
| `intake_to_triage_opening` | Core journey | Required | Validates the first real allowed chat response. |
| `triage_to_recommendation` | Core journey | Required | Validates the main medical collection to recommendation path. |
| `recommendation_selected_to_consult` | Core journey | Required | Validates the main post-recommendation next-step path. |
| `faq_detour_no_progression` | Dirty path | Required | Validates that FAQ/resource turns do not silently advance the journey. |
| `handoff_denied_returns_to_current_step` | Dirty path | Required | Validates denied escalation recovery. |
| `recommendation_to_explain` | Core journey | Deferred | Valuable, but not required for the first deployed dogfood pass. |
| `direct_human_request_to_handoff` | Core journey | Deferred | Valuable after basic session bootstrap and consult continuity are proven. |
| `recommendation_revisit_compare` | Dirty path | Deferred | Useful second-wave semantic coverage. |
| `repeat_explain` | Dirty path | Deferred | Useful second-wave continuity coverage. |
| `degraded_then_retry` | Dirty path | Deferred | Useful after we have baseline failure evidence from real runs. |

### Group 1: Gate Sessions

#### `blocked_without_prereq`
Purpose:
- prove chat is rejected when the patient prerequisite is not yet satisfied

Expected result:
- request is blocked in the correct way
- no misleading journey progression is returned

#### `allowed_after_patient_session`
Purpose:
- prove a patient who satisfies the prerequisite can enter chat successfully

Expected result:
- bootstrap produces a valid patient/session context
- first chat turn is accepted

### Group 2: Core Journey Sessions

#### `intake_to_triage_opening`
Purpose:
- verify the opening response after allowed entry matches the intended supervisor-led opening behavior

#### `triage_to_recommendation`
Purpose:
- verify the main clinical collection path can reach recommendation over real API turns

#### `recommendation_to_explain`
Purpose:
- verify the process explanation path still behaves correctly once recommendation exists

#### `recommendation_selected_to_consult`
Purpose:
- verify the recommended-next-step flow reaches consult correctly

#### `direct_human_request_to_handoff`
Purpose:
- verify a direct human escalation request behaves correctly once prerequisites are satisfied

### Group 3: Dirty Path Sessions

#### `faq_detour_no_progression`
Purpose:
- verify FAQ/resource turns do not auto-advance the main journey

#### `recommendation_revisit_compare`
Purpose:
- verify recommendation compare/explain loops remain stable across turns

#### `repeat_explain`
Purpose:
- verify repeated process explanation does not corrupt persisted continuity

#### `degraded_then_retry`
Purpose:
- verify a degraded turn can be followed by a later successful retry without poisoning the session

#### `handoff_denied_returns_to_current_step`
Purpose:
- verify denied human escalation returns the user to the correct active step

## Access Model Assumptions

1. The frontend already enforces that users reach chat only after basic profile intake is done.
2. The dogfood runner should still explicitly test the blocked case, because the backend gate must remain correct.
3. The dogfood runner should not assume anonymous chat as the primary valid path.
4. The dogfood runner should treat patient-linked session establishment as the normal allowed path.

## Concrete Bootstrap Contract

The first implementation should anchor bootstrap to currently shipped patient endpoints instead of an abstract prerequisite concept.

### Allowed Path Bootstrap

Primary endpoint:
- `POST /api/patient/onboarding/init`

Required request characteristics:
- valid `x-medora-site` header
- onboarding payload accepted by the deployed API
- valid captcha token only if the deployed environment actually enforces it

Allowed-path success evidence:
- HTTP `200`
- response contains `widgetChatTarget.sessionId`
- response sets `patient_session` cookie
- response sets `patient_restore` cookie
- `widgetChatTarget.kind` is `CHATBOT_SESSION`

The runner should treat this as the canonical proof that the patient is chat-eligible for the first version.

### Optional Auth Restore Bootstrap

If a real environment requires restoring or reusing a patient auth session instead of onboarding every time, the runner may also support:
- `POST /api/patient/session/restore`
- `POST /api/patient/verify-token`
- `POST /api/patient/login`

These are secondary bootstrap strategies. The implementation plan should choose one primary path for v1 and only add fallback bootstrap modes if they are necessary for stable runs.

### Blocked Path Definition

For v1, a blocked session is any case where chat is attempted without the allowed-path evidence above.

Blocked-path success evidence must be defined explicitly per scenario and can include one of:
- no `patient_session` cookie exists
- no `widgetChatTarget.sessionId` exists
- chat endpoint rejects access with the expected class of denial

The implementation plan must pin the exact blocked-session setup used in v1 so the runner is not guessing between multiple pre-chat states.

## Data Flow

### Blocked Path

1. Attempt to bootstrap or call chat in a scenario where prerequisites are intentionally incomplete.
2. Capture the response.
3. Evaluate whether the API blocked access correctly.
4. Write a blocked-session record into the report.

### Allowed Path

1. Bootstrap a patient-linked session through the real patient API.
2. Carry forward returned cookies and identifiers.
3. Send scripted chat turns to `/api/v3/chatbot/chat`.
4. Capture each turn’s status, body, and relevant headers.
5. Evaluate session correctness after the full script completes.
6. Write report and raw transcript artifacts.

## Evaluation Rules

Each session must be judged on four axes.

### 1. Access Correctness

Questions:
- Was chat blocked when it should have been?
- Was chat allowed when it should have been?
- Was the failure mode correct and understandable?

### 2. Journey Correctness

Questions:
- Did returned `stage` and `phase` match the turn semantics?
- Did the session avoid accidental progression on FAQ/resource detours?
- Did revisit/repeat paths remain canonical?

### 3. Response Correctness

Questions:
- Does the text sound like the correct stage?
- Do returned cards match the stage and message?
- Are recommendation / process / consult / handoff responses semantically aligned?

### 4. Continuity Correctness

Questions:
- Do later turns reflect the earlier turns correctly?
- Are session cookies preserved correctly?
- Do retry/revisit/denied paths avoid corrupting the conversation state?

## Result Levels

### PASS

The session satisfies the access, journey, response, and continuity expectations well enough to be considered healthy.

### SOFT_FAIL

The session technically works, but one or more semantic expectations are off.

Examples:
- odd but not fatal stage wording
- a card set that is usable but not ideal
- slightly inconsistent progression phrasing with otherwise correct continuity

### HARD_FAIL

The session is materially broken.

Examples:
- incorrect access decision
- broken cookie/session continuity
- obviously wrong stage jump
- missing critical response content
- handoff/consult/recommendation path collapsing into the wrong branch

## Artifacts

### 1. Session Report

Human-readable summary for each session including:
- scenario name
- preconditions
- turn sequence summary
- final judgment
- short explanation of failures

### 2. Raw Transcript Artifact

Structured record containing, per turn:
- request URL
- request payload
- selected request headers/cookies
- response status
- response body
- selected response headers
- parsed journey fields when present

### 3. Bug Backlog Artifact

One entry per discovered issue with:
- scenario name
- failure level
- reproduction summary
- affected behavior
- likely root-cause direction
- recommended priority

## Artifact Conventions

The first implementation should write artifacts to a deterministic folder under the repo, with one folder per run.

Recommended layout:
- `artifacts/chatbot-v3-real-api-dogfood/<timestamp>/report.md`
- `artifacts/chatbot-v3-real-api-dogfood/<timestamp>/transcripts.json`
- `artifacts/chatbot-v3-real-api-dogfood/<timestamp>/bug-backlog.md`
- `artifacts/chatbot-v3-real-api-dogfood/<timestamp>/run-metadata.json`

Minimum metadata to store:
- base URL
- site
- run timestamp
- git commit when available
- scenario list executed

Redaction rules:
- redact `patient_session`, `patient_restore`, and `chatbot_session_secret` values in human-readable outputs
- in raw transcript artifacts, either fully redact them or keep only a short prefix plus a redaction marker
- never log full bearer-like credentials or reusable restore tokens into `report.md` or `bug-backlog.md`

## Error Handling

### Bootstrap failures

If patient bootstrap fails before chat starts:
- classify separately from chat-session failures
- record exact failing endpoint and response
- do not fake a chat session from partial state

### Auth expiry and access drift

If a run hits `401` or `403` after bootstrap:
- record whether the failure happened during bootstrap or chat
- preserve the relevant cookies and redacted auth headers in the raw artifact
- classify as `HARD_FAIL` unless the scenario explicitly expects denial

### Timeouts and transport failures

If a request times out, connection fails, TLS fails, or DNS/transport breaks:
- classify as infrastructure-visible evidence, not semantic pass/fail ambiguity
- preserve endpoint, timeout threshold, and network error details
- mark the scenario `HARD_FAIL` for that run

### Rate limiting

If an endpoint returns `429`:
- record the endpoint and retry headers if present
- stop treating later turns as semantically meaningful for that session
- classify as `HARD_FAIL` for deployment dogfood, because the run is no longer evaluating the intended chat behavior

### Unexpected non-JSON responses

If an endpoint returns unexpected content:
- preserve the raw body as text
- mark the turn as evaluator-visible evidence
- do not drop the transcript

### Partial session failures

If one turn fails mid-session:
- preserve the successful earlier turns
- mark the session outcome based on the first hard failure
- continue only if the scenario explicitly tests retry-after-failure behavior

## Security And Safety Constraints

1. Do not log secrets beyond what is necessary for debugging continuity.
2. Redact sensitive cookies in the human-readable report.
3. Raw artifact storage should still minimize exposure of reusable credentials.
4. Do not write a runner that mutates unrelated patient/admin state outside the tested bootstrap and chat flow.

## Testing Strategy

### Before real deployment runs

We should have a tiny local sanity check layer for:
- cookie jar behavior
- transcript serialization
- evaluator classification rules

### Real deployment validation

The main validation is the scripted dogfood run itself against the deployed API.

Minimum first-pass execution:
- 1 blocked gate session
- 1 allowed entry session
- 3 core journey sessions
- 2 dirty path sessions

## Open Questions Intentionally Deferred

These are intentionally out of scope for the first version and should not block planning:
- broad load/performance coverage
- browser UI behavior
- admin/operator tooling around the dogfood reports
- turning the dogfood runner into CI by default

## Success Criteria

This design is successful when we can:
- prove the backend blocks chat without patient prerequisite completion
- prove the backend allows chat after patient session establishment
- run scripted multi-turn real API sessions against deployed `chatbot-v3`
- classify each run as `PASS`, `SOFT_FAIL`, or `HARD_FAIL`
- produce readable reports plus raw transcripts for debugging
- turn discovered production-like failures into concrete follow-up fixes or regression tests

## Implementation Notes For Planning

The implementation plan should prefer a small, composable structure:
- one bootstrap module
- one chat runner module
- one evaluator module
- one reporting module
- one scenario matrix source

The plan should also explicitly decide:
- where the real-environment configuration lives
- where artifacts are written
- how sensitive headers/cookies are redacted
- whether blocked and allowed scenarios share a common bootstrap abstraction or use two explicit paths
