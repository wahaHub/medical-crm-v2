# Chatbot V3 Live Session Testing Guide

Date: 2026-04-24
Status: Current working guide
Audience: Engineers or agents taking over `chatbot-v3` live validation work

## 1. Purpose

This document explains exactly how we have been testing `chatbot-v3` against the real deployed API.

It covers:
- the baseline real-API dogfood harness
- the targeted live-session matrix approach used for regressions and edge cases
- how bootstrap works
- how individual chat turns are sent
- what headers, cookies, and session evidence we rely on
- how artifacts are written
- how pass/fail is determined
- how debug bypass works for onboarding rate limits
- what extra investigation steps we used when a live result looked wrong

This is meant to be a handoff-quality document.
A new engineer or agent should be able to use it to understand both:
- how to reproduce our live tests
- how to interpret the artifacts they produce

## 2. The Two Main Live Testing Modes

In practice, we used two complementary live-testing modes.

### A. Baseline real-API dogfood
This is the repeatable baseline suite.
It exercises a fixed set of scenarios against the real deployed API and produces a standard artifact bundle.

Primary entrypoint:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood.ts`

Supporting modules:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/bootstrap.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/chat-runner.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/scenarios.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/http-client.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/evaluator.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/reporting.ts`

We used this when we wanted a stable baseline answer to questions like:
- does chat bootstrap still work?
- does the required v1 scenario set still pass?
- did a recent fix cause a clear regression?

### B. Targeted live-session matrices
This is the more flexible, scenario-heavy approach.
It uses the same real deployed API, but instead of only the fixed dogfood suite, we run longer scenario chains for:
- historical regressions
- FAQ behavior
- supporting-document progression
- explain-process edge cases
- skipped branch behavior
- consult continuity
- handoff interactions

This is how we tested most of the later bugfixes.
Typical outputs went under:
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/`

Examples:
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-23T09-18-29-487Z-faq-wide-live-matrix`
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-22T18-15-12-031Z-explain-process-regression-probe`
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-22T22-30-22-767Z-wide-regression-matrix`

## 3. The Real API Endpoints We Actually Hit

The live harness is not testing mocks. It hits the deployed API.

The two critical endpoint families are:

### Bootstrap
- `POST /api/patient/onboarding/init`

This establishes a real patient-side session and returns the evidence needed to start widget chat.

### Chat turns
- `POST /api/v3/chatbot/chat`

This is the actual `chatbot-v3` turn endpoint.
Every live conversation step after bootstrap goes through this route.

## 4. Required Headers And Session Context

### `x-medora-site`
All real live requests must include:
- `x-medora-site`

The live harness always sets it.
Relevant code:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/http-client.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/patient-site-context.ts`

For our runs, the common site was:
- `beauty`

### Cookies
The bootstrap flow creates and then reuses:
- `patient_session`
- `patient_restore`

The harness stores them in its own `CookieJar`.
Relevant code:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/http-client.ts`

### Idempotency
The public route supports idempotency headers such as:
- `Idempotency-Key`
- `X-Idempotency-Key`

This matters for special retry tests and replay debugging.
Relevant code:
- `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3.routes.ts`

## 5. How Bootstrap Works

Bootstrap is implemented in:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/bootstrap.ts`

The harness does not consider bootstrap successful just because `onboarding/init` returned `200`.
It requires concrete evidence that a real patient chat-capable session was created.

The success contract is:
- `patient_session` cookie exists
- `patient_restore` cookie exists
- response body contains `widgetChatTarget.sessionId`
- `widgetChatTarget.kind === 'CHATBOT_SESSION'`

In other words, bootstrap success means:
- patient-side identity exists
- patient-side restore token exists
- widget chat target session id exists

If those are missing, bootstrap is treated as failed even if HTTP status was nominal.

### Allowed bootstrap payload
The baseline harness builds a deterministic onboarding payload with fields such as:
- `email`
- `name`
- `preferredLanguage`
- `destination`

Relevant code:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood.ts`

This lets each run create a unique but valid patient bootstrap.

## 6. How Chat Turns Are Sent

