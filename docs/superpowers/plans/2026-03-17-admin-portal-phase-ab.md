# Admin Portal Phase A+B Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Admin Portal with core skeleton (Phase A: Dashboard, Cases, Hospitals, Registration) and extended workflow (Phase B: 8 Case Detail tabs).

**Architecture:** Next.js 15 BFF app in `apps/admin/` with Route Handlers proxying to backend API at `http://localhost:3001`. React Query for client-side data fetching, iron-session for auth cookies, Keycloak PKCE for authentication (already scaffolded). Shared UI components from `@medical-crm/ui`.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, TanStack React Query v5, Lucide React, Framer Motion, iron-session, @medical-crm/ui, @medical-crm/validation

**Spec:** `docs/superpowers/specs/2026-03-17-admin-portal-phase-ab-design.md`

---

## Chunk 1: Backend API Prerequisites

### Task 1: Extend `createHospitalSchema` with `specialties` + `city`

Currently `createHospitalSchema` only accepts 6 basic fields. The Hospital entity and DB also lack a `city` column. This task adds `city` across the full stack and adds `specialties` to the create schema.

**Files:**
- Modify: `packages/shared/validation/src/hospital.schema.ts`
- Modify: `packages/domain/src/entities/hospital.entity.ts`
- Modify: `packages/application/src/dtos/hospital.dto.ts`
- Modify: `packages/application/src/mappers/hospital.mapper.ts`
- Modify: `packages/application/src/use-cases/hospitals/create-hospital.use-case.ts`
- Modify: `packages/infrastructure/database/schema/schema.ts`
- Modify: `packages/infrastructure/database/repositories/drizzle-hospital-management.repository.ts`
- Create: `packages/infrastructure/database/migrations/012_add_city_to_hospitals.sql`

- [ ] **Step 1: Add `city` column to DB**

Create SQL migration following the existing numbering convention (`001_`, `002_`, ..., `008_`). Check the latest number first:

```bash
ls packages/infrastructure/database/migrations/ | tail -1
```

Check the latest number and create the next one (currently `011_m9_booking.sql`, so next is `012`):

```sql
-- packages/infrastructure/database/migrations/012_add_city_to_hospitals.sql
ALTER TABLE hospitals ADD COLUMN city VARCHAR(200);
```

Run via the project's migration system (NOT raw `psql`):

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm db:migrate
```

> **Note:** The migration runner at `packages/infrastructure/database/migrate.ts` scans the `migrations/` directory by filename order and records executed migrations in the `_migrations` table. Using `psql -f` directly would bypass this tracking and cause environment sync issues.

- [ ] **Step 2: Update Drizzle schema**

In `packages/infrastructure/database/schema/schema.ts`, add `city` to the `hospitals` table definition:

```typescript
// Inside the hospitals pgTable definition, after the `address` column:
city: varchar({ length: 200 }),
```

- [ ] **Step 3: Update domain entity**

In `packages/domain/src/entities/hospital.entity.ts`:

```typescript
// Add to HospitalProps interface:
city: string | null;

// Add to Hospital class properties:
city: string | null;

// Add to constructor:
this.city = props.city;
```

- [ ] **Step 4: Update HospitalDTO**

In `packages/application/src/dtos/hospital.dto.ts`, add:

```typescript
city: string | null;
```

- [ ] **Step 5: Update mapper**

In `packages/application/src/mappers/hospital.mapper.ts`, add to `toHospitalDTO`:

```typescript
city: entity.city,
```

- [ ] **Step 6: Update repository**

In `packages/infrastructure/database/repositories/drizzle-hospital-management.repository.ts`:

Add `city` to `save()` method's `values` object and `onConflictDoUpdate.set`:
```typescript
city: entity.city,
```

Add `city` to `rowToEntity()`:
```typescript
city: row.city ?? null,
```

- [ ] **Step 7: Update validation schema**

In `packages/shared/validation/src/hospital.schema.ts`, modify `createHospitalSchema`:

```typescript
export const createHospitalSchema = z.object({
  name: z.string().min(1).max(200),
  type: hospitalTypeSchema,
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().max(200).optional(),
  description: z.string().optional(),
  specialties: z.array(z.string()).min(1),  // required for new creation flow
});
```

> **Breaking change note:** `specialties` is now required. Verify no other caller uses `POST /api/v2/hospitals` without this field. If backward compat is needed, use `.optional().default([])` instead.

- [ ] **Step 8: Update CreateHospitalUseCase**

In `packages/application/src/use-cases/hospitals/create-hospital.use-case.ts`:

```typescript
export interface CreateHospitalInput {
  name: string;
  type: HospitalType;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  description?: string;
  specialties: string[];
}

// In execute(), update entity creation:
const entity = new Hospital({
  id: generateId(),
  name: input.name,
  nameEn: '',
  address: input.address ?? null,
  city: input.city ?? null,
  phone: input.contactPhone ?? null,
  email: input.contactEmail,
  description: input.description ?? null,
  logoUrl: null,
  specialties: input.specialties,
  status: 'PENDING',
  type: input.type,
  createdAt: now,
  updatedAt: now,
});
```

- [ ] **Step 9: Fix all compile errors from `city` addition**

Run typecheck to find any other files referencing `HospitalProps` or creating `Hospital` entities (tests, other use cases like `UpdateHospitalUseCase`):

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm turbo typecheck --filter=@medical-crm/domain --filter=@medical-crm/application --filter=@medical-crm/infrastructure
```

Add `city: null` (or appropriate value) to every `new Hospital(...)` call that breaks.

- [ ] **Step 10: Run existing tests**

```bash
pnpm turbo test --filter=@medical-crm/application --filter=@medical-crm/infrastructure
```

Expected: All existing tests should pass (new fields are optional with null defaults).

- [ ] **Step 11: Commit**

```bash
git add packages/shared/validation/src/hospital.schema.ts \
  packages/domain/src/entities/hospital.entity.ts \
  packages/application/src/dtos/hospital.dto.ts \
  packages/application/src/mappers/hospital.mapper.ts \
  packages/application/src/use-cases/hospitals/create-hospital.use-case.ts \
  packages/infrastructure/database/schema/schema.ts \
  packages/infrastructure/database/repositories/drizzle-hospital-management.repository.ts \
  packages/infrastructure/database/migrations/012_add_city_to_hospitals.sql
git add -u  # catch any other files modified for city fix
git commit -m "feat(hospital): extend createHospitalSchema with specialties + city for one-step creation"
```

---

### Task 2: Extend `ticketListQuerySchema` with `caseId` filter

**Files:**
- Modify: `packages/shared/validation/src/support-ticket.schema.ts`
- Modify: `packages/domain/src/ports/support-ticket-repository.port.ts` (TicketListQuery interface)
- Modify: `packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts` (applyFilters)
- Modify: `packages/application/src/use-cases/tickets/list-tickets.use-case.ts` (pass caseId through)

- [ ] **Step 1: Add `caseId` to validation schema**

In `packages/shared/validation/src/support-ticket.schema.ts`:

```typescript
export const ticketListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: ticketStatusSchema.optional(),
  type: ticketTypeSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  caseId: z.string().uuid().optional(),  // NEW
});
```

- [ ] **Step 2: Add `caseId` to domain TicketListQuery**

In `packages/domain/src/ports/support-ticket-repository.port.ts`:

```typescript
export interface TicketListQuery {
  patientId?: string;
  assignedTo?: string;
  status?: string;
  type?: string;
  priority?: string;
  caseId?: string;  // NEW
  page: number;
  limit: number;
}
```

- [ ] **Step 3: Add `caseId` filter to repository**

In `packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts`, update `applyFilters`:

```typescript
private applyFilters(
  conditions: ReturnType<typeof eq>[],
  query: TicketListQuery,
): void {
  if (query.status) {
    conditions.push(eq(supportTickets.status, query.status as typeof supportTickets.status.enumValues[number]));
  }
  if (query.type) {
    conditions.push(eq(supportTickets.type, query.type as typeof supportTickets.type.enumValues[number]));
  }
  if (query.priority) {
    conditions.push(eq(supportTickets.priority, query.priority as typeof supportTickets.priority.enumValues[number]));
  }
  // NEW: filter by caseId
  if (query.caseId) {
    conditions.push(eq(supportTickets.caseId, query.caseId));
  }
}
```

- [ ] **Step 4: Update `ListTicketsUseCase` to pass `caseId` through**

The `ListTicketsUseCase` receives the query and passes it to `ticketRepo.findAll(query)`. Since `TicketListQuery` now has `caseId`, and `applyFilters` handles it in the repo, the use case should pass the `caseId` from the parsed schema through to the query. Verify the route handler in `apps/api/src/routes/tickets.routes.ts` parses and passes `caseId` from the query string.

- [ ] **Step 5: Typecheck + test**

