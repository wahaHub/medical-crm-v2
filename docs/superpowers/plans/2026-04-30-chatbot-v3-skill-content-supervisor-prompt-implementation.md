# Chatbot V3 Skill Content And Supervisor Prompt Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the refined Medora domain skill content and clarified supervisor event definitions from the design spec into the chatbot-v3 runtime prompts, skill packs, routing tests, and supervisor prompt tests.

**Architecture:** Keep the current supervisor -> reducer/runtime authority -> skill router -> worker task pipeline. Do not add skill-specific event types; keep `eventType` as the user's action shape, use `target` for the skill-aligned business domain, and use `modifier` for posture. Implement rich domain behavior inside skill content and routing/prompt guidance, not by expanding event type names.

**Tech Stack:** TypeScript, pnpm, Vitest, existing chatbot-v3 application services, Hono API route tests, code-defined domain skill registry.

---

Spec: `docs/superpowers/specs/2026-04-29-chatbot-v3-domain-skill-taxonomy-design.md`

Existing related plan: `docs/superpowers/plans/2026-04-29-chatbot-v3-domain-skill-taxonomy-implementation.md`

## File Structure

Modify:

- `packages/application/src/services/chatbot-v3/skill-packs.ts`:
  Source of runtime skill content. Add the refined `service_scope_skill`, `policy_skill`, `medical_advice_skill`, `hospital_skill`, `treatment_skill`, `pricing_skill`, `payment_skill`, `travel_skill`, `sales_skill`, `handoff_skill`, and `clarification_recovery_skill` content. Add or preserve `core_interaction_contract` injection according to the architecture work already present.

- `packages/application/src/services/chatbot-v3/skill-loader.ts`:
  Ensure loaded skill sections include the global interaction contract plus the requested domain skill sections without loading the whole catalog every turn.

- `packages/application/src/services/chatbot-v3/skill-router.ts`:
  Ensure canonical targets route to the intended skill. Preserve compatibility aliases only at boundaries; canonical routing should use `service_scope`, `policy`, `medical_advice`, `hospital`, `treatment`, `pricing`, `payment`, `travel`, `sales`, `faq`, `handoff`, and `unknown`.

- `packages/application/src/services/chatbot-v3/read-planner.ts`:
  Ensure domain skill requests produce the right read intents, especially hospital API/search, pricing/payment policy, travel logistics, FAQ, and handoff.

- `apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`:
  Expand supervisor prompt wording so the LLM understands `eventType`, `target`, and `modifier` boundaries. Do not add new event types.

- `apps/api/src/routes/chatbot-v3/supervisor-route-adapter.ts`:
  Keep strict schema aligned with canonical event types, targets, and modifiers. Update only if tests show stale schema or comments.

Tests:

- `packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts`
- `packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts`
- `packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts`
- `packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts`
- `packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts`
- `apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts`
- `apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts`
- `apps/api/src/routes/chatbot-v3/response-composer.test.ts`

Do not create:

- `records_skill`
- `eligibility_intake_skill`
- `followup_skill`
- standalone `safety_skill`
- skill-specific supervisor event types such as `USER_ASKED_MEDICAL_ADVICE`

## Chunk 1: Preserve The Canonical Event Model

### Task 1: Lock event type boundaries with tests

**Files:**

- Modify: `packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts`
- Verify: `packages/application/src/services/chatbot-v3/supervisor-event.types.ts`

- [ ] **Step 1: Add regression tests for action-only semantic event types**

Add or keep assertions equivalent to:

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

- [ ] **Step 2: Add regression tests for canonical targets**

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
```

- [ ] **Step 3: Run event type tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts
```

Expected: PASS. If this fails because a legacy event type is still canonical, remove it from the canonical list and keep compatibility normalization only at the boundary.

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts packages/application/src/services/chatbot-v3/supervisor-event.types.ts
git commit -m "test(chatbot-v3): lock canonical supervisor event taxonomy"
```

## Chunk 2: Supervisor Prompt Clarity

### Task 2: Make the supervisor prompt explain eventType vs target vs modifier

**Files:**

- Modify: `apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`
- Test: `apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts`

- [ ] **Step 1: Write failing prompt tests for the split**

Add assertions that the prompt contains these concepts:

```ts
expect(prompt).toContain('eventType is the user action shape');
expect(prompt).toContain('target is the business domain');
expect(prompt).toContain('modifier is the user posture');
expect(prompt).toContain('Do not create skill-specific event types');
```

- [ ] **Step 2: Write failing prompt tests for detailed event guidance**

Assert the prompt includes guidance for all seven semantic event types:

```ts
for (const eventType of [
  'USER_EXPRESSED_INTEREST',
  'USER_ASKED_QUESTION',
  'USER_PROVIDED_INFORMATION',
  'USER_RESPONDED_TO_REQUEST',
  'USER_REQUESTED_ACTION',
  'USER_REQUESTED_HUMAN',
  'USER_MESSAGE_UNCLEAR',
]) {
  expect(prompt).toContain(eventType);
}

