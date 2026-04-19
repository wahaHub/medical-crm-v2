# Chatbot V3 Real API Session Dogfood Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable real-deployment API dogfood runner that validates patient-gated `chatbot-v3` sessions, records full transcripts, and produces actionable reports.

**Architecture:** Implement the dogfood workflow as a small script-side subsystem under `scripts/chatbot-v3-real-api-dogfood/`. Split the work into focused units for configuration/scenario loading, patient bootstrap, chat execution, evaluation, and reporting so the runner stays diagnostic and does not become a second application runtime. The first version will pin one canonical blocked-path negative control and one canonical allowed bootstrap path through `POST /api/patient/onboarding/init` returning `patient_session` and `widgetChatTarget.sessionId`.

**Tech Stack:** TypeScript, `tsx`, native `fetch`, Node file system APIs, repo-local script tests via `tsx --test`, existing deployed CRM API endpoints, Markdown/JSON artifacts.

---

## File Map

### New files to create

- `scripts/chatbot-v3-real-api-dogfood.ts`
  - Thin CLI entrypoint that parses arguments, invokes the runner, and exits with a stable code.
- `scripts/chatbot-v3-real-api-dogfood/config.ts`
  - Reads environment/CLI configuration and validates required values.
- `scripts/chatbot-v3-real-api-dogfood/scenarios.ts`
  - Defines the pinned v1 blocked/allowed/core/dirty-path scenario matrix.
- `scripts/chatbot-v3-real-api-dogfood/types.ts`
  - Shared types for bootstrap results, turn transcripts, evaluator outputs, and report artifacts.
- `scripts/chatbot-v3-real-api-dogfood/http-client.ts`
  - Small cookie-aware request client for real deployment API calls.
- `scripts/chatbot-v3-real-api-dogfood/bootstrap.ts`
  - Real patient bootstrap logic, including the canonical blocked-path setup and allowed onboarding path.
- `scripts/chatbot-v3-real-api-dogfood/chat-runner.ts`
  - Multi-turn chat execution against `/api/v3/chatbot/chat`.
- `scripts/chatbot-v3-real-api-dogfood/evaluator.ts`
  - Scenario evaluation logic and run-level rollup rules.
- `scripts/chatbot-v3-real-api-dogfood/reporting.ts`
  - Artifact writing, redaction, timestamp formatting, and run metadata schema/version output.
- `scripts/__tests__/chatbot-v3-real-api-dogfood.config.test.ts`
  - Tests config parsing and validation.
- `scripts/__tests__/chatbot-v3-real-api-dogfood.bootstrap.test.ts`
  - Tests blocked/allowed bootstrap classification and cookie handling using mocked fetch.
- `scripts/__tests__/chatbot-v3-real-api-dogfood.chat-runner.test.ts`
  - Tests multi-turn request sequencing and transcript capture.
- `scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts`
  - Tests `PASS` / `SOFT_FAIL` / `HARD_FAIL` and run-level aggregation.
- `scripts/__tests__/chatbot-v3-real-api-dogfood.reporting.test.ts`
  - Tests artifact paths, UTC timestamp formatting, redaction, and schema version emission.
- `docs/analysis/2026-04-18-chatbot-v3-real-api-session-dogfood-matrix.md`
  - Human-readable v1 scenario list with required vs deferred coverage and exact blocked/allowed setup.

### Existing files to modify

- `package.json`
  - Add one runner command and one focused script-test command.
- `docs/superpowers/specs/2026-04-18-chatbot-v3-real-api-session-dogfood-design.md`
  - Only if plan review exposes a real doc inconsistency; otherwise leave unchanged.

---

## Chunk 1: Configuration And Scenario Contract

### Task 1: Create the script-side type and config contract

**Files:**
- Create: `scripts/chatbot-v3-real-api-dogfood/types.ts`
- Create: `scripts/chatbot-v3-real-api-dogfood/config.ts`
- Create: `scripts/__tests__/chatbot-v3-real-api-dogfood.config.test.ts`

- [ ] **Step 1: Write the failing config tests**

