# Chatbot V3 FAQ Recognition And Detour Boundary Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FAQ a stage-agnostic detour path across chatbot-v3 so informal or standard FAQ-like questions stop collapsing into triage/workflow continuation, and FAQ misses are answered honestly without rewriting the persisted primary stage.

**Architecture:** Move FAQ recognition from later-stage-only heuristics into a single stage-agnostic routing boundary in the supervisor/control plane. Separate FAQ recognition from FAQ answerability so the system can route a question into FAQ handling even when the FAQ subsystem later returns a miss; on miss, return an explicit FAQ-miss response while preserving the current primary stage.

**Tech Stack:** TypeScript, Hono API routes, chatbot-v3 runtime/supervisor services, FAQ LLM adapter, Vitest, real-api live session probes.

---

## File Map

- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/supervisor.service.ts`
  - Replace later-stage-only FAQ recovery with stage-agnostic FAQ recognition.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/types.ts`
  - Add any minimal structured signal needed to carry FAQ-miss semantics without polluting progression truth.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/runtime.service.ts`
  - Preserve primary stage while allowing FAQ detour in all stages.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/response-composer.ts`
  - Render explicit FAQ-miss text instead of falling back to triage/workflow prompts.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/faq-llm-adapter.ts`
  - Keep the raw FAQ answer payload aligned with the current answer schema, but do not treat this file as the final visible FAQ-miss boundary.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/faq-route-adapter.ts`
  - Thread the FAQ miss/result shape through the route adapter if needed, but do not treat it as the primary answerability boundary.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
  - Add stage-agnostic FAQ recognition tests.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/response-composer.test.ts`
  - Add FAQ-miss rendering tests.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.routes.test.ts`
  - Add end-to-end route regression for early-stage FAQ detours and FAQ misses.
- Optional Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/faq-route-adapter.test.ts`
  - Add adapter-level assertions if FAQ miss/result shape changes.

## Chunk 1: Make FAQ Recognition Stage-Agnostic

### Task 1: Add failing supervisor tests for early-stage FAQ routing

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`

- [ ] **Step 1: Write failing tests for early-stage FAQ recognition**

Add tests covering at least:
- `What are your hours?` in `COLLECT_MINIMAL_MEDICAL_FACTS` should route to FAQ detour
- `do you guys even work on sundays lol` in `COLLECT_MINIMAL_MEDICAL_FACTS` should route to FAQ detour
- `if i already got scans done elsewhere is that okay or annoying for you` in `COLLECT_MINIMAL_MEDICAL_FACTS` should route to FAQ detour
- `I want a human.` must still prefer `HUMAN_HANDOFF`

- [ ] **Step 2: Run the focused supervisor test file and verify failure**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2 exec vitest run packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
Expected: the new early-stage FAQ tests fail because the current logic keeps them in `COLLECT_MINIMAL_MEDICAL_FACTS`.

- [ ] **Step 3: Implement minimal stage-agnostic FAQ recognition**

In `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/supervisor.service.ts`:
- remove the assumption that FAQ detour recovery only applies to later stages
- add a single stage-agnostic FAQ recognition path
- keep explicit handoff higher priority than FAQ
- do not rely on a hard-coded list of FAQ families as the source of truth
- ensure `intent=unknown` does not silently collapse FAQ-like inputs back into `RecordsAgent` in early stage

- [ ] **Step 4: Re-run the focused supervisor tests**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2 exec vitest run packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
Expected: the new early-stage FAQ routing tests pass, and existing later-stage FAQ/handoff tests remain green.

- [ ] **Step 5: Commit Chunk 1**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2 add \
  packages/application/src/services/chatbot-v3/supervisor.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2 commit -m "fix(chatbot-v3): route faq detours from every stage"
```

## Chunk 2: Represent FAQ Miss Explicitly Instead Of Falling Back To Workflow Guidance

### Task 2: Add failing response/runtime tests for FAQ miss behavior

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Optional Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/faq-route-adapter.test.ts`

- [ ] **Step 1: Add failing tests for FAQ miss rendering**

Cover at least:
- a recognized FAQ detour with no reliable FAQ answer must not render `Please answer these 3 follow-up questions...`
- FAQ miss must preserve the existing visible journey stage
- FAQ miss must preserve the persisted primary stage in storage
- FAQ miss in `COLLECT_MEDICAL_INPUTS` must not regress into records-upload guidance unless the user explicitly returns to progression
- the current reliability rule is: cited FAQ ids exist and confidence is not `low`; otherwise treat the result as FAQ miss

