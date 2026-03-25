# Unified AI Translation System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship async multi-language AI translation for Support Tickets, Consultations, FAQ, Question Collectors, and Materials — using a JSONB + task-queue architecture across CRM DB and two Supabase instances.

**Architecture:** Extend the existing `translation_tasks` table with `source_db`, `fields_to_translate`, and `target_languages` columns. A new `ProcessTranslationTasksUseCase` worker pulls tasks atomically, calls OpenAI GPT-4o for batch translation (auto-detect source language, translate into 9 target languages), and writes results back to the correct DB via a `TranslationWritebackService`. Each module's create/update use cases enqueue translation tasks after persisting entities.

**Tech Stack:** Hono API, Drizzle ORM, OpenAI GPT-4o (JSON mode), PostgreSQL JSONB, Supabase clients

**Spec:** `docs/superpowers/specs/2026-03-25-unified-ai-translation-design.md`

---

## File Structure

### Domain Layer (`packages/domain/src/`)

| File | Responsibility |
|------|----------------|
| `config/translation.config.ts` | **CREATE** — Supported languages, default targets, translatable field map, retry config |
| `ports/batch-translation-service.port.ts` | **CREATE** — `IBatchTranslationService` interface |
| `ports/translation-task-repository.port.ts` | **CREATE** — `ITranslationTaskRepository` interface (enqueue, pull, retry, status) |
| `entities/translation-task.entity.ts` | **CREATE** — `TranslationTask` entity with status/retry logic |
| `enums/index.ts` | **MODIFY** — Add `TranslationTaskStatus`, `SourceDb` types |

### Application Layer (`packages/application/src/`)

| File | Responsibility |
|------|----------------|
| `services/translation-task.service.ts` | **CREATE** — Enqueue logic with deduplication, field extraction, changed-field merge |
| `use-cases/translations/process-translation-tasks.use-case.ts` | **CREATE** — Worker: atomic pull → translate → writeback |
| `use-cases/translations/retry-translation.use-case.ts` | **CREATE** — Manual retry: reset status + retry count |
| `use-cases/translations/get-translation-status.use-case.ts` | **CREATE** — Query task status by (sourceDb, entityType, entityId) |
| `use-cases/tickets/create-ticket.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/tickets/reply-to-ticket.use-case.ts` | **MODIFY** — Enqueue translation for non-internal replies |
| `use-cases/consultations/create-consultation.use-case.ts` | **MODIFY** — Enqueue translation when notes present |
| `use-cases/consultations/update-consultation.use-case.ts` | **MODIFY** — Enqueue translation when notes changed |
| `use-cases/chatbot-faq/create-faq-item.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/chatbot-faq/update-faq-item.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/chatbot-faq/create-faq-category.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/question-collector/create-template.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/question-collector/update-template.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/question-collector/submit-response.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/materials/update-hospital-info.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/materials/create-surgeon.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/materials/update-surgeon.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/materials/create-before-after-case.use-case.ts` | **MODIFY** — Enqueue translation after save |
| `use-cases/materials/update-before-after-case.use-case.ts` | **MODIFY** — Enqueue translation after save |

### Infrastructure Layer (`packages/infrastructure/`)

| File | Responsibility |
|------|----------------|
| `database/schema/schema.ts` | **MODIFY** — Add `translations` columns to 7 CRM tables, extend `translation_tasks` |
| `database/repositories/drizzle-translation-task.repository.ts` | **CREATE** — Atomic pull, enqueue/upsert, retry, status query |
| `services/openai-batch-translation.service.ts` | **CREATE** — GPT-4o JSON mode batch translation |
| `services/translation-writeback.service.ts` | **CREATE** — Routes writeback to CRM/Beauty/China |

### API Layer (`apps/api/src/`)

| File | Responsibility |
|------|----------------|
| `routes/translations.routes.ts` | **CREATE** — `/retry`, `/status` endpoints |
| `routes/internal.routes.ts` | **MODIFY** — Add `/process-translation-tasks` worker endpoint |
| `composition-root.ts` | **MODIFY** — Wire new repos, services, use cases |

### Supabase Migrations

| File | Responsibility |
|------|----------------|
| `migrations/005_add_translations_columns.sql` | **CREATE** — Add `translations jsonb` to `procedure_cases` (Beauty) |
| `migrations/005_add_translations_columns_china.sql` | **CREATE** — Add `translations jsonb` to `procedure_cases` (China) |

---

## Chunk 1: Foundation — Domain Types, Config, Schema

### Task 1: Add translation enums and config

**Files:**
- Create: `packages/domain/src/enums/translation.ts`
- Create: `packages/domain/src/config/translation.config.ts`
- Modify: `packages/domain/src/enums/index.ts`

- [ ] **Step 1: Create translation enums**

```ts
// packages/domain/src/enums/translation.ts
export type TranslationTaskStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SourceDb = 'crm' | 'supabase_beauty' | 'supabase_china';
export type SupportedLanguage = 'zh' | 'en' | 'ru' | 'fr' | 'es' | 'de' | 'ar' | 'id' | 'vi';
```

- [ ] **Step 2: Create translation config**

```ts
// packages/domain/src/config/translation.config.ts
import type { SupportedLanguage } from '../enums/translation.js';

export const TRANSLATION_CONFIG = {
  supportedLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'] as const satisfies readonly SupportedLanguage[],
  defaultTargetLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'] as const,
  retry: { maxRetries: 3 },
} as const;
```

- [ ] **Step 3: Re-export from enums/index.ts**

Add to `packages/domain/src/enums/index.ts`:

```ts
export * from './translation.js';
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd packages/domain && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/enums/translation.ts packages/domain/src/config/translation.config.ts packages/domain/src/enums/index.ts
git commit -m "feat(domain): add translation enums and config"
```

### Task 2: Create TranslationTask entity

**Files:**
- Create: `packages/domain/src/entities/translation-task.entity.ts`

- [ ] **Step 1: Write the entity**

