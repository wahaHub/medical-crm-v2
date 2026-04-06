# Language-Agnostic Chatbot Semantics Design

**Date**: 2026-04-06

## Goal

Replace the current English-biased backend rule interpretation layer with a language-agnostic semantic contract driven by the existing `extraction_llm`.

The target architecture is:

- no new LLM nodes
- `extraction_llm` becomes the primary semantic source
- backend consumes strict canonical enums instead of reinterpreting natural language
- backend remains responsible for safety, eligibility, workflow state gating, and final action materialization

This design must work for Chinese, English, and future languages without requiring language-specific backend regex growth.

## Problem Statement

The current system has two competing semantic brains:

1. Dify extraction produces weak intent-like hints
2. backend resolvers reinterpret the user message again using mostly English heuristics

This creates several problems:

- semantic ownership is split across Dify and backend
- backend intent resolution is English-biased
- equivalent Chinese queries fall back to `GENERAL_CONSULT` and `LIGHT_DISCOVERY`
- rich blocks do not appear because deeper actions are never selected
- adding new languages would require more backend phrase rules instead of improving the semantic model

Observed examples include:

- `我想知道咨询流程`
  - should progress to consult-process explanation
  - currently falls back to general FAQ
- `我得了颈椎病，我想找这个方向的医生`
  - should progress to docs or recommendation flow
  - currently falls back to general FAQ

## Product Decision

We will adopt an extraction-led semantic architecture.

### Required decisions

- use the existing `extraction_llm`
- do not add new LLM nodes for this change
- define a strict canonical semantic contract with fixed enums
- remove old weak semantic fields from the main path
- remove old backend intent/engagement resolver logic from the main path
- let backend map canonical semantics to final actions and blocks using deterministic state-aware logic

## Non-Goals

This project does not:

- add new Dify nodes
- maintain a long-term bilingual or multilingual regex catalog in backend
- preserve `possibleIntent`, `possibleRisk`, `affirmative`, or `negative` as main-path decision inputs
- let frontend decide workflow progression
- collapse semantic interpretation and final business action into a single free-form LLM output

## Final Architecture

The final path becomes:

`user message`
-> `extraction_llm`
-> strict canonical semantic contract
-> backend schema validation
-> backend semantic mapper
-> backend state/safety gating
-> final action
-> rich blocks / writeback / composer

The backend no longer performs primary natural-language interpretation of the user message.

## Canonical Semantic Contract

The extraction output becomes a strict typed object with these fields:

- `resolvedIntent`
- `engagementSignal`
- `progressionSignal`
- `recommendationSignal`
- `mentionsCondition`
- `mentionsDoctorOrHospitalNeed`

All fields are required in the canonical contract.

### `resolvedIntent`

Allowed values:

- `GENERAL_INFO`
- `ASK_MEDICAL_TRAVEL_PROCESS`
- `ASK_CONSULT_PROCESS`
- `ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION`
- `ASK_FOR_HOSPITAL_RECOMMENDATION`
- `REQUEST_DOC_UPLOAD`
- `ACCEPT_DOC_UPLOAD`
- `ACCEPT_ONLINE_CONSULT_INVITE`
- `REQUEST_HUMAN_HANDOFF`
- `ASK_PACKAGE_INFO`
- `SMALL_TALK_OR_GREETING`
- `UNKNOWN`

### `engagementSignal`

Allowed values:

- `LIGHT_DISCOVERY`
- `QUALIFIED_EXPLORATION`
- `DEEP_WORKFLOW`

### `progressionSignal`

Allowed values:

- `NONE`
- `CURIOUS`
- `OPEN_TO_NEXT_STEP`
- `READY_TO_PROCEED`
- `EXPLICITLY_COMMITTING`

### `recommendationSignal`

Allowed values:

- `NONE`
- `SEEKING_DIRECTION`
- `SEEKING_RECOMMENDATION`
- `READY_FOR_RECOMMENDATION`

### Boolean helpers

- `mentionsCondition: boolean`
- `mentionsDoctorOrHospitalNeed: boolean`

## Extraction Output Rules

The extraction node must behave like a typed classifier, not like a conversational model.

### Required constraints

- output must be a fixed JSON object
- all canonical fields must be present
- enum fields may only use the allowed values above
- no free-form intent names are allowed
- backend main-path logic must not depend on non-canonical free-text explanation fields

### Prompting requirements

The extraction prompt must:

- explicitly define all allowed enum values
- state that semantically equivalent utterances across languages must map to the same enums
- include multilingual examples for the same semantic class
- separate semantic classification from response composition

### Old fields removed from the main path

These fields leave the primary semantic path:

- `possibleIntent`
- `possibleRisk`
- `affirmative`
- `negative`

If they remain temporarily for telemetry or debugging, backend action selection must not depend on them.

