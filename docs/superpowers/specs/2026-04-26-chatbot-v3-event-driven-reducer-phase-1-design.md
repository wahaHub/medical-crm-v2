# Chatbot V3 Event-Driven Reducer Phase 1 Design

Date: 2026-04-26
Status: Proposed
Audience: Engineers and AI agents working on `chatbot-v3` control-plane refactoring

## 1. Why this refactor exists

`chatbot-v3` currently works, but its control plane still has the wrong center of gravity.

Today the main LLM control component still tries to output multiple layers of truth at once:
- intent
- suggested stage
- dispatch agent
- task payload
- optional read-domain hints

That has created a repeated class of bugs:
- FAQ turns accidentally pollute primary journey state
- `EXPLAIN_PROCESS` has been overloaded as both a real workflow stage and a detour landing zone
- structured actions like `TRIAGE_SUBMITTED` can be understood by runtime and persistence, yet still be mis-routed because supervisor prompt rules drift
- uploaded documents, FAQ detours, and progression signals are too easy to conflate
- debugging is harder than it should be because event recognition, state transition, and dispatch selection are not cleanly separated

This design changes that.

The goal of Phase 1 is not to redesign the entire product flow or rename every state.
The goal is to move the control plane onto the right abstraction boundary:
- the supervisor extracts events
- the reducer decides workflow truth
- dispatch is deterministic from reducer output

## 2. Phase 1 definition

Phase 1 is:

**event-driven reducer takes over the control plane, while a projection layer keeps the old presentation and persistence surfaces compatible during migration.**

In practical terms:
- `Supervisor` stops outputting `suggestedStage`, `dispatchAgent`, and `task`
- `JourneyReducer` becomes the only control-plane truth source
- the existing stage names stay the same for now
- the existing agents stay the same for now
- old runtime/composer/storage surfaces can keep working through projected compatibility views

This is intentionally not a full rewrite.
It is the first structural cut that lets later phases become simpler instead of harder.

## 3. Non-goals for Phase 1

Phase 1 does **not** do these things:
- rename canonical stages
- redesign the patient-facing UI contract from scratch
- replace all existing snapshot persistence with a brand new database schema
- introduce a full sales-conversion orchestration layer
- fully remove legacy compatibility views in one step
- make every single semantic classification deterministic

Phase 1 is about fixing control-plane boundaries first.

## 4. Existing stage model stays unchanged

Phase 1 keeps the current canonical primary stages:
- `COLLECT_MINIMAL_MEDICAL_FACTS`
- `RECOMMENDATION`
- `EXPLAIN_PROCESS`
- `COLLECT_MEDICAL_INPUTS`
- `ONLINE_CONSULT`
- `HUMAN_HANDOFF`

This matters for two reasons:
- current runtime, UI, and persistence already know these stages
- keeping them stable lowers migration risk while the control plane is being rewritten

The refactor is about who decides the stage and why, not about inventing a new public stage vocabulary.

## 5. Core design shift

The old shape is roughly:

```text
LLM proposal -> authority validation/correction -> agent dispatch -> response
```

The new Phase 1 shape becomes:

```text
normalize input
-> deterministic event extraction
-> semantic event extraction only if needed
-> SupervisorEvent
-> JourneyReducer
-> NextActionResolver
-> task builder or system renderer
-> agent execution or system-rendered response
-> response composer
-> persist projected facts/stage into existing snapshot
```

The most important rule is:

**LLM no longer decides workflow state.**

It may still help understand the user's message.
But state transitions, action selection, and dispatch selection move back into code.

## 6. New supervisor responsibility

The supervisor becomes an event extractor.

It has two layers:

### Layer 1: deterministic-first event extraction
This layer handles high-confidence, low-ambiguity events directly in code.

Examples:
- structured frontend actions like `TRIAGE_SUBMITTED`
- structured frontend actions like `RECOMMENDATION_SELECTED`
- attachment presence leading to `DOCUMENTS_UPLOADED`
- explicit human request phrases
- explicit “what is next” style phrases

This layer does **not** try to classify FAQ.
FAQ remains a semantic classification problem in Phase 1.