```bash
pnpm turbo typecheck --filter=@medical-crm/domain --filter=@medical-crm/application --filter=@medical-crm/infrastructure
pnpm turbo test --filter=@medical-crm/application --filter=@medical-crm/infrastructure
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/validation/src/support-ticket.schema.ts \
  packages/domain/src/ports/support-ticket-repository.port.ts \
  packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts \
  packages/application/src/use-cases/tickets/list-tickets.use-case.ts
git commit -m "feat(tickets): add caseId filter to ticketListQuerySchema"
```

---

### Task 3: Add GET token validation endpoint

The POST `/api/v2/auth/hospital/register` endpoint (RegisterHospitalUserUseCase) already exists. We need a GET endpoint to validate tokens before showing the registration form.

**Files:**
- Create: `packages/application/src/use-cases/hospitals/validate-registration-token.use-case.ts`
- Modify: `apps/api/src/index.ts` (add GET public route before authMiddleware)
- Modify: `apps/api/src/composition-root.ts` (register use case in `getServices()` return object)

- [ ] **Step 1: Create ValidateRegistrationTokenUseCase**

```typescript
// packages/application/src/use-cases/hospitals/validate-registration-token.use-case.ts
import { NotFoundError, ValidationError } from '@medical-crm/utils';
import type { IRegistrationTokenRepository, IHospitalManagementRepository } from '@medical-crm/domain';

export interface TokenValidationResult {
  hospitalName: string;
  hospitalNameEn: string | null;
  email: string;
  expiresAt: string;
}

export class ValidateRegistrationTokenUseCase {
  constructor(
    private readonly tokenRepo: IRegistrationTokenRepository,
    private readonly hospitalRepo: IHospitalManagementRepository,
  ) {}

  async execute(token: string): Promise<TokenValidationResult> {
    const regToken = await this.tokenRepo.findByToken(token);
    if (!regToken) throw new NotFoundError('Invalid registration link');
    if (regToken.usedAt) throw new ValidationError('This registration link has already been used');
    if (regToken.expiresAt < new Date()) throw new ValidationError('This registration link has expired');

    const hospital = await this.hospitalRepo.findFullById(regToken.hospitalId);
    if (!hospital) throw new NotFoundError('Hospital not found');

    return {
      hospitalName: hospital.name,
      hospitalNameEn: hospital.nameEn || null,
      email: regToken.email,
      expiresAt: regToken.expiresAt.toISOString(),
    };
  }
}
```

- [ ] **Step 2: Check that `IRegistrationTokenRepository` has `findByToken` method**

Look at the domain port and implementation. If `findByToken` doesn't exist, add it:

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
grep -n "findByToken" packages/domain/src/ports/registration-token-repository.port.ts
```

If missing, add to the port interface and the Drizzle repository implementation.

- [ ] **Step 3: Register use case in composition-root.ts**

In `apps/api/src/composition-root.ts`, the pattern is a `getServices()` function returning a lazy-initialized singleton typed as `AppServices`. Two changes needed:

**3a: Add to `AppServices` interface** (around line 177, alongside other hospital use cases):

```typescript
validateRegistrationToken: ValidateRegistrationTokenUseCase;
```

**3b: Add to `getServices()` factory** (inside the `_services = { ... }` object):

```typescript
import { ValidateRegistrationTokenUseCase } from '@medical-crm/application';

// Inside the _services object, alongside other hospital use cases:
validateRegistrationToken: new ValidateRegistrationTokenUseCase(
  registrationTokenRepo,
  hospitalManagementRepo,
),
```

Without adding the field to `AppServices`, `svc.validateRegistrationToken` in `index.ts` will fail TypeScript compilation.

- [ ] **Step 4: Add GET route as a PUBLIC route in `apps/api/src/index.ts`**

**CRITICAL:** This route must be public (no auth). In the current architecture, public routes are mounted in `apps/api/src/index.ts` **before** the `app.use('/api/v2/*', authMiddleware, ...)` line. The existing `POST /api/v2/auth/hospital/register` is already there as a reference.

Add the GET route right next to the existing POST route in `apps/api/src/index.ts`:

```typescript
// Public: validate hospital registration token (no auth required)
app.get('/api/v2/auth/hospital/register', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Token is required' }, 400);
  const svc = getServices();
  const result = await svc.validateRegistrationToken.execute(token);
  return c.json(result);
});
```

Do **NOT** add this to `hospitals.routes.ts` — that file is mounted after auth middleware and would block unauthenticated requests.

- [ ] **Step 5: Export from application index**

In `packages/application/src/index.ts`, add the export:

```typescript
export { ValidateRegistrationTokenUseCase } from './use-cases/hospitals/validate-registration-token.use-case.js';
export type { TokenValidationResult } from './use-cases/hospitals/validate-registration-token.use-case.js';
```

- [ ] **Step 6: Typecheck**

```bash
pnpm turbo typecheck --filter=@medical-crm/application --filter=@medical-crm/api
```

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/use-cases/hospitals/validate-registration-token.use-case.ts \
  packages/application/src/index.ts \
  apps/api/src/index.ts \
  apps/api/src/composition-root.ts
git commit -m "feat(auth): add GET /api/v2/auth/hospital/register for token validation"
```

---

### Task 4: Stub email sending in GenerateRegistrationTokenUseCase

Currently the use case only saves the token to DB. Add an email service call (stubbed for now) so the flow is complete. The actual email implementation (Resend/SES) can be filled in later.

**Files:**
- Create: `packages/domain/src/ports/email-service.port.ts` (if not exists)
- Modify: `packages/application/src/use-cases/hospitals/generate-registration-token.use-case.ts`
- Modify: `apps/api/src/composition-root.ts`

- [ ] **Step 1: Create or verify email service port**

Check if an email service port already exists:

```bash
grep -r "IEmailService\|EmailService" packages/domain/src/ports/ packages/application/src/
```

If not exists, create:

```typescript
// packages/domain/src/ports/email-service.port.ts
export interface IEmailService {
  sendHospitalInvitation(params: {
    to: string;
    hospitalName: string;
    registrationUrl: string;
  }): Promise<void>;
}
```

Export from domain index.

- [ ] **Step 2: Inject email service into GenerateRegistrationTokenUseCase**

```typescript
// packages/application/src/use-cases/hospitals/generate-registration-token.use-case.ts
import type { IEmailService } from '@medical-crm/domain';

export class GenerateRegistrationTokenUseCase {
  constructor(
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly tokenRepo: IRegistrationTokenRepository,
    private readonly emailService: IEmailService | null, // nullable for backward compat
  ) {}

  async execute(hospitalId: string, email: string, actor: Actor): Promise<{ token: string; expiresAt: string }> {
    // ... existing token creation logic ...

    await this.tokenRepo.save(token);

    // Send invitation email (best-effort, don't block on failure)
    if (this.emailService) {
      try {
        const registrationUrl = `${process.env.ADMIN_ORIGIN ?? 'http://localhost:3002'}/auth/hospital/register?token=${token.token}`;
        await this.emailService.sendHospitalInvitation({
          to: email,
          hospitalName: hospital.name,
          registrationUrl,
        });
      } catch (error) {
        // Log but don't fail — email sending is best-effort
        console.error('Failed to send hospital invitation email:', error);
      }
    }

    return { token: token.token, expiresAt: token.expiresAt.toISOString() };
  }
}
```

- [ ] **Step 3: Create stub email service implementation**

```typescript
// packages/infrastructure/services/stub-email.service.ts
import type { IEmailService } from '@medical-crm/domain';

export class StubEmailService implements IEmailService {
  async sendHospitalInvitation(params: {
    to: string;
    hospitalName: string;
    registrationUrl: string;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Hospital invitation to ${params.to} for ${params.hospitalName}: ${params.registrationUrl}`);
  }
}
```

- [ ] **Step 4: Export StubEmailService from infrastructure barrel**

Add to `packages/infrastructure/services/index.ts`:

```typescript
export { StubEmailService } from './stub-email.service.js';
```

Without this export, `composition-root.ts` cannot import the class.

- [ ] **Step 4b: Wire up in composition-root.ts**

Import `StubEmailService` from `@medical-crm/infrastructure/services` (the package uses subpath exports, not a root barrel — see existing imports in `composition-root.ts`):

```typescript
import { StubEmailService } from '@medical-crm/infrastructure/services';

// Inside getServices():
const emailService = new StubEmailService();
// Update the existing GenerateRegistrationTokenUseCase construction to add third arg:
generateRegistrationToken: new GenerateRegistrationTokenUseCase(
  hospitalManagementRepo,
  registrationTokenRepo,
  emailService,
),
```

- [ ] **Step 5: Fix tests that construct GenerateRegistrationTokenUseCase**

Search for all test files that instantiate `GenerateRegistrationTokenUseCase` and add `null` (or the stub service) as the third constructor argument:

```bash
grep -rn "GenerateRegistrationTokenUseCase" packages/application/src/ --include="*.test.*" --include="*.spec.*"
```

- [ ] **Step 6: Typecheck + test**

```bash
pnpm turbo typecheck
pnpm turbo test --filter=@medical-crm/application
```

- [ ] **Step 7: Commit**

```bash
git add -u
git add packages/domain/src/ports/email-service.port.ts \
  packages/infrastructure/services/stub-email.service.ts
