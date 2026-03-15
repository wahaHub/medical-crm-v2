# Phase 2B+2C: Hospital Management, Messaging & Consultations

## Overview

Phase 2A delivered Case CRUD (13 endpoints, 268 tests). Phase 2B+2C adds the three remaining core CRM modules that complete the primary workflow: **assign hospital → communicate → consult**.

**Scope:** 31 API endpoints, 31 use cases, 6 new entities, 8+ new repositories, 1 new DB table, 2 AI service adapters.

**Out of scope (deferred):** Materials moderation, invitation letters, dashboard/analytics, audit log querying, user/patient self-service, translation task management for hospital content.

## Tech Stack

- Same as Phase 2A: Hono + @hono/zod-openapi, Drizzle ORM, vitest, TypeScript strict
- **New dependency:** `openai` npm package (GPT-4o / GPT-4o-mini for translation & summarization)
- **New env vars:** `OPENAI_API_KEY`, `INTERNAL_API_SECRET` (guards internal worker endpoints), `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM` (Keycloak Admin API for hospital user registration)
- Supabase Realtime for message push (existing infrastructure, no new setup)

---

## Module 1: Hospital Management

### 1.1 Domain Layer

#### Hospital Entity

Full entity replacing the lightweight `HospitalInfo` used in Phase 2A. The existing `HospitalInfo` type and `findById` method are **preserved** — a new `findFullById` method is added so Phase 2A consumers are unaffected.

```typescript
class Hospital {
  id: string;
  name: string;
  nameEn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  logoUrl: string | null;
  specialties: string[] | null;  // JSONB
  status: HospitalStatus;        // ACTIVE | PENDING | INACTIVE
  type: HospitalType;            // COSMETIC | REGULAR
  createdAt: Date;
  updatedAt: Date;

  activate(): void;     // PENDING | INACTIVE → ACTIVE
  deactivate(): void;   // ACTIVE → INACTIVE
}
```

**Status transitions:**
```
PENDING → ACTIVE
ACTIVE → INACTIVE
INACTIVE → ACTIVE
```

#### RegistrationToken Value Object

```typescript
class RegistrationToken {
  id: string;
  hospitalId: string;
  token: string;          // crypto.randomUUID()
  email: string;
  expiresAt: Date;        // createdAt + 72 hours
  usedAt: Date | null;
  keycloakUserId: string | null;
  createdAt: Date;

  isExpired(): boolean;   // expiresAt < Date.now()
  isUsed(): boolean;      // usedAt !== null
  markUsed(keycloakUserId: string): void;
}
```

#### Ports

The Phase 2A `IHospitalRepository` (with only `findById → HospitalInfo`) is **preserved unchanged**. A separate `IHospitalManagementRepository` port is introduced for hospital CRUD operations. This avoids forcing Phase 2A consumers (`CaseAssignmentService`, `GetHospitalCaseDetailUseCase`) to depend on management methods they don't use.

```typescript
// PRESERVED from Phase 2A — no changes
interface IHospitalRepository {
  findById(id: string): Promise<HospitalInfo | null>;
}

// NEW in Phase 2B — separate port for hospital management
interface IHospitalManagementRepository {
  findFullById(id: string): Promise<Hospital | null>;
  findMany(query: HospitalListQuery): Promise<PaginatedResult<Hospital>>;
  save(entity: Hospital): Promise<Hospital>;
  updateStatus(id: string, status: HospitalStatus): Promise<Hospital>;
}

interface HospitalListQuery {
  page: number;
  limit: number;
  status?: HospitalStatus;
  type?: HospitalType;
  search?: string;
}

interface IRegistrationTokenRepository {
  findByToken(token: string): Promise<RegistrationToken | null>;
  findByHospitalId(hospitalId: string): Promise<RegistrationToken[]>;
  save(token: RegistrationToken): Promise<RegistrationToken>;
}

// Supabase sync for hospital creation/updates
interface IHospitalSyncService {
  syncToSupabase(hospital: Hospital): Promise<void>;
}
```

### 1.2 Application Layer — Use Cases

