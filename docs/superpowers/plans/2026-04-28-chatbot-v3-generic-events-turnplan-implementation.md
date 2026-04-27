# Chatbot V3 Generic Events TurnPlan Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace chatbot-v3's legacy semantic event and single-action reducer model with generic semantic events, `TurnPlan`, deterministic agent resolution, runtime skill loading, read planning, and stronger response contracts.

**Architecture:** The application package owns control-plane truth: event types, reducer, `TurnPlan`, agent resolution, skill routing, read planning, and runtime authority. The API package adapts those decisions into existing physical agents, response composition, LLM schemas, tool reads, and persistence write-back. This is a direct replacement: old semantic event names and old workflow action names should not remain in prompts, reducer outputs, projection assertions, or new tests.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, `@medical-crm/application`, `@medical-crm/api`, chatbot-v3 route adapters and runtime service.

---

## Reference Documents

- Spec: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/docs/superpowers/specs/2026-04-27-chatbot-v3-generic-events-turnplan-design.md`
- Current control-plane types: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/supervisor-event.types.ts`
- Current reducer: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/journey-reducer.ts`
- Current read planner: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/read-planner.ts`
- Current API runtime: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Current worker tasks: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/worker-task.ts`

## Design Decisions To Preserve

- `USER_ASKED_NEXT_STEP` is retired as an event type, but the semantic signal is preserved as `USER_ASKED_QUESTION`, `target=next_step`, `modifier=ask`.
- Recommendation revisit/refinement details such as "上海的", "更便宜的", or "换一批" are not structured into supervisor metadata in Phase 1.1. RecommendationAgent receives those details through `latestUserMessage`, `conversationSummary`, facts, and retrieved context.
- `nextAction` may survive only as a legacy debug label during rollout. It must not participate in runtime decision-making, authority, stage projection, or write-back.
- `contact` remains an event target, not an `INVITE_NEXT_STEP` target. Direct contact information still routes toward handoff/human behavior for Phase 1.1.

## File Structure

Modify:

- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/supervisor-event.types.ts`
  Owns generic event taxonomy, targets, modifiers, `PrimaryAction`, `FollowUpAction`, `TurnPlan`, `ResponseContract`, and shared domain facts.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/deterministic-event-extractor.ts`
  Keeps deterministic events stable and maps attachments/actions into generic-compatible `SupervisorEvent`.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/supervisor.service.ts`
  Normalizes deterministic and LLM event extraction to the new generic event shape.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/journey-reducer.ts`
  Produces `TurnPlan` instead of legacy `nextAction`; enforces process overview invariant.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
  Validates `TurnPlan`, prepares write-back, and enforces `process.explained` authority.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/read-planner.ts`
  Replaces legacy action-domain mapping with `ReadIntent[]`.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/types.ts`
  Updates exported dispatch/decision compatibility types only where required.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
  Removes or narrows legacy compatibility paths so canonical runtime uses `TurnPlan`.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/legacy-compatibility-view.ts`
  Either delete if no callers remain or reduce to a debug-only projection that mirrors `TurnPlan`.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`
  Updates semantic supervisor prompt and classification guide to generic events.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.ts`
  Updates strict schema to `eventType`, `target`, `modifier`, `confidence`.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/worker-task.ts`
  Imports application-owned `AgentTask`, `LoadedSkillPack`, and `ResponseContract`; defines only API physical adapter/worker-task translation shapes and maps application tasks into existing worker tasks.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/runtime.service.ts`
  Integrates normalize -> event -> reducer -> authority -> resolver -> skills -> read planner -> executor -> task builder -> agent -> composer -> persistence write-back.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/response-composer.ts`
  Uses `TurnPlan`/`ResponseContract` for render paths and debug projection.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/faq-prompts.ts`
  Accepts response contract, forbidden claims, and retrieved FAQ/hospital context.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/agents.ts`
  Uses `AgentTask` and retrieved context without giving agents authority to tools beyond runtime-planned reads.

Create:

- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/agent-resolver.ts`
  Deterministic `resolveAgent()` implementation and `ResolvedAgent` types.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-packs.ts`
  Code-defined skill registry, `SkillKind`, `SkillPackId`, `SkillRequest`, `LoadedSkillPack`.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-router.ts`
  Deterministic mapping from event + turn plan + agent + facts to skill requests.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-loader.ts`
  Resolves skill requests into loaded code-defined skills, caps results, dedupes, emits warnings, and adds safe fallback skills without performing data reads.
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/task-builder.ts`
  Builds application-level `AgentTask` and `ResponseContract`.

Test:

- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/journey-reducer.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/agent-resolver.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts`

Validation commands:

- `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3`
- `pnpm --filter @medical-crm/application typecheck`
- `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3 src/__tests__/chatbot-v3.routes.test.ts`
- `pnpm --filter @medical-crm/api typecheck`
- `pnpm test:chatbot-v3-baseline-shell`

Known current caveat:

- `pnpm --filter @medical-crm/api typecheck` may expose unrelated pre-existing API errors. If still present, record the exact failing files and do not hide them.

---

## Chunk 1: Generic Supervisor Event Taxonomy

### Task 1: Replace legacy semantic event types with generic event taxonomy

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/supervisor-event.types.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts`

- [ ] **Step 1: Write failing tests for retired semantic events**

Update the test so it asserts:

```ts
expect(SUPERVISOR_EVENT_TYPES).toEqual(expect.arrayContaining([
  'TRIAGE_SUBMITTED',
  'TRIAGE_SKIPPED',
  'RECOMMENDATION_SELECTED',
  'RECOMMENDATION_SKIPPED',
  'DOCUMENTS_UPLOADED',
  'USER_EXPRESSED_NEED',
  'USER_ASKED_QUESTION',
  'USER_PROVIDED_INFORMATION',
  'USER_RESPONDED_TO_REQUEST',
  'USER_REQUESTED_HUMAN',
  'USER_ASKED_RISKY_MEDICAL_ADVICE',
  'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
  'USER_MESSAGE_UNCLEAR',
]));

expect(SUPERVISOR_EVENT_TYPES).not.toContain('USER_ASKED_FAQ');
expect(SUPERVISOR_EVENT_TYPES).not.toContain('USER_ASKED_NEXT_STEP');
expect(SUPERVISOR_EVENT_TYPES).not.toContain('USER_WANTS_TREATMENT_IN_CHINA');
expect(SUPERVISOR_EVENT_TYPES).not.toContain('USER_PROVIDED_CONTACT_INFO');
expect(SUPERVISOR_EVENT_TYPES).not.toContain('UNKNOWN_MESSAGE');
```

