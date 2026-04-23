# Chatbot V3 Comprehensive Architecture And Conversation Spec

Date: 2026-04-23
Status: Integrated overview
Audience: Anyone who needs to understand Medora `chatbot-v3` without prior project context

## 1. Why This Document Exists

`chatbot-v3` has evolved through several focused design documents:

- supervisor-led control plane
- post-intake conversation contract
- post-intake triage refinement
- control-plane repair
- FAQ recognition and detour behavior

Those documents are still useful, but they assume some background and each one focuses on one slice of the system.

This document is different.

Its job is to explain the full `chatbot-v3` system in one place:
- what the system is trying to do
- how one chat turn flows through the runtime
- what each component is responsible for
- what state is persisted and why
- how the main medical-tourism journey works
- how FAQ, human handoff, process explanation, and supporting-document upload fit into that journey

This is the best entry document for a new engineer, reviewer, product partner, or future AI agent.

## 2. Product Goal In Plain Language

The Medora patient does **not** enter `chatbot-v3` as a cold-start anonymous user.

Before chat begins, the product already collected a basic intake form.
That means chat starts from a partially-known patient state.

The chatbot's job is to guide that patient through a structured medical-tourism journey:

1. acknowledge that basic intake has already been received
2. ask 3 short follow-up medical questions, while allowing the patient to skip
3. generate hospital recommendations
4. let the patient select a hospital or skip selection for now
5. explain the Medora process
6. collect supporting medical documents
7. move into online consultation
8. escalate to a human when needed

The system should feel guided, not chaotic.
It should proactively move the patient to the next useful step, while still allowing FAQ detours and human escalation.

## 3. The Core Mental Model

The easiest way to understand `chatbot-v3` is this:

- there is one **primary journey**
- there are also **detours**
- the primary journey is persisted across turns
- detours answer the current question without rewriting the primary journey

The primary journey is the main workflow the patient is moving through.
Detours are side conversations such as:
- FAQ questions
- process clarifications
- human escalation

A patient can ask a side question in the middle of the journey, get an answer, and then continue from the same saved primary stage.

## 4. Primary Journey Stages

The canonical primary journey order is:

1. `COLLECT_MINIMAL_MEDICAL_FACTS`
2. `RECOMMENDATION`
3. `EXPLAIN_PROCESS`
4. `COLLECT_MEDICAL_INPUTS`
5. `ONLINE_CONSULT`
6. `HUMAN_HANDOFF`

What these stages mean in plain English:

### `COLLECT_MINIMAL_MEDICAL_FACTS`
This is the post-intake follow-up stage.
The assistant acknowledges that Medora already received the basic intake, then asks 3 short medical follow-up questions.
The patient may answer or explicitly skip.

### `RECOMMENDATION`
This is the hospital recommendation stage.
The system shows real recommendation results.
The patient may compare, revisit, re-open choice, select a hospital, or skip selection for now.

### `EXPLAIN_PROCESS`
This is the process-overview stage.
The system explains the Medora medical-tourism workflow: recommendation, documents, consultation, and next operational steps.
This stage is system-rendered and does not require a normal agent dispatch.

### `COLLECT_MEDICAL_INPUTS`
This is the supporting-documents stage.
The patient uploads diagnosis proof or other supporting medical documents.
This stage is re-enterable, and documents can continue to be uploaded later as well.

### `ONLINE_CONSULT`
This is the online consultation stage.
Once the patient has selected a hospital, seen the process explanation, and uploaded at least one supporting document, the workflow can move here.

### `HUMAN_HANDOFF`
This is the escalation stage.
The patient asks for a human, or the system escalates to a human support path.

## 5. A Realistic End-To-End Example

A typical happy path looks like this:

```text
User: Hello
Assistant: We already received your basic intake. I just need 3 short follow-up answers, and you can also skip them if you prefer.

User: Confirmed lung cancer. Diagnosed three months ago. PET-CT and pathology completed.
Assistant: This recommendation is based on your submitted intake and the follow-up medical details you just shared.
Assistant: [hospital recommendation list]

User: Select first hospital.
Assistant: Here is the process: first we review the recommendation, then we collect supporting documents, then we move into online consultation.

User: Okay, what is next?
Assistant: Please upload your diagnosis proof or another supporting medical document.

User: uploads diagnosis-certificate.pdf
Assistant: [supporting-document acknowledgement]

User: What is next now?
Assistant: [online consultation response]
```

That path demonstrates the intended progression:

- post-intake follow-up
- recommendation
- process explanation
- supporting-document upload
- online consultation

## 6. A Second Example: Skip Branch

A patient does not have to answer the 3 follow-up questions.
Skipping is a valid workflow branch.

