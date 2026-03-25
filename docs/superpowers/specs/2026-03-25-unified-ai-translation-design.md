# Unified AI Translation System Design

## Overview

This design defines a unified, async AI translation system for business data across CRM DB and two Supabase instances.

It uses:

- JSONB translation storage where the source schema is entity-local
- existing translation tables where the source schema is already locale-row based
- the existing `translation_tasks` table as the centralized async queue, but with a revised identity model
- OpenAI GPT-4o for translation with automatic source-language detection

**Message TEXT translation remains inline (synchronous).** This spec covers entity-level multilingual content, not the existing message flow.

## Scope

### In Scope for V1

- Materials
- Chatbot & FAQ
- Support Tickets
- Consultations (`notes` only)
- Question Collectors
- Case medical intake display, but only through Question Collector once that path exists

### Explicitly Out of Scope for V1

- message inline translation
- consultation transcript multi-language persistence redesign
- global rework of beauty `procedures` catalog ownership
- full medical intake migration from legacy `cases` fields to QC

## Modules & Translatable Fields

### CRM DB Modules

| Module | Table | Translatable Fields | Storage |
|--------|-------|---------------------|---------|
| Support Tickets | `support_tickets` | `subject`, `description` | New `translations jsonb` column |
| Support Ticket Replies | `support_ticket_replies` | `content` when `is_internal_note = false` | New `translations jsonb` column |
| Consultations | `consultations` | `notes` | New `translations jsonb` column |
| QC Templates | `question_collector_templates` | `templateName`, question labels/placeholders/options | New `translations jsonb` column |
| QC Responses | `question_collector_responses` | Patient answer text values | New `translations jsonb` column |
| Chatbot FAQ Items | `chatbot_faq_items` | `question`, `answer` | New `translations jsonb` column |
| Chatbot FAQ Categories | `chatbot_faq_categories` | `name` | New `translations jsonb` column |
| Cases (AI Summary) | `cases` | `aiSummary` | Keep current `aiSummary` + `aiSummaryZh`/`aiSummaryEn` behavior for now |

### Supabase Beauty (Main Supabase - Cosmetic Hospitals)

| Module | Table | Translatable Fields | Storage |
|--------|-------|---------------------|---------|
| Hospital Info | `hospital_translations` | `tagline`, `description`, locale-facing highlight text | Existing locale rows |
| Hospital Nearby | `hospital_nearby_attractions` | `name` | Existing locale rows if table supports per-language rows; otherwise defer |
| Surgeons | `surgeons` | `title`, `bio.intro`, `bio.expertise`, `bio.philosophy`, `bio.achievements`, `specialties[]`, `education[]`, `certifications[]` | Existing `translations jsonb` column |
| Before/After Cases | `procedure_cases` | `description`, `provider_name` | Add `translations jsonb` column |
| Procedures | `hospital_procedures` presentation payload | Deferred in V1 | Beauty currently reads from shared global `procedures` catalog; do not auto-translate shared catalog rows in V1 |

### Supabase China Medical (Regular Hospitals)

| Module | Table | Translatable Fields | Storage |
|--------|-------|---------------------|---------|
| Hospital Info | `hospital_i18n` | locale-facing descriptive fields already stored per locale | Existing locale rows |
| Hospital Extended | `hospitals` | `airport_services`, `followup_care`, `amenities`, `payment_methods`, `equipment`, `certifications`, `supported_languages` when they are user-facing text | Write translated values into `hospital_i18n`-backed payloads or defer per field if the live schema has no stable locale slot |
| Surgeons | `surgeons` | Same as beauty | Existing `translations jsonb` column |
| Before/After Cases | `procedure_cases` | `description`, `procedure_name`, `provider_name` | Add `translations jsonb` column |

### Deferred Modules

| Module | Reason |
|--------|--------|
| Consultation Transcripts | Current schema only supports a single `translated_lang` plus optional per-entry `translatedText`; not a true multi-locale store |
| Beauty Procedures | Current beauty implementation uses a shared global `procedures` catalog and intentionally does not update it during hospital-specific edits |
| Legacy Case Medical Intake Fields | Current hospital UI still derives intake primarily from `cases` fields / `structuredData`; migration to QC is a separate project |

## Architecture

### High-Level Flow

