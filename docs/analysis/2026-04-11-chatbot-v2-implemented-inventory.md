# Chatbot V2 Implemented Inventory

## Purpose

This document lists the important chatbot v2 files that are already implemented today, and explains what each one currently does.

The emphasis is on real code that already exists in the repo, not only on plan intent.

## Main Source Plans And Analysis Docs

- `docs/superpowers/plans/2026-04-06-language-agnostic-chatbot-semantics-implementation.md`
- `docs/superpowers/plans/2026-04-07-chatbot-state-truth-consolidation-implementation.md`
- `docs/superpowers/plans/2026-04-10-chat-journey-resource-architecture-implementation.md`
- `docs/superpowers/plans/2026-04-11-chatbot-v2-llm-classifier-implementation.md`
- `docs/superpowers/specs/2026-04-10-chat-journey-resource-architecture-design.md`
- `docs/superpowers/specs/2026-04-11-chatbot-v2-llm-classifier-design.md`
- `docs/analysis/2026-04-11-chatbot-v2-implementation-overview.md`

## Current V2 State At A Glance

- Recent milestone:
  - commit `6c16641` (`Add chatbot v2 FAQ grounding workflow`) landed the dedicated FAQ grounding workflow, route integration, tests, and Dify wiring for chunk 8

- Implemented on the main CRM runtime path:
  - plan chunks 1-6 are effectively landed in code: shared classifier contract, LLM classifier adapter, classifier-driven orchestrator, dedicated classifier DSL, and route-level classifier -> orchestrator -> composer threading
  - dedicated FAQ grounding is also now wired in, so chunk 8 has meaningful implementation beyond the original chunk 1-6 scope
  - shared v2 schema for journey, resources, classifier input, and classifier result
  - truth-to-journey derivation
  - resource registry and orchestrator
  - Dify composer workflow for v2
  - dedicated Dify classifier workflow
  - dedicated Dify FAQ grounding workflow
  - API-side context builder that calls the classifier before orchestration
  - route integration that stores `chatbotV2` and `classifierResult`, and passes `faqGrounding` into the composer when needed
  - China-side typed v2 resource models and a basic renderer scaffold
- Still transitional:
  - `request-classifier.service.ts` still exists as an old rule-based compatibility artifact even though the main v2 runtime path no longer uses it
  - China `chat-v2` renderers are scaffold-level and `rolloutReadyResourceTypes` is currently empty
  - public API still carries legacy v1 fields alongside v2 fields
  - chunk 7 regression/live-behavior safety is partly encoded in tests, but this document does not treat the manual smoke checklist as fully proven

## Plan Chunk Status Snapshot

- Chunk 1: implemented
  - shared classifier result validation and classifier-driven orchestration tests are present
- Chunk 2: implemented
  - structured classifier input/result types and shared schemas are present
- Chunk 3: implemented on the main runtime path
  - `llm-request-classifier.service.ts` is live
  - note: the old `request-classifier.service.ts` file still exists as cleanup debt
- Chunk 4: implemented
  - `ConversationOrchestratorService` now requires injected classifier output and no longer self-classifies
- Chunk 5: implemented
  - `medora-ai-chatbot-v2-classifier.dsl.yml` exists and is locked by contract tests
- Chunk 6: implemented
  - API routes thread classifier -> orchestrator -> FAQ grounding -> composer
- Chunk 7: partially implemented
  - many regression cases are covered by tests, but the plan's full manual smoke checklist is not something this document can certify from code alone
- Chunk 8: implemented on the core backend path
  - dedicated FAQ grounding DSL, route helper, contract tests, and route integration are present

## Shared Validation And Core Types

### `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`

- Role: canonical v2 contract
- Current logic:
  - defines the five journey stages and three phases
  - defines minimal resource status values: `available`, `submitted`, `failed`
  - defines the resource union for process, progression, handoff, and status-query resources
  - defines the v2 assistant envelope: `text`, `resources`, `journeySnapshot`, `metadata`
  - defines structured classifier input and structured classifier result schemas
  - enforces contract rules such as:
    - FAQ cannot target resources
    - `includeProgressionFollowUp` is only valid for `faq` and `process_explanation`
    - `resource_request` and `resource_status_question` must target at least one resource
- Why it matters:
  - this is the strongest already-landed v2 boundary in the system

### `packages/application/src/services/chatbot-v2/types.ts`

