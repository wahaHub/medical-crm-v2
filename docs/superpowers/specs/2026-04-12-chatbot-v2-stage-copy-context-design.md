# Chatbot V2 Stage Copy Context Design

Date: 2026-04-12

## Purpose

This spec upgrades `chatbot-v2` stage copy from a thin placeholder sentence into a structured reference-answer layer that gives the composer stronger, more persuasive, and safer grounding for `pre` and `post` phases.

The goal is not to let the LLM invent better sales copy.

The goal is to:

- keep `stage + phase` as the main journey state
- keep `truthSummary` small
- keep FAQ grounding separate
- make `pre/post` answers more useful and more convincing
- allow the composer to reference real hospital or doctor context only when that context is actually available and trusted

## Problem

The current `StageCopyRegistryService` returns one short generic sentence per `pre/post` phase.

That is too weak for real user conversations.

Examples of what is currently missing:

- `COLLECT_MEDICAL_INPUTS.pre` should explain why submitting records matters, especially for the patient's condition
- `RECOMMENDATION.pre` should explain why the shortlisted hospitals or packages are relevant and what makes them a fit
- `ONLINE_CONSULT.pre` should explain why this step is required and why it matters before arranging the next medical-travel step

Right now the composer receives:

- the current stage and phase
- stage copy as one sentence
- truth summary
- resources

That is enough for structure, but not enough for persuasive, grounded explanation.

## Design Summary

The new stage-copy design has two layers.

### Layer 1: Canonical stage copy

This remains fixed, system-owned, and deterministic.

For every meaningful `pre/post` phase, we provide a structured reference answer rather than a single sentence.

The composer should treat this as the canonical explanation for:

- what this step is
- why it exists
- why it matters now
- what the patient should expect next

### Layer 2: Contextual stage-copy augmentation

This is a separate, safe context layer that may enrich the canonical stage copy with facts drawn from trusted CRM state.

Examples:

- active hospital name
- recommendation kind
- hospital or doctor summary snippets that come from trusted backend sources
- patient-specific journey context such as already-submitted materials or already-accepted recommendation

This layer does not replace canonical stage copy.

It only enriches it.

## Non-Goals

This spec does not:

- redesign the classifier
- redesign FAQ grounding
- change the `truthSummary` model
- reintroduce `deriveSnapshot()`
- let the LLM invent hospital facilities, doctor expertise, or clinical promises

## Proposed Data Model

### Canonical stage copy model

Instead of:

```ts
type StageCopyReference = {
  stage: ChatJourneyStage;
  phase: ChatJourneyPhase;
  referenceText: string;
};
```

move to a structured form:

```ts
type StageCopyReference = {
  stage: ChatJourneyStage;
  phase: ChatJourneyPhase;
  purpose: string;
  whyNow: string;
  whyItMatters?: string;
  requirementLevel: 'optional' | 'recommended' | 'required';
  nextStepHint?: string;
};
```

This stays deterministic and registry-owned.

The composer can still receive a JSON form of it and restate it naturally.

### Context augmentation model

Add an optional contextual layer:

```ts
type StageCopyContext = {
  activeHospital?: {
    hospitalId: string;
    hospitalName: string | null;
  } | null;
  recommendationKind?: 'hospital' | 'package' | null;
  hospitalBrief?: {
    summary?: string | null;
    facilityHighlights?: string[];
  } | null;
  doctorBrief?: {
    doctorName?: string | null;
    expertise?: string | null;
    summary?: string | null;
  } | null;
};
```

The composer should only receive fields that are actually available from trusted CRM sources.

If a field is not available, it must be omitted or null.

## Source-of-Truth Rules

### Canonical stage copy

This is always local, deterministic, and owned by CRM code.

It should not come from Dify, FAQ grounding, or freeform prompts.

### Context augmentation

This may only use trusted backend sources.

Allowed examples:

- `activeHospitalContext` already produced by the policy/context builder
- recommendation-linked hospital or package information already present in CRM state
- hospital info and surgeon/materials summaries retrieved from existing CRM-backed materials endpoints or use cases

Not allowed:

- LLM-generated facility claims
- LLM-generated doctor credentials
- inferred disease-to-hospital fit not backed by actual CRM data

## Stage-Specific Content Plan

### `COLLECT_MEDICAL_INPUTS.pre`

Canonical goals:

- explain that records and questionnaire answers help the team and doctors understand the case more accurately
- explain that this is especially important before any serious recommendation
- explain that better input quality leads to more precise next-step guidance

Context augmentation:

- if the user has already described a condition in the conversation summary, the composer may say "for your case" or "for your situation"
- this should still remain high-level unless a trusted medical summary exists

