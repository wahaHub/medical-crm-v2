# Dify AI Chatbot Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Dify (self-hosted) as an AI customer service chatbot with CRM v2, using existing FAQ/Package data as RAG knowledge base, with full conversation sync and human escalation.

**Architecture:** CRM v2 API acts as a proxy layer between patient-facing frontends and Dify. DifySyncService keeps knowledge base in sync. All conversations stored in CRM database regardless of escalation. Shared DifyChatWidget React component for both patient sites.

**Tech Stack:** Hono API, Drizzle ORM, PostgreSQL, Dify Dataset/Chat API, Zod validation, Vitest, React + TypeScript

**Spec:** `docs/superpowers/specs/2026-03-20-dify-ai-chatbot-design.md`

---

## Chunk 1: Database & Domain Foundation

### Task 1: Database Migration

**Files:**
- Create: `packages/infrastructure/database/migrations/024_dify_integration.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Dify AI Chatbot Integration

-- 1. Add AI_ESCALATION to TicketType enum
ALTER TYPE "TicketType" ADD VALUE IF NOT EXISTS 'AI_ESCALATION';

-- 2. Add AI_CHATBOT to conversation_category enum
ALTER TYPE "conversation_category" ADD VALUE IF NOT EXISTS 'AI_CHATBOT';

-- 3. Create dify_conversation_mappings table
CREATE TABLE dify_conversation_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dify_conversation_id VARCHAR(255) NOT NULL UNIQUE,
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id),
  user_id UUID REFERENCES users(id),
  session_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ESCALATED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dify_conv_session ON dify_conversation_mappings(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_dify_conv_user ON dify_conversation_mappings(user_id) WHERE user_id IS NOT NULL;

-- 4. Create dify_document_mappings table
CREATE TABLE dify_document_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  dify_dataset_id VARCHAR(255) NOT NULL,
  dify_document_id VARCHAR(255) NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);

-- 5. Insert system bot user for AI messages
INSERT INTO users (id, role, email, first_name, last_name)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'SYSTEM',
  'system-bot@medora.internal',
  'AI',
  'Assistant'
) ON CONFLICT (id) DO NOTHING;
```

Note: Check the exact enum type names in the existing schema. The conversation category enum might be named differently (e.g., `conversation_category` vs `ConversationCategory`). Verify by running:
```bash
cd packages/infrastructure/database && grep -r "conversation_category\|ConversationCategory" schema/
```

- [ ] **Step 2: Update Drizzle schema to include new tables**

Add to `packages/infrastructure/database/schema/schema.ts` (or a new schema file if the project splits schemas):

```typescript
// In the schema file, add after existing table definitions:

export const difyConversationMappings = pgTable('dify_conversation_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  difyConversationId: varchar('dify_conversation_id', { length: 255 }).notNull().unique(),
  conversationId: uuid('conversation_id').notNull().unique().references(() => conversations.id),
  userId: uuid('user_id').references(() => users.id),
  sessionId: varchar('session_id', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const difyDocumentMappings = pgTable('dify_document_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: varchar('entity_id', { length: 255 }).notNull(),
  difyDatasetId: varchar('dify_dataset_id', { length: 255 }).notNull(),
  difyDocumentId: varchar('dify_document_id', { length: 255 }).notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  entityUnique: unique().on(table.entityType, table.entityId),
}));
```

- [ ] **Step 3: Commit**

```bash
git add packages/infrastructure/database/migrations/024_dify_integration.sql packages/infrastructure/database/schema/
git commit -m "feat(db): add dify integration migration — conversation/document mappings, enum extensions"
```

---

### Task 2: Domain Enums & Constants

**Files:**
- Modify: `packages/domain/src/enums/index.ts`
- Create: `packages/domain/src/constants/dify.ts`

- [ ] **Step 1: Add new enum values**

In `packages/domain/src/enums/index.ts`, add:

```typescript
// After existing TicketType definition, update it:
export type TicketType = 'ACCOUNT_ISSUES' | 'PAYMENT_PROBLEMS' | 'HOSPITAL_COMMUNICATION' | 'DOCUMENT_HELP' | 'VISA_TRAVEL' | 'GENERAL_QUESTIONS' | 'FEEDBACK' | 'AI_ESCALATION';

// Find ConversationCategory (or equivalent) and add AI_CHATBOT:
// e.g.: export type ConversationCategory = 'HOSPITAL' | 'PATIENT' | 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT' | 'AI_CHATBOT';

// Add new types:
export type DifyConversationStatus = 'ACTIVE' | 'ESCALATED' | 'CLOSED';
export type DifyDocumentEntityType = 'FAQ_CATEGORY' | 'PACKAGE_TYPE';
```

- [ ] **Step 2: Add Dify constants**

```typescript
// packages/domain/src/constants/dify.ts
export const SYSTEM_BOT_USER_ID = '00000000-0000-0000-0000-000000000001';
```

- [ ] **Step 3: Export from domain index**

Ensure the new types and constants are exported from `packages/domain/src/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/
git commit -m "feat(domain): add Dify-related enums and constants"
```

---

### Task 3: Domain Port — IDifyConversationMappingRepository

**Files:**
- Create: `packages/domain/src/ports/dify-conversation-mapping-repository.port.ts`
- Create: `packages/domain/src/ports/dify-document-mapping-repository.port.ts`

- [ ] **Step 1: Define conversation mapping port**

```typescript
// packages/domain/src/ports/dify-conversation-mapping-repository.port.ts
import type { DifyConversationStatus } from '../enums/index.js';

export interface DifyConversationMapping {
  id: string;
  difyConversationId: string;
  conversationId: string;
  userId: string | null;
  sessionId: string | null;
  status: DifyConversationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDifyConversationMappingRepository {
  findByDifyConversationId(difyConversationId: string): Promise<DifyConversationMapping | null>;
  findBySessionId(sessionId: string): Promise<DifyConversationMapping[]>;
  save(mapping: DifyConversationMapping): Promise<DifyConversationMapping>;
  updateStatus(difyConversationId: string, status: DifyConversationStatus): Promise<void>;
}
```

- [ ] **Step 2: Define document mapping port**