## Backend Responsibility Split

### Extraction owns

- semantic interpretation of the user message
- intent classification
- engagement-depth classification
- progression/readiness classification
- recommendation-seeking classification

### Backend owns

- schema validation
- deterministic fallback on invalid extraction output
- safety overrides
- session/auth checks
- workflow state gating
- recommendation readiness gating
- final action selection
- rich block eligibility
- writeback and side effects

This is the core trust-boundary change:

- old model: `LLM gives hints, backend decides meaning`
- new model: `LLM decides canonical meaning, backend decides whether that meaning is actionable now`

## Safety Boundary

This design changes workflow semantics, not the safety classifier.

Safety remains backend-owned through the existing dedicated safety path:

- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/risk-resolver.service.ts`

Rules:

- safety does not come from the canonical semantic contract
- safety does not depend on `possibleRisk` in the main semantic path
- safety may still override any candidate action with the existing safety outcome
- semantic interpretation and safety classification remain separate concerns

This avoids smuggling old workflow semantics back into the system under a safety label while preserving the existing safety override model.

## Deterministic Fallback

If extraction output is missing fields, uses invalid enum values, or fails schema parsing, backend must fall back to a conservative canonical default:

```json
{
  "resolvedIntent": "UNKNOWN",
  "engagementSignal": "LIGHT_DISCOVERY",
  "progressionSignal": "NONE",
  "recommendationSignal": "NONE",
  "mentionsCondition": false,
  "mentionsDoctorOrHospitalNeed": false
}
```

This fallback is deterministic and must not attempt a secondary regex-based natural-language recovery.

## Final Action Mapping

Backend consumes canonical semantics and session state to produce final actions.

### Mapping principles

1. semantic contract selects the natural candidate action
2. backend state and safety determine whether that action is currently allowed
3. rich blocks are triggered by final action, not by frontend heuristics or language surface forms

### Core mappings

#### `GENERAL_INFO`

- default final action: `ANSWER_FAQ`
- default blocks: none

#### `ASK_MEDICAL_TRAVEL_PROCESS`

- default final action: `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- block: `PROCESS_MODAL_TRIGGER`

#### `ASK_CONSULT_PROCESS`

- default final action: `EXPLAIN_CONSULT_PROCESS`
- if progression indicates readiness and consultation is not already completed:
  - final action: `INVITE_ONLINE_CONSULT`
  - block: `ONLINE_CONSULT_BOOKING_CARD`

#### `ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION`

This covers cases like:

- disease-specific direction requests
- specialty/doctor-direction requests
- early hospital-direction requests

Expected behavior:

- if recommendation readiness is insufficient:
  - final action: docs-upload path
  - likely `REQUEST_DOC_UPLOAD`
  - block: `QUESTIONNAIRE_MODAL_TRIGGER`
- if recommendation readiness is sufficient:
  - final action: `SHOW_HOSPITAL_RECOMMENDATIONS`
  - block: `HOSPITAL_RECOMMENDATION_CARDS`

This intent must not collapse to generic FAQ by default.

#### `ASK_FOR_HOSPITAL_RECOMMENDATION`

- if recommendation readiness is insufficient:
  - final action: `REQUEST_DOC_UPLOAD`
  - block: `QUESTIONNAIRE_MODAL_TRIGGER`
- if recommendation readiness is sufficient:
  - final action: `SHOW_HOSPITAL_RECOMMENDATIONS`
  - block: `HOSPITAL_RECOMMENDATION_CARDS`

#### `REQUEST_DOC_UPLOAD`

This means the user is asking about the docs/upload step itself.

Examples:

- `你们需要我提供什么资料？`
- `是不是要先发病历？`
- `What documents do you need from me?`

Expected behavior:

- final action: docs-upload path
- block: `QUESTIONNAIRE_MODAL_TRIGGER`

#### `ACCEPT_DOC_UPLOAD`

This means the user is explicitly agreeing to start the docs/upload step.

Examples:

- `可以，我把病历发给你们`
- `我现在就上传报告`
- `Okay, I can send the records now`

Expected behavior:

- if docs are still needed:
  - final action: docs-upload path
  - block: `QUESTIONNAIRE_MODAL_TRIGGER`
- if docs are already complete:
  - do not redundantly reissue the same block
  - progress using backend workflow state

#### `ACCEPT_ONLINE_CONSULT_INVITE`

- if consult booking is still eligible:
  - final action: `INVITE_ONLINE_CONSULT`
  - block: `ONLINE_CONSULT_BOOKING_CARD`

#### `REQUEST_HUMAN_HANDOFF`

- final action: `HUMAN_HANDOFF`
- no special block required
- must still trigger the existing human-handoff side effects

#### `ASK_PACKAGE_INFO`

- map to the existing package-info action only if that product behavior is still supported
- otherwise do not introduce speculative package behavior