git commit -m "feat(hospital): add email service stub to GenerateRegistrationTokenUseCase"
```

---

## Chunk 2: Admin Portal Infrastructure

### Task 5: Add dependencies + copy/adapt lib files from Hospital Portal

The admin app has auth skeleton but lacks React Query, api-fetch, query-fetch, route-handler-helpers, errors, session-helpers, and other lib files. Copy and adapt from hospital portal.

**Files:**
- Modify: `apps/admin/package.json`
- Create: `apps/admin/src/lib/api-fetch.ts` (copy from hospital, change session import)
- Create: `apps/admin/src/lib/query-client.ts` (copy from hospital)
- Create: `apps/admin/src/lib/query-provider.tsx` (copy from hospital)
- Create: `apps/admin/src/lib/query-fetch.ts` (copy from hospital)
- Create: `apps/admin/src/lib/errors.ts` (copy from hospital)
- Create: `apps/admin/src/lib/route-handler-helpers.ts` (copy from hospital)
- Create: `apps/admin/src/lib/session-helpers.ts` (adapted — Admin doesn't need hospitalId, may need admin-specific helpers)
- Create: `apps/admin/src/lib/auth-context.tsx` (adapted — Admin user has different shape)
- Create: `apps/admin/src/lib/api-types.ts` (Admin-specific DTOs)

- [ ] **Step 1: Add dependencies to package.json**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin
pnpm add @tanstack/react-query lucide-react framer-motion @medical-crm/validation
```

- [ ] **Step 2: Copy lib files from hospital portal**

Copy these files verbatim (they use only relative imports to `./session`, `./errors`, etc.):

```bash
cp apps/hospital/src/lib/api-fetch.ts apps/admin/src/lib/api-fetch.ts
cp apps/hospital/src/lib/query-client.ts apps/admin/src/lib/query-client.ts
cp apps/hospital/src/lib/query-provider.tsx apps/admin/src/lib/query-provider.tsx
cp apps/hospital/src/lib/query-fetch.ts apps/admin/src/lib/query-fetch.ts
cp apps/hospital/src/lib/errors.ts apps/admin/src/lib/errors.ts
cp apps/hospital/src/lib/route-handler-helpers.ts apps/admin/src/lib/route-handler-helpers.ts
```

These files import from `./session` and `./keycloak-client` which already exist in admin.

- [ ] **Step 3: Copy `keycloak-client.ts` from hospital and add `saveSession` to admin's `session.ts`**

The copied `api-fetch.ts` imports `{ getSession, saveSession }` from `./session` and `{ refreshAccessToken }` from `./keycloak-client`. Admin's session.ts only exports `getSession` and `clearSession` — it does NOT have `saveSession`. Admin also has NO `keycloak-client.ts`.

**3a: Copy keycloak-client.ts:**

```bash
cp apps/hospital/src/lib/keycloak-client.ts apps/admin/src/lib/keycloak-client.ts
```

Verify the file imports (it likely reads env vars like `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` — these should already be in admin's `.env`).

**3b: Add `saveSession` to admin's `session.ts`:**

Read `apps/hospital/src/lib/session.ts` to see how `saveSession` is implemented (it calls `session.save()` after mutating token fields). Add the same function to admin's session.ts:

```typescript
export async function saveSession(data: Omit<SessionData, 'code_verifier'>): Promise<void> {
  const session = await getSession();
  Object.assign(session, data);
  await session.save();
}
```

**3c: Verify imports compile:**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
```

- [ ] **Step 4: Create auth-context.tsx**

```typescript
// apps/admin/src/lib/auth-context.tsx
'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';

interface AdminUser {
  id: string;
  email: string;
  roles: string[];
}

interface AuthContextValue {
  user: AdminUser;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: AdminUser;
  children: ReactNode;
}) {
  const logout = useCallback(async () => {
    window.location.href = '/auth/logout';
  }, []);

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 5: Create api-types.ts with Admin-specific DTO types**

```typescript
// apps/admin/src/lib/api-types.ts

// Re-export shared types and define Admin-specific response shapes
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface DashboardData {
  stats: {
    totalCases: number;
    unassignedCases: number;
    assignedCases: number;
    openTickets: number;
    pendingOrders: number;
  };
  recentCases: Array<{
    id: string;
    caseNumber: string;
    assignmentStatus: string;
    createdAt: string;
  }>;
}

export interface CaseSummary {
  id: string;
  caseNumber: string;
  patientName: string;
  status: string;
  assignmentStatus: string;
  treatmentStage: string;
  createdAt: string;
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

export interface HospitalSummary {
  id: string;
  name: string;
  nameEn: string | null;
  type: string;
  status: string;
  specialties: string[] | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  createdAt: string;
}

// Add more types as needed in subsequent tasks
```

- [ ] **Step 6: Typecheck admin app**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
```

Fix any issues.

- [ ] **Step 7: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add apps/admin/package.json apps/admin/src/lib/
git commit -m "feat(admin): add lib infrastructure (query, api-fetch, auth-context, types)"
```

---

### Task 6: Admin Shell (layout + sidebar + topbar)

**Files:**
- Modify: `apps/admin/src/app/layout.tsx` (add Tailwind CSS import + global styles)
- Create: `apps/admin/src/app/(portal)/layout.tsx` (auth check + providers)
- Create: `apps/admin/src/components/admin-shell.tsx` (sidebar + topbar)
- Create: `apps/admin/src/app/globals.css` (Tailwind base)

- [ ] **Step 1: Create globals.css with Tailwind v4**

```css
/* apps/admin/src/app/globals.css */
@import "tailwindcss";
@import "@medical-crm/ui/theme";
```

Check how hospital portal imports Tailwind. Match the same pattern.

```bash
cat apps/hospital/src/app/globals.css
```

- [ ] **Step 2: Update root layout.tsx**

```typescript
// apps/admin/src/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Medora Admin',
  description: 'Medical CRM Admin Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create (portal)/layout.tsx**

Reference hospital's `apps/hospital/src/app/(portal)/layout.tsx` for the auth check + JWT decode pattern:

```typescript
// apps/admin/src/app/(portal)/layout.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AuthProvider } from '@/lib/auth-context';
import { QueryProvider } from '@/lib/query-provider';
import { AdminShell } from '@/components/admin-shell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.access_token) redirect('/auth/login');

  // Decode user info from JWT
  let user = { id: '', email: '', roles: [] as string[] };
  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split('.')[1] ?? '', 'base64url').toString(),
    );
    user = {
      id: payload.sub ?? '',
      email: payload.email ?? '',
      roles: payload.realm_access?.roles ?? [],
    };
  } catch { /* proceed with empty user */ }

  return (
    <AuthProvider user={user}>
      <QueryProvider>
        <AdminShell>{children}</AdminShell>
      </QueryProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Create AdminShell component**

```typescript
// apps/admin/src/components/admin-shell.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { SidebarNav, type NavItem } from '@medical-crm/ui';
import { LayoutDashboard, FolderOpen, Building2, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

// SidebarNav requires: { key, label, icon: ReactNode, href }
// icon must be a ReactNode (JSX element), not a component reference
const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', icon: <LayoutDashboard className="h-5 w-5" />, label: 'Dashboard', href: '/' },
  { key: 'cases', icon: <FolderOpen className="h-5 w-5" />, label: 'Cases', href: '/cases' },
  { key: 'hospitals', icon: <Building2 className="h-5 w-5" />, label: 'Hospitals', href: '/hospitals' },
];

function getActiveKey(pathname: string): string {
  if (pathname.startsWith('/cases')) return 'cases';
  if (pathname.startsWith('/hospitals')) return 'hospitals';
  return 'dashboard';
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen">
      {/* Sidebar — SidebarNav is 72px fixed width */}
      <SidebarNav
        items={NAV_ITEMS}
        activeKey={getActiveKey(pathname)}
        onNavigate={(href) => router.push(href)}
      />

      {/* Main content — offset by sidebar width */}
      <div className="ml-[72px] flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b bg-white px-6">
          <h1 className="text-sm font-semibold text-gray-600">Admin Portal</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + verify dev server**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
cd apps/admin && pnpm dev
```

Open `http://localhost:3002` — should redirect to Keycloak login. After login, should show sidebar + topbar shell.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/globals.css \
  apps/admin/src/app/layout.tsx \
  apps/admin/src/app/\(portal\)/layout.tsx \
  apps/admin/src/components/admin-shell.tsx
git commit -m "feat(admin): add Admin Shell with sidebar, topbar, and auth integration"
```

---

### Task 7: BFF route handlers foundation

Set up the initial BFF routes that Phase A pages will use. Follow the hospital portal pattern: Route Handlers proxy to backend API using `createQueryHandler` / `createParamQueryHandler`.

**Files:**
- Create: `apps/admin/src/app/api/dashboard/route.ts`
- Create: `apps/admin/src/app/api/cases/route.ts`
- Create: `apps/admin/src/app/api/cases/stats/route.ts`
- Create: `apps/admin/src/app/api/cases/[id]/route.ts`
- Create: `apps/admin/src/app/api/hospitals/route.ts`
- Create: `apps/admin/src/app/api/hospitals/[id]/route.ts`
- Create: `apps/admin/src/app/api/hospitals/[id]/cases/route.ts`
- Create: `apps/admin/src/app/api/hospitals/[id]/registration-token/route.ts`

- [ ] **Step 1: Create BFF routes**

Each route is a one-liner using the factory helpers. Example pattern:

```typescript
// apps/admin/src/app/api/dashboard/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler(() => '/api/v2/admin/dashboard');

// apps/admin/src/app/api/cases/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler((p) => `/api/v2/cases?${p}`);

// apps/admin/src/app/api/cases/stats/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler(() => '/api/v2/cases/stats');

// apps/admin/src/app/api/cases/[id]/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/cases/${id}`);

// apps/admin/src/app/api/hospitals/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler((p) => `/api/v2/hospitals?${p}`);

// apps/admin/src/app/api/hospitals/[id]/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/hospitals/${id}`);

// apps/admin/src/app/api/hospitals/[id]/cases/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }, p) => `/api/v2/hospitals/${id}/cases?${p}`);
```

- [ ] **Step 2: Create registration-token POST BFF route**

This is a mutation, so use `apiFetch` directly (not the query handler factory):

```typescript
// apps/admin/src/app/api/hospitals/[id]/registration-token/route.ts
import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = await request.json();

  const res = await apiFetch(`/api/v2/hospitals/${id}/registration-token`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/api/
git commit -m "feat(admin): add BFF route handlers for dashboard, cases, hospitals"
```

---

## Chunk 3: Phase A — Dashboard + Cases

### Task 8: Dashboard page

**Files:**
- Create: `apps/admin/src/app/(portal)/page.tsx`
- Create: `apps/admin/src/components/dashboard-widgets.tsx`
- Create: `apps/admin/src/queries/use-dashboard.ts`

- [ ] **Step 1: Create dashboard query hook**

```typescript
// apps/admin/src/queries/use-dashboard.ts
import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { DashboardData } from '@/lib/api-types';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => queryFetch<DashboardData>('/api/dashboard'),
  });
}
```

- [ ] **Step 2: Create dashboard-widgets.tsx**

```typescript
// apps/admin/src/components/dashboard-widgets.tsx
'use client';

