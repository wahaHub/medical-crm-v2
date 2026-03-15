# Phase 2B+2C: Hospital Management, Messaging & Consultations — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Hospital CRUD, Conversations/Messaging (with AI translation, moderation, async task queue), and Consultations/Video modules — 31 API endpoints, 31 use cases, 6 new entities.

**Architecture:** Clean Architecture extending Phase 2A. New entities and ports in `@medical-crm/domain`, new use cases in `@medical-crm/application`, new repositories and service adapters in `@medical-crm/infrastructure`, new routes in `apps/api`. Strict layer isolation enforced by ESLint. All IDs generated at entity construction via `generateId()`.

**Tech Stack:** TypeScript 5.7 strict, Drizzle ORM 0.45.1, Hono 4.7 + @hono/zod-openapi, Vitest 3.0, Zod, OpenAI SDK (`openai` npm), pnpm workspaces + Turbo.

**Spec:** `docs/superpowers/specs/2026-03-15-phase2bc-hospital-messaging-consultations-design.md`

**Codex risk notes:**
1. **RegisterHospitalUserUseCase** — KC compensation: if CRM user creation fails after KC user is created, the use case MUST call `IKeycloakAdminService.deleteUser(keycloakUserId)` to clean up. This is an explicit cleanup task, not a TODO.
2. **Supabase Realtime RLS** — RLS is enabled on `messages`/`conversations` but NO policies are defined (same as v1). This plan does NOT create RLS policies. Client-side Realtime filtering is a separate security hardening topic for a future phase.

---

## Dependency Order

```
Chunk 1: Domain Layer ─────────────── (must complete first)
    ↓
Chunk 2: App Layer — Hospital ──────┐
Chunk 3: App Layer — Messaging ─────┼── (can run in parallel after Chunk 1)
Chunk 4: App Layer — Consultations ─┘
    ↓
Chunk 5: Infrastructure Layer ─────── (after Chunks 2-4, needs port definitions)
    ↓
Chunk 6: API Layer ────────────────── (after Chunk 5, needs repos + use cases wired)
```

---

## File Structure

### New Files in `packages/domain/src/`

```
entities/
  hospital.entity.ts               ← Hospital entity with status transitions
  conversation.entity.ts           ← Conversation entity with lastMessage update
  message.entity.ts                ← Message entity with moderation logic
  consultation.entity.ts           ← Consultation entity with status transitions
  consultation-transcript.entity.ts ← ConsultationTranscript entity

value-objects/
  registration-token.ts            ← RegistrationToken VO (isExpired, isUsed, markUsed)

state-machine/
  hospital-status-transitions.ts   ← HOSPITAL_STATUS_TRANSITIONS map
  consultation-status-transitions.ts ← CONSULTATION_STATUS_TRANSITIONS map

ports/
  hospital-management-repository.port.ts  ← IHospitalManagementRepository (new, ISP)
  registration-token-repository.port.ts   ← IRegistrationTokenRepository
  hospital-sync-service.port.ts           ← IHospitalSyncService
  keycloak-admin-service.port.ts          ← IKeycloakAdminService
  user-repository.port.ts                 ← IUserRepository (create CRM users record)
  conversation-repository.port.ts         ← IConversationRepository
  message-repository.port.ts              ← IMessageRepository
  message-task-queue.port.ts              ← IMessageTaskQueue
  translation-service.port.ts             ← ITranslationService
  consultation-repository.port.ts         ← IConsultationRepository
  consultation-transcript-repository.port.ts ← IConsultationTranscriptRepository

__tests__/
  hospital.entity.test.ts
  registration-token.test.ts
  conversation.entity.test.ts
  message.entity.test.ts
  consultation.entity.test.ts
  consultation-transcript.entity.test.ts
```

### New Files in `packages/application/src/`

```
dtos/
  hospital.dto.ts
  conversation.dto.ts
  consultation.dto.ts

mappers/
  hospital.mapper.ts
  conversation.mapper.ts
  consultation.mapper.ts

use-cases/
  hospitals/
    create-hospital.use-case.ts
    list-hospitals.use-case.ts
    get-hospital.use-case.ts
    update-hospital.use-case.ts
    update-hospital-status.use-case.ts
    get-hospital-cases.use-case.ts
    generate-registration-token.use-case.ts
    register-hospital-user.use-case.ts
  conversations/
    create-conversation.use-case.ts
    list-conversations.use-case.ts
    get-conversation.use-case.ts
    update-conversation.use-case.ts
  messages/
    send-message.use-case.ts
    list-messages.use-case.ts
    get-message.use-case.ts
    update-message.use-case.ts
    delete-message.use-case.ts
    list-pending-review.use-case.ts
    approve-message.use-case.ts
    reject-message.use-case.ts
    regenerate-summary.use-case.ts
    retranslate-message.use-case.ts
    process-message-tasks.use-case.ts
  consultations/
    create-consultation.use-case.ts
    list-consultations.use-case.ts
    get-consultation.use-case.ts
    update-consultation.use-case.ts
    update-consultation-status.use-case.ts
    get-consultation-transcript.use-case.ts
    get-consultation-stats.use-case.ts
    list-case-consultations.use-case.ts
```

### New Files in `packages/infrastructure/`

```
database/
  repositories/
    drizzle-hospital-management.repository.ts
    drizzle-registration-token.repository.ts
    drizzle-user.repository.ts
    drizzle-conversation.repository.ts
    drizzle-message.repository.ts
    drizzle-message-task.repository.ts
    drizzle-consultation.repository.ts
    drizzle-consultation-transcript.repository.ts

  migrations/
    002_create_message_tasks.sql

services/
  openai-translation.service.ts
  keycloak-admin.service.ts
  supabase-hospital-sync.service.ts

__tests__/
  integration/
    drizzle-hospital-management.repository.test.ts
    drizzle-registration-token.repository.test.ts
    drizzle-user.repository.test.ts
    drizzle-conversation.repository.test.ts
    drizzle-message.repository.test.ts
    drizzle-message-task.repository.test.ts
    drizzle-consultation.repository.test.ts
    drizzle-consultation-transcript.repository.test.ts
  unit/
    openai-translation.service.test.ts
    keycloak-admin.service.test.ts
    supabase-hospital-sync.service.test.ts
```

### New Files in `apps/api/src/`

```
routes/
  hospitals.routes.ts
  conversations.routes.ts
  messages.routes.ts
  consultations.routes.ts
  internal.routes.ts          ← Worker endpoint with X-Internal-Secret auth

__tests__/
  hospitals.routes.test.ts
  conversations.routes.test.ts
  messages.routes.test.ts
  consultations.routes.test.ts
  internal.routes.test.ts
```

### Modified Files

```
packages/domain/src/index.ts                           ← Add new exports
packages/domain/src/enums/index.ts                     ← Add new enum types
packages/domain/src/ports/patient-repository.port.ts   ← Extend PatientBasicInfo with preferredLanguage: string
packages/application/src/index.ts                      ← Add new exports
packages/infrastructure/database/repositories/index.ts ← Add new repo exports
packages/infrastructure/database/schema/schema.ts      ← Add messageTasks table (if introspected)
packages/shared/utils/src/pagination.ts                ← Add CursorPaginatedResult
packages/shared/utils/src/index.ts                     ← Export CursorPaginatedResult
packages/shared/validation/src/hospital.schema.ts      ← Add update/status schemas
packages/shared/validation/src/message.schema.ts       ← Expand message schemas
packages/shared/validation/src/index.ts                ← Add new schema exports
apps/api/src/composition-root.ts                       ← Wire new services
apps/api/src/routes/index.ts                           ← Mount new route modules
apps/api/src/index.ts                                  ← Add internal route (skip auth)
packages/shared/config/src/env.ts                      ← Add INTERNAL_API_SECRET + KC Admin env vars to serverEnvSchema
packages/infrastructure/package.json                   ← Add openai dependency
```

---

## Chunk 1: Domain Layer

### Task 1: New Domain Enums

**Files:**
- Modify: `packages/domain/src/enums/index.ts`

- [ ] **Step 1: Add enum type definitions**

Append to existing `enums/index.ts`:

```typescript
// Hospital
export type HospitalStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';
export type HospitalType = 'COSMETIC' | 'REGULAR';

// Messaging
export type ConversationCategory = 'HOSPITAL' | 'PATIENT' | 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
export type ModerationStatus = 'ALLOWED' | 'BLOCKED' | 'REVIEW';

// Consultations
export type ConsultationStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type AISummaryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Message Tasks
export type MessageTaskKind = 'TRANSLATE' | 'SUMMARIZE';
export type MessageTaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
```

- [ ] **Step 2: Run typecheck**

Run: `cd medical-crm-v2 && pnpm turbo typecheck --filter=@medical-crm/domain`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/enums/index.ts
git commit -m "feat(domain): add Phase 2BC enum types"
```

---

### Task 2: Hospital Entity + Status Transitions

**Files:**
- Create: `packages/domain/src/state-machine/hospital-status-transitions.ts`
- Create: `packages/domain/src/entities/hospital.entity.ts`
- Create: `packages/domain/__tests__/hospital.entity.test.ts`

- [ ] **Step 1: Write hospital status transitions**

```typescript
// hospital-status-transitions.ts
import type { HospitalStatus } from '../enums/index.js';

export const HOSPITAL_STATUS_TRANSITIONS: Record<HospitalStatus, HospitalStatus[]> = {
  PENDING: ['ACTIVE'],
  ACTIVE: ['INACTIVE'],
  INACTIVE: ['ACTIVE'],
};
```

- [ ] **Step 2: Write Hospital entity tests**

Test cases:
- Constructor sets all fields from props
- `activate()` transitions PENDING→ACTIVE and INACTIVE→ACTIVE
- `activate()` throws ValidationError when already ACTIVE
- `deactivate()` transitions ACTIVE→INACTIVE
- `deactivate()` throws ValidationError from PENDING
- Both methods update `updatedAt`

```typescript
// hospital.entity.test.ts
import { describe, it, expect } from 'vitest';
import { Hospital } from '../src/entities/hospital.entity.js';

