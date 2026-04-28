# Chatbot V3 Supervisor And Authority Testing Handoff

## 2026-04-28 Repair Update

This guide was originally written for testing the `a924bae` implementation. A later repair pass fixed the stale local mounting tests and the confirmed Supervisor / Authority behavior gaps. For the current verification status, use:

```text
docs/analysis/2026-04-28-chatbot-v3-supervisor-authority-test-report.md
```

Current local repair base HEAD before the repair commit: `9f69234`.

## Handoff Summary

Use this document in a fresh session to test the Phase 1.1 chatbot-v3 control plane after the generic event and `TurnPlan` refactor.

This is both a handoff document and a testing guide. It includes:

- what changed
- why it changed
- where the spec and plan live
- which git commits matter
- what must be tested next
- how to test supervisor speed, event classification stability, authority determinism, and full supervisor + authority behavior

The test goal is not to judge final response copy. The goal is to prove:

1. The semantic supervisor is fast enough and schema-stable when it calls the LLM, especially when the runtime input is large.
2. Deterministic extraction bypasses the LLM for deterministic-only events.
3. The supervisor can classify the correct generic event shape across continuous sessions, not just isolated single turns.
4. The authority/reducer layer is deterministic: fixed input snapshots always produce the same `TurnPlan`, facts patch, stage, agent resolution, skill policy, read plan, and task contract.
5. The combined supervisor + authority pipeline is stable: event classification feeds reducer/authority correctly, side paths preserve primary stage, and facts persisted on turn N drive behavior on turn N+1.

## Repo Context

```text
Worktree:
/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc

Branch:
docs/phase1-test-doc

Original implementation HEAD covered by this handoff:
a924bae

Current local repair base HEAD before the repair commit:
9f69234

Spec:
docs/superpowers/specs/2026-04-27-chatbot-v3-generic-events-turnplan-design.md

Implementation plan:
docs/superpowers/plans/2026-04-28-chatbot-v3-generic-events-turnplan-implementation.md

Production API:
https://crmapi.medicaltourismchina.health/health

PR:
https://github.com/wahaHub/medical-crm-v2/pull/new/docs/phase1-test-doc
```

## Deployment And Test Environment

Current deployment status:

```text
The API has already been deployed from this branch:
docs/phase1-test-doc

Deployed implementation HEAD:
a924bae

Production API health:
https://crmapi.medicaltourismchina.health/health

Health status after deploy:
passed
```

Deployment command used:

```bash
python3 scripts/deploy_v2.py \
  --targets api \
  --branch docs/phase1-test-doc \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem
```

Validation-only deploy check command:

```bash
python3 scripts/deploy_v2.py \
  --targets api \
  --branch docs/phase1-test-doc \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem \
  --validate
```

Deployment target:

```text
Lightsail API host, managed by scripts/deploy_v2.py.
The script syncs the branch, installs deps, runs migrations, restarts the API service, and checks local/public health.
```

Current deployed-environment dogfood evidence:

```text
Official real API dogfood:
artifacts/chatbot-v3-real-api-dogfood/2026-04-27T18-18-10Z/report.md
Result: PASS, 7/7 required scenarios

Supplemental manual smoke:
artifacts/chatbot-v3-real-api-dogfood/2026-04-27T18-22-03Z-manual-smoke/manual-smoke-report.md
Result: PASS
Covered: docs upload, human request, safety/out-of-scope redirect, unclear fallback recovery
```

How to test deployed environment again:

```bash
cd /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc

curl -sS -i https://crmapi.medicaltourismchina.health/health

DOGFOOD_BASE_URL=https://crmapi.medicaltourismchina.health \
DOGFOOD_SITE=china \
pnpm run dogfood:chatbot-v3:real-api
```

Important production testing notes:

```text
The dogfood harness creates real patient/session data.
Use disposable dogfood email aliases only.

The onboarding endpoint is rate-limited in production.
If repeated ad hoc smoke tests start returning HTTP 429, do not treat that as a chatbot regression.
Wait for the rate limit window or use existing harness outputs.

Production responses do not expose every internal authority field.
Use deployed dogfood for end-to-end health and continuity.
Use local/unit/integration fixtures for exact supervisor/authority assertions.
```

## If Deployed Testing Finds A Problem

Use this loop:

```text
1. Reproduce and classify the failure.
2. If it is production-only or needs server logs, use lightsail-prod-debug.
3. Fix in the worktree:
   /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc
4. Add or update focused tests.
5. Run narrow verification.
6. Run review-until-clean for meaningful code changes.
7. Commit with detailed-commit-messages.
8. Push docs/phase1-test-doc.
9. Redeploy API from docs/phase1-test-doc.
10. Re-run deployed dogfood / targeted smoke.
```

