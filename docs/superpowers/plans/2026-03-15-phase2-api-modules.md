# Phase 2: API Business Modules — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all Phase 2 API business modules — 9 modules, ~74 use cases, ~75 routes, 16 new tables — on top of the Phase 1 Clean Architecture foundation.

**Architecture:** Module-by-module vertical slices (domain → infrastructure → application → API) following the established Clean Architecture pattern. Each module is self-contained: migration → entity → port → Drizzle repo → DTO → mapper → use case → validation → route → composition root wiring. TDD throughout.

**Tech Stack:** TypeScript (ESM), Hono + @hono/zod-openapi, Drizzle ORM, Vitest, Zod, PostgreSQL pgEnum

**Spec:** `docs/superpowers/specs/2026-03-15-phase2-api-modules-design.md` (v2.3)

---

## Conventions (Read First)

These patterns are established in Phase 1. All new code **must** follow them exactly.

**Entity pattern** — see `packages/domain/src/entities/case.entity.ts`:
- `interface XProps { ... }` + `class X { constructor(props: XProps) { ... } }`
- `readonly id: string`, mutable domain fields
- Dates as `Date` objects, `updatedAt = new Date()` on mutation

**Repository port** — see `packages/domain/src/ports/case-repository.port.ts`:
- Interface `IXRepository` with `findById`, `findMany`, `save`, custom query methods
- Returns entity or `PaginatedResult<Entity>`

**Drizzle repository** — see `packages/infrastructure/database/repositories/drizzle-case.repository.ts`:
- `constructor(private readonly db: CrmDb)`
- `rowToEntity()` private mapper, `save()` uses upsert (`onConflictDoUpdate`)
- Parallel `[rows, count]` for paginated queries

**Use case** — see `packages/application/src/use-cases/cases/create-case.use-case.ts`:
- `constructor(private readonly repo: IXRepository)`
- `execute(input, actor): Promise<DTO>` — authz check → business logic → save → map to DTO

**DTO + Mapper** — see `packages/application/src/dtos/case.dto.ts` + `mappers/case.mapper.ts`:
- DTO is a plain interface, mapper is a `toXDTO()` function
- Dates → `.toISOString()`, enums → string

**Validation schema** — see `packages/shared/validation/src/case.schema.ts`:
- Zod schemas: `createXSchema`, `updateXSchema`, `xListQuerySchema`
- Type inference: `type CreateXInput = z.infer<typeof createXSchema>`

**Route** — see `apps/api/src/routes/cases.routes.ts`:
- `new OpenAPIHono()`, `createRoute({ method, path, request, responses })`, `app.openapi(route, handler)`
- Handler: `c.req.valid('json'|'param'|'query')` → `toActor(c.get('session'))` → `getServices().useCase.execute()`

**Test** — see `packages/application/__tests__/create-case.use-case.test.ts`:
- `vi.fn()` mocks for repos, `Actor` fixtures, `describe/it/expect` structure
- Entity tests: `createTestX()` helper with overrides

**Enum** — TypeScript union type in `packages/domain/src/enums/index.ts`, pgEnum in `schema.ts`

**Value object** — see `packages/domain/src/value-objects/case-number.ts`:
- `readonly value: string`, regex validation, `static generate()` factory

**Imports** — ESM with `.js` extensions: `import { X } from '../path/file.js'`

**Composition root** — `apps/api/src/composition-root.ts`: lazy singleton, instantiate repo → inject into use case

**Running tests:** `pnpm --filter @medical-crm/<package> test` or `pnpm test` at root via turbo

**Git commits:** Plan uses `git add -A` for brevity. In practice, prefer targeted `git add packages/ apps/` to avoid staging unrelated files. Verify `.gitignore` is properly configured before execution.

---

## Chunk 1: Foundation (Section 0 + Section 0.5)

> Migration tooling, Case Model Realignment, TransactionRunner, Idempotency infrastructure.
> This chunk MUST be completed before any module work.

### Task 1: Consolidate migration directory + add db:migrate

**Files:**
- Move: `migrations/001-ai-summary-columns.sql` → `packages/infrastructure/database/migrations/001_ai_summary_columns.sql`
- Modify: `packages/infrastructure/package.json`
- Modify: `package.json` (root)
- Create: `packages/infrastructure/database/migrate.ts`

- [ ] **Step 1: Move existing migration file**

```bash
mv migrations/001-ai-summary-columns.sql packages/infrastructure/database/migrations/001_ai_summary_columns.sql
rmdir migrations
```

- [ ] **Step 2: Create db:migrate script**

```typescript
// packages/infrastructure/database/migrate.ts
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

// Migrations that were applied to the live DB before _migrations tracking existed.
// They must be recorded but NOT re-executed.
const PRE_EXISTING = [
  '001_ai_summary_columns.sql',
  '002_create_message_tasks.sql',
];

async function migrate() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const sql = postgres(databaseUrl);

  // Create tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Bootstrap: if tracking table is empty, mark pre-existing migrations as applied
  const [{ count }] = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM _migrations`;
  if (count === '0' && PRE_EXISTING.length > 0) {
    console.log('Bootstrapping: marking pre-existing migrations as applied...');
    for (const name of PRE_EXISTING) {
      await sql`INSERT INTO _migrations (name) VALUES (${name})`;
      console.log(`  Recorded: ${name}`);
    }
  }

  // Get applied migrations
  const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY name`;
  const appliedSet = new Set(applied.map((r) => r.name));

  // Get pending files
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    console.log(`Applying: ${file}`);
    const content = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');

    // CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    // Detect and run those files outside a transaction.
    const needsConcurrently = content.includes('CONCURRENTLY');

    if (needsConcurrently) {
      await sql.unsafe(content);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    } else {
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
    }
    console.log(`Applied: ${file}`);
  }

  console.log('All migrations applied.');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Add scripts to package.json files**

In `packages/infrastructure/package.json`, add to `"scripts"`:
```json
"db:migrate": "tsx database/migrate.ts"
```

In root `package.json`, add to `"scripts"`:
```json
"db:migrate": "pnpm --filter @medical-crm/infrastructure db:migrate"
```

- [ ] **Step 4: Verify migration runs**

```bash
pnpm db:migrate
```
Expected: "All migrations applied." (001 and 002 already applied or tracked)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "infra: consolidate migrations + add db:migrate command"
```

---

### Task 2: M0 migration — Case Model Realignment

**Files:**
- Create: `packages/infrastructure/database/migrations/003_m0_case_realignment.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 003_m0_case_realignment.sql
-- Section 0: Add new case assignment/treatment model

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
ALTER TABLE cases ADD COLUMN question_collector_template_id UUID;

-- Backfill: map old status/stage → new assignment_status/treatment_stage
UPDATE cases SET assignment_status = 'ASSIGNED' WHERE assigned_hospital_id IS NOT NULL;
UPDATE cases SET treatment_stage = 'CONFIRMED' WHERE stage = 'HOSPITAL_CONTACTED' AND assigned_hospital_id IS NOT NULL;
UPDATE cases SET treatment_stage = 'IN_TREATMENT' WHERE stage = 'IN_TREATMENT';
UPDATE cases SET treatment_stage = 'COMPLETED' WHERE stage = 'TREATMENT_COMPLETED';

-- Indexes (CONCURRENTLY — migration runner will skip tx wrapper for this file)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_user_updated ON cases(patient_id, updated_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_assignment_stage_created ON cases(assignment_status, treatment_stage, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_assigned_hospital_created ON cases(assigned_hospital_id, created_at DESC) WHERE assigned_hospital_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_risk_flags_gin ON cases USING gin(risk_flags);
```

- [ ] **Step 2: Run migration**

```bash
pnpm db:migrate
```
Expected: "Applying: 003_m0_case_realignment.sql" → "Applied"

- [ ] **Step 3: Regenerate Drizzle schema**

