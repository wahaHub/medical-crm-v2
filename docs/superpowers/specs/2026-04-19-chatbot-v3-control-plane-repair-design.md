# Chatbot V3 Control-Plane Repair Design

## Status

Proposed repair spec layered on top of:

- `2026-04-16-chatbot-v3-supervisor-led-contract-design.md`
- `2026-04-18-chatbot-v3-post-intake-conversation-contract-design.md`
- `2026-04-18-chatbot-v3-post-intake-follow-up-and-diagnosis-proof-refinement.md`

This document exists because the latest deployed `chatbot-v3` proved that the post-intake product contract is only partially live. The major remaining failures are not isolated bugs. They come from three shared control-plane defects:

1. richer structured post-intake state is persisted but not actually consumed by the supervisor / authority decision path
2. current journey stage is still reconstructed heuristically instead of persisted as cross-turn truth
3. post-recommendation gates still reflect the older `selected + explained -> consult` model instead of the newer Medora flow

## Why This Exists

The current deployed system already supports:

- post-intake opening acknowledgement
- `TRIAGE_SUBMITTED`
- `TRIAGE_SKIPPED`
- recommendation cards with select / skip actions
- attachment-only requests at the schema boundary

But live session testing still exposed these failures:

1. `RECOMMENDATION_SKIPPED` loops in `RECOMMENDATION` instead of continuing into process explanation
2. selected recommendation sessions can jump to consult too early
3. uploading documents later in the journey can still collapse back to minimal triage
4. same-idempotency-key replays can crash at persistence boundaries
5. recommendation/process/product copy is still downstream of unstable stage truth

Those are not separate bugs to patch one by one. They are symptoms of a control plane that still mixes:

- old boolean compatibility shortcuts
- inferred stage reconstruction
- global attachment heuristics
- incomplete post-recommendation gate semantics

This spec replaces those shortcuts with a smaller, more explicit v1 state model.

## Goals

- Make structured post-intake state the canonical control-plane input for chatbot-v3 progression decisions.
- Persist current journey stage and phase across turns instead of reconstructing them heuristically on every request.
- Remove global attachment override behavior that can reroute later-stage uploads back to minimal triage.
- Make `COLLECT_MEDICAL_INPUTS` a re-enterable supporting-documents stage.
- Allow supporting documents to be uploaded before, during, or after `COLLECT_MEDICAL_INPUTS`, while still letting the stage render and re-enter cleanly.
- Keep the v1 supporting-document contract minimal: only file identity/reference, not document classification.
- Ensure consult progression is gated by the real post-recommendation sequence instead of older boolean shortcuts.
- Fix idempotent replay persistence so repeated turns do not crash on serialized timestamp writebacks.

## Non-Goals

- Adding OCR, document type classification, or LLM-based document labeling.
- Adding user back-and-forth to explain what each uploaded file is.
- Replacing the supervisor-led architecture with a brand-new state machine implementation.
- Changing the broad canonical journey order.
- Designing the final front-end interaction details beyond the action payload semantics already needed by the API.

## Canonical Repair Principles

### 1. No richer-state aliases for control-plane progression

For post-intake progression, richer structured state must not be collapsed back into boolean aliases for supervisor / authority control decisions.

That means the control plane must make decisions directly from structured fields such as:

- `minimalTriageStatus`
- `minimalTriageAnswersSummary`
- `recommendationSelectionStatus`
- `recommendationSelectedHospitalIds`
- `journeyCurrentStage`
- `journeyCurrentPhase`

The following booleans remain valid only where they are truly native booleans and not lossy aliases:

- `process.explained`
- `handoff.active`

The following older booleans must no longer be treated as primary control-plane truth for chatbot-v3 progression:

- `records.minimal_triage.complete`
- `recommendation.generated`
- `recommendation.selected`

They may remain readable for migration / hydration compatibility, but not as the main progression input.

### 2. Persisted journey snapshot becomes the source of truth

Current stage / phase must not be recomputed from coarse booleans on every turn once a session has entered the supervisor-led v3 flow.

A persisted journey snapshot must become the first-class source of truth for:

- the current stage
- the current phase
- re-entry into stage-specific behavior
- repeat / retry / resume semantics

Only legacy sessions that do not yet have persisted journey snapshot fields may use fallback reconstruction.

### 3. Attachment presence is input, not global routing truth

A file attachment is just one input to a turn.

It must not carry global authority to reroute the entire journey back to `COLLECT_MINIMAL_MEDICAL_FACTS`.

Any attachment-bearing turn must be interpreted in the context of:

- persisted current journey stage
- structured action (if present)
- authority-approved stage progression

This explicitly removes the older `attachments_to_minimal_triage` bootstrap shortcut from canonical behavior.

## Revised V1 State Model

## Persisted Journey State

Add or formalize these persisted fields in the session snapshot:

```ts
journeyCurrentStage:
  | 'COLLECT_MINIMAL_MEDICAL_FACTS'
  | 'RECOMMENDATION'
  | 'EXPLAIN_PROCESS'
  | 'COLLECT_MEDICAL_INPUTS'
  | 'ONLINE_CONSULT'
  | 'HUMAN_HANDOFF'

journeyCurrentPhase: 'active' | 'post'
```

Semantics:

- these fields are written from the final authority-approved decision
- they are the default source of truth for next-turn current state
- fallback stage derivation from legacy fields is only for sessions that lack these fields

## Minimal Triage State

Keep the refined minimal triage model from the 4/18 refinement:

```ts
minimalTriageStatus: 'pending' | 'skipped'
minimalTriageAnswersSummary: string | null
```

Semantics:

- `pending + summary != null` means the user answered the follow-up questions
- `skipped + summary == null` means the user explicitly skipped them
- no separate `answered` enum is persisted

## Recommendation Selection State

Keep structured recommendation selection as the canonical truth:

```ts
recommendationSelectionStatus: 'pending' | 'selected' | 'skipped' | null
recommendationSelectedHospitalIds: string[] | null
```

V1 product semantics remain single-select:

- `[]` or `null` when none selected
- exactly one hospital id when selected

## Supporting Documents State

V1 supporting-document state should stay minimal.

Do **not** introduce classification, OCR-derived labels, or LLM-generated document kinds.

Persist only:

```ts
supportingDocuments: Array<{
  path: string
  name: string
}>
```

Semantics:

- this is the canonical v1 truth for documents that have been attached and accepted for the session
- documents may be added before, during, or after `COLLECT_MEDICAL_INPUTS`
- the list is append-oriented, not single-shot
- no document-type interpretation is required in v1

`docUploadStatus` may continue to exist as transport / upload plumbing if the system still needs it, but it is not the primary product truth for progression semantics.

## Control-Plane Input Contract

Supervisor and authority inputs must expand from coarse boolean facts to a proper structured decision context.

Conceptually, the decision input must include:

```ts
{
  current: {
    stage: journeyCurrentStage,
    phase: journeyCurrentPhase,
  },
  triage: {
    status: minimalTriageStatus,
    answersSummary: minimalTriageAnswersSummary,
  },
  recommendation: {
    selectionStatus: recommendationSelectionStatus,
    selectedHospitalIds: recommendationSelectedHospitalIds,
  },
  records: {
    supportingDocuments,
  },
  facts: {
    'process.explained': boolean,
    'handoff.active': boolean,
  }
}
```

The control plane may still expose derived helpers, but those helpers must be derived from the structured state above rather than the older boolean chatbot aliases.

## Revised Journey Semantics

The canonical journey order stays:

1. `COLLECT_MINIMAL_MEDICAL_FACTS`
2. `RECOMMENDATION`
3. `EXPLAIN_PROCESS`
4. `COLLECT_MEDICAL_INPUTS`
5. `ONLINE_CONSULT`
6. `HUMAN_HANDOFF`

What changes is the progression logic between stages.

### 1. `COLLECT_MINIMAL_MEDICAL_FACTS`

This remains the first stage, but it is the post-intake follow-up stage.

Entry behavior:

- acknowledge already-submitted intake
- ask 3 follow-up questions
- allow `TRIAGE_SUBMITTED`
- allow `TRIAGE_SKIPPED`

Completion semantics:

- if summary exists, triage is complete
- if status is `skipped`, triage is also complete

### 2. `RECOMMENDATION`

Recommendation becomes active once triage is complete by either branch:

- answered follow-up
- skipped follow-up

Recommendation stage remains re-enterable for:

- compare
- explain why
- revisit recommendation list

But once the user explicitly chooses one of these actions:

- `RECOMMENDATION_SELECTED`
- `RECOMMENDATION_SKIPPED`

that selection state must become the canonical next-step driver.

### 3. `EXPLAIN_PROCESS`

`EXPLAIN_PROCESS` is the canonical next stage after either:

- hospital selected
- hospital skipped

This means skipped hospital choice is a first-class progression branch, not a loop back into recommendation.

### 4. `COLLECT_MEDICAL_INPUTS`

This stage must be interpreted as:

- the supporting-documents stage
- re-enterable
- not single-shot

It is valid for the system to enter this stage when:

- process explanation has been shown
- the workflow still expects or welcomes supporting documents

It is also valid for users to upload more supporting documents later, even after this stage was previously entered or passed.

Therefore:

- entering this stage does not imply documents were absent before
- leaving this stage does not forbid future uploads
- future uploads must still be accepted and appended to `supportingDocuments`

### 5. `ONLINE_CONSULT`

Consult may no longer be unlocked solely by:

- `recommendation selected`
- `process explained`

The repaired gate must reflect the newer sequence.

At minimum, consult progression must require:

- recommendation choice is resolved in a way the product accepts
- process explanation is complete
- supporting-document expectations for the current workflow are satisfied