- Role: application-layer v2 types
- Current logic:
  - mirrors journey snapshot, journey truth, resource descriptor, classifier input, and orchestrator output types
  - defines the `JourneyTransitionEvent` union
  - keeps the service contracts explicit between classifier, truth, journey, and orchestration layers
- Why it matters:
  - this is the local service contract that the CRM-side v2 implementation is built around

## Truth, Journey, Resource, And Orchestration Services

### `packages/application/src/services/chatbot-v2/journey-truth.service.ts`

- Role: bridge from CRM status snapshot to v2 journey truth
- Current logic:
  - derives booleans such as `medicalInputsStarted`, `medicalInputsSubmitted`, `recommendationAvailable`, `recommendationConfirmed`, `onlineConsultStarted`, and `humanHandoffActive`
  - uses persisted CRM snapshot states such as `formStatus`, `docUploadStatus`, `recommendationStatus`, `consultationStatus`, `packageStatus`, and `handoffStatus`
  - supports small overrides for truth fields when needed
- Why it matters:
  - this is the main "business truth wins" bridge for v2 right now

### `packages/application/src/services/chatbot-v2/journey-engine.service.ts`

- Role: derive and advance journey snapshots
- Current logic:
  - derives the current journey stage/phase from truth
  - maps human handoff to `HUMAN_HANDOFF.active`
  - maps submitted consult to `ONLINE_CONSULT.post`
  - maps available recommendations or submitted medical inputs to `RECOMMENDATION.active`
  - maps started medical input collection to `COLLECT_MEDICAL_INPUTS.active`
  - falls back to `EXPLAIN_PROCESS.active`
  - supports explicit transitions for `START_MEDICAL_INPUTS` and `REQUEST_HUMAN_HANDOFF`
- Why it matters:
  - this is the core v2 stage engine already in production code

### `packages/application/src/services/chatbot-v2/resource-registry.service.ts`

- Role: registry of all v2 resources and their visibility rules
- Current logic:
  - registers `PROCESS_GUIDE`, `MEDICAL_DOC_UPLOAD`, `QUESTIONNAIRE`, `HOSPITAL_RECOMMENDATION`, `PACKAGE_RECOMMENDATION`, `ONLINE_CONSULT_BOOKING`, `HUMAN_HANDOFF`, and `MEDICAL_INVITATION_STATUS`
  - assigns deterministic resource IDs scoped by `scopeId`
  - marks global resources versus journey-scoped resources
  - derives resource status from truth
  - returns resource payloads and allowed actions for each resource
- Why it matters:
  - this is the single current source of the resource universe for v2

### `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`

- Role: CRM-side v2 decision layer
- Current logic:
  - requires a structured classifier result to be supplied by the caller
  - no longer falls back to local rule-based self-classification
  - takes the structured request classification and current truth
  - computes whether the journey should advance
  - computes the projected allowed resources after that journey update
  - narrows the allowed resource set to explicitly targeted resources when appropriate
  - adds implicit targeting for human-help requests so `HUMAN_HANDOFF` can still be surfaced even without explicit resource targeting
  - accepts or rejects `includeProgressionFollowUp`
  - returns `requestClass`, `responseIntent`, `allowedResources`, `journeyUpdate`, and optional `resourceUpdates`
- Why it matters:
  - this is the file where CRM actually decides what the assistant is allowed to do next

## Classifier Layer

### `packages/application/src/services/chatbot-v2/request-classifier.service.ts`

- Role: transitional compatibility classifier
- Current logic:
  - still uses keyword and pattern matching
  - detects human-help, process, status, progression, and concrete resource requests
  - bridges some old `resolvedIntent` values into the new structured v2 classification shape
- Why it matters:
  - this file is implemented, tested, and still present
  - it is no longer the desired end state, and the orchestrator no longer relies on it as a fallback
  - it now mainly documents the old compatibility path that the dedicated classifier replaced

### `packages/application/src/services/chatbot-v2/llm-request-classifier.service.ts`

- Role: structured adapter for the dedicated LLM classifier
- Current logic:
  - validates classifier input using the shared v2 schema
  - calls a classifier gateway
  - parses direct structured results
  - also parses Dify outputs that return JSON inside `answer` or inside metadata
  - throws when the classifier payload violates the approved schema
- Why it matters:
  - this is the actual CRM-side service that makes the LLM classifier usable safely

## API Context And Route Integration