```typescript
// packages/domain/src/ports/dify-document-mapping-repository.port.ts
import type { DifyDocumentEntityType } from '../enums/index.js';

export interface DifyDocumentMapping {
  id: string;
  entityType: DifyDocumentEntityType;
  entityId: string;
  difyDatasetId: string;
  difyDocumentId: string;
  lastSyncedAt: Date;
  createdAt: Date;
}

export interface IDifyDocumentMappingRepository {
  findByEntity(entityType: DifyDocumentEntityType, entityId: string): Promise<DifyDocumentMapping | null>;
  save(mapping: DifyDocumentMapping): Promise<DifyDocumentMapping>;
  deleteByEntity(entityType: DifyDocumentEntityType, entityId: string): Promise<void>;
  findAll(): Promise<DifyDocumentMapping[]>;
}
```

- [ ] **Step 3: Export from domain index**

Add exports to `packages/domain/src/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/
git commit -m "feat(domain): add Dify mapping repository ports"
```

---

### Task 4: Domain Port — IDifySyncService

**Files:**
- Create: `packages/domain/src/ports/dify-sync-service.port.ts`

- [ ] **Step 1: Define sync service port**

```typescript
// packages/domain/src/ports/dify-sync-service.port.ts
import type { PackageType } from '../enums/index.js';

export interface IDifySyncService {
  syncFaqCategory(categoryName: string, hospitalType: 'COSMETIC' | 'REGULAR'): Promise<void>;
  deleteFaqCategoryDocument(categoryName: string, hospitalType: 'COSMETIC' | 'REGULAR'): Promise<void>;
  syncPackageType(type: PackageType): Promise<void>;
  fullSync(): Promise<void>;
}
```

- [ ] **Step 2: Export from domain index**

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/
git commit -m "feat(domain): add IDifySyncService port"
```

---

### Task 5: Infrastructure — Dify Mapping Repositories

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-dify-conversation-mapping.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-dify-document-mapping.repository.ts`
- Create: `packages/infrastructure/__tests__/drizzle-dify-conversation-mapping.repository.test.ts`
- Create: `packages/infrastructure/__tests__/drizzle-dify-document-mapping.repository.test.ts`

- [ ] **Step 1: Write failing test for conversation mapping repository**

Follow the existing test pattern (mock Drizzle db). Test `findByDifyConversationId`, `save`, `updateStatus`.

```typescript
// packages/infrastructure/__tests__/drizzle-dify-conversation-mapping.repository.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrizzleDifyConversationMappingRepository } from '../drizzle-dify-conversation-mapping.repository.js';

describe('DrizzleDifyConversationMappingRepository', () => {
  // Mock db and test findByDifyConversationId, save, updateStatus
  // Follow existing repository test patterns
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/infrastructure && pnpm vitest run __tests__/drizzle-dify-conversation-mapping.repository.test.ts
```

- [ ] **Step 3: Implement conversation mapping repository**

```typescript
// drizzle-dify-conversation-mapping.repository.ts
import { eq } from 'drizzle-orm';
import type { IDifyConversationMappingRepository, DifyConversationMapping } from '@medical-crm/domain';
import type { DifyConversationStatus } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { difyConversationMappings } from '../schema/index.js';

export class DrizzleDifyConversationMappingRepository implements IDifyConversationMappingRepository {
  constructor(private readonly db: CrmDb) {}

  async findByDifyConversationId(difyConversationId: string): Promise<DifyConversationMapping | null> {
    const rows = await this.db
      .select()
      .from(difyConversationMappings)
      .where(eq(difyConversationMappings.difyConversationId, difyConversationId))
      .limit(1);
    if (rows.length === 0) return null;
    return this.toMapping(rows[0]!);
  }

  async findBySessionId(sessionId: string): Promise<DifyConversationMapping[]> {
    const rows = await this.db
      .select()
      .from(difyConversationMappings)
      .where(eq(difyConversationMappings.sessionId, sessionId));
    return rows.map((r) => this.toMapping(r));
  }

  async save(mapping: DifyConversationMapping): Promise<DifyConversationMapping> {
    const rows = await this.db
      .insert(difyConversationMappings)
      .values({
        id: mapping.id,
        difyConversationId: mapping.difyConversationId,
        conversationId: mapping.conversationId,
        userId: mapping.userId,
        sessionId: mapping.sessionId,
        status: mapping.status,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString(),
      })
      .onConflictDoUpdate({
        target: difyConversationMappings.difyConversationId,
        set: {
          status: mapping.status,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();
    return this.toMapping(rows[0]!);
  }

  async updateStatus(difyConversationId: string, status: DifyConversationStatus): Promise<void> {
    await this.db
      .update(difyConversationMappings)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(difyConversationMappings.difyConversationId, difyConversationId));
  }

  private toMapping(row: typeof difyConversationMappings.$inferSelect): DifyConversationMapping {
    return {
      id: row.id,
      difyConversationId: row.difyConversationId,
      conversationId: row.conversationId,
      userId: row.userId ?? null,
      sessionId: row.sessionId ?? null,
      status: row.status as DifyConversationStatus,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Repeat for document mapping repository** (same pattern)

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/database/repositories/
git commit -m "feat(infra): add Dify conversation and document mapping repositories"
```

---

## Chunk 2: Dify API Client & Sync Service

### Task 6: Infrastructure — Dify API Client

**Files:**
- Create: `packages/infrastructure/dify/dify-api-client.ts`
- Create: `packages/infrastructure/dify/types.ts`
- Create: `packages/infrastructure/dify/__tests__/dify-api-client.test.ts`

This is a thin HTTP wrapper around Dify's REST API.

- [ ] **Step 1: Define Dify API types**

```typescript
// packages/infrastructure/dify/types.ts
export interface DifyChatRequest {
  query: string;
  inputs?: Record<string, string>;
  response_mode: 'streaming' | 'blocking';
  conversation_id?: string;
  user: string;
}

export interface DifyChatChunk {
  event: 'message' | 'message_end' | 'error';
  conversation_id?: string;
  message_id?: string;
  answer?: string;
  metadata?: Record<string, unknown>;
}

export interface DifyDatasetDocumentRequest {
  name: string;
  text: string;
  indexing_technique?: 'high_quality' | 'economy';
  process_rule?: {
    mode: 'automatic' | 'custom';
    rules?: {
      pre_processing_rules?: Array<{ id: string; enabled: boolean }>;
      segmentation?: { separator: string; max_tokens: number };
    };
  };
}

export interface DifyDocumentResponse {
  document: {
    id: string;
    name: string;
    position: number;
  };
}

export interface DifyConfig {
  apiBaseUrl: string;
  apiKey: string;
  faqDatasetId: string;
  packageDatasetId: string;
}
```

- [ ] **Step 2: Write failing test for DifyApiClient**