### Layer 2: semantic event extraction
This layer runs only when deterministic extraction does not already produce a final event.

The semantic layer can classify:
- FAQ questions
- implicit treatment intent
- doctor or hospital matching intent
- natural-language medical fact disclosure
- consult interest
- risky medical advice requests
- out-of-scope or restricted-service asks
- ambiguous replies
- unknown messages

The semantic layer outputs a narrow structured event contract.
It does not output stage, agent, task, or write patches.

## 7. Phase 1 supervisor event contract

Phase 1 standardizes on this event shape:

```ts
type SupervisorEvent = {
  eventType: SupervisorEventType;
  confidence: number;
  source: "deterministic" | "llm" | "fallback_unknown";
  metadata?: {
    topic?: FaqTopic;
    subtopic?: string;
    condition?: string;
    destination?: string;
    urgency?: "low" | "medium" | "high" | "unknown";
    extractedFacts?: Record<string, unknown>;
    selectedHospitalIds?: string[];
    documentCount?: number;
    riskType?: string;
    redirectTarget?: string;
    rawText?: string;
    highIntentSignal?: string;
  };
};
```

The Phase 1 event set is:
- `TRIAGE_SUBMITTED`
- `TRIAGE_SKIPPED`
- `RECOMMENDATION_SELECTED`
- `RECOMMENDATION_SKIPPED`
- `DOCUMENTS_UPLOADED`
- `USER_REQUESTED_HUMAN`
- `USER_ASKED_NEXT_STEP`
- `USER_ASKED_FAQ`
- `USER_WANTS_TREATMENT_IN_CHINA`
- `USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING`
- `USER_PROVIDED_MEDICAL_FACTS`
- `USER_INTERESTED_IN_CONSULT`
- `USER_ASKED_RISKY_MEDICAL_ADVICE`
- `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE`
- `USER_AMBIGUOUS_REPLY`
- `UNKNOWN_MESSAGE`

## 8. Structured outputs are required

The current `json_object` style is not sufficient for the semantic supervisor path.
It only guarantees something that looks like JSON.
It does not guarantee valid enums, valid structure, or valid metadata shape.

Phase 1 requires strict structured output schema enforcement for the LLM semantic event extractor.

The semantic extractor must be constrained to the `SupervisorEvent` schema family, including:
- strict enum for `eventType`
- numeric `confidence`
- no `suggestedStage`
- no `dispatchAgent`
- no `task`
- no arbitrary extra top-level keys

Prompt wording alone is not enough.
API-level schema enforcement is part of the design.

## 9. New control-plane truth model

Phase 1 introduces three explicit control-plane structures.

### 9.1 `JourneyState`
This is the lightweight primary workflow state.

```ts
type PrimaryStage =
  | "COLLECT_MINIMAL_MEDICAL_FACTS"
  | "RECOMMENDATION"
  | "EXPLAIN_PROCESS"
  | "COLLECT_MEDICAL_INPUTS"
  | "ONLINE_CONSULT"
  | "HUMAN_HANDOFF";

type JourneyState = {
  primaryStage: PrimaryStage;
  lastQuestion?: {
    questionType: string;
    expectedAnswerType?: string;
  };
};
```

### 9.2 `DomainFacts`
This is the normalized business-facts view used by reducer logic.

```ts
type DomainFacts = {
  language: string;

  intake: {
    condition?: string;
    destination?: string;
    patientGender?: string;
    relationToPatient?: string;
    minimalTriageStatus: "not_started" | "submitted" | "skipped";
    minimalTriageSummary?: string;
  };

  recommendation: {
    status: "none" | "generated" | "selected" | "skipped";
    selectedHospitalIds: string[];
  };

  process: {
    explained: boolean;
  };

  records: {
    supportingDocumentsCount: number;
    availableDocumentTypes: string[];
    missingDocumentTypes: string[];
  };

  consult: {
    status: "not_started" | "ready" | "scheduled";
  };

  handoff: {
    active: boolean;
  };
};
```

### 9.3 `NextAction`
This is the deterministic action contract produced by the reducer.

