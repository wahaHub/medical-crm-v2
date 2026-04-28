# Chatbot V3 Skill-First Response Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragmented Phase 1.1 runtime skill fragments with target-domain skills, minimal response contracts, ReadIntent-aligned retrieved context, and a dogfood quality gate that verifies control-plane truth, skill behavior, and response quality.

**Architecture:** Preserve Phase 1.1 supervisor, reducer, `TurnPlan`, authority, and agent-resolution invariants. Refactor the response-quality layer so `SkillRouter` selects one primary and at most one auxiliary domain skill, `SkillLoader` trims sectionable skills, `ReadPlanner` plans reads from domain skills plus hints, and physical agents consume loaded skill sections without gaining stage/write/tool authority.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, `@medical-crm/application`, `@medical-crm/api`, chatbot-v3 runtime service, route adapters, dogfood scripts.

---

## Reference Documents

- Phase 1.2 spec: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/docs/superpowers/specs/2026-04-28-chatbot-v3-skill-first-response-quality-gate-design.md`
- Phase 1.1 control-plane spec: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/docs/superpowers/specs/2026-04-27-chatbot-v3-generic-events-turnplan-design.md`
- Phase 1.1 implementation plan: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/docs/superpowers/plans/2026-04-28-chatbot-v3-generic-events-turnplan-implementation.md`

## Design Decisions To Preserve

- Do not rewrite supervisor event extraction, `JourneyReducer`, or runtime authority.
- `ResponseContract` is a minimal guardrail, not a business playbook.
- Domain skills own business handling and service strategy.
- Skills remain code-defined in Phase 1.2, but their shape should be future-CMS-friendly.
- Worker tasks must not expose `fromStage` or `toStage`; use `currentStage` and `primaryStage`.
- Retrieved context must embed the original `ReadIntent` plus a stable per-turn `readIntentId`.
- Production dogfood must not deliberately inject live dependency failures.

## File Structure

Application package:

- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-packs.ts`
  Owns `DomainSkillId`, `DomainSkillPack`, section applicability, sectionable code-defined registry, and loaded section types.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-router.ts`
  Selects primary and auxiliary domain skill requests from event, `TurnPlan`, agent role, and facts.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-loader.ts`
  Trims requested domain skills to `LoadedSkillSection[]`, enforces budget, and exposes fallback warnings.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/read-planner.ts`
  Derives `ReadIntent[]` from domain skill sections and section hints.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/task-builder.ts`
  Builds `AgentTask` with minimal `ResponseContract`, `currentStage`, `primaryStage`, `LoadedSkillSection[]`, `ReadIntent[]`, and ReadIntent-aligned `retrievedContext`.
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts`

API package:

- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/worker-task.ts`
  Translates application `AgentTask` into physical worker task shapes without `fromStage`/`toStage`.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/runtime.service.ts`
  Passes selected domain skills, loaded sections, read intents, retrieved context, and quality debug fields through runtime.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/faq-prompts.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/records-prompts.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/recommendation-prompts.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/agents.ts`
  Makes physical agents consume `loadedSkillSections` explicitly.
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/response-quality-checker.ts`
  Deterministic control-plane, minimal-contract, and skill-behavior quality checks.
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/chatbot-v3.routes.test.ts`

Dogfood scripts:

- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/chatbot-v3-real-api-dogfood/scenarios.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/chatbot-v3-real-api-dogfood/chat-runner.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/chatbot-v3-real-api-dogfood/evaluator.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/chatbot-v3-real-api-dogfood/reporting.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/check-chatbot-v3-baseline-shell.test.mjs` if dogfood report shape affects shell checks.

## Validation Commands

- `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-router.test.ts src/services/__tests__/chatbot-v3/skill-loader.test.ts src/services/__tests__/chatbot-v3/read-planner.test.ts src/services/__tests__/chatbot-v3/task-builder.test.ts`
- `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3 src/__tests__/chatbot-v3.routes.test.ts`
- `pnpm test:chatbot-v3-baseline-shell`
- `pnpm --filter @medical-crm/application typecheck`
- `pnpm --filter @medical-crm/api typecheck`
- Production dogfood only after local tests pass: `pnpm tsx scripts/chatbot-v3-real-api-dogfood.ts --base-url https://crmapi.medicaltourismchina.health --site china`