```typescript
// packages/infrastructure/dify/__tests__/dify-api-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DifyApiClient } from '../dify-api-client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('DifyApiClient', () => {
  const config = {
    apiBaseUrl: 'https://ai.test.com/v1',
    apiKey: 'app-test-key',
    faqDatasetId: 'ds-faq',
    packageDatasetId: 'ds-pkg',
  };
  let client: DifyApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DifyApiClient(config);
  });

  describe('createDocument', () => {
    it('creates a document in the specified dataset', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ document: { id: 'doc-1', name: 'test', position: 1 } }),
      });

      const result = await client.createDocument('ds-faq', { name: 'test', text: '# FAQ' });
      expect(result.document.id).toBe('doc-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ai.test.com/v1/datasets/ds-faq/documents/create-by-text',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer app-test-key',
          }),
        }),
      );
    });
  });

  describe('updateDocument', () => {
    it('updates an existing document', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ document: { id: 'doc-1', name: 'test', position: 1 } }),
      });

      await client.updateDocument('ds-faq', 'doc-1', { name: 'test', text: '# Updated' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ai.test.com/v1/datasets/ds-faq/documents/doc-1/update-by-text',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('deleteDocument', () => {
    it('deletes a document', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ result: 'success' }) });

      await client.deleteDocument('ds-faq', 'doc-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ai.test.com/v1/datasets/ds-faq/documents/doc-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('chat', () => {
    it('sends chat message in streaming mode', async () => {
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"event":"message","answer":"Hi"}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"event":"message_end","conversation_id":"conv-1"}\n\n'));
          controller.close();
        },
      });
      mockFetch.mockResolvedValue({ ok: true, body: mockBody });

      const stream = await client.chatStream({
        query: 'hello',
        response_mode: 'streaming',
        user: 'user-1',
      });

      expect(stream).toBeDefined();
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/infrastructure && pnpm vitest run dify/__tests__/dify-api-client.test.ts
```

- [ ] **Step 4: Implement DifyApiClient**

```typescript
// packages/infrastructure/dify/dify-api-client.ts
import type {
  DifyConfig,
  DifyChatRequest,
  DifyDatasetDocumentRequest,
  DifyDocumentResponse,
} from './types.js';

export class DifyApiClient {
  constructor(private readonly config: DifyConfig) {}

  async createDocument(
    datasetId: string,
    doc: DifyDatasetDocumentRequest,
  ): Promise<DifyDocumentResponse> {
    const res = await this.request(
      `datasets/${datasetId}/documents/create-by-text`,
      'POST',
      {
        name: doc.name,
        text: doc.text,
        indexing_technique: doc.indexing_technique ?? 'high_quality',
        process_rule: doc.process_rule ?? { mode: 'automatic' },
      },
    );
    return res as DifyDocumentResponse;
  }

  async updateDocument(
    datasetId: string,
    documentId: string,
    doc: DifyDatasetDocumentRequest,
  ): Promise<DifyDocumentResponse> {
    const res = await this.request(
      `datasets/${datasetId}/documents/${documentId}/update-by-text`,
      'POST',
      {
        name: doc.name,
        text: doc.text,
        process_rule: doc.process_rule ?? { mode: 'automatic' },
      },
    );
    return res as DifyDocumentResponse;
  }

  async deleteDocument(datasetId: string, documentId: string): Promise<void> {
    await this.request(`datasets/${datasetId}/documents/${documentId}`, 'DELETE');
  }

  async chatStream(request: DifyChatRequest): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(`${this.config.apiBaseUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, response_mode: 'streaming' }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Dify chat error ${res.status}: ${err}`);
    }

    if (!res.body) throw new Error('No response body from Dify');
    return res.body;
  }

  private async request(path: string, method: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.config.apiBaseUrl}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Dify API error ${res.status}: ${err}`);
    }

    return res.json();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/dify/
git commit -m "feat(infra): add Dify API client with chat streaming and dataset operations"
```

---

### Task 7: Infrastructure — DifySyncService

**Files:**
- Create: `packages/infrastructure/dify/dify-sync-service.ts`
- Create: `packages/infrastructure/dify/__tests__/dify-sync-service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/infrastructure/dify/__tests__/dify-sync-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DifySyncService } from '../dify-sync-service.js';

