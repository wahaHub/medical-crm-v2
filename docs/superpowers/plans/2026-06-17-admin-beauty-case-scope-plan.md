# Admin Beauty Case Scope Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce strict admin case isolation so `@medorabeauty.com` admins see only beauty cases, other admins cannot see beauty cases, and `contact@medorabeauty.com` can be provisioned as a production admin.

**Architecture:** Add one shared admin patient-site access policy in the application layer and one shared patient-site scope type in the domain layer. Push list/count filtering into repository SQL for correct totals, then use the shared policy for detail, mutation, upload, and transcript-style direct-id endpoints. Keep Keycloak role as `admin`; derive beauty scope from the authenticated admin email domain.

**Tech Stack:** TypeScript, pnpm, Vitest, Hono, Drizzle ORM, PostgreSQL, Keycloak Admin REST API.

---

**Spec:** `docs/superpowers/specs/2026-06-17-admin-beauty-case-scope-design.md`

**Working rules:**

- Do not touch existing unrelated local changes.
- Use TDD for each behavior slice.
- Commit after each task or small group of tightly coupled files.
- Do not commit the production password. Pass it at runtime through an environment variable.
- After provisioning succeeds, remove or rotate any temporary local shell history containing the password if the shell stores it.

**File Structure**

- Create `packages/domain/src/ports/patient-site-scope.port.ts`: shared repository scope type.
- Modify `packages/domain/src/index.ts`: export the scope type.
- Modify repository ports:
  - `packages/domain/src/ports/case-repository.port.ts`
  - `packages/domain/src/ports/conversation-repository.port.ts`
  - `packages/domain/src/ports/quote-repository.port.ts`
  - `packages/domain/src/ports/consultation-repository.port.ts`
  - `packages/domain/src/ports/question-collector-repository.port.ts`
  - `packages/domain/src/ports/support-ticket-repository.port.ts`
  - `packages/domain/src/ports/order-repository.port.ts`
- Create `packages/application/src/access/admin-patient-site-access.ts`: actor-derived scope and case/patient assertion policy.
- Modify `packages/application/src/index.ts`: export the access helpers/policy.
- Modify application use cases under:
  - `packages/application/src/use-cases/cases/`
  - `packages/application/src/use-cases/dashboard/admin-dashboard.use-case.ts`
  - `packages/application/src/use-cases/conversations/`
  - `packages/application/src/use-cases/messages/`
  - `packages/application/src/use-cases/quotes/`
  - `packages/application/src/use-cases/consultations/`
  - `packages/application/src/use-cases/question-collector/`
  - `packages/application/src/use-cases/tickets/`
  - `packages/application/src/use-cases/orders/`
  - `packages/application/src/use-cases/documents/`
  - `packages/application/src/use-cases/progress/`
  - `packages/application/src/use-cases/events/`
  - `packages/application/src/use-cases/journey/`
- Create `packages/infrastructure/database/repositories/patient-site-scope-sql.ts`: Drizzle SQL helpers for patient-site scope conditions.
- Modify Drizzle repositories:
  - `packages/infrastructure/database/repositories/drizzle-case.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-conversation.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-quote.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-consultation.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-question-collector.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-order.repository.ts`
- Modify `apps/api/src/composition-root.ts`: instantiate and pass `AdminPatientSiteAccessPolicy`.
- Modify route-level direct upload/notification guards:
  - `apps/api/src/routes/documents.routes.ts`
  - `apps/api/src/routes/consultations.routes.ts`
  - `apps/api/src/routes/tickets.routes.ts`
  - `apps/api/src/routes/conversations.routes.ts` if attachment upload routes exist there during implementation.
  - `apps/api/src/app/api/documents/translate` BFF target if implementation finds case-owned document translation bypasses API guards.
- Create `scripts/provision-admin-user.ts`: idempotent Keycloak + CRM admin provisioning script.
- Add or modify tests in:
  - `packages/application/__tests__/admin-patient-site-access.test.ts`
  - `packages/application/__tests__/list-cases.use-case.test.ts`
  - `packages/application/__tests__/create-case.use-case.test.ts`
  - `packages/application/__tests__/get-case.use-case.test.ts`
  - `packages/application/__tests__/dashboard-use-cases.test.ts`
  - `packages/application/__tests__/list-conversations.use-case.test.ts`
  - `packages/application/__tests__/message-crud.use-case.test.ts`
  - `packages/application/__tests__/quote-use-cases.test.ts`
  - `packages/application/__tests__/consultation-queries.use-case.test.ts`
  - `packages/application/__tests__/question-collector-use-cases.test.ts`
  - `packages/application/__tests__/ticket-use-cases.test.ts`
  - `packages/application/__tests__/order-use-cases.test.ts`
  - API route tests under `apps/api/src/__tests__/`.

## Chunk 1: Shared Scope And Case Repository Foundation

### Task 1: Add Domain Scope Type

**Files:**

- Create: `packages/domain/src/ports/patient-site-scope.port.ts`
- Modify: `packages/domain/src/index.ts`
- Test: no standalone test; covered by application helper tests in Task 2.

- [ ] **Step 1: Create the scope type**

Add:

```ts
export type PatientSite = 'beauty' | 'china';

export type PatientSiteAccessScope =
  | { mode: 'ONLY'; site: 'beauty' }
  | { mode: 'EXCLUDE'; site: 'beauty' };

export type PatientSiteForAccess = PatientSite | null;
```

- [ ] **Step 2: Export it**

Add to `packages/domain/src/index.ts`:

```ts
export type {
  PatientSite,
  PatientSiteAccessScope,
  PatientSiteForAccess,
} from './ports/patient-site-scope.port.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @medical-crm/domain typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/ports/patient-site-scope.port.ts packages/domain/src/index.ts
git commit -m "feat(domain): add patient site access scope"
```

### Task 2: Add Admin Patient-Site Access Policy

**Files:**

