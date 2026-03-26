# Dify AI Chatbot Integration Implementation Plan

> This plan is revised for the real target: the chatbot is a consultation conversion entry, not only an FAQ bot.

**Goal:** ship an unmodified Dify-based chatbot that can:

- answer public FAQ / package / process questions
- route consultation intent into lead/case actions
- handle crisis queries safely
- create human escalation when needed

---

## Chunk 1: Data Model

### Task 1: Migration

**Files**

- Create: `packages/infrastructure/database/migrations/024_dify_ai_chat.sql`
- Modify: `packages/infrastructure/database/schema/schema.ts`
- Modify: `packages/domain/src/enums/index.ts`

- [ ] Add `AI_ESCALATION` to `TicketType`
- [ ] Create `ai_chat_sessions`
- [ ] Create `ai_chat_messages`
- [ ] Create `dify_document_mappings`
- [ ] Create `ai_sync_outbox`

**Required fields**

`ai_chat_sessions`

- `session_id`
- `session_secret_hash`
- `dify_conversation_id`
- `patient_id nullable`
- `hospital_type`
- `status`

`ai_chat_messages`

- `role`
- `content`
- `intent nullable`
- `risk_level nullable`
- `can_answer nullable`
- `next_action nullable`
- `citations jsonb`
- `metadata jsonb`

`dify_document_mappings`

- `entity_type`
- `entity_key`
- `dify_dataset_id`
- `dify_document_id`

`ai_sync_outbox`

- `entity_type`
- `entity_key`
- `action`
- `attempts`
- `next_retry_at`
- `status`

**Important**

- do not add `AI_CHATBOT` to `ConversationCategory`
- do not insert fake Dify/system users

---

## Chunk 2: Dataset Scope Strategy

### Task 2: Move from single logical scope to scoped datasets

**Files**

- Modify design/config docs
- Modify env loading in `apps/api/src/composition-root.ts`

- [ ] Add per-`hospitalType` dataset config
- [ ] Route FAQ sync to the correct dataset by scope
- [ ] Route package sync to the correct dataset by scope
- [ ] Explicitly exclude hospital-private FAQ from public chatbot unless dedicated dataset exists

**Env shape**

- `DIFY_FAQ_DATASET_ID_COSMETIC`
- `DIFY_FAQ_DATASET_ID_REGULAR`
- `DIFY_PACKAGE_DATASET_ID_COSMETIC`
- `DIFY_PACKAGE_DATASET_ID_REGULAR`

**Rule**

- do not rely on “scope text inside markdown” as the only guard

---

## Chunk 3: Domain & Repository Ports

### Task 3: Add ports

**Files**

