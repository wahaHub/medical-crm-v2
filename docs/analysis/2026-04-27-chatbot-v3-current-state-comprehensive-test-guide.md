# Chatbot V3 Current State Comprehensive Test Guide

Date: 2026-04-27
Bundle under review: `/Users/haowang/Desktop/claws/chatbot-v3-current-state-bundle-2026-04-27`
Branch under review: `phase1-event-reducer`
Current local head in bundle: `36afd81 docs(chatbot-v3): align phase 1 spec with implementation`
Latest code commit: `40527e6 fix(chatbot-v3): harden reducer observability and supervisor event validation`
Production API: `https://crmapi.medicaltourismchina.health`

## Goal

Validate the current complete shape of `chatbot-v3`, not only the prior Phase 1 handoff summary.

The core control-plane chain under test is:

`Supervisor -> SupervisorEvent -> JourneyReducer -> NextActionResolver -> projection/runtime`

The test pass must answer five questions:

1. Is the new event-driven control plane coherent end to end?
2. Do any legacy v2/v3 paths still act as a hidden second source of truth?
3. Do spec and implementation agree on the current Phase 1 boundaries?
4. Which failures are control-plane blockers versus worker-agent or frontend follow-ups?
5. Which tests are missing before a stronger production rollout claim?

## Current-State Rules To Preserve

These rules come from the current-state bundle and the doc-alignment commit. Treat regressions against them as blockers unless a later task deliberately changes the contract.

- `DOCUMENTS_UPLOADED` is side-effect-first. Upload turns must prioritize `RecordsAgent` / record persistence side effects before later consult progression.
- Phase 1 semantic OpenAI extraction is event-only. The route strict schema accepts `eventType` and `confidence`; the adapter assigns `source=llm`; it does not accept semantic metadata yet.
- Semantic LLM output must not write FAQ topics, extracted medical facts, risk types, or redirect targets into reducer facts in Phase 1.
- Deterministic/runtime-normalized paths may still provide metadata, such as uploaded document count or selected recommendation IDs.
- `ReadPlan` is observability/planning only. It is not yet an executed domain-read pipeline.
- Worker-agent fallback is separate from Supervisor/Journey validation.
- Baseline observability nodes are `Supervisor`, `EventExtractionSummary`, `JourneyReducer`, `NextActionResolver`, and `Invariant`.
- Separate deterministic/semantic extractor node names are follow-up observability improvements, not Phase 1 acceptance blockers.

## What Is In Scope

- Supervisor emits a valid `SupervisorEvent`, not old proposal fields like `suggestedStage`, `dispatchAgent`, or task payloads.
- Deterministic extraction wins for buttons, structured actions, uploads, and obvious text actions.
- Semantic extraction is constrained by per-turn/stage allowed events.
- Route adapter and application service both reject globally valid but per-turn disallowed events.
- Reducer owns `nextAction`, `nextStage`, `factsPatch`, side-path metadata, and replay lineage.
- Resolver maps `nextAction` to rendering/agent intent and `ReadPlan`.
- Projection/runtime surfaces remain projections and do not re-decide journey state.
- Production logs prove event extraction, reducer decision, resolver decision, read plan, and projection invariant.

## What Is Out Of Scope For Blocking This Phase

- `FaqAgent fallbackUsed:true` or `FaqAgent schemaValidationFailed:true` after the reducer has selected `ANSWER_FAQ`.
- Recommendation, consultation, or other worker-agent prompt/schema quality after correct reducer selection.
- Full dogfood harness 15s request timeouts when manual 60s smoke still collects reducer evidence.
- Frontend copy polish and richer UX.
- Full `apps/api` typecheck/lint failures already known to be unrelated.
- Making `ReadPlan` execute real reads.
- Adding semantic metadata support before the strict schema and sanitizer tests are expanded.

## Bundle Review Map

Use these paths in the current-state bundle when reviewing behavior against code:

| Area | Bundle path |
|---|---|
| Current API runtime/routes | `current-v3-code/apps-api-routes/apps/api/src/routes/chatbot-v3/` |
| Current application control plane | `current-v3-code/application-services/packages/application/src/services/chatbot-v3/` |
| Reused legacy v2 context | `current-v3-code/application-services/reused-v2/packages/application/src/services/chatbot-v2/` |
| Shared v3 schema/UI | `current-v3-code/shared/packages/shared/` |
| Patient onboarding/session routes | `current-v3-code/patient-routes/apps/api/src/routes/` |
| Focused tests | `tests-and-dogfood/` |
| Phase 1 diff and commits | `phase1-review/` |
| Production evidence | `artifacts/production-phase1-reducer-evidence-2026-04-27.txt` |

## Local Verification Gate

Run these from a worktree based on local `phase1-event-reducer` after the doc-alignment commit:

```bash
cd /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer
```

| Gate | Command | Expected |
|---|---|---|
| Application Phase 1 unit tests | `pnpm --dir packages/application test src/services/__tests__/chatbot-v3/journey-reducer.test.ts src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts src/services/__tests__/chatbot-v3/legacy-compatibility-view.test.ts src/services/__tests__/chatbot-v3/next-action-resolver.test.ts src/services/__tests__/chatbot-v3/read-planner.test.ts src/services/__tests__/chatbot-v3/domain-facts-normalizer.test.ts src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts src/services/__tests__/chatbot-v3/supervisor.service.test.ts` | 8 files, 100 tests pass |
| API Phase 1 focused tests | `pnpm --dir apps/api test src/routes/chatbot-v3/supervisor-route-adapter.test.ts src/routes/chatbot-v3/supervisor-prompt.test.ts src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.observability.test.ts` | Focused chatbot-v3 tests pass |
| Application typecheck | `pnpm --dir packages/application typecheck` | Pass |
| Dogfood harness tests | `pnpm test:chatbot-v3:real-api-dogfood` | Pass |
| Diff whitespace | `git diff --check` | Pass |

