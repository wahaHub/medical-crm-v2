# Next-Action Memory and Hybrid Recommendation Design

**Date:** 2026-04-04  
**Status:** Draft for review  
**Scope:** Chatbot next-action selection, session-scoped action memory, package action narrowing, and backend-authoritative hybrid hospital recommendation

## 1. Goal

Improve the chatbot so it can:

- choose the most appropriate `next_action` for the current turn
- naturally push that next step in the response when the timing is right
- avoid repeating the same action unnecessarily within the same session
- stop showing `SHOW_PACKAGE` in `REGULAR` flows by default
- separate:
  - explaining the overall medical tourism process
  - explaining online consultation
  - inviting the user to actually move into online consultation
- upgrade hospital recommendation from simple structured filtering to backend-authoritative hybrid retrieval

This design is specifically meant to close the gap observed in real E2E sessions:

- the chatbot can answer many questions
- but it does not yet choose or advance the right next step consistently
- and it can repeat or stall on the wrong action

## 2. Non-Goals

This design does not:

- redesign the public chatbot API contract
- move recommendation authority into Dify
- introduce cross-session action memory
- redesign FAQ category-aware retrieval
- redesign patient-facing conversion routes such as `/chatbot/convert`
- solve package strategy for all future business lines

The design is intentionally scoped to **session-only action memory** and **backend-side policy improvements**.

## 3. Current Problem

The current policy engine already has a backend next-action system:

- `ANSWER_FAQ`
- `SHOW_PACKAGE`
- `REQUEST_DOC_UPLOAD`
- `SHOW_HOSPITAL_RECOMMENDATIONS`
- `EXPLORE_HOSPITAL_RECOMMENDATIONS`
- `EXPLAIN_DOC_UPLOAD`
- `EXPLAIN_CONSULT_PROCESS`
- `SAFETY_HANDOFF`

But current behavior still has three gaps:

1. next-action choice is too limited
2. already-done actions are not tracked explicitly within the session
3. some actions, especially `SHOW_PACKAGE`, appear too broadly

This creates visible product problems:

- a user may ask about process, but the system has no dedicated action for “explain the overall medical tourism flow”
- a user may be ready to move into online consultation, but the system only explains consultation instead of actively inviting that next step
- package promotion can surface in flows where it does not feel natural, especially `REGULAR`
- recommendation logic remains too dependent on simple structured candidate input

## 4. Design Principles

### 4.1 Next action is not a fixed funnel

The chatbot should not follow a hard-coded linear sequence.

The common action progression may often look like:

- `ANSWER_FAQ`
- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- `EXPLAIN_CONSULT_PROCESS`
- `REQUEST_DOC_UPLOAD`
- `EXPLORE_HOSPITAL_RECOMMENDATIONS`
- `SHOW_HOSPITAL_RECOMMENDATIONS`
- `INVITE_ONLINE_CONSULT`

But real conversations will often reorder these steps:

- some users ask for hospitals first
- some users want process first
- some users are ready for consultation quickly
- some users stay in general exploration for a long time

So the policy engine must perform **action selection**, not **step-by-step funnel playback**.

### 4.2 One primary action per turn

Each turn should produce:

- one `primary next action`
- optionally one `secondary action`

The answer should:

- fully answer the current question
- then softly advance only the primary action

This avoids multi-CTA answers and keeps progression readable.

### 4.3 Session-scoped action memory

The first version only needs to remember actions within the current session.

This means:

- no long-horizon cross-session action memory
- no analytics-grade lifecycle model yet
- only enough memory to prevent noisy repetition and enable better action escalation

## 5. Updated Action Catalog

The target backend action catalog becomes:

- `ANSWER_FAQ`
- `EXPLAIN_DOC_UPLOAD`
- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- `EXPLAIN_CONSULT_PROCESS`
- `EXPLORE_HOSPITAL_RECOMMENDATIONS`
- `SHOW_HOSPITAL_RECOMMENDATIONS`
- `REQUEST_DOC_UPLOAD`
- `INVITE_ONLINE_CONSULT`
- `SHOW_PACKAGE`
- `SAFETY_HANDOFF`

### 5.1 New action: `EXPLAIN_MEDICAL_TRAVEL_PROCESS`

Purpose:

- explain the overall Medora journey
- build trust
- orient users who are still asking broad “how does this work?” questions

This is broader than consultation.

It should cover concepts like:

- understanding the case
- document preparation
- initial hospital matching
- online consultation when needed
- recommendation refinement
- travel and treatment planning
- follow-up