- [ ] **Step 2: Run focused API tests and verify failure**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2 exec vitest run apps/api/src/routes/chatbot-v3/response-composer.test.ts apps/api/src/__tests__/chatbot-v3.routes.test.ts apps/api/src/routes/chatbot-v3/faq-route-adapter.test.ts`
Expected: the new FAQ-miss assertions fail because the current flow disguises FAQ miss as workflow continuation.

- [ ] **Step 3: Implement explicit FAQ miss semantics**

In the FAQ path / runtime / response composer:
- keep `faq-llm-adapter.ts` responsible for shaping the raw FAQ answer payload only
- distinguish answer-found from answer-miss at the real visible boundary in `runtime.service.ts` and `response-composer.ts`
- use the explicit reliability rule: answer text is non-empty, cited FAQ ids exist, and confidence is not `low`
- return an explicit FAQ-miss assistant response when category/search does not satisfy that rule
- keep the persisted primary stage unchanged
- do not rewrite FAQ miss into triage or records guidance

- [ ] **Step 4: Re-run focused API tests**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2 exec vitest run apps/api/src/routes/chatbot-v3/response-composer.test.ts apps/api/src/__tests__/chatbot-v3.routes.test.ts apps/api/src/routes/chatbot-v3/faq-route-adapter.test.ts`
Expected: FAQ miss now renders honestly and preserves the current stage.

- [ ] **Step 5: Commit Chunk 2**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2 add \
  apps/api/src/routes/chatbot-v3/response-composer.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts \
  apps/api/src/routes/chatbot-v3/faq-route-adapter.ts \
  apps/api/src/routes/chatbot-v3/faq-route-adapter.test.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts \
  packages/application/src/services/chatbot-v3/types.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2 commit -m "fix(chatbot-v3): respond honestly when faq lookup misses"
```

## Chunk 3: Verify Stage-Preserving FAQ Detours Across The Journey

### Task 3: Add cross-stage regression coverage and live session probes

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Create or update analysis artifact under `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/` after live run

- [ ] **Step 1: Add route-level regressions for FAQ detour preservation**

Cover at least:
- FAQ in `COLLECT_MINIMAL_MEDICAL_FACTS` stays in `COLLECT_MINIMAL_MEDICAL_FACTS`
- FAQ in `RECOMMENDATION` stays in `RECOMMENDATION`
- FAQ in `EXPLAIN_PROCESS` stays in `EXPLAIN_PROCESS`
- FAQ in `COLLECT_MEDICAL_INPUTS` stays in `COLLECT_MEDICAL_INPUTS`
- FAQ in `ONLINE_CONSULT` stays in `ONLINE_CONSULT`
- FAQ in `HUMAN_HANDOFF` stays in `HUMAN_HANDOFF`
- for each case, verify both response `journey.stage` and persisted session stage remain unchanged

- [ ] **Step 2: Run the route test file**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2 exec vitest run apps/api/src/__tests__/chatbot-v3.routes.test.ts`
Expected: all FAQ detour preservation tests pass.

- [ ] **Step 3: Run live sessions and capture per-turn evidence**

Run targeted live sessions that explicitly print/store each turn's:
- user input
- assistant output
- resulting `journey.stage`

Cover at least:
- `What are your hours?`
- `do you guys even work on sundays lol`
- `if i already got scans done elsewhere is that okay or annoying for you`
- `how long are people usually stuck in china for this, roughly`
- `I want a human.`
- one FAQ prompt while already in `HUMAN_HANDOFF`

Expected live results:
- FAQ-like questions no longer collapse into repeated triage prompts by default
- handoff remains higher priority than FAQ
- FAQ asked during `HUMAN_HANDOFF` does not rewrite the persisted handoff stage
- if FAQ cannot answer, response is explicit and honest rather than disguised workflow continuation

- [ ] **Step 4: Commit Chunk 3**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2 add apps/api/src/__tests__/chatbot-v3.routes.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2 commit -m "test(chatbot-v3): cover stage-preserving faq detours"
```

## Verification Checklist

- [ ] `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2 exec vitest run packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- [ ] `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2 exec vitest run apps/api/src/routes/chatbot-v3/response-composer.test.ts apps/api/src/routes/chatbot-v3/faq-route-adapter.test.ts apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- [ ] `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2 --filter @medical-crm/application typecheck`
- [ ] `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2 --filter @medical-crm/api typecheck`
- [ ] live targeted session transcript confirms FAQ detour or honest FAQ miss in early stage

## Notes For Implementers

- Do not reintroduce stage-specific FAQ availability. The new contract is all-stage FAQ capability.
- Do not solve this by adding a growing hard-coded list of FAQ families inside supervisor logic.
- Do not fake answers on FAQ miss. Explicit uncertainty is the intended product behavior.
- Use the existing FAQ answerability boundary explicitly: answer text must be non-empty, cited FAQ ids must exist, and confidence must not be `low`.
- Do not let FAQ miss rewrite the persisted primary stage.
- Explicit human request remains higher priority than FAQ.