import Link from 'next/link';
import { StatCard, DataTable, Button, LoadingSpinner } from '@medical-crm/ui';
import { FolderOpen, FolderX, Building2, Ticket, ShoppingCart } from 'lucide-react';
import { useDashboard } from '@/queries/use-dashboard';

export function DashboardWidgets() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) return <LoadingSpinner />;
  if (error || !data) return <p className="text-red-500">Failed to load dashboard</p>;

  const { stats, recentCases } = data;

  return (
    <div className="space-y-6">
      {/* Stat cards — icon prop must be ReactNode (JSX element) */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard icon={<FolderOpen className="h-6 w-6" />} label="Total Cases" value={stats.totalCases} />
        <StatCard icon={<FolderX className="h-6 w-6" />} label="Unassigned" value={stats.unassignedCases} colorClass="text-amber-600 bg-amber-50" />
        <StatCard icon={<FolderOpen className="h-6 w-6" />} label="Assigned" value={stats.assignedCases} colorClass="text-green-600 bg-green-50" />
        <StatCard icon={<Ticket className="h-6 w-6" />} label="Open Tickets" value={stats.openTickets} colorClass="text-blue-600 bg-blue-50" />
        <StatCard icon={<ShoppingCart className="h-6 w-6" />} label="Pending Orders" value={stats.pendingOrders} colorClass="text-purple-600 bg-purple-50" />
      </div>

      {/* Recent cases table — Column.render receives full row, keyExtractor required */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent Cases</h2>
        <DataTable
          columns={[
            { key: 'caseNumber', header: 'Case #', render: (row) => <span>{row.caseNumber}</span> },
            { key: 'assignmentStatus', header: 'Status', render: (row) => <StatusBadge status={row.assignmentStatus} /> },
            { key: 'createdAt', header: 'Created', render: (row) => <span>{new Date(row.createdAt).toLocaleDateString()}</span> },
          ]}
          data={recentCases}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => { window.location.href = `/cases/${row.id}`; }}
        />
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link href="/cases"><Button>View All Cases</Button></Link>
        <Link href="/hospitals"><Button variant="outline">View All Hospitals</Button></Link>
      </div>
    </div>
  );
}
```

> **Note:** Check `StatCard` and `DataTable` prop interfaces from `@medical-crm/ui`. The `columns` and `icon` prop shapes may differ. Read the source and adapt.

- [ ] **Step 3: Create page.tsx**

```typescript
// apps/admin/src/app/(portal)/page.tsx
import { PageHeader } from '@medical-crm/ui';
import { DashboardWidgets } from '@/components/dashboard-widgets';

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <DashboardWidgets />
    </>
  );
}
```

- [ ] **Step 4: Typecheck + verify**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
```

Start dev server and verify Dashboard renders with stat cards + recent cases table.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/\(portal\)/page.tsx \
  apps/admin/src/components/dashboard-widgets.tsx \
  apps/admin/src/queries/use-dashboard.ts
git commit -m "feat(admin): add Dashboard page with stat cards and recent cases"
```

---

### Task 9: Cases list page

**Files:**
- Create: `apps/admin/src/app/(portal)/cases/page.tsx`
- Create: `apps/admin/src/components/cases-list.tsx`
- Create: `apps/admin/src/queries/use-cases.ts`

- [ ] **Step 1: Create cases query hooks**

```typescript
// apps/admin/src/queries/use-cases.ts
import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { PaginatedResponse, CaseSummary, CaseStats } from '@/lib/api-types';

export function useCases(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['cases', filters],
    queryFn: () => queryFetch<PaginatedResponse<CaseSummary>>(`/api/cases?${new URLSearchParams(filters)}`),
  });
}

export function useCaseStats() {
  return useQuery({
    queryKey: ['cases', 'stats'],
    queryFn: () => queryFetch<CaseStats>('/api/cases/stats'),
  });
}

export function useCase(id: string) {
  return useQuery({
    queryKey: ['cases', id],
    queryFn: () => queryFetch<Record<string, unknown>>(`/api/cases/${id}`),
    enabled: !!id,
  });
}
```

- [ ] **Step 2: Create cases-list.tsx**

Client component with:
- 7 stat cards from `useCaseStats()` (total, unassigned, assigned, inTreatment, postTreatment, completed, followUp)
- Filter bar: search input + assignmentStatus dropdown + treatmentStage dropdown
- DataTable with columns: caseNumber, patientName, status (Badge), stage, assignmentStatus, createdAt
- "New Case" button linking to `/cases/new`
- Row click navigates to `/cases/[id]`

Reference hospital portal's `cases-list.tsx` for patterns. Key differences:
- Admin has stat cards (hospital doesn't)
- Admin has "New Case" button
- Admin sees all cases (no hospitalId filter)

- [ ] **Step 3: Create page.tsx**

```typescript
// apps/admin/src/app/(portal)/cases/page.tsx
import { PageHeader } from '@medical-crm/ui';
import { CasesList } from '@/components/cases-list';

export default function CasesPage() {
  return (
    <>
      <PageHeader title="Cases" />
      <CasesList />
    </>
  );
}
```

- [ ] **Step 4: Typecheck + verify**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/\(portal\)/cases/page.tsx \
  apps/admin/src/components/cases-list.tsx \
  apps/admin/src/queries/use-cases.ts
git commit -m "feat(admin): add Cases list page with stats, filters, and table"
```

---

### Task 10: New Case form

**Files:**
- Create: `apps/admin/src/app/(portal)/cases/new/page.tsx`
- Create: `apps/admin/src/actions/case-actions.ts`

- [ ] **Step 1: Create case server actions**

```typescript
// apps/admin/src/actions/case-actions.ts
'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function createCase(data: {
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  patientCountry?: string;
  patientLanguage?: string;
  primaryDiagnosis?: string;
}) {
  const res = await apiFetch('/api/v2/cases', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Failed to create case' }));
    throw new Error(error.message || 'Failed to create case');
  }

  revalidatePath('/cases');
  return res.json();
}
```

- [ ] **Step 2: Create New Case page**

Check the `createCaseSchema` (in `packages/shared/validation/src/case.schema.ts`) for the exact fields the API accepts. Build the form with those fields.

The page should be a client component with a form, validation, and submission that calls `createCase()` action, then redirects to `/cases/[newId]` on success.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
git add apps/admin/src/app/\(portal\)/cases/new/ apps/admin/src/actions/case-actions.ts
git commit -m "feat(admin): add New Case form (temporary entry point)"
```

---

### Task 11: Case Detail shell (Overview + Medical Intake tabs)

This is the most complex page. Start with the tab shell + Overview tab + Medical Intake tab. The remaining 8 tabs will be added in Phase B.

**Files:**
- Create: `apps/admin/src/app/(portal)/cases/[id]/page.tsx`
- Create: `apps/admin/src/components/case-detail-tabs.tsx` (tab shell)
- Create: `apps/admin/src/components/tabs/case-overview-tab.tsx`
- Create: `apps/admin/src/components/tabs/case-intake-tab.tsx`
- Add BFF routes: `apps/admin/src/app/api/cases/[id]/documents/route.ts`, `apps/admin/src/app/api/cases/[id]/questionnaire/route.ts`

- [ ] **Step 1: Add BFF routes for documents and questionnaire**

```typescript
// apps/admin/src/app/api/cases/[id]/documents/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/cases/${id}/documents`);