Also assert `SupervisorEvent` accepts:

```ts
const event: SupervisorEvent = {
  eventType: 'USER_ASKED_QUESTION',
  target: 'pricing',
  modifier: 'ask',
  confidence: 0.92,
  source: 'llm',
};
expect(event.target).toBe('pricing');
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts
```

Expected: FAIL because generic event types, targets, and modifiers are not defined yet.

- [ ] **Step 3: Implement generic event types**

In `supervisor-event.types.ts`:

```ts
export const DETERMINISTIC_SUPERVISOR_EVENT_TYPES = [
  'TRIAGE_SUBMITTED',
  'TRIAGE_SKIPPED',
  'RECOMMENDATION_SELECTED',
  'RECOMMENDATION_SKIPPED',
  'DOCUMENTS_UPLOADED',
] as const;

export const SEMANTIC_SUPERVISOR_EVENT_TYPES = [
  'USER_EXPRESSED_NEED',
  'USER_ASKED_QUESTION',
  'USER_PROVIDED_INFORMATION',
  'USER_RESPONDED_TO_REQUEST',
  'USER_REQUESTED_HUMAN',
  'USER_ASKED_RISKY_MEDICAL_ADVICE',
  'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
  'USER_MESSAGE_UNCLEAR',
] as const;

export const SUPERVISOR_EVENT_TYPES = [
  ...DETERMINISTIC_SUPERVISOR_EVENT_TYPES,
  ...SEMANTIC_SUPERVISOR_EVENT_TYPES,
] as const;
```

Add:

```ts
export type SupervisorEventTarget =
  | 'treatment'
  | 'recommendation'
  | 'documents'
  | 'consult'
  | 'pricing'
  | 'next_step'
  | 'process'
  | 'travel'
  | 'payment'
  | 'hospital'
  | 'hospital_selection'
  | 'medical_facts'
  | 'contact'
  | 'human'
  | 'unknown';

export type SupervisorEventModifier =
  | 'ask'
  | 'provide'
  | 'confirm'
  | 'reject'
  | 'hesitate'
  | 'revisit'
  | 'unknown';
```

Update `SupervisorEvent`:

```ts
export interface SupervisorEvent {
  eventType: SupervisorEventType;
  confidence: number;
  source: SupervisorEventSource;
  target?: SupervisorEventTarget;
  modifier?: SupervisorEventModifier;
  metadata?: SupervisorEventMetadata;
}
```

Remove `timeline` from FAQ-style target usage; timing maps to `process`.

- [ ] **Step 4: Update allowed semantic events**

Change `getAllowedSupervisorEvents()` so semantic LLM allowed events are generic only:

```ts
const commonSemanticEvents: SupervisorEventType[] = [
  'USER_ASKED_QUESTION',
  'USER_PROVIDED_INFORMATION',
  'USER_RESPONDED_TO_REQUEST',
  'USER_REQUESTED_HUMAN',
  'USER_ASKED_RISKY_MEDICAL_ADVICE',
  'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
  'USER_MESSAGE_UNCLEAR',
];
```

Stage-specific events should only add `USER_EXPRESSED_NEED` and contextually useful generic events, not old names.

- [ ] **Step 5: Run test and verify pass**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/services/chatbot-v3/supervisor-event.types.ts \
  packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts
git commit -m "feat(chatbot-v3): define generic supervisor events"
```

### Task 2: Convert deterministic extractor to emit generic-compatible events

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/deterministic-event-extractor.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts`

- [ ] **Step 1: Write failing tests**

Assert deterministic events still work:

```ts
expect(extractDeterministicEvent({ attachments: [{ name: 'MRI.pdf' }] })?.eventType)
  .toBe('DOCUMENTS_UPLOADED');
expect(extractDeterministicEvent({ message: '能不能让顾问联系我' })?.eventType)
  .toBe('USER_REQUESTED_HUMAN');
```

Assert FAQ-like text does not produce deterministic events:

```ts
expect(extractDeterministicEvent({ message: '大概多少钱？' })).toBeNull();
expect(extractDeterministicEvent({ message: '流程是什么？' })).toBeNull();
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts
```

Expected: FAIL if helper signatures or expected old events still differ.

- [ ] **Step 3: Implement minimal deterministic updates**

Keep deterministic-only events unchanged. For human phrases, emit:

```ts
{
  eventType: 'USER_REQUESTED_HUMAN',
  target: 'human',
  modifier: 'ask',
  confidence: 1,
  source: 'deterministic',
}
```

For documents:

```ts
{
  eventType: 'DOCUMENTS_UPLOADED',
  target: 'documents',
  modifier: 'provide',
  confidence: 1,
  source: 'deterministic',
  metadata: { documentCount },
}
```

- [ ] **Step 4: Run deterministic extractor tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/deterministic-event-extractor.ts \
  packages/application/src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts
git commit -m "feat(chatbot-v3): emit generic deterministic events"
```

---

## Chunk 2: Semantic Supervisor Prompt And Route Adapter

### Task 3: Update supervisor prompt to classify generic event + target + modifier

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Assert prompt includes:

```ts
expect(prompt).toContain('USER_EXPRESSED_NEED');
expect(prompt).toContain('USER_PROVIDED_INFORMATION');
expect(prompt).toContain('USER_RESPONDED_TO_REQUEST');
expect(prompt).toContain('target');
expect(prompt).toContain('modifier');
```

Assert prompt excludes retired semantic names and full supporting document paths:

```ts
expect(prompt).not.toContain('USER_ASKED_FAQ');
expect(prompt).not.toContain('USER_WANTS_TREATMENT_IN_CHINA');
expect(prompt).not.toContain('Conversation Summary Contract');
expect(prompt).not.toContain('/tmp/');
```

- [ ] **Step 2: Run failing prompt tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/supervisor-prompt.test.ts
```

Expected: FAIL until prompt is rewritten.

- [ ] **Step 3: Implement prompt guide**

Prompt should say:

```text
Your only job is to classify the latest user message into one allowed eventType, target, and modifier.
Return exactly one JSON object matching the provided schema.
Choose values only from the allowed lists.
```

Include concise distinctions:

- `USER_EXPRESSED_NEED`: user asks for a result/service/goal.
- `USER_PROVIDED_INFORMATION`: user gives facts, preferences, records, or contact info.
- `USER_RESPONDED_TO_REQUEST`: user replies to previous assistant request/CTA; use `lastQuestion` or previous follow-up.

Minimal context only:

```text
current_stage=...
latest_user_message=...
conversation_summary=...
last_question_type=...
last_question_expected_answer_type=...
known_condition=...
known_destination=...
recommendation_status=...
process_explained=...
supporting_documents_count=...
```

- [ ] **Step 4: Run prompt tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/supervisor-prompt.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/supervisor-prompt.ts \
  apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts
git commit -m "feat(chatbot-v3): prompt generic supervisor events"
```

### Task 4: Update route adapter strict schema

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts`

- [ ] **Step 1: Write failing adapter schema tests**

Expected schema:

```ts
expect(schema.required).toEqual(['eventType', 'target', 'modifier', 'confidence']);
expect(schema.properties.eventType.enum).toContain('USER_ASKED_QUESTION');
expect(schema.properties.target.type).toBe('string');
expect(schema.properties.modifier.type).toBe('string');
expect(schema.properties.target).not.toHaveProperty('enum');
expect(schema.properties.modifier).not.toHaveProperty('enum');
expect(schema.properties).not.toHaveProperty('source');
expect(schema.properties).not.toHaveProperty('metadata');
```

Expected invalid outputs:

```ts
// deterministic-only from LLM
{ eventType: 'TRIAGE_SUBMITTED', target: 'medical_facts', modifier: 'provide', confidence: 1 }

// old semantic event
{ eventType: 'USER_ASKED_FAQ', target: 'pricing', modifier: 'ask', confidence: 1 }

// extra fields
{ eventType: 'USER_ASKED_QUESTION', target: 'pricing', modifier: 'ask', confidence: 0.9, suggestedStage: 'RECOMMENDATION' }
```

All should retry once and then fallback to:

```ts
{
  eventType: 'USER_MESSAGE_UNCLEAR',
  target: 'unknown',
  modifier: 'unknown',
  confidence: 0,
  source: 'fallback_unknown',
}
```

Expected normalization without retry/fallback:

```ts
await expect(adapter?.run(outputting({
  eventType: 'USER_ASKED_QUESTION',
  target: 'budget',
  modifier: 'ask',
  confidence: 0.8,
}))).resolves.toEqual({
  eventType: 'USER_ASKED_QUESTION',
  target: 'unknown',
  modifier: 'ask',
  confidence: 0.8,
  source: 'llm',
});

await expect(adapter?.run(outputting({
  eventType: 'USER_EXPRESSED_NEED',
  target: 'recommendation',
  modifier: 'refine',
  confidence: 0.8,
}))).resolves.toEqual({
  eventType: 'USER_EXPRESSED_NEED',
  target: 'recommendation',
  modifier: 'unknown',
  confidence: 0.8,
  source: 'llm',
});
```

- [ ] **Step 2: Run failing adapter tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/supervisor-route-adapter.test.ts
```

Expected: FAIL until schema and fallback change.

- [ ] **Step 3: Implement strict schema**

Adapter should parse LLM output with:

```ts
{
  eventType: semanticAllowedEvents,
  target: string,
  modifier: string,
  confidence: number between 0 and 1
}
```

`target` and `modifier` must pass shape validation as strings, then the adapter allowlist-normalizes them. Do not put `target` or `modifier` behind JSON-schema enum validation, because invalid strings must normalize to `unknown` without retry/fallback.

Adapter appends:

```ts
source: 'llm'
```

Normalize:

- invalid/unknown `target` -> `target: 'unknown'`
- invalid/unknown `modifier` -> `modifier: 'unknown'`

Reject and retry/fallback:

- deterministic-only event type
- old semantic event type
- confidence outside `[0, 1]`
- `source`, `metadata`, `suggestedStage`, `dispatchAgent`, `task`, or any additional property

- [ ] **Step 4: Run adapter tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/supervisor-route-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/supervisor-route-adapter.ts \
  apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts
git commit -m "feat(chatbot-v3): enforce generic supervisor schema"
```

---

## Chunk 3: TurnPlan Reducer And Runtime Authority