| # | Use Case | Actor | Description |
|---|----------|-------|-------------|
| 1 | CreateHospitalUseCase | ADMIN | Create hospital in CRM DB + sync to Main Supabase (COSMETIC) or China Supabase (REGULAR) via IHospitalSyncService |
| 2 | ListHospitalsUseCase | ADMIN | Paginated list with status/type/search filters |
| 3 | GetHospitalUseCase | ADMIN/HOSPITAL | HOSPITAL can only view own hospital |
| 4 | UpdateHospitalUseCase | ADMIN | Update profile fields, sync to Supabase |
| 5 | UpdateHospitalStatusUseCase | ADMIN | Status transitions (ACTIVE/PENDING/INACTIVE) |
| 6 | GetHospitalCasesUseCase | ADMIN | List cases for a hospital (delegates to existing ListCasesUseCase with hospitalId filter) |
| 7 | GenerateRegistrationTokenUseCase | ADMIN | Generate 72-hour registration link for hospital |
| 8 | RegisterHospitalUserUseCase | PUBLIC | Register hospital user with valid token. Full backend-driven flow (matches v1 exactly): (1) Validate token exists, not expired, not used. (2) Check username/email uniqueness via Keycloak Admin API. (3) Create user in Keycloak via Admin API → receive `keycloakUserId` from response `Location` header. (4) Set password via Keycloak Admin API. (5) Assign realm role (`hospital` or `regular_hospital` based on hospital type) via Keycloak Admin API. (6) Create CRM DB `users` record (role=HOSPITAL, hospitalId from token). (7) Mark token as used (`usedAt` = now, `keycloakUserId` = KC response). Frontend submits `{ token, username, password }` — no `keycloakUserId` from client. New port: `IKeycloakAdminService` with methods `createUser`, `setPassword`, `assignRole`, `checkUsernameExists`, `checkEmailExists`. New env vars: `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`. |

### 1.3 Infrastructure

- **DrizzleHospitalManagementRepository** — new class implementing `IHospitalManagementRepository` with `findFullById`, `findMany`, `save`, `updateStatus`. Existing `DrizzleHospitalRepository` (Phase 2A, implements `IHospitalRepository`) remains unchanged.
- **DrizzleRegistrationTokenRepository** — new, reads/writes `hospital_registration_tokens` table
- **SupabaseHospitalSyncService** — implements `IHospitalSyncService`, writes to Main Supabase `hospitals` table (COSMETIC) or China Supabase (REGULAR)

### 1.4 API Endpoints

```
POST   /api/v2/hospitals                             → CreateHospital (ADMIN)
GET    /api/v2/hospitals                             → ListHospitals (ADMIN)
GET    /api/v2/hospitals/:id                         → GetHospital (ADMIN/HOSPITAL)
PUT    /api/v2/hospitals/:id                         → UpdateHospital (ADMIN)
PATCH  /api/v2/hospitals/:id/status                  → UpdateHospitalStatus (ADMIN)
GET    /api/v2/hospitals/:id/cases                   → GetHospitalCases (ADMIN)
POST   /api/v2/hospitals/:id/registration-token      → GenerateRegistrationToken (ADMIN)
POST   /api/v2/auth/hospital/register                → RegisterHospitalUser (PUBLIC)
```

**8 endpoints.**

---

## Module 2: Conversations & Messaging

### 2.1 Domain Layer

#### Conversation Entity

```typescript
class Conversation {
  id: string;
  caseId: string | null;
  category: ConversationCategory;
  title: string | null;
  hospitalId: string | null;
  lastMessageId: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  createdAt: Date;
  updatedAt: Date;

  updateLastMessage(message: Message): void;
}
```

#### Message Entity

```typescript
class Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  originalLanguage: string;             // NOT NULL in DB, default 'en'
  translatedContent: string | null;
  messageType: MessageType;
  moderationStatus: ModerationStatus;
  attachments: Attachment[] | null;  // JSONB
  aiSummary: string | null;
  createdAt: Date;

  approve(): void;    // moderationStatus → ALLOWED
  reject(): void;     // moderationStatus → BLOCKED
  setTranslation(translated: string): void;
  setAiSummary(summary: string): void;
}

type Attachment = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
};
```