```bash
pnpm db:pull
```
Verify `schema.ts` now has the new columns and enums.

> **⚠ DRIFT PROTECTION:** After `db:pull`, check that the intentional schema drift is preserved.
> Lines ~205-211 of `schema.ts` contain a comment about the circular FK between
> `conversations.last_message_id → messages.id` being intentionally omitted from the Drizzle schema.
> If `db:pull` overwrites this and adds a `references` clause for `lastMessageId`, **revert that
> specific change** and keep the comment. The circular FK exists in the live DB but must stay out
> of the Drizzle schema to avoid circular dependency issues at code-generation time.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "migration: 003_m0 case model realignment"
```

---

### Task 3: Domain layer — new enums + state machines

**Files:**
- Modify: `packages/domain/src/enums/index.ts`
- Create: `packages/domain/src/state-machine/assignment-status-transitions.ts`
- Create: `packages/domain/src/state-machine/treatment-stage-transitions.ts`
- Test: `packages/domain/__tests__/assignment-status-transitions.test.ts`
- Test: `packages/domain/__tests__/treatment-stage-transitions.test.ts`

- [ ] **Step 1: Write failing tests for new state machines**

```typescript
// packages/domain/__tests__/assignment-status-transitions.test.ts
import { describe, it, expect } from 'vitest';
import { ASSIGNMENT_STATUS_TRANSITIONS } from '../src/state-machine/assignment-status-transitions.js';

describe('assignment-status-transitions', () => {
  it('allows UNASSIGNED → ASSIGNED', () => {
    expect(ASSIGNMENT_STATUS_TRANSITIONS['UNASSIGNED']).toContain('ASSIGNED');
  });
  it('allows ASSIGNED → UNASSIGNED (admin reset)', () => {
    expect(ASSIGNMENT_STATUS_TRANSITIONS['ASSIGNED']).toContain('UNASSIGNED');
  });
});
```

```typescript
// packages/domain/__tests__/treatment-stage-transitions.test.ts
import { describe, it, expect } from 'vitest';
import { TREATMENT_STAGE_TRANSITIONS } from '../src/state-machine/treatment-stage-transitions.js';

describe('treatment-stage-transitions', () => {
  it('allows CONFIRMED → IN_TREATMENT', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['CONFIRMED']).toContain('IN_TREATMENT');
  });
  it('allows IN_TREATMENT → POST_TREATMENT', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['IN_TREATMENT']).toContain('POST_TREATMENT');
  });
  it('allows POST_TREATMENT → COMPLETED', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['POST_TREATMENT']).toContain('COMPLETED');
  });
  it('allows COMPLETED → FOLLOW_UP', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['COMPLETED']).toContain('FOLLOW_UP');
  });
  it('allows FOLLOW_UP → IN_TREATMENT (restart loop)', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['FOLLOW_UP']).toContain('IN_TREATMENT');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @medical-crm/domain test
```
Expected: FAIL — modules not found

- [ ] **Step 3: Add new enums to index.ts**

Append to `packages/domain/src/enums/index.ts`:

```typescript
// Phase 2: Case Model Realignment
export type CaseAssignmentStatus = 'UNASSIGNED' | 'ASSIGNED';
export type CaseTreatmentStage = 'CONFIRMED' | 'IN_TREATMENT' | 'POST_TREATMENT' | 'COMPLETED' | 'FOLLOW_UP';
export type AISummaryStatusType = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
```

- [ ] **Step 4: Implement state machines**

```typescript
// packages/domain/src/state-machine/assignment-status-transitions.ts
import type { CaseAssignmentStatus } from '../enums/index.js';

export const ASSIGNMENT_STATUS_TRANSITIONS: Record<CaseAssignmentStatus, CaseAssignmentStatus[]> = {
  UNASSIGNED: ['ASSIGNED'],
  ASSIGNED: ['UNASSIGNED'],
};
```

```typescript
// packages/domain/src/state-machine/treatment-stage-transitions.ts
import type { CaseTreatmentStage } from '../enums/index.js';

export const TREATMENT_STAGE_TRANSITIONS: Record<CaseTreatmentStage, CaseTreatmentStage[]> = {
  CONFIRMED: ['IN_TREATMENT'],
  IN_TREATMENT: ['POST_TREATMENT'],
  POST_TREATMENT: ['COMPLETED'],
  COMPLETED: ['FOLLOW_UP'],
  FOLLOW_UP: ['IN_TREATMENT'],
};
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @medical-crm/domain test
```
Expected: ALL PASS

- [ ] **Step 6: Verify barrel exports**

Check that `packages/domain/src/index.ts` re-exports from `./enums/index.js` and from the new state machine files. If not, add the exports so downstream packages can import them.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "domain: add assignment-status + treatment-stage enums and state machines"
```

---

### Task 4: Update Case entity with new fields

**Files:**
- Modify: `packages/domain/src/entities/case.entity.ts`
- Modify: `packages/domain/__tests__/case.entity.test.ts`

- [ ] **Step 1: Write failing tests for new entity behavior**

Add to `packages/domain/__tests__/case.entity.test.ts`:

```typescript
describe('transitionAssignmentStatus', () => {
  it('allows UNASSIGNED → ASSIGNED', () => {
    const c = createTestCase({ assignmentStatus: 'UNASSIGNED' });
    c.transitionAssignmentStatus('ASSIGNED');
    expect(c.assignmentStatus).toBe('ASSIGNED');
  });

  it('throws on invalid transition', () => {
    const c = createTestCase({ assignmentStatus: 'UNASSIGNED' });
    expect(() => c.transitionAssignmentStatus('UNASSIGNED')).toThrow();
  });
});

describe('advanceTreatmentStage', () => {
  it('allows CONFIRMED → IN_TREATMENT', () => {
    const c = createTestCase({ treatmentStage: 'CONFIRMED' });
    c.advanceTreatmentStage('IN_TREATMENT');
    expect(c.treatmentStage).toBe('IN_TREATMENT');
  });

  it('allows FOLLOW_UP → IN_TREATMENT (restart loop)', () => {
    const c = createTestCase({ treatmentStage: 'FOLLOW_UP' });
    c.advanceTreatmentStage('IN_TREATMENT');
    expect(c.treatmentStage).toBe('IN_TREATMENT');
  });

  it('throws on invalid transition', () => {
    const c = createTestCase({ treatmentStage: 'CONFIRMED' });
    expect(() => c.advanceTreatmentStage('COMPLETED')).toThrow();
  });
});
```

Update `createTestCase` to include new fields:
```typescript
function createTestCase(overrides: Partial<CaseProps> = {}) {
  return new Case({
    // ... existing fields ...
    assignmentStatus: 'UNASSIGNED',
    treatmentStage: null,
    conditionSummary: null,
    structuredData: null,
    riskFlags: null,
    priority: null,
    lastEventAt: null,
    aiSummaryStatus: 'PENDING',
    questionCollectorTemplateId: null,
    ...overrides,
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @medical-crm/domain test
```

- [ ] **Step 3: Update CaseProps and Case class**

Add to `CaseProps` interface and `Case` class in `case.entity.ts`:

```typescript
// Add to CaseProps interface:
assignmentStatus: CaseAssignmentStatus;
treatmentStage: CaseTreatmentStage | null;
conditionSummary: string | null;
structuredData: Record<string, unknown> | null;
riskFlags: string[] | null;
priority: string | null;
lastEventAt: Date | null;
aiSummaryStatus: AISummaryStatusType;
questionCollectorTemplateId: string | null;

// Add methods to Case class:
transitionAssignmentStatus(to: CaseAssignmentStatus): void {
  const allowed = ASSIGNMENT_STATUS_TRANSITIONS[this.assignmentStatus];
  if (!allowed.includes(to)) {
    throw new ValidationError(
      `Cannot transition assignment status from ${this.assignmentStatus} to ${to}`,
    );
  }
  this.assignmentStatus = to;
  this.updatedAt = new Date();
}

advanceTreatmentStage(to: CaseTreatmentStage): void {
  if (!this.treatmentStage) {
    if (to !== 'CONFIRMED') {
      throw new ValidationError('Treatment stage must start at CONFIRMED');
    }
    this.treatmentStage = to;
    this.updatedAt = new Date();
    return;
  }
  const allowed = TREATMENT_STAGE_TRANSITIONS[this.treatmentStage];
  if (!allowed.includes(to)) {
    throw new ValidationError(
      `Cannot transition treatment stage from ${this.treatmentStage} to ${to}`,
    );
  }
  this.treatmentStage = to;
  this.updatedAt = new Date();
}
```

Add `@deprecated` JSDoc on `status` and `stage` fields.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @medical-crm/domain test
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "domain: add new fields + state transitions to Case entity"
```

---

### Task 5: Update Case DTO, mapper, validation, repository port

**Files:**
- Modify: `packages/application/src/dtos/case.dto.ts`
- Modify: `packages/application/src/mappers/case.mapper.ts`
- Modify: `packages/shared/validation/src/case.schema.ts`
- Modify: `packages/domain/src/ports/case-repository.port.ts`

- [ ] **Step 1: Update CaseDTO — add new fields, deprecate old**

```typescript
export interface CaseDTO {
  id: string;
  caseNumber: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;
  assignedHospitalId: string | null;
  hospitalName: string | null;
  primaryDiagnosis: string | null;
  /** @deprecated Use assignmentStatus instead */
  status: string;
  /** @deprecated Use treatmentStage instead */
  stage: string;
  assignmentStatus: string;
  treatmentStage: string | null;
  riskLevel: string | null;
  aiSummary: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseStatsDTO {
  total: number;
  unassigned: number;
  assigned: number;
  inTreatment: number;
  postTreatment: number;
  completed: number;
  followUp: number;
}
```

- [ ] **Step 2: Update case mapper**

Add `assignmentStatus` and `treatmentStage` to `toCaseDTO()`:

```typescript
export function toCaseDTO(entity: Case, hospitalName?: string): CaseDTO {
  return {
    // ... existing fields ...
    status: entity.status,           // deprecated, frozen value
    stage: entity.stage,             // deprecated, frozen value
    assignmentStatus: entity.assignmentStatus,
    treatmentStage: entity.treatmentStage,
    // ... rest ...
  };
}
```

- [ ] **Step 3: Update validation schema — add new filter params**

Add to `packages/shared/validation/src/case.schema.ts`:

```typescript
export const caseAssignmentStatusSchema = z.enum(['UNASSIGNED', 'ASSIGNED']);
export const caseTreatmentStageSchema = z.enum(['CONFIRMED', 'IN_TREATMENT', 'POST_TREATMENT', 'COMPLETED', 'FOLLOW_UP']);

export const caseListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  /** @deprecated Use assignmentStatus */
  status: caseStatusSchema.optional(),
  /** @deprecated Use treatmentStage */
  stage: caseStageSchema.optional(),
  assignmentStatus: caseAssignmentStatusSchema.optional(),
  treatmentStage: caseTreatmentStageSchema.optional(),
  hospitalId: z.string().uuid().optional(),
  search: z.string().optional(),
});
```

- [ ] **Step 4: Update repository port**

Update `CaseListQuery` to include new filters. Update `CaseStats`. Add optional `tx` parameter to methods used in transactions (per spec Section 0.5.2):

```typescript
export interface CaseListQuery {
  page: number;
  limit: number;
  status?: CaseStatus;      // deprecated
  stage?: CaseStage;         // deprecated
  assignmentStatus?: CaseAssignmentStatus;
  treatmentStage?: CaseTreatmentStage;
  hospitalId?: string;
  search?: string;
}

export interface CaseStats {
  total: number;
  unassigned: number;
  assigned: number;
  inTreatment: number;
  postTreatment: number;
  completed: number;
  followUp: number;
}

export interface ICaseRepository {
  findById(id: string, tx?: Transaction): Promise<Case | null>;
  findMany(query: CaseListQuery, hospitalId?: string): Promise<PaginatedResult<Case>>;
  findByPatientId(patientId: string): Promise<Case[]>;
  save(entity: Case, tx?: Transaction): Promise<Case>;
  nextCaseNumber(): Promise<CaseNumber>;
  countByFilters(filters: CaseCountFilters): Promise<CaseStats>;
}
```

- [ ] **Step 5: Run all tests, fix any regressions**

```bash
pnpm test
```
Fix any failures from changed interfaces (existing tests may reference old CaseStatsDTO fields like `active`, `cancelled`).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "app: update CaseDTO, mapper, validation, repo port for new case model"
```

---

### Task 6: Update Drizzle schema + Case repository implementation

**Files:**
- Modify: `packages/infrastructure/database/schema/schema.ts` (if not auto-updated by db:pull)
- Modify: `packages/infrastructure/database/repositories/drizzle-case.repository.ts`

- [ ] **Step 1: Verify schema.ts has new columns after db:pull**

If `db:pull` didn't pick up new columns (e.g., because migration hasn't run on the introspection DB), manually add them to `schema.ts` following the existing pattern.

- [ ] **Step 2: Update DrizzleCaseRepository — rowToEntity**

Add new fields to `rowToEntity()`:
```typescript
private rowToEntity(row: DbRow): Case {
  return new Case({
    // ... existing fields ...
    assignmentStatus: row.assignmentStatus ?? 'UNASSIGNED',
    treatmentStage: row.treatmentStage ?? null,
    conditionSummary: row.conditionSummary ?? null,
    structuredData: row.structuredData as Record<string, unknown> | null,
    riskFlags: row.riskFlags ?? null,
    priority: row.priority ?? null,
    lastEventAt: row.lastEventAt ? new Date(row.lastEventAt) : null,
    aiSummaryStatus: row.aiSummaryStatus ?? 'PENDING',
    questionCollectorTemplateId: row.questionCollectorTemplateId ?? null,
  });
}
```

- [ ] **Step 3: Update save() to persist new fields**

Add to `values` in `save()`:
```typescript
assignmentStatus: entity.assignmentStatus,
treatmentStage: entity.treatmentStage,
conditionSummary: entity.conditionSummary,
structuredData: entity.structuredData,
riskFlags: entity.riskFlags,
priority: entity.priority,
lastEventAt: entity.lastEventAt?.toISOString() ?? null,
aiSummaryStatus: entity.aiSummaryStatus,
questionCollectorTemplateId: entity.questionCollectorTemplateId,
```

- [ ] **Step 4: Update findMany() to filter by new columns**

Add conditions for `assignmentStatus` and `treatmentStage`:
```typescript
if (assignmentStatus) conditions.push(eq(cases.assignmentStatus, assignmentStatus));
if (treatmentStage) conditions.push(eq(cases.treatmentStage, treatmentStage));
```

- [ ] **Step 5: Update countByFilters() for new CaseStats**

```typescript
async countByFilters(filters: CaseCountFilters): Promise<CaseStats> {
  const conditions = [];
  if (filters.hospitalId) conditions.push(eq(cases.assignedHospitalId, filters.hospitalId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const result = await this.db
    .select({
      total: count(),
      unassigned: count(sql`CASE WHEN ${cases.assignmentStatus} = 'UNASSIGNED' THEN 1 END`),
      assigned: count(sql`CASE WHEN ${cases.assignmentStatus} = 'ASSIGNED' THEN 1 END`),
      inTreatment: count(sql`CASE WHEN ${cases.treatmentStage} = 'IN_TREATMENT' THEN 1 END`),
      postTreatment: count(sql`CASE WHEN ${cases.treatmentStage} = 'POST_TREATMENT' THEN 1 END`),
      completed: count(sql`CASE WHEN ${cases.treatmentStage} = 'COMPLETED' THEN 1 END`),
      followUp: count(sql`CASE WHEN ${cases.treatmentStage} = 'FOLLOW_UP' THEN 1 END`),
    })
    .from(cases)
    .where(where);

  const r = result[0]!;
  return {
    total: Number(r.total),
    unassigned: Number(r.unassigned),
    assigned: Number(r.assigned),
    inTreatment: Number(r.inTreatment),
    postTreatment: Number(r.postTreatment),
    completed: Number(r.completed),
    followUp: Number(r.followUp),
  };
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "infra: update Drizzle schema + case repository for new case model"
```