expect(prompt).toContain('medical-advice questions use USER_ASKED_QUESTION with target=medical_advice');
expect(prompt).toContain('outside Medora scope uses target=service_scope');
expect(prompt).toContain('USER_REQUESTED_HUMAN always uses target=handoff');
expect(prompt).toContain('Do not represent human requests as modifier=request_action');
```

- [ ] **Step 3: Implement prompt wording**

In `supervisor-prompt.ts`, add a compact guide based on the spec:

```ts
const EVENT_TARGET_MODIFIER_BOUNDARY_GUIDE = [
  'eventType is the user action shape.',
  'target is the business domain / skill-aligned topic.',
  'modifier is the user posture.',
  'Do not create skill-specific event types.',
  'A medical, pricing, hospital, travel, payment, sales, or policy question can all be USER_ASKED_QUESTION; the domain difference belongs in target.',
].join('\n');
```

Then add a short per-event guide. Keep it concise enough for latency:

- `USER_EXPRESSED_INTEREST`: goal/desire, not a concrete action.
- `USER_ASKED_QUESTION`: information/explanation/feasibility/policy/medical-orientation question.
- `USER_PROVIDED_INFORMATION`: facts, files, contact details, corrections.
- `USER_RESPONDED_TO_REQUEST`: answer to previous assistant request.
- `USER_REQUESTED_ACTION`: operational request for Medora to do something.
- `USER_REQUESTED_HUMAN`: explicit human/coordinator/contact request, always `target=handoff`.
- `USER_MESSAGE_UNCLEAR`: too unclear to classify safely.

- [ ] **Step 4: Run prompt tests**

Run:

```bash
pnpm --dir apps/api test src/routes/chatbot-v3/supervisor-prompt.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/supervisor-prompt.ts apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts
git commit -m "fix(chatbot-v3): clarify supervisor event classification prompt"
```

## Chunk 3: Skill Content Runtime Migration

### Task 3: Add detailed skill content sections to the registry

**Files:**

- Modify: `packages/application/src/services/chatbot-v3/skill-packs.ts`
- Test: `packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts`

- [ ] **Step 1: Write failing coverage tests for required content anchors**

Add tests that each critical skill includes distinctive approved facts from the spec:

```ts
const allPolicyText = (skillId: keyof typeof DOMAIN_SKILL_REGISTRY) =>
  DOMAIN_SKILL_REGISTRY[skillId].policySections.map((section) => section.text).join('\n');

expect(allPolicyText('service_scope_skill')).toContain('RM H2 4/F CENTURY IND CTR');
expect(allPolicyText('service_scope_skill')).toContain('US +1 4708613825');
expect(allPolicyText('service_scope_skill')).toContain('contact@medicaltourismchina.health');

expect(allPolicyText('policy_skill')).toContain('USD 400');
expect(allPolicyText('policy_skill')).toContain('within 48 hours');
expect(allPolicyText('policy_skill')).toContain('does not provide claims support');

expect(allPolicyText('medical_advice_skill')).toContain('online consultation');
expect(allPolicyText('hospital_skill')).toContain('hospital API');
expect(allPolicyText('hospital_skill')).toContain('specific doctor');
expect(allPolicyText('treatment_skill')).toContain('required step before coming to China');

