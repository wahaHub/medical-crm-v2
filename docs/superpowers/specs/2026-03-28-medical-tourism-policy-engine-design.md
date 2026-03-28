# Medical Tourism AI Chatbot Policy Engine Design

**Date:** 2026-03-28  
**Status:** Draft  
**Authors:** User + GPT discussion, revised against current `medical-crm-v2` codebase by Codex

---

## 1. Purpose

This document defines the next-generation architecture for the Medora medical tourism AI chatbot.

It replaces the earlier design assumption that Dify is the main decision-maker. Based on the current codebase and the clarified product direction, the chatbot should now be designed as:

- a **backend-authoritative policy engine**
- with **Dify as a medium-weight orchestration and response layer**
- and **CRM DB as the truth source** for status, memory, handoff, follow-up, and audit

This design is intentionally aligned to the current `medical-crm-v2` repo reality:

- chatbot backend/session groundwork already exists
- Dify is already integrated as an external service
- FAQ/package sync and AI chat persistence already exist in initial form
- the product goal has expanded from "AI FAQ + conversion entry" to a more complete **policy-driven medical tourism advisor**

---

## 2. Product Definition

The chatbot is not a simple FAQ bot.

It should behave as a:

- safe
- grounded
- history-aware
- status-aware
- conversion-capable
- recommendation-capable
- handoff-capable

AI advisor for a medical tourism CRM.

Its job is to:

- answer grounded questions about process, services, hospitals, online consultation, and packages
- maintain business context across turns
- choose the best next step instead of only answering the current utterance
- recommend hospitals using reviewed database facts
- trigger uploads, forms, consults, packages, human support, and follow-up when appropriate
- stop or downgrade when safety or policy requires it

---

## 3. Goals and Non-Goals

### 3.1 Goals

- Ground FAQ, SOP, why-us, package, and process explanations in approved sources
- Make each turn aware of both chat history and structured CRM status
- Persist long-term memory in CRM, not in transient workflow variables
- Use backend policy logic to determine intent, risk, next action, recommendation eligibility, handoff, and writeback
- Keep Dify valuable for orchestration, retrieval, tools, and natural language generation
- Support short, policy-controlled hospital shortlist recommendations
- Support human handoff with structured briefing
- Support follow-up trigger creation for incomplete but valuable user journeys
- Support evaluation and regression at the decision, tool, and writeback layers

### 3.2 Non-Goals

- Do not make Dify the authority for business truth
- Do not rely on raw chat history as the only memory system
- Do not allow free-form hospital claims, pricing claims, or diagnostic advice
- Do not merge this AI system directly into the existing human `conversations/messages` inbox model
- Do not build a separate standalone policy microservice in v1
- Do not make runtime markdown files the source of truth for memory

---

## 4. Architecture Summary

### 4.1 Core Positioning

**Backend decides. Dify speaks.**

Recommended split:

- `CRM backend` is the authoritative policy engine
- `Dify` is the orchestration and language layer
- `CRM DB` is the truth source for status, memory, audit, handoff, and follow-up

### 4.2 Responsibility Split

#### Backend authoritative responsibilities

- load structured truth
- resolve authoritative `resolved_intent`
- resolve authoritative `risk_level`
- generate and score candidate actions
- choose authoritative `next_action`
- enforce safety overrides
- determine recommendation eligibility
- generate short hospital shortlist and reason codes
- determine handoff eligibility
- generate writeback plan
- generate follow-up triggers

#### Dify responsibilities

- receive user message
- organize workflow nodes
- perform lightweight extraction
- call retrieval tools
- call backend policy tools
- call allowed downstream tools
- generate natural language response
- package grounded response + cards for frontend consumption

#### CRM DB responsibilities

- session truth
- profile memory
- summary memory
- timeline events
- recommendation logs
- handoff records
- follow-up triggers
- audit state

### 4.3 High-Level Runtime Flow

```text
User Message
  -> Dify workflow
  -> lightweight extraction
  -> load CRM context
  -> backend policy decision
  -> allowed tool calls
  -> Dify response generation
  -> backend writeback
  -> final structured response
```

---

## 5. Why Backend Is the Main Brain

The following objects are domain policy, not mere chat-generation artifacts:

- `intent`
- `risk`
- `nextAction`
- `status`
- `pending_offer`
- `writeback`
- `handoff`
- `recommendation policy`

These objects have the following properties:

- they affect business truth
- they must be auditable
- they must be consistent across turns
- they must obey safety overrides
- they must be reusable by human operators and follow-up systems

