# Chatbot V3 Domain Skill Taxonomy Handoff

Date: 2026-04-29
Repo: `/Users/haowang/Desktop/claws/medical-crm-v2`
Branch: `feature/phase-2bc`
Current HEAD observed during handoff: `174ad930ae3d65050b173a065e7bb0c42d06a16f`

## Purpose

This handoff is for the next agent working on chatbot-v3 skill taxonomy and skill-content refinement.

The immediate next product direction is:

- move semantic event types toward user actions only
- align `target` with the business skill set
- remove standalone `safety`, `records`, `eligibility_intake`, and `followup` skills
- add a global `core_interaction_contract`
- make every domain skill handle the full posture matrix
- give supervisor/worker agents recent 8 direct messages plus a rolling summary for older history

Another agent may refine the content of each skill in parallel. That work should not block the structural implementation, but it should avoid changing the accepted taxonomy unless the user explicitly reopens the design.

## Relevant Specs And Plans

### Earlier Foundation: Generic Events And TurnPlan

Spec:

- `docs/superpowers/specs/2026-04-27-chatbot-v3-generic-events-turnplan-design.md`

Plan:

- `docs/superpowers/plans/2026-04-28-chatbot-v3-generic-events-turnplan-implementation.md`

What it introduced:

- Supervisor event extraction became more generic.
- Runtime/reducer started using event + target + modifier + TurnPlan instead of older stage-specific intent handling.
- Generic response actions map into physical agents such as `FaqAgent`, `RecordsAgent`, `RecommendationAgent`, `ConsultAgent`, and `HandoffAgent`.

How it evolved:

- This layer was a necessary bridge, but it still allowed too much domain meaning to sit inside `eventType`.
- It also still had legacy-ish skill concepts such as `SkillKind`, `SkillRequest`, and broad targets like `documents`, `process`, `recommendation`, `human`, and `consult`.

### Earlier Foundation: Skill-First Response Quality Gate

Spec:

- `docs/superpowers/specs/2026-04-28-chatbot-v3-skill-first-response-quality-gate-design.md`

Plan:

- `docs/superpowers/plans/2026-04-28-chatbot-v3-skill-first-response-quality-gate-implementation.md`

What it introduced:

- Domain skill sections became part of the task context.
- `loadedSkillSections`, `readIntents`, and `retrievedContext` started flowing into response composition/debug evidence.
- Response contract checks stayed minimal: the quality gate should ensure basic safety and grounding, not over-control the answer.
- FAQ, pricing, process, hospital recommendation, consult, documents, safety/scope, handoff, and clarification skill areas existed as early code-level packs.

How it evolved:

- The Phase 1.2 skill-pack set was useful but too small and partially mis-bounded.
- `process_skill` had absorbed travel/payment/process concerns.
- `safety_scope_skill` had absorbed medical advice and service-scope boundaries.
- There was a `FaqAgent` and FAQ read intents, but no explicit `faq_skill` behavior contract.

### Current Design: Domain Skill Taxonomy

Spec:

- `docs/superpowers/specs/2026-04-29-chatbot-v3-domain-skill-taxonomy-design.md`

Implementation plan:

- `docs/superpowers/plans/2026-04-29-chatbot-v3-domain-skill-taxonomy-implementation.md`

Review status:

- These two docs were reviewed with the `review-until-clean` workflow.
- First review found issues around route/runtime context construction, worker summary propagation, `contact`/`consult` target mismatch, missing summary coverage cursor, and stale `request_human` modifier language.
- Those issues were fixed.
- Final reviewer reported: no meaningful findings remain.

Current accepted taxonomy:

- `service_scope_skill`
- `policy_skill`
- `medical_advice_skill`
- `hospital_skill`
- `treatment_skill`
- `pricing_skill`
- `payment_skill`
- `travel_skill`
- `sales_skill`
- `faq_skill`
- `handoff_skill`
- `clarification_recovery_skill`
- `core_interaction_contract` as a global injected contract, not a user-facing skill and not a `SupervisorEventTarget`

