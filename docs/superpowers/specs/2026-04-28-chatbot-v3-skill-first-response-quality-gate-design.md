# Chatbot V3 Phase 1.2 Skill-First Response Quality Gate Design

Date: 2026-04-28

## Status

Reviewed and approved through the spec-review loop. Implementation plan drafted at:

- `docs/superpowers/plans/2026-04-28-chatbot-v3-skill-first-response-quality-gate-implementation.md`

## Context

Chatbot V3 Phase 1.1 moved the control plane from legacy semantic events and `nextAction` to:

```text
SupervisorEvent(eventType + target + modifier)
  -> JourneyReducer
  -> TurnPlan
  -> Authority
  -> AgentResolver
  -> SkillRouter / SkillLoader
  -> ReadPlanner
  -> TaskBuilder
  -> Physical agents
  -> Composer / persistence write-back
```

That refactor is deployed and dogfood-passing. This phase should not rewrite the supervisor, reducer, or authority layer. The next gap is response quality: physical agents now receive the new control-plane context, but the business strategy for how to answer, redirect, handle hesitation, recover from unclear input, or revisit recommendations is still too prompt-local and too fragmented.

The previous Phase 1.1 skill design used many small skill packs such as retrieval fragments, explanation fragments, and objection fragments. That made the router assemble a bag of small parts instead of selecting one coherent business capability. Phase 1.2 replaces that with larger target-domain skills that can be trimmed per turn.

## Goals

1. Keep `ResponseContract` as a minimal guardrail, not a business playbook.
2. Move response strategy into target-domain skill packs.
3. Replace fragmented skill routing with primary and auxiliary domain skill selection.
4. Trim loaded skills by turn-specific section hints so prompts stay small.
5. Make `ReadPlanner` derive reads from domain skills plus turn hints, not from tiny retrieval-skill ids.
6. Make all physical agents consume skill sections explicitly.
7. Add a quality gate that checks control-plane truth, minimal response guardrails, and selected skill behavior.
8. Extend real API dogfood with Phase 1.2 quality evidence while keeping degraded fault injection local-only.

## Non-Goals

- Do not build DB/CMS-backed skill editing in this phase.
- Do not expand `ResponseContract` into a full prompt or service playbook.
- Do not rewrite supervisor classification, JourneyReducer policy, or runtime authority.
- Do not create a new physical agent fleet.
- Do not let agents decide stage, writes, tools, or skill routing.
- Do not actively inject failures into production dependencies.

## Core Principle

```text
TurnPlan decides what the turn should do.
ResponseContract defines the smallest hard guardrails.
Domain skills define how to handle the business situation.
ReadPlanner decides what data must be read before the agent answers.
Agents write the response using the approved task inputs.
Dogfood verifies the contract, skill behavior, and real-session quality.
```

`ResponseContract` is the lane boundary. Skill packs are the driving strategy.

## Minimal ResponseContract

`ResponseContract` should remain small. It should cover only hard output constraints:

```ts
type MinimalResponseContract = {
  structure:
    | 'answer_then_advance'
    | 'acknowledge_then_advance'
    | 'redirect_then_advance'
    | 'clarify_only'
    | 'notice_only';
  constraints: {
    maxQuestions: 0 | 1 | 2;
    preservePrimaryStage: boolean;
    answerBeforeAsk: boolean;
    avoidMultipleCTAs: boolean;
    language: string;
  };
  forbiddenClaims: string[];
};
```

It must not specify detailed pricing talk tracks, records-objection handling, recommendation-comparison logic, handoff reassurance copy, or FAQ return strategy. Those belong to domain skills.

Tone and service style are also skill or agent-prompt concerns. `language` may remain in the contract because it is a runtime output requirement, but the contract must not encode domain strategy through tone labels such as safety, sales, or reassurance.

## Domain Skill Model

Phase 1.2 keeps skills code-defined but shapes them so they can later move to DB/CMS without changing agent task semantics.

Skill packs should be target-domain capabilities, not tiny retrieval or phrase fragments:

```ts
type DomainSkillId =
  | 'pricing_skill'
  | 'documents_skill'
  | 'process_skill'
  | 'hospital_recommendation_skill'
  | 'consult_skill'
  | 'human_handoff_skill'
  | 'safety_scope_skill'
  | 'clarification_recovery_skill';

type DomainSkillPack = {
  id: DomainSkillId;
  target:
    | 'pricing'
    | 'documents'
    | 'process'
    | 'hospital_recommendation'
    | 'consult'
    | 'human_handoff'
    | 'safety_scope'
    | 'clarification';
  description: string;
  policySections: Array<{
    id: string;
    appliesTo: SkillSectionApplicability;
    text: string;
  }>;
  retrieval: {
    sections: Array<{
      id: string;
      appliesTo: SkillSectionApplicability;
      readIntentTypes: ReadIntent['type'][];
      searchGuidance: string;
    }>;
  };
  handling: Partial<Record<
    SupervisorEventType,
    Partial<Record<SupervisorEventModifier, string>>
  >>;
  futureCms?: {
    editable: boolean;
    owner: 'clinical' | 'ops' | 'growth' | 'engineering';
  };
};

type SkillSectionApplicability = {
  eventTypes?: SupervisorEventType[];
  targets?: SupervisorEventTarget[];
  modifiers?: SupervisorEventModifier[];
  primaryActionTypes?: PrimaryAction['type'][];
  followUpActionTypes?: FollowUpAction['type'][];
};
```

Do not add heavy fields such as `examples`, `requiredBehaviors`, or `forbiddenBehaviors` in this phase. They make each skill too much like a mini prompt spec and duplicate the contract and agent prompt.

The skill shape is still intentionally small, but it must be sectionable. `policySections` and `retrieval.sections` give `SkillLoader` deterministic material to trim. A single monolithic `policy` string is not acceptable because it would force either whole-skill prompt loading or heuristic trimming.

### Skill Size Budget

Domain skills can be larger than the previous fragments, but runtime must not send an entire large skill every turn.

- Registry granularity: one target-domain skill per business domain.
- Runtime budget: at most one primary skill and one auxiliary skill.
- Loader budget: trim each skill to the policy and handling sections relevant to this turn.
- Prompt budget: the loaded skill sections should usually add roughly 600 to 1,200 tokens total.

If a domain skill grows too large, split it internally into sections first. Only split it into multiple skill packs when independent domains or ownership boundaries appear.

## Domain Skills

### `pricing_skill`

Covers pricing questions, uncertainty, and price hesitation.

- Targets: `pricing`
- Typical events: `USER_ASKED_QUESTION`, `USER_RESPONDED_TO_REQUEST`
- Typical modifiers: `ask`, `hesitate`, `reject`
- Reads: `PRICING_FACTORS`, optional `GENERAL_FAQ(pricing)`, and records requirements when the follow-up invites documents.
- Strategy: explain that pricing depends on records, hospital, and treatment plan; avoid fixed prices unless grounded by retrieved policy; offer a low-friction next step such as uploading records, sharing diagnosis details, or asking a coordinator.

### `documents_skill`

Covers medical facts, records, document upload, document questions, rejection, and hesitation.

- Targets: `documents`, `medical_facts`
- Typical events: `DOCUMENTS_UPLOADED`, `USER_PROVIDED_INFORMATION`, `USER_RESPONDED_TO_REQUEST`, `USER_ASKED_QUESTION`
- Reads: `RECORD_REQUIREMENTS`
- Strategy: ask only for useful records at the current stage; when the user hesitates or refuses, do not pressure them; offer lower-friction alternatives such as describing the diagnosis, uploading one key report, or asking a human coordinator to explain.

### `process_skill`

Covers process questions, current-case next-step questions, and Phase 1.2 travel or payment support questions.

- Targets: `process`, `next_step`, `travel`, `payment`
- Typical events: `USER_ASKED_QUESTION`
- Reads: `PROCESS_POLICY`, optional `GENERAL_FAQ(process)`, `TRAVEL_SUPPORT_SCOPE` for travel questions, and `PAYMENT_POLICY` for payment questions.
- Strategy: answer the process, next-step, travel, or payment question, then return to the current workflow when appropriate. A normal process FAQ must not write or imply `process.explained=true`; only the reducer-owned formal overview action can do that. Travel and payment remain under `process_skill` for Phase 1.2 so the router has deterministic ownership; a separate `logistics_skill` is deferred until travel/payment content becomes large enough to need its own domain.