### `apps/api/src/routes/chatbot-v2-context.ts`

- Role: build v2 context around each user turn
- Current logic:
  - fetches the CRM AI policy context for the session
  - reads foundation context from `chatbot_v2` fields already projected into policy context
  - derives journey truth from status snapshot
  - builds classifier inputs from:
    - recent messages
    - conversation summary
    - current journey snapshot
    - lightweight allowed resource hints
  - calls the dedicated classifier via `difyClassifierApi`, with fallback to `difyApi`
  - passes the structured classifier result into the orchestrator
  - builds both pre-turn and post-turn v2 envelopes
  - supplements classifier hints with progression resources during `EXPLAIN_PROCESS` so explicit requests still classify correctly
- Why it matters:
  - this is the current heart of the CRM-side v2 request pipeline

### `apps/api/src/routes/chatbot-v2-faq-grounding.ts`

- Role: CRM-side adapter for dedicated v2 FAQ grounding
- Current logic:
  - calls `difyFaqGroundingApi` only
  - if the dedicated FAQ grounding client is not configured, logs a warning and skips grounding for that turn instead of silently falling back to the composer client
  - passes only the narrow FAQ-grounding inputs:
    - `hospitalType`
    - `query`
    - `activeHospitalId`
    - `activeHospitalName`
  - parses structured FAQ grounding results from either top-level fields or JSON returned inside `answer`
  - normalizes the result into `faqScope`, `categories`, and `groundedContext`
  - returns `null` when the grounding payload is structurally incomplete
- Why it matters:
  - this is the backend seam that lets FAQ retrieval remain grounded without pushing that logic back into the main composer workflow

### `apps/api/src/composition-root.ts`

- Role: runtime wiring for separate Dify app clients
- Current logic:
  - constructs the default composer `difyApi`
  - constructs `difyClassifierApi` using `DIFY_CLASSIFIER_APP_API_KEY` with fallback to the general app key
  - constructs `difyFaqGroundingApi` using `DIFY_FAQ_GROUNDING_APP_API_KEY` with fallback to the general app key
  - exposes all three clients to the route layer through `getServices()`
- Why it matters:
  - this is what makes the chunk 5 and chunk 8 split real at runtime instead of only existing in docs

### `apps/api/src/__tests__/internal.faq-categories.test.ts` and `apps/api/src/routes/internal-faq-eval.routes.ts`

- Role: supporting internal tooling around v2-era FAQ quality and retrieval helpers
- Current logic:
  - lock the internal FAQ category MCP endpoint behavior
  - lock the internal FAQ retrieval evaluation endpoint behavior
  - preserve internal tooling that helps validate FAQ behavior while v1 and v2 coexist
- Why it matters:
  - these support files are not the main v2 runtime, but they materially support migration safety

### `apps/api/src/routes/chatbot.routes.ts`

- Role: public route integration point
- Current v2 logic already present:
  - calls `buildChatbotV2TurnContext(...)` before the Dify composer call
  - calls `resolveChatbotV2FaqGrounding(...)` before composition when the orchestrator marks the turn as requiring FAQ grounding
  - sends `chatbotV2` into Dify start inputs
  - sends `faqGrounding` into the composer inputs when FAQ grounding resolved successfully
  - calls `buildChatbotV2PostTurnContext(...)` after the Dify response
  - stores `chatbotV2` and `classifierResult` in assistant metadata
  - returns `journeySnapshot` and `resources` in the public response alongside legacy fields
- Why it matters:
  - v2 is not isolated in a branch-only service; it is already wired into the public chatbot route

### `apps/api/src/routes/patient-widget-starter.ts`

- Role: starter-turn integration for v2
- Current v2 logic already present:
  - builds a v2 turn context with a classifier override for process explanation
  - resolves FAQ grounding before the starter composer call when required
  - sends `chatbotV2` into the starter Dify call
  - sends grounded FAQ context into the starter composer call when available
  - stores `chatbotV2` and `classifierResult` in the seeded assistant message metadata
  - gates emitted blocks against post-turn v2 resources
- Why it matters:
  - even the first assistant message after onboarding is already partially aligned to v2

## Dify Workflows

### `dify-config/medora-ai-chatbot-v2.dsl.yml`