This action is grounded primarily by process-related FAQ categories.

### 5.2 New action: `INVITE_ONLINE_CONSULT`

Purpose:

- actively invite the user into the online consultation step when the timing is appropriate

This is distinct from:

- `EXPLAIN_CONSULT_PROCESS`

The distinction is:

- `EXPLAIN_CONSULT_PROCESS` answers:
  - what this step is
  - why it exists
  - how it generally works
- `INVITE_ONLINE_CONSULT` answers:
  - given the current conversation state, it is now reasonable to move into this step

### 5.3 `SHOW_PACKAGE` narrowing

`SHOW_PACKAGE` should no longer be a broad default exploration action.

New rule:

- `COSMETIC`
  - `SHOW_PACKAGE` remains allowed
- `REGULAR`
  - `SHOW_PACKAGE` is disabled by default

Future exceptions are allowed only for clearly package-driven `REGULAR` lines, but that is out of scope for v1.

## 6. Session Action Memory

### 6.1 Why explicit action memory is needed

Current status fields are not enough to answer:

- has the medical travel process already been explained?
- has consultation already been explained?
- did we already invite online consultation recently?

Those questions are not the same as:

- is consultation scheduled?
- are documents uploaded?
- has a recommendation been shown?

So action-memory must be modeled explicitly instead of inferred only from:

- `docUploadStatus`
- `consultationStatus`
- `recommendationStatus`
- `lastNextAction`

### 6.2 Proposed shape

Add a lightweight `actionMemory` object to the session policy state.

Initial fields:

- `medicalTravelProcessExplainedAt`
- `consultProcessExplainedAt`
- `docUploadExplainedAt`
- `docUploadRequestedAt`
- `hospitalRecommendationsExploredAt`
- `hospitalRecommendationsShownAt`
- `onlineConsultInvitedAt`
- `packageShownAt`

All fields are nullable timestamps scoped to the current session.

### 6.3 Action-memory semantics

The first version should follow these rules:

- explanatory actions are usually done once per session unless the user explicitly re-asks
- invitation actions may repeat, but not back-to-back in a spammy way
- recommendation actions may reappear if the conversation genuinely advances

Examples:

- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
  - usually once
- `EXPLAIN_CONSULT_PROCESS`
  - usually once
- `EXPLAIN_DOC_UPLOAD`
  - usually once unless the user asks again
- `REQUEST_DOC_UPLOAD`
  - may be repeated later if still blocked
- `INVITE_ONLINE_CONSULT`
  - may be repeated after meaningful progression, but not every turn

## 7. Next-Action Selection Model

### 7.1 Selection stages

For each turn, backend policy should choose actions in this order:

1. determine what the user most likely needs now
2. determine what the business flow most usefully advances now
3. remove actions that are not allowed for this domain or state
4. suppress actions that were already done recently in this session
5. choose the highest-value remaining action

### 7.2 Selection constraints

The chosen action should pass three tests:

- `should_do_now`
  - is this appropriate for the current message and readiness state?
- `already_done_recently`
  - was it already done in this session in a way that makes repetition low-value?
- `better_next_action_available`
  - is there another action that better advances the user right now?

### 7.3 Domain guardrails

At minimum:

- `REGULAR` cannot default to `SHOW_PACKAGE`
- `SAFETY_HANDOFF` overrides all commercial actions
- `LIGHT_DISCOVERY` should prefer light educational actions over hard conversion pushes

## 8. Response Push Behavior

The response layer should continue to:

- answer the current question first
- append at most one short soft-confirmation CTA

But the CTA must map strictly to backend-selected action.

Example mappings:

- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
  - “If you’d like, I can next walk you through how this usually moves from first review to hospital matching.”
- `EXPLAIN_CONSULT_PROCESS`
  - “If you’d like, I can next explain how the online consultation step usually works.”
- `INVITE_ONLINE_CONSULT`
  - “If you’d like, I can next help you move into the online consultation step.”
- `EXPLORE_HOSPITAL_RECOMMENDATIONS`
  - “If you’d like, I can next narrow this down to a few hospitals that fit your case.”

The CTA must remain:

- soft
- singular
- aligned with action memory
- absent for safety flows

## 9. Hybrid Hospital Recommendation

### 9.1 Why structured filtering alone is not enough

Users often express recommendation needs in complex natural language, not in clean structured fields.

Example:

> I want to go to China for my eye problem. I care more about strong diagnostic capability, an international department that is easy to work with, and follow-up convenience than about flashy marketing.

Simple filtering can capture:

- destination = China
- service area = eye care

But it will usually miss:

- diagnostic-first preference
- lower tolerance for commercial package framing
- follow-up convenience
- international coordination quality

### 9.2 Chosen model

Hospital recommendation should become:

- **backend-authoritative hybrid retrieval**

That means:

1. hard filtering
2. semantic retrieval / reranking
3. backend shortlist decision

### 9.3 Hard filtering

Backend should first eliminate clearly wrong candidates using structured constraints such as:

- destination
- hospital type / service line
- specialty availability
- international patient support
- obviously incompatible capability constraints

### 9.4 Semantic retrieval

After hard filtering, the remaining candidates should be matched semantically against the user’s expressed needs and preferences.

This is where a hospital profile index is useful.

The profile index should contain structured and narrative facts such as:

- specialties
- procedures / treatment focus
- hospital strengths
- international patient process
- travel / coordination qualities
- recovery / follow-up style
- limitations or non-ideal-fit notes

Semantic retrieval does not decide the final shortlist by itself. It improves candidate recall and ranking.

### 9.5 Backend authority remains final

The final shortlist must still be decided by backend policy.

Backend remains responsible for:

- shortlist contents
- reason codes
- why-matched explanation
- next-action progression

Dify should not independently invent hospital recommendations.

## 10. Example Action Progression

### 10.1 Process explanation to consultation invitation

Turn 1 user:

> How do you usually help people go abroad for treatment?

Backend action:

- `EXPLAIN_MEDICAL_TRAVEL_PROCESS`

Assistant:

- explains the overall flow
- lightly offers to explain online consultation next

Turn 2 user:

> Okay, what does the online consultation part usually involve?

Backend action:

- `EXPLAIN_CONSULT_PROCESS`

Assistant:

- explains what online consultation is and why it helps

Turn 3 user:

> I already have some reports and I’m happy to continue.

Backend action:

- `INVITE_ONLINE_CONSULT`

Assistant:

- stops re-explaining the same process
- invites the user into that next step

### 10.2 Recommendation progression

Turn 1 user:

> Can you recommend hospitals for my case?

If readiness is low:

- `EXPLAIN_DOC_UPLOAD`
  or
- `REQUEST_DOC_UPLOAD`

If readiness is moderate:

- `EXPLORE_HOSPITAL_RECOMMENDATIONS`

If backend has a confident shortlist:

- `SHOW_HOSPITAL_RECOMMENDATIONS`

The system should not jump to the same recommendation action repeatedly if it already did so recently without new user progress.

## 11. Interaction With Existing Policy State

This design does not replace:

- `engagementMode`
- `docUploadStatus`
- `recommendationStatus`
- `consultationStatus`

Instead:

- lifecycle state still captures business progress
- action memory captures session-level conversational actions already taken

These two layers must remain distinct.

## 12. Testing and Evaluation

### 12.1 Unit tests

Add targeted tests for:

- action selection under each engagement mode
- `REGULAR` never defaulting to `SHOW_PACKAGE`
- `INVITE_ONLINE_CONSULT` versus `EXPLAIN_CONSULT_PROCESS`
- action repetition suppression using session action memory
- hybrid recommendation fallback and shortlist selection

### 12.2 Session E2E tests

Test full sessions, not isolated turns.

At minimum:

1. general FAQ -> process explanation -> consultation explanation -> consultation invite
2. recommendation ask with low readiness -> document explanation/request
3. recommendation ask with sufficient readiness -> explore/show hospitals
4. same action asked repeatedly -> no spammy repetition
5. `REGULAR` flow -> never defaults to `SHOW_PACKAGE`
6. `SAFETY_HANDOFF` -> no commercial CTA

### 12.3 Review criteria

This design is successful when:

- the chatbot pushes a coherent next step
- it does not repeat actions pointlessly
- `REGULAR` no longer surfaces package promotion as a default
- hospital recommendation becomes capable of handling richer user language without giving Dify final recommendation authority

## 13. Relationship to Existing Specs

This design extends, but does not replace:

- [2026-03-28-medical-tourism-policy-engine-design.md](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-28-medical-tourism-policy-engine-design.md)
- [2026-03-31-faq-category-aware-retrieval-design.md](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-31-faq-category-aware-retrieval-design.md)

It specifically adds:

- explicit session-scoped action memory
- two new backend actions:
  - `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
  - `INVITE_ONLINE_CONSULT`
- `SHOW_PACKAGE` narrowing for `REGULAR`
- backend-authoritative hybrid hospital recommendation
