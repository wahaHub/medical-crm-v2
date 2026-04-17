# Chatbot V3 Remaining Gaps (Supervisor-Led Translation)

Date: 2026-04-15
Updated: 2026-04-17
Original scope: What would still be missing even if `docs/superpowers/plans/2026-04-15-chatbot-v3-orchestrator-multi-agent-implementation.md` were fully implemented
Current scope: Which maturity and debugging follow-ups still matter after the 2026-04-16 supervisor-led contract became canonical
Audience: CRM chatbot maintainers, reviewers, and future v3 follow-up planners

## 1. Why this document was rewritten

The 2026-04-15 architecture was orchestrator-led.

That is no longer the canonical control plane.

As of 2026-04-16, the canonical contract is:

- `Supervisor` is the main LLM agent
- `JourneyRuntimeAuthority` is the single final writer and allow-or-deny authority
- the primary journey begins with `COLLECT_MINIMAL_MEDICAL_FACTS`
- `RecordsAgent` and `RecommendationAgent` are real LLM workers
- the runtime should prefer minimal context plus targeted domain reads

Because of that control-plane change, the original version of this document can no longer be read literally.

However, several of its follow-up concerns were not really "orchestrator concerns." They were maturity concerns:

- state-write ownership clarity
- replay/debug visibility
- evaluation discipline
- worker result contract durability
- degraded response quality
- action-loop closure

Those concerns still matter.

This rewritten document keeps the useful follow-up ideas, drops the outdated control-plane framing, and re-states the remaining gaps in supervisor-led terms.

## 2. High-level judgment

The old document is now best understood as:

- no longer a source of architectural truth
- still a useful maturity backlog
- especially useful for debugging, replay, and operational hardening follow-ups

In other words:

- do not reuse its orchestrator-led wording as if it were current design truth
- do reuse the parts that help the team debug, evaluate, and harden the shipped supervisor-led runtime

## 3. What is now outdated or largely closed

### 3.1 Orchestrator-led ownership wording is outdated

The original text treated the orchestrator as the enduring primary decision owner.

That is no longer the right framing.

The correct supervisor-led framing is:

- `Supervisor` proposes
- `JourneyRuntimeAuthority` finalizes
- runtime dispatches only the finalized decision

So any old gap framed as "make the orchestrator smarter" should now be translated into either:

- improve `Supervisor` proposal quality
- improve `JourneyRuntimeAuthority` rule clarity and write ownership
- improve runtime observability around the proposal-to-authority boundary

### 3.2 "Only one real agentic worker" is outdated

That was true for the 4/15 MVP direction.

It is not true for the current implementation direction.

The current supervisor-led architecture already treats these as real LLM nodes:

- `Supervisor`
- `FaqAgent`
- `RecordsAgent`
- `RecommendationAgent`

So the useful follow-up is no longer "prove a second real worker exists."

The useful follow-up is now:

- keep worker task boundaries durable
- keep worker outcome schemas bounded
- keep authority/runtime from trusting worker output too broadly

### 3.3 Summary ownership is no longer the same kind of gap

The old document correctly worried that a history-aware system would become unstable if conversation summary ownership stayed vague.

That concern was important.

But the specific ownership split described in the old version is now mostly closed.

The current runtime owns summary patch generation and route persistence consumes the runtime-produced patch.

So summary is no longer a "missing owner" problem.

The remaining problem is now smaller and more operational:

- whether the compact summary contract stays stable and useful for debugging over time
- whether summary version lineage becomes visible enough for replay debugging

### 3.4 Task envelope and FAQ answer contract are no longer purely aspirational

The old document said task envelopes and bounded worker outcomes still needed to become real contracts.

That concern was correct at the time.

The current runtime now already has explicit typed worker task structures and bounded worker output contracts.

So this is no longer a "not yet started" gap.

The remaining gap is now contract durability:

- keeping those schemas versioned and observable enough for future worker evolution
- ensuring runtime logs/debug payloads make worker contract failures easy to inspect

## 4. Remaining gaps that still matter

## 4.1 Replay and debugging visibility is still underpowered

This is the most important remaining gap from the old document.

The runtime already exposes useful observability and node-debug fields such as:

- `nodePromptVersion`
- `nodeModel`
- `fallbackUsed`
- `schemaValidationFailed`

That is a strong start.

But the system still lacks enough lineage to answer the hardest production debugging question cleanly:

"Why did this turn behave differently from the same-looking turn yesterday?"

The missing pieces are things like:

- explicit authority rule/config version visibility
- clearer authority decision lineage visibility at the turn-debug surface
- clearer fact snapshot lineage visibility
- clearer conversation summary lineage visibility
- clearer supervisor domain-read request/result visibility
- clearer bootstrap-override visibility
- one compact replay-oriented explanation surface that joins these together

Without those, the runtime is observable, but replay debugging is still more manual than it should be.

### Why this matters

This directly affects:

- production incident debugging
- regression triage after prompt changes
- comparing two seemingly similar turns that diverged
- explaining whether the cause was summary drift, authority rule drift, worker fallback, bootstrap override, supervisor read-domain differences, or state differences

### Smallest sensible follow-up

1. attach authority/config version to finalized authority decision events
2. surface authority decision lineage at the turn-debug level, not only deeper event streams
3. attach summary contract/version lineage to debug output or decision metadata
4. expose fact snapshot lineage plus supervisor read-domain request/result breadcrumbs for replay
5. make bootstrap overrides explicit in replay/debug payloads
6. add one stable replay-debug envelope that joins suggestion, authority decision, worker metadata, summary contract, canonical truth inputs, read-domain usage, and bootstrap inputs

## 4.2 Evaluation maturity is still thin

The old document was right that schema validation is not enough.

That remains true in the supervisor-led system.

The runtime now has much stronger contracts than the old 4/15 MVP expected, but the system can still drift semantically while remaining schema-valid.

The highest-value missing eval areas are now concentrated in:

- `Supervisor` progression intent
- `Supervisor` mixed FAQ/handoff/process-explanation intent handling
- FAQ answer quality under partial grounding
- degraded-path user guidance

The new public-route system-session coverage now exercises:

- FAQ detours that should not auto-advance the main journey
- recommendation revisit/compare loops
- repeated explanation requests on already-explained paths
- degraded recommendation recovery on a later retry
- denied-handoff detours that return to the correct current step

That materially improves route-level confidence for repeat, detour, and recovery behavior, even though fixture-driven semantic eval coverage is still thinner than it should be.

### Why this matters

This is the main defense against:

- schema-valid but semantically wrong `Supervisor` proposals
- prompt regressions that only show up in natural user language
- worker contract drift that still "looks fine" in happy-path tests

### Smallest sensible follow-up

1. create fixed supervisor eval fixtures
2. create FAQ and degraded-path eval fixtures
3. add a lightweight regression habit for prompt/model changes, not just type/schema checks

## 4.3 Composer degraded guidance was too generic and is now mostly closed

The old document said the composer might become formally correct before it becomes operationally helpful.

That concern materially improved in the 2026-04-17 hardening pass.

The composer no longer collapses every degraded turn into one generic user message.

It now keeps a small, explicit family set:

- FAQ degradation
- recommendation degradation
- consult degradation
- blocked handoff / denied escalation guidance

That is exactly the right shape for this layer:

- deterministic
- bounded
- easy to regression test
- not a hidden policy engine

### Why this matters

This improves:

- user recovery rate after failures
- frontend debugging
- support/debugging because user-visible symptoms better reflect the real failure type

### What remains open

The remaining follow-up is now much smaller:

1. keep future failure families explicit instead of extending copy ad hoc
2. keep route-level regression coverage for the live degraded paths
3. resist adding free-form policy branching to the composer

## 4.4 Card action closure still deserves an explicit audit

The old document warned that rendered cards can land before all actions behind them are fully alive.

That still matters.

The current card layer is much cleaner than before, but some cards still behave more like rendered state than fully closed action surfaces.

This is not a contract failure.

It is a maturity gap:

- every surfaced card should have a clear backend action story
- every repeat/refresh/revisit flow should be intentionally supported, not accidentally tolerated

### Why this matters

This directly helps:

- frontend integration predictability
- staging QA
- debugging loops where the UI looks interactive but the backend path is only partially closed

