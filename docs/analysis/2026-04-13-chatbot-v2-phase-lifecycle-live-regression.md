## Chatbot V2 Phase Lifecycle Live Regression

Date: 2026-04-13

### Scope

This note records the first live regression after deploying the phase-lifecycle implementation from:

- `35abf37` `Strengthen chatbot v2 active phase copy`

The goal was to verify:

- `EXPLAIN_PROCESS.pre -> active` entry semantics
- automatic bridge from `EXPLAIN_PROCESS.active` to `COLLECT_MEDICAL_INPUTS.pre`
- FAQ overlay behavior in later stages
- dismiss -> `post` -> next `pre`
- `ONLINE_CONSULT` cannot dismiss
- `HUMAN_HANDOFF` does not rewind
- questionnaire resource behavior in `COLLECT_MEDICAL_INPUTS.active`

### High-Level Result

The new lifecycle is **partially working live**:

- collect / recommendation dismiss-to-post-to-next-pre behavior worked
- later process explanation stayed anchored instead of rewinding
- online consult refused dismiss as designed
- human handoff stayed anchored and did not rewind
- no `progression 502` was observed in this regression

But two important live issues remain:

1. fresh sessions still skip the intended `EXPLAIN_PROCESS.pre` resting state
2. questionnaire access wording still denies the resource even when `QUESTIONNAIRE` is present in `resources`

### Session A: Main Phase Flow

#### A1. Discovery opening is still too eager

Message:

- `What do you do?`

Live result:

- `journeySnapshot = COLLECT_MEDICAL_INPUTS.pre`
- resources already included:
  - `PROCESS_GUIDE`
  - `MEDICAL_DOC_UPLOAD`
  - `QUESTIONNAIRE`
  - `HUMAN_HANDOFF`
  - `MEDICAL_INVITATION_STATUS`

Why this matters:

- by the approved lifecycle, this first turn should still be treated as `EXPLAIN_PROCESS.pre`
- the answer should be discovery + invitation
- instead, the live system is already returning the next stage's `pre`

This means the first-turn invitation gate is still being consumed too early somewhere in the live path.

#### A2. FAQ overlay in collect pre works

Messages:

- `How long does the process usually take?`
- `How long will intake review take?`

Live result:

- both stayed at `COLLECT_MEDICAL_INPUTS.pre`
- both ended with collect-oriented progression language

This part matches the intended overlay model.

#### A3. Explicit intake agreement works

Message:

- `Yes, let us start intake.`

Live result:

- `journeySnapshot = COLLECT_MEDICAL_INPUTS.active`

This matches the intended `pre -> active` consent rule.

#### A4. Collect dismiss path works

Message:

- `I want to skip intake for now.`

Live result:

- returned `journeySnapshot = RECOMMENDATION.pre`
- answer explicitly said the user could come back to intake later

Interpretation:

- pre-turn behavior is consistent with `COLLECT_MEDICAL_INPUTS.post`
- post-turn auto-bridge into `RECOMMENDATION.pre` is happening

This is the intended lifecycle behavior.

#### A5. Recommendation dismiss path works

Messages:

- `Why do I need recommendation?` -> stayed `RECOMMENDATION.pre`
- `Okay, show me the recommendation step.` -> entered `RECOMMENDATION.active`
- `I want to skip recommendation for now.` -> returned `ONLINE_CONSULT.pre`

Live result:

- recommendation FAQ overlay worked
- explicit agreement entered `active`
- dismiss bridged into `ONLINE_CONSULT.pre`

This matches the intended lifecycle.

#### A6. Later process explanation stays anchored

Message:

- `Can you explain the overall process again?`

Live result:

- stayed `ONLINE_CONSULT.pre`
- did not rewind to earlier stages

This matches the approved informational-overlay rule.

#### A7. Online consult cannot dismiss

Messages:

- `Okay, let us start the online consultation step.` -> `ONLINE_CONSULT.active`
- `I want to skip online consult.` -> still `ONLINE_CONSULT.active`

Live result:

- the answer explicitly said the step could not be skipped

This matches the non-dismissible consult rule.

### Session B: Handoff Flow

#### B1. Opening still skips explain pre here too

Message:

- `What do you do?`

Live result:

- again returned `COLLECT_MEDICAL_INPUTS.pre`

So the opening-gate issue is not isolated to the first session.

#### B2. Handoff path stays anchored

Messages:

- `I want a human advisor to take over.` -> `HUMAN_HANDOFF.pre`
- `Yes, send my case to the admin team.` -> `HUMAN_HANDOFF.active`
- `Can you explain what happens next?` -> still `HUMAN_HANDOFF.active`

This confirms:

- handoff pre -> active works
- later explanation does not rewind the session

### Session C: Questionnaire Spot Check

Messages:

- `What do you do?`
- `Yes, let us start intake.`
- `Can you open the questionnaire for me?`

Live result:

- final turn stayed `COLLECT_MEDICAL_INPUTS.active`
- `resources` included `QUESTIONNAIRE`
- but the answer still said, in effect:
  - the questionnaire is the next step
  - the assistant cannot open it unless the option is surfaced in the interface

Why this is still wrong:

- in that live turn, `QUESTIONNAIRE` was already present in `resources`
- so the assistant should acknowledge it as currently available
- it can explain that the user should use the surfaced questionnaire resource
- but it should not narrate it as unavailable

This is narrower than the earlier parser bug, but it is still a live prompt/semantics issue.

### Current Verdict

#### Working live

- collect pre FAQ overlay
- collect `pre -> active`
- collect dismiss -> post -> recommendation pre
- recommendation pre FAQ overlay
- recommendation `pre -> active`
- recommendation dismiss -> post -> online consult pre
- later process explanation in later stages does not rewind
- online consult cannot dismiss
- handoff `pre -> active`
- handoff later explanation stays anchored
- no `progression 502` reproduced in this regression

#### Still broken live

- first-turn discovery still skips `EXPLAIN_PROCESS.pre`
- questionnaire wording still denies current availability even when `QUESTIONNAIRE` is present in `resources`

### Most Likely Next Fixes

1. Fix the live opening gate so a fresh `What do you do?` turn remains anchored at `EXPLAIN_PROCESS.pre` instead of returning `COLLECT_MEDICAL_INPUTS.pre`.
2. Tighten composer semantics for resource-requested questionnaire turns:
   - if `QUESTIONNAIRE` is present in `resources`, answer must acknowledge it as currently available
   - the assistant may still avoid claiming it literally clicks the UI itself
