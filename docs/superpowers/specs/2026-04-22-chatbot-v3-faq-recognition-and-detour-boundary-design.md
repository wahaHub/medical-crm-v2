# Chatbot V3 FAQ Recognition And Detour Boundary Design

## Context

Live testing on April 22, 2026 showed that early-stage FAQ questions are not being routed into FAQ handling. A concrete reproduced transcript is also available in `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-real-api-dogfood/2026-04-21T08-00-57Z/transcripts.json`, including the `What are your hours?` case that still repeated the triage follow-up copy.

Confirmed examples:
- `do you guys even work on sundays lol`
- `if i already got scans done elsewhere is that okay or annoying for you`
- `how long are people usually stuck in china for this, roughly`
- `What are your hours?`

In each case, the session stayed in `COLLECT_MINIMAL_MEDICAL_FACTS` and the assistant repeated the three follow-up triage questions.

Stored turn results confirmed the issue is happening before FAQ retrieval:
- `suggestion.intent = unknown`
- `dispatchAgent = RecordsAgent`
- `suggestedStage = COLLECT_MINIMAL_MEDICAL_FACTS`

This means the current problem is FAQ recognition and routing, not FAQ answer generation.

## Decision

FAQ must be treated as a default detour capability that is available from every stage.

That means:
- all stages can recognize FAQ-style user input
- FAQ handling does not rewrite the persisted primary stage
- when FAQ handling completes, the session continues from the same persisted primary stage unless the user explicitly performs a progression action

## Canonical Behavior

### 1. All stages must be FAQ-capable

The system must treat FAQ detection as stage-agnostic.

This applies to:
- `COLLECT_MINIMAL_MEDICAL_FACTS`
- `RECOMMENDATION`
- `EXPLAIN_PROCESS`
- `COLLECT_MEDICAL_INPUTS`
- `ONLINE_CONSULT`
- `HUMAN_HANDOFF`

A user asking a FAQ-style question in any stage should be eligible for FAQ detour handling.

### 2. `intent = unknown` should not default back to the current stage agent

For FAQ-like user input, the system must no longer rely on `unknown -> current stage agent` fallback.

Instead, the control plane should do one of two things:
- classify the turn as FAQ and dispatch FAQ handling
- or, if the system cannot confidently determine that the input is FAQ, treat it as truly unknown and use a separate unknown-input behavior

The key rule is:
- FAQ-like questions must not silently collapse into triage continuation just because the classifier returned `unknown`

### 3. FAQ has two answer modes

FAQ handling must support two outcomes.

#### A. Answer found
When the FAQ path returns a reliable answer, the system should surface that answer and keep the persisted primary stage unchanged.

For this codebase, `reliable answer` should be defined explicitly by the same boundary the FAQ path already uses:
- the returned answer text is non-empty
- at least one cited FAQ id is present
- and the returned FAQ confidence is not `low`

#### B. Answer not found
When FAQ category/search cannot produce a reliable answer by that rule, the system should treat the turn as FAQ miss.

In that case, the system should not fake confidence and should not collapse back into the current workflow prompt.

Instead it must respond honestly, for example:
- it cannot find a reliable answer right now
- it can continue the current step
- or the user can ask for a human if needed

The important rule is:
- FAQ miss should produce an explicit FAQ-miss response, not a disguised return to triage collection

## Stage Semantics

### FAQ detour does not rewrite primary stage

FAQ handling is a detour, not progression.

The persisted primary stage remains unchanged while answering FAQ.

Examples:
- a FAQ in `COLLECT_MINIMAL_MEDICAL_FACTS` returns to `COLLECT_MINIMAL_MEDICAL_FACTS`
- a FAQ in `COLLECT_MEDICAL_INPUTS` returns to `COLLECT_MEDICAL_INPUTS`
- a FAQ in `ONLINE_CONSULT` returns to `ONLINE_CONSULT`

### Progression still requires explicit progression actions

FAQ recognition must not be used to advance or reset the main workflow.

Only explicit progression signals should change the primary stage.

## Recognition Boundary

The FAQ recognizer should be widened beyond the current narrow later-stage-only heuristics.

The recognizer should not rely on a hand-maintained list of FAQ families. Instead, the system should use the FAQ classification/search boundary itself as the source of truth:
- if the input is routed into FAQ handling, the FAQ path should attempt category/search resolution
- if category/search returns a reliable answer, return that answer
- if category/search does not return a reliable answer, respond honestly that no reliable FAQ answer was found right now

This means the system does not need to guess a closed set of FAQ families in supervisor logic. The important requirement is:
- FAQ-like user input must be allowed into FAQ handling from every stage
- FAQ miss must be represented as an explicit FAQ miss, not as disguised workflow continuation

## Non-Goals

This change does not introduce:
- automatic document classification
- FAQ-driven progression
- stage-specific FAQ behavior differences
- fake answers when retrieval misses

## Testing Requirements

The implementation must verify all of the following:

1. Early-stage colloquial FAQ routes to FAQ handling
- `do you guys even work on sundays lol`
- `how long are people usually stuck in china for this, roughly`

2. Early-stage standard FAQ routes to FAQ handling
- `What are your hours?`

3. Early-stage external-records question routes to FAQ handling
- `if i already got scans done elsewhere is that okay or annoying for you`

4. FAQ miss does not fall back to triage wording
- no `Please answer these 3 follow-up questions...` when the system has already decided the input is FAQ-like but cannot answer it

5. FAQ detour preserves stage in every stage
- early stage
- recommendation
- explain process
- medical inputs
- online consult
- human handoff

6. Persisted primary stage is verified, not just visible response stage
- tests must verify the stored session stage is unchanged across FAQ detours and FAQ misses

7. Explicit human request remains higher priority than FAQ
- `I want a human.` should still route to `HUMAN_HANDOFF`

## Recommended Implementation Shape

The preferred shape is:
- create a single stage-agnostic FAQ recognition path in supervisor/control-plane logic
- separate FAQ recognition from FAQ answerability
- return a distinct FAQ-miss response when recognition succeeds but retrieval/category resolution fails
- remove stage-specific assumptions that only later stages deserve FAQ detours

## Success Criteria

This design is successful when:
- informal FAQ-like questions are no longer treated as triage continuation by default
- FAQ misses are answered honestly instead of being silently converted into workflow prompts
- all stages behave consistently with the same FAQ detour model
- persisted primary stage remains stable across FAQ detours