### `COLLECT_MEDICAL_INPUTS.post`

Canonical goals:

- confirm receipt
- explain that the journey can now move into recommendation
- set expectation that the submitted information is now the basis for the next step

### `RECOMMENDATION.pre`

Canonical goals:

- explain that recommendations are being prepared from submitted materials
- explain that the shortlist is meant to be a fit for the patient, not a random list
- explain that facilities, doctor expertise, and treatment fit are considered

Context augmentation:

- if active hospital or recommendation context exists, name the hospital
- if safe hospital brief data exists, mention why the facility is relevant
- if safe doctor brief data exists, mention expertise only from trusted fields

### `RECOMMENDATION.post`

Canonical goals:

- confirm that a recommendation direction has been accepted
- explain that the next step is operational preparation for online consultation

### `ONLINE_CONSULT.pre`

Canonical goals:

- explain that online consultation is required
- explain that it cannot be dismissed or skipped in the current design
- explain that it helps prepare the next real medical-travel step

Context augmentation:

- if a trusted hospital or doctor brief exists, mention why this consult is valuable with that team
- never invent prestige or expertise claims

### `ONLINE_CONSULT.post`

Canonical goals:

- confirm submission
- explain what happens next without rewinding the journey

### `HUMAN_HANDOFF.pre`

Canonical goals:

- explain that the case can now be sent to the administrator or care team
- ask whether the patient wants handoff now

### `HUMAN_HANDOFF.post`

Canonical goals:

- confirm that the case has already been sent
- explain that the human team will contact the patient within 24 hours

## Composer Contract Changes

The composer should continue receiving `chatbotV2`, but `stageCopy` should become structured.

Instead of one string:

```json
{
  "stageCopy": {
    "stage": "ONLINE_CONSULT",
    "phase": "pre",
    "referenceText": "..."
  }
}
```

it should receive:

```json
{
  "stageCopy": {
    "stage": "ONLINE_CONSULT",
    "phase": "pre",
    "purpose": "...",
    "whyNow": "...",
    "whyItMatters": "...",
    "requirementLevel": "required",
    "nextStepHint": "..."
  },
  "stageCopyContext": {
    "activeHospital": {
      "hospitalId": "h_123",
      "hospitalName": "Example Hospital"
    },
    "hospitalBrief": {
      "summary": "...",
      "facilityHighlights": ["..."]
    },
    "doctorBrief": {
      "doctorName": "Dr. X",
      "expertise": "..."
    }
  }
}
```

The composer prompt should explicitly say:

- canonical stage copy is the authoritative explanation for this phase
- context augmentation may be used only when present
- do not invent hospital, facility, or doctor claims beyond the provided context

## First Iteration Scope

To keep rollout safe, the first implementation should be intentionally narrow.

### Included in first iteration

- upgrade `StageCopyRegistryService` from a single `referenceText` to structured canonical fields
- pass structured `stageCopy` into `chatbotV2`
- add optional `stageCopyContext`
- wire `activeHospitalContext` into `stageCopyContext`
- wire only safe, already-available hospital context first
- update composer prompt to use the richer stage-copy structure

### Explicitly not included in first iteration

- building a brand-new recommendation-summary subsystem
- building a full doctor-ranking explanation layer
- fetching arbitrary hospital facts at compose time
- emitting claims that are not already present in CRM-owned data

## Why This Is The Right Increment

This keeps the architecture aligned with the agreed model:

- FAQ answers still come from FAQ grounding
- journey state still comes from `stage + phase`
- business facts still stay small
- stage persuasion is now stronger, but still controlled

It also avoids a common failure mode:

- turning stage copy into vague prompt-writing
- or letting the LLM make up medical-fit arguments

## Implementation Direction

At a high level, implementation should proceed in this order:

1. change `StageCopyReference` to a structured shape
2. update `StageCopyRegistryService` to return structured canonical copy
3. define `StageCopyContext`
4. thread `stageCopyContext` into `chatbot-v2` turn building
5. populate first-iteration safe fields such as `activeHospitalContext`
6. update composer DSL parsing and prompt rules
7. add regression tests proving:
   - `COLLECT_MEDICAL_INPUTS.pre` explains precision/value of submitted materials
   - `RECOMMENDATION.pre` can safely mention contextual fit when hospital context exists
   - `ONLINE_CONSULT.pre` clearly says this step is required
   - composer does not invent unsupported hospital/doctor claims

## Open Constraint

The main quality bar for this work is:

- better explanations
- stronger persuasion
- no hallucinated medical-fit reasoning

If the required hospital or doctor context is not available from trusted CRM data, the system should fall back to strong canonical copy rather than improvise.
