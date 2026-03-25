# Unified AI Translation System Design

## Overview

A unified, async AI translation system covering 6+ modules across CRM DB and two Supabase instances. Uses JSONB columns for translation storage + the existing `translation_tasks` table as a centralized async queue + OpenAI GPT-4o for translation with automatic language detection.

**Message TEXT translation remains inline (synchronous)** — all other modules use the async queue.

## Modules & Translatable Fields

### CRM DB Modules

| Module | Table | Translatable Fields | Storage |
|--------|-------|---------------------|---------|
| Support Tickets | `support_tickets` | `subject`, `description` | New `translations jsonb` column |
| Support Ticket Replies | `support_ticket_replies` | `content` | New `translations jsonb` column |
| Consultations | `consultations` | `notes` | New `translations jsonb` column |
| Consultation Transcripts | `consultation_transcripts` | `entries[]` (each entry's text) | Already has `translatedLang` + `entries` structure |
| QC Templates | `question_collector_templates` | `templateName`, each question's `label`/`placeholder`/`options` | New `translations jsonb` column |
| QC Responses | `question_collector_responses` | Answer text values | New `translations jsonb` column |
| Cases (AI Summary) | `cases` | `aiSummary` | Existing `aiSummaryZh`/`aiSummaryEn` fields (keep as-is) |

### Supabase Beauty (Main Supabase - Cosmetic Hospitals)

| Module | Table | Translatable Fields | Storage |
|--------|-------|---------------------|---------|
| Hospital Info | `hospital_translations` | `tagline`, `description`, `highlights` | Existing table — one row per `(hospital_id, language_code)` |
| Hospital Nearby | `hospital_nearby_attractions` | `name` | Existing table — one row per `(hospital_id, language_code)` |
| Procedures | `procedures` | `procedure_name`, `description` | Add `translations jsonb` column |
| Surgeons | `surgeons` | `title`, `bio.intro`, `bio.expertise`, `bio.philosophy`, `bio.achievements`, `specialties[]`, `education[]`, `certifications[]` | Existing `translations jsonb` column |
| Before/After Cases | `procedure_cases` | `description`, `provider_name` | Add `translations jsonb` column |

### Supabase China Medical (Regular Hospitals)

| Module | Table | Translatable Fields | Storage |
|--------|-------|---------------------|---------|
| Hospital Info | `hospital_i18n` | `display_name`, `name`, `hospital_type`, `tier`, `ownership_type`, `short_description`, `overview`, `full_description`, `value_proposition`, `core_specialties`, `departments_info`, `facilities_info` | Existing table — one row per `(hospital_id, locale)` |
| Hospital Extended | `hospitals` | `airport_services`, `followup_care`, `amenities`, `payment_methods`, `equipment`, `certifications`, `supported_languages` | These are JSONB columns on the main table; translations go into `hospital_i18n` rows |
| Surgeons | `surgeons` | Same as beauty | Existing `translations jsonb` column |
| Before/After Cases | `procedure_cases` | `description`, `procedure_name`, `provider_name` | Add `translations jsonb` column |

## Architecture

### High-Level Flow

```
Entity Create/Update
    → TranslationTaskService.enqueue({entityType, entityId, sourceDb, fieldsToTranslate})
    → INSERT into translation_tasks (status: 'pending')

Worker (cron / internal API)
    → ProcessTranslationTasksUseCase.execute()
    → Pull pending tasks (atomic: SELECT ... FOR UPDATE SKIP LOCKED)
    → For each task:
        → OpenAI: detect source language + translate all fields to target languages
        → Write translations back to entity table (CRM or Supabase)
        → Mark task completed
    → On failure:
        → retry_count < 3 → increment retry_count, reset to 'pending'
        → retry_count >= 3 → mark 'failed'

Manual Retry (UI)
    → POST /api/translations/retry {entityType, entityId}
    → Reset task: status='pending', retry_count=0
```

### Core Components

| Component | Layer | Responsibility |
|-----------|-------|----------------|
| `ITranslationTaskService` | Domain Port | Interface for enqueue, retry, query status |
| `TranslationTaskService` | Application | Enqueue logic, deduplication, retry reset |
| `ProcessTranslationTasksUseCase` | Application | Worker: pull → translate → write back |
| `OpenAITranslationService` | Infrastructure | Extended: `translateBatch()`, `detectLanguage()` |
| `DrizzleTranslationTaskRepository` | Infrastructure | CRM DB task queue CRUD |
| `TranslationWritebackService` | Infrastructure | Routes write-back to correct DB (CRM / Supabase Beauty / Supabase China) |

### Dependency Flow

```
API Route (trigger)
  → Use Case (TranslationTaskService / ProcessTranslationTasksUseCase)
    → Domain Port (ITranslationTaskService, ITranslationService)
      → Infrastructure (DrizzleTranslationTaskRepository, OpenAITranslationService, TranslationWritebackService)
```

## Database Changes

### Extend `translation_tasks` Table (CRM DB)

Current schema already has: `id`, `hospitalType`, `entityType`, `entityId`, `sourceLanguage`, `targetLanguage`, `status`, `errorMessage`, `retryCount`, `createdAt`, `startedAt`, `completedAt`.

**Changes needed:**

```sql
-- Add columns
ALTER TABLE translation_tasks
  ADD COLUMN source_db VARCHAR(20) DEFAULT 'crm',           -- 'crm' | 'supabase_beauty' | 'supabase_china'
  ADD COLUMN fields_to_translate JSONB,                       -- {"title": "原文", "description": "原文"}
  ADD COLUMN target_languages TEXT[],                         -- ['en','ru','fr',...]
  ADD COLUMN detected_language VARCHAR(10);                   -- filled after OpenAI detection

-- Drop old unique constraint and replace with new deduplication model
DROP INDEX IF EXISTS translation_tasks_hospital_type_entity_type_entity_id_sourc_key;
CREATE UNIQUE INDEX translation_tasks_entity_dedup
  ON translation_tasks (entity_type, entity_id)
  WHERE status IN ('pending', 'processing');

-- hospitalType becomes nullable (CRM-origin tasks don't have it; replaced by source_db for routing)
ALTER TABLE translation_tasks ALTER COLUMN hospital_type DROP NOT NULL;

-- targetLanguage becomes nullable (replaced by target_languages array)
-- Keep column for backward compat with existing records, new records use target_languages[]
```

### Add `translations jsonb` to CRM Tables

```sql
ALTER TABLE support_tickets ADD COLUMN translations JSONB DEFAULT '{}';
ALTER TABLE support_ticket_replies ADD COLUMN translations JSONB DEFAULT '{}';
ALTER TABLE consultations ADD COLUMN translations JSONB DEFAULT '{}';
ALTER TABLE question_collector_templates ADD COLUMN translations JSONB DEFAULT '{}';
ALTER TABLE question_collector_responses ADD COLUMN translations JSONB DEFAULT '{}';
```

### Add `translations jsonb` to Supabase Tables (where missing)

```sql
-- Beauty Supabase
ALTER TABLE procedure_cases ADD COLUMN translations JSONB DEFAULT '{}';

-- China Medical Supabase
ALTER TABLE procedure_cases ADD COLUMN translations JSONB DEFAULT '{}';
```

### Relationship to `message_tasks`

The existing `message_tasks` table and `ProcessMessageTasksUseCase` remain **unchanged** — they handle message-specific async tasks (IMAGE/FILE summarization and translation). The new `translation_tasks` system is for entity-level batch translation only. These are two separate pipelines:

- `message_tasks` → message translation/summarization (existing, keep as-is)
- `translation_tasks` → entity-level multi-language batch translation (new/extended)

> **Note:** The existing `ProcessMessageTasksUseCase` has known bugs (non-atomic `pullPending`, broken retry logic). These should be fixed separately but are out of scope for this spec.

### Worker Atomicity

The new `ProcessTranslationTasksUseCase` MUST use atomic task pulling to prevent concurrent worker races:

```sql
-- Atomic pull: SELECT ... FOR UPDATE SKIP LOCKED
-- This requires raw SQL or Drizzle's for('update').skipLocked() support
-- The existing message_tasks pullPending uses a plain SELECT (known bug) — do NOT copy that pattern
```

### Retry Logic

The new retry logic differs from the existing (broken) `message_tasks` pattern:

- On failure: increment `retry_count`, keep `status = 'pending'` (so it gets re-pulled)
- When `retry_count >= 3`: set `status = 'failed'` (terminal state)
- Manual retry via API: resets `status = 'pending'` AND `retry_count = 0`

## JSONB Translation Storage Format

### Standard Format (CRM DB entities)

```jsonb
{
  "en": { "subject": "Visa Inquiry", "description": "I need help..." },
  "zh": { "subject": "签证问题", "description": "我需要帮助..." },
  "ru": { "subject": "Запрос по визе", "description": "Мне нужна помощь..." },
  "fr": { "subject": "Demande de visa", "description": "J'ai besoin d'aide..." }
}
```

### QC Template Format (nested questions)

```jsonb
{
  "zh": {
    "templateName": "医疗问诊表",
    "questions": {
      "q1": { "label": "主诉", "placeholder": "请描述..." },
      "q2": { "label": "病史" },
      "q3": { "label": "当前症状", "options": ["疼痛", "肿胀", "麻木"] }
    }
  },
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

### Surgeon Bio Format (existing `translations` column)

```jsonb
{
  "en": {
    "title": "Chief Physician",
    "bio": {
      "intro": "Dr. Zhang is a renowned...",
      "expertise": "Specializing in...",
      "philosophy": "Patient-centered care...",
      "achievements": ["Published 50+ papers", "WHO advisor"]
    },
    "specialties": ["Oncology Surgery", "Minimally Invasive"],
    "education": ["MD, Peking University"],
    "certifications": ["Board Certified"]
  },
  "ru": { ... },
  "fr": { ... }
}
```

## OpenAI Integration

### Extended `ITranslationService` Interface

```typescript
export interface IBatchTranslationService {
  translateBatch(request: BatchTranslateRequest): Promise<BatchTranslateResult>;
}

export interface BatchTranslateRequest {
  fields: Record<string, string | string[] | Record<string, unknown>>;
  targetLanguages: string[];
  // No sourceLanguage — OpenAI auto-detects
}

export interface BatchTranslateResult {
  detectedLanguage: string;
  translations: Record<string, Record<string, unknown>>;
  // e.g. { "en": { "title": "...", "description": "..." }, "ru": { ... } }
}
```

### OpenAI Prompt Strategy

Single request per task — translate all fields into all target languages at once:

```typescript
const systemPrompt = `You are a professional medical translator.
Given a JSON object of fields, translate ALL fields into the requested target languages.
Auto-detect the source language.
Return a JSON object with this exact structure:
{
  "detected_language": "<iso-639-1 code>",
  "translations": {
    "<lang>": { <translated fields matching input structure> },
    ...
  }
}
Do NOT include the source language in translations.
Preserve JSON structure, arrays, and nesting.
Use formal medical terminology where appropriate.`;
```

**Parameters:**
- Model: `gpt-4o`
- Temperature: `0.3`
- Response format: `{ type: "json_object" }`
- Max tokens: scaled by input size

### Large Text Handling

For entities with large text (e.g., consultation transcripts with many entries):
- Split into chunks if total input exceeds ~4000 tokens
- Translate each chunk separately
- Reassemble into final JSONB structure

## API Endpoints

### Translation Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/translations/retry` | Admin, Hospital | Reset failed task: `{ entityType, entityId }` |
| `GET` | `/api/translations/status` | Admin, Hospital | Query status: `?entityType=X&entityId=Y` |
| `POST` | `/api/internal/process-translation-tasks` | Internal/Worker | Pull and process pending tasks |

### Trigger Points (automatic, inside existing use cases)

| Use Case | When | Fields Enqueued |
|----------|------|-----------------|
| `CreateSupportTicketUseCase` | After create | `subject`, `description` |
| `UpdateSupportTicketUseCase` | After update (if translatable fields changed) | Changed fields |
| `ReplySupportTicketUseCase` | After reply created | `content` |
| `CreateConsultationUseCase` | After create (if notes present) | `notes` |
| `UpdateConsultationUseCase` | After update (if notes changed) | `notes` |
| `UploadTranscriptUseCase` | After transcript saved | `entries` |
| `CreateQCTemplateUseCase` | After create | `templateName`, questions |
| `UpdateQCTemplateUseCase` | After update | Changed fields |
| `SubmitQCResponseUseCase` | After submit | Answer text values |
| Materials CRUD use cases | After create/update | Per-entity translatable fields |

## Translation Writeback Strategy

The `TranslationWritebackService` routes completed translations to the correct database:

```typescript
class TranslationWritebackService {
  async writeback(task: TranslationTask, result: BatchTranslateResult): Promise<void> {
    switch (task.sourceDb) {
      case 'crm':
        // UPDATE entity SET translations = $result WHERE id = $entityId
        await this.crmWriteback(task, result);
        break;
      case 'supabase_beauty':
        // Route to beauty Supabase, handle per-table differences
        await this.beautyWriteback(task, result);
        break;
      case 'supabase_china':
        // Route to china medical Supabase, handle hospital_i18n structure
        await this.chinaWriteback(task, result);
        break;
    }
  }
}
```

### Supabase Beauty Writeback Details

- **Surgeons**: Write to `surgeons.translations` JSONB column directly
- **Hospital Info**: UPSERT into `hospital_translations` table (one row per language_code)
- **Procedure Cases**: Write to `procedure_cases.translations` JSONB column
- **Procedures**: Add `translations` JSONB column (consistent with overall design)

### Supabase China Medical Writeback Details

- **Surgeons**: Write to `surgeons.translations` JSONB column
- **Hospital Info**: UPSERT into `hospital_i18n` table (one row per locale)
- **Procedure Cases**: Write to `procedure_cases.translations` JSONB column

## Medical Intake Refactor: Cases → Question Collector

### Current State

Cases table has fixed intake fields: `primaryDiagnosis`, `medicalHistory`, `symptoms`, `conditionSummary`, `structuredData`, `riskFlags`.

Cases table already has: `questionCollectorTemplateId` (FK to `question_collector_templates`).

### Target State

- **Deprecate** fixed intake fields (keep in DB for backward compat, stop writing new data to them)
- **Medical Intake = QC Template questions + QC Response answers**
- **Translation follows QC**: template questions translated via QC Template `translations` JSONB, patient answers translated via QC Response `translations` JSONB
- **CaseDetail UI**: Medical Intake tab reads QC data; falls back to legacy fields for old cases

### Data Flow

```
Admin creates QC Template (medical intake questions)
  → Template auto-translated via translation_tasks queue
  → Template assigned to hospital/case type

Patient fills out intake form (QC Response)
  → Response saved to question_collector_responses
  → Response auto-translated via translation_tasks queue
  → Case linked via questionCollectorTemplateId

CaseDetail page renders Medical Intake:
  → Load QC Template (questions) + QC Response (answers)
  → Display in user's locale using translations JSONB
  → Fallback: if no QC data, show legacy fixed fields
```

### Seed Data for Testing

Insert sample QC Templates mimicking the current fixed intake structure:
- "Medical Intake Form" with questions: Chief Complaint (text), Medical History (textarea), Current Symptoms (multiselect), Risk Factors (checkbox), Condition Summary (textarea)
- Link existing cases to these templates for testing

## Translation Configuration

```typescript
// packages/domain/src/config/translation.config.ts

export const TRANSLATION_CONFIG = {
  supportedLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'] as const,

  defaultTargetLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'],

  translatableFields: {
    support_ticket: ['subject', 'description'],
    support_ticket_reply: ['content'],
    consultation: ['notes'],
    consultation_transcript: ['entries'],
    qc_template: ['templateName', 'questions.*.label', 'questions.*.placeholder', 'questions.*.options'],
    qc_response: ['answers.*.value'],
    surgeon: ['title', 'bio.intro', 'bio.expertise', 'bio.philosophy', 'bio.achievements', 'specialties', 'education', 'certifications'],
    hospital_beauty: ['tagline', 'description', 'highlights'],
    hospital_china: ['display_name', 'hospital_type', 'tier', 'short_description', 'overview', 'full_description', 'value_proposition', 'core_specialties', 'departments_info', 'facilities_info'],
    procedure_case: ['description', 'provider_name'],
  },

  retry: {
    maxRetries: 3,
  },
} as const;
```

## Frontend Rendering Pattern

```typescript
// Utility function for all modules
function getTranslated<T>(
  entity: { translations?: Record<string, T> },
  locale: string,
  fallback: T,
): T {
  return entity.translations?.[locale] ?? fallback;
}

// Usage example
const ticket = await fetchSupportTicket(id);
const subject = getTranslated(ticket, locale, { subject: ticket.subject }).subject;

// For Supabase entities with separate translation tables (hospital_translations, hospital_i18n),
// the API layer merges translations into a unified response shape before sending to frontend.
```

## Error Handling & Observability

- **Failed tasks**: `status='failed'`, `errorMessage` contains OpenAI error details
- **UI retry button**: Calls `POST /api/translations/retry` → resets task
- **Monitoring**: Query `translation_tasks WHERE status='failed'` for dashboard alerts
- **Idempotency**: Same `(entityType, entityId)` with pending/processing task → update existing task instead of creating duplicate

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

Adding a new language: append to `TRANSLATION_CONFIG.supportedLanguages`, then batch-retranslate existing entities if needed.

## Migration Strategy

### CRM DB
- Use Drizzle Kit to generate migration files for schema changes (new columns on existing tables, `translation_tasks` alterations)
- Run via `drizzle-kit generate` → `drizzle-kit migrate`

### Supabase (Beauty + China Medical)
- Write raw SQL migration files in `/migrations/` directory
- Apply via Supabase Dashboard or `supabase db push`
- Order: Supabase migrations first (add `translations` columns), then CRM DB migrations

### Rollback
- All changes are additive (new columns, new indexes) — safe to roll back by ignoring new columns
- No data loss risk since existing columns remain untouched

## Rate Limiting & Cost

- **Worker concurrency**: Process 1 task at a time per worker invocation (configurable batch size)
- **OpenAI rate limit**: Respect GPT-4o tokens-per-minute limit; worker backs off on 429 errors
- **Estimated cost per entity**: ~$0.01–0.05 depending on field count and text length (9 target languages × ~500 tokens avg)
- **Bulk retranslation**: When adding a new language, batch jobs should throttle to avoid quota exhaustion

## Testing Strategy

- **Unit tests**: `TranslationTaskService` (enqueue, dedup, retry reset), `TranslationWritebackService` (routing logic), `OpenAITranslationService` (mock OpenAI responses)
- **Integration tests**: Full flow from enqueue → process → writeback for each `sourceDb` type
- **OpenAI mock**: Use a mock `IBatchTranslationService` in tests that returns deterministic translations
- **Seed data**: QC Templates for medical intake testing, sample entities across all modules

## Out of Scope

- Message TEXT inline translation (keep existing implementation)
- Real-time translation streaming
- Per-hospital language customization (future enhancement)
- Materials Supabase schema unification (beauty vs china medical — use existing structures as-is)
