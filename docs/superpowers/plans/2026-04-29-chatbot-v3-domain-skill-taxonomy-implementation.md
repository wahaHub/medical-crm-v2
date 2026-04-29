# Chatbot V3 Domain Skill Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate chatbot-v3 to an action-oriented semantic event model, skill-aligned targets, richer domain skill packs, and an 8-message recent-context window with rolling summary.

**Architecture:** Keep the existing supervisor -> reducer/runtime authority -> skill router -> worker task pipeline. Replace domain-specific semantic event types with action event types, move business domain into `target`, inject a global `core_interaction_contract`, and split current broad skills into Medora service domains. Add conversation context plumbing in the API runtime so agents receive `recentMessages` plus a rolling `conversationSummary` for older history.

**Tech Stack:** TypeScript, pnpm, Vitest, Hono API route tests, existing chatbot-v3 application services, existing `ai_chat_messages` repository.

---

Spec: `docs/superpowers/specs/2026-04-29-chatbot-v3-domain-skill-taxonomy-design.md`

## File Structure

Modify:

- `packages/application/src/services/chatbot-v3/supervisor-event.types.ts`  
  Owns canonical semantic event types, targets, modifiers, metadata, and action types.

- `apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`  
  Renders classifier prompt with new event model, target guide, modifiers, service scope, and recent messages.

- `packages/application/src/services/chatbot-v3/skill-packs.ts`  
  Owns domain skill IDs, `core_interaction_contract`, domain sections, posture handling sections, follow-up sections, and retrieval hints.

- `packages/application/src/services/chatbot-v3/skill-router.ts`  
  Maps `eventType + target + modifier + turnPlan` to skill requests.

- `packages/application/src/services/chatbot-v3/read-planner.ts`  
  Maps loaded skill sections to read intents for service scope, policy, medical advice, hospital, treatment, pricing, payment, travel, sales, FAQ, handoff, and clarification.

- `packages/application/src/services/chatbot-v3/skill-loader.ts`  
  Loads global `core_interaction_contract` alongside requested domain skill sections.

- `packages/application/src/services/chatbot-v3/task-builder.ts`  
  Carries loaded skill sections and context into worker tasks.

- `apps/api/src/routes/chatbot-v3/worker-task.ts`  
  Adds `recentMessages` and `conversationSummary` to worker task base.

- `apps/api/src/routes/chatbot-v3.routes.ts`  
  Reads persisted history before `handleTurn`, builds route-level conversation context, appends the in-flight user message, and passes context into runtime.

- `apps/api/src/routes/chatbot-v3/runtime.service.ts`  
  Consumes route-provided conversation context, passes recent messages and summary into supervisor/worker tasks, and writes rolling summary patches after the assistant response is available.

- `packages/application/src/services/chatbot-v3/types.ts`  
  Adds recent-message fields to supervisor gateway/input types if needed.

- `packages/shared/validation/src/chatbot-v3/chat.schema.ts`  
  Exposes runtime debug/context evidence if route response schema needs update.

- Existing tests under:
  - `packages/application/src/services/__tests__/chatbot-v3/`
  - `apps/api/src/routes/chatbot-v3/*.test.ts`
  - `apps/api/src/__tests__/chatbot-v3.routes.test.ts`

Create:

- `apps/api/src/routes/chatbot-v3/conversation-context.ts`  
  Focused helper for building latest 8 messages and rolling-summary patch decisions.

- `apps/api/src/routes/chatbot-v3/conversation-context.test.ts`  
  Unit tests for context-window behavior and summary cadence.

Do not create:

- `records_skill`
- `eligibility_intake_skill`
- `followup_skill`
- standalone `safety_skill`

## Chunk 1: Canonical Event Model