Do not patch production directly.

All code fixes should happen in the worktree:

```text
/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc
```

Then redeploy from the branch:

```bash
git status --short --branch
git push origin docs/phase1-test-doc

python3 scripts/deploy_v2.py \
  --targets api \
  --branch docs/phase1-test-doc \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem
```

When to use `lightsail-prod-debug`:

```text
Use it if there is evidence of:
- deployed API 5xx
- timeout
- worker crash
- schema failure only seen in production
- persistence/write-back mismatch only seen in production
- dogfood report suggests logs are needed
```

When not to use `lightsail-prod-debug`:

```text
- normal local unit test failure
- expected HTTP 429 from rate-limited repeated onboarding
- response-quality issue that can be reproduced locally
- missing unit coverage
```

Production log starting point:

```text
Dogfood reports include a generated journalctl command with the relevant session ids.
Start from that command before doing broader log archaeology.
```

## Why This Change Exists

Before this refactor, chatbot-v3 had too much semantic specificity in `eventType` and too much old authority shape around `nextAction`.

The main risks were:

- semantic event names were growing one-by-one for every user behavior
- LLM supervisor output could conceptually drift toward stage/agent/task decisions
- `USER_ASKED_NEXT_STEP` was useful but too specific as an event type
- FAQ, safety, handoff, document upload, and recommendation revisit behavior could pollute the primary journey stage if reducer authority was not explicit
- agents needed richer task context than a single `nextAction`

The new model separates concerns:

```text
Supervisor:
classifies latest user turn only
eventType + target + modifier + confidence

Authority / reducer:
decides primaryAction + followUpAction + primaryStage + factsPatch

Runtime:
resolves agent, skill policy, read plan, and AgentTask from authority output

Agents:
write the response, but do not own stage/facts authority
```

## What Changed

### Generic Supervisor Events

Old semantic events were retired. The semantic LLM now uses a generic shape:

```ts
type SupervisorEvent = {
  eventType:
    | 'USER_EXPRESSED_NEED'
    | 'USER_ASKED_QUESTION'
    | 'USER_PROVIDED_INFORMATION'
    | 'USER_RESPONDED_TO_REQUEST'
    | 'USER_REQUESTED_HUMAN'
    | 'USER_ASKED_RISKY_MEDICAL_ADVICE'
    | 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE'
    | 'USER_MESSAGE_UNCLEAR';
  target: EventTarget;
  modifier: EventModifier;
  confidence: number;
  source: 'llm' | 'deterministic' | 'fallback_unknown';
};
```

Important target decision:

```text
USER_ASKED_NEXT_STEP was retired as an event type.
"下一步呢 / what should I do next" is now:
USER_ASKED_QUESTION + target=next_step + modifier=ask
```

### Deterministic Events Remain Deterministic

These events are still system/runtime detected and must not be emitted by the semantic LLM:

```text
TRIAGE_SUBMITTED
TRIAGE_SKIPPED
RECOMMENDATION_SELECTED
RECOMMENDATION_SKIPPED
DOCUMENTS_UPLOADED
```

### Strict LLM Schema

The LLM route adapter schema only allows:

```text
eventType
target
modifier
confidence
```

The LLM must not output:

```text
source
metadata
suggestedStage
dispatchAgent
task
intent
read domains
write patches
```

`source` is assigned by the adapter/runtime, not the LLM.

### TurnPlan Replaces nextAction As Authority Truth

Reducer output is now:

```ts
type TurnPlan = {
  primaryAction: PrimaryAction;
  followUpAction?: FollowUpAction;
  primaryStage: JourneyStage;
  factsPatch: FactsPatch;
  reasonCode: string;
  sidePath?: SidePathInfo;
};
```

`nextAction` may exist only as a legacy/debug compatibility label during rollout. It must not be used as authority truth.

### Runtime Skill Loading

Phase 1.1 uses a code-defined skill registry:

```text
SkillRouter -> SkillLoader -> ReadPlanner -> TaskBuilder
```

No DB/CMS-backed skill loading was implemented in this phase.

### Physical Agents Were Reused

The new conceptual roles map onto existing physical agents:

```text
GeneralResponseAgent -> FaqAgent
RecordsAgent -> RecordsAgent
RecommendationAgent -> RecommendationAgent
ConsultAgent -> ConsultAgent
HandoffAgent -> HandoffAgent
```

Consult/handoff were not renamed or fully rebuilt in this phase.

## Commit Chain

Main implementation commits:

```text
e1f795f feat(chatbot-v3): define generic supervisor events
590297e feat(chatbot-v3): classify semantic events with target modifiers
79c12e0 feat(chatbot-v3): reduce events into turn plans
a717e91 feat(chatbot-v3): enforce turn plan authority
465d05f feat(chatbot-v3): add deterministic agent and skill planning
8f7016d feat(chatbot-v3): build contracted agent tasks
b0e8f18 feat(chatbot-v3): connect turn plan runtime pipeline
e5c7966 test(chatbot-v3): align supervisor tests with generic events
55d0001 test(chatbot-v3): cover generic event sessions
a924bae fix(chatbot-v3): carry turn plan policy into worker tasks
```

Relevant documentation commits immediately before implementation:

```text
ac5e2b8 docs(chatbot-v3): lock consult deep-dive primary action
e82294d docs(chatbot-v3): require consult deep-dive coverage
6bfa494 docs(chatbot-v3): tighten consult resolver ownership
7b2eea2 docs(chatbot-v3): clarify semantic schema normalization
0ee73c0 docs(chatbot-v3): resolve final review conflicts
```

## Review And Deployment Status

```text
review-until-clean:
completed

Final reviewer result:
No meaningful findings remain.

detailed-commit-messages:
used for committed chunks

Push:
origin/docs/phase1-test-doc

Deployment:
API deployed to production Lightsail from docs/phase1-test-doc

Production health:
https://crmapi.medicaltourismchina.health/health passed

Official real API dogfood:
PASS, 7/7 required scenarios

Supplemental production smoke:
PASS, covered docs upload, human request, safety/out-of-scope redirect, fallback recovery
```

Known non-blocking issue:

```text
API typecheck still has pre-existing unrelated errors:
- apps/api/src/composition-root.ts duplicate conversationRepo / repo type mismatch
- apps/api/src/routes/chatbot.routes.ts unused tryResolveAdminConversationForChatbotSession
- apps/api/src/routes/patient-widget-starter.ts readonly shortlist mismatch
```

## Testing Goals For The Next Session

The next session should produce a test report, not start by changing code.

### Goal 1: Supervisor LLM Speed With Large Input

Question to answer:

```text
Given a realistic large SupervisorGatewayInput, can the semantic supervisor produce a valid event within the acceptable latency budget?
```

Why this matters:

```text
Supervisor input can include current stage, compact summary, last question context, intake facts, recommendation status, process state, document count, and latest message. Even after prompt simplification, real inputs may be large enough to affect latency.
```

Measure:

```text
p50 latency
p95 latency
max latency
retry count
fallback count
schema failure count
transport failure count
prompt size / approximate token size if available
```

Target threshold for Phase 1.1 smoke:

```text
p50 <= 2500 ms
p95 <= 8000 ms
max <= 12000 ms unless retry occurred
schema fallback <= 5%
transport failure = 0
deterministic-only event leakage = 0
```

### Goal 2: Supervisor Event Accuracy In Continuous Sessions

Question to answer:

```text
Across a realistic multi-turn session, does the supervisor classify the current turn correctly using the generic event shape?
```

Must test:

```text
treatment need -> USER_EXPRESSED_NEED / treatment / ask
next step -> USER_ASKED_QUESTION / next_step / ask
pricing FAQ -> USER_ASKED_QUESTION / pricing / ask
process FAQ -> USER_ASKED_QUESTION / process / ask
medical facts -> USER_PROVIDED_INFORMATION / medical_facts / provide
document availability -> USER_PROVIDED_INFORMATION / documents / provide
contact info -> USER_PROVIDED_INFORMATION / contact / provide
recommendation revisit -> USER_EXPRESSED_NEED / recommendation or hospital / revisit
document rejection -> USER_RESPONDED_TO_REQUEST / documents / reject
hesitation -> USER_RESPONDED_TO_REQUEST / unknown or current target / hesitate
human request -> USER_REQUESTED_HUMAN / human / ask
risky medical advice -> USER_ASKED_RISKY_MEDICAL_ADVICE
out of scope -> USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE
unclear -> USER_MESSAGE_UNCLEAR
```

The important part is not just one-turn accuracy. Test whether the classifier remains stable after prior turns have changed:

```text
current_stage
conversation_summary
last_question_type
last_assistant_question
facts snapshot
document count
handoff status
process.explained
```

### Goal 3: Authority Determinism With Fixed Input

Question to answer:

```text
For fixed event + fixed facts + fixed state, does authority produce exactly the same output every time?
```

Run every authority fixture repeatedly:

```text
25 iterations minimum per fixture
deepEqual all canonical output fields
no random IDs, timestamps, or unordered arrays in canonical output
```

Canonical fields:

```text
turnPlan.primaryAction
turnPlan.followUpAction
turnPlan.primaryStage
turnPlan.factsPatch
turnPlan.reasonCode
turnPlan.sidePath
authority decision/write contract
resolvedAgent
skillPolicy.allowedSkillPacks
loadedSkillPacks
readPlan.intents
agentTask.responseContract
legacy compatibility projection, if present
```

### Goal 4: Supervisor + Authority End-To-End Stability

Question to answer:

```text
When the supervisor event feeds authority, does the combined pipeline behave consistently and preserve journey rules?
```

Must test combined flow:

```text
input message + snapshot
-> SupervisorEventExtractor
-> reducer / authority
-> AgentResolver
-> SkillRouter
-> SkillLoader
-> ReadPlanner
-> TaskBuilder
```

Assertions:

```text
deterministic inputs bypass LLM
semantic inputs do not produce deterministic-only events
FAQ/safety/out-of-scope preserve primary stage
DOCUMENTS_UPLOADED persists docs but does not jump to consult in same turn
next_step after docs persisted moves to consult
formal process overview is the only path that writes process.explained=true
handoff active remains handoff-oriented across turns
fallback_unknown does not poison the next turn
```

### Goal 5: Runtime Bridge Still Carries Authority To Agents

Question to answer:

```text
Does the API runtime preserve TurnPlan/AgentTask information when it reaches worker tasks and prompts?
```

Must verify:

```text
primaryAction reaches worker task
followUpAction reaches worker task
allowedSkillPacks reaches worker task
readIntents reaches worker task
responseContract reaches worker task
FAQ/Records prompts include compact policy context
safety and out-of-scope redirects use bounded fallback/policy
```

## Important Files

```text
Supervisor event types:
packages/application/src/services/chatbot-v3/supervisor-event.types.ts

Deterministic extractor:
packages/application/src/services/chatbot-v3/deterministic-event-extractor.ts

Application supervisor service:
packages/application/src/services/chatbot-v3/supervisor.service.ts

LLM prompt:
apps/api/src/routes/chatbot-v3/supervisor-prompt.ts

LLM route adapter:
apps/api/src/routes/chatbot-v3/supervisor-route-adapter.ts

Reducer / authority:
packages/application/src/services/chatbot-v3/journey-reducer.ts
packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts

Resolver / skills / task:
packages/application/src/services/chatbot-v3/agent-resolver.ts
packages/application/src/services/chatbot-v3/skill-router.ts
packages/application/src/services/chatbot-v3/skill-loader.ts
packages/application/src/services/chatbot-v3/read-planner.ts
packages/application/src/services/chatbot-v3/task-builder.ts

Runtime bridge:
apps/api/src/routes/chatbot-v3/runtime.service.ts
apps/api/src/routes/chatbot-v3/worker-task.ts
```

## Test Layers

### Layer 1: Deterministic Supervisor Tests

Purpose: prove deterministic-only signals never depend on the LLM.

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts \
  src/services/__tests__/chatbot-v3/supervisor.service.test.ts
```

Required assertions:

- `TRIAGE_SUBMITTED` is extracted from structured user action.
- `TRIAGE_SKIPPED` is extracted from structured user action.
- `RECOMMENDATION_SELECTED` is extracted from structured user action.
- `RECOMMENDATION_SKIPPED` is extracted from structured user action.
- `DOCUMENTS_UPLOADED` is extracted from attachments.
- `USER_REQUESTED_HUMAN` is extracted from human handoff phrases.
- Human handoff Chinese soft phrases are covered:
  - `有人能联系我吗`
  - `可以加我微信吗`
  - `能不能让顾问联系我`
  - `我想跟你们工作人员聊一下`
- Pricing/process FAQ phrases do not trigger deterministic extraction.
- Deterministic extraction does not call the LLM route adapter.

Expected result:

```text
All deterministic tests pass.
No deterministic-only event requires semantic LLM classification.
```

## Layer 2: Semantic Supervisor Schema And Boundary Tests

Purpose: prove the LLM can only classify semantic events and cannot output workflow authority.

Run:

```bash
pnpm --filter @medical-crm/api test -- \
  src/routes/chatbot-v3/supervisor-prompt.test.ts \
  src/routes/chatbot-v3/supervisor-route-adapter.test.ts

pnpm --filter @medical-crm/application test -- \
  src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts \
  src/services/__tests__/chatbot-v3/supervisor.service.test.ts