function makeHospital(overrides: Partial<ConstructorParameters<typeof Hospital>[0]> = {}) {
  return new Hospital({
    id: 'h-1', name: 'Test Hospital', nameEn: 'Test Hospital EN',
    address: null, phone: null, email: null, description: null,
    logoUrl: null, specialties: null,
    status: 'PENDING', type: 'COSMETIC',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('Hospital', () => {
  it('constructs with all fields', () => {
    const h = makeHospital();
    expect(h.id).toBe('h-1');
    expect(h.status).toBe('PENDING');
    expect(h.type).toBe('COSMETIC');
  });

  it('activate() from PENDING', () => {
    const h = makeHospital({ status: 'PENDING' });
    h.activate();
    expect(h.status).toBe('ACTIVE');
  });

  it('activate() from INACTIVE', () => {
    const h = makeHospital({ status: 'INACTIVE' });
    h.activate();
    expect(h.status).toBe('ACTIVE');
  });

  it('activate() throws when already ACTIVE', () => {
    const h = makeHospital({ status: 'ACTIVE' });
    expect(() => h.activate()).toThrow();
  });

  it('deactivate() from ACTIVE', () => {
    const h = makeHospital({ status: 'ACTIVE' });
    h.deactivate();
    expect(h.status).toBe('INACTIVE');
  });

  it('deactivate() throws from PENDING', () => {
    const h = makeHospital({ status: 'PENDING' });
    expect(() => h.deactivate()).toThrow();
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `cd medical-crm-v2 && pnpm turbo test --filter=@medical-crm/domain -- --run`
Expected: FAIL — Hospital class not found

- [ ] **Step 4: Implement Hospital entity**

Follow `Case` entity pattern exactly:
- `HospitalProps` interface for constructor
- Readonly `id`
- `activate()` checks `HOSPITAL_STATUS_TRANSITIONS[this.status].includes('ACTIVE')`
- `deactivate()` checks `HOSPITAL_STATUS_TRANSITIONS[this.status].includes('INACTIVE')`
- Both update `this.updatedAt = new Date()`
- Throws `ValidationError` for invalid transitions

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd medical-crm-v2 && pnpm turbo test --filter=@medical-crm/domain -- --run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/state-machine/hospital-status-transitions.ts \
       packages/domain/src/entities/hospital.entity.ts \
       packages/domain/__tests__/hospital.entity.test.ts
git commit -m "feat(domain): Hospital entity with status transitions"
```

---

### Task 3: RegistrationToken Value Object

**Files:**
- Create: `packages/domain/src/value-objects/registration-token.ts`
- Create: `packages/domain/__tests__/registration-token.test.ts`

- [ ] **Step 1: Write tests**

Test cases:
- `isExpired()` returns true when `expiresAt < now`
- `isExpired()` returns false when `expiresAt > now`
- `isUsed()` returns true when `usedAt !== null`
- `isUsed()` returns false when `usedAt === null`
- `markUsed(keycloakUserId)` sets `usedAt` and `keycloakUserId`
- `markUsed()` throws when already used

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement RegistrationToken**

```typescript
// registration-token.ts
import { ValidationError } from '@medical-crm/utils';

export interface RegistrationTokenProps {
  id: string;
  hospitalId: string;
  token: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
  keycloakUserId: string | null;
  createdAt: Date;
}

export class RegistrationToken {
  readonly id: string;
  readonly hospitalId: string;
  readonly token: string;
  readonly email: string;
  readonly expiresAt: Date;
  usedAt: Date | null;
  keycloakUserId: string | null;
  readonly createdAt: Date;

  constructor(props: RegistrationTokenProps) {
    this.id = props.id;
    this.hospitalId = props.hospitalId;
    this.token = props.token;
    this.email = props.email;
    this.expiresAt = props.expiresAt;
    this.usedAt = props.usedAt;
    this.keycloakUserId = props.keycloakUserId;
    this.createdAt = props.createdAt;
  }

  isExpired(): boolean {
    return this.expiresAt < new Date();
  }

  isUsed(): boolean {
    return this.usedAt !== null;
  }

  markUsed(keycloakUserId: string): void {
    if (this.isUsed()) {
      throw new ValidationError('Registration token has already been used');
    }
    this.usedAt = new Date();
    this.keycloakUserId = keycloakUserId;
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/value-objects/registration-token.ts \
       packages/domain/__tests__/registration-token.test.ts
git commit -m "feat(domain): RegistrationToken value object"
```

---

### Task 4: Conversation Entity

**Files:**
- Create: `packages/domain/src/entities/conversation.entity.ts`
- Create: `packages/domain/__tests__/conversation.entity.test.ts`

- [ ] **Step 1: Write tests**

Test cases:
- Constructor sets all fields
- `updateLastMessage(message)` updates lastMessageId, lastMessageAt, lastMessagePreview, lastSenderId, and updatedAt

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement Conversation entity**

Props: `id, caseId, category, title, hospitalId, lastMessageId, lastMessageAt, lastMessagePreview, lastSenderId, createdAt, updatedAt`

`updateLastMessage(message: { id: string; content: string; senderId: string; createdAt: Date })` updates denormalized fields. Preview truncated to 100 chars.

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/entities/conversation.entity.ts \
       packages/domain/__tests__/conversation.entity.test.ts
git commit -m "feat(domain): Conversation entity"
```

---

### Task 5: Message Entity

**Files:**
- Create: `packages/domain/src/entities/message.entity.ts`
- Create: `packages/domain/__tests__/message.entity.test.ts`

- [ ] **Step 1: Write tests**

Test cases:
- Constructor sets all fields including `moderationStatus`
- `approve()` sets moderationStatus to ALLOWED
- `approve()` throws when already BLOCKED
- `reject()` sets moderationStatus to BLOCKED
- `setTranslation(text)` sets translatedContent
- `setAiSummary(text)` sets aiSummary

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement Message entity**

Props: `id, conversationId, senderId, content, originalLanguage, translatedContent, messageType, moderationStatus, attachments, aiSummary, createdAt`

```typescript
type Attachment = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
};
```

Methods:
- `approve()`: only if current status is `REVIEW`, set to `ALLOWED`
- `reject()`: only if current status is `REVIEW`, set to `BLOCKED`
- `setTranslation(translated: string)`: sets `translatedContent`
- `setAiSummary(summary: string)`: sets `aiSummary`

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/entities/message.entity.ts \
       packages/domain/__tests__/message.entity.test.ts
git commit -m "feat(domain): Message entity with moderation logic"
```

---

### Task 6: Consultation Entity + Status Transitions

**Files:**
- Create: `packages/domain/src/state-machine/consultation-status-transitions.ts`
- Create: `packages/domain/src/entities/consultation.entity.ts`
- Create: `packages/domain/__tests__/consultation.entity.test.ts`

- [ ] **Step 1: Write consultation status transitions**

```typescript
import type { ConsultationStatus } from '../enums/index.js';

export const CONSULTATION_STATUS_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
```

- [ ] **Step 2: Write tests**

Test cases:
- `start()` transitions SCHEDULED→IN_PROGRESS, sets startedAt
- `start()` throws from COMPLETED
- `complete()` transitions IN_PROGRESS→COMPLETED, sets endedAt, calculates actualDuration
- `cancel()` transitions SCHEDULED→CANCELLED
- `noShow()` transitions SCHEDULED→NO_SHOW
- `setVideoInfo(info)` sets all video fields
- `setAiSummary(summary)` sets aiSummary + aiSummaryCreatedAt + aiSummaryStatus=COMPLETED

- [ ] **Step 3: Run tests — expect FAIL**

- [ ] **Step 4: Implement Consultation entity**

Props (from DB `consultations` table):

```typescript
export interface ConsultationProps {
  id: string;
  caseId: string;
  hospitalId: string;
  patientId: string;
  doctorId: string | null;
  status: ConsultationStatus;
  scheduledAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMinutes: number;          // default: 30
  actualDuration: number | null;     // calculated in complete()
  consultationLink: string | null;
  aiTranslation: boolean;           // default: false
  patientLanguage: string;          // default: 'en'
  notes: string | null;
  videoStorageKey: string | null;
  videoSize: number | null;
  videoDuration: number | null;
  videoThumbnail: string | null;
  videoUploadedAt: Date | null;
  aiSummary: unknown | null;        // jsonb
  aiSummaryCreatedAt: Date | null;
  aiSummaryStatus: AISummaryStatus; // 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  createdAt: Date;
  updatedAt: Date;
}
```

Methods use `CONSULTATION_STATUS_TRANSITIONS` map. `complete()` calculates `actualDuration` as `Math.round((endedAt - startedAt) / 60000)`.

- [ ] **Step 5: Run tests — expect PASS**
- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/state-machine/consultation-status-transitions.ts \
       packages/domain/src/entities/consultation.entity.ts \
       packages/domain/__tests__/consultation.entity.test.ts
git commit -m "feat(domain): Consultation entity with status transitions"
```

---

### Task 7: ConsultationTranscript Entity

**Files:**
- Create: `packages/domain/src/entities/consultation-transcript.entity.ts`
- Create: `packages/domain/__tests__/consultation-transcript.entity.test.ts`

- [ ] **Step 1: Write tests**

Test cases:
- Constructor sets all fields
- Default status is as provided in props
- `entries` is a typed array of `TranscriptEntry`

- [ ] **Step 2: Implement ConsultationTranscript entity**

Props: `id, consultationId, originalLang, translatedLang, entries: TranscriptEntry[], status: TranscriptStatus, generatedAt, createdAt, updatedAt`

```typescript
export type TranscriptEntry = {
  timestamp: number;
  speaker: string;
  text: string;
  translatedText?: string;
};
```

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/entities/consultation-transcript.entity.ts \
       packages/domain/__tests__/consultation-transcript.entity.test.ts
git commit -m "feat(domain): ConsultationTranscript entity"
```

---

### Task 8: Hospital Management Ports

**Files:**
- Create: `packages/domain/src/ports/hospital-management-repository.port.ts`
- Create: `packages/domain/src/ports/registration-token-repository.port.ts`
- Create: `packages/domain/src/ports/hospital-sync-service.port.ts`
- Create: `packages/domain/src/ports/keycloak-admin-service.port.ts`
- Create: `packages/domain/src/ports/user-repository.port.ts`

- [ ] **Step 1: Write port interfaces**

```typescript
// hospital-management-repository.port.ts
import type { Hospital } from '../entities/hospital.entity.js';
import type { HospitalStatus, HospitalType } from '../enums/index.js';
import type { PaginatedResult } from '@medical-crm/utils';

export interface HospitalListQuery {
  page: number;
  limit: number;
  status?: HospitalStatus;
  type?: HospitalType;
  search?: string;
}

export interface IHospitalManagementRepository {
  findFullById(id: string): Promise<Hospital | null>;
  findMany(query: HospitalListQuery): Promise<PaginatedResult<Hospital>>;
  save(entity: Hospital): Promise<Hospital>;
  updateStatus(id: string, status: HospitalStatus): Promise<Hospital>;
}
```

```typescript
// registration-token-repository.port.ts
import type { RegistrationToken } from '../value-objects/registration-token.js';

export interface IRegistrationTokenRepository {
  findByToken(token: string): Promise<RegistrationToken | null>;
  findByHospitalId(hospitalId: string): Promise<RegistrationToken[]>;
  save(token: RegistrationToken): Promise<RegistrationToken>;
}
```

```typescript
// hospital-sync-service.port.ts
import type { Hospital } from '../entities/hospital.entity.js';

export interface IHospitalSyncService {
  syncToSupabase(hospital: Hospital): Promise<void>;
}
```

```typescript
// keycloak-admin-service.port.ts
export interface KeycloakUser {
  id: string;
  username: string;
  email: string;
}

export interface IKeycloakAdminService {
  createUser(username: string, email: string, hospitalName: string, hospitalId: string): Promise<string>; // returns keycloakUserId
  setPassword(keycloakUserId: string, password: string): Promise<void>;
  assignRole(keycloakUserId: string, role: string): Promise<void>;
  deleteUser(keycloakUserId: string): Promise<void>; // compensation cleanup
  checkUsernameExists(username: string): Promise<boolean>;
  checkEmailExists(email: string): Promise<boolean>;
}
```

```typescript
// user-repository.port.ts
// Creates CRM DB `users` record during hospital registration.
// Also provides lookup for user preferredLanguage (needed by SendMessageUseCase).
export interface CreateUserInput {
  id: string;
  email: string;
  name: string; // username
  role: 'HOSPITAL';
  hospitalId: string;
  preferredLanguage: string;
}

export interface IUserRepository {
  create(input: CreateUserInput): Promise<{ id: string }>;
  findPreferredLanguage(hospitalId: string): Promise<string | null>; // finds first HOSPITAL-role user for this hospital
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd medical-crm-v2 && pnpm turbo typecheck --filter=@medical-crm/domain`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/ports/hospital-management-repository.port.ts \
       packages/domain/src/ports/registration-token-repository.port.ts \
       packages/domain/src/ports/hospital-sync-service.port.ts \
       packages/domain/src/ports/keycloak-admin-service.port.ts \
       packages/domain/src/ports/user-repository.port.ts
git commit -m "feat(domain): Hospital management ports (ISP, KC admin, sync, user repo)"
```

---

### Task 9: Messaging Ports

**Files:**
- Create: `packages/domain/src/ports/conversation-repository.port.ts`
- Create: `packages/domain/src/ports/message-repository.port.ts`
- Create: `packages/domain/src/ports/message-task-queue.port.ts`
- Create: `packages/domain/src/ports/translation-service.port.ts`

- [ ] **Step 1: Write port interfaces**

```typescript
// conversation-repository.port.ts
import type { Conversation } from '../entities/conversation.entity.js';
import type { ConversationCategory } from '../enums/index.js';
import type { PaginatedResult } from '@medical-crm/utils';

export interface ConversationListQuery {
  page: number;
  limit: number;
  category?: ConversationCategory;
  caseId?: string;
}

export interface IConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findMany(query: ConversationListQuery, hospitalId?: string): Promise<PaginatedResult<Conversation>>;
  save(entity: Conversation): Promise<Conversation>;
}
```

```typescript
// message-repository.port.ts
import type { Message } from '../entities/message.entity.js';
import type { PaginatedResult } from '@medical-crm/utils';

export interface MessageListQuery {
  page: number;
  limit: number;
}

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversationId(conversationId: string, query: MessageListQuery): Promise<PaginatedResult<Message>>;
  findPendingReview(): Promise<Message[]>;
  save(entity: Message): Promise<Message>;
  delete(id: string): Promise<void>;
}
```

```typescript
// message-task-queue.port.ts
import type { MessageTaskKind, MessageTaskStatus } from '../enums/index.js';

export interface MessageTask {
  id: string;
  messageId: string;
  taskKind: MessageTaskKind;
  targetLanguage: string | null;
  retryCount: number;
}

export interface IMessageTaskQueue {
  enqueueTranslation(messageId: string, targetLang: string): Promise<void>;
  enqueueSummarization(messageId: string): Promise<void>;
  pullPending(limit: number): Promise<MessageTask[]>;
  markProcessing(taskId: string): Promise<void>;
  markCompleted(taskId: string): Promise<void>;
  markFailed(taskId: string, error: string): Promise<void>;
}
```

```typescript
// translation-service.port.ts
import type { MessageType } from '../enums/index.js';

export interface ITranslationService {
  translate(text: string, targetLang: string): Promise<string>;
  summarizeMessage(content: string, messageType: MessageType, lang: string): Promise<string>;
}
```

- [ ] **Step 2: Run typecheck — expect PASS**
- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/ports/conversation-repository.port.ts \
       packages/domain/src/ports/message-repository.port.ts \
       packages/domain/src/ports/message-task-queue.port.ts \
       packages/domain/src/ports/translation-service.port.ts
git commit -m "feat(domain): Messaging ports (conversation, message, task queue, translation)"
```

---

### Task 10: Consultation Ports + Shared Types

**Files:**
- Create: `packages/domain/src/ports/consultation-repository.port.ts`
- Create: `packages/domain/src/ports/consultation-transcript-repository.port.ts`
- Modify: `packages/shared/utils/src/pagination.ts` — add `CursorPaginatedResult`
- Modify: `packages/shared/utils/src/index.ts` — export it
- Modify: `packages/domain/src/ports/patient-repository.port.ts` — extend `PatientBasicInfo`

- [ ] **Step 1: Add CursorPaginatedResult to utils**

Append to `packages/shared/utils/src/pagination.ts`:

```typescript
export interface CursorPaginatedResult<T> {
  data: T[];
  nextCursor: { scheduledAt: string; id: string } | null;
  hasMore: boolean;
}
```

Export from `packages/shared/utils/src/index.ts`.

- [ ] **Step 2: Extend PatientBasicInfo**

Add `preferredLanguage: string` to `PatientBasicInfo` in `patient-repository.port.ts`:

```typescript
export interface PatientBasicInfo {
  id: string;
  patientCode: string | null;
  preferredLanguage: string;
}
```

**Note:** This changes the existing interface. The `DrizzlePatientRepository` must be updated to return this field (Task in Chunk 5). Existing tests may need adjustment.

- [ ] **Step 3: Write consultation ports**

```typescript
// consultation-repository.port.ts
import type { Consultation } from '../entities/consultation.entity.js';
import type { ConsultationStatus } from '../enums/index.js';
import type { CursorPaginatedResult } from '@medical-crm/utils';

export interface ConsultationListQuery {
  cursor?: { scheduledAt: string; id: string };
  limit: number;
  hospitalId?: string;
  caseId?: string;
  status?: ConsultationStatus;
}

export interface ConsultationCountFilters {
  hospitalId?: string;
}

export interface ConsultationStats {
  total: number;
  scheduled: number;
  completed: number;
  todayCount: number;
  needsTranslation: number;
}

export interface IConsultationRepository {
  findById(id: string): Promise<Consultation | null>;
  findMany(query: ConsultationListQuery): Promise<CursorPaginatedResult<Consultation>>;
  findByCaseId(caseId: string): Promise<Consultation[]>;
  save(entity: Consultation): Promise<Consultation>;
  countByFilters(filters: ConsultationCountFilters): Promise<ConsultationStats>;
}
```

```typescript
// consultation-transcript-repository.port.ts
import type { ConsultationTranscript } from '../entities/consultation-transcript.entity.js';

export interface IConsultationTranscriptRepository {
  findByConsultationId(consultationId: string): Promise<ConsultationTranscript | null>;
  save(transcript: ConsultationTranscript): Promise<ConsultationTranscript>;
}
```

- [ ] **Step 4: Run typecheck — expect PASS (or fix DrizzlePatientRepository if it fails)**
- [ ] **Step 5: Commit**

```bash
git add packages/shared/utils/src/pagination.ts \
       packages/shared/utils/src/index.ts \
       packages/domain/src/ports/patient-repository.port.ts \
       packages/domain/src/ports/consultation-repository.port.ts \
       packages/domain/src/ports/consultation-transcript-repository.port.ts
git commit -m "feat(domain): Consultation ports + CursorPaginatedResult + extend PatientBasicInfo"
```

---

### Task 11: Update Domain Barrel Exports

**Files:**
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Add all new exports**

Append to existing `index.ts`:

```typescript
// Phase 2BC Enums
export type {
  HospitalStatus, HospitalType,
  ConversationCategory, MessageType, ModerationStatus,
  ConsultationStatus, AISummaryStatus, TranscriptStatus,
  MessageTaskKind, MessageTaskStatus,
} from './enums/index.js';

// Phase 2BC State machines
export { HOSPITAL_STATUS_TRANSITIONS } from './state-machine/hospital-status-transitions.js';
export { CONSULTATION_STATUS_TRANSITIONS } from './state-machine/consultation-status-transitions.js';

// Phase 2BC Value objects
export { RegistrationToken } from './value-objects/registration-token.js';
export type { RegistrationTokenProps } from './value-objects/registration-token.js';

// Phase 2BC Entities
export { Hospital } from './entities/hospital.entity.js';
export type { HospitalProps } from './entities/hospital.entity.js';
export { Conversation } from './entities/conversation.entity.js';
export type { ConversationProps } from './entities/conversation.entity.js';
export { Message } from './entities/message.entity.js';
export type { MessageProps, Attachment } from './entities/message.entity.js';
export { Consultation } from './entities/consultation.entity.js';
export type { ConsultationProps, VideoInfo } from './entities/consultation.entity.js';
export { ConsultationTranscript } from './entities/consultation-transcript.entity.js';
export type { ConsultationTranscriptProps, TranscriptEntry } from './entities/consultation-transcript.entity.js';

// Phase 2BC Ports — Hospital
export type { IHospitalManagementRepository, HospitalListQuery } from './ports/hospital-management-repository.port.js';
export type { IRegistrationTokenRepository } from './ports/registration-token-repository.port.js';
export type { IHospitalSyncService } from './ports/hospital-sync-service.port.js';
export type { IKeycloakAdminService, KeycloakUser } from './ports/keycloak-admin-service.port.js';
export type { IUserRepository, CreateUserInput } from './ports/user-repository.port.js';

// Phase 2BC Ports — Messaging
export type { IConversationRepository, ConversationListQuery } from './ports/conversation-repository.port.js';
export type { IMessageRepository, MessageListQuery } from './ports/message-repository.port.js';
export type { IMessageTaskQueue, MessageTask } from './ports/message-task-queue.port.js';
export type { ITranslationService } from './ports/translation-service.port.js';

// Phase 2BC Ports — Consultations
export type { IConsultationRepository, ConsultationListQuery, ConsultationCountFilters, ConsultationStats } from './ports/consultation-repository.port.js';
export type { IConsultationTranscriptRepository } from './ports/consultation-transcript-repository.port.js';
```

- [ ] **Step 2: Run typecheck + tests**

Run: `cd medical-crm-v2 && pnpm turbo typecheck test --filter=@medical-crm/domain -- --run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/index.ts
git commit -m "feat(domain): barrel exports for all Phase 2BC types"
```

---

## Chunk 2: Application Layer — Hospital Management

### Task 12: Hospital DTOs + Mapper

**Files:**
- Create: `packages/application/src/dtos/hospital.dto.ts`
- Create: `packages/application/src/mappers/hospital.mapper.ts`

- [ ] **Step 1: Write HospitalDTO**

```typescript
// hospital.dto.ts
import type { HospitalStatus, HospitalType } from '@medical-crm/domain';

export interface HospitalDTO {
  id: string;
  name: string;
  nameEn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  logoUrl: string | null;
  specialties: string[] | null;
  status: HospitalStatus;
  type: HospitalType;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Write mapper**

```typescript
// hospital.mapper.ts
import type { Hospital } from '@medical-crm/domain';
import type { HospitalDTO } from '../dtos/hospital.dto.js';

export function toHospitalDTO(entity: Hospital): HospitalDTO {
  return {
    id: entity.id,
    name: entity.name,
    nameEn: entity.nameEn,
    address: entity.address,
    phone: entity.phone,
    email: entity.email,
    description: entity.description,
    logoUrl: entity.logoUrl,
    specialties: entity.specialties,
    status: entity.status,
    type: entity.type,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 3: Run typecheck — expect PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/application/src/dtos/hospital.dto.ts \
       packages/application/src/mappers/hospital.mapper.ts
git commit -m "feat(application): Hospital DTO and mapper"
```

---

### Task 13: CreateHospitalUseCase

**Files:**
- Create: `packages/application/src/use-cases/hospitals/create-hospital.use-case.ts`
- Create: `packages/application/__tests__/create-hospital.use-case.test.ts`

- [ ] **Step 1: Write test**

Test cases:
- Creates hospital and calls `hospitalManagementRepo.save()` + `syncService.syncToSupabase()`
- Returns HospitalDTO
- Throws ForbiddenError for non-ADMIN actor
- Sets initial status to PENDING

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
export interface CreateHospitalInput {
  name: string;
  type: HospitalType;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  description?: string;
}

export class CreateHospitalUseCase {
  constructor(
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly syncService: IHospitalSyncService,
  ) {}

  async execute(input: CreateHospitalInput, actor: Actor): Promise<HospitalDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can create hospitals');

    const now = new Date();
    const entity = new Hospital({
      id: generateId(),
      name: input.name,
      nameEn: null,
      address: input.address ?? null,
      phone: input.contactPhone ?? null,
      email: input.contactEmail,
      description: input.description ?? null,
      logoUrl: null,
      specialties: null,
      status: 'PENDING',
      type: input.type,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.hospitalRepo.save(entity);
    await this.syncService.syncToSupabase(saved);
    return toHospitalDTO(saved);
  }
}
```

- [ ] **Step 4: Run test — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/hospitals/create-hospital.use-case.ts \
       packages/application/__tests__/create-hospital.use-case.test.ts
git commit -m "feat(application): CreateHospitalUseCase"
```

---

### Task 14: ListHospitalsUseCase + GetHospitalUseCase

**Files:**
- Create: `packages/application/src/use-cases/hospitals/list-hospitals.use-case.ts`
- Create: `packages/application/src/use-cases/hospitals/get-hospital.use-case.ts`
- Create: `packages/application/__tests__/list-hospitals.use-case.test.ts`
- Create: `packages/application/__tests__/get-hospital.use-case.test.ts`

- [ ] **Step 1: Write tests**

ListHospitals:
- ADMIN-only, returns PaginatedResult<HospitalDTO>
- Passes query to repo

GetHospital:
- ADMIN sees any hospital
- HOSPITAL can only see own hospital (actor.hospitalId must match)
- Throws NotFoundError if hospital not found
- Throws ForbiddenError if HOSPITAL tries to view different hospital

- [ ] **Step 2: Implement**

`ListHospitalsUseCase`: ADMIN-only. Calls `hospitalManagementRepo.findMany(query)`. Maps results to DTOs.

`GetHospitalUseCase`: Calls `hospitalManagementRepo.findFullById(id)`. HOSPITAL actor: checks `id === actor.hospitalId`.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/hospitals/list-hospitals.use-case.ts \
       packages/application/src/use-cases/hospitals/get-hospital.use-case.ts \
       packages/application/__tests__/list-hospitals.use-case.test.ts \
       packages/application/__tests__/get-hospital.use-case.test.ts
git commit -m "feat(application): ListHospitals + GetHospital use cases"
```

---

### Task 15: UpdateHospitalUseCase + UpdateHospitalStatusUseCase

**Files:**
- Create: `packages/application/src/use-cases/hospitals/update-hospital.use-case.ts`
- Create: `packages/application/src/use-cases/hospitals/update-hospital-status.use-case.ts`
- Create: `packages/application/__tests__/update-hospital.use-case.test.ts`

- [ ] **Step 1: Write tests**

UpdateHospital:
- ADMIN-only
- Updates provided fields, calls save + syncToSupabase
- Throws NotFoundError if not found

UpdateHospitalStatus:
- ADMIN-only
- Calls entity's `activate()` or `deactivate()` based on target status
- Throws ValidationError for invalid transitions

- [ ] **Step 2: Implement**

`UpdateHospitalUseCase`: Fetch entity, update mutable fields (name, nameEn, address, phone, email, description, logoUrl, specialties), save, sync.

`UpdateHospitalStatusUseCase`: Fetch entity, call `activate()` or `deactivate()`, call `hospitalRepo.updateStatus()`.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/hospitals/update-hospital.use-case.ts \
       packages/application/src/use-cases/hospitals/update-hospital-status.use-case.ts \
       packages/application/__tests__/update-hospital.use-case.test.ts
git commit -m "feat(application): UpdateHospital + UpdateHospitalStatus use cases"
```

---

### Task 16: GetHospitalCasesUseCase

**Files:**
- Create: `packages/application/src/use-cases/hospitals/get-hospital-cases.use-case.ts`
- Create: `packages/application/__tests__/get-hospital-cases.use-case.test.ts`

- [ ] **Step 1: Write test**

- ADMIN-only
- Delegates to existing `ListCasesUseCase` with `hospitalId` filter
- Validates hospital exists first

- [ ] **Step 2: Implement**

Constructor takes `IHospitalManagementRepository` + `ListCasesUseCase` (reuse). Execute: check hospital exists, then call `listCases.execute({ ...query, hospitalId: id }, actor)`.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/hospitals/get-hospital-cases.use-case.ts \
       packages/application/__tests__/get-hospital-cases.use-case.test.ts
git commit -m "feat(application): GetHospitalCasesUseCase"
```

---

### Task 17: GenerateRegistrationTokenUseCase

**Files:**
- Create: `packages/application/src/use-cases/hospitals/generate-registration-token.use-case.ts`
- Create: `packages/application/__tests__/generate-registration-token.use-case.test.ts`

- [ ] **Step 1: Write test**

- ADMIN-only
- Generates token with 72-hour expiry
- Validates hospital exists
- Saves token to repo
- Returns token string and expiration

- [ ] **Step 2: Implement**

```typescript
export class GenerateRegistrationTokenUseCase {
  constructor(
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly tokenRepo: IRegistrationTokenRepository,
  ) {}

  async execute(hospitalId: string, email: string, actor: Actor): Promise<{ token: string; expiresAt: string }> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can generate tokens');

    const hospital = await this.hospitalRepo.findFullById(hospitalId);
    if (!hospital) throw new NotFoundError('Hospital not found');

    const now = new Date();
    const token = new RegistrationToken({
      id: generateId(),
      hospitalId,
      token: crypto.randomUUID(),
      email,
      expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      usedAt: null,
      keycloakUserId: null,
      createdAt: now,
    });

    await this.tokenRepo.save(token);
    return { token: token.token, expiresAt: token.expiresAt.toISOString() };
  }
}
```

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/hospitals/generate-registration-token.use-case.ts \
       packages/application/__tests__/generate-registration-token.use-case.test.ts
git commit -m "feat(application): GenerateRegistrationTokenUseCase"
```

---

### Task 18: RegisterHospitalUserUseCase (with KC Compensation)

**Files:**
- Create: `packages/application/src/use-cases/hospitals/register-hospital-user.use-case.ts`
- Create: `packages/application/__tests__/register-hospital-user.use-case.test.ts`

- [ ] **Step 1: Write tests**

Test cases:
- Happy path: validates token → creates KC user → creates CRM user → marks token used
- Throws ValidationError for expired token
- Throws ValidationError for already-used token
- Throws ConflictError if username already exists in KC
- Throws ConflictError if email already exists in KC
- **KC Compensation test:** If CRM user creation fails after KC user is created, calls `keycloakAdmin.deleteUser(keycloakUserId)` to clean up

- [ ] **Step 2: Implement**

```typescript
export interface RegisterHospitalUserInput {
  token: string;
  username: string;
  password: string;
}

export class RegisterHospitalUserUseCase {
  constructor(
    private readonly tokenRepo: IRegistrationTokenRepository,
    private readonly keycloakAdmin: IKeycloakAdminService,
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(input: RegisterHospitalUserInput): Promise<{ userId: string; email: string }> {
    // 1. Validate token
    const token = await this.tokenRepo.findByToken(input.token);
    if (!token) throw new ValidationError('Invalid registration token');
    if (token.isUsed()) throw new ValidationError('Registration token has already been used');
    if (token.isExpired()) throw new ValidationError('Registration token has expired');

    // 2. Check uniqueness via KC Admin API
    const [usernameExists, emailExists] = await Promise.all([
      this.keycloakAdmin.checkUsernameExists(input.username),
      this.keycloakAdmin.checkEmailExists(token.email),
    ]);
    if (usernameExists) throw new ConflictError('Username already exists');
    if (emailExists) throw new ConflictError('Email already exists');

    // 3. Get hospital to determine role
    const hospital = await this.hospitalRepo.findFullById(token.hospitalId);
    if (!hospital) throw new NotFoundError('Hospital not found');
    const kcRole = hospital.type === 'REGULAR' ? 'regular_hospital' : 'hospital';

    // 4. Create KC user — everything after this is inside compensation try/catch
    const keycloakUserId = await this.keycloakAdmin.createUser(
      input.username, token.email, hospital.name, hospital.id,
    );

    try {
      // 5. Set password + assign role (inside try — if these fail, clean up KC user)
      await this.keycloakAdmin.setPassword(keycloakUserId, input.password);
      await this.keycloakAdmin.assignRole(keycloakUserId, kcRole);

      // 6. Create CRM user in DB via IUserRepository
      // NOTE: v1 uses hospital.name for the CRM user name field, NOT input.username.
      // input.username is the Keycloak login; the CRM display name is the hospital name.
      const crmUserId = generateId();
      await this.userRepo.create({
        id: crmUserId,
        email: token.email,
        name: hospital.name, // matches v1: registrationToken.hospital.name
        role: 'HOSPITAL',
        hospitalId: token.hospitalId,
        preferredLanguage: 'zh',
      });

      // 7. Mark token as used
      token.markUsed(keycloakUserId);
      await this.tokenRepo.save(token);

      return { userId: crmUserId, email: token.email };
    } catch (err) {
      // COMPENSATION: Clean up KC user if setPassword, assignRole, or CRM user creation fails
      await this.keycloakAdmin.deleteUser(keycloakUserId);
      throw err;
    }
  }
}
```

**Note:** The `IUserRepository` port (defined in Task 8) provides `create()` for CRM user creation and `findPreferredLanguage()` for message language derivation. The `DrizzleUserRepository` is implemented in Task 35a (Infrastructure). The key requirement is that `setPassword`, `assignRole`, and CRM user creation are ALL inside the try/catch so KC user is cleaned up on any failure.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/hospitals/register-hospital-user.use-case.ts \
       packages/application/__tests__/register-hospital-user.use-case.test.ts
git commit -m "feat(application): RegisterHospitalUserUseCase with KC compensation"
```

---

## Chunk 3: Application Layer — Messaging

### Task 19: Messaging DTOs + Mappers

**Files:**
- Create: `packages/application/src/dtos/conversation.dto.ts`
- Create: `packages/application/src/mappers/conversation.mapper.ts`

- [ ] **Step 1: Write DTOs**

```typescript
// conversation.dto.ts
import type { ConversationCategory, MessageType, ModerationStatus, Attachment } from '@medical-crm/domain';

export interface ConversationDTO {
  id: string;
  caseId: string | null;
  category: ConversationCategory;
  title: string | null;
  hospitalId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  originalLanguage: string;
  translatedContent: string | null;
  messageType: MessageType;
  moderationStatus: ModerationStatus;
  attachments: Attachment[] | null;
  aiSummary: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Write mappers**

```typescript
// conversation.mapper.ts
import type { Conversation, Message } from '@medical-crm/domain';
import type { ConversationDTO, MessageDTO } from '../dtos/conversation.dto.js';

export function toConversationDTO(entity: Conversation): ConversationDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    category: entity.category,
    title: entity.title,
    hospitalId: entity.hospitalId,
    lastMessageAt: entity.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: entity.lastMessagePreview,
    lastSenderId: entity.lastSenderId,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toMessageDTO(entity: Message): MessageDTO {
  return {
    id: entity.id,
    conversationId: entity.conversationId,
    senderId: entity.senderId,
    content: entity.content,
    originalLanguage: entity.originalLanguage,
    translatedContent: entity.translatedContent,
    messageType: entity.messageType,
    moderationStatus: entity.moderationStatus,
    attachments: entity.attachments,
    aiSummary: entity.aiSummary,
    createdAt: entity.createdAt.toISOString(),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/dtos/conversation.dto.ts \
       packages/application/src/mappers/conversation.mapper.ts
git commit -m "feat(application): Messaging DTOs and mappers"
```

---

### Task 20: CreateConversationUseCase

**Files:**
- Create: `packages/application/src/use-cases/conversations/create-conversation.use-case.ts`
- Create: `packages/application/__tests__/create-conversation.use-case.test.ts`

- [ ] **Step 1: Write test**

- ADMIN-only
- Creates conversation with provided category, caseId, hospitalId, title
- Returns ConversationDTO

- [ ] **Step 2: Implement**

Constructor: `IConversationRepository`. Execute: create entity with `generateId()`, save, return DTO.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

---

### Task 21: ListConversationsUseCase + GetConversationUseCase + UpdateConversationUseCase

**Files:**
- Create: `packages/application/src/use-cases/conversations/list-conversations.use-case.ts`
- Create: `packages/application/src/use-cases/conversations/get-conversation.use-case.ts`
- Create: `packages/application/src/use-cases/conversations/update-conversation.use-case.ts`
- Create: `packages/application/__tests__/list-conversations.use-case.test.ts`
- Create: `packages/application/__tests__/get-conversation.use-case.test.ts`

- [ ] **Step 1: Write tests**

ListConversations:
- ADMIN sees all conversations
- HOSPITAL sees only own hospitalId conversations, filtered by category IN ('ADMIN_HOSPITAL', 'HOSPITAL_PATIENT')
- Passes query + hospitalId filter to repo

GetConversation:
- Permission check: HOSPITAL can only view conversations with matching hospitalId
- Throws NotFoundError if not found

UpdateConversation:
- Updates title
- Permission check same as Get

- [ ] **Step 2: Implement**

HOSPITAL permission: `conversation.hospitalId === actor.hospitalId` AND `category IN ('ADMIN_HOSPITAL', 'HOSPITAL_PATIENT')`.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/conversations/list-conversations.use-case.ts \
       packages/application/src/use-cases/conversations/get-conversation.use-case.ts \
       packages/application/src/use-cases/conversations/update-conversation.use-case.ts \
       packages/application/__tests__/conversation-crud.use-case.test.ts
git commit -m "feat(application): Conversation CRUD use cases"
```

---

### Task 22: SendMessageUseCase

**Files:**
- Create: `packages/application/src/use-cases/messages/send-message.use-case.ts`
- Create: `packages/application/__tests__/send-message.use-case.test.ts`

This is the most complex use case. Follow the spec's SendMessage flow exactly.

- [ ] **Step 1: Write tests**

Test cases:
- TEXT message from ADMIN: inline translation, moderationStatus = ALLOWED
- TEXT message from HOSPITAL to PATIENT: moderationStatus = REVIEW, inline translation
- TEXT message from HOSPITAL to ADMIN: moderationStatus = ALLOWED
- IMAGE message: no inline translation, enqueues SUMMARIZE + TRANSLATE tasks
- FILE message: same as IMAGE
- recipientLang derivation for ADMIN_HOSPITAL conversation
- recipientLang derivation for HOSPITAL_PATIENT conversation
- recipientLang derivation for ADMIN_PATIENT conversation
- Updates conversation lastMessage* fields after send
- Throws ForbiddenError if actor lacks access to conversation

- [ ] **Step 2: Implement**

```typescript
export interface SendMessageInput {
  content: string;
  messageType?: MessageType;
  attachments?: Attachment[];
}

export class SendMessageUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly translationService: ITranslationService,
    private readonly messageTaskQueue: IMessageTaskQueue,
    private readonly patientRepo: IPatientRepository,
    private readonly userRepo: IUserRepository,
    private readonly caseRepo: ICaseRepository, // needed to get patientId from caseId for language lookup
  ) {}

  async execute(
    conversationId: string,
    input: SendMessageInput,
    actor: Actor,
  ): Promise<MessageDTO> {
    // 1. Validate access
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    this.checkAccess(conversation, actor);

    // 2. Determine recipientLang
    const recipientLang = await this.deriveRecipientLang(conversation, actor);

    // 3. Determine moderationStatus
    const moderationStatus = this.determineModerationStatus(conversation, actor);

    // 4. Create message entity
    const messageType = input.messageType ?? 'TEXT';
    const message = new Message({
      id: generateId(),
      conversationId,
      senderId: actor.userId,
      content: input.content,
      originalLanguage: this.detectLanguage(input.content),
      translatedContent: null,
      messageType,
      moderationStatus,
      attachments: input.attachments ?? null,
      aiSummary: null,
      createdAt: new Date(),
    });

    // 5. TEXT: inline translation
    if (messageType === 'TEXT') {
      const translated = await this.translationService.translate(input.content, recipientLang);
      message.setTranslation(translated);
    }

    // 6. Save message (before enqueue!)
    const saved = await this.messageRepo.save(message);

    // 7. IMAGE/FILE: async enqueue
    if (messageType === 'IMAGE' || messageType === 'FILE') {
      await this.messageTaskQueue.enqueueSummarization(saved.id);
      await this.messageTaskQueue.enqueueTranslation(saved.id, recipientLang);
    }

    // 8. Update conversation lastMessage* fields
    conversation.updateLastMessage({
      id: saved.id,
      content: saved.content,
      senderId: saved.senderId,
      createdAt: saved.createdAt,
    });
    await this.conversationRepo.save(conversation);

    return toMessageDTO(saved);
  }

  private async deriveRecipientLang(conversation: Conversation, actor: Actor): Promise<string> {
    // NOTE: conversations table has hospitalId but NOT patientId.
    // To find the patient, we go through conversation.caseId → case.patientId → patient lookup.
    //
    // Spec rules per conversation category:
    // ADMIN_HOSPITAL: admin sends → hospital user's preferredLanguage (via userRepo.findPreferredLanguage(hospitalId))
    //                 hospital sends → 'zh' (admin default per spec)
    // HOSPITAL_PATIENT: hospital sends → patient's preferredLanguage (via caseId → patientId)
    //                   patient sends → hospital user's preferredLanguage
    // ADMIN_PATIENT: admin sends → patient's preferredLanguage (via caseId → patientId)
    //                patient sends → 'zh' (admin default per spec)
    if (conversation.category === 'ADMIN_HOSPITAL') {
      if (actor.role === 'ADMIN') {
        const lang = await this.userRepo.findPreferredLanguage(conversation.hospitalId!);
        return lang ?? 'zh';
      }
      return 'zh'; // recipient is admin — spec default
    }
    if (conversation.category === 'HOSPITAL_PATIENT') {
      if (actor.role === 'HOSPITAL') {
        // Recipient is patient — resolve via caseId
        const patientLang = await this.resolvePatientLang(conversation.caseId);
        return patientLang;
      }
      // Sender is patient, recipient is hospital user
      const lang = await this.userRepo.findPreferredLanguage(conversation.hospitalId!);
      return lang ?? 'zh';
    }
    if (conversation.category === 'ADMIN_PATIENT') {
      if (actor.role === 'ADMIN') {
        const patientLang = await this.resolvePatientLang(conversation.caseId);
        return patientLang;
      }
      return 'zh'; // recipient is admin — spec default
    }
    return 'zh'; // fallback (admin context)
  }

  private async resolvePatientLang(caseId: string | null): Promise<string> {
    if (!caseId) return 'en';
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) return 'en';
    const patient = await this.patientRepo.findById(caseEntity.patientId);
    return patient?.preferredLanguage ?? 'en';
  }

  private determineModerationStatus(conversation: Conversation, actor: Actor): ModerationStatus {
    if (actor.role === 'ADMIN') return 'ALLOWED';
    if (actor.role === 'HOSPITAL' && conversation.category === 'HOSPITAL_PATIENT') return 'REVIEW';
    return 'ALLOWED';
  }

  private detectLanguage(content: string): string {
    // Unicode script detection for non-Latin scripts (zh/jp/kr/th/ar/ru).
    // Latin-script languages (en/es/fr/de) all fall back to 'en' — fine-grained
    // Latin detection would need n-gram analysis, not worth it for metadata.
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(content)) return 'zh'; // CJK Unified (Chinese)
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(content)) return 'jp'; // Hiragana + Katakana
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(content)) return 'kr'; // Hangul
    if (/[\u0e01-\u0e5b]/.test(content)) return 'th';              // Thai
    if (/[\u0600-\u06ff\u0750-\u077f]/.test(content)) return 'ar'; // Arabic
    if (/[\u0400-\u04ff]/.test(content)) return 'ru';              // Cyrillic → Russian
    // Latin-script languages: fall back to 'en' for now.
    // Fine-grained Latin detection (es/fr/de) would need n-gram analysis
    // or an API call — not worth the complexity for originalLanguage metadata.
    return 'en';
  }

  private checkAccess(conversation: Conversation, actor: Actor): void {
    if (actor.role === 'ADMIN') return; // admin has full access
    if (actor.role === 'HOSPITAL') {
      if (conversation.hospitalId !== actor.hospitalId) {
        throw new ForbiddenError('No access to this conversation');
      }
      if (conversation.category === 'ADMIN_PATIENT') {
        throw new ForbiddenError('Hospital cannot access admin-patient conversations');
      }
      return;
    }
    throw new ForbiddenError('Insufficient permissions');
  }
}
```

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/messages/send-message.use-case.ts \
       packages/application/__tests__/send-message.use-case.test.ts
git commit -m "feat(application): SendMessageUseCase with recipientLang, moderation, async tasks"
```

---

### Task 23: Message CRUD Use Cases

**Files:**
- Create: `packages/application/src/use-cases/messages/list-messages.use-case.ts`
- Create: `packages/application/src/use-cases/messages/get-message.use-case.ts`
- Create: `packages/application/src/use-cases/messages/update-message.use-case.ts`
- Create: `packages/application/src/use-cases/messages/delete-message.use-case.ts`
- Create: `packages/application/__tests__/message-crud.use-case.test.ts`

- [ ] **Step 1: Write tests for all 4 use cases**

All follow same permission pattern: validate conversation access → operate on message.
- ListMessages: paginated by conversationId
- GetMessage: validate conversation access, return single MessageDTO
- UpdateMessage: update content, re-translate inline for TEXT
- DeleteMessage: hard delete (ADMIN or HOSPITAL who owns the conversation)

- [ ] **Step 2: Implement all 4**
- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(application): Message CRUD use cases (list, get, update, delete)"
```

---

### Task 24: Message Moderation Use Cases

**Files:**
- Create: `packages/application/src/use-cases/messages/list-pending-review.use-case.ts`
- Create: `packages/application/src/use-cases/messages/approve-message.use-case.ts`
- Create: `packages/application/src/use-cases/messages/reject-message.use-case.ts`
- Create: `packages/application/__tests__/message-moderation.use-case.test.ts`

- [ ] **Step 1: Write tests**

- ListPendingReview: ADMIN-only, returns Message[]
- ApproveMessage: ADMIN-only, calls `message.approve()`, saves
- RejectMessage: ADMIN-only, calls `message.reject()`, saves
- Throws ForbiddenError for non-ADMIN
- Throws NotFoundError for missing message

- [ ] **Step 2: Implement**
- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(application): Message moderation use cases (pending, approve, reject)"
```

---

### Task 25: RegenerateSummary + Retranslate + ProcessMessageTasks

**Files:**
- Create: `packages/application/src/use-cases/messages/regenerate-summary.use-case.ts`
- Create: `packages/application/src/use-cases/messages/retranslate-message.use-case.ts`
- Create: `packages/application/src/use-cases/messages/process-message-tasks.use-case.ts`
- Create: `packages/application/__tests__/regenerate-summary.use-case.test.ts`
- Create: `packages/application/__tests__/process-message-tasks.use-case.test.ts`

- [ ] **Step 1: Write tests**

RegenerateSummary:
- Calls `translationService.summarizeMessage()` → sets on entity → saves

RetranslateMessage:
- Calls `translationService.translate()` → sets on entity → saves

ProcessMessageTasks:
- Pulls pending tasks (limit 10)
- For SUMMARIZE: calls summarizeMessage, updates message
- For TRANSLATE: calls translate, updates message
- Marks task completed or failed
- Max 3 retries (retryCount check)
- Skips tasks exceeding retry limit

- [ ] **Step 2: Implement**

`ProcessMessageTasksUseCase` constructor takes `IMessageTaskQueue`, `IMessageRepository`, `ITranslationService`.

```typescript
async execute(): Promise<{ processed: number; failed: number }> {
  const tasks = await this.taskQueue.pullPending(10);
  let processed = 0, failed = 0;

  for (const task of tasks) {
    if (task.retryCount >= 3) {
      await this.taskQueue.markFailed(task.id, 'Max retries exceeded');
      failed++;
      continue;
    }
    await this.taskQueue.markProcessing(task.id);
    try {
      const message = await this.messageRepo.findById(task.messageId);
      if (!message) { await this.taskQueue.markFailed(task.id, 'Message not found'); failed++; continue; }

      if (task.taskKind === 'SUMMARIZE') {
        const summary = await this.translationService.summarizeMessage(message.content, message.messageType, message.originalLanguage);
        message.setAiSummary(summary);
      } else if (task.taskKind === 'TRANSLATE' && task.targetLanguage) {
        const translated = await this.translationService.translate(message.content, task.targetLanguage);
        message.setTranslation(translated);
      }
      await this.messageRepo.save(message);
      await this.taskQueue.markCompleted(task.id);
      processed++;
    } catch (err) {
      await this.taskQueue.markFailed(task.id, err instanceof Error ? err.message : 'Unknown error');
      failed++;
    }
  }
  return { processed, failed };
}
```

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(application): RegenerateSummary, Retranslate, ProcessMessageTasks use cases"
```

---

## Chunk 4: Application Layer — Consultations

### Task 26: Consultation DTOs + Mappers

**Files:**
- Create: `packages/application/src/dtos/consultation.dto.ts`
- Create: `packages/application/src/mappers/consultation.mapper.ts`

- [ ] **Step 1: Write DTOs**

ConsultationDTO per spec (all Date fields as ISO strings). ConsultationTranscriptDTO per spec.

- [ ] **Step 2: Write mappers**

`toConsultationDTO(entity)` and `toConsultationTranscriptDTO(entity)`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(application): Consultation DTOs and mappers"
```

---

### Task 27: CreateConsultationUseCase + GetConsultationUseCase

**Files:**
- Create: `packages/application/src/use-cases/consultations/create-consultation.use-case.ts`
- Create: `packages/application/src/use-cases/consultations/get-consultation.use-case.ts`
- Create: `packages/application/__tests__/create-consultation.use-case.test.ts`
- Create: `packages/application/__tests__/get-consultation.use-case.test.ts`

- [ ] **Step 1: Write tests**

CreateConsultation:
- ADMIN or HOSPITAL can create
- Validates case exists (via ICaseRepository)
- HOSPITAL: hospitalId must match case's assignedHospitalId
- Sets initial status to SCHEDULED

GetConsultation:
- ADMIN sees any
- HOSPITAL: only own hospitalId
- Throws NotFoundError if not found

- [ ] **Step 2: Implement**
- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(application): CreateConsultation + GetConsultation use cases"
```

---

### Task 28: ListConsultationsUseCase (Cursor Pagination)

**Files:**
- Create: `packages/application/src/use-cases/consultations/list-consultations.use-case.ts`
- Create: `packages/application/__tests__/list-consultations.use-case.test.ts`

- [ ] **Step 1: Write tests**

- HOSPITAL-only
- Passes cursor, limit, hospitalId filter to repo
- Returns CursorPaginatedResult<ConsultationDTO>
- Forces `hospitalId = actor.hospitalId`

- [ ] **Step 2: Implement**

```typescript
async execute(query: { cursor?: string; limit?: number; status?: ConsultationStatus }, actor: Actor) {
  if (actor.role !== 'HOSPITAL') throw new ForbiddenError('Only hospital users can list consultations');

  const parsedCursor = query.cursor ? this.parseCursor(query.cursor) : undefined;
  const result = await this.consultationRepo.findMany({
    cursor: parsedCursor,
    limit: query.limit ?? 20,
    hospitalId: actor.hospitalId!,
    status: query.status,
  });

  return {
    data: result.data.map(toConsultationDTO),
    nextCursor: result.nextCursor ? `${result.nextCursor.scheduledAt}_${result.nextCursor.id}` : null,
    hasMore: result.hasMore,
  };
}

private parseCursor(cursor: string): { scheduledAt: string; id: string } {
  const [scheduledAt, id] = cursor.split('_');
  if (!scheduledAt || !id) throw new ValidationError('Invalid cursor format');
  return { scheduledAt, id };
}
```

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(application): ListConsultationsUseCase with cursor pagination"
```

---

### Task 29: UpdateConsultationUseCase + UpdateConsultationStatusUseCase

**Files:**
- Create: `packages/application/src/use-cases/consultations/update-consultation.use-case.ts`
- Create: `packages/application/src/use-cases/consultations/update-consultation-status.use-case.ts`
- Create: `packages/application/__tests__/update-consultation.use-case.test.ts`

- [ ] **Step 1: Write tests**

UpdateConsultation:
- Updates scheduling info (scheduledAt, durationMinutes, consultationLink, notes, aiTranslation, patientLanguage)
- Permission check

UpdateConsultationStatus:
- `start`: calls entity.start()
- `complete`: calls entity.complete()
- `cancel`: calls entity.cancel()
- `noShow`: calls entity.noShow()
- Validates transitions

- [ ] **Step 2: Implement**
- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(application): UpdateConsultation + UpdateConsultationStatus use cases"
```

---

### Task 30: Remaining Consultation Use Cases

**Files:**
- Create: `packages/application/src/use-cases/consultations/get-consultation-transcript.use-case.ts`
- Create: `packages/application/src/use-cases/consultations/get-consultation-stats.use-case.ts`
- Create: `packages/application/src/use-cases/consultations/list-case-consultations.use-case.ts`
- Create: `packages/application/__tests__/consultation-queries.use-case.test.ts`

- [ ] **Step 1: Write tests**

GetConsultationTranscript:
- Returns transcript for consultation
- Permission check (ADMIN or HOSPITAL with matching hospitalId)

GetConsultationStats:
- HOSPITAL-only, returns ConsultationStats DTO

ListCaseConsultations:
- ADMIN-only
- Validates case exists
- Returns all consultations for a case

- [ ] **Step 2: Implement**
- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(application): GetConsultationTranscript, Stats, ListCaseConsultations"
```

---

### Task 31: Update Application Barrel Exports

**Files:**
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Add all new exports**

Add exports for all new DTOs, mappers, and use cases following the existing pattern.

- [ ] **Step 2: Run typecheck + tests**

Run: `cd medical-crm-v2 && pnpm turbo typecheck test --filter=@medical-crm/application -- --run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/index.ts
git commit -m "feat(application): barrel exports for all Phase 2BC use cases"
```

---

## Chunk 5: Infrastructure Layer

### Task 32: DB Migration — message_tasks Table

**Files:**
- Create: `packages/infrastructure/database/migrations/002_create_message_tasks.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 002_create_message_tasks.sql
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

- [ ] **Step 2: Run migration against test DB**

Run: `psql $DATABASE_URL -f packages/infrastructure/database/migrations/002_create_message_tasks.sql`
Expected: CREATE TABLE, CREATE INDEX (x2)

- [ ] **Step 3: Add messageTasks to Drizzle schema**

Add to `packages/infrastructure/database/schema/schema.ts`:

```typescript
export const messageTasks = pgTable("message_tasks", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  messageId: uuid("message_id").notNull(),
  taskKind: text("task_kind").notNull(),
  targetLanguage: varchar("target_language", { length: 10 }),
  status: text().default('PENDING').notNull(),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("message_tasks_pending_idx").using("btree", table.status.asc().nullsLast().op("text_ops")).where(sql`(status = 'PENDING'::text)`),
  index("message_tasks_message_id_idx").using("btree", table.messageId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.messageId],
    foreignColumns: [messages.id],
    name: "message_tasks_message_id_fkey"
  }).onDelete("cascade"),
]);
```

Export from `packages/infrastructure/database/schema/index.ts`.

- [ ] **Step 4: Run drizzle-kit check to verify**

Run: `cd medical-crm-v2/packages/infrastructure && npx drizzle-kit check`
Expected: Schema matches (or known drifts only)

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/database/migrations/002_create_message_tasks.sql \
       packages/infrastructure/database/schema/schema.ts \
       packages/infrastructure/database/schema/index.ts
git commit -m "feat(infra): message_tasks table migration + Drizzle schema"
```

---

### Task 33: DrizzleHospitalManagementRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-hospital-management.repository.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-hospital-management.repository.test.ts`

- [ ] **Step 1: Write integration test**

Follow existing integration test pattern (see `drizzle-case.repository.test.ts`):
- `findFullById` returns Hospital entity with all fields
- `findMany` returns paginated results
- `findMany` filters by status, type, search (ILIKE on name/nameEn)
- `save` upsert (insert or update)
- `updateStatus` changes status

- [ ] **Step 2: Implement repository**

Row mapper converts Drizzle row → Hospital entity. `findMany` uses offset pagination: `offset = (page - 1) * limit`. Search uses `or(ilike(name, pattern), ilike(nameEn, pattern))`.

- [ ] **Step 3: Run integration tests — expect PASS**

Run: `cd medical-crm-v2 && pnpm turbo test:integration --filter=@medical-crm/infrastructure`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): DrizzleHospitalManagementRepository + integration test"
```

---

### Task 34: DrizzleRegistrationTokenRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-registration-token.repository.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-registration-token.repository.test.ts`

- [ ] **Step 1: Write integration test**

- `findByToken` round-trip
- `findByHospitalId` returns all tokens for a hospital
- `save` creates and updates (markUsed)

- [ ] **Step 2: Implement**

Maps `hospital_registration_tokens` table rows to `RegistrationToken` value objects.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): DrizzleRegistrationTokenRepository + integration test"
```

---

### Task 35: DrizzleUserRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-user.repository.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-user.repository.test.ts`

- [ ] **Step 1: Write integration test**

- `create` inserts a user row with all required fields (id, email, name, role, hospitalId, preferredLanguage)
- `findPreferredLanguage` returns the user's preferredLanguage given hospitalId (picks the first HOSPITAL-role user for that hospital)
- `findPreferredLanguage` returns null for unknown userId

- [ ] **Step 2: Implement**

```typescript
import { eq, and } from 'drizzle-orm';
import { users } from '../schema/schema.js';
import type { IUserRepository, CreateUserInput } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';

export class DrizzleUserRepository implements IUserRepository {
  constructor(private readonly db: CrmDb) {}

  async create(input: CreateUserInput): Promise<{ id: string }> {
    const now = new Date().toISOString();
    await this.db.insert(users).values({
      id: input.id,
      email: input.email,
      name: input.name,
      role: input.role,
      hospitalId: input.hospitalId,
      preferredLanguage: input.preferredLanguage,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    return { id: input.id };
  }

  async findPreferredLanguage(hospitalId: string): Promise<string | null> {
    const rows = await this.db
      .select({ preferredLanguage: users.preferredLanguage })
      .from(users)
      .where(and(eq(users.hospitalId, hospitalId), eq(users.role, 'HOSPITAL')))
      .limit(1);
    return rows[0]?.preferredLanguage ?? null;
  }
}
```

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): DrizzleUserRepository + integration test"
```

---

### Task 36: DrizzleConversationRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-conversation.repository.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-conversation.repository.test.ts`