### Task 1: Replace semantic event types with action-only events

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/supervisor-event.types.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts`

- [ ] **Step 1: Write failing event type tests**

Add assertions that semantic events are:

```ts
expect(SEMANTIC_SUPERVISOR_EVENT_TYPES).toEqual([
  'USER_EXPRESSED_INTEREST',
  'USER_ASKED_QUESTION',
  'USER_PROVIDED_INFORMATION',
  'USER_RESPONDED_TO_REQUEST',
  'USER_REQUESTED_ACTION',
  'USER_REQUESTED_HUMAN',
  'USER_MESSAGE_UNCLEAR',
]);
expect(SEMANTIC_SUPERVISOR_EVENT_TYPES).not.toContain('USER_ASKED_MEDICAL_ADVICE');
expect(SEMANTIC_SUPERVISOR_EVENT_TYPES).not.toContain('USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE');
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts
```

Expected: FAIL because old semantic events still exist.

- [ ] **Step 3: Update event type constants and allowed events**

In `supervisor-event.types.ts`:

- Rename `USER_EXPRESSED_NEED` to `USER_EXPRESSED_INTEREST`.
- Add `USER_REQUESTED_ACTION`.
- Remove `USER_ASKED_MEDICAL_ADVICE`.
- Remove `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE`.
- Keep `USER_REQUESTED_HUMAN` as a dedicated event because it affects handoff authority.
- Keep `USER_MESSAGE_UNCLEAR` for low-confidence fallback.

- [ ] **Step 4: Run event type tests**

Run the same command.

Expected: PASS.

### Task 2: Align supervisor targets with the domain skill set

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/supervisor-event.types.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts`

- [ ] **Step 1: Write failing target tests**

Assert canonical targets:

```ts
expect(SUPERVISOR_EVENT_TARGETS).toEqual([
  'service_scope',
  'policy',
  'medical_advice',
  'hospital',
  'treatment',
  'pricing',
  'payment',
  'travel',
  'sales',
  'faq',
  'handoff',
  'unknown',
]);
expect(SUPERVISOR_EVENT_TARGETS).not.toContain('records');
expect(SUPERVISOR_EVENT_TARGETS).not.toContain('eligibility_intake');
expect(SUPERVISOR_EVENT_TARGETS).not.toContain('documents');
expect(SUPERVISOR_EVENT_TARGETS).not.toContain('process');
expect(SUPERVISOR_EVENT_TARGETS).not.toContain('recommendation');
expect(SUPERVISOR_EVENT_TARGETS).not.toContain('consult');
expect(SUPERVISOR_EVENT_TARGETS).not.toContain('contact');
expect(SUPERVISOR_EVENT_TARGETS).not.toContain('human');
```

- [ ] **Step 2: Run the failing target test**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts
```

Expected: FAIL while old targets remain.

- [ ] **Step 3: Update `SupervisorEventTarget` and constants**

Replace old target set with:

```ts
export type SupervisorEventTarget =
  | 'service_scope'
  | 'policy'
  | 'medical_advice'
  | 'hospital'
  | 'treatment'
  | 'pricing'
  | 'payment'
  | 'travel'
  | 'sales'
  | 'faq'
  | 'handoff'
  | 'unknown';
```

- [ ] **Step 4: Run target tests**

Run the same command.

Expected: PASS after downstream compile fixes in this chunk are done.

### Task 3: Expand modifiers to posture matrix values

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/supervisor-event.types.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts`

- [ ] **Step 1: Write failing modifier tests**

Assert:

```ts
expect(SUPERVISOR_EVENT_MODIFIERS).toEqual([
  'ask',
  'provide',
  'confirm',
  'reject',
  'hesitate',
  'correct',
  'compare',
  'revisit',
  'request_action',
  'urgent',
  'unknown',
]);
```

- [ ] **Step 2: Update modifier type and constants**

Add `correct`, `compare`, `request_action`, and `urgent`.

- [ ] **Step 3: Run application typecheck for early breakage**

Run:

```bash
pnpm --filter @medical-crm/application typecheck
```

Expected: initially may FAIL with references to old event/target values. Fix only chatbot-v3 files in this plan scope.

## Chunk 2: Supervisor Prompt And Compatibility Mapping

### Task 4: Update supervisor prompt classification guide

**Files:**