Update on 2026-04-17:

The audit/documentation part of this gap is now closed by `docs/analysis/2026-04-17-chatbot-v3-card-action-closure-checklist.md`.

The implementation/action-surface part is still open.

More specifically:

- backend ownership of every current v3 card action or revisit loop is now explicit
- the live response envelope still leaves several schema-allowed actions intentionally un-emitted
- this remains a maturity gap, but it is no longer an invisible one

### Smallest sensible follow-up

1. audit each v3 card type against its backend action path
2. explicitly mark which cards are view-only and which are action-bearing
3. add a small action-loop checklist for recommendation revisit, upload retry, consult retry, and handoff follow-up states

## 4.5 Single-writer correctness now needs periodic audit, not architectural rescue

The old document was right that state-write ownership matters.

The good news is that this is no longer a "missing architecture" problem.

The supervisor-led runtime now has a real authority-owned final write contract.

So the remaining gap is narrower:

- keep auditing that route/runtime/worker changes do not quietly reintroduce side writes or implicit truth derivation
- keep canonical truth flags tied to explicit persisted state rather than helper heuristics

### Why this matters

This is how the team prevents a regression back into dual truths.

### Smallest sensible follow-up

1. keep a focused single-writer audit checklist for new journey facts
2. require explicit tests whenever a new canonical truth flag or worker write path is added
3. treat route-side heuristic truth derivation as a regression unless deliberately approved

## 4.6 Long-tail lifecycle maturity is still normal post-M0 work

The old document correctly said a valid contract can arrive before every lifecycle edge is equally mature.

That remains true.

The kinds of long-tail issues still worth expecting are:

- retries after partial business success
- duplicate submissions with stale UI state
- delayed status writes from external business steps
- repeated or late follow-up actions after consult or handoff
- edge cases around active/post/completed phase transitions

This is not a sign the architecture is wrong.

It is the normal next layer after architecture proof and contract cleanup.

## 5. Recommended supervisor-led follow-up order

The best next follow-up order is now:

1. extend replay/debug lineage visibility for authority config, summary lineage, and fact lineage
2. keep growing fixed eval fixtures for `Supervisor`, FAQ, and degraded paths
3. keep composer degraded guidance bounded as new failure families appear
4. close the remaining live card action surfaces beyond the now-complete audit/checklist
5. keep a focused single-writer regression audit for canonical truth writes

This order is intentionally different from the original 4/15 wording.

It follows the new supervisor-led control plane while preserving the old document's best maturity instincts.

## 6. Debugging payoff

Implementing the remaining high-value items above should make debugging the new v3 noticeably easier.

The biggest reasons are:

### 6.1 Better turn-to-turn comparison

Version and lineage visibility makes it much easier to answer:

- did the `Supervisor` change?
- did the authority rules change?
- did the worker prompt change?
- did the summary change?
- did the canonical facts differ?
- did the supervisor read a different domain?
- did a bootstrap override force a different path?

That turns many debugging sessions from "reconstruct the world manually" into "inspect one joined debug record."

### 6.2 Better detection of semantic drift

Fixed eval fixtures catch the class of bugs where everything validates but the behavior is still wrong.

That is especially important for:

- mixed intent turns
- short ambiguous confirmations
- revisit/repeat requests
- late process-explanation requests
- degrade/recovery paths

### 6.3 Better frontend and staging diagnosis

Stage-aware degraded guidance and explicit action-loop closure make it easier to tell whether a problem is:

- a backend failure
- a missing action path
- a blocked authority rule
- a worker fallback
- or simply a view-only card doing what it was designed to do

## 7. Final judgment

The original 2026-04-15 remaining-gaps document is no longer correct as an architecture narrative.

It is still valuable as a maturity and debugging checklist.

The right way to use it now is:

- discard its orchestrator-led control-plane assumptions
- keep its strongest operational concerns
- restate those concerns in supervisor-led terms

That is what this rewritten version does.

So the final answer is:

- yes, parts of the old gap analysis still matter
- no, it should not be read literally anymore
- yes, implementing the still-relevant follow-ups should make debugging the new supervisor-led v3 materially easier
