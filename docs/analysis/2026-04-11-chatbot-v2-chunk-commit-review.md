# Chatbot V2 Chunk Commit Review

## Scope

This review checks the current `chatbot-v2` implementation at `HEAD = 6c16641` (`Add chatbot v2 FAQ grounding workflow`) against:

- the chunked implementation plan in `docs/superpowers/plans/2026-04-11-chatbot-v2-llm-classifier-implementation.md`
- the related architecture/spec docs
- the reusable v1 baseline, especially:
  - `dify-config/medora-ai-chatbot-v1.dsl.yml`
  - `apps/api/src/routes/chatbot.routes.ts`
  - `apps/api/src/routes/patient-widget-starter.ts`
  - `apps/api/src/routes/internal-faq-eval.routes.ts`
  - `packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.ts`
  - `packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.ts`

The question is not "did the commits land". They did.

The real question is:

1. did they move the system in the right direction?
2. do they preserve the important v1 semantics?
3. is there anything materially wrong or risky in the current result?

## Verification

I verified the current `HEAD` with focused tests.

The plan's sample test commands are stale for this repo's current Vitest setup:

- `--runInBand` is not a valid Vitest flag here
- the file paths in the plan are root-relative, but the workspace scripts run inside package directories

So I reran the equivalent package-local commands instead.

### Application tests

Run in `packages/application`:

```bash
pnpm test src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts \
  src/services/__tests__/chatbot-v2/journey-engine.service.test.ts \
  src/services/__tests__/chatbot-v2/llm-request-classifier.service.test.ts \
  src/services/__tests__/chatbot-v2/resource-registry.service.test.ts
```

Result:

- 4 test files passed
- 35 tests passed

### API tests

Run in `apps/api`:

```bash
pnpm test src/__tests__/chatbot-v2-context.test.ts \
  src/__tests__/chatbot-v2-faq-grounding.test.ts \
  src/__tests__/chatbot.routes.test.ts \
  src/__tests__/patient-public.routes.test.ts \
  src/__tests__/patient-auth.routes.test.ts \
  src/__tests__/dify-classifier-v2.contract.test.ts \
  src/__tests__/dify-faq-grounding-v2.contract.test.ts \
  src/__tests__/dify-workflow-v2.contract.test.ts \
  src/__tests__/composition-root.test.ts
```

Result:

- 9 test files passed
- 129 tests passed

## Findings

### [P1] Classifier client wiring still has an unsafe fallback path

The biggest real issue is not in chunk 8. It is earlier, and it is still present at `HEAD`.

`apps/api/src/composition-root.ts:630-637` creates `difyClassifierApiClient` with this key chain:

- `DIFY_CLASSIFIER_APP_API_KEY`
- then `DIFY_APP_API_KEY`
- then `DIFY_API_KEY`

At the route layer, `apps/api/src/routes/chatbot-v2-context.ts:255-259` still does:

- `input.services.difyClassifierApi ?? input.services.difyApi`

That means if the dedicated classifier app key is missing, the system can still send classifier traffic to the main composer app instead of failing fast. That is a real operational footgun.

Why this matters:

- chunk 5's whole point was a dedicated classifier workflow
- chunk 6's whole point was classifier -> orchestrator -> composer separation
- chunk 8 already fixed this pattern for FAQ grounding by refusing to silently reuse the main client
  - see `apps/api/src/routes/chatbot-v2-faq-grounding.ts:26-29`

So the current classifier path is weaker than the current FAQ-grounding path.

Verdict:

- architecture direction is right
- current implementation is still too permissive in misconfigured environments

Recommended follow-up:

- make classifier wiring behave like FAQ grounding
- only construct `difyClassifierApi` when `DIFY_CLASSIFIER_APP_API_KEY` is explicitly present
- remove the `?? input.services.difyApi` fallback from `chatbot-v2-context.ts`
- warn and fail explicitly instead of silently hitting the wrong Dify app

### [P2] The plan docs are good overall, but the runnable test commands are out of date

This is not a runtime bug, but it is real implementation friction.

In the classifier implementation plan, the sample commands use:

- `--runInBand`
- root-relative file paths

Those commands do not run successfully against the current Vitest setup. The implementation itself is fine. The plan execution details are not.

Why this matters:

- it slows future agents down
- it creates false negatives during verification
- it makes it harder to tell "code broken" from "plan command stale"

Verdict:

- docs/spec direction is right
- test command examples should be updated

### [P3] Chunk boundaries were useful for execution, but not cleanly reflected in commit boundaries

This is more about auditability than behavior.

Example:

- `b2f30c1` is labeled chunk 1, but it already changes production schema and orchestrator logic, not just tests
- `d6da7c4` finishes the real removal of the local classifier even though that work is conceptually prepared earlier
- `6c16641` includes runtime code, tests, DSL, and spec/plan doc updates in one commit