```ts
type NextAction =
  | { type: "COLLECT_MINIMAL_TRIAGE" }
  | { type: "GENERATE_RECOMMENDATION" }
  | { type: "ASK_RECOMMENDATION_SELECTION" }
  | { type: "SHOW_PROCESS_OVERVIEW" }
  | { type: "REQUEST_MEDICAL_DOCUMENTS" }
  | { type: "OFFER_ONLINE_CONSULT" }
  | { type: "CREATE_HANDOFF" }
  | { type: "ANSWER_FAQ"; topic?: string; subtopic?: string }
  | { type: "SAFE_MEDICAL_REDIRECT"; riskType?: string }
  | { type: "OUT_OF_SCOPE_REDIRECT"; redirectTarget?: string }
  | { type: "CLARIFY_INTENT" };
```

## 10. JourneyReducer becomes the only control-plane truth source

The reducer is the center of Phase 1.

It must not become a giant, opaque `if/else` block.
Instead it is explicitly split into four steps:
- normalize facts
- derive facts patch
- decide next action
- derive next stage

Recommended skeleton:

```ts
function reduceJourney(input: {
  state: JourneyState;
  facts: DomainFacts;
  event: SupervisorEvent;
}): JourneyReduction {
  const normalizedFacts = normalizeFacts(input.facts);
  const factsPatch = deriveFactsPatch(input.event, normalizedFacts);
  const nextFacts = applyFactsPatch(normalizedFacts, factsPatch);

  const nextAction = decideNextAction({
    state: input.state,
    facts: nextFacts,
    event: input.event,
  });

  const nextStage = deriveNextStage({
    currentStage: input.state.primaryStage,
    facts: nextFacts,
    event: input.event,
    nextAction,
  });

  return {
    primaryStage: nextStage,
    factsPatch,
    nextAction,
    reasonCode: buildReasonCode(input.event, nextAction),
  };
}
```

This separation is a requirement, not a stylistic preference.
It keeps fact mutation, action selection, and stage progression readable and testable.

## 11. Reducer rules for Phase 1

Phase 1 should implement these rules clearly.

### Highest-priority overrides
- `USER_REQUESTED_HUMAN` -> `CREATE_HANDOFF`
- `USER_ASKED_RISKY_MEDICAL_ADVICE` -> `SAFE_MEDICAL_REDIRECT`
- `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE` -> `OUT_OF_SCOPE_REDIRECT`

### Detours
- `USER_ASKED_FAQ` -> `ANSWER_FAQ`
- `USER_AMBIGUOUS_REPLY` -> `CLARIFY_INTENT`
- `UNKNOWN_MESSAGE` -> `CLARIFY_INTENT`

These do not automatically advance the primary stage.

### Structured progression events
- `TRIAGE_SUBMITTED` -> `GENERATE_RECOMMENDATION`
- `TRIAGE_SKIPPED` -> `GENERATE_RECOMMENDATION`
- `RECOMMENDATION_SELECTED`
  - if process not yet explained -> `SHOW_PROCESS_OVERVIEW`
  - else if no supporting docs -> `REQUEST_MEDICAL_DOCUMENTS`
  - else -> `OFFER_ONLINE_CONSULT`
- `RECOMMENDATION_SKIPPED` -> `SHOW_PROCESS_OVERVIEW`

### Facts-driven progression
- `DOCUMENTS_UPLOADED`
  - always updates document facts first
  - may lead to `REQUEST_MEDICAL_DOCUMENTS` or `OFFER_ONLINE_CONSULT` depending on current facts

### Semantic intent events
- `USER_WANTS_TREATMENT_IN_CHINA`
- `USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING`
- `USER_PROVIDED_MEDICAL_FACTS`

These should generally route through a shared facts-driven helper such as `decideNextStepFromFacts(...)`.

### Consult interest
- `USER_INTERESTED_IN_CONSULT`
  - if documents are missing -> `REQUEST_MEDICAL_DOCUMENTS`
  - else -> `OFFER_ONLINE_CONSULT`

### Explicit next-step request
- `USER_ASKED_NEXT_STEP`
  - always resolves from current normalized facts
  - does not rely on a fresh LLM stage guess

## 12. Primary stage must not change on every turn

This is a core invariant.

Side-path or redirect actions should usually preserve `primaryStage`.