- Create: `packages/application/src/access/admin-patient-site-access.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/__tests__/admin-patient-site-access.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests for:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  AdminPatientSiteAccessPolicy,
  getAdminPatientSiteScope,
  isPatientSiteAllowedByScope,
} from '../src/access/admin-patient-site-access.js';
import type { Actor } from '../src/types/actor.js';

const regularAdmin: Actor = {
  userId: 'admin-1',
  email: 'contact@medicaltourismchina.health',
  role: 'ADMIN',
  hospitalId: null,
};

const beautyAdmin: Actor = {
  userId: 'admin-2',
  email: 'CONTACT@MEDORABEAUTY.COM',
  role: 'ADMIN',
  hospitalId: null,
};

describe('admin patient site access', () => {
  it('derives beauty-only scope from medorabeauty email domain', () => {
    expect(getAdminPatientSiteScope(beautyAdmin)).toEqual({ mode: 'ONLY', site: 'beauty' });
  });

  it('derives non-beauty scope from every other admin email', () => {
    expect(getAdminPatientSiteScope(regularAdmin)).toEqual({ mode: 'EXCLUDE', site: 'beauty' });
    expect(getAdminPatientSiteScope({ ...regularAdmin, email: 'admin@sub.medorabeauty.com' }))
      .toEqual({ mode: 'EXCLUDE', site: 'beauty' });
    expect(getAdminPatientSiteScope({ ...regularAdmin, email: 'admin@fake-medorabeauty.com' }))
      .toEqual({ mode: 'EXCLUDE', site: 'beauty' });
  });

  it('treats null patient site as non-beauty', () => {
    expect(isPatientSiteAllowedByScope({ mode: 'EXCLUDE', site: 'beauty' }, null)).toBe(true);
    expect(isPatientSiteAllowedByScope({ mode: 'ONLY', site: 'beauty' }, null)).toBe(false);
  });

  it('returns null scope for non-admin actors', () => {
    expect(getAdminPatientSiteScope({ ...regularAdmin, role: 'PATIENT' })).toBeNull();
  });

  it('blocks cross-scope case access', async () => {
    const caseRepo = { findById: vi.fn().mockResolvedValue({ id: 'case-1', patientId: 'patient-1' }) };
    const userRepo = { findById: vi.fn().mockResolvedValue({ id: 'patient-1', patientSite: 'beauty' }) };
    const policy = new AdminPatientSiteAccessPolicy(caseRepo as never, userRepo as never);

    await expect(policy.assertActorCanAccessCase(regularAdmin, 'case-1'))
      .rejects.toThrow('Access denied to this case scope');
  });

  it('allows in-scope case and patient access', async () => {
    const caseRepo = { findById: vi.fn().mockResolvedValue({ id: 'case-1', patientId: 'patient-1' }) };
    const userRepo = { findById: vi.fn().mockResolvedValue({ id: 'patient-1', patientSite: 'beauty' }) };
    const policy = new AdminPatientSiteAccessPolicy(caseRepo as never, userRepo as never);

    await expect(policy.assertActorCanAccessCase(beautyAdmin, 'case-1')).resolves.toMatchObject({ id: 'case-1' });
    await expect(policy.assertActorCanAccessPatient(beautyAdmin, 'patient-1')).resolves.toBeUndefined();
  });

  it('fails missing patients explicitly', async () => {
    const caseRepo = { findById: vi.fn() };
    const userRepo = { findById: vi.fn().mockResolvedValue(null) };
    const policy = new AdminPatientSiteAccessPolicy(caseRepo as never, userRepo as never);

    await expect(policy.assertActorCanAccessPatient(beautyAdmin, 'missing-patient'))
      .rejects.toThrow('Patient missing-patient not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @medical-crm/application test -- __tests__/admin-patient-site-access.test.ts`

Expected: FAIL because the file/module does not exist.

- [ ] **Step 3: Implement the policy**

Implementation shape:

```ts
import type {
  Case,
  ICaseRepository,
  IUserRepository,
  PatientSiteAccessScope,
  PatientSiteForAccess,
} from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../types/actor.js';

const BEAUTY_ADMIN_DOMAIN = '@medorabeauty.com';

export function getAdminPatientSiteScope(actor: Actor): PatientSiteAccessScope | null {
  if (actor.role !== 'ADMIN') return null;
  const email = actor.email.trim().toLowerCase();
  return email.endsWith(BEAUTY_ADMIN_DOMAIN)
    ? { mode: 'ONLY', site: 'beauty' }
    : { mode: 'EXCLUDE', site: 'beauty' };
}

export function isPatientSiteAllowedByScope(
  scope: PatientSiteAccessScope | null,
  patientSite: PatientSiteForAccess,
): boolean {
  if (!scope) return true;
  if (scope.mode === 'ONLY') return patientSite === scope.site;
  return patientSite !== scope.site;
}

export function assertPatientSiteAllowedByScope(
  scope: PatientSiteAccessScope | null,
  patientSite: PatientSiteForAccess,
): void {
  if (!isPatientSiteAllowedByScope(scope, patientSite)) {
    throw new ForbiddenError('Access denied to this case scope');
  }
}

export class AdminPatientSiteAccessPolicy {
  constructor(
    private readonly caseRepo: Pick<ICaseRepository, 'findById'>,
    private readonly userRepo: Pick<IUserRepository, 'findById'>,
  ) {}

  async resolveCasePatientSite(caseEntity: Case): Promise<PatientSiteForAccess> {
    const patient = await this.userRepo.findById(caseEntity.patientId);
    return patient?.patientSite ?? null;
  }

  async assertActorCanAccessCaseEntity(actor: Actor, caseEntity: Case): Promise<void> {
    const scope = getAdminPatientSiteScope(actor);
    if (!scope) return;
    assertPatientSiteAllowedByScope(scope, await this.resolveCasePatientSite(caseEntity));
  }

  async assertActorCanAccessCase(actor: Actor, caseId: string): Promise<Case> {
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);
    await this.assertActorCanAccessCaseEntity(actor, caseEntity);
    return caseEntity;
  }

  async assertActorCanAccessPatient(actor: Actor, patientId: string): Promise<void> {
    const scope = getAdminPatientSiteScope(actor);
    if (!scope) return;
    const patient = await this.userRepo.findById(patientId);
    if (!patient) throw new NotFoundError(`Patient ${patientId} not found`);
    assertPatientSiteAllowedByScope(scope, patient.patientSite ?? null);
  }
}
```

- [ ] **Step 4: Export policy**

Add to `packages/application/src/index.ts`:

```ts
export {
  AdminPatientSiteAccessPolicy,
  assertPatientSiteAllowedByScope,
  getAdminPatientSiteScope,
  isPatientSiteAllowedByScope,
} from './access/admin-patient-site-access.js';
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @medical-crm/application test -- __tests__/admin-patient-site-access.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/access/admin-patient-site-access.ts packages/application/src/index.ts packages/application/__tests__/admin-patient-site-access.test.ts
git commit -m "feat(application): add admin patient site access policy"
```