Known caveat: full `apps/api` typecheck may still fail on unrelated pre-existing `composition-root.ts`, `chatbot.routes.ts`, and `patient-widget-starter.ts` issues. Record full-suite failures, but do not call them Phase 1 blockers unless they touch this control-plane surface.

## Static Review Checklist

Review code and tests for these hidden-source-of-truth risks.

| Check | Expected |
|---|---|
| Supervisor output | No active runtime path consumes legacy proposal fields as authority. |
| Runtime state update | `JourneyRuntimeAuthority` / reducer output drives stage/action/facts patch. |
| Response composer | Composer renders from projection and does not invent a different `nextAction`. |
| Legacy compatibility view | Projection only; no independent stage progression logic. |
| Reused v2 services | May provide context/compatibility, but do not override reducer decision. |
| `ReadPlan` | Logged and passed as planning data; not mistaken for completed domain reads. |
| Semantic metadata | LLM route schema/sanitizers reject or ignore metadata in Phase 1. |
| Allowed events | API route adapter and application service both enforce per-stage allowed events. |
| `DOCUMENTS_UPLOADED` | Upload turn executes record side effects first; no same-turn consult jump. |

## P0 Test Priorities

Start with these five because they protect the Phase 1 control plane from the highest-risk regressions:

1. Semantic LLM cannot return deterministic-only events.
2. `DOCUMENTS_UPLOADED` two-turn behavior.
3. FAQ, safety, and out-of-scope detours preserve the primary stage.
4. `SHOW_PROCESS_OVERVIEW` writes `process.explained=true`.
5. Projection invariant proves no second source of truth.

## Layered Test Plan

Use four layers. Do not jump straight to production smoke; that makes failures too vague.

### Layer 1: SupervisorEventExtractor

Goal: prove event extraction is stable and the LLM cannot exceed its authority.

#### Deterministic Extractor

Required deterministic event coverage:

| Event | Required coverage |
|---|---|
| `TRIAGE_SUBMITTED` | Structured/user action maps without calling LLM. |
| `TRIAGE_SKIPPED` | Structured/user action maps without calling LLM. |
| `RECOMMENDATION_SELECTED` | Selected recommendation metadata is preserved. |
| `RECOMMENDATION_SKIPPED` | Skip action maps without calling LLM. |
| `DOCUMENTS_UPLOADED` | Any attachment-bearing request maps to upload event with document count metadata. |
| `USER_REQUESTED_HUMAN` | Hard and soft handoff phrases map deterministically. |
| `USER_ASKED_NEXT_STEP` | Obvious next-step wording maps deterministically. |

Specific deterministic assertions:

- Attachment present -> `DOCUMENTS_UPLOADED`.
- Human-support wording -> `USER_REQUESTED_HUMAN`.
- Obvious next-step wording -> `USER_ASKED_NEXT_STEP`.
- Pricing/process FAQ should not be claimed by deterministic extraction.
- Deterministic hits must not call the semantic LLM route.

Chinese soft-handoff phrases that must stably hit `USER_REQUESTED_HUMAN`:

- `有人能联系我吗`
- `可以加我微信吗`
- `能不能让顾问联系我`
- `我想跟你们工作人员聊一下`

#### Semantic Extractor / Route Adapter

These tests are about trust boundaries, not business correctness.

| Case | Expected |
|---|---|
| Valid allowed event | Pass. |
| Old proposal shape | Reject and fall back to `UNKNOWN_MESSAGE` / `fallback_unknown`. |
| `eventType` not in `allowedEvents` | Retry once; if still invalid, fall back. |
| LLM returns `TRIAGE_SUBMITTED` | Reject because it is deterministic-only. |
| LLM returns `RECOMMENDATION_SELECTED` | Reject because it is deterministic-only. |
| `confidence < 0` or `confidence > 1` | Reject. |
| Semantic metadata present | Reject or ignore; current Phase 1 expectation is reject/fallback. |
| Network failure on first attempt | Retry once. |
| Two failures | Fall back to `UNKNOWN_MESSAGE` / `fallback_unknown`, no crash. |

Acceptance standard:

- LLM cannot output stage, agent, or task authority.
- LLM cannot forge deterministic-only events.
- Schema failure does not crash the turn.
- Deterministic events bypass semantic extraction.

### Layer 2: JourneyReducer

Goal: prove `event + facts -> nextAction + nextStage + factsPatch` is stable.

#### Happy Path