---

### Task 7: Rewrite use cases — UpdateCaseStatus, AdvanceCaseStage, GetCaseStats

**Files:**
- Modify: `packages/application/src/use-cases/cases/update-case-status.use-case.ts`
- Modify: `packages/application/src/use-cases/cases/advance-case-stage.use-case.ts`
- Modify: `packages/application/src/use-cases/cases/get-case-stats.use-case.ts`
- Modify: `packages/application/__tests__/update-case-status.use-case.test.ts`

- [ ] **Step 1: Write failing tests for rewritten UpdateCaseStatus**

UpdateCaseStatus now operates on `assignmentStatus` (admin reset only):

```typescript
it('transitions assignmentStatus from ASSIGNED → UNASSIGNED', async () => {
  mockCaseRepo.findById.mockResolvedValue(createTestCase({ assignmentStatus: 'ASSIGNED' }));
  const result = await useCase.execute('case-1', 'UNASSIGNED', adminActor);
  expect(result.assignmentStatus).toBe('UNASSIGNED');
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Rewrite use cases**

`UpdateCaseStatusUseCase` → calls `entity.transitionAssignmentStatus(to)` instead of `entity.transitionStatus(to)`.

`AdvanceCaseStageUseCase` → calls `entity.advanceTreatmentStage(to)` instead of `entity.advanceStage(to)`.

`GetCaseStatsUseCase` → returns new `CaseStatsDTO` shape.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @medical-crm/application test
```

- [ ] **Step 5: Update route handlers if needed**

Update `cases.routes.ts` — the `/status` route body schema should accept `assignmentStatus` values, `/stage` should accept `treatmentStage` values. Update validation schemas accordingly.

- [ ] **Step 6: Add deprecation warning to /assign route**

In `cases.routes.ts`, add `console.warn('[DEPRECATED] POST /assign — will be replaced by AcceptQuote in Module 1')` to the `/assign` handler.

- [ ] **Step 7: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "app: rewrite case status/stage use cases for new model + deprecate /assign"
```

---

### Task 8: TransactionRunner port + Drizzle implementation

**Files:**
- Create: `packages/domain/src/ports/transaction-runner.port.ts`
- Create: `packages/infrastructure/database/transaction-runner.ts`
- Modify: `packages/infrastructure/database/repositories/index.ts` (re-export)
- Modify: `packages/domain/src/index.ts` (re-export)

- [ ] **Step 1: Create TransactionRunner port**

```typescript
// packages/domain/src/ports/transaction-runner.port.ts
export type Transaction = unknown; // Opaque type — concrete implementation defines shape

export interface TransactionRunner {
  run<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}
```

- [ ] **Step 2: Implement Drizzle TransactionRunner**

```typescript
// packages/infrastructure/database/transaction-runner.ts
import type { TransactionRunner, Transaction } from '@medical-crm/domain';
import type { CrmDb } from './crm-client.js';

export class DrizzleTransactionRunner implements TransactionRunner {
  constructor(private readonly db: CrmDb) {}

  async run<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => fn(tx as Transaction));
  }
}
```

- [ ] **Step 3: Export from packages**

Add export to `packages/domain/src/index.ts` and `packages/infrastructure/database/repositories/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "infra: add TransactionRunner port + Drizzle implementation"
```

---

### Task 9: Idempotency table + helper

**Files:**
- Modify: `packages/infrastructure/database/migrations/003_m0_case_realignment.sql` (append idempotency DDL)
- Create: `packages/infrastructure/database/idempotency.ts`

- [ ] **Step 1: Append idempotency DDL to 003 migration**

Append to the end of `003_m0_case_realignment.sql`:

```sql
-- Idempotency keys (Section 0.5.3)
CREATE TABLE idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  operation VARCHAR(100) NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TTL cleanup: add index for periodic purge
CREATE INDEX idx_idempotency_keys_created ON idempotency_keys(created_at);
```

- [ ] **Step 2: Implement idempotency helper**

```typescript
// packages/infrastructure/database/idempotency.ts
import { eq } from 'drizzle-orm';
import type { CrmDb } from './crm-client.js';

export class IdempotencyGuard {
  constructor(private readonly db: CrmDb) {}