- [ ] **Step 1: Write integration test**

- `findById` round-trip
- `findMany` with category filter
- `findMany` with hospitalId filter (for HOSPITAL actor)
- `save` creates and updates (lastMessage* fields)
- Pagination correctness

- [ ] **Step 2: Implement**

`findMany` when `hospitalId` is provided: adds `where eq(conversations.hospitalId, hospitalId)`. Orders by `lastMessageAt DESC NULLS LAST`.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): DrizzleConversationRepository + integration test"
```

---

### Task 37: DrizzleMessageRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-message.repository.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-message.repository.test.ts`

- [ ] **Step 1: Write integration test**

- `findById` round-trip
- `findByConversationId` returns paginated messages ordered by createdAt DESC
- `findPendingReview` returns messages with moderationStatus = REVIEW
- `save` creates and updates
- `delete` removes the row

- [ ] **Step 2: Implement**

Row mapper handles JSONB `attachments` field (parse/serialize).

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): DrizzleMessageRepository + integration test"
```

---

### Task 38: DrizzleMessageTaskRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-message-task.repository.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-message-task.repository.test.ts`

- [ ] **Step 1: Write integration test**

- `enqueueTranslation` creates TRANSLATE task
- `enqueueSummarization` creates SUMMARIZE task
- `pullPending` returns PENDING tasks ordered by createdAt ASC
- `markProcessing` / `markCompleted` / `markFailed` update status
- `pullPending` does NOT return PROCESSING/COMPLETED/FAILED tasks