Explicitly not part of authoritative taxonomy:

- `safety_skill`
- `safety_scope_skill`
- `records_skill`
- `eligibility_intake_skill`
- `followup_skill`

Canonical event direction:

- `eventType` should describe user action.
- `target` should describe the business domain / skill-aligned topic.
- `modifier` should describe user posture.

Canonical semantic event types:

- `USER_EXPRESSED_INTEREST`
- `USER_ASKED_QUESTION`
- `USER_PROVIDED_INFORMATION`
- `USER_RESPONDED_TO_REQUEST`
- `USER_REQUESTED_ACTION`
- `USER_REQUESTED_HUMAN`
- `USER_MESSAGE_UNCLEAR`

Removed semantic event types:

- `USER_ASKED_MEDICAL_ADVICE`
- `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE`

Canonical targets:

- `service_scope`
- `policy`
- `medical_advice`
- `hospital`
- `treatment`
- `pricing`
- `payment`
- `travel`
- `sales`
- `faq`
- `handoff`
- `unknown`

Removed canonical targets:

- `records`
- `eligibility_intake`
- `documents`
- `process`
- `recommendation`
- `hospital_selection`
- `medical_facts`
- `consult`
- `contact`
- `human`

Canonical modifiers:

- `ask`
- `provide`
- `confirm`
- `reject`
- `hesitate`
- `correct`
- `compare`
- `revisit`
- `request_action`
- `urgent`
- `unknown`

Human requests:

- Use `eventType=USER_REQUESTED_HUMAN`, `target=handoff`.
- Do not add `request_human` as a modifier/posture.

## How The Design Evolved

The earlier generic-events plan separated user turns into event/target/modifier, but domain meaning still leaked into `eventType`.

During testing, `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE` performed poorly when examples focused on medical guarantee/promise wording. The user clarified:

- “Can you help me get a green card?” is a real out-of-scope/service-scope ask.
- “Can you guarantee cure?” is medical advice / outcome guarantee handling.
- The model should know Medora's in-scope services first, not rely on a blacklist.

That led to:

- out-of-scope moving under `service_scope_skill`
- medical boundaries moving under `medical_advice_skill`
- removal of `USER_ASKED_MEDICAL_ADVICE` and `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE` as event types

Then the skill taxonomy was reshaped around real Medora service domains rather than FAQ spreadsheet categories.

The user proposed:

- Medora/about-us scope
- policy/process/insurance
- hospital selection
- pricing
- travel
- treatment
- payment
- sales
- medical advice
- follow-up

Final resolution:

- `followup_skill` was removed because follow-up is continuation logic, not a standalone business domain.
- Follow-up behavior belongs inside each primary skill.
- `records_skill` and `eligibility_intake_skill` were removed; records/intake behavior belongs primarily in `treatment_skill` and `medical_advice_skill`.
- `core_interaction_contract` was added globally for validation and posture handling, while domain skills define domain-specific missing-detail rules.

## Current Code Progress

Important: the new domain taxonomy plan has not been executed yet.

Code already changed earlier in the current working tree:

- `USER_ASKED_RISKY_MEDICAL_ADVICE` was renamed to `USER_ASKED_MEDICAL_ADVICE` in the older intermediate design.
- Medical advice guidance was expanded in the current old `safety_scope_skill`.
- `runtimeDebug.event` was added/exposed in response/debug surfaces.
- Natural-language session dogfood files were added:
  - `docs/analysis/2026-04-29-chatbot-v3-natural-language-sessions-batch-01.md`
  - `docs/analysis/2026-04-29-chatbot-v3-natural-language-sessions-batch-02.md`
  - `docs/analysis/2026-04-29-chatbot-v3-natural-language-sessions-batch-03.md`
  - `docs/analysis/2026-04-29-chatbot-v3-natural-language-sessions-batch-04.md`
  - `scripts/chatbot-v3-natural-session-dogfood.ts`