### Task 3: Scope Cases Repository Lists And Stats

**Files:**

- Modify: `packages/domain/src/ports/case-repository.port.ts`
- Create: `packages/infrastructure/database/repositories/patient-site-scope-sql.ts`
- Modify: `packages/infrastructure/database/repositories/drizzle-case.repository.ts`
- Test: `packages/infrastructure/__tests__/integration/drizzle-case.repository.test.ts`

- [ ] **Step 1: Add failing repository tests**

Add cases covering:

- `findMany({ patientSiteScope: { mode: 'ONLY', site: 'beauty' } })` returns only beauty-patient cases.
- `findMany({ patientSiteScope: { mode: 'EXCLUDE', site: 'beauty' } })` excludes beauty and includes both `patient_site = 'china'` and `patient_site IS NULL`.
- `countByFilters({ patientSiteScope })` returns scoped counts.
- `findMany()` preserves existing search filtering when combined with patient-site scope.
- `findMany()` preserves assignment-status and treatment-stage filtering when combined with patient-site scope.
- `findMany()` preserves hospital access filtering when combined with patient-site scope.
- `findMany()` preserves pagination totals and created-at ordering when combined with patient-site scope.

- [ ] **Step 2: Run repository test to verify it fails**

Run: `pnpm --filter @medical-crm/infrastructure test:integration -- __tests__/integration/drizzle-case.repository.test.ts`

Expected: FAIL because query/filter types and SQL support do not exist.

- [ ] **Step 3: Extend case query/filter types**

Add `patientSiteScope?: PatientSiteAccessScope` to:

- `CaseListQuery`
- `CaseCountFilters`

- [ ] **Step 4: Add SQL helper**

Create helper with this responsibility:

```ts
import { sql, type SQL } from 'drizzle-orm';
import type { PatientSiteAccessScope } from '@medical-crm/domain';

export function patientSiteScopeSql(
  patientSiteExpression: SQL,
  scope?: PatientSiteAccessScope,
): SQL | undefined {
  if (!scope) return undefined;
  if (scope.mode === 'ONLY') {
    return sql`${patientSiteExpression} = 'beauty'`;
  }
  return sql`(${patientSiteExpression} is null or ${patientSiteExpression} <> 'beauty')`;
}
```

- [ ] **Step 5: Modify `DrizzleCaseRepository`**

Join `users` for list/count queries and apply the helper to `users.patientSite`.
Keep existing hospital filtering and search behavior intact.

- [ ] **Step 6: Run repository test**

Run: `pnpm --filter @medical-crm/infrastructure test:integration -- __tests__/integration/drizzle-case.repository.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/ports/case-repository.port.ts packages/infrastructure/database/repositories/patient-site-scope-sql.ts packages/infrastructure/database/repositories/drizzle-case.repository.ts packages/infrastructure/__tests__/integration/drizzle-case.repository.test.ts
git commit -m "feat(infra): scope case queries by patient site"
```

## Chunk 2: Case Surfaces And Dashboard

### Task 4: Scope Case Use Cases

**Files:**

- Modify:
  - `packages/application/src/use-cases/cases/create-case.use-case.ts`
  - `packages/application/src/use-cases/cases/list-cases.use-case.ts`
  - `packages/application/src/use-cases/cases/get-case-stats.use-case.ts`
  - `packages/application/src/use-cases/cases/get-case.use-case.ts`
  - `packages/application/src/use-cases/cases/update-case.use-case.ts`
  - `packages/application/src/use-cases/cases/update-case-status.use-case.ts`
  - `packages/application/src/use-cases/cases/advance-case-stage.use-case.ts`
  - `packages/application/src/use-cases/cases/assign-case.use-case.ts`
  - `packages/application/src/use-cases/cases/save-case-diagnosis.use-case.ts`
- Modify: `apps/api/src/composition-root.ts`
- Tests:
  - `packages/application/__tests__/create-case.use-case.test.ts`
  - `packages/application/__tests__/list-cases.use-case.test.ts`
  - `packages/application/__tests__/get-case-stats.use-case.test.ts`
  - `packages/application/__tests__/get-case.use-case.test.ts`
  - `packages/application/__tests__/update-case.use-case.test.ts`
  - `packages/application/__tests__/update-case-status.use-case.test.ts`
  - `packages/application/__tests__/advance-case-stage.use-case.test.ts`
  - `packages/application/__tests__/assign-case.use-case.test.ts`
  - `packages/application/__tests__/save-case-diagnosis.use-case.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- Beauty admin list passes `{ mode: 'ONLY', site: 'beauty' }` to repo.
- Regular admin list passes `{ mode: 'EXCLUDE', site: 'beauty' }`.
- Beauty admin stats pass `{ mode: 'ONLY', site: 'beauty' }` to repo.
- Regular admin stats pass `{ mode: 'EXCLUDE', site: 'beauty' }` to repo.
- Beauty admin can create a case for a beauty patient.
- Beauty admin cannot create a case for a `china` patient.
- Beauty admin cannot create a case for a `null` patient-site patient.
- Regular admin can create a case for a `china` patient.
- Regular admin can create a case for a `null` patient-site patient.
- Regular admin cannot create a case for a beauty patient.
- Cross-scope case creation does not call `nextCaseNumber()` or `caseRepo.save()`.
- Detail/update/status/assign/diagnosis rejects cross-scope admin.
- `AdvanceCaseStageUseCase` rejects cross-scope admin.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  __tests__/create-case.use-case.test.ts \
  __tests__/list-cases.use-case.test.ts \
  __tests__/get-case-stats.use-case.test.ts \
  __tests__/get-case.use-case.test.ts \
  __tests__/update-case.use-case.test.ts \
  __tests__/update-case-status.use-case.test.ts \
  __tests__/advance-case-stage.use-case.test.ts \
  __tests__/assign-case.use-case.test.ts \
  __tests__/save-case-diagnosis.use-case.test.ts
```

Expected: FAIL because policy injection and scope propagation do not exist.

- [ ] **Step 3: Implement minimal use case changes**

Pattern:

```ts
const patientSiteScope = getAdminPatientSiteScope(actor);
const result = await this.caseRepo.findMany({ ...query, patientSiteScope }, hospitalId);
```

For detail/mutation:

```ts
const entity = await this.caseRepo.findById(caseId);
if (!entity) throw new NotFoundError(`Case ${caseId} not found`);
await this.adminAccess.assertActorCanAccessCaseEntity(actor, entity);
```