- [ ] **Step 2: Implement**

`pullPending`: `SELECT ... WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT $limit`.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): DrizzleMessageTaskRepository + integration test"
```

---

### Task 39: DrizzleConsultationRepository (Cursor Pagination)

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-consultation.repository.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-consultation.repository.test.ts`

- [ ] **Step 1: Write integration test**

- `findById` round-trip with all fields
- `findMany` cursor pagination: `WHERE (scheduled_at, id) < (cursor.scheduledAt, cursor.id) ORDER BY scheduled_at DESC, id DESC LIMIT limit + 1`
- `findMany` without cursor returns first page
- `findByCaseId` returns all consultations for a case
- `save` creates and updates
- `countByFilters` returns correct stats (total, scheduled, completed, todayCount, needsTranslation)

- [ ] **Step 2: Implement**

Cursor pagination with composite cursor `(scheduledAt, id)`. Use `sql` template for the composite comparison:

```typescript
const cursorCondition = cursor
  ? or(
      lt(consultations.scheduledAt, cursor.scheduledAt),
      and(
        eq(consultations.scheduledAt, cursor.scheduledAt),
        lt(consultations.id, cursor.id),
      ),
    )
  : undefined;
```

Fetch `limit + 1` rows. If result length > limit, `hasMore = true`, pop last row, generate `nextCursor` from last included row.

