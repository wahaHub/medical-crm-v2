# Chatbot V1 Reuse Inventory

## Purpose

This document is a curated inventory of the important chatbot v1-era files that are already implemented and can still be reused during the v1 -> v2 migration.

This is not an exhaustive file dump. It focuses on files that still carry meaningful business logic, contracts, or UI that the migration can build on.

## Main Source Plans And Specs

- `docs/superpowers/plans/2026-03-20-dify-ai-chatbot.md`
- `docs/superpowers/plans/2026-03-31-faq-category-aware-retrieval-implementation.md`
- `docs/superpowers/plans/2026-04-02-faq-seed-corpus-implementation.md`
- `docs/superpowers/plans/2026-04-04-chatbot-rich-blocks-and-action-orchestration-implementation.md`
- `docs/superpowers/plans/2026-04-05-phase-2bc-widget-migration-implementation.md`
- `docs/superpowers/plans/2026-04-07-chatbot-state-truth-consolidation-implementation.md`
- `docs/superpowers/specs/2026-03-20-dify-ai-chatbot-design.md`
- `docs/superpowers/specs/2026-04-04-chatbot-rich-blocks-and-action-orchestration-design.md`

## Reuse Summary

- Latest migration milestone:
  - commit `6c16641` (`Add chatbot v2 FAQ grounding workflow`) confirms that the v1 FAQ category/scope semantics are no longer just planned for reuse; they are now actively threaded into the v2 grounding path

- Reuse directly:
  - public chat API contract shape
  - convert / escalate / upload flows
  - FAQ admin and FAQ seed/corpus pipeline
  - FAQ category-aware retrieval semantics and internal FAQ helper surfaces, which are now also being reused by the dedicated v2 FAQ grounding path
  - China-side block UI and widget shell
- Reuse with partial refactor:
  - `chatbot.routes.ts` because it now mixes v1 response fields with v2 context plumbing
  - `patient-widget-starter.ts` because the bootstrap pattern is good but its current prompt/normalization is still legacy-block oriented
  - `dify-config/medora-ai-chatbot-v1.dsl.yml` only as reference, not as the long-term orchestrator
- Do not treat as final architecture:
  - v1 Dify workflow orchestration
  - old rich-action driven decision logic

## CRM Backend

### `apps/api/src/routes/chatbot.routes.ts`

- Reuse level: partial reuse
- Why it matters: this is still the main public route for `/api/v2/chatbot/chat`, `/convert`, `/escalate`, `/uploads/init`, and history.
- Current logic:
  - owns session bootstrap and session-secret authorization for chatbot sessions
  - persists the user message, creates an assistant draft message, then calls Dify
  - now optionally resolves dedicated v2 FAQ grounding before the composer call when the v2 orchestrator marks the turn as FAQ-grounded
  - normalizes Dify output into the public API response shape
  - still exposes v1 fields such as `answer`, `nextAction`, `citations`, `collectedFields`, `missingItems`, `recommendedProviders`, `shortlist`, and `blocks`
  - now also injects v2 data by calling `buildChatbotV2TurnContext(...)` before Dify and `buildChatbotV2PostTurnContext(...)` after Dify, then stores `chatbotV2` and `classifierResult` in assistant metadata
- Reuse value for migration:
  - keep as the route shell and session/workflow integration point
  - continue reusing convert/escalate/upload/history behavior
  - gradually shrink legacy `nextAction + blocks` dependence inside this file

### `apps/api/src/routes/chatbot-block-builder.ts`

- Reuse level: direct reuse as bridge layer
- Why it matters: this is the backend adapter from legacy `richAction` to frontend-renderable rich blocks.
- Current logic:
  - maps `EXPLAIN_MEDICAL_TRAVEL_PROCESS` to `PROCESS_MODAL_TRIGGER`
  - maps `REQUEST_DOC_UPLOAD` to `QUESTIONNAIRE_MODAL_TRIGGER`
  - maps `SHOW_HOSPITAL_RECOMMENDATIONS` to `HOSPITAL_RECOMMENDATION_CARDS`
  - maps `INVITE_ONLINE_CONSULT` to `ONLINE_CONSULT_BOOKING_CARD`
  - gates block emission against `allowedResourceTypes` so backend does not emit UI that current v2 context disallows
  - validates every emitted block against `chatbotMessageBlockSchema`
- Reuse value for migration:
  - very useful as a compatibility layer while China still relies on block-based UI
  - can remain until resource-native v2 renderers are ready

### `apps/api/src/routes/patient-widget-starter.ts`

- Reuse level: partial reuse
- Why it matters: this seeds the first assistant message after patient onboarding creates a case.
- Current logic:
  - avoids reseeding if a real conversation already started
  - creates or updates a starter assistant draft message
  - calls Dify with a starter prompt, the CRM-built `chatbotV2` pre-turn context, and FAQ grounding when the starter turn requires it
  - resolves questionnaire template IDs when the returned action is doc-upload oriented
  - persists starter message text, shortlist, `blocks`, `chatbotV2`, and `classifierResult`