- Modify: `apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`
- Test: `apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Add tests that prompt:

- Includes new event types.
- Does not mention `USER_ASKED_MEDICAL_ADVICE`.
- Does not mention `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE`.
- Tells model to classify medical advice as `USER_ASKED_QUESTION target=medical_advice`.
- Tells model to classify out-of-scope as `USER_ASKED_QUESTION` or `USER_REQUESTED_ACTION target=service_scope`.
- Lists only new canonical targets.
- Lists expanded modifiers.

- [ ] **Step 2: Update `SEMANTIC_EVENT_CLASSIFICATION_GUIDE`**

Use:

```ts
USER_EXPRESSED_INTEREST: 'user expresses a service goal or desire...',
USER_ASKED_QUESTION: 'user asks an informational question...',
USER_PROVIDED_INFORMATION: 'user gives facts...',
USER_RESPONDED_TO_REQUEST: 'user replies to the previous assistant request...',
USER_REQUESTED_ACTION: 'user asks Medora to do something...',
USER_REQUESTED_HUMAN: 'user asks to speak with a human...',
USER_MESSAGE_UNCLEAR: 'no allowed event fits...',
```

- [ ] **Step 3: Replace target and modifier guides**

Target guide should use:

```text
service_scope, policy, medical_advice, hospital, treatment, pricing, payment, travel, sales, faq, handoff, unknown
```

Modifier guide should use:

```text
ask, provide, confirm, reject, hesitate, correct, compare, revisit, request_action, urgent, unknown
```

- [ ] **Step 4: Run API prompt tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/supervisor-prompt.test.ts
```

Expected: PASS.

### Task 5: Add temporary compatibility normalization for old gateway outputs

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`

- [ ] **Step 1: Write tests for old-output normalization**

Even after prompt change, LLM may emit old values during rollout. Add tests:

```ts
// old medical event -> new action/target
expect(normalized.eventType).toBe('USER_ASKED_QUESTION');
expect(normalized.target).toBe('medical_advice');

// old out-of-scope event -> new action/target
expect(normalized.eventType).toBe('USER_ASKED_QUESTION');
expect(normalized.target).toBe('service_scope');

// old documents target -> treatment
expect(normalized.target).toBe('treatment');

// old recommendation/hospital_selection target -> hospital
expect(normalized.target).toBe('hospital');

// old process target -> policy
expect(normalized.target).toBe('policy');

// old human target -> handoff
expect(normalized.target).toBe('handoff');

// old contact target -> handoff
expect(normalized.target).toBe('handoff');

// old consult target -> policy/treatment/handoff by meaning
expect(normalized.target).toBeOneOf(['policy', 'treatment', 'handoff']);
```

- [ ] **Step 2: Implement compatibility map at supervisor boundary**

Normalize LLM output before reducer/skill-router:

```ts
const LEGACY_TARGET_MAP = {
  documents: 'treatment',
  medical_facts: 'medical_advice',
  recommendation: 'hospital',
  hospital_selection: 'hospital',
  process: 'policy',
  next_step: 'policy',
  contact: 'handoff',
  human: 'handoff',
} as const;
```

Handle legacy `consult` by meaning rather than one static mapping:

- consult scheduling/action request -> `handoff`
- consult process/timing question -> `policy`
- consult clinical review/preparation -> `treatment`

Keep all compatibility normalization marked transitional and observable via debug metadata.

- [ ] **Step 3: Run supervisor tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts
```

Expected: PASS.

## Chunk 3: Skill Taxonomy Migration

### Task 6: Replace domain skill IDs and add `core_interaction_contract`

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/skill-packs.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts`

- [ ] **Step 1: Write failing skill registry test**

Assert registry includes exactly:

```ts
[
  'service_scope_skill',
  'policy_skill',
  'medical_advice_skill',
  'hospital_skill',
  'treatment_skill',
  'pricing_skill',
  'payment_skill',
  'travel_skill',
  'sales_skill',
  'faq_skill',
  'handoff_skill',
  'clarification_recovery_skill',
]
```

Assert registry excludes:

```ts
[
  'safety_scope_skill',
  'documents_skill',
  'process_skill',
  'hospital_recommendation_skill',
  'human_handoff_skill',
  'followup_skill',
  'records_skill',
  'eligibility_intake_skill',
]
```

- [ ] **Step 2: Add `CoreInteractionContract` model**

In `skill-packs.ts`, add either:

```ts
export interface CoreInteractionContract {
  id: 'core_interaction_contract';
  validationGuidance: string[];
  postureGuidance: Partial<Record<SupervisorEventModifier, string>>;
}
```

or a `LoadedSkillSection` with `skillId: 'core_interaction_contract'` only if type complexity is lower. Do not make it a `DomainSkillId`.

- [ ] **Step 3: Replace domain registry**

Each domain skill must include:

- `description`
- policy sections
- retrieval sections
- posture handling for all modifiers
- follow-up section(s)

Minimum posture keys:

```ts
ask, provide, confirm, reject, hesitate, correct, compare, revisit, request_action, urgent, unknown
```

- [ ] **Step 4: Run skill loader tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-loader.test.ts
```

