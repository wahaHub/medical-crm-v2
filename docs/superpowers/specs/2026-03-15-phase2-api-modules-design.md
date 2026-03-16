# Phase 2: API Business Modules — Design Spec

**Date**: 2026-03-15
**Status**: Draft
**Scope**: medical-crm-v2 backend — all new API modules for Patient/Hospital/Admin portals
**Approach**: Module-by-module vertical implementation (方案 A)
**Schema Strategy**: Incremental migration (渐进式迁移)

---

## Table of Contents

- [Section 0: Case Model Realignment](#section-0-case-model-realignment)
- [Section 0.5: Transaction + Idempotency Infrastructure](#section-05-transaction--idempotency-infrastructure)
- [Section 1: Schema Migration Strategy](#section-1-schema-migration-strategy)
- [Section 2: Module 1 — Quotes + CaseHospitalContacts](#section-2-module-1--quotes--casehospitalcontacts)
- [Section 3: Module 2 — Orders + Packages](#section-3-module-2--orders--packages)
- [Section 4: Module 3 — Support Tickets](#section-4-module-3--support-tickets)
- [Section 5: Module 4 — CaseJourney + Milestones + CaseEvents](#section-5-module-4--casejourney--milestones--caseevents)
- [Section 6: Module 5 — BookingRequest + Patient Auth](#section-6-module-5--bookingrequest--patient-auth)
- [Section 7: Module 6 — Dashboard Aggregation](#section-7-module-6--dashboard-aggregation)
- [Section 8: Module 7 — QuestionCollector](#section-8-module-7--questioncollector)
- [Section 9: Module 8 — ServiceCatalog + QuoteTemplates](#section-9-module-8--servicecatalog--quotetemplates)
- [Section 10: Cross-Cutting Concerns](#section-10-cross-cutting-concerns)
- [Section 11: Implementation Order Summary](#section-11-implementation-order-summary)
- [Section 12: Deferred / Out-of-Scope](#section-12-deferred--out-of-scope)

---

## Section 0: Case Model Realignment

> **Must be completed before any module work.**
> The current v2 Case aggregate, DTOs, validation, routes, and repositories are built around the legacy `status` (CaseStatus enum) and `stage` (CaseStage enum) model with Admin-driven manual assignment (`/api/v2/cases/:id/assign`). The patientsflow design replaces this with `assignment_status` + `treatment_stage`, and Admin no longer manually assigns — patients choose by accepting a quote.

### 0.1 What Changes

| Current (v1 model) | New (patientsflow model) | Action |
|---------------------|-------------------------|--------|
| `cases.status` (DRAFT/ACTIVE/COMPLETED/CANCELLED/ARCHIVED) | `cases.assignment_status` (UNASSIGNED/ASSIGNED) | Add new column, keep old for compat |
| `cases.stage` (PENDING_ASSIGNMENT/TRANSFERRED_TO_HOSPITAL/...) | `cases.treatment_stage` (CONFIRMED/IN_TREATMENT/POST_TREATMENT/COMPLETED/FOLLOW_UP) | Add new column, keep old for compat |
| `AssignCaseUseCase` (Admin manually assigns hospital) | Removed — assignment happens via `AcceptQuote` | Deprecate use case, mark route as legacy |
| `UpdateCaseStatusUseCase` | Reworked — only updates `assignment_status` with guard | Rewrite |
| `AdvanceCaseStageUseCase` | Reworked — advances `treatment_stage` with valid transitions | Rewrite |
| `caseListQuerySchema` filters on `status`/`stage` | Filters on `assignment_status`/`treatment_stage` | Update schema + repository query |
| `GetCaseStatsUseCase` counts by `status` | Counts by `assignment_status` + `treatment_stage` | Rewrite |

### 0.2 DB Migration (M0)

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
-- NOTE: Reuses existing pgEnum "AISummaryStatus" (PENDING/PROCESSING/COMPLETED/FAILED) from schema.ts
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

### 0.3 Domain Layer Changes

**case.entity.ts** — add fields: `assignmentStatus`, `treatmentStage`, `conditionSummary`, `structuredData`, `riskFlags`, `priority`, `lastEventAt`, `aiSummaryStatus`, `questionCollectorTemplateId`

**case-status-transitions.ts** — replace with:
- `assignment-status-transitions.ts`: UNASSIGNED → ASSIGNED (via accept_quote), ASSIGNED → UNASSIGNED (admin reset)
- `treatment-stage-transitions.ts`: CONFIRMED → IN_TREATMENT → POST_TREATMENT → COMPLETED → FOLLOW_UP (with restart loop)

**case-repository.port.ts** — update `list()` to filter by `assignmentStatus`/`treatmentStage` instead of `status`/`stage`

### 0.4 Route Changes

| Route | Action |
|-------|--------|
| `PATCH /api/v2/cases/{id}/status` | Rewrite to update `assignment_status` only (admin reset) |
| `PATCH /api/v2/cases/{id}/stage` | Rewrite to advance `treatment_stage` with valid transitions |
| `POST /api/v2/cases/{id}/assign` | **Deprecate** — mark as legacy, no-op or return 410 Gone. Assignment now happens via AcceptQuote |
| `GET /api/v2/cases` | Update query to use `assignment_status`/`treatment_stage` filters |
| `GET /api/v2/cases/stats` | Rewrite to count by new statuses |

### 0.5 Compatibility

- Old columns (`status`, `stage`) remain in DB and Drizzle schema
- Old columns are NOT removed from the entity — they coexist
- v2 API exclusively reads/writes the new columns
- Old columns can be populated by a sync trigger or background job if v1 code still needs them
- If no v1 consumers exist, old columns are frozen and eventually dropped

---

## Section 0.5: Transaction + Idempotency Infrastructure

> **Must be completed before Module 1.**
> Current v2 use cases do sequential single-repo saves with no transaction boundary. AcceptQuote needs to atomically update 4+ tables. CompleteSignup needs 5+ tables.

### 0.5.1 Transaction Runner

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

### 0.5.2 Idempotency

For critical write operations (AcceptQuote, CompleteSignup, CreateOrder):

- Client sends `Idempotency-Key` header (UUID)
- Use case checks idempotency before executing
- Implementation: simple `idempotency_keys` table with `key`, `result`, `created_at`, TTL 24h
- Alternatively, rely on DB unique constraints as natural idempotency (e.g., `case_hospital_contacts(case_id, hospital_id)` unique)

For now, **use DB unique constraints as primary idempotency mechanism** and add explicit idempotency table only for payment-related flows (CreateOrder, CreatePaymentIntent).

### 0.5.3 Optimistic Locking

For entities with concurrent update risk (Quote, CaseHospitalContact):

- Add `version INT NOT NULL DEFAULT 1` column
- Use case reads version, includes it in UPDATE WHERE clause
- If 0 rows updated → throw `ConcurrentUpdateError`

Apply to: `quotes`, `case_hospital_contacts`, `orders`, `support_tickets`

---

## Section 1: Schema Migration Strategy

### 1.1 Migration Files (Ordered)

| Migration | Scope | New Tables | Alters |
|-----------|-------|------------|--------|
| M0 | Case realignment | — | cases: add 8 columns + 2 enums |
| M1 | Quotes + CHC | `case_hospital_contacts`, `quotes` | — |
| M2 | Orders + Packages | `packages`, `orders` | — |
| M3 | Support Tickets | `support_tickets`, `support_ticket_replies` | — |
| M4 | Journey + Events | `case_journeys`, `journey_milestones`, `case_events` | — |
| M5 | BookingRequest | `booking_requests`, `booking_request_hospitals` | cases: add `booking_request_id` FK |
| M6 | QuestionCollector + ServiceCatalog | `question_collector_templates`, `question_collector_responses`, `question_collector_customizations`, `service_catalog_items`, `quote_templates` | — |

### 1.2 Execution

- Drizzle Kit `generate` → human review SQL → `migrate`
- Each migration is one file, executed in order
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
CREATE TYPE "CaseEventType" AS ENUM ('MESSAGE', 'QUESTIONNAIRE', 'CONSULTATION', 'DOCUMENT', 'STATUS_CHANGED', 'AI_SUMMARY', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED', 'ORDER_STATUS_CHANGED', 'JOURNEY_UPDATED');
CREATE TYPE "ActorType" AS ENUM ('PATIENT', 'HOSPITAL', 'ADMIN', 'SYSTEM');
CREATE TYPE "BookingRequestStatus" AS ENUM ('PENDING', 'HOSPITALS_SELECTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "BookingConditionType" AS ENUM ('TREATMENT', 'PROCEDURE');
CREATE TYPE "QCCompletionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "ServiceCatalogCategory" AS ENUM ('SURGERY', 'HEALTH_CHECKUP', 'CONSULTATION', 'SECOND_OPINION', 'REHABILITATION', 'IMAGING', 'LAB_TEST', 'OTHER');
```

---

## Section 2: Module 1 — Quotes + CaseHospitalContacts

### 2.1 DB Schema

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
CREATE UNIQUE INDEX idx_chc_case_hospital ON case_hospital_contacts(case_id, hospital_id);
CREATE INDEX idx_chc_hospital_sub_distributed ON case_hospital_contacts(hospital_id, sub_status, distributed_at DESC);
CREATE INDEX idx_chc_case_sub ON case_hospital_contacts(case_id, sub_status);
CREATE UNIQUE INDEX idx_quotes_quote_number ON quotes(quote_number);
CREATE INDEX idx_quotes_case_status_created ON quotes(case_id, status, created_at DESC);
CREATE INDEX idx_quotes_hospital_status_created ON quotes(hospital_id, status, created_at DESC);
CREATE INDEX idx_quotes_valid_until_active ON quotes(valid_until) WHERE status IN ('PENDING');
CREATE INDEX idx_chc_sub_distributed ON case_hospital_contacts(sub_status, distributed_at);
CREATE INDEX idx_chc_quote_id ON case_hospital_contacts(quote_id) WHERE quote_id IS NOT NULL;
```

### 2.2 Domain Layer

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

### 2.3 Use Cases

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
| `ResendQuote` | Hospital | Resend after REJECTED/EXPIRED → new version, quote→PENDING, CHC→QUOTED |
| `AdminResetAssignment` | Admin | **Transactional** — reverse an ACCEPTED quote: quote→PENDING, CHC→QUOTED, other CHCs un-reject, case→UNASSIGNED |

**AcceptQuote Transaction (within TransactionRunner):**
1. Check quote.status == PENDING (optimistic lock on version)
2. quote.status → ACCEPTED
3. CHC for this hospital: sub_status → ACCEPTED, patient_accepted_at = now()
4. All other CHCs for same case with sub_status=QUOTED → REJECTED
5. All other quotes for same case with status=PENDING → REJECTED
6. case.assignment_status → ASSIGNED, assigned_hospital_id = hospital_id, assigned_at = now()
7. Record case_event (QUOTE_ACCEPTED) — no-op until Module 4 is built, then backfill

### 2.4 API Routes

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

### 2.5 Validation Schemas

- `validation/src/quote.schema.ts`
- `validation/src/case-hospital-contact.schema.ts`

---

## Section 3: Module 2 — Orders + Packages

### 3.1 DB Schema

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

-- NOTE: Using `patient_id` (not `user_id`) to match existing v2 convention (cases.patient_id).
-- DATA_MODELS.md recommends `user_id` but we stay consistent with the current schema.
-- If we migrate to `user_id` later, it's a single rename.
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

### 3.2 State Machines

**Package:** DRAFT ↔ PUBLISHED (per STATE_MACHINES.md Section 5)

**Order (per STATE_MACHINES.md Section 4):**
- PENDING_PAYMENT → PAID / CANCELLED
- PAID → IN_PROGRESS / REFUNDED
- IN_PROGRESS → COMPLETED / REFUNDED
- COMPLETED → REFUNDED

### 3.3 Value Objects

- `domain/src/value-objects/order-number.ts` — format `ORD-YYYYMMDD-XXXX`

### 3.4 Use Cases

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

### 3.5 API Routes

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

## Section 4: Module 3 — Support Tickets

### 4.1 DB Schema

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

### 4.2 State Machine (per STATE_MACHINES.md Section 7)

- OPEN → ASSIGNED (assign)
- ASSIGNED → PENDING_INFO (request_info) / RESOLVED (resolve)
- PENDING_INFO → ASSIGNED (patient_reply)
- RESOLVED → CLOSED (close) / ASSIGNED (reopen)

### 4.3 Value Objects

- `domain/src/value-objects/ticket-number.ts` — format `TKT-YYYYMMDD-XXXX`

### 4.4 AuthZ Decision

> **Explicit decision**: Support ticket `assigned_to` references `users` with role=ADMIN. There is no separate SUPPORT role in v2. If/when a SUPPORT role is needed, we add it to `UserRole` enum and update authz checks. For now, ADMIN handles support.

### 4.5 Use Cases

| Use Case | Actor |
|----------|-------|
| `CreateTicket` | Patient |
| `ListTickets` | Patient (own) / Admin (all) |
| `GetTicket` | Patient (own) / Admin |
| `AssignTicket` | Admin |
| `ReplyToTicket` | Patient / Admin |
| `UpdateTicketStatus` | Admin |
| `CloseTicket` | Patient / Admin |

### 4.6 API Routes

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

## Section 5: Module 4 — CaseJourney + Milestones + CaseEvents

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
CREATE UNIQUE INDEX idx_case_journeys_case ON case_journeys(case_id);
CREATE INDEX idx_milestones_case_date ON journey_milestones(case_id, event_date ASC);
CREATE INDEX idx_case_events_case_created ON case_events(case_id, created_at DESC);
CREATE INDEX idx_case_events_type ON case_events(event_type, created_at DESC);
CREATE INDEX idx_milestones_patient_visible ON journey_milestones(is_visible_to_patient, event_date ASC) WHERE is_visible_to_patient = true;
```

### 5.2 Design Decision: Journey JSONB

> The `case_journeys` table uses JSONB columns for visa/insurance/accommodation/transportation/post_care. This is intentional for Phase 2 — these sub-modules are informational and don't have complex state machines. If specific sub-modules later need structured workflows (e.g., visa checklist with item-level tracking), they can be broken into dedicated tables in a future phase. For now, the JSONB approach keeps the schema simple and matches the patientsflow docs.

### 5.3 Use Cases

| Use Case | Actor |
|----------|-------|
| `GetCaseJourney` | Patient/Admin/Hospital |
| `UpdateCaseJourney` | Admin |
| `ListMilestones` | Patient (visible only) / Admin/Hospital (all) |
| `CreateMilestone` | Admin/Hospital |
| `UpdateMilestone` | Admin |
| `DeleteMilestone` | Admin |
| `ListCaseEvents` | Admin/Hospital |
| `RecordCaseEvent` | **Internal only** — called by other use cases within transactions |

### 5.4 Event Recording Integration

After Module 4 is implemented, retrofit event recording into Modules 1-3:

| Use Case | Event Type |
|----------|------------|
| `SendQuote` | QUOTE_SENT |
| `AcceptQuote` | QUOTE_ACCEPTED |
| `RejectQuote` | QUOTE_REJECTED |
| `UpdateOrderStatus` | ORDER_STATUS_CHANGED |
| `UpdateTicketStatus` | STATUS_CHANGED |
| `UpdateCaseJourney` | JOURNEY_UPDATED |

Implementation: inject `CaseEventRepository` into existing use cases, add `recordCaseEvent()` call within existing transactions.

### 5.5 API Routes

```
GET    /api/v2/cases/{caseId}/journey            — GetCaseJourney
PUT    /api/v2/cases/{caseId}/journey            — UpdateCaseJourney

GET    /api/v2/cases/{caseId}/milestones         — ListMilestones
POST   /api/v2/cases/{caseId}/milestones         — CreateMilestone
PATCH  /api/v2/cases/{caseId}/milestones/{id}    — UpdateMilestone
DELETE /api/v2/cases/{caseId}/milestones/{id}    — DeleteMilestone

GET    /api/v2/cases/{caseId}/events             — ListCaseEvents
```

---

## Section 6: Module 5 — BookingRequest + Patient Auth

> **This module is separated from the core business modules** because it introduces public (unauthenticated) routes and requires a patient auth/session design that doesn't exist in v2 yet.

### 6.1 Patient Auth Design

Current v2 auth: Keycloak PKCE flow → iron-session BFF cookies. All `/api/v2/*` routes require a valid Keycloak session.

For BookingRequest, we need:
1. **Public routes** (`/api/v2/public/*`) — no auth required, used during signup flow
2. **Patient session creation** — `CompleteSignup` creates a Keycloak user and establishes a session
3. **Patient-scoped routes** — existing `/api/v2/*` routes need to work for PATIENT role (currently only tested with ADMIN/HOSPITAL)

**Auth middleware changes:**
- Add a `publicRoutes` allowlist in the Keycloak middleware for `/api/v2/public/*`
- Ensure existing session middleware correctly handles `role=PATIENT`
- No new auth mechanism — reuse Keycloak PKCE for patients

### 6.2 DB Schema

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

### 6.3 Value Objects

- `domain/src/value-objects/booking-request-number.ts` — format `BR-YYYYMMDD-XXXX`

### 6.4 Use Cases

| Use Case | Actor | Description |
|----------|-------|-------------|
| `CreateBookingRequest` | Public | Submit booking form (no auth) |
| `GetHospitalRecommendations` | Public | Get matched + explore hospitals by booking_request_id |
| `SaveHospitalSelections` | Public | Save patient's hospital selections |
| `CompleteSignup` | Public | **Transactional** — see below |

**CompleteSignup Transaction:**
1. Create or find user by email
2. Create Keycloak user (if new)
3. Update booking_request.user_id, status → COMPLETED
4. Create case (assignment_status=UNASSIGNED)
5. For each selected hospital: create case_hospital_contact (sub_status=DISTRIBUTED)
6. Create Keycloak session / issue tokens
7. Trigger welcome email (async, outside transaction)

### 6.5 API Routes

```
POST   /api/v2/public/booking-requests                           — CreateBookingRequest
GET    /api/v2/public/hospital-recommendations/{bookingId}       — GetHospitalRecommendations
POST   /api/v2/public/booking-requests/{id}/selections           — SaveHospitalSelections
POST   /api/v2/public/booking-requests/{id}/complete-signup      — CompleteSignup
```

---

## Section 7: Module 6 — Dashboard Aggregation

### 7.1 Design

Pure read-only aggregation endpoints. No new tables. Each dashboard use case composes calls to existing repositories.

### 7.2 Use Cases + API

**Patient Dashboard** — `GET /api/v2/patient/dashboard`
```json
{
  "profileCompletion": { "percentage": 75, "steps": [...] },
  "cases": [{ "id": "...", "caseNumber": "...", "assignmentStatus": "...", "hospitals": [...] }],
  "upcomingMilestones": [...],
  "ordersSummary": { "pendingPayment": 1, "inProgress": 2, "completed": 3 },
  "unreadMessageCount": 5,
  "recommendedHospitals": [...]
}
```

**Admin Dashboard** — `GET /api/v2/admin/dashboard`
```json
{
  "stats": { "newInquiries": 12, "unassigned": 8, "assigned": 45, "newMessages": 7, "urgent": 3, "todayNew": 2 },
  "recentUsers": [...],
  "recentCases": [...],
  "pendingActions": [...]
}
```

**Hospital Dashboard** — `GET /api/v2/hospital/dashboard`
```json
{
  "stats": { "assignedCases": 15, "newCases": 3, "todayConsultations": 2, "pendingMessages": 5 },
  "todayConsultations": [...],
  "newCases": [...],
  "pendingMessages": [...]
}
```

---

## Section 8: Module 7 — QuestionCollector

### 8.1 DB Schema

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
  case_id UUID NOT NULL REFERENCES cases(id),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  original_questions JSONB NOT NULL,
  customized_questions JSONB NOT NULL,
  customized_by UUID REFERENCES users(id),
  customized_at TIMESTAMPTZ,
  sent_to_patient BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, hospital_id)
);

-- FK: cases.question_collector_template_id → question_collector_templates(id)
-- (already added in M0 as column; FK added here)
ALTER TABLE cases ADD CONSTRAINT cases_qc_template_fkey
  FOREIGN KEY (question_collector_template_id) REFERENCES question_collector_templates(id);

-- Indexes
CREATE INDEX idx_qcr_case ON question_collector_responses(case_id, submitted_at DESC);
CREATE INDEX idx_qcr_risk_flags ON question_collector_responses USING gin(risk_flags);
CREATE INDEX idx_qcc_case_hospital ON question_collector_customizations(case_id, hospital_id);
CREATE INDEX idx_qcr_completion_submitted ON question_collector_responses(completion_status, submitted_at DESC);
```

### 8.2 Design Decision: Customizations

> Per DATA_MODELS.md Section 4.3, hospitals can customize the questionnaire per case. The `question_collector_customizations` table stores the hospital's override. When a patient fills out the questionnaire, the system checks if a customization exists for their case+hospital; if yes, use customized_questions; if no, use the template's default questions.

### 8.3 Use Cases

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

### 8.4 API Routes

```
POST   /api/v2/question-templates               — CreateTemplate
GET    /api/v2/question-templates               — ListTemplates
GET    /api/v2/question-templates/{id}          — GetTemplate
PUT    /api/v2/question-templates/{id}          — UpdateTemplate

POST   /api/v2/cases/{caseId}/questionnaire     — SubmitResponse
PATCH  /api/v2/cases/{caseId}/questionnaire     — SaveResponseDraft
GET    /api/v2/cases/{caseId}/questionnaire     — GetResponse
GET    /api/v2/questionnaire-responses          — ListResponses (Admin)

POST   /api/v2/cases/{caseId}/questionnaire-customization     — CustomizeQuestions (Hospital)
GET    /api/v2/cases/{caseId}/questionnaire-customization     — GetCustomization (Hospital)
```

---

## Section 9: Module 8 — ServiceCatalog + QuoteTemplates

### 9.1 DB Schema

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

### 9.2 Use Cases

Standard CRUD for both entities, scoped by `hospital_id`. Hospital users can only manage their own catalog/templates. Admin can view all.

### 9.3 API Routes

```
POST   /api/v2/hospitals/{hospitalId}/service-catalog    — Create
GET    /api/v2/hospitals/{hospitalId}/service-catalog    — List
GET    /api/v2/service-catalog/{id}                     — Get
PUT    /api/v2/service-catalog/{id}                     — Update
DELETE /api/v2/service-catalog/{id}                     — Delete (soft: is_active=false)

POST   /api/v2/hospitals/{hospitalId}/quote-templates    — Create
GET    /api/v2/hospitals/{hospitalId}/quote-templates    — List
GET    /api/v2/quote-templates/{id}                     — Get
PUT    /api/v2/quote-templates/{id}                     — Update
DELETE /api/v2/quote-templates/{id}                     — Delete (soft: is_active=false)
```

---

## Section 10: Cross-Cutting Concerns

### 10.1 Authorization (AuthZ)

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

### 10.2 Number Generation (Value Objects)

| Entity | Format | Example |
|--------|--------|---------|
| CaseNumber | `CASE-YYYY-XXXX` | `CASE-2026-0001` (existing) |
| QuoteNumber | `QT-YYYYMMDD-XXXX` | `QT-20260315-0001` |
| OrderNumber | `ORD-YYYYMMDD-XXXX` | `ORD-20260315-0001` |
| TicketNumber | `TKT-YYYYMMDD-XXXX` | `TKT-20260315-0001` |
| BookingRequestNumber | `BR-YYYYMMDD-XXXX` | `BR-20260315-0001` |

All follow existing `CaseNumber` value object pattern.

### 10.3 File Organization (per existing patterns)

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

### 10.4 Testing Strategy

- Each use case: unit test with mocked repositories (vitest)
- Each validation schema: unit test
- State machine transitions: unit test
- Transaction-critical use cases (AcceptQuote, CompleteSignup): integration test with real DB
- Follow existing vitest config in each package

---

## Section 11: Implementation Order Summary

| Order | Module | New Tables | Alter | ~Use Cases | ~Routes | Dependencies |
|-------|--------|------------|-------|-----------|---------|-------------|
| **0** | Case Model Realignment | — | cases +8 cols, +2 enums | 5 rewrite | 3 rewrite | None |
| **0.5** | Transaction + Idempotency | idempotency_keys (optional) | — | 0 (infra) | 0 | Section 0 |
| **1** | Quotes + CHC | 2 | — | 14 | 15 | Section 0, 0.5 |
| **2** | Orders + Packages | 2 | — | 12 | 12 | Section 0.5 |
| **3** | Support Tickets | 2 | — | 7 | 7 | — |
| **4** | Journey + Milestones + Events | 3 | — | 8 | 7 | Retrofit events into 1-3 |
| **5** | BookingRequest + Patient Auth | 2 | cases +1 FK | 4 | 4 | Section 1 (needs CHC) |
| **6** | Dashboard Aggregation | 0 | — | 3 | 3 | Modules 1-5 |
| **7** | QuestionCollector | 3 | cases FK | 10 | 10 | — |
| **8** | ServiceCatalog + QuoteTemplates | 2 | — | 10 | 12 | — |
| **Total** | | **16 + alter** | | **~71** | **~71** | |

---

## Section 12: Deferred / Out-of-Scope

The following entities and features are defined in patientsflow docs but **explicitly excluded** from this Phase 2 spec. They can be added in future phases without breaking the modules designed here.

### 12.1 ReplyTask (用户决定移除)

**Reason**: User decided ReplyTasks are not needed ("ReplyTasks 我想了下不定需要，可以去掉").

ReplyTask was a hospital-side queue for pending conversation replies (DATA_MODELS.md §ReplyTask). The hospital inbox in Module 1 can filter conversations needing reply via `conversations.last_message_at` + `conversations.hospital_replied` flag instead.

### 12.2 CaseSummary (AI-Generated)

**Reason**: Depends on AI pipeline integration not yet scoped.

DATA_MODELS.md defines `CaseSummary` with `ai_provider`, `model_version`, `generated_at`. The `ai_summary_status` field on `cases` is added in Section 0 (M0 migration) as a placeholder. Actual generation logic, AI provider integration, and summary display are deferred.

### 12.3 ChatbotFaq / ChatbotSetting

**Reason**: Chatbot is a standalone subsystem with its own UI, not part of CRM core.

These tables support a patient-facing FAQ chatbot. They have no FK dependencies on other Phase 2 entities and can be added independently.

### 12.4 Email / Notification Templates

**Reason**: Notification delivery is infrastructure, not business logic.

Phase 2 use cases emit domain events (e.g., `QuoteAccepted`, `TicketAssigned`). The actual email/SMS/push delivery pipeline — templates, providers, retry queues — is a separate infrastructure concern.

### 12.5 Admin Bulk Operations

**Reason**: Admin bulk actions (bulk assign, bulk close, bulk export) are convenience features that layer on top of the single-entity use cases designed here. Add after core CRUD is stable.

### 12.6 Analytics / Reporting

**Reason**: Read-only aggregation queries for business intelligence. Can be added as read-only endpoints or a separate analytics service without modifying existing modules.

---

*Spec version: v1.1*
*Last updated: 2026-03-15*
*Source docs: patientsflow/DATA_MODELS.md, QUERY_CATALOG.md, STATE_MACHINES.md, PATIENT_CONSOLE_FLOW.md, ADMIN_PORTAL_CRM_REDESIGN.md, HOSPITAL_PORTAL_CRM_REDESIGN.md*
*Review: Codex review + internal spec review feedback incorporated*