```text
Entity Create/Update
    -> TranslationTaskService.enqueue({ sourceDb, entityType, entityId, fieldsToTranslate })
    -> UPSERT translation_tasks (status: 'pending')

Worker (cron / internal API)
    -> ProcessTranslationTasksUseCase.execute()
    -> Pull pending tasks atomically (SELECT ... FOR UPDATE SKIP LOCKED)
    -> For each task:
        -> detect source language
        -> translate all requested fields into target languages
        -> write translations back to the correct DB
        -> mark task completed
    -> On failure:
        -> retry_count < 3 -> increment retry_count, set status='pending'
        -> retry_count >= 3 -> mark status='failed'

Manual Retry (UI)
    -> POST /api/translations/retry { sourceDb, entityType, entityId }
    -> Reset task: status='pending', retry_count=0
```

### Core Components

| Component | Layer | Responsibility |
|-----------|-------|----------------|
| `ITranslationTaskRepository` | Domain Port | Task enqueue, pull, retry, status |
| `TranslationTaskService` | Application | Enqueue logic, deduplication, changed-field merge |
| `ProcessTranslationTasksUseCase` | Application | Worker: pull -> translate -> write back |
| `IBatchTranslationService` | Domain Port | Batch translation contract |
| `OpenAITranslationService` | Infrastructure | GPT-backed translation implementation |
| `DrizzleTranslationTaskRepository` | Infrastructure | CRM queue CRUD |
| `TranslationWritebackService` | Infrastructure | Routes writeback to CRM / Supabase Beauty / Supabase China |

### Dependency Flow

```text
API / Use Case trigger
  -> TranslationTaskService
    -> ITranslationTaskRepository
    -> IBatchTranslationService
    -> TranslationWritebackService
```

## Database Changes

### Extend `translation_tasks` Table (CRM DB)

Current schema already has:

- `id`
- `hospitalType`
- `entityType`
- `entityId`
- `sourceLanguage`
- `targetLanguage`
- `status`
- `errorMessage`
- `retryCount`
- `createdAt`
- `startedAt`
- `completedAt`

**Changes needed:**

```sql
ALTER TABLE translation_tasks
  ADD COLUMN source_db VARCHAR(32) NOT NULL DEFAULT 'crm',     -- 'crm' | 'supabase_beauty' | 'supabase_china'
  ADD COLUMN fields_to_translate JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN target_languages TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN detected_language VARCHAR(10);

ALTER TABLE translation_tasks
  ALTER COLUMN hospital_type DROP NOT NULL;

ALTER TABLE translation_tasks
  ALTER COLUMN target_language DROP NOT NULL;

DROP INDEX IF EXISTS translation_tasks_hospital_type_entity_type_entity_id_sourc_key;

CREATE UNIQUE INDEX translation_tasks_entity_dedup
  ON translation_tasks (source_db, entity_type, entity_id)
  WHERE status IN ('pending', 'processing');
```

### Why `source_db` Must Be Part of Identity

This system routes tasks across three databases. `entity_type + entity_id` alone is not a safe task identity for:

- `procedure_case` in Beauty Supabase
- `procedure_case` in China Medical Supabase
- future entities with the same logical type name across DBs

All task APIs, retries, and status queries must use:

- `sourceDb`
- `entityType`
- `entityId`

### Add `translations jsonb` to CRM Tables

```sql
ALTER TABLE support_tickets ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE support_ticket_replies ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE consultations ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE question_collector_templates ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE question_collector_responses ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE chatbot_faq_items ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE chatbot_faq_categories ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;
```

### Add `translations jsonb` to Supabase Tables (where missing)

```sql
-- Beauty Supabase
ALTER TABLE procedure_cases ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;

-- China Medical Supabase
ALTER TABLE procedure_cases ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;
```

### Relationship to `message_tasks`

`message_tasks` and `ProcessMessageTasksUseCase` remain separate.

- `message_tasks` -> message translation / summarization
- `translation_tasks` -> entity-level multilingual translation

Do not reuse the current message-task pull pattern for the new worker. The new worker must be atomic.

### Worker Atomicity

The new `ProcessTranslationTasksUseCase` MUST use atomic task pulling:

```sql
SELECT ...
FROM translation_tasks
WHERE status = 'pending'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT ?
```

### Retry Logic

- On failure: increment `retry_count`, keep `status = 'pending'`
- When `retry_count >= 3`: set `status = 'failed'`
- Manual retry: reset `status = 'pending'` and `retry_count = 0`

## Translation Storage Format

### Standard JSONB Shape

```json
{
  "en": { "subject": "Visa Inquiry", "description": "I need help..." },
  "zh": { "subject": "签证问题", "description": "我需要帮助..." },
  "ru": { "subject": "Запрос по визе", "description": "Мне нужна помощь..." }
}
```

