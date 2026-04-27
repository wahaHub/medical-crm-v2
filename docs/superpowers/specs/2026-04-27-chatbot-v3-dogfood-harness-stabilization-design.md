# Chatbot V3 Dogfood Harness Stabilization Design

Date: 2026-04-27
Status: Proposed
Audience: Engineers and AI agents testing chatbot-v3 Phase 1.1

## 1. Purpose

Phase 1 moved chatbot-v3 control-plane ownership toward:

```text
SupervisorEvent -> JourneyReducer -> NextActionResolver -> projection/runtime
```

The next blocker is not product logic. It is test signal quality.

Recent production dogfood output mixed several unrelated failures into broad `HARD_FAIL` summaries such as:

```text
/api/patient/onboarding/init failed: fetch failed
/api/v3/chatbot/chat timeout after 15000ms
```

Those failures do not always prove that Supervisor, JourneyReducer, runtime, composer, or worker agents are wrong. Some are environment, bootstrap, transport, or timeout problems.

This Phase 1.1 design stabilizes the dogfood harness so test output can say what kind of failure happened and whether that failure is usable for control-plane judgment.

## 2. Scope

This phase only changes the dogfood harness and its tests.

In scope:
- `scripts/chatbot-v3-real-api-dogfood.ts`
- `scripts/chatbot-v3-real-api-dogfood/*`
- `scripts/__tests__/chatbot-v3-real-api-dogfood.*.test.ts`
- dogfood JSON artifacts and Markdown reports

Out of scope:
- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- `apps/api/src/routes/chatbot-v3/response-composer.ts`
- worker agents and LLM adapters
- reducer rules
- prompts
- frontend action contracts
- production product behavior

This phase should not fix `FaqAgent fallbackUsed:true` or worker-agent schema failures. It should classify them correctly when they are visible.

## 3. Design Goal

Dogfood should become a reliable test instrument.

For every scenario, it should answer:
- Did bootstrap establish a valid patient chat session?
- Did the chat request reach the API and receive a response?
- If there was a failure, which phase failed?
- Is the result usable for judging Supervisor/JourneyReducer control-plane correctness?
- If reducer evidence exists, what event/stage/nextAction did the API report in the response body or runtime debug?

## 4. Failure Taxonomy

Introduce a stable failure category for scenario outcomes.

```ts
type DogfoodFailureCategory =
  | 'environment'
  | 'bootstrap'
  | 'chat_transport'
  | 'chat_http'
  | 'control_plane'
  | 'agent_or_composer';
```

### `environment`

Use when the test environment is not suitable for judgment.

Examples:
- API health check fails
- DNS/TLS/base URL is unreachable before scenario-specific bootstrap
- repeated transport failure before any scenario-specific request can be evaluated

Do not use `environment` for failures that occur inside onboarding/session setup. Once a scenario starts `/api/patient/onboarding/init` or validates session cookies/widget target state, failures belong to `bootstrap`.

### `bootstrap`

Use when onboarding/session setup fails.

Examples:
- `/api/patient/onboarding/init` returns an unexpected non-2xx response
- `/api/patient/onboarding/init` times out or returns `fetch failed`
- `patient_session` or `patient_restore` cookie is missing
- `widgetChatTarget.kind !== 'CHATBOT_SESSION'`
- `widgetChatTarget.sessionId` is missing

Bootstrap failures are not control-plane failures.

Current pain-case example:

```text
/api/patient/onboarding/init failed: fetch failed
=> failureCategory=bootstrap
=> failedPhase=bootstrap
=> usableForControlPlaneJudgment=false
```

### `chat_transport`

Use when a chat turn cannot complete due to transport-level problems.

Examples:
- timeout
- `fetch failed`
- connection reset
- network abort

A chat transport failure is not control-plane evidence unless production logs independently prove the reducer path completed.

### `chat_http`

Use when `/api/v3/chatbot/chat` returns HTTP 4xx/5xx.

Examples:
- 401/403 after bootstrap
- 409 invalid action state
- 500 runtime exception