For creation:

```ts
await this.adminAccess.assertActorCanAccessPatient(actor, input.patientId);
```

This call must happen before `nextCaseNumber()` and before constructing the `Case`.

- [ ] **Step 4: Update constructors and composition root**

Instantiate once:

```ts
const adminPatientSiteAccess = new AdminPatientSiteAccessPolicy(caseRepo, userRepo);
```

Pass it into affected use cases. Keep hospital access dependencies unchanged.

- [ ] **Step 5: Run tests**

Run the same application test command.

Expected: PASS.

- [ ] **Step 6: Run API case route tests**

Run: `pnpm --filter @medical-crm/api test -- src/__tests__/cases.routes.test.ts`

Expected: PASS after updating mocks for new constructor dependencies.

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/use-cases/cases apps/api/src/composition-root.ts packages/application/__tests__/create-case.use-case.test.ts packages/application/__tests__/list-cases.use-case.test.ts packages/application/__tests__/get-case-stats.use-case.test.ts packages/application/__tests__/get-case.use-case.test.ts packages/application/__tests__/update-case.use-case.test.ts packages/application/__tests__/update-case-status.use-case.test.ts packages/application/__tests__/advance-case-stage.use-case.test.ts packages/application/__tests__/assign-case.use-case.test.ts packages/application/__tests__/save-case-diagnosis.use-case.test.ts apps/api/src/__tests__/cases.routes.test.ts
git commit -m "feat(cases): enforce admin patient site scope"
```

### Task 5: Scope Case Subresources

**Files:**

- Modify:
  - `packages/application/src/use-cases/progress/get-case-progress.use-case.ts`
  - `packages/application/src/use-cases/progress/add-case-progress.use-case.ts`
  - `packages/application/src/use-cases/documents/list-documents.use-case.ts`
  - `packages/application/src/use-cases/documents/upload-document.use-case.ts`
  - `packages/application/src/use-cases/documents/get-document-preview.use-case.ts`
  - `packages/application/src/use-cases/documents/delete-document.use-case.ts`
  - `packages/application/src/use-cases/events/list-case-events.use-case.ts`
  - `packages/application/src/use-cases/events/get-case-timeline.use-case.ts`
  - `packages/application/src/use-cases/journey/get-case-journey.use-case.ts`
  - `packages/application/src/use-cases/journey/update-case-journey.use-case.ts`
  - `packages/application/src/use-cases/journey/list-milestones.use-case.ts`
  - `packages/application/src/use-cases/journey/create-milestone.use-case.ts`
  - `packages/application/src/use-cases/journey/update-milestone.use-case.ts`
  - `packages/application/src/use-cases/journey/delete-milestone.use-case.ts`
  - `packages/application/src/use-cases/quotes/add-hospital-to-case.use-case.ts`
  - `packages/application/src/use-cases/quotes/list-case-hospital-contacts.use-case.ts`
  - `packages/application/src/use-cases/quotes/admin-reset-assignment.use-case.ts`
  - `apps/api/src/routes/documents.routes.ts`
- Tests:
  - `packages/application/__tests__/add-case-progress.use-case.test.ts`
  - `packages/application/__tests__/upload-document.use-case.test.ts`
  - `packages/application/__tests__/event-use-cases.test.ts`
  - `packages/application/__tests__/journey-use-cases.test.ts`
  - `packages/application/__tests__/chc-use-cases.test.ts`
  - API tests for `documents`, `progress`, `journey`, and `events`.

- [ ] **Step 1: Write failing tests**

Cover these named paths:

- Progress: `GetCaseProgressUseCase` and `AddCaseProgressUseCase` reject cross-scope admin.
- Documents: `ListDocumentsUseCase`, `UploadDocumentUseCase`, `GetDocumentPreviewUseCase`, and `DeleteDocumentUseCase` reject cross-scope admin.
- Route-level document notification rejects cross-scope admin before sending.
- Events/timeline: `ListCaseEventsUseCase` and `GetCaseTimelineUseCase` reject cross-scope admin.
- Journey: `GetCaseJourneyUseCase`, `UpdateCaseJourneyUseCase`, `ListMilestonesUseCase`, `CreateMilestoneUseCase`, `UpdateMilestoneUseCase`, and `DeleteMilestoneUseCase` reject cross-scope admin.
- Hospital contacts: `ListCaseHospitalContactsUseCase`, `AddHospitalToCaseUseCase`, and `AdminResetAssignmentUseCase` reject cross-scope admin.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  __tests__/add-case-progress.use-case.test.ts \
  __tests__/upload-document.use-case.test.ts \
  __tests__/event-use-cases.test.ts \
  __tests__/journey-use-cases.test.ts \
  __tests__/chc-use-cases.test.ts
```

Expected: FAIL until guards are added.

- [ ] **Step 3: Add policy checks**

For every use case that already loads the case, call `assertActorCanAccessCaseEntity`.
For use cases with only `caseId`, call `assertActorCanAccessCase`.

For route-level document notification, add:

```ts
await svc.adminPatientSiteAccess.assertActorCanAccessCaseEntity(actor, caseEntity);
```

after loading the case and before loading/sending document notifications.

- [ ] **Step 4: Run focused tests**

Expected: PASS.

- [ ] **Step 5: Run API route tests**

Run:

```bash
pnpm --filter @medical-crm/api test -- \
  src/__tests__/documents.routes.test.ts \
  src/__tests__/progress.routes.test.ts \
  src/__tests__/journey.routes.test.ts \
  src/__tests__/events.routes.test.ts \
  src/__tests__/hospital-contacts.routes.test.ts
```

Expected: PASS after mocks are updated.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/progress packages/application/src/use-cases/documents packages/application/src/use-cases/events packages/application/src/use-cases/journey packages/application/src/use-cases/quotes apps/api/src/routes/documents.routes.ts packages/application/__tests__ apps/api/src/__tests__
git commit -m "feat(cases): guard admin case subresources"
```

### Task 6: Scope Admin Dashboard

**Files:**

- Modify:
  - `packages/application/src/use-cases/dashboard/admin-dashboard.use-case.ts`
  - `packages/domain/src/ports/support-ticket-repository.port.ts`
  - `packages/domain/src/ports/order-repository.port.ts`
  - `packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-order.repository.ts`
- Test:
  - `packages/application/__tests__/dashboard-use-cases.test.ts`
  - `packages/infrastructure/__tests__/integration/drizzle-support-ticket.repository.test.ts`
  - `packages/infrastructure/__tests__/integration/drizzle-order.repository.test.ts`
  - `apps/api/src/__tests__/dashboard.routes.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- Beauty admin dashboard passes beauty scope into case stats/recent cases.
