# Chatbot V3 Post-Intake Conversation Contract Design

## Status

Proposed canonical refinement to the 2026-04-16 supervisor-led contract.

## Why This Exists

The current `chatbot-v3` supervisor-led implementation correctly preserves the high-level journey order and triage-first gating, but its opening conversation behavior still treats the user like a cold-start anonymous patient. That is not the intended product flow.

The real product contract is different:

1. The user reaches AI chat only after completing the front-end basic intake form.
2. The assistant should acknowledge that intake has already been received.
3. The assistant should request 3 additional minimal medical follow-up answers, while allowing the user to explicitly skip them.
4. The system should still generate a real hospital recommendation even when those follow-up answers are skipped, using the existing intake facts.
5. After recommendation, the user may select or skip hospital choice.
6. The assistant should then explain the Medora medical-tourism process and required documents.

This spec refines the conversation contract so prompt behavior, front-end actions, runtime facts, and stage progression all reflect that post-intake reality.

## Goals

- Make the first assistant turn explicitly acknowledge completed intake.
- Preserve `COLLECT_MINIMAL_MEDICAL_FACTS` as the first canonical journey stage, while changing its user-facing semantics from "cold-start intake" to "post-intake follow-up".
- Introduce structured truth for user choices around:
  - answering minimal triage follow-up questions
  - skipping minimal triage follow-up questions
  - selecting recommended hospitals
  - skipping hospital selection
- Ensure recommendation remains a true recommendation stage that can run with either:
  - `basic intake + answered triage follow-up`
  - `basic intake` alone when triage follow-up is skipped
- Keep `JourneyRuntimeAuthority` as the final writer and allow/deny authority.
- Avoid introducing any new dual truth between prompt text, front-end state, and persisted journey facts.

## Non-Goals

- Replacing the existing canonical journey stage order.
- Moving recommendation ahead of minimal triage as a stage.
- Moving process explanation ahead of recommendation by default.
- Making the front-end the source of truth for journey state.
- Defining final front-end component visuals or exact button styling.

## Canonical Journey Interpretation

The journey order remains:

1. `COLLECT_MINIMAL_MEDICAL_FACTS`
2. `RECOMMENDATION`
3. `EXPLAIN_PROCESS`
4. `COLLECT_MEDICAL_INPUTS`
5. `ONLINE_CONSULT`
6. `HUMAN_HANDOFF`

What changes is the meaning of the earliest user-facing turns.

### `COLLECT_MINIMAL_MEDICAL_FACTS`

This stage should now be interpreted as:

- assistant acknowledges pre-chat intake has already been received
- assistant asks 3 minimal medical follow-up questions
- user may answer or explicitly skip
- stage completes when follow-up status becomes either:
  - `answered`
  - `skipped`

This stage is no longer allowed to behave like a cold-start generic intake assistant that ignores already-submitted basic intake facts.

## Minimal New Truth Contract

Add only the minimum extra structured facts needed for the new flow.

### 1. Intake acknowledgement

```ts
intake.received: true
intake.acknowledged: boolean
```

Semantics:
- `intake.received` is an upstream precondition supplied by the surrounding product flow.
- `intake.acknowledged` becomes `true` only once the assistant has actually shown the post-intake opening acknowledgement.

### 2. Minimal triage follow-up status

```ts
records.minimal_triage.status: 'pending' | 'answered' | 'skipped'
records.minimal_triage.answersSummary: string | null
records.minimal_triage.complete: boolean // compatibility alias during rollout
```

Semantics:
- `pending`: 3 follow-up questions still need user action
- `answered`: user answered; summary is available for recommendation
- `skipped`: user explicitly skipped the follow-up questions; recommendation may still proceed
- `complete`: compatibility alias required by existing gates; it must be derived from `status !== 'pending'` and may not diverge

### 3. Recommendation presentation and selection

```ts
recommendation.presented: boolean
recommendation.selection.status: 'pending' | 'selected' | 'skipped'
recommendation.selection.selectedHospitalIds: string[]
recommendation.selected: boolean // compatibility alias during rollout
```

Semantics:
- `presented`: recommendation results were actually shown to the user
- `pending`: recommendation shown, no selection action yet
- `selected`: user selected a hospital
- `skipped`: user explicitly chose not to select a hospital yet
- `selected` boolean alias: required by existing runtime gates during rollout; it must be derived from `selection.status === 'selected'` and may not diverge

V1 selection semantics are **single-select** at the product level.
`selectedHospitalIds` remains an array only for forward compatibility, but in v1 it must contain either:
- `[]`
- or exactly one hospital id