- Create: `packages/domain/src/ports/ai-chat-session-repository.port.ts`
- Create: `packages/domain/src/ports/ai-chat-message-repository.port.ts`
- Create: `packages/domain/src/ports/dify-document-mapping-repository.port.ts`
- Create: `packages/domain/src/ports/ai-sync-outbox-repository.port.ts`
- Create: `packages/domain/src/ports/dify-sync-service.port.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] Add `IAiChatSessionRepository`
- [ ] Add `IAiChatMessageRepository`
- [ ] Add `IDifyDocumentMappingRepository`
- [ ] Add `IAiSyncOutboxRepository`
- [ ] Add `IDifySyncService`

**Must-have methods**

`IAiChatSessionRepository`

- `findBySessionId(sessionId)`
- `findByDifyConversationId(difyConversationId)`
- `save(...)`
- `attachPatient(...)`
- `updateStatus(...)`

`IAiChatMessageRepository`

- `create(...)`
- `listBySession(...)`

`IAiSyncOutboxRepository`

- `enqueue(...)`
- `claimBatch(...)`
- `markDone(...)`
- `markRetry(...)`

---

## Chunk 4: Dify Client

### Task 4: Thin client matching the vendored Dify API

**Files**

- Create: `packages/infrastructure/dify/dify-api-client.ts`
- Create: `packages/infrastructure/dify/types.ts`
- Create tests

- [ ] Add chat request wrapper
- [ ] Add text document create/update/delete wrapper
- [ ] Add stream event parsing helper

**Constraints**

- `POST /chat-messages`
- `POST /datasets/{datasetId}/document/create_by_text`
- `POST /datasets/{datasetId}/documents/{documentId}/update_by_text`
- confirm the delete endpoint from vendored Dify before implementation

---

## Chunk 5: Sync Service + Outbox Worker

### Task 5: Build reliable FAQ / package sync

**Files**

- Create: `packages/infrastructure/dify/dify-sync-service.ts`
- Create: `packages/infrastructure/workers/ai-sync-worker.ts` or equivalent
- Modify FAQ/package use cases
- Modify `apps/api/src/composition-root.ts`

- [ ] FAQ CRUD writes sync task into outbox
- [ ] package publish/update/delete writes sync task into outbox
- [ ] worker merges duplicate `entity_key` jobs
- [ ] worker retries transient Dify failures
- [ ] admin `fullSync` remains available

**Do not**

- directly fire-and-forget network sync on every CRUD path in production mode

---

## Chunk 6: Dify Workflow Design

### Task 6: Design the workflow around conversion, not only FAQ

**Artifacts**

- Dify workflow config
- internal prompt docs / JSON contract docs

- [ ] Add `Risk Classification` node
- [ ] Add `Intent Router`
- [ ] Add `FAQ_RAG` branch
- [ ] Add `CONSULT_CONVERSION` branch
- [ ] Add `UNKNOWN_ESCALATE` branch
- [ ] Add `SAFETY` branch

**Required output**

- `answer`
- `intent`
- `riskLevel`
- `canAnswer`
- `nextAction`
- `escalationReason`
- `citations`
- `collectedFields optional`
- `missingItems optional`
- `recommendedProviders optional`

**Expected values**

`intent`

- `FAQ`
- `CONSULT`
- `UNKNOWN`
- `SAFETY`

`riskLevel`

- `NORMAL`
- `SENSITIVE`
- `CRISIS`

`nextAction`

- `ANSWER`
- `CONSULT_CONVERSION`
- `CREATE_CASE`
- `REQUEST_DOCS`
- `ESCALATE`
- `SAFETY`

**Optional payload semantics**

- `collectedFields` carries reusable lead / case inputs such as `name`, `email`, `country`, `conditionSummary`, `budget`, `intent`
- `missingItems` drives document upload or checklist UI when `nextAction = REQUEST_DOCS`
- `recommendedProviders` carries optional provider recommendations for future provider DB integration
- MVP can persist these optional fields inside `ai_chat_messages.metadata` instead of adding dedicated columns
- v1 should keep `recommendedProviders` disabled even if the field remains in the contract
- v1 should default to `CONSULT_CONVERSION` for most conversion scenarios
- only use `CREATE_CASE` when user intent clearly indicates formal progression

---

## Chunk 7: Application Use Cases

### Task 7: Add chatbot orchestration in application layer

**Files**

- Create: `packages/application/src/use-cases/chatbot/send-chat-message.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot/get-chat-history.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot/escalate-chat.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot/convert-chat.use-case.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `apps/api/src/composition-root.ts`

- [ ] `SendChatMessageUseCase`
- [ ] `GetChatHistoryUseCase`
- [ ] `EscalateChatUseCase`
- [ ] `ConvertChatUseCase`

**Rules**

`SendChatMessageUseCase`

- accept `sessionId`, `hospitalType`, `message`
- ignore any frontend `difyConversationId`
- find session by `sessionId`
- create Dify conversation only on backend side
- mint `session_secret` on first request
- persist structured AI output

`GetChatHistoryUseCase`

- require `sessionId`
- require matching `session_secret`
- if patient logged in, also verify `patient_id`

`ConvertChatUseCase`

- map `CONSULT_CONVERSION` / `CREATE_CASE` / `REQUEST_DOCS` to actual CRM actions
- reuse the existing case-first business logic and field model from the patient dashboard/chat widget work
- use `collectedFields` as prefill input when present
- require `name`, `email`, `country`, `conditionSummary`, `budget`
- treat `recommendedProviders` as optional UI hints, not hard business logic
- v1 does not need live provider recommendation logic
- treat `CONSULT_CONVERSION` as the default conversion action
- only switch to `CREATE_CASE` when the user explicitly signals “start now / create case / match hospitals / proceed formally”

`EscalateChatUseCase`