- Regular admin dashboard excludes beauty cases.
- Ticket/order counts use scoped repository calls.
- Dashboard ticket/order counts handle `caseId = null` by resolving scope through `patientId`.
- Dashboard ticket/order counts include `patient_site IS NULL` for regular admins.
- Repository tests prove ticket/order SQL scope handles linked cases, `caseId = null`, and `patient_site IS NULL` with correct totals.

- [ ] **Step 2: Run tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- __tests__/dashboard-use-cases.test.ts
pnpm --filter @medical-crm/infrastructure test:integration -- __tests__/integration/drizzle-support-ticket.repository.test.ts __tests__/integration/drizzle-order.repository.test.ts
pnpm --filter @medical-crm/api test -- src/__tests__/dashboard.routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement dashboard scoping**

Use:

```ts
const patientSiteScope = getAdminPatientSiteScope(actor);
const caseStats = await this.caseRepo.countByFilters({ patientSiteScope });
const recentCasesResult = await this.caseRepo.findMany({ page: 1, limit: 5, patientSiteScope });
const openTicketsResult = await this.ticketRepo.findAll({ status: 'OPEN', page: 1, limit: 1, patientSiteScope });
const pendingOrdersResult = await this.orderRepo.findAll({ status: 'PENDING_PAYMENT', page: 1, limit: 1, patientSiteScope });
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/dashboard/admin-dashboard.use-case.ts packages/domain/src/ports/support-ticket-repository.port.ts packages/domain/src/ports/order-repository.port.ts packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts packages/infrastructure/database/repositories/drizzle-order.repository.ts packages/application/__tests__/dashboard-use-cases.test.ts packages/infrastructure/__tests__/integration/drizzle-support-ticket.repository.test.ts packages/infrastructure/__tests__/integration/drizzle-order.repository.test.ts apps/api/src/__tests__/dashboard.routes.test.ts
git commit -m "feat(dashboard): scope admin case-derived counts"
```

## Chunk 3: Direct Case-Derived Surfaces

### Task 7: Scope Conversations And Messages

**Files:**

- Modify:
  - `packages/domain/src/ports/conversation-repository.port.ts`
  - `packages/infrastructure/database/repositories/drizzle-conversation.repository.ts`
  - `packages/application/src/use-cases/conversations/list-conversations.use-case.ts`
  - `packages/application/src/use-cases/conversations/get-conversation.use-case.ts`
  - `packages/application/src/use-cases/conversations/create-conversation.use-case.ts`
  - `packages/application/src/use-cases/conversations/update-conversation.use-case.ts`
  - `packages/application/src/use-cases/conversations/resume-conversation-ai.use-case.ts`
  - `packages/application/src/use-cases/messages/list-messages.use-case.ts`
  - `packages/application/src/use-cases/messages/send-message.use-case.ts`
  - `packages/application/src/use-cases/messages/get-message.use-case.ts`
  - `packages/application/src/use-cases/messages/update-message.use-case.ts`
  - `packages/application/src/use-cases/messages/delete-message.use-case.ts`
  - `packages/application/src/use-cases/messages/list-pending-review.use-case.ts`
  - `packages/application/src/use-cases/messages/approve-message.use-case.ts`
  - `packages/application/src/use-cases/messages/reject-message.use-case.ts`
  - `packages/application/src/use-cases/messages/regenerate-summary.use-case.ts`
  - `packages/application/src/use-cases/messages/retranslate-message.use-case.ts`
- Tests:
  - `packages/application/__tests__/list-conversations.use-case.test.ts`
  - `packages/application/__tests__/get-conversation.use-case.test.ts`
  - `packages/application/__tests__/message-crud.use-case.test.ts`
  - `packages/application/__tests__/send-message.use-case.test.ts`
  - `apps/api/src/__tests__/conversations.routes.test.ts`
  - `apps/api/src/__tests__/messages.routes.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- Conversation list omits cross-scope `caseId` conversations with scoped total.
- Conversation detail rejects cross-scope case-linked conversation.
- Message list rejects cross-scope parent conversation before signing attachments.
- Message mutation rejects cross-scope parent conversation.
- Pending review list returns scoped rows and totals.
- Approve/reject message rejects cross-scope parent conversation.
- Regenerate summary rejects cross-scope parent conversation.
- Retranslate message rejects cross-scope parent conversation.
- Message detail rejects cross-scope parent conversation before signing attachments.
- Conversations without `caseId` retain existing admin behavior only after test fixtures show no patient/case data.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  __tests__/list-conversations.use-case.test.ts \
  __tests__/get-conversation.use-case.test.ts \
  __tests__/message-crud.use-case.test.ts \
  __tests__/send-message.use-case.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement repository scoped list**

Add `patientSiteScope?: PatientSiteAccessScope` to `ConversationListQuery`.
In Drizzle, join `cases` and `users` for rows where `conversations.caseId` exists and apply patient-site scope.
Keep non-case conversations visible only after confirming they do not contain patient/case data.

- [ ] **Step 4: Implement use case guards**

For conversation detail, message review actions, retranslations, and mutations:

```ts
if (conversation.caseId) {
  await this.adminAccess.assertActorCanAccessCase(actor, conversation.caseId);
}
```

- [ ] **Step 5: Run focused and API tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  __tests__/list-conversations.use-case.test.ts \
  __tests__/get-conversation.use-case.test.ts \
  __tests__/message-crud.use-case.test.ts \
  __tests__/send-message.use-case.test.ts
pnpm --filter @medical-crm/api test -- src/__tests__/conversations.routes.test.ts src/__tests__/messages.routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/ports/conversation-repository.port.ts packages/infrastructure/database/repositories/drizzle-conversation.repository.ts packages/application/src/use-cases/conversations packages/application/src/use-cases/messages packages/application/__tests__/list-conversations.use-case.test.ts packages/application/__tests__/get-conversation.use-case.test.ts packages/application/__tests__/message-crud.use-case.test.ts packages/application/__tests__/send-message.use-case.test.ts apps/api/src/__tests__/conversations.routes.test.ts apps/api/src/__tests__/messages.routes.test.ts
git commit -m "feat(messages): scope admin conversations by patient site"
```