Therefore they should not live primarily inside Dify prompt logic or Dify workflow variables.

Instead:

- Dify may propose or extract candidate signals
- backend must make final decisions

---

## 6. Dify Layer Design

### 6.1 Dify Positioning

Dify should remain a **medium orchestration layer**, not a thin pass-through and not the final business authority.

Recommended Dify responsibilities in v1:

- conversation entrypoint
- workflow sequencing
- lightweight signal extraction
- FAQ / RAG retrieval
- tool orchestration
- natural-language answer generation

Not recommended for Dify in v1:

- final risk authority
- final next action authority
- final recommendation eligibility
- direct CRM truth writes
- fully embedded action scoring logic

### 6.2 Recommended Dify Workflow

```text
User Input
  -> Lightweight Extraction
  -> Get Conversation Context Tool
  -> Decide Next Action Tool
  -> Conditional Tool Calls
  -> Response Composer
  -> Apply Writeback Plan Tool
  -> Final Answer
```

### 6.3 Lightweight Extraction Rules

Extraction at Dify level is non-authoritative.

Recommended outputs:

- candidate condition / goal
- candidate destination
- candidate budget
- candidate preferred language
- candidate objection
- affirmative / rejection / ambiguity signals
- FAQ retrieval query hints
- candidate topic hints

These should be passed to backend as candidate signals, not final truth.

### 6.4 Response Generation Rules

Dify response generation must be constrained by backend contract:

- `response_mode`
- `risk_level`
- `next_action`
- `allowed_tools`
- `shortlist`
- `handoff_required`

Dify may:

- rephrase grounded content naturally
- explain shortlist reasons in user-friendly terms
- package the next step into UX-friendly text

Dify may not:

- invent unsupported claims
- override backend decision
- expand a shortlist beyond backend-approved hospitals
- continue sales progression in blocked safety contexts

---

## 7. Backend Policy Engine Design

### 7.1 Policy Engine Form

In v1, the policy engine should be implemented as an internal module inside `medical-crm-v2`, not as a separate service.

Recommended reasons:

- simpler deployment
- easier reuse of existing repositories and use cases
- easier access to CRM truth tables
- faster iteration while boundaries are still stabilizing

### 7.2 Internal Modules

Recommended module decomposition:

- `ContextBuilder`
- `SignalResolver`
- `IntentResolver`
- `RiskResolver`
- `ActionPlanner`
- `RecommendationPolicy`
- `HandoffPolicy`
- `WritebackPlanner`

### 7.3 Per-Turn Processing Pipeline

Recommended backend pipeline:

1. Load truth
2. Merge candidate signals
3. Resolve intent
4. Resolve risk
5. Generate candidate actions
6. Score and select actions
7. Attach downstream constraints
8. Return authoritative decision contract

### 7.4 Authoritative Decision Contract

Recommended backend output to Dify:

```json
{
  "resolved_intent": "ACCEPT_HOSPITAL_RECOMMENDATION",
  "risk_level": "LOW",
  "next_action": "SHOW_HOSPITAL_RECOMMENDATIONS",
  "secondary_action": "REQUEST_DOC_UPLOAD",
  "response_mode": "grounded_plus_guidance",
  "allowed_tools": [
    "search_faq",
    "search_hospitals",
    "get_hospital_details"
  ],
  "reason_codes": [
    "pending_offer_accepted",
    "condition_known",
    "recommendation_eligible"
  ],
  "shortlist": [
    {
      "hospital_id": "hospital-1",
      "match_type": "matched",
      "reason_codes": [
        "condition_fit",
        "language_supported"
      ]
    }
  ],
  "handoff_required": false,
  "writeback_plan": {
    "status_updates": {
      "recommendation_status": "preliminary_shown"
    },
    "timeline_events": [
      "HOSPITALS_RECOMMENDED"
    ],
    "memory_patch": {},
    "followup_trigger": null
  }
}
```

### 7.5 Design Principle

The first version should be:

- deterministic where possible
- model-assisted where useful
- auditable throughout

It should not be a hidden LLM planner with opaque business behavior.

---

## 8. Intent, Risk, and Next Action Model

### 8.1 Intent Principles

Intent resolution must be history-aware, not single-turn only.

Resolution inputs:

- current user message
- recent messages
- rolling summary
- pending offer
- pending question
- session status

Short responses like:

- "好啊"
- "可以"
- "行"
- "先不用"

must be interpreted against pending context first.

### 8.2 Intent Model

