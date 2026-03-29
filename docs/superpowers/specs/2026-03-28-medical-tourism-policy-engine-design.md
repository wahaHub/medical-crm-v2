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
  -> backend pre-validator / engagement mode resolution
  -> load CRM context
  -> backend policy decision
  -> allowed tool calls
  -> Dify response generation
  -> backend writeback
  -> final structured response
```

### 4.3.1 Dify Orchestration Checklist

The starter Dify workflow must satisfy all of the following:

- Dify can take a cheap path for low-signal turns, but only when backend `engagement_mode` explicitly allows it
- Dify calls internal backend endpoints for `context`, `decide`, and `writeback`
- Dify only runs downstream retrieval or tool calls when they are explicitly allowed by backend policy output
- Dify does not self-decide recommendation eligibility, shortlist authority, or human handoff eligibility
- Dify final output remains strict JSON so the CRM backend can parse, audit, and persist it consistently
- Safety turns must downgrade into safety-only response mode instead of continuing package or recommendation flows

### 4.3.2 Starter Workflow Shape

Recommended starter node sequence:

- `User Input`
- `Lightweight Extraction`
- `Backend Pre-Validator / Engagement Mode`
- `Load CRM Context`
- `Backend Policy Decide`
- `Safety Gate`
- conditional branches for:
  - `Search FAQ`
  - `Search Hospitals`
  - `Get Hospital Details`
  - `List Packages`
  - direct `Safety / Docs / Conversion` response mode
- `Response Composer`
- `Backend Writeback`
- `Final Answer`

The starter asset committed in `dify-config/medora-ai-chatbot-v1.dsl.yml` is intentionally a scaffold:

- internal URLs must be replaced after import
- internal secret headers must be configured after import
- dataset IDs must be attached after import
- tool endpoints such as hospital search, hospital details, and package listing must be pointed at the actual MCP or backend gateway endpoints

### 4.4 Dify <-> Backend Transport Contract

In v1, Dify should call backend policy endpoints over internal HTTP tools exposed by `medical-crm-v2`.

Recommended internal endpoints:

- `POST /api/v2/internal/ai-policy/context`
- `POST /api/v2/internal/ai-policy/decide`
- `POST /api/v2/internal/ai-policy/writeback`

Recommended auth:

- shared internal secret header, reusing the existing internal-worker pattern
- header example: `X-Internal-Secret: <INTERNAL_API_SECRET>`

Recommended request metadata on every call:

- `request_id`
- `session_id`
- `message_id`
- `actor = ai_chatbot`
- `source_channel`
- `hospital_type`

Recommended timeout and retry behavior:

- `context`: timeout `2s`, retry once only on network timeout or `5xx`
- `decide`: timeout `4s`, do not retry after a policy response has started
- `writeback`: timeout `4s`, retry only if idempotency key is present and backend confirms safe retry

Recommended idempotency behavior:

- `decide` should be idempotent per `(session_id, user_message_id)`
- `writeback` should be idempotent per `(session_id, assistant_message_id, writeback_version)`

If Dify cannot reach backend policy endpoints:

- it must not silently self-decide business truth
- it may fall back only to a safe degraded reply such as:
  - temporary inability to continue advanced guidance
  - human handoff suggestion
  - grounded FAQ answer if already retrieved and safe

Pre-validator fallback rule:

- if backend engagement-mode resolution is unavailable, Dify may only use a lightweight discovery reply
- it must not silently promote the turn into recommendation, package, handoff, or heavy writeback mode

### 4.4 Manual Import / Preview Checklist

Before using the Dify workflow in shared environments, an operator should verify:

- internal HTTP nodes point at the correct CRM base URL
- internal HTTP nodes include the correct `X-Internal-Secret`
- `FAQ_COSMETIC`, `FAQ_REGULAR`, and `PACKAGES` datasets are attached to the intended retrieval nodes
- response composer returns strict JSON without markdown fences
- crisis input produces a safety-only response
- recommendation input only traverses the hospital branch when backend `allowed_tools` and `next_action` permit it
- package input only traverses the package branch when backend `allowed_tools` and `next_action` permit it
- writeback succeeds without mutating CRM truth outside the backend writeback endpoint

### 4.5 Backend Endpoint Contract Summary

#### `POST /api/v2/internal/ai-policy/context`

Purpose:

- return CRM truth for this turn

Response should include:

- `profile`
- `status_snapshot`
- `conversation_summary`
- `pending_offer`
- `pending_question`
- `recent_messages`
- `active_followups`

#### `POST /api/v2/internal/ai-policy/decide`

Purpose:

- return authoritative turn decision

Minimum request:

- `session_id`
- `message_id`
- `user_message`
- `recent_messages`
- `conversation_summary`
- `status_snapshot`
- `pending_offer`
- `pending_question`
- `candidate_signals`
- `retrieval_hints`

Minimum response:

- `resolved_intent`
- `risk_level`
- `next_action`
- `secondary_action`
- `response_mode`
- `allowed_tools`
- `reason_codes`
- `shortlist`
- `handoff_required`
- `writeback_plan`

#### `POST /api/v2/internal/ai-policy/writeback`

Purpose:

- persist authoritative post-turn updates

Minimum request:

- `session_id`
- `assistant_message_id`
- `policy_decision`
- `tool_results`
- `final_response_metadata`
- `idempotency_key`

Minimum response:

- `status_updated`
- `timeline_events_written`
- `memory_updated`
- `handoff_created`
- `followup_created`

### 4.6 Envelope, Versioning, and Error Schema

All three internal policy endpoints should use the same top-level envelope.

Recommended request envelope:

```json
{
  "version": "2026-03-28.v1",
  "request_id": "req-123",
  "session_id": "chat-session-1",
  "message_id": "msg-1",
  "actor": "ai_chatbot",
  "source_channel": "patient_web",
  "hospital_type": "COSMETIC",
  "payload": {}
}
```

Recommended success envelope:

```json
{
  "ok": true,
  "version": "2026-03-28.v1",
  "request_id": "req-123",
  "payload": {}
}
```

Recommended error envelope:

```json
{
  "ok": false,
  "version": "2026-03-28.v1",
  "request_id": "req-123",
  "error": {
    "code": "validation_error | policy_block | timeout | system_error | not_found | unauthorized | forbidden | conflict | dependency_unavailable",
    "message": "Human-readable summary",
    "retryable": false,
    "safe_fallback": "HANDOFF | FAQ_ONLY | APOLOGY",
    "details": {}
  }
}
```

Versioning rule:

- all internal policy endpoints must reject unsupported versions explicitly
- version bumps are required when payload semantics change

### 4.7 Failure Matrix

| Failing Step | Dify Behavior | Backend Behavior | User-Facing Outcome |
|---|---|---|---|
| `context` timeout | do not continue with policy flow | return `timeout` envelope | safe apology + optional human handoff |
| `context` auth failure | stop policy flow | return `unauthorized` or `forbidden` envelope | generic unavailable message; no policy execution |
| `decide` timeout | do not self-decide business truth | return `timeout` envelope | grounded FAQ only if already available, else handoff/apology |
| `decide` conflict | stop current write path | return `conflict` envelope | ask user to retry or continue with non-destructive fallback |
| retrieval timeout | skip unavailable retrieval branch | no truth write | say current information is unavailable, offer next safe step |
| downstream dependency unavailable | skip blocked branch | return `dependency_unavailable` envelope | grounded apology + handoff or later-follow-up path |
| shortlist empty | do not fabricate alternatives | return decision with `next_action=ASK_CLARIFYING_INFO` or handoff | ask for missing info or route to human |
| `writeback` failure | response may still render if safe | persist retry task/outbox | user receives response; internal retry handles truth update |
| `writeback` auth/forbidden | do not retry blindly | log policy/config error | safe response may return; internal alert required |
| malformed tool payload | stop that branch | return `validation_error` | safe fallback, no silent continuation |

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
  -> Resolve Engagement Mode
  -> if LIGHT_DISCOVERY:
       lightweight FAQ / process / trust-building path
       minimal writeback
     else:
       Get Conversation Context Tool
       Decide Next Action Tool
       Conditional Tool Calls
       Response Composer
       Apply Writeback Plan Tool
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
- `EngagementModeResolver`
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
3. Resolve engagement mode
4. Resolve intent
5. Resolve risk
6. Generate candidate actions
7. Score and select actions
8. Attach downstream constraints
9. Return authoritative decision contract

### 7.4 Authoritative Decision Contract

Recommended backend output to Dify:

```json
{
  "engagement_mode": "QUALIFIED_EXPLORATION",
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

## 8. Engagement Mode and Entry Gating

### 8.1 Why Engagement Mode Exists

Many early turns should not enter the full policy-engine path.

Examples:

- greeting-only messages
- low-information noise
- obvious trolling or repeated sandbox testing
- very broad discovery questions with no clear action intent

The system should not hard-block these turns. Instead, it should choose a cheaper and more natural operating mode.

### 8.2 Engagement Mode Model

Recommended backend-authoritative modes:

- `LIGHT_DISCOVERY`
- `QUALIFIED_EXPLORATION`
- `DEEP_WORKFLOW`

This should replace any binary "serious client" flag.

### 8.3 Mode Semantics

#### `LIGHT_DISCOVERY`

Use for:

- greetings
- trust-building questions
- broad "what do you do" discovery
- weak or ambiguous intent
- noisy or low-value repeated probes

Behavior:

- allow lightweight FAQ and process explanation
- avoid heavy status loading
- avoid full action scoring
- avoid strong commercial pressure
- keep writeback minimal

#### `QUALIFIED_EXPLORATION`

Use for:

- sustained multi-turn interest
- concrete questions about hospitals, packages, consultation, services, or travel
- partial disclosure of condition, destination, budget, timing, or uploaded-material readiness
- cautious but promising users who are still building trust

Behavior:

- load CRM context
- run normal policy decision
- allow moderate writeback
- allow recommendation or package exploration when policy permits

#### `DEEP_WORKFLOW`

Use for:

- explicit progression into form, docs, recommendation acceptance, handoff, or booking-style actions
- clear high-intent conversion behavior
- uploaded materials or strong structured facts
- cases that require full writeback, follow-up, or handoff orchestration

Behavior:

- run full policy engine
- allow full scoring and side-effect planning
- allow full writeback depth and downstream trigger creation

### 8.4 Mode Resolution Principle

`engagement_mode` should be decided by backend, not by Dify alone.

Dify may provide lightweight candidate signals such as:

- greeting / noise / broad-discovery hints
- likely qualification signals
- possible strong-progression signals

But backend performs the final mode decision using:

- current user message
- recent interaction pattern
- pending offer / pending question
- structured CRM status
- previously known user details
- recommendation / docs / handoff state

Recommended context tiers:

- `light_context`
  - session exists?
  - known patient binding?
  - current `engagement_mode`
  - pending offer / pending question existence and type
  - last assistant action
  - safety flags
- `full_context`
  - full `status_snapshot`
  - rolling summary
  - recent messages
  - active follow-ups
  - AI profile

Rule:

- `LIGHT_DISCOVERY` should prefer `light_context`
- `QUALIFIED_EXPLORATION` and `DEEP_WORKFLOW` may load `full_context`

### 8.5 Mode Escalation Rules

- mode should usually escalate gradually, not jump to deep workflow on weak evidence
- explicit progression requests may jump directly to `DEEP_WORKFLOW`
- safety signals may force safety-governed handling or handoff even when commercial engagement is low
- "filled form" is a strong signal for `DEEP_WORKFLOW`, but not the only valid signal
- careful, high-value, trust-building users must not be penalized for asking detailed questions before submitting data

Hard safety rule:

- if safety signals indicate `HIGH_RISK` or `CRISIS`, engagement mode resolution must not keep the turn in cheap discovery handling
- the turn must immediately enter safety-governed handling and may bypass normal commercial gating

### 8.6 Mode-Specific Allowed Behavior

Recommended defaults:

- `LIGHT_DISCOVERY`
  - FAQ, process explanation, why-us explanation, light trust-building
  - no proactive shortlist push
  - no heavy writeback beyond minimal session metadata
- `QUALIFIED_EXPLORATION`
  - FAQ, shortlist exploration, docs explanation, consult explanation, package exploration
  - moderate writeback and summary refresh
- `DEEP_WORKFLOW`
  - full recommendation, docs upload, form progression, handoff, follow-up creation
  - full writeback and audit depth

### 8.7 Mode-Selection Failure Principle

If mode resolution fails or is unavailable:

- default to `LIGHT_DISCOVERY`
- do not silently escalate into heavy recommendation or conversion flows
- keep the response useful, grounded, and low-pressure

---

## 9. Intent, Risk, and Next Action Model

### 9.1 Intent Principles

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

### 9.2 Intent Model

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

### 9.3 Risk Model

Recommended risk levels:

- `LOW`
- `SENSITIVE`
- `HIGH_RISK`
- `CRISIS`

### 9.4 Risk Override Rules

- risk overrides next action
- crisis blocks conversion and marketing
- high-risk blocks clinical overreach and pushes professional evaluation or handoff
- sensitive allows guidance, but under stricter grounded constraints

### 9.5 Next Action Model

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

### 9.6 Action Selection Principle

Only one primary next action should be selected each turn.

At most one secondary assistive action may be attached.

### 9.7 Decision Precedence Rules

The following precedence order should be used whenever signals conflict:

1. `risk_level`
2. mandatory handoff rules
3. explicit user request
4. pending question resolution
5. pending offer resolution
6. current topical FAQ or clarification intent
7. proactive commercial progression

Canonical conflict rules:

- If `risk_level = CRISIS`, final action must be `SAFETY_ESCALATION` even if recommendation or package eligibility is otherwise true.
- If `risk_level = HIGH_RISK`, recommendation and package progression are blocked for that turn; allowed follow-on actions are safety guidance, consult explanation, or handoff.
- If user explicitly asks for a human, `HANDOFF_TO_HUMAN` beats all non-safety commercial actions.
- If both `pending_question` and `pending_offer` are active:
  - short direct slot-filling replies answer `pending_question` first
  - short acceptance/rejection replies answer `pending_offer` first
  - ambiguous short replies with no clear polarity trigger `ASK_CLARIFYING_INFO`
- If user is recommendation-eligible but also triggers objection handling, `HANDLE_OBJECTION` wins unless the user explicitly asked to see hospitals now.
- If shortlist is empty after eligibility passes, downgrade from `SHOW_HOSPITAL_RECOMMENDATIONS` to `ASK_CLARIFYING_INFO` or `HANDOFF_TO_HUMAN` depending on risk and lead maturity.

---

## 10. Status Model

### 10.1 Business Status

Recommended business status fields:

- `engagement_mode`
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

### 10.2 Conversation Control Status

Recommended conversation-control fields:

- `pending_offer_type`
- `pending_offer_payload`
- `pending_question_type`
- `pending_question_payload`
- `last_next_action`
- `last_resolved_intent`

### 10.3 Engagement Mode vs Lead Maturity

These two fields should not be treated as interchangeable.

- `engagement_mode` controls current-turn execution depth and orchestration path
- `lead_maturity` represents longer-horizon commercial maturity

Rules:

- `lead_maturity` must not by itself determine runtime safety handling
- `lead_maturity` must not by itself force deep workflow entry
- `engagement_mode` may influence the current turn even when `lead_maturity` remains low
- analytics and CRM funnel reporting should prefer `lead_maturity`
- runtime routing should prefer `engagement_mode`

### 10.4 Form Field-Level State

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

## 11. Recommendation Policy

### 11.1 Recommendation Ownership

Hospital recommendation should be backend-authoritative.

Backend decides:

- whether recommendation is allowed now
- whether user information is sufficient
- whether result should be `matched`, `explore`, or blocked
- which hospitals appear in the shortlist
- why they are included

Dify only explains and presents the shortlist.

### 11.2 Shortlist Style

The user explicitly chose:

- **pure-rule shortlist**
- shortlist can be very short
- even one hospital is acceptable

Recommended v1 output:

- `1-3` hospitals max
- `match_type = matched | explore`
- short `reason_codes`

### 11.3 Recommendation Contract

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

### 11.4 Recommendation Guardrails

The system may not:

- invent new hospitals
- invent outcome claims
- invent medical capability
- rank hospitals based on pure generation
- present precision when inputs are too incomplete

### 11.5 Recommendation Source of Truth and Freshness

Hospital and package recommendation inputs must come from an approved catalog state in CRM or an approved downstream source synchronized into CRM.

Recommended source rules:

- shortlist logic may only use records in `approved` or equivalent reviewed state
- unreviewed, draft, archived, or stale records must not be surfaced as authoritative recommendations
- partial records may remain queryable for internal ops, but are not eligible for patient-facing shortlist output

Recommended freshness rules:

- hospital/package records used for recommendation should carry `source_updated_at` and `reviewed_at`
- recommendation policy should reject or downgrade records considered stale by configured SLA
- if all eligible records are stale or partial:
  - no fabricated recommendation
  - downgrade to `ASK_CLARIFYING_INFO`, `EXPLAIN_PROCESS`, or `HANDOFF_TO_HUMAN`

Recommended v1 behavior when data quality is insufficient:

- `eligible = false`
- include `reason_codes` such as:
  - `catalog_partial`
  - `catalog_stale`
  - `no_reviewed_records`
  - `missing_required_filters`

---

## 12. Tool and MCP Contract Design

### 12.1 Tool Design Principles

- business-critical claims must come from tools
- write operations must go through backend authority
- decision and execution should be separated
- read and write concerns should not be mixed arbitrarily
- tool outputs must be small and predictable

### 12.2 Recommended Tool Groups

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

### 12.3 Recommended Core Tool Contracts

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

### 12.4 Explicit Anti-Patterns

The spec should explicitly reject:

- tools that both read truth and mutate unrelated truth in one opaque call
- Dify direct writes into CRM truth tables
- recommendation tools deciding eligibility on their own
- handoff tools deciding necessity on their own

### 12.5 Tool Failure and Degraded-Mode Rules

Tool failures must be first-class runtime states.

Recommended behavior:

- if `get_conversation_context` fails:
  - do not proceed with authoritative planning
  - reply with safe temporary degradation or handoff suggestion
- if `decide_next_action` fails:
  - do not invent a replacement decision in Dify
  - allow only safe FAQ-only fallback if grounded retrieval is already available
- if retrieval tool fails:
  - downgrade to `I don't know based on current information` or handoff prompt
- if hospital/package tools fail:
  - do not fabricate alternatives
  - respond with process guidance or handoff depending on lead maturity
- if `apply_writeback_plan` fails:
  - user response may still be returned if safe
  - backend must emit retryable outbox or failure event for recovery

All tool errors should normalize to:

- `policy_block`
- `validation_error`
- `not_found`
- `timeout`
- `system_error`
- `unauthorized`
- `forbidden`
- `conflict`
- `dependency_unavailable`

---

## 13. Memory, Summary, Timeline, and Writeback

### 13.1 Memory Must Live in CRM DB

Long-term runtime memory should not live primarily in markdown files.

Recommended truth source:

- CRM DB

Markdown may still be useful for:

- design docs
- debugging artifacts
- review material
- curated prompt-support assets

But not for runtime memory truth.

### 13.2 Memory Layers

Recommended layers:

#### Structured profile memory

Long-term user facts and preferences

#### Session status memory

Current funnel and dialogue-control state

#### Rolling summary

Short AI/human-readable summary for fast recovery

#### Timeline events

Short, human-readable milestones

### 13.3 Writeback Principles

- write structured fields first
- distinguish `confirmed`, `user_stated`, and `inferred`
- keep confidence and source where inference exists
- do not persist speculative medical claims as hard truth
- do not overwrite higher-confidence or human-confirmed information blindly
- do not turn timeline into a copy of chat history

### 13.4 Writeback Cadence

Recommended cadence:

#### Every turn

- engagement mode refresh
- pending offer/question refresh
- last intent / last action
- message-level metadata

#### Conditional updates

- profile patch
- lead stage updates
- objection updates
- summary refresh

Mode guidance:

- `LIGHT_DISCOVERY`
  - only minimal session metadata and lightweight intent/action audit
- `QUALIFIED_EXPLORATION`
  - allow targeted summary and status refresh when user signals are meaningful
- `DEEP_WORKFLOW`
  - allow full structured writeback, timeline, handoff, and follow-up side effects

#### Event-driven updates

- timeline event
- recommendation log
- handoff record
- follow-up trigger

### 13.5 Summary Rules

Rolling summary should remain short and operational.

Recommended content:

- user goal
- confirmed facts
- unconfirmed gaps
- recommendations shown
- open objections
- next best action
- handoff context

### 13.6 Pending Offer / Pending Question

These should be first-class state objects.

Recommended fields:

- `type`
- `related_entity_id`
- `created_at`
- `expires_after_turns`
- `status`

### 13.7 Follow-Up Triggers

Recommended v1 follow-up trigger types:

- `FORM_INCOMPLETE`
- `DOC_UPLOAD_PENDING`
- `CONSULT_NOT_BOOKED`
- `PACKAGE_CONSIDERING`
- `HUMAN_CALLBACK_REQUESTED`

These should be explicit database objects, not only implicit conversational hints.

### 13.8 Writeback Failure Recovery

Writeback must be split into safe steps:

1. persist raw assistant message audit
2. persist authoritative status/profile/timeline updates
3. persist side-effect records such as handoff/follow-up

Recommended rule:

- message audit may succeed without full business writeback
- business writeback may be retried idempotently
- no duplicate timeline, handoff, or follow-up rows should be created on retry

Recommended recovery strategy:

- store failed writeback attempts in retryable outbox state
- mark session with `last_writeback_error_at`
- expose retry-safe idempotency key
- log failure reason for audit

Summary refresh should be best-effort:

- if summary update fails, structured status must still commit
- summary can be recomputed later from truth tables

### 13.9 Data Governance and Access Rules

The policy engine stores sensitive medical-tourism context, so governance rules must be explicit.

Recommended rules:

- only persist fields necessary for routing, recommendation, handoff, follow-up, and audit
- do not persist diagnosis-like conclusions as confirmed facts unless explicitly user-provided or human-confirmed
- keep `source`, `confidence`, and `updated_by` metadata for inferred memory where possible
- handoff briefs and timeline payloads must be redactable for downstream viewers who do not need raw medical detail

Recommended access model:

- AI runtime may read only the subset needed for current turn planning and generation
- human advisors may read handoff briefs, timeline, and profile fields relevant to case handling
- broader admin/reporting access should use redacted or aggregated views where possible

Recommended retention model:

- session messages remain as operational audit unless legal/compliance policy says otherwise
- profile memory should be retained only while linked to an active patient/lead lifecycle
- follow-up triggers and handoff records should be retained with normal CRM operational history
- redaction or deletion workflows must be able to remove or anonymize AI-generated profile memory without corrupting audit integrity

Recommended v1 implementation rule:

- design schema with explicit ownership and redaction-friendly JSON payloads
- defer sophisticated retention automation, but do not defer retention fields and access boundaries

---

## 14. CRM Schema Design

This design should extend existing chatbot work already present in `medical-crm-v2`, rather than replacing it.

### 14.1 Keep Existing Tables

Retain and evolve:

- `ai_chat_sessions`
- `ai_chat_messages`
- `dify_document_mappings`
- `ai_sync_outbox`

### 14.2 Expand `ai_chat_sessions`

This table should hold current session truth:

- session identifiers
- patient binding
- hospital type
- security binding
- current business status snapshot
- current conversation control state
- rolling summary
- last policy decision timestamps

### 14.3 Keep `ai_chat_messages` as Turn Audit

Each assistant/system message should be able to carry:

- resolved intent
- risk level
- next action
- response mode
- citations
- tool trace
- response metadata

### 14.4 Add `ai_user_profiles`

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

### 14.5 Add `ai_chat_timeline_events`

Purpose:

- human-readable milestone log

### 14.6 Add `ai_followup_triggers`

Purpose:

- queue future re-engagement or human callback actions

### 14.7 Add `ai_hospital_recommendation_logs`

Purpose:

- preserve recommendation decisions, reason codes, and shortlist audit

### 14.8 Add `ai_handoffs`

Purpose:

- preserve structured handoff decision, brief, priority, and lifecycle

### 14.9 Minimum V1 Schema Scope

To keep implementation planable, v1 schema should include only:

- expand `ai_chat_sessions`
- expand `ai_chat_messages`
- add `ai_user_profiles`
- add `ai_chat_timeline_events`
- add `ai_followup_triggers`
- add `ai_handoffs`

Not required in the first implementation slice:

- separate `ai_hospital_recommendation_logs`
  - shortlist audit may initially live in message metadata + timeline payload

### 14.10 Recommended Table Rules

#### `ai_chat_sessions`

Primary key:

- `id`

Unique keys:

- unique `session_id`

Recommended indexes:

- `(patient_id)`
- `(hospital_type, status)`
- `(handoff_status)`
- `(updated_at desc)`

Nullability:

- `patient_id` nullable for anonymous sessions
- `dify_conversation_id` nullable until first successful Dify turn
- status snapshot fields non-null with explicit enum defaults where possible

#### `ai_chat_messages`

Primary key:

- `id`

Foreign keys:

- `session_id -> ai_chat_sessions.id`

Recommended indexes:

- `(session_id, created_at)`
- `(role, created_at)`
- `(next_action)`

Rules:

- do not delete for normal operation
- use as immutable turn audit

#### `ai_user_profiles`

Primary key:

- `id`

Foreign keys:

- `patient_id -> users.id` if patient is known

Unique keys:

- unique nullable `patient_id`
- otherwise unique `(anonymous_profile_key)` if anonymous support is retained

Recommended indexes:

- `(lead_stage)`
- `(updated_at desc)`

#### `ai_chat_timeline_events`

Primary key:

- `id`

Foreign keys:

- `session_id -> ai_chat_sessions.id`

Recommended indexes:

- `(session_id, created_at desc)`
- `(event_type, created_at desc)`
- `(patient_id, created_at desc)`

#### `ai_followup_triggers`

Primary key:

- `id`

Foreign keys:

- `session_id -> ai_chat_sessions.id`

Recommended indexes:

- `(status, due_at)`
- `(trigger_type, status)`
- `(patient_id, due_at)`

Rules:

- support `pending`, `completed`, `cancelled`, `failed`
- allow only one active trigger of the same type per session unless explicitly overridden

#### `ai_handoffs`

Primary key:

- `id`

Foreign keys:

- `session_id -> ai_chat_sessions.id`
- optional `support_ticket_id -> support_tickets.id`

Recommended indexes:

- `(status, priority, created_at desc)`
- `(handoff_type, created_at desc)`
- `(patient_id, created_at desc)`

### 14.11 Migration Ordering

Recommended migration sequence:

1. expand `ai_chat_sessions`
2. expand `ai_chat_messages`
3. add `ai_user_profiles`
4. add `ai_chat_timeline_events`
5. add `ai_followup_triggers`
6. add `ai_handoffs`
7. backfill defaults and nullable-safe values
8. update repositories and use cases

Recommended rollout rule:

- deploy additive schema first
- backfill second
- only then enable policy-engine writes in runtime paths

### 14.12 Concrete V1 Schema Appendix

This appendix is the implementation-facing minimum schema for planning.

#### A. `ai_chat_sessions` current columns retained

- `id uuid primary key`
- `session_id varchar(255) not null unique`
- `session_secret_hash varchar(255) null`
- `dify_conversation_id varchar(255) null`
- `patient_id uuid null references users(id) on delete set null`
- `hospital_type HospitalType not null`
- `status varchar(20) not null default 'ACTIVE'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### B. `ai_chat_sessions` new v1 columns

- `condition_status varchar(20) not null default 'unknown'`
- `form_status varchar(20) not null default 'not_started'`
- `doc_upload_status varchar(20) not null default 'none'`
- `recommendation_status varchar(30) not null default 'not_started'`
- `consultation_status varchar(30) not null default 'not_introduced'`
- `package_status varchar(30) not null default 'not_introduced'`
- `handoff_status varchar(20) not null default 'not_needed'`
- `engagement_mode varchar(30) not null default 'LIGHT_DISCOVERY'`
- `lead_maturity varchar(20) not null default 'browsing'`
- `risk_level varchar(20) not null default 'low'`
- `trust_or_objection varchar(30) not null default 'none'`
- `prequalification_reason_codes jsonb not null default '[]'::jsonb`
- `pending_offer_type varchar(50) null`
- `pending_offer_payload jsonb not null default '{}'::jsonb`
- `pending_question_type varchar(50) null`
- `pending_question_payload jsonb not null default '{}'::jsonb`
- `last_next_action varchar(50) null`
- `last_resolved_intent varchar(80) null`
- `entered_deep_workflow_at timestamptz null`
- `conversation_summary text not null default ''`
- `last_policy_decision_at timestamptz null`
- `last_user_message_at timestamptz null`
- `last_assistant_message_at timestamptz null`

Recommended new indexes:

- `ai_chat_sessions_handoff_status_idx (handoff_status, updated_at desc)`
- `ai_chat_sessions_engagement_mode_idx (engagement_mode, updated_at desc)`
- `ai_chat_sessions_lead_maturity_idx (lead_maturity, updated_at desc)`
- `ai_chat_sessions_risk_level_idx (risk_level, updated_at desc)`

Backfill rule:

- all existing sessions receive defaults
- existing `status` remains unchanged
- `conversation_summary` backfills to empty string

#### C. `ai_chat_messages` current columns retained

- `id uuid primary key`
- `session_id uuid not null references ai_chat_sessions(id) on delete cascade`
- `role varchar(20) not null`
- `content text not null`
- `intent varchar(80) null`
- `risk_level varchar(20) null`
- `can_answer boolean null`
- `next_action varchar(50) null`
- `citations jsonb not null default '[]'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

#### D. `ai_chat_messages` new v1 columns

- `secondary_action varchar(50) null`
- `response_mode varchar(40) null`
- `tool_trace jsonb not null default '[]'::jsonb`
- `reason_codes jsonb not null default '[]'::jsonb`
- `shortlist jsonb not null default '[]'::jsonb`
- `writeback_status varchar(20) not null default 'pending'`

Backfill rule:

- all existing rows receive empty arrays/defaults
- no historical reinterpretation of existing intent/risk values in migration
- widen existing `intent` column before any policy-engine rollout that writes canonical long-form intents

#### E. `ai_user_profiles`

New table:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid null references users(id) on delete set null`
- `anonymous_key varchar(255) null`
- `condition_or_goal text null`
- `condition_category varchar(50) null`
- `preferred_destination jsonb not null default '[]'::jsonb`
- `preferred_language varchar(20) null`
- `budget_band varchar(20) null`
- `urgency_level varchar(20) null`
- `existing_reports_status varchar(20) not null default 'none'`
- `objection_tags jsonb not null default '[]'::jsonb`
- `lead_stage varchar(20) not null default 'browsing'`
- `next_best_action varchar(50) null`
- `memory_summary text not null default ''`
- `source_confidence_map jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- unique nullable `patient_id`
- unique nullable `anonymous_key`

#### F. `ai_chat_timeline_events`

New table:

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null references ai_chat_sessions(id) on delete cascade`
- `patient_id uuid null references users(id) on delete set null`
- `event_type varchar(50) not null`
- `summary text not null`
- `payload jsonb not null default '{}'::jsonb`
- `actor varchar(20) not null`
- `confidence numeric(5,4) null`
- `created_at timestamptz not null default now()`

#### G. `ai_followup_triggers`

New table:

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null references ai_chat_sessions(id) on delete cascade`
- `patient_id uuid null references users(id) on delete set null`
- `trigger_type varchar(50) not null`
- `status varchar(20) not null default 'pending'`
- `due_at timestamptz not null`
- `channel varchar(20) not null default 'crm_queue'`
- `reason text not null`
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `resolved_at timestamptz null`

Constraint:

- unique active trigger per `(session_id, trigger_type, status='pending')` enforced in application logic or partial index

#### H. `ai_handoffs`

New table:

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null references ai_chat_sessions(id) on delete cascade`
- `patient_id uuid null references users(id) on delete set null`
- `support_ticket_id uuid null references support_tickets(id) on delete set null`
- `handoff_type varchar(40) not null`
- `priority varchar(20) not null`
- `reason_code varchar(60) not null`
- `brief jsonb not null default '{}'::jsonb`
- `status varchar(20) not null default 'requested'`
- `assigned_to uuid null references users(id) on delete set null`
- `created_at timestamptz not null default now()`
- `completed_at timestamptz null`

#### I. Enum/Value Canonicalization Rule

To minimize migration risk in the current repo:

- v1 stores new policy enums as `varchar`
- canonical allowed values are enforced in validation/schema layer first
- dedicated postgres enums may be introduced later once contracts stabilize

---

## 15. Human Handoff and Follow-Up

### 15.1 Handoff Is a First-Class Business Flow

Handoff is not only a fallback when AI fails.

It is also:

- safety fallback
- complexity routing
- high-value lead routing
- trust recovery path
- closing support path

### 15.2 Recommended Handoff Types

- `SAFETY_ESCALATION`
- `COMPLEX_CASE`
- `HIGH_VALUE_LEAD`
- `REQUESTED_HUMAN`
- `TRUST_RECOVERY`

### 15.3 Mandatory Handoff Conditions

- crisis or emergency-like language
- explicit request for a human
- repeated unresolved attempts with continuing user intent
- policy-sensitive custom commitments or negotiations
- complaints or severe trust breakdown

### 15.4 Suggested Handoff Conditions

- existing records + urgency + willingness to proceed
- cross-country or cross-specialty complexity
- repeated objections near conversion
- high commercial intent

### 15.5 Handoff Brief Requirements

The brief should include:

- user goal
- confirmed facts
- open questions
- recommendations already shown
- objections
- risk level
- next suggested step
- recent user tone

### 15.6 Follow-Up Rules

Follow-up should be a policy output, not an ad hoc prompt idea.

It should be created when:

- user intent exists
- a valuable next step remains incomplete
- re-engagement has clear value

It should not become spam.

---

## 16. Guardrail and Safety Model

### 16.1 Priority Order

Recommended policy priority:

1. user safety
2. factual grounding
3. scope control
4. trust-preserving persuasion
5. operational traceability

### 16.2 Allowed vs Prohibited

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

### 16.3 Response Modes

Recommended response modes:

- `grounded_only`
- `grounded_plus_brief_rewrite`
- `safety_template`
- `handoff_prompt`

### 16.4 Safety Override

If `HIGH_RISK` or `CRISIS`:

- block commercial progression
- block hospital marketing
- block package promotion
- route to safety or human path

---

## 17. Evaluation and Regression Strategy

### 17.1 Core Evaluation Dimensions

- grounded answer quality
- risk and safety behavior
- history-aware intent resolution
- action planning quality
- tool reliability
- writeback accuracy
- handoff and follow-up quality

### 17.2 Failure Tiers

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

### 17.3 Required Test Buckets

- validator routing quality
- engagement mode false-negative rate
- engagement mode false-positive rate
- lightweight-path latency
- full-path escalation correctness

- engagement mode resolution
- FAQ
- recommendation
- history-aware intent
- risk / safety
- objection handling
- handoff
- writeback
- follow-up

### 17.4 Testing Layers

#### Policy unit tests

Test backend decisions directly.

#### Integration tests

Test Dify orchestration, backend policy, tools, and writeback together.

#### Human evaluation

Test trust, naturalness, brief quality, and conversion tone.

### 17.5 Red-Line Regression Cases

Must always regress:

- low-signal greeting incorrectly triggering deep workflow
- careful trust-building user incorrectly trapped in permanent light mode
- crisis with accidental selling
- fabricated hospital/package facts
- short acknowledgement resolving to wrong pending offer
- unconfirmed facts written as confirmed
- explicit human request not triggering handoff
- recommendation shown when eligibility is not met

### 17.6 Failure and Recovery Test Bucket

V1 regression must also cover:

- malformed Dify extraction payload
- malformed tool payload from Dify to backend
- `decide_next_action` timeout
- retrieval timeout with safe fallback
- writeback failure after response generation
- duplicate writeback retry with idempotency key
- shortlist generation returning zero hospitals
- handoff creation failure while response_mode is handoff

Expected behavior in these tests should be explicit and non-silent.

### 17.7 Engagement Mode Evaluation Notes

The evaluation set must specifically check that:

- `LIGHT_DISCOVERY` stays fast, low-pressure, and useful
- `QUALIFIED_EXPLORATION` captures cautious but valuable users without forcing form completion
- `DEEP_WORKFLOW` is only entered on strong signals or justified overrides
- form completion is treated as a strong signal, not the sole definition of seriousness

---

## 18. Migration from Earlier Design

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

### 18.1 Implementation Phasing

This should not be executed as one giant undifferentiated build.

Recommended phases:

#### Phase 1A: Schema and backend contract first

- internal policy endpoints
- expanded session/message schema
- profile/timeline/handoff/follow-up core tables

Deliverable:

- CRM can compute and persist policy decisions without Dify cutover

#### Phase 1B: Dify workflow cutover

- context/decide/writeback contracts wired into Dify
- Dify workflow switched to backend-authoritative decisioning
- degraded-mode fallbacks verified end-to-end

#### Phase 2: Recommendation and operational hardening

- backend recommendation policy module
- shortlist presentation integration
- failure recovery and writeback retry hardening
- regression suite expansion

#### Phase 3: Optimization

- recommendation audit expansion if needed
- follow-up automation consumers
- analytics/dashboarding

This keeps the scope planable while preserving the full target architecture.

---

## 19. Final Definition

The medical tourism CRM AI chatbot should be defined as:

> A backend-authoritative, policy-driven conversation system that uses Dify for orchestration, retrieval, tool calling, and natural-language generation; stores business truth in CRM; and continuously balances grounded answering, recommendation, memory, conversion, handoff, and safety under explicit policy control.