### Task 8: Scope Quotes, Consultations, And Questionnaire Responses

**Files:**

- Modify:
  - `packages/domain/src/ports/quote-repository.port.ts`
  - `packages/domain/src/ports/consultation-repository.port.ts`
  - `packages/domain/src/ports/question-collector-repository.port.ts`
  - `packages/infrastructure/database/repositories/drizzle-quote.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-consultation.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-question-collector.repository.ts`
  - `packages/application/src/use-cases/quotes/accept-quote.use-case.ts`
  - `packages/application/src/use-cases/quotes/add-hospital-to-case.use-case.ts`
  - `packages/application/src/use-cases/quotes/admin-reset-assignment.use-case.ts`
  - `packages/application/src/use-cases/quotes/compare-quotes.use-case.ts`
  - `packages/application/src/use-cases/quotes/create-quote.use-case.ts`
  - `packages/application/src/use-cases/quotes/get-quote.use-case.ts`
  - `packages/application/src/use-cases/quotes/list-case-hospital-contacts.use-case.ts`
  - `packages/application/src/use-cases/quotes/list-quotes.use-case.ts`
  - `packages/application/src/use-cases/quotes/reject-quote.use-case.ts`
  - `packages/application/src/use-cases/quotes/remove-hospital-from-case.use-case.ts`
  - `packages/application/src/use-cases/quotes/resend-quote.use-case.ts`
  - `packages/application/src/use-cases/quotes/send-quote.use-case.ts`
  - `packages/application/src/use-cases/quotes/send-reminder.use-case.ts`
  - `packages/application/src/use-cases/quotes/update-quote.use-case.ts`
  - `packages/application/src/use-cases/consultations/create-consultation.use-case.ts`
  - `packages/application/src/use-cases/consultations/get-consultation-stats.use-case.ts`
  - `packages/application/src/use-cases/consultations/get-consultation-transcript.use-case.ts`
  - `packages/application/src/use-cases/consultations/get-consultation.use-case.ts`
  - `packages/application/src/use-cases/consultations/list-case-consultations.use-case.ts`
  - `packages/application/src/use-cases/consultations/list-consultations.use-case.ts`
  - `packages/application/src/use-cases/consultations/update-consultation-status.use-case.ts`
  - `packages/application/src/use-cases/consultations/update-consultation.use-case.ts`
  - `packages/application/src/use-cases/question-collector/get-response.use-case.ts`
  - `packages/application/src/use-cases/question-collector/submit-response.use-case.ts`
  - `packages/application/src/use-cases/question-collector/save-response-draft.use-case.ts`
  - `packages/application/src/use-cases/question-collector/get-template.use-case.ts`
  - `packages/application/src/use-cases/question-collector/list-responses.use-case.ts`
  - `apps/api/src/routes/consultations.routes.ts`
- Tests:
  - `packages/application/__tests__/quote-use-cases.test.ts`
  - `packages/application/__tests__/accept-quote.use-case.test.ts`
  - `packages/application/__tests__/reject-quote.use-case.test.ts`
  - `packages/application/__tests__/consultation-queries.use-case.test.ts`
  - `packages/application/__tests__/get-consultation.use-case.test.ts`
  - `packages/application/__tests__/update-consultation.use-case.test.ts`
  - `packages/application/__tests__/question-collector-use-cases.test.ts`
  - API route tests for quotes, consultations, and question collectors.

- [ ] **Step 1: Write failing tests**

Cover:

- Quote list/detail/send/update reject cross-scope admin.
- Quote create through hospital-owned routes preserves existing hospital-only authorization; any admin-facing quote creation or reassignment path with `caseId` rejects cross-scope admin before save.
- Quote accept, reject, resend, compare, reminder, add/remove hospital, list hospital contacts, and reset assignment reject cross-scope admin when the actor is admin.
- Consultation list, stats, list-case-consultations, create, detail, update, status, transcript, and upload reject cross-scope admin.
- Questionnaire response list returns scoped rows and totals.
- Case-scoped questionnaire read/write rejects cross-scope admin.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  __tests__/quote-use-cases.test.ts \
  __tests__/accept-quote.use-case.test.ts \
  __tests__/reject-quote.use-case.test.ts \
  __tests__/consultation-queries.use-case.test.ts \
  __tests__/get-consultation.use-case.test.ts \
  __tests__/update-consultation.use-case.test.ts \
  __tests__/question-collector-use-cases.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add repository scoped list/stat support**

Add `patientSiteScope?: PatientSiteAccessScope` to list query/filter types for quotes, consultations, and QC responses.
Apply joins through case patient site.

- [ ] **Step 4: Add use case guards**

For direct-id entities:

```ts
await this.adminAccess.assertActorCanAccessCase(actor, entity.caseId);
```

For create endpoints with `caseId`, assert before save. For any create path that accepts `patientId` with nullable `caseId`, use patient-scope assertion before allocating ids or writing rows.

For hospital-only quote send/resend paths, keep existing hospital authorization and add admin patient-site checks only where an admin actor is permitted by current behavior or route-level delegation.

- [ ] **Step 5: Protect consultation recording upload route**

`apps/api/src/routes/consultations.routes.ts` already calls `getConsultation.execute(id, actor)` before upload intent. After `GetConsultationUseCase` is guarded, keep this route covered by a route test.

- [ ] **Step 6: Run focused and API tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- \
  __tests__/quote-use-cases.test.ts \
  __tests__/accept-quote.use-case.test.ts \
  __tests__/reject-quote.use-case.test.ts \
  __tests__/consultation-queries.use-case.test.ts \
  __tests__/get-consultation.use-case.test.ts \
  __tests__/update-consultation.use-case.test.ts \
  __tests__/question-collector-use-cases.test.ts
pnpm --filter @medical-crm/api test -- \
  src/__tests__/quotes.routes.test.ts \
  src/__tests__/consultations.routes.test.ts \
  src/__tests__/question-collector.routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/ports/quote-repository.port.ts packages/domain/src/ports/consultation-repository.port.ts packages/domain/src/ports/question-collector-repository.port.ts packages/infrastructure/database/repositories/drizzle-quote.repository.ts packages/infrastructure/database/repositories/drizzle-consultation.repository.ts packages/infrastructure/database/repositories/drizzle-question-collector.repository.ts packages/application/src/use-cases/quotes packages/application/src/use-cases/consultations packages/application/src/use-cases/question-collector apps/api/src/routes/consultations.routes.ts packages/application/__tests__ apps/api/src/__tests__/quotes.routes.test.ts apps/api/src/__tests__/consultations.routes.test.ts apps/api/src/__tests__/question-collector.routes.test.ts
