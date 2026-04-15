# Chatbot V3 Non-Prompt Testing Design

Date: 2026-04-15
Status: Draft for execution
Scope: Deployed `chatbot-v3` validation before prompt-heavy tuning
Audience: CRM chatbot maintainers, QA owners, runtime owners, frontend integrators

## 1. Goal

This document defines a system-level testing strategy for `chatbot-v3` that focuses on non-prompt failures first.

The goal is not to prove the chatbot is perfect. The goal is to reduce the chance of hidden runtime, state, auth, tool, and integration problems before the team starts using test results to tune prompts.

This testing design follows a "B" approach:

- structure the testing system like a long-lived regression framework
- implement it first as a deep release-acceptance workflow
- leave room to evolve it into a reusable ongoing test program

## 2. Why This Exists

Current `chatbot-v3` is already beyond paper design:

- `v3` public API route exists
- orchestrator, runtime, tool gateway, FAQ worker, response composer, and observability exist
- admin/hospital BFF proxy routes exist
- multiple unit and integration tests already exist

But the current test coverage is still stronger at code-level correctness than at deployed-system completeness.

In particular, the remaining risk is concentrated in:

- runtime authority and gating
- fact commit and replay
- dispatch/tool correctness
- session/cookie/auth behavior
- degraded/fallback behavior
- observability quality
- deployed OpenAI and env wiring
- real UI/BFF binding

Until those are validated, prompt tuning is too noisy because many apparent "prompt issues" are actually runtime or contract issues.

## 3. What Counts As Non-Prompt Testing

This testing plan intentionally prioritizes failures that are not primarily caused by prompt wording or LLM style.

Primary focus:

- orchestrator authority
- stage prerequisites and gating
- handoff precedence and denial behavior
- explicit fact writes and next-turn replay
- agent dispatch correctness
- tool allowlist and side-effect safety
- fallback and degraded paths
- idempotency and concurrency safety
- response composition correctness
- session/auth/cookie correctness
- observability and traceability
- live deployment/env correctness

Prompt quality is still observed, but it is not the main pass/fail axis for this document.

## 4. Success Criteria

This plan is successful when the team can say:

- the deployed v3 system is operationally understandable
- high-risk user journeys behave correctly
- facts and stage transitions are not silently corrupted
- side-effect tools do not fire when they should not
- degraded cases fail safely
- logs and debug signals are sufficient to root-cause failures

This plan does not promise zero bugs. It aims to make severe hidden bugs unlikely and diagnosable.

## 5. Test Layers

The testing system is divided into four layers.

### 5.1 Layer 1: Smoke

Purpose:

- answer quickly whether the deployment is alive and minimally wired correctly

Typical runtime:

- 5 to 10 minutes

What it must catch:

- broken deploy
- bad env
- dead proxy
- dead route
- missing runtime debug
- missing observability

### 5.2 Layer 2: Regression

Purpose:

- prove that the core v3 authority, state, dispatch, and fallback behavior has not regressed

What it must catch:

- broken orchestration
- broken fact writes
- wrong dispatch
- wrong tool behavior
- response composition regressions
- retry/idempotency regressions

This layer should be the long-term backbone of the test system.

### 5.3 Layer 3: Staging Acceptance

Purpose:

- validate the deployed v3 system in a production-like environment against real integrations

What it must catch:

- live OpenAI issues
- live env mismatch
- real DB/session replay issues
- BFF/cookie propagation issues
- deployment-only observability gaps

This is the most important release gate for the current phase.

### 5.4 Layer 4: Manual Exploratory

Purpose:

- catch UX and integration issues that are awkward to automate

What it must catch:

- confusing guidance
- strange stage/card combinations
- awkward deny/degraded copy
- long-conversation experience issues

This layer complements, but never replaces, the first three.

## 6. Evidence Model

Every important test case must collect evidence from multiple layers, not just the user-visible response.

Required evidence groups:

1. Request/response evidence
2. Session/status evidence before and after the turn
3. Runtime/debug evidence
4. Tool or external dependency evidence
5. UI/BFF evidence when applicable

Each case should be recorded using this template:

```text
Case ID:
Layer:
Goal:
Preconditions:
Request:
Expected user-visible result:
Expected runtime result:
Evidence collected:
Pass/Fail:
Notes / suspected root cause:
```

## 7. Required Evidence Per Case

### 7.1 Request/Response

- request body
- response body
- response status
- important headers:
  - `set-cookie`
  - idempotency headers
  - trace-related headers if present

### 7.2 State Evidence

- turn-before session/status snapshot
- turn-after session/status snapshot
- relevant facts such as:
  - `process.explained`
  - `records.saved`
  - `recommendation.picked`
  - `handoff.active`

### 7.3 Runtime Evidence

- `runtimeDebug`
- node events
- decision result
- dispatched agent
- `turnOutcome`

### 7.4 External Dependency Evidence