- Reuse value for migration:
  - keep the pattern of "seed assistant starter after onboarding"
  - keep the idempotent starter-message detection
  - likely refactor the text/normalization path to become fully resource/journey driven

### `packages/shared/validation/src/chatbot.schema.ts`

- Reuse level: direct reuse for the public compatibility contract
- Why it matters: this is the shared schema source for the legacy public chatbot API and block payloads.
- Current logic:
  - defines request schemas for chat, convert, escalate, history, and upload-init
  - defines legacy enums such as `chatbotNextActionSchema`, `chatbotIntentSchema`, and `chatbotRiskLevelSchema`
  - defines the four rich block payload unions
  - defines the public chat response schema, which now also includes `journeySnapshot` and `resources`
- Reuse value for migration:
  - keep it while frontend still expects the legacy response shape
  - use it as the compatibility boundary during gradual migration

### `dify-config/medora-ai-chatbot-v1.dsl.yml`

- Reuse level: reference only
- Why it matters: this is the old Dify-heavy workflow that the v2 architecture is replacing.
- Current logic:
  - does extraction first, then calls CRM `decide_http`
  - runs risk gating and engagement gating
  - branches into FAQ scope, package listing, hospital search, and writeback flows
  - still reflects a model where Dify owns too much routing/orchestration detail
- Reuse value for migration:
  - useful for prompt/copy/reference behavior
  - useful for seeing old routing assumptions
  - should not remain the long-term orchestration authority

## FAQ And Knowledge Layer

### `apps/api/src/routes/chatbot-faq.routes.ts`

- Reuse level: direct reuse
- Why it matters: this is the operational CRUD surface for chatbot FAQ content and FAQ attachment uploads.
- Current logic:
  - exposes create/list/get/update/delete routes for FAQ items
  - exposes create/list/delete routes for FAQ categories
  - exposes attachment upload intent initialization for FAQ assets
- Reuse value for migration:
  - v2 still needs curated FAQ knowledge and category management
  - no reason to rewrite this for the v2 migration

### `packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.ts`

- Reuse level: direct reuse
- Why it matters: this is the current category-source resolution used by chatbot retrieval logic.
- Current logic:
  - loads active general categories and optional hospital-specific categories
  - de-duplicates categories by name
  - keeps the smallest sort order when general and hospital-specific categories overlap
  - returns a stable, sorted category list for chatbot consumption
- Reuse value for migration:
  - good reusable knowledge-layer primitive for v2 FAQ classification/retrieval
  - this is part of the semantics that the dedicated v2 FAQ grounding workflow is preserving

### `packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.ts`

- Reuse level: direct reuse
- Why it matters: this is the current evaluation harness for category-aware FAQ retrieval quality.
- Current logic:
  - resolves available categories from general plus optional hospital scope
  - scores categories against the query using category tokens, FAQ question tokens, keywords, and answers
  - returns actual categories, actual scope, pass/fail status, and diagnostic notes
- Reuse value for migration:
  - useful for regression checks while moving FAQ routing into v2
  - keeps a repeatable way to judge whether category routing got worse
  - now especially useful because v2 FAQ grounding is trying to preserve these same scope/category semantics

### `packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts`

- Reuse level: direct reuse
- Why it matters: this is the seed-import pipeline for canonical FAQ corpus and evaluation data.
- Current logic:
  - validates category/item scope consistency
  - upserts categories and FAQ items
  - preserves attachments on update
  - optionally enqueues AI sync work for Dify-facing knowledge sync
- Reuse value for migration:
  - v2 still needs seeded FAQ corpus and sync
  - this is already structured enough to keep

### `apps/api/src/routes/internal-faq-eval.routes.ts`

- Reuse level: direct reuse
- Why it matters: this is the internal debug/evaluation endpoint for FAQ retrieval quality.
- Current logic:
  - exposes `/api/v2/internal/faq-retrieval/evaluate`
  - requires the internal secret header
  - forwards evaluation requests into `evaluateFaqRetrieval`
  - returns a stable envelope with actual categories, scope, pass/fail, and notes
- Reuse value for migration:
  - useful for verifying that v2 FAQ behavior stays grounded and category-aware

### `apps/api/src/routes/internal.routes.ts`

- Reuse level: partial reuse
- Why it matters: this is the internal Dify/MCP surface that already exposes AI policy and FAQ helper endpoints.
- Current logic:
  - mounts internal policy context/decide/writeback endpoints
  - exposes internal FAQ category and FAQ evaluation routes used by workflow-side tooling
  - uses the shared internal secret gate
- Reuse value for migration:
  - remains the internal integration surface for Dify-side helpers and evaluation tooling
  - still underpins the FAQ helper surface that the dedicated v2 grounding workflow depends on

### `dify-config/seed-knowledge/*`

- Reuse level: direct reuse as seed/reference content
- Why it matters: this is the current minimal seed knowledge package for local Dify validation.
- Current logic:
  - contains FAQ seed markdown for cosmetic and regular flows
  - contains package seed markdown
  - documents recommended Dify dataset mapping in `dify-config/seed-knowledge/README.md`