```text
User: Hello
Assistant: We already received your basic intake. I have 3 short follow-up questions, but you can skip them if you want.

User: Skip for now.
Assistant: This recommendation is based on the intake you already submitted.
Assistant: [hospital recommendation list]

User: Skip hospital selection.
Assistant: Here is the Medora process and the next steps.
```

The system should still:
- generate recommendation
- allow process explanation
- continue later into supporting documents and consultation

The recommendation wording should be different from the answered branch.
If the patient answered the follow-up questions, the system says recommendation uses intake plus follow-up detail.
If the patient skipped, the system says recommendation is based on intake alone.

## 7. High-Level Architecture

At a high level, `chatbot-v3` is a supervisor-led runtime with a single authoritative control-plane writer.

The major pieces are:

- `Supervisor`
- `JourneyRuntimeAuthority`
- runtime/orchestrator layer
- subagents
- session persistence
- response composer

In plain language:

- the `Supervisor` decides what seems like the right next step
- the `JourneyRuntimeAuthority` decides what is actually allowed and what gets written as final truth
- the runtime wires the turn together
- subagents do bounded domain work
- persistence remembers the primary journey across turns
- the response composer turns internal results into user-visible messages and cards

## 8. One Turn From Start To Finish

A single turn roughly works like this:

1. the API receives the user's message, structured action, and optional attachments
2. runtime loads the current session snapshot
3. runtime builds a compact decision input
4. `Supervisor` proposes what should happen next
5. `JourneyRuntimeAuthority` validates or corrects that proposal
6. if a real agent is needed, runtime dispatches to that agent
7. runtime persists the authority-approved journey state
8. response composer generates the visible assistant message, cards, and payloads

This architecture is important because `Supervisor` is **not** the final truth writer.
That role belongs to `JourneyRuntimeAuthority`.

## 9. Component Responsibilities

### `Supervisor`
The `Supervisor` is the main LLM control-plane component.
Its job is to:
- interpret the latest user input
- decide whether this turn is progression, FAQ, handoff, or something else
- suggest the next stage
- choose which agent should handle the turn, if an agent is needed

The `Supervisor` should be good at understanding ambiguous user intent.
It is the system's best "what does the user mean right now?" layer.

It is **not** the final authority on allowed progression.

### `JourneyRuntimeAuthority`
`JourneyRuntimeAuthority` is the final authority.
Its job is to:
- allow or deny the `Supervisor`'s proposal
- preserve persisted primary-stage truth
- enforce progression gates
- write final journey state

If the `Supervisor` proposes something that is invalid, outdated, or inconsistent with the saved journey, the authority layer is allowed to reject or reshape that decision.

This is what protects the system from prompt drift or bad LLM guesses.

### Runtime / Orchestrator Layer
The runtime layer is the wiring layer.
Its job is to:
- load session state
- pass the right inputs to `Supervisor`
- pass the authority-approved decision to the right agent
- keep track of idempotency, summaries, and turn-level debug data
- compose the final visible response

### `RecordsAgent`
This agent owns records and medical-input collection behavior.
It is mainly used for:
- post-intake follow-up questioning
- supporting-document handling

### `RecommendationAgent`
This agent owns recommendation generation and related recommendation interactions.
It is used when the patient needs actual hospital recommendations or recommendation-specific reasoning.

### `FaqAgent`
This agent handles FAQ and resource detours.
It answers questions that are not mainline progression, such as:
- operating hours
- travel expectations
- high-level process questions
- practical questions that should not rewrite the main stage

If it cannot find a reliable answer, the system must say so honestly.

### `ConsultAgent`
This deterministic agent handles online consultation stage behavior.

### `HandoffAgent`
This deterministic agent handles human escalation.

## 10. The Most Important State The System Persists

`chatbot-v3` became much more stable once it stopped reconstructing the current stage from rough booleans every turn.

The key persisted truths are:

### Journey snapshot
```ts
journeyCurrentStage
journeyCurrentPhase
```

This is the saved primary journey position.
It is the main source of truth for where the patient currently is.

### Minimal triage state
```ts
minimalTriageStatus: 'pending' | 'skipped'
minimalTriageAnswersSummary: string | null
```

Important interpretation:
- `pending + answersSummary != null` means the patient answered the follow-up questions
- `skipped + null` means the patient explicitly skipped them

There is no separate canonical `answered` enum in the repaired design.

### Recommendation selection state
```ts
recommendationSelectionStatus: 'pending' | 'selected' | 'skipped' | null
recommendationSelectedHospitalIds: string[] | null
```

This records whether the patient selected a hospital, skipped selection, or has not chosen yet.

### Supporting documents
```ts
supportingDocuments: Array<{ path: string; name: string }>
```