This last point must not be modeled as "the user uploaded one special diagnosis-proof file in exactly one stage." Instead it must be modeled against the actual supporting-document truth available to the session.

The exact consult gate should be conservative in v1:

- selected branch should not bypass supporting-documents stage by default
- skipped branch should not bypass process explanation by default

## Attachment Handling Repair

## Remove global attachment bootstrap override

The system must remove the canonical behavior where attachment presence alone implies:

- `suggestedStage = COLLECT_MINIMAL_MEDICAL_FACTS`

This heuristic was historically useful for early upload-first triage flows, but it is now harmful because it ignores persisted journey state.

### Correct behavior

For any turn with attachments:

1. determine current stage from persisted journey snapshot
2. evaluate any explicit structured user action
3. let authority decide whether the stage should stay, advance, or repeat
4. dispatch the records tool/agent mode appropriate to that current stage

### Explicitly forbidden behavior

If the session is already in any later stage such as:

- `RECOMMENDATION`
- `EXPLAIN_PROCESS`
- `COLLECT_MEDICAL_INPUTS`
- `ONLINE_CONSULT`

then merely attaching a file must **not** reset the session to minimal triage.

## Supporting Document Acceptance Contract

When a turn contains attachments and the request is accepted:

- the files should be added to `supportingDocuments`
- the current journey stage should remain authoritative
- a later-stage upload must not erase or override that current stage

This also means `COLLECT_MEDICAL_INPUTS` becomes naturally re-enterable:

- users can upload there
- users can upload again later
- the system still accepts and records the new files

## Idempotent Replay Repair

The current replay crash shows that cached turn results are being replayed across a persistence boundary that still assumes `Date` objects.

The fix must be defined at the boundary contract level:

- write-intent timestamps that cross idempotent replay boundaries must be normalized before repository persistence
- replayed JSON strings must be accepted as valid serialized timestamps and converted safely
- persistence code must not assume that replayed write-intent values are always `Date` instances

This repair is intentionally generic. It must apply to any replayed timestamp-carrying write intent, not only recommendation selection.

## Edge Cases This Spec Intentionally Covers

The repaired design must explicitly support all of the following without falling back to heuristic stage collapse:

1. `TRIAGE_SUBMITTED -> RECOMMENDATION`
2. `TRIAGE_SKIPPED -> RECOMMENDATION`
3. `RECOMMENDATION_SELECTED -> EXPLAIN_PROCESS`
4. `RECOMMENDATION_SKIPPED -> EXPLAIN_PROCESS`
5. `EXPLAIN_PROCESS -> COLLECT_MEDICAL_INPUTS`
6. repeated entry into `COLLECT_MEDICAL_INPUTS`
7. attachment-only supporting-document upload in later stages
8. upload-first supporting documents before formal supporting-document stage entry
9. stale earlier uploads not forcing stage regression
10. selected branch continuity across multiple turns
11. skipped branch continuity across multiple turns
12. repeat explain turns
13. FAQ detours that do not progress the primary journey
14. degraded then retry continuity
15. same `Idempotency-Key` replay on structured actions
16. cross-session isolation
17. later follow-up uploads even after `COLLECT_MEDICAL_INPUTS` was already entered once

## Out of Scope For This Repair

These items remain intentionally out of scope for v1:

- identifying document type from file content
- asking the user to classify each uploaded file
- LLM-generated legal/medical classification of uploaded files
- any claim that a particular document type has been legally verified

## Acceptance Criteria

The repair is successful when all of the following are true:

1. `RECOMMENDATION_SKIPPED` advances into process explanation instead of looping in recommendation.
2. selected recommendation sessions do not jump to consult merely because `process.explained = true`.
3. later-stage attachment uploads no longer collapse the session back into minimal triage.
4. `COLLECT_MEDICAL_INPUTS` can be entered more than once without corrupting session truth.
5. supporting documents uploaded in any valid turn are preserved in a minimal session-level document list.
6. idempotent replay no longer throws on replayed timestamp write intents.
7. post-intake flow remains coherent across answered, skipped, revisit, retry, and detour branches.

## Migration Guidance

Because this repair changes control-plane inputs, migration should follow these principles:

1. persisted journey snapshot fields must be added before relying on them in runtime
2. existing sessions without persisted journey snapshot must still be readable via fallback reconstruction
3. structured post-intake fields should continue to hydrate legacy sessions safely
4. any remaining boolean compatibility reads for older sessions should be treated as fallback-only, not as the main v3 progression contract

## Summary

This repair does not introduce a brand-new architecture. It completes the existing supervisor-led v3 design by making the control plane consume the structured state it already began persisting, by turning current journey stage into real persisted truth, and by removing the old global attachment shortcut that no longer matches the Medora product flow.

The resulting v1 contract stays intentionally small:

- structured post-intake triage state
- structured recommendation selection state
- persisted current journey state
- minimal supporting-document list
- no document classification
- no global attachment override

That is enough to fix the current live failures without solving the wrong problem.