- Role: v2 composer workflow
- Current logic:
  - accepts CRM-owned `chatbotV2` plus session/message/status/page/attachment inputs
  - parses `chatbotV2` into request class, response intent, journey stage/phase, allowed resources, and conservative next-action hints
  - runs a v2 composer prompt that is explicitly told Dify is not the workflow owner
  - normalizes the composer output into a strict JSON answer
  - writes back a normalized policy decision through the internal writeback route
- Why it matters:
  - this is the current v2 composer path, already under contract tests

### `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`

- Role: dedicated v2 classifier workflow
- Current logic:
  - accepts only `recentMessages`, `conversationSummary`, `journeySnapshot`, and `allowedResourceHints`
  - uses a multilingual description-driven prompt
  - returns only `requestClass`, `targetResourceTypes`, and `includeProgressionFollowUp`
  - normalizes imperfect JSON responses into the strict approved shape
  - does not perform writeback or final composition
- Why it matters:
  - this is the cleanest implementation of the "classifier understands, CRM decides, composer speaks" split

### `dify-config/medora-ai-chatbot-v2-faq-grounding.dsl.yml`

- Role: dedicated v2 FAQ grounding workflow
- Current logic:
  - accepts `hospitalType`, `query`, `activeHospitalId`, and `activeHospitalName`
  - calls internal FAQ category/context helpers
  - resolves explicit `faqScope` as `GENERAL_ONLY` or `HOSPITAL_AWARE`
  - routes retrieval through compact general and hospital-aware knowledge branches instead of recreating the old v1 gate sprawl
  - returns grounded FAQ context rather than final user-facing copy
- Why it matters:
  - this is the piece that carries forward the strong v1 FAQ semantics without putting composition authority back into retrieval

## Infrastructure Support

### `packages/infrastructure/services/dify-api-client.service.ts`

- Role: reusable Dify transport for composer, classifier, and FAQ grounding apps
- Current logic:
  - posts blocking chat requests to `/chat-messages`
  - supports per-instance API keys, which is how classifier and FAQ grounding can use separate app credentials
  - preserves arbitrary `inputs` payloads, so classifier/composer/grounding can each pass different structured contracts without a specialized transport
  - also supports dataset document operations used by the FAQ knowledge pipeline
- Why it matters:
  - the v2 split into separate Dify apps relies on this generic transport staying reusable and key-aware

## Tests That Lock The V2 Contract

### `apps/api/src/__tests__/chatbot-v2-context.test.ts`

- Role: route-adjacent behavior test for the v2 context builder
- Current logic covered:
  - uses Dify classifier transport instead of reviving local rule-based classification
  - preserves later-stage process explanations without rewinding the journey
  - falls back to repository messages when policy context omits `recent_messages`
  - includes supplemental resource hints for early-stage explicit resource requests

### `apps/api/src/__tests__/dify-workflow-v2.contract.test.ts`

- Role: contract test for the v2 composer DSL
- Current logic covered:
  - asserts the v2 start input contract
  - asserts the minimal v2 node chain
  - asserts the parser/composer/normalizer/writeback responsibilities
  - asserts old v1 heuristic fields are gone from the v2 workflow

### `apps/api/src/__tests__/dify-classifier-v2.contract.test.ts`

- Role: contract test for the classifier DSL
- Current logic covered:
  - asserts the dedicated classifier input contract
  - asserts the classifier-only node chain
  - asserts the multilingual description-driven system prompt
  - asserts the classifier workflow does not include composer or writeback logic

### `apps/api/src/__tests__/dify-faq-grounding-v2.contract.test.ts`

- Role: contract test for the dedicated FAQ grounding DSL
- Current logic covered:
  - asserts the FAQ grounding input contract
  - asserts the compact category-resolution -> retrieval -> normalize pipeline
  - asserts `faqScope` stays explicit as `GENERAL_ONLY` or `HOSPITAL_AWARE`
  - asserts hospital-aware retrieval is not modeled as silent fallback from general retrieval
  - asserts the workflow returns grounded context instead of final user-facing copy

### `apps/api/src/__tests__/chatbot-v2-faq-grounding.test.ts`

- Role: helper-level runtime test for the FAQ grounding route adapter
- Current logic covered:
  - asserts FAQ grounding does not silently fall back to the main Dify composer client when the dedicated grounding client is absent
  - asserts the dedicated FAQ grounding client is used when configured
  - asserts grounded FAQ payloads are normalized into `faqScope`, `categories`, and `groundedContext`