Known caveat: API typecheck may still expose unrelated pre-existing errors. Record exact files if they remain.

---

## Chunk 1: Domain Skill Registry And Routing

### Task 1: Replace fragmented skill pack model with domain skill registry

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-packs.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts`

- [ ] **Step 1: Write failing registry shape tests**

Assert the exported registry contains exactly the Phase 1.2 domain ids:

```ts
expect(Object.keys(DOMAIN_SKILL_REGISTRY).sort()).toEqual([
  'clarification_recovery_skill',
  'consult_skill',
  'documents_skill',
  'hospital_recommendation_skill',
  'human_handoff_skill',
  'pricing_skill',
  'process_skill',
  'safety_scope_skill',
].sort());
```

Also assert each skill has `policySections`, `retrieval.sections`, `handling`, and does not expose heavy fields:

```ts
for (const skill of Object.values(DOMAIN_SKILL_REGISTRY)) {
  expect(skill).toHaveProperty('policySections');
  expect(skill).toHaveProperty('retrieval.sections');
  expect(skill).toHaveProperty('handling');
  expect(skill).not.toHaveProperty('examples');
  expect(skill).not.toHaveProperty('requiredBehaviors');
  expect(skill).not.toHaveProperty('forbiddenBehaviors');
}
```

- [ ] **Step 2: Run focused test to verify failure**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-loader.test.ts
```

Expected: FAIL while the old fragmented registry is still exported.

- [ ] **Step 3: Implement domain skill types and registry**

In `skill-packs.ts`, replace fragmented ids with:

```ts
export type DomainSkillId =
  | 'pricing_skill'
  | 'documents_skill'
  | 'process_skill'
  | 'hospital_recommendation_skill'
  | 'consult_skill'
  | 'human_handoff_skill'
  | 'safety_scope_skill'
  | 'clarification_recovery_skill';
```

Add `SkillSectionApplicability`, `DomainSkillPack`, `DomainSkillRequest`, `LoadedSkillSection`, and a code-defined `DOMAIN_SKILL_REGISTRY`. Keep sections short and deterministic. Map `travel` and `payment` to `process_skill` for Phase 1.2.

- [ ] **Step 4: Run registry tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-loader.test.ts
```

Expected: PASS for registry shape tests.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/skill-packs.ts \
  packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts
git commit -m "feat(chatbot-v3): define domain skill registry"
```

### Task 2: Route primary and auxiliary domain skills

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-router.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts`

- [ ] **Step 1: Write failing router tests**

Cover:

```ts
expect(buildSkillPolicy(pricingWithDocumentsFollowup).requests).toMatchObject([
  { skillId: 'pricing_skill', role: 'primary' },
  { skillId: 'documents_skill', role: 'auxiliary' },
]);
expect(buildSkillPolicy(documentsReject).requests).toMatchObject([
  { skillId: 'documents_skill', role: 'primary' },
]);
expect(buildSkillPolicy(nextStepDuringRecords).requests).toMatchObject([
  { skillId: 'process_skill', role: 'primary' },
  { skillId: 'documents_skill', role: 'auxiliary' },
]);
expect(buildSkillPolicy(outOfScopeRedirect).requests[0]).toMatchObject({
  skillId: 'safety_scope_skill',
  role: 'primary',
});
expect(buildSkillPolicy(contactProvided).requests[0]).toMatchObject({
  skillId: 'human_handoff_skill',
  role: 'primary',
});
expect(buildSkillPolicy(recommendationRevisit).requests[0]).toMatchObject({
  skillId: 'hospital_recommendation_skill',
  role: 'primary',
});
expect(buildSkillPolicy(travelQuestion).requests[0]).toMatchObject({
  skillId: 'process_skill',
  role: 'primary',
});
```

- [ ] **Step 2: Run focused router test to verify failure**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-router.test.ts
```