Expected: PASS after loader update in Task 7.

### Task 7: Inject core interaction contract globally

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/skill-loader.ts`
- Modify: `packages/application/src/services/chatbot-v3/task-builder.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts`

- [ ] **Step 1: Write failing tests**

Assert loaded task context includes core interaction guidance even when only one domain skill is requested.

Expected shape can be:

```ts
expect(output.coreInteractionContract?.id).toBe('core_interaction_contract');
```

or:

```ts
expect(output.loadedSkillSections[0]?.sectionIds).toContain('core_input_validation');
```

Choose the shape that keeps code simplest.

- [ ] **Step 2: Implement loader injection**

Load core interaction guidance once per task. Do not count it against `maxSkillSnippets` for domain skills.

- [ ] **Step 3: Run loader/task-builder tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-loader.test.ts src/services/__tests__/chatbot-v3/task-builder.test.ts
```

Expected: PASS.

### Task 8: Update skill router target mapping

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/skill-router.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts`

- [ ] **Step 1: Write failing routing tests**

Assert:

```ts
target=medical_advice -> medical_advice_skill
target=service_scope -> service_scope_skill
target=policy -> policy_skill
target=hospital -> hospital_skill
target=treatment -> treatment_skill
target=pricing -> pricing_skill
target=payment -> payment_skill
target=travel -> travel_skill
target=sales -> sales_skill
target=faq -> faq_skill
target=handoff -> handoff_skill
```

Contact details are not a canonical target. They should arrive as `USER_PROVIDED_INFORMATION target=handoff modifier=provide`.

Also assert:

```ts
USER_ASKED_QUESTION + target=faq loads faq_skill as auxiliary with relevant domain skill when topic metadata exists.
```

- [ ] **Step 2: Implement new route map**

Keep max two domain skills:

- primary skill for canonical target
- optional `faq_skill` auxiliary for FAQ answer mode

- [ ] **Step 3: Run router tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-router.test.ts
```

Expected: PASS.

### Task 9: Update read planner for new skills

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/read-planner.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts`

- [ ] **Step 1: Write failing read-plan tests**

Assert:

- `service_scope_skill` -> `SERVICE_SCOPE`
- `policy_skill` -> `PROCESS_POLICY`, `GENERAL_FAQ` when FAQ section applies
- `medical_advice_skill` -> `RECORD_REQUIREMENTS` and/or `SERVICE_SCOPE` only when section declares those read intents
- `hospital_skill` -> `HOSPITAL_CANDIDATES`, `HOSPITAL_FAQ`, `DOCTOR_MATCHING_CONTEXT`
- `treatment_skill` -> `RECORD_REQUIREMENTS`, `GENERAL_FAQ`
- `pricing_skill` -> `PRICING_FACTORS`, `GENERAL_FAQ`
- `payment_skill` -> `PAYMENT_POLICY`, `GENERAL_FAQ`
- `travel_skill` -> `TRAVEL_SUPPORT_SCOPE`, `GENERAL_FAQ`
- `sales_skill` -> `SERVICE_SCOPE`, `GENERAL_FAQ`
- `faq_skill` -> `GENERAL_FAQ` or `HOSPITAL_FAQ` depending on topic/target

- [ ] **Step 2: Implement new read planner cases**

Prefer explicit `readIntentTypes` on sections over skill-name fallback. Keep fallback cases small.

- [ ] **Step 3: Run read planner tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/read-planner.test.ts
```

Expected: PASS.

## Chunk 4: Conversation Context Window

### Task 10: Add conversation context helper

**Files:**

- Create: `apps/api/src/routes/chatbot-v3/conversation-context.ts`
- Create: `apps/api/src/routes/chatbot-v3/conversation-context.test.ts`

- [ ] **Step 1: Write failing context-window tests**

Test cases:

- With 0 historical messages, returns empty `recentMessages` and existing summary.
- With 6 historical messages, returns all 6 as `recentMessages`, no compression due.
- With 12 historical messages, returns latest 8 as `recentMessages`, older 4 as summary candidates.
- Summary candidate excludes latest 8 messages.
- Compression due when unsummarized older messages count reaches 8.
- Compression due every 4 completed turns.
- Important-state refresh uses deterministic flags only and does not call LLM.

Use a local message fixture:

```ts
const message = (role: 'USER' | 'ASSISTANT', content: string, index: number) => ({
  id: `m-${index}`,
  role,
  content,
  createdAt: new Date(2026, 3, 29, 12, index).toISOString(),
  metadata: {},
});
```

- [ ] **Step 2: Implement exported types**

```ts
export interface ChatbotV3RecentMessage {
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt?: string;
  attachmentsSummary?: string;
  turnId?: string;
}

export interface ChatbotV3ConversationContext {
  recentMessages: ChatbotV3RecentMessage[];
  conversationSummary: string;
  summaryBoundary: {
    throughMessageId?: string;
    throughCreatedAt?: string;
    messageCount: number;
    coverage: 'current' | 'legacy_unknown';
  };
  summaryRefresh: {
    due: boolean;
    reason: 'cadence' | 'older_messages' | 'deterministic_state_change' | 'none';
    olderMessageCount: number;
  };
}
```

- [ ] **Step 3: Implement `buildChatbotV3ConversationContext`**

Inputs:

```ts
messages: AiChatMessage[];
existingSummary: string;
existingSummaryBoundary?: {
  throughMessageId?: string;
  throughCreatedAt?: string;
  messageCount?: number;
};
inFlightUserMessage?: ChatbotV3RecentMessage;
statusPatch?: Record<string, unknown>;
turnOutcome?: unknown;
```

Behavior:

- Sort ascending by `createdAt`.
- Drop empty assistant failed drafts if existing route helpers already identify them; otherwise preserve all normal USER/ASSISTANT messages.
- Append `inFlightUserMessage` before slicing so the latest user turn is visible before it has been persisted.
- Keep latest 8.
- Older messages are candidates for summary.
- Track a summary coverage cursor: summarized-through message id, timestamp, and message count.
- Treat missing cursor metadata as `legacy_unknown`; do not claim the summary covers only older-than-latest-8 until refreshed.
- Do not call LLM.

- [ ] **Step 4: Run context tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/conversation-context.test.ts
```

Expected: PASS.

### Task 11: Pass recent messages to supervisor and worker tasks

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/types.ts`
- Modify: `packages/application/src/services/chatbot-v3/task-builder.ts`
- Modify: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- Modify: `apps/api/src/routes/chatbot-v3.routes.ts`
- Modify: `apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/routes/chatbot-v3/worker-task.ts`
- Test: `apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts`
- Test: `apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts`
- Test: `apps/api/src/routes/chatbot-v3/runtime.service.ts` coverage through existing route tests

- [ ] **Step 1: Add context fields**

Add required context fields where a task is built from runtime context:

```ts
recentMessages: ChatbotV3RecentMessage[];
conversationSummary: string;
```

to supervisor input, application `AgentTask`, and API `WorkerTaskBase`. Existing test helpers can use empty defaults.

- [ ] **Step 2: Update prompt rendering**

Supervisor prompt should include:

```text
recent_messages:
1. USER: ...
2. ASSISTANT: ...
```

Keep `latest_user_message` as a separate high-signal field.

- [ ] **Step 3: Update route-level context construction**

Before calling `handleTurn` in `chatbot-v3.routes.ts`:

- call `aiChatMessageRepo.listBySession(session.id, 20)` or enough to build latest 8 plus older count.
- Build context with helper.
- Append the current request message as an in-flight USER message before slicing.
- Pass the context into `handleTurn`.

Do not make `runtime.service.ts` call `listBySession` unless `aiChatMessageRepo` is deliberately added to runtime dependencies. Route-level context is preferred because the route already owns repositories and persistence ordering.

- [ ] **Step 4: Consume context inside runtime**

Inside `runtime.service.ts`:

- Pass `conversationSummary` from context, not only status snapshot.
- Pass both `recentMessages` and `conversationSummary` to supervisor and worker tasks.
- After the assistant response is rendered, update summary patches using the current assistant text as an in-flight ASSISTANT message when needed; do not require the assistant message to be persisted first.

- [ ] **Step 5: Render worker context in prompts**

Update FAQ/recommendation/records worker prompts that consume `WorkerTaskBase` to render both:

```text
conversation_summary=...
recent_messages=...
```

This is required because latest user message alone is not enough for long sessions.

- [ ] **Step 6: Keep summary update non-blocking for LLM**

For this patch, do not add an LLM summarizer. Persist a deterministic rolling summary only if helper can build one cheaply; otherwise keep existing summary and expose `summaryRefresh.due` in debug.

- [ ] **Step 7: Run API focused tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/supervisor-prompt.test.ts src/routes/chatbot-v3/faq-llm-adapter.test.ts
```

Expected: PASS.

## Chunk 5: Reducer, Response, And Debug Evidence

### Task 12: Update reducer/action side-path semantics for new events

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/journey-reducer.ts`
- Modify: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/journey-reducer.test.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/journey-session.test.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`

- [ ] **Step 1: Write failing reducer tests**

Assert:

- `USER_ASKED_QUESTION target=medical_advice` creates medical-advice answer/redirect boundary without advancing journey.
- `USER_ASKED_QUESTION target=service_scope` creates service-scope answer/redirect boundary without advancing journey.
- `USER_REQUESTED_ACTION target=handoff` or `USER_REQUESTED_HUMAN target=handoff` escalates.
- `USER_ASKED_QUESTION target=pricing/payment/travel/policy` stays side-path FAQ/answer and preserves primary stage.

- [ ] **Step 2: Update reducer conditions**

Replace event-specific checks for removed events with target/modifier checks.

- [ ] **Step 3: Run reducer/session tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-reducer.test.ts src/services/__tests__/chatbot-v3/journey-session.test.ts src/services/__tests__/chatbot-v3/supervisor.service.test.ts
```

Expected: PASS.

### Task 13: Update response composer quality/debug expectations

**Files:**

- Modify: `apps/api/src/routes/chatbot-v3/response-composer.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-quality-checker.ts`
- Modify: `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
- Test: `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- Test: `apps/api/src/routes/chatbot-v3/response-quality-checker.test.ts` if present
- Test: `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`

- [ ] **Step 1: Update debug schema tests**

Assert debug can show:

- `event.eventType`
- `event.target`
- `event.modifier`
- `loadedSkillSections`
- `coreInteractionContract` or equivalent
- `recentMessagesCount`
- `conversationSummaryRefresh`

- [ ] **Step 2: Update composer/checker references**

Replace old `safe_medical_redirect` and `out_of_scope_redirect` assumptions if they depend on removed event types. Keep response behavior, change classification basis to target/action.

- [ ] **Step 3: Run response tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts
pnpm --filter @medical-crm/shared test -- src/__tests__/chatbot-v3/chat.schema.test.ts
```

Expected: PASS.

## Chunk 6: End-To-End Test Update

### Task 14: Update route tests for new event taxonomy

**Files:**

- Modify: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts`

- [ ] **Step 1: Replace old event fixtures**

Search:

```bash
rg -n "USER_ASKED_MEDICAL_ADVICE|USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE|USER_EXPRESSED_NEED|documents|process|recommendation|human" apps/api/src packages/application/src/services/__tests__/chatbot-v3
```

Replace test fixtures with new event/target combinations. Do not blindly replace user-facing journey stage names.

- [ ] **Step 2: Add integrated route coverage**

Add tests:

- medical advice question routes as `USER_ASKED_QUESTION target=medical_advice`, loads `medical_advice_skill`.
- green-card request routes as `USER_ASKED_QUESTION target=service_scope`, loads `service_scope_skill`.
- payment refund request loads `payment_skill`, not `policy_skill`, unless policy section is auxiliary.
- travel visa/hotel request loads `travel_skill`.
- treatment aftercare question loads `treatment_skill`, not `followup_skill`.
- FAQ detour loads `faq_skill + relevant domain skill`.
- route debug includes recent message count.

