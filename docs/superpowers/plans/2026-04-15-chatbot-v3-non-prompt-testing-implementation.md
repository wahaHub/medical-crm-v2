# Chatbot V3 Non-Prompt Testing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate deployed `chatbot-v3` end to end for non-prompt failures before prompt-heavy tuning begins.

**Architecture:** This plan executes the non-prompt testing design in four layers: smoke, regression, staging acceptance, and manual exploratory. The implementation emphasizes evidence collection, deterministic pass/fail criteria, and strict stop conditions so runtime, state, auth, tool, and observability failures are fixed before prompt tuning starts.

**Tech Stack:** Node API on Lightsail, admin/hospital Next.js BFF routes on Vercel, Hono API routes, existing Vitest test suites, curl/ssh/jq/bash tooling, Lightsail systemd logs, OpenAI-backed FAQ adapter.

---

## File Structure

The following files should be created or modified by this plan.

- Create: `docs/analysis/2026-04-15-chatbot-v3-smoke-checklist.md`
  - Manual and semi-automated smoke checklist for deployed v3
- Create: `docs/analysis/2026-04-15-chatbot-v3-regression-matrix.md`
  - Case-by-case regression matrix with evidence fields and failure buckets
- Create: `docs/analysis/2026-04-15-chatbot-v3-staging-acceptance-runbook.md`
  - Production-like validation runbook for live FAQ, journey, auth, and observability
- Create: `docs/analysis/2026-04-15-chatbot-v3-manual-exploratory-checklist.md`
  - Human exploratory checklist for UX and stage/card coherence
- Create: `docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md`
  - Standard format for mapping failures into root-cause buckets
- Modify: `README.md`
  - Add a short "v3 non-prompt validation" section pointing to the above docs

No runtime code changes are part of this plan. This plan creates the testing operating system around the current deployment.

## Chunk 1: Build The Testing Documents

### Task 1: Add smoke checklist

**Files:**
- Create: `docs/analysis/2026-04-15-chatbot-v3-smoke-checklist.md`

- [ ] **Step 1: Write the smoke checklist document**

Include exact checks for:

- API health
- `/api/v3/chatbot/chat`
- admin BFF proxy
- hospital BFF proxy
- new session bootstrap
- existing session restore
- runtime debug visibility
- node event visibility
- FAQ env visibility
- idempotency replay

- [ ] **Step 2: Include exact command snippets**

Add explicit commands for:

```bash
curl -fsS https://crmapi.medicaltourismchina.health/health
```

```bash
ssh -i "$SSH_KEY_PATH" ubuntu@44.253.141.97 'sudo journalctl -u medora-crm-v2-api -n 200 --no-pager'
```

Add placeholders for v3 POST request bodies and expected evidence.

- [ ] **Step 3: Add stop conditions**

Document that any failed smoke case blocks deeper testing and must be classified as:

- deploy/env
- proxy/bff
- auth/session
- runtime boot
- observability boot

- [ ] **Step 4: Commit**

```bash
git add docs/analysis/2026-04-15-chatbot-v3-smoke-checklist.md
git commit -m "docs(chatbot-v3): add smoke validation checklist"
```

### Task 2: Add regression matrix

**Files:**
- Create: `docs/analysis/2026-04-15-chatbot-v3-regression-matrix.md`

- [ ] **Step 1: Write the regression matrix skeleton**

Create sections for:

- authority and journey
- fact commit and replay
- dispatch and tools
- fallback and error handling
- composer and contract
- idempotency and concurrency

- [ ] **Step 2: Expand all `R-*` cases into rows**

For each row include:

- case id
- preconditions
- request
- expected user-visible result
- expected runtime result
- required evidence
- failure bucket

- [ ] **Step 3: Add reusable evidence template**

Embed a copy/paste block:

```text
Case ID:
Preconditions:
Request:
Expected visible result:
Expected runtime result:
Evidence:
Pass/Fail:
Failure bucket:
Notes:
```

- [ ] **Step 4: Commit**