Expected: FAIL while router still emits fragmented skill ids.

- [ ] **Step 3: Implement routing rules**

Implement deterministic mapping:

```text
pricing -> pricing_skill
documents, medical_facts -> documents_skill
process, next_step, travel, payment -> process_skill
recommendation, hospital, hospital_selection -> hospital_recommendation_skill
consult -> consult_skill
human, contact -> human_handoff_skill
unknown -> clarification_recovery_skill
safety/out-of-scope redirect -> safety_scope_skill
```

Use `followUpAction.target` for auxiliary skill. Deduplicate primary/auxiliary collisions and cap at two requests.

- [ ] **Step 4: Run router tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-router.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/skill-router.ts \
  packages/application/src/services/__tests__/chatbot-v3/skill-router.test.ts
git commit -m "feat(chatbot-v3): route target-domain skills"
```

### Task 3: Trim loaded domain skill sections

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/skill-loader.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts`

- [ ] **Step 1: Write failing loader trimming tests**

Assert:

```ts
const loaded = loadSkillSections({
  requests: [pricingRequest, documentsAuxiliaryRequest],
});
expect(loaded.skillSections).toHaveLength(2);
expect(loaded.skillSections[0]).toMatchObject({
  skillId: 'pricing_skill',
  role: 'primary',
});
expect(loaded.skillSections[0].policyText.join('\n')).toContain('pricing');
expect(loaded.skillSections[0].sectionIds.length).toBeGreaterThan(0);
expect(loaded.skillSections[0].sectionIds.length).toBeLessThan(
  DOMAIN_SKILL_REGISTRY.pricing_skill.policySections.length + 1,
);
```

Also test unknown request fallback is observable:

```ts
expect(loadSkillSections({ requests: [unknownRequest] }).warnings).toContainEqual(
  expect.stringContaining('unknown skill'),
);
```

- [ ] **Step 2: Run loader tests to verify failure**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-loader.test.ts
```

Expected: FAIL while loader still returns full fragmented packs.

- [ ] **Step 3: Implement section trimming**

Implement `loadSkillSections()`:

- Resolve `DomainSkillRequest[]` from the code registry only.
- Match `policySections` and `retrieval.sections` using `sectionHints`.
- Add handling guidance for the matching `eventType` and `modifier`.
- Preserve `sectionIds`.
- Return at most two loaded sections.
- Return warnings for unknown ids and fallback to `clarification_recovery_skill` or `safety_scope_skill`.
- Do not call LLM, DB, CMS, filesystem, JSON, YAML, Markdown, or package-relative content loaders.

- [ ] **Step 4: Run loader tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-loader.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/skill-loader.ts \
  packages/application/src/services/__tests__/chatbot-v3/skill-loader.test.ts
git commit -m "feat(chatbot-v3): trim domain skill sections"
```

---

## Chunk 2: Read Planning And Agent Task Shape

### Task 4: Derive read intents from domain skills and hints

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/read-planner.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts`

- [ ] **Step 1: Write failing read planner tests**

Assert:

```ts
expect(buildReadPlan(pricingSkillInput).readIntents).toEqual(expect.arrayContaining([
  expect.objectContaining({ type: 'PRICING_FACTORS' }),
  expect.objectContaining({ type: 'GENERAL_FAQ', category: 'pricing' }),
]));
expect(buildReadPlan(documentsSkillInput).readIntents).toContainEqual(
  expect.objectContaining({ type: 'RECORD_REQUIREMENTS' }),
);
expect(buildReadPlan(travelSkillInput).readIntents).toContainEqual(
  expect.objectContaining({ type: 'TRAVEL_SUPPORT_SCOPE' }),
);
expect(buildReadPlan(paymentSkillInput).readIntents).toContainEqual(
  expect.objectContaining({ type: 'PAYMENT_POLICY' }),
);
```

- [ ] **Step 2: Run read planner test to verify failure**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/read-planner.test.ts
```