### Task 5: Replace `NextAction` with generic `PrimaryAction`, `FollowUpAction`, and `TurnPlan`

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/supervisor-event.types.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/journey-reducer.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/journey-reducer.test.ts`

- [ ] **Step 1: Write failing reducer tests for core deterministic paths**

Replace old `nextAction` assertions with `turnPlan.primaryAction`:

```ts
expect(result.turnPlan.primaryAction).toEqual({ type: 'PRESENT_OPTIONS', target: 'hospital' });
expect(result.turnPlan.primaryStage).toBe('RECOMMENDATION');
expect(result.turnPlan.factsPatch.intake?.minimalTriageStatus).toBe('submitted');
```

For recommendation selection requiring formal process:

```ts
expect(result.turnPlan.primaryAction).toEqual({
  type: 'ANSWER',
  target: 'process',
  mode: 'formal_overview',
});
expect(result.turnPlan.primaryStage).toBe('EXPLAIN_PROCESS');
```

For documents:

```ts
expect(result.turnPlan.primaryAction).toEqual({ type: 'REQUEST_INFO', target: 'documents' });
expect(result.turnPlan.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
```

- [ ] **Step 2: Run failing reducer tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-reducer.test.ts
```

Expected: FAIL because reducer still returns legacy `nextAction`.

- [ ] **Step 3: Add action and TurnPlan types**

In `supervisor-event.types.ts`:

```ts
export type PrimaryAction =
  | { type: 'ANSWER'; target: SupervisorEventTarget; mode?: 'faq' | 'formal_overview' }
  | { type: 'ACKNOWLEDGE'; target: SupervisorEventTarget }
  | { type: 'CLARIFY'; target?: SupervisorEventTarget; reasonCode: 'ambiguous_message' | 'missing_context' | 'low_confidence' | 'unclear_last_reply' }
  | { type: 'REQUEST_INFO'; target: 'minimal_triage' | 'medical_facts' | 'documents' | 'preference'; questionKey?: string }
  | { type: 'PRESENT_OPTIONS'; target: 'hospital' | 'consult' }
  | { type: 'HANDLE_RESPONSE'; target: SupervisorEventTarget; modifier: SupervisorEventModifier }
  | { type: 'REDIRECT'; target: SupervisorEventTarget; reasonCode: 'out_of_scope' | 'medical_safety' | 'cannot_do' }
  | { type: 'ESCALATE'; target: 'human'; reasonCode?: string };

export type FollowUpAction =
  | { type: 'INVITE_NEXT_STEP'; target: 'minimal_triage' | 'recommendation' | 'documents' | 'consult' | 'process' | 'human' | 'unknown'; reason?: string }
  | { type: 'ASK_QUALIFYING_QUESTION'; target: SupervisorEventTarget; questionKey: string }
  | { type: 'GO_DEEP'; target: SupervisorEventTarget; questionKey?: string; topicKey?: string; reasonCode: 'user_requested_more_detail' | 'high_intent_followup' | 'needs_domain_explanation' }
  | { type: 'NONE' };

export interface TurnPlan {
  primaryAction: PrimaryAction;
  followUpAction?: FollowUpAction;
  primaryStage: ChatJourneyStage;
  factsPatch: DomainFactsPatch;
  reasonCode: ReducerReasonCode;
  sidePath?: {
    type: 'faq' | 'safety' | 'out_of_scope' | 'clarification' | 'none';
    primaryStagePreserved: boolean;
  };
}
```

- [ ] **Step 4: Implement reducer as `TurnPlan`**

Change `reduceJourney()` to return:

```ts
export type JourneyReducerOutput = {
  state: JourneyState;
  facts: DomainFacts;
  turnPlan: TurnPlan;
  primaryStage: ChatJourneyStage;
  factsPatch: DomainFactsPatch;
  isSidePath: boolean;
  sidePathType: TurnPlan['sidePath']['type'];
  primaryStagePreserved: boolean;
};
```

Do not include `nextAction` in `JourneyReducerOutput`. If compile-time compatibility is needed, add a separate legacy debug projection outside reducer authority, for example in `legacy-compatibility-view.ts`. That projection must not drive runtime decisions, projection assertions, stage changes, or write-back.

- [ ] **Step 5: Map generic semantic events**

Reducer rules:

- `USER_EXPRESSED_NEED + treatment/recommendation + ask` -> facts-driven next step.
- `USER_EXPRESSED_NEED + recommendation + revisit` -> `PRESENT_OPTIONS`, `target=hospital`, `primaryStage=RECOMMENDATION`.
- `USER_ASKED_QUESTION + next_step + ask` -> facts-driven next step. This replaces the retired `USER_ASKED_NEXT_STEP` event type.
- `USER_ASKED_QUESTION + pricing/process/documents/payment/travel` -> `ANSWER`, `mode=faq`, stage preserved, likely `INVITE_NEXT_STEP` from facts.
- `USER_ASKED_QUESTION + hospital/hospital_selection` -> `ANSWER`, `target=hospital` or `hospital_selection`, stage preserved or recommendation-owned.
- `USER_PROVIDED_INFORMATION + medical_facts/documents/contact` -> facts patch candidate plus appropriate primary action.
- `USER_RESPONDED_TO_REQUEST + reject/hesitate` -> `HANDLE_RESPONSE` and stage preserved.
- `USER_REQUESTED_HUMAN` -> `ESCALATE`, `target=human`, `primaryStage=HUMAN_HANDOFF`.
- safety/out-of-scope -> `REDIRECT`, stage preserved.
- unclear -> `CLARIFY`, stage preserved.

- [ ] **Step 6: Run reducer tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-reducer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/services/chatbot-v3/supervisor-event.types.ts \
  packages/application/src/services/chatbot-v3/journey-reducer.ts \
  packages/application/src/services/__tests__/chatbot-v3/journey-reducer.test.ts
git commit -m "feat(chatbot-v3): reduce events into turn plans"
```

### Task 6: Enforce runtime authority invariants for `TurnPlan`

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`

- [ ] **Step 1: Write failing authority tests**

Formal process invariant:

```ts
expect(() => decideFromReducerWithPatch({
  turnPlan: {
    primaryAction: { type: 'ANSWER', target: 'process', mode: 'faq' },
    factsPatch: { process: { explained: true } },
  },
})).toThrow(/process\.explained/);
```

Allowed process overview:

```ts
expect(decision.write.factsPatch['process.explained']).toBe(true);
```

Side paths:

```ts
expect(decision.to.stage).toBe(current.stage);
expect(decision.write.factsPatch['process.explained']).toBeUndefined();
```

- [ ] **Step 2: Run failing authority tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
```

Expected: FAIL until authority consumes `TurnPlan`.

- [ ] **Step 3: Implement `decideFromReducer()` over `TurnPlan`**

Authority should:

- derive action `ESCALATE` only from `primaryAction.type === 'ESCALATE'`
- derive `to.stage` from `turnPlan.primaryStage`
- write `process.explained=true` only when:

```ts
turnPlan.primaryAction.type === 'ANSWER' &&
turnPlan.primaryAction.target === 'process' &&
turnPlan.primaryAction.mode === 'formal_overview'
```

- never let agent/composer output mutate `factsPatch`

- [ ] **Step 4: Run authority tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
git commit -m "feat(chatbot-v3): authorize turn plan writes"
```

---

## Chunk 4: Agent Resolver, Skills, And Read Planning

### Task 7: Add deterministic agent resolver

**Files:**
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/agent-resolver.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/agent-resolver.test.ts`
- Modify export: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/index.ts`

- [ ] **Step 1: Write failing resolver tests**

Cases:

```ts
expect(resolveAgent({ event: humanEvent, turnPlan: escalatePlan, facts }).physicalAgent)
  .toBe('HandoffAgent');
expect(resolveAgent({ event: documentsUploaded, turnPlan: recordsPlan, facts }).physicalAgent)
  .toBe('RecordsAgent');
expect(resolveAgent({ event: hospitalQuestion, turnPlan: answerHospitalPlan, facts }).physicalAgent)
  .toBe('RecommendationAgent');
expect(resolveAgent({ event: consultNeed, turnPlan: consultPlan, facts }).physicalAgent)
  .toBe('ConsultAgent');
expect(resolveAgent({ event: pricingQuestion, turnPlan: faqPlan, facts }).physicalAgent)
  .toBe('FaqAgent');
```

- [ ] **Step 2: Run failing resolver tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/agent-resolver.test.ts
```

Expected: FAIL because file does not exist.

- [ ] **Step 3: Implement resolver**

Create:

```ts
export type AgentRole =
  | 'GeneralResponseAgent'
  | 'RecordsAgent'
  | 'RecommendationAgent'
  | 'ConsultAgent'
  | 'HandoffAgent';

export type PhysicalAgent =
  | 'FaqAgent'
  | 'RecordsAgent'
  | 'RecommendationAgent'
  | 'ConsultAgent'
  | 'HandoffAgent';

export interface ResolvedAgent {
  conceptualRole: AgentRole;
  physicalAgent: PhysicalAgent;
  reasonCode: string;
}
```

Implement priority exactly from the spec:

1. human escalation
2. redirects
3. documents uploaded
4. records ownership
5. recommendation/hospital ownership
6. consult ownership
7. general fallback

- [ ] **Step 4: Run resolver tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/agent-resolver.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/agent-resolver.ts \
  packages/application/src/services/__tests__/chatbot-v3/agent-resolver.test.ts \
  packages/application/src/index.ts
git commit -m "feat(chatbot-v3): resolve agents from turn plans"
```

### Task 8: Add code-defined skill registry, router, and loader

**Files:**
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-packs.ts`
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-router.ts`
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-loader.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts`
- Modify export: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/index.ts`

- [ ] **Step 1: Write failing skill-router tests**

Assert:

```ts
expect(buildSkillPolicy({
  ...pricingQuestion,
  agentRole: 'GeneralResponseAgent',
}).requests.map(r => r.id)).toEqual(expect.arrayContaining([
  'search_general_faq_by_category',
  'answer_general_faq_from_admin_source',
  'load_pricing_factors',
  'explain_pricing_uncertainty',
]));
expect(buildSkillPolicy({
  ...hospitalQuestion,
  agentRole: 'RecommendationAgent',
}).requests.map(r => r.id)).toEqual(expect.arrayContaining([
  'search_hospital_faq_by_category',
  'answer_hospital_faq_from_admin_source',
  'explain_hospital_selection_logic',
]));
expect(buildSkillPolicy({
  ...contactProvided,
  agentRole: 'HandoffAgent',
}).requests.map(r => r.id)).toEqual(expect.arrayContaining([
  'extract_contact_info_candidate',
  'build_handoff_payload_context',
]));
expect(buildSkillPolicy({
  ...outOfScope,
  agentRole: 'GeneralResponseAgent',
}).requests.map(r => r.id)).toContain('service_scope_boundary');
expect(buildSkillPolicy({
  ...recordsUpload,
  agentRole: 'RecordsAgent',
}).requests.map(r => r.id)).toContain('derive_record_inventory_candidate');
```

Add loader tests:

```ts
const loaded = loadSkillPacks({
  requests: [
    { id: 'service_scope_boundary', priority: 100, reason: 'redirect' },
    { id: 'service_scope_boundary', priority: 10, reason: 'duplicate' },
  ],
  maxSkillPacks: 1,
});
expect(loaded.skills.map(skill => skill.id)).toEqual(['service_scope_boundary']);
expect(loaded.warnings).toEqual([]);

expect(loadSkillPacks({ requests: [], maxSkillPacks: 6 }).skills.map(skill => skill.id))
  .toContain('safe_degradation_when_uncertain');
```

- [ ] **Step 2: Run failing skill tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-router.test.ts
```

Expected: FAIL because registry/router do not exist.

- [ ] **Step 3: Implement `skill-packs.ts`**

Use `SkillKind`:

```ts
export type SkillKind =
  | 'retrieval_strategy'
  | 'extraction_strategy'
  | 'payload_strategy'
  | 'degradation_policy'
  | 'boundary_policy'
  | 'explanation_method'
  | 'sales_playbook';
```

Add all spec skill IDs, especially:

- `service_scope_boundary`
- `derive_record_inventory_candidate`
- `search_general_faq_by_category`
- `answer_general_faq_from_admin_source`
- `search_hospital_faq_by_category`
- `answer_hospital_faq_from_admin_source`

- [ ] **Step 4: Implement `skill-router.ts`**

`buildSkillPolicy()` must accept the resolved conceptual role and return deduped highest-priority requests:

```ts
function buildSkillPolicy(input: {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  agentRole: AgentRole;
  facts: DomainFacts;
}): SkillPolicy
```

```ts
export interface SkillPolicy {
  requests: SkillRequest[];
  maxSkillPacks?: number;
}
```

Default `maxSkillPacks` is `6`.

- [ ] **Step 5: Implement `skill-loader.ts`**

`loadSkillPacks(policy, registry)` should:

- resolve code-defined skill packs by id
- dedupe defensively by id and keep the highest-priority reason
- apply `maxSkillPacks`
- omit missing ids and return observability warnings
- add `safe_degradation_when_uncertain` or `clarify_ambiguous_reply` fallback when the request set is empty
- never call LLM, DB, CMS, or perform filesystem reads of any kind
- resolve only in-memory/code-imported registry entries from `skill-packs.ts`
- do not load JSON, YAML, Markdown, local config files, or package-relative files at runtime

- [ ] **Step 6: Run skill tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-router.test.ts src/services/__tests__/chatbot-v3/skill-loader.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/services/chatbot-v3/skill-packs.ts \
  packages/application/src/services/chatbot-v3/skill-router.ts \
  packages/application/src/services/chatbot-v3/skill-loader.ts \
  packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts \
  packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts \
  packages/application/src/index.ts
git commit -m "feat(chatbot-v3): load runtime skill packs"
```

### Task 9: Replace read planner with `ReadIntent[]`

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/read-planner.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts`

- [ ] **Step 1: Write failing read planner tests**

Cases:

```ts
expect(buildReadPlan(pricingInput)).toContainEqual({
  type: 'GENERAL_FAQ',
  categories: ['pricing'],
});
expect(buildReadPlan(hospitalInput)).toContainEqual(expect.objectContaining({
  type: 'HOSPITAL_FAQ',
}));
expect(buildReadPlan(recordsInput)).toContainEqual(expect.objectContaining({
  type: 'RECORDS_REQUIREMENTS',
}));
expect(buildReadPlan(recommendationInput)).toContainEqual(expect.objectContaining({
  type: 'HOSPITAL_CANDIDATES',
}));
```

- [ ] **Step 2: Run failing read planner tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/read-planner.test.ts
```

Expected: FAIL because current planner accepts `NextAction`.

- [ ] **Step 3: Implement `ReadIntent` planner**

Replace current signature with:

```ts
export type ReadIntent =
  | { type: 'GENERAL_FAQ'; categories: SupervisorEventTarget[] }
  | { type: 'HOSPITAL_FAQ'; hospitalIds?: string[]; categories: SupervisorEventTarget[] }
  | { type: 'HOSPITAL_CANDIDATES'; condition?: string; preferences?: string[] }
  | { type: 'RECORDS_REQUIREMENTS'; condition?: string }
  | { type: 'PRICING_FACTORS'; condition?: string }
  | { type: 'SERVICE_POLICY'; topics: SupervisorEventTarget[] };
```

Input:

```ts
{
  event,
  turnPlan,
  resolvedAgent,
  skills,
  facts,
}
```

- [ ] **Step 4: Run read planner tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/read-planner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/read-planner.ts \
  packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts
git commit -m "feat(chatbot-v3): plan data reads from skills"
```

---

## Chunk 5: Task Builder, Response Contract, And API Runtime

### Task 10: Add application task builder and response contract tests

**Files:**
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/task-builder.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts`

- [ ] **Step 1: Write failing task builder tests**

Assert:

```ts
expect(task.responseContract.primaryMove).toBe('answer');
expect(task.responseContract.followUpMove).toBe('invite_next_step');
expect(task.responseContract.constraints.answerBeforeAsk).toBe(true);
expect(task.responseContract.constraints.avoidMultipleCTAs).toBe(true);
expect(task.responseContract.constraints.preservePrimaryStage).toBe(true);
```

For safety:

```ts
expect(task.responseContract.primaryMove).toBe('redirect');
expect(task.responseContract.constraints.tone).toBe('calm_safety');
expect(task.responseContract.forbiddenClaims).toEqual(expect.arrayContaining([
  'diagnosis',
  'medication recommendation',
  'outcome guarantee',
]));
```

- [ ] **Step 2: Run failing task builder tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/task-builder.test.ts
```

Expected: FAIL because task builder does not exist.

- [ ] **Step 3: Implement task builder**

Build:

```ts
export interface AgentTask {
  agentRole: AgentRole;
  physicalAgent: PhysicalAgent;
  primaryAction: PrimaryAction;
  followUpAction?: FollowUpAction;
  latestUserMessage: string;
  conversationSummary: string;
  knownFacts: DomainFacts;
  skillPolicy: SkillPolicy;
  skills: LoadedSkillPack[];
  retrievedContext?: RetrievedContext;
  responseContract: ResponseContract;
}
```

Map `PrimaryAction` to `primaryMove` and `FollowUpAction` to `followUpMove`.

- [ ] **Step 4: Run task builder tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/task-builder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/task-builder.ts \
  packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts
git commit -m "feat(chatbot-v3): build contracted agent tasks"
```

### Task 11A: Integrate runtime control-plane dry run with mock agent output

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Test helper: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts`

- [ ] **Step 1: Write failing runtime dry-run tests**

Add tests for:

- pricing question -> `FaqAgent`, admin FAQ read intent, `ANSWER + pricing`, follow-up documents if docs missing
- hospital question -> `RecommendationAgent`, hospital FAQ read intent
- docs uploaded -> `RecordsAgent`, `derive_record_inventory_candidate`, stage stays records
- contact info -> `HandoffAgent`, handoff payload context
- docs persisted + next step -> `ConsultAgent`

Assertions should inspect debug/projection fields, not only text:

```ts
expect(result.decision.turnPlan.primaryAction).toEqual({ type: 'ANSWER', target: 'pricing', mode: 'faq' });
expect(result.decision.resolvedAgent.physicalAgent).toBe('FaqAgent');
expect(result.decision.readIntents).toContainEqual(expect.objectContaining({ type: 'GENERAL_FAQ' }));
```

Use mock agent executors that return fixed text/data. This task should prove the control-plane pipeline works before any existing physical-agent bridge is connected.

- [ ] **Step 2: Run failing runtime dry-run tests**

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: FAIL until API runtime exposes the dry-run pipeline fields.

- [ ] **Step 3: Update runtime pipeline through task building**

Runtime order:

```text
NormalizeInput / SnapshotNormalizer
-> SupervisorEventExtractor
-> JourneyReducer
-> Authority
-> AgentResolver
-> SkillRouter
-> SkillLoader
-> ReadPlanner
-> Tool/Data Executor
-> TaskBuilder
-> Mock Agent Executor
-> Composer
-> PersistenceWriter
```

Use existing gateway operations for FAQ/hospital FAQ where possible. Do not give agents direct new tool authority; runtime executes planned reads and passes `retrievedContext`.

- [ ] **Step 4: Expose debug fields for tests**

Expose these in runtime debug/test-only surfaces:

- event
- turnPlan
- authority decision
- resolvedAgent
- skill requests
- loaded skill ids
- read intents
- response contract

- [ ] **Step 5: Run dry-run runtime tests**

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: PASS for mock-agent control-plane cases.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts \
  apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts
git commit -m "feat(chatbot-v3): dry-run turn plan runtime pipeline"
```

### Task 11B: Bridge `AgentTask` into existing physical agents

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/worker-task.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/agents.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Write failing physical-agent bridge tests**

Use existing physical agents or focused mocks to assert:

- `GeneralResponseAgent/FaqAgent` receives `ResponseContract`, FAQ snippets, and no stage/write authority.
- `RecordsAgent` receives records task context for documents/medical facts.
- `RecommendationAgent` receives `latestUserMessage` for revisit details such as "上海的" or "更便宜的"; these details must not come from supervisor metadata.
- `ConsultAgent` handles consult option plans.
- `HandoffAgent` handles contact/human escalation payload context.

- [ ] **Step 2: Run failing bridge tests**

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: FAIL until `AgentTask` is translated into existing worker tasks/actions.

- [ ] **Step 3: Update worker task bridge**

Keep existing physical agents working by translating `AgentTask` into current worker task shapes:

- `GeneralResponseAgent/FaqAgent` -> `FaqWorkerTask`
- `RecordsAgent` -> `RecordsWorkerTask`
- `RecommendationAgent` -> `RecommendationWorkerTask`
- `ConsultAgent` -> current consult action
- `HandoffAgent` -> current handoff action

Do not let translated worker task change `TurnPlan`.

Do not redefine application-owned control-plane types in API. `worker-task.ts` may define physical task adapter types only, such as `FaqWorkerTask`, `RecordsWorkerTask`, `RecommendationWorkerTask`, or translation helpers.

- [ ] **Step 4: Connect physical agents after dry-run pipeline**

Replace the Task 11A mock executor path with the normal physical-agent executor path after `TaskBuilder`. Keep a test-only hook to avoid LLM calls in unit/integration tests.

- [ ] **Step 5: Run bridge tests**

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/routes/chatbot-v3/worker-task.ts \
  apps/api/src/routes/chatbot-v3/agents.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts \
  apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts
git commit -m "feat(chatbot-v3): bridge turn plans to agents"
```

### Task 12: Update response composer and FAQ prompt contracts

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/response-composer.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/faq-prompts.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/faq-route-adapter.test.ts`

- [ ] **Step 1: Write failing composer tests**

Assert:

```ts
expect(composed.projectedDecision.primaryAction).toEqual(turnPlan.primaryAction);
expect(composed.projectedDecision.primaryStage).toBe(turnPlan.primaryStage);
expect(composed.projectedDecision.legacyNextActionLabel).toBeUndefined();
expect(composed.text).toContain(/* weak keyword, e.g. 上传资料 or 在线咨询 */);
```

If a legacy debug panel still needs a label, prefer `legacyNextActionLabel?: string`. It must not participate in runtime decision-making, authority, stage projection, or write-back.

For process FAQ:

```ts
expect(writeIntents?.canonicalTruthPatch?.['process.explained']).toBeUndefined();
```

For formal overview:

```ts
expect(writeIntents?.canonicalTruthPatch?.['process.explained']).toBe(true);
```

- [ ] **Step 2: Run failing composer tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts src/routes/chatbot-v3/faq-route-adapter.test.ts
```

Expected: FAIL until composer and prompt contracts understand `TurnPlan`.

- [ ] **Step 3: Implement composer projection**

Projection invariant:

```ts
projectedProposal.primaryStage === turnPlan.primaryStage
projectedDecision.primaryStage === turnPlan.primaryStage
projectedDecision.primaryAction === turnPlan.primaryAction
```

No second stage/action truth. A legacy label can exist only as debug/read-only compatibility.

- [ ] **Step 4: Update FAQ prompts**

FAQ responder receives:

- `responseContract.structure`
- `primaryMove`
- `followUpMove`
- constraints
- safety rules
- forbidden claims
- retrieved general/hospital FAQ context

It must not receive permission to update stage/facts.

- [ ] **Step 5: Run composer/prompt tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts src/routes/chatbot-v3/faq-route-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/response-composer.ts \
  apps/api/src/routes/chatbot-v3/faq-prompts.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts \
  apps/api/src/routes/chatbot-v3/faq-route-adapter.test.ts
git commit -m "feat(chatbot-v3): compose contracted turn responses"
```

---

## Chunk 6: Multi-Turn Session Coverage

### Task 13: Add high-risk multi-turn session tests

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts`
- Optional create: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/chatbot-v3.generic-turnplan.sessions.test.ts`

- [ ] **Step 1: Write session tests**

Add at least these sessions:

1. Happy path: treatment need -> triage -> hospital options -> formal process overview -> docs upload -> next step -> consult.
2. FAQ detour: docs stage -> pricing question -> stage preserved -> next step still asks documents.
3. Process FAQ from consult stage -> `ANSWER + process + mode=faq`, does not write `process.explained`, stage remains consult.
4. Document upload two-turn behavior -> upload persists docs, next turn consult.
5. Upload before recommendation -> docs candidate persists, later flow does not lose records.
6. Risky medical request -> `REDIRECT + medical_safety`, stage preserved.
7. Human/contact request -> contact info extracts candidate and escalates handoff.
8. Schema failure fallback -> `USER_MESSAGE_UNCLEAR`, `CLARIFY`, next normal turn recovers.
9. Recommendation revisit after hospital options: user says `上海的`, `更便宜的`, or `换一批`; assert `USER_EXPRESSED_NEED`, `target=recommendation`, `modifier=revisit`, `RecommendationAgent` ownership, hospital/recommendation read intents, no supervisor metadata, and revisit details passed through `latestUserMessage`, summary, facts, or retrieved context.

Each turn asserts:

```ts
event.eventType
event.target
event.modifier
turnPlan.primaryAction
turnPlan.followUpAction
turnPlan.primaryStage
resolvedAgent.physicalAgent
readIntents
factsPatch
persisted snapshot after turn
sidePath.primaryStagePreserved
```

- [ ] **Step 2: Run session tests and verify failures**

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.generic-turnplan.sessions.test.ts
```

Expected: FAIL until helper/runtime debug exposes enough assertions.

- [ ] **Step 3: Extend session driver debug access**

Expose debug fields in test helper only:

- extracted event
- turn plan
- resolved agent
- skill requests
- read intents
- response contract
- write intents
- persisted snapshot

- [ ] **Step 4: Run session tests**

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.generic-turnplan.sessions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/__tests__/chatbot-v3.generic-turnplan.sessions.test.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts \
  apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts
git commit -m "test(chatbot-v3): cover generic turn plan sessions"
```

---

## Chunk 7: Retire Legacy Names And Full Verification

### Task 14: Remove old semantic events, old action assertions, and compatibility projections

**Files:**
- Modify as needed:
  - `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/legacy-compatibility-view.ts`
  - `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/next-action-resolver.ts`
  - `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
  - all chatbot-v3 tests still mentioning old semantic event/action names

- [ ] **Step 1: Search for old names**

Run:

```bash
rg -n "USER_ASKED_FAQ|USER_ASKED_NEXT_STEP|USER_WANTS_TREATMENT_IN_CHINA|USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING|USER_PROVIDED_MEDICAL_FACTS|USER_INTERESTED_IN_CONSULT|USER_REJECTED_OR_HESITATED|USER_PROVIDED_CONTACT_INFO|USER_AMBIGUOUS_REPLY|UNKNOWN_MESSAGE|COLLECT_MINIMAL_TRIAGE|GENERATE_RECOMMENDATION|SHOW_PROCESS_OVERVIEW|REQUEST_MEDICAL_DOCUMENTS|OFFER_ONLINE_CONSULT|CREATE_HANDOFF|ANSWER_FAQ|CLARIFY_INTENT|classify_service_scope_boundary|derive_record_inventory_patch|write_strategy" packages/application/src apps/api/src
```

Expected: only migration comments or tests explicitly asserting absence should remain. Prefer zero runtime hits.

- [ ] **Step 2: Remove or update stale references**

Replace old runtime assertions with generic forms:

- `USER_ASKED_FAQ` -> `USER_ASKED_QUESTION + target`
- `USER_PROVIDED_CONTACT_INFO` -> `USER_PROVIDED_INFORMATION + contact + provide`
- `ANSWER_FAQ` -> `ANSWER + target + mode=faq`
- `SHOW_PROCESS_OVERVIEW` -> `ANSWER + process + formal_overview`
- `CREATE_HANDOFF` -> `ESCALATE + human`

- [ ] **Step 3: Run targeted tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3 src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.generic-turnplan.sessions.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run typechecks**

```bash
pnpm --filter @medical-crm/application typecheck
pnpm --filter @medical-crm/api typecheck
```

Expected: application PASS. API should PASS; if unrelated existing API errors remain, capture exact file/line output in the final commit body and do not change unrelated files.

- [ ] **Step 5: Run baseline shell check**

```bash
pnpm test:chatbot-v3-baseline-shell
```

Expected: PASS.

- [ ] **Step 6: Commit cleanup**

```bash
git add packages/application/src apps/api/src
git commit -m "refactor(chatbot-v3): retire legacy event action names"
```

### Task 15: Final review and verification

**Files:**
- No expected source edits unless verification finds issues.

- [ ] **Step 1: Run full relevant suite**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3
pnpm --filter @medical-crm/application typecheck
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3 src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.generic-turnplan.sessions.test.ts
pnpm --filter @medical-crm/api typecheck
pnpm test:chatbot-v3-baseline-shell
```

Expected: all pass, except document any known unrelated API typecheck failures exactly if they still exist.

- [ ] **Step 2: Self-audit control-plane invariants**

Run:

```bash
rg -n "suggestedStage|dispatchAgent|task|requestedReadDomains|metadata" apps/api/src/routes/chatbot-v3/supervisor-*.ts packages/application/src/services/chatbot-v3
rg -n "process\\.explained" packages/application/src/services/chatbot-v3 apps/api/src/routes/chatbot-v3
rg -n "USER_ASKED_FAQ|ANSWER_FAQ|SHOW_PROCESS_OVERVIEW|CREATE_HANDOFF" packages/application/src apps/api/src
```

Expected:

- supervisor LLM path does not accept old proposal fields
- `process.explained` writes are guarded by `ANSWER + process + formal_overview`
- no retired event/action runtime names remain

- [ ] **Step 3: Commit any final fixes**

If fixes were required:

```bash
git add <changed-files>
git commit -m "fix(chatbot-v3): enforce generic turn plan invariants"
```

- [ ] **Step 4: Prepare handoff summary**

Summarize:

- commits created
- tests run
- any skipped/unrelated failures
- remaining implementation risks