describe('DifySyncService', () => {
  const mockDifyClient = {
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  };
  const mockFaqRepo = {
    findByCategory: vi.fn(),
    findAll: vi.fn(),
  };
  const mockPackageRepo = {
    findByType: vi.fn(),
    findAll: vi.fn(),
  };
  const mockDocMappingRepo = {
    findByEntity: vi.fn(),
    save: vi.fn(),
    deleteByEntity: vi.fn(),
    findAll: vi.fn(),
  };

  let service: DifySyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DifySyncService(
      mockDifyClient as any,
      mockFaqRepo as any,
      mockPackageRepo as any,
      mockDocMappingRepo as any,
      { faqDatasetId: 'ds-faq', packageDatasetId: 'ds-pkg' },
    );
  });

  describe('syncFaqCategory', () => {
    it('creates new document when no mapping exists', async () => {
      mockFaqRepo.findByCategory.mockResolvedValue([
        { category: 'General', question: 'What is Medora?', answer: 'A health platform', keywords: ['medora'], hospitalType: 'COSMETIC' },
      ]);
      mockDocMappingRepo.findByEntity.mockResolvedValue(null);
      mockDifyClient.createDocument.mockResolvedValue({ document: { id: 'doc-new' } });
      mockDocMappingRepo.save.mockResolvedValue({});

      await service.syncFaqCategory('General', 'COSMETIC');

      expect(mockDifyClient.createDocument).toHaveBeenCalledWith(
        'ds-faq',
        expect.objectContaining({ name: 'FAQ-COSMETIC-General' }),
      );
      expect(mockDocMappingRepo.save).toHaveBeenCalled();
    });

    it('updates existing document when mapping exists', async () => {
      mockFaqRepo.findByCategory.mockResolvedValue([
        { category: 'General', question: 'Q1', answer: 'A1', keywords: [], hospitalType: 'COSMETIC' },
      ]);
      mockDocMappingRepo.findByEntity.mockResolvedValue({
        difyDocumentId: 'doc-existing',
        difyDatasetId: 'ds-faq',
      });
      mockDifyClient.updateDocument.mockResolvedValue({ document: { id: 'doc-existing' } });

      await service.syncFaqCategory('General', 'COSMETIC');

      expect(mockDifyClient.updateDocument).toHaveBeenCalledWith(
        'ds-faq',
        'doc-existing',
        expect.objectContaining({ name: 'FAQ-COSMETIC-General' }),
      );
    });
  });

  describe('syncPackageType', () => {
    it('creates document for published packages of a type', async () => {
      mockPackageRepo.findByType.mockResolvedValue([
        { nameEn: 'Basic Consult', nameZh: '基础咨询', type: 'CONSULTATION', price: '100', currency: 'USD', descriptionEn: 'desc', inclusions: ['item1'], status: 'PUBLISHED' },
      ]);
      mockDocMappingRepo.findByEntity.mockResolvedValue(null);
      mockDifyClient.createDocument.mockResolvedValue({ document: { id: 'doc-pkg' } });
      mockDocMappingRepo.save.mockResolvedValue({});

      await service.syncPackageType('CONSULTATION');

      expect(mockDifyClient.createDocument).toHaveBeenCalledWith(
        'ds-pkg',
        expect.objectContaining({ name: 'PKG-CONSULTATION' }),
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement DifySyncService**

```typescript
// packages/infrastructure/dify/dify-sync-service.ts
import type { IDifySyncService } from '@medical-crm/domain';
import type { IChatbotFaqRepository, IPackageRepository, IDifyDocumentMappingRepository } from '@medical-crm/domain';
import type { PackageType } from '@medical-crm/domain';
import type { DifyApiClient } from './dify-api-client.js';
import { generateId } from '@medical-crm/utils';

interface SyncConfig {
  faqDatasetId: string;
  packageDatasetId: string;
}

export class DifySyncService implements IDifySyncService {
  constructor(
    private readonly difyClient: DifyApiClient,
    private readonly faqRepo: IChatbotFaqRepository,
    private readonly packageRepo: IPackageRepository,
    private readonly docMappingRepo: IDifyDocumentMappingRepository,
    private readonly config: SyncConfig,
  ) {}

  async syncFaqCategory(categoryName: string, hospitalType: 'COSMETIC' | 'REGULAR'): Promise<void> {
    const faqs = await this.faqRepo.findByCategory(categoryName, hospitalType);
    const docName = `FAQ-${hospitalType}-${categoryName}`;
    const entityKey = `${hospitalType}::${categoryName}`;
    const markdown = this.faqsToMarkdown(categoryName, hospitalType, faqs);

    await this.upsertDocument(this.config.faqDatasetId, 'FAQ_CATEGORY', entityKey, docName, markdown);
  }

  async deleteFaqCategoryDocument(categoryName: string, hospitalType: 'COSMETIC' | 'REGULAR'): Promise<void> {
    const entityKey = `${hospitalType}::${categoryName}`;
    const mapping = await this.docMappingRepo.findByEntity('FAQ_CATEGORY', entityKey);
    if (!mapping) return;

    await this.difyClient.deleteDocument(mapping.difyDatasetId, mapping.difyDocumentId);
    await this.docMappingRepo.deleteByEntity('FAQ_CATEGORY', entityKey);
  }

  async syncPackageType(type: PackageType): Promise<void> {
    const packages = await this.packageRepo.findByType(type);
    const published = packages.filter((p) => p.status === 'PUBLISHED');
    const docName = `PKG-${type}`;
    const markdown = this.packagesToMarkdown(type, published);

    await this.upsertDocument(this.config.packageDatasetId, 'PACKAGE_TYPE', type, docName, markdown);
  }

  async fullSync(): Promise<void> {
    // Sync all FAQ categories
    const allFaqs = await this.faqRepo.findAll({ page: 1, limit: 10000, isActive: true });
    const categoryMap = new Map<string, { categoryName: string; hospitalType: 'COSMETIC' | 'REGULAR' }>();

    for (const faq of allFaqs.data) {
      const key = `${faq.hospitalType}::${faq.category}`;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { categoryName: faq.category, hospitalType: faq.hospitalType as 'COSMETIC' | 'REGULAR' });
      }
    }

    for (const { categoryName, hospitalType } of categoryMap.values()) {
      await this.syncFaqCategory(categoryName, hospitalType);
    }

    // Sync all package types — query distinct types from DB to avoid hardcoding
    const allPackages = await this.packageRepo.findAll({ page: 1, limit: 10000, status: 'PUBLISHED' });
    const packageTypes = new Set(allPackages.data.map((p) => p.type));
    for (const type of packageTypes) {
      await this.syncPackageType(type as PackageType);
    }
  }

  private async upsertDocument(
    datasetId: string,
    entityType: 'FAQ_CATEGORY' | 'PACKAGE_TYPE',
    entityId: string,
    docName: string,
    markdown: string,
  ): Promise<void> {
    const existing = await this.docMappingRepo.findByEntity(entityType, entityId);

    if (existing) {
      await this.difyClient.updateDocument(datasetId, existing.difyDocumentId, {
        name: docName,
        text: markdown,
      });
      await this.docMappingRepo.save({
        ...existing,
        lastSyncedAt: new Date(),
      });
    } else {
      const result = await this.difyClient.createDocument(datasetId, {
        name: docName,
        text: markdown,
      });
      await this.docMappingRepo.save({
        id: generateId(),
        entityType,
        entityId,
        difyDatasetId: datasetId,
        difyDocumentId: result.document.id,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
      });
    }
  }

  private faqsToMarkdown(
    categoryName: string,
    hospitalType: string,
    faqs: Array<{ question: string; answer: string; keywords: string[] }>,
  ): string {
    const lines: string[] = [
      `# ${categoryName}`,
      '',
      `Hospital Type: ${hospitalType}`,
      '',
      '---',
    ];

    for (const faq of faqs) {
      lines.push('', `## Q: ${faq.question}`, `**A:** ${faq.answer}`);
      if (faq.keywords.length > 0) {
        lines.push(`**Keywords:** ${faq.keywords.join(', ')}`);
      }
      lines.push('', '---');
    }

    return lines.join('\n');
  }

  private packagesToMarkdown(
    type: string,
    packages: Array<{
      nameEn: string;
      nameZh: string | null;
      price: string;
      currency: string;
      descriptionEn: string | null;
      descriptionZh: string | null;
      inclusions: unknown;
    }>,
  ): string {
    const lines: string[] = [`# ${type} Packages`, '', '---'];

    for (const pkg of packages) {
      const name = pkg.nameZh ? `${pkg.nameEn} / ${pkg.nameZh}` : pkg.nameEn;
      lines.push('', `## ${name}`, '', `**Price:** ${pkg.price} ${pkg.currency}`);
      if (pkg.descriptionEn) lines.push('', '### Description', pkg.descriptionEn);
      if (pkg.descriptionZh) lines.push(pkg.descriptionZh);
      if (Array.isArray(pkg.inclusions) && pkg.inclusions.length > 0) {
        lines.push('', "### What's Included");
        for (const item of pkg.inclusions) {
          lines.push(`- ${String(item)}`);
        }
      }
      lines.push('', '---');
    }

    return lines.join('\n');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/dify/
git commit -m "feat(infra): add DifySyncService with FAQ/Package markdown generation"
```

---

### Task 8: Inject Sync Hooks into FAQ Use Cases

**Files:**
- Modify: `packages/application/src/use-cases/chatbot-faq/create-faq-item.use-case.ts`
- Modify: `packages/application/src/use-cases/chatbot-faq/update-faq-item.use-case.ts` (find exact name)
- Modify: `packages/application/src/use-cases/chatbot-faq/delete-faq-item.use-case.ts` (find exact name)
- Modify: `apps/api/src/composition-root.ts`

Note: Before modifying, read each use case file to confirm the exact class name and structure. The sync service is **optional** — if not provided, sync is skipped (allows existing tests to pass unchanged).

- [ ] **Step 1: Add optional IDifySyncService to CreateFaqItemUseCase**

After the `faqRepo.save()` call, add:

```typescript
// In constructor: add second param
constructor(
  private readonly faqRepo: IChatbotFaqRepository,
  private readonly difySyncService?: IDifySyncService,
) {}

// After save, before return:
if (this.difySyncService) {
  this.difySyncService.syncFaqCategory(saved.category, saved.hospitalType as 'COSMETIC' | 'REGULAR').catch((err) => {
    console.error('[DifySync] Failed to sync FAQ category:', err);
  });
}
```

- [ ] **Step 2: Apply same pattern to UpdateFaqItemUseCase and DeleteFaqItemUseCase**

For delete: use `syncFaqCategory` (regenerate the category doc without the deleted item).

- [ ] **Step 3: Update composition-root.ts**

Wire `DifySyncService` into FAQ use cases:

```typescript
const difySyncService = new DifySyncService(difyClient, faqRepo, packageRepo, docMappingRepo, {
  faqDatasetId: env.DIFY_FAQ_DATASET_ID,
  packageDatasetId: env.DIFY_PACKAGE_DATASET_ID,
});

// Update FAQ use case instantiation:
createFaqItem: new CreateFaqItemUseCase(faqRepo, difySyncService),
updateFaqItem: new UpdateFaqItemUseCase(faqRepo, difySyncService),
deleteFaqItem: new DeleteFaqItemUseCase(faqRepo, difySyncService),
```

- [ ] **Step 4: Run existing FAQ tests to ensure they still pass**

```bash
cd apps/api && pnpm vitest run src/__tests__/chatbot-faq
```

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/chatbot-faq/ apps/api/src/composition-root.ts
git commit -m "feat(app): inject DifySyncService into FAQ use cases for real-time sync"
```

---

### Task 9: Inject Sync Hooks into Package Use Cases

**Files:**
- Modify: `packages/application/src/use-cases/packages/create-package.use-case.ts`
- Modify: `packages/application/src/use-cases/packages/update-package.use-case.ts`
- Modify: `packages/application/src/use-cases/packages/publish-package.use-case.ts`
- Modify: `packages/application/src/use-cases/packages/unpublish-package.use-case.ts`
- Modify: `packages/application/src/use-cases/packages/delete-package.use-case.ts`
- Modify: `apps/api/src/composition-root.ts`

Same pattern as Task 8: optional `IDifySyncService`, fire-and-forget after save.

- [ ] **Step 1: Add sync hooks to each Package use case**

After `packageRepo.save()`, add:

```typescript
if (this.difySyncService) {
  this.difySyncService.syncPackageType(saved.type).catch((err) => {
    console.error('[DifySync] Failed to sync package type:', err);
  });
}
```

- [ ] **Step 2: Update composition-root.ts for Package use cases**

- [ ] **Step 3: Run existing Package tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/packages
```

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/packages/ apps/api/src/composition-root.ts
git commit -m "feat(app): inject DifySyncService into Package use cases for real-time sync"
```

---

## Chunk 3: Chatbot API Endpoints

### Task 10: Validation Schemas for Chatbot

**Files:**
- Create: `packages/shared/validation/src/chatbot.schema.ts`
- Modify: `packages/shared/validation/src/index.ts` (add export)

- [ ] **Step 1: Write chatbot validation schemas**

```typescript
// packages/shared/validation/src/chatbot.schema.ts
import { z } from 'zod';

export const chatbotChatSchema = z.object({
  message: z.string().min(1).max(2000),
  difyConversationId: z.string().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  sessionId: z.string().min(1).max(255),
  hospitalType: z.enum(['COSMETIC', 'REGULAR']),
});

export const chatbotEscalateSchema = z.object({
  difyConversationId: z.string().min(1),
  reason: z.string().min(1).max(1000),
  contactInfo: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(255),
    phone: z.string().max(50).optional(),
  }),
});

export const chatbotHistoryParamSchema = z.object({
  difyConversationId: z.string().min(1),
});

export type ChatbotChatInput = z.infer<typeof chatbotChatSchema>;
export type ChatbotEscalateInput = z.infer<typeof chatbotEscalateSchema>;
```

- [ ] **Step 2: Export from validation index**

- [ ] **Step 3: Commit**

```bash
git add packages/shared/validation/src/
git commit -m "feat(validation): add chatbot chat/escalate/history schemas"
```

---

### Task 11: Chatbot Use Cases

**Files:**
- Create: `packages/application/src/use-cases/chatbot/chatbot-chat.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot/chatbot-escalate.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot/chatbot-history.use-case.ts`
- Create: `packages/application/src/dtos/chatbot.dto.ts`
- Create: `packages/application/__tests__/chatbot-use-cases.test.ts`

- [ ] **Step 1: Define chatbot DTOs**

```typescript
// packages/application/src/dtos/chatbot.dto.ts
export interface ChatbotMessageDTO {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatbotHistoryDTO {
  difyConversationId: string;
  messages: ChatbotMessageDTO[];
}

export interface ChatbotEscalateResultDTO {
  ticketNumber: string;
  message: string;
}
```

- [ ] **Step 2: Write failing test for ChatbotChatUseCase**

Test that it:
1. Creates a Conversation + mapping on first message
2. Saves user message and AI response to Messages table
3. Reuses existing conversation for subsequent messages
4. Uses SYSTEM_BOT_USER_ID for AI messages

- [ ] **Step 3: Implement ChatbotChatUseCase**

```typescript
// packages/application/src/use-cases/chatbot/chatbot-chat.use-case.ts
import type {
  IConversationRepository,
  IMessageRepository,
  IDifyConversationMappingRepository,
} from '@medical-crm/domain';
import { SYSTEM_BOT_USER_ID } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import type { DifyApiClient } from '@medical-crm/infrastructure/dify';

export interface ChatbotChatInput {
  message: string;
  difyConversationId?: string | null;
  userId?: string | null;
  sessionId: string;
  hospitalType: 'COSMETIC' | 'REGULAR';
}

export class ChatbotChatUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly mappingRepo: IDifyConversationMappingRepository,
    private readonly difyClient: DifyApiClient,
  ) {}

  async execute(input: ChatbotChatInput): Promise<{
    stream: ReadableStream<Uint8Array>;
    processCompletion: (difyConversationId: string, aiResponse: string) => Promise<void>;
  }> {
    const userIdentifier = input.userId ?? `anon-${input.sessionId}`;

    // Get or prepare conversation
    let mapping = input.difyConversationId
      ? await this.mappingRepo.findByDifyConversationId(input.difyConversationId)
      : null;

    // Stream from Dify
    const stream = await this.difyClient.chatStream({
      query: input.message,
      response_mode: 'streaming',
      conversation_id: input.difyConversationId ?? undefined,
      user: userIdentifier,
      inputs: { hospitalType: input.hospitalType },
    });

    // Post-stream processing callback
    const processCompletion = async (difyConversationId: string, aiResponse: string) => {
      if (!mapping) {
        // First message — create conversation + mapping
        const conversationId = generateId();
        await this.conversationRepo.save({
          id: conversationId,
          category: 'AI_CHATBOT',
          title: input.message.substring(0, 100),
          hospitalId: null,
          caseId: null,
        });

        mapping = await this.mappingRepo.save({
          id: generateId(),
          difyConversationId,
          conversationId,
          userId: input.userId ?? null,
          sessionId: input.sessionId,
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Save user message — for anonymous users, use SYSTEM_BOT_USER_ID as sender
      // (the session_id in dify_conversation_mappings tracks which anonymous session it belongs to)
      await this.messageRepo.save({
        id: generateId(),
        conversationId: mapping.conversationId,
        senderId: input.userId ?? SYSTEM_BOT_USER_ID,
        content: input.message,
        messageType: 'TEXT',
        originalLanguage: 'auto',
        createdAt: new Date(),
      });

      // Save AI response
      await this.messageRepo.save({
        id: generateId(),
        conversationId: mapping.conversationId,
        senderId: SYSTEM_BOT_USER_ID,
        content: aiResponse,
        messageType: 'TEXT',
        originalLanguage: 'auto',
        createdAt: new Date(),
      });
    };

    return { stream, processCompletion };
  }
}
```

Note: The exact `conversationRepo.save()` and `messageRepo.save()` signatures need to match the existing interfaces. Read them before implementing.

- [ ] **Step 4: Write failing test for ChatbotEscalateUseCase**

- [ ] **Step 5: Implement ChatbotEscalateUseCase**

```typescript
// packages/application/src/use-cases/chatbot/chatbot-escalate.use-case.ts
import type {
  ISupportTicketRepository,
  IDifyConversationMappingRepository,
  IMessageRepository,
} from '@medical-crm/domain';
import { SupportTicket, TicketNumber } from '@medical-crm/domain';
import { generateId, NotFoundError } from '@medical-crm/utils';

export interface ChatbotEscalateInput {
  difyConversationId: string;
  reason: string;
  contactInfo: {
    name: string;
    email: string;
    phone?: string;
  };
}

export class ChatbotEscalateUseCase {
  constructor(
    private readonly ticketRepo: ISupportTicketRepository,
    private readonly mappingRepo: IDifyConversationMappingRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  async execute(input: ChatbotEscalateInput) {
    const mapping = await this.mappingRepo.findByDifyConversationId(input.difyConversationId);
    if (!mapping) throw new NotFoundError('Conversation not found');

    // Create ticket
    const ticketNumber = await this.ticketRepo.nextTicketNumber();
    const ticket = new SupportTicket({
      id: generateId(),
      ticketNumber: new TicketNumber(ticketNumber),
      patientId: mapping.userId ?? SYSTEM_BOT_USER_ID, // Anonymous escalations use bot user; contactInfo is stored in description
      caseId: null,
      type: 'AI_ESCALATION',
      priority: 'MEDIUM',
      status: 'OPEN',
      subject: `AI 客服转人工 - ${input.reason.substring(0, 100)}`,
      description: `转人工原因: ${input.reason}\n\n联系方式:\n姓名: ${input.contactInfo.name}\n邮箱: ${input.contactInfo.email}${input.contactInfo.phone ? `\n电话: ${input.contactInfo.phone}` : ''}`,
      sourcePage: 'ai-chatbot',
      assignedTo: null,
      slaDeadline: null,
      resolutionNote: null,
      resolvedAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.ticketRepo.save(ticket);

    // Update conversation status
    await this.mappingRepo.updateStatus(input.difyConversationId, 'ESCALATED');

    return {
      ticketNumber: saved.ticketNumber.value,
      message: 'Your request has been escalated to our support team.',
    };
  }
}
```

- [ ] **Step 6: Implement ChatbotHistoryUseCase**

```typescript
// packages/application/src/use-cases/chatbot/chatbot-history.use-case.ts
import type { IDifyConversationMappingRepository, IMessageRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import { SYSTEM_BOT_USER_ID } from '@medical-crm/domain';
import type { ChatbotHistoryDTO } from '../../dtos/chatbot.dto.js';

export class ChatbotHistoryUseCase {
  constructor(
    private readonly mappingRepo: IDifyConversationMappingRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  async execute(difyConversationId: string): Promise<ChatbotHistoryDTO> {
    const mapping = await this.mappingRepo.findByDifyConversationId(difyConversationId);
    if (!mapping) throw new NotFoundError('Conversation not found');

    const messages = await this.messageRepo.findByConversationId(mapping.conversationId);

    return {
      difyConversationId,
      messages: messages.map((m) => ({
        role: m.senderId === SYSTEM_BOT_USER_ID ? 'assistant' as const : 'user' as const,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}
```

- [ ] **Step 7: Run all tests**

```bash
cd packages/application && pnpm vitest run chatbot-use-cases.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add packages/application/src/
git commit -m "feat(app): add chatbot chat, escalate, and history use cases"
```

---

### Task 12: Chatbot Routes

**Files:**
- Create: `apps/api/src/routes/chatbot.routes.ts`
- Create: `apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `apps/api/src/index.ts` (mount routes)
- Modify: `apps/api/src/composition-root.ts` (wire use cases)

- [ ] **Step 1: Write failing route test**

```typescript
// apps/api/src/__tests__/chatbot.routes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Follow existing test pattern: mock getServices, create test app, inject session middleware

describe('POST /api/v2/chatbot/chat', () => {
  it('returns streaming response', async () => {
    // Mock chatbotChat.execute to return a ReadableStream
    // Verify SSE format
  });

  it('rejects message over 2000 chars', async () => {
    // Verify 400 response
  });
});

describe('POST /api/v2/chatbot/escalate', () => {
  it('creates ticket and returns ticket number', async () => {
    // Mock chatbotEscalate.execute
    // Verify 201 response with ticketNumber
  });
});

describe('GET /api/v2/chatbot/history/:difyConversationId', () => {
  it('returns conversation history', async () => {
    // Mock chatbotHistory.execute
    // Verify response shape
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement chatbot routes**

```typescript
// apps/api/src/routes/chatbot.routes.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { chatbotChatSchema, chatbotEscalateSchema } from '@medical-crm/validation';
import { getServices } from '../composition-root.js';
import { stream } from 'hono/streaming';

const app = new OpenAPIHono();

// POST /api/v2/chatbot/chat — Streaming chat proxy
const chatRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/chat',
  request: {
    body: { content: { 'application/json': { schema: chatbotChatSchema } }, required: true },
  },
  responses: { 200: { description: 'SSE streaming response' } },
});

app.openapi(chatRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();

  const { stream: difyStream, processCompletion } = await svc.chatbotChat.execute(body);

  // Parse SSE stream, collect full response, then call processCompletion
  return stream(c, async (stream) => {
    const reader = difyStream.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let difyConversationId = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.event === 'message' && parsed.answer) {
              fullResponse += parsed.answer;
              difyConversationId = parsed.conversation_id ?? difyConversationId;
              await stream.write(`data: ${JSON.stringify({
                chunk: parsed.answer,
                difyConversationId,
              })}\n\n`);
            }
            if (parsed.event === 'message_end') {
              difyConversationId = parsed.conversation_id ?? difyConversationId;
              const canAnswer = !fullResponse.includes('[TRANSFER_TO_HUMAN]'); // Convention in Dify prompt
              await stream.write(`data: ${JSON.stringify({
                event: 'done',
                difyConversationId,
                canAnswer,
                fullResponse,
              })}\n\n`);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Async: persist messages to DB
    if (difyConversationId) {
      processCompletion(difyConversationId, fullResponse).catch((err) => {
        console.error('[Chatbot] Failed to persist messages:', err);
      });
    }
  });
});

// POST /api/v2/chatbot/escalate — Transfer to human
const escalateRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/escalate',
  request: {
    body: { content: { 'application/json': { schema: chatbotEscalateSchema } }, required: true },
  },
  responses: { 201: { description: 'Ticket created' } },
});

app.openapi(escalateRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  const result = await svc.chatbotEscalate.execute(body);
  return c.json(result, 201);
});

// GET /api/v2/chatbot/history/:difyConversationId
const historyRoute = createRoute({
  method: 'get',
  path: '/api/v2/chatbot/history/{difyConversationId}',
  request: {
    params: z.object({ difyConversationId: z.string().min(1) }),
  },
  responses: { 200: { description: 'Chat history' } },
});

app.openapi(historyRoute, async (c) => {
  const { difyConversationId } = c.req.valid('param');
  const svc = getServices();
  const result = await svc.chatbotHistory.execute(difyConversationId);
  return c.json(result, 200);
});

export default app;
```

- [ ] **Step 4: Mount routes in index.ts**

```typescript
// In apps/api/src/index.ts, add:
import chatbotRoutes from './routes/chatbot.routes.js';
app.route('/', chatbotRoutes);
```

- [ ] **Step 5: Wire use cases in composition-root.ts**

Add chatbot use case instantiation to `getServices()`:

```typescript
chatbotChat: new ChatbotChatUseCase(conversationRepo, messageRepo, difyConvMappingRepo, difyClient),
chatbotEscalate: new ChatbotEscalateUseCase(ticketRepo, difyConvMappingRepo, messageRepo),
chatbotHistory: new ChatbotHistoryUseCase(difyConvMappingRepo, messageRepo),
```

- [ ] **Step 6: Run tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/chatbot.routes.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/
git commit -m "feat(api): add chatbot routes — chat streaming, escalate, history"
```

---

### Task 13: Admin Sync Routes

**Files:**
- Create: `apps/api/src/routes/chatbot-sync.routes.ts`
- Create: `apps/api/src/__tests__/chatbot-sync.routes.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test**

Test that sync routes require ADMIN role.

- [ ] **Step 2: Implement admin sync routes**

```typescript
// apps/api/src/routes/chatbot-sync.routes.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Session } from '@medical-crm/infrastructure/auth';
import { toActor } from '@medical-crm/application';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// POST /api/v2/chatbot/sync — Full sync (admin only)
const fullSyncRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/sync',
  responses: { 200: { description: 'Sync started' } },
});

app.openapi(fullSyncRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  if (actor.role !== 'ADMIN') return c.json({ error: 'Forbidden' }, 403);

  const svc = getServices();
  // Fire and forget — full sync can take time
  svc.difySyncService.fullSync().catch((err) => {
    console.error('[DifySync] Full sync failed:', err);
  });

  return c.json({ message: 'Full sync started' }, 200);
});

// POST /api/v2/chatbot/sync/faq-categories/:categoryId
const syncFaqRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/sync/faq-categories/{categoryName}',
  request: {
    params: z.object({ categoryName: z.string() }),
    body: {
      content: { 'application/json': { schema: z.object({ hospitalType: z.enum(['COSMETIC', 'REGULAR']) }) } },
      required: true,
    },
  },
  responses: { 200: { description: 'Category synced' } },
});

app.openapi(syncFaqRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  if (actor.role !== 'ADMIN') return c.json({ error: 'Forbidden' }, 403);

  const { categoryName } = c.req.valid('param');
  const { hospitalType } = c.req.valid('json');
  const svc = getServices();

  await svc.difySyncService.syncFaqCategory(categoryName, hospitalType);
  return c.json({ message: `Category "${categoryName}" synced` }, 200);
});

// POST /api/v2/chatbot/sync/package-types/:type
const syncPackageRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/sync/package-types/{type}',
  request: {
    params: z.object({ type: z.string() }),
  },
  responses: { 200: { description: 'Package type synced' } },
});

app.openapi(syncPackageRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  if (actor.role !== 'ADMIN') return c.json({ error: 'Forbidden' }, 403);

  const { type } = c.req.valid('param');
  const svc = getServices();

  await svc.difySyncService.syncPackageType(type as import('@medical-crm/domain').PackageType);
  return c.json({ message: `Package type "${type}" synced` }, 200);
});

export default app;
```

- [ ] **Step 3: Mount routes and run tests**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/
git commit -m "feat(api): add admin chatbot sync routes"
```

---

## Chunk 4: Validation & Typecheck

### Task 14: Update Validation Schemas for Extended Enums

**Files:**
- Modify: `packages/shared/validation/src/support-ticket.schema.ts`
- Modify: `packages/shared/validation/src/index.ts`

- [ ] **Step 1: Add AI_ESCALATION to ticketTypeSchema**

```typescript
// In support-ticket.schema.ts:
export const ticketTypeSchema = z.enum([
  'ACCOUNT_ISSUES', 'PAYMENT_PROBLEMS', 'HOSPITAL_COMMUNICATION',
  'DOCUMENT_HELP', 'VISA_TRAVEL', 'GENERAL_QUESTIONS', 'FEEDBACK',
  'AI_ESCALATION',
]);
```

- [ ] **Step 2: Export chatbot schemas from validation index**

- [ ] **Step 3: Run typecheck across all packages**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r typecheck
```

Fix any type errors.

- [ ] **Step 4: Run all tests**

```bash
pnpm -r test
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(validation): extend ticket type enum, export chatbot schemas, fix type errors"
```

---

## Chunk 5: Infrastructure Exports & Wiring

### Task 15: Export New Modules from Package Index Files

**Files:**
- Modify: `packages/infrastructure/index.ts` (or relevant barrel export)
- Modify: `packages/application/src/index.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Ensure all new modules are exported**

Check each package's index.ts/barrel export and add missing exports for:
- Domain: new ports, enums, constants
- Infrastructure: DifyApiClient, DifySyncService, new repositories
- Application: chatbot use cases, DTOs

- [ ] **Step 2: Run typecheck**

```bash
pnpm -r typecheck
```

- [ ] **Step 3: Run full test suite**

```bash
pnpm -r test
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: export new Dify modules from package barrel files"
```

---

### Task 16: Environment Variable Validation

**Files:**
- Modify: `apps/api/src/env.ts` (or wherever env validation lives)

- [ ] **Step 1: Find the env validation file**

```bash
grep -r "DIFY\|getServerEnv\|env.ts" apps/api/src/ --include="*.ts" -l
```

- [ ] **Step 2: Add Dify env vars (optional — only required when Dify is configured)**

```typescript
// Make Dify vars optional so the app still starts without Dify
DIFY_API_BASE_URL: z.string().url().optional(),
DIFY_API_KEY: z.string().optional(),
DIFY_FAQ_DATASET_ID: z.string().optional(),
DIFY_PACKAGE_DATASET_ID: z.string().optional(),
```

- [ ] **Step 3: Update composition-root.ts to conditionally create DifySyncService**

```typescript
const difyEnabled = env.DIFY_API_BASE_URL && env.DIFY_API_KEY;
const difySyncService = difyEnabled
  ? new DifySyncService(...)
  : undefined;
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/
git commit -m "feat(api): add optional Dify environment variables"
```

---

## Chunk 6: FAQ Repository Extension

### Task 17: Add `findByCategory` to FAQ Repository

The `DifySyncService` needs `faqRepo.findByCategory(categoryName, hospitalType)`. Check if this method already exists; if not, add it.

**Files:**
- Modify: `packages/domain/src/ports/chatbot-faq-repository.port.ts` (add method to interface)
- Modify: `packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts` (implement)

- [ ] **Step 1: Check existing IChatbotFaqRepository interface**

```bash
cat packages/domain/src/ports/chatbot-faq-repository.port.ts
```

- [ ] **Step 2: Add `findByCategory` if missing**

```typescript
findByCategory(categoryName: string, hospitalType: 'COSMETIC' | 'REGULAR'): Promise<ChatbotFaqItem[]>;
```

- [ ] **Step 3: Implement in Drizzle repository**

```typescript
async findByCategory(categoryName: string, hospitalType: 'COSMETIC' | 'REGULAR'): Promise<ChatbotFaqItem[]> {
  const rows = await this.db
    .select()
    .from(chatbotFaqItems)
    .where(
      and(
        eq(chatbotFaqItems.category, categoryName),
        eq(chatbotFaqItems.hospitalType, hospitalType),
        eq(chatbotFaqItems.isActive, true),
      ),
    )
    .orderBy(chatbotFaqItems.sortOrder);
  return rows.map((r) => this.rowToEntity(r));
}
```

- [ ] **Step 4: Add `findByType` to Package Repository if missing**

Same pattern — check `IPackageRepository` for a `findByType(type)` method.

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Commit**

```bash
git add packages/domain/ packages/infrastructure/
git commit -m "feat(domain/infra): add findByCategory and findByType repository methods for Dify sync"
```

---

## Summary

| Chunk | Tasks | Focus |
|-------|-------|-------|
| 1 | 1-5 | DB migration, domain enums/ports, mapping repositories |
| 2 | 6-9 | Dify API client, sync service, FAQ/Package sync hooks |
| 3 | 10-13 | Validation schemas, chatbot use cases, API routes |
| 4 | 14 | Enum extensions, typecheck fixes |
| 5 | 15-16 | Package exports, env vars, wiring |
| 6 | 17 | Repository method extensions for sync |

**Execution order matters:** Chunk 1 → 6 → 2 → 3 → 4 → 5 (Chunk 6 must precede Chunk 2 because DifySyncService depends on `findByCategory`/`findByType`)

**Not included in this plan (manual / separate work):**
- Dify VPS deployment and Docker Compose setup
- Dify Chatflow creation in Dify admin UI (including hospitalType metadata filtering config in Knowledge Retrieval node)
- DifyChatWidget React component (separate plan for frontend)
- Rate limiting middleware for public chatbot endpoints (follow-up task — spec requires 30 msg/min per session, 60/min per IP)
- `users` table role enum may need `SYSTEM` value added if not already present — verify before running migration