git commit -m "feat(admin): scope quote consultation and questionnaire surfaces"
```

### Task 9: Scope Tickets And Orders

**Files:**

- Modify:
  - `packages/domain/src/ports/support-ticket-repository.port.ts`
  - `packages/domain/src/ports/order-repository.port.ts`
  - `packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts`
  - `packages/infrastructure/database/repositories/drizzle-order.repository.ts`
  - `packages/application/src/use-cases/tickets/assign-ticket.use-case.ts`
  - `packages/application/src/use-cases/tickets/close-ticket.use-case.ts`
  - `packages/application/src/use-cases/tickets/create-ticket.use-case.ts`
  - `packages/application/src/use-cases/tickets/get-ticket.use-case.ts`
  - `packages/application/src/use-cases/tickets/list-tickets.use-case.ts`
  - `packages/application/src/use-cases/tickets/reply-to-ticket.use-case.ts`
  - `packages/application/src/use-cases/tickets/update-ticket-status.use-case.ts`
  - `packages/application/src/use-cases/orders/create-order.use-case.ts`
  - `packages/application/src/use-cases/orders/create-payment-intent.use-case.ts`
  - `packages/application/src/use-cases/orders/get-order.use-case.ts`
  - `packages/application/src/use-cases/orders/list-orders.use-case.ts`
  - `packages/application/src/use-cases/orders/request-refund.use-case.ts`
  - `packages/application/src/use-cases/orders/update-order-status.use-case.ts`
  - `apps/api/src/routes/tickets.routes.ts`
- Tests:
  - `packages/application/__tests__/ticket-use-cases.test.ts`
  - `packages/application/__tests__/order-use-cases.test.ts`
  - `apps/api/src/__tests__/tickets.routes.test.ts`
  - `apps/api/src/__tests__/ticket-upload.routes.test.ts`
  - `apps/api/src/__tests__/orders.routes.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- Lists return scoped totals.
- Detail/mutation/upload rejects cross-scope admin.
- `caseId = null` ticket/order scopes through `patientId`.
- Regular admin can access `patient_site = null` ticket/order.
- Admin order creation with `caseId = null` and `patientId` rejects cross-scope admin before `nextOrderNumber()` or `orderRepo.save()`.
- Admin order creation for a beauty patient is allowed only for `@medorabeauty.com`; regular admins can create only `china` or `null` patient-site orders.

- [ ] **Step 2: Run tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- __tests__/ticket-use-cases.test.ts __tests__/order-use-cases.test.ts
pnpm --filter @medical-crm/api test -- src/__tests__/tickets.routes.test.ts src/__tests__/ticket-upload.routes.test.ts src/__tests__/orders.routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement repository scoping**

For ticket/order list queries, compute patient site with:

```sql
case
  when entity.case_id is not null then case_patient.patient_site
  else direct_patient.patient_site
end
```

Use that expression with `patientSiteScopeSql()`.

- [ ] **Step 4: Add use case guards**

Create helper methods in the policy if useful:

```ts
async assertActorCanAccessCaseOrPatient(actor: Actor, input: {
  caseId: string | null;
  patientId: string;
}): Promise<void>
```

Use it in ticket/order detail and mutation use cases.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @medical-crm/application test -- __tests__/ticket-use-cases.test.ts __tests__/order-use-cases.test.ts
pnpm --filter @medical-crm/api test -- src/__tests__/tickets.routes.test.ts src/__tests__/ticket-upload.routes.test.ts src/__tests__/orders.routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/ports/support-ticket-repository.port.ts packages/domain/src/ports/order-repository.port.ts packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts packages/infrastructure/database/repositories/drizzle-order.repository.ts packages/application/src/use-cases/tickets packages/application/src/use-cases/orders apps/api/src/routes/tickets.routes.ts packages/application/__tests__/ticket-use-cases.test.ts packages/application/__tests__/order-use-cases.test.ts apps/api/src/__tests__/tickets.routes.test.ts apps/api/src/__tests__/ticket-upload.routes.test.ts apps/api/src/__tests__/orders.routes.test.ts
git commit -m "feat(admin): scope tickets and orders by patient site"
```

## Chunk 4: Provisioning, Deployment, And Final Verification

### Task 10: Add Idempotent Admin Provisioning Script

**Files:**

- Create: `scripts/provision-admin-user.ts`
- Test: manual dry-run style command documented in final output.

- [ ] **Step 1: Implement script**

Script responsibilities:

- Read `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.
- Read Keycloak env: `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`.
- Use existing `KeycloakAdminService` where possible.
- If Keycloak user exists by email, use its id. If it does not exist, create it with username/email.
- Ensure the Keycloak username is exactly `ADMIN_EMAIL`; if Keycloak refuses a username update because of realm policy or a conflicting user, exit non-zero with remediation instead of reporting success.
- Set password with `temporary: false`.
- Ensure the Keycloak user has `enabled: true`.
- Set `emailVerified: true`.
- Clear blocking Keycloak `requiredActions` by setting `requiredActions: []`.
- Assign realm role `admin`.
- Verify login readiness with `verifyPassword(ADMIN_EMAIL, ADMIN_PASSWORD, adminClientId, adminClientSecret)` before reporting provisioning success.
- Upsert CRM `users` row with role `ADMIN`, `hospital_id = null`, `patient_site = null`, `status = active`, and `keycloak_user_id`.
- Never log the password.
- Print a structured summary of every completed step and every skipped idempotent step.
- If Keycloak succeeds but CRM upsert fails, exit non-zero and print the Keycloak user id plus a clear partial-success remediation message.
- If CRM succeeds but role assignment fails, exit non-zero and print the CRM user id plus a clear partial-success remediation message.
- Support `DRY_RUN=1` to validate env, discover existing Keycloak/CRM users, and print planned changes without mutating Keycloak or the DB.

If `KeycloakAdminService` cannot return existing user ids, add focused methods to it:

```ts
findUserByEmail(email: string): Promise<KeycloakUser | null>;
ensureRealmRole(userId: string, role: string): Promise<void>;
setEmailVerified(userId: string, verified: boolean): Promise<void>;
ensureLoginReady(userId: string): Promise<void>; // enabled: true, requiredActions: []
ensureUsername(userId: string, username: string): Promise<void>;
```