// apps/admin/src/app/api/cases/[id]/questionnaire/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/cases/${id}/questionnaire`);
```

- [ ] **Step 2: Add case detail query hooks**

Extend `apps/admin/src/queries/use-cases.ts`:

```typescript
export function useCaseDocuments(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'documents'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/documents`),
    enabled: !!caseId,
  });
}

export function useCaseQuestionnaire(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'questionnaire'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/questionnaire`),
    enabled: !!caseId,
  });
}
```

- [ ] **Step 3: Create case-detail-tabs.tsx**

Tab shell with 10 tabs. Only render Overview + Medical Intake content initially. Other tabs show placeholder "Coming soon" or import stubs.

Use `Tabs` from `@medical-crm/ui`. Each tab content is a lazy-loaded client component.

```typescript
// apps/admin/src/components/case-detail-tabs.tsx
'use client';

import { useState } from 'react';
import { Tabs } from '@medical-crm/ui';
import { CaseOverviewTab } from './tabs/case-overview-tab';
import { CaseIntakeTab } from './tabs/case-intake-tab';

// Tabs requires TabItem: { key, label, count? }
const TAB_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'quotes', label: 'Multi-Hospital Quotes' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'messages', label: 'Messages' },
  { key: 'intake', label: 'Medical Intake' },
  { key: 'journey', label: 'Journey' },
  { key: 'consultations', label: 'Consultations' },
  { key: 'orders', label: 'Orders' },
  { key: 'support', label: 'Support' },
  { key: 'ai-summary', label: 'AI Summary' },
];

export function CaseDetailTabs({ caseId, caseData }: { caseId: string; caseData: Record<string, unknown> }) {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div>
      <Tabs items={TAB_ITEMS} activeKey={activeTab} onChange={setActiveTab} />
      <div className="mt-4">
        {activeTab === 'overview' && <CaseOverviewTab caseId={caseId} caseData={caseData} />}
        {activeTab === 'intake' && <CaseIntakeTab caseId={caseId} />}
        {/* Phase B tabs — placeholder */}
        {!['overview', 'intake'].includes(activeTab) && (
          <p className="py-8 text-center text-gray-400">This tab will be implemented in Phase B.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create case-overview-tab.tsx**

Overview tab with:
- Patient info card (name, country, language, primaryDiagnosis, riskLevel, assignmentStatus, treatmentStage)
- Status actions: stage advance button (`PATCH /cases/{id}/stage`), status dropdown (`PATCH /cases/{id}/status`)
- Documents list + upload + delete

Reference spec §Tab 1 for exact fields and APIs.

- [ ] **Step 5: Create case-intake-tab.tsx**

Medical Intake tab — readonly questionnaire display.

Reference hospital portal's `case-detail-panel.tsx` Intake tab section. The display structure has 6 steps:
1. Symptom Overview
2. Detailed Symptoms
3. Medical History
4. Medications & Allergies
5. Tests & Expectations
6. Summary & Assessment

This component will later be extracted to shared (Task 16), but for now implement directly.

- [ ] **Step 6: Create page.tsx**

```typescript
// apps/admin/src/app/(portal)/cases/[id]/page.tsx
import { PageHeader, StatusBadge } from '@medical-crm/ui';
import { CaseDetailTabs } from '@/components/case-detail-tabs';
import { apiFetch } from '@/lib/api-fetch';
import { redirect } from 'next/navigation';

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/api/v2/cases/${id}`);

  if (!res.ok) {
    if (res.status === 404) redirect('/cases');
    throw new Error('Failed to load case');
  }

  const caseData = await res.json();

  return (
    <>
      <PageHeader
        title={`Case ${caseData.caseNumber}`}
        subtitle={caseData.patientName}
      />
      <CaseDetailTabs caseId={id} caseData={caseData} />
    </>
  );
}
```

- [ ] **Step 7: Add case actions for status/stage updates + document upload**

Extend `apps/admin/src/actions/case-actions.ts` with:
- `updateCaseStatus(caseId, status)`
- `updateCaseStage(caseId, stage)`
- `uploadDocument(caseId, formData)`
- `deleteDocument(caseId, docId)`

All follow the same pattern: `apiFetch` + `revalidatePath`.

- [ ] **Step 8: Typecheck + verify**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
```

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/app/\(portal\)/cases/\[id\]/ \
  apps/admin/src/components/case-detail-tabs.tsx \
  apps/admin/src/components/tabs/ \
  apps/admin/src/app/api/cases/\[id\]/ \
  apps/admin/src/queries/use-cases.ts \
  apps/admin/src/actions/case-actions.ts
git commit -m "feat(admin): add Case Detail page with Overview + Medical Intake tabs"
```

---

## Chunk 4: Phase A — Hospitals + Registration

### Task 12: Hospitals list page

**Files:**
- Create: `apps/admin/src/app/(portal)/hospitals/page.tsx`
- Create: `apps/admin/src/components/hospitals-list.tsx`
- Create: `apps/admin/src/queries/use-hospitals.ts`

- [ ] **Step 1: Create hospitals query hooks**

```typescript
// apps/admin/src/queries/use-hospitals.ts
import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { PaginatedResponse, HospitalSummary } from '@/lib/api-types';

export function useHospitals(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['hospitals', filters],
    queryFn: () => queryFetch<PaginatedResponse<HospitalSummary>>(`/api/hospitals?${new URLSearchParams(filters)}`),
  });
}

export function useHospital(id: string) {
  return useQuery({
    queryKey: ['hospitals', id],
    queryFn: () => queryFetch<HospitalSummary>(`/api/hospitals/${id}`),
    enabled: !!id,
  });
}

export function useHospitalCases(hospitalId: string, filters: Record<string, string> = {}) {
  return useQuery({
    queryKey: ['hospitals', hospitalId, 'cases', filters],
    queryFn: () => queryFetch<PaginatedResponse<Record<string, unknown>>>(`/api/hospitals/${hospitalId}/cases?${new URLSearchParams(filters)}`),
    enabled: !!hospitalId,
  });
}
```

- [ ] **Step 2: Create hospitals-list.tsx**

Client component with:
- Filter bar: search input + type dropdown (COSMETIC/REGULAR) + status dropdown (PENDING/ACTIVE/INACTIVE)
- DataTable: name, type Badge, status Badge, specialties (tags), createdAt
- "New Hospital" button → `/hospitals/new`
- Row click → `/hospitals/[id]`

- [ ] **Step 3: Create page.tsx**

```typescript
// apps/admin/src/app/(portal)/hospitals/page.tsx
import { PageHeader } from '@medical-crm/ui';
import { HospitalsList } from '@/components/hospitals-list';

export default function HospitalsPage() {
  return (
    <>
      <PageHeader title="Hospitals" />
      <HospitalsList />
    </>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
git add apps/admin/src/app/\(portal\)/hospitals/page.tsx \
  apps/admin/src/components/hospitals-list.tsx \
  apps/admin/src/queries/use-hospitals.ts
git commit -m "feat(admin): add Hospitals list page with filters and table"
```

---

### Task 13: Hospital Detail page

**Files:**
- Create: `apps/admin/src/app/(portal)/hospitals/[id]/page.tsx`
- Create: `apps/admin/src/components/hospital-detail.tsx`
- Create: `apps/admin/src/components/hospital-review.tsx`
- Create: `apps/admin/src/actions/hospital-actions.ts`

- [ ] **Step 1: Create hospital server actions**

```typescript
// apps/admin/src/actions/hospital-actions.ts
'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function updateHospitalStatus(hospitalId: string, status: string) {
  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update hospital status');
  }
  revalidatePath(`/hospitals/${hospitalId}`);
  revalidatePath('/hospitals');
  return res.json();
}