Actual turn execution is implemented in:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/chat-runner.ts`

Each turn posts a JSON payload shaped like:

```json
{
  "sessionId": "widget-chat:...",
  "message": "Hello",
  "attachments": [...],
  "pageContext": {...}
}
```

The runner captures, for every turn:
- request URL
- request payload
- request headers
- response status
- parsed response body
- raw response text
- response headers
- extracted `journeySummary`

The `journeySummary` is derived from either:
- `body.journeySummary`
- or `body.journey`

That is how we check live stage continuity after each step.

## 7. What The Baseline Scenario Set Looks Like

The fixed baseline scenario definitions live in:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/scenarios.ts`

The required scenario family includes:
- `blocked_without_prereq`
- `allowed_after_patient_session`
- `intake_to_triage_opening`
- `triage_to_recommendation`
- `recommendation_selected_to_consult`
- `faq_detour_no_progression`
- `handoff_denied_returns_to_current_step`

This suite is intentionally small.
It answers the question:
- is the core v1 contract still alive on the real API?

## 8. How Pass/Fail Is Computed In Baseline Dogfood

The baseline evaluator is in:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/evaluator.ts`

Each scenario is evaluated on four axes:
- `accessDecision`
- `journey`
- `response`
- `continuity`

Each axis becomes one of:
- `PASS`
- `SOFT_FAIL`
- `HARD_FAIL`

Scenario outcome rules:
- if any axis is `HARD_FAIL`, the scenario is `HARD_FAIL`
- otherwise if any axis is `SOFT_FAIL`, the scenario is `SOFT_FAIL`
- otherwise it is `PASS`

Run outcome rules:
- any `HARD_FAIL` scenario makes the run `HARD_FAIL`
- otherwise any `SOFT_FAIL` makes the run `SOFT_FAIL`
- otherwise the run is `PASS`

## 9. What Artifacts The Baseline Harness Produces

Artifact writing is implemented in:
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/reporting.ts`

Each baseline run writes into:
- `artifacts/chatbot-v3-real-api-dogfood/<runTimestamp>/`

Typical files are:
- `report.md`
- `transcripts.json`
- `bug-backlog.md`
- `run-metadata.json`

Example artifact:
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-real-api-dogfood/2026-04-21T09-49-05Z`

Example `report.md` contents include:
- run timestamp
- base URL
- site
- overall outcome
- redacted cookies
- bootstrap results
- scenario rollup

Example `run-metadata.json` includes:
- executed scenario ids
- base URL
- site
- redacted cookies
- git commit

## 10. What The Targeted Live Matrix Looks Like

The targeted live-session matrix is less standardized in code shape, but the resulting artifacts all follow the same spirit:
- one run directory per investigation or regression pass
- one summary file
- one detailed results file
- each scenario includes step-by-step request and response evidence

A representative example is:
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-23T09-18-29-487Z-faq-wide-live-matrix`

The summary file:
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-23T09-18-29-487Z-faq-wide-live-matrix/matrix-summary.json`

The detailed step file:
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-23T09-18-29-487Z-faq-wide-live-matrix/matrix-results.json`

That summary looks like:
- run id
- total scenarios
- passed count
- failed count
- failed scenario ids

Each detailed scenario result usually contains:
- `id`
- `ok`
- `failures`
- `bootstrap` result
- ordered `steps`

Each step usually records:
- a human-readable label
- request message
- response status
- assistant text
- `journey.stage`
- `journey.phase`
- `cardTypes`
- full `rawBody`

This is the most useful artifact for debugging behavior regressions because it preserves the exact visible conversation.

## 11. What We Actually Verified In Targeted Live Matrices

Over time, we expanded these targeted scenarios to cover historical failures.
Examples include:

### Mainline progression
- post-intake opening
- answered triage to recommendation
- skipped triage to recommendation
- recommendation selected to explain-process
- recommendation skipped to explain-process
- explain-process to medical-inputs
- supporting-document upload to online-consult

### FAQ detours
- early casual FAQ
- early standard FAQ
- recommendation FAQ
- explain-process FAQ
- medical-inputs FAQ
- consult FAQ
- skipped-branch FAQ

