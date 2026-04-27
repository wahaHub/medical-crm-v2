# Chatbot V3 Dogfood Harness Stabilization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chatbot-v3 real API dogfood harness classify environment/bootstrap/chat/control-plane/agent-composer failures clearly so test output can be trusted when validating Supervisor/JourneyReducer behavior.

**Architecture:** Keep this phase entirely inside the script-side dogfood subsystem. Add structured outcome metadata and attempt summaries to the existing `types`, teach bootstrap and chat runner to preserve attempts/transport kinds, then centralize category/severity evaluation before rendering JSON and Markdown reports. Product runtime, reducer rules, worker agents, prompts, and frontend contracts are out of scope.

**Tech Stack:** TypeScript ESM scripts, Node built-in `node:test`, fake `fetchImpl` tests, existing `pnpm exec tsx --test` dogfood test command.

---

## Source Spec

- Spec: `docs/superpowers/specs/2026-04-27-chatbot-v3-dogfood-harness-stabilization-design.md`
- Worktree: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer`
- Validation command: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer run test:chatbot-v3:real-api-dogfood`

## File Structure

- Modify: `scripts/chatbot-v3-real-api-dogfood/types.ts`
  - Owns artifact-facing types: failure categories, phases, attempt summaries, turn transcripts, scenario outcomes, rollup.
- Modify: `scripts/chatbot-v3-real-api-dogfood/bootstrap.ts`
  - Owns onboarding/session setup classification and bootstrap attempts.
- Modify: `scripts/chatbot-v3-real-api-dogfood/chat-runner.ts`
  - Owns chat turn request execution, chat attempts, transport/http transcript details, and default chat timeout.
- Modify: `scripts/chatbot-v3-real-api-dogfood/evaluator.ts`
  - Owns default severity mapping and scenario classification helpers.
- Modify: `scripts/chatbot-v3-real-api-dogfood/reporting.ts`
  - Owns grouped Markdown reports and JSON artifact serialization/redaction.
- Modify: `scripts/chatbot-v3-real-api-dogfood.ts`
  - Owns orchestration: converting bootstrap/chat outputs into classified `ScenarioOutcome`s.
- Modify tests:
  - `scripts/__tests__/chatbot-v3-real-api-dogfood.bootstrap.test.ts`
  - `scripts/__tests__/chatbot-v3-real-api-dogfood.chat-runner.test.ts`
  - `scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts`
  - `scripts/__tests__/chatbot-v3-real-api-dogfood.reporting.test.ts`

Do not modify:
- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- `apps/api/src/routes/chatbot-v3/response-composer.ts`
- `apps/api/src/routes/chatbot-v3/agents/*`
- OpenAI route adapters or prompts
- frontend code

## Chunk 1: Shared Outcome Contract

### Task 1: Add Dogfood Classification Types

**Files:**
- Modify: `scripts/chatbot-v3-real-api-dogfood/types.ts`
- Test: `scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts`

- [ ] **Step 1: Write failing evaluator tests for default classification shape**

Add tests proving the evaluator can return a classified scenario outcome for:
- `bootstrap` failure -> `HARD_FAIL`, `failedPhase='bootstrap'`, `usableForControlPlaneJudgment=false`
- `agent_or_composer` failure -> `SOFT_FAIL`, `failedPhase='evaluation'`, `usableForControlPlaneJudgment=true`

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts
```

Expected: FAIL because the new classification API/types do not exist yet.

- [ ] **Step 2: Add artifact-facing types**

In `types.ts`, add:

```ts
export type DogfoodFailureCategory =
  | 'environment'
  | 'bootstrap'
  | 'chat_transport'
  | 'chat_http'
  | 'control_plane'
  | 'agent_or_composer';

export type DogfoodFailurePhase =
  | 'preflight'
  | 'bootstrap'
  | 'chat'
  | 'evaluation'
  | 'reporting';