```

Required assertions:

- LLM schema only allows:
  - `eventType`
  - `target`
  - `modifier`
  - `confidence`
- LLM schema rejects:
  - `source`
  - `metadata`
  - `suggestedStage`
  - `dispatchAgent`
  - `task`
  - `intent`
  - write patches
- `eventType` must be one of allowed semantic events for the turn.
- `target` must be one of `SUPERVISOR_EVENT_TARGETS`.
- `modifier` must be one of `SUPERVISOR_EVENT_MODIFIERS`.
- Invalid `eventType`, `target`, or `modifier` retries once, then falls back.
- LLM cannot output deterministic-only events:
  - `TRIAGE_SUBMITTED`
  - `TRIAGE_SKIPPED`
  - `RECOMMENDATION_SELECTED`
  - `RECOMMENDATION_SKIPPED`
  - `DOCUMENTS_UPLOADED`
- `USER_ASKED_NEXT_STEP` is retired as an event type.
- Current-case "what next / 下一步呢" maps to:

```json
{
  "eventType": "USER_ASKED_QUESTION",
  "target": "next_step",
  "modifier": "ask"
}
```

Expected result:

```text
Supervisor returns only generic semantic event shape.
No stage/agent/task authority leaks from LLM output.
```

## Layer 3: Supervisor LLM Latency Smoke

Purpose: measure real semantic classification latency and failure rate, including realistic large input.

This is not a unit test. It should hit the real route adapter or a controlled test harness that calls the configured LLM. Do not mix this with deterministic-only cases, because deterministic cases should not call the LLM.

Suggested semantic input set:

```text
1. My wife has a brain tumor and we want to find doctors in China.
2. What should we do next?
3. How much does this usually cost?
4. Can you guarantee she will be cured?
5. Can you help me apply for a US green card?
6. I have MRI but no pathology report.
7. I want to speak with a coordinator.
8. These hospitals are not suitable, can you show other options?
9. My email is test@example.com and my phone is +1 415 555 0100.
10. I need to think about it first.
```

Run the input set in two sizes:

```text
Small input:
- latest_user_message
- current_stage
- compact facts snapshot

Large realistic input:
- latest_user_message
- current_stage
- conversation_summary around 800-1500 words
- last_question_type
- last_assistant_question
- known condition/destination/language
- minimal triage answer summary
- recommendation status
- process.explained
- supporting_documents_count
- handoff status
- selected hospital ids or compact selected hospital summary, if runtime currently provides it
```

Large input acceptance is important because production runtime can accumulate session context. The supervisor must remain a classifier under large context; it must not start inventing stage, agent, task, or write patches.

Metrics to capture per turn:

```text
input_id
latest_user_message
allowedEvents
status: pass | fallback | error
eventType
target
modifier
confidence
attempt_count
latency_ms
schema_error_kind, if any
raw_response_redacted, if available
```

Recommended thresholds for Phase 1.1 smoke:

```text
p50 latency <= 2500 ms for small input
p95 latency <= 8000 ms for small input
p50 latency <= 4000 ms for large realistic input
p95 latency <= 12000 ms for large realistic input
schema fallback rate <= 5% for the fixed input set
transport failure rate = 0 for a 10-case smoke
deterministic-only event leakage = 0
```

If the LLM latency is slower than the threshold but schema results are correct, do not change taxonomy first. Capture:

```text
provider
model
prompt length
attempt count
slow input examples
whether retry caused the latency
```

Then decide separately whether to shorten prompt, change model, or cache common semantic classifications.

## Layer 3B: Supervisor Continuous Session Event Accuracy

Purpose: prove the supervisor keeps classifying the correct generic event shape across realistic session state changes.

This layer can be run with a mocked LLM route adapter for deterministic assertions, plus a smaller real-LLM smoke for latency/accuracy. If using real LLM, do not assert exact confidence; assert event shape and retry/fallback behavior.

Session A: happy-path semantic classifier stability

```text
Turn 1:
message: My wife has a brain tumor and we want to find doctors in China.
expect: USER_EXPRESSED_NEED / treatment / ask

Turn 2:
snapshot says stage=COLLECT_MINIMAL_MEDICAL_FACTS
message: She had surgery last year and now it recurred. We have MRI.
expect: USER_PROVIDED_INFORMATION / medical_facts or documents / provide

Turn 3:
snapshot says minimal facts exist
message: What should we do next?
expect: USER_ASKED_QUESTION / next_step / ask

Turn 4:
snapshot says recommendation status=selected, process.explained=true, docs=0
message: How much does it usually cost?
expect: USER_ASKED_QUESTION / pricing / ask

Turn 5:
snapshot still says primary stage=COLLECT_MEDICAL_INPUTS
message: Okay, I can upload MRI later.
expect: USER_PROVIDED_INFORMATION / documents / provide
```

Session B: side-path and recovery classifier stability

```text
Turn 1:
message: Can you guarantee she will be cured?
expect: USER_ASKED_RISKY_MEDICAL_ADVICE / treatment or unknown / ask