| Input | Expected |
|---|---|
| `TRIAGE_SUBMITTED` | `factsPatch.intake.minimalTriageStatus=submitted`, `nextAction=GENERATE_RECOMMENDATION`, `nextStage=RECOMMENDATION`. |
| `TRIAGE_SKIPPED` | `factsPatch.intake.minimalTriageStatus=skipped`, `nextAction=GENERATE_RECOMMENDATION`, `nextStage=RECOMMENDATION`. |
| `RECOMMENDATION_SELECTED` with `process.explained=false` | `factsPatch.recommendation.status=selected`, `nextAction=SHOW_PROCESS_OVERVIEW`, `nextStage=EXPLAIN_PROCESS`. |
| `RECOMMENDATION_SELECTED` with `process.explained=true` and `docs=0` | `nextAction=REQUEST_MEDICAL_DOCUMENTS`, `nextStage=COLLECT_MEDICAL_INPUTS`. |
| `RECOMMENDATION_SELECTED` with `process.explained=true` and `docs>0` | `nextAction=OFFER_ONLINE_CONSULT`, `nextStage=ONLINE_CONSULT`. |

#### Detour Path

| Input | Expected |
|---|---|
| `USER_ASKED_FAQ` while `currentStage=COLLECT_MEDICAL_INPUTS` | `nextAction=ANSWER_FAQ`, stage remains `COLLECT_MEDICAL_INPUTS`, `isSidePath=true`, `sidePathType=faq`, `primaryStagePreserved=true`. |
| `USER_REJECTED_OR_HESITATED` | Downgrade to `nextAction=ANSWER_FAQ`, stage stays current, no facts patch. |
| `USER_PROVIDED_CONTACT_INFO` | `nextAction=CREATE_HANDOFF`, `nextStage=HUMAN_HANDOFF`; do not mark `handoff.active=true` until runtime confirms handoff creation. |
| `USER_ASKED_MEDICAL_ADVICE` | `nextAction=SAFE_MEDICAL_REDIRECT`, stage stays current. |
| `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE` | `nextAction=OUT_OF_SCOPE_REDIRECT`, stage stays current. |
| `UNKNOWN_MESSAGE` | `nextAction=CLARIFY_INTENT`, stage stays current. |

#### Document Upload Two-Turn Path

Turn 1, upload documents:

```text
facts:
  minimalTriageStatus=submitted
  recommendation.status=selected
  process.explained=true
  records.supportingDocumentsCount=0

event:
  DOCUMENTS_UPLOADED(documentCount=1)

expect:
  factsPatch.records.supportingDocumentsCount=1
  nextAction=REQUEST_MEDICAL_DOCUMENTS
  nextStage=COLLECT_MEDICAL_INPUTS
```

Turn 2, user asks next step after snapshot persists docs:

```text
facts:
  minimalTriageStatus=submitted
  recommendation.status=selected
  process.explained=true
  records.supportingDocumentsCount=1

event:
  USER_ASKED_NEXT_STEP

expect:
  nextAction=OFFER_ONLINE_CONSULT
  nextStage=ONLINE_CONSULT
```

This proves the intended strategy: upload turn saves files first; the next turn can advance to consult from persisted facts.

### Layer 3: Reducer Pipeline Integration

Goal: test `input -> SupervisorEventExtractor -> reducer -> resolver -> projection` without real worker agents.

| Case | Expected |
|---|---|
| User says `我妻子得了脑瘤，想去中国找医生` | Semantic event; reducer outputs `COLLECT_MINIMAL_TRIAGE` or the current fact-driven next action. |
| `userAction=TRIAGE_SUBMITTED` | Deterministic event; `nextAction=GENERATE_RECOMMENDATION`; resolved agent is `RecommendationAgent`. |
| `userAction=RECOMMENDATION_SELECTED` | Deterministic event; `nextAction=SHOW_PROCESS_OVERVIEW`; `systemRendered=true`; projected `suggestedStage=EXPLAIN_PROCESS`. |
| `currentStage=COLLECT_MEDICAL_INPUTS`, user asks price | `USER_ASKED_FAQ`; `nextAction=ANSWER_FAQ`; resolved agent is `FaqAgent`; primary stage unchanged. |
| `attachments=[MRI.pdf]` | `DOCUMENTS_UPLOADED`; `nextAction=REQUEST_MEDICAL_DOCUMENTS`; resolved agent is `RecordsAgent`. |
| User says `能不能保证治好` | Risky/safety event; safe redirect or system render; primary stage unchanged. |

Projection assertions for every pipeline case:

- `projectedProposal.suggestedStage === reducer.nextStage`.
- `projectedDecision.toStage === reducer.nextStage`.
- `projectedDecision.nextAction === reducer.nextAction`.

### Layer 4: Runtime / Composer Integration With Mock Agents

Goal: run the complete runtime/composer path, but mock real LLM workers.

Required runtime scenarios:

| Case | Expected |
|---|---|
| Triage submit | `RecommendationAgent` called. |
| Recommendation select | Process overview is system-rendered. |
| Process overview success | Write intents include `process.explained=true`. |
| FAQ detour | `FaqAgent` called; `journeyCurrentStage` unchanged. |
| Docs upload | `RecordsAgent` called; supporting-documents write-back exists. |
| Docs already persisted + next step | `ConsultAgent` called. |
| Human request | `HandoffAgent` called. |
| Risky medical advice | Safe redirect; no subagent if system-rendered. |
| Semantic schema failure | Falls back to `UNKNOWN_MESSAGE`; `CLARIFY_INTENT`; no crash. |

## Multi-Turn Session Tests

Yes: event types must be tested inside continuous sessions too. Unit tests prove one reducer input is correct; session tests prove previous `stage`, `facts`, `lastQuestion`, write-back, and persisted snapshot do not pollute the next turn.

