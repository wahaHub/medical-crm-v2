# Dify AI Chatbot Integration Implementation Plan

> For implementation workers: follow the revised spec in `docs/superpowers/specs/2026-03-20-dify-ai-chatbot-design.md`. This plan is intentionally aligned to the current codebase constraints, not the original brainstorm version.

**Goal:** Add a Dify-backed AI chatbot to CRM v2 with CRM-side chat logging, scoped FAQ/package sync, and human escalation.

**Key correction versus the original draft:**

- Do not reuse existing `conversations/messages` for anonymous AI chat
- Do not trust `userId` from frontend
- FAQ sync must include `hospital_id` scope
- Dify document sync must match the actual SDK/API path shape in the vendored `dify` tree

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
- [ ] Add indexes for `session_id`, `dify_conversation_id`, `(entity_type, entity_key)`
- [ ] Update Drizzle schema and domain exports

**Schema shape**

`ai_chat_sessions`

- `id`
- `session_id`
- `dify_conversation_id`
- `patient_id nullable`
- `hospital_type`
- `status`
- `created_at`
- `updated_at`

`ai_chat_messages`

- `id`
- `session_id` FK to `ai_chat_sessions.id`
- `role`
- `content`
- `can_answer nullable`
- `metadata jsonb`
- `created_at`

`dify_document_mappings`

- `id`
- `entity_type`
- `entity_key`
- `dify_dataset_id`
- `dify_document_id`
- `last_synced_at`
- `created_at`

**Notes**

- Do not insert a fake `SYSTEM` user in this migration
- Do not add `AI_CHATBOT` to `ConversationCategory` in v1

---

## Chunk 2: Domain & Repository Ports

### Task 2: Add ports for AI chat persistence

**Files**

- Create: `packages/domain/src/ports/ai-chat-session-repository.port.ts`
- Create: `packages/domain/src/ports/ai-chat-message-repository.port.ts`
- Create: `packages/domain/src/ports/dify-document-mapping-repository.port.ts`
- Create: `packages/domain/src/ports/dify-sync-service.port.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] Define `IAiChatSessionRepository`
- [ ] Define `IAiChatMessageRepository`
- [ ] Define `IDifyDocumentMappingRepository`
- [ ] Define `IDifySyncService`
- [ ] Export all new ports from domain index

**Required repository operations**

`IAiChatSessionRepository`

- `findBySessionId(sessionId: string)`
- `findByDifyConversationId(difyConversationId: string)`
- `save(...)`
- `attachPatient(...)`
- `updateStatus(...)`

`IAiChatMessageRepository`

- `create(...)`
- `listBySession(sessionDbId: string, limit?: number)`

`IDifyDocumentMappingRepository`

- `findByEntity(entityType, entityKey)`
- `save(...)`
- `deleteByEntity(...)`

`IDifySyncService`

- `syncFaqCategory(categoryName, hospitalType, hospitalId?)`
- `deleteFaqCategoryDocument(categoryName, hospitalType, hospitalId?)`
- `syncPackageType(type)`
- `fullSync()`

---

## Chunk 3: Infrastructure Repositories

### Task 3: Implement Drizzle repositories

**Files**

- Create: `packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-ai-chat-message.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-dify-document-mapping.repository.ts`
- Create tests under `packages/infrastructure/__tests__/`

- [ ] Implement AI chat session repo
- [ ] Implement AI chat message repo
- [ ] Implement Dify document mapping repo
- [ ] Add unit or integration tests following existing repository patterns

**Important**

- `entity_key` for FAQ must be scoped:
  - `faq:${hospitalType}:${hospitalId || "global"}:${categoryName}`
- `entity_key` for package can be:
  - `package:${type}`

---

## Chunk 4: Dify API Client

### Task 4: Implement a thin client around the real Dify API

**Files**

- Create: `packages/infrastructure/dify/dify-api-client.ts`
- Create: `packages/infrastructure/dify/types.ts`
- Create: `packages/infrastructure/dify/__tests__/dify-api-client.test.ts`

- [ ] Add typed wrapper for Dify chat requests
- [ ] Add typed wrapper for dataset document create/update/delete
- [ ] Add streaming parser helpers if needed
- [ ] Add tests with mocked `fetch`

**Must match the vendored SDK**

- Chat: `POST /chat-messages`
- Create text document: `POST /datasets/{datasetId}/document/create_by_text`
- Update text document: `POST /datasets/{datasetId}/documents/{documentId}/update_by_text`
- Delete document: use the actual documented delete endpoint from the vendored Dify client / API before implementation

**Do not use**

- `create-by-text`
- `update-by-text`
- `PUT` for text document updates

---

## Chunk 5: Dify Sync Service

### Task 5: Build scoped FAQ/package sync

**Files**

- Create: `packages/infrastructure/dify/dify-sync-service.ts`
- Create: `packages/infrastructure/dify/__tests__/dify-sync-service.test.ts`
- Modify: FAQ and package use cases
- Modify: `apps/api/src/composition-root.ts`

- [ ] Generate FAQ markdown from scoped category data
- [ ] Generate package markdown from published packages of a type
- [ ] Upsert document into Dify via `dify_document_mappings`
- [ ] Expose `fullSync()`
- [ ] Wire sync hooks into FAQ CRUD and package publish/update/delete flows

**Implementation notes**

- Use existing FAQ repo `findAll(...)` with `{ category, hospitalType, hospitalId, isActive: true }`
- Do not invent `findByCategory(...)` unless you also extend the domain port intentionally
- Use existing package repo `findAll(...)` with `{ type, status: 'PUBLISHED' }`
- Creating an empty Dify document for an empty category is not required

---

## Chunk 6: Public Chatbot Use Cases

### Task 6: Add application-layer chatbot orchestration

**Files**

- Create: `packages/application/src/use-cases/chatbot/send-chat-message.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot/get-chat-history.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot/escalate-chat.use-case.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `apps/api/src/composition-root.ts`