Turn 2:
snapshot primary stage unchanged
message: I mean what documents should I prepare?
expect: USER_ASKED_QUESTION / documents / ask

Turn 3:
message: Can you help me apply for a US green card?
expect: USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE / unknown or travel / ask

Turn 4:
message: Sorry, I mean for medical treatment in China. What is next?
expect: USER_ASKED_QUESTION / next_step / ask
```

Session C: handoff/contact/rejection classifier stability

```text
Turn 1:
message: Can someone from your team contact me?
expect: USER_REQUESTED_HUMAN / human / ask

Turn 2:
snapshot says handoff.active=true
message: My email is dogfood@example.com and my phone is +1 415 555 0100.
expect: USER_PROVIDED_INFORMATION / contact / provide

Turn 3:
snapshot last question requested documents
message: I do not want to upload records right now.
expect: USER_RESPONDED_TO_REQUEST / documents / reject

Turn 4:
message: I need to think about it first.
expect: USER_RESPONDED_TO_REQUEST / unknown or current target / hesitate
```

Session D: recommendation revisit classifier stability

```text
Turn 1:
snapshot says recommendation.status=selected
message: These hospitals are not suitable, can you show other options?
expect: USER_EXPRESSED_NEED / recommendation or hospital / revisit

Turn 2:
message: I prefer Shanghai and lower cost.
expect: USER_PROVIDED_INFORMATION / hospital_selection or recommendation / provide
```

Report per turn:

```text
session_id
turn_index
snapshot summary
latest_user_message
expected eventType / target / modifier
actual eventType / target / modifier
confidence
latency_ms
pass/fail
notes
```

Acceptance:

```text
No retired semantic event names appear.
No deterministic-only event comes from semantic LLM.
At least 90% exact event shape match on the fixed real-LLM session smoke.
100% event shape match when route adapter is mocked.
Fallback_unknown is acceptable only for intentionally unclear turns.
```

## Layer 4: Authority Determinism Tests

Purpose: prove fixed event + fixed facts snapshot always produces identical authority output.

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  src/services/__tests__/chatbot-v3/journey-reducer.test.ts \
  src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts \
  src/services/__tests__/chatbot-v3/legacy-compatibility-view.test.ts \
  src/services/__tests__/chatbot-v3/agent-resolver.test.ts \
  src/services/__tests__/chatbot-v3/skill-router.test.ts \
  src/services/__tests__/chatbot-v3/skill-loader.test.ts \
  src/services/__tests__/chatbot-v3/read-planner.test.ts \
  src/services/__tests__/chatbot-v3/task-builder.test.ts
```

For each fixture, assert the full output shape:

```text
event
turnPlan.primaryAction
turnPlan.followUpAction
turnPlan.primaryStage
turnPlan.factsPatch
turnPlan.reasonCode
turnPlan.sidePath
authority write-back contract
resolvedAgent
skillPolicy.allowedSkillPacks
loadedSkillPacks
readPlan.intents
agentTask.primaryAction
agentTask.followUpAction
agentTask.responseContract
legacy compatibility projection, if present
```

Run each fixture multiple times in the same process:

```text
for i in 1..25:
  reduceJourney(fixedEvent, fixedFacts, fixedState)
  resolveAgent(...)
  buildSkillPolicy(...)
  loadSkillPacks(...)
  buildReadPlan(...)
  buildAgentTask(...)

assert deepEqual(output[i], output[0])
```

Required authority fixtures:

```text
1. USER_EXPRESSED_NEED + treatment + ask
   facts: no triage, no recommendation, no docs
   expect: REQUEST_INFO minimal_triage, primaryStage COLLECT_MINIMAL_MEDICAL_FACTS

2. USER_ASKED_QUESTION + next_step + ask
   facts: triage submitted, recommendation selected, process explained, docs=0
   expect: REQUEST_INFO documents, primaryStage COLLECT_MEDICAL_INPUTS

3. USER_ASKED_QUESTION + next_step + ask
   facts: triage submitted, recommendation selected, process explained, docs=1
   expect: PRESENT_OPTIONS consult, primaryStage ONLINE_CONSULT

4. USER_ASKED_QUESTION + pricing + ask
   currentStage: COLLECT_MEDICAL_INPUTS
   expect: ANSWER pricing, sidePath faq, preserve primary stage

5. USER_ASKED_QUESTION + process + ask
   currentStage: ONLINE_CONSULT, process.explained=true
   expect: ANSWER process mode=faq, primaryStage remains ONLINE_CONSULT
   expect: does not write process.explained=true again

6. RECOMMENDATION_SELECTED
   process.explained=false
   expect: ANSWER process mode=formal_overview, primaryStage EXPLAIN_PROCESS
   expect: factsPatch.process.explained=true only through formal overview invariant

7. DOCUMENTS_UPLOADED
   docs=0
   expect: factsPatch.records.supportingDocumentsCount increments
   expect: primaryStage COLLECT_MEDICAL_INPUTS
   expect: does not jump directly to ONLINE_CONSULT in same turn

8. USER_REQUESTED_HUMAN
   expect: ESCALATE human, primaryStage HUMAN_HANDOFF
   next fixed turn with handoff.active=true should remain handoff-oriented

9. USER_ASKED_RISKY_MEDICAL_ADVICE
   expect: REDIRECT medical_safety or cannot_do, primaryStage preserved
   expect: bounded response contract safety rules

10. USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE
    expect: REDIRECT out_of_scope, primaryStage preserved
    expect: service scope skill / safety contract

11. USER_RESPONDED_TO_REQUEST + documents + reject
    expect: HANDLE_RESPONSE documents reject
    expect: objection / low friction next step skills
    expect: primaryStage preserved

12. USER_PROVIDED_INFORMATION + contact + provide
    expect: ACKNOWLEDGE or ESCALATE according to current policy
    expect: contact/handoff context in skill/task policy
```