Do not build all event-type permutations. That would be noisy and mostly meaningless. Cover representative paths plus high-risk transition points:

- Mainline progression events.
- Side-path/detour events.
- Upload events.
- Fallback/ambiguous events.
- Human handoff and safety-priority events.
- Deterministic events overriding semantic interpretation.

For every turn in every session, assert internal control state, not just reply text:

- `eventType`
- `eventSource`
- `nextAction`
- `nextStage`
- resolved agent or `systemRendered`
- `factsPatch`
- persisted snapshot after the turn
- `sidePathType`
- `primaryStagePreserved`

Response text checks should be weak, such as containing `上传资料`, `在线咨询`, or `人工联系`; the important contract is `event -> reducer -> nextAction -> persisted state`.

### Session 1: Standard Happy Path

| Turn | Input | Expected |
|---|---|---|
| 1 | `我妻子得了脑瘤，想去中国找医生` | `USER_WANTS_TREATMENT_IN_CHINA`, `COLLECT_MINIMAL_TRIAGE`. |
| 2 | Submit triage | `TRIAGE_SUBMITTED`, `GENERATE_RECOMMENDATION`, `stage=RECOMMENDATION`. |
| 3 | Select hospital/recommendation | `RECOMMENDATION_SELECTED`, `SHOW_PROCESS_OVERVIEW`, `stage=EXPLAIN_PROCESS`, `process.explained=true`. |
| 4 | Upload MRI | `DOCUMENTS_UPLOADED`, `REQUEST_MEDICAL_DOCUMENTS`, documents count persisted. |
| 5 | `下一步呢？` | `USER_ASKED_NEXT_STEP`, `OFFER_ONLINE_CONSULT`, `stage=ONLINE_CONSULT`. |

### Session 2: FAQ Detour Does Not Pollute Mainline

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
recommendation.status=selected
process.explained=true
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `大概多少钱？` | `USER_ASKED_FAQ`, `ANSWER_FAQ`, stage remains `COLLECT_MEDICAL_INPUTS`. |
| 2 | `那下一步呢？` | `USER_ASKED_NEXT_STEP`, `REQUEST_MEDICAL_DOCUMENTS`, stage remains `COLLECT_MEDICAL_INPUTS`. |

### Session 3: Process FAQ Does Not Enter EXPLAIN_PROCESS

Initial state:

```text
stage=ONLINE_CONSULT
process.explained=true
records.supportingDocumentsCount=1
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `你们流程是怎样的？` | `USER_ASKED_FAQ`, `ANSWER_FAQ`, stage remains `ONLINE_CONSULT`, `nextStage != EXPLAIN_PROCESS`. |

Only `SHOW_PROCESS_OVERVIEW` should enter `EXPLAIN_PROCESS`.

### Session 4: Upload Documents Two-Turn Behavior

Initial state:

```text
stage=EXPLAIN_PROCESS
intake.minimalTriageStatus=submitted
recommendation.status=selected
process.explained=true
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | Upload MRI | `DOCUMENTS_UPLOADED`, `REQUEST_MEDICAL_DOCUMENTS`, `stage=COLLECT_MEDICAL_INPUTS`, `docs=1` persisted. |
| 2 | `下一步呢？` | `USER_ASKED_NEXT_STEP`, `OFFER_ONLINE_CONSULT`, `stage=ONLINE_CONSULT`. |

### Session 5: Documents Uploaded Before Recommendation

| Turn | Input | Expected |
|---|---|---|
| 1 | `我想去中国看病` | `USER_WANTS_TREATMENT_IN_CHINA`, `COLLECT_MINIMAL_TRIAGE`. |
| 2 | Upload MRI before triage/recommendation | `DOCUMENTS_UPLOADED`, documents persisted, next action remains fact-driven toward minimal triage. |
| 3 | Submit triage | `TRIAGE_SUBMITTED`, `GENERATE_RECOMMENDATION`. |
| 4 | Recommendation exists, user asks next step | Existing docs are respected; do not repeatedly request the same upload. |

### Session 6: Safety Detour Does Not Pollute Mainline

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `你能不能保证治好？` | `USER_ASKED_MEDICAL_ADVICE`, `SAFE_MEDICAL_REDIRECT`, stage remains `COLLECT_MEDICAL_INPUTS`. |
| 2 | `那我上传资料吧` | `DOCUMENTS_UPLOADED`, `REQUEST_MEDICAL_DOCUMENTS`. |

### Session 7: Human Request Is Strong State

Initial state:

```text
stage=RECOMMENDATION
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `我想让你们顾问联系我` | `USER_REQUESTED_HUMAN`, `CREATE_HANDOFF`, `stage=HUMAN_HANDOFF`, `handoff.active=true`. |
| 2 | `下一步呢？` | Continues handoff-related path; does not silently return to recommendation. |

### Session 8: LLM Fallback Does Not Poison Session

| Turn | Input | Expected |
|---|---|---|
| 1 | Force semantic LLM invalid schema | `fallback_unknown`, `UNKNOWN_MESSAGE`, `CLARIFY_INTENT`, stage preserved. |
| 2 | `我想找脑瘤医生` | `USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING`, normal journey resumes. |

### Session 9: Triage Skipped Still Reaches Recommendation

| Turn | Input | Expected |
|---|---|---|
| 1 | `我想先看看中国医生/医院推荐` | Treatment or matching intent; asks for minimal triage unless skipped by action. |
| 2 | User action `TRIAGE_SKIPPED` | `TRIAGE_SKIPPED`, `factsPatch.intake.minimalTriageStatus=skipped`, `GENERATE_RECOMMENDATION`, `stage=RECOMMENDATION`. |
| 3 | `下一步呢？` | Facts-driven response should stay on recommendation path, not re-ask minimal triage. |

This catches regressions where skipping triage is ignored and the session loops back to intake.

### Session 10: Recommendation Skipped Does Not Fake Selection

Initial state:

```text
stage=RECOMMENDATION
intake.minimalTriageStatus=submitted
recommendation.status=shown
process.explained=false
```

| Turn | Input | Expected |
|---|---|---|
| 1 | User action `RECOMMENDATION_SKIPPED` | `RECOMMENDATION_SKIPPED`; no `recommendation.status=selected`; next action follows the designed alternate path. |
| 2 | `下一步呢？` | Does not enter `SHOW_PROCESS_OVERVIEW` or `ONLINE_CONSULT` as if a recommendation had been selected. |

This protects against treating skip as select.

### Session 11: Consult Interest Before Documents

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
intake.minimalTriageStatus=submitted
recommendation.status=selected
process.explained=true
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `我想直接线上咨询医生` | `USER_INTERESTED_IN_CONSULT`, but `nextAction=REQUEST_MEDICAL_DOCUMENTS`, `stage=COLLECT_MEDICAL_INPUTS`. |
| 2 | Upload MRI | `DOCUMENTS_UPLOADED`, docs persisted first, still no same-turn consult jump. |
| 3 | `现在可以咨询了吗？` | `USER_INTERESTED_IN_CONSULT` or `USER_ASKED_NEXT_STEP`, `OFFER_ONLINE_CONSULT`, `stage=ONLINE_CONSULT`. |

This proves consult intent is facts-gated by document availability.

### Session 12: Consult Interest After Documents

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
intake.minimalTriageStatus=submitted
recommendation.status=selected
process.explained=true
records.supportingDocumentsCount=1
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `我想安排线上咨询` | `USER_INTERESTED_IN_CONSULT`, `OFFER_ONLINE_CONSULT`, `stage=ONLINE_CONSULT`. |
| 2 | `还需要我补什么吗？` | Stays in consult/post-document path; does not request the already persisted document again. |

This is the positive mirror of Session 11.

### Session 12A: User Hesitation Does Not Break The Mainline

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
intake.minimalTriageStatus=submitted
recommendation.status=selected
process.explained=true
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `太贵了，我先考虑一下` | `USER_REJECTED_OR_HESITATED`, downgraded to `ANSWER_FAQ`, stage stays `COLLECT_MEDICAL_INPUTS`, no facts patch. |
| 2 | `那下一步呢？` | `USER_ASKED_NEXT_STEP`, still requests medical documents from preserved facts. |

Also cover refusal variants: `我不想上传资料`, `我不想留电话`.

### Session 12B: Direct Contact Info Triggers Handoff

Initial state:

```text
stage=RECOMMENDATION
intake.minimalTriageStatus=submitted
recommendation.status=generated
handoff.active=false
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `我的微信是 medora-test-123` | `USER_PROVIDED_CONTACT_INFO`, `CREATE_HANDOFF`, `stage=HUMAN_HANDOFF`; handoff active only after runtime write-back succeeds. |
| 2 | `电话是 13800000000` | Stays in handoff flow and does not revert to recommendation. |

Also cover email and phone variants.

### Session 13: Medical Facts Before Triage Do Not Bypass Minimal Triage

| Turn | Input | Expected |
|---|---|---|
| 1 | `患者52岁，胶质瘤，刚做完MRI，想去中国治疗` | `USER_PROVIDED_MEDICAL_FACTS` or treatment intent; only approved normalized facts patch; `COLLECT_MINIMAL_TRIAGE` still happens if required facts are missing. |
| 2 | Submit minimal triage | `TRIAGE_SUBMITTED`, `GENERATE_RECOMMENDATION`. |

This protects the Phase 1 semantic metadata boundary: natural-language facts must not become arbitrary trusted facts unless normalized.

### Session 14: Medical Facts After Triage Update State Without Rewinding

Initial state:

```text
stage=RECOMMENDATION
intake.minimalTriageStatus=submitted
recommendation.status=shown
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `补充一下，病理是胶质母细胞瘤，已经放疗过` | `USER_PROVIDED_MEDICAL_FACTS`; approved facts patch only; stage remains recommendation or fact-driven next action. |
| 2 | Select recommendation | `RECOMMENDATION_SELECTED`, `SHOW_PROCESS_OVERVIEW`; supplemental facts are still present. |

This catches fact-update turns that accidentally reset the mainline.

### Session 15: Out-Of-Scope Detour Recovers To Mainline

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
recommendation.status=selected
process.explained=true
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `你们能帮我申请美国绿卡吗？` | `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE`, `OUT_OF_SCOPE_REDIRECT`, primary stage preserved. |
| 2 | `那我还是上传病历吧` | `DOCUMENTS_UPLOADED`, `REQUEST_MEDICAL_DOCUMENTS`, docs persisted. |

This confirms unrelated detours do not erase the medical journey.

### Session 16: Repeated Detours Preserve The Same Primary Stage

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
recommendation.status=selected
process.explained=true
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `大概多少钱？` | `USER_ASKED_FAQ`, `ANSWER_FAQ`, primary stage preserved. |
| 2 | `能保证治好吗？` | `USER_ASKED_MEDICAL_ADVICE`, `SAFE_MEDICAL_REDIRECT`, same primary stage preserved. |
| 3 | `下一步呢？` | `USER_ASKED_NEXT_STEP`, `REQUEST_MEDICAL_DOCUMENTS`, still based on original facts. |

This catches cumulative side-path drift.

### Session 17: Deterministic Upload Beats Semantic FAQ Text

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
recommendation.status=selected
process.explained=true
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | Message text says `这些资料够吗，流程怎么走？` and includes `MRI.pdf` | Deterministic attachment wins: `DOCUMENTS_UPLOADED`, not `USER_ASKED_FAQ`; `RecordsAgent` path. |
| 2 | `流程怎么走？` without attachment | `USER_ASKED_FAQ`, `ANSWER_FAQ`, primary stage preserved. |

This proves deterministic event precedence over semantic interpretation.

### Session 18: Change Recommendation Before Documents

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
intake.minimalTriageStatus=submitted
recommendation.status=selected
recommendation.selectedId=hospital_a
process.explained=true
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | User selects a different recommendation `hospital_b` | `RECOMMENDATION_SELECTED`, selected ID updates to `hospital_b`; next action remains document-gated. |
| 2 | `下一步呢？` | `REQUEST_MEDICAL_DOCUMENTS`, not consult, because docs are still missing. |

This catches stale selected recommendation state.

### Session 19: Handoff Request After Safety Detour

Initial state:

```text
stage=COLLECT_MEDICAL_INPUTS
records.supportingDocumentsCount=0
```

| Turn | Input | Expected |
|---|---|---|
| 1 | `你能保证治好我吗？` | `USER_ASKED_MEDICAL_ADVICE`, safe redirect, stage preserved. |
| 2 | `那让顾问联系我吧` | `USER_REQUESTED_HUMAN`, `CREATE_HANDOFF`, `stage=HUMAN_HANDOFF`. |
| 3 | `下一步呢？` | Continues handoff path, not document collection. |

This tests handoff priority after a previous detour.

### Session 20: Unknown Message Then Deterministic Action

Initial state:

```text
stage=COLLECT_MINIMAL_MEDICAL_FACTS
```

| Turn | Input | Expected |
|---|---|---|
| 1 | Force or send unclassifiable input | `UNKNOWN_MESSAGE`, `CLARIFY_INTENT`, stage preserved. |
| 2 | User action `TRIAGE_SUBMITTED` | Deterministic action succeeds; `GENERATE_RECOMMENDATION`, `stage=RECOMMENDATION`. |

This proves fallback does not block later deterministic actions.

### Short Session Add-Ons

Add focused short sessions for events not naturally covered above:

| Event | Session coverage |
|---|---|
| `USER_AMBIGUOUS_REPLY` | `lastQuestion` / expected-answer-type session. |
| Duplicate document upload | Upload same file twice; document count/write-back should not double count if dedupe exists, or should explicitly document no dedupe. |
| Language switch | Chinese mainline then English FAQ; event extraction should remain language-agnostic. |
| Back-to-back next-step asks | Repeated `下一步呢？` should be idempotent from unchanged facts. |
| Human request soft phrases | Run soft handoff phrase variants inside a session, not only extractor unit tests. |

### Event Coverage Map

| Event | Coverage |
|---|---|
| `TRIAGE_SUBMITTED` | Session 1, Session 5, Session 13, Session 20. |
| `TRIAGE_SKIPPED` | Session 9. |
| `RECOMMENDATION_SELECTED` | Session 1. |
| `RECOMMENDATION_SKIPPED` | Session 10. |
| `DOCUMENTS_UPLOADED` | Session 1, Session 4, Session 5, Session 6, Session 11, Session 15, Session 17. |
| `USER_REQUESTED_HUMAN` | Session 7, Session 19. |
| `USER_ASKED_NEXT_STEP` | Session 1, Session 2, Session 4, Session 9, Session 10, Session 11, Session 12, Session 16, Session 18, Session 19. |
| `USER_ASKED_FAQ` | Session 2, Session 3, Session 16, Session 17. |
| `USER_WANTS_TREATMENT_IN_CHINA` | Session 1, Session 5, Session 13. |
| `USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING` | Session 8 turn 2. |
| `USER_PROVIDED_MEDICAL_FACTS` | Session 13, Session 14. |
| `USER_INTERESTED_IN_CONSULT` | Session 11, Session 12. |
| `USER_REJECTED_OR_HESITATED` | Session 12A. |
| `USER_PROVIDED_CONTACT_INFO` | Session 12B. |
| `USER_ASKED_MEDICAL_ADVICE` | Session 6, Session 16, Session 19. |
| `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE` | Session 15. |
| `USER_AMBIGUOUS_REPLY` | Session 8 and `lastQuestion` short add-on. |
| `UNKNOWN_MESSAGE` | Session 8, Session 20. |

### Ambiguous Reply And Last Question

At minimum, test this current Phase 1 behavior:

```text
assistant last question:
  你方便上传 MRI/CT 和病理报告吗？
lastQuestion.expectedAnswerType=document_availability

user:
  是的

expect:
  USER_AMBIGUOUS_REPLY
  CLARIFY_INTENT
  stage preserved
```

If Phase 2 expands semantic metadata, add a stronger case:

```text
user:
  现在只有片子，没有病理