### Human handoff
- early explicit human request
- explain-process explicit human
- consult extra upload then human handoff

### Retry and replay
- idempotent hospital selection retry
- degraded then retry patterns

### Supporting documents
- one-doc consult readiness
- repeated uploads
- extra upload after consult
- FAQ at medical-inputs then resume to consult

These targeted matrices are how we validated the fixes that were too specific or too long-lived for the original small dogfood suite.

## 12. How We Judged Success In Targeted Matrices

For the targeted probes, we did not rely only on HTTP 200.
We typically judged success using a combination of:

- visible assistant text
- visible `journey.stage`
- card type / payload presence
- whether the stage stayed stable across detours
- whether the next progression resumed correctly

Examples:

### FAQ success means
- the user asked a FAQ-like question
- the system answered with either a reliable FAQ answer or an honest FAQ miss
- the persisted/visible primary stage stayed the same
- the assistant did not collapse back into workflow prompts

### Supporting-doc success means
- upload is acknowledged
- `uploadedCount` is correct
- stage does not jump backward
- later progression can enter `ONLINE_CONSULT`

### Explain-process success means
- hospital selection enters `EXPLAIN_PROCESS`
- assistant shows actual process overview content
- this normal progression does not accidentally go through `FaqAgent`

## 13. How We Investigated Wrong Live Results

When a live result looked wrong, we did not stop at the visible response.
We usually checked three more layers.

### A. The saved session snapshot
We inspected `ai_chat_sessions` to confirm what the persisted truth looked like.
This helped answer questions like:
- did `supportingDocuments` actually persist?
- what is the saved `journeyCurrentStage`?
- is `recommendationSelectionStatus` really `selected`?

### B. The saved idempotent turn result
We inspected `idempotency_keys.result` for the exact turn.
This was one of the most valuable debugging tools.
It let us inspect:
- `suggestion`
- `decision`
- `dispatchResult`
- render path
- reasons such as `whyNotSkip`

This is how we proved several root causes, for example:
- a turn was recognized correctly by `Supervisor` but blocked by `JourneyRuntimeAuthority`
- a stage suggestion was right but `dispatchAgent` was wrong
- a progression turn got rendered as `FAQ_MISS`

### C. Production logs
We also checked logs when the failure might be infra-related.
This was important for issues such as:
- onboarding rate limits
- database connection exhaustion
- old Dify writeback interference

## 14. The Onboarding Rate Limit Problem We Hit

A major testing blocker was:
- `POST /api/patient/onboarding/init` is intentionally rate-limited by IP

Relevant code:
- `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/patient-public.routes.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/middleware/rate-limit.middleware.ts`

This was correct production behavior, but it blocked high-volume live probing.
The most important operational conclusion is:
- when we tried to widen the live-session matrix, the real bottleneck was usually **patient onboarding rate limit**
- that is a bootstrap-layer bottleneck
- it is **not automatically evidence that the downstream chatbot runtime is broken**

In practice, this means:
- if new scenarios start failing before a real chat session is even established
- and the failure is `429 Too many requests`
- the correct diagnosis is usually onboarding-rate-limit pressure, not chatbot turn logic failure

So the first debugging question should be:
- \"Did this scenario fail during bootstrap, or after a valid widget chat session was already established?\"

If the failure happened during bootstrap, do not classify the whole matrix as a chatbot runtime regression yet.
So we added a minimal, explicit debug bypass.

## 15. How Debug Bypass Works

Debug bypass authorization lives in:
- `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/middleware/debug-bypass.ts`

The bypass is intentionally narrow.
It does **not** globally disable security.
It only allows specific middleware points to opt in.

Current logic:
- `DEBUG_BYPASS_ENABLED` must equal `true`
- `DEBUG_BYPASS_TOKEN` must be configured
- the request must send header `x-debug-bypass-token`
- the token must match exactly

Current onboarding integration:
- `/api/patient/onboarding/init` passes `shouldBypass: isDebugBypassAuthorized`
- when used, it logs a clear bypass message