This category should preserve HTTP status and response body.

### `control_plane`

Use when chat returns a valid response, but Supervisor/JourneyReducer behavior is wrong for the scenario.

Examples:
- expected treatment intent but response/debug shows FAQ detour
- expected `COLLECT_MINIMAL_MEDICAL_FACTS`, got `HUMAN_HANDOFF`
- expected FAQ side-path stage preservation, but journey stage changed unexpectedly
- runtime debug or response evidence contradicts the expected reducer outcome

### `agent_or_composer`

Use when control-plane routing is acceptable but downstream output is wrong or degraded.

Examples:
- reducer selected FAQ side-path correctly, but `FaqAgent` fell back or gave unusable answer
- reducer selected RecordsAgent correctly, but text/card output is missing
- system render or response cards are wrong while event/stage/nextAction are right

Worker-agent schema issues belong here unless they prevent control-plane evidence from being collected.

## 5. Outcome Shape

Extend scenario artifacts with a structured classification shape.

```ts
type DogfoodFailurePhase =
  | 'preflight'
  | 'bootstrap'
  | 'chat'
  | 'evaluation'
  | 'reporting';

type DogfoodScenarioOutcome = {
  scenarioId: string;
  outcome: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL';
  summary: string;
  failureCategory?: DogfoodFailureCategory;
  failedPhase?: DogfoodFailurePhase;
  usableForControlPlaneJudgment: boolean;
  bootstrapAttempts: DogfoodAttemptSummary[];
  chatAttempts: DogfoodAttemptSummary[];
  sessionId: string | null;
  turns: TurnTranscript[];
  notes: string[];
};

type DogfoodAttemptSummary = {
  phase: 'bootstrap' | 'chat';
  turnIndex: number | null;
  attempt: number;
  durationMs: number;
  status?: number;
  transportErrorKind?: 'timeout' | 'transport_error';
  errorMessage?: string;
  retried: boolean;
};
```

`turnIndex` is `null` for bootstrap attempts and 0-based for chat attempts.

`failureCategory` and `failedPhase` may be absent for `PASS`, but every `SOFT_FAIL` or `HARD_FAIL` outcome must include `failureCategory`, `failedPhase`, and `usableForControlPlaneJudgment`.

The exact type names can differ, but the artifact must expose equivalent information.

## 6. Retry And Timeout Policy

### Bootstrap

Defaults:
- timeout: `30_000ms`
- max attempts: `2`

Retry only:
- timeout
- transport error

Do not retry:
- expected blocked negative-control validation
- HTTP 4xx validation errors
- missing required local payload fields

### Chat

Defaults:
- timeout: `60_000ms`
- max attempts: `1` by default

Optional retry:
- a scenario may opt into one retry for timeout/transport errors if it is non-mutating or explicitly safe to retry.

Do not silently retry mutating actions unless the scenario declares the retry policy safe.

## 7. Control-Plane Usability Flag

Each scenario outcome must include:

```ts
usableForControlPlaneJudgment: boolean;
```

Set to `false` when:
- environment failed
- bootstrap failed
- chat transport failed before any response and no reducer evidence is available
- chat HTTP failure prevents response interpretation

Set to `true` when:
- chat response is HTTP 200 and includes journey/runtime evidence sufficient for the scenario
- or the test has correlated external logs proving reducer completion

A failing scenario with `usableForControlPlaneJudgment=false` should not be used to claim reducer regression.

## 8. Scenario Evaluation Rules

Phase 1.1 does not need a full oracle for every journey. It needs better failure attribution.

Minimum evaluation behavior:
- If bootstrap fails, classify as `bootstrap` and stop that scenario.
- If chat transport fails, classify as `chat_transport` and record duration/attempts.
- If chat HTTP status is >= 400, classify as `chat_http`.
- If response is 200 but expected journey/debug evidence is wrong, classify as `control_plane`.
- If response is 200 and journey/debug evidence is acceptable but answer/cards are degraded, classify as `agent_or_composer`.