export async function generateRegistrationToken(hospitalId: string, email: string) {
  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/registration-token`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to generate registration token');
  }
  return res.json();
}

export async function createHospital(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/hospitals', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to create hospital');
  }
  revalidatePath('/hospitals');
  return res.json();
}
```

- [ ] **Step 2: Create hospital-review.tsx**

Component for status management section. Follows spec §3.5 宣传材料审核:

```typescript
// apps/admin/src/components/hospital-review.tsx
'use client';

import { useState } from 'react';
import { StatusBadge, Button, ConfirmDialog } from '@medical-crm/ui';
import { updateHospitalStatus } from '@/actions/hospital-actions';

// Status transitions following domain state machine HOSPITAL_STATUS_TRANSITIONS:
// PENDING → ACTIVE only
// ACTIVE → INACTIVE only
// INACTIVE → ACTIVE only
const STATUS_ACTIONS: Record<string, { label: string; target: string; variant: string; confirm?: string }> = {
  PENDING: { label: 'Approve', target: 'ACTIVE', variant: 'default' },
  ACTIVE: { label: 'Deactivate', target: 'INACTIVE', variant: 'destructive', confirm: 'Are you sure you want to deactivate this hospital?' },
  INACTIVE: { label: 'Reactivate', target: 'ACTIVE', variant: 'default' },
};

export function HospitalReview({ hospitalId, status }: { hospitalId: string; status: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const action = STATUS_ACTIONS[status];

  if (!action) return null;

  const handleAction = async () => {
    setIsLoading(true);
    try {
      await updateHospitalStatus(hospitalId, action.target);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setIsLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <StatusBadge status={status} />
      <Button
        onClick={() => action.confirm ? setShowConfirm(true) : handleAction()}
        disabled={isLoading}
      >
        {action.label}
      </Button>
      {action.confirm && (
        <ConfirmDialog
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleAction}
          title="Confirm Action"
          message={action.confirm}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create hospital-detail.tsx**

Client component showing:
- Basic info card (name, type, address, city, phone, email, description)
- Specialties badges
- Status review section (HospitalReview component)
- Registration link management ("Regenerate Token" button → modal with email input → `generateRegistrationToken()`)
- Associated cases table (`useHospitalCases()`)

- [ ] **Step 4: Create page.tsx**

```typescript
// apps/admin/src/app/(portal)/hospitals/[id]/page.tsx
import { HospitalDetail } from '@/components/hospital-detail';

export default async function HospitalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HospitalDetail hospitalId={id} />;
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
git add apps/admin/src/app/\(portal\)/hospitals/\[id\]/ \
  apps/admin/src/components/hospital-detail.tsx \
  apps/admin/src/components/hospital-review.tsx \
  apps/admin/src/actions/hospital-actions.ts
git commit -m "feat(admin): add Hospital Detail page with status review and registration link"
```

---

### Task 14: BFF specialties route + New Hospital form

**Files:**
- Create: `apps/admin/src/app/api/specialties/route.ts`
- Create: `apps/admin/src/app/(portal)/hospitals/new/page.tsx`
- Create: `apps/admin/src/components/new-hospital-form.tsx`
- Create: `apps/admin/src/queries/use-specialties.ts`

- [ ] **Step 1: Create BFF specialties route**

This route queries Supabase directly (not the backend API) for specialty options:

```typescript
// apps/admin/src/app/api/specialties/route.ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const REGULAR_DEPARTMENTS = [
  'Cardiology', 'Oncology', 'Orthopedics', 'Neurology', 'Dermatology',
  'Ophthalmology', 'ENT', 'Urology', 'Gynecology', 'Pediatrics',
  'Gastroenterology', 'Pulmonology', 'Endocrinology', 'Nephrology',
  'Rheumatology', 'Hematology', 'Radiology', 'Psychiatry',
];

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');

  if (type === 'REGULAR') {
    return Response.json({ specialties: REGULAR_DEPARTMENTS });
  }

  if (type === 'COSMETIC') {
    // Query main Supabase for procedures
    const supabaseUrl = process.env.MAIN_SUPABASE_URL;
    const supabaseKey = process.env.MAIN_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return Response.json({ specialties: [] });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase
      .from('procedures')
      .select('name, category')
      .order('category');

    const specialties = (data ?? []).map((p) => p.name);
    return Response.json({ specialties });
  }

  return Response.json({ error: 'type parameter required (COSMETIC or REGULAR)' }, { status: 400 });
}
```

> **Note:** Check environment variable names for Main Supabase. Look at how the hospital portal or API server references Supabase credentials and match those names.

- [ ] **Step 2: Create specialties query hook**

```typescript
// apps/admin/src/queries/use-specialties.ts
import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useSpecialties(type: string) {
  return useQuery({
    queryKey: ['specialties', type],
    queryFn: () => queryFetch<{ specialties: string[] }>(`/api/specialties?type=${type}`),
    enabled: !!type,
  });
}
```

- [ ] **Step 3: Create new-hospital-form.tsx**

Client component implementing the one-step creation flow from spec §3.6:

Form fields:
1. Hospital name (required)
2. Type selector: COSMETIC / REGULAR (required, triggers specialty list reload)
3. Address (optional)
4. City (optional, recommended for REGULAR)
5. Phone (optional)
6. Email (required)
7. Description (optional)
8. Specialties multi-select (required, min 1, options from `useSpecialties(type)`)

On submit:
1. `POST /api/v2/hospitals` → get `hospitalId`
2. `POST /api/v2/hospitals/{id}/registration-token` body: `{ email }` → get token
3. Success toast → redirect to `/hospitals/{hospitalId}`

Error handling per spec:
- Step 1 fails → show error
- Step 2 fails → show "Hospital created, but token generation failed" → redirect to detail page

- [ ] **Step 4: Create page.tsx**

```typescript
// apps/admin/src/app/(portal)/hospitals/new/page.tsx
import { PageHeader } from '@medical-crm/ui';
import { NewHospitalForm } from '@/components/new-hospital-form';

export default function NewHospitalPage() {
  return (
    <>
      <PageHeader title="New Hospital" />
      <NewHospitalForm />
    </>
  );
}
```

- [ ] **Step 5: Add @supabase/supabase-js dependency if not installed**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin
pnpm add @supabase/supabase-js
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
git add apps/admin/src/app/api/specialties/ \
  apps/admin/src/app/\(portal\)/hospitals/new/ \
  apps/admin/src/components/new-hospital-form.tsx \
  apps/admin/src/queries/use-specialties.ts \
  apps/admin/package.json
git commit -m "feat(admin): add New Hospital form with one-step creation + specialties"
```

---

### Task 15: Hospital Registration page (public)

**Depends on:** Task 3 (GET token validation API), Task 4 (email sending)

**Files:**
- Create: `apps/admin/src/app/auth/hospital/register/page.tsx`
- Create: `apps/admin/src/app/api/auth/hospital/register/route.ts`

- [ ] **Step 1: Create BFF route for token validation**

```typescript
// apps/admin/src/app/api/auth/hospital/register/route.ts
import { NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// Public endpoint — no auth required
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return Response.json({ error: 'Token required' }, { status: 400 });

  const res = await fetch(`${API_URL}/api/v2/auth/hospital/register?token=${token}`);
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${API_URL}/api/v2/auth/hospital/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const responseBody = await res.text();
  return new Response(responseBody, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}
```

> **Note:** These BFF routes do NOT use `apiFetch` since they're public (no auth token needed).

- [ ] **Step 2: Update middleware to exclude registration page**

In `apps/admin/src/middleware.ts`, add `/auth/hospital/register` to the excluded paths:

```typescript
// Update the matcher or conditional logic to also exclude:
// /auth/hospital/register
// /api/auth/hospital/register
```

- [ ] **Step 3: Create registration page**

Reference v1's `medical-crm/app/auth/hospital/register/page.tsx` for the UI pattern. The page should:

1. Be a client component (`'use client'`)
2. On mount: extract `token` from URL query params, call `GET /api/auth/hospital/register?token=xxx`
3. If valid: show form with hospital name + email (readonly) + username + password + confirm password
4. If invalid: show error card (expired / used / invalid)
5. On submit: `POST /api/auth/hospital/register` with `{ token, username, password }`
6. On success: show success message, redirect to Hospital Portal login after 3s
7. Styling: standalone page (no AdminShell), centered card, teal/emerald gradient background, Medora logo

```typescript
// apps/admin/src/app/auth/hospital/register/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// States: 'loading' | 'form' | 'success' | 'error'
// ... implement following v1 page pattern
```

- [ ] **Step 4: Typecheck + test manually**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
```

Test by generating a token via admin API, then visiting `http://localhost:3002/auth/hospital/register?token=xxx`.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/auth/hospital/register/ \
  apps/admin/src/app/api/auth/hospital/register/ \
  apps/admin/src/middleware.ts