### `hospital_recommendation_skill`

Covers recommendations, hospital selection, hospital questions, revisit, compare, and preference changes.

- Targets: `recommendation`, `hospital`, `hospital_selection`
- Typical events: `USER_EXPRESSED_NEED`, `USER_ASKED_QUESTION`, `USER_RESPONDED_TO_REQUEST`
- Typical modifiers: `ask`, `revisit`, `provide`
- Reads: `HOSPITAL_CANDIDATES`, `HOSPITAL_FAQ`, `DOCTOR_MATCHING_CONTEXT` as approved by the read planner.
- Strategy: use candidate recommendations, retrieved hospital context, known facts, and user preferences. Do not invent hospitals, scores, rankings, medical facts, or outcome guarantees.

### `consult_skill`

Covers online consult questions and consult readiness.

- Targets: `consult`
- Typical events: `USER_EXPRESSED_NEED`, `USER_ASKED_QUESTION`
- Reads: `CONSULT_READINESS`, optional `GENERAL_FAQ(consult)`
- Strategy: explain what is needed before a doctor review can be arranged, what the next consult step is, and what records help. Do not imply an appointment is confirmed unless a tool result confirms it.

### `human_handoff_skill`

Covers human requests and contact information.

- Targets: `human`, `contact`
- Typical events: `USER_REQUESTED_HUMAN`, `USER_PROVIDED_INFORMATION`, `USER_RESPONDED_TO_REQUEST`
- Reads: no external FAQ by default; may use runtime-built handoff payload context.
- Strategy: confirm human handoff, summarize what will be passed to the coordinator, avoid repeated information requests, and do not promise clinical outcomes or exact response times unless policy supports it.

### `safety_scope_skill`

Covers risky medical advice and out-of-scope or restricted-service requests.

- Trigger: `USER_ASKED_RISKY_MEDICAL_ADVICE`, `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE`, or a `REDIRECT` primary action.
- Reads: `SERVICE_SCOPE`; no medical diagnosis lookup.
- Strategy: avoid diagnosis, medication advice, treatment decisions, and outcome guarantees. For urgent symptoms, advise local emergency care. Redirect to Medora-supported workflows such as records-based review, doctor matching, online consult, or treatment-related travel support.

### `clarification_recovery_skill`

Covers unclear messages and unknown targets.

- Targets: `unknown`
- Trigger: `USER_MESSAGE_UNCLEAR`, low-confidence fallback, or ambiguous last replies.
- Reads: none by default.
- Strategy: ask one low-burden clarification question, preserve the current primary stage, and make recovery to the main workflow easy on the next turn.

## SkillRouter

`SkillRouter` decides which domain skills the turn needs. It does not read data, write responses, or choose tools.

Input:

```ts
type BuildSkillPolicyInput = {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  agentRole: AgentRole;
  facts: DomainFacts;
};
```

Output:

```ts
type DomainSkillRequest = {
  skillId: DomainSkillId;
  role: 'primary' | 'auxiliary';
  reasonCode: string;
  sectionHints: {
    eventType: SupervisorEventType;
    target: SupervisorEventTarget;
    modifier: SupervisorEventModifier;
    primaryActionType: PrimaryAction['type'];
    followUpActionType?: FollowUpAction['type'];
  };
};
```

Primary skill selection:

1. Safety or out-of-scope events always select `safety_scope_skill`.
2. Otherwise use `event.target` when it is known.
3. If the event target is unknown, use `turnPlan.primaryAction.target` when available.
4. If neither is useful, select `clarification_recovery_skill`.

Target mapping:

```text
pricing -> pricing_skill
documents, medical_facts -> documents_skill
process, next_step -> process_skill
travel, payment -> process_skill
recommendation, hospital, hospital_selection -> hospital_recommendation_skill
consult -> consult_skill
human, contact -> human_handoff_skill
unknown -> clarification_recovery_skill
```

Auxiliary skill selection:

- `followUpAction=INVITE_NEXT_STEP(documents)` -> `documents_skill`
- `followUpAction=INVITE_NEXT_STEP(consult)` -> `consult_skill`
- `followUpAction=INVITE_NEXT_STEP(human)` -> `human_handoff_skill`
- `followUpAction=INVITE_NEXT_STEP(recommendation)` -> `hospital_recommendation_skill`
- `followUpAction=INVITE_NEXT_STEP(process)` -> `process_skill`
- `followUpAction=NONE` -> no auxiliary skill

The router should dedupe primary and auxiliary requests and cap output to two domain skill requests.

## SkillLoader

`SkillLoader` loads requested domain skills and trims them by `sectionHints`.

Output:

```ts
type LoadedSkillSection = {
  skillId: DomainSkillId;
  role: 'primary' | 'auxiliary';
  reasonCode: string;
  sectionIds: string[];
  policyText: string[];
  retrievalGuidance: string[];
  handlingGuidance: string[];
};
```

The loader should not pass the full domain skill to the agent unless every section is relevant. For example:

```text
documents_skill + modifier=reject
  -> policy summary
  -> reject/hesitate handling
  -> lower-friction document alternatives
  -> records requirement retrieval guidance
```

Unknown or malformed skill ids should fall back to `clarification_recovery_skill` or `safety_scope_skill` depending on the primary action and event. The fallback should be observable in debug output.

## ReadPlanner

`ReadPlanner` decides what data to read before agent execution.

In Phase 1.1 it inferred reads from tiny skill ids such as `load_pricing_factors` or `search_general_faq_by_category`. In Phase 1.2 it should infer reads from:

```text
domain skill + section hints + turn plan
```

Examples:

```text
USER_ASKED_QUESTION target=pricing
primaryAction=ANSWER(pricing)
followUpAction=INVITE_NEXT_STEP(documents)

SkillRouter:
  primary pricing_skill
  auxiliary documents_skill

ReadPlanner:
  PRICING_FACTORS
  GENERAL_FAQ(category=pricing)
  RECORD_REQUIREMENTS
```

```text
USER_RESPONDED_TO_REQUEST target=documents modifier=reject
primaryAction=HANDLE_RESPONSE(documents)

SkillRouter:
  primary documents_skill

ReadPlanner:
  RECORD_REQUIREMENTS
```

```text
USER_ASKED_QUESTION target=next_step
currentStage=COLLECT_MEDICAL_INPUTS
followUpAction=INVITE_NEXT_STEP(documents)

SkillRouter:
  primary process_skill
  auxiliary documents_skill

ReadPlanner:
  PROCESS_POLICY
  RECORD_REQUIREMENTS
```

`ReadPlanner` remains deterministic. Agents cannot add reads.

## AgentTask Shape

Worker tasks should stop using `fromStage` and `toStage`. Those names imply stage transition authority that agents do not have.

Use:

```ts
type RetrievedContextEntry = {
  readIntentId: string;
  readIntent: ReadIntent;
  snippets: Array<{
    text: string;
    source?: string;
    score?: number;
  }>;
};

type WorkerTaskBase = {
  agent: PhysicalAgent;

  currentStage: ChatJourneyStage;
  primaryStage: ChatJourneyStage;

  latestUserMessage: string;
  primaryAction: PrimaryAction;
  followUpAction?: FollowUpAction;

  responseContract: MinimalResponseContract;
  loadedSkillSections: LoadedSkillSection[];
  readIntents: ReadIntent[];
  retrievedContext: RetrievedContextEntry[];
};
```

Semantics:

- `currentStage` is where the turn started.
- `primaryStage` is the authority-approved stage after the reducer.
- Agents may use both fields for wording only.
- Agents must not decide or imply a different stage.
- `retrievedContext` must embed the original `ReadIntent`, not only the read intent type. This preserves parameters such as FAQ category, reason code, hospital id, query, or locale when those exist.
- `readIntentId` must be stable within the turn so tests and dogfood can prove that `GENERAL_FAQ(category=pricing)` produced the matching snippets.
- Do not invent separate snippet categories such as `knowledgeSnippets`, `policySnippets`, or `recordsRequirementSnippets`.