### `apps/api/src/__tests__/chatbot.routes.test.ts` and `apps/api/src/__tests__/patient-public.routes.test.ts`

- Role: route-level proof that the split classifier/grounding/composer path is actually wired
- Current logic covered:
  - public chat turns call the dedicated classifier client before composition
  - FAQ-grounded turns call the dedicated FAQ grounding client before composition
  - assistant metadata stores `classifierResult` and `chatbotV2`
  - onboarding/widget starter flows reuse the same v2 starter path instead of falling back to local matching

### `apps/api/src/__tests__/composition-root.test.ts`

- Role: service-wiring test for v2 Dify client separation
- Current logic covered:
  - asserts `getServices()` exposes `difyClassifierApi`
  - asserts `getServices()` exposes `difyFaqGroundingApi`
  - helps lock the runtime dependency graph that chunk 5 and chunk 8 depend on

### `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`

- Role: service-level decision tests
- Current logic covered:
  - progression requests advancing from process explanation to medical-input collection
  - resource-status questions narrowing to the requested query resource
  - human-help requests moving into the handoff journey
  - process explanations staying informational in later stages
  - early recommendation requests being redirected to medical-input collection first

### `packages/infrastructure/__tests__/unit/dify-api-client.service.test.ts`

- Role: transport-level confidence for Dify multi-app usage
- Current logic covered:
  - asserts blocking chat requests are posted with the expected payload
  - asserts structured `inputs` are preserved as-is
  - asserts Dify error payloads surface correctly
  - asserts dataset requests can use a separate dataset API key

### `packages/application/src/services/__tests__/chatbot-v2/llm-request-classifier.service.test.ts`

- Role: safety tests for classifier input and output handling
- Current logic covered:
  - schema-normalized gateway input
  - parsing structured direct output
  - parsing JSON returned in Dify `answer`
  - rejecting invalid structured payloads

## China Frontend V2 Scaffolding

### `src/components/chat-v2/resources/types.ts`

- Role: mirrored v2 resource contract on the China side
- Current logic:
  - defines the same journey stages, phases, resource status values, and resource types as the CRM v2 schema
  - defines the frontend `ChatV2ResourceDescriptor` shape
- Why it matters:
  - this is the frontend type boundary for resource-native rendering

### `src/components/chat-v2/resources/registry.tsx`

- Role: frontend renderer registry for v2 resources
- Current logic:
  - maps every known resource type to a placeholder `ResourceShell`
  - safely falls back to `UnknownResourceShell` for unknown types
  - exports `isChatV2ResourceRolloutReady(...)`
  - currently keeps `rolloutReadyResourceTypes` empty
- Why it matters:
  - the renderer scaffolding is implemented, but rollout is intentionally conservative and not feature-complete yet

### `src/components/chat-v2/ChatV2MessageResources.tsx`

- Role: message-scoped v2 resource container
- Current logic:
  - renders a vertical stack of resources for one assistant message
  - stamps `data-chat-v2-stage` and `data-chat-v2-phase` attributes for QA/debugging
  - delegates each resource to the registry renderer
- Why it matters:
  - this is the already-landed frontend insertion point for resource-native chat messages

### `src/services/api/patient-chatbot.ts`

- Role: China-side typed API support for v2 payloads
- Current logic:
  - includes typed `journeySnapshot` and `resources` in history and send-message responses
  - keeps compatibility with legacy `blocks`
  - makes no assumption that the backend is block-only anymore
- Why it matters:
  - the API layer already supports mixed-mode v1/v2 payloads

### `src/components/chat/PatientChatMessageList.tsx`

- Role: mixed-mode renderer bridge
- Current v2 logic:
  - reads `resources` and `journeySnapshot` from assistant messages
  - prefers v2 resources when resources exist and are rollout-ready
  - otherwise falls back to legacy block rendering
- Why it matters:
  - this is the operational bridge that allows the migration to be gradual instead of big-bang

## Practical Takeaways

- The CRM-side v2 core is already real: schema, truth derivation, journey engine, resource registry, orchestrator, context builder, and Dify classifier/composer workflows all exist.
- The public route already carries v2 context, even though it still publishes legacy fields for compatibility.
- The frontend v2 contract and insertion points already exist, but the actual resource UI rollout is still intentionally shallow.
- The biggest remaining migration risk is not missing architecture. It is cleaning up the transitional layers so the final runtime stops depending on legacy v1 block/action assumptions.