#### Enums

```typescript
type ConversationCategory = 'HOSPITAL' | 'PATIENT' | 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
type ModerationStatus = 'ALLOWED' | 'BLOCKED' | 'REVIEW';
```

**ModerationStatus vocabulary mapping (v1 → v2):**

| DB Enum (v2 domain) | v1 service alias | Semantics |
|---------------------|-----------------|-----------|
| `REVIEW` | `pending` | Awaiting admin review (default for HOSPITAL→PATIENT messages) |
| `ALLOWED` | `approved` | Approved, visible to recipient |
| `BLOCKED` | `rejected` | Rejected, hidden from recipient |

v2 uses only the DB enum values (`REVIEW` / `ALLOWED` / `BLOCKED`). No aliases.

#### Ports

```typescript
interface IConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findMany(query: ConversationListQuery, hospitalId?: string): Promise<PaginatedResult<Conversation>>;
  save(entity: Conversation): Promise<Conversation>;
}

interface ConversationListQuery {
  page: number;
  limit: number;
  category?: ConversationCategory;
  caseId?: string;
}

interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversationId(conversationId: string, query: MessageListQuery): Promise<PaginatedResult<Message>>;
  findPendingReview(): Promise<Message[]>;
  save(entity: Message): Promise<Message>;
  delete(id: string): Promise<void>;
}

interface MessageListQuery {
  page: number;
  limit: number;
}
```

### 2.2 AI Service Ports (Shared)

```typescript
interface ITranslationService {
  translate(text: string, targetLang: string): Promise<string>;
  summarizeMessage(content: string, messageType: MessageType, lang: string): Promise<string>;
}
```

**Infrastructure implementation:** `OpenAITranslationService`
- Translation: GPT-4o, temperature=0.3, timeout=60s, max_tokens=1000
- Summarization: GPT-4o, temperature=0.3, max_tokens=200
- Dependency: `openai` npm package + `OPENAI_API_KEY` env var

### 2.3 Message Task Queue

IMAGE/FILE summarization is async to avoid blocking the send flow. A new `message_tasks` table is created (not reusing `translation_tasks`, which serves hospital/surgeon content only).

#### New DB Table: message_tasks

```sql
CREATE TABLE message_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  task_kind TEXT NOT NULL CHECK (task_kind IN ('TRANSLATE', 'SUMMARIZE')),
  target_language VARCHAR(10),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX message_tasks_pending_idx ON message_tasks(status) WHERE status = 'PENDING';
CREATE INDEX message_tasks_message_id_idx ON message_tasks(message_id);
```

**Note:** This requires a DB migration. The plan will include a migration task.

#### Port

```typescript
interface IMessageTaskQueue {
  enqueueTranslation(messageId: string, targetLang: string): Promise<void>;
  enqueueSummarization(messageId: string): Promise<void>;
  pullPending(limit: number): Promise<MessageTask[]>;
  markProcessing(taskId: string): Promise<void>;
  markCompleted(taskId: string): Promise<void>;
  markFailed(taskId: string, error: string): Promise<void>;
}

type MessageTask = {
  id: string;
  messageId: string;
  taskKind: 'TRANSLATE' | 'SUMMARIZE';
  targetLanguage: string | null;
  retryCount: number;
};
```

Infrastructure: `DrizzleMessageTaskRepository` — reads/writes `message_tasks` table.

### 2.4 Application Layer — Use Cases