- Reuse value for migration:
  - still useful as local validation content and sanity-check corpus during v2 workflow work

## China Frontend

### `src/services/api/patient-chatbot.ts`

- Reuse level: direct reuse
- Why it matters: this is the typed China-side client for chatbot send/history/upload APIs.
- Current logic:
  - defines typed responses for chat history and send-message
  - already understands both legacy `blocks` and v2 `journeySnapshot/resources`
  - posts attachments through `/api/v2/chatbot/uploads/init`
- Reuse value for migration:
  - keep as the frontend API adapter
  - extend in place rather than replacing it

### `src/types/chatbot-blocks.ts`

- Reuse level: direct reuse as long as legacy blocks remain
- Why it matters: this is the mirrored frontend union for the four backend-emitted rich blocks.
- Current logic:
  - defines `PROCESS_MODAL_TRIGGER`
  - defines `QUESTIONNAIRE_MODAL_TRIGGER`
  - defines `HOSPITAL_RECOMMENDATION_CARDS`
  - defines `ONLINE_CONSULT_BOOKING_CARD`
  - includes unknown-block passthrough so unsupported block types do not crash rendering
- Reuse value for migration:
  - keep until the block layer is fully retired

### `src/components/chat/ChatMessageBlocks.tsx`

- Reuse level: direct reuse as bridge layer
- Why it matters: this is the frontend dispatcher for legacy rich blocks.
- Current logic:
  - switches on block type
  - renders process trigger, questionnaire trigger, hospital cards, and consult booking card
  - wires UI callbacks for hospital submit, questionnaire open, and consult submit
  - ignores unknown block types safely
- Reuse value for migration:
  - keep as the legacy renderer while resource-native v2 cards are not rollout-ready

### `src/components/chat/blocks/HospitalRecommendationCards.tsx`

- Reuse level: direct reuse
- Why it matters: this is the current hospital recommendation visual system the backend v1/v1.5 already targets.
- Current logic:
  - shows up to three hospitals
  - supports thumbnail fallback rotation
  - supports multi-select plus custom hospital request text
  - submits selected hospitals through a callback
- Reuse value for migration:
  - strong candidate to reuse visually when v2 eventually renders `HOSPITAL_RECOMMENDATION` as a resource instead of a legacy block

### `src/components/chat/blocks/OnlineConsultBookingCard.tsx`

- Reuse level: direct reuse
- Why it matters: this is the current executable consultation card UI.
- Current logic:
  - shows the converted consultation draft fields
  - handles idle/submitting/submitted/failed states locally
  - prevents double-submit and surfaces retry UI on failure
- Reuse value for migration:
  - can be reused almost directly when `ONLINE_CONSULT_BOOKING` becomes a first-class v2 resource renderer

### `src/components/chat/PatientChatMessageList.tsx`

- Reuse level: direct reuse
- Why it matters: this is the message list where legacy blocks and v2 resources already coexist.
- Current logic:
  - normalizes sender labels and assistant typing states
  - suppresses redundant assistant copy when hospital cards already explain the action
  - prefers v2 resource rendering when resources exist and are rollout-ready
  - otherwise falls back to legacy block rendering
  - renders message attachments for both patient and assistant threads
- Reuse value for migration:
  - this is the key bridge component for gradual rollout

### `src/components/chat/PatientEntryWindow.tsx`

- Reuse level: direct reuse with incremental cleanup
- Why it matters: this is the main China widget shell that blends profile collection, chatbot session history, and formal conversation history.
- Current logic:
  - chooses between chatbot-session mode and formal-conversation mode
  - converts backend chatbot history into compact frontend message items
  - preserves both `blocks` and `resources/journeySnapshot` on assistant messages
  - handles questionnaire modal, onboarding summary, and bootstrap error UI
- Reuse value for migration:
  - keep the shell and data-merging behavior
  - continue moving more logic from legacy block assumptions toward v2 resources

### `src/services/api/patient-entry.ts`

- Reuse level: direct reuse
- Why it matters: this file owns the executable actions triggered by chat UI.
- Current logic:
  - initializes onboarding, matches hospitals, and selects hospitals
  - loads questionnaire templates and responses
  - submits questionnaire/medical-form responses
  - submits consult conversion using `convertPath` and the card draft payload
- Reuse value for migration:
  - these action endpoints are still the operational backbone behind both legacy blocks and upcoming v2 resources

## Practical Migration Takeaways

- Keep the v1 public route shell and session mechanics, but continue hollowing out old `nextAction`-driven orchestration from inside.
- Keep the FAQ corpus, category retrieval, and seed-import stack. That is reusable product knowledge, not legacy-only glue.
- Keep China's message list, widget shell, hospital-card UI, and consult-card UI. They are already halfway adapted to a mixed block/resource world.
- Treat the old Dify v1 DSL as a reference artifact, not as the architecture to preserve.