Expected: FAIL until planner consumes loaded domain skill sections.

- [ ] **Step 3: Implement domain-skill read planning**

Update input to include:

```ts
{
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  loadedSkillSections: readonly LoadedSkillSection[];
}
```

Derive reads from the skill section retrieval guidance and hints. Keep `ReadPlanner` deterministic and dedupe identical intents.

- [ ] **Step 4: Run read planner tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/read-planner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/read-planner.ts \
  packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts
git commit -m "feat(chatbot-v3): plan reads from domain skills"
```

### Task 5: Build minimal contract tasks with ReadIntent-aligned context

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/chatbot-v3/task-builder.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts`

- [ ] **Step 1: Write failing task-builder tests**

Assert:

```ts
expect(task.currentStage).toBe('COLLECT_MEDICAL_INPUTS');
expect(task.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
expect(task).not.toHaveProperty('fromStage');
expect(task).not.toHaveProperty('toStage');
expect(task.loadedSkillSections[0].skillId).toBe('pricing_skill');
expect(task.retrievedContext[0]).toMatchObject({
  readIntentId: expect.any(String),
  readIntent: expect.objectContaining({ type: 'PRICING_FACTORS' }),
});
expect(task.responseContract.constraints).not.toHaveProperty('tone');
```

- [ ] **Step 2: Run task-builder test to verify failure**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/task-builder.test.ts
```

Expected: FAIL while task builder still exposes fragmented skills or tone.

- [ ] **Step 3: Implement task shape**

Update `AgentTask`:

```ts
type RetrievedContextEntry = {
  readIntentId: string;
  readIntent: ReadIntent;
  snippets: Array<{ text: string; source?: string; score?: number }>;
};
```

Build task fields:

- `currentStage`
- `primaryStage`
- `primaryAction`
- `followUpAction`
- `responseContract`
- `loadedSkillSections`
- `readIntents`
- `retrievedContext`

Keep `ResponseContract` minimal and move style/tone guidance to loaded skill sections or agent defaults.

- [ ] **Step 4: Run task-builder tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/task-builder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/chatbot-v3/task-builder.ts \
  packages/application/src/services/__tests__/chatbot-v3/task-builder.test.ts
git commit -m "feat(chatbot-v3): build skill-section agent tasks"
```

---

## Chunk 3: API Runtime And Physical Agents

### Task 6: Translate application tasks into physical worker tasks

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/worker-task.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Write failing runtime bridge tests**

Assert debug/worker task output includes:

```ts
expect(debug.agentTask.currentStage).toBeDefined();
expect(debug.agentTask.primaryStage).toBeDefined();
expect(debug.agentTask.fromStage).toBeUndefined();
expect(debug.agentTask.toStage).toBeUndefined();
expect(debug.selectedDomainSkills).toContain('pricing_skill');
expect(debug.loadedSkillSections[0]).toHaveProperty('sectionIds');
expect(debug.readIntents[0]).toHaveProperty('type');
expect(debug.retrievedContext[0]).toHaveProperty('readIntent');
```

- [ ] **Step 2: Run focused API route tests to verify failure**

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: FAIL until runtime and worker-task bridge expose the Phase 1.2 task shape.

- [ ] **Step 3: Update worker task bridge and runtime**

- Remove `fromStage` and `toStage` from worker task adapters.
- Add `currentStage`, `primaryStage`, `loadedSkillSections`, `readIntents`, and `retrievedContext`.
- Preserve existing physical agent names.
- Keep agents unable to request additional reads or change stage.

- [ ] **Step 4: Run focused API route tests**

```bash
pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts
```

