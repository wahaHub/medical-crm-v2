# Chatbot V3 Post-Intake Follow-Up And Diagnosis-Proof Refinement

## Status

Proposed refinement that supersedes the triage-status and `COLLECT_MEDICAL_INPUTS` portions of:
- `docs/superpowers/specs/2026-04-18-chatbot-v3-post-intake-conversation-contract-design.md`

## Why This Exists

The first 2026-04-18 post-intake spec correctly moved `chatbot-v3` away from cold-start intake behavior, but two product details need to be tightened before implementation:

1. Minimal triage should not persist a separate explicit `answered` status. If the patient answered the 3 follow-up questions, that truth is already represented by `records.minimal_triage.answersSummary`.
2. `COLLECT_MEDICAL_INPUTS` should not behave like generic medical-records collection. In the Medora flow, this stage is a narrower document step: the patient uploads a medical diagnosis proof / diagnosis certificate / diagnosis-supporting document.

This refinement keeps the same supervisor-led control plane and journey order, but simplifies the triage truth model and narrows the later records stage to a file-proof step.

## Canonical Decisions

### 1. Minimal triage has no explicit `answered` status

The persisted post-intake triage contract becomes:

```ts
records.minimal_triage.status: 'pending' | 'skipped'
records.minimal_triage.answersSummary: string | null
records.minimal_triage.complete: boolean // compatibility alias during rollout
```

Semantics:
- `status = 'pending'` means the user has not explicitly skipped the 3 follow-up questions.
- `status = 'skipped'` means the user explicitly skipped the 3 follow-up questions.
- `answersSummary != null` means the user answered the follow-up questions well enough for recommendation.
- `records.minimal_triage.complete` is a compatibility alias derived from:
  - `answersSummary != null`, or
  - `status === 'skipped'`

There is no third persisted `answered` state.

### 2. Stage advancement out of minimal triage

`COLLECT_MINIMAL_MEDICAL_FACTS` completes when either of the following becomes true:
- `records.minimal_triage.answersSummary != null`
- `records.minimal_triage.status === 'skipped'`

The next default main-journey step then becomes `RECOMMENDATION`.

### 3. Structured user action naming

The canonical action signals for this flow become:
- `TRIAGE_SUBMITTED`
- `TRIAGE_SKIPPED`
- `RECOMMENDATION_SELECTED`
- `RECOMMENDATION_SKIPPED`

`TRIAGE_SUBMITTED` means the user has submitted follow-up content in this turn; it does **not** create a second persisted `answered` truth. The persisted truth is still the resulting `answersSummary`.

### 4. Recommendation source contract

Recommendation must remain real and grounded in both branches:

- If `answersSummary != null`:
  - recommendation uses `basic intake + minimal triage answer summary`
- If `status === 'skipped'`:
  - recommendation uses `basic intake` only

The assistant copy should explicitly distinguish these two cases.

### 5. `COLLECT_MEDICAL_INPUTS` means diagnosis-proof upload

The canonical journey order is unchanged:
1. `COLLECT_MINIMAL_MEDICAL_FACTS`
2. `RECOMMENDATION`
3. `EXPLAIN_PROCESS`
4. `COLLECT_MEDICAL_INPUTS`
5. `ONLINE_CONSULT`
6. `HUMAN_HANDOFF`

But `COLLECT_MEDICAL_INPUTS` is now interpreted more narrowly:
- this is the diagnosis-proof upload step
- the user is asked to upload medical diagnosis proof / diagnosis certificate / diagnosis-supporting documents
- this is not a generic freeform records interview about scans, treatments, medications, and history

### 6. `COLLECT_MEDICAL_INPUTS` completion signal

This refinement does not invent a second new domain truth tree for diagnosis proof.
It should continue to reuse the existing upload/session snapshot surface where possible, especially `docUploadStatus`, as the operational completion signal for the upload step, **but only after stage entry has reset earlier generic upload residue**.

Product semantics:
- `docUploadStatus = none | not_started` means diagnosis proof still missing
- `docUploadStatus = submitted | ready | completed` means the diagnosis-proof upload step has materially progressed

