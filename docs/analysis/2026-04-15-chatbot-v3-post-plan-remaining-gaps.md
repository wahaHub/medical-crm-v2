# Chatbot V3 After-Plan Remaining Gaps

Date: 2026-04-15
Scope: What would still be missing even if `docs/superpowers/plans/2026-04-15-chatbot-v3-orchestrator-multi-agent-implementation.md` were fully implemented
Audience: CRM chatbot maintainers, reviewers, and future v3 follow-up planners

## 1. Why this document exists

The 2026-04-15 implementation plan is a good MVP plan.

If all plan tasks land, the team should have a real v3 runtime, not a mock or a paper design. It should be good enough to validate the architecture, run production-like traffic, and unblock frontend integration.

But the plan is still an M0 / MVP plan, not the final form of the chatbot runtime.

This document explains:

1. what each major subsystem would likely reach if the plan is fully completed
2. what would still be missing before calling that subsystem "complete"
3. why those remaining gaps still matter
4. what the smallest sensible follow-up should be

The goal is to prevent two opposite mistakes:

- underestimating the value of the plan
- overclaiming that plan-complete means architecture-complete

## 2. High-level conclusion

If the full 2026-04-15 implementation plan is completed as written, the likely subsystem completion levels would be:

| Area | Estimated completion after full plan | Summary |
|---|---:|---|
| Orchestrator | 90-95% | Core authority model should be real and mostly correct |
| Supervisor | 75-85% | Suggestion layer should be usable, but still MVP-grade |
| Subagents | 70-80% | Agent pattern should be proven, but only partially matured |
| Composer | 85-90% | Response assembly should become a real module, but still mostly renderer-grade |
| Overall v3 runtime | 82-88% | Good first production-capable architecture, not final architecture |

The reason it still does not reach 100% is simple:

the plan proves the architecture, but it does not try to solve every long-tail runtime, memory, eval, and ownership problem that a fully mature agent system eventually needs to solve.

This is the correct tradeoff for M0.

## 3. Orchestrator after full plan

### 3.1 What full plan completion should achieve

If the plan is fully implemented, the orchestrator should become a real deterministic decision engine with:

- config-driven stage prerequisites
- config-driven jump rules
- explain-before-downstream gate
- semantic handoff gating
- hard handoff precedence
- orchestrator-owned dispatch decisions
- idempotent runtime execution around each turn
- degraded fallback behavior when subagent or tool work fails

That is enough to make `Supervisor suggests -> Orchestrator decides -> Sub-agent executes` true in practice rather than only in docs.

### 3.2 Why this is still not 100%

Even after the plan, the orchestrator would still likely need a small number of follow-up upgrades before it can be treated as fully complete.

#### Gap A: explicit fact commit must be fully closed

The most important example is `process.explained=true`.

The spec correctly says downstream progression should depend on an explicit fact rather than stage/path inference. But getting this truly right requires more than just checking the fact during decision time. The runtime also needs a stable rule for:

- when the fact is created
- who is allowed to create it
- where it is persisted
- how it is replayed on later turns

If that lifecycle is still even slightly ambiguous, the orchestrator is not yet fully closed.

#### Gap B: decision ownership must include state commit ownership

It is not enough for the orchestrator to compute `to.stage`.

To really be the single writer, the orchestrator path also needs to be the only place that commits authoritative journey and explicit fact changes back into persisted session state. Otherwise the system still has split authority: one component decides, another component silently becomes the effective writer.

#### Gap C: deterministic replay needs config version visibility

The spec already frames determinism in terms of:

- journey snapshot
- status snapshot
- supervisor suggestion
- rule config version

To make this operationally useful, the runtime should expose enough audit context to answer "why did this turn decide differently from yesterday?" without guessing. If rule config version, prompt version, or fact snapshot lineage are missing from debug/audit context, deterministic design exists on paper but remains weaker in production debugging.

### 3.3 Smallest sensible follow-up

After plan completion, the smallest useful orchestrator follow-up would be:

1. fully define explicit fact commit rules, especially `process.explained`
2. make orchestrator-side journey/fact commit the only authoritative write path
3. attach config version to runtime debug and emitted decision events

Those three changes would likely move the orchestrator from "mostly complete" to "effectively complete for v3."

## 4. Supervisor after full plan

### 4.1 What full plan completion should achieve

If the plan is completed, the supervisor should no longer be just a heuristic placeholder.

It should become a real history-aware suggestion layer with:

- a structured prompt contract
- strict output shape
- suggestion-only sanitation
- fallback to heuristic mode on failure
- minimal observability for prompt/runtime issues

That is enough to make the supervisor usable in production without giving it unsafe authority.

### 4.2 Why this is still not 100%

The supervisor is intentionally narrow in MVP. That is good. But it also means several maturity gaps would remain.

#### Gap A: evaluation coverage will still be thin

A prompt contract plus fallback is not the same thing as a mature suggestion system.

To really trust the supervisor, the team still needs a reusable eval set for cases such as:

- short confirmations like "okay" or "that one"
- handoff requests mixed with FAQ intent
- late process explanation requests in downstream stages
- repeated turns after handoff is already active
- history-sensitive progression intent

Without this, the supervisor can be functional but still drift quietly after prompt or model changes.

#### Gap B: summary provenance must stay explicit

A history-aware supervisor is only as good as the summary and facts it receives.

If conversation summary generation, refresh cadence, or trust level is vague, the supervisor may appear unstable even when the prompt itself is fine. This is not only a prompt problem. It is an upstream context contract problem.

#### Gap C: drift detection remains weaker than runtime validation

Schema validation protects against malformed output.

It does not protect against semantically bad but schema-valid output. That requires lightweight regression evaluation, prompt versioning discipline, and a stable review habit when prompt or model changes happen.

### 4.3 Smallest sensible follow-up

After plan completion, the minimum useful supervisor follow-up would be:

1. create a fixed supervisor eval fixture set
2. explicitly define conversation summary ownership and refresh policy
3. add prompt/model drift review around the supervisor contract

That would take the supervisor from "safe MVP" to "operationally reliable."

## 5. Subagents after full plan

### 5.1 What full plan completion should achieve

If the plan is completed, the runtime should have a real and defensible subagent split:

- `FaqAgent` becomes the only MVP LLM worker
- `RecordsAgent`, `RecommendationAgent`, `ConsultAgent`, and `HandoffAgent` remain deterministic bounded wrappers
- tool access remains constrained by agent role
- dispatch remains orchestrator-owned

This is a good architecture.

It is also the right minimal interpretation of "multi-agent" for this product. Most business actions should stay deterministic.

### 5.2 Why this is still not 100%

#### Gap A: only one agent would be truly agentic

This is acceptable for MVP and probably desirable.

But it means the system has proven only one real LLM worker pattern, not a broadly generalized subagent platform. The architecture would be validated, but not yet broadly stress-tested across multiple agent types.

#### Gap B: task envelope needs to become a long-lived contract

The plan's `Task Envelope v1` is the correct direction.

Still, after implementation, the envelope will likely remain early-stage unless it is treated as a real internal contract with:

- stable schema
- explicit allowed tools
- explicit result shape
- versioning discipline

Without that, it works as an implementation detail but is still fragile as a long-term runtime boundary.

#### Gap C: outcome protocol needs to be stronger

One lesson from other agent systems is that agent execution quality improves when workers do not merely emit free text. They should converge on a bounded outcome signal.

For v3, this matters most for `FaqAgent`. If it can return a structured answer result plus cited FAQ ids and confidence, the main runtime can stay deterministic while still benefiting from LLM flexibility.

#### Gap D: allowlist discipline must stay runtime-enforced

Natural language warnings are not enough.

The system should keep agent capabilities runtime-enforced and observable, especially for the FAQ worker. If that boundary becomes loose, stage authority and factual grounding both get weaker.

### 5.3 Smallest sensible follow-up

After plan completion, the smallest high-value subagent follow-up would be:

1. freeze `Task Envelope v1` as a real internal schema
2. freeze `FaqAnswerResult` as a real internal schema
3. ensure emitted runtime events capture enough information to debug tool-plan and outcome quality

That would keep the system minimal while making subagent behavior much more durable.

## 6. Composer after full plan

### 6.1 What full plan completion should achieve

If the plan is completed, the biggest structural improvement here should be:

`ResponseComposer` becomes an explicit module instead of route-local assembly logic.

That matters because the final response envelope should have one owner for:

- `messages[]`
- `cards[]`
- `journey`
- `handoff`
- `turnOutcome`

This is a cleaner ownership model than scattering that logic through route code.

### 6.2 Why this is still not 100%

#### Gap A: composer would still be mostly an envelope renderer

That is fine for MVP.

But it means the composer is still not a rich response policy system. It mainly assembles final output from bounded upstream results. For v3 this is probably the right decision, but it also means the composer remains intentionally narrow.