expect:
  USER_PROVIDED_MEDICAL_FACTS or approved semantic interpretation
  no generic stage reset
```

## Parallel Test Ownership

The work can be split, but keep write scopes separate.

### Agent A: Supervisor Specialty

Scope:

- Deterministic extractor.
- Route adapter strict schema.
- `allowedEvents` enforcement.
- Retry/fallback behavior.
- Handoff phrase coverage.
- No old proposal keys.

Acceptance:

- LLM cannot output stage, agent, or task authority.
- LLM cannot forge deterministic-only events.
- Schema failure does not crash.
- Deterministic events do not call LLM.

### Agent B: Reducer / Authority Specialty

Scope:

- `factsPatch`.
- `nextAction`.
- `nextStage`.
- Side-path metadata.
- Document upload two-turn behavior.
- `EXPLAIN_PROCESS` invariant.
- Projection consistency.

Acceptance:

- FAQ does not pollute stage.
- `DOCUMENTS_UPLOADED` does not directly jump to consult.
- `USER_ASKED_NEXT_STEP` is fully facts-driven.
- Projection does not create a second truth source.

After Agent A and Agent B pass, run Layer 4 runtime integration with mock agents.

## Production Smoke Setup

Use the handoff script referenced by the current-state bundle:

```bash
/Users/haowang/Desktop/claws/chatbot-v3-phase1-handoff-2026-04-27/scripts/phase1-prod-smoke.sh
```

Custom message:

```bash
/Users/haowang/Desktop/claws/chatbot-v3-phase1-handoff-2026-04-27/scripts/phase1-prod-smoke.sh "你们怎么收费？"
```

Collect logs for the printed `SESSION_ID`:

```bash
/Users/haowang/Desktop/claws/chatbot-v3-phase1-handoff-2026-04-27/scripts/collect-phase1-session-logs.sh '<SESSION_ID>' '20 minutes ago'
```

Live log grep:

```bash
rg "chatbot-v3.node-event|Supervisor|EventExtractionSummary|JourneyReducer|JourneyRuntimeAuthority|NextActionResolver|Invariant|Subagent|fallbackUsed|schemaValidationFailed|stateDiff|sidePath|primaryStagePreserved|matchedRuleId" phase1-session.log
```

## Required Production Smoke Matrix

Run each case in a fresh session unless the row explicitly says multi-turn.

| ID | Message / action | Expected event | Expected reducer/resolver result | Blocker if |
|---|---|---|---|---|
| CS-01 treatment in China | `我的妻子得了脑瘤，想去中国找医生` | `USER_WANTS_TREATMENT_IN_CHINA` | `nextAction=COLLECT_MINIMAL_TRIAGE`, stage remains `COLLECT_MINIMAL_MEDICAL_FACTS`, `sidePath=false` | Supervisor fallback/schema failure, wrong next action, missing reducer/resolver/invariant |
| CS-02 doctor matching | `我想找中国的脑瘤医生` | `USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING` or treatment-in-China event | Early journey still collects minimal triage | Premature recommendation/consult or unrelated FAQ/handoff event |
| CS-03 next step | `下一步是什么？` | `USER_ASKED_NEXT_STEP` | Reducer chooses current fact-based next action | Stage changes without facts or resolver disagrees |
| CS-04 FAQ detour | `你们怎么收费？` | `USER_ASKED_FAQ` | `nextAction=ANSWER_FAQ`, `sidePath=true`, `sidePathType=faq`, primary stage preserved | FAQ advances/resets primary journey |
| CS-05 risky advice | `我应该马上停药吗？` | `USER_ASKED_MEDICAL_ADVICE` | `nextAction=SAFE_MEDICAL_REDIRECT`, side path preserves primary stage | Direct medical instruction or primary-stage mutation |
| CS-06 out of scope | `你们能帮我申请美国绿卡吗？` | `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE` or equivalent out-of-scope event | Side-path redirect, primary stage preserved | Journey advances or loses medical state |
| CS-07 handoff | `我要人工，电话联系我` | `USER_REQUESTED_HUMAN` | `nextAction=CREATE_HANDOFF` | Obvious handoff is missed or creates unrelated journey action |
| CS-08 ambiguous reply | `可以吧` | `USER_AMBIGUOUS_REPLY` | `nextAction=CLARIFY_INTENT`, `sidePathType=clarification`, primary stage preserved | Ambiguity advances stage or dispatches wrong worker |
| CS-09 upload side effect | Upload/supporting-doc action or attachment-bearing request | `DOCUMENTS_UPLOADED` | Record upload side effect first; should not same-turn jump directly to `OFFER_ONLINE_CONSULT` | Consult is offered before record side effect path is handled |
| CS-10 semantic metadata boundary | Natural-language facts such as `患者52岁，胶质瘤，想去中国治疗` | Valid event, no semantic metadata trusted from LLM | Any fact patch must come from normalizer/runtime-approved data, not arbitrary LLM metadata | LLM-supplied metadata mutates `DomainFacts` |

## Log Evidence Checklist

For every production case, capture:

- `Supervisor` with expected `eventType`.
- `EventExtractionSummary` with the same event.
- `fallbackUsed=false` and `schemaValidationFailed=false` for Supervisor.
- `JourneyReducer` with `action=state_diff`.
- `stateDiff.beforeStage`, `stateDiff.afterStage`, and `factsPatch`.
- `nextAction`, `reasonCode`, and `replayLineage.matchedRuleId`.
- `sidePath`, `sidePathType`, and `primaryStagePreserved`.
- `NextActionResolver` with the same `nextAction`.
- `readPlan`, even when `readPlan.domains=[]`.
- `Invariant` with `action=projection_matches_reducer` and `status=completed`.
- `JourneyRuntimeAuthority` reduce summary, if emitted.
- Worker `Subagent` logs, classified separately from Supervisor/reducer health.

## Response Evidence Checklist

For every API response, record:

- HTTP status.
- `journey.stage`.
- Assistant message safety posture.
- Cards/actions returned.
- Whether cards/actions match reducer `nextAction`.
- Whether worker fallback occurred.

Classification rule: worker fallback is a blocker only if it proves the reducer selected the wrong `nextAction` or the projection/runtime violated the reducer decision. Otherwise, file it as a worker-agent follow-up.

## Dogfood Harness

After focused production smoke has reducer evidence, run the broader real-API dogfood:

```bash
DOGFOOD_BASE_URL=https://crmapi.medicaltourismchina.health \
DOGFOOD_SITE=china \
pnpm dogfood:chatbot-v3:real-api
```

Artifacts should be written under:

```text
artifacts/dogfood-<timestamp>/
```

Interpretation:

- Blocking: harness failure prevents collecting Supervisor/reducer/resolver/invariant evidence.
- Non-blocking for Phase 1: timeout occurs after correct control-plane evidence was logged.
- Already known from bundle: `dogfood-2026-04-27T01-37-56Z` had hard failures from onboarding fetch/chat timeout paths, while manual 60s smoke produced valid reducer evidence.

## Pass Criteria

The current state is acceptable for Phase 1 control-plane rollout when:

- Local focused tests and application typecheck pass.
- CS-01 through CS-08 pass with production logs.
- CS-09 proves `DOCUMENTS_UPLOADED` is side-effect-first.
- CS-10 proves semantic metadata is not trusted in Phase 1.
- No required smoke case has Supervisor `fallbackUsed:true` or `schemaValidationFailed:true`.
- Every required smoke case has `Supervisor`, `EventExtractionSummary`, `JourneyReducer`, `NextActionResolver`, and `Invariant` logs.
- Side paths preserve the primary journey.
- No legacy v2/v3 path overrides reducer authority.

## Blockers

Open a control-plane blocker for:

- Missing or failed `projection_matches_reducer` invariant.
- Missing `JourneyReducer` or `NextActionResolver` log.
- Supervisor emits or runtime consumes legacy proposal-shaped authority.
- Per-stage allowed-event gating accepts a disallowed LLM event.
- Semantic metadata from the LLM mutates facts in Phase 1.
- `ReadPlan` is treated as executed read data.
- `DOCUMENTS_UPLOADED` bypasses record side effects and jumps straight to consult.
- FAQ/safety/out-of-scope/clarification side paths advance or reset the primary journey.
- Treatment-in-China early journey does not produce `COLLECT_MINIMAL_TRIAGE`.

## Non-Blocking Follow-Ups

Track separately:

- `FaqAgent fallbackUsed:true` / `schemaValidationFailed:true`.
- Records/recommendation/consult worker schema hardening.
- Full dogfood timeout or onboarding flakiness after control-plane evidence exists.
- Frontend action/card UX polish.
- Executed read pipeline behind `ReadPlan`.
- Rich semantic metadata support with expanded strict schema and sanitizer tests.
- Separate deterministic/semantic extractor observability nodes.

## Test Record Template

```markdown
### Case CS-__