```ts
// packages/domain/src/entities/translation-task.entity.ts
import type { TranslationTaskStatus, SourceDb } from '../enums/translation.js';
import { TRANSLATION_CONFIG } from '../config/translation.config.js';

export interface TranslationTaskProps {
  id: string;
  sourceDb: SourceDb;
  entityType: string;
  entityId: string;
  hospitalType: string | null;
  fieldsToTranslate: Record<string, unknown>;
  targetLanguages: string[];
  sourceLanguage: string | null;
  targetLanguage: string | null; // legacy, nullable
  detectedLanguage: string | null;
  status: TranslationTaskStatus;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export class TranslationTask {
  readonly id: string;
  readonly sourceDb: SourceDb;
  readonly entityType: string;
  readonly entityId: string;
  hospitalType: string | null;
  fieldsToTranslate: Record<string, unknown>;
  targetLanguages: string[];
  sourceLanguage: string | null;
  targetLanguage: string | null;
  detectedLanguage: string | null;
  status: TranslationTaskStatus;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;

  constructor(props: TranslationTaskProps) {
    this.id = props.id;
    this.sourceDb = props.sourceDb;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.hospitalType = props.hospitalType;
    this.fieldsToTranslate = props.fieldsToTranslate;
    this.targetLanguages = props.targetLanguages;
    this.sourceLanguage = props.sourceLanguage;
    this.targetLanguage = props.targetLanguage;
    this.detectedLanguage = props.detectedLanguage;
    this.status = props.status;
    this.errorMessage = props.errorMessage;
    this.retryCount = props.retryCount;
    this.createdAt = props.createdAt;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
  }

  markProcessing(): void {
    this.status = 'processing';
    this.startedAt = new Date();
  }

  markCompleted(detectedLanguage: string): void {
    this.status = 'completed';
    this.detectedLanguage = detectedLanguage;
    this.completedAt = new Date();
  }

  markFailedOrRetry(error: string): void {
    this.errorMessage = error;
    this.retryCount += 1;
    if (this.retryCount >= TRANSLATION_CONFIG.retry.maxRetries) {
      this.status = 'failed';
    } else {
      this.status = 'pending';
    }
  }

  resetForRetry(): void {
    this.status = 'pending';
    this.retryCount = 0;
    this.errorMessage = null;
    this.startedAt = null;
    this.completedAt = null;
  }
}
```

- [ ] **Step 2: Export from domain index**

Ensure `packages/domain/src/index.ts` (or wherever entities are re-exported) includes `TranslationTask`.

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/domain && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/entities/translation-task.entity.ts
git commit -m "feat(domain): add TranslationTask entity"
```

### Task 3: Create domain ports

**Files:**
- Create: `packages/domain/src/ports/translation-task-repository.port.ts`
- Create: `packages/domain/src/ports/batch-translation-service.port.ts`

- [ ] **Step 1: Create ITranslationTaskRepository port**

```ts
// packages/domain/src/ports/translation-task-repository.port.ts
import type { TranslationTask } from '../entities/translation-task.entity.js';
import type { SourceDb } from '../enums/translation.js';

export interface EnqueueTranslationInput {
  sourceDb: SourceDb;
  entityType: string;
  entityId: string;
  hospitalType?: string | null;
  fieldsToTranslate: Record<string, unknown>;
  targetLanguages?: string[];
}

export interface ITranslationTaskRepository {
  /** Upsert: if pending/processing task exists for same (sourceDb, entityType, entityId), update fields; else insert. */
  upsert(input: EnqueueTranslationInput): Promise<TranslationTask>;
  /** Atomic pull: SELECT ... FOR UPDATE SKIP LOCKED */
  pullPending(limit: number): Promise<TranslationTask[]>;
  markProcessing(taskId: string): Promise<void>;
  markCompleted(taskId: string, detectedLanguage: string): Promise<void>;
  markFailedOrRetry(taskId: string, error: string, retryCount: number): Promise<void>;
  resetForRetry(sourceDb: SourceDb, entityType: string, entityId: string): Promise<void>;
  findByEntity(sourceDb: SourceDb, entityType: string, entityId: string): Promise<TranslationTask | null>;
}
```

- [ ] **Step 2: Create IBatchTranslationService port**

```ts
// packages/domain/src/ports/batch-translation-service.port.ts
export interface BatchTranslateRequest {
  fields: Record<string, unknown>;
  targetLanguages: string[];
}

export interface BatchTranslateResult {
  detectedLanguage: string;
  translations: Record<string, Record<string, unknown>>;
}

export interface IBatchTranslationService {
  translateBatch(request: BatchTranslateRequest): Promise<BatchTranslateResult>;
}
```

- [ ] **Step 3: Export ports from domain**

Ensure both ports are re-exported from `packages/domain/src/index.ts`.

- [ ] **Step 4: Verify typecheck**

Run: `cd packages/domain && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/ports/translation-task-repository.port.ts packages/domain/src/ports/batch-translation-service.port.ts
git commit -m "feat(domain): add translation task repository and batch translation ports"
```

### Task 4: CRM DB schema migration — extend translation_tasks + add translations columns

**Files:**
- Modify: `packages/infrastructure/database/schema/schema.ts`

- [ ] **Step 1: Extend `translationTasks` table definition in schema.ts**

Find the existing `translationTasks` table definition and add the new columns:

```ts
// Add these columns to the existing translationTasks pgTable definition:
sourceDb: text("source_db").default('crm').notNull(),
fieldsToTranslate: jsonb("fields_to_translate").default({}).notNull(),
targetLanguages: text("target_languages").array().default([]).notNull(),
detectedLanguage: varchar("detected_language", { length: 10 }),
```

Also modify `hospitalType` and `targetLanguage` — remove `.notNull()` from both (they should be nullable now).

Update the unique constraint: replace the old `unique("translation_tasks_hospital_type_entity_type_entity_id_sourc_key")` with a new partial unique index:

```ts
// Remove old:
// unique("translation_tasks_hospital_type_entity_type_entity_id_sourc_key").on(...)

// Add new partial unique index (will need raw SQL in migration):
index("translation_tasks_entity_dedup").using("btree", table.sourceDb.asc(), table.entityType.asc(), table.entityId.asc()),
```

- [ ] **Step 2: Add `translations jsonb` column to 7 CRM tables**

Add to each table's pgTable definition:

```ts
// support_tickets
translations: jsonb().default({}).notNull(),

// support_ticket_replies
translations: jsonb().default({}).notNull(),

// consultations
translations: jsonb().default({}).notNull(),

// question_collector_templates
translations: jsonb().default({}).notNull(),

// question_collector_responses
translations: jsonb().default({}).notNull(),

// chatbot_faq_items
translations: jsonb().default({}).notNull(),

// chatbot_faq_categories
translations: jsonb().default({}).notNull(),
```

- [ ] **Step 3: Generate Drizzle migration**

Run: `cd packages/infrastructure && npx drizzle-kit generate`

- [ ] **Step 4: Review generated SQL migration**

Verify the migration includes:
- New columns on `translation_tasks`
- `translations jsonb` on all 7 tables
- Dropping old unique constraint
- The partial unique index (may need manual edit for the WHERE clause):

```sql
CREATE UNIQUE INDEX translation_tasks_entity_dedup
  ON translation_tasks (source_db, entity_type, entity_id)
  WHERE status IN ('pending', 'processing');