- OpenAI call presence or absence when expected
- tool result shape
- timeout/error codes
- API logs from Lightsail

### 7.5 UI/BFF Evidence

- screenshot or UI observation
- card rendering outcome
- cookie/session behavior across proxy route

## 8. Execution Order

The test program should run in waves, not as a flat list.

### 8.1 Wave 1: Deployment Smoke

Run all `S*` cases.

Rule:

- if any smoke case fails, stop and fix deploy/env/proxy/runtime boot issues first

### 8.2 Wave 2: Runtime Authority Regression

Run:

- `R-A*`
- `R-F*`
- `R-D*`
- `R-I*`

Rule:

- if this wave fails, do not begin prompt tuning
- these failures usually indicate runtime, state, or dispatch issues

### 8.3 Wave 3: Error and Composer Regression

Run:

- `R-E*`
- `R-C*`

Rule:

- if this wave fails, fix fallback/composer/runtime behavior before prompt tuning

### 8.4 Wave 4: Staging Acceptance

Run:

- `A-FQ*`
- `A-J*`
- `A-S*`
- `A-O*`

Rule:

- this is the main release-acceptance wave for the current phase

### 8.5 Wave 5: Manual Exploratory

Run:

- `M*`

Rule:

- manual findings may leave minor polish items open
- they must not leave state corruption, wrong stage progression, or broken action chains open

## 9. Decision Gate For Prompt Tuning

Prompt tuning should not become the main workstream until all three conditions are true:

1. Smoke is fully green
2. High-risk regression cases are effectively green
3. Staging failures are now mostly semantic/prompt quality issues rather than runtime/state/auth/tool issues

Examples of failures that should be fixed before prompt work:

- wrong stage progression
- wrong fact write timing
- wrong dispatch agent
- duplicate or unsafe side effects
- cookie/session instability
- broken fallback
- broken response composition
- insufficient logs/debug context

Examples of failures that are good prompt-tuning candidates:

- FAQ category selection is unstable
- FAQ answer style is stiff
- Supervisor intent classification is semantically weak
- handoff wording is too narrow
- process explanation wording feels unnatural

## 10. Case Matrix

### 10.1 Layer 1 Smoke

- `S1` API health returns 200
- `S2` `/api/v3/chatbot/chat` basic turn succeeds
- `S3` admin BFF proxy forwards to v3 API
- `S4` hospital BFF proxy forwards to v3 API
- `S5` new session bootstrap works
- `S6` existing session restore works
- `S7` non-production `runtimeDebug.traceId` visible
- `S8` node event appears in API logs
- `S9` FAQ env enabled path emits FAQ LLM metadata
- `S10` repeated `Idempotency-Key` does not duplicate turn

### 10.2 Layer 2 Regression: Authority and Journey

- `R-A1` direct recommendation request before explain stays gated and does not return a special missing-prerequisite card
- `R-A2` direct consult request before prerequisites stays gated and does not return a special missing-prerequisite card
- `R-A3` explain completed unlocks downstream progression
- `R-A4` records saved unlock recommendation
- `R-A5` recommendation picked unlocks consult
- `R-A6` semantic handoff suggestion denied by prerequisites
- `R-A7` hard handoff overrides normal progression
- `R-A8` gated `STAY` does not dispatch downstream agent
- `R-A9` journey remains stable on FAQ turn
- `R-A10` `STAY`, `ADVANCE`, `SKIP`, and `HANDOFF` each have at least one proving case

### 10.3 Layer 2 Regression: Fact Commit and Replay

- `R-F1` `process.explained` is written only after actual process response
- `R-F2` `process.explained` persists across next turn
- `R-F3` `records.saved` persists after save
- `R-F4` `recommendation.picked` persists after pick
- `R-F5` `handoff.active` prevents duplicate handoff
- `R-F6` restored session replays facts consistently
- `R-F7` failed or degraded turn does not incorrectly mutate facts

### 10.4 Layer 2 Regression: Dispatch and Tools

- `R-D1` FAQ question dispatches `FaqAgent`
- `R-D2` attachment-only turn dispatches `RecordsAgent.upload`
- `R-D3` collect-stage no-attachment turn uses records status path
- `R-D4` recommendation turn dispatches `recommendation.generate`
- `R-D5` consult turn dispatches consult path
- `R-D6` handoff turn dispatches `handoff.create`
- `R-D7` tool allowlist rejects invalid tool/action pairing
- `R-D8` denied downstream progression never triggers side-effect tool

### 10.5 Layer 2 Regression: Fallback and Error Handling

- `R-E1` FAQ LLM timeout falls back safely
- `R-E2` FAQ LLM non-JSON falls back safely
- `R-E3` FAQ schema drift triggers fallback metadata
- `R-E4` tool timeout yields degraded outcome without corrupting journey
- `R-E5` upstream unavailable yields degraded outcome
- `R-E6` unknown tool error yields degraded outcome
- `R-E7` fallback path still returns diagnosable node metadata