expect(allPolicyText('pricing_skill')).toContain('Hospital medical cost vs Medora service fee');
expect(allPolicyText('payment_skill')).toContain('Payee distinction');
expect(allPolicyText('travel_skill')).toContain('medical path first');
expect(allPolicyText('sales_skill')).toContain('low-friction');
expect(allPolicyText('handoff_skill')).toContain('Handoff summary');
expect(allPolicyText('clarification_recovery_skill')).toContain('Safe-assumption');
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-loader.test.ts
```

Expected: FAIL until the registry contains the refined content.

- [ ] **Step 3: Update `service_scope_skill`**

Add structured sections from the spec:

- Medora identity and public contact facts.
- Service catalog.
- City coverage.
- Service boundary.
- Response style.

Keep sections chunked so the loader can select relevant excerpts instead of always injecting the full catalog.

- [ ] **Step 4: Update `policy_skill`**

Add:

- service continuation facts
- online consultation policy: USD 400, kept if user does not come, applied to treatment cost if user comes
- uploaded materials review within 48 hours
- public/private hospital fee policy
- insurance policy: no claims support; insurer policy/coverage/reimbursement/direct-billing/claims questions go to the user's insurer; Medora human/coordinator may explain Medora's boundary, help with medical liability insurance purchase, organize neutral hospital documents, or ask hospitals about hospital liability insurance
- privacy and promise boundaries

- [ ] **Step 5: Update `medical_advice_skill`, `hospital_skill`, and `treatment_skill`**

Add:

- preliminary safe medical orientation and online consultation CTA
- urgent red flag handling without turning every answer into refusal
- hospital API first, then online search/citations for recommendation reasons
- doctor recommendation requires records before human review
- treatment journey and preparation guidance

- [ ] **Step 6: Update `pricing_skill`, `payment_skill`, and `travel_skill`**

Add:

- pricing cost components and public/private cost framing
- USD 400 online consultation policy
- other Medora service fees require records and human confirmation
- payment payee distinction, invoice/receipt/currency/deposit/refund boundaries
- medical-path-first travel planning, visa/invitation/pickup/hotel/accompaniment/logistics support

- [ ] **Step 7: Update `sales_skill`, `handoff_skill`, and `clarification_recovery_skill`**

Add:

- trust, hesitation, value explanation, Medora vs direct hospital, Medora vs travel agency
- handoff readiness and minimum context by handoff type
- contact collection and handoff summary fields
- clarification recovery patterns for ambiguity, contradiction, missing object, emotional input, and safe assumptions

- [ ] **Step 8: Run skill loader tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-loader.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/application/src/services/chatbot-v3/skill-packs.ts packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts
git commit -m "feat(chatbot-v3): enrich Medora domain skill packs"
```

## Chunk 4: Skill Loading, Routing, And Read Intent Behavior

### Task 4: Verify each target loads the intended skill

**Files:**

- Modify: `packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts`
- Modify if needed: `packages/application/src/services/chatbot-v3/skill-router.ts`

- [ ] **Step 1: Add table-driven routing tests**

Add cases:

```ts
[
  ['service_scope', 'service_scope_skill'],
  ['policy', 'policy_skill'],
  ['medical_advice', 'medical_advice_skill'],
  ['hospital', 'hospital_skill'],
  ['treatment', 'treatment_skill'],
  ['pricing', 'pricing_skill'],
  ['payment', 'payment_skill'],
  ['travel', 'travel_skill'],
  ['sales', 'sales_skill'],
  ['faq', 'faq_skill'],
  ['handoff', 'handoff_skill'],
].forEach(([target, expectedSkillId]) => {
  // build event with USER_ASKED_QUESTION + target + modifier=ask
  // expect buildSkillPolicy(...).requests[0].skillId === expectedSkillId
});
```

- [ ] **Step 2: Add special routing tests**

Assert:

- `USER_REQUESTED_HUMAN + target=handoff` loads `handoff_skill`.
- `USER_MESSAGE_UNCLEAR + target=unknown` loads `clarification_recovery_skill`.
- `USER_ASKED_QUESTION + target=medical_advice + modifier=urgent` loads `medical_advice_skill`.
- `USER_REQUESTED_ACTION + target=service_scope` loads `service_scope_skill`.

- [ ] **Step 3: Run routing tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-router.test.ts
```

Expected: PASS.

### Task 5: Verify read intents match the new skill content

**Files:**

- Modify: `packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts`
- Modify if needed: `packages/application/src/services/chatbot-v3/read-planner.ts`

- [ ] **Step 1: Add read intent tests**

Add tests that:

- `hospital_skill` can request hospital search/API and online source evidence.
- `pricing_skill` requests pricing/payment policy only when useful.
- `payment_skill` requests payment policy.
- `travel_skill` requests travel support scope.
- `sales_skill` can request general FAQ / trust/service positioning sources.
- `handoff_skill` does not require irrelevant retrieval if the task is pure contact collection.

- [ ] **Step 2: Run read planner tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/read-planner.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit routing/read-intent changes**

```bash
git add packages/application/src/services/chatbot-v3/skill-router.ts packages/application/src/services/chatbot-v3/read-planner.ts packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts
git commit -m "test(chatbot-v3): align skill routing with domain targets"
```

## Chunk 5: Worker Task And Response Guardrails

### Task 6: Ensure loaded skill content reaches worker tasks

**Files:**

- Modify: `packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts`
- Modify if needed: `packages/application/src/services/chatbot-v3/task-builder.ts`

- [ ] **Step 1: Add worker task tests**

Assert that a task built with `pricing_skill` includes:

- global interaction contract or equivalent loaded shared contract
- pricing policy text
- modifier/posture hint
- target hint

Assert a task built with `handoff_skill` includes:

- handoff readiness guidance
- no unsupported promise of exact response time

- [ ] **Step 2: Run task builder tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/task-builder.test.ts
```

Expected: PASS.

### Task 7: Keep response-composer guardrails aligned with new skills