| # | Use Case | Actor | Description |
|---|----------|-------|-------------|
| 1 | CreateConversationUseCase | ADMIN | Create conversation (links caseId, hospitalId, category) |
| 2 | ListConversationsUseCase | ADMIN/HOSPITAL | HOSPITAL sees only own conversations; filter by category/caseId; order by lastMessageAt DESC |
| 3 | GetConversationUseCase | ADMIN/HOSPITAL | With permission check |
| 4 | UpdateConversationUseCase | ADMIN/HOSPITAL | Update title etc. |
| 5 | SendMessageUseCase | ADMIN/HOSPITAL | See flow below |
| 6 | ListMessagesUseCase | ADMIN/HOSPITAL | Paginated by conversationId |
| 7 | GetMessageUseCase | ADMIN/HOSPITAL | Single message |
| 8 | UpdateMessageUseCase | ADMIN/HOSPITAL | Edit message content |
| 9 | DeleteMessageUseCase | ADMIN/HOSPITAL | Hard delete |
| 10 | ListPendingReviewUseCase | ADMIN | Messages with moderationStatus = REVIEW |
| 11 | ApproveMessageUseCase | ADMIN | Set moderationStatus → ALLOWED |
| 12 | RejectMessageUseCase | ADMIN | Set moderationStatus → BLOCKED |
| 13 | RegenerateSummaryUseCase | ADMIN/HOSPITAL | Re-generate AI summary for a message |
| 14 | RetranslateMessageUseCase | ADMIN/HOSPITAL | Re-translate a message |
| 15 | ProcessMessageTasksUseCase | INTERNAL | Worker: pull pending tasks (batch size: 10), process translation/summarization, update message. Max 3 retries per task with exponential backoff (1s, 4s, 9s). Auth: guarded by `X-Internal-Secret` header checked against `INTERNAL_API_SECRET` env var. Trigger: called by external cron (e.g., Supabase Edge Function or Vercel Cron) every 10 seconds. |

#### SendMessage Flow

**Recipient language derivation:** `recipientLang` is determined from the conversation context:
- For `ADMIN_HOSPITAL` conversations: if sender is ADMIN, recipientLang = hospital user's `preferredLanguage` (from `users` table). If sender is HOSPITAL, recipientLang = `'zh'` (admin default).
- For `HOSPITAL_PATIENT` conversations: if sender is HOSPITAL, recipientLang = patient's `preferredLanguage`. If sender is PATIENT, recipientLang = hospital user's `preferredLanguage`.
- For `ADMIN_PATIENT` conversations: if sender is ADMIN, recipientLang = patient's `preferredLanguage`. If sender is PATIENT, recipientLang = `'zh'`.

The `SendMessageUseCase` constructor takes `IPatientRepository` (existing, has `findById → PatientBasicInfo`) to look up recipient language. `PatientBasicInfo` needs to be extended with `preferredLanguage: string` field.

```
1. Validate actor has access to conversation
2. Determine recipientLang from conversation category + participants
3. Create Message entity (Message.id = UUID generated at entity construction time, before persistence)
   - ADMIN sender → moderationStatus = ALLOWED
   - HOSPITAL sender to PATIENT → moderationStatus = REVIEW
   - HOSPITAL sender to ADMIN → moderationStatus = ALLOWED
4. If messageType === TEXT:
   → Inline: call ITranslationService.translate(content, recipientLang)
   → Set translatedContent on entity
5. Save Message (persists entity with pre-generated id)
6. If messageType === IMAGE or FILE:
   → Enqueue IMessageTaskQueue.enqueueSummarization(message.id)
   → Enqueue IMessageTaskQueue.enqueueTranslation(message.id, recipientLang)
   → aiSummary and translatedContent remain null (async update by worker)
   Note: save-before-enqueue ensures the worker always finds an existing message.
   If enqueue fails after save, the message exists without async processing —
   recoverable via manual re-enqueue or reconciliation.
7. Update Conversation.lastMessage* denormalized fields
8. Return MessageDTO
```

Client receives new messages via Supabase Realtime subscription on the `messages` table.

#### Permission Isolation

- **ADMIN**: All conversations and messages; can moderate (approve/reject)
- **HOSPITAL**: Only conversations where `category IN ('ADMIN_HOSPITAL', 'HOSPITAL_PATIENT')` AND `hospitalId = actor.hospitalId`
- Hospital-to-patient messages default to `REVIEW` status (admin must approve before patient sees)
- Admin messages default to `ALLOWED`

### 2.5 Supabase Realtime — Architecture Note