  async check<T>(key: string, operation: string, fn: () => Promise<T>): Promise<T> {
    // Check existing
    const existing = await this.db
      .execute<{ result: T }>(
        `SELECT result FROM idempotency_keys WHERE key = $1`,
        [key],
      );

    if (existing.rows.length > 0) {
      return existing.rows[0]!.result;
    }

    // Execute and store
    const result = await fn();
    await this.db.execute(
      `INSERT INTO idempotency_keys (key, operation, result) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
      [key, operation, JSON.stringify(result)],
    );

    return result;
  }
}
```

- [ ] **Step 3: Run migration**

```bash
pnpm db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "infra: add idempotency_keys table + IdempotencyGuard helper"
```

---

## Chunk 2: Module 1 — Quotes + CaseHospitalContacts

> The largest module: 14 use cases, 15 routes, 2 new tables. Includes the complex transactional AcceptQuote flow.

### Task 10: M1 migration — quotes + case_hospital_contacts

**Files:**
- Create: `packages/infrastructure/database/migrations/004_m1_quotes_chc.sql`

- [ ] **Step 1: Write migration SQL**

Copy the full SQL from spec Section 1.1 (Module 1 DB Schema):
- `CREATE TYPE "CHCSubStatus"`, `"QuoteStatus"` enums
- `CREATE TABLE case_hospital_contacts` with all columns, UNIQUE constraint
- `CREATE TABLE quotes` with all columns
- `ALTER TABLE` for FK from CHC→quotes
- All indexes from spec

- [ ] **Step 2: Run migration**

```bash
pnpm db:migrate
```

- [ ] **Step 3: Regenerate Drizzle schema**

```bash
pnpm db:pull
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "migration: 004_m1 quotes + case_hospital_contacts"
```

---

### Task 11: Domain layer — CHC + Quote entities, state machines, value objects

**Files:**
- Create: `packages/domain/src/entities/case-hospital-contact.entity.ts`
- Create: `packages/domain/src/entities/quote.entity.ts`
- Create: `packages/domain/src/state-machine/chc-sub-status-transitions.ts`
- Create: `packages/domain/src/state-machine/quote-status-transitions.ts`
- Create: `packages/domain/src/value-objects/quote-number.ts`
- Create: `packages/domain/src/ports/case-hospital-contact-repository.port.ts`
- Create: `packages/domain/src/ports/quote-repository.port.ts`
- Modify: `packages/domain/src/enums/index.ts`
- Test: `packages/domain/__tests__/chc.entity.test.ts`
- Test: `packages/domain/__tests__/quote.entity.test.ts`
- Test: `packages/domain/__tests__/quote-number.test.ts`

- [ ] **Step 1: Add CHC + Quote enums**

```typescript
// Append to packages/domain/src/enums/index.ts
export type CHCSubStatus = 'DISTRIBUTED' | 'NEED_INFO' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REMOVED';
export type QuoteStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
```

- [ ] **Step 2: Write failing tests for CHC entity + state machine**

Test all transitions per STATE_MACHINES.md Section 2:
- DISTRIBUTED → NEED_INFO, QUOTED, REMOVED
- NEED_INFO → QUOTED, REMOVED
- QUOTED → ACCEPTED, REJECTED, EXPIRED, REMOVED
- ACCEPTED → (terminal)
- REJECTED → QUOTED (via ResendQuote)
- EXPIRED → QUOTED (via ResendQuote)

- [ ] **Step 3: Write failing tests for Quote entity + state machine**

Test: PENDING → ACCEPTED, REJECTED, EXPIRED. Also ResendQuote: REJECTED/EXPIRED → PENDING.

- [ ] **Step 4: Write failing test for QuoteNumber value object**

Pattern: `QT-YYYYMMDD-XXXX`

- [ ] **Step 5: Implement all domain files**

Follow existing patterns exactly:
- Entity: `XProps` interface + `class X` with state transition methods
- State machine: `Record<Status, Status[]>`
- Value object: `readonly value: string`, regex validation, `static generate()`
- Repository port: `IXRepository` with `findById`, `findMany`, `save`, etc.

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @medical-crm/domain test
```

- [ ] **Step 7: Export from domain/src/index.ts**

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "domain: add CHC + Quote entities, state machines, value objects, ports"
```

---

### Task 12: Infrastructure — Drizzle repos for CHC + Quote

**Files:**
- Modify: `packages/infrastructure/database/schema/schema.ts` (verify new tables)
- Modify: `packages/infrastructure/database/schema/relations.ts` (add relations)
- Create: `packages/infrastructure/database/repositories/drizzle-chc.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-quote.repository.ts`
- Modify: `packages/infrastructure/database/repositories/index.ts`

- [ ] **Step 1: Add relations**

```typescript
// In relations.ts — add for case_hospital_contacts and quotes
```

- [ ] **Step 2: Implement DrizzleCHCRepository**

Follow `DrizzleCaseRepository` pattern:
- `findById`, `findByCaseAndHospital`, `findByCaseId`, `findByHospitalId`
- `save` (upsert on `id`)
- `updateMany` (for bulk reject on AcceptQuote)
- `rowToEntity()` mapper
- Optimistic locking: `WHERE version = :version` on updates

- [ ] **Step 3: Implement DrizzleQuoteRepository**

- `findById`, `findByCaseId`, `findByHospitalId`, `nextQuoteNumber`
- `save` (upsert)
- `rejectPendingByCaseExcept(caseId, excludeQuoteId)` — for AcceptQuote
- Optimistic locking on updates

- [ ] **Step 4: Export from index.ts**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "infra: add Drizzle repositories for CHC + Quote"
```

---

### Task 13: Application layer — DTOs, mappers, validation for CHC + Quote

**Files:**
- Create: `packages/application/src/dtos/case-hospital-contact.dto.ts`
- Create: `packages/application/src/dtos/quote.dto.ts`
- Create: `packages/application/src/mappers/case-hospital-contact.mapper.ts`
- Create: `packages/application/src/mappers/quote.mapper.ts`
- Create: `packages/shared/validation/src/case-hospital-contact.schema.ts`
- Create: `packages/shared/validation/src/quote.schema.ts`

- [ ] **Step 1: Create DTOs**

```typescript
// case-hospital-contact.dto.ts
export interface CaseHospitalContactDTO {
  id: string;
  caseId: string;
  hospitalId: string;
  hospitalName?: string;
  subStatus: string;
  selectedByPatientAt: string | null;
  distributedAt: string | null;
  firstReplyAt: string | null;
  quoteId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

```typescript
// quote.dto.ts
export interface QuoteDTO {
  id: string;
  caseId: string;
  hospitalId: string;
  hospitalName?: string;
  quoteNumber: string;
  version: number;
  status: string;
  isDraft: boolean;
  totalAmount: string;
  currency: string;
  validUntil: string;
  treatmentPlan: string | null;
  lineItems: unknown;
  notes: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Create mappers**

Follow `toCaseDTO()` pattern: entity → DTO with `.toISOString()` for dates.

- [ ] **Step 3: Create validation schemas**

```typescript
// quote.schema.ts
export const createQuoteSchema = z.object({
  caseId: z.string().uuid(),
  hospitalId: z.string().uuid(),
  totalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().max(10).default('USD'),
  validUntil: z.string().datetime(),
  treatmentPlan: z.string().optional(),
  lineItems: z.unknown().optional(),
  notes: z.string().optional(),
});

export const updateQuoteSchema = z.object({
  totalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  treatmentPlan: z.string().optional(),
  lineItems: z.unknown().optional(),
  notes: z.string().optional(),
  validUntil: z.string().datetime().optional(),
});

export const quoteListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  caseId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']).optional(),
});
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "app: add DTOs, mappers, validation schemas for CHC + Quote"
```

---

### Task 14: Use cases — simple CHC operations

**Files:**
- Create: `packages/application/src/use-cases/quotes/add-hospital-to-case.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/remove-hospital-from-case.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/send-reminder.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/list-case-hospital-contacts.use-case.ts`
- Test: `packages/application/__tests__/chc-use-cases.test.ts`

- [ ] **Step 1: Write failing tests**

Test each use case with mocked repos:
- AddHospitalToCase: creates CHC with sub_status=DISTRIBUTED, ADMIN only
- RemoveHospitalFromCase: sets sub_status=REMOVED, ADMIN only
- SendReminder: updates reminder_sent_at, ADMIN only
- ListCaseHospitalContacts: returns paginated list, scoped by role

- [ ] **Step 2: Implement use cases**

Follow `CreateCaseUseCase` pattern. Each is a class with `execute(input, actor)`.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @medical-crm/application test
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "app: add CHC use cases (add, remove, remind, list)"
```

---

### Task 15: Use cases — Quote CRUD + Send

**Files:**
- Create: `packages/application/src/use-cases/quotes/create-quote.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/update-quote.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/send-quote.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/list-quotes.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/get-quote.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/compare-quotes.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/resend-quote.use-case.ts`
- Test: `packages/application/__tests__/quote-use-cases.test.ts`

- [ ] **Step 1: Write failing tests**

Key behaviors:
- CreateQuote: HOSPITAL only, creates draft quote (is_draft=true)
- SendQuote: sets is_draft=false, sent_at, CHC→QUOTED, first_reply_at if null
- ResendQuote: REJECTED/EXPIRED → bumps version, quote→PENDING, CHC→QUOTED
- CompareQuotes: returns all quotes for a case with hospital info

- [ ] **Step 2: Implement all quote use cases**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "app: add Quote use cases (create, update, send, list, get, compare, resend)"
```

---

### Task 16: Use cases — AcceptQuote + RejectQuote + AdminResetAssignment (transactional)

**Files:**
- Create: `packages/application/src/use-cases/quotes/accept-quote.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/reject-quote.use-case.ts`
- Create: `packages/application/src/use-cases/quotes/admin-reset-assignment.use-case.ts`
- Test: `packages/application/__tests__/accept-quote.use-case.test.ts`
- Test: `packages/application/__tests__/reject-quote.use-case.test.ts`
- Test: `packages/application/__tests__/admin-reset-assignment.use-case.test.ts`

- [ ] **Step 1: Write failing test for AcceptQuote**

```typescript
describe('AcceptQuoteUseCase', () => {
  it('accepts quote, rejects other CHCs, assigns case', async () => {
    // Setup: quote PENDING, CHC QUOTED, other CHCs DISTRIBUTED/QUOTED
    // Assert: quote→ACCEPTED, this CHC→ACCEPTED, other CHCs→REJECTED,
    //         other quotes→REJECTED, case.assignmentStatus→ASSIGNED
  });

  it('throws ConflictError if quote not PENDING', async () => {
    // Setup: quote already ACCEPTED
    // Assert: throws
  });

  it('uses TransactionRunner for atomicity', async () => {
    // Assert: transactionRunner.run was called
  });
});
```

- [ ] **Step 2: Implement AcceptQuote**

```typescript
export class AcceptQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly chcRepo: ICHCRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly txRunner: TransactionRunner,
    private readonly idempotency: IdempotencyGuard,
  ) {}