Cover at minimum:
- missing base URL fails loudly
- missing site fails loudly
- timestamp formatter uses UTC-safe run ids like `2026-04-18T14-05-09Z`
- `run-metadata.json` schema version defaults to `1`

- [ ] **Step 2: Run the config test and verify it fails**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.config.test.ts
```
Expected: FAIL because the config/types modules do not exist yet.

- [ ] **Step 3: Implement minimal shared types**

In `types.ts`, define only the v1 shapes needed now:
- `DogfoodConfig`
- `DogfoodScenarioId`
- `BootstrapMode`
- `BootstrapResult`
- `TurnTranscript`
- `ScenarioOutcome`
- `RunRollup`
- `RunMetadata`

Include explicit fields for:
- scenario id
- base URL
- site
- redacted cookies
- timestamp string
- schema version

- [ ] **Step 4: Implement config parsing**

In `config.ts`:
- parse CLI/env inputs
- validate required fields
- normalize the base URL
- normalize the UTC run id string
- emit `artifactSchemaVersion = 1`
- do not own scenario ids or bootstrap mode selection

- [ ] **Step 5: Re-run the config test and verify pass**

Run the same command and expect PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  scripts/chatbot-v3-real-api-dogfood/types.ts \
  scripts/chatbot-v3-real-api-dogfood/config.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.config.test.ts

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "test(chatbot-v3): add real api dogfood config contract"
```

### Task 2: Pin the v1 scenario matrix and negative control

**Files:**
- Create: `scripts/chatbot-v3-real-api-dogfood/scenarios.ts`
- Create: `docs/analysis/2026-04-18-chatbot-v3-real-api-session-dogfood-matrix.md`
- Test: `scripts/__tests__/chatbot-v3-real-api-dogfood.config.test.ts`

- [ ] **Step 1: Extend the failing test to assert scenario ids, deferred scenarios, the v1 required set, and one doc-sync guard for the matrix file**

Required v1 scenarios must be exactly:
- `blocked_without_prereq`
- `allowed_after_patient_session`
- `intake_to_triage_opening`
- `triage_to_recommendation`
- `recommendation_selected_to_consult`
- `faq_detour_no_progression`
- `handoff_denied_returns_to_current_step`

- [ ] **Step 2: Run the test and verify failure**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.config.test.ts
```
Expected: FAIL because the scenario module and matrix doc do not exist yet.

- [ ] **Step 3: Implement `scenarios.ts`**

Define:
- one canonical blocked-path negative control for v1
- one canonical allowed onboarding bootstrap path for v1
- required vs deferred scenarios as explicit metadata, not comments
- scenario ids and bootstrap mode selection as the sole source of truth
- per-scenario expected access/journey/continuity predicates at a high level

- [ ] **Step 4: Write the matrix doc**

Document for each v1 scenario:
- bootstrap mode
- why it is required or deferred
- expected outcome level if healthy
- whether it is single-turn or multi-turn

- [ ] **Step 5: Re-run the config test and verify pass**

Use the same command and expect PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  scripts/chatbot-v3-real-api-dogfood/scenarios.ts \
  docs/analysis/2026-04-18-chatbot-v3-real-api-session-dogfood-matrix.md \
  scripts/__tests__/chatbot-v3-real-api-dogfood.config.test.ts

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "docs(chatbot-v3): pin real api dogfood v1 scenarios"
```

## Chunk 2: Bootstrap And Chat Execution

### Task 3: Implement the cookie-aware real API client and bootstrap flow

**Files:**
- Create: `scripts/chatbot-v3-real-api-dogfood/http-client.ts`
- Create: `scripts/chatbot-v3-real-api-dogfood/bootstrap.ts`
- Create: `scripts/__tests__/chatbot-v3-real-api-dogfood.bootstrap.test.ts`

- [ ] **Step 1: Write failing bootstrap tests**

Cover at minimum:
- missing required onboarding payload fields for the allowed path fail loudly
- onboarding success captures `patient_session`, `patient_restore`, and `widgetChatTarget.sessionId`
- blocked-path setup without allowed bootstrap evidence is classified as blocked, not bootstrap success
- 401/403 during bootstrap are preserved as bootstrap failures
- timeout/transport errors are surfaced as hard infrastructure-visible failures

