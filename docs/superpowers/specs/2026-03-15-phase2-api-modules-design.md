# Phase 2: API Business Modules — Design Spec

**Date**: 2026-03-15
**Status**: Draft
**Scope**: medical-crm-v2 backend — all new API modules for Patient/Hospital/Admin portals
**Approach**: Module-by-module vertical implementation (方案 A)
**Schema Strategy**: Incremental migration (渐进式迁移)

---

## Table of Contents

- [Section 0: Case Model Realignment](#section-0-case-model-realignment)
- [Section 0.5: Transaction / Idempotency / Migration Conventions](#section-05-transaction--idempotency--migration-conventions)
- [Section 1: Schema Migration Strategy](#section-1-schema-migration-strategy)
- [Module 1: Quotes + CaseHospitalContacts](#module-1-quotes--casehospitalcontacts)
- [Module 2: Events / Timeline](#module-2-events--timeline)
- [Module 3: Support Tickets](#module-3-support-tickets)
- [Module 4: Orders + Packages](#module-4-orders--packages)
- [Module 5: Journey](#module-5-journey)
- [Module 6: QuestionCollector](#module-6-questioncollector)
- [Module 7: ServiceCatalog + QuoteTemplates](#module-7-servicecatalog--quotetemplates)
- [Module 8: Dashboard Aggregations](#module-8-dashboard-aggregations)
- [Module 9: BookingRequest + Patient Auth / Public Flow](#module-9-bookingrequest--patient-auth--public-flow)
- [Cross-Cutting Concerns](#cross-cutting-concerns)
- [Implementation Order Summary](#implementation-order-summary)
- [Deferred / Out-of-Scope](#deferred--out-of-scope)

---

## Section 0: Case Model Realignment

> **Must be completed before any module work.**
> The current v2 Case aggregate, DTOs, validation, routes, and repositories are built around the legacy `status` (CaseStatus enum) and `stage` (CaseStage enum) model with Admin-driven manual assignment (`/api/v2/cases/:id/assign`). The patientsflow design replaces this with `assignment_status` + `treatment_stage`, and Admin no longer manually assigns — patients choose by accepting a quote.

### 0.1 What Changes

| Current (v1 model) | New (patientsflow model) | Action |
|---------------------|-------------------------|--------|
| `cases.status` (DRAFT/ACTIVE/COMPLETED/CANCELLED/ARCHIVED) | `cases.assignment_status` (UNASSIGNED/ASSIGNED) | Add new column, keep old as deprecated read-only |
| `cases.stage` (PENDING_ASSIGNMENT/TRANSFERRED_TO_HOSPITAL/...) | `cases.treatment_stage` (CONFIRMED/IN_TREATMENT/POST_TREATMENT/COMPLETED/FOLLOW_UP) | Add new column, keep old as deprecated read-only |
| `AssignCaseUseCase` (Admin manually assigns hospital) | Removed — assignment happens via `AcceptQuote` | Deprecate use case, mark route as legacy |
| `UpdateCaseStatusUseCase` | Reworked — only updates `assignment_status` with guard | Rewrite |
| `AdvanceCaseStageUseCase` | Reworked — advances `treatment_stage` with valid transitions | Rewrite |
| `caseListQuerySchema` filters on `status`/`stage` | Filters on `assignment_status`/`treatment_stage` | Update schema + repository query |
| `GetCaseStatsUseCase` counts by `status` | Counts by `assignment_status` + `treatment_stage` | Rewrite |

### 0.2 Naming & Compatibility Strategy

> **Binding decisions — do not revisit during implementation.**

**Table naming:**
- `case_hospital_contacts` is the **sole canonical name**. Do not use `case_hospital_assignments` or any alias anywhere in code, comments, or docs.
- All new tables follow snake_case plural (`quotes`, `support_tickets`, `journey_milestones`).

**Field naming:**
- `patient_id` (not `user_id`) — matches existing v2 convention (`cases.patient_id`, `consultations.patient_id`). DATA_MODELS.md recommends `user_id` but we stay consistent with the current schema. If we migrate to `user_id` later, it's a single rename.
- **Exceptions**: `booking_requests.user_id` and `question_collector_responses.user_id` use `user_id` because these entities may reference non-patient users (booking pre-signup, admin-submitted responses). This is an intentional exception, not an oversight.

**Old `status`/`stage` columns — deprecated read-only:**
- Old columns (`status` CaseStatus, `stage` CaseStage) **remain in the DB and Drizzle schema** but are explicitly **deprecated read-only**.
- v2 API code **never writes** to `status`/`stage` after M0 migration. All new code reads/writes `assignment_status`/`treatment_stage` exclusively.
- Old columns are NOT dropped — they are frozen at their last-written values for any external consumer that might still read them.
- No sync trigger, no background job. If a v1 consumer needs updated values, they must migrate to the new columns.
- Old columns will be dropped in a future Phase 3 cleanup migration, after confirming zero external readers.
- The Drizzle schema retains the old columns with JSDoc `@deprecated` annotations.

### 0.3 DB Migration (M0)

```sql
-- New enums
CREATE TYPE "CaseAssignmentStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED');
CREATE TYPE "CaseTreatmentStage" AS ENUM ('CONFIRMED', 'IN_TREATMENT', 'POST_TREATMENT', 'COMPLETED', 'FOLLOW_UP');

-- Add new columns to cases
ALTER TABLE cases ADD COLUMN assignment_status "CaseAssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED';
ALTER TABLE cases ADD COLUMN treatment_stage "CaseTreatmentStage";
ALTER TABLE cases ADD COLUMN condition_summary TEXT;
ALTER TABLE cases ADD COLUMN structured_data JSONB;
ALTER TABLE cases ADD COLUMN risk_flags TEXT[];
ALTER TABLE cases ADD COLUMN priority VARCHAR(20);
ALTER TABLE cases ADD COLUMN last_event_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN ai_summary_status "AISummaryStatus" NOT NULL DEFAULT 'PENDING';
-- NOTE: Reuses existing pgEnum "AISummaryStatus" (PENDING/PROCESSING/COMPLETED/FAILED) from schema.ts.
-- DATA_MODELS.md lists PENDING/GENERATED/REVIEWED — we follow the existing schema values.
-- If patientsflow values are needed later, add them to the enum (ALTER TYPE ... ADD VALUE).
ALTER TABLE cases ADD COLUMN question_collector_template_id UUID;

-- Backfill: map old status/stage → new assignment_status/treatment_stage
UPDATE cases SET assignment_status = 'ASSIGNED' WHERE assigned_hospital_id IS NOT NULL;
UPDATE cases SET treatment_stage = 'CONFIRMED' WHERE stage = 'HOSPITAL_CONTACTED' AND assigned_hospital_id IS NOT NULL;
UPDATE cases SET treatment_stage = 'IN_TREATMENT' WHERE stage = 'IN_TREATMENT';
UPDATE cases SET treatment_stage = 'COMPLETED' WHERE stage = 'TREATMENT_COMPLETED';

-- Indexes (per INDEX_PLAN.md)
CREATE INDEX idx_cases_user_updated ON cases(patient_id, updated_at DESC);
CREATE INDEX idx_cases_assignment_stage_created ON cases(assignment_status, treatment_stage, created_at DESC);
CREATE INDEX idx_cases_assigned_hospital_created ON cases(assigned_hospital_id, created_at DESC) WHERE assigned_hospital_id IS NOT NULL;
CREATE INDEX idx_cases_risk_flags_gin ON cases USING gin(risk_flags);
```

### 0.4 Domain Layer Changes

**case.entity.ts** — add fields: `assignmentStatus`, `treatmentStage`, `conditionSummary`, `structuredData`, `riskFlags`, `priority`, `lastEventAt`, `aiSummaryStatus`, `questionCollectorTemplateId`. Add `@deprecated` JSDoc on `status` and `stage` fields.

**case-status-transitions.ts** — replace with:
- `assignment-status-transitions.ts`: UNASSIGNED → ASSIGNED (via accept_quote), ASSIGNED → UNASSIGNED (admin reset)
- `treatment-stage-transitions.ts`: CONFIRMED → IN_TREATMENT → POST_TREATMENT → COMPLETED → FOLLOW_UP (with restart loop)

**case-repository.port.ts** — update `list()` to filter by `assignmentStatus`/`treatmentStage` instead of `status`/`stage`

### 0.5 Route Changes

| Route | Action |
|-------|--------|
| `PATCH /api/v2/cases/{id}/status` | Rewrite to update `assignment_status` only (admin reset) |
| `PATCH /api/v2/cases/{id}/stage` | Rewrite to advance `treatment_stage` with valid transitions |
| `POST /api/v2/cases/{id}/assign` | **Keep functional until Module 1 lands.** Existing hospital case detail and consultation creation depend on `assignedHospitalId` via this route. After Module 1's AcceptQuote flow is deployed, mark as deprecated (log warning) but keep working for backward compat. Remove only after confirming zero callers in a future cleanup. |
| `GET /api/v2/cases` | Update query to use `assignment_status`/`treatment_stage` filters |
| `GET /api/v2/cases/stats` | Rewrite to count by new statuses |

---

## Section 0.5: Transaction / Idempotency / Migration Conventions

> **Must be completed before Module 1.**

### 0.5.1 Migration Conventions

> **Current state**: The repo has no unified migration workflow. `db:generate` exists (Drizzle Kit) but there is no `db:migrate` command. Migration files are scattered across two locations: `<root>/migrations/` (e.g., `001-ai-summary-columns.sql`) and `packages/infrastructure/database/migrations/` (e.g., `002_create_message_tasks.sql`). This must be fixed before Phase 2 creates 7+ migration files.

**Step 1 — Consolidate migration directory:**
- All migration files live in **`packages/infrastructure/database/migrations/`** (single canonical location)
- Move `<root>/migrations/001-ai-summary-columns.sql` into the canonical directory
- Delete `<root>/migrations/` after move
- Naming convention: `NNN_<description>.sql` (e.g., `003_m0_case_realignment.sql`, `004_m1_quotes_chc.sql`)

**Step 2 — Add `db:migrate` command:**
- Add a `db:migrate` script to `packages/infrastructure/package.json` that runs all pending `.sql` files in order
- Options (pick during implementation):
  - (a) Drizzle Kit `migrate` with `drizzle.config.ts` pointing to the migration directory
  - (b) Simple Node.js script that reads `*.sql` files in order, tracks applied migrations in a `_migrations` table
  - (c) Use `drizzle-kit push` for dev and hand-written SQL for production
- The implementation plan will decide which option, but the spec requires that **one `pnpm db:migrate` command at root executes all pending migrations in order**.

**Step 3 — Root-level convenience:**
- `package.json` (root): add `"db:migrate": "pnpm --filter @medical-crm/infrastructure db:migrate"`
- Matches existing `"db:generate"` pattern

**Phase 2 migration files (in order):**

| File | Scope |
|------|-------|
| `003_m0_case_realignment.sql` | Section 0 — case columns + enums + backfill + indexes |
| `004_m1_quotes_chc.sql` | Module 1 — `case_hospital_contacts`, `quotes` + indexes |
| `005_m2_events.sql` | Module 2 — `case_events` + indexes |
| `006_m3_tickets.sql` | Module 3 — `support_tickets`, `support_ticket_replies` + indexes |
| `007_m4_orders_packages.sql` | Module 4 — `packages`, `orders` + indexes |
| `008_m5_journey.sql` | Module 5 — `case_journeys`, `journey_milestones` + indexes |
| `009_m6_question_collector.sql` | Module 6 — 3 QC tables + FK + indexes |
| `010_m7_service_catalog.sql` | Module 7 — `service_catalog_items`, `quote_templates` |
| `011_m9_booking.sql` | Module 9 — `booking_requests`, `booking_request_hospitals` + FK + indexes |

### 0.5.2 Transaction Runner

Add a `TransactionRunner` port and Drizzle implementation:

```typescript
// domain/src/ports/transaction-runner.port.ts
export interface TransactionRunner {
  run<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

// Each repository port gets an optional `tx` parameter:
export interface QuoteRepository {
  findById(id: string, tx?: Transaction): Promise<Quote | null>;
  update(id: string, data: Partial<Quote>, tx?: Transaction): Promise<Quote>;
  // ...
}
```

Drizzle implementation uses `db.transaction()`:

```typescript
// infrastructure/database/transaction-runner.ts
export class DrizzleTransactionRunner implements TransactionRunner {
  constructor(private db: PostgresJsDatabase) {}

  async run<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => fn(tx));
  }
}
```

### 0.5.3 Idempotency

For critical write operations (AcceptQuote, CompleteSignup, CreateOrder):

- Client sends `Idempotency-Key` header (UUID)
- Use case checks idempotency before executing
- Implementation: simple `idempotency_keys` table with `key`, `result`, `created_at`, TTL 24h
- Alternatively, rely on DB unique constraints as natural idempotency (e.g., `case_hospital_contacts(case_id, hospital_id)` unique)

**Explicit idempotency table required for these operations** (multi-table transactions that cannot be naturally protected by a single unique constraint):
- `AcceptQuote` — updates 4+ tables; a retry after partial failure could corrupt state
- `CompleteSignup` — creates user + case + CHCs; retry must return same result
- `CreateOrder` — payment-related, must not double-charge
- `CreatePaymentIntent` — payment-related

**DB unique constraints as supplementary protection** for simpler operations:
- `AddHospitalToCase` — `case_hospital_contacts(case_id, hospital_id)` unique
- `CreateBookingRequest` — `booking_requests(request_number)` unique

### 0.5.4 Optimistic Locking

For entities with concurrent update risk (Quote, CaseHospitalContact):

- Add `version INT NOT NULL DEFAULT 1` column
- Use case reads version, includes it in UPDATE WHERE clause
- If 0 rows updated → throw `ConcurrentUpdateError`

Apply to: `quotes`, `case_hospital_contacts`, `orders`, `support_tickets`

> **Note on `quotes.version`**: This column serves dual purpose — it is both the **business revision number** (bumped when hospital resends a quote) and the **optimistic lock version**. This is acceptable because a resend always creates a new business revision, which naturally bumps the lock. If these concerns diverge in the future, split into `revision` (business) + `lock_version` (concurrency).

---

## Section 1: Schema Migration Strategy

### 1.1 Migration Files (Ordered)

| Migration | Scope | New Tables | Alters |
|-----------|-------|------------|--------|
| M0 | Case realignment | — | cases: add 9 columns + 2 enums |
| M1 | Quotes + CHC | `case_hospital_contacts`, `quotes` | — |
| M2 | Events | `case_events` | — |
| M3 | Support Tickets | `support_tickets`, `support_ticket_replies` | — |
| M4 | Orders + Packages | `packages`, `orders` | — |
| M5 | Journey | `case_journeys`, `journey_milestones` | — |
| M6 | QuestionCollector | `question_collector_templates`, `question_collector_responses`, `question_collector_customizations` | cases: add FK |
| M7 | ServiceCatalog + QuoteTemplates | `service_catalog_items`, `quote_templates` | — |
| M9 | BookingRequest | `booking_requests`, `booking_request_hospitals` | cases: add `booking_request_id` FK |

### 1.2 Execution

- Drizzle Kit `generate` → human review SQL → `pnpm db:migrate`
- Each migration is one file, executed in order via the new `db:migrate` command (Section 0.5.1)
- All `CREATE INDEX CONCURRENTLY` for large tables
- All new status fields use **pgEnum**, not varchar

### 1.3 New Enums (Complete List)

```sql
CREATE TYPE "CaseAssignmentStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED');
CREATE TYPE "CaseTreatmentStage" AS ENUM ('CONFIRMED', 'IN_TREATMENT', 'POST_TREATMENT', 'COMPLETED', 'FOLLOW_UP');
CREATE TYPE "CHCSubStatus" AS ENUM ('DISTRIBUTED', 'NEED_INFO', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REMOVED');
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "PackageType" AS ENUM ('CONSULTATION', 'HEALTH_CHECKUP', 'SECOND_OPINION', 'VISA_PACKAGE', 'INSURANCE', 'ACCOMMODATION', 'TREATMENT_DEPOSIT', 'TRANSLATION');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'REFUNDED', 'CANCELLED');
CREATE TYPE "OrderType" AS ENUM ('CONSULTATION', 'HEALTH_CHECKUP', 'SECOND_OPINION', 'VISA_PACKAGE', 'INSURANCE', 'ACCOMMODATION', 'TREATMENT_DEPOSIT', 'TRANSLATION');
CREATE TYPE "TicketType" AS ENUM ('ACCOUNT_ISSUES', 'PAYMENT_PROBLEMS', 'HOSPITAL_COMMUNICATION', 'DOCUMENT_HELP', 'VISA_TRAVEL', 'GENERAL_QUESTIONS', 'FEEDBACK');
CREATE TYPE "TicketPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'PENDING_INFO', 'RESOLVED', 'CLOSED');
CREATE TYPE "TicketReplyRole" AS ENUM ('ADMIN', 'PATIENT');
CREATE TYPE "MilestoneEventType" AS ENUM ('VISA_READY', 'TRAVEL_DEPARTURE', 'HOSPITAL_VISIT', 'TREATMENT', 'FOLLOW_UP', 'TRAVEL_RETURN');
CREATE TYPE "CaseEventType" AS ENUM (
  -- Case lifecycle
  'CASE_CREATED', 'CASE_DISTRIBUTED', 'CASE_ASSIGNED', 'CASE_STATUS_CHANGED', 'CASE_STAGE_ADVANCED',
  -- Hospital contact flow
  'HOSPITALS_SELECTED', 'HOSPITAL_REPLIED', 'HOSPITAL_NEED_INFO', 'HOSPITAL_REMOVED',
  -- Quotes
  'QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED', 'QUOTE_RESENT',
  -- Communication
  'MESSAGE_SENT', 'MESSAGE_RECEIVED',
  -- Clinical
  'QUESTIONNAIRE_SUBMITTED', 'CONSULTATION_SCHEDULED', 'CONSULTATION_COMPLETED',
  -- Documents
  'DOCUMENT_UPLOADED',
  -- Orders
  'ORDER_PLACED', 'ORDER_STATUS_CHANGED',
  -- Journey
  'MILESTONE_ADDED', 'MILESTONE_UPDATED', 'JOURNEY_UPDATED',
  -- Support
  'TICKET_CREATED', 'TICKET_RESOLVED',
  -- AI
  'AI_SUMMARY_GENERATED'
);
CREATE TYPE "ActorType" AS ENUM ('PATIENT', 'HOSPITAL', 'ADMIN', 'SYSTEM');
CREATE TYPE "BookingRequestStatus" AS ENUM ('PENDING', 'HOSPITALS_SELECTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "BookingConditionType" AS ENUM ('TREATMENT', 'PROCEDURE');
CREATE TYPE "QCCompletionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "ServiceCatalogCategory" AS ENUM ('SURGERY', 'HEALTH_CHECKUP', 'CONSULTATION', 'SECOND_OPINION', 'REHABILITATION', 'IMAGING', 'LAB_TEST', 'OTHER');
```

---

## Module 1: Quotes + CaseHospitalContacts

### 1.1 DB Schema

```sql
CREATE TABLE case_hospital_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  sub_status "CHCSubStatus" NOT NULL DEFAULT 'DISTRIBUTED',
  selected_by_patient_at TIMESTAMPTZ,
  distributed_at TIMESTAMPTZ DEFAULT now(),
  first_reply_at TIMESTAMPTZ,
  quote_id UUID,
  patient_viewed_quote_at TIMESTAMPTZ,
  patient_accepted_at TIMESTAMPTZ,
  patient_rejected_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removed_reason TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, hospital_id)
);

CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  quote_number VARCHAR(50) NOT NULL UNIQUE,
  version INT NOT NULL DEFAULT 1,
  status "QuoteStatus" NOT NULL DEFAULT 'PENDING',
  is_draft BOOLEAN NOT NULL DEFAULT true,
  total_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  valid_until TIMESTAMPTZ NOT NULL,
  treatment_plan TEXT,
  line_items JSONB,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE case_hospital_contacts
  ADD CONSTRAINT chc_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id);

-- Indexes (per INDEX_PLAN.md)
-- NOTE: UNIQUE(case_id, hospital_id) on CHC and UNIQUE on quotes.quote_number already create implicit unique indexes.
-- The explicit indexes below are for query patterns that need different column ordering.
CREATE INDEX idx_chc_hospital_sub_distributed ON case_hospital_contacts(hospital_id, sub_status, distributed_at DESC);
CREATE INDEX idx_chc_case_sub ON case_hospital_contacts(case_id, sub_status);
CREATE INDEX idx_quotes_case_status_created ON quotes(case_id, status, created_at DESC);
CREATE INDEX idx_quotes_hospital_status_created ON quotes(hospital_id, status, created_at DESC);
CREATE INDEX idx_quotes_valid_until_active ON quotes(valid_until) WHERE status IN ('PENDING');
CREATE INDEX idx_chc_sub_distributed ON case_hospital_contacts(sub_status, distributed_at);
CREATE INDEX idx_chc_quote_id ON case_hospital_contacts(quote_id) WHERE quote_id IS NOT NULL;
```

### 1.2 Domain Layer

**Entities:**
- `domain/src/entities/case-hospital-contact.entity.ts`
- `domain/src/entities/quote.entity.ts`

**State Machines:**
- `domain/src/state-machine/chc-sub-status-transitions.ts` — per STATE_MACHINES.md Section 2
- `domain/src/state-machine/quote-status-transitions.ts` — per STATE_MACHINES.md Section 3

**Value Objects:**
- `domain/src/value-objects/quote-number.ts` — format `QT-YYYYMMDD-XXXX`

**Repository Ports:**
- `domain/src/ports/case-hospital-contact-repository.port.ts`
- `domain/src/ports/quote-repository.port.ts`

### 1.3 Use Cases

| Use Case | Actor | Description |
|----------|-------|-------------|
| `AddHospitalToCase` | Admin | Create CHC with sub_status=DISTRIBUTED |
| `RemoveHospitalFromCase` | Admin | Set sub_status=REMOVED, removed_at, removed_reason |
| `SendReminder` | Admin | Update reminder_sent_at on CHC |
| `ListCaseHospitalContacts` | Admin/Hospital | By case or hospital, with filters |
| `CreateQuote` | Hospital | Create draft quote (is_draft=true) |
| `UpdateQuote` | Hospital | Update draft quote |
| `SendQuote` | Hospital | Set is_draft=false, sent_at=now(), CHC→QUOTED, first_reply_at |
| `ListQuotes` | All | By case/hospital/status |
| `GetQuote` | All | Detail with CHC info |
| `AcceptQuote` | Patient | **Transactional** — see below |
| `RejectQuote` | Patient | quote→REJECTED, CHC→REJECTED |
| `CompareQuotes` | Patient/Admin | By case, return all quotes with hospital info |
| `ResendQuote` | Hospital | Resend after REJECTED/EXPIRED → bump `version` (business revision), quote→PENDING, CHC→QUOTED |
| `AdminResetAssignment` | Admin | **Transactional** — reverse an ACCEPTED quote: quote→PENDING, CHC→QUOTED, other CHCs un-reject, case→UNASSIGNED |

**AcceptQuote Transaction (within TransactionRunner):**
1. Check quote.status == PENDING (optimistic lock on version)
2. quote.status → ACCEPTED
3. CHC for this hospital: sub_status → ACCEPTED, patient_accepted_at = now()
4. **All other CHCs** for same case with sub_status IN (DISTRIBUTED, NEED_INFO, QUOTED) → REJECTED
5. All other quotes for same case with status=PENDING → REJECTED
6. case.assignment_status → ASSIGNED, assigned_hospital_id = hospital_id, assigned_at = now()
7. Record case_event (QUOTE_ACCEPTED) — no-op until Module 2 is built, then backfill

### 1.4 API Routes

```
POST   /api/v2/cases/{caseId}/hospital-contacts              — AddHospitalToCase
GET    /api/v2/cases/{caseId}/hospital-contacts              — ListCaseHospitalContacts
PATCH  /api/v2/cases/{caseId}/hospital-contacts/{id}         — Update (sub_status transitions)
POST   /api/v2/cases/{caseId}/hospital-contacts/{id}/remind  — SendReminder
DELETE /api/v2/cases/{caseId}/hospital-contacts/{id}         — RemoveHospitalFromCase

POST   /api/v2/quotes                                        — CreateQuote
GET    /api/v2/quotes                                        — ListQuotes (?caseId, ?hospitalId, ?status)
GET    /api/v2/quotes/{id}                                   — GetQuote
PUT    /api/v2/quotes/{id}                                   — UpdateQuote
POST   /api/v2/quotes/{id}/send                              — SendQuote
POST   /api/v2/quotes/{id}/accept                            — AcceptQuote
POST   /api/v2/quotes/{id}/reject                            — RejectQuote
GET    /api/v2/cases/{caseId}/quotes                         — CompareQuotes
POST   /api/v2/quotes/{id}/resend                            — ResendQuote
POST   /api/v2/cases/{caseId}/reset-assignment               — AdminResetAssignment
```

### 1.5 Validation Schemas

- `validation/src/quote.schema.ts`
- `validation/src/case-hospital-contact.schema.ts`

---

## Module 2: Events / Timeline

> Moved early in the implementation order so that subsequent modules (3-7) can emit events as they are built, rather than retrofitting later.

### 2.1 DB Schema

```sql
CREATE TABLE case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  event_type "CaseEventType" NOT NULL,
  actor_type "ActorType" NOT NULL,
  actor_id UUID,
  event_data JSONB,
  is_visible_to_patient BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_case_events_case_created ON case_events(case_id, created_at DESC);
CREATE INDEX idx_case_events_type ON case_events(event_type, created_at DESC);
```

### 2.2 Domain Layer

**Entity:** `domain/src/entities/case-event.entity.ts`

**Repository Port:** `domain/src/ports/case-event-repository.port.ts`

### 2.3 Timeline Composition

> **GetCaseTimeline is a merged view**, not just a filtered `case_events` query. The patient timeline combines:
> 1. `case_events` where `is_visible_to_patient = true` — operational events (quote accepted, message received, etc.)
> 2. `journey_milestones` where `is_visible_to_patient = true` — travel milestones (VISA_READY, TRAVEL_DEPARTURE, etc.)
>
> Both are sorted by timestamp into a single chronological feed. Each item has a `source` field (`'event'` or `'milestone'`) so the frontend can render them differently.
>
> **Implementation**: `GetCaseTimeline` use case queries both tables, maps to a common `TimelineItem` DTO, and merges by `created_at`/`event_date`. This is a read-only composition — no writes, no new tables.
>
> **Dependency**: GetCaseTimeline depends on Module 5 (Journey) for milestones. Before Module 5 is built, it returns events only.

### 2.4 Use Cases

| Use Case | Actor |
|----------|-------|
| `RecordCaseEvent` | **Internal only** — called by other use cases within transactions |
| `ListCaseEvents` | Admin/Hospital (all) / Patient (visible only) |
| `GetCaseTimeline` | Patient — filtered view of events with `is_visible_to_patient=true` |

### 2.5 Event Recording Integration

Once Module 2 is built, inject `CaseEventRepository` into use cases from Module 1 and all subsequent modules:

| Use Case | Event Type |
|----------|------------|
| `AddHospitalToCase` | CASE_DISTRIBUTED |
| `SendQuote` | QUOTE_SENT |
| `AcceptQuote` | QUOTE_ACCEPTED, CASE_ASSIGNED |
| `RejectQuote` | QUOTE_REJECTED |
| `CreateOrder` | ORDER_PLACED |
| `UpdateOrderStatus` | ORDER_STATUS_CHANGED |
| `UpdateTicketStatus` | CASE_STATUS_CHANGED |
| `CreateMilestone` | MILESTONE_ADDED |
| `UpdateCaseJourney` | JOURNEY_UPDATED |
| `SubmitResponse` (QC) | QUESTIONNAIRE_SUBMITTED |

### 2.6 API Routes

```
GET    /api/v2/cases/{caseId}/events            — ListCaseEvents
GET    /api/v2/cases/{caseId}/timeline           — GetCaseTimeline (patient-visible)
```

---

## Module 3: Support Tickets

### 3.1 DB Schema

```sql
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  patient_id UUID NOT NULL REFERENCES users(id),
  case_id UUID REFERENCES cases(id),
  type "TicketType" NOT NULL,
  priority "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
  status "TicketStatus" NOT NULL DEFAULT 'OPEN',
  subject VARCHAR(500),
  description TEXT NOT NULL,
  source_page VARCHAR(200),
  assigned_to UUID REFERENCES users(id),
  sla_deadline TIMESTAMPTZ,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  author_role "TicketReplyRole" NOT NULL,
  content TEXT NOT NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  attachments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_tickets_number ON support_tickets(ticket_number);
CREATE INDEX idx_tickets_patient_status ON support_tickets(patient_id, status, created_at DESC);
CREATE INDEX idx_tickets_queue ON support_tickets(status, priority, sla_deadline ASC NULLS LAST, created_at DESC);
CREATE INDEX idx_ticket_replies_ticket ON support_ticket_replies(ticket_id, created_at DESC);
CREATE INDEX idx_tickets_assigned_status ON support_tickets(assigned_to, status) WHERE assigned_to IS NOT NULL;
```

> **Note on IN_PROGRESS**: STATE_MACHINES.md explicitly removes `IN_PROGRESS` from SupportTicketStatus ("ASSIGNED 已隐含'有人在跟进'"). QUERY_CATALOG.md Q7/Q18 still reference it — those queries should be updated to remove `IN_PROGRESS` when implemented.

### 3.2 State Machine (per STATE_MACHINES.md Section 7)

- OPEN → ASSIGNED (assign)
- ASSIGNED → PENDING_INFO (request_info) / RESOLVED (resolve)
- PENDING_INFO → ASSIGNED (patient_reply)
- RESOLVED → CLOSED (close) / ASSIGNED (reopen)

### 3.3 Value Objects

- `domain/src/value-objects/ticket-number.ts` — format `TKT-YYYYMMDD-XXXX`

### 3.4 AuthZ Decision

> **Explicit decision**: Support ticket `assigned_to` references `users` with role=ADMIN. There is no separate SUPPORT role in v2. If/when a SUPPORT role is needed, we add it to `UserRole` enum and update authz checks. For now, ADMIN handles support.

### 3.5 Use Cases

| Use Case | Actor |
|----------|-------|
| `CreateTicket` | Patient |
| `ListTickets` | Patient (own) / Admin (all) |
| `GetTicket` | Patient (own) / Admin |
| `AssignTicket` | Admin |
| `ReplyToTicket` | Patient / Admin |
| `UpdateTicketStatus` | Admin |
| `CloseTicket` | Patient / Admin |

### 3.6 API Routes

```
POST   /api/v2/tickets                          — CreateTicket
GET    /api/v2/tickets                          — ListTickets
GET    /api/v2/tickets/{id}                     — GetTicket
POST   /api/v2/tickets/{id}/assign              — AssignTicket
POST   /api/v2/tickets/{id}/replies             — ReplyToTicket
PATCH  /api/v2/tickets/{id}/status              — UpdateTicketStatus
POST   /api/v2/tickets/{id}/close               — CloseTicket
```

---

## Module 4: Orders + Packages

### 4.1 DB Schema

```sql
CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en VARCHAR(200) NOT NULL,
  name_zh VARCHAR(200),
  type "PackageType" NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  description_en TEXT,
  description_zh TEXT,
  inclusions JSONB,
  cover_image_url VARCHAR(500),
  sort_weight INT DEFAULT 0,
  status "PackageStatus" NOT NULL DEFAULT 'DRAFT',
  publish_at TIMESTAMPTZ,
  takedown_at TIMESTAMPTZ,
  config JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) NOT NULL UNIQUE,
  patient_id UUID NOT NULL REFERENCES users(id),
  case_id UUID REFERENCES cases(id),
  package_id UUID REFERENCES packages(id),
  type "OrderType" NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  payment_method VARCHAR(50),
  paid_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  refunded_amount DECIMAL(12,2),
  refund_reason TEXT,
  metadata JSONB,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_packages_status_type ON packages(status, type, publish_at DESC NULLS LAST);
CREATE UNIQUE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_patient_status ON orders(patient_id, status, created_at DESC);
CREATE INDEX idx_orders_status_type ON orders(status, type, created_at DESC);
CREATE INDEX idx_orders_case_created ON orders(case_id, created_at DESC) WHERE case_id IS NOT NULL;
CREATE INDEX idx_packages_created_by_status ON packages(created_by, status, created_at DESC);
```

### 4.2 State Machines

**Package:** DRAFT ↔ PUBLISHED (per STATE_MACHINES.md Section 5)

**Order (per STATE_MACHINES.md Section 4):**
- PENDING_PAYMENT → PAID / CANCELLED
- PAID → IN_PROGRESS / REFUNDED
- IN_PROGRESS → COMPLETED / REFUNDED
- COMPLETED → REFUNDED

### 4.3 Value Objects

- `domain/src/value-objects/order-number.ts` — format `ORD-YYYYMMDD-XXXX`

### 4.4 Use Cases

| Use Case | Actor |
|----------|-------|
| `CreatePackage` | Admin |
| `UpdatePackage` | Admin |
| `PublishPackage` | Admin |
| `UnpublishPackage` | Admin |
| `ListPackages` | All (Patient sees only PUBLISHED) |
| `GetPackage` | All |
| `CreateOrder` | Patient/Admin — **idempotent** (Idempotency-Key) |
| `ListOrders` | Patient/Admin |
| `GetOrder` | Patient/Admin |
| `UpdateOrderStatus` | Admin/System |
| `CreatePaymentIntent` | Patient — **idempotent** |
| `RequestRefund` | Patient |

### 4.5 API Routes

```
POST   /api/v2/packages                        — CreatePackage
GET    /api/v2/packages                        — ListPackages
GET    /api/v2/packages/{id}                   — GetPackage
PUT    /api/v2/packages/{id}                   — UpdatePackage
POST   /api/v2/packages/{id}/publish           — PublishPackage
POST   /api/v2/packages/{id}/unpublish         — UnpublishPackage

POST   /api/v2/orders                          — CreateOrder
GET    /api/v2/orders                          — ListOrders
GET    /api/v2/orders/{id}                     — GetOrder
PATCH  /api/v2/orders/{id}/status              — UpdateOrderStatus
POST   /api/v2/orders/{id}/payment-intents     — CreatePaymentIntent
POST   /api/v2/orders/{id}/refunds             — RequestRefund
```

---

## Module 5: Journey

> Separated from Events (Module 2). Journey is informational travel/logistics data with a different lifecycle — it's updated by Admin, not auto-recorded by use cases.

### 5.1 DB Schema

```sql
CREATE TABLE case_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES cases(id),
  visa JSONB,
  insurance JSONB,
  accommodation JSONB,
  transportation JSONB,
  post_care JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE journey_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  event_type "MilestoneEventType" NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  note TEXT,
  is_visible_to_patient BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_case_journeys_case ON case_journeys(case_id);
CREATE INDEX idx_milestones_case_date ON journey_milestones(case_id, event_date ASC);
CREATE INDEX idx_milestones_patient_visible ON journey_milestones(is_visible_to_patient, event_date ASC) WHERE is_visible_to_patient = true;
```

### 5.2 Design Decision: Journey JSONB

> The `case_journeys` table uses JSONB columns for visa/insurance/accommodation/transportation/post_care. This is intentional for Phase 2 — these sub-modules are informational and don't have complex state machines. If specific sub-modules later need structured workflows (e.g., visa checklist with item-level tracking), they can be broken into dedicated tables in a future phase. For now, the JSONB approach keeps the schema simple and matches the patientsflow docs.

### 5.3 Use Cases

| Use Case | Actor | AuthZ |
|----------|-------|-------|
| `GetCaseJourney` | Patient (own case) / Admin / Hospital (**assigned only**) | Hospital must be `case.assigned_hospital_id` |
| `UpdateCaseJourney` | Admin | — |
| `ListMilestones` | Patient (visible only, own case) / Admin / Hospital (**assigned only**) | Hospital must be `case.assigned_hospital_id` |
| `CreateMilestone` | Admin / Hospital (**assigned only**) | Hospital must be `case.assigned_hospital_id` |
| `UpdateMilestone` | Admin | — |
| `DeleteMilestone` | Admin | — |

> **AuthZ rationale**: Journey contains sensitive logistics data (visa, insurance, accommodation). Non-assigned hospitals (those still quoting or already rejected) must not see this. Only the hospital that won the case (ASSIGNED) gets access. This matches the patientsflow permission matrix.

### 5.4 API Routes

```
GET    /api/v2/cases/{caseId}/journey            — GetCaseJourney
PUT    /api/v2/cases/{caseId}/journey            — UpdateCaseJourney

GET    /api/v2/cases/{caseId}/milestones         — ListMilestones
POST   /api/v2/cases/{caseId}/milestones         — CreateMilestone
PATCH  /api/v2/cases/{caseId}/milestones/{id}    — UpdateMilestone
DELETE /api/v2/cases/{caseId}/milestones/{id}    — DeleteMilestone
```

---

## Module 6: QuestionCollector

### 6.1 DB Schema

```sql
CREATE TABLE question_collector_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  procedure_types TEXT[],
  questions JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_collector_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  template_id UUID NOT NULL REFERENCES question_collector_templates(id),
  user_id UUID NOT NULL REFERENCES users(id),
  responses JSONB NOT NULL,
  extracted_data JSONB,
  risk_flags TEXT[],
  completion_status "QCCompletionStatus" NOT NULL DEFAULT 'NOT_STARTED',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_collector_customizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES question_collector_templates(id),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  customized_questions JSONB NOT NULL,
  customized_by UUID REFERENCES users(id),
  customized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, hospital_id)
);

-- FK: cases.question_collector_template_id → question_collector_templates(id)
-- (already added in M0 as column; FK added here)
ALTER TABLE cases ADD CONSTRAINT cases_qc_template_fkey
  FOREIGN KEY (question_collector_template_id) REFERENCES question_collector_templates(id);

-- Indexes
CREATE INDEX idx_qcr_case ON question_collector_responses(case_id, submitted_at DESC);
CREATE INDEX idx_qcr_risk_flags ON question_collector_responses USING gin(risk_flags);
CREATE INDEX idx_qcc_template_hospital ON question_collector_customizations(template_id, hospital_id);
CREATE INDEX idx_qcr_completion_submitted ON question_collector_responses(completion_status, submitted_at DESC);
```

### 6.2 Design Decision: Customizations

> **Model: Platform template + optional hospital overrides at template level.**
>
> Each case has **one** questionnaire response (patient fills out once). The questions shown are resolved as follows:
> 1. Case has `question_collector_template_id` → look up template
> 2. If case is ASSIGNED (one hospital): check `customizations` for `(template_id, assigned_hospital_id)`. If found, use `customized_questions`. Otherwise, use template defaults.
> 3. If case is UNASSIGNED (multi-hospital phase): always use template defaults (no hospital-specific customization applies yet).
>
> Customizations are **template-level, not case-level** — a hospital configures their preferred questions once per template, and it applies to all cases using that template. This avoids the problem of patient seeing different questions depending on which hospital they look at, and eliminates the need for `hospital_id` on the response.

### 6.3 Use Cases

| Use Case | Actor |
|----------|-------|
| `CreateTemplate` | Admin |
| `UpdateTemplate` | Admin |
| `ListTemplates` | Admin |
| `GetTemplate` | Admin/Patient |
| `SubmitResponse` | Patient |
| `SaveResponseDraft` | Patient (completion_status=IN_PROGRESS) |
| `GetResponse` | Admin/Hospital/Patient |
| `ListResponses` | Admin (with risk_flags filter) |
| `CustomizeQuestions` | Hospital |
| `GetCustomization` | Hospital |

### 6.4 API Routes

```
POST   /api/v2/question-templates               — CreateTemplate
GET    /api/v2/question-templates               — ListTemplates
GET    /api/v2/question-templates/{id}          — GetTemplate
PUT    /api/v2/question-templates/{id}          — UpdateTemplate

POST   /api/v2/cases/{caseId}/questionnaire     — SubmitResponse
PATCH  /api/v2/cases/{caseId}/questionnaire     — SaveResponseDraft
GET    /api/v2/cases/{caseId}/questionnaire     — GetResponse
GET    /api/v2/questionnaire-responses          — ListResponses (Admin)

POST   /api/v2/question-templates/{templateId}/customizations    — CustomizeQuestions (Hospital, scoped by hospital_id from session)
GET    /api/v2/question-templates/{templateId}/customizations  — GetCustomization (Hospital)
```

---

## Module 7: ServiceCatalog + QuoteTemplates

### 7.1 DB Schema

```sql
CREATE TABLE service_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  name_en VARCHAR(200) NOT NULL,
  name_zh VARCHAR(200),
  category "ServiceCatalogCategory" NOT NULL,
  price_min DECIMAL(12,2) NOT NULL,
  price_max DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  estimated_stay_days INT,
  estimated_recovery_days INT,
  inclusions JSONB,
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  name VARCHAR(200) NOT NULL,
  condition_category VARCHAR(100),
  line_items_template JSONB NOT NULL,
  default_valid_days INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 7.2 Use Cases

Standard CRUD for both entities, scoped by `hospital_id`. Hospital users can only manage their own catalog/templates. Admin can view all.

### 7.3 API Routes

```
POST   /api/v2/hospitals/{hospitalId}/service-catalog    — Create
GET    /api/v2/hospitals/{hospitalId}/service-catalog    — List
GET    /api/v2/service-catalog/{id}                     — Get
PUT    /api/v2/service-catalog/{id}                     — Update
DELETE /api/v2/service-catalog/{id}                     — Delete (soft: is_active=false)
GET    /api/v2/service-catalog                          — List all (Admin)

POST   /api/v2/hospitals/{hospitalId}/quote-templates    — Create
GET    /api/v2/hospitals/{hospitalId}/quote-templates    — List
GET    /api/v2/quote-templates/{id}                     — Get
PUT    /api/v2/quote-templates/{id}                     — Update
DELETE /api/v2/quote-templates/{id}                     — Delete (soft: is_active=false)
```

---

## Module 8: Dashboard Aggregations

> Moved to near-end because dashboards read from all other modules. No new tables.

### 8.1 Design

Pure read-only aggregation endpoints. No new tables. Each dashboard use case composes calls to existing repositories.

### 8.2 Use Cases + API

**Patient Dashboard** — `GET /api/v2/patient/dashboard`
```json
{
  "profileCompletion": { "percentage": 75, "steps": ["..."] },
  "cases": [{ "id": "...", "caseNumber": "...", "assignmentStatus": "...", "hospitals": ["..."] }],
  "upcomingMilestones": ["..."],
  "ordersSummary": { "pendingPayment": 1, "inProgress": 2, "completed": 3 },
  "unreadMessageCount": 5,
  "recommendedHospitals": ["..."]
}
```

**Admin Dashboard** — `GET /api/v2/admin/dashboard`
```json
{
  "stats": { "newInquiries": 12, "unassigned": 8, "assigned": 45, "newMessages": 7, "urgent": 3, "todayNew": 2 },
  "recentUsers": ["..."],
  "recentCases": ["..."],
  "pendingActions": ["..."]
}
```

**Hospital Dashboard** — `GET /api/v2/hospital/dashboard`
```json
{
  "stats": { "assignedCases": 15, "newCases": 3, "todayConsultations": 2, "pendingMessages": 5 },
  "todayConsultations": ["..."],
  "newCases": ["..."],
  "pendingMessages": ["..."]
}
```

---

## Module 9: BookingRequest + Patient Auth / Public Flow

> **This module is last** because it introduces public (unauthenticated) routes and requires a patient auth/session design that doesn't exist in v2 yet. All other modules can be built and tested with existing ADMIN/HOSPITAL auth.

### 9.1 Patient Auth Design

Current v2 auth: Keycloak PKCE flow → iron-session BFF cookies. All `/api/v2/*` routes require a valid Keycloak session. The login flow is **frontend-initiated**: the app redirects to Keycloak's login page, Keycloak redirects back with an auth code, the BFF exchanges it for tokens and writes them into an iron-session cookie. The API never directly issues sessions.

**CompleteSignup does NOT create a session.** The flow is:

1. Public API creates the user + Keycloak account (DB transaction)
2. API returns `{ keycloakLoginUrl }` with the user's email pre-filled
3. Frontend redirects to Keycloak login page (standard PKCE flow)
4. Patient logs in → Keycloak callback → iron-session cookie established
5. Patient is now authenticated and can access `/api/v2/*` routes

This preserves the single auth mechanism (Keycloak PKCE) and avoids introducing backend-issued sessions.

**Auth middleware changes:**
- Add a `publicRoutes` allowlist in the Keycloak middleware for `/api/v2/public/*`
- Ensure existing session middleware correctly handles `role=PATIENT`
- No new auth mechanism — reuse Keycloak PKCE for patients

### 9.2 DB Schema

```sql
CREATE TABLE booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  request_number VARCHAR(50) NOT NULL UNIQUE,
  condition_type "BookingConditionType" NOT NULL,
  condition_category VARCHAR(100) NOT NULL,
  condition_description TEXT,
  destination_preference JSONB,
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
  status "BookingRequestStatus" NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE booking_request_hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id UUID NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  is_recommended BOOLEAN NOT NULL DEFAULT false,
  match_score INT,
  recommendation_reason TEXT,
  selected_by_patient BOOLEAN NOT NULL DEFAULT false,
  selected_at TIMESTAMPTZ,
  UNIQUE(booking_request_id, hospital_id)
);

-- Indexes
CREATE INDEX idx_booking_requests_user ON booking_requests(user_id, created_at DESC);
CREATE INDEX idx_booking_requests_status ON booking_requests(status, created_at DESC);
CREATE INDEX idx_booking_request_hospitals_br ON booking_request_hospitals(booking_request_id);

-- Add FK from cases
ALTER TABLE cases ADD COLUMN booking_request_id UUID REFERENCES booking_requests(id);
```

### 9.3 Value Objects

- `domain/src/value-objects/booking-request-number.ts` — format `BR-YYYYMMDD-XXXX`

### 9.4 Use Cases

| Use Case | Actor | Description |
|----------|-------|-------------|
| `CreateBookingRequest` | Public | Submit booking form (no auth) |
| `GetHospitalRecommendations` | Public | Get matched + explore hospitals by booking_request_id |
| `SaveHospitalSelections` | Public | Save patient's hospital selections |
| `CompleteSignup` | Public | **Transactional** — see below |

**CompleteSignup — two phases:**

*Phase A: DB Transaction (atomic, within TransactionRunner):*
1. Create or find user by email in DB
2. Create Keycloak user via admin API (if new) — **outside** DB tx but before committing, so we can rollback if Keycloak fails
3. Update booking_request.user_id, status → COMPLETED
4. Create case (assignment_status=UNASSIGNED)
5. For each selected hospital: create case_hospital_contact (sub_status=DISTRIBUTED)

*Phase B: Post-transaction (non-atomic):*
6. Return `{ keycloakLoginUrl, userId }` — frontend redirects to Keycloak PKCE login
7. Trigger welcome email (async)

> **Note**: Step 2 (Keycloak user creation) is a side effect that cannot be rolled back by a DB transaction. If the DB tx fails after Keycloak user creation, we have an orphaned Keycloak user. This is acceptable: the user can still log in, and a retry of CompleteSignup will find them via email lookup. Alternatively, wrap Keycloak creation in a compensating action (delete on rollback) during implementation.

### 9.5 API Routes

```
POST   /api/v2/public/booking-requests                           — CreateBookingRequest
GET    /api/v2/public/hospital-recommendations/{bookingId}       — GetHospitalRecommendations
POST   /api/v2/public/booking-requests/{id}/selections           — SaveHospitalSelections
POST   /api/v2/public/booking-requests/{id}/complete-signup      — CompleteSignup
```

---

## Cross-Cutting Concerns

### Authorization (AuthZ)

Use case layer checks `actor.role`:

| Role | Access |
|------|--------|
| ADMIN | All operations. Support ticket handling uses ADMIN role (no separate SUPPORT role for now) |
| HOSPITAL | Own hospital data only: cases via CHC, own quotes, own service catalog, own consultations |
| PATIENT | Own data only: own cases, own orders, own tickets, accept/reject quotes on own cases |

**Route design**: The spec uses resource-centric routes (`/api/v2/cases/{caseId}/...`, `/api/v2/quotes/...`) rather than role-scoped routes (`/api/v2/patient/...`, `/api/v2/hospital/...`). All three roles hit the same endpoints; access is controlled by RBAC in the use case layer. The exceptions are: Dashboard endpoints (role-specific aggregation) and Public routes (no auth). PATIENT_CONSOLE_FLOW.md's `/patient/*` paths are conceptual — in v2 they map to the same resource routes with PATIENT role filtering.

**Future role expansion path**: When SUPPORT / HOSPITAL_STAFF / HOSPITAL_DOCTOR / HOSPITAL_ADMIN roles are needed:
1. Add values to `UserRole` enum
2. Update authz checks in affected use cases
3. No schema changes needed beyond the enum

**Explicit decision**: For Phase 2, ADMIN = support staff. The `assigned_to` on support_tickets references users with role=ADMIN.

### Number Generation (Value Objects)

| Entity | Format | Example |
|--------|--------|---------|
| CaseNumber | `CASE-YYYY-XXXX` | `CASE-2026-0001` (existing) |
| QuoteNumber | `QT-YYYYMMDD-XXXX` | `QT-20260315-0001` |
| OrderNumber | `ORD-YYYYMMDD-XXXX` | `ORD-20260315-0001` |
| TicketNumber | `TKT-YYYYMMDD-XXXX` | `TKT-20260315-0001` |
| BookingRequestNumber | `BR-YYYYMMDD-XXXX` | `BR-20260315-0001` |

All follow existing `CaseNumber` value object pattern.

### File Organization (per existing patterns)

Each new module creates:

```
packages/domain/src/entities/{entity}.entity.ts
packages/domain/src/ports/{entity}-repository.port.ts
packages/domain/src/state-machine/{entity}-*-transitions.ts
packages/domain/src/value-objects/{number}.ts

packages/application/src/dtos/{entity}.dto.ts
packages/application/src/mappers/{entity}.mapper.ts
packages/application/src/use-cases/{module}/{action}.use-case.ts

packages/infrastructure/database/schema/schema.ts          (modify)
packages/infrastructure/database/schema/relations.ts       (modify)
packages/infrastructure/database/repositories/drizzle-{entity}.repository.ts

packages/shared/validation/src/{entity}.schema.ts

apps/api/src/routes/{module}.routes.ts
apps/api/src/routes/index.ts                               (modify)
apps/api/src/composition-root.ts                           (modify)
```

### Testing Strategy

- Each use case: unit test with mocked repositories (vitest)
- Each validation schema: unit test
- State machine transitions: unit test
- Transaction-critical use cases (AcceptQuote, CompleteSignup): integration test with real DB
- Follow existing vitest config in each package

---

## Implementation Order Summary

| Order | Module | New Tables | Alter | ~Use Cases | ~Routes | Dependencies |
|-------|--------|------------|-------|-----------|---------|-------------|
| **0** | Case Model Realignment | — | cases +9 cols, +2 enums | 3 rewrite + 1 deprecate + 1 schema | 5 rewrite/update | None |
| **0.5** | Transaction / Idempotency / Migration Conventions | idempotency_keys (optional) | — | 0 (infra) | 0 | Section 0 |
| **1** | Quotes + CHC | 2 | — | 14 | 15 | Section 0, 0.5 |
| **2** | Events / Timeline | 1 | — | 3 | 2 | Section 0 |
| **3** | Support Tickets | 2 | — | 7 | 7 | — |
| **4** | Orders + Packages | 2 | — | 12 | 12 | Section 0.5 |
| **5** | Journey | 2 | — | 6 | 6 | — |
| **6** | QuestionCollector | 3 | cases FK | 10 | 10 | — |
| **7** | ServiceCatalog + QuoteTemplates | 2 | — | 10 | 11 | — |
| **8** | Dashboard Aggregations | 0 | — | 3 | 3 | Modules 1-7 |
| **9** | BookingRequest + Patient Auth | 2 | cases +1 FK | 4 | 4 | Module 1 (needs CHC) |
| **Total** | | **16 + alter** | | **~74** | **~75** | |

---

## Deferred / Out-of-Scope

The following entities and features are defined in patientsflow docs but **explicitly excluded** from this Phase 2 spec. They can be added in future phases without breaking the modules designed here.

### ReplyTask (用户决定移除)

**Reason**: User decided ReplyTasks are not needed ("ReplyTasks 我想了下不定需要，可以去掉").

ReplyTask was a hospital-side queue for pending conversation replies (DATA_MODELS.md §ReplyTask). The hospital inbox can filter conversations needing reply by checking `conversations.last_sender_id` — if the last sender is not the hospital user, the conversation needs a reply. This uses existing schema fields (`last_sender_id`, `last_message_at`) and does not require new columns.

### CaseSummary (AI-Generated)

**Reason**: Depends on AI pipeline integration not yet scoped.

DATA_MODELS.md defines `CaseSummary` with `ai_provider`, `model_version`, `generated_at`. The `ai_summary_status` field on `cases` is added in Section 0 (M0 migration) as a placeholder. Actual generation logic, AI provider integration, and summary display are deferred.

### ChatbotFaq / ChatbotSetting

**Reason**: Chatbot is a standalone subsystem with its own UI, not part of CRM core.

These tables support a patient-facing FAQ chatbot. They have no FK dependencies on other Phase 2 entities and can be added independently.

### Email / Notification Templates

**Reason**: Notification delivery is infrastructure, not business logic.

Phase 2 use cases emit domain events (e.g., `QuoteAccepted`, `TicketAssigned`). The actual email/SMS/push delivery pipeline — templates, providers, retry queues — is a separate infrastructure concern.

### Admin Bulk Operations

**Reason**: Admin bulk actions (bulk assign, bulk close, bulk export) are convenience features that layer on top of the single-entity use cases designed here. Add after core CRUD is stable.

### Analytics / Reporting

**Reason**: Read-only aggregation queries for business intelligence. Can be added as read-only endpoints or a separate analytics service without modifying existing modules.

---

*Spec version: v2.2*
*Last updated: 2026-03-15*
*Source docs: patientsflow/DATA_MODELS.md, QUERY_CATALOG.md, STATE_MACHINES.md, PATIENT_CONSOLE_FLOW.md, ADMIN_PORTAL_CRM_REDESIGN.md, HOSPITAL_PORTAL_CRM_REDESIGN.md*
*Review: Codex review x2 + internal spec review + user feedback incorporated*