- [ ] `SendChatMessageUseCase`
- [ ] `GetChatHistoryUseCase`
- [ ] `EscalateChatUseCase`

**Responsibilities**

`SendChatMessageUseCase`

- resolve logged-in patient from cookie/session if present
- validate `sessionId`
- create or reuse `ai_chat_session`
- write user message
- call Dify streaming API
- persist assistant terminal message with `can_answer`

`GetChatHistoryUseCase`

- load session by `sessionId`
- enforce access:
  - logged-in patient must match `patient_id`
  - anonymous access must be bound to the same `sessionId`

`EscalateChatUseCase`

- summarize chat transcript
- for logged-in patient: create `support_ticket`
- for anonymous user: create or upsert a minimal patient record first, then create `support_ticket`
- mark `ai_chat_session.status = ESCALATED`

---

## Chunk 7: API Routes

### Task 7: Add chatbot routes in Hono

**Files**

- Create: `apps/api/src/routes/chatbot.routes.ts`
- Modify: `apps/api/src/routes/index.ts`
- Create or modify validation schemas in `packages/shared/validation/src/`
- Add tests in `apps/api/src/__tests__/chatbot.routes.test.ts`

- [ ] `POST /api/v2/chatbot/chat`
- [ ] `GET /api/v2/chatbot/history/{sessionId}`
- [ ] `POST /api/v2/chatbot/escalate`
- [ ] `POST /api/v2/chatbot/sync` (admin only)

**Route rules**

- `chat` is public but rate-limited
- `history` is not wide-open; enforce session ownership
- `escalate` requires valid `contactInfo`
- no request body field named `userId`

**Validation**

- max message length 2000
- `hospitalType` is required
- `sessionId` is required
- `contactInfo.email` required for anonymous escalation

---

## Chunk 8: Session & Abuse Controls

### Task 8: Add middleware and ownership checks

**Files**

- Modify or add middleware under `apps/api/src/middleware/`
- Add tests

- [ ] Add IP rate limit for chatbot routes
- [ ] Add session-based rate limit
- [ ] Add helper to read optional patient session cookie
- [ ] Add history ownership guard

**Suggested limits**

- 30 messages / minute / `sessionId`
- 60 messages / minute / IP

---

## Chunk 9: Frontend Widget

### Task 9: Build shared widget package

**Files**

- Create: `packages/chat-widget/`
- Integrate into the two patient-facing sites

- [ ] Store `sessionId` in `localStorage`
- [ ] Store `difyConversationId` in `localStorage`
- [ ] Stream SSE chunks
- [ ] Render escalation form
- [ ] Never accept or inject `userId`

**Widget props**

- `apiBaseUrl`
- `hospitalType`
- `locale?`
- `theme?`

---

## Chunk 10: Tests & Rollout

### Task 10: Verification

**Automated**

- [ ] repository tests for new tables
- [ ] Dify client tests
- [ ] sync service tests
- [ ] route tests for chat/history/escalate/sync

**Manual**

- [ ] anonymous cosmetic-site chat
- [ ] logged-in patient chat
- [ ] FAQ update triggers Dify sync
- [ ] package publish triggers Dify sync
- [ ] escalation creates ticket
- [ ] history refresh restores transcript

### Task 11: Deployment

- [ ] deploy Dify
- [ ] configure model provider
- [ ] create FAQ / Package datasets
- [ ] create chatbot app
- [ ] set CRM env vars
- [ ] run admin `fullSync`
- [ ] run end-to-end test

---

## Risks To Track

- Anonymous escalation depends on a clean minimal-patient creation path
- Dify document delete endpoint should be confirmed against the vendored client before coding
- FAQ category naming collisions are safe only if `entity_key` remains scoped