- [ ] **Step 2: Run the bootstrap test and verify it fails**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.bootstrap.test.ts
```
Expected: FAIL because the client/bootstrap modules do not exist yet.

- [ ] **Step 3: Implement `http-client.ts`**

Keep it small:
- native `fetch`
- per-run cookie jar
- request/response header capture with redaction hooks
- JSON-or-text body parsing
- timeout support with `AbortController`

- [ ] **Step 4: Implement `bootstrap.ts`**

For v1:
- implement one canonical allowed path through `POST /api/patient/onboarding/init`
- require `widgetChatTarget.sessionId` and `patient_session` as success evidence
- implement one canonical blocked-path negative control that intentionally does not establish patient chat eligibility
- classify bootstrap result into `blocked_expected`, `chat_allowed`, or `bootstrap_failed`

- [ ] **Step 5: Re-run bootstrap tests and verify pass**

Use the same command and expect PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  scripts/chatbot-v3-real-api-dogfood/http-client.ts \
  scripts/chatbot-v3-real-api-dogfood/bootstrap.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.bootstrap.test.ts

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "feat(chatbot-v3): add real api bootstrap runner"
```

### Task 4: Implement multi-turn deployed chat execution

**Files:**
- Create: `scripts/chatbot-v3-real-api-dogfood/chat-runner.ts`
- Create: `scripts/__tests__/chatbot-v3-real-api-dogfood.chat-runner.test.ts`

- [ ] **Step 1: Write failing chat-runner tests**

Cover at minimum:
- turns are sent sequentially to `/api/v3/chatbot/chat`
- cookies from bootstrap flow into chat turns
- turn transcript stores request payload, response status, response body, and selected headers
- non-JSON bodies are preserved as text
- runner stops early on non-retryable hard failures unless the scenario explicitly allows retry

- [ ] **Step 2: Run the chat-runner test and verify it fails**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.chat-runner.test.ts
```
Expected: FAIL because the chat runner does not exist yet.

- [ ] **Step 3: Implement `chat-runner.ts`**

Responsibilities:
- accept a `chat_allowed` bootstrap result
- run scripted turns against `/api/v3/chatbot/chat`
- preserve cookies and per-turn state
- extract journey summary fields if present
- stop according to scenario retry policy

- [ ] **Step 4: Re-run the chat-runner test and verify pass**

Use the same command and expect PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  scripts/chatbot-v3-real-api-dogfood/chat-runner.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.chat-runner.test.ts

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "feat(chatbot-v3): add real api chat session runner"
```

## Chunk 3: Evaluation, Reporting, And CLI

### Task 5: Implement evaluator rules and run-level rollup

**Files:**
- Create: `scripts/chatbot-v3-real-api-dogfood/evaluator.ts`
- Create: `scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts`

- [ ] **Step 1: Write failing evaluator tests**

Cover at minimum:
- scenario returns `PASS` when all four axes pass
- semantic mismatch returns `SOFT_FAIL`
- wrong access decision or broken continuity returns `HARD_FAIL`
- run-level rollup rules are explicit:
  - any `HARD_FAIL` => run `HARD_FAIL`
  - no hard fails but any `SOFT_FAIL` => run `SOFT_FAIL`
  - all pass => run `PASS`

- [ ] **Step 2: Run the evaluator test and verify it fails**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts
```
Expected: FAIL because evaluator logic does not exist yet.

- [ ] **Step 3: Implement `evaluator.ts`**

Keep rules explicit and small:
- scenario-level result classification
- run-level aggregation
- no hidden heuristics
- clear reason strings for every fail path

- [ ] **Step 4: Re-run evaluator tests and verify pass**

Use the same command and expect PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  scripts/chatbot-v3-real-api-dogfood/evaluator.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.evaluator.test.ts

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "feat(chatbot-v3): add real api dogfood evaluator"
```

### Task 6: Implement reporting, CLI, and package scripts

