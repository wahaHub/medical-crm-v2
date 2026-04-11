# Chatbot V2 LLM Classifier Design

Date: 2026-04-11

## Goal

Replace the current rule-based `chatbot-v2` request classification with an LLM-backed structured classifier that fits the approved journey/resource architecture.

This design applies to:

- CRM backend: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2`
- Dify workflow: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config`

This design is a refinement of:

- `docs/superpowers/specs/2026-04-10-chat-journey-resource-architecture-design.md`

---

## Problem

The current `chatbot-v2` implementation uses a rule-based classifier in:

- `packages/application/src/services/chatbot-v2/request-classifier.service.ts`

That implementation relies on:

- keyword and pattern matching
- legacy resolved-intent bridges

This diverges from the approved architecture.

The approved architecture requires:

- CRM remains the orchestrator
- Dify is a constrained language and classification layer
- user-turn understanding should be LLM-assisted, but the output must be structured

The rule-based classifier is not acceptable because:

1. it does not handle multilingual natural language robustly
2. it does not match the approved design
3. it reintroduces brittle behavior at the earliest and most important decision point
4. it will fail on mixed, indirect, or context-dependent requests

---

## Design Principles

### Principle 1: Classification is separate from composition

The system must separate:

- understanding what the user means
- deciding what the system is allowed to do
- generating the final reply

So the flow becomes:

1. classifier
2. CRM orchestration
3. composer

### Principle 2: The classifier is structured, not freeform

The classifier does not generate user-facing text.

It only returns a bounded structured result.

### Principle 3: CRM still owns orchestration

The classifier may identify:

- the request class
- which allowed resources the user is referring to
- whether a FAQ or process-explanation turn should also include progression follow-up

The classifier may not:

- advance stages
- decide resource visibility
- choose disallowed resources
- override truth checks

### Principle 4: The classifier must be language-agnostic

The classifier must not depend on:

- English keyword lists
- Chinese keyword lists
- example-heavy language-specific prompting

Instead it should rely on:

- clear semantic descriptions of each enum
- recent messages
- conversation summary
- journey snapshot
- allowed resource hints

### Principle 5: Resources exposed to the classifier must be semantic hints, not backend blobs

The classifier should not receive full backend resource descriptors.

It should receive a lightweight, LLM-friendly glossary of currently allowed resource options.

---

## Target Architecture

The request-processing path becomes:

1. CRM reads current journey state and truth
2. CRM builds lightweight classifier inputs
3. CRM calls a dedicated Dify classifier workflow
4. classifier returns structured output
5. CRM conversation orchestrator decides allowed resources and journey updates
6. CRM calls the Dify composer workflow
7. CRM assembles the final assistant message

This keeps the responsibilities clean:

- classifier: understanding
- orchestrator: decision-making
- composer: expression

---

## Classifier Workflow

### Dedicated Dify app

Create a dedicated classifier workflow, separate from the composer workflow.

Suggested file:

- `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`

This workflow should be a standalone app or workflow whose only responsibility is turn classification.

It must not:

- write back message content
- produce final user-facing replies
- decide widgets or progression directly

---

## Classifier Input Contract

CRM will send the classifier these inputs:

### `recentMessages`

The most recent 6 messages in the chat context.

Rules:

- ordered chronologically
- includes role and content
- the last message is the current user turn

### `conversationSummary`

A summary of older history beyond the recent-message window.

Rules:

- may be empty
- used only to recover longer context

### `journeySnapshot`

The current CRM-owned journey state:

- `currentStage`
- `currentPhase`

### `allowedResourceHints`

A lightweight semantic description of which resources CRM is currently willing to consider.

Each item contains only:

- `resourceType`
- `description`

Example meaning:

- `PROCESS_GUIDE`: explains the consultation and treatment process
- `QUESTIONNAIRE`: lets the patient fill in a medical intake questionnaire
- `MEDICAL_INVITATION_STATUS`: lets the patient check the current medical invitation status

The classifier must treat this as the allowed resource universe for this turn.

It may not invent resources outside this list.

CRM should include in this list any resource that is relevant for the current turn, including:

- resources the user may actively open or use now
- resources the user may ask the current status of now

This means already-submitted progression resources may still appear in `allowedResourceHints` when the user can still ask about their current state.

---

## Classifier Output Contract

The classifier returns only:

- `requestClass`
- `targetResourceTypes`
- `includeProgressionFollowUp`

### `requestClass`

Must be exactly one of:

- `faq`
- `process_explanation`
- `progression_request`
- `resource_request`
- `resource_status_question`
- `human_help_request`

### `targetResourceTypes`

An array of resource types selected from `allowedResourceHints`.

Rules:

- may be empty
- must only contain resource types provided by CRM
- for `faq`, it must be `[]`
- must not contain duplicates

### `includeProgressionFollowUp`

A boolean flag.

Rules:

- may only be `true` when `requestClass` is:
  - `faq`
  - `process_explanation`
- in all other request classes it must be `false`
- this is only a suggestion to CRM
- CRM decides whether to honor it

---

## Request Class Semantics

These descriptions should be embedded in the classifier prompt.

### `faq`

The user is asking for general information, clarification, or category-based FAQ content.

This does not request a concrete resource and does not directly ask the system to move the case forward.

Rules:

- `targetResourceTypes = []`
- `includeProgressionFollowUp` may be `true` or `false`

### `process_explanation`

The user is asking how the medical journey works, why the current step exists, what the process is, or what this service does operationally.

This is process-oriented explanation, not generic FAQ and not direct execution of a concrete resource.