Expected result:

```text
Fixed input gives identical output across repeated runs.
No LLM call is involved in authority/reducer determinism tests.
No `nextAction` value is used as control-plane truth.
```

## Layer 4B: Supervisor + Authority Fixed Pipeline Tests

Purpose: prove that fixed user input plus fixed snapshot gives stable output from supervisor through task building.

This is the most important test for the new architecture. It tests the full control-plane pipeline without running real subagents:

```text
input message + snapshot
-> SupervisorEventExtractor
-> JourneyReducer
-> Authority
-> AgentResolver
-> SkillRouter
-> SkillLoader
-> ReadPlanner
-> TaskBuilder
```

Use two modes:

```text
Mocked supervisor mode:
- LLM adapter returns fixed event shape.
- Expected output should be exact deepEqual.

Real supervisor mode:
- LLM adapter is real.
- Expected event shape should match allowed tolerance.
- Authority output should be deterministic for the actual event returned.
```

Required fixed pipeline cases:

```text
1. Large input treatment need
   message: My wife has a brain tumor and we want to find doctors in China.
   expected event: USER_EXPRESSED_NEED / treatment / ask
   expected authority: REQUEST_INFO minimal_triage or medical_facts, primaryStage COLLECT_MINIMAL_MEDICAL_FACTS

2. Next step before docs
   facts: triage submitted, recommendation selected, process.explained=true, docs=0
   message: What should we do next?
   expected event: USER_ASKED_QUESTION / next_step / ask
   expected authority: REQUEST_INFO documents, primaryStage COLLECT_MEDICAL_INPUTS

3. Next step after docs
   facts: triage submitted, recommendation selected, process.explained=true, docs=1
   message: What should we do next?
   expected event: USER_ASKED_QUESTION / next_step / ask
   expected authority: PRESENT_OPTIONS consult, primaryStage ONLINE_CONSULT

4. Pricing FAQ detour
   currentStage=COLLECT_MEDICAL_INPUTS
   message: How much does it usually cost?
   expected event: USER_ASKED_QUESTION / pricing / ask
   expected authority: ANSWER pricing, sidePath faq, primaryStage preserved

5. Safety redirect
   currentStage=COLLECT_MEDICAL_INPUTS
   message: Can you guarantee she will be cured?
   expected event: USER_ASKED_RISKY_MEDICAL_ADVICE
   expected authority: REDIRECT medical_safety or cannot_do, primaryStage preserved

6. Out-of-scope redirect
   message: Can you help me apply for a US green card?
   expected event: USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE
   expected authority: REDIRECT out_of_scope, primaryStage preserved

7. Contact info
   message: My email is dogfood@example.com and my WeChat is medora-test.
   expected event: USER_PROVIDED_INFORMATION / contact / provide
   expected authority: contact/handoff-oriented task according to current policy

8. Recommendation revisit
   facts: recommendation selected
   message: Can you show cheaper hospitals in Shanghai?
   expected event: USER_EXPRESSED_NEED / recommendation or hospital / revisit
   expected authority: RecommendationAgent ownership or recommendation-oriented plan
```

Acceptance:

```text
The same fixed input run 10 times produces the same canonical pipeline output in mocked supervisor mode.
Real supervisor mode stays within event-shape tolerance and does not leak authority fields.
AgentResolver and SkillRouter outputs are stable and ordered.
No generated task gives agents authority to change stage/facts.
```

## Layer 5: Multi-Turn Session Consistency Tests