This is intentionally minimal.
The system only needs to know that supporting documents exist and which files were accepted for the session.
It does not try to classify them in v1.

### A few still-valid boolean facts
A few booleans remain meaningful and native:
- `process.explained`
- `handoff.active`

These are still useful because they are true yes/no truths, not lossy aliases for richer structured state.

## 11. Why Persisted Stage Matters So Much

This is one of the most important `chatbot-v3` lessons.

If the system tries to recompute the stage from partial booleans on every turn, bad things happen:
- file uploads can bounce the user backward
- skip branches can loop
- selected hospital flows can jump too early or too late
- FAQ detours can overwrite the mainline journey

Persisting the journey snapshot fixes that.

It means:
- the system always knows what the saved primary stage is
- detours can happen without rewriting that primary stage
- the next turn can resume from the same saved place

## 12. Progression Versus Detour

This distinction is central to `chatbot-v3`.

### Progression turns
A progression turn moves the patient along the main journey.
Examples:
- submitting the 3 follow-up answers
- explicitly skipping the 3 follow-up answers
- selecting a hospital
- skipping hospital selection
- asking "what is next?"
- uploading supporting documents

These turns can change the primary stage.

### Detour turns
A detour turn answers a side question without changing the primary stage.
Examples:
- "What are your hours?"
- "How long are people usually in China?"
- "Can someone just call me instead?"
- recommendation comparison or explanatory follow-ups that should not rewrite the main stage

Detours should preserve the saved primary stage.

That means:
- if the patient is in `COLLECT_MINIMAL_MEDICAL_FACTS`, a FAQ detour returns to `COLLECT_MINIMAL_MEDICAL_FACTS`
- if the patient is in `RECOMMENDATION`, a FAQ detour returns to `RECOMMENDATION`
- if the patient is in `EXPLAIN_PROCESS`, a FAQ detour returns to `EXPLAIN_PROCESS`
- and so on

## 13. FAQ Behavior

The final FAQ contract is:

- all stages must be able to accept FAQ detours
- FAQ does not rewrite the persisted primary stage
- FAQ has two outcomes:
  - reliable answer
  - honest miss

### Reliable FAQ answer
If the system finds a reliable FAQ answer, it should answer it and keep the stage stable.

### Honest FAQ miss
If the system cannot find a reliable answer, it should say so honestly.
It should **not** fake confidence and should **not** silently fall back to workflow prompting.

An honest miss is better than pretending the patient asked something else.

This matters because earlier versions did exactly the wrong thing:
- casual FAQ at early stage would get swallowed into triage follow-up copy
- later-stage FAQ would sometimes collapse into generic stage guidance

The repaired contract avoids both of those failures.

## 14. `EXPLAIN_PROCESS` Is Special

`EXPLAIN_PROCESS` is a real primary journey stage, but it is not a normal agent-owned stage.

That is an intentional design choice.

Normal primary progression into `EXPLAIN_PROCESS` should:
- set the primary stage to `EXPLAIN_PROCESS`
- use system-rendered process-overview content
- not dispatch to a normal agent

In other words:
- `EXPLAIN_PROCESS` is a stage
- but it is usually **system-rendered**, not **agent-driven**

This matters because earlier versions incorrectly mapped `EXPLAIN_PROCESS` to `FaqAgent`.
That caused normal progression turns such as:
- selecting a hospital
- asking "what is next?"

to be rendered as FAQ miss behavior.

The repaired design fixes that by allowing `dispatchAgent = null` for normal `EXPLAIN_PROCESS` progression.

However, FAQ detours can still happen while the saved primary stage is `EXPLAIN_PROCESS`.
That does **not** mean the stage itself belongs to `FaqAgent`.
It only means FAQ can detour from there like any other stage.

## 15. Supporting Documents And Consult Readiness

The supporting-documents stage is `COLLECT_MEDICAL_INPUTS`.

Its meaning is narrower than generic records collection.
It is the step where the patient uploads diagnosis proof or other supporting medical documents.

Important rules:
- the patient can upload one or many files
- at least one supporting document is enough to satisfy consult readiness
- more documents can still be uploaded later
- uploads do not have global routing power
- an attachment is just one input, not a global command to jump backward

The current product rule is:
- selected hospital
- process explained
- at least one supporting document

Those conditions are enough to move into `ONLINE_CONSULT`.

This was an important repair because earlier live bugs showed that documents could be stored successfully while the authority layer still behaved as if no documents existed.
The fix was to ensure structured supporting-document state was actually wired into authority decisions.

## 16. Why Attachments Are Not Global Routing Truth

A file attachment should not, by itself, decide the stage.

That rule exists because earlier behavior caused bad regressions such as:
- the patient had already reached later stages
- then uploaded a PDF
- the system incorrectly treated that as an early triage upload
- and bounced the user back toward `COLLECT_MINIMAL_MEDICAL_FACTS`