This is not wrong. The end state is mostly good.

But if someone later wants to bisect a regression or roll back one conceptual step, these commits are broader than the chunk labels suggest.

Verdict:

- acceptable for fast migration work
- not ideal if you want chunk numbers to map cleanly onto rollback points

## Chunk-By-Chunk Verdict

## Chunk 1: classifier contract tests

Mapped commit:

- `b2f30c1` `Implement chatbot v2 classifier chunk 1`

Verdict:

- mostly correct
- not a pure test-only chunk

What it got right:

- introduced the shared classifier contract in `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`
- rewrote old rule-based tests into bridge-oriented structured-result tests
- updated orchestrator behavior to understand `includeProgressionFollowUp`

What is off:

- this commit already contains material production logic, so it is not really "just chunk 1"

Assessment against v1:

- good move
- v1 keyword routing was too brittle, so shifting to a typed contract early is the right foundation

## Chunk 2: structured classifier contract / schema

Mapped commits:

- `0126d6a` `Add chatbot v2 classifier contract scaffolding`
- `167d460` `Tighten chatbot v2 classifier result schema`
- `b2dd82f` `Tighten classifier contract follow-up handling`

Verdict:

- correct
- this chunk is one of the cleaner parts of the migration

What it got right:

- tightened the schema around exactly the constraints the design doc cared about
- encoded "faq cannot target resources"
- encoded "only faq / process_explanation may set includeProgressionFollowUp"
- tightened follow-up acceptance behavior in the orchestrator

Assessment against v1:

- this is a clear improvement over v1
- v1 relied on looser intent/action coupling, while v2 now has a real typed boundary

## Chunk 3: CRM-side LLM classifier adapter

Mapped commits:

- `c2a2f2e` `Add chatbot v2 LLM classifier service`
- `7e256f9` `Wire chatbot v2 classifier service`

Verdict:

- mostly correct
- one important wiring caveat remains, see [P1]

What it got right:

- `llm-request-classifier.service.ts` is well-shaped
- it validates inputs through shared schema
- it parses direct structured results and JSON-in-answer results
- it rejects invalid payloads instead of trusting Dify blindly
- composition-root wiring moved classifier transport out of the route files

What is off:

- the classifier client inherits the main Dify app key when the dedicated classifier key is absent
- `.env.example` was rewritten very broadly in `7e256f9`, which makes the commit noisier than it needed to be

Assessment against v1:

- strongly better than v1 keyword heuristics
- but the dedicated app separation should be strict, otherwise the old "wrong workflow doing too much" problem can creep back in

## Chunk 4: orchestrator consumes classifier output

Mapped commits:

- `8db67a1` `Clarify classifier handoff targeting contract`
- `adca336` `Focus handoff requests in orchestrator`

Verdict:

- correct

What it got right:

- tightened the handoff contract
- made explicit human-help requests produce focused `HUMAN_HANDOFF` resource exposure
- preserved CRM ownership of the actual decision layer

Assessment against v1:

- this is the right v2 move
- v1 mixed user intent and UI action too tightly
- these commits make handoff a resource/journey decision instead of a loose heuristic

## Chunk 5: dedicated Dify classifier workflow

Mapped commit:

- `99976f6` `Add chatbot v2 classifier Dify workflows`

Verdict:

- correct

What it got right:

- created `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`
- added strong contract coverage for the dedicated classifier workflow
- kept the classifier workflow classification-only
- pushed composer-only fields back out of the classifier workflow
- updated composer DSL so it can read `includeProgressionFollowUp`

Assessment against v1:

- this is one of the biggest architectural wins over v1
- v1 let Dify own too much routing/orchestration
- chunk 5 cleanly splits understanding from composition

Minor note:

- the composer DSL version number moving from `0.7.0` to `0.6.0` looks noisy rather than intentional, but I do not see evidence that it breaks runtime behavior

## Chunk 6: classifier -> orchestrator -> composer route wiring

Mapped commits:

- `b7001c4` `Integrate chatbot v2 classifier turn context`
- `147865c` `Harden chatbot v2 classifier routing`
- `d6da7c4` `Remove local chatbot classifier fallback`

Verdict:

- mostly correct
- this is where the migration actually became real

What it got right:

- route layer now calls classifier before orchestration
- `chatbot.routes.ts` and `patient-widget-starter.ts` store `classifierResult`
- `chatbot-v2-context.ts` supplements early-stage resource hints so explicit requests can classify correctly even before the journey fully advances
- `d6da7c4` correctly removes the local rule-based classifier from the main runtime path
- current `ConversationOrchestratorService` now requires injected classifier output, which matches the design