### 4. Process explanation

Keep the existing semantic truth:

```ts
process.explained: boolean
```

Semantics remain unchanged:
- this may only become `true` when the process explanation path is actually rendered to the user

## Authority And Write Ownership

This spec keeps the same ownership model used by supervisor-led v3.

### Persisted write shape

The current supervisor-led runtime still depends on boolean compatibility facts for some stage gates.
Therefore this refinement requires the authority-owned write contract to expand from "boolean-only facts" into a single final write that can atomically persist:

1. structured domain status patches
2. compatibility boolean aliases that existing runtime logic still consumes

Conceptually, one authority-approved write should be able to persist both of the following in the same final write path:

```ts
structuredStatusPatch: {
  intake?: { acknowledged?: boolean }
  records?: {
    minimal_triage?: {
      status?: 'pending' | 'answered' | 'skipped'
      answersSummary?: string | null
    }
  }
  recommendation?: {
    presented?: boolean
    selection?: {
      status?: 'pending' | 'selected' | 'skipped'
      selectedHospitalIds?: string[]
    }
  }
}

factsPatch: {
  'records.minimal_triage.complete'?: boolean
  'recommendation.selected'?: boolean
  'process.explained'?: boolean
}
```

Authority remains the single writer because both patches are emitted and persisted together as one final authority-approved write.

### Compatibility and migration rule

To avoid dual truths:

- `records.minimal_triage.status` is the richer semantic truth
- `records.minimal_triage.complete` is a derived compatibility alias
- `recommendation.selection.status` is the richer semantic truth
- `recommendation.selected` is a derived compatibility alias

During rollout, the authority must write both the structured field and its compatibility boolean alias **atomically**.
No other writer may update either side independently.

### Front-end responsibility

The front-end may submit structured user action signals, for example:

- `TRIAGE_ANSWERED`
- `TRIAGE_SKIPPED`
- `RECOMMENDATION_SELECTED`
- `RECOMMENDATION_SKIPPED`

But the front-end does **not** directly write canonical truth.

### Runtime responsibility

Runtime interprets the submitted structured signals and routes them into the canonical domains.

### Authority responsibility

`JourneyRuntimeAuthority` remains the only final writer.

It must be the only component allowed to write:

- `intake.acknowledged`
- `records.minimal_triage.status`
- `records.minimal_triage.answersSummary`
- `recommendation.presented`
- `recommendation.selection.status`
- `recommendation.selection.selectedHospitalIds`
- `process.explained`

This preserves the existing single-writer guarantee and avoids new dual truths.

## Conversation Contract

## 1. First assistant opening

### Trigger

- `intake.received = true`
- `intake.acknowledged != true`
- current stage is `COLLECT_MINIMAL_MEDICAL_FACTS`

### Assistant behavior

The assistant should say the equivalent of:

- greeting / welcome
- confirmation that Medora already received the user’s basic intake
- explanation that 3 additional questions are needed to refine matching
- explicit statement that the user may either answer or skip

### Forbidden behavior

The assistant must not open as if the user has submitted nothing.

Examples of forbidden cold-start framing:
- generic anonymous medical intake opening
- wording that implies no intake information has already been received
- repeatedly asking the same intake-from-scratch question set every turn

### Truth write

After this opening is actually rendered:

```ts
intake.acknowledged = true
records.minimal_triage.status = 'pending'
```

## 2. Minimal triage follow-up

### Trigger

- stage: `COLLECT_MINIMAL_MEDICAL_FACTS`
- `records.minimal_triage.status = 'pending'`

### Assistant behavior

The assistant asks 3 follow-up questions framed as refinement on top of existing intake, not replacement intake.

Preferred framing:
- "Based on the information you already submitted..."
- "To refine the hospital recommendation..."
- "You can answer these now or skip for now."

### User options

- answer the follow-up questions
- explicitly skip the follow-up questions

### Truth writes

If answered:

```ts
records.minimal_triage.status = 'answered'
records.minimal_triage.answersSummary = compact summary
records.minimal_triage.complete = true // derived compatibility alias
```

If skipped:

```ts
records.minimal_triage.status = 'skipped'
records.minimal_triage.answersSummary = null
records.minimal_triage.complete = true // derived compatibility alias
```

### Stage advancement rule

When `records.minimal_triage.status` transitions from `pending` to either `answered` or `skipped`, the next default main-journey step must become `RECOMMENDATION`.

That progression should be automatic unless the turn is explicitly routed into a non-progressing detour such as FAQ/resource handling.
The session must not remain stuck in `COLLECT_MINIMAL_MEDICAL_FACTS` once follow-up completion is committed.