**Files:**

- Modify: `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- Modify if needed: `apps/api/src/routes/chatbot-v3/response-composer.ts`

- [ ] **Step 1: Add/keep guardrail tests**

Cover:

- `handoff_skill` must not promise unsupported callback timing.
- `medical_advice_skill` must not prescribe or guarantee outcomes.
- `pricing_skill` must not invent exact prices.
- `hospital_skill` must not invent doctor recommendations without records.
- `payment_skill` must not invent payment/refund methods.

- [ ] **Step 2: Run response-composer tests**

Run:

```bash
pnpm --dir apps/api test src/routes/chatbot-v3/response-composer.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/services/chatbot-v3/task-builder.ts packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts apps/api/src/routes/chatbot-v3/response-composer.ts apps/api/src/routes/chatbot-v3/response-composer.test.ts
git commit -m "test(chatbot-v3): preserve skill guardrails in worker tasks"
```

## Chunk 6: Focused End-To-End Verification

### Task 8: Add classification scenarios for the refined taxonomy

**Files:**

- Modify: `apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts`
- Modify if present/needed: `packages/application/src/services/__tests__/chatbot-v3/fixtures/supervisor-eval.fixtures.ts`

- [ ] **Step 1: Add classification examples**

Use representative messages:

```ts
[
  ['Why should I trust Medora?', 'USER_ASKED_QUESTION', 'sales', 'ask'],
  ['Can I talk to a human?', 'USER_REQUESTED_HUMAN', 'handoff', 'ask'],
  ['I uploaded my CT report.', 'USER_PROVIDED_INFORMATION', 'treatment', 'provide'],
  ['Could this be lung cancer?', 'USER_ASKED_QUESTION', 'medical_advice', 'ask'],
  ['How much is the online consultation?', 'USER_ASKED_QUESTION', 'pricing', 'ask'],
  ['How do I pay?', 'USER_ASKED_QUESTION', 'payment', 'ask'],
  ['Can you arrange airport pickup?', 'USER_REQUESTED_ACTION', 'travel', 'request_action'],
  ['Help me compare public hospitals in Shanghai.', 'USER_REQUESTED_ACTION', 'hospital', 'compare'],
  ['I do not want to upload all records.', 'USER_RESPONDED_TO_REQUEST', 'policy', 'hesitate'],
  ['that one', 'USER_MESSAGE_UNCLEAR', 'unknown', 'unknown'],
]
```

The exact test harness may assert prompt wording rather than live LLM output. Do not add brittle tests that depend on real model calls.

- [ ] **Step 2: Run supervisor route/prompt tests**

Run:

```bash
pnpm --dir apps/api test src/routes/chatbot-v3/supervisor-prompt.test.ts src/routes/chatbot-v3/supervisor-route-adapter.test.ts
```

Expected: PASS.

### Task 9: Run focused chatbot-v3 regression suite

**Files:**

- No source edits unless failures show real regressions.

- [ ] **Step 1: Run application chatbot-v3 tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts \
  src/services/__tests__/chatbot-v3/supervisor.service.test.ts \
  src/services/__tests__/chatbot-v3/skill-loader.test.ts \
  src/services/__tests__/chatbot-v3/skill-router.test.ts \
  src/services/__tests__/chatbot-v3/read-planner.test.ts \
  src/services/__tests__/chatbot-v3/task-builder.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run API chatbot-v3 tests**

Run:

```bash
pnpm --dir apps/api test \
  src/routes/chatbot-v3/supervisor-prompt.test.ts \
  src/routes/chatbot-v3/supervisor-route-adapter.test.ts \
  src/routes/chatbot-v3/response-composer.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typechecks**

Run:

```bash
pnpm --filter @medical-crm/application typecheck
pnpm --dir apps/api typecheck
```

Expected: PASS.

- [ ] **Step 4: Final commit**

```bash
git status --short
git add docs/superpowers/specs/2026-04-29-chatbot-v3-domain-skill-taxonomy-design.md docs/superpowers/plans/2026-04-30-chatbot-v3-skill-content-supervisor-prompt-implementation.md
git commit -m "docs(chatbot-v3): plan refined skill content implementation"
```

## Notes For Implementers

- The refined skill content is intentionally long. Runtime should load `core_interaction_contract` plus only the 1-2 relevant domain skills for the turn.
- Do not solve content length by trimming away business facts. Solve it by section selection and loading discipline.
- The supervisor does not decide final response behavior; it classifies. The worker skill content decides how to answer within domain.
- If there is a conflict between this plan and the spec, the spec is the product source of truth.
- If another agent is simultaneously editing architecture files, coordinate before touching `skill-packs.ts`, `skill-loader.ts`, `skill-router.ts`, or `supervisor-prompt.ts`.