  async execute(quoteId: string, actor: Actor, idempotencyKey?: string): Promise<QuoteDTO> {
    if (actor.role !== 'PATIENT') throw new ForbiddenError('Only patients can accept quotes');

    const fn = async () => {
      return this.txRunner.run(async (tx) => {
        // 1. Load quote with optimistic lock
        const quote = await this.quoteRepo.findById(quoteId, tx);
        if (!quote || quote.status !== 'PENDING') throw new ConflictError('Quote not in PENDING state');

        // 2. Accept this quote
        quote.accept();
        await this.quoteRepo.save(quote, tx);

        // 3. Accept this CHC
        const chc = await this.chcRepo.findByCaseAndHospital(quote.caseId, quote.hospitalId, tx);
        if (!chc) throw new NotFoundError('CHC not found');
        chc.transitionSubStatus('ACCEPTED');
        chc.patientAcceptedAt = new Date();
        await this.chcRepo.save(chc, tx);

        // 4. Reject all other CHCs with sub_status IN (DISTRIBUTED, NEED_INFO, QUOTED)
        await this.chcRepo.rejectOthersByCaseExcept(quote.caseId, chc.id, tx);

        // 5. Reject all other pending quotes
        await this.quoteRepo.rejectPendingByCaseExcept(quote.caseId, quoteId, tx);

        // 6. Assign case (pass tx for transactional consistency)
        const caseEntity = await this.caseRepo.findById(quote.caseId, tx);
        if (!caseEntity) throw new NotFoundError('Case not found');
        caseEntity.transitionAssignmentStatus('ASSIGNED');
        caseEntity.assignedHospitalId = quote.hospitalId;
        caseEntity.assignedAt = new Date();
        await this.caseRepo.save(caseEntity, tx);

        return toQuoteDTO(quote);
      });
    };

    if (idempotencyKey) {
      return this.idempotency.check(idempotencyKey, 'AcceptQuote', fn);
    }
    return fn();
  }
}
```

- [ ] **Step 3: Implement RejectQuote**

Simpler — quote→REJECTED, CHC→REJECTED. No transaction needed (single entity updates).

- [ ] **Step 4: Implement AdminResetAssignment**

Transactional — reverse an ACCEPTED quote. Uses TransactionRunner.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @medical-crm/application test
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "app: add AcceptQuote, RejectQuote, AdminResetAssignment use cases"
```

---

### Task 17: API routes — CHC + Quote

**Files:**
- Create: `apps/api/src/routes/hospital-contacts.routes.ts`
- Create: `apps/api/src/routes/quotes.routes.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/composition-root.ts`

- [ ] **Step 1: Wire up composition root**

Add all new repos and use cases to `AppServices` interface and `getServices()`.

- [ ] **Step 2: Create hospital-contacts.routes.ts**

5 routes per spec (POST, GET, PATCH, POST remind, DELETE) under `/api/v2/cases/{caseId}/hospital-contacts`.

- [ ] **Step 3: Create quotes.routes.ts**

10 routes per spec (CRUD + send, accept, reject, compare, resend, reset-assignment).

- [ ] **Step 4: Register in routes/index.ts**

```typescript
import hospitalContactRoutes from './hospital-contacts.routes.js';
import quoteRoutes from './quotes.routes.js';
// ...
router.route('/', hospitalContactRoutes);
router.route('/', quoteRoutes);
```

- [ ] **Step 5: Write route tests**

Follow existing pattern in `cases.routes.test.ts`: mock composition root, build app with test auth, test via `app.request()`.

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "api: add CHC + Quote routes, wire composition root"
```

---

## Chunk 3: Module 2 (Events/Timeline) + Module 3 (Support Tickets)

### Task 18: M2 migration — case_events

**Files:**
- Create: `packages/infrastructure/database/migrations/005_m2_events.sql`

- [ ] **Step 1: Write migration SQL**

From spec Section 2.1: `CREATE TYPE "CaseEventType"`, `"ActorType"`, `CREATE TABLE case_events`, indexes.

- [ ] **Step 2: Run migration + regenerate schema**

```bash
pnpm db:migrate && pnpm db:pull
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "migration: 005_m2 case events"
```

---

### Task 19: Domain + Infrastructure — CaseEvent entity, repo

**Files:**
- Create: `packages/domain/src/entities/case-event.entity.ts`
- Create: `packages/domain/src/ports/case-event-repository.port.ts`
- Modify: `packages/domain/src/enums/index.ts` (add CaseEventType, ActorType)
- Create: `packages/infrastructure/database/repositories/drizzle-case-event.repository.ts`
- Test: `packages/domain/__tests__/case-event.entity.test.ts`

- [ ] **Step 1: Write tests + implement entity**

Simple entity — no state machine, just data holder. `CaseEventProps`: id, caseId, eventType, actorType, actorId, eventData (JSONB), isVisibleToPatient, createdAt.

- [ ] **Step 2: Implement repository port + Drizzle repo**

Port: `save(event)`, `findByCaseId(caseId, opts)`, `findVisibleByCaseId(caseId)`.

- [ ] **Step 3: Run tests + commit**

```bash
git add -A && git commit -m "domain+infra: add CaseEvent entity + repository"
```

---

### Task 20: Application — Event use cases + Timeline composition

**Files:**
- Create: `packages/application/src/use-cases/events/record-case-event.use-case.ts`
- Create: `packages/application/src/use-cases/events/list-case-events.use-case.ts`
- Create: `packages/application/src/use-cases/events/get-case-timeline.use-case.ts`
- Create: `packages/application/src/dtos/case-event.dto.ts`
- Create: `packages/application/src/mappers/case-event.mapper.ts`
- Test: `packages/application/__tests__/event-use-cases.test.ts`

- [ ] **Step 1: Write tests + implement**

Key: `GetCaseTimeline` queries `case_events` (visible) and merges with `journey_milestones` when Module 5 exists. Before Module 5, returns events only.

```typescript
export interface TimelineItemDTO {
  id: string;
  source: 'event' | 'milestone';
  type: string;
  timestamp: string;
  data: unknown;
}
```

- [ ] **Step 2: Run tests + commit**

---

### Task 21: API routes — Events

**Files:**
- Create: `apps/api/src/routes/events.routes.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/composition-root.ts`

2 routes: `GET /cases/{caseId}/events`, `GET /cases/{caseId}/timeline`.

- [ ] **Step 1: Implement + test + commit**

```bash
git add -A && git commit -m "api: add Events/Timeline routes"
```

---

### Task 22: Retrofit event recording into Module 1 use cases

**Files:**
- Modify: `packages/application/src/use-cases/quotes/accept-quote.use-case.ts`
- Modify: `packages/application/src/use-cases/quotes/send-quote.use-case.ts`
- Modify other M1 use cases as listed in spec Section 2.5

- [ ] **Step 1: Inject CaseEventRepository into M1 use cases**

Add `RecordCaseEvent` calls at the end of each use case per spec table (Section 2.5).

- [ ] **Step 2: Update tests to verify events are recorded**

- [ ] **Step 3: Run tests + commit**

```bash
git add -A && git commit -m "app: retrofit event recording into M1 use cases"
```

---

### Task 23: M3 migration — support_tickets

**Files:**
- Create: `packages/infrastructure/database/migrations/006_m3_tickets.sql`

- [ ] **Step 1: Write migration SQL**

From spec Section 3.1: ticket enums, `support_tickets`, `support_ticket_replies`, indexes.

- [ ] **Step 2: Run migration + regenerate**

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "migration: 006_m3 support tickets"
```

