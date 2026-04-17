# Chatbot V3 System Session Test Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive multi-turn session tests that exercise the shipped supervisor-led `chatbot-v3` journey as real end-to-end public-chat conversations instead of isolated single-turn assertions.

**Architecture:** Reuse the current public route mounting harness and mocked services, but introduce a small session-driver helper so tests can express full user journeys turn by turn. Focus on canonical journey continuity, non-progressing FAQ/resource detours, revisit/repeat loops, and failure/recovery behavior across committed turns.

**Tech Stack:** TypeScript, Vitest, Hono app mounting tests, current `chatbot-v3` public route runtime, existing mocked repositories/services in `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`.

---

## Scope

This plan is for **system-style automated session coverage** of the current supervisor-led implementation.

It does **not** replace unit tests for runtime/authority/composer.

It does:

- add true multi-turn session scripts over `POST /api/v3/chatbot/chat`
- prove persisted state continuity across full journey segments
- prove non-progressing detours do not auto-advance the main journey
- prove revisit/repeat loops remain canonical and recoverable
- prove degraded turns and later recovery behave correctly across committed sessions

## File Map

### Existing files to modify

- `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
  - Add comprehensive session-driven route tests using a shared driver instead of only one-off requests.
- `docs/analysis/2026-04-15-chatbot-v3-post-plan-remaining-gaps.md`
  - Update if system-session coverage closes any remaining eval/debug maturity follow-up wording.

### New files to create

- `apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts`
  - Lightweight helper for sequential public-route turns, shared cookies/headers, and reading response snapshots across a scripted session.
- `docs/analysis/2026-04-17-chatbot-v3-system-session-matrix.md`
  - Explicit matrix of canonical session scenarios, expected journey stage continuity, and failure/recovery expectations.

---

## Chunk 1: Session Harness

### Task 1: Add a reusable multi-turn session driver for public-route tests

**Files:**
- Create: `apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`

- [ ] **Step 1: Write the failing test shape first**

Add one mounting test that expresses a two-turn session through a helper instead of manually duplicating request boilerplate.

- [ ] **Step 2: Run the targeted mounting test to confirm the helper does not exist yet**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts
```
Expected: FAIL until the helper and first converted test exist.

- [ ] **Step 3: Implement the minimal session driver**

The helper should:
- send sequential `POST /api/v3/chatbot/chat` turns
- preserve the same `sessionId`
- preserve or override cookies/headers per turn
- return parsed response bodies plus status for assertions
- stay tiny and test-focused, not become a second runtime

- [ ] **Step 4: Re-run the mounting test and verify pass**

Use the same command and expect PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec add \
  apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec commit -m "test(chatbot-v3): add public session driver"
```

---

## Chunk 2: Canonical Journey Sessions

### Task 2: Add full canonical and near-canonical session scripts

**Files:**
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
- Create: `docs/analysis/2026-04-17-chatbot-v3-system-session-matrix.md`

- [ ] **Step 1: Write failing session tests for the highest-value journey scripts**

Add scripted sessions covering at minimum:
- upload-first -> minimal triage -> recommendation on later turn
- recommendation -> explain process -> collect medical inputs continuity
- recommendation selected + explained -> online consult continuity
- direct human request after prerequisites -> handoff continuity

Each test should assert both user-visible response and persisted status continuity between turns.

- [ ] **Step 2: Run the targeted mounting test file and verify failures**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts
```
Expected: FAIL until the new session scripts and any tiny harness glue are complete.

- [ ] **Step 3: Implement the smallest supporting test-only changes required**

Prefer only test/harness changes. If a session exposes a real shipped gap, fix it narrowly and document it in the matrix.

- [ ] **Step 4: Add the system session matrix document**

Document for each scripted journey:
- initial state assumptions
- user turn sequence
- expected stage sequence
- expected persisted truth continuity
- whether it is a happy path, revisit path, or degraded/recovery path

- [ ] **Step 5: Re-run mounting tests and verify pass**

Use the same command and expect PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec add \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts \
  docs/analysis/2026-04-17-chatbot-v3-system-session-matrix.md

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec commit -m "test(chatbot-v3): add canonical session scripts"
```

---

## Chunk 3: Detour, Repeat, And Recovery Sessions

### Task 3: Add non-progressing detours and degraded-recovery session scripts

**Files:**
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
- Modify: `docs/analysis/2026-04-15-chatbot-v3-post-plan-remaining-gaps.md`

- [ ] **Step 1: Write failing detour/recovery session tests first**

Add scripted sessions covering at minimum:
- FAQ/resource-only detour that does **not** auto-advance the main journey
- recommendation revisit / compare / explain loop that stays canonical
- repeat explain request after already explained path
- degraded recommendation or consult turn followed by successful retry on a later turn
- handoff denied detour that returns to the correct current step without corrupting journey truth

- [ ] **Step 2: Run the mounting test file to verify the new scenarios fail first**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts
```
Expected: FAIL until coverage and any real bug fixes land.

- [ ] **Step 3: Implement the minimal fixes required by real session gaps**

Keep fixes narrow. If the runtime is already correct, only strengthen tests.

- [ ] **Step 4: Update remaining-gaps analysis if coverage meaningfully closes the eval/debug backlog**

Only change the wording that is actually affected by the new system-session coverage.

- [ ] **Step 5: Re-run mounting tests plus api typecheck**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec add \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts \
  docs/analysis/2026-04-15-chatbot-v3-post-plan-remaining-gaps.md

git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec commit -m "test(chatbot-v3): add detour and recovery sessions"
```

---

## Chunk 4: Final Verification And Review

### Task 4: Run the full session-focused verification loop

**Files:**
- Modify only if review finds issues

- [ ] **Step 1: Run targeted api verification**

```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.observability.test.ts src/routes/chatbot-v3/response-composer.test.ts
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec --filter @medical-crm/api typecheck
```

- [ ] **Step 2: Request code review over the session-testing diff**
- [ ] **Step 3: Fix any valid findings and re-run verification**
- [ ] **Step 4: Summarize which session classes are covered vs still best left to manual or staging QA**