### 10.6 Layer 2 Regression: Composer and Contract

- `R-C1` grounded FAQ answer passthrough with citations
- `R-C2` low-confidence FAQ answer falls back to stage guidance
- `R-C3` no-citation FAQ answer falls back to stage guidance
- `R-C4` denied handoff returns prerequisite guidance
- `R-C5` degraded turn returns degraded-safe copy
- `R-C6` journey and cards remain aligned
- `R-C7` response contract excludes legacy v2 fields

### 10.7 Layer 2 Regression: Idempotency and Concurrency

- `R-I1` same idempotency key with same payload is replay-safe
- `R-I2` same idempotency key concurrent submissions coalesce safely
- `R-I3` rapid-fire different keys do not corrupt state
- `R-I4` two tabs on same session preserve authoritative state
- `R-I5` in-flight turn followed by next turn does not double-commit facts

### 10.8 Layer 3 Staging Acceptance: Live FAQ and OpenAI

- `A-FQ1` live FAQ hit with clear category
- `A-FQ2` live FAQ ambiguous query
- `A-FQ3` live FAQ no exact match
- `A-FQ4` live FAQ with hospital page context
- `A-FQ5` live FAQ timeout path
- `A-FQ6` live FAQ invalid model output path
- `A-FQ7` logs expose prompt/model/fallback metadata

### 10.9 Layer 3 Staging Acceptance: Full Journey

- `A-J1` explain -> collect -> recommend chain
- `A-J2` collect -> recommendation -> consult chain
- `A-J3` direct jump attempts are correctly denied
- `A-J4` recommendation pick affects later consult behavior
- `A-J5` handoff after deep journey works
- `A-J6` handoff denial returns correct guidance

### 10.10 Layer 3 Staging Acceptance: Auth, Session, and BFF

- `A-S1` anonymous/public session path works
- `A-S2` patient cookie restore path works
- `A-S3` wrong session secret is rejected
- `A-S4` missing session secret recovery behavior is correct
- `A-S5` admin proxy preserves cookies and `set-cookie`
- `A-S6` hospital proxy preserves cookies and `set-cookie`

### 10.11 Layer 3 Staging Acceptance: Observability

- `A-O1` every high-risk turn has `traceId`
- `A-O2` node event sequence is complete enough to diagnose and includes the concrete debug fields already required by v3 where applicable: `nodePromptVersion`, `nodeModel`, `fallbackUsed`, and `schemaValidationFailed`
- `A-O3` `turn_summary` matches actual decision
- `A-O4` FAQ LLM node metadata is visible when enabled, including prompt/model identity
- `A-O5` `fallbackUsed` and `schemaValidationFailed` semantics are trustworthy and missing observability fields are treated as blocking for live diagnosis
- `A-O6` one failed live case can be root-caused from logs alone

### 10.12 Layer 4 Manual Exploratory

- `M1` explain text feels natural and not robotic
- `M2` FAQ answer feels grounded rather than generic
- `M3` denied handoff feels polite, not blocking
- `M4` degraded messages are understandable
- `M5` cards visually match the current stage
- `M6` long conversation does not feel directionless

## 11. Execution Responsibilities

Even if one person performs multiple roles, responsibilities should stay conceptually separate.

### 11.1 System Validation Owner

Responsible for:

- smoke
- runtime regression
- state/fact verification
- API log and node-event capture
- live env and OpenAI verification

### 11.2 Frontend and Experience Owner

Responsible for:

- BFF route validation
- page-level validation
- card rendering checks
- manual exploratory cases

### 11.3 Failure Triage Owner

Responsible for assigning every failure to one primary bucket:

- `runtime-authority`
- `fact-commit`
- `dispatch/tool`
- `fallback/error-handling`
- `response-composer`
- `frontend/bff/session`
- `prompt/semantic`

The purpose is to stop prompt work from masking architecture or integration bugs.

## 12. Pass Criteria

This plan should be considered effectively green only if:

- all `S*` cases pass
- high-risk `R-A`, `R-F`, `R-D`, `R-E`, `R-C`, and `R-I` cases have no blockers
- at least one complete journey chain in staging passes end to end
- auth/session/observability staging checks have no blockers
- manual exploratory findings are limited to minor polish issues

It should not be considered "basically fine" if any of the following remain:

- facts are written at the wrong time
- journey advances incorrectly
- wrong agent/tool is dispatched
- side-effect tools fire when a turn should have stayed gated
- degraded cases mutate authoritative state incorrectly
- cookie/session behavior is unstable
- live failures cannot be root-caused from logs

## 13. Recommended Immediate Next Step

Run this test program in the following order:

1. all `S*`
2. `R-A*`, `R-F*`, `R-D*`, `R-I*`
3. `R-E*`, `R-C*`
4. `A-FQ*`, `A-J*`, `A-S*`, `A-O*`
5. `M*`

Only after the first four groups are operationally clean should prompt tuning become the primary optimization loop.