`countByFilters` uses a single SQL query with conditional counts:

```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'SCHEDULED') as scheduled,
  COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
  COUNT(*) FILTER (WHERE DATE(scheduled_at) = CURRENT_DATE) as today_count,
  COUNT(*) FILTER (WHERE ai_translation = true AND status = 'SCHEDULED') as needs_translation
FROM consultations WHERE hospital_id = $1
```

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): DrizzleConsultationRepository with cursor pagination + integration test"
```

---

### Task 40: DrizzleConsultationTranscriptRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-consultation-transcript.repository.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-consultation-transcript.repository.test.ts`

- [ ] **Step 1: Write integration test**

- `findByConsultationId` round-trip
- `save` creates transcript
- `entries` JSONB round-trip
- Status normalization: DB stores lowercase 'pending', domain uses uppercase 'PENDING'

- [ ] **Step 2: Implement**

Row mapper uppercases `status` on read. JSONB `entries` parsed as `TranscriptEntry[]`.

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): DrizzleConsultationTranscriptRepository + integration test"
```

---

### Task 41: OpenAITranslationService

**Files:**
- Create: `packages/infrastructure/services/openai-translation.service.ts`
- Create: `packages/infrastructure/__tests__/unit/openai-translation.service.test.ts`
- Modify: `packages/infrastructure/package.json` — add `openai` dependency

- [ ] **Step 1: Install openai package**

Run: `cd medical-crm-v2/packages/infrastructure && pnpm add openai`

- [ ] **Step 2: Write unit test (mock OpenAI SDK)**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAITranslationService } from '../../services/openai-translation.service.js';

// Mock the openai module
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'translated text' } }],
        }),
      },
    },
  })),
}));
```