#### `SMALL_TALK_OR_GREETING`

- default final action: `ANSWER_FAQ`
- default blocks: none

#### `UNKNOWN`

- final action: `ANSWER_FAQ`
- default blocks: none

## Rich Block Triggering

Rich blocks must be derived from final action rather than from frontend timing or phrase heuristics.

Canonical examples:

- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
  - `PROCESS_MODAL_TRIGGER`
- `REQUEST_DOC_UPLOAD`
  - `QUESTIONNAIRE_MODAL_TRIGGER`
- `SHOW_HOSPITAL_RECOMMENDATIONS`
  - `HOSPITAL_RECOMMENDATION_CARDS`
- `INVITE_ONLINE_CONSULT`
  - `ONLINE_CONSULT_BOOKING_CARD`

This preserves the current backend-authoritative rendering model in `china`.

## What Will Be Removed

### Backend rule interpretation removed from the main path

The following services stop being the primary semantic source:

- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/intent-resolver.service.ts`
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/engagement-mode-resolver.service.ts`

Target end state:

- no main-path invocation from policy decision flow
- no future language expansion through phrase rule accretion
- no semantic ownership split between extraction and backend regex interpretation

### Short-term rollout note

There is no in-app compatibility mode for the old semantic resolvers.

If any comparison is needed during rollout, it must happen offline in one-off verification scripts or test fixtures only. It must not run in production request handling, application wiring, or live decision flow.

Target cleanup requirement:

- once the canonical semantic path is live, remove the old resolver files and their dedicated tests from the shipped codebase

## Implementation Strategy

### Step 1: Define and validate the canonical contract

- add the new extraction output schema in backend
- define contract tests around required fields and enum values
- freeze the contract before changing downstream mapping

### Step 2: Upgrade the existing extraction node

- replace weak hint fields with canonical semantic fields
- add multilingual examples to the extraction prompt
- keep the same node, not a new one

### Step 3: Rewire backend policy decision flow

Replace the current semantic path in:

- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`

New flow:

- parse extraction output
- apply deterministic fallback if needed
- map canonical semantics to candidate actions
- apply safety/state gating
- produce final action and blocks

### Step 4: Rewrite planner inputs

Update planner/mapping logic so it consumes canonical semantic enums instead of old resolver outputs.

### Step 5: Remove old resolver main-path usage

- delete the old resolver invocations
- then delete or fully disconnect the old services and tests once no longer referenced

### Step 6: Rewrite regression coverage

Tests must shift from phrase-matching assertions to semantic-contract and action-mapping assertions.

## Testing Strategy

### 1. Extraction contract tests

Validate that semantically equivalent phrases across languages map to the same enums.

Required examples include:

- Chinese, English, and future multilingual variants for:
  - service overview
  - consult process
  - doctor/hospital direction
  - explicit hospital recommendation ask
  - docs ask
  - docs acceptance
  - human handoff

### 2. Backend mapping tests

Validate that canonical semantics map to the correct final actions and blocks under varying state conditions.

Must cover:

- consult-process explanation
- docs gating
- recommendation readiness gating
- online consult invitation gating
- human handoff side effects
- deterministic fallback for invalid extraction payloads

### 3. End-to-end live regression

Continue to run real `/api/v2/chatbot/chat` regression flows against local Dify/CRM.

The fixed regression set must include:

- `你好 我想来了解下你们的服务内容`
- `我想知道咨询流程`
- `我得了颈椎病，我想找颈椎病方向的医生`
- English equivalents
- future language examples as they are added

Expected end-state behavior:

- language changes do not change semantic classification
- semantically equivalent messages reach the same final action
- rich blocks appear based on state and action, not on phrase-language quirks

## Observability

Backend should log enough structured information to debug semantic drift:

- raw extraction payload
- schema parse success/failure
- fallback activation
- final semantic contract after fallback
- final action
- key gating reasons

This must support answering:

- did extraction choose the wrong enum?
- did backend reject a valid semantic due to state?
- did fallback fire because the output schema drifted?

## Why This Architecture Is Simpler

The current system has two semantic interpreters:

- extraction hints
- backend rules

The target system has one semantic interpreter and one business gate:

- extraction defines meaning
- backend defines whether the meaning is actionable now

That reduces long-term complexity and removes the need to keep teaching backend phrase rules for every new language.

## Success Criteria

This design is successful when:

- equivalent Chinese and English queries produce the same canonical semantics
- backend no longer depends on English phrase rules for primary intent/engagement selection
- doctor/hospital-direction requests no longer fall back to generic FAQ by default
- consult-process questions no longer fall back to generic FAQ by default
- docs, recommendation, consult, and handoff flows remain backend-authoritative and state-aware
- future language support is added by improving extraction examples and tests, not by adding backend regex catalogs
