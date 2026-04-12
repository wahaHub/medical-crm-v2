# Chatbot V2 Journey And Orchestrator Logic

Date: 2026-04-12

## Why This Document Exists

This note captures the current CRM-owned `chatbot-v2` logic after the latest fixes:

- `targetResourceTypes` now flows into the composer DSL
- `chatbot_v2_floor` now prefers the newest assistant snapshot instead of an older one
- `JourneyEngineService` and `ConversationOrchestratorService` now cover the main `pre / active / post` transitions that were previously missing

This document is meant to answer:

- what the composer actually receives
- what the journey engine now derives
- what the orchestrator now decides on each turn

## The `chatbotV2` Pre-Turn Envelope

Before CRM calls the composer app, it builds a `preTurn` envelope in
[chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts).

That object is serialized into:

- `inputs.chatbotV2 = JSON.stringify(chatbotV2Turn.preTurn)`

and passed into the composer Dify app.

The shape is now:

```json
{
  "journeySnapshot": {
    "currentStage": "COLLECT_MEDICAL_INPUTS",
    "currentPhase": "active"
  },
  "resources": [
    {
      "resourceType": "QUESTIONNAIRE",
      "resourceId": "questionnaire:widget-chat:patient:case",
      "status": "available",
      "stageBinding": {
        "stage": "COLLECT_MEDICAL_INPUTS",
        "phase": "active"
      },
      "visibility": {
        "mode": "journey"
      },
      "payload": {
        "title": "Complete your medical questionnaire"
      },
      "actions": ["open", "submit"]
    }
  ],
  "truthSummary": {
    "medicalInputsStarted": true,
    "medicalInputsSubmitted": false,
    "recommendationAvailable": false,
    "recommendationConfirmed": false,
    "onlineConsultRequired": false,
    "onlineConsultStarted": false,
    "onlineConsultSubmitted": false,
    "humanHandoffActive": false,
    "humanHandoffSubmitted": false
  },
  "requestClass": "resource_request",
  "responseIntent": "resource_request",
  "targetResourceTypes": ["QUESTIONNAIRE"],
  "includeProgressionFollowUp": false
}
```

## What Was Missing Before

Previously the composer got:

- `requestClass`
- `responseIntent`
- `journeySnapshot`
- `resources`
- `truthSummary`

but it did not get:

- `targetResourceTypes`

That meant the composer knew which resources were allowed in general, but not which resource the user had explicitly asked for on this turn.

Example:

- user message: `Can you open the questionnaire for me?`
- classifier result:
  - `requestClass = resource_request`
  - `targetResourceTypes = ["QUESTIONNAIRE"]`
- allowed resources already contained `QUESTIONNAIRE`

Without `targetResourceTypes`, the composer still had to infer whether the user was explicitly asking for the questionnaire, which made it more likely to answer too conservatively.

That gap is now closed.

## Composer DSL Context

The composer Dify app is:

[medora-ai-chatbot-v2.dsl.yml](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v2.dsl.yml)

Its parse node now exposes:

- `request_class`
- `response_intent`
- `target_resource_types`
- `current_stage`
- `current_phase`
- `allowed_resource_types`
- `allowed_resources_json`
- `truth_summary_json`
- `allowed_next_action_hints`
- `include_progression_follow_up`

The composer prompt now explicitly says:

- target resource types represent the user’s explicit requested resources for this turn
- if `requestClass = resource_request` and the targeted resource appears in the allowed resources list, the answer should treat that resource as available for this turn

## Journey Truth

`truthSummary` is derived from CRM truth and bridged into `chatbotV2`.

The current truth fields are:

- `medicalInputsStarted`
- `medicalInputsSubmitted`
- `recommendationAvailable`
- `recommendationConfirmed`
- `onlineConsultRequired`
- `onlineConsultStarted`
- `onlineConsultSubmitted`
- `humanHandoffActive`
- `humanHandoffSubmitted`

These come from:

- [journey-truth.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/journey-truth.service.ts)

## Journey Engine Logic

The journey engine lives in:

[journey-engine.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/journey-engine.service.ts)

It has two jobs:

1. `deriveSnapshot(truth)`
2. `advanceSnapshot(current, event)`

### `deriveSnapshot(truth)`

Current precedence is:

1. `humanHandoffActive`
   - return `HUMAN_HANDOFF.active`

2. `onlineConsultSubmitted`
   - return `ONLINE_CONSULT.post`

3. `onlineConsultStarted`
   - return `ONLINE_CONSULT.active`

4. `humanHandoffSubmitted`
   - return `HUMAN_HANDOFF.post`
   - this now happens after active consult states, so old completed handoff does not override a newer consult stage

5. `recommendationConfirmed`
   - if `onlineConsultRequired = true`
     - return `ONLINE_CONSULT.pre`
   - otherwise
     - return `RECOMMENDATION.post`

6. `recommendationAvailable`
   - return `RECOMMENDATION.active`

7. `medicalInputsSubmitted`
   - return `COLLECT_MEDICAL_INPUTS.post`

8. `medicalInputsStarted`
   - return `COLLECT_MEDICAL_INPUTS.active`

9. fallback
   - return `EXPLAIN_PROCESS.active`

### `advanceSnapshot(current, event)`

Supported transition events are now:

- `START_MEDICAL_INPUTS`
- `START_RECOMMENDATION`
- `START_ONLINE_CONSULT`
- `REQUEST_HUMAN_HANDOFF`

Current transition rules are:

- `EXPLAIN_PROCESS.active + START_MEDICAL_INPUTS`
  - `COLLECT_MEDICAL_INPUTS.pre`

- `COLLECT_MEDICAL_INPUTS.post + START_RECOMMENDATION`
  - `RECOMMENDATION.pre`

- `RECOMMENDATION.post + START_ONLINE_CONSULT`
  - `ONLINE_CONSULT.pre`

- any current stage + `REQUEST_HUMAN_HANDOFF`
  - `HUMAN_HANDOFF.pre`

## Conversation Orchestrator Logic

The orchestrator lives in:

[conversation-orchestrator.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts)

Its job is to take:

- current `journeySnapshot`
- current `truth`
- classifier output

and decide:

- `responseIntent`
- `allowedResources`
- whether FAQ grounding is required
- whether a journey update should happen
- whether progression follow-up should be accepted

### Step 1: it loads the current resource registry

It first builds:

- current allowed resources from the current snapshot

Then, if it decides a journey update is needed, it builds:

- projected allowed resources from the updated snapshot

### Step 2: it decides whether FAQ grounding is required

Current rule:

- `faq` -> `requiresFaqGrounding = true`
- `process_explanation` -> `requiresFaqGrounding = true`
- everything else -> `false`

### Step 3: it decides whether `includeProgressionFollowUp` is accepted

Current rule:

- must already be `true` from classifier
- request class must be:
  - `faq`, or
  - `process_explanation`
- current stage must not already be `HUMAN_HANDOFF`

If all of those are true, the follow-up progression hint is accepted.

### Step 4: it decides whether to advance the journey

Current journey update rules are:

1. Move from `EXPLAIN_PROCESS` into `COLLECT_MEDICAL_INPUTS.pre`

Trigger conditions:

- `progression_request`
- accepted FAQ / process-explanation progression follow-up
- `resource_request` targeting one of:
  - `MEDICAL_DOC_UPLOAD`
  - `QUESTIONNAIRE`
  - `HOSPITAL_RECOMMENDATION`
  - `PACKAGE_RECOMMENDATION`

and only when current stage is:

- `EXPLAIN_PROCESS`

2. Move from `COLLECT_MEDICAL_INPUTS.post` into `RECOMMENDATION.pre`

Trigger conditions:

- `progression_request`
- accepted FAQ / process-explanation progression follow-up
- `resource_request` targeting:
  - `HOSPITAL_RECOMMENDATION`
  - `PACKAGE_RECOMMENDATION`

and only when:

- current stage is `COLLECT_MEDICAL_INPUTS`
- current phase is `post`
- and either:
  - `recommendationAvailable = true`, or
  - `recommendationConfirmed = true`

3. Move from `RECOMMENDATION.post` into `ONLINE_CONSULT.pre`

Trigger conditions:

- `progression_request`
- accepted FAQ / process-explanation progression follow-up
- `resource_request` targeting:
  - `ONLINE_CONSULT_BOOKING`

and only when:

- current stage is `RECOMMENDATION`
- current phase is `post`
- `onlineConsultRequired = true`
- `onlineConsultStarted = false`
- `onlineConsultSubmitted = false`

4. Move into `HUMAN_HANDOFF.pre`

Trigger condition:

- `human_help_request`

and only when current stage is not already `HUMAN_HANDOFF`

### Step 5: it decides which resources are allowed on this turn

Current rule:

1. Build projected allowed resources from either:
   - the updated snapshot, or
   - the current snapshot if there is no journey update

2. If classifier explicitly targeted some resource types:
   - keep only matching projected resources

3. If no explicit targeted resources matched:
   - allow orchestrator-level implicit targeting

Currently only one implicit targeting rule exists:

- `human_help_request`
  - implicitly target `HUMAN_HANDOFF`

4. If neither explicit nor implicit targeting applies:
   - return the full projected allowed resources

## Resource Registry Interaction

The orchestrator relies on:

[resource-registry.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/resource-registry.service.ts)

Important current behaviors:

- `PROCESS_GUIDE`
  - global
- `HUMAN_HANDOFF`
  - global
- `MEDICAL_INVITATION_STATUS`
  - global query resource
- `QUESTIONNAIRE`
  - journey resource under `COLLECT_MEDICAL_INPUTS.active`
- `HOSPITAL_RECOMMENDATION`
  - journey resource under `RECOMMENDATION.active`
- `ONLINE_CONSULT_BOOKING`
  - journey resource under `ONLINE_CONSULT.active`

`normalizeSnapshotForResources()` still maps `pre` to `active` for resource lookup, which is intentional:

- `pre` means the stage has been entered conversationally
- but the resource list should already expose the next-stage resources

## Floor Logic

`chatbot_v2_floor` is read in:

[get-ai-policy-context.use-case.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts)

This previously had an ordering bug:

- message repository returns newest-first
- the floor reader reversed that list
- so it could read an older assistant `chatbotV2` snapshot instead of the newest one

That is now fixed.

The same ordering assumption also existed in:

[context-builder.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/context-builder.service.ts)

for:

- recent user page-context detection
- recent shortlist hospital detection

That ordering has also been corrected to prefer the newest messages first.

## What Is Still Not Covered

This update does not attempt to solve the progression-family `502` failures yet.

That investigation remains separate.

This update is focused on:

- making the composer resource context less ambiguous
- making `targetResourceTypes` available to the composer
- completing the basic `pre / active / post` journey transitions
- preventing floor restoration from using stale assistant metadata