- Medical/out-of-scope regex heuristic work was already removed or reduced in `supervisor.service.ts` during earlier cleanup.
- Legacy skill registry concepts were removed from the running application code:
  - `SkillKind`
  - old `SkillRequest`
  - `LEGACY_SKILL_PACK_REGISTRY`
  - legacy `loadedSkills`
- Current old skill packs were expanded but do not yet match the new taxonomy:
  - `pricing_skill`
  - `documents_skill`
  - `process_skill`
  - `hospital_recommendation_skill`
  - `consult_skill`
  - `human_handoff_skill`
  - `safety_scope_skill`
  - `clarification_recovery_skill`

New taxonomy implementation still needs to start from the reviewed implementation plan.

## Current Worktree Status Notes

Observed branch:

- `feature/phase-2bc`

Observed status includes many uncommitted modified files from earlier chatbot-v3 work, plus these new docs:

- `docs/superpowers/specs/2026-04-29-chatbot-v3-domain-skill-taxonomy-design.md`
- `docs/superpowers/plans/2026-04-29-chatbot-v3-domain-skill-taxonomy-implementation.md`

There is also an existing stash that should not be popped unless explicitly requested:

- `stash@{0}: On feature/phase-2bc: pre-phase1-2-merge supervisor read-domain metadata WIP`

## Verification Already Run Earlier

Before the latest taxonomy docs, earlier code changes had focused tests passing:

- `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/skill-loader.test.ts src/services/__tests__/chatbot-v3/read-planner.test.ts src/services/__tests__/chatbot-v3/supervisor.service.test.ts src/services/__tests__/chatbot-v3/skill-router.test.ts src/services/__tests__/chatbot-v3/task-builder.test.ts`
  - 152 tests passed
- A broader application chatbot-v3 test command:
  - 182 tests passed
- API chatbot-v3 focused tests:
  - 202 tests passed
- `pnpm --filter @medical-crm/application typecheck`
  - passed

API typecheck was known to have unrelated pre-existing errors around:

- `src/composition-root.ts` duplicate `conversationRepo`
- `src/routes/chatbot.routes.ts` unused `tryResolveAdminConversationForChatbotSession`
- `src/routes/patient-widget-starter.ts` readonly shortlist type

The two newest taxonomy docs are docs-only and were statically reviewed by subagents; no code tests were run for those docs.

## Next Implementation Step

Start from:

- `docs/superpowers/plans/2026-04-29-chatbot-v3-domain-skill-taxonomy-implementation.md`

Recommended execution order:

1. Implement Chunk 1: canonical event model.
2. Implement Chunk 2: supervisor prompt and compatibility normalization.
3. Implement Chunk 3: skill taxonomy migration.
4. Implement Chunk 4: conversation context window.
5. Implement Chunk 5: reducer/response/debug evidence.
6. Implement Chunk 6: route tests and natural session dogfood.
7. Run verification and commit.

The user may run another agent in parallel to refine skill content. That agent should primarily work in or around:

- `packages/application/src/services/chatbot-v3/skill-packs.ts`
- possibly docs describing skill content

Coordinate carefully if multiple agents edit `skill-packs.ts`.

## Guidance For The Skill-Refinement Agent

The skill-refinement agent should not re-litigate the taxonomy unless the user asks.

Refine content within these accepted domains:

- `service_scope_skill`
- `policy_skill`
- `medical_advice_skill`
- `hospital_skill`
- `treatment_skill`
- `pricing_skill`
- `payment_skill`
- `travel_skill`
- `sales_skill`
- `faq_skill`
- `handoff_skill`
- `clarification_recovery_skill`
- global `core_interaction_contract`

Every domain skill should include handling for:

- `ask`
- `provide`
- `confirm`
- `reject`
- `hesitate`
- `correct`
- `compare`
- `revisit`
- `request_action`
- `urgent`
- `unknown`

Examples of expected posture behavior:

- `reject`: downgrade the ask, offer an alternative, or keep the workflow open without pressure.
- `hesitate`: acknowledge concern, lower friction, and offer a smaller step.
- `confirm`: confirm only what is supported; name uncertainty instead of over-confirming.
- `compare`: compare on supported dimensions only; do not invent rankings.
- `urgent`: use the domain's urgency-safe path.
- `unknown`: ask one focused clarification.