---

### Task 24: Domain — SupportTicket entity, state machine, value objects

**Files:**
- Create: `packages/domain/src/entities/support-ticket.entity.ts`
- Create: `packages/domain/src/entities/support-ticket-reply.entity.ts`
- Create: `packages/domain/src/state-machine/ticket-status-transitions.ts`
- Create: `packages/domain/src/value-objects/ticket-number.ts`
- Create: `packages/domain/src/ports/support-ticket-repository.port.ts`
- Modify: `packages/domain/src/enums/index.ts`
- Tests for all above

State machine (spec Section 3.2):
- OPEN → ASSIGNED
- ASSIGNED → PENDING_INFO / RESOLVED
- PENDING_INFO → ASSIGNED
- RESOLVED → CLOSED / ASSIGNED

- [ ] **Step 1: Write failing tests → implement → run → commit**

```bash
git add -A && git commit -m "domain: add SupportTicket entity, state machine, value objects"
```

---

### Task 25: Infrastructure + Application + Routes — Tickets

**Files:**
- Create: Drizzle repos for tickets + replies
- Create: DTOs, mappers, validation schemas
- Create: 7 use cases (CreateTicket, ListTickets, GetTicket, AssignTicket, ReplyToTicket, UpdateTicketStatus, CloseTicket)
- Create: `apps/api/src/routes/tickets.routes.ts` (7 routes)
- Wire composition root

- [ ] **Step 1: Implement Drizzle repositories**

Include optimistic locking pattern (`WHERE version = :version` on UPDATE, throw `ConcurrentUpdateError` if 0 rows affected) for `support_tickets`, matching the pattern from CHC/Quote repos (spec Section 0.5.4).

- [ ] **Step 2: Create DTOs + mappers + validation**

- [ ] **Step 3: Write failing tests for all 7 use cases**

- [ ] **Step 4: Implement use cases**

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Create routes + route tests**

- [ ] **Step 7: Wire composition root**

- [ ] **Step 8: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: Module 3 — Support Tickets (entity, repos, use cases, routes)"
```

---

## Chunk 4: Module 4 (Orders + Packages) + Module 5 (Journey)

### Task 26: M4 migration — packages + orders

**Files:**
- Create: `packages/infrastructure/database/migrations/007_m4_orders_packages.sql`

From spec Section 4.1: Package/Order enums, tables, indexes.

- [ ] **Step 1: Write + run migration + regenerate + commit**

---

### Task 27: Domain — Package + Order entities, state machines

**Files:**
- Create: `packages/domain/src/entities/package.entity.ts`
- Create: `packages/domain/src/entities/order.entity.ts`
- Create: `packages/domain/src/state-machine/package-status-transitions.ts` (DRAFT ↔ PUBLISHED)
- Create: `packages/domain/src/state-machine/order-status-transitions.ts` (per spec Section 4.2)
- Create: `packages/domain/src/value-objects/order-number.ts` (format `ORD-YYYYMMDD-XXXX`)
- Create: `packages/domain/src/ports/package-repository.port.ts`
- Create: `packages/domain/src/ports/order-repository.port.ts`
- Modify: `packages/domain/src/enums/index.ts`
- Tests for all above

- [ ] **Step 1: Write failing tests → implement → run → commit**

```bash
git add -A && git commit -m "domain: add Package + Order entities, state machines, value objects"
```

---

### Task 28: Infrastructure + Application + Routes — Orders + Packages

**Files:**
- Drizzle repos, DTOs, mappers, validation, use cases, routes

12 use cases per spec Section 4.4: Package CRUD (6) + Order CRUD (6 including CreatePaymentIntent, RequestRefund).

12 routes per spec Section 4.5.

- [ ] **Step 1: Implement Drizzle repos**
- [ ] **Step 2: Create DTOs + mappers + validation**
- [ ] **Step 3: Write failing tests for all use cases**
- [ ] **Step 4: Implement use cases**

`CreateOrder` and `CreatePaymentIntent` use `IdempotencyGuard`.

- [ ] **Step 5: Create routes + wire composition root**
- [ ] **Step 6: Run full test suite + commit**

```bash
git add -A && git commit -m "feat: Module 4 — Orders + Packages (full vertical slice)"
```

---

### Task 29: M5 migration — journey + milestones

**Files:**
- Create: `packages/infrastructure/database/migrations/008_m5_journey.sql`

From spec Section 5.1: `MilestoneEventType` enum, `case_journeys`, `journey_milestones`, indexes.

- [ ] **Step 1: Write + run migration + regenerate + commit**

---

### Task 30: Domain + Infra + App + Routes — Journey

**Files:**
- Entity: `case-journey.entity.ts`, `journey-milestone.entity.ts`
- Ports: `journey-repository.port.ts`
- Drizzle repos
- DTOs, mappers, validation
- 6 use cases per spec Section 5.3
- 6 routes per spec Section 5.4
- Wire composition root

Key AuthZ: Hospital must be `case.assigned_hospital_id` for all journey endpoints.

- [ ] **Step 1: Write failing tests → implement → run**
- [ ] **Step 2: Create routes + wire composition root**
- [ ] **Step 3: Update GetCaseTimeline to merge milestones**

Now that Module 5 exists, `GetCaseTimeline` should query both `case_events` and `journey_milestones`, merge by timestamp.

- [ ] **Step 4: Run full test suite + commit**

```bash
git add -A && git commit -m "feat: Module 5 — Journey (milestones, timeline merge)"
```

---

## Chunk 5: Module 6 (QuestionCollector) + Module 7 (ServiceCatalog)

### Task 31: M6 migration — question collector tables

**Files:**
- Create: `packages/infrastructure/database/migrations/009_m6_question_collector.sql`

From spec Section 6.1: `QCCompletionStatus` enum, 3 tables, FK from cases, indexes.

- [ ] **Step 1: Write + run migration + regenerate + commit**

---

### Task 32: Domain + Infra + App + Routes — QuestionCollector

**Files:**
- Entities: `question-collector-template.entity.ts`, `question-collector-response.entity.ts`, `question-collector-customization.entity.ts`
- Ports, Drizzle repos, DTOs, mappers, validation
- 10 use cases per spec Section 6.3
- 10 routes per spec Section 6.4

Key design decision (spec Section 6.2): Customizations are template-level, not case-level. Resolution: template → check customization for (template_id, assigned_hospital_id) → fallback to template defaults.

- [ ] **Step 1: Write failing tests → implement → run**
- [ ] **Step 2: Create routes + wire composition root**
- [ ] **Step 3: Run full test suite + commit**

```bash
git add -A && git commit -m "feat: Module 6 — QuestionCollector (templates, responses, customizations)"
```

---

### Task 33: M7 migration — service catalog + quote templates

**Files:**
- Create: `packages/infrastructure/database/migrations/010_m7_service_catalog.sql`

From spec Section 7.1: `ServiceCatalogCategory` enum, `service_catalog_items`, `quote_templates`.

**Note:** The spec does not list explicit indexes for Module 7. Add these during implementation:
```sql
CREATE INDEX idx_sci_hospital_active ON service_catalog_items(hospital_id, is_active, category);
CREATE INDEX idx_qt_hospital_active ON quote_templates(hospital_id, is_active);
```

- [ ] **Step 1: Write + run migration + regenerate + commit**

---

### Task 34: Domain + Infra + App + Routes — ServiceCatalog + QuoteTemplates

**Files:**
- Entities, repos, DTOs, validation
- Standard CRUD use cases scoped by hospital_id
- 11 routes per spec Section 7.3

- [ ] **Step 1: Implement full vertical slice**
- [ ] **Step 2: Run full test suite + commit**

```bash
git add -A && git commit -m "feat: Module 7 — ServiceCatalog + QuoteTemplates"
```

---

## Chunk 6: Module 8 (Dashboard) + Module 9 (BookingRequest + Patient Auth)

### Task 35: Module 8 — Dashboard aggregation endpoints

**Files:**
- Create: `packages/application/src/use-cases/dashboard/patient-dashboard.use-case.ts`
- Create: `packages/application/src/use-cases/dashboard/admin-dashboard.use-case.ts`
- Create: `packages/application/src/use-cases/dashboard/hospital-dashboard.use-case.ts`
- Create: `packages/application/src/dtos/dashboard.dto.ts`
- Create: `apps/api/src/routes/dashboard.routes.ts`
- Tests

No new tables — pure read-only aggregation from existing repos.

**Pre-requisite:** Add these query methods to existing repository ports and their Drizzle implementations before writing dashboard use cases:
- `ICaseRepository.findByPatientId(patientId: string): Promise<Case[]>`
- `IOrderRepository.summarizeByPatientId(patientId: string): Promise<{ pendingPayment: number; inProgress: number; completed: number }>`
- `IJourneyRepository.findUpcomingByPatientId(patientId: string, limit?: number): Promise<JourneyMilestone[]>`
- `IMessageRepository.countUnreadByUserId(userId: string): Promise<number>`

- [ ] **Step 1: Add dashboard query methods to repository ports + implementations**

- [ ] **Step 2: Write failing tests**

Each dashboard use case composes calls to multiple repos (cases, orders, tickets, milestones, messages).

- [ ] **Step 2: Implement dashboard use cases**

```typescript
// Example: PatientDashboardUseCase
export class PatientDashboardUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly milestoneRepo: IJourneyRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  async execute(actor: Actor): Promise<PatientDashboardDTO> {
    if (actor.role !== 'PATIENT') throw new ForbiddenError('Patient only');
    const [cases, orders, milestones, unread] = await Promise.all([
      this.caseRepo.findByPatientId(actor.userId),
      this.orderRepo.summarizeByPatientId(actor.userId),
      this.milestoneRepo.findUpcomingByPatientId(actor.userId),
      this.messageRepo.countUnreadByUserId(actor.userId),
    ]);
    return { /* ... */ };
  }
}
```

- [ ] **Step 3: Create routes (3 endpoints)**

```
GET /api/v2/patient/dashboard
GET /api/v2/admin/dashboard
GET /api/v2/hospital/dashboard
```

- [ ] **Step 4: Wire composition root + run tests + commit**

```bash
git add -A && git commit -m "feat: Module 8 — Dashboard aggregation endpoints"
```

---

### Task 36: M9 migration — booking_requests

**Files:**
- Create: `packages/infrastructure/database/migrations/011_m9_booking.sql`

From spec Section 9.2: `BookingRequestStatus`, `BookingConditionType` enums, `booking_requests`, `booking_request_hospitals`, FK from cases, indexes.

- [ ] **Step 1: Write + run migration + regenerate + commit**

---

### Task 37: Domain — BookingRequest entity, value objects

**Files:**
- Create: `packages/domain/src/entities/booking-request.entity.ts`
- Create: `packages/domain/src/entities/booking-request-hospital.entity.ts`
- Create: `packages/domain/src/value-objects/booking-request-number.ts` (format `BR-YYYYMMDD-XXXX`)
- Create: `packages/domain/src/ports/booking-request-repository.port.ts`
- Modify: `packages/domain/src/enums/index.ts`
- Tests

- [ ] **Step 1: Write failing tests → implement → run → commit**

```bash
git add -A && git commit -m "domain: add BookingRequest entity, value objects, ports"
```

---

### Task 38: Infrastructure + Application — BookingRequest use cases

**Files:**
- Create: Drizzle repos, DTOs, mappers, validation
- Create: 4 use cases per spec Section 9.4

**Pre-requisite:** Verify `IKeycloakAdminService` (in `packages/domain/src/ports/keycloak-admin-service.port.ts`) has a `createUser(email, password)` method suitable for patient registration. If not, extend the port and `KeycloakAdminService` implementation. The existing port was written for hospital user registration — patient registration may need different Keycloak realm settings or role assignments.

Key: `CompleteSignup` is transactional (two phases per spec):

```typescript
export class CompleteSignupUseCase {
  constructor(
    private readonly bookingRepo: IBookingRequestRepository,
    private readonly userRepo: IUserRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo: ICHCRepository,
    private readonly keycloakAdmin: IKeycloakAdminService,
    private readonly txRunner: TransactionRunner,
    private readonly idempotency: IdempotencyGuard,
  ) {}