#### Gap B: degraded guidance may still be too generic

When failures happen, users do not only need a valid envelope. They need stage-aware guidance.

For example:

- failed FAQ grounding
- failed recommendation generation
- failed consult scheduling
- blocked semantic handoff

Each of these should ideally produce slightly different user guidance. A minimal composer may still collapse too many of these into generic degraded copy.

#### Gap C: card actions may still lag behind card rendering

A composer can become correct as a renderer before the action semantics behind all cards are fully closed. This often happens in staged implementations: the UI contract lands earlier than the complete action loop behind every button or refresh action.

So even with a finished composer module, the runtime may still need action-loop strengthening to make every surfaced card feel fully alive.

### 6.3 Smallest sensible follow-up

After plan completion, the smallest useful composer follow-up would be:

1. add stage-aware degraded response rules
2. ensure FAQ bounded answer text passes cleanly through the composer
3. verify every card action has a clean backend action story, not only a schema slot

That would move the composer from "formalized renderer" to "reliable response layer."

## 7. Overall runtime after full plan

### 7.1 What full plan completion should achieve

A fully completed plan should produce a v3 runtime that is good enough to say:

- Dify is no longer the primary engine on the v3 path
- orchestration authority lives in CRM
- the v3 endpoint and contract are real
- observability is real enough for non-prod verification
- frontend-ready v3 cards and response shapes exist
- one real LLM worker pattern is validated

That is not a toy result. That is a serious milestone.

### 7.2 Why this is still not 100%

The runtime would still be missing some maturity layers that are usually learned only after initial production use.

#### Gap A: long-tail eval maturity

The plan proves the system can run.

It does not yet guarantee that stage transitions, FAQ grounding, degraded guidance, and handoff semantics remain stable through many prompt changes, data changes, and future agent additions.

#### Gap B: contract maturity is ahead of lifecycle maturity

The v3 contract can be fully valid before all lifecycle edges are equally mature.

Typical examples:

- retries after partial business success
- duplicate user submissions with stale UI state
- late-arriving status writes
- edge cases around pre/post phase transitions

These are not arguments against the plan. They are the normal next class of issues after a good M0 lands.

#### Gap C: architecture validation does not equal organization-wide closure

After plan completion, the team should know that the v3 architecture direction is correct.

But there will still be follow-up work around:

- eval discipline
- production debugging discipline
- prompt and config versioning hygiene
- explicit ownership of state writes, summaries, and user-facing guidance

Those are maturity tasks, not first-plan tasks.

### 7.3 Smallest sensible follow-up

The smallest high-value runtime follow-up after full plan completion would be:

1. a post-M0 eval pack focused on supervisor, FAQ worker, and degraded paths
2. a persistence and explicit-fact audit, especially around journey/fact single-writer rules
3. a response-quality pass on composer degraded guidance and action loops

That would likely move the runtime from "strong MVP" to "stable first production generation."

## 8. Why this is the right stopping point for the 4/15 plan

It is important not to misread the remaining gaps as flaws in the plan.

The plan is intentionally doing the right kind of restraint:

- prove one real LLM suggestion layer
- prove one real LLM worker
- keep other business actions deterministic
- move final authority into the orchestrator
- ship a clean v3 public contract

This is the right first move.

Trying to solve every remaining maturity problem inside the same plan would likely make the project slower, blur ownership, and create more moving parts before the first architecture proof has even shipped.

So the correct reading is:

- if this plan is not completed, the architecture is still under-proven
- if this plan is completed, the architecture is proven enough to continue
- after that, the remaining work is mostly maturity work, not architecture-rescue work

## 9. Recommended post-plan follow-up order

If the full implementation plan lands, the next follow-up order should be:

1. explicit fact + single-writer persistence audit
2. supervisor and FAQ eval fixtures
3. formalize task envelope and FAQ answer result contracts
4. strengthen composer degraded guidance and card action closure
5. add prompt/config/runtime version visibility for easier replay and debugging

This sequence keeps the next iteration small and practical while directly attacking the most important remaining risks.

## 10. Final judgment

If the 2026-04-15 implementation plan is fully completed, the team should treat that milestone as:

- a successful architecture validation
- a real v3 runtime milestone
- a strong production-capable first generation

The team should not treat it as:

- the final form of the chatbot runtime
- a complete multi-agent platform
- the end of state ownership, eval, or maturity work

That distinction is healthy.

It means the plan is ambitious enough to matter, but still disciplined enough to ship.