What is off:

- the classifier transport fallback risk from [P1] is still part of this chunk's final runtime behavior

Assessment against v1:

- this is the right migration shape
- the route shell from v1 is being reused, but the decision path is now CRM-owned in the way the v2 architecture intended

## Chunk 7: regression / safety coverage

Mapped commits:

- `491028c` `test: cover chatbot classifier integration`
- `4cf0c8b` `Add chatbot v2 regression coverage`

Verdict:

- correct for automated regression coverage
- not complete if you interpret the plan literally as requiring manual smoke evidence

What it got right:

- expanded route-level coverage
- expanded classifier and orchestrator regression cases
- current focused test suite passes at `HEAD`

What is still missing relative to the plan text:

- the manual/live smoke checklist is not something I can verify from repo history alone

Assessment against v1:

- better than v1
- v1 had behavior, but not nearly this explicit a regression harness around the migration seams

## Chunk 8: FAQ grounding

Mapped commit:

- `6c16641` `Add chatbot v2 FAQ grounding workflow`

Verdict:

- mostly correct
- this is a strong chunk

What it got right:

- added a dedicated FAQ grounding workflow instead of folding retrieval back into composer logic
- added `chatbot-v2-faq-grounding.ts`
- added `dify-faq-grounding-v2.contract.test.ts`
- added `chatbot-v2-faq-grounding.test.ts`
- wired grounding into both `chatbot.routes.ts` and `patient-widget-starter.ts`
- added separate Dify client wiring for grounding
- unlike the classifier client, grounding does not silently reuse the main Dify client if config is missing

How it compares to v1:

- it preserves the important v1 FAQ semantics
- `GENERAL_ONLY` and `HOSPITAL_AWARE` stay explicit
- the v2 FAQ grounding DSL explicitly says hospital-aware scope is a semantic choice, not a fallback after general retrieval misses
- that matches the important v1 behavior from `medora-ai-chatbot-v1.dsl.yml`
- it also continues to lean on the same FAQ category/retrieval foundation that v1 used through:
  - `list-faq-categories-for-chatbot.use-case.ts`
  - `evaluate-faq-retrieval.use-case.ts`
  - `internal-faq-eval.routes.ts`

One nuance:

- `ConversationOrchestratorService.requiresFaqGrounding()` currently returns true for every `faq` and every `process_explanation`
  - `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts:58-62`
- the plan wording was a little narrower: grounding "when evidence is needed"

I do not think this is wrong.

But it is more eager than the plan language, so it likely increases latency/cost a bit versus a more selective gate.

## Commit-By-Commit Quick Verdict

- `b2f30c1`: directionally right, but too broad for a pure chunk-1 commit
- `0126d6a`: fine, small scaffolding follow-up
- `167d460`: correct schema tightening
- `b2dd82f`: correct follow-up handling tightening
- `c2a2f2e`: correct and well-shaped
- `7e256f9`: mostly right, but introduces the classifier-client fallback footgun and rewrites `.env.example` too broadly
- `8db67a1`: correct, small but useful contract clarification
- `adca336`: correct, improves human-handoff targeting
- `99976f6`: correct, big architectural win
- `b7001c4`: correct, makes the new path real
- `147865c`: correct, especially the supplemental resource-hint hardening and failure-path tests
- `d6da7c4`: correct, this is the real cutover away from local classification
- `491028c`: correct test coverage work
- `4cf0c8b`: correct regression coverage work
- `6c16641`: strong chunk, preserves the important v1 FAQ semantics while staying aligned with the v2 split architecture

## Spec And Plan Commit Verdict

Docs/spec commits reviewed:

- `72d0d2e`
- `abb2e99`
- `4b15182`
- `2740cae`
- `c1c5ada`
- `b995f1c`
- `8727794`
- `ebefd68`
- `1525ab6`
- `a0d4ee2`

Verdict:

- overall good
- the architecture direction is coherent
- the classifier spec and FAQ-grounding additions line up with what was eventually implemented

Main doc-level issue:

- the plan's sample test commands are not current-repo runnable anymore

That is a documentation drift issue, not an architecture issue.

## Bottom Line

If the question is "did this migration go in the right direction?", the answer is yes.

If the question is "are these commits perfect?", the answer is no, but the problems are concentrated:

- one real runtime risk: classifier client fallback is still too permissive
- one process issue: chunk labels do not map cleanly to rollback-quality commit boundaries
- one doc issue: plan test commands are stale for the current Vitest/workspace layout

Everything else is mostly strong work.

If I were deciding what to do next, I would do this:

1. fix the classifier client fallback so it behaves like FAQ grounding
2. update the plan doc test commands to match the actual repo
3. leave the rest of chunk 1-8 implementation in place

That is the highest-signal next move.
