# Chatbot V3 Design: Orchestrator + Supervisor + Multi-Agent (MVP)

Date: 2026-04-15  
Branch: `feature/phase-2bc`  
Status: Approved for planning  
Scope: Medical CRM public chatbot runtime rewrite (no backward compatibility)

## 1) Goal and Scope

Build a new chatbot runtime with these constraints:

- Remove Dify as the primary response engine.
- Do not keep backward compatibility with v2 public contract.
- Frontend can be changed together with backend.
- Use clean architecture: `Supervisor suggests`, `Orchestrator decides`, `Sub-agent executes`.
- Keep implementation minimal and testable.

This spec covers one subsystem only: public chatbot turn runtime and contract.

## 2) Non-Goals

- No v2 compatibility layer.
- No migration shim for old fields (`nextAction`, `secondaryAction`, `blocks`, legacy metadata overlays).
- No standalone QueryAgent process.
- No MCP-first architecture for MVP.
- No redesign of binary upload transport path. `records.upload` only manages chatbot-scoped upload lifecycle metadata and validation in CRM, while file transport remains the existing frontend upload pipeline.

## 3) Final Architecture Decisions

### 3.1 Control ownership

- `SupervisorService`: inference only, returns suggestion.
- `ConversationOrchestratorV3Service`: final authority on stage and dispatch.
- Sub-agents: execute bounded business actions only.

`Orchestrator` is the **only** writer of journey state.

### 3.2 Action dispatch

When a turn requires action, dispatch is performed by `Orchestrator`, not `Supervisor`.

Reason:

- Preserves deterministic control and auditability.
- Keeps jump-step policy enforceable in one place.
- Prevents LLM suggestion from directly mutating business state.

### 3.3 Runtime model

- One request pipeline in API process (Lightsail), no external orchestrator service.
- Typed internal `ToolGateway` for all action calls.
- Supabase remains source of truth for persisted status and business entities.

### 3.4 Public API contract

Use a new endpoint and a minimal response:

- `POST /api/v3/chatbot/chat`
- Response only includes:
  - `messages[]`
  - `turnOutcome`
  - `cards[]`
  - `journey`
  - `handoff`
  - optional `runtimeDebug` in non-production only

## 4) Turn Flow

```mermaid
flowchart TD
  A[Client /api/v3/chatbot/chat] --> B[SupervisorService classify + suggest]
  B --> C[OrchestratorV3 evaluate policy and state]
  C -->|no action| G[Compose response]
  C -->|dispatch action| D[Sub-agent runtime]
  D --> E[ToolGateway typed tools]
  E --> F[Supabase + Application use-cases]
  F --> C
  C --> G
  G --> H[Return messages/turnOutcome/cards/journey/handoff]
```

## 5) Journey State Machine

Stages:

- `EXPLAIN_PROCESS`
- `COLLECT_MEDICAL_INPUTS`
- `RECOMMENDATION`
- `ONLINE_CONSULT`
- `HUMAN_HANDOFF`

### 5.1 Jump-step policy

Jumping is allowed, but only after orchestrator checks prerequisites from current facts/status.

If prerequisites are missing:

- Do not jump.
- Do not return a special "missing prerequisite card".
- Assistant returns normal text guidance telling user required prior step.
- Journey remains at current stage.

### 5.2 Decision outputs

Orchestrator produces one of:

- `STAY`
- `ADVANCE`
- `SKIP`
- `HANDOFF`

And optionally:

- `dispatchAgent` + `dispatchAction`

### 5.3 Rule source, precedence, and determinism

Rule source is a single config object loaded in API runtime:

- `chatbotV3.orchestrator.jumpRules[]`
- `chatbotV3.orchestrator.globalPolicies`
- `chatbotV3.orchestrator.stagePrerequisites`

`jumpRules[]` minimum schema:

```ts
type JumpRule = {
  id: string;
  priority: number; // higher first
  fromStage: JourneyStage;
  toStage: JourneyStage;
};
```

`globalPolicies` minimum schema:

```ts
type GlobalPolicies = {
  forceExplainProcessBefore: JourneyStage[]; // configurable, not hardcoded
  handoffTriggers: {
    userRequestedHuman: boolean;
    consecutiveCriticalToolFailures: number; // threshold
    safetyPolicyHit: boolean;
  };
  handoffPrerequisites?: {
    requiresAll?: string[];
    requiresAny?: string[];
    denyIfAny?: string[];
  };
};
```

`stagePrerequisites` minimum schema:

```ts
type StagePrerequisites = Partial<
  Record<
    JourneyStage,
    {
      requiresAll?: string[]; // fact keys, e.g. records.saved
      requiresAny?: string[];
      denyIfAny?: string[];
    }
  >
>;
```

M0 default policy bundle (config defaults, not service hardcode):

- `forceExplainProcessBefore = ["RECOMMENDATION", "ONLINE_CONSULT"]`
- `stagePrerequisites.RECOMMENDATION.requiresAll = ["records.saved"]`
- `stagePrerequisites.ONLINE_CONSULT.requiresAll = ["recommendation.picked"]`
- `handoffTriggers.consecutiveCriticalToolFailures = 2`
- `handoffPrerequisites.denyIfAny = ["handoff.active"]`

Precedence (fixed order):

1. Safety/human-handoff hard policy
2. Session authorization and ownership checks
3. Semantic handoff suggestion gated by `globalPolicies.handoffPrerequisites`
4. `globalPolicies.forceExplainProcessBefore` gate
5. `stagePrerequisites` gate (`requires*` / `denyIfAny`)
6. Highest-priority matching jump rule
7. Default fallback: `STAY`

Determinism guarantee:

- same `journey + status.query snapshot + supervisor suggestion + rule config version`
- same orchestrator output

## 6) Agent Set (MVP)

### 6.1 Supervisor (LLM suggestion layer with safe fallback)

Supervisor is history-aware. It reads conversation context and suggests intent/stage only.

Input:

- `current.stage`
- `conversationSummary`
- `latestUserMessage`
- `facts`
- `allowedStages`

Output (internal only):

- `intent`
- `suggestedStage`
- `reason` (internal trace/audit field, not exposed to frontend)

Supervisor may suggest `handoff` when the user semantically requests a human. It does not directly trigger handoff or dispatch.

Semantic handoff suggestions are still subject to orchestrator-side `handoffPrerequisites`. Hard handoff signals are not.

Supervisor fallback rule:

- If LLM call fails, times out, or returns invalid schema, fallback to deterministic heuristic suggestion.

### 6.2 Sub-agents

- `FaqAgent` (LLM worker)
  - role-prompted worker for FAQ-only tasks
  - chooses how to complete the FAQ task within FAQ tool allowlist
  - cannot mutate journey
  - tools:
    - `faq.category_search`
    - `faq.search`
    - `faq.get_by_ids`

- `RecordsAgent` (deterministic)
  - `records.upload`
  - `records.save`
  - `records.status`

- `RecommendationAgent` (deterministic)
  - `recommendation.generate`
  - `recommendation.pick`
  - `recommendation.status`

- `ConsultAgent` (deterministic)
  - `consult.schedule`
  - `consult.status`

- `HandoffAgent` (deterministic)
  - `handoff.create`

### 6.3 FAQ agent execution model

`FaqAgent` is the only MVP sub-agent that is LLM-driven.

It receives an orchestrator-owned task prompt and may autonomously decide how to complete the FAQ task using FAQ-only tools. The expected inner loop is:

1. infer FAQ intent/category/query from task + latest user message
2. call `faq.category_search` when narrowing category helps
3. call `faq.search`
4. optionally call `faq.get_by_ids` to retrieve exact FAQ entries
5. return structured answer result

`FaqAgent` does not decide stage progression, handoff, or dispatch.

### 6.4 Query capability

No standalone QueryAgent.

Use shared read tool:

- `status.query`

Accessible to orchestrator and agents as a read-only aggregator.

### 6.5 Sub-agent runtime interface

All sub-agents implement one runtime shape:

```ts
type AgentActionInput = {
  type: string;
  input: unknown;
  meta: {
    taskPrompt: string; // orchestrator-owned compact task context
  };
};

type AgentActionResult = {
  status: "ok" | "error";
  data?: unknown;
  code?: ToolErrorCode;
  message?: string;
};
```

`taskPrompt` is the only orchestrator-to-subagent context contract in MVP.

For `FaqAgent`, the prompt is a compact task envelope rather than raw history. Minimum shape:

```txt
agent=FaqAgent
from=EXPLAIN_PROCESS
to=EXPLAIN_PROCESS
intent=faq
supervisor_reason=user is asking consult timeline
facts=records.saved:false,recommendation.picked:false
goal=Answer the user's FAQ using the FAQ toolset only.
latest_user_message=在线问诊一般多久能安排？
```

The worker may decide which FAQ tools to call, but not whether to advance journey.

## 7) ToolGateway Contract (Internal)

`ToolGateway` provides typed methods only; agents do not call repositories directly.

```ts
interface ToolGateway {
  faq: {
    categorySearch(input: { query: string; locale?: string }): Promise<ToolResult<FaqCategorySearchResult>>;
    search(input: { category?: string; query: string; locale?: string }): Promise<ToolResult<FaqSearchResult>>;
    getByIds(input: { ids: string[]; locale?: string }): Promise<ToolResult<FaqGetByIdsResult>>;
  };
  records: {
    upload(input: UploadInitOrCompleteInput): Promise<ToolResult<UploadResult>>;
    save(input: SaveRecordInput): Promise<ToolResult<SaveRecordResult>>;
    status(input: { sessionId: string }): Promise<ToolResult<RecordStatus>>;
  };
  recommendation: {
    generate(input: { sessionId: string }): Promise<ToolResult<RecommendationGenerateResult>>;
    pick(input: { sessionId: string; hospitalId: string }): Promise<ToolResult<RecommendationPickResult>>;
    status(input: { sessionId: string }): Promise<ToolResult<RecommendationStatus>>;
  };
  consult: {
    schedule(input: ConsultScheduleInput): Promise<ToolResult<ConsultScheduleResult>>;
    status(input: { sessionId: string }): Promise<ToolResult<ConsultStatus>>;
  };
  handoff: {
    create(input: HandoffCreateInput): Promise<ToolResult<HandoffResult>>;
  };
  status: {
    query(input: { sessionId: string }): Promise<ToolResult<UnifiedStatusSnapshot>>;
  };
}
```

Shared gateway policies:

- Mutating calls (`save/generate/pick/schedule/create`) require idempotency key: `sessionId:turnId:toolName`.
- Default timeout:
  - read tools: `3000ms`
  - write tools: `8000ms`
  - external provider dependent writes: `12000ms`
- Tool errors are normalized:

```ts
type ToolErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PERMISSION_DENIED"
  | "TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "UNKNOWN";
```

- All tool responses are wrapped as:

```ts
type ToolResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; code: ToolErrorCode; message: string };
```

## 8) Public API Contract (V3)

### 8.1 Request

```json
{
  "sessionId": "string",
  "message": "string (max 2000, allow empty only when attachments present)",
  "attachments": [
    {
      "fileName": "string",
      "fileSize": 12345,
      "mimeType": "application/pdf",
      "storageKey": "string"
    }
  ],
  "pageContext": {
    "type": "HOSPITAL_DETAIL",
    "hospitalId": "string"
  }
}
```

### 8.2 Response

```json
{
  "messages": [
    {
      "role": "assistant",
      "text": "string"
    }
  ],
  "turnOutcome": {
    "status": "ok|degraded",
    "recoverableErrorCode": "TIMEOUT|UPSTREAM_UNAVAILABLE|UNKNOWN|null"
  },
  "cards": [
    {
      "cardId": "string",
      "cardType": "PROCESS_GUIDE|UPLOAD_RECORDS|RECOMMENDATION_LIST|CONSULT_BOOKING|HANDOFF_STATUS",
      "payload": {},
      "actions": [
        {
          "actionType": "OPEN_MODAL|OPEN_URL|SUBMIT|REFRESH_STATUS",
          "label": "string",
          "params": {}
        }
      ]
    }
  ],
  "journey": {
    "stage": "EXPLAIN_PROCESS|COLLECT_MEDICAL_INPUTS|RECOMMENDATION|ONLINE_CONSULT|HUMAN_HANDOFF"
  },
  "handoff": {
    "required": false,
    "ticketId": null
  },
  "runtimeDebug": {
    "traceId": "string",
    "idempotencyKey": "string",
    "lastDispatchSource": "orchestrator"
  }
}
```