Examples:
- `ANSWER_FAQ`
- `SAFE_MEDICAL_REDIRECT`
- `OUT_OF_SCOPE_REDIRECT`
- `CLARIFY_INTENT`

These actions keep the current primary stage.

Recommended rule:

```ts
function deriveNextStage(input: {
  currentStage: PrimaryStage;
  facts: DomainFacts;
  event: SupervisorEvent;
  nextAction: NextAction;
}): PrimaryStage {
  if (
    input.nextAction.type === "ANSWER_FAQ" ||
    input.nextAction.type === "SAFE_MEDICAL_REDIRECT" ||
    input.nextAction.type === "OUT_OF_SCOPE_REDIRECT" ||
    input.nextAction.type === "CLARIFY_INTENT"
  ) {
    return input.currentStage;
  }

  switch (input.nextAction.type) {
    case "COLLECT_MINIMAL_TRIAGE":
      return "COLLECT_MINIMAL_MEDICAL_FACTS";
    case "GENERATE_RECOMMENDATION":
    case "ASK_RECOMMENDATION_SELECTION":
      return "RECOMMENDATION";
    case "SHOW_PROCESS_OVERVIEW":
      return "EXPLAIN_PROCESS";
    case "REQUEST_MEDICAL_DOCUMENTS":
      return "COLLECT_MEDICAL_INPUTS";
    case "OFFER_ONLINE_CONSULT":
      return "ONLINE_CONSULT";
    case "CREATE_HANDOFF":
      return "HUMAN_HANDOFF";
    default:
      return input.currentStage;
  }
}
```

This is how Phase 1 prevents FAQ or redirect turns from polluting the primary workflow stage.

## 13. Dispatch becomes deterministic

The LLM no longer chooses the agent.

Dispatch is resolved in code from `NextAction`.

Recommended mapping:

```ts
function resolveAgent(action: NextAction): AgentName | null {
  switch (action.type) {
    case "ANSWER_FAQ":
      return "FaqAgent";

    case "COLLECT_MINIMAL_TRIAGE":
    case "REQUEST_MEDICAL_DOCUMENTS":
      return "RecordsAgent";

    case "GENERATE_RECOMMENDATION":
    case "ASK_RECOMMENDATION_SELECTION":
      return "RecommendationAgent";

    case "OFFER_ONLINE_CONSULT":
      return "ConsultAgent";

    case "CREATE_HANDOFF":
      return "HandoffAgent";

    case "SAFE_MEDICAL_REDIRECT":
    case "OUT_OF_SCOPE_REDIRECT":
    case "CLARIFY_INTENT":
      return "FaqAgent";

    case "SHOW_PROCESS_OVERVIEW":
      return null;
  }
}
```

`SHOW_PROCESS_OVERVIEW` should remain system-rendered in Phase 1.
The process overview is fixed product guidance and does not need LLM generation.

## 14. Compatibility strategy during migration

Phase 1 still needs a compatibility layer because parts of runtime, composer, and persistence currently expect old shapes.

That compatibility layer is a **projection**, not a control source.

Recommended naming:

```ts
type LegacyCompatibilityView = {
  projectedProposal: {
    intent: string;
    suggestedStage: PrimaryStage;
    dispatchAgent?: AgentName;
    reason: string;
  };
  projectedDecision: {
    nextAction: NextAction;
    fromStage: PrimaryStage;
    toStage: PrimaryStage;
    dispatchAgent?: AgentName;
    isSystemRendered: boolean;
  };
};
```

Key rule:
- `SupervisorEvent + JourneyReducer = truth`
- `LegacyCompatibilityView = translation for old layers`

Old runtime/composer surfaces may temporarily consume the projected view.
They may not override reducer outputs.

## 15. Snapshot normalization and write-back rules

Phase 1 does not require a new storage schema yet.

Instead:
- read existing snapshot storage
- normalize into `DomainFacts`
- let reducer operate only on normalized facts
- project reducer `factsPatch` back into existing snapshot fields

Hard rule:
- **Read only normalized facts inside reducer logic**
- **Write only through projected factsPatch**

Do not mix reads such as:
- `snapshot.processExplained`
- `facts.process.explained`