## 3. Recommendation stage

### Trigger

- stage moves to `RECOMMENDATION`
- allowed when `records.minimal_triage.status` is either:
  - `answered`
  - `skipped`

### Recommendation source contract

`RecommendationAgent` must produce real recommendation results in both cases.

#### Case A: answered follow-up

Recommendation uses:
- basic intake facts
- minimal triage answer summary

Assistant framing should explicitly say recommendation uses both the intake and the newly provided follow-up information.

#### Case B: skipped follow-up

Recommendation uses:
- basic intake facts only

Assistant framing should explicitly say this is an initial recommendation based on the submitted intake, and that answering the follow-up questions later can improve precision.

### Truth write

When recommendation results are actually rendered:

```ts
recommendation.presented = true
recommendation.selection.status = 'pending'
recommendation.selection.selectedHospitalIds = []
recommendation.selected = false // derived compatibility alias
```

## 4. Hospital selection

### User options

After recommendation is shown, the user may:
- select exactly one hospital in v1
- explicitly skip selection for now

### Truth writes

If selected:

```ts
recommendation.selection.status = 'selected'
recommendation.selection.selectedHospitalIds = [hospitalId] // exactly one in v1
recommendation.selected = true // derived compatibility alias
```

If skipped:

```ts
recommendation.selection.status = 'skipped'
recommendation.selection.selectedHospitalIds = []
recommendation.selected = false // derived compatibility alias
```

## 5. Process explanation

### Trigger

Default path:
- recommendation was shown
- hospital selection status is either:
  - `selected`
  - `skipped`
- `process.explained != true`

### Assistant behavior

If selected:
- acknowledge the selected hospital(s)
- explain the next Medora process and relevant medical-tourism documents

If skipped:
- acknowledge that no hospital has been selected yet
- explain the Medora process and documents anyway so the user can continue evaluating next steps

### Truth write

Only when the explanation is actually rendered:

```ts
process.explained = true
```

## Prompt/Composer Implications

This contract implies changes in three distinct layers.

### 1. Prompt layer

Prompt changes are required for:
- post-intake opening wording
- follow-up question framing
- recommendation wording for answered vs skipped follow-up
- process explanation wording after selected vs skipped hospital choice

### 2. Response composition layer

`response-composer` must stop defaulting to generic cold-start triage copy when `intake.received = true`.

It should render distinct variants for:
- intake acknowledged opening
- triage pending follow-up
- recommendation with answered follow-up
- recommendation with skipped follow-up
- process explanation after selected hospital(s)
- process explanation after skipped selection

### 3. Runtime / facts layer

Runtime must map structured user actions into authority-reviewed writes so these flows are stateful and replayable.

This is why prompt-only change is insufficient.

## Why Prompt-Only Is Not Enough

Changing prompts alone would improve copy but still leave the core state machine ambiguous.

Without structured truth for:
- triage answered vs skipped
- hospital selected vs skipped

recommendation and process explanation would still rely on inference from text or front-end-only state, recreating the same dual-truth problem that supervisor-led v3 was designed to eliminate.

Therefore the correct implementation shape is:

- contract-first truth updates
- prompt/composer alignment on top
- authority-owned writes throughout

## Testing Implications

The following real behavior must be testable.

### Required session checks

1. post-intake first turn acknowledges intake before asking follow-up questions
2. user answers follow-up -> recommendation is generated from intake + follow-up
3. user skips follow-up -> recommendation is still generated from intake-only
4. user selects hospital -> process explanation follows selection acknowledgement
5. user skips hospital selection -> process explanation still follows, with skipped-selection acknowledgement
6. no path regresses back to cold-start anonymous intake wording when `intake.received = true`

### Regression checks

- `FAQ`/resource detours still must not auto-progress the main journey
- `process.explained` still must only write on actual render
- `JourneyRuntimeAuthority` remains the only final writer

## Recommended Implementation Direction

Implementation should proceed as:

1. extend the canonical truth contract with the minimal new facts above
2. wire structured user action signals into runtime and authority writes
3. update records/recommendation/process prompt contracts
4. update response composition so post-intake opening and skip/selection variants render correctly
5. add session-level tests for the new flow

## Canonical Decision

The canonical product flow after this refinement is:

1. user completes basic intake before reaching chat
2. assistant acknowledges receipt of intake
3. assistant asks 3 follow-up questions
4. user may answer or skip
5. system generates recommendation either way
6. user may select one hospital or skip selection
7. assistant explains process and required documents

This is the intended post-intake conversation contract for supervisor-led `chatbot-v3`.