- summarize transcript
- create `support_ticket(type = AI_ESCALATION)`
- update session status
- require `name`, `email`, `country`, `conditionSummary`, `budget`

---

## Chunk 8: API Routes

### Task 8: Add chatbot routes

**Files**

- Create: `apps/api/src/routes/chatbot.routes.ts`
- Modify: `apps/api/src/routes/index.ts`
- Add validation schemas
- Add route tests

- [ ] `POST /api/v2/chatbot/chat`
- [ ] `GET /api/v2/chatbot/history/{sessionId}`
- [ ] `POST /api/v2/chatbot/escalate`
- [ ] `POST /api/v2/chatbot/convert`
- [ ] `POST /api/v2/chatbot/uploads/init`
- [ ] `POST /api/v2/chatbot/sync` admin only

**Validation**

- `message` max 2000 chars
- `sessionId` required
- `hospitalType` required
- no accepted request field named `difyConversationId`
- `convert` / `escalate` require `name`, `email`, `country`, `conditionSummary`, `budget`
- `uploads/init` validates `fileName`, `fileSize`, `mimeType`

---

## Chunk 9: Session & Security Controls

### Task 9: Implement ownership guardrails

**Files**

- middleware under `apps/api/src/middleware/`
- related tests

- [ ] add IP rate limit
- [ ] add session-based rate limit
- [ ] add optional patient-session resolution
- [ ] set `session_secret` via `httpOnly` cookie
- [ ] enforce `sessionId + session_secret` on history / escalate / convert

**Suggested limits**

- 30 messages / minute / `sessionId`
- 60 messages / minute / IP
- stricter history limit than chat

---

## Chunk 10: Frontend Widget

### Task 10: Adapt widget for conversion actions

**Files**

- `packages/chat-widget/`
- consuming patient-facing apps

- [ ] store only `sessionId` in `localStorage`
- [ ] never store or submit `difyConversationId` as authoritative input
- [ ] parse `nextAction`
- [ ] show inline conversion widget inside the same chat modal when `CONSULT_CONVERSION`
- [ ] switch to a fuller case-collection widget inside the same chat modal when `CREATE_CASE`
- [ ] show document checklist and direct upload entry when `REQUEST_DOCS`
- [ ] use chatbot-specific upload init endpoint for `REQUEST_DOCS`
- [ ] prefill form fields from `collectedFields` when available
- [ ] do not render `recommendedProviders` in v1
- [ ] show crisis banner / safety notice when `SAFETY`
- [ ] show citations on FAQ answers when enabled

---

## Chunk 11: Verification

### Task 11: Automated

- [ ] repository tests for new tables
- [ ] Dify client tests
- [ ] sync worker tests
- [ ] route tests for chat/history/escalate/convert/sync

### Task 12: Manual

- [ ] FAQ question returns cited answer
- [ ] consult intent opens lead/case path
- [ ] ordinary consult intent defaults to `CONSULT_CONVERSION`
- [ ] explicit “start now / create case / match hospitals / proceed” intent upgrades to `CREATE_CASE`
- [ ] request-docs intent opens checklist/upload path
- [ ] chatbot uploads work before a formal case exists
- [ ] convert/escalate reject missing `name/email/country/conditionSummary/budget`
- [ ] unknown question says “don’t know” and offers escalation
- [ ] crisis input triggers fixed safety branch
- [ ] forged `difyConversationId` is ignored
- [ ] wrong `session_secret` cannot read history
- [ ] FAQ/package update reaches Dify through outbox

---

## Risks To Track

- public chatbot scope must remain dataset-isolated
- conversion UX must align with existing case-first field model while staying inside the same chat modal
- history leakage risk remains if `session_secret` is not implemented early

## V1 Decisions Locked

- public chatbot v1 uses only `hospitalType`-scoped datasets
- do not build single-hospital datasets in v1
- default conversion path is `CONSULT_CONVERSION`
- only explicit formal-progression intent should trigger `CREATE_CASE`
- `REQUEST_DOCS` must support direct upload, not only checklist display
- `REQUEST_DOCS` uploads use `POST /api/v2/chatbot/uploads/init`
- reuse existing upload infrastructure, but not the existing case/conversation upload business routes
- `recommendedProviders` stays as a reserved field and is not implemented in v1