inside the same control-plane logic.

That would preserve dual truth and reintroduce the same class of bugs.

## 16. Composer boundaries

Phase 1 allows the existing composer surface to remain, but it must be constrained.

Composer may:
- render from `nextAction`
- render from `projectedDecision`
- render agent output
- choose cards and text templates

Composer may not:
- decide workflow stage
- write facts
- override reducer decisions
- reinterpret reducer output into a different primary stage

In short:
- composer renders
- reducer decides

## 17. Read planning

Phase 1 should not keep LLM-driven read-domain selection as a core control-plane responsibility.

Read planning should be deterministic from `NextAction` and event context whenever possible.

Examples:
- FAQ with a specific topic may need FAQ/domain reads
- recommendation follow-up may require recommendation status context
- consult offering may require consult status context

If read planning still needs a compatibility bridge, it should be a deterministic planner tied to reducer output, not a second LLM suggestion loop.

## 18. Observability requirements

Phase 1 must improve observability, not reduce it.

Required observability nodes:

### `deterministic_event_extractor`
Log:
- matched or not
- matched rule id
- produced event
- confidence

### `semantic_event_extractor`
Log:
- model
- structured schema pass/fail
- fallback usage
- error metadata
- produced event

### `event_extraction_summary`
Log:
- final event
- source: deterministic / llm / fallback_unknown

### `journey_reducer`
Log:
- current stage
- compact facts summary
- input event
- factsPatch
- nextAction
- nextStage
- reasonCode

### `next_action_resolver`
Log:
- nextAction
- resolved agent
- system-rendered yes/no

This is a primary deliverable of Phase 1.
The new architecture should be easier to debug than the old one.

## 19. Invariants

Phase 1 should add explicit consistency checks between reducer truth, projected compatibility view, and persisted snapshot.

Recommended invariants:

```ts
assert(reducerOutput.nextStage === persistedSnapshot.journeyCurrentStage);
assert(projectedView.projectedDecision.toStage === reducerOutput.nextStage);
assert(projectedView.projectedProposal.suggestedStage === reducerOutput.nextStage);
```

If these diverge:
- emit an error-level log
- do not silently continue as if there were only one truth source

This protects against compatibility projection accidentally becoming a second control plane.

## 20. Testing requirements for Phase 1

### Unit tests
- deterministic event extractor
- semantic event schema validation
- reducer factsPatch behavior
- reducer nextAction decisions
- reducer nextStage derivation
- nextAction-to-agent resolution
- projection consistency

### Integration tests
- `TRIAGE_SUBMITTED -> RECOMMENDATION`
- `TRIAGE_SKIPPED -> RECOMMENDATION`
- `RECOMMENDATION_SELECTED -> EXPLAIN_PROCESS`
- FAQ detour does not change primary stage
- document upload updates facts without invalid stage jumps
- human request always overrides
- `USER_ASKED_NEXT_STEP` derives from facts, not LLM stage guessing
- risky medical advice stays in redirect behavior
- out-of-scope request does not pollute primary stage

### Live tests
At minimum:
- early treatment intent
- triage submit
- triage skip
- recommendation select
- explain-process FAQ detour
- upload docs before and after recommendation
- consult interest with and without docs
- explicit human request
- risky medical advice
- out-of-scope request

## 21. Success criteria

Phase 1 is successful when:
- supervisor no longer outputs stage, agent, or task
- reducer is the only control-plane truth source
- FAQ no longer needs stage-polluting hacks to preserve primary journey
- document uploads update facts without implicitly becoming stage transitions
- `USER_ASKED_NEXT_STEP` is facts-driven
- the system can still render existing user-facing flows through projected compatibility views
- observability clearly shows event -> reducer -> nextAction -> dispatch

## 22. Phase 2 preview

Phase 2 can then become much simpler:
- shrink or remove projection compatibility surfaces
- reduce old proposal-shaped tests
- simplify response composer to read reducer-native types directly
- consider separating `turnMode` or richer detour semantics if still needed
- revisit high-intent conversion handling as a first-class event or escalation policy

Phase 1 is the structural cut that makes those later simplifications possible.