git commit -m "feat(admin): add Hospital Registration page (public, token-based)"
```

---

## Chunk 5: Shared Component Extraction + Phase B Tabs Part 1

### Task 16: Extract QuestionnaireReadonlyView to shared

Extract the medical intake display logic from hospital portal's `case-detail-panel.tsx` into a reusable shared component.

**Files:**
- Create: `packages/shared/ui/src/components/questionnaire-readonly-view.tsx`
- Modify: `packages/shared/ui/src/index.ts` (export new component)
- Modify: `apps/hospital/src/components/case-detail-panel.tsx` (import from shared)
- Modify: `apps/admin/src/components/tabs/case-intake-tab.tsx` (import from shared)

- [ ] **Step 1: Extract component**

Read `apps/hospital/src/components/case-detail-panel.tsx` and identify the Intake tab rendering section (Step 1-6 of the questionnaire display). Extract it into:

```typescript
// packages/shared/ui/src/components/questionnaire-readonly-view.tsx
// Props: { data: MedicalIntakeData | null }
// MedicalIntakeData has 5 optional steps (step1-step5), displayed as 6 UI sections:
//   1. Symptom Overview (from step1)
//   2. Detailed Symptoms (from step2)
//   3. Medical History (from step3)
//   4. Medications & Allergies (from step4)
//   5. Tests & Expectations (from step5)
//   6. Summary & Assessment (aggregated from all steps)
// Uses: Card, StatusBadge from the same package
```

The component should be pure presentation — takes data as props, renders read-only display. No API calls.

- [ ] **Step 2: Export from shared/ui**

Add to `packages/shared/ui/src/index.ts`:

```typescript
export { QuestionnaireReadonlyView } from './components/questionnaire-readonly-view';
```

- [ ] **Step 3: Update hospital portal to use shared component**

Replace inline intake rendering in `case-detail-panel.tsx` with `<QuestionnaireReadonlyView data={caseData.medicalIntake} />`.

- [ ] **Step 4: Update admin intake tab**

```typescript
// apps/admin/src/components/tabs/case-intake-tab.tsx
import { QuestionnaireReadonlyView, EmptyState } from '@medical-crm/ui';
import { useCaseQuestionnaire } from '@/queries/use-cases';

export function CaseIntakeTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useCaseQuestionnaire(caseId);
  if (isLoading) return <div>Loading...</div>;
  if (!data) return <EmptyState title="No questionnaire data" />;
  return <QuestionnaireReadonlyView data={data} />;
}
```

- [ ] **Step 5: Typecheck both apps**

```bash
pnpm turbo typecheck --filter=@medical-crm/ui --filter=@medical-crm/admin --filter=@medical-crm/hospital
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/ui/src/components/questionnaire-readonly-view.tsx \
  packages/shared/ui/src/index.ts \
  apps/hospital/src/components/case-detail-panel.tsx \
  apps/admin/src/components/tabs/case-intake-tab.tsx
git commit -m "refactor: extract QuestionnaireReadonlyView to shared/ui for admin+hospital reuse"
```

---

### Task 17: Multi-Hospital Quotes Tab (B1)

**Files:**
- Create: `apps/admin/src/components/tabs/case-quotes-tab.tsx`
- Create: `apps/admin/src/components/quote-comparison.tsx`
- Add BFF routes: `apps/admin/src/app/api/cases/[id]/hospital-contacts/route.ts`, `apps/admin/src/app/api/cases/[id]/quotes/compare/route.ts`
- Add query hooks to `use-cases.ts`
- Add server actions for hospital-contact operations

- [ ] **Step 1: Add BFF routes**

```typescript
// hospital-contacts — createParamQueryHandler receives (params, searchParams)
export const GET = createParamQueryHandler(({ id }, p) => `/api/v2/cases/${id}/hospital-contacts?${p}`);

// quotes/compare
export const GET = createParamQueryHandler(({ id }, p) => `/api/v2/cases/${id}/quotes/compare?${p}`);
```

Also add POST route for adding hospital-contacts and POST for remind/remove operations.

- [ ] **Step 2: Add query hooks**

```typescript
export function useCaseHospitalContacts(caseId: string) { /* ... */ }
export function useCaseQuotesCompare(caseId: string) { /* ... */ }
```

- [ ] **Step 3: Create quote-comparison.tsx**

Table showing side-by-side hospital quotes: hospital name, items, amounts, total. Read-only — no accept/reject buttons (these are Patient operations per spec §Tab 2).

- [ ] **Step 4: Create case-quotes-tab.tsx**

Combines:
- Invited hospitals list (with remind/remove actions)
- "Add Hospital" button + modal with hospital search
- Quote comparison table

- [ ] **Step 5: Wire into case-detail-tabs.tsx**

Replace the placeholder for `quotes` tab with `<CaseQuotesTab caseId={caseId} />`.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
git add apps/admin/src/components/tabs/case-quotes-tab.tsx \
  apps/admin/src/components/quote-comparison.tsx \
  apps/admin/src/app/api/cases/\[id\]/hospital-contacts/ \
  apps/admin/src/app/api/cases/\[id\]/quotes/
git commit -m "feat(admin): add Multi-Hospital Quotes tab with comparison table"
```

---

### Task 18: Timeline Tab (B2)

**Files:**
- Create: `apps/admin/src/components/tabs/case-timeline-tab.tsx`
- Create: `apps/admin/src/components/timeline-view.tsx`
- Add BFF route: `apps/admin/src/app/api/cases/[id]/timeline/route.ts`

- [ ] **Step 1: Add BFF route**

```typescript
export const GET = createParamQueryHandler(({ id }) => `/api/v2/cases/${id}/timeline`);
```

- [ ] **Step 2: Create timeline-view.tsx**

Vertical timeline component with:
- Date dividers
- Event nodes: icon (based on event type), description, timestamp, actor name
- Event types mapped to Lucide icons (FolderOpen for case created, ArrowRight for status change, etc.)

- [ ] **Step 3: Create case-timeline-tab.tsx + wire into tabs**

- [ ] **Step 4: Typecheck + commit**

```bash
git add apps/admin/src/components/tabs/case-timeline-tab.tsx \
  apps/admin/src/components/timeline-view.tsx \
  apps/admin/src/app/api/cases/\[id\]/timeline/
git commit -m "feat(admin): add Timeline tab with vertical event timeline"
```

---

### Task 19: Messages Tab (B3)

**Files:**
- Create: `apps/admin/src/components/tabs/case-messages-tab.tsx`
- Add BFF routes: `apps/admin/src/app/api/conversations/route.ts`, `apps/admin/src/app/api/conversations/[id]/messages/route.ts`
- Create: `apps/admin/src/queries/use-conversations.ts`
- Create: `apps/admin/src/actions/message-actions.ts`

- [ ] **Step 1: Add BFF routes**

```typescript
// conversations
export const GET = createQueryHandler((p) => `/api/v2/conversations?${p}`);

// conversations/[id]/messages
export const GET = createParamQueryHandler(({ id }, p) => `/api/v2/conversations/${id}/messages?${p}`);
```

Also add POST route for sending messages, and routes for message moderation (approve/reject).

- [ ] **Step 2: Create query hooks**

```typescript
// apps/admin/src/queries/use-conversations.ts
export function useConversations(filters: Record<string, string>) { /* ... */ }
export function useMessages(conversationId: string) { /* ... */ }
```

- [ ] **Step 3: Create message server actions**

```typescript
// apps/admin/src/actions/message-actions.ts
export async function sendMessage(conversationId: string, content: string) { /* ... */ }
export async function approveMessage(messageId: string) { /* ... */ }
export async function rejectMessage(messageId: string) { /* ... */ }
export async function retranslateMessage(messageId: string) { /* ... */ }
```

- [ ] **Step 4: Create case-messages-tab.tsx**

Uses shared `ChatLayout` from `@medical-crm/ui` (already available). Structure:
- Left: conversation list filtered by `caseId` (from `useConversations({ caseId })`)
- Right: chat window with `ChatLayout` component
- Admin-specific: moderation buttons (approve/reject) on pending messages, highlighted with amber background

Reference hospital portal's `messages-view.tsx` for the message mapping logic (`mapApiMessages()` function). Copy/adapt the mapping function.

- [ ] **Step 5: Wire into case-detail-tabs.tsx**

- [ ] **Step 6: Typecheck + commit**

```bash
git add apps/admin/src/components/tabs/case-messages-tab.tsx \
  apps/admin/src/queries/use-conversations.ts \
  apps/admin/src/actions/message-actions.ts \
  apps/admin/src/app/api/conversations/
git commit -m "feat(admin): add Messages tab with chat, moderation, and translation"
```

---

## Chunk 6: Phase B Tabs Part 2

### Task 20: Journey Tab (B4)

**Files:**
- Create: `apps/admin/src/components/tabs/case-journey-tab.tsx`
- Add BFF routes: `apps/admin/src/app/api/cases/[id]/journey/route.ts`, `apps/admin/src/app/api/cases/[id]/milestones/route.ts`
- Create: `apps/admin/src/queries/use-journey.ts`
- Create: `apps/admin/src/actions/journey-actions.ts`

- [ ] **Step 1: Add BFF routes**

```typescript
// journey — createParamQueryHandler receives (params, searchParams)
export const GET = createParamQueryHandler(({ id }, p) => `/api/v2/cases/${id}/journey?${p}`);

// milestones
export const GET = createParamQueryHandler(({ id }, p) => `/api/v2/cases/${id}/milestones?${p}`);
```

Also add POST/PATCH/DELETE BFF routes for milestones and PUT for journey (mutation routes use `apiFetch` directly, same pattern as registration-token route in Task 7 Step 2).

- [ ] **Step 1b: Create query hooks + server actions**

```typescript
// apps/admin/src/queries/use-journey.ts
export function useCaseJourney(caseId: string) { /* queryFetch /api/cases/${caseId}/journey */ }
export function useCaseMilestones(caseId: string) { /* queryFetch /api/cases/${caseId}/milestones */ }

// apps/admin/src/actions/journey-actions.ts
export async function updateJourney(caseId: string, data: Record<string, unknown>) { /* PUT */ }
export async function addMilestone(caseId: string, data: Record<string, unknown>) { /* POST */ }
export async function updateMilestone(milestoneId: string, data: Record<string, unknown>) { /* PATCH */ }
export async function deleteMilestone(milestoneId: string) { /* DELETE */ }
```

