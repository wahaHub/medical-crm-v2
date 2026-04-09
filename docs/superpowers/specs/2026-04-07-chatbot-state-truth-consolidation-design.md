# Chatbot State Truth Consolidation Design

Date: 2026-04-07

## Goal

Remove redundant chatbot orchestration fields that have drifted away from business truth, and make the chatbot, patient session API, and Dify workflow derive state from real CRM data instead.

This design applies to:

- CRM backend: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2`
- China frontend: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys`
- Dify workflow: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config`

## Problem

The current system stores several chatbot-only state fields in `ai_chat_sessions` and then exposes or reuses them as if they were authoritative:

- `pendingOffer`
- `pendingQuestion`
- `lastNextAction`
- `lastResolvedIntent`
- `leadMaturity`
- `prequalificationReasonCodes`
- `selectedHospitalId`

This creates two truth systems:

1. CRM business truth
   - case
   - questionnaire response
   - hospital selections / CHC
   - conversation records
   - consult / handoff / package records
2. chatbot session cache
   - `statusSnapshot`
   - `/api/patient/me.chatbotOrchestrationState`

The live questionnaire bug proved the failure mode:

- case truth said questionnaire was submitted
- widget orchestration still said questionnaire pending
- chatbot kept showing `Open questionnaire`

That is exactly what this design removes.

## Target Principles

### Principle 1: business truth wins

If a state can be derived from CRM records, it must not be stored as an independent chatbot truth source.

### Principle 2: summary is not truth

`conversationSummary` is allowed as a chatbot-friendly summary cache, but it must never override case/questionnaire/hospital truth.

### Principle 3: patient API stays thin

`/api/patient/me` should return only:

- patient/session routing pointers
- real business state
- optional chat summary

It should not leak internal chatbot orchestration cache.

### Principle 4: Dify receives truth, not drift-prone cache

The Dify workflow should get:

- business-derived status
- recent messages
- active hospital context
- conversation summary

It should not receive redundant fields that can fall out of sync.

## Fields To Remove

These fields are removed from active use and from the final schema/contract in this change:

- `statusSnapshot.pendingOffer`
- `statusSnapshot.pendingQuestion`
- `statusSnapshot.lastNextAction`
- `statusSnapshot.lastResolvedIntent`
- `statusSnapshot.leadMaturity`
- `statusSnapshot.prequalificationReasonCodes`
- `statusSnapshot.selectedHospitalId`

These fields are also removed from patient-facing orchestration payloads:

- `/api/patient/me.chatbotOrchestrationState.sessionId`
- `/api/patient/me.chatbotOrchestrationState.selectedHospitalId`
- `/api/patient/me.chatbotOrchestrationState.selectedHospitalIds`
- `/api/patient/me.chatbotOrchestrationState.pendingOffer`
- `/api/patient/me.chatbotOrchestrationState.pendingQuestion`
- `/api/patient/me.chatbotOrchestrationState.lastNextAction`

After this change, `chatbotOrchestrationState` keeps only:

- `conversationSummary`

## Fields To Keep

These remain because they are strategy/session cache, not direct duplicates of business truth:

- `conditionStatus`
- `formStatus`
- `docUploadStatus`
- `recommendationStatus`
- `consultationStatus`
- `packageStatus`
- `handoffStatus`
- `riskLevel`
- `trustOrObjection`
- `engagementMode`
- `enteredDeepWorkflowAt`
- `conversationSummary`
- `lastPolicyDecisionAt`
- `lastUserMessageAt`
- `lastAssistantMessageAt`

Note:

- `formStatus`, `recommendationStatus`, `consultationStatus`, `packageStatus`, and `handoffStatus` are still weaker than pure CRM truth, but they are not being removed in this pass because doing so would force a much larger policy-engine rewrite.
- They remain allowed as strategy/cache fields, but must not override direct business truth checks.

## New Truth Sources

### Questionnaire truth

The system should determine questionnaire completion from:

- case `medicalFormStatus`
- questionnaire response existence/completion

Not from:

- `pendingQuestion`

### Selected hospital truth

The system should determine selected hospital state from:

- CHC / case-linked hospital selections

Not from:

- `selectedHospitalId` in chatbot session state

### Recent chatbot action truth

If the system needs to know what the assistant recently did, it should derive that from:

- recent assistant messages
- assistant message metadata
- conversation summary if needed

Not from:

- `lastNextAction`
- `lastResolvedIntent`

### Offer / pending next-step truth

If the system still needs to infer "there is a pending recommendation offer", it should derive that from:

- recent assistant messages
- recent shortlist metadata
- conversation summary

Not from:

- `pendingOffer`

## API Contract Changes

### `/api/patient/me`

Current:

- `widgetChatTarget`
- `formalConversationState`
- `chatbotOrchestrationState`
  - `sessionId`
  - `selectedHospitalId`
  - `selectedHospitalIds`
  - `conversationSummary`
  - `pendingOffer`
  - `pendingQuestion`
  - `lastNextAction`

Target:

- `widgetChatTarget`
- `formalConversationState`
- `chatbotOrchestrationState`
  - `conversationSummary`

Real business state continues to live in dedicated top-level fields already returned by patient session state:

- `caseId`
- `selectedHospitalId`
- `selectedHospitalIds`
- `medicalFormStatus`
- `medicalFormSubmittedAt`
- `medicalFormResponseId`

### `/api/v2/chatbot/chat` -> Dify inputs

Remove these inputs:

- `pendingOffer`
- `pendingQuestion`

Do not introduce replacements for:

- `lastNextAction`
- `leadMaturity`
- `prequalificationReasonCodes`

Keep:

- `currentStatus`
- `conversationSummary`
- attachments
- page context

But ensure backend block logic and policy truth checks no longer depend on removed cache fields.

### Internal AI policy context payload

Remove from `status_snapshot` or sibling payloads:

- `selected_hospital_id`
- `lead_maturity`
- `last_next_action`
- `last_resolved_intent`
- `pending_offer`
- `pending_question`

Context should instead rely on:

- `active_hospital_context`
- `recent_messages`
- `recent_timeline`
- `conversation_summary`
- remaining status snapshot cache

## Dify Workflow Changes

The workflow config must be updated so the Dify app no longer expects or uses redundant fields.

### Remove from start inputs usage

Stop using:

- `pendingQuestion`
- `pendingOffer`

### Remove from context prompt body

Do not provide:

- `pending_offer`
- `pending_question`
- `lead_maturity`
- `last_next_action`
- `last_resolved_intent`

### Remove from writeback payload shape

Do not send or parse:

- `prequalification_reason_codes`

If the workflow still needs "recent flow direction", it should rely on:

- recent assistant messages
- `conversation_summary`

not explicit pending cache.

## Backend Logic Changes

### `get-patient-session-state`

Update the patient session use case so:

- top-level patient truth remains unchanged
- `chatbotOrchestrationState` becomes a summary-only object
- no orchestration cache is projected outward except `conversationSummary`

### Chatbot block generation

Questionnaire block generation must stop reading:

- `pendingQuestion`

Instead:

- determine whether questionnaire is still incomplete from case/questionnaire truth
- resolve template from questionnaire template truth
- only show questionnaire CTA when business truth says it is still needed

### Widget starter flow

The starter flow must stop seeding or rebuilding questionnaire state from removed fields.

### AI policy context builder / use cases

The policy context builder should stop exposing removed fields.

Any recommendation acceptance or continuation logic that previously depended on:

- `pendingOffer`
- `selectedHospitalId`
- `lastNextAction`

must be rewritten to use:

- recent assistant messages
- recent shortlist metadata
- active hospital context
- selected hospital truth from CHC/case

### Writeback planner / executor

Writeback must stop patching removed fields.

In particular:

- no more patching `selectedHospitalId`
- no more patching `lastNextAction`
- no more patching `leadMaturity`
- no more patching `prequalificationReasonCodes`
- no more patching `pendingOffer`
- no more patching `pendingQuestion`

This turns writeback into:

- strategy status updates only
- timeline/followup/handoff side effects
- message metadata writes

## Storage and Migration

This is an "all in one" cleanup, but with a thin compatibility read layer during rollout.

### Migration goals

Remove independent storage for:

- `selected_hospital_id`
- `lead_maturity`
- `prequalification_reason_codes`

And stop reading/writing removed snapshot fields:

- `pendingOffer`
- `pendingQuestion`
- `lastNextAction`
- `lastResolvedIntent`

### Compatibility rule

During rollout, repository reads must tolerate older rows that still contain legacy fields, but:

- ignore them
- never map them back into active domain behavior
- never write them again

This keeps deployment safe if old rows or in-flight sessions still carry the old shape.

## Error Handling

If truth-derived fields are missing:

- questionnaire flow should fall back to default template resolution from template truth, not stale pending state
- selected hospital flow should fall back to CHC/case truth only
- recent-action inference should degrade gracefully to `conversationSummary` or recent messages, not synthetic cache defaults

The system should prefer "less clever but truthful" over "confident but stale".

## Testing

### Contract tests

Add or update tests to prove:

- `/api/patient/me` no longer returns removed orchestration fields
- Dify contract tests no longer require removed inputs/context fields

### Policy tests

Add or update tests for:

- questionnaire submitted -> chatbot does not think form is pending
- hospital selection truth comes from CHC/case, not chat session cache
- recommendation continuation works without `pendingOffer`

### Chat route tests

Add or update tests for:

- `REQUEST_DOC_UPLOAD` block generation using real questionnaire truth
- no questionnaire block after questionnaire submission
- no reliance on refreshed `pendingQuestion` state

### Integration regression

Run these flows:

1. onboarding -> widget starter -> eye problem -> questionnaire shown
2. questionnaire submit -> ask bot "did you receive it?" -> bot must not re-open questionnaire
3. hospital recommendation flow before hospital selection
4. hospital recommendation follow-up after hospital selection
5. consult flow still works

## Recommended Implementation Order

1. Update domain model and DTO contracts
2. Update patient session state API shape
3. Update truth derivation in chat routes and widget starter
4. Update AI policy context builder and writeback pipeline
5. Update Dify workflow DSL
6. Update frontend types/context/tests
7. Add migration + compatibility read layer
8. Run tests
9. Run live manual regression

## Success Criteria

This work is successful when:

- questionnaire submission truth comes only from case/questionnaire records
- hospital selection truth comes only from case/CHC
- `/api/patient/me` no longer leaks redundant orchestration cache
- Dify no longer receives removed redundant fields
- chat behavior remains stable without `pendingOffer`, `pendingQuestion`, `lastNextAction`, `lastResolvedIntent`, `leadMaturity`, `prequalificationReasonCodes`, and `selectedHospitalId`
- the "submitted but bot still says not received" bug is no longer possible through state divergence