export interface DogfoodAttemptSummary {
  phase: 'bootstrap' | 'chat';
  attempt: number;
  durationMs: number;
  status?: number;
  transportErrorKind?: 'timeout' | 'transport_error';
  errorMessage?: string;
  retried: boolean;
}
```

Extend `ScenarioOutcome` with optional classification fields:

```ts
failureCategory?: DogfoodFailureCategory;
failedPhase?: DogfoodFailurePhase;
usableForControlPlaneJudgment: boolean;
bootstrapAttempts: DogfoodAttemptSummary[];
chatAttempts: DogfoodAttemptSummary[];
sessionId: string | null;
notes: string[];
```

Keep existing fields `scenarioId`, `outcome`, `summary`, and `turns`.

Also update `TurnTranscript` so JSON artifacts do not lose request-level evidence already captured by `ChatRunnerTurnTranscript`:

```ts
requestUrl: string;
requestAttempt: number;
durationMs: number;
transportErrorKind?: 'timeout' | 'transport_error';
```

Keep the existing nested `request` and `response` objects for backward readability.

- [ ] **Step 3: Add evaluator helper for category-to-default-outcome**

In `evaluator.ts`, add a small pure helper:

```ts
export function defaultOutcomeForFailureCategory(category: DogfoodFailureCategory): DogfoodAxisOutcome {
  return category === 'agent_or_composer' ? 'SOFT_FAIL' : 'HARD_FAIL';
}
```

Add a second pure helper that builds a classified `ScenarioOutcome` from explicit inputs. Keep it small and deterministic; do not inspect raw API bodies here.

- [ ] **Step 4: Run evaluator tests**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer add \
  scripts/chatbot-v3-real-api-dogfood/types.ts \
  scripts/chatbot-v3-real-api-dogfood/evaluator.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer commit -m "test(chatbot-v3): add dogfood failure classification contract"
```

## Chunk 2: Bootstrap Attempts And Classification

### Task 2: Classify Onboarding Failures As Bootstrap Evidence

**Files:**
- Modify: `scripts/chatbot-v3-real-api-dogfood/bootstrap.ts`
- Test: `scripts/__tests__/chatbot-v3-real-api-dogfood.bootstrap.test.ts`

- [ ] **Step 1: Write failing tests for retry and bootstrap category**

Add tests:
- bootstrap timeout is retried once, returns `bootstrapMode='bootstrap_failed'`, `failureKind='timeout'`, and two `attempts`
- bootstrap `fetch failed` is retried once, classified as bootstrap, and records `transportErrorKind='transport_error'`
- bootstrap HTTP 400/429 is not retried and records one attempt with status
- HTTP 200 missing `patient_session` records one attempt with status 200 and `failureKind='missing_allowed_evidence'`
- HTTP 200 missing `patient_restore` records one attempt with status 200 and `failureKind='missing_allowed_evidence'`
- HTTP 200 missing `widgetChatTarget.sessionId` records one attempt with status 200 and `failureKind='missing_allowed_evidence'`

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.bootstrap.test.ts
```

Expected: FAIL because bootstrap attempts/retry options do not exist yet.

- [ ] **Step 2: Extend bootstrap result shape**

Add to `BootstrapBaseResult`:

```ts
attempts: DogfoodAttemptSummary[];
```

Keep `failureKind` for backward readability, but ensure attempts become the canonical debug trail.

- [ ] **Step 3: Implement bootstrap retry policy**

Add options:

```ts
timeoutMs?: number; // default 30_000
maxAttempts?: number; // default 2
```

Retry only `DogfoodHttpTransportError` kinds `timeout` and `transport_error`.
Do not retry HTTP responses, missing local payload fields, missing allowed evidence, or expected blocked validation.

- [ ] **Step 4: Preserve existing bootstrap semantics**

Keep these existing behaviors green:
- allowed success captures `patient_session`, `patient_restore`, `widgetChatTarget.sessionId`
- canonical blocked-path HTTP 400 validation remains `blocked_expected`
- blocked-path generic HTTP 400 remains bootstrap failure
- caller-supplied cookie headers still reject explicitly

- [ ] **Step 5: Run bootstrap tests**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.bootstrap.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer add \
  scripts/chatbot-v3-real-api-dogfood/bootstrap.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.bootstrap.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer commit -m "feat(chatbot-v3): classify dogfood bootstrap attempts"
```

## Chunk 3: Chat Attempts And Transport/HTTP Classification

### Task 3: Preserve Chat Transport Attempts

**Files:**
- Modify: `scripts/chatbot-v3-real-api-dogfood/chat-runner.ts`
- Test: `scripts/__tests__/chatbot-v3-real-api-dogfood.chat-runner.test.ts`