- **CRM DB** (connected via Drizzle) is the underlying PostgreSQL of the Supabase project (`postgres.zysulhfukqgnhfjufoip`)
- The `messages` table is already added to the Supabase realtime publication (v1 migration `20260207_001_initial_schema.sql` line 302)
- **v2 backend** writes to `messages` via Drizzle using the service role connection string, which **bypasses RLS** → Supabase Realtime automatically broadcasts changes → clients receive via Supabase client SDK
- **RLS status (current state):** RLS is **enabled** on `messages` and `conversations` tables (v1 initial migration), but **no RLS policies are defined** for these tables. Only `consultation_transcripts` has policies. This means the tables are deny-by-default for non-service-role connections.
- **Impact on Realtime:** Client-side Realtime subscriptions use the anon/authenticated key. Without policies, Supabase Realtime will not deliver row changes to clients. **v1 works around this** because Realtime broadcast mode does not enforce RLS on the broadcast itself — it broadcasts all changes to the publication regardless of policies. However, proper RLS policies for client-side row filtering are NOT in scope for this spec and should be addressed in a future security hardening phase.
- This matches v1's actual behavior (RLS enabled, no policies, Realtime still works via publication broadcast)

### 2.6 API Endpoints

```
POST   /api/v2/conversations                                        → CreateConversation (ADMIN)
GET    /api/v2/conversations                                        → ListConversations
GET    /api/v2/conversations/:id                                    → GetConversation
PUT    /api/v2/conversations/:id                                    → UpdateConversation
GET    /api/v2/conversations/:id/messages                           → ListMessages
POST   /api/v2/conversations/:id/messages                           → SendMessage
GET    /api/v2/conversations/:id/messages/:msgId                    → GetMessage
PUT    /api/v2/conversations/:id/messages/:msgId                    → UpdateMessage
DELETE /api/v2/conversations/:id/messages/:msgId                    → DeleteMessage
POST   /api/v2/conversations/:id/messages/:msgId/regenerate-summary → RegenerateSummary
POST   /api/v2/conversations/:id/messages/:msgId/retranslate        → RetranslateMessage
GET    /api/v2/messages/pending-review                              → ListPendingReview (ADMIN)
POST   /api/v2/messages/:msgId/approve                              → ApproveMessage (ADMIN)
POST   /api/v2/messages/:msgId/reject                               → RejectMessage (ADMIN)
POST   /api/v2/internal/process-message-tasks                       → ProcessMessageTasks (INTERNAL)
```

**15 endpoints (14 public + 1 internal worker).**

---

## Module 3: Consultations & Video

### 3.1 Domain Layer

#### Consultation Entity

```typescript
class Consultation {
  id: string;
  caseId: string;
  hospitalId: string;
  patientId: string;
  doctorId: string | null;
  status: ConsultationStatus;
  scheduledAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMinutes: number;            // planned duration, NOT NULL in DB, default 30
  actualDuration: number | null;     // calculated on complete()
  consultationLink: string | null;
  aiTranslation: boolean;
  patientLanguage: string;
  notes: string | null;
  videoStorageKey: string | null;
  videoSize: number | null;          // DB: bigint with mode: "number" (safe for video file sizes)
  videoDuration: number | null;
  videoThumbnail: string | null;
  videoUploadedAt: Date | null;
  aiSummary: Record<string, unknown> | null;  // JSONB
  aiSummaryCreatedAt: Date | null;
  aiSummaryStatus: AISummaryStatus;
  createdAt: Date;
  updatedAt: Date;

  start(): void;       // SCHEDULED → IN_PROGRESS, sets startedAt
  complete(): void;    // IN_PROGRESS → COMPLETED, sets endedAt, calculates actualDuration
  cancel(): void;      // SCHEDULED → CANCELLED
  noShow(): void;      // SCHEDULED → NO_SHOW
  setVideoInfo(info: VideoInfo): void;
  setAiSummary(summary: Record<string, unknown>): void;
}

type VideoInfo = {
  storageKey: string;
  size: number;
  duration: number;
  thumbnail: string | null;
};
```