**Files:**
- Create: `scripts/chatbot-v3-real-api-dogfood/reporting.ts`
- Create: `scripts/chatbot-v3-real-api-dogfood.ts`
- Create: `scripts/__tests__/chatbot-v3-real-api-dogfood.reporting.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing reporting tests**

Cover at minimum:
- artifacts are written under `artifacts/chatbot-v3-real-api-dogfood/<utc-run-id>/`
- files created are exactly:
  - `report.md`
  - `transcripts.json`
  - `bug-backlog.md`
  - `run-metadata.json`
- human-readable outputs redact cookie values
- `run-metadata.json` includes `artifactSchemaVersion=1`

- [ ] **Step 2: Run the reporting test and verify it fails**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot exec tsx --test scripts/__tests__/chatbot-v3-real-api-dogfood.reporting.test.ts
```
Expected: FAIL because reporting and CLI files do not exist yet.

- [ ] **Step 3: Implement `reporting.ts`**

Responsibilities:
- deterministic UTC folder naming
- transcript serialization
- report markdown generation
- bug backlog markdown generation
- safe redaction of cookies and restore tokens

- [ ] **Step 4: Implement `scripts/chatbot-v3-real-api-dogfood.ts`**

Responsibilities:
- load config
- load required v1 scenarios
- run bootstrap + chat + evaluator + reporting
- exit nonzero on run-level `HARD_FAIL`
- print final artifact location and rollup summary

- [ ] **Step 5: Add package scripts**

Add at minimum:
- `dogfood:chatbot-v3:real-api`
- `test:chatbot-v3:real-api-dogfood`

- [ ] **Step 6: Re-run reporting tests and verify pass**

Use the same command and expect PASS.

- [ ] **Step 7: Run one CLI/package-script smoke check**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot run test:chatbot-v3:real-api-dogfood
```
Expected: PASS and the thin entrypoint resolves cleanly through the package scripts.

- [ ] **Step 8: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  scripts/chatbot-v3-real-api-dogfood.ts \
  scripts/chatbot-v3-real-api-dogfood/reporting.ts \
  scripts/__tests__/chatbot-v3-real-api-dogfood.reporting.test.ts \
  package.json

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "feat(chatbot-v3): add real api dogfood reporting"
```

## Chunk 4: Real Deployment Execution And Summary

### Task 7: Run the v1 deployed dogfood pass and capture artifacts

**Files:**
- Modify only if the first real dogfood pass reveals a true implementation bug
- Generate artifacts under `artifacts/chatbot-v3-real-api-dogfood/`

- [ ] **Step 1: Run focused script tests first**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot run test:chatbot-v3:real-api-dogfood
```
Expected: PASS.

- [ ] **Step 2: Run the real deployment dogfood command**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot run dogfood:chatbot-v3:real-api-dogfood
```
Expected:
- artifacts folder printed at the end
- `report.md`, `transcripts.json`, `bug-backlog.md`, `run-metadata.json` written under one UTC run folder
- exit code reflects run-level rollup

- [ ] **Step 3: Inspect the v1 required scenarios only**

Confirm the run contains exactly the required v1 scenarios:
- `blocked_without_prereq`
- `allowed_after_patient_session`
- `intake_to_triage_opening`
- `triage_to_recommendation`
- `recommendation_selected_to_consult`
- `faq_detour_no_progression`
- `handoff_denied_returns_to_current_step`

- [ ] **Step 4: If the real run exposes a genuine bug, fix it narrowly and add a regression test before rerunning**

Do not broaden scope beyond the real failure.

- [ ] **Step 5: Re-run the real deployment dogfood command**

Use the same command and expect a stable result with updated artifacts.

- [ ] **Step 6: Commit any real bug fix separately from runner infrastructure**

Use a bug-specific commit message that names the deployed failure.

### Task 8: Final verification and review

**Files:**
- Modify only if review finds issues

- [ ] **Step 1: Run all runner-focused verification**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot run test:chatbot-v3:real-api-dogfood
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api typecheck
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application typecheck
```
Expected: PASS.

- [ ] **Step 2: Request code review over the dogfood runner diff**

- [ ] **Step 3: Fix any valid findings and re-run verification**

- [ ] **Step 4: Summarize final outputs**

Summarize:
- v1 scenario results
- final run rollup
- artifact location
- any remaining deferred scenarios for a second wave