- [ ] **Step 2: Typecheck script**

Run: `pnpm exec tsc --noEmit --allowJs false`

Expected: if root typecheck is too broad, use `pnpm typecheck` after implementation instead.

- [ ] **Step 3: Commit**

```bash
git add scripts/provision-admin-user.ts packages/infrastructure/services/keycloak-admin.service.ts packages/domain/src/ports/keycloak-admin-service.port.ts
git commit -m "chore(admin): add idempotent admin provisioning script"
```

### Task 11: Full Verification

**Files:** no new files unless tests need small fixture updates.

- [ ] **Step 1: Run application tests**

Run: `pnpm --filter @medical-crm/application test`

Expected: PASS.

- [ ] **Step 2: Run infrastructure tests**

Run: `pnpm --filter @medical-crm/infrastructure test`

Expected: PASS.

- [ ] **Step 3: Run API tests**

Run: `pnpm --filter @medical-crm/api test`

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Run lint**

Run: `pnpm lint`

Expected: PASS or document pre-existing unrelated lint failures with exact output.

- [ ] **Step 6: Commit any verification-only fixture fixes**

Only commit if verification required test fixture updates:

```bash
git add <exact files>
git commit -m "test(admin): cover patient site access boundaries"
```

### Task 12: Deploy And Provision Production Account

**Files:** no source file edits.

- [ ] **Step 1: Deploy API/admin if deployment is required**

Use the repo deployment script after tests pass:

```bash
python3 scripts/deploy_v2.py --targets api,admin
```

Expected: deploy completes and health check succeeds.

- [ ] **Step 2: Dry-run account provisioning from production environment**

Run from an environment with production DB and Keycloak admin env loaded. Pass the approved password at runtime without putting it in the command line:

```bash
read -rsp "Admin password: " ADMIN_PASSWORD; echo
DRY_RUN=1 \
ADMIN_EMAIL='contact@medorabeauty.com' \
ADMIN_NAME='Medora Beauty Admin' \
ADMIN_PASSWORD="$ADMIN_PASSWORD" \
pnpm exec tsx scripts/provision-admin-user.ts
unset ADMIN_PASSWORD
```

Expected output must include planned Keycloak, role, and CRM actions, with no password value printed.

- [ ] **Step 3: Provision account from production environment**

Run the same command without dry-run:

```bash
read -rsp "Admin password: " ADMIN_PASSWORD; echo
ADMIN_EMAIL='contact@medorabeauty.com' \
ADMIN_NAME='Medora Beauty Admin' \
ADMIN_PASSWORD="$ADMIN_PASSWORD" \
pnpm exec tsx scripts/provision-admin-user.ts
unset ADMIN_PASSWORD
```

Expected output must include:

- Keycloak user id.
- CRM user id.
- Role assignment confirmed.
- `emailVerified` confirmed.
- Keycloak `enabled` and empty `requiredActions` confirmed.
- `verifyPassword(ADMIN_EMAIL, ADMIN_PASSWORD, ...)` confirmed.
- No password value printed.

- [ ] **Step 4: Verify authentication**

Use Keycloak password grant against the admin client or manually log in at:

`https://admin.medicaltourismchina.health/`

Expected:

- `contact@medorabeauty.com` can log in.
- It reaches the admin portal.
- It sees only beauty cases and beauty-derived dashboard/message/ticket/order/quote/consultation/questionnaire data.

- [ ] **Step 5: Verify regular admin exclusion**

Log in as an existing non-`@medorabeauty.com` admin.

Expected:

- Beauty cases are absent from cases list and dashboard.
- Direct beauty case URLs return 403 or equivalent access-denied response.
- Direct beauty message/ticket/order/quote/consultation/questionnaire URLs return 403.

- [ ] **Step 6: Audit password is absent from files and commit history**

After account provisioning succeeds, verify the literal password is absent from the working tree and from commits introduced by this branch. Do not fix a secret leak with a later redaction commit.

Run:

```bash
read -rsp "Password to audit for accidental commits: " ADMIN_PASSWORD_FOR_AUDIT; echo
rg -n --fixed-strings "$ADMIN_PASSWORD_FOR_AUDIT" docs packages apps scripts
git diff origin/feature/phase-2bc..HEAD | rg -n --fixed-strings "$ADMIN_PASSWORD_FOR_AUDIT"
git log --all -S"$ADMIN_PASSWORD_FOR_AUDIT" -- docs packages apps scripts
unset ADMIN_PASSWORD_FOR_AUDIT
```

Expected: no working-tree files, branch diff, or relevant commit history contain the password.

If any command finds the literal password, stop. If it has been pushed or exposed outside the local machine, rotate the password. Rewrite or drop the offending local commit before push, then rerun the audit.

### Task 13: Final Safety Audit

**Files:** no planned edits unless audit finds a missed path.

- [ ] **Step 1: Search for unguarded admin case-derived routes**

Run:

```bash
rg -n "caseId|case_id|patientId|patient_id|conversationId|docId|documentId|messageId|quoteId|ticketId|orderId|consultationId|attachment|upload|preview|signedUrl|signed-url|translate" apps/api/src/routes packages/application/src/use-cases
```

Expected: every admin-visible direct-id or list path either uses repository scope or `AdminPatientSiteAccessPolicy`.

- [ ] **Step 2: Search for password leakage**

Run:

```bash
read -rsp "Password to audit for accidental commits: " ADMIN_PASSWORD_FOR_AUDIT; echo
rg -n --fixed-strings "$ADMIN_PASSWORD_FOR_AUDIT" docs packages apps scripts
git diff origin/feature/phase-2bc..HEAD | rg -n --fixed-strings "$ADMIN_PASSWORD_FOR_AUDIT"
git log --all -S"$ADMIN_PASSWORD_FOR_AUDIT" -- docs packages apps scripts
unset ADMIN_PASSWORD_FOR_AUDIT
rg -n "ADMIN_PASSWORD" docs packages apps scripts
```

Expected: `ADMIN_PASSWORD` appears only as an environment variable name in script/docs; the literal password does not appear in files, branch diff, or relevant commit history.

- [ ] **Step 3: Final commit or status check**

Run: `git status --short`

Expected: only intentional changes remain. Do not revert unrelated pre-existing user changes.

- [ ] **Step 4: Report**

Final report must include:

- Test commands run and results.
- Production login verification status.
- Scope verification status for beauty admin and regular admin.
- Any endpoints intentionally deferred with rationale.