This means we can run repeated live bootstrap tests without weakening the production default behavior for ordinary traffic.
It is also the main answer to the matrix-scaling problem:
- keep production rate limiting on by default
- only bypass the onboarding gate in controlled debug runs
- let every later chat turn continue through the normal deployed `chatbot-v3` runtime

That way, we avoid confusing a bootstrap throttle with a chatbot behavior regression.

## 16. The Difference Between Production Behavior And Debug Testing Behavior

Normal production behavior:
- onboarding rate limit is active
- patients must respect real traffic protections
- no debug token means no bypass

Debug testing behavior:
- if envs are enabled on the deployed server
- and the client sends the right bypass token
- onboarding rate limit can be bypassed for testing
- all later chat behavior still hits the real deployed API and real control plane

This distinction matters.
We are not mocking the chatbot after bootstrap.
We are only bypassing the bootstrap rate limit so that the rest of the live test can proceed.

## 17. Representative Artifacts To Learn From

If a new agent wants concrete examples of how our artifacts look, start here.

### Baseline dogfood, fully green
- report:
  - `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-real-api-dogfood/2026-04-21T09-49-05Z/report.md`
- metadata:
  - `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-real-api-dogfood/2026-04-21T09-49-05Z/run-metadata.json`

### FAQ live matrix, fully green
- summary:
  - `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-23T09-18-29-487Z-faq-wide-live-matrix/matrix-summary.json`
- detailed results:
  - `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-23T09-18-29-487Z-faq-wide-live-matrix/matrix-results.json`

### A narrower regression probe
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-22T18-15-12-031Z-explain-process-regression-probe/results.json`

## 18. Practical Workflow We Followed

In practice, the workflow usually looked like this:

1. deploy the current branch to the real API
2. run the baseline dogfood suite
3. if baseline fails, stop and debug the blocking issue
4. if baseline passes, run targeted live-session probes for the feature or bug under investigation
5. inspect artifacts for visible behavior
6. if behavior still looks wrong, inspect:
   - session snapshot
   - idempotency result
   - logs
7. implement fix
8. redeploy
9. rerun the exact same live scenarios
10. only then claim the fix is real

This order matters.
It prevents confusing local correctness with real deployed correctness.

## 19. What This Testing Strategy Is Good At

This approach is especially good at finding:
- real stage-continuity bugs
- authority/supervisor mismatch
- FAQ detour regressions
- idempotency/replay surprises
- attachment-driven regressions
- misrendered stage copy
- environment-specific live issues that local unit tests do not show

## 20. What This Testing Strategy Does Not Replace

Live session testing is powerful, but it does not replace:
- unit tests
- route tests
- mounting tests
- typecheck
- code review

We used it as the final truth source for deployed behavior, not as the only testing layer.

## 21. Recommended Starting Point For The Next Agent

If you are taking over live testing work, use this order:

1. read the current architecture overview docs
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-23-chatbot-v3-comprehensive-architecture-and-conversation-spec.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-23-chatbot-v3-comprehensive-architecture-and-conversation-spec-zh.md`

2. inspect the baseline live harness
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood/`

3. inspect one green baseline artifact
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-real-api-dogfood/2026-04-21T09-49-05Z`

4. inspect one green targeted matrix artifact
- `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/2026-04-23T09-18-29-487Z-faq-wide-live-matrix`

5. if you need more volume, verify debug bypass is enabled before running many new bootstrap sessions

## 22. Summary

The short version is:

- we test `chatbot-v3` live by first creating a real patient bootstrap through `/api/patient/onboarding/init`
- we require real bootstrap evidence, not just HTTP 200
- we then drive real chat turns through `/api/v3/chatbot/chat`
- we capture every step's request, response, stage, and cards into artifacts
- we use a small baseline dogfood suite for broad health
- we use larger targeted matrices for historical regressions and edge cases
- when behavior looks wrong, we inspect saved session state, idempotent turn results, and production logs
- for heavy debug iteration, we use a narrow onboarding rate-limit bypass rather than weakening the real runtime itself

That combination is how we got confidence that the repaired `chatbot-v3` behavior is real on the deployed system, not just correct in local tests.