Purpose: prove write-back from turn N affects turn N+1 correctly.

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  src/services/__tests__/chatbot-v3/journey-session.test.ts
```

Required sessions:

```text
1. Standard happy path:
   treatment need -> triage submitted -> recommendation selected -> process overview -> docs uploaded -> next_step -> consult

2. FAQ detour:
   stage=COLLECT_MEDICAL_INPUTS
   pricing question -> answer FAQ
   next_step -> still asks/request documents

3. Process FAQ after process already explained:
   stage=ONLINE_CONSULT
   process question -> normal FAQ
   must not re-enter EXPLAIN_PROCESS

4. Documents two-turn:
   upload docs -> persist docs count, stay/request records
   next_step with docs=1 -> consult

5. Documents early:
   upload before triage/recommendation
   docs should persist and not be lost

6. Safety detour:
   risky question -> safe redirect, primary stage preserved
   next normal turn resumes main flow

7. Human request:
   request human -> handoff active
   next_step remains handoff-oriented

8. Fallback recovery:
   invalid/unclear -> clarify, stage preserved
   next valid treatment need resumes flow
```

Expected result:

```text
Side paths do not pollute primaryStage.
factsPatch persists into the next turn.
DOCUMENTS_UPLOADED remains two-turn by design.
Handoff is strong state once active.
```

## Layer 6: API Runtime Bridge Tests

Purpose: prove API runtime actually carries `TurnPlan` into worker tasks and agent prompts.

Run:

```bash
pnpm --filter @medical-crm/api test -- \
  src/routes/chatbot-v3/faq-llm-adapter.test.ts \
  src/routes/chatbot-v3/records-llm-adapter.test.ts \
  src/__tests__/chatbot-v3.routes.test.ts
```

Required assertions:

- `WorkerTaskBase` includes:
  - `primaryAction`
  - `followUpAction`
  - `allowedSkillPacks`
  - `readIntents`
  - `responseContract`
- FAQ prompt includes compact turn policy context.
- Records prompt includes compact turn policy context.
- Safety redirect fallback takes priority over generic FAQ fallback.
- Out-of-scope fallback is policy-grounded.
- Process overview write-back is only allowed for `ANSWER process mode=formal_overview`.

Expected result:

```text
Runtime bridge does not drop authority decisions before agent execution.
Agents receive policy context but cannot decide stage/facts authority.
```

## Optional Production Smoke

Production dogfood proves the deployed route does not break, but it does not expose every internal authority field.

Run:

```bash
DOGFOOD_BASE_URL=https://crmapi.medicaltourismchina.health \
DOGFOOD_SITE=china \
pnpm run dogfood:chatbot-v3:real-api
```

Expected:

```text
Run outcome: PASS
No HTTP failures
No control-plane failures
No agent/composer failures
```

If production smoke fails, use the report's generated journal command first. Only then enter `lightsail-prod-debug`.

## Suggested Test Report Format

Use this format in the new session:

```text
# Chatbot V3 Supervisor / Authority Test Report

Repo:
Branch:
HEAD:
Date:

## Summary
- Supervisor deterministic tests:
- Supervisor LLM schema tests:
- Supervisor LLM latency:
- Authority determinism:
- Multi-turn consistency:
- API runtime bridge:
- Production smoke, if run:

## Supervisor LLM Latency Table
| Input ID | Event | Target | Modifier | Attempts | Latency ms | Result |
|---|---|---|---:|---:|---:|---|

## Authority Determinism Table
| Fixture | Repeats | Stable | PrimaryAction | FollowUpAction | Stage | Agent | Skills | Notes |
|---|---:|---|---|---|---|---|---|---|

## Failures
For each failure:
- Repro command
- Fixed input
- Expected
- Actual
- Whether failure is supervisor, authority, runtime bridge, agent, or production env
- Whether lightsail-prod-debug is needed

## Known Non-Blocking Issues
- Existing unrelated API typecheck errors:
  - composition-root.ts duplicate conversationRepo / repo type mismatch
  - chatbot.routes.ts unused tryResolveAdminConversationForChatbotSession
  - patient-widget-starter.ts readonly shortlist mismatch
```

## New Session Starter Prompt

```text
Please test chatbot-v3 supervisor and authority in:
/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc

Branch docs/phase1-test-doc, HEAD a924bae.

Use:
docs/analysis/2026-04-28-chatbot-v3-supervisor-authority-testing-guide.md

Focus on:
1. Supervisor deterministic extraction bypasses LLM.
2. Semantic supervisor LLM schema stability and latency.
3. Authority/reducer deterministic behavior for fixed input fixtures.
4. Multi-turn facts persistence and side-path preservation.

Do not start by changing taxonomy or reducer behavior. First produce a test report with evidence.
```