## Physical Agent Integration

All current physical agents stay in place. Their prompts and adapters should consume `loadedSkillSections` explicitly.

### FaqAgent

Handles FAQ detours, pricing/process/travel/payment, safety redirects, and out-of-scope redirects. It should answer using the primary skill, then use the auxiliary skill for the next step when present. Policy-grounded fallback should be generated from the loaded skill section instead of hardcoded prompt-local copy.

### RecordsAgent

Handles minimal triage, documents, medical facts, document upload, and document rejection or hesitation. It should use `documents_skill` for what to ask and how to lower friction. Structured JSON output remains required for records status paths.

### RecommendationAgent

Handles recommendation generation, revisit, compare, and hospital-selection questions. It should use `hospital_recommendation_skill` and only reference candidate recommendations, retrieved context, and known facts.

### ConsultAgent

Handles consult readiness and consult next-step language. It should use `consult_skill` to avoid saying an appointment is confirmed unless a tool result confirms it.

### HandoffAgent

Handles human requests and contact-info handoff. It should use `human_handoff_skill` to confirm handoff, summarize known context, avoid repeated information requests, and avoid unsupported promises.

## Composer And Debug Projection

Composer must not change skill decisions, read decisions, stage, or facts. It should surface debug evidence:

```text
selectedDomainSkills
loadedSkillSections
readIntents
retrievedContext counts
responseContract
qualityChecks
llmJudgeSummary when enabled
```

This evidence is needed to distinguish skill routing failures, read planning failures, agent failures, and composer failures.

## Quality Gate

The Phase 1.2 quality gate has three layers.

### 1. Control-Plane Checks

Verify that Phase 1.1 truth remains intact:

- HTTP response is successful.
- Journey stage matches scenario expectations.
- Side paths do not silently advance the primary stage.
- Facts and write side effects match authority decisions.
- Cards and render paths do not conflict with `TurnPlan`.

### 2. Minimal ResponseContract Checks

Check only the minimal guardrails:

- `maxQuestions`
- `avoidMultipleCTAs`
- `forbiddenClaims`
- `preservePrimaryStage` language
- `answerBeforeAsk` only when the contract explicitly requires it

Do not check business talk tracks here.

### 3. Domain Skill Behavior Checks

Use `selectedDomainSkills` and `sectionHints` to evaluate whether the selected skill behavior appeared in the response.

Each check should be explicit:

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

Severity semantics:

- `hard`: fails the required quality gate. Use only for behavior that protects safety, scope, stage integrity, or materially prevents misleading output.
- `soft`: produces a response-quality soft failure. Use for missing helpfulness or weak business handling that does not break safety or control-plane truth.
- `observed`: records evidence without failing the gate. Use for new or unstable checks while the scenario is being calibrated.

Examples:

- `pricing_skill`: unsupported fixed prices are `hard`; missing a low-burden next step is `soft`.
- `documents_skill + reject/hesitate`: pressuring the user after rejection is `hard`; failing to offer an alternative is `soft`.
- `safety_scope_skill`: diagnosis, medication advice, treatment decisions, or guarantees are `hard`; missing a supported next-step redirect is `soft`.
- `hospital_recommendation_skill`: inventing hospitals or guarantees is `hard`; weak comparison detail is `soft`.
- `human_handoff_skill`: unsupported clinical promises are `hard`; repetitive information requests are `soft`.

Skill behavior checks can be deterministic where possible, but should remain tied to the selected skill rather than becoming a new global response contract.

## Lightweight LLM Judge

The optional LLM judge checks response quality, not control-plane truth.

It evaluates:

- Did the answer address the user’s current question?
- Is the next step clear and low-burden?
- Is the tone warm and professional?
- Is the reply obviously mechanical, repetitive, or evasive?

Output:

```ts
type LlmJudgeResult = {
  verdict: 'pass' | 'warn' | 'fail';
  reasons: string[];
};
```

LLM judge failure should be a response-quality `SOFT_FAIL`, not a control-plane failure.

## Dogfood Scenario Strategy

Do not blindly convert every existing deferred scenario to the old required gate. Add Phase 1.2 quality metadata:

```ts
type QualityGateStatus = 'required' | 'observed' | 'local_only';
```

Recommended statuses:

Required:

- `faq_detour_no_progression`
- `direct_human_request_to_handoff`
- `recommendation_revisit_compare`
- `repeat_explain`
- `docs_upload_two_turn`
- `human_request`
- `safety_out_of_scope_redirect`
- `unclear_fallback_recovery`
- `contact_info_to_handoff`
- `pricing_answer_then_documents`
- `documents_rejection_recovery`

Observed:

- `recommendation_to_explain`, if recommendation data stability is not yet strong enough for a hard gate.

Local only:

- `degraded_then_retry`, using mock LLM/tool timeout and schema-failure injection.

Production dogfood may use safe transport retry, but must not deliberately break live dependencies.

## Dogfood Report Additions

Reports should include:

```text
selectedDomainSkills
loadedSkillSections
readIntents
retrievedContext counts
minimalContractChecks
skillBehaviorChecks
llmJudgeSummary
failureCategory:
  control_plane
  skill_routing
  read_planning
  agent_contract
  skill_behavior
  response_quality
  transport
  bootstrap
```

## Testing Strategy

### Layer 1: Application Unit Tests

Cover:

- Domain skill registry contains only target-domain skills.
- Skill pack shape stays minimal.
- SkillRouter selects primary and auxiliary skills correctly.
- SkillLoader trims relevant sections and enforces budget.
- ReadPlanner derives read intents from domain skill plus section hints.
- Retrieved context shape aligns with read intents.

Key cases:

- Pricing question plus documents follow-up.
- Documents rejection.
- Next-step question during records collection.
- Safety and out-of-scope redirect.
- Contact information.
- Recommendation revisit.
- Unclear message recovery.

### Layer 2: API Agent And Prompt Tests

Cover:

- FaqAgent receives pricing/process/safety skill sections and uses them in prompts.
- RecordsAgent uses documents skill sections for upload, reject, and hesitate paths.
- RecommendationAgent uses hospital recommendation skill sections without inventing options.
- ConsultAgent uses consult readiness skill sections and avoids unsupported appointment claims.
- HandoffAgent uses human handoff skill sections and payload context.

### Layer 3: Local Route And Session Tests

Cover:

- Selected domain skills are exposed in debug.
- Loaded skill sections stay within budget.
- Read intents match domain skills and hints.
- Retrieved context aligns with read intents.
- Minimal contract checks pass.
- Skill behavior checks pass.
- Side paths preserve stage and write authority.

### Layer 4: Real API Dogfood

Extend `scripts/chatbot-v3-real-api-dogfood` to:

- Support `qualityGate`.
- Automate manual smoke scenarios.
- Add deterministic response quality evaluator.
- Add optional lightweight LLM judge.
- Include skill, read, contract, and judge evidence in artifacts.

## Migration Steps

1. Refactor `skill-packs.ts` from fragmented skills to domain skill registry.
2. Rewrite `skill-router.ts` to output primary and auxiliary domain skill requests.
3. Update `skill-loader.ts` to trim skill sections by hints and enforce budget.
4. Update `read-planner.ts` to derive reads from domain skill plus section hints.
5. Update `task-builder.ts` and `worker-task.ts` to remove `fromStage` and `toStage`, add `currentStage`, `primaryStage`, `loadedSkillSections`, `ReadIntent[]`, and ReadIntent-aligned `retrievedContext`.
6. Update Faq, Records, Recommendation, Consult, and Handoff prompts/adapters to consume loaded skill sections.
7. Add deterministic minimal-contract and skill-behavior quality checks.
8. Extend real API dogfood scenarios, evaluator, and reports.
9. Run application tests, API tests, route/session tests, and real API dogfood.
10. Treat production control-plane failures as blockers; treat response-quality soft failures as skill/prompt fixes followed by rerun.

## Open Questions

1. Should `travel` and `payment` become a separate `logistics_skill` later if their content grows beyond process ownership?
2. Should `recommendation_to_explain` be `required` immediately, or remain `observed` until candidate recommendation data is stable enough?
3. Should the lightweight LLM judge run in CI, only in manual dogfood, or only when an API key is explicitly configured?