No additional legacy action fields are returned. `runtimeDebug` is non-production only and is omitted in production responses.

## 8.4 Response composition ownership

Final user-facing response composition is not owned by `Supervisor`.

- `Supervisor` suggests intent/stage only
- `Orchestrator` decides journey + dispatch
- sub-agents return bounded action results
- `ResponseComposer` assembles `messages[]`, `cards[]`, `journey`, `handoff`, and `turnOutcome`

`ResponseComposer` is the only layer allowed to turn internal suggestion/decision/result state into final assistant text and cards.

Card schema is discriminated by `cardType`:

```ts
type V3Card =
  | {
      cardType: "PROCESS_GUIDE";
      payload: { guideId: string; title: string };
      actions: Array<{ actionType: "OPEN_MODAL"; label: string; params: { modalKey: "MEDICAL_TRAVEL_PROCESS" } }>;
    }
  | {
      cardType: "UPLOAD_RECORDS";
      payload: { required: boolean; uploadedCount: number };
      actions: Array<{ actionType: "SUBMIT" | "REFRESH_STATUS"; label: string; params: { actionKey: "UPLOAD_RECORDS" } }>;
    }
  | {
      cardType: "RECOMMENDATION_LIST";
      payload: { candidates: Array<{ hospitalId: string; name: string; reason?: string }> };
      actions: Array<{ actionType: "SUBMIT"; label: string; params: { hospitalId: string } }>;
    }
  | {
      cardType: "CONSULT_BOOKING";
      payload: { status: "idle" | "scheduled" | "failed" };
      actions: Array<{ actionType: "SUBMIT" | "REFRESH_STATUS"; label: string; params: { actionKey: "CONSULT_BOOKING" } }>;
    }
  | {
      cardType: "HANDOFF_STATUS";
      payload: { required: boolean; ticketId?: string };
      actions: Array<{ actionType: "OPEN_URL"; label: string; params: { actionKey: "HANDOFF_PORTAL" } }>;
    };
```

### 8.3 Error response contract

Terminal errors use:

```json
{
  "error": {
    "code": "INVALID_REQUEST|UNAUTHORIZED|FORBIDDEN|SERVICE_UNAVAILABLE|INTERNAL_ERROR",
    "message": "string",
    "traceId": "string"
  }
}
```

## 9) Dynamic Rules and Prompt Contracts

Configurable at runtime (or deploy-time config):

- Supervisor prompt and behavior rules.
- FaqAgent role prompt and FAQ tool allowlist.
- ResponseComposer copy/card composition rules.
- Jump-step prerequisite rule table.
- Explain-process gate and handoff trigger thresholds in `globalPolicies`.

Not configurable:

- Orchestrator final arbitration mechanism.
- Single-writer state ownership model.

## 10) Observability (M0: Required)

All M0 items are in scope for MVP.

### 10.1 Correlation IDs

Per event/log record:

- `traceId`
- `sessionId`
- `turnId`
- `childRunId` (when sub-agent dispatched)

### 10.2 Required event logs

- `supervisor_suggestion_created`
- `orchestrator_decision_finalized`
- `journey_transition_committed`
- `subagent_dispatched|started|completed|failed|timeout|cancelled`
- `tool_call_started|completed|failed`

Required decision fields:

- `suggestedStage`
- `finalStage`
- `decisionType`
- `matchedRuleId`
- `reason`
- `whyNotSkip` (when jump denied)

Required LLM runtime fields:

- `nodePromptVersion`
- `nodeModel`
- `fallbackUsed`
- `schemaValidationFailed`
- `toolPlanUsed` (for `FaqAgent`, when applicable)

### 10.3 Required metrics

- Turn latency: P50/P95/P99
- Success/error rate per endpoint
- Sub-agent failure/timeout/cancel rate
- Tool failure rate by tool name
- Handoff rate
- Jump-denied rate
- Stage distribution and stage dwell time

### 10.4 Required alerts

- `consult.schedule` failure rate > 15% over 5m (min 20 calls)
- `recommendation.generate` failure rate > 20% over 5m (min 20 calls)
- Sub-agent timeout > 10 events over 10m OR timeout ratio > 8%
- Handoff rate > 35% over 30m and > 2x trailing 7-day baseline

### 10.5 Data safety and token control

- Never log raw medical records or full attachment content.
- Tool arguments/results must be redacted before logging.
- `reason` is internal only, max 240 chars after truncation.
- `errorDetail` is redacted and capped to 512 chars.
- Keep message-level verbose traces behind debug flag to avoid token/log explosion.

### 10.6 Runtime observability wiring (minimum required)

- `traceId` generation: route reads `x-request-id` first; if absent, uses `randomUUID()`.
- `traceId` must propagate through route -> runtime -> emitted node events.
- Unified node event envelope (minimum fields):
  - `traceId`, `sessionId`, `turnId`, `node`, `action`, `status`, `latencyMs`, `errorCode?`
- Required node coverage:
  - `Supervisor`, `Orchestrator`, `Subagent`, `Tool`
  - statuses use `started|completed|failed|timeout` as applicable
- Every turn emits one `turn_summary` event with:
  - `decisionAction`, `fromStage`, `toStage`, `outcomeStatus`, `degradedErrorCode?`
- Non-production response may include `runtimeDebug` (`traceId` + runtime debug fields); production must not expose added debug fields.
- For LLM nodes, non-PHI-safe debug metadata may include prompt/version hashes but must not include raw medical record content.

## 11) Error Handling

### 11.1 Failure matrix

| Failure type | HTTP status | Body | Journey mutation | User-facing behavior |
|---|---:|---|---|---|
| Invalid request schema | 400 | error envelope | none | validation message |
| Session unauthorized / ownership mismatch | 401/403 | error envelope | none | auth message |
| Recoverable tool/sub-agent failure | 200 | normal v3 response | none (`STAY`) | assistant guidance text |
| Sub-agent timeout | 200 | normal v3 response | none (`STAY`) | assistant guidance + status refresh suggestion |
| Upstream unavailable (terminal) | 503 | error envelope | none | temporary unavailable |
| Unexpected internal terminal error | 500 | error envelope | none | generic retry later |

### 11.2 Runtime fallbacks

- If supervisor LLM fails or returns invalid schema: fallback to heuristic supervisor suggestion.
- If semantic handoff is suggested but `handoffPrerequisites` fail: keep current stage and compose normal assistant guidance instead of handing off.
- If `FaqAgent` LLM fails before tool execution: fallback to deterministic FAQ search + safe generic answer composition.
- If `FaqAgent` tool loop fails mid-flight: keep response contract valid, do not mutate stage, and return FAQ-safe degraded response.
- If agent/tool action fails: keep response contract valid, no state advance.
- If sub-agent times out: fallback to `status.query` and compose guidance text.
- If orchestrator cannot produce valid decision: force `STAY`.
- If response composition fails after decision: return 500 error envelope with `traceId`.
- For recoverable failures with HTTP 200, set `turnOutcome.status = "degraded"` and fill `turnOutcome.recoverableErrorCode`.

## 12) Deployment and Runtime

- Frontend: Vercel
- API runtime: Lightsail (same API service process)
- Database/state: Supabase

No additional runtime service is required for MVP.

### 12.1 LLM runtime adapter strategy

This MVP adopts option `B`: a minimal internal LLM runtime adapter layer, not a full generic multi-agent runtime.

Included in MVP:

- `SupervisorLlmAdapter`
- `FaqLlmAdapter`

Not included in MVP:

- LLM versions of `RecordsAgent`, `RecommendationAgent`, `ConsultAgent`, or `HandoffAgent`
- external MCP server runtime
- a separate LLM response-writer agent

Design intent:

- keep the adapter reusable
- prove the pattern on `Supervisor + FaqAgent`
- expand later without rewriting orchestrator or public API

## 13) Testing Requirements (MVP)

Minimum required tests:

1. Orchestrator unit tests
   - stay/advance/skip/handoff decisions
   - jump allow/deny with prerequisite checks
2. ToolGateway unit tests
   - success and failure paths per tool
   - FAQ tool surface: `categorySearch/search/getByIds`
3. API contract tests
   - response includes only v3 fields
4. Integration tests
    - FAQ path
    - FAQ path with LLM-plan -> tool loop -> answer result
    - FAQ path fallback when LLM schema invalid
    - FAQ path fallback when FAQ tool fails
    - semantic handoff denied by `handoffPrerequisites`
    - hard handoff still wins when prerequisite gate would otherwise deny
    - records upload/save path
   - recommendation generate/pick path
   - consult schedule path
   - handoff path
   - jump denied due to missing prerequisite
   - out-of-order repeated submit/pick/schedule with idempotency key
   - overlapping concurrent turns on same `sessionId` (single-writer lock and deterministic state)
   - timeout fallback path (`status.query` is used)
   - malformed attachments/pageContext
   - unauthorized session access

## 14) Interface Appendix

### 14.1 Supervisor and orchestrator contracts

```ts
type SupervisorSuggestion = {
  intent: "faq" | "progression" | "resource" | "consult" | "handoff" | "unknown";
  suggestedStage: JourneyStage;
  reason: string; // internal only
};

type OrchestratorDecision = {
  action: "STAY" | "ADVANCE" | "SKIP" | "HANDOFF";
  from: { stage: JourneyStage };
  to: { stage: JourneyStage };
  dispatchAgent?: "FaqAgent" | "RecordsAgent" | "RecommendationAgent" | "ConsultAgent" | "HandoffAgent";
  matchedRuleId?: string;
  whyNotSkip?: string;
};
```

### 14.2 FAQ agent contracts

```ts
type FaqPlan = {
  category?: string;
  query: string;
  reason: string;
};

type FaqAnswerResult = {
  answer: string;
  citedFaqIds: string[];
  confidence: "high" | "medium" | "low";
};
```

### 14.3 Response composer contract

```ts
type ResponseComposerInput = {
  decision: OrchestratorDecision;
  suggestion: SupervisorSuggestion;
  dispatchResult: AgentActionResult | null;
  fallbackStatus: ToolResult<UnifiedStatusSnapshot> | null;
};

type ResponseComposerOutput = {
  messages: Array<{ role: "assistant"; text: string }>;
  cards: V3Card[];
  journey: { stage: JourneyStage };
  handoff: { required: boolean; ticketId: string | null };
  turnOutcome: { status: "ok" | "degraded"; recoverableErrorCode: "TIMEOUT" | "UPSTREAM_UNAVAILABLE" | "UNKNOWN" | null };
};
```

## 15) Acceptance Criteria

- Dify is not used in v3 runtime path.
- Journey updates happen only through orchestrator.
- Sub-agent dispatch is triggered only by orchestrator decisions.
- Supervisor may suggest handoff from conversation semantics, but orchestrator remains final authority.
- Hard handoff signals (tool failure threshold, safety policy) are enforced by orchestrator without relying on model inference.
- Semantic handoff can be gated by configurable `handoffPrerequisites`.
- Final assistant text/cards are composed by `ResponseComposer`, not by `Supervisor`.
- FaqAgent is LLM-driven and limited to FAQ tools only.
- Public response contract contains only v3 fields.
- `records.save` and `consult.schedule` persist to Supabase and are visible in `status.query`.
- Explain-process appearance, stage prerequisites, jump policy, and handoff triggers are driven by orchestrator config (not hardcoded in service logic).
- All M0 observability items are implemented and verified in non-prod.
- End-to-end scenarios pass with no compatibility shim.