For Phase 1 Supervisor/Journey testing, `agent_or_composer` should usually be `SOFT_FAIL`, not `HARD_FAIL`, unless the scenario explicitly tests output rendering.

Default severity mapping:

| Failure category | Default outcome | Notes |
| --- | --- | --- |
| `environment` | `HARD_FAIL` | The test environment cannot support scenario judgment. |
| `bootstrap` | `HARD_FAIL` | The scenario never reached a valid chat session. |
| `chat_transport` | `HARD_FAIL` | The chat turn did not return a response. |
| `chat_http` | `HARD_FAIL` | The API rejected or failed the chat request. |
| `control_plane` | `HARD_FAIL` | Supervisor/JourneyReducer evidence contradicts the scenario oracle. |
| `agent_or_composer` | `SOFT_FAIL` | Use `HARD_FAIL` only when the scenario explicitly targets rendered output quality. |

## 9. Report Format

Update Markdown report sections to group failures by category:

```text
## Environment Failures
## Bootstrap Failures
## Chat Transport / HTTP Failures
## Control-Plane Failures
## Agent / Composer Failures
## Passed Control-Plane Evidence
```

Each row should show:
- scenario id
- outcome
- failure category
- failed phase
- usable for control-plane judgment
- session id when available
- summary

The report should also print a quick command template for log collection when session ids exist:

```bash
python3 /Users/haowang/Desktop/claws/medical-crm-v2/scripts/tail_journalctl.py \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem \
  --since "20 minutes ago" \
  --lines 1200 | rg '<SESSION_ID>|chatbot-v3.node-event|JourneyReducer|NextActionResolver|fallbackUsed|schemaValidationFailed'
```

## 10. JSON Artifact Requirements

The JSON transcript should preserve:
- request URL
- request payload with session id redacted only where necessary
- redacted request headers
- response status
- response body/bodyText
- durationMs
- attempt number
- chat attempt turn index
- failure category / phase
- journey summary if present
- runtime debug if present

Do not collapse transport errors into plain strings without structured kind.

## 11. Testing Requirements

Add focused unit tests for:
- preflight/API health failure is classified as `environment` with `failedPhase=preflight` and `usableForControlPlaneJudgment=false`
- bootstrap timeout is retried and classified as `bootstrap`
- bootstrap 4xx validation is not retried
- missing `patient_session` / `patient_restore` produces `bootstrap` failure
- chat timeout produces `chat_transport` with `usableForControlPlaneJudgment=false`
- chat HTTP 500 produces `chat_http`
- multi-turn chat attempts preserve 0-based `turnIndex`
- HTTP 200 with wrong journey produces `control_plane`
- HTTP 200 with expected journey but degraded answer/card produces `agent_or_composer`
- every `SOFT_FAIL` / `HARD_FAIL` outcome includes failure category, failed phase, and control-plane usability
- report groups failures into the new sections

Tests should not require real network.
Use fake `fetchImpl` and existing dogfood client abstractions.

## 12. Acceptance Criteria

Phase 1.1 is complete when:
- dogfood output no longer reports ambiguous `HARD_FAIL fetch failed` without category and phase
- bootstrap transport failures retry according to policy
- chat timeout defaults are long enough for production LLM turns, defaulting to 60 seconds
- every scenario says whether it is usable for control-plane judgment
- reports distinguish control-plane failure from environment/bootstrap/chat transport/agent-composer failure
- no chatbot production runtime behavior changes

## 13. Non-Goals And Follow-Up

Not included:
- automatic Lightsail log fetching inside dogfood
- HTML report
- full scenario DSL rewrite
- worker-agent schema hardening
- runtime/composer truth-boundary cleanup
- upload/documents behavior changes

Recommended next phases after this:
1. Runtime/composer truth-boundary cleanup.
2. `renderSystemAction()` extraction for `SHOW_PROCESS_OVERVIEW`.
3. `buildAgentTask({ nextAction, event, facts, readPlan })` extraction.
4. Upload/documents persisted-facts consult progression tests.
5. Worker-agent schema hardening, starting with `FaqAgent` and `RecordsAgent`.