Skill content should be grounded in:

- `/Users/haowang/Desktop/medora-health-beauty/Medora_AI_FAQ.xlsx`
- current reviewed taxonomy spec
- existing skill-pack code, only as migration source material

FAQ spreadsheet categories should seed content and retrieval taxonomy. They should not become one-to-one runtime skills.

FAQ spreadsheet mapping:

- 公司与定位 -> `service_scope_skill`, `sales_skill`, `faq_skill`
- 服务范围与流程 -> `service_scope_skill`, `policy_skill`, `faq_skill`
- 医院医生与治疗 -> `hospital_skill`, `treatment_skill`, `medical_advice_skill`, `faq_skill`
- 费用与支付 -> `pricing_skill`, `payment_skill`, `policy_skill`, `faq_skill`
- 签证出行住宿 -> `travel_skill`, `service_scope_skill`, `faq_skill`
- 院内支持与陪同 -> `travel_skill`, `treatment_skill`, `handoff_skill`, `faq_skill`
- 术后随访与隐私 -> `treatment_skill`, `policy_skill`, `medical_advice_skill`, `faq_skill`
- 保险与风险 -> `policy_skill`, `payment_skill`, `medical_advice_skill`, `faq_skill`
- 体检与特色项目 -> `treatment_skill`, `hospital_skill`, `pricing_skill`, `faq_skill`
- 转化与联系 -> `sales_skill`, `handoff_skill`, `service_scope_skill`, `faq_skill`

## Important Constraints

- Do not reintroduce regex medical/out-of-scope classifiers.
- Do not infer or rewrite language flow; user language is based on selected language.
- Do not let skills own journey stage progression.
- Do not make `core_interaction_contract` a supervisor target.
- Do not add a blocking LLM call for summary maintenance.
- Do not make `contact` a canonical target. Contact details are `USER_PROVIDED_INFORMATION target=handoff modifier=provide`.
- Do not make `consult` a canonical target. Normalize legacy consult by meaning:
  - scheduling/action -> `handoff`
  - process/timing -> `policy`
  - clinical review/preparation -> `treatment`
- Do not add `request_human` as a modifier. Human requests are `USER_REQUESTED_HUMAN target=handoff`.

## Useful Commands

Check current status:

```bash
cd /Users/haowang/Desktop/claws/medical-crm-v2
git status --short --branch
```

Run the implementation plan's focused application tests:

```bash
pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts src/services/__tests__/chatbot-v3/skill-loader.test.ts src/services/__tests__/chatbot-v3/read-planner.test.ts src/services/__tests__/chatbot-v3/skill-router.test.ts src/services/__tests__/chatbot-v3/task-builder.test.ts src/services/__tests__/chatbot-v3/journey-reducer.test.ts src/services/__tests__/chatbot-v3/journey-session.test.ts src/services/__tests__/chatbot-v3/supervisor.service.test.ts
```

Run the implementation plan's focused API tests:

```bash
pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/conversation-context.test.ts src/routes/chatbot-v3/supervisor-prompt.test.ts src/routes/chatbot-v3/supervisor-route-adapter.test.ts src/routes/chatbot-v3/faq-llm-adapter.test.ts src/routes/chatbot-v3/response-composer.test.ts src/__tests__/chatbot-v3.routes.test.ts
```

Search for forbidden runtime taxonomy remnants after implementation:

```bash
rg -n "USER_ASKED_MEDICAL_ADVICE|USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE|safety_scope_skill|records_skill|eligibility_intake_skill|followup_skill" packages/application/src apps/api/src packages/shared/validation/src
```

## Current Handoff State

Done:

- New taxonomy spec written.
- New implementation plan written.
- Both reviewed until clean.
- Handoff document written.

Not done yet:

- New taxonomy implementation in code.
- New conversation-context helper.
- New event/target/modifier migration.
- New route/debug/dogfood updates for the final taxonomy.
- Commit for these docs.