Expected: PASS or only unrelated pre-existing failures; record exact failures if unrelated.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/worker-task.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts
git commit -m "feat(chatbot-v3): bridge skill-section tasks to runtime"
```

### Task 7: Make physical agent prompts consume loaded skill sections

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/faq-prompts.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/records-prompts.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/recommendation-prompts.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/agents.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Assert prompts include `loaded_skill_sections=` and no longer rely on fragmented `allowed_skill_packs=` as the main strategy surface.

```ts
expect(prompt).toContain('loaded_skill_sections=');
expect(prompt).toContain('pricing_skill');
expect(prompt).toContain('sectionIds');
expect(prompt).not.toContain('handle_price_objection');
```

- [ ] **Step 2: Run prompt tests to verify failure**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/faq-llm-adapter.test.ts src/routes/chatbot-v3/records-llm-adapter.test.ts src/routes/chatbot-v3/recommendation-llm-adapter.test.ts
```

Expected: FAIL until prompts consume loaded skill sections.

- [ ] **Step 3: Update prompts and agent adapters**

- FaqAgent: use primary skill then auxiliary skill.
- RecordsAgent: use `documents_skill` handling for upload, reject, and hesitate paths.
- RecommendationAgent: use `hospital_recommendation_skill` and never invent options.
- ConsultAgent: use `consult_skill` readiness guidance when producing consult language.
- HandoffAgent: use `human_handoff_skill` for confirmation and payload summary.

- [ ] **Step 4: Run prompt tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/faq-llm-adapter.test.ts src/routes/chatbot-v3/records-llm-adapter.test.ts src/routes/chatbot-v3/recommendation-llm-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/faq-prompts.ts \
  apps/api/src/routes/chatbot-v3/records-prompts.ts \
  apps/api/src/routes/chatbot-v3/recommendation-prompts.ts \
  apps/api/src/routes/chatbot-v3/agents.ts \
  apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts \
  apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts \
  apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts
git commit -m "feat(chatbot-v3): guide agents with domain skill sections"
```

---

## Chunk 4: Quality Checks And Dogfood

### Task 8: Add deterministic response quality checker

**Files:**
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/response-quality-checker.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/apps/api/src/routes/chatbot-v3/response-composer.test.ts`

- [ ] **Step 1: Write failing quality checker tests**

Cover:

```ts
expect(checkMinimalContract(responseWithTwoQuestions, maxOneQuestionContract)).toContainEqual(
  expect.objectContaining({ id: 'max_questions', result: 'fail' }),
);
expect(checkSkillBehavior(fixedUnsupportedPrice, pricingSkillSection)).toContainEqual(
  expect.objectContaining({ skillId: 'pricing_skill', severity: 'hard', result: 'fail' }),
);
expect(checkSkillBehavior(documentPressureReply, documentsRejectSection)).toContainEqual(
  expect.objectContaining({ skillId: 'documents_skill', severity: 'hard', result: 'fail' }),
);
```

- [ ] **Step 2: Run quality checker tests to verify failure**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts
```

Expected: FAIL until checker exists.

- [ ] **Step 3: Implement checker**

Expose:

```ts
type SkillBehaviorCheck = {
  id: string;
  skillId: DomainSkillId;
  sectionHint: DomainSkillRequest['sectionHints'];
  evaluator: 'deterministic' | 'llm_judge';
  severity: 'hard' | 'soft' | 'observed';
  result: 'pass' | 'fail' | 'warn';
  reason?: string;
};
```

Implement deterministic checks for:

- max questions
- multiple CTAs
- forbidden claims
- preserve-stage language
- pricing unsupported fixed price
- document rejection pressure
- safety diagnosis/medication/guarantee claims
- invented hospital claims where detectable from candidate ids
- unsupported handoff promises

- [ ] **Step 4: Run checker tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbot-v3/response-quality-checker.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts
git commit -m "feat(chatbot-v3): check skill response quality"
```