### FAQ Item Shape

```json
{
  "en": { "question": "Do you offer visa support?", "answer": "Yes, we do." },
  "zh": { "question": "是否提供签证支持？", "answer": "是的，提供。" }
}
```

### QC Template Shape

```json
{
  "en": {
    "templateName": "Medical Intake Form",
    "questions": {
      "q1": { "label": "Chief Complaint", "placeholder": "Please describe..." },
      "q2": { "label": "Medical History" },
      "q3": { "label": "Current Symptoms", "options": ["Pain", "Swelling", "Numbness"] }
    }
  }
}
```

### Important Constraint: QC Payload Must Be Canonical First

Current code stores:

- `question_collector_templates.questions` as `unknown`
- `question_collector_responses.responses` as `unknown`

Before translation is implemented, application code must define and enforce a stable QC JSON shape, for example:

```ts
type QCTemplateQuestion = {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date';
  label: string;
  placeholder?: string;
  options?: string[];
};

type QCResponsePayload = Record<string, string | string[] | null>;
```

Without that canonical shape, the translation worker cannot safely extract or write back nested QC fields.

## OpenAI Integration

### Batch Translation Interface

```ts
export interface IBatchTranslationService {
  translateBatch(request: BatchTranslateRequest): Promise<BatchTranslateResult>;
}

export interface BatchTranslateRequest {
  fields: Record<string, string | string[] | Record<string, unknown>>;
  targetLanguages: string[];
}

export interface BatchTranslateResult {
  detectedLanguage: string;
  translations: Record<string, Record<string, unknown>>;
}
```

### Prompt Strategy

Single request per task:

- auto-detect the source language
- preserve JSON structure
- translate only user-facing text
- skip empty/null values
- do not emit the source language inside the translation result set

### Large Text Handling

For large text blobs:

- split when input exceeds a safe token budget
- translate chunk-by-chunk
- reassemble into the same target structure

### Transcript Rule for V1

Consultation transcript translation is **not** included in V1 multi-language storage.

Reason:

- current schema supports only one `translatedLang`
- current entity shape supports only one optional `translatedText` per entry

If transcript translation is needed later, it should use one of these designs:

- `consultation_transcripts.translations jsonb`
- child table keyed by `(consultation_id, locale)`

## API Endpoints

### Translation Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/translations/retry` | Admin, Hospital | Reset failed task: `{ sourceDb, entityType, entityId }` |
| `GET` | `/api/translations/status` | Admin, Hospital | Query status: `?sourceDb=X&entityType=Y&entityId=Z` |
| `POST` | `/api/internal/process-translation-tasks` | Internal/Worker | Pull and process pending tasks |

### Trigger Points

| Use Case | When | Fields Enqueued |
|----------|------|-----------------|
| `CreateSupportTicketUseCase` | After create | `subject`, `description` |
| `UpdateSupportTicketUseCase` | After update when user-facing fields changed | changed fields |
| `ReplyToTicketUseCase` | After reply create when `isInternalNote = false` | `content` |
| `CreateConsultationUseCase` | After create when `notes` present | `notes` |
| `UpdateConsultationUseCase` | After update when `notes` changed | `notes` |
| `CreateQCTemplateUseCase` | After create | `templateName`, question text fields |
| `UpdateQCTemplateUseCase` | After update | changed fields |
| `SubmitQCResponseUseCase` | After submit | patient answer values |
| `CreateFaqItemUseCase` | After create | `question`, `answer` |
| `UpdateFaqItemUseCase` | After update | changed fields |
| FAQ category create/update use cases | After create/update | `name` |
| Materials hospital/surgeon/case mutations | After create/update | per-entity translatable fields |

## Translation Writeback Strategy

```ts
class TranslationWritebackService {
  async writeback(task: TranslationTask, result: BatchTranslateResult): Promise<void> {
    switch (task.sourceDb) {
      case 'crm':
        await this.crmWriteback(task, result);
        break;
      case 'supabase_beauty':
        await this.beautyWriteback(task, result);
        break;
      case 'supabase_china':
        await this.chinaWriteback(task, result);
        break;
    }
  }
}
```

### CRM Writeback

- `support_tickets.translations`
- `support_ticket_replies.translations`
- `consultations.translations`
- `question_collector_templates.translations`
- `question_collector_responses.translations`
- `chatbot_faq_items.translations`
- `chatbot_faq_categories.translations`

### Supabase Beauty Writeback