```bash
git add docs/analysis/2026-04-15-chatbot-v3-regression-matrix.md
git commit -m "docs(chatbot-v3): add regression evidence matrix"
```

## Chunk 2: Build Staging And Manual Runbooks

### Task 3: Add staging acceptance runbook

**Files:**
- Create: `docs/analysis/2026-04-15-chatbot-v3-staging-acceptance-runbook.md`

- [ ] **Step 1: Write the staging execution order**

Document the wave order:

1. smoke
2. runtime regression
3. error/composer regression
4. staging acceptance
5. manual exploratory

- [ ] **Step 2: Add live FAQ validation section**

Cover:

- FAQ hit
- FAQ ambiguous query
- FAQ no exact match
- FAQ with hospital page context
- FAQ timeout
- FAQ invalid model output
- FAQ metadata visibility

Include exact env assumptions:

- `CHATBOT_V3_FAQ_LLM_ENABLED=true`
- `OPENAI_API_KEY` present on Lightsail

- [ ] **Step 3: Add full journey staging section**

Cover:

- explain -> collect -> recommendation
- collect -> recommendation -> consult
- denied jumps
- recommendation pick persistence
- handoff success
- handoff denial

- [ ] **Step 4: Add auth/session/observability sections**

Include checks for:

- anonymous/public path
- patient cookie path
- wrong session secret
- missing session secret
- admin/hospital cookie forwarding
- `traceId`
- node events
- `turn_summary`
- FAQ LLM metadata

- [ ] **Step 5: Commit**

```bash
git add docs/analysis/2026-04-15-chatbot-v3-staging-acceptance-runbook.md
git commit -m "docs(chatbot-v3): add staging acceptance runbook"
```

### Task 4: Add manual exploratory checklist

**Files:**
- Create: `docs/analysis/2026-04-15-chatbot-v3-manual-exploratory-checklist.md`

- [ ] **Step 1: Write `M1-M6` as explicit prompts**

Each exploratory case should specify:

- user path
- what to observe
- what counts as minor
- what counts as blocker

- [ ] **Step 2: Separate UX polish from logic blockers**

Document that the following are blockers even in manual exploratory:

- stage mismatch
- wrong card
- silent failed action
- inconsistent handoff state
- broken persistence between turns

- [ ] **Step 3: Commit**

```bash
git add docs/analysis/2026-04-15-chatbot-v3-manual-exploratory-checklist.md
git commit -m "docs(chatbot-v3): add manual exploratory checklist"
```

## Chunk 3: Standardize Triage And README Handoff

### Task 5: Add failure triage template

**Files:**
- Create: `docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md`

- [ ] **Step 1: Write the root-cause buckets**

Include:

- `runtime-authority`
- `fact-commit`
- `dispatch/tool`
- `fallback/error-handling`
- `response-composer`
- `frontend/bff/session`
- `prompt/semantic`

- [ ] **Step 2: Add a triage worksheet**

Use this exact layout:

```text
Failure ID:
Case ID:
Symptom:
Visible result:
Runtime result:
State before/after:
Node events:
Most likely boundary of failure:
Primary bucket:
Secondary bucket:
Immediate next action:
Can prompt tuning proceed? yes/no
```

- [ ] **Step 3: Explain the prompt-tuning gate**

Document:

- prompt tuning is blocked until smoke is green
- prompt tuning is blocked while authority/fact/dispatch/composer failures remain
- prompt tuning starts only when remaining failures are mostly semantic

- [ ] **Step 4: Commit**

```bash
git add docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md
git commit -m "docs(chatbot-v3): add failure triage template"
```

### Task 6: Add README handoff section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a short v3 validation section**

Document:

- current v3 deployment can be validated before prompt tuning
- primary docs to run are the four new analysis docs
- smoke/regression/staging/manual wave order

- [ ] **Step 2: Keep README minimal**

Do not duplicate all matrices in README. Only link to:

- non-prompt testing design spec
- smoke checklist
- regression matrix
- staging runbook
- manual exploratory checklist

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(chatbot-v3): add v3 non-prompt validation handoff"
```

## Chunk 4: Execute The First Validation Pass

### Task 7: Run smoke wave and record evidence

**Files:**
- Use: `docs/analysis/2026-04-15-chatbot-v3-smoke-checklist.md`
- Use: `docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md`

- [ ] **Step 1: Run all `S*` checks**

Run the exact commands documented in the smoke checklist.

- [ ] **Step 2: Record evidence**

Capture:

- responses
- headers
- logs
- runtime debug
- trace ids

- [ ] **Step 3: Stop on any failure**

If any `S*` check fails, create a triage record before continuing.

- [ ] **Step 4: Commit results document updates**

```bash
git add docs/analysis/2026-04-15-chatbot-v3-smoke-checklist.md \
  docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md
git commit -m "docs(chatbot-v3): record first smoke validation pass"
```

### Task 8: Run regression waves and classify failures

**Files:**
- Use: `docs/analysis/2026-04-15-chatbot-v3-regression-matrix.md`
- Use: `docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md`

- [ ] **Step 1: Run `R-A*`, `R-F*`, `R-D*`, `R-I*`**

Follow the matrix in order and record evidence for each high-risk case.

- [ ] **Step 2: Run `R-E*`, `R-C*`**

Record which failures are:

- fallback/runtime
- composer
- contract

- [ ] **Step 3: Mark prompt-tuning gate**

At the end of regression, explicitly state one of:

- `PROMPT TUNING BLOCKED`
- `PROMPT TUNING CONDITIONALLY OPEN`

- [ ] **Step 4: Commit results document updates**

```bash
git add docs/analysis/2026-04-15-chatbot-v3-regression-matrix.md \
  docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md
git commit -m "docs(chatbot-v3): record first regression validation pass"
```

## Chunk 5: Execute Staging Acceptance And Manual Review

### Task 9: Run staging acceptance wave

**Files:**
- Use: `docs/analysis/2026-04-15-chatbot-v3-staging-acceptance-runbook.md`
- Use: `docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md`

- [ ] **Step 1: Run live FAQ acceptance**

Execute:

- `A-FQ1` through `A-FQ7`

- [ ] **Step 2: Run full journey acceptance**

Execute:

- `A-J1` through `A-J6`

- [ ] **Step 3: Run auth/session/observability acceptance**

Execute:

- `A-S1` through `A-S6`
- `A-O1` through `A-O6`

- [ ] **Step 4: Summarize blockers**

At the end of the staging runbook, produce a short summary:

- blocker count
- non-blocker count
- top failure bucket
- prompt-tuning gate status

- [ ] **Step 5: Commit results document updates**

```bash
git add docs/analysis/2026-04-15-chatbot-v3-staging-acceptance-runbook.md \
  docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md
git commit -m "docs(chatbot-v3): record first staging acceptance pass"
```

### Task 10: Run manual exploratory wave

**Files:**
- Use: `docs/analysis/2026-04-15-chatbot-v3-manual-exploratory-checklist.md`
- Use: `docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md`

- [ ] **Step 1: Run `M1-M6`**

Use real UI entry points and capture screenshots or short notes per case.

- [ ] **Step 2: Separate blockers from polish**

Any logic/state/chain issue is a blocker. Only UX copy/feel issues may remain as polish.

- [ ] **Step 3: Produce release-readiness summary**

Write a short result section at the bottom of the checklist:

- `ready for prompt tuning`
- `ready for limited live testing`
- `not ready`

- [ ] **Step 4: Commit results document updates**

```bash
git add docs/analysis/2026-04-15-chatbot-v3-manual-exploratory-checklist.md \
  docs/analysis/2026-04-15-chatbot-v3-failure-triage-template.md
git commit -m "docs(chatbot-v3): record first manual exploratory pass"
```

## Review Loop Notes

After each chunk:

- run a document review pass if a reviewer is available
- fix any structural issues in the docs before executing the next chunk

This plan is intentionally documentation-first so the testing process becomes repeatable instead of living in chat history.

Plan complete and saved to `docs/superpowers/plans/2026-04-15-chatbot-v3-non-prompt-testing-implementation.md`. Ready to execute?