Recommended intent families:

- Discovery / qualification
- FAQ / education
- Recommendation
- Conversion
- Objection / hesitation
- Safety
- Conversation control

Representative examples:

- `DISCLOSE_CONDITION_OR_GOAL`
- `ASK_PROCESS_FAQ`
- `REQUEST_HOSPITAL_RECOMMENDATION`
- `ACCEPT_DOC_UPLOAD`
- `PRICE_CONCERN`
- `CRISIS_SIGNAL`
- `CHANGE_TOPIC`

### 8.3 Risk Model

Recommended risk levels:

- `LOW`
- `SENSITIVE`
- `HIGH_RISK`
- `CRISIS`

### 8.4 Risk Override Rules

- risk overrides next action
- crisis blocks conversion and marketing
- high-risk blocks clinical overreach and pushes professional evaluation or handoff
- sensitive allows guidance, but under stricter grounded constraints

### 8.5 Next Action Model

Recommended next action set:

- `ANSWER_FAQ`
- `ASK_CLARIFYING_INFO`
- `REQUEST_FORM`
- `REQUEST_DOC_UPLOAD`
- `SHOW_HOSPITAL_RECOMMENDATIONS`
- `REFINE_RECOMMENDATIONS`
- `EXPLAIN_PROCESS`
- `EXPLAIN_WHY_US`
- `PROMOTE_ONLINE_CONSULT`
- `PROMOTE_PACKAGE`
- `HANDLE_OBJECTION`
- `HANDOFF_TO_HUMAN`
- `SAFETY_ESCALATION`
- `FOLLOW_UP_LATER`

### 8.6 Action Selection Principle

Only one primary next action should be selected each turn.

At most one secondary assistive action may be attached.

---

## 9. Status Model

### 9.1 Business Status

Recommended business status fields:

- `condition_status`
- `form_status`
- `doc_upload_status`
- `recommendation_status`
- `consultation_status`
- `package_status`
- `handoff_status`
- `lead_maturity`
- `risk_level`
- `trust_or_objection`

### 9.2 Conversation Control Status

Recommended conversation-control fields:

- `pending_offer_type`
- `pending_offer_payload`
- `pending_question_type`
- `pending_question_payload`
- `last_next_action`
- `last_resolved_intent`

### 9.3 Form Field-Level State

Do not store form state as only completed or not completed.

Recommended:

```json
{
  "name": true,
  "contact": true,
  "condition_or_goal": true,
  "destination_preference": false,
  "preferred_language": true,
  "budget_band": false,
  "timeline": false,
  "existing_reports": true
}
```

This allows the system to request the smallest valuable increment instead of restarting a whole intake flow.

---

## 10. Recommendation Policy

### 10.1 Recommendation Ownership

Hospital recommendation should be backend-authoritative.

Backend decides:

- whether recommendation is allowed now
- whether user information is sufficient
- whether result should be `matched`, `explore`, or blocked
- which hospitals appear in the shortlist
- why they are included

Dify only explains and presents the shortlist.

### 10.2 Shortlist Style

The user explicitly chose:

- **pure-rule shortlist**
- shortlist can be very short
- even one hospital is acceptable

Recommended v1 output:

- `1-3` hospitals max
- `match_type = matched | explore`
- short `reason_codes`

### 10.3 Recommendation Contract

Recommended object:

```json
{
  "eligible": true,
  "mode": "matched",
  "shortlist": [
    {
      "hospital_id": "hospital-1",
      "match_type": "matched",
      "reason_codes": [
        "condition_fit",
        "language_supported"
      ]
    }
  ],
  "missing_requirements": []
}
```

### 10.4 Recommendation Guardrails

The system may not:

- invent new hospitals
- invent outcome claims
- invent medical capability
- rank hospitals based on pure generation
- present precision when inputs are too incomplete

---

## 11. Tool and MCP Contract Design

### 11.1 Tool Design Principles

- business-critical claims must come from tools
- write operations must go through backend authority
- decision and execution should be separated
- read and write concerns should not be mixed arbitrarily
- tool outputs must be small and predictable

### 11.2 Recommended Tool Groups

#### Context / policy tools

- `get_conversation_context`
- `decide_next_action`
- `apply_writeback_plan`

#### Retrieval / factual tools

- `search_faq`
- `search_hospitals`
- `get_hospital_details`
- `list_packages`
- `get_package_details`

#### Workflow / escalation tools

- `create_handoff`
- `notify_human_agent`
- `create_followup_trigger`
- `create_or_update_lead`
- `record_package_interest`