```

- [ ] **Step 5: Verify typecheck**

Run: `cd packages/infrastructure && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/database/schema/ packages/infrastructure/database/migrations/
git commit -m "feat(schema): extend translation_tasks + add translations jsonb to 7 CRM tables"
```

### Task 5: Supabase migrations — add translations to procedure_cases

**Files:**
- Create: `migrations/005_add_procedure_cases_translations.sql`

- [ ] **Step 1: Write migration file**

```sql
-- migrations/005_add_procedure_cases_translations.sql
-- Apply to BOTH Beauty and China Medical Supabase instances

ALTER TABLE procedure_cases
  ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN procedure_cases.translations IS 'Multi-language translations: {"en": {"description": "...", "provider_name": "..."}, ...}';
```

- [ ] **Step 2: Commit**

```bash
git add migrations/005_add_procedure_cases_translations.sql
git commit -m "feat(supabase): add translations jsonb to procedure_cases"
```

---

## Chunk 2: Core Infrastructure — Repository, OpenAI Service, Writeback

### Task 6: Implement DrizzleTranslationTaskRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-translation-task.repository.ts`
- Create: `packages/domain/__tests__/translation-task.entity.test.ts`

- [ ] **Step 1: Write unit test for TranslationTask entity**

```ts
// packages/domain/__tests__/translation-task.entity.test.ts
import { describe, it, expect } from 'vitest';
import { TranslationTask } from '../src/entities/translation-task.entity.js';

function makeTask(overrides: Partial<import('../src/entities/translation-task.entity.js').TranslationTaskProps> = {}) {
  return new TranslationTask({
    id: 'task-1',
    sourceDb: 'crm',
    entityType: 'support_ticket',
    entityId: 'entity-1',
    hospitalType: null,
    fieldsToTranslate: { subject: 'Hello' },
    targetLanguages: ['zh', 'en'],
    sourceLanguage: null,
    targetLanguage: null,
    detectedLanguage: null,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    ...overrides,
  });
}

describe('TranslationTask', () => {
  it('markProcessing sets status and startedAt', () => {
    const task = makeTask();
    task.markProcessing();
    expect(task.status).toBe('processing');
    expect(task.startedAt).toBeInstanceOf(Date);
  });

  it('markCompleted sets status, detectedLanguage, completedAt', () => {
    const task = makeTask({ status: 'processing' });
    task.markCompleted('zh');
    expect(task.status).toBe('completed');
    expect(task.detectedLanguage).toBe('zh');
    expect(task.completedAt).toBeInstanceOf(Date);
  });

  it('markFailedOrRetry increments retryCount and stays pending when under max', () => {
    const task = makeTask({ retryCount: 0 });
    task.markFailedOrRetry('timeout');
    expect(task.retryCount).toBe(1);
    expect(task.status).toBe('pending');
    expect(task.errorMessage).toBe('timeout');
  });

  it('markFailedOrRetry sets failed when retryCount reaches max', () => {
    const task = makeTask({ retryCount: 2 });
    task.markFailedOrRetry('timeout');
    expect(task.retryCount).toBe(3);
    expect(task.status).toBe('failed');
  });

  it('resetForRetry clears status and retryCount', () => {
    const task = makeTask({ status: 'failed', retryCount: 3, errorMessage: 'err' });
    task.resetForRetry();
    expect(task.status).toBe('pending');
    expect(task.retryCount).toBe(0);
    expect(task.errorMessage).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd packages/domain && npx vitest run __tests__/translation-task.entity.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Write DrizzleTranslationTaskRepository**

```ts
// packages/infrastructure/database/repositories/drizzle-translation-task.repository.ts
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { ITranslationTaskRepository, EnqueueTranslationInput } from '@medical-crm/domain';
import { TranslationTask } from '@medical-crm/domain';
import { TRANSLATION_CONFIG } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { translationTasks } from '../schema/index.js';
import { generateId } from '@medical-crm/utils';

export class DrizzleTranslationTaskRepository implements ITranslationTaskRepository {
  constructor(private readonly db: CrmDb) {}

  async upsert(input: EnqueueTranslationInput): Promise<TranslationTask> {
    const now = new Date().toISOString();
    const targetLangs = input.targetLanguages ?? [...TRANSLATION_CONFIG.defaultTargetLanguages];
    const id = generateId();

    const [row] = await this.db
      .insert(translationTasks)
      .values({
        id,
        sourceDb: input.sourceDb,
        entityType: input.entityType,
        entityId: input.entityId,
        hospitalType: input.hospitalType ?? null,
        fieldsToTranslate: input.fieldsToTranslate,
        targetLanguages: targetLangs,
        sourceLanguage: null,
        targetLanguage: null,
        status: 'pending',
        errorMessage: null,
        retryCount: 0,
        createdAt: now,
      })
      .onConflictDoUpdate({
        // Uses the partial unique index (source_db, entity_type, entity_id) WHERE status IN (pending, processing)
        // Drizzle doesn't support partial unique index conflicts natively, so we use raw SQL
        target: [translationTasks.sourceDb, translationTasks.entityType, translationTasks.entityId],
        set: {
          fieldsToTranslate: input.fieldsToTranslate,
          targetLanguages: targetLangs,
          status: 'pending',
        },
      })
      .returning();

    return this.rowToEntity(row);
  }

  async pullPending(limit: number): Promise<TranslationTask[]> {
    // Atomic pull using FOR UPDATE SKIP LOCKED via raw SQL
    const rows = await this.db.execute(sql`
      UPDATE translation_tasks
      SET status = 'processing', started_at = NOW()
      WHERE id IN (
        SELECT id FROM translation_tasks
        WHERE status = 'pending'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING *
    `);

    return (rows.rows as Array<typeof translationTasks.$inferSelect>).map(r => this.rowToEntity(r));
  }

  async markProcessing(taskId: string): Promise<void> {
    await this.db
      .update(translationTasks)
      .set({ status: 'processing', startedAt: new Date().toISOString() })
      .where(eq(translationTasks.id, taskId));
  }

  async markCompleted(taskId: string, detectedLanguage: string): Promise<void> {
    await this.db
      .update(translationTasks)
      .set({
        status: 'completed',
        detectedLanguage,
        completedAt: new Date().toISOString(),
      })
      .where(eq(translationTasks.id, taskId));
  }