Test cases:
- `translate()` calls GPT-4o with correct prompt and temperature
- `summarizeMessage()` calls GPT-4o with correct prompt
- Returns the response content
- Handles API errors gracefully

- [ ] **Step 3: Implement**

```typescript
import OpenAI from 'openai';
import type { ITranslationService } from '@medical-crm/domain';
import type { MessageType } from '@medical-crm/domain';

export class OpenAITranslationService implements ITranslationService {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async translate(text: string, targetLang: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: `Translate the following text to ${targetLang}. Return only the translation, no explanations.` },
        { role: 'user', content: text },
      ],
    });
    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  async summarizeMessage(content: string, messageType: MessageType, lang: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 200,
      messages: [
        { role: 'system', content: `Summarize this ${messageType.toLowerCase()} message in ${lang}. Be concise (1-2 sentences).` },
        { role: 'user', content },
      ],
    });
    return response.choices[0]?.message?.content?.trim() ?? '';
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(infra): OpenAITranslationService + unit test"
```

---

### Task 42: KeycloakAdminService

**Files:**
- Create: `packages/infrastructure/services/keycloak-admin.service.ts`
- Create: `packages/infrastructure/__tests__/unit/keycloak-admin.service.test.ts`

- [ ] **Step 1: Write unit test (mock fetch)**

