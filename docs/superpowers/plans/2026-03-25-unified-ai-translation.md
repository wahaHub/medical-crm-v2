# Unified AI Translation System Implementation Plan

**Goal:** Ship async multilingual AI translation for Support Tickets, Consultations, FAQ, Question Collectors, and Materials, using the design in `docs/superpowers/specs/2026-03-25-unified-ai-translation-design.md`.

**Important boundary:** This plan intentionally does **not** implement:

- consultation transcript multi-locale storage
- beauty shared `procedures` catalog translation
- full legacy medical-intake migration from `cases` to QC

This plan is written to match the current repository structure and current DTO / use-case contracts.

---

## Implementation Principles

1. `translation_tasks` identity is `(source_db, entity_type, entity_id)`.
2. QC translation starts only after QC payload shape is canonicalized.
3. Materials hospital-info writeback must reuse the existing Beauty / China field-mapping rules, not a generic locale-row upsert.
4. Do not add automatic commits to the implementation flow. The repo may be dirty.
5. Treat partial unique index support in `translation_tasks` as intentional SQL-level behavior; do not assume Drizzle schema can perfectly model it.

---

## Deliverables

### CRM DB

- extend `translation_tasks`
- add `translations jsonb` to:
  - `support_tickets`
  - `support_ticket_replies`
  - `consultations`
  - `question_collector_templates`
  - `question_collector_responses`
  - `chatbot_faq_items`
  - `chatbot_faq_categories`

### Supabase

- add `translations jsonb` to `procedure_cases` in both Beauty and China Supabase

### Backend

- add translation task domain types and ports
- add translation-task repository
- add batch translation service
- add translation writeback service
- add enqueue / retry / status / worker use cases
- wire module create/update flows to enqueue translation tasks
- add translation management routes and internal worker route

---

## Execution Order

## Chunk 1: Foundation

### Task 1: Add domain translation types and config

Create:

- `packages/domain/src/enums/translation.ts`
- `packages/domain/src/enums/translation.config.ts`
- `packages/domain/src/entities/translation-task.entity.ts`
- `packages/domain/src/ports/translation-task-repository.port.ts`
- `packages/domain/src/ports/batch-translation-service.port.ts`

Update:

- `packages/domain/src/enums/index.ts`
- `packages/domain/src/index.ts`

Requirements:

- add `TranslationTaskStatus`, `SourceDb`, `SupportedLanguage`
- add `TRANSLATION_CONFIG`
- add `TranslationTask` entity with:
  - `markProcessing()`
  - `markCompleted(detectedLanguage)`
  - `markFailedOrRetry(error)`
  - `resetForRetry()`

### Task 2: Canonicalize QC payload shape before translation work

Current problem:

- `question_collector_templates.questions` is `unknown`
- `question_collector_responses.responses` is `unknown`

Before implementing QC translation, define a stable shape in application/domain code.

Minimum target shape:

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

Requirements:

- centralize normalization helpers for template questions and response payloads
- use those helpers when enqueueing QC translation tasks
- do not cast raw `unknown` payloads directly into translation input

### Task 3: Extend CRM schema

Modify:

- `packages/infrastructure/database/schema/schema.ts`

Add to `translation_tasks`:

- `source_db`
- `fields_to_translate`
- `target_languages`
- `detected_language`

Relax:

- `hospital_type` nullable
- `target_language` nullable

Add `translations jsonb` to the 7 CRM tables listed above.

### Task 4: Add hand-written CRM migration

Create the next numbered migration after `023_*`.

Suggested file name:

- `packages/infrastructure/database/migrations/024_unified_translation.sql`

Requirements:

- extend `translation_tasks`
- add CRM `translations` columns
- create partial unique index:

```sql
CREATE UNIQUE INDEX translation_tasks_entity_dedup
  ON translation_tasks (source_db, entity_type, entity_id)
  WHERE status IN ('pending', 'processing');
```

Important:

- update `schema.ts` manually
- write the SQL migration manually
- do **not** rely on `drizzle-kit generate` to "regenerate schema.ts from live DB"

### Task 5: Add Supabase migrations

Create:

- `packages/infrastructure/supabase-main/migrations/001_add_procedure_cases_translations.sql`
- `packages/infrastructure/supabase-china/migrations/001_add_procedure_cases_translations.sql`

Each adds:

```sql
ALTER TABLE procedure_cases
  ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
```

---

## Chunk 2: Core Infrastructure

### Task 6: Implement `DrizzleTranslationTaskRepository`

Create:

- `packages/infrastructure/database/repositories/drizzle-translation-task.repository.ts`

Responsibilities:

- `upsert(input)`
- `pullPending(limit)` with atomic claim
- `markCompleted`
- `markFailedOrRetry`
- `resetForRetry`
- `findByEntity`

Implementation notes:

- it is acceptable to use raw SQL for atomic pull / partial-index upsert
- if `ON CONFLICT` on the partial unique index becomes awkward, use a transaction:
  - lock existing pending/processing task for entity
  - update merged fields if found
  - otherwise insert

### Task 7: Implement batch translation service

Create:

- `packages/infrastructure/services/openai-batch-translation.service.ts`

Responsibilities:

- call GPT-4o in JSON mode
- detect source language
- translate nested fields while preserving structure
- skip empty / null values

Do not modify the existing inline message translation service. This is a separate service.

### Task 8: Implement `TranslationWritebackService`

Create:

- `packages/infrastructure/services/translation-writeback.service.ts`

Responsibilities by source DB:

- `crm`
  - merge into entity `translations jsonb`
- `supabase_beauty`
  - surgeons -> merge `surgeons.translations`
  - procedure cases -> merge `procedure_cases.translations`
  - hospital info -> use Beauty-specific field mapping logic
- `supabase_china`
  - surgeons -> merge `surgeons.translations`
  - procedure cases -> merge `procedure_cases.translations`
  - hospital info -> use China-specific field mapping logic

Important:

- do **not** implement a generic `hospital_info` upsert like `{ hospital_id, locale, ...fields }`
- instead reuse the existing repository field rules:
  - Beauty maps selected fields into `hospital_translations`
  - China maps selected fields into `hospital_i18n`, including `facilities_info` / `departments_info` merge behavior

Recommended structure:

- private `crmWriteback(task, result)`
- private `beautyWriteback(task, result)`
- private `chinaWriteback(task, result)`
- private helpers per entity type

---

## Chunk 3: Application Layer

### Task 9: Implement `TranslationTaskService`

Create:

- `packages/application/src/services/translation-task.service.ts`

Responsibilities:

- enqueue translation task
- merge changed fields into existing pending/processing task
- default target languages from `TRANSLATION_CONFIG`
- filter out empty values

### Task 10: Implement translation worker use case

Create:

- `packages/application/src/use-cases/translations/process-translation-tasks.use-case.ts`

Responsibilities:

- pull pending tasks
- call batch translation service
- remove detected source language from target writeback set if present
- delegate to `TranslationWritebackService`
- mark completed or failed/retry

### Task 11: Implement retry / status use cases

Create:

- `packages/application/src/use-cases/translations/retry-translation.use-case.ts`
- `packages/application/src/use-cases/translations/get-translation-status.use-case.ts`

Both must query by:

- `sourceDb`
- `entityType`
- `entityId`

---

## Chunk 4: Module Integration

### Task 12: Support Tickets

Modify:

- `packages/application/src/use-cases/tickets/create-ticket.use-case.ts`
- `packages/application/src/use-cases/tickets/reply-to-ticket.use-case.ts`

Rules:

- enqueue ticket translation after create for `subject`, `description`
- enqueue reply translation only when `isInternalNote === false`

### Task 13: Consultations

Modify:

- `packages/application/src/use-cases/consultations/create-consultation.use-case.ts`
- `packages/application/src/use-cases/consultations/update-consultation.use-case.ts`

Rules:

- enqueue only `notes`
- do not add transcript translation work in V1

### Task 14: FAQ

Modify:

- `packages/application/src/use-cases/chatbot-faq/create-faq-item.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/update-faq-item.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/create-faq-category.use-case.ts`

Rules:

- FAQ item -> enqueue `question`, `answer`
- FAQ category -> enqueue `name`
- if category rename/update use case is introduced later, hook translation there too

### Task 15: Question Collectors

Modify:

- `packages/application/src/use-cases/question-collector/create-template.use-case.ts`
- `packages/application/src/use-cases/question-collector/update-template.use-case.ts`
- `packages/application/src/use-cases/question-collector/submit-response.use-case.ts`

Rules:

- template enqueue payload must use normalized question shape
- response enqueue payload must use normalized response shape
- do not pass raw `unknown` payloads straight through

### Task 16: Materials

Modify:

- `packages/application/src/use-cases/materials/update-hospital-info.use-case.ts`
- `packages/application/src/use-cases/materials/create-surgeon.use-case.ts`
- `packages/application/src/use-cases/materials/update-surgeon.use-case.ts`
- `packages/application/src/use-cases/materials/create-before-after-case.use-case.ts`
- `packages/application/src/use-cases/materials/update-before-after-case.use-case.ts`

Critical constraint:

The current use-case inputs are not identical to the final translation fields.

Examples:

- hospital info use case currently exposes `heroImage`, `photos`, `highlights`
- surgeon use cases expose `intro`, `expertise`, `philosophy`, `achievements`, not `bio`
- before/after case uses `surgeonName`, not `providerName`

So implementation must:

- use the actual current input / saved entity field names
- build translation payloads from real saved data, not from assumed future DTOs

Recommended approach:

1. after save, derive `sourceDb` from the materials repository flavor or injected context
2. build translation payload from the saved entity
3. enqueue only fields that are actually present in that module today

V1 materials payloads:

- hospital info:
  - Beauty: `highlights` only unless the use case/API is expanded to expose tagline/description
  - China: only fields that the current mutation path already persists safely
- surgeon:
  - `title`
  - `intro`
  - `expertise`
  - `philosophy`
  - `achievements`
  - `specialties`
  - `education`
  - `certifications`
- before/after case:
  - `description`
  - `provider_name` mapped from saved `surgeonName`

Do not add Beauty procedure translation work in this chunk.

---

## Chunk 5: API Layer and Wiring

### Task 17: Add translation routes

Create:

- `apps/api/src/routes/translations.routes.ts`

Routes:

- `POST /api/v2/translations/retry`
- `GET /api/v2/translations/status`

Both must use:

- `sourceDb`
- `entityType`
- `entityId`

Authorization:

- Admin and Hospital only

### Task 18: Add internal worker route

Modify:

- `apps/api/src/routes/internal.routes.ts`

Add:

- `POST /api/v2/internal/process-translation-tasks`

Pattern should match the existing `process-message-tasks` route:

- `X-Internal-Secret`
- `INTERNAL_API_SECRET`

### Task 19: Register translation routes

Modify:

- `apps/api/src/routes/index.ts`

Mount `translations.routes.ts` like the other route modules.

### Task 20: Wire composition root

Modify:

- `apps/api/src/composition-root.ts`

Responsibilities:

- instantiate `DrizzleTranslationTaskRepository`
- instantiate `OpenAIBatchTranslationService`
- instantiate `TranslationWritebackService`
- instantiate `TranslationTaskService`
- wire retry / status / worker use cases
- update constructor injection for modified module use cases

Important:

- materials use cases may need extra context to determine `sourceDb`
- if `hospitalType` is not available at use-case layer, inject `sourceDb` or a resolver instead of guessing

---

## Verification

### Required checks after each chunk

- package-local typecheck for touched package
- relevant unit tests for new service / repository / use case

### Final checks

- `npx turbo typecheck`
- targeted tests for:
  - translation task entity / repository
  - batch translation service
  - translation task service
  - worker use case
  - affected module constructor updates

### Manual smoke checks

1. create support ticket -> translation task appears
2. create FAQ item -> translation task appears
3. create QC template -> translation task appears with normalized question payload
4. process worker endpoint -> translations written back
5. retry endpoint -> failed task resets correctly

---

## Notes for Implementers

- Keep `message_tasks` completely separate from this work.
- Do not create transcript translation storage in this implementation.
- Do not touch Beauty `procedures` translation in this implementation.
- Do not assume every Drizzle index / constraint can be faithfully represented in `schema.ts`; partial unique index behavior may remain migration-only by design.
- Prefer reading saved entities for translation payload construction when current input DTOs are incomplete.

---

## Completion Criteria

This implementation is done when:

- translation tasks can be enqueued for the in-scope modules
- worker processes tasks atomically
- translations are written back to CRM / Beauty / China correctly
- retry and status APIs work with `(sourceDb, entityType, entityId)`
- QC translation uses a canonical payload shape
- materials hospital-info translation follows existing Beauty / China field-mapping rules instead of generic row upserts