  async markFailedOrRetry(taskId: string, error: string, retryCount: number): Promise<void> {
    const maxRetries = TRANSLATION_CONFIG.retry.maxRetries;
    const newRetryCount = retryCount + 1;
    const newStatus = newRetryCount >= maxRetries ? 'failed' : 'pending';

    await this.db
      .update(translationTasks)
      .set({
        status: newStatus,
        errorMessage: error,
        retryCount: newRetryCount,
      })
      .where(eq(translationTasks.id, taskId));
  }

  async resetForRetry(sourceDb: string, entityType: string, entityId: string): Promise<void> {
    await this.db
      .update(translationTasks)
      .set({
        status: 'pending',
        retryCount: 0,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      })
      .where(
        and(
          eq(translationTasks.sourceDb, sourceDb),
          eq(translationTasks.entityType, entityType),
          eq(translationTasks.entityId, entityId),
          eq(translationTasks.status, 'failed'),
        ),
      );
  }

  async findByEntity(sourceDb: string, entityType: string, entityId: string): Promise<TranslationTask | null> {
    const [row] = await this.db
      .select()
      .from(translationTasks)
      .where(
        and(
          eq(translationTasks.sourceDb, sourceDb),
          eq(translationTasks.entityType, entityType),
          eq(translationTasks.entityId, entityId),
        ),
      )
      .orderBy(sql`${translationTasks.createdAt} DESC`)
      .limit(1);

    return row ? this.rowToEntity(row) : null;
  }

  private rowToEntity(row: any): TranslationTask {
    return new TranslationTask({
      id: row.id,
      sourceDb: row.source_db ?? row.sourceDb,
      entityType: row.entity_type ?? row.entityType,
      entityId: row.entity_id ?? row.entityId,
      hospitalType: row.hospital_type ?? row.hospitalType ?? null,
      fieldsToTranslate: (row.fields_to_translate ?? row.fieldsToTranslate ?? {}) as Record<string, unknown>,
      targetLanguages: (row.target_languages ?? row.targetLanguages ?? []) as string[],
      sourceLanguage: row.source_language ?? row.sourceLanguage ?? null,
      targetLanguage: row.target_language ?? row.targetLanguage ?? null,
      detectedLanguage: row.detected_language ?? row.detectedLanguage ?? null,
      status: row.status as import('@medical-crm/domain').TranslationTaskStatus,
      errorMessage: row.error_message ?? row.errorMessage ?? null,
      retryCount: row.retry_count ?? row.retryCount ?? 0,
      createdAt: new Date(row.created_at ?? row.createdAt),
      startedAt: row.started_at ?? row.startedAt ? new Date(row.started_at ?? row.startedAt) : null,
      completedAt: row.completed_at ?? row.completedAt ? new Date(row.completed_at ?? row.completedAt) : null,
    });
  }
}
```

- [ ] **Step 4: Verify typecheck**

Run: `cd packages/infrastructure && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add packages/domain/__tests__/translation-task.entity.test.ts packages/infrastructure/database/repositories/drizzle-translation-task.repository.ts
git commit -m "feat(infra): add DrizzleTranslationTaskRepository with atomic pull"
```

### Task 7: Implement OpenAI batch translation service

**Files:**
- Create: `packages/infrastructure/services/openai-batch-translation.service.ts`
- Create: `packages/infrastructure/__tests__/openai-batch-translation.service.test.ts`

- [ ] **Step 1: Write unit test with mocked OpenAI**

```ts
// packages/infrastructure/__tests__/openai-batch-translation.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { OpenAIBatchTranslationService } from '../services/openai-batch-translation.service.js';

describe('OpenAIBatchTranslationService', () => {
  it('calls OpenAI with correct prompt and returns parsed result', async () => {
    const mockResponse = {
      detected_language: 'zh',
      translations: {
        en: { subject: 'Hello', description: 'World' },
        ru: { subject: 'Привет', description: 'Мир' },
      },
    };

    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }],
          }),
        },
      },
    };

    const service = new OpenAIBatchTranslationService('fake-key');
    // @ts-expect-error — inject mock client
    service['client'] = mockClient;

    const result = await service.translateBatch({
      fields: { subject: '你好', description: '世界' },
      targetLanguages: ['en', 'ru'],
    });

    expect(result.detectedLanguage).toBe('zh');
    expect(result.translations.en).toEqual({ subject: 'Hello', description: 'World' });
    expect(result.translations.ru).toEqual({ subject: 'Привет', description: 'Мир' });
    expect(mockClient.chat.completions.create).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/infrastructure && npx vitest run __tests__/openai-batch-translation.service.test.ts`
Expected: FAIL (service not created yet)

- [ ] **Step 3: Write the service**

```ts
// packages/infrastructure/services/openai-batch-translation.service.ts
import OpenAI from 'openai';
import type { IBatchTranslationService, BatchTranslateRequest, BatchTranslateResult } from '@medical-crm/domain';

export class OpenAIBatchTranslationService implements IBatchTranslationService {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async translateBatch(request: BatchTranslateRequest): Promise<BatchTranslateResult> {
    const { fields, targetLanguages } = request;

