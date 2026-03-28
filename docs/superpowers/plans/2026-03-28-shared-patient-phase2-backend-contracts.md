# Shared Patient Phase 2 Backend Contracts Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared CRM v2 backend/contracts for patient phase 2 so both Medora and China can consume stable patient APIs for tickets, orders, packages, journey, and case-level AI summary.

**Architecture:** Keep the existing admin/hospital resource stack in place, then add a dedicated patient-facing contract layer on top of it. Reuse existing generic use cases when the semantics already match, add new patient-specific use cases only where patient rules materially diverge, and expose the new behavior through `/api/patient/*` plus one internal AI ticket route.

**Tech Stack:** Hono, TypeScript, Vitest, Zod, Drizzle, CRM v2 application/domain packages

---

## Preconditions

- Execution target: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2` on branch `feature/phase-2bc`
- Approved spec: [`2026-03-28-shared-patient-phase2-backend-contracts-design.md`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-28-shared-patient-phase2-backend-contracts-design.md)
- Current worktree already contains unrelated uncommitted Dify chatbot changes. Do **not** stage or edit those files unless the task explicitly requires it.
- Keep all patient phase 2 work limited to patient contracts, supporting domain/schema changes, and tests.
- Do **not** start China or Medora frontend integration in this plan.

## Codebase Paths

- Backend repo: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2` (alias: `$BE`)
- Approved spec: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-28-shared-patient-phase2-backend-contracts-design.md`

## File Structure

### Existing Files To Reuse

| File | Responsibility |
|---|---|
| `$BE/apps/api/src/routes/patient-protected.routes.ts` | Existing patient-authenticated route surface from phase 1 |
| `$BE/apps/api/src/routes/internal.routes.ts` | Existing internal trusted route surface |
| `$BE/apps/api/src/composition-root.ts` | Service wiring for routes/use cases |
| `$BE/packages/shared/validation/src/patient.schema.ts` | Existing patient-specific validation schemas |
| `$BE/packages/shared/validation/src/support-ticket.schema.ts` | Existing ticket schemas and enums |
| `$BE/packages/shared/validation/src/order.schema.ts` | Existing order schemas and enums |
| `$BE/packages/shared/validation/src/package.schema.ts` | Existing package list/query schemas |
| `$BE/packages/application/src/use-cases/tickets/*.ts` | Generic ticket business logic already used by admin routes |
| `$BE/packages/application/src/use-cases/orders/*.ts` | Generic order business logic already used by admin routes |
| `$BE/packages/application/src/use-cases/journey/*.ts` | Generic journey read/write use cases |
| `$BE/packages/application/src/use-cases/packages/*.ts` | Generic package read/write use cases |
| `$BE/packages/application/src/use-cases/patient-dashboard/*.ts` | Existing patient-side use case namespace |
| `$BE/packages/infrastructure/database/schema/schema.ts` | Drizzle table definitions |
| `$BE/packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts` | Ticket persistence |
| `$BE/packages/infrastructure/database/repositories/drizzle-order.repository.ts` | Order persistence |

### New Files For This Plan

| File | Responsibility |
|---|---|
| `$BE/apps/api/src/routes/patient-tickets.routes.ts` | Patient ticket routes mounted under `/api/patient` |
| `$BE/apps/api/src/routes/patient-orders.routes.ts` | Patient order routes mounted under `/api/patient` |
| `$BE/apps/api/src/routes/patient-packages.routes.ts` | Patient package browse/detail routes |
| `$BE/apps/api/src/routes/patient-case-insights.routes.ts` | Patient journey, milestones, AI summary case reads |
| `$BE/apps/api/src/__tests__/patient-tickets.routes.test.ts` | Route coverage for patient tickets |
| `$BE/apps/api/src/__tests__/patient-orders.routes.test.ts` | Route coverage for patient orders |
| `$BE/apps/api/src/__tests__/patient-packages.routes.test.ts` | Route coverage for patient packages |
| `$BE/apps/api/src/__tests__/patient-case-insights.routes.test.ts` | Route coverage for journey + AI summary |
| `$BE/packages/application/src/dtos/patient-ticket.dto.ts` | Patient-safe ticket response shape |
| `$BE/packages/application/src/dtos/patient-order.dto.ts` | Patient-safe order response shape |
| `$BE/packages/application/src/dtos/patient-package.dto.ts` | Patient-safe package response shape |
| `$BE/packages/application/src/dtos/patient-journey.dto.ts` | Patient-safe journey + milestone shape |
| `$BE/packages/application/src/dtos/patient-ai-summary.dto.ts` | Dedicated case-level AI summary shape |
| `$BE/packages/application/src/mappers/patient-ticket.mapper.ts` | Map generic ticket entities/results into patient DTOs |
| `$BE/packages/application/src/mappers/patient-order.mapper.ts` | Map generic order entities/results into patient DTOs |
| `$BE/packages/application/src/mappers/patient-package.mapper.ts` | Map package entities into patient-facing shape |
| `$BE/packages/application/src/mappers/patient-journey.mapper.ts` | Map journey/milestones into patient-facing shape |
| `$BE/packages/application/src/use-cases/patient-dashboard/create-patient-order.use-case.ts` | Patient-only order creation from package |
| `$BE/packages/application/src/use-cases/patient-dashboard/get-patient-ai-summary.use-case.ts` | Dedicated case-level AI summary read |
| `$BE/packages/application/src/use-cases/tickets/create-internal-ai-ticket.use-case.ts` | Trusted internal wrapper over generic ticket creation |
| `$BE/packages/application/__tests__/patient-phase2-use-cases.test.ts` | New focused application tests for patient phase 2 |
| `$BE/packages/infrastructure/database/migrations/025_patient_phase2_contracts.sql` | Ticket source attribution and any minimal schema additions required by phase 2 |

### Files Likely To Be Modified

| File | Change |
|---|---|
| `$BE/apps/api/src/routes/patient-protected.routes.ts` | Mount the new patient route modules and keep phase 1 routes intact |
| `$BE/apps/api/src/routes/internal.routes.ts` | Add trusted AI ticket-creation route |
| `$BE/apps/api/src/__tests__/internal.routes.test.ts` | Cover the new AI ticket route auth and execution |
| `$BE/packages/shared/validation/src/patient.schema.ts` | Add patient-specific ticket/order/package query/body schemas |
| `$BE/packages/shared/validation/src/support-ticket.schema.ts` | Replace old ticket type enum, add internal source schema if needed |
| `$BE/packages/shared/validation/src/order.schema.ts` | Keep admin order schema intact while adding patient-create order schema references |
| `$BE/packages/shared/validation/src/index.ts` | Export all new schemas |
| `$BE/packages/application/src/index.ts` | Export new DTOs and use cases |
| `$BE/packages/application/src/dtos/support-ticket.dto.ts` | Add source attribution if spec-backed schema expansion is implemented |
| `$BE/packages/application/src/mappers/support-ticket.mapper.ts` | Map any new ticket source field |
| `$BE/packages/application/src/use-cases/tickets/create-ticket.use-case.ts` | Accept source attribution and preserve shared business logic |
| `$BE/packages/application/src/use-cases/orders/create-order.use-case.ts` | Keep admin/generic path intact after patient-specific order flow is added |
| `$BE/packages/application/src/use-cases/packages/list-packages.use-case.ts` | Reuse for patient route filtering if needed |
| `$BE/packages/application/src/use-cases/packages/get-package.use-case.ts` | Reuse for patient route filtering if needed |
| `$BE/packages/application/src/use-cases/patient-dashboard/get-patient-case-detail.use-case.ts` | Keep phase 1 contract unchanged unless AI summary extraction requires a small adjustment |
| `$BE/packages/infrastructure/database/schema/schema.ts` | Reflect migration changes such as ticket source field |
| `$BE/packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts` | Persist/load ticket source attribution if added |
| `$BE/packages/application/__tests__/ticket-use-cases.test.ts` | Update for new ticket types or source field behavior |
| `$BE/packages/application/__tests__/order-use-cases.test.ts` | Keep generic order behavior green after patient order flow is introduced |
| `$BE/packages/application/__tests__/journey-use-cases.test.ts` | Add patient visibility/read assertions if needed |
| `$BE/apps/api/src/__tests__/tickets.routes.test.ts` | Update for new ticket types/source behavior if shared schemas change |
| `$BE/apps/api/src/__tests__/orders.routes.test.ts` | Keep admin order routes green after patient route additions |

## Plan Rules

- Prefer reusing existing generic use cases where ownership semantics already fit.
- Do **not** create patient-specific wrapper use cases for simple pass-through reads if route + actor + mapper is enough.
- Do create patient-specific use cases where patient rules diverge materially, especially package-only order creation and dedicated AI summary reads.
- Keep patient routes out of `/api/v2/*`; patient APIs belong under `/api/patient/*`.
- Keep AI chatbot ticket creation out of public patient routes; it belongs under the internal trusted route surface.
- Keep each commit scoped to one task group.

## Chunk 1: Contract Primitives And Application Layer

### Task 0: Freeze Scope And Verify Baseline

**Files:**
- Verify only: `$BE`

- [ ] **Step 1: Confirm current branch and unrelated dirty files**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git status --short --branch
```

Expected:
- branch is `feature/phase-2bc`
- unrelated Dify files are visible and left untouched

- [ ] **Step 2: Verify the approved spec exists**

Run:
```bash
ls /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-28-shared-patient-phase2-backend-contracts-design.md
```

Expected:
- file exists

- [ ] **Step 3: Run baseline targeted tests before edits**

Run:
```bash
pnpm --filter @medical-crm/application exec vitest run packages/application/__tests__/ticket-use-cases.test.ts packages/application/__tests__/order-use-cases.test.ts packages/application/__tests__/journey-use-cases.test.ts
pnpm --filter @medical-crm/api exec vitest run apps/api/src/__tests__/tickets.routes.test.ts apps/api/src/__tests__/orders.routes.test.ts apps/api/src/__tests__/journey.routes.test.ts apps/api/src/__tests__/internal.routes.test.ts
```

Expected:
- current baseline passes before phase 2 edits begin

### Task 1: Add Patient Phase 2 Validation And DTO Primitives

**Files:**
- Modify: `$BE/packages/shared/validation/src/patient.schema.ts`
- Modify: `$BE/packages/shared/validation/src/support-ticket.schema.ts`
- Modify: `$BE/packages/shared/validation/src/index.ts`
- Create: `$BE/packages/application/src/dtos/patient-ticket.dto.ts`
- Create: `$BE/packages/application/src/dtos/patient-order.dto.ts`
- Create: `$BE/packages/application/src/dtos/patient-package.dto.ts`
- Create: `$BE/packages/application/src/dtos/patient-journey.dto.ts`
- Create: `$BE/packages/application/src/dtos/patient-ai-summary.dto.ts`
- Create: `$BE/packages/application/src/mappers/patient-ticket.mapper.ts`
- Create: `$BE/packages/application/src/mappers/patient-order.mapper.ts`
- Create: `$BE/packages/application/src/mappers/patient-package.mapper.ts`
- Create: `$BE/packages/application/src/mappers/patient-journey.mapper.ts`

- [ ] **Step 1: Write the failing validation tests**

Create or extend tests so they assert:
- new patient ticket types parse
- old phase-1 patient schemas still parse
- patient create-order schema rejects raw amount/type and only accepts `packageId` plus optional `caseId`
- patient package list query schema stays read-only and pagination-safe

Recommended test file:
```bash
touch /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/__tests__/patient-phase2.schema.test.ts
```

- [ ] **Step 2: Run the new validation test and verify it fails**

Run:
```bash
pnpm --filter @medical-crm/validation exec vitest run packages/shared/validation/src/__tests__/patient-phase2.schema.test.ts
```

Expected:
- FAIL because the new patient phase 2 schemas do not exist yet

- [ ] **Step 3: Add patient phase 2 schemas**

In `$BE/packages/shared/validation/src/patient.schema.ts`, add focused patient-only schemas such as:

```ts
export const createPatientTicketSchema = z.object({
  caseId: z.string().uuid().optional(),
  type: patientTicketTypeSchema,
  priority: ticketPrioritySchema.default('MEDIUM'),
  subject: z.string().max(500).optional(),
  description: z.string().min(1),
  sourcePage: z.string().max(200).optional(),
});

export const createPatientOrderSchema = z.object({
  packageId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  idempotencyKey: z.string().max(100).optional(),
});
```

Also add patient query schemas for:
- ticket list
- order list
- package list

In `$BE/packages/shared/validation/src/support-ticket.schema.ts`, replace the ticket type enum values with:

```ts
z.enum([
  'GENERAL_SUPPORT',
  'MEDICAL_QUESTION',
  'QUOTE_PRICING',
  'PACKAGE_ORDER',
  'PAYMENT_REFUND',
  'TRAVEL_JOURNEY',
  'ACCOUNT_TECHNICAL',
])
```

- [ ] **Step 4: Add patient-facing DTOs and mappers**

Implement DTOs that intentionally exclude admin-only fields.

Minimum patient package DTO:

```ts
export interface PatientPackageDTO {
  id: string;
  nameEn: string;
  nameZh: string | null;
  type: string;
  price: string;
  currency: string;
  descriptionEn: string | null;
  descriptionZh: string | null;
  inclusions: unknown;
  coverImageUrl: string | null;
}
```

Minimum patient AI summary DTO:

```ts
export interface PatientAiSummaryDTO {
  caseId: string;
  status: 'EMPTY' | 'PENDING' | 'READY' | 'FAILED';
  summary: string | null;
  language: string | null;
  updatedAt: string | null;
}
```

- [ ] **Step 5: Run validation tests again**

Run:
```bash
pnpm --filter @medical-crm/validation exec vitest run packages/shared/validation/src/__tests__/patient-phase2.schema.test.ts
```

Expected:
- PASS

- [ ] **Step 6: Commit schema/DTO primitives**

```bash
git add \
  packages/shared/validation/src/patient.schema.ts \
  packages/shared/validation/src/support-ticket.schema.ts \
  packages/shared/validation/src/index.ts \
  packages/shared/validation/src/__tests__/patient-phase2.schema.test.ts \
  packages/application/src/dtos/patient-ticket.dto.ts \
  packages/application/src/dtos/patient-order.dto.ts \
  packages/application/src/dtos/patient-package.dto.ts \
  packages/application/src/dtos/patient-journey.dto.ts \
  packages/application/src/dtos/patient-ai-summary.dto.ts \
  packages/application/src/mappers/patient-ticket.mapper.ts \
  packages/application/src/mappers/patient-order.mapper.ts \
  packages/application/src/mappers/patient-package.mapper.ts \
  packages/application/src/mappers/patient-journey.mapper.ts
git commit -m "feat: add patient phase 2 contract primitives"
```

### Task 2: Add Minimal Domain/Application Support For AI Tickets, Patient Orders, And AI Summary

**Files:**
- Create: `$BE/packages/application/src/use-cases/patient-dashboard/create-patient-order.use-case.ts`
- Create: `$BE/packages/application/src/use-cases/patient-dashboard/get-patient-ai-summary.use-case.ts`
- Create: `$BE/packages/application/src/use-cases/tickets/create-internal-ai-ticket.use-case.ts`
- Modify: `$BE/packages/application/src/use-cases/tickets/create-ticket.use-case.ts`
- Modify: `$BE/packages/application/src/dtos/support-ticket.dto.ts`
- Modify: `$BE/packages/application/src/mappers/support-ticket.mapper.ts`
- Modify: `$BE/packages/application/src/index.ts`
- Modify: `$BE/packages/infrastructure/database/schema/schema.ts`
- Modify: `$BE/packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts`
- Create: `$BE/packages/infrastructure/database/migrations/025_patient_phase2_contracts.sql`
- Create: `$BE/packages/application/__tests__/patient-phase2-use-cases.test.ts`
- Modify: `$BE/packages/application/__tests__/ticket-use-cases.test.ts`
- Modify: `$BE/packages/application/__tests__/order-use-cases.test.ts`

- [ ] **Step 1: Write failing application tests for the new behavior**

Cover at least:
- patient order creation requires `packageId`
- patient order creation derives `type`, `amount`, and `currency` from package, not client input
- patient AI summary returns `EMPTY` when no summary exists
- internal AI ticket creation reuses ticket creation logic and tags source attribution

- [ ] **Step 2: Run the new use case tests and verify they fail**

Run:
```bash
pnpm --filter @medical-crm/application exec vitest run packages/application/__tests__/patient-phase2-use-cases.test.ts
```

Expected:
- FAIL because the new use cases and source attribution support do not exist yet

- [ ] **Step 3: Add ticket source attribution**

Add a minimal explicit ticket source field instead of overloading `sourcePage`.

Migration target:
```sql
ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'PATIENT_PORTAL';
```

Then update:
- Drizzle schema
- support ticket entity persistence mapping
- DTO + mapper
- create-ticket input/use case

Allowed source values for this phase:
- `PATIENT_PORTAL`
- `ADMIN_PORTAL`
- `AI_CHATBOT`

- [ ] **Step 4: Implement `CreateInternalAiTicketUseCase`**

Use a trusted wrapper that calls the generic `CreateTicketUseCase` with:
- validated internal secret at the route layer
- explicit `source = 'AI_CHATBOT'`
- synthetic internal actor only inside the wrapper, not in public route code

Do **not** expand `Actor.role` with a new global `INTERNAL` role in this phase.

- [ ] **Step 5: Implement `CreatePatientOrderUseCase`**

Behavior:
- load package by `packageId`
- reject missing/unpublished/unpurchasable package
- validate optional `caseId` belongs to patient when supplied
- derive `type`, `amount`, and `currency` from package
- call generic order creation or create the entity directly through `orderRepo`
- return patient-safe order DTO

Do **not** accept raw amount or order type from patient input.

- [ ] **Step 6: Implement `GetPatientAiSummaryUseCase`**

Behavior:
- load case by `caseId`
- enforce patient ownership
- map existing case fields into dedicated summary DTO:
  - `EMPTY` when no summary exists and no ready text is stored
  - `PENDING` when `aiSummaryStatus` is pending
  - `READY` when summary text exists
  - `FAILED` only if the underlying status model can represent failure safely

- [ ] **Step 7: Run the application tests again**

Run:
```bash
pnpm --filter @medical-crm/application exec vitest run \
  packages/application/__tests__/patient-phase2-use-cases.test.ts \
  packages/application/__tests__/ticket-use-cases.test.ts \
  packages/application/__tests__/order-use-cases.test.ts
```

Expected:
- PASS

- [ ] **Step 8: Commit application-layer support**

```bash
git add \
  packages/application/src/use-cases/patient-dashboard/create-patient-order.use-case.ts \
  packages/application/src/use-cases/patient-dashboard/get-patient-ai-summary.use-case.ts \
  packages/application/src/use-cases/tickets/create-internal-ai-ticket.use-case.ts \
  packages/application/src/use-cases/tickets/create-ticket.use-case.ts \
  packages/application/src/dtos/support-ticket.dto.ts \
  packages/application/src/mappers/support-ticket.mapper.ts \
  packages/application/src/index.ts \
  packages/infrastructure/database/migrations/025_patient_phase2_contracts.sql \
  packages/infrastructure/database/schema/schema.ts \
  packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts \
  packages/application/__tests__/patient-phase2-use-cases.test.ts \
  packages/application/__tests__/ticket-use-cases.test.ts \
  packages/application/__tests__/order-use-cases.test.ts
git commit -m "feat: add patient phase 2 application support"
```

## Chunk 2: Patient Routes And Internal AI Entry

### Task 3: Split Patient Phase 2 Routes Out Of `patient-protected.routes.ts`

**Files:**
- Create: `$BE/apps/api/src/routes/patient-tickets.routes.ts`
- Create: `$BE/apps/api/src/routes/patient-orders.routes.ts`
- Create: `$BE/apps/api/src/routes/patient-packages.routes.ts`
- Create: `$BE/apps/api/src/routes/patient-case-insights.routes.ts`
- Modify: `$BE/apps/api/src/routes/patient-protected.routes.ts`
- Modify: `$BE/apps/api/src/composition-root.ts`

- [ ] **Step 1: Write failing route tests for the new patient surfaces**

Create:
- `$BE/apps/api/src/__tests__/patient-tickets.routes.test.ts`
- `$BE/apps/api/src/__tests__/patient-orders.routes.test.ts`
- `$BE/apps/api/src/__tests__/patient-packages.routes.test.ts`
- `$BE/apps/api/src/__tests__/patient-case-insights.routes.test.ts`

Cover at least:
- patient ticket create/list/get/reply
- patient order create/list/get/payment-intent
- patient package list/get returning published-only patient shape
- patient journey/milestones ownership filtering
- patient AI summary empty and ready states

- [ ] **Step 2: Run the new patient route tests and verify they fail**

Run:
```bash
pnpm --filter @medical-crm/api exec vitest run \
  apps/api/src/__tests__/patient-tickets.routes.test.ts \
  apps/api/src/__tests__/patient-orders.routes.test.ts \
  apps/api/src/__tests__/patient-packages.routes.test.ts \
  apps/api/src/__tests__/patient-case-insights.routes.test.ts
```

Expected:
- FAIL because the new route modules do not exist yet

- [ ] **Step 3: Implement `patient-tickets.routes.ts`**

Expose:
- `POST /tickets`
- `GET /tickets`
- `GET /tickets/:id`
- `POST /tickets/:id/replies`

Use:
- patient session from context
- patient validation schemas
- generic ticket use cases with patient actor
- patient DTO mappers before returning JSON

- [ ] **Step 4: Implement `patient-orders.routes.ts`**

Expose:
- `POST /orders`
- `GET /orders`
- `GET /orders/:id`
- `POST /orders/:id/payment-intents`

Use:
- `CreatePatientOrderUseCase` for create
- generic `ListOrdersUseCase` / `GetOrderUseCase` with patient actor for reads
- patient DTO mapper on responses

- [ ] **Step 5: Implement `patient-packages.routes.ts`**

Expose:
- `GET /packages`
- `GET /packages/:id`

Use:
- generic package read use cases with patient actor
- patient package mapper before returning JSON

- [ ] **Step 6: Implement `patient-case-insights.routes.ts`**

Expose:
- `GET /cases/:caseId/journey`
- `GET /cases/:caseId/milestones`
- `GET /cases/:caseId/ai-summary`

Use:
- generic journey read use cases with patient actor
- `GetPatientAiSummaryUseCase`
- patient DTO mappers before returning JSON

- [ ] **Step 7: Mount the new subroutes from `patient-protected.routes.ts`**

Keep existing phase 1 routes working:
- `/me`
- `/select-hospitals`
- `/conversations`
- `/cases`
- `/cases/:id`
- `/cases/:id/quote`
- `/intake/*`

Refactor `patient-protected.routes.ts` into:
- auth middleware + root app
- route mounts for the new patient phase 2 modules
- legacy phase 1 endpoints left intact

- [ ] **Step 8: Wire new use cases into `composition-root.ts`**

Add service registrations for:
- `createPatientOrder`
- `getPatientAiSummary`
- `createInternalAiTicket`

Reuse existing services for:
- ticket list/get/reply
- order list/get/payment intent
- package list/get
- journey get/list milestones

- [ ] **Step 9: Run patient route tests again**

Run:
```bash
pnpm --filter @medical-crm/api exec vitest run \
  apps/api/src/__tests__/patient-tickets.routes.test.ts \
  apps/api/src/__tests__/patient-orders.routes.test.ts \
  apps/api/src/__tests__/patient-packages.routes.test.ts \
  apps/api/src/__tests__/patient-case-insights.routes.test.ts
```

Expected:
- PASS

- [ ] **Step 10: Commit the patient route surface**

```bash
git add \
  apps/api/src/routes/patient-tickets.routes.ts \
  apps/api/src/routes/patient-orders.routes.ts \
  apps/api/src/routes/patient-packages.routes.ts \
  apps/api/src/routes/patient-case-insights.routes.ts \
  apps/api/src/routes/patient-protected.routes.ts \
  apps/api/src/composition-root.ts \
  apps/api/src/__tests__/patient-tickets.routes.test.ts \
  apps/api/src/__tests__/patient-orders.routes.test.ts \
  apps/api/src/__tests__/patient-packages.routes.test.ts \
  apps/api/src/__tests__/patient-case-insights.routes.test.ts
git commit -m "feat: add patient phase 2 route modules"
```

### Task 4: Add Trusted AI Ticket Creation Route

**Files:**
- Modify: `$BE/apps/api/src/routes/internal.routes.ts`
- Modify: `$BE/apps/api/src/__tests__/internal.routes.test.ts`
- Modify: `$BE/packages/shared/validation/src/patient.schema.ts` (if the internal route body schema lives there, otherwise create a narrow schema beside chatbot/internal validation)
- Modify: `$BE/packages/shared/validation/src/index.ts`

- [ ] **Step 1: Add a failing internal route test**

Cover:
- missing `X-Internal-Secret` returns `401`
- valid secret calls `createInternalAiTicket.execute`
- route rejects unsupported ticket type

- [ ] **Step 2: Run the internal route test and verify it fails**

Run:
```bash
pnpm --filter @medical-crm/api exec vitest run apps/api/src/__tests__/internal.routes.test.ts
```

Expected:
- FAIL because the new internal AI route does not exist yet

- [ ] **Step 3: Implement the route**

Add route shape similar to:

```ts
POST /api/v2/internal/ai/tickets
```

Request body should include:
- `patientId`
- optional `caseId`
- `type`
- optional `priority`
- optional `subject`
- `description`
- optional `sourceContext`

Rules:
- protect with existing `X-Internal-Secret`
- never expose this route under `/api/patient/*`
- call `createInternalAiTicket.execute(...)`

- [ ] **Step 4: Re-run the internal route test**

Run:
```bash
pnpm --filter @medical-crm/api exec vitest run apps/api/src/__tests__/internal.routes.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit the internal AI entry**

```bash
git add \
  apps/api/src/routes/internal.routes.ts \
  apps/api/src/__tests__/internal.routes.test.ts \
  packages/shared/validation/src/patient.schema.ts \
  packages/shared/validation/src/index.ts
git commit -m "feat: add internal AI ticket route"
```

## Chunk 3: Regression Coverage And Final Verification

### Task 5: Keep Existing Admin Contracts Green After Shared Contract Changes

**Files:**
- Modify: `$BE/apps/api/src/__tests__/tickets.routes.test.ts`
- Modify: `$BE/apps/api/src/__tests__/orders.routes.test.ts`
- Modify: `$BE/apps/api/src/__tests__/packages.routes.test.ts`
- Modify: `$BE/packages/application/__tests__/journey-use-cases.test.ts`
- Modify: `$BE/packages/application/__tests__/package-use-cases.test.ts`

- [ ] **Step 1: Update admin route tests for the new ticket type enum and source field**

Adjust fixtures from old values like `GENERAL_QUESTIONS` to the new approved values such as `GENERAL_SUPPORT`.

- [ ] **Step 2: Add regression coverage for published-only patient package visibility**

If current package tests only cover admin behavior, extend them so patient behavior is also asserted through the use case or route layer.

- [ ] **Step 3: Add journey visibility assertions**

Ensure patient route tests or use case tests verify:
- invisible milestones do not appear
- unauthorized patient case access returns forbidden/not found according to current route conventions

- [ ] **Step 4: Run the shared regression suite**

Run:
```bash
pnpm --filter @medical-crm/application exec vitest run \
  packages/application/__tests__/ticket-use-cases.test.ts \
  packages/application/__tests__/order-use-cases.test.ts \
  packages/application/__tests__/journey-use-cases.test.ts \
  packages/application/__tests__/package-use-cases.test.ts \
  packages/application/__tests__/patient-phase2-use-cases.test.ts

pnpm --filter @medical-crm/api exec vitest run \
  apps/api/src/__tests__/tickets.routes.test.ts \
  apps/api/src/__tests__/orders.routes.test.ts \
  apps/api/src/__tests__/packages.routes.test.ts \
  apps/api/src/__tests__/journey.routes.test.ts \
  apps/api/src/__tests__/internal.routes.test.ts \
  apps/api/src/__tests__/patient-tickets.routes.test.ts \
  apps/api/src/__tests__/patient-orders.routes.test.ts \
  apps/api/src/__tests__/patient-packages.routes.test.ts \
  apps/api/src/__tests__/patient-case-insights.routes.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit regression test alignment**

```bash
git add \
  apps/api/src/__tests__/tickets.routes.test.ts \
  apps/api/src/__tests__/orders.routes.test.ts \
  apps/api/src/__tests__/packages.routes.test.ts \
  packages/application/__tests__/journey-use-cases.test.ts \
  packages/application/__tests__/package-use-cases.test.ts
git commit -m "test: cover patient phase 2 regressions"
```

### Task 6: Final Verification And Handoff

**Files:**
- Verify only: changed files from this plan

- [ ] **Step 1: Run type-aware application and API verification**

Run:
```bash
pnpm --filter @medical-crm/application test
pnpm --filter @medical-crm/api test
```

Expected:
- all relevant suites pass

- [ ] **Step 2: Run final hygiene checks**

Run:
```bash
pnpm --filter @medical-crm/application typecheck
pnpm --filter @medical-crm/api typecheck
git diff --check
git status --short
```

Expected:
- typecheck passes
- no whitespace errors
- only intended patient phase 2 files remain modified or all work is committed

- [ ] **Step 3: Review commit stack**

Run:
```bash
git log --oneline --decorate -n 8
```

Expected commit themes:
- patient phase 2 contract primitives
- patient phase 2 application support
- patient phase 2 route modules
- internal AI ticket route
- regression coverage

- [ ] **Step 4: Prepare execution handoff notes**

Document for the next execution session:
- which patient routes were added
- whether migration `025_patient_phase2_contracts.sql` was applied locally
- any remaining frontend-facing contract decisions that were intentionally deferred

- [ ] **Step 5: If this chunk passes, hand off to execution**

Recommended next step:
- execute this plan in the current dedicated branch using `superpowers:subagent-driven-development`

Do not start China or Medora frontend phase 2 work until this shared backend branch is green.