  async execute(bookingRequestId: string, input: CompleteSignupInput, idempotencyKey?: string) {
    const fn = async () => {
      // All inside TransactionRunner — Keycloak call happens inside the callback
      // but outside the SQL transaction itself. If Keycloak fails, tx rolls back.
      const result = await this.txRunner.run(async (tx) => {
        // 1. Create or find user by email in DB
        const user = await this.userRepo.findOrCreateByEmail(input.email, input.name, tx);

        // 2. Create Keycloak user (outside SQL tx, but before commit)
        // If this fails, the transaction callback throws → DB tx rolls back
        await this.keycloakAdmin.createUser(input.email, input.password);

        // 3. Update booking_request.user_id, status → COMPLETED
        await this.bookingRepo.complete(bookingRequestId, user.id, tx);

        // 4. Create case (assignment_status=UNASSIGNED)
        const caseEntity = await this.createCase(user, input, tx);

        // 5. For each selected hospital: create CHC (sub_status=DISTRIBUTED)
        await this.createCHCs(caseEntity.id, input.selectedHospitalIds, tx);

        return { userId: user.id, caseId: caseEntity.id };
      });

      // Phase B: Post-transaction (non-atomic)
      const keycloakLoginUrl = buildKeycloakLoginUrl(input.email);
      // Trigger welcome email async (fire-and-forget)
      return { keycloakLoginUrl, userId: result.userId };
    };

    if (idempotencyKey) {
      return this.idempotency.check(idempotencyKey, 'CompleteSignup', fn);
    }
    return fn();
  }
}
```

- [ ] **Step 1: Write failing tests → implement → run → commit**

```bash
git add -A && git commit -m "app: add BookingRequest use cases (create, recommend, select, complete-signup)"
```

---

### Task 39: API routes — Public booking + auth middleware

**Files:**
- Create: `apps/api/src/routes/public.routes.ts`
- Modify: `apps/api/src/index.ts` (mount before auth middleware)
- Modify: `apps/api/src/composition-root.ts`
- Tests

- [ ] **Step 1: Create public routes**

```typescript
// apps/api/src/routes/public.routes.ts
const app = new OpenAPIHono();

// POST /api/v2/public/booking-requests
// GET  /api/v2/public/hospital-recommendations/{bookingId}
// POST /api/v2/public/booking-requests/{id}/selections
// POST /api/v2/public/booking-requests/{id}/complete-signup
```

- [ ] **Step 2: Mount before auth middleware in index.ts**

Following the existing pattern (line 19–31 in current index.ts):

```typescript
// Mount public routes BEFORE auth middleware
import publicRoutes from './routes/public.routes.js';
app.route('/', publicRoutes);
```

This goes after the existing `/api/v2/auth/hospital/register` route and before `app.use('/api/v2/*', authMiddleware, ...)`.

- [ ] **Step 3: Wire composition root + write route tests**

- [ ] **Step 4: Run full test suite + commit**

```bash
git add -A && git commit -m "feat: Module 9 — BookingRequest + public routes + patient auth flow"
```

---

### Task 40: Final integration — verify all modules work together

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

- [ ] **Step 4: Verify all migrations apply cleanly on fresh DB**

```bash
# Drop and recreate test DB, then:
pnpm db:migrate
```

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "feat: Phase 2 complete — all 9 modules implemented"
```