Required provenance/reset rule:
- entering `COLLECT_MEDICAL_INPUTS` must reset stale pre-stage upload state so earlier unrelated uploads do not satisfy this step by accident
- this slice may reuse `docUploadStatus`, but it may not inherit a preexisting generic upload as proof that diagnosis-proof upload has already been completed

If later work needs a more explicit `records.diagnosis_proof.*` domain contract, that can be a separate refinement. It is out of scope for this change.

## Assistant Behavior

### Post-intake opening

The first assistant turn remains:
- greeting / welcome
- acknowledgement that Medora already received the basic intake
- request for 3 additional follow-up questions
- explicit statement that the patient may answer or skip

Truth write after the opening is actually shown:

```ts
intake.acknowledged = true
records.minimal_triage.status = 'pending'
```

### Triage follow-up completion

If the user answers:

```ts
records.minimal_triage.status = 'pending'
records.minimal_triage.answersSummary = compact summary
records.minimal_triage.complete = true
```

If the user skips:

```ts
records.minimal_triage.status = 'skipped'
records.minimal_triage.answersSummary = null
records.minimal_triage.complete = true
```

### Recommendation wording

If `answersSummary != null`:
- the assistant should say recommendation is based on the submitted intake plus the follow-up medical details the patient just provided

If `status === 'skipped'`:
- the assistant should say recommendation is an initial recommendation based on the submitted intake alone, and can be refined later if the patient provides more medical detail

### Diagnosis-proof upload wording

When the journey reaches `COLLECT_MEDICAL_INPUTS`, assistant copy should say the equivalent of:
- the next step is to upload diagnosis proof / diagnosis certificate / supporting diagnostic document
- this document helps the team prepare the next medical-tourism workflow steps

Forbidden behavior in this stage:
- reopening generic symptom questions
- asking broad medical-history collection prompts as though the user is still in records triage

## Runtime / Authority Ownership

The ownership model does not change:
- front-end submits structured user actions
- runtime interprets them
- `JourneyRuntimeAuthority` remains the single final writer

Authority remains the only component allowed to write:
- `intake.acknowledged`
- `records.minimal_triage.status`
- `records.minimal_triage.answersSummary`
- `records.minimal_triage.complete`
- `recommendation.presented`
- `recommendation.selection.status`
- `recommendation.selection.selectedHospitalIds`
- `process.explained`

## Migration Rules

### Legacy `answered` hydration

If any local persisted rows or rollout code paths still contain `minimalTriageStatus = 'answered'`, hydration must normalize them to the new canonical shape:
- `minimalTriageStatus -> 'pending'`
- preserve `minimalTriageAnswersSummary` if already stored
- if summary is missing, attempt a best-effort synthesis from existing compact conversation/session summary only when that synthesis is reliable
- if no reliable summary can be synthesized, normalize to the safe incomplete shape instead:
  - `minimalTriageStatus = 'pending'`
  - `minimalTriageAnswersSummary = null`
  - `minimalTriageComplete = false`

This avoids preserving an impossible state such as `pending + null summary + complete=true`.
No newly persisted row may continue writing `'answered'` after this refinement lands.

### Compatibility alias rule

To avoid dual truth:
- `records.minimal_triage.complete` must be derived from `answersSummary != null || status === 'skipped'`
- no component may independently persist `complete = false` while `answersSummary != null`
- no component may independently persist `complete = false` while `status === 'skipped'`

## Required Testing Updates

Implementation and regression coverage must explicitly prove:
- triage completion via `answersSummary` without a persisted `answered` status
- triage completion via explicit skip
- recommendation wording for summary-backed vs skipped follow-up
- diagnosis-proof upload wording and cards during `COLLECT_MEDICAL_INPUTS`
- earlier generic uploads do not automatically satisfy the diagnosis-proof step after stage entry
- `COLLECT_MEDICAL_INPUTS` no longer falls back to generic medical-collection prompts
- legacy `'answered'` hydration normalizes into the new contract without dual truth, including the summary-missing fallback case