Test cases:
- `createUser()` calls KC Admin API and returns userId from Location header
- `setPassword()` calls KC reset-password endpoint
- `assignRole()` fetches role then assigns
- `deleteUser()` calls KC delete endpoint (compensation)
- `checkUsernameExists()` returns true/false
- `checkEmailExists()` returns true/false
- Handles auth token acquisition

- [ ] **Step 2: Implement**

Follow v1's `keycloak-admin.ts` patterns exactly. Uses `fetch` (no SDK). Gets admin token via password grant to `admin-cli` client on `master` realm.

Key methods:
- `getAdminToken()`: internal, caches token
- `createUser()`: POST `/admin/realms/{realm}/users`, extract userId from Location header
- `setPassword()`: PUT `/admin/realms/{realm}/users/{id}/reset-password`
- `assignRole()`: GET role, POST role mapping
- `deleteUser()`: DELETE `/admin/realms/{realm}/users/{id}` (compensation)
- `checkUsernameExists()`: GET `/admin/realms/{realm}/users?username={}&exact=true`
- `checkEmailExists()`: GET `/admin/realms/{realm}/users?email={}&exact=true`

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): KeycloakAdminService + unit test"
```

---

### Task 43: SupabaseHospitalSyncService

**Files:**
- Create: `packages/infrastructure/services/supabase-hospital-sync.service.ts`
- Create: `packages/infrastructure/__tests__/unit/supabase-hospital-sync.service.test.ts`

- [ ] **Step 1: Write unit test (mock Supabase clients)**

Test cases:
- COSMETIC hospital: syncs to main Supabase hospitals table
- REGULAR hospital: syncs to China Supabase hospitals table
- Maps entity fields to Supabase table columns

- [ ] **Step 2: Implement**

```typescript
import type { IHospitalSyncService } from '@medical-crm/domain';
import type { Hospital } from '@medical-crm/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseHospitalSyncService implements IHospitalSyncService {
  constructor(
    private readonly mainSupabase: SupabaseClient,
    private readonly chinaSupabase: SupabaseClient,
  ) {}

  async syncToSupabase(hospital: Hospital): Promise<void> {
    if (hospital.type === 'COSMETIC') {
      await this.syncToMainSupabase(hospital);
    } else {
      await this.syncToChinaSupabase(hospital);
    }
  }

  private async syncToMainSupabase(hospital: Hospital): Promise<void> {
    const { error } = await this.mainSupabase.from('hospitals').upsert({
      id: hospital.id,
      name: hospital.nameEn ?? hospital.name,
      slug: hospital.name.toLowerCase().replace(/\s+/g, '-'),
      is_active: hospital.status === 'ACTIVE',
      crm_metadata: { specialties: hospital.specialties, hospitalType: hospital.type },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw new Error(`Main Supabase sync failed: ${error.message}`);
  }

  private async syncToChinaSupabase(hospital: Hospital): Promise<void> {
    const { error } = await this.chinaSupabase.from('hospitals').upsert({
      id: hospital.id,
      status: hospital.status.toLowerCase(),
      admin_email: hospital.email,
      is_active: hospital.status === 'ACTIVE',
    }, { onConflict: 'id' });
    if (error) throw new Error(`China Supabase sync failed: ${error.message}`);
  }
}
```

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): SupabaseHospitalSyncService + unit test"
```

---

### Task 44: Update DrizzlePatientRepository + Infrastructure Exports

**Files:**
- Modify: `packages/infrastructure/database/repositories/drizzle-patient.repository.ts` — add `preferredLanguage` to select
- Modify: `packages/infrastructure/database/repositories/index.ts` — add new repo exports

- [ ] **Step 1: Update DrizzlePatientRepository**

Add `preferredLanguage: users.preferredLanguage` to the select clause and return object.

- [ ] **Step 2: Update repository index.ts**

Add exports for all new repositories.

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `cd medical-crm-v2 && pnpm turbo test test:integration -- --run`
Expected: All PASS (may need to update existing test mocks for PatientBasicInfo)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(infra): update PatientRepository + export all Phase 2BC repos"
```

---

## Chunk 6: API Layer

### Task 45: Validation Schemas + Env Config

**Files:**
- Modify: `packages/shared/config/src/env.ts` — add INTERNAL_API_SECRET + KC Admin env vars
- Modify: `packages/shared/validation/src/hospital.schema.ts` — add update, status, registration schemas
- Modify: `packages/shared/validation/src/message.schema.ts` — expand message schemas
- Create: `packages/shared/validation/src/consultation.schema.ts`
- Create: `packages/shared/validation/src/conversation.schema.ts`
- Modify: `packages/shared/validation/src/index.ts` — add new exports

- [ ] **Step 0: Update env.ts with Phase 2BC env vars**

Add to `serverEnvSchema` in `packages/shared/config/src/env.ts`:

```typescript
  // Keycloak Admin API (hospital user registration)
  KEYCLOAK_BASE_URL: z.string().url(),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_ADMIN_USERNAME: z.string().min(1),
  KEYCLOAK_ADMIN_PASSWORD: z.string().min(1),
  // Internal worker auth
  INTERNAL_API_SECRET: z.string().min(32),
```

All code consuming these vars (KeycloakAdminService, internal route) MUST read from the validated `getEnv()` helper, never raw `process.env`.

Also update `packages/shared/config/src/__tests__/env.test.ts` to include the new env vars in test fixtures so the existing env validation tests don't break.

- [ ] **Step 1: Add hospital schemas**

```typescript
// Add to hospital.schema.ts
export const updateHospitalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameEn: z.string().max(200).optional(),
  address: z.string().optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  specialties: z.array(z.string()).optional(),
});