- [ ] **Step 3: Run route tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts src/routes/chatbot-v3/supervisor-route-adapter.test.ts src/routes/chatbot-v3/faq-llm-adapter.test.ts
```

Expected: PASS.

### Task 15: Update natural session dogfood evidence

**Files:**

- Modify: `scripts/chatbot-v3-natural-session-dogfood.ts`
- Test by running script locally against mocked/local config if available.

- [ ] **Step 1: Update expected debug fields**

Natural dogfood report should print per turn:

- input
- output
- latency
- `eventType`
- `target`
- `modifier`
- `loadedSkillSections`
- `coreInteractionContract` present/missing
- `recentMessagesCount`
- `conversationSummaryRefresh`
- pass/fail classification notes

- [ ] **Step 2: Add expectation helpers**

For scenario assertions:

- medical advice expected target = `medical_advice`
- out-of-scope expected target = `service_scope`
- aftercare expected target = `treatment`
- payment expected target = `payment`
- travel expected target = `travel`

- [ ] **Step 3: Run dogfood script on one batch**

Run:

```bash
pnpm dogfood:chatbot-v3:natural-sessions -- --batch 01 --limit 3
```

Expected: script prints full node input/output/debug and does not crash. If CLI flags differ, update command in script docs.

## Chunk 7: Verification And Commit

### Task 16: Run focused verification

- [ ] **Step 1: Run application chatbot-v3 tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts src/services/__tests__/chatbot-v3/skill-loader.test.ts src/services/__tests__/chatbot-v3/read-planner.test.ts src/services/__tests__/chatbot-v3/skill-router.test.ts src/services/__tests__/chatbot-v3/task-builder.test.ts src/services/__tests__/chatbot-v3/journey-reducer.test.ts src/services/__tests__/chatbot-v3/journey-session.test.ts src/services/__tests__/chatbot-v3/supervisor.service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run API chatbot-v3 tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/conversation-context.test.ts src/routes/chatbot-v3/supervisor-prompt.test.ts src/routes/chatbot-v3/supervisor-route-adapter.test.ts src/routes/chatbot-v3/faq-llm-adapter.test.ts src/routes/chatbot-v3/response-composer.test.ts src/__tests__/chatbot-v3.routes.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @medical-crm/application typecheck
```

Expected: PASS.

API typecheck may still fail on known unrelated existing errors. If so, record exact unrelated errors and do not hide them.

- [ ] **Step 4: Search for forbidden taxonomy remnants**

```bash
rg -n "USER_ASKED_MEDICAL_ADVICE|USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE|safety_scope_skill|records_skill|eligibility_intake_skill|followup_skill" packages/application/src apps/api/src packages/shared/validation/src
```

Expected: no runtime references. Old docs may still contain historical references.

### Task 17: Commit with detailed message

- [ ] **Step 1: Review git diff**

```bash
git diff --stat
git diff -- packages/application/src/services/chatbot-v3 apps/api/src/routes/chatbot-v3 packages/shared/validation/src/chatbot-v3
```

- [ ] **Step 2: Commit**

Use the detailed-commit-messages skill style. Suggested title:

```bash
git add packages/application/src/services/chatbot-v3 apps/api/src/routes/chatbot-v3 packages/shared/validation/src/chatbot-v3 apps/api/src/__tests__/chatbot-v3.routes.test.ts docs/superpowers/specs/2026-04-29-chatbot-v3-domain-skill-taxonomy-design.md docs/superpowers/plans/2026-04-29-chatbot-v3-domain-skill-taxonomy-implementation.md scripts/chatbot-v3-natural-session-dogfood.ts
git commit
```

Commit body should include:

- why event types became action-only
- why targets align to skill set
- why `safety_scope_skill`, `records_skill`, `eligibility_intake_skill`, and `followup_skill` are absent
- how `core_interaction_contract` is injected
- how recent 8 messages + rolling summary work
- verification commands and known unrelated failures

## Execution Notes

- Do not pop `stash@{0}` unless explicitly asked.
- Do not reintroduce regex medical/out-of-scope classifiers.
- Do not let skills own journey stage progression.
- Keep `language` flow based on the user's selected language; do not infer or rewrite that flow in this patch.
- Keep summary refresh deterministic or asynchronous; do not add a blocking LLM call solely for summary maintenance.