- surgeons -> `surgeons.translations`
- hospital info -> upsert locale rows into `hospital_translations`
- before/after cases -> `procedure_cases.translations`
- procedures -> deferred in V1

### Supabase China Writeback

- surgeons -> `surgeons.translations`
- hospital info -> upsert locale rows into `hospital_i18n`
- before/after cases -> `procedure_cases.translations`

## Medical Intake Strategy

### Current State

Today the codebase still has two realities:

- patient intake use cases are stubbed
- hospital case detail still derives intake from `cases` legacy fields / `structuredData`

### V1 Decision

Do **not** make medical intake migration a prerequisite for translation rollout.

Instead:

- ship translation for QC templates and QC responses
- keep hospital case detail fallback behavior for legacy cases
- treat "medical intake rendered from QC end-to-end" as a separate follow-up project

### Follow-Up Project: Cases -> QC Intake Migration

That later project should handle:

- replacing the patient intake stub routes with DB-backed QC flows
- linking cases to QC templates / responses end-to-end
- switching case detail rendering to QC-first, legacy-second
- deciding how legacy intake data is backfilled

## Translation Configuration

```ts
export const TRANSLATION_CONFIG = {
  supportedLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'] as const,

  defaultTargetLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'],

  translatableFields: {
    support_ticket: ['subject', 'description'],
    support_ticket_reply: ['content'],
    consultation: ['notes'],
    qc_template: ['templateName', 'questions.*.label', 'questions.*.placeholder', 'questions.*.options'],
    qc_response: ['responses.*'],
    chatbot_faq_item: ['question', 'answer'],
    chatbot_faq_category: ['name'],
    surgeon: ['title', 'bio.intro', 'bio.expertise', 'bio.philosophy', 'bio.achievements', 'specialties', 'education', 'certifications'],
    hospital_beauty: ['tagline', 'description', 'highlights'],
    hospital_china: ['display_name', 'name', 'hospital_type', 'tier', 'ownership_type', 'short_description', 'overview', 'full_description', 'value_proposition', 'core_specialties', 'departments_info', 'facilities_info'],
    procedure_case: ['description', 'provider_name'],
  },

  retry: {
    maxRetries: 3,
  },
} as const;
```

### Source Language Handling

The worker should:

- detect the source language once per task
- skip writing a translation for that same language
- still persist `detected_language` on the task for observability

## Frontend Rendering Pattern

```ts
function getTranslated<T>(
  entity: { translations?: Record<string, T> },
  locale: string,
  fallback: T,
): T {
  return entity.translations?.[locale] ?? fallback;
}
```

For entities already backed by locale-row tables such as `hospital_translations` / `hospital_i18n`, the API layer should merge them into a unified response shape before sending to the frontend.

## Error Handling & Observability

- failed tasks -> `status = 'failed'`, `errorMessage` captured
- UI retry button -> `POST /api/translations/retry`
- dashboard / ops query -> `translation_tasks WHERE status = 'failed'`
- idempotency -> same `(source_db, entity_type, entity_id)` with pending/processing task updates the existing task payload instead of inserting a duplicate

## Supported Languages

| Code | Language |
|------|----------|
| `zh` | Chinese (Simplified) |
| `en` | English |
| `ru` | Russian |
| `fr` | French |
| `es` | Spanish |
| `de` | German |
| `ar` | Arabic |
| `id` | Indonesian |
| `vi` | Vietnamese |

## Migration Strategy

### CRM DB

- generate Drizzle migrations for CRM schema changes
- update Drizzle schema and repository/entity mappings together

### Supabase

- write raw SQL migrations for Supabase schema changes
- apply per database
- only add `translations` columns to tables that already have stable ownership and stable read/write paths

### Safe Rollout Order

1. add schema columns
2. ship backend write/read support
3. enable worker
4. enqueue backfill for selected entities
5. expose translated content in UI

## Rate Limiting & Cost

- worker concurrency starts at 1 task per invocation
- back off on 429 / quota errors
- large entities should be chunked conservatively
- new language backfills must be throttled

## Testing Strategy

- unit tests for enqueue, dedup, retry reset, field-merge behavior
- integration tests for CRM / Beauty / China writeback routing
- mock `IBatchTranslationService` for deterministic tests
- fixtures for FAQ, QC, support tickets, materials, consultations

## Out of Scope

- message inline translation
- consultation transcript multi-locale redesign
- beauty global `procedures` catalog redesign
- full legacy-case medical-intake migration
- per-hospital custom language packs