### 11.3 Recommended Core Tool Contracts

#### `get_conversation_context`

Returns:

- profile
- status
- summary
- pending offer
- pending question
- lead maturity
- risk state

#### `decide_next_action`

Input:

- session id
- current message
- history
- summary
- status
- pending context
- candidate signals

Output:

- resolved intent
- risk
- next action
- allowed tools
- shortlist
- handoff requirement
- writeback plan

#### `apply_writeback_plan`

Executes:

- status updates
- profile patch
- summary refresh
- timeline events
- pending offer updates
- follow-up trigger creation
- handoff persistence

### 11.4 Explicit Anti-Patterns

The spec should explicitly reject:

- tools that both read truth and mutate unrelated truth in one opaque call
- Dify direct writes into CRM truth tables
- recommendation tools deciding eligibility on their own
- handoff tools deciding necessity on their own

---

## 12. Memory, Summary, Timeline, and Writeback

### 12.1 Memory Must Live in CRM DB

Long-term runtime memory should not live primarily in markdown files.

Recommended truth source:

- CRM DB

Markdown may still be useful for:

- design docs
- debugging artifacts
- review material
- curated prompt-support assets

But not for runtime memory truth.

### 12.2 Memory Layers

Recommended layers:

#### Structured profile memory

Long-term user facts and preferences

#### Session status memory

Current funnel and dialogue-control state

#### Rolling summary

Short AI/human-readable summary for fast recovery

#### Timeline events

Short, human-readable milestones

### 12.3 Writeback Principles

- write structured fields first
- distinguish `confirmed`, `user_stated`, and `inferred`
- keep confidence and source where inference exists
- do not persist speculative medical claims as hard truth
- do not overwrite higher-confidence or human-confirmed information blindly
- do not turn timeline into a copy of chat history

### 12.4 Writeback Cadence

Recommended cadence:

#### Every turn

- pending offer/question refresh
- last intent / last action
- message-level metadata

#### Conditional updates

- profile patch
- lead stage updates
- objection updates
- summary refresh

#### Event-driven updates

- timeline event
- recommendation log
- handoff record
- follow-up trigger

### 12.5 Summary Rules

Rolling summary should remain short and operational.

Recommended content:

- user goal
- confirmed facts
- unconfirmed gaps
- recommendations shown
- open objections
- next best action
- handoff context

### 12.6 Pending Offer / Pending Question

These should be first-class state objects.

Recommended fields:

- `type`
- `related_entity_id`
- `created_at`
- `expires_after_turns`
- `status`

### 12.7 Follow-Up Triggers

Recommended v1 follow-up trigger types:

- `FORM_INCOMPLETE`
- `DOC_UPLOAD_PENDING`
- `CONSULT_NOT_BOOKED`
- `PACKAGE_CONSIDERING`
- `HUMAN_CALLBACK_REQUESTED`

These should be explicit database objects, not only implicit conversational hints.

---

## 13. CRM Schema Design

This design should extend existing chatbot work already present in `medical-crm-v2`, rather than replacing it.

### 13.1 Keep Existing Tables

Retain and evolve:

- `ai_chat_sessions`
- `ai_chat_messages`
- `dify_document_mappings`
- `ai_sync_outbox`

### 13.2 Expand `ai_chat_sessions`

This table should hold current session truth:

- session identifiers
- patient binding
- hospital type
- security binding
- current business status snapshot
- current conversation control state
- rolling summary
- last policy decision timestamps

### 13.3 Keep `ai_chat_messages` as Turn Audit

Each assistant/system message should be able to carry:

- resolved intent
- risk level
- next action
- response mode
- citations
- tool trace
- response metadata

### 13.4 Add `ai_user_profiles`

Purpose:

- long-term AI-readable user profile memory

Suggested fields:

- condition or goal
- condition category
- preferred destination
- preferred language
- budget band
- urgency
- report status
- objection tags
- lead stage
- next best action
- memory summary

### 13.5 Add `ai_chat_timeline_events`

Purpose:

- human-readable milestone log

### 13.6 Add `ai_followup_triggers`

Purpose:

- queue future re-engagement or human callback actions

### 13.7 Add `ai_hospital_recommendation_logs`

Purpose:

- preserve recommendation decisions, reason codes, and shortlist audit

### 13.8 Add `ai_handoffs`

Purpose:

- preserve structured handoff decision, brief, priority, and lifecycle

---

## 14. Human Handoff and Follow-Up