### Task 9: Extend dogfood quality gate and reports

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/chatbot-v3-real-api-dogfood/scenarios.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/chatbot-v3-real-api-dogfood/chat-runner.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/chatbot-v3-real-api-dogfood/evaluator.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/chatbot-v3-real-api-dogfood/reporting.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc/scripts/check-chatbot-v3-baseline-shell.test.mjs`

- [ ] **Step 1: Write failing dogfood/report tests**

Add fixture assertions for:

```ts
qualityGate: 'required' | 'observed' | 'local_only';
failureCategory:
  | 'control_plane'
  | 'skill_routing'
  | 'read_planning'
  | 'agent_contract'
  | 'skill_behavior'
  | 'response_quality'
  | 'transport'
  | 'bootstrap';
```

Report should include:

```text
selectedDomainSkills
loadedSkillSections
readIntents
retrievedContext counts
minimalContractChecks
skillBehaviorChecks
llmJudgeSummary
```

- [ ] **Step 2: Run dogfood/report tests to verify failure**

```bash
pnpm test:chatbot-v3-baseline-shell
```

Expected: FAIL until report shape is updated.

- [ ] **Step 3: Implement qualityGate metadata and report evidence**

- Add `qualityGate` to scenarios.
- Move degraded fault injection to local-only semantics.
- Do not actively inject production dependency failure.
- Classify deterministic hard rule failures as hard failures.
- Classify LLM judge failures as response-quality soft failures.

- [ ] **Step 4: Run dogfood/report tests**

```bash
pnpm test:chatbot-v3-baseline-shell
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/chatbot-v3-real-api-dogfood/scenarios.ts \
  scripts/chatbot-v3-real-api-dogfood/chat-runner.ts \
  scripts/chatbot-v3-real-api-dogfood/evaluator.ts \
  scripts/chatbot-v3-real-api-dogfood/reporting.ts \
  scripts/check-chatbot-v3-baseline-shell.test.mjs
git commit -m "feat(chatbot-v3): add skill quality dogfood gate"
```

---

## Chunk 5: Full Verification And Release Handoff

### Task 10: Run full local verification

**Files:**
- No source changes expected unless verification finds issues.

- [ ] **Step 1: Run application tests**

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3
```

Expected: PASS.

- [ ] **Step 2: Run API chatbot-v3 tests**

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3 src/__tests__/chatbot-v3.routes.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run baseline shell**

```bash
pnpm test:chatbot-v3-baseline-shell
```

Expected: PASS.

- [ ] **Step 4: Run typechecks**

```bash
pnpm --filter @medical-crm/application typecheck
pnpm --filter @medical-crm/api typecheck
```

Expected: application PASS. API may show unrelated pre-existing errors; record exact files and do not hide them.

- [ ] **Step 5: Commit verification-only fixes if needed**

If verification exposes implementation issues, fix them with focused tests and commit:

```bash
git add <focused files>
git commit -m "fix(chatbot-v3): stabilize skill quality gate"
```

### Task 11: Run production dogfood after local green

**Files:**
- No source changes expected unless dogfood finds issues.

- [ ] **Step 1: Run real API dogfood**

```bash
pnpm tsx scripts/chatbot-v3-real-api-dogfood.ts \
  --base-url https://crmapi.medicaltourismchina.health \
  --site china
```

Expected: required scenarios PASS. Observed scenarios may warn. Local-only degraded scenarios must not inject production faults.

- [ ] **Step 2: Inspect artifacts**

Open the generated report under:

```text
artifacts/chatbot-v3-real-api-dogfood/<run-id>/report.md
```

Confirm it includes quality evidence and no control-plane failures.

- [ ] **Step 3: Handle failures**

- Control-plane failure: stop, debug root cause, fix, redeploy if needed, rerun.
- Skill routing/read planning failure: fix application routing/planning and rerun local tests.
- Agent contract/skill behavior failure: fix skill sections or prompts and rerun relevant tests.
- LLM judge soft failure: calibrate copy or mark observed only if the deterministic gates are clean and the warning is not user-harming.

- [ ] **Step 4: Prepare implementation handoff**

Summarize:

- commits
- local verification
- production dogfood artifact path
- remaining observed warnings
- known unrelated typecheck failures