- [ ] **Step 2: Create case-journey-tab.tsx**

Shows:
- Journey info cards (visa, insurance, accommodation, transportation) from `GET /journey`
- Milestones list from `GET /milestones`
- Edit journey button → modal form → `PUT /journey`
- Add/update/delete milestones

- [ ] **Step 3: Wire into tabs + typecheck + commit**

```bash
git commit -m "feat(admin): add Journey tab with travel info and milestones"
```

---

### Task 21: Extract ConsultationListView + TranscriptModal → Consultations Tab (B5)

**Files:**
- Create: `packages/shared/ui/src/components/consultation-list-view.tsx`
- Create: `packages/shared/ui/src/components/transcript-modal.tsx`
- Modify: `packages/shared/ui/src/index.ts`
- Modify: `apps/hospital/src/components/consultations-list.tsx` (refactor to use shared)
- Create: `apps/admin/src/components/tabs/case-consultations-tab.tsx`
- Add BFF routes: `apps/admin/src/app/api/cases/[id]/consultations/route.ts`, `apps/admin/src/app/api/consultations/[id]/transcript/route.ts`
- Create: `apps/admin/src/queries/use-consultations.ts`

- [ ] **Step 1: Extract ConsultationListView**

From `apps/hospital/src/components/consultations-list.tsx`, extract the consultation card rendering + status tabs into a shared component.

Props interface:
```typescript
interface ConsultationListViewProps {
  consultations: ConsultationItem[];
  onViewTranscript?: (id: string) => void;
  onViewVideo?: (id: string) => void;
  showCreateButton?: boolean;
  onCreateConsultation?: () => void;
}
```

- [ ] **Step 2: Extract TranscriptModal**

Extract the transcript display modal. Props:
```typescript
interface TranscriptModalProps {
  open: boolean;
  onClose: () => void;
  entries: TranscriptEntry[];
  showTranslation?: boolean;
}
```

- [ ] **Step 3: Export from shared/ui index**

- [ ] **Step 4: Refactor hospital portal to use shared components**

Replace inline rendering in `consultations-list.tsx` with shared components. Hospital keeps stat cards + create button (these are hospital-specific).

- [ ] **Step 5: Add admin BFF routes + query hooks**

- [ ] **Step 6: Create case-consultations-tab.tsx**

Uses shared `ConsultationListView` (readonly, no create button, no stats) + `TranscriptModal`.

- [ ] **Step 7: Wire into tabs + typecheck both apps + commit**

```bash
pnpm turbo typecheck --filter=@medical-crm/ui --filter=@medical-crm/admin --filter=@medical-crm/hospital
git commit -m "refactor: extract ConsultationListView + TranscriptModal to shared; add admin Consultations tab"
```

---

### Task 22: Orders Tab (B6, readonly)

**Files:**
- Create: `apps/admin/src/components/tabs/case-orders-tab.tsx`
- Add BFF route: `apps/admin/src/app/api/orders/route.ts`
- Create: `apps/admin/src/queries/use-orders.ts`

- [ ] **Step 1: Add BFF route**

```typescript
// apps/admin/src/app/api/orders/route.ts
export const GET = createQueryHandler((p) => `/api/v2/orders?${p}`);
```

- [ ] **Step 2: Create query hook**

```typescript
export function useOrders(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => queryFetch(`/api/orders?${new URLSearchParams(filters)}`),
  });
}
```

- [ ] **Step 3: Create case-orders-tab.tsx**

Readonly table with columns: orderNumber, packageId, amount + currency, status Badge (6 status types), createdAt.
Click to expand → order detail (payment method, payment time, refund info).
No refund button (Patient-only operation per spec).

Status badge colors for 6 statuses: PENDING_PAYMENT (yellow), PAID (blue), IN_PROGRESS (indigo), COMPLETED (green), CANCELLED (gray), REFUNDED (red).

- [ ] **Step 4: Wire into tabs + typecheck + commit**

```bash
git commit -m "feat(admin): add Orders tab (readonly)"
```

---

### Task 23: Support Tab (B7)

**Depends on:** Task 2 (ticketListQuerySchema caseId filter). **BLOCKING** — do not start this task until Task 2 is completed and merged, otherwise `GET /tickets?caseId=xxx` will silently ignore the caseId parameter.

**Files:**
- Create: `apps/admin/src/components/tabs/case-support-tab.tsx`
- Add BFF routes: `apps/admin/src/app/api/tickets/route.ts`, `apps/admin/src/app/api/tickets/[id]/route.ts`
- Create: `apps/admin/src/queries/use-tickets.ts`
- Create: `apps/admin/src/actions/ticket-actions.ts`

- [ ] **Step 1: Add BFF routes**

```typescript
// tickets list
export const GET = createQueryHandler((p) => `/api/v2/tickets?${p}`);

// ticket detail
export const GET = createParamQueryHandler(({ id }) => `/api/v2/tickets/${id}`);
```

Also add POST routes for reply, assign, status update, close.

- [ ] **Step 2: Create query hooks + server actions**

- [ ] **Step 3: Create case-support-tab.tsx**

Uses `caseId` filter in the tickets query:
- Ticket list table (number, type, priority badge, status, createdAt, assignedTo)
- Click to expand → ticket detail + reply history
- Reply text input + submit
- Status management: assign, update status, close

- [ ] **Step 4: Wire into tabs + typecheck + commit**

```bash
git commit -m "feat(admin): add Support tab with ticket management"
```

---

### Task 24: AI Summary Tab (B8)

**Files:**
- Create: `apps/admin/src/components/tabs/case-ai-summary-tab.tsx`

- [ ] **Step 1: Create case-ai-summary-tab.tsx**

Simple component — reads `aiSummary` from case data (already fetched in parent):

```typescript
// apps/admin/src/components/tabs/case-ai-summary-tab.tsx
'use client';

import { Card, EmptyState } from '@medical-crm/ui';

export function CaseAiSummaryTab({ aiSummary }: { aiSummary: string | null }) {
  if (!aiSummary) {
    return <EmptyState title="No AI Summary" description="AI summary has not been generated yet." />;
  }

  return (
    <Card>
      <div className="prose max-w-none whitespace-pre-wrap p-6">{aiSummary}</div>
    </Card>
  );
}
```

> **Note:** `aiSummary` is rendered as plain text with `whitespace-pre-wrap` to preserve line breaks. If the field contains Markdown, add `react-markdown` as a dependency and render with `<ReactMarkdown>{aiSummary}</ReactMarkdown>`. Do NOT use `dangerouslySetInnerHTML` — it creates an XSS risk with AI-generated content.

- [ ] **Step 2: Wire into case-detail-tabs.tsx**

Pass `caseData.aiSummary` to the tab component.

- [ ] **Step 3: Final pass — wire ALL Phase B tabs into case-detail-tabs.tsx**

Update `case-detail-tabs.tsx` to import and render all 8 tab components, replacing all placeholders:

```typescript
{activeTab === 'overview' && <CaseOverviewTab ... />}
{activeTab === 'quotes' && <CaseQuotesTab caseId={caseId} />}
{activeTab === 'timeline' && <CaseTimelineTab caseId={caseId} />}
{activeTab === 'messages' && <CaseMessagesTab caseId={caseId} />}
{activeTab === 'intake' && <CaseIntakeTab caseId={caseId} />}
{activeTab === 'journey' && <CaseJourneyTab caseId={caseId} />}
{activeTab === 'consultations' && <CaseConsultationsTab caseId={caseId} />}
{activeTab === 'orders' && <CaseOrdersTab caseId={caseId} />}
{activeTab === 'support' && <CaseSupportTab caseId={caseId} />}
{activeTab === 'ai-summary' && <CaseAiSummaryTab aiSummary={caseData.aiSummary} />}
```

- [ ] **Step 4: Full typecheck**

```bash
pnpm turbo typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/tabs/case-ai-summary-tab.tsx \
  apps/admin/src/components/case-detail-tabs.tsx
git commit -m "feat(admin): add AI Summary tab and wire all Phase B tabs"
```

---

## Post-Implementation Verification

After all tasks are complete:

- [ ] **Full typecheck**: `pnpm turbo typecheck`
- [ ] **Full test suite**: `pnpm turbo test`
- [ ] **Manual smoke test**: Start backend + admin portal, test each page
  - Dashboard: stat cards render, recent cases table works
  - Cases list: filters work, pagination works, row click navigates
  - New Case: form submits, redirects to detail
  - Case Detail: all 10 tabs render, data loads on tab switch
  - Hospitals list: filters work, type/status badges render
  - Hospital Detail: info displays, status review works, token generation works
  - New Hospital: one-step creation with specialties, auto token generation
  - Hospital Registration: token validation, form submission, redirect to hospital portal