Rules:

- `targetResourceTypes` may include `PROCESS_GUIDE`
- `includeProgressionFollowUp` may be `true` or `false`

### `progression_request`

The user is asking to continue, move forward, start the next step, or let the system guide the next action.

The user is not explicitly requesting a specific resource.

Rules:

- `targetResourceTypes` may be empty
- `includeProgressionFollowUp = false`

### `resource_request`

The user explicitly wants to open, use, submit, review, or act on a concrete allowed resource.

Rules:

- if the user explicitly names or clearly refers to a specific resource, prefer this class over `progression_request`
- use this class when the user is trying to open, use, submit, review, or otherwise act on the resource itself
- `targetResourceTypes` should include the referenced allowed resources
- `includeProgressionFollowUp = false`

### `resource_status_question`

The user is asking for the current state or progress of a concrete resource or structured process object represented as a resource.

Rules:

- use this class when the user primarily wants to know the current state, progress, or receipt status of the resource rather than act on it
- `targetResourceTypes` should include the referenced allowed resources
- `includeProgressionFollowUp = false`

### `human_help_request`

The user explicitly wants a human advisor, staff member, or human takeover.

Rules:

- `targetResourceTypes` should include `HUMAN_HANDOFF` when available
- if `HUMAN_HANDOFF` is not present in `allowedResourceHints`, the classifier should still return `requestClass = human_help_request` with `targetResourceTypes = []`
- `includeProgressionFollowUp = false`

---

## Classification Rules

### Rule 1: Single primary class

Each user turn must produce exactly one `requestClass`.

No multi-intent array is introduced.

### Rule 2: Explicit resource wins over progression

If the user explicitly refers to a concrete resource, classify as:

- `resource_request`

not:

- `progression_request`

This applies even if the message also contains “continue” or “next step” semantics.

### Rule 3: FAQ never targets resources

If `requestClass = faq`, then:

- `targetResourceTypes` must be `[]`

### Rule 4: Process explanation may target `PROCESS_GUIDE`

If the user is asking about process or why a step exists, classification may return:

- `requestClass = process_explanation`
- `targetResourceTypes = ["PROCESS_GUIDE"]`

when `PROCESS_GUIDE` is present in the allowed resource hints.

### Rule 5: Only FAQ and process explanation may ask for progression follow-up

`includeProgressionFollowUp` exists so the system can:

1. answer the informational question first
2. then optionally continue with a light progression nudge

This applies only to:

- `faq`
- `process_explanation`

It must not be used for:

- `resource_request`
- `resource_status_question`
- `progression_request`
- `human_help_request`

---

## CRM Orchestrator Behavior

After receiving classifier output, CRM orchestrator decides:

- `responseIntent`
- `allowedResources`
- `journeyUpdate`
- whether to honor `includeProgressionFollowUp`

This is important:

- the classifier may suggest progression follow-up
- but CRM decides whether the current journey/truth/resource state actually allows it

So the classifier remains advisory, not authoritative.

---

## Composer Behavior

The composer workflow remains a separate Dify workflow.

It receives:

- the structured classifier result
- the CRM orchestration result
- current journey context
- allowed resources
- conversation context

It is responsible only for user-facing language.

If CRM accepts `includeProgressionFollowUp = true`, the composer should structure the response in two parts:

1. answer the FAQ or process explanation
2. add a light progression follow-up

The composer must not:

- choose new resources
- change the request class
- advance the journey by itself

---

## Final Assistant Message Shape

CRM remains responsible for assembling the final assistant message returned to the frontend.

Top-level fields should carry the user-facing response contract, including:

- `text`
- `journeySnapshot`
- `resources`

`metadata` should stay minimal.

For this classifier-related flow, metadata should contain only what the system needs for restore, inspection, or downstream orchestration support:

- `chatbotV2`
- `classifierResult`

Do not introduce unrelated metadata such as:

- composer version tags
- resource render hints
- extra explanation fields that are not part of the approved contract

---

## Changes Required

### CRM

Replace the current rule-based classifier path.

Expected changes:

- remove keyword-pattern-based classification from:
  - `packages/application/src/services/chatbot-v2/request-classifier.service.ts`
- introduce an LLM-backed classifier adapter/service
- update `conversation-orchestrator.service.ts` to consume classifier output instead of local keyword classification
- update route-level orchestration so classifier is called before composer

### Dify

Add a dedicated classifier workflow:

- `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`

Keep composer separate:

- `dify-config/medora-ai-chatbot-v2.dsl.yml`

### Tests

Add or update tests to cover:

- multilingual intent classification
- FAQ always returning empty target resources
- explicit-resource messages preferring `resource_request`
- progression requests with empty target resources
- process-explanation turns optionally targeting `PROCESS_GUIDE`
- `includeProgressionFollowUp` only being valid for:
  - `faq`
  - `process_explanation`

---

## Non-Goals

This design does not attempt to:

- redesign the resource registry itself
- redesign the journey state model
- migrate every frontend resource renderer in this step
- add confidence scores
- add explanation/reason fields to the classifier output
- support arbitrary multi-intent output

---

## Summary

The current rule-based classifier is not consistent with the approved architecture and must be removed.

The replacement is:

- a dedicated Dify classifier workflow
- language-agnostic structured classification
- CRM-owned orchestration
- a separate composer workflow

The classifier output stays intentionally small:

- `requestClass`
- `targetResourceTypes`
- `includeProgressionFollowUp`

This preserves the architecture we want:

- CRM decides
- LLM understands
- composer speaks