- Tester:
- Date/time:
- Environment:
- Bundle/commit:
- Message/action:
- SESSION_ID:
- HTTP status:
- Response `journey.stage`:
- Response cards/actions:
- Supervisor event/source/confidence:
- Supervisor fallbackUsed:
- Supervisor schemaValidationFailed:
- EventExtractionSummary:
- Reducer nextAction:
- Reducer nextStage:
- Reducer stateDiff/factsPatch:
- sidePath / sidePathType / primaryStagePreserved:
- Resolver nextAction:
- ReadPlan:
- Projection invariant:
- Worker subagent result:
- Hidden source-of-truth concern:
- Result: PASS / CONTROL-PLANE BLOCKER / WORKER FOLLOW-UP / FRONTEND FOLLOW-UP
- Notes:
```

## Suggested Execution Order

1. Verify the branch is at `36afd81` or later locally.
2. Run the local verification gate.
3. Run Layer 1 SupervisorEventExtractor tests.
4. Run Layer 2 JourneyReducer tests.
5. Run Layer 3 reducer pipeline projection tests.
6. Run Layer 4 runtime/composer tests with mock agents.
7. Run the eight multi-turn session tests and short event add-ons.
8. Static-review hidden source-of-truth risks in runtime, composer, compatibility view, and reused v2 services.
9. Run CS-01 treatment-in-China production smoke first because existing production evidence proves the expected healthy path.
10. Run CS-04, CS-05, CS-06, and CS-08 to stress side-path preservation.
11. Run CS-07 to verify deterministic handoff.
12. Run CS-09 and CS-10 to cover the doc-alignment deltas from the current-state bundle.
13. Run broader dogfood after focused smoke evidence exists.
14. Summarize results by category: control-plane blockers, worker-agent issues, frontend issues, and Phase 2 architecture improvements.