**Status transitions:**
```
SCHEDULED → IN_PROGRESS → COMPLETED
SCHEDULED → CANCELLED
SCHEDULED → NO_SHOW
```

**Enums:**
```typescript
type ConsultationStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
type AISummaryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
```

#### ConsultationTranscript Entity

```typescript
class ConsultationTranscript {
  id: string;
  consultationId: string;
  originalLang: string;
  translatedLang: string | null;
  entries: TranscriptEntry[];  // JSONB
  status: TranscriptStatus;   // PENDING | PROCESSING | COMPLETED | FAILED
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
// DB column is varchar with default 'pending'. v2 domain normalizes to uppercase
// to match the AISummaryStatus enum convention. Row mapper uppercases on read.

type TranscriptEntry = {
  timestamp: number;
  speaker: string;
  text: string;
  translatedText?: string;
};
```

#### Ports

```typescript
interface IConsultationRepository {
  findById(id: string): Promise<Consultation | null>;
  findMany(query: ConsultationListQuery): Promise<CursorPaginatedResult<Consultation>>;
  findByCaseId(caseId: string): Promise<Consultation[]>;
  save(entity: Consultation): Promise<Consultation>;
  countByFilters(filters: ConsultationCountFilters): Promise<ConsultationStats>;
}

interface ConsultationListQuery {
  cursor?: { scheduledAt: string; id: string };  // composite cursor
  limit: number;
  hospitalId?: string;
  caseId?: string;
  status?: ConsultationStatus;
}

// New shared type in @medical-crm/utils
interface CursorPaginatedResult<T> {
  data: T[];
  nextCursor: { scheduledAt: string; id: string } | null;
  hasMore: boolean;
}

interface ConsultationCountFilters {
  hospitalId?: string;
}

interface ConsultationStats {
  total: number;
  scheduled: number;
  completed: number;
  todayCount: number;
  needsTranslation: number;
}

interface IConsultationTranscriptRepository {
  findByConsultationId(consultationId: string): Promise<ConsultationTranscript | null>;
  save(transcript: ConsultationTranscript): Promise<ConsultationTranscript>;
}
```

**Cursor pagination query logic:**
```sql
WHERE (scheduled_at, id) < (:cursorScheduledAt, :cursorId)
ORDER BY scheduled_at DESC, id DESC
LIMIT :limit + 1   -- extra row to determine hasMore
```

### 3.2 Application Layer — Use Cases

| # | Use Case | Actor | Description |
|---|----------|-------|-------------|
| 1 | CreateConsultationUseCase | ADMIN/HOSPITAL | Create consultation (validates case exists, hospital matches) |
| 2 | ListConsultationsUseCase | HOSPITAL | Cursor-based pagination, filtered by hospitalId |
| 3 | GetConsultationUseCase | ADMIN/HOSPITAL | With permission check |
| 4 | UpdateConsultationUseCase | ADMIN/HOSPITAL | Update scheduling info, link, notes |
| 5 | UpdateConsultationStatusUseCase | ADMIN/HOSPITAL | Status flow (start/complete/cancel/noShow) |
| 6 | GetConsultationTranscriptUseCase | ADMIN/HOSPITAL | Retrieve AI transcript for a consultation |
| 7 | GetConsultationStatsUseCase | HOSPITAL | Stats: scheduled, completed, today, needsTranslation |
| 8 | ListCaseConsultationsUseCase | ADMIN | List all consultations for a case (admin perspective) |

### 3.3 Infrastructure

- **DrizzleConsultationRepository** — CRUD on `consultations` table with cursor pagination
- **DrizzleConsultationTranscriptRepository** — read/write `consultation_transcripts` table

### 3.4 API Endpoints

```
POST   /api/v2/consultations                     → CreateConsultation
GET    /api/v2/consultations                     → ListConsultations (cursor-based)
GET    /api/v2/consultations/stats               → GetConsultationStats (HOSPITAL)
GET    /api/v2/consultations/:id                 → GetConsultation
PUT    /api/v2/consultations/:id                 → UpdateConsultation
PATCH  /api/v2/consultations/:id/status          → UpdateConsultationStatus
GET    /api/v2/consultations/:id/transcript       → GetConsultationTranscript
GET    /api/v2/cases/:caseId/consultations        → ListCaseConsultations (ADMIN)
```