- [ ] **Step 1: Write failing chat-runner tests**

Add tests:
- default chat request timeout is `60_000ms`
- chat timeout produces a transcript with `responseStatus=0`, `chatAttempts[0].transportErrorKind='timeout'`, and `stoppedEarly=true`
- chat HTTP 500 records status 500 in the attempt and does not look like transport failure
- safe retry scenarios can opt into one same-turn retry for timeout/transport errors; mutating/default scenarios do not retry

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.chat-runner.test.ts
```

Expected: FAIL because chat attempt summaries/default timeout are not implemented.

- [ ] **Step 2: Extend `ChatRunnerResult`**

Add:

```ts
chatAttempts: DogfoodAttemptSummary[];
```

Keep `turns` as the transcript list. The attempt list is cross-turn debug metadata.

- [ ] **Step 3: Add same-turn transport retry without overbuilding**

Keep existing `retryPolicy` behavior for HTTP hard failures, but add one explicit transport retry knob:

```ts
transportRetryPolicy?: 'none' | 'retry_once_if_safe';
```

Rules:
- default is `none`
- `retry_once_if_safe` retries the same chat turn once only for `DogfoodHttpTransportError` kinds `timeout` and `transport_error`
- HTTP 4xx/5xx responses are not same-turn retried
- each attempt is recorded in `chatAttempts`
- the failed attempt transcript should still preserve the final failed response if both attempts fail; do not duplicate visible turns if the retry succeeds

Do not add exponential backoff or a new scenario DSL in this phase.

- [ ] **Step 4: Set default chat timeout to 60 seconds**

In `runChatSession`, use `requestTimeoutMs ?? 60_000` when calling the client. Do not change the shared HTTP client default unless tests prove script callers rely on it.

- [ ] **Step 5: Run chat-runner tests**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.chat-runner.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer add \
  scripts/chatbot-v3-real-api-dogfood/chat-runner.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.chat-runner.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer commit -m "feat(chatbot-v3): capture dogfood chat attempts"
```

## Chunk 4: Scenario Classification In Runner

### Task 4: Convert Bootstrap And Chat Results Into Classified Outcomes

**Files:**
- Modify: `scripts/chatbot-v3-real-api-dogfood.ts`
- Modify: `scripts/chatbot-v3-real-api-dogfood/evaluator.ts`
- Test: `scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts`

- [ ] **Step 1: Write failing classification tests**

Add tests for pure classification helpers:
- `BootstrapFailureResult` -> `failureCategory='bootstrap'`, `failedPhase='bootstrap'`, `usableForControlPlaneJudgment=false`
- chat response status `0` -> `chat_transport`, `failedPhase='chat'`, unusable
- chat response status `500` -> `chat_http`, `failedPhase='chat'`, unusable
- HTTP 200 with wrong journey oracle -> `control_plane`, usable
- HTTP 200 with acceptable journey but degraded output -> `agent_or_composer`, usable and `SOFT_FAIL`

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts
```

Expected: FAIL until helpers exist.

- [ ] **Step 2: Implement pure classification helpers**

Add helper functions in `evaluator.ts`; keep raw runner orchestration out of them.

The helper should accept normalized facts like:

```ts
{
  scenarioId,
  bootstrapAttempts,
  chatAttempts,
  sessionId,
  turns,
  expectedJourneyOk,
  responseOutputOk
}
```

It should return a full `ScenarioOutcome`.

- [ ] **Step 3: Update top-level runner orchestration**

In `scripts/chatbot-v3-real-api-dogfood.ts`:
- blocked bootstrap failures become classified `bootstrap` outcomes
- allowed bootstrap failures become classified `bootstrap` outcomes
- chat transport and chat HTTP failures get classified separately
- existing happy-path/pass behavior remains
- `sessionId` is copied from `widgetChatTargetSessionId` when available

Keep the old four-axis evaluator only if it helps preserve existing scenario summaries. Do not let it hide failure category/phase.

- [ ] **Step 4: Run evaluator tests**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer add \
  scripts/chatbot-v3-real-api-dogfood.ts \
  scripts/chatbot-v3-real-api-dogfood/evaluator.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer commit -m "feat(chatbot-v3): classify dogfood scenario outcomes"
```

## Chunk 5: Reports And JSON Artifacts