    const systemPrompt = `You are a professional medical translator.
Given a JSON object of text fields, do the following:
1. Auto-detect the source language of the text
2. Translate ALL fields into each of the requested target languages: ${targetLanguages.join(', ')}
3. Return a JSON object with this exact structure:
{
  "detected_language": "<iso-639-1 code>",
  "translations": {
    "<lang>": { <translated fields matching input key names and structure> },
    ...
  }
}
Rules:
- Do NOT include the source language in the translations object
- Preserve JSON structure, arrays, and nesting exactly as given
- Skip empty or null values (keep them as-is)
- Use formal medical terminology where appropriate
- Return ONLY valid JSON, no markdown or explanation`;

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(fields) },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI translation');
    }

    const parsed = JSON.parse(content) as {
      detected_language: string;
      translations: Record<string, Record<string, unknown>>;
    };

    // Remove source language from translations if present
    const detectedLang = parsed.detected_language;
    delete parsed.translations[detectedLang];

    return {
      detectedLanguage: detectedLang,
      translations: parsed.translations,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/infrastructure && npx vitest run __tests__/openai-batch-translation.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/services/openai-batch-translation.service.ts packages/infrastructure/__tests__/openai-batch-translation.service.test.ts
git commit -m "feat(infra): add OpenAIBatchTranslationService with GPT-4o JSON mode"
```

### Task 8: Implement TranslationWritebackService

**Files:**
- Create: `packages/infrastructure/services/translation-writeback.service.ts`

- [ ] **Step 1: Write the writeback service**

```ts
// packages/infrastructure/services/translation-writeback.service.ts
import { eq, sql } from 'drizzle-orm';
import type { CrmDb } from '../database/crm-client.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TranslationTask } from '@medical-crm/domain';
import type { BatchTranslateResult } from '@medical-crm/domain';
import {
  supportTickets,
  supportTicketReplies,
  consultations,
  questionCollectorTemplates,
  questionCollectorResponses,
  chatbotFaqItems,
  chatbotFaqCategories,
} from '../database/schema/index.js';

const CRM_TABLE_MAP: Record<string, any> = {
  support_ticket: supportTickets,
  support_ticket_reply: supportTicketReplies,
  consultation: consultations,
  qc_template: questionCollectorTemplates,
  qc_response: questionCollectorResponses,
  chatbot_faq_item: chatbotFaqItems,
  chatbot_faq_category: chatbotFaqCategories,
};

export class TranslationWritebackService {
  constructor(
    private readonly crmDb: CrmDb,
    private readonly beautySupabase: SupabaseClient,
    private readonly chinaSupabase: SupabaseClient,
  ) {}

  async writeback(task: TranslationTask, result: BatchTranslateResult): Promise<void> {
    switch (task.sourceDb) {
      case 'crm':
        await this.crmWriteback(task, result);
        break;
      case 'supabase_beauty':
        await this.supabaseWriteback(this.beautySupabase, task, result);
        break;
      case 'supabase_china':
        await this.supabaseWriteback(this.chinaSupabase, task, result);
        break;
    }
  }

  private async crmWriteback(task: TranslationTask, result: BatchTranslateResult): Promise<void> {
    const table = CRM_TABLE_MAP[task.entityType];
    if (!table) throw new Error(`Unknown CRM entity type: ${task.entityType}`);

    // Merge new translations with existing
    await this.crmDb
      .update(table)
      .set({
        translations: sql`COALESCE(${table.translations}, '{}'::jsonb) || ${JSON.stringify(result.translations)}::jsonb`,
      })
      .where(eq(table.id, task.entityId));
  }

  private async supabaseWriteback(
    client: SupabaseClient,
    task: TranslationTask,
    result: BatchTranslateResult,
  ): Promise<void> {
    switch (task.entityType) {
      case 'surgeon':
        await this.writebackSurgeon(client, task.entityId, result);
        break;
      case 'procedure_case':
        await this.writebackProcedureCase(client, task.entityId, result);
        break;
      case 'hospital_info':
        await this.writebackHospitalInfo(client, task, result);
        break;
      default:
        throw new Error(`Unknown Supabase entity type: ${task.entityType}`);
    }
  }

  private async writebackSurgeon(
    client: SupabaseClient,
    surgeonId: string,
    result: BatchTranslateResult,
  ): Promise<void> {
    // Read existing translations
    const { data: surgeon } = await client
      .from('surgeons')
      .select('translations')
      .eq('id', surgeonId)
      .single();

    const existing = (surgeon?.translations ?? {}) as Record<string, unknown>;
    const merged = { ...existing, ...result.translations };

    await client
      .from('surgeons')
      .update({ translations: merged })
      .eq('id', surgeonId);
  }

  private async writebackProcedureCase(
    client: SupabaseClient,
    caseId: string,
    result: BatchTranslateResult,
  ): Promise<void> {
    const { data: existing } = await client
      .from('procedure_cases')
      .select('translations')
      .eq('id', caseId)
      .single();

    const merged = { ...(existing?.translations ?? {}), ...result.translations };

    await client
      .from('procedure_cases')
      .update({ translations: merged })
      .eq('id', caseId);
  }

  private async writebackHospitalInfo(
    client: SupabaseClient,
    task: TranslationTask,
    result: BatchTranslateResult,
  ): Promise<void> {
    // Determine which table to use based on sourceDb
    const tableName = task.sourceDb === 'supabase_beauty'
      ? 'hospital_translations'
      : 'hospital_i18n';

    for (const [lang, fields] of Object.entries(result.translations)) {
      if (tableName === 'hospital_translations') {
        // Beauty: upsert into hospital_translations
        await client
          .from(tableName)
          .upsert(
            { hospital_id: task.entityId, language_code: lang, ...fields },
            { onConflict: 'hospital_id,language_code' },
          );
      } else {
        // China: upsert into hospital_i18n
        await client
          .from(tableName)
          .upsert(
            { hospital_id: task.entityId, locale: lang, ...fields },
            { onConflict: 'hospital_id,locale' },
          );
      }
    }
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/infrastructure && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add packages/infrastructure/services/translation-writeback.service.ts
git commit -m "feat(infra): add TranslationWritebackService with CRM/Supabase routing"
```

---

## Chunk 3: Application Layer — Service + Worker Use Cases

### Task 9: Create TranslationTaskService

**Files:**
- Create: `packages/application/src/services/translation-task.service.ts`
- Create: `packages/application/__tests__/translation-task.service.test.ts`

- [ ] **Step 1: Write unit test**

```ts
// packages/application/__tests__/translation-task.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TranslationTaskService } from '../src/services/translation-task.service.js';
import { TranslationTask } from '@medical-crm/domain';

describe('TranslationTaskService', () => {
  const mockRepo = {
    upsert: vi.fn(),
    pullPending: vi.fn(),
    markProcessing: vi.fn(),
    markCompleted: vi.fn(),
    markFailedOrRetry: vi.fn(),
    resetForRetry: vi.fn(),
    findByEntity: vi.fn(),
  };

  it('enqueue calls repo.upsert with correct params', async () => {
    const service = new TranslationTaskService(mockRepo);
    const task = new TranslationTask({
      id: 't1', sourceDb: 'crm', entityType: 'support_ticket', entityId: 'e1',
      hospitalType: null, fieldsToTranslate: { subject: 'Hi' }, targetLanguages: ['en'],
      sourceLanguage: null, targetLanguage: null, detectedLanguage: null,
      status: 'pending', errorMessage: null, retryCount: 0,
      createdAt: new Date(), startedAt: null, completedAt: null,
    });
    mockRepo.upsert.mockResolvedValue(task);

    await service.enqueue({
      sourceDb: 'crm',
      entityType: 'support_ticket',
      entityId: 'e1',
      fieldsToTranslate: { subject: 'Hi' },
    });

    expect(mockRepo.upsert).toHaveBeenCalledWith({
      sourceDb: 'crm',
      entityType: 'support_ticket',
      entityId: 'e1',
      fieldsToTranslate: { subject: 'Hi' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/application && npx vitest run __tests__/translation-task.service.test.ts`

- [ ] **Step 3: Write the service**

```ts
// packages/application/src/services/translation-task.service.ts
import type { ITranslationTaskRepository, EnqueueTranslationInput } from '@medical-crm/domain';

export class TranslationTaskService {
  constructor(private readonly taskRepo: ITranslationTaskRepository) {}

  async enqueue(input: EnqueueTranslationInput): Promise<void> {
    // Filter out empty/null fields before enqueuing
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input.fieldsToTranslate)) {
      if (value !== null && value !== undefined && value !== '') {
        filtered[key] = value;
      }
    }
    if (Object.keys(filtered).length === 0) return;

    await this.taskRepo.upsert({ ...input, fieldsToTranslate: filtered });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/application && npx vitest run __tests__/translation-task.service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/translation-task.service.ts packages/application/__tests__/translation-task.service.test.ts
git commit -m "feat(app): add TranslationTaskService with enqueue and field filtering"
```

### Task 10: Create ProcessTranslationTasksUseCase

**Files:**
- Create: `packages/application/src/use-cases/translations/process-translation-tasks.use-case.ts`

- [ ] **Step 1: Write the use case**

```ts
// packages/application/src/use-cases/translations/process-translation-tasks.use-case.ts
import type { ITranslationTaskRepository, IBatchTranslationService } from '@medical-crm/domain';

export interface TranslationWriteback {
  writeback(task: import('@medical-crm/domain').TranslationTask, result: import('@medical-crm/domain').BatchTranslateResult): Promise<void>;
}

export interface ProcessTranslationTasksResult {
  processed: number;
  failed: number;
}

export class ProcessTranslationTasksUseCase {
  constructor(
    private readonly taskRepo: ITranslationTaskRepository,
    private readonly translationService: IBatchTranslationService,
    private readonly writebackService: TranslationWriteback,
  ) {}

  async execute(batchSize = 5): Promise<ProcessTranslationTasksResult> {
    const tasks = await this.taskRepo.pullPending(batchSize);
    let processed = 0;
    let failed = 0;

    for (const task of tasks) {
      try {
        const result = await this.translationService.translateBatch({
          fields: task.fieldsToTranslate,
          targetLanguages: task.targetLanguages,
        });

        await this.writebackService.writeback(task, result);
        await this.taskRepo.markCompleted(task.id, result.detectedLanguage);
        processed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        await this.taskRepo.markFailedOrRetry(task.id, errorMsg, task.retryCount);
        failed++;
      }
    }

    return { processed, failed };
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/application && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/use-cases/translations/process-translation-tasks.use-case.ts
git commit -m "feat(app): add ProcessTranslationTasksUseCase worker"
```

### Task 11: Create retry and status use cases

**Files:**
- Create: `packages/application/src/use-cases/translations/retry-translation.use-case.ts`
- Create: `packages/application/src/use-cases/translations/get-translation-status.use-case.ts`

- [ ] **Step 1: Write retry use case**

```ts
// packages/application/src/use-cases/translations/retry-translation.use-case.ts
import type { ITranslationTaskRepository, SourceDb } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface RetryTranslationInput {
  sourceDb: SourceDb;
  entityType: string;
  entityId: string;
}

export class RetryTranslationUseCase {
  constructor(private readonly taskRepo: ITranslationTaskRepository) {}

  async execute(input: RetryTranslationInput, actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }
    await this.taskRepo.resetForRetry(input.sourceDb, input.entityType, input.entityId);
  }
}
```

- [ ] **Step 2: Write status use case**

```ts
// packages/application/src/use-cases/translations/get-translation-status.use-case.ts
import type { ITranslationTaskRepository, SourceDb } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface TranslationStatusResult {
  status: string | null;
  retryCount: number;
  errorMessage: string | null;
  detectedLanguage: string | null;
}

export class GetTranslationStatusUseCase {
  constructor(private readonly taskRepo: ITranslationTaskRepository) {}

  async execute(
    sourceDb: SourceDb,
    entityType: string,
    entityId: string,
    actor: Actor,
  ): Promise<TranslationStatusResult | null> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }
    const task = await this.taskRepo.findByEntity(sourceDb, entityType, entityId);
    if (!task) return null;

    return {
      status: task.status,
      retryCount: task.retryCount,
      errorMessage: task.errorMessage,
      detectedLanguage: task.detectedLanguage,
    };
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/application && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/translations/
git commit -m "feat(app): add retry and status translation use cases"
```

---

## Chunk 4: Module Integration — Hook Into Existing Use Cases

### Task 12: Hook translation into Support Tickets

**Files:**
- Modify: `packages/application/src/use-cases/tickets/create-ticket.use-case.ts`
- Modify: `packages/application/src/use-cases/tickets/reply-to-ticket.use-case.ts`

- [ ] **Step 1: Modify CreateTicketUseCase**

Add `TranslationTaskService` as a constructor dependency and enqueue after save:

```ts
// In constructor:
constructor(
  private readonly ticketRepo: ISupportTicketRepository,
  private readonly translationTaskService: TranslationTaskService,
) {}

// After `const saved = await this.ticketRepo.save(entity);`:
await this.translationTaskService.enqueue({
  sourceDb: 'crm',
  entityType: 'support_ticket',
  entityId: saved.id,
  fieldsToTranslate: {
    subject: input.subject ?? '',
    description: input.description,
  },
});
```

- [ ] **Step 2: Modify ReplyToTicketUseCase**

Add `TranslationTaskService` and enqueue for non-internal replies:

```ts
// In constructor:
constructor(
  private readonly ticketRepo: ISupportTicketRepository,
  private readonly replyRepo: ISupportTicketReplyRepository,
  private readonly translationTaskService: TranslationTaskService,
) {}

// After `const saved = await this.replyRepo.save(reply);`:
if (!isInternalNote) {
  await this.translationTaskService.enqueue({
    sourceDb: 'crm',
    entityType: 'support_ticket_reply',
    entityId: saved.id,
    fieldsToTranslate: { content: input.content },
  });
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/application && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/tickets/
git commit -m "feat(app): hook translation into support ticket create/reply"
```

### Task 13: Hook translation into Consultations

**Files:**
- Modify: `packages/application/src/use-cases/consultations/create-consultation.use-case.ts`
- Modify: `packages/application/src/use-cases/consultations/update-consultation.use-case.ts`

- [ ] **Step 1: Modify CreateConsultationUseCase**

Add `TranslationTaskService` and enqueue when notes present:

```ts
// In constructor — add translationTaskService parameter
// After save:
if (input.notes) {
  await this.translationTaskService.enqueue({
    sourceDb: 'crm',
    entityType: 'consultation',
    entityId: saved.id,
    fieldsToTranslate: { notes: input.notes },
  });
}
```

- [ ] **Step 2: Modify UpdateConsultationUseCase**

Enqueue when notes changed:

```ts
// After save:
if (input.notes !== undefined) {
  await this.translationTaskService.enqueue({
    sourceDb: 'crm',
    entityType: 'consultation',
    entityId: saved.id,
    fieldsToTranslate: { notes: input.notes },
  });
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/application && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/consultations/
git commit -m "feat(app): hook translation into consultation create/update"
```

### Task 14: Hook translation into Chatbot FAQ

**Files:**
- Modify: `packages/application/src/use-cases/chatbot-faq/create-faq-item.use-case.ts`
- Modify: `packages/application/src/use-cases/chatbot-faq/update-faq-item.use-case.ts`
- Modify: `packages/application/src/use-cases/chatbot-faq/create-faq-category.use-case.ts`

- [ ] **Step 1: Modify CreateFaqItemUseCase**

```ts
// Add translationTaskService to constructor
// After save:
await this.translationTaskService.enqueue({
  sourceDb: 'crm',
  entityType: 'chatbot_faq_item',
  entityId: saved.id,
  fieldsToTranslate: { question: input.question, answer: input.answer },
});
```

- [ ] **Step 2: Modify UpdateFaqItemUseCase**

```ts
// After save — only enqueue if question or answer changed:
const fieldsToTranslate: Record<string, string> = {};
if (input.question !== undefined) fieldsToTranslate.question = input.question;
if (input.answer !== undefined) fieldsToTranslate.answer = input.answer;
if (Object.keys(fieldsToTranslate).length > 0) {
  await this.translationTaskService.enqueue({
    sourceDb: 'crm',
    entityType: 'chatbot_faq_item',
    entityId: saved.id,
    fieldsToTranslate,
  });
}
```

- [ ] **Step 3: Modify CreateFaqCategoryUseCase**

```ts
// After save:
await this.translationTaskService.enqueue({
  sourceDb: 'crm',
  entityType: 'chatbot_faq_category',
  entityId: saved.id,
  fieldsToTranslate: { name: input.name },
});
```

- [ ] **Step 4: Verify typecheck**

Run: `cd packages/application && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/chatbot-faq/
git commit -m "feat(app): hook translation into FAQ item/category create/update"
```

### Task 15: Hook translation into Question Collectors

**Files:**
- Modify: `packages/application/src/use-cases/question-collector/create-template.use-case.ts`
- Modify: `packages/application/src/use-cases/question-collector/update-template.use-case.ts`
- Modify: `packages/application/src/use-cases/question-collector/submit-response.use-case.ts`

- [ ] **Step 1: Modify CreateTemplateUseCase**

```ts
// Add translationTaskService to constructor
// After save:
await this.translationTaskService.enqueue({
  sourceDb: 'crm',
  entityType: 'qc_template',
  entityId: saved.id,
  fieldsToTranslate: {
    templateName: input.templateName,
    questions: input.questions,
  },
});
```

- [ ] **Step 2: Modify UpdateTemplateUseCase**

Find the existing `update-template.use-case.ts`, add `translationTaskService`, and enqueue when templateName or questions changed.

- [ ] **Step 3: Modify SubmitResponseUseCase**

```ts
// Add translationTaskService to constructor
// After save:
await this.translationTaskService.enqueue({
  sourceDb: 'crm',
  entityType: 'qc_response',
  entityId: saved.id,
  fieldsToTranslate: { responses: input.responses as Record<string, unknown> },
});
```

- [ ] **Step 4: Verify typecheck**

Run: `cd packages/application && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/question-collector/
git commit -m "feat(app): hook translation into QC template/response create/update"
```

### Task 16: Hook translation into Materials use cases

**Files:**
- Modify: `packages/application/src/use-cases/materials/update-hospital-info.use-case.ts`
- Modify: `packages/application/src/use-cases/materials/create-surgeon.use-case.ts`
- Modify: `packages/application/src/use-cases/materials/update-surgeon.use-case.ts`
- Modify: `packages/application/src/use-cases/materials/create-before-after-case.use-case.ts`
- Modify: `packages/application/src/use-cases/materials/update-before-after-case.use-case.ts`

- [ ] **Step 1: Add translationTaskService to each use case constructor**

Each materials use case needs a `TranslationTaskService` injected.

- [ ] **Step 2: Determine sourceDb from hospital type**

The materials use cases already have access to hospital type (COSMETIC vs REGULAR). Map to sourceDb:

```ts
const sourceDb = hospitalType === 'COSMETIC' ? 'supabase_beauty' : 'supabase_china';
```

- [ ] **Step 3: Enqueue in UpdateHospitalInfoUseCase**

```ts
// After save:
await this.translationTaskService.enqueue({
  sourceDb,
  entityType: 'hospital_info',
  entityId: hospitalId,
  hospitalType: hospitalType ?? null,
  fieldsToTranslate: {
    // Extract user-facing text fields from input
    tagline: input.tagline,
    description: input.description,
    // ... other translatable fields based on hospitalType
  },
});
```

- [ ] **Step 4: Enqueue in surgeon create/update**

```ts
await this.translationTaskService.enqueue({
  sourceDb,
  entityType: 'surgeon',
  entityId: saved.id,
  fieldsToTranslate: {
    title: input.title,
    bio: input.bio,
    specialties: input.specialties,
    education: input.education,
    certifications: input.certifications,
  },
});
```

- [ ] **Step 5: Enqueue in before/after case create/update**

```ts
await this.translationTaskService.enqueue({
  sourceDb,
  entityType: 'procedure_case',
  entityId: saved.id,
  fieldsToTranslate: {
    description: input.description,
    provider_name: input.providerName,
  },
});
```

- [ ] **Step 6: Verify typecheck**

Run: `cd packages/application && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/use-cases/materials/
git commit -m "feat(app): hook translation into materials hospital/surgeon/case use cases"
```

---

## Chunk 5: API Routes + Wiring + Final Tests

### Task 17: Create translation API routes

**Files:**
- Create: `apps/api/src/routes/translations.routes.ts`

- [ ] **Step 1: Write the route file**

```ts
// apps/api/src/routes/translations.routes.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// POST /api/v2/translations/retry
const retryRoute = createRoute({
  method: 'post',
  path: '/api/v2/translations/retry',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            sourceDb: z.enum(['crm', 'supabase_beauty', 'supabase_china']),
            entityType: z.string(),
            entityId: z.string().uuid(),
          }),
        },
      },
    },
  },
  responses: { 200: { description: 'Translation task reset for retry' } },
});

app.openapi(retryRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = c.get('actor');
  const svc = getServices();
  await svc.retryTranslation.execute(body, actor);
  return c.json({ ok: true }, 200);
});

// GET /api/v2/translations/status
const statusRoute = createRoute({
  method: 'get',
  path: '/api/v2/translations/status',
  request: {
    query: z.object({
      sourceDb: z.enum(['crm', 'supabase_beauty', 'supabase_china']),
      entityType: z.string(),
      entityId: z.string().uuid(),
    }),
  },
  responses: { 200: { description: 'Translation status' } },
});

app.openapi(statusRoute, async (c) => {
  const { sourceDb, entityType, entityId } = c.req.valid('query');
  const actor = c.get('actor');
  const svc = getServices();
  const result = await svc.getTranslationStatus.execute(sourceDb as any, entityType, entityId, actor);
  return c.json(result ?? { status: null }, 200);
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/translations.routes.ts
git commit -m "feat(api): add /translations/retry and /translations/status routes"
```

### Task 18: Add process-translation-tasks to internal routes

**Files:**
- Modify: `apps/api/src/routes/internal.routes.ts`

- [ ] **Step 1: Add the worker endpoint**

Add after the existing `process-message-tasks` route:

```ts
// POST /api/v2/internal/process-translation-tasks
const processTranslationTasksRoute = createRoute({
  method: 'post',
  path: '/api/v2/internal/process-translation-tasks',
  responses: { 200: { description: 'Translation tasks processed' } },
});

app.openapi(processTranslationTasksRoute, async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  const { INTERNAL_API_SECRET } = getServerEnv();
  if (!secret || secret !== INTERNAL_API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const svc = getServices();
  const result = await svc.processTranslationTasks.execute();
  return c.json(result, 200);
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/internal.routes.ts
git commit -m "feat(api): add /internal/process-translation-tasks worker endpoint"
```

### Task 19: Register routes in route index

**Files:**
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Import and mount translations routes**

```ts
import translationsRoutes from './translations.routes.js';
// Mount after other protected routes:
app.route('/', translationsRoutes);
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/index.ts
git commit -m "feat(api): register translations routes"
```

### Task 20: Wire everything in composition-root.ts

**Files:**
- Modify: `apps/api/src/composition-root.ts`

- [ ] **Step 1: Add imports**

```ts
import { DrizzleTranslationTaskRepository } from '@medical-crm/infrastructure/database/repositories/drizzle-translation-task.repository.js';
import { OpenAIBatchTranslationService } from '@medical-crm/infrastructure/services/openai-batch-translation.service.js';
import { TranslationWritebackService } from '@medical-crm/infrastructure/services/translation-writeback.service.js';
import { TranslationTaskService } from '@medical-crm/application/services/translation-task.service.js';
import { ProcessTranslationTasksUseCase } from '@medical-crm/application/use-cases/translations/process-translation-tasks.use-case.js';
import { RetryTranslationUseCase } from '@medical-crm/application/use-cases/translations/retry-translation.use-case.js';
import { GetTranslationStatusUseCase } from '@medical-crm/application/use-cases/translations/get-translation-status.use-case.js';
```

- [ ] **Step 2: Instantiate in getServices()**

```ts
// After existing repo/service instantiation:
const translationTaskRepo = new DrizzleTranslationTaskRepository(crmDb);
const batchTranslationService = new OpenAIBatchTranslationService(process.env['OPENAI_API_KEY'] ?? '');
const translationWritebackService = new TranslationWritebackService(crmDb, mainSupabase, chinaSupabase);
const translationTaskService = new TranslationTaskService(translationTaskRepo);
```

- [ ] **Step 3: Update use case instantiation to inject translationTaskService**

Update all modified use cases to pass `translationTaskService`:

```ts
// Support tickets
createTicket: new CreateTicketUseCase(ticketRepo, translationTaskService),
replyToTicket: new ReplyToTicketUseCase(ticketRepo, replyRepo, translationTaskService),

// Consultations
createConsultation: new CreateConsultationUseCase(consultationRepo, caseRepo, translationTaskService),
updateConsultation: new UpdateConsultationUseCase(consultationRepo, translationTaskService),

// FAQ
createFaqItem: new CreateFaqItemUseCase(faqRepo, translationTaskService),
updateFaqItem: new UpdateFaqItemUseCase(faqRepo, translationTaskService),
createFaqCategory: new CreateFaqCategoryUseCase(faqRepo, translationTaskService),

// Question Collectors
createTemplate: new CreateTemplateUseCase(qcRepo, translationTaskService),
updateTemplate: new UpdateTemplateUseCase(qcRepo, translationTaskService),
submitQCResponse: new SubmitResponseUseCase(qcRepo, caseRepo, translationTaskService),

// Materials (these may need different wiring depending on current constructor signatures)
// ... add translationTaskService to each materials use case

// New use cases
processTranslationTasks: new ProcessTranslationTasksUseCase(translationTaskRepo, batchTranslationService, translationWritebackService),
retryTranslation: new RetryTranslationUseCase(translationTaskRepo),
getTranslationStatus: new GetTranslationStatusUseCase(translationTaskRepo),
```

- [ ] **Step 4: Add to AppServices interface**

```ts
processTranslationTasks: ProcessTranslationTasksUseCase;
retryTranslation: RetryTranslationUseCase;
getTranslationStatus: GetTranslationStatusUseCase;
```

- [ ] **Step 5: Verify typecheck**

Run: `npx turbo typecheck`
Expected: All packages pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/composition-root.ts
git commit -m "feat(api): wire translation infrastructure in composition root"
```

### Task 21: Run full test suite

- [ ] **Step 1: Run all unit tests**

Run: `npx turbo test`
Expected: All tests pass

- [ ] **Step 2: Fix any failures**

Address any test failures from constructor signature changes in existing use case tests.

- [ ] **Step 3: Run full typecheck**

Run: `npx turbo typecheck`
Expected: All packages pass

- [ ] **Step 4: Final commit**

```bash
git commit -m "fix: resolve test failures from translation service integration"
```

---

## Summary

| Chunk | Tasks | What It Delivers |
|-------|-------|-----------------|
| 1: Foundation | 1-5 | Domain types, config, schema migrations |
| 2: Core Infrastructure | 6-8 | Task repository, OpenAI batch service, writeback service |
| 3: Application Layer | 9-11 | Enqueue service, worker use case, retry/status |
| 4: Module Integration | 12-16 | All 6 modules hooked into translation pipeline |
| 5: API + Wiring | 17-21 | Routes, composition root, full test pass |

**Total: 21 tasks, ~80 steps**

Each chunk produces a working, typechecking codebase. The system is fully operational after Chunk 5.