### 14.1 Handoff Is a First-Class Business Flow

Handoff is not only a fallback when AI fails.

It is also:

- safety fallback
- complexity routing
- high-value lead routing
- trust recovery path
- closing support path

### 14.2 Recommended Handoff Types

- `SAFETY_ESCALATION`
- `COMPLEX_CASE`
- `HIGH_VALUE_LEAD`
- `REQUESTED_HUMAN`
- `TRUST_RECOVERY`

### 14.3 Mandatory Handoff Conditions

- crisis or emergency-like language
- explicit request for a human
- repeated unresolved attempts with continuing user intent
- policy-sensitive custom commitments or negotiations
- complaints or severe trust breakdown

### 14.4 Suggested Handoff Conditions

- existing records + urgency + willingness to proceed
- cross-country or cross-specialty complexity
- repeated objections near conversion
- high commercial intent

### 14.5 Handoff Brief Requirements

The brief should include:

- user goal
- confirmed facts
- open questions
- recommendations already shown
- objections
- risk level
- next suggested step
- recent user tone

### 14.6 Follow-Up Rules

Follow-up should be a policy output, not an ad hoc prompt idea.

It should be created when:

- user intent exists
- a valuable next step remains incomplete
- re-engagement has clear value

It should not become spam.

---

## 15. Guardrail and Safety Model

### 15.1 Priority Order

Recommended policy priority:

1. user safety
2. factual grounding
3. scope control
4. trust-preserving persuasion
5. operational traceability

### 15.2 Allowed vs Prohibited

Allowed:

- grounded process explanation
- hospital recommendation based on reviewed data
- package explanation based on reviewed catalog
- consult recommendation when personalization exceeds safe answer scope

Prohibited:

- diagnosis
- treatment prescription
- clinical decision substitution
- fabricated hospital capability or pricing
- outcome guarantees
- fear-based or manipulative pressure

### 15.3 Response Modes

Recommended response modes:

- `grounded_only`
- `grounded_plus_brief_rewrite`
- `safety_template`
- `handoff_prompt`

### 15.4 Safety Override

If `HIGH_RISK` or `CRISIS`:

- block commercial progression
- block hospital marketing
- block package promotion
- route to safety or human path

---

## 16. Evaluation and Regression Strategy

### 16.1 Core Evaluation Dimensions

- grounded answer quality
- risk and safety behavior
- history-aware intent resolution
- action planning quality
- tool reliability
- writeback accuracy
- handoff and follow-up quality

### 16.2 Failure Tiers

#### Hard fail

- safety breach
- fabricated business-critical fact
- crisis with ongoing sales push
- out-of-scope medical advice

#### Major fail

- wrong intent resolution
- obviously wrong shortlist
- CRM truth pollution
- missed required handoff

#### Minor fail

- awkward wording
- repetitive CTA
- mediocre summary
- low-value phrasing issues

### 16.3 Required Test Buckets

- FAQ
- recommendation
- history-aware intent
- risk / safety
- objection handling
- handoff
- writeback
- follow-up

### 16.4 Testing Layers

#### Policy unit tests

Test backend decisions directly.

#### Integration tests

Test Dify orchestration, backend policy, tools, and writeback together.

#### Human evaluation

Test trust, naturalness, brief quality, and conversion tone.

### 16.5 Red-Line Regression Cases

Must always regress:

- crisis with accidental selling
- fabricated hospital/package facts
- short acknowledgement resolving to wrong pending offer
- unconfirmed facts written as confirmed
- explicit human request not triggering handoff
- recommendation shown when eligibility is not met

---

## 17. Migration from Earlier Design

The earlier chatbot design in this repo treated Dify more like the main router and response engine, with backend supporting:

- session security
- sync
- convert
- escalate
- uploads

This new design keeps that existing work but changes the authority boundary:

- earlier: Dify-heavy decisioning
- new: backend-heavy decisioning

This means the next implementation cycle should not throw away the current chatbot foundation. Instead it should:

- reuse the existing AI chat tables and API surface where possible
- introduce policy-engine modules behind those routes
- evolve Dify from decision-maker into orchestrator
- add structured memory, handoff, recommendation, and follow-up truth tables

---

## 18. Final Definition

The medical tourism CRM AI chatbot should be defined as:

> A backend-authoritative, policy-driven conversation system that uses Dify for orchestration, retrieval, tool calling, and natural-language generation; stores business truth in CRM; and continuously balances grounded answering, recommendation, memory, conversion, handoff, and safety under explicit policy control.