### Task 5: Render Grouped Reports And Structured JSON

**Files:**
- Modify: `scripts/chatbot-v3-real-api-dogfood/reporting.ts`
- Test: `scripts/__tests__/chatbot-v3-real-api-dogfood.reporting.test.ts`

- [ ] **Step 1: Write failing reporting tests**

Add tests that assert:
- `report.md` contains sections:
  - `## Environment Failures`
  - `## Bootstrap Failures`
  - `## Chat Transport / HTTP Failures`
  - `## Control-Plane Failures`
  - `## Agent / Composer Failures`
  - `## Passed Control-Plane Evidence`
- grouped rows include scenario id, outcome, failure category, failed phase, usability flag, session id, summary
- `transcripts.json` preserves `failureCategory`, `failedPhase`, `usableForControlPlaneJudgment`, `bootstrapAttempts`, `chatAttempts`, `sessionId`, `notes`
- `transcripts.json.scenarioTranscripts[].turns[]` preserves request URL, request path, request payload, redacted request headers, response status, response body/bodyText, attempt number, and durationMs
- transport-error turns retain structured `transportErrorKind` and are not collapsed into only a plain string
- bootstrap and chat attempt summaries include `attempt` and `durationMs`
- the quick Lightsail log command includes `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/tail_journalctl.py` and session id placeholder/content
- redaction still removes patient cookies and restore tokens

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.reporting.test.ts
```

Expected: FAIL because report grouping and JSON fields do not exist.

- [ ] **Step 2: Update Markdown report renderer**

Replace the single `Scenario Rollup` table with grouped sections. Keep existing top metadata and bootstrap section.

Rows should include:

```text
Scenario | Outcome | Category | Phase | Control-plane usable | Session | Summary
```

- [ ] **Step 3: Update bug backlog renderer**

Group non-pass scenarios by category or include category/phase columns so the backlog no longer says only ambiguous `HARD_FAIL fetch failed`.

- [ ] **Step 4: Update transcript serializer**

Preserve structured scenario outcome fields in `transcripts.json`. Also update `TurnTranscript` conversion/serialization so `requestUrl`, attempt number, durationMs, and optional `transportErrorKind` survive from chat execution into final JSON artifacts. Continue deep redaction of sensitive cookie/token values.

- [ ] **Step 5: Run reporting tests**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.reporting.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer add \
  scripts/chatbot-v3-real-api-dogfood/reporting.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.reporting.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer commit -m "feat(chatbot-v3): group dogfood failure reports"
```

## Chunk 6: Full Harness Verification

### Task 6: Run The Dogfood Harness Test Suite

**Files:**
- No expected production code changes.
- May adjust tests only if prior chunks missed compatibility.

- [ ] **Step 1: Run the full dogfood test target**

Run:

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer run test:chatbot-v3:real-api-dogfood
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript-level smoke via existing script tests only**

If the full command passes, do not run live dogfood automatically. Live dogfood hits the deployed API and may create real test sessions. Save live production dogfood for the user-approved deployment/testing phase.

- [ ] **Step 3: Check git diff does not touch out-of-scope runtime files**

Refresh the comparison ref first:

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer fetch origin phase1-event-reducer
```

Run:

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer diff --name-only origin/phase1-event-reducer...HEAD
```

Expected changed files are limited to:
- `scripts/chatbot-v3-real-api-dogfood.ts`
- `scripts/chatbot-v3-real-api-dogfood/*`
- `scripts/__tests__/chatbot-v3-real-api-dogfood.*.test.ts`
- this plan/spec docs if committed in the same branch

- [ ] **Step 4: Final commit if cleanup was needed**

Only commit if this task required cleanup changes.

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer status --short
```

Expected: only pre-existing untracked `artifacts/` may remain.

## Review And Handoff

After all chunks pass:

- [ ] Run `superpowers:requesting-code-review` or `review-until-clean` with context:
  - Spec path
  - Plan path
  - Test command output
  - Explicit note that runtime/product logic is out of scope
- [ ] Fix meaningful review findings.
- [ ] Run full dogfood test target again.
- [ ] Commit final review fixes with a detailed commit message.
- [ ] Refresh the current-state bundle for external GPT review after code is stable.

Do not deploy from this plan alone. Deployment and live dogfood happen in the next user-approved phase.