export const updateHospitalStatusSchema = z.object({
  status: hospitalStatusSchema,
});

export const generateRegistrationTokenSchema = z.object({
  email: z.string().email(),
});

export const registerHospitalUserSchema = z.object({
  token: z.string().min(1),
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
});
```

- [ ] **Step 2: Add conversation schemas**

```typescript
// conversation.schema.ts
import { z } from 'zod';

export const createConversationSchema = z.object({
  category: z.enum(['HOSPITAL', 'PATIENT', 'ADMIN_HOSPITAL', 'ADMIN_PATIENT', 'HOSPITAL_PATIENT']),
  caseId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().max(200).optional(),
});

export const conversationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  category: z.enum(['HOSPITAL', 'PATIENT', 'ADMIN_HOSPITAL', 'ADMIN_PATIENT', 'HOSPITAL_PATIENT']).optional(),
  caseId: z.string().uuid().optional(),
});
```

- [ ] **Step 3: Add/update message schemas**

```typescript
// Update message.schema.ts
export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000).transform(sanitizeRichText),
  messageType: z.enum(['TEXT', 'IMAGE', 'FILE', 'SYSTEM']).default('TEXT'),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileSize: z.number(),
    mimeType: z.string(),
    storageKey: z.string(),
  })).optional(),
});

export const updateMessageSchema = z.object({
  content: z.string().min(1).max(10000).transform(sanitizeRichText),
});

export const messageListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
```

- [ ] **Step 4: Add consultation schemas**

```typescript
// consultation.schema.ts
export const createConsultationSchema = z.object({
  caseId: z.string().uuid(),
  hospitalId: z.string().uuid(),
  patientId: z.string().uuid(),
  doctorId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().default(30),
  consultationLink: z.string().url().optional(),
  aiTranslation: z.boolean().default(false),
  patientLanguage: z.string().max(10).default('en'),
  notes: z.string().optional(),
});

export const updateConsultationSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  consultationLink: z.string().url().optional(),
  aiTranslation: z.boolean().optional(),
  patientLanguage: z.string().max(10).optional(),
  notes: z.string().optional(),
});

export const updateConsultationStatusSchema = z.object({
  action: z.enum(['start', 'complete', 'cancel', 'noShow']),
});

export const consultationListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});
```

- [ ] **Step 5: Update validation index.ts**

Export all new schemas.

- [ ] **Step 6: Run typecheck — expect PASS**
- [ ] **Step 7: Commit**

```bash
git commit -m "feat(validation): schemas for hospital, conversation, message, consultation"
```

---

### Task 46: Hospital Routes

**Files:**
- Create: `apps/api/src/routes/hospitals.routes.ts`
- Create: `apps/api/src/__tests__/hospitals.routes.test.ts`

- [ ] **Step 1: Write route tests**

Follow `cases.routes.test.ts` pattern. Test each of the 8 endpoints:
1. POST /api/v2/hospitals → 201
2. GET /api/v2/hospitals → 200 with pagination
3. GET /api/v2/hospitals/:id → 200
4. PUT /api/v2/hospitals/:id → 200
5. PATCH /api/v2/hospitals/:id/status → 200
6. GET /api/v2/hospitals/:id/cases → 200
7. POST /api/v2/hospitals/:id/registration-token → 201
8. POST /api/v2/auth/hospital/register → 201

- [ ] **Step 2: Implement routes**

Follow `cases.routes.ts` pattern: create Hono app, define routes with `createRoute()` + `app.openapi()`, get services from `getServices()`, call use case, return JSON.

**Note:** Route 8 (`/api/v2/auth/hospital/register`) is PUBLIC — no auth middleware. Handle this in app entry point (Task 50).

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): Hospital routes (8 endpoints)"
```

---

### Task 47: Conversation + Message Routes

**Files:**
- Create: `apps/api/src/routes/conversations.routes.ts`
- Create: `apps/api/src/routes/messages.routes.ts`
- Create: `apps/api/src/__tests__/conversations.routes.test.ts`
- Create: `apps/api/src/__tests__/messages.routes.test.ts`

- [ ] **Step 1: Write route tests**

Conversations (4 endpoints):
1. POST /api/v2/conversations → 201
2. GET /api/v2/conversations → 200
3. GET /api/v2/conversations/:id → 200
4. PUT /api/v2/conversations/:id → 200

Messages (10 endpoints):
5. GET /api/v2/conversations/:id/messages → 200
6. POST /api/v2/conversations/:id/messages → 201
7. GET /api/v2/conversations/:id/messages/:msgId → 200
8. PUT /api/v2/conversations/:id/messages/:msgId → 200
9. DELETE /api/v2/conversations/:id/messages/:msgId → 204
10. POST /api/v2/conversations/:id/messages/:msgId/regenerate-summary → 200
11. POST /api/v2/conversations/:id/messages/:msgId/retranslate → 200
12. GET /api/v2/messages/pending-review → 200
13. POST /api/v2/messages/:msgId/approve → 200
14. POST /api/v2/messages/:msgId/reject → 200

- [ ] **Step 2: Implement routes**

Split into two files for maintainability:
- `conversations.routes.ts`: conversation CRUD (4 endpoints)
- `messages.routes.ts`: message operations + moderation (10 endpoints, including those nested under conversations)

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): Conversation + Message routes (14 endpoints)"
```

---

### Task 48: Internal Worker Route

**Files:**
- Create: `apps/api/src/routes/internal.routes.ts`
- Create: `apps/api/src/__tests__/internal.routes.test.ts`

- [ ] **Step 1: Write route tests**

- POST /api/v2/internal/process-message-tasks with valid X-Internal-Secret → 200
- POST without header → 401
- POST with wrong header → 401

- [ ] **Step 2: Implement**

```typescript
const app = new OpenAPIHono();

const processTasksRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/process-message-tasks',
  responses: { 200: { description: 'Tasks processed' } },
});

app.openapi(processTasksRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  const { INTERNAL_API_SECRET } = getEnv(); // from @medical-crm/config validated env
  if (!INTERNAL_API_SECRET || secret !== INTERNAL_API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const svc = getServices();
  const result = await svc.processMessageTasks.execute();
  return c.json(result, 200);
});
```

- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): Internal worker route for ProcessMessageTasks"
```

---

### Task 49: Consultation Routes

**Files:**
- Create: `apps/api/src/routes/consultations.routes.ts`
- Create: `apps/api/src/__tests__/consultations.routes.test.ts`

- [ ] **Step 1: Write route tests**

8 endpoints:
1. POST /api/v2/consultations → 201
2. GET /api/v2/consultations → 200 (cursor pagination)
3. GET /api/v2/consultations/stats → 200
4. GET /api/v2/consultations/:id → 200
5. PUT /api/v2/consultations/:id → 200
6. PATCH /api/v2/consultations/:id/status → 200
7. GET /api/v2/consultations/:id/transcript → 200
8. GET /api/v2/cases/:caseId/consultations → 200

**Note:** Route 3 must be registered BEFORE route 4 (same pattern as `cases/stats` vs `cases/:id`).

- [ ] **Step 2: Implement routes**
- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): Consultation routes (8 endpoints)"
```

---

### Task 50: Composition Root + App Entry Point

**Files:**
- Modify: `apps/api/src/composition-root.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/__tests__/composition-root.test.ts`

- [ ] **Step 1: Update composition root**

Add all new repositories, services, and use cases to `AppServices` interface and `getServices()`:

```typescript
// Add to AppServices interface:
hospitalManagementRepo: IHospitalManagementRepository;
registrationTokenRepo: IRegistrationTokenRepository;
hospitalSyncService: IHospitalSyncService;
keycloakAdmin: IKeycloakAdminService;
userRepo: IUserRepository;
conversationRepo: IConversationRepository;
messageRepo: IMessageRepository;
messageTaskQueue: IMessageTaskQueue;
translationService: ITranslationService;
consultationRepo: IConsultationRepository;
transcriptRepo: IConsultationTranscriptRepository;

// All 31 use cases...
createHospital: CreateHospitalUseCase;
listHospitals: ListHospitalsUseCase;
// ... etc
```

Wire everything in `getServices()`.

- [ ] **Step 2: Update routes/index.ts**

```typescript
import hospitalRoutes from './hospitals.routes.js';
import conversationRoutes from './conversations.routes.js';
import messageRoutes from './messages.routes.js';
import consultationRoutes from './consultations.routes.js';
import internalRoutes from './internal.routes.js';

router.route('/', hospitalRoutes);
router.route('/', conversationRoutes);
router.route('/', messageRoutes);
router.route('/', consultationRoutes);
router.route('/', internalRoutes);
```

- [ ] **Step 3: Update app entry point**

Keep the existing wildcard auth middleware pattern. Mount public and internal routes BEFORE the auth middleware so they are handled without Keycloak auth:

```typescript
// --- Routes that skip Keycloak auth (mounted BEFORE auth middleware) ---

// Public: hospital user self-registration (no auth required)
app.post('/api/v2/auth/hospital/register', async (c) => {
  const svc = getServices();
  const body = await c.req.json();
  const result = await svc.registerHospitalUser.execute(body);
  return c.json(result, 201);
});

// Internal: worker endpoint (X-Internal-Secret header auth, not Keycloak)
app.route('/api/v2/internal', internalRoutes);

// --- Auth middleware for everything else under /api/v2/* ---
app.use('/api/v2/*', authMiddleware, perUserRateLimiter);

// --- Authenticated routes ---
app.route('/', apiRoutes); // mounts hospitals, conversations, messages, consultations, cases
```

This preserves the existing wildcard safety — any new `/api/v2/*` route automatically gets auth unless explicitly mounted before the middleware.

- [ ] **Step 4: Update composition-root test**

Verify all new services are instantiated.

- [ ] **Step 5: Run full test suite**

Run: `cd medical-crm-v2 && pnpm turbo typecheck test -- --run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(api): composition root + route mounting + auth config for Phase 2BC"
```

---

### Task 51: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `cd medical-crm-v2 && pnpm turbo typecheck`
Expected: All packages pass

- [ ] **Step 2: Run all unit tests**

Run: `cd medical-crm-v2 && pnpm turbo test -- --run`
Expected: All tests pass

- [ ] **Step 3: Run integration tests**

Run: `cd medical-crm-v2 && pnpm turbo test:integration`
Expected: All integration tests pass

- [ ] **Step 4: Verify endpoint count**

Count all registered routes. Expected: 31 endpoints (8 hospital + 14 conversation/message + 1 internal worker + 8 consultation).

- [ ] **Step 5: Commit any remaining fixes**

```bash
git commit -m "chore: Phase 2BC final verification — all tests passing"
```