The repaired rule is simpler:
- attachment is input
- current persisted stage is truth
- authority-approved progression decides whether the stage changes

## 17. Why We Avoid Too Many Flags

One of the recurring design lessons in `chatbot-v3` is that too many compatibility flags create dual truth and control-plane confusion.

So the repaired system intentionally prefers:
- a small persisted journey snapshot
- a few structured domain truths
- only a small number of native booleans

This is why the supporting-document state is just:
- `path`
- `name`

and not:
- inferred type
- LLM classification
- confirmation workflow
- extra status trees

The design tries to keep the canonical truth small and stable.

## 18. Example: Early FAQ Without Breaking Triage

```text
User: Hello
Assistant: We already received your basic intake. Please answer these 3 follow-up questions, or you can skip them.

User: Do you guys even work on Sundays lol
Assistant: I could not find a reliable FAQ answer right now, but your current stage is still saved and we can continue when you are ready.
```

What should happen internally:
- primary stage remains `COLLECT_MINIMAL_MEDICAL_FACTS`
- this turn is treated as FAQ detour
- no triage progression occurs
- the assistant does not pretend the FAQ was a triage answer

## 19. Example: FAQ During `EXPLAIN_PROCESS`

```text
User: Select first hospital.
Assistant: Here is the process and next steps.

User: How long are people usually stuck in China for this, roughly?
Assistant: I could not find a reliable FAQ answer right now, but your current stage is still saved.

User: Okay, what is next?
Assistant: Please upload your supporting diagnosis document.
```

What should happen internally:
- after hospital selection, primary stage becomes `EXPLAIN_PROCESS`
- the FAQ turn is a detour, not progression
- the FAQ turn does not rewrite the primary stage
- the next progression turn resumes from `EXPLAIN_PROCESS`
- then progression can continue to `COLLECT_MEDICAL_INPUTS`

## 20. Example: FAQ During Medical Inputs, Then Resume

```text
User: Okay, what is next?
Assistant: Please upload your diagnosis proof.

User: If I already got scans done elsewhere is that okay?
Assistant: [FAQ answer or honest miss]

User: uploads diagnosis-certificate.pdf
Assistant: [supporting-document acknowledgement]

User: What is next now?
Assistant: [online consultation response]
```

What should happen internally:
- the FAQ turn keeps the saved primary stage at `COLLECT_MEDICAL_INPUTS`
- the upload adds to `supportingDocuments`
- at least one document now satisfies consult readiness
- the following progression turn can move to `ONLINE_CONSULT`

## 21. What This System Intentionally Does Not Do Yet

This v1 contract intentionally does **not** do a few things:
- document OCR
- automatic document-type classification
- LLM-based document naming or labeling
- global stage/agent full decoupling for every possible future stage
- overly complicated migration compatibility for old sessions

The current strategy is to keep the control plane explicit and small.

## 22. Current Design Principles In One Page

If someone remembers only one page from this spec, it should be this:

- the patient already completed basic intake before chat starts
- chat begins with a post-intake follow-up, not cold-start intake
- the journey is stage-based and persisted
- the `Supervisor` proposes, but `JourneyRuntimeAuthority` is the final writer
- structured state is preferred over lossy boolean shortcuts
- FAQ is available from all stages
- FAQ is a detour, not progression
- FAQ miss must be honest
- `EXPLAIN_PROCESS` is system-rendered
- supporting documents are minimal persisted truth
- at least one supporting document is enough for consult readiness
- attachments are input, not global routing truth
- persisted primary stage must survive detours and retries

## 23. Relationship To The Detailed Specs

This document is the integrated overview.
It does not replace the more focused design documents.

The most important detailed references are:
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-16-chatbot-v3-supervisor-led-contract-design.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-18-chatbot-v3-post-intake-conversation-contract-design.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-18-chatbot-v3-post-intake-follow-up-and-diagnosis-proof-refinement.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-19-chatbot-v3-control-plane-repair-design.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-22-chatbot-v3-faq-recognition-and-detour-boundary-design.md`

Read this document first.
Use the others when you need implementation-level detail for one specific slice.

## 24. Success Criteria

This integrated `chatbot-v3` design is successful when all of the following are true:

- a new engineer can understand the whole system from one document
- post-intake behavior no longer looks like cold-start intake
- answered and skipped follow-up branches both work
- recommendation and process explanation are distinct steps
- supporting documents no longer bounce the patient backward
- FAQ works from every stage
- FAQ misses are honest
- `EXPLAIN_PROCESS` behaves as a system-rendered stage
- online consultation progression is driven by real persisted truth
- persisted primary stage remains stable across retries, detours, and uploads