**8 endpoints.**

---

## DTOs & Mappers

Each module follows the Phase 2A pattern: entities are never returned directly from use cases. Instead, mapper functions convert entities to DTOs with string dates and flattened fields.

### Hospital DTOs

```typescript
type HospitalDTO = {
  id: string; name: string; nameEn: string | null;
  address: string | null; phone: string | null; email: string | null;
  description: string | null; logoUrl: string | null;
  specialties: string[] | null;
  status: HospitalStatus; type: HospitalType;
  createdAt: string; updatedAt: string;  // ISO strings
};
```

### Messaging DTOs

```typescript
type ConversationDTO = {
  id: string; caseId: string | null; category: ConversationCategory;
  title: string | null; hospitalId: string | null;
  lastMessageAt: string | null; lastMessagePreview: string | null;
  lastSenderId: string | null;
  createdAt: string; updatedAt: string;
};

type MessageDTO = {
  id: string; conversationId: string; senderId: string;
  content: string; originalLanguage: string;
  translatedContent: string | null;
  messageType: MessageType; moderationStatus: ModerationStatus;
  attachments: Attachment[] | null; aiSummary: string | null;
  createdAt: string;
};
```

### Consultation DTOs

```typescript
type ConsultationDTO = {
  id: string; caseId: string; hospitalId: string;
  patientId: string; doctorId: string | null;
  status: ConsultationStatus;
  scheduledAt: string; startedAt: string | null; endedAt: string | null;
  durationMinutes: number; actualDuration: number | null;
  consultationLink: string | null;
  aiTranslation: boolean; patientLanguage: string;
  notes: string | null;
  videoStorageKey: string | null; videoSize: number | null;
  videoDuration: number | null; videoThumbnail: string | null;
  aiSummaryStatus: AISummaryStatus;
  createdAt: string; updatedAt: string;
};

type ConsultationTranscriptDTO = {
  id: string; consultationId: string;
  originalLang: string; translatedLang: string | null;
  entries: TranscriptEntry[]; status: TranscriptStatus;
  generatedAt: string | null;
  createdAt: string; updatedAt: string;
};
```

---

## Testing Strategy

Follows Phase 2A patterns:

| Layer | Test Type | Tool | Coverage |
|-------|-----------|------|----------|
| Domain | Unit tests | vitest | Entity methods, state transitions, value objects |
| Application | Unit tests | vitest + vi.fn() mocks | Use case logic, permission checks, error paths |
| Infrastructure | Integration tests | vitest + test DB | Repository CRUD, query correctness |
| API | Route tests | vitest + Hono testClient | Request validation, response format, auth |
| AI Service | Unit tests | vitest + mocked openai SDK | Translation/summary calls, error handling |

- Integration tests remain excluded from `pnpm test`, run via `pnpm test:integration`
- AI adapter tests mock the `openai` SDK — no real API calls in tests
- New `openai` package added to infrastructure `dependencies`

---

## Summary

| Module | Endpoints | Use Cases | New Entities | New Repos |
|--------|-----------|-----------|-------------|-----------|
| Hospital Management | 8 | 8 | Hospital, RegistrationToken | HospitalManagementRepo (new port), RegistrationTokenRepo, HospitalSyncService |
| Conversations/Messaging | 15 | 15 | Conversation, Message | ConversationRepo, MessageRepo, MessageTaskQueue, TranslationService |
| Consultations/Video | 8 | 8 | Consultation, ConsultationTranscript | ConsultationRepo, TranscriptRepo |
| **Total** | **31** | **31** | **6** | **8+** |

**New DB migration required:** `message_tasks` table.

**New npm dependency:** `openai` package in `@medical-crm/infrastructure`.

**New env var:** `OPENAI_API_KEY`.

**Estimated plan tasks:** ~55-65 (Domain + Application + Infrastructure + API + Tests, grouped by module per layer).
