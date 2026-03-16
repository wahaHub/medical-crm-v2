# Phase 3: Hospital Portal UI — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the nexus-crm prototype into `apps/hospital/` as a production Hospital Portal connected to the v2 backend API, with shared UI components in `@medical-crm/ui`.

**Architecture:** Three-layer data fetching (RSC → Route Handlers → Server Actions) with React Query v5 for client-side cache. Shared presentational components in `packages/shared/ui/`, hospital-specific composites in `apps/hospital/src/components/`. Materials data flows through a new Hono API module → Supabase adapter (Clean Architecture).

**Tech Stack:** Next.js 15 (App Router), React 19, TanStack React Query v5, Tailwind CSS v4, Motion, Lucide React, CVA, iron-session (existing), Keycloak PKCE (existing).

**Spec:** `docs/superpowers/specs/2026-03-15-phase3-hospital-portal-ui-design.md`

---

## Dependency Order

```
Chunk 1: Foundation ──────────────── (backend prereqs + data layer)
    ↓
Chunk 2: Shared UI Package ────────── (can start after Chunk 1 api-fetch is done)
    ↓
Chunk 3: Portal Shell + Dashboard ── (needs Chunk 1 + 2)
    ↓
Chunk 4: Cases ────────────────────┐
Chunk 5: Consultations ───────────┤── (can run in parallel after Chunk 3)
Chunk 6: Messages ────────────────┘
    ↓
Chunk 7: Materials Backend ─────── (independent of Chunks 4-6)
    ↓
Chunk 8: Materials Frontend ────── (needs Chunk 7 + Chunk 3)
```

---

## File Structure

### New/Modified Files in `apps/hospital/src/`

```
lib/
  errors.ts                          ← NEW: ApiError class
  api-fetch.ts                       ← NEW: low-level fetch (no redirect)
  api-client.ts                      ← MODIFY: refactor to use api-fetch, return Promise<T>
  route-handler-helpers.ts           ← NEW: createQueryHandler / createParamQueryHandler
  query-client.ts                    ← NEW: React Query config
  query-provider.tsx                 ← NEW: QueryClientProvider wrapper
  query-fetch.ts                     ← NEW: client-side fetch helper for Route Handlers
  session-helpers.ts                 ← NEW: getSessionHospitalId from JWT
  auth-context.tsx                   ← NEW: useAuth() hook + AuthProvider

app/
  layout.tsx                         ← MODIFY: add fonts, QueryProvider, globals
  globals.css                        ← NEW: Tailwind v4 imports + @source
  error.tsx                          ← NEW: global error boundary
  loading.tsx                        ← NEW: global loading

  (portal)/
    layout.tsx                       ← NEW: AuthGuard + Sidebar + Header
    page.tsx                         ← MODIFY: redirect to /dashboard
    dashboard/page.tsx               ← NEW: RSC dashboard
    cases/page.tsx                   ← NEW: cases list
    cases/[id]/page.tsx              ← NEW: case detail (7 tabs)
    consultations/page.tsx           ← NEW: consultations list
    consultations/[id]/room/page.tsx ← NEW: video room shell
    messages/page.tsx                ← NEW: conversations + chat
    materials/page.tsx               ← NEW: 4-tab materials

  api/
    cases/route.ts                   ← NEW: GET /api/cases
    cases/stats/route.ts             ← NEW: GET /api/cases/stats
    cases/[id]/route.ts              ← NEW: GET /api/cases/:id
    cases/[id]/documents/route.ts    ← NEW: GET /api/cases/:id/documents
    cases/[id]/progress/route.ts     ← NEW: GET /api/cases/:id/progress
    cases/[id]/consultations/route.ts ← NEW: GET /api/cases/:id/consultations
    consultations/route.ts           ← NEW: GET /api/consultations
    consultations/stats/route.ts     ← NEW: GET /api/consultations/stats
    consultations/[id]/route.ts      ← NEW: GET /api/consultations/:id
    consultations/[id]/transcript/route.ts ← NEW
    conversations/route.ts           ← NEW: GET /api/conversations
    conversations/[id]/route.ts      ← NEW: GET /api/conversations/:id
    conversations/[id]/messages/route.ts ← NEW
    materials/route.ts               ← NEW: GET /api/materials
    materials/procedures/route.ts    ← NEW
    materials/surgeons/route.ts      ← NEW
    materials/cases/route.ts         ← NEW

queries/
  use-cases.ts                       ← NEW: React Query hooks for cases (includes documents, progress, consultations)
  use-consultations.ts               ← NEW
  use-conversations.ts               ← NEW
  use-messages.ts                    ← NEW
  use-materials.ts                   ← NEW

actions/
  case-actions.ts                    ← NEW: Server Actions for case mutations
  message-actions.ts                 ← NEW
  consultation-actions.ts            ← NEW
  document-actions.ts                ← NEW

components/
  case-detail-panel.tsx              ← NEW: 7-tab case detail composite
  consultations-list.tsx             ← NEW: consultation list with inline expandable cards
  video-room.tsx                     ← NEW: video room composite
  materials-tabs.tsx                 ← NEW: 4-tab materials composite
  dashboard-widgets.tsx              ← NEW: dashboard card widgets
```

### New/Modified Files in `packages/shared/ui/src/`

```
components/
  button.tsx                         ← MOVE from src/button.tsx
  stat-card.tsx                      ← NEW
  status-badge.tsx                   ← NEW
  search-input.tsx                   ← NEW
  modal.tsx                          ← NEW
  chat-layout.tsx                    ← NEW
  data-table.tsx                     ← NEW
  sidebar-nav.tsx                    ← NEW
  page-header.tsx                    ← NEW
  tabs.tsx                           ← NEW
  avatar.tsx                         ← NEW
  card.tsx                           ← NEW
  empty-state.tsx                    ← NEW
  loading-spinner.tsx                ← NEW
  confirm-dialog.tsx                 ← NEW

hooks/
  use-debounce.ts                    ← NEW

lib/
  cn.ts                              ← MOVE from src/cn.ts
  format-date.ts                     ← NEW
  theme.ts                           ← NEW: design tokens

index.ts                             ← MODIFY: barrel export all
```

### New Files in Backend (Materials Module)

```
packages/domain/src/
  ports/materials-repository.port.ts ← NEW: IMaterialsRepository

packages/application/src/use-cases/materials/
  get-hospital-info.use-case.ts      ← NEW
  get-procedures.use-case.ts         ← NEW
  get-surgeons.use-case.ts           ← NEW
  get-before-after-cases.use-case.ts ← NEW
  update-hospital-info.use-case.ts   ← NEW
  create-procedure.use-case.ts       ← NEW
  update-procedure.use-case.ts       ← NEW
  delete-procedure.use-case.ts       ← NEW
  create-surgeon.use-case.ts         ← NEW
  update-surgeon.use-case.ts         ← NEW
  delete-surgeon.use-case.ts         ← NEW
  create-before-after-case.use-case.ts ← NEW
  update-before-after-case.use-case.ts ← NEW
  delete-before-after-case.use-case.ts ← NEW

packages/infrastructure/supabase-main/
  supabase-materials.repository.ts   ← NEW: implements IMaterialsRepository

apps/api/src/routes/
  materials.routes.ts                ← NEW: Hono routes for materials
```

---

## Chunk 1: Foundation (Backend Prerequisites + Data Layer)

### Task 1: Fix Backend Contract Mismatches

**Files:**
- Modify: `packages/shared/validation/src/consultation.schema.ts`
- Modify: `packages/application/src/use-cases/consultations/create-consultation.use-case.ts:47`

**Context:** The `createConsultationSchema` requires `hospitalId` and `patientId` as mandatory UUIDs, but `CreateConsultationUseCase` derives them from the case entity. Zod rejects requests without them (422). Also `durationMinutes` defaults to 30 in Zod but 60 in the use case.

- [ ] **Step 1: Update createConsultationSchema — remove hospitalId/patientId/doctorId**

```typescript
// packages/shared/validation/src/consultation.schema.ts
export const createConsultationSchema = z.object({
  caseId: z.string().uuid(),
  // hospitalId, patientId, doctorId REMOVED — derived/ignored by use case
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().default(30),
  consultationLink: z.string().url().optional(),
  aiTranslation: z.boolean().default(false),
  patientLanguage: z.string().max(10).default('en'),
  notes: z.string().optional(),
});
```

- [ ] **Step 2: Fix durationMinutes default in use case (60 → 30)**

In `packages/application/src/use-cases/consultations/create-consultation.use-case.ts` line 47:
```typescript
// Before:
durationMinutes: input.durationMinutes ?? 60,
// After:
durationMinutes: input.durationMinutes ?? 30,
```

- [ ] **Step 3: Run existing consultation tests**

Run: `pnpm --filter @medical-crm/application test -- --run consultations`
Expected: All existing tests pass

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All pass. The route handler already only passes `caseId` + scheduling fields.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/validation/src/consultation.schema.ts packages/application/src/use-cases/consultations/create-consultation.use-case.ts
git commit -m "fix: remove hospitalId/patientId from createConsultationSchema, fix durationMinutes default"
```

---

### Task 2: Create ApiError Class

**Files:**
- Create: `apps/hospital/src/lib/errors.ts`

- [ ] **Step 1: Create errors.ts**

```typescript
// apps/hospital/src/lib/errors.ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API error ${status}`);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/hospital/src/lib/errors.ts
git commit -m "feat(hospital): add ApiError class"
```

---

### Task 3: Create api-fetch.ts (Low-Level Fetch)

**Files:**
- Create: `apps/hospital/src/lib/api-fetch.ts`

**Context:** Extract token refresh logic from existing `api-client.ts` into a standalone file. Returns raw `Response`, never calls `redirect()` — safe for both apiClient (RSC) and Route Handlers.

- [ ] **Step 1: Create api-fetch.ts**

```typescript
// apps/hospital/src/lib/api-fetch.ts
import { getSession } from './session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const session = await getSession();

  if (!session.access_token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
    const refreshed = await refreshToken(session.refresh_token);
    if (!refreshed) {
      await session.destroy();
      return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    session.access_token = refreshed.access_token;
    session.refresh_token = refreshed.refresh_token;
    session.expires_at = refreshed.expires_at;
    await session.save();
  }

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

async function refreshToken(token: string) {
  try {
    const res = await fetch(
      `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
          refresh_token: token,
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/hospital/src/lib/api-fetch.ts
git commit -m "feat(hospital): add api-fetch.ts — low-level fetch with JWT and token refresh"
```

---

### Task 4: Refactor api-client.ts (Breaking Change)

**Files:**
- Modify: `apps/hospital/src/lib/api-client.ts`

**Context:** Rewrite to use `apiFetch`, return `Promise<T>`, redirect on 401. Breaking change but safe — no page code uses apiClient yet, only auth routes (which don't import it).

- [ ] **Step 1: Rewrite api-client.ts**

Note: The `import 'server-only'` below is **recommended** (prevents accidental client-side import), not required. If typecheck/build fails because `server-only` is missing, install it: `pnpm --filter @medical-crm/hospital add server-only`. Otherwise skip the install — the code works without it.

```typescript
// apps/hospital/src/lib/api-client.ts
// import 'server-only'; // uncomment after installing: pnpm --filter @medical-crm/hospital add server-only
import { redirect } from 'next/navigation';
import { apiFetch } from './api-fetch';
import { ApiError } from './errors';

export async function apiClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(path, init);

  if (res.status === 401) {
    redirect('/auth/login');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, body);
  }

  return res.json();
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @medical-crm/hospital typecheck`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/lib/api-client.ts
git commit -m "refactor(hospital): api-client returns Promise<T>, delegates to api-fetch"
```

---

### Task 5: Create Route Handler Helpers

**Files:**
- Create: `apps/hospital/src/lib/route-handler-helpers.ts`

- [ ] **Step 1: Create route-handler-helpers.ts**

```typescript
// apps/hospital/src/lib/route-handler-helpers.ts
import { NextRequest } from 'next/server';
import { apiFetch } from './api-fetch';

export function createQueryHandler(
  buildPath: (searchParams: URLSearchParams) => string,
) {
  return async function GET(request: NextRequest): Promise<Response> {
    const res = await apiFetch(buildPath(request.nextUrl.searchParams));

    if (!res.ok) {
      const body = await res.text();
      return Response.json(
        safeParseJson(body) ?? { error: 'Upstream error', status: res.status },
        { status: res.status },
      );
    }

    const text = await res.text();
    if (!text) return new Response(null, { status: 204 });
    return Response.json(JSON.parse(text));
  };
}

export function createParamQueryHandler(
  buildPath: (
    params: Record<string, string>,
    searchParams: URLSearchParams,
  ) => string,
) {
  return async function GET(
    request: NextRequest,
    { params }: { params: Promise<Record<string, string>> },
  ): Promise<Response> {
    const resolvedParams = await params;
    const res = await apiFetch(
      buildPath(resolvedParams, request.nextUrl.searchParams),
    );

    if (!res.ok) {
      const body = await res.text();
      return Response.json(
        safeParseJson(body) ?? { error: 'Upstream error', status: res.status },
        { status: res.status },
      );
    }

    const text = await res.text();
    if (!text) return new Response(null, { status: 204 });
    return Response.json(JSON.parse(text));
  };
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/hospital/src/lib/route-handler-helpers.ts
git commit -m "feat(hospital): add route-handler-helpers — query handler factories"
```

---

### Task 6: Create React Query Configuration

**Files:**
- Create: `apps/hospital/src/lib/query-client.ts`
- Create: `apps/hospital/src/lib/query-provider.tsx`

- [ ] **Step 1: Install React Query**

Run: `pnpm --filter @medical-crm/hospital add @tanstack/react-query`

- [ ] **Step 2: Create query-client.ts**

```typescript
// apps/hospital/src/lib/query-client.ts
import { QueryClient, QueryCache } from '@tanstack/react-query';
import { ApiError } from './errors';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) {
          window.location.replace('/auth/login');
        }
      },
    }),
  });
}
```

- [ ] **Step 3: Create query-provider.tsx**

```tsx
// apps/hospital/src/lib/query-provider.tsx
'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from './query-client';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/hospital/src/lib/query-client.ts apps/hospital/src/lib/query-provider.tsx apps/hospital/package.json pnpm-lock.yaml
git commit -m "feat(hospital): add React Query config and QueryProvider"
```

---

### Task 7: Create Auth Context

**Files:**
- Create: `apps/hospital/src/lib/auth-context.tsx`

**Note:** `AuthUser` is populated from JWT claims in the portal layout (Task 18, Chunk 3). `SessionData` stores tokens only — user identity fields (`id`, `email`, `roles`, `hospitalId`) are decoded from the access_token JWT payload, not stored in the session cookie.

- [ ] **Step 1: Create auth-context.tsx**

```tsx
// apps/hospital/src/lib/auth-context.tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
}

interface AuthContextValue {
  user: AuthUser;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const logout = () => {
    window.location.href = '/auth/logout';
  };

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

- [ ] **Step 2: Commit**

```bash
git add apps/hospital/src/lib/auth-context.tsx
git commit -m "feat(hospital): add AuthProvider and useAuth hook"
```

---

### Task 8: Update Middleware (Exclude /api Routes)

**Files:**
- Modify: `apps/hospital/src/middleware.ts`

- [ ] **Step 1: Update matcher to exclude /api**

Change line 18 from:
```typescript
'/((?!auth|_next/static|_next/image|favicon.ico).*)',
```
to:
```typescript
'/((?!auth|api|_next/static|_next/image|favicon.ico).*)',
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @medical-crm/hospital typecheck`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/middleware.ts
git commit -m "fix(hospital): exclude /api routes from session middleware"
```

---

### Task 9: Update Existing Session Tests

**Files:**
- Modify: `apps/hospital/src/__tests__/session.test.ts`

**Context:** The existing 28 auth tests mock `apiClient` which now returns `Promise<T>` instead of `Response`. Some tests may already pass without changes (e.g., session/cookie tests that don't directly test apiClient return values). Read the file first, then update only what's broken.

- [ ] **Step 1: Read full test file**

Read `apps/hospital/src/__tests__/session.test.ts` in full.

- [ ] **Step 2: Run tests FIRST to see what breaks**

Run: `pnpm --filter @medical-crm/hospital test -- --run`

This tells you exactly which tests need updating. Tests that only exercise `getSession()` / cookie logic will likely still pass.

- [ ] **Step 3: Fix failing tests**

For each failing test, apply these changes:
- Tests that checked `response.ok` / `response.json()` → expect direct data return or `ApiError` throw
- Tests that asserted `Response` type → assert plain object or `ApiError`
- Mock setup: global `fetch` mock still works (apiFetch calls `fetch`). But if tests imported `apiClient` directly from `./api-client`, verify the import path didn't change.
- If `apiClient` is now `async function<T>(...): Promise<T>`, tests expecting `Response` must change to expect the parsed JSON body.

Example fix pattern:
```typescript
// Before: const res = await apiClient('/foo'); expect(res.ok).toBe(true);
// After:  const data = await apiClient<{ id: string }>('/foo'); expect(data.id).toBeDefined();

// Before: expect(apiClient('/foo')).resolves.toMatchObject({ status: 401 });
// After:  expect(apiClient('/foo')).rejects.toThrow(ApiError);
```

- [ ] **Step 4: Run tests again**

Run: `pnpm --filter @medical-crm/hospital test -- --run`
Expected: All 28 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/hospital/src/__tests__/session.test.ts
git commit -m "test(hospital): update session tests for api-client refactor"
```

---

## Chunk 2: Shared UI Package

**Context:** The `@medical-crm/ui` package currently has `button.tsx` and `cn.ts` at the `src/` root with a wildcard export. We reorganize into `components/`, `hooks/`, `lib/` subdirectories and extract 14+ components from nexus-crm. All components are pure presentational — no API calls, no business logic. Reference `nexus-crm/src/` for styling patterns.

### Task 10: Reorganize Package Structure

**Files:**
- Move: `packages/shared/ui/src/button.tsx` → `packages/shared/ui/src/components/button.tsx`
- Move: `packages/shared/ui/src/cn.ts` → `packages/shared/ui/src/lib/cn.ts`
- Modify: `packages/shared/ui/src/index.ts`
- Modify: `packages/shared/ui/package.json`

- [ ] **Step 1: Create subdirectories**

```bash
mkdir -p packages/shared/ui/src/components packages/shared/ui/src/hooks packages/shared/ui/src/lib
```

- [ ] **Step 2: Move existing files**

```bash
git mv packages/shared/ui/src/button.tsx packages/shared/ui/src/components/button.tsx
git mv packages/shared/ui/src/cn.ts packages/shared/ui/src/lib/cn.ts
```

- [ ] **Step 3: Update import in button.tsx**

In `packages/shared/ui/src/components/button.tsx` line 3, change:
```typescript
// Before:
import { cn } from './cn';
// After:
import { cn } from '../lib/cn';
```

- [ ] **Step 4: Update package.json exports — remove wildcard, root barrel only**

```json
{
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Remove the `"./*": "./src/*.tsx"` line.

- [ ] **Step 5: Update index.ts barrel export**

```typescript
// packages/shared/ui/src/index.ts
export { cn } from './lib/cn';
export { Button, buttonVariants, type ButtonProps } from './components/button';
```

- [ ] **Step 6: Check no consumers use subpath imports**

Run: `grep -r "from '@medical-crm/ui/" apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: No matches (only root imports like `from '@medical-crm/ui'`)

- [ ] **Step 7: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add packages/shared/ui/
git commit -m "refactor(ui): reorganize into components/hooks/lib subdirectories"
```

---

### Task 11: Design Tokens + Utilities

**Files:**
- Create: `packages/shared/ui/src/lib/theme.ts`
- Create: `packages/shared/ui/src/lib/format-date.ts`
- Create: `packages/shared/ui/src/hooks/use-debounce.ts`
- Modify: `packages/shared/ui/src/index.ts`

- [ ] **Step 1: Create theme.ts**

```typescript
// packages/shared/ui/src/lib/theme.ts
export const theme = {
  colors: {
    primary: 'indigo',
    success: 'emerald',
    warning: 'amber',
    danger: 'rose',
    info: 'cyan',
  },
  font: 'Poppins',
  radius: {
    card: '1.5rem',
    button: '9999px',
    input: '0.75rem',
    badge: '0.375rem',
  },
  shadow: {
    card: '0 4px 20px -4px rgba(0,0,0,0.02)',
    hover: '0 8px 30px -4px rgba(0,0,0,0.08)',
  },
} as const;
```

- [ ] **Step 2: Create format-date.ts**

```typescript
// packages/shared/ui/src/lib/format-date.ts
export function formatDate(date: string | Date, style: 'short' | 'long' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (style === 'long') {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}
```

- [ ] **Step 3: Create use-debounce.ts**

```typescript
// packages/shared/ui/src/hooks/use-debounce.ts
'use client';

import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

- [ ] **Step 4: Update index.ts**

Add to `packages/shared/ui/src/index.ts`:
```typescript
export { theme } from './lib/theme';
export { formatDate, formatTime, formatRelative } from './lib/format-date';
export { useDebounce } from './hooks/use-debounce';
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/ui/src/lib/theme.ts packages/shared/ui/src/lib/format-date.ts packages/shared/ui/src/hooks/use-debounce.ts packages/shared/ui/src/index.ts
git commit -m "feat(ui): add design tokens, date formatting, and useDebounce hook"
```

---

### Task 12: Core Layout Components (SidebarNav, PageHeader, Tabs)

**Files:**
- Create: `packages/shared/ui/src/components/sidebar-nav.tsx`
- Create: `packages/shared/ui/src/components/page-header.tsx`
- Create: `packages/shared/ui/src/components/tabs.tsx`
- Modify: `packages/shared/ui/src/index.ts`
- Reference: `nexus-crm/src/App.tsx` (Sidebar, Header components)

**Context:** Extract sidebar, header, and tab patterns from `nexus-crm/src/App.tsx`. These are the structural components used by all portal pages.

- [ ] **Step 1: Create sidebar-nav.tsx**

Reference `nexus-crm/src/App.tsx` lines 25-66 (SidebarIcon + Sidebar). Extract as a configurable component:

```tsx
// packages/shared/ui/src/components/sidebar-nav.tsx
'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  href: string;
}

export interface SidebarNavProps {
  items: NavItem[];
  activeKey: string;
  onNavigate: (href: string) => void;
  logo?: ReactNode;
  footer?: ReactNode;
}

export function SidebarNav({ items, activeKey, onNavigate, logo, footer }: SidebarNavProps) {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[72px] flex-col items-center border-r border-slate-100 bg-white py-6">
      {logo && <div className="mb-8">{logo}</div>}
      <nav className="flex flex-1 flex-col items-center gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.href)}
            className={cn(
              'group flex h-10 w-10 items-center justify-center rounded-xl transition-all',
              activeKey === item.key
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600',
            )}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </nav>
      {footer && <div className="mt-auto">{footer}</div>}
    </aside>
  );
}
```

- [ ] **Step 2: Create page-header.tsx**

Reference `nexus-crm/src/App.tsx` lines 68-90 (Header).

```tsx
// packages/shared/ui/src/components/page-header.tsx
import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create tabs.tsx**

Reference `nexus-crm/src/App.tsx` tab system and `nexus-crm/src/components/MarketingMaterialsView.tsx` animated tab indicator.

```tsx
// packages/shared/ui/src/components/tabs.tsx
'use client';

import { cn } from '../lib/cn';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, activeKey, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 rounded-xl bg-slate-100 p-1', className)}>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-all',
            activeKey === item.key
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs">
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Update index.ts**

Add to barrel export:
```typescript
export { SidebarNav, type NavItem, type SidebarNavProps } from './components/sidebar-nav';
export { PageHeader, type PageHeaderProps } from './components/page-header';
export { Tabs, type TabItem, type TabsProps } from './components/tabs';
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: Pass

- [ ] **Step 6: Commit**

```bash
git add packages/shared/ui/src/components/sidebar-nav.tsx packages/shared/ui/src/components/page-header.tsx packages/shared/ui/src/components/tabs.tsx packages/shared/ui/src/index.ts
git commit -m "feat(ui): add SidebarNav, PageHeader, Tabs components"
```

---

### Task 13: Data Display Components (StatCard, StatusBadge, Card, Avatar)

**Files:**
- Create: `packages/shared/ui/src/components/stat-card.tsx`
- Create: `packages/shared/ui/src/components/status-badge.tsx`
- Create: `packages/shared/ui/src/components/card.tsx`
- Create: `packages/shared/ui/src/components/avatar.tsx`
- Modify: `packages/shared/ui/src/index.ts`
- Add peerDep: `lucide-react`

**Context:** These components appear throughout nexus-crm in dashboard and list views. `StatCard` from `App.tsx` + `ConsultationsView.tsx`, `StatusBadge` from `App.tsx:101-121`.

- [ ] **Step 1: Add lucide-react as peerDependency**

In `packages/shared/ui/package.json`, add to `peerDependencies`:
```json
"lucide-react": ">=0.400.0"
```
And to `devDependencies`:
```json
"lucide-react": "^0.546.0"
```

Run: `pnpm --filter @medical-crm/ui add -D lucide-react`

- [ ] **Step 2: Create stat-card.tsx**

```tsx
// packages/shared/ui/src/components/stat-card.tsx
import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface StatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  colorClass?: string;
  className?: string;
}

export function StatCard({ icon, value, label, colorClass = 'text-indigo-600 bg-indigo-50', className }: StatCardProps) {
  return (
    <div className={cn('flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm', className)}>
      <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', colorClass)}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create status-badge.tsx**

```tsx
// packages/shared/ui/src/components/status-badge.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center font-medium',
  {
    variants: {
      variant: {
        pill: 'rounded-full px-3 py-1 text-xs',
        dot: 'gap-1.5 text-sm',
      },
      size: {
        sm: 'text-xs',
        md: 'text-sm',
      },
    },
    defaultVariants: {
      variant: 'pill',
      size: 'sm',
    },
  },
);

const DEFAULT_COLORS: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700',
  SCHEDULED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  NO_SHOW: 'bg-rose-50 text-rose-700',
  PENDING_REVIEW: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-rose-50 text-rose-700',
};

export interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status: string;
  colorMap?: Record<string, string>;
  className?: string;
}

export function StatusBadge({ status, variant, size, colorMap, className }: StatusBadgeProps) {
  const colors = { ...DEFAULT_COLORS, ...colorMap };
  const colorClass = colors[status] ?? 'bg-slate-100 text-slate-600';
  const label = status.replace(/_/g, ' ');

  if (variant === 'dot') {
    return (
      <span className={cn(badgeVariants({ variant, size }), className)}>
        <span className={cn('h-2 w-2 rounded-full', colorClass.replace(/bg-(\w+)-50/, 'bg-$1-500'))} />
        {label}
      </span>
    );
  }

  return (
    <span className={cn(badgeVariants({ variant, size }), colorClass, className)}>
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Create card.tsx**

```tsx
// packages/shared/ui/src/components/card.tsx
import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div className={cn('rounded-2xl bg-white p-6 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex items-center justify-between', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-lg font-semibold text-slate-900', className)}>
      {children}
    </h3>
  );
}
```

- [ ] **Step 5: Create avatar.tsx**

```tsx
// packages/shared/ui/src/components/avatar.tsx
import { cn } from '../lib/cn';

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
};

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-indigo-100 font-medium text-indigo-600',
        sizes[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}
```

- [ ] **Step 6: Update index.ts barrel export**

```typescript
export { StatCard, type StatCardProps } from './components/stat-card';
export { StatusBadge, type StatusBadgeProps } from './components/status-badge';
export { Card, CardHeader, CardTitle, type CardProps } from './components/card';
export { Avatar, type AvatarProps } from './components/avatar';
```

- [ ] **Step 7: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: Pass

- [ ] **Step 8: Commit**

```bash
git add packages/shared/ui/
git commit -m "feat(ui): add StatCard, StatusBadge, Card, Avatar components"
```

---

### Task 14: Feedback Components (Modal, ConfirmDialog, EmptyState, LoadingSpinner, SearchInput)

**Files:**
- Create: `packages/shared/ui/src/components/modal.tsx`
- Create: `packages/shared/ui/src/components/confirm-dialog.tsx`
- Create: `packages/shared/ui/src/components/empty-state.tsx`
- Create: `packages/shared/ui/src/components/loading-spinner.tsx`
- Create: `packages/shared/ui/src/components/search-input.tsx`
- Modify: `packages/shared/ui/src/index.ts`

**Context:** Modal from `nexus-crm/src/components/MarketingMaterialsView.tsx:17-39`. SearchInput appears in multiple nexus-crm views.

- [ ] **Step 1: Create modal.tsx**

```tsx
// packages/shared/ui/src/components/modal.tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, maxWidth = 'max-w-2xl', children }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className={cn('relative z-10 w-full rounded-2xl bg-white p-6 shadow-xl', maxWidth)}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create confirm-dialog.tsx**

```tsx
// packages/shared/ui/src/components/confirm-dialog.tsx
'use client';

import { Modal } from './modal';
import { Button } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  variant = 'default',
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
      <p className="mb-6 text-sm text-slate-600">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          variant={variant === 'danger' ? 'destructive' : 'default'}
          onClick={onConfirm}
          className={variant === 'danger' ? 'bg-rose-600 text-white hover:bg-rose-700' : undefined}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Create empty-state.tsx**

```tsx
// packages/shared/ui/src/components/empty-state.tsx
import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="mb-4 text-slate-300">{icon}</div>
      <h3 className="text-lg font-medium text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Create loading-spinner.tsx**

```tsx
// packages/shared/ui/src/components/loading-spinner.tsx
import { cn } from '../lib/cn';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <div className={cn('animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600', sizes[size], className)} />
  );
}
```

- [ ] **Step 5: Create search-input.tsx**

```tsx
// packages/shared/ui/src/components/search-input.tsx
'use client';

import { useState, useEffect } from 'react';
import { cn } from '../lib/cn';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', debounceMs, className }: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);

  // Sync external value changes
  useEffect(() => { setLocalValue(value); }, [value]);

  // Debounce: only call onChange after delay
  useEffect(() => {
    if (!debounceMs) return;
    const timer = setTimeout(() => {
      if (localValue !== value) onChange(localValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocalValue(v);
    if (!debounceMs) onChange(v); // immediate if no debounce
  };

  return (
    <div className={cn('relative', className)}>
      <svg
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={debounceMs ? localValue : value}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  );
}
```

- [ ] **Step 6: Update index.ts**

```typescript
export { Modal, type ModalProps } from './components/modal';
export { ConfirmDialog, type ConfirmDialogProps } from './components/confirm-dialog';
export { EmptyState, type EmptyStateProps } from './components/empty-state';
export { LoadingSpinner, type LoadingSpinnerProps } from './components/loading-spinner';
export { SearchInput, type SearchInputProps } from './components/search-input';
```

- [ ] **Step 7: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: Pass

- [ ] **Step 8: Commit**

```bash
git add packages/shared/ui/
git commit -m "feat(ui): add Modal, ConfirmDialog, EmptyState, LoadingSpinner, SearchInput"
```

---

### Task 15: DataTable Component

**Files:**
- Create: `packages/shared/ui/src/components/data-table.tsx`
- Modify: `packages/shared/ui/src/index.ts`

- [ ] **Step 1: Create data-table.tsx**

```tsx
// packages/shared/ui/src/components/data-table.tsx
'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  pagination?: PaginationState;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyState,
  pagination,
  onPageChange,
  className,
}: DataTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 0;

  return (
    <div className={cn('overflow-x-auto rounded-xl border border-slate-200', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn('px-4 py-3 text-left font-medium text-slate-600', col.className)}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={keyExtractor(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-slate-100 last:border-0',
                onRowClick && 'cursor-pointer hover:bg-slate-50',
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3', col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <span className="text-sm text-slate-500">
            Page {pagination.page} of {totalPages} ({pagination.total} items)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update index.ts**

```typescript
export { DataTable, type Column, type DataTableProps, type PaginationState } from './components/data-table';
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/ui/
git commit -m "feat(ui): add DataTable component"
```

---

### Task 16: ChatLayout Component

**Files:**
- Create: `packages/shared/ui/src/components/chat-layout.tsx`
- Modify: `packages/shared/ui/src/index.ts`
- Reference: `nexus-crm/src/components/ChatLayout.tsx`

**Context:** The ChatLayout from nexus-crm is a split layout with messages and patient info. Extract as a shared component with `showRetranslate` prop (default `false` for hospital, `true` for future admin).

- [ ] **Step 1: Create chat-layout.tsx**

```tsx
// packages/shared/ui/src/components/chat-layout.tsx
'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ChatMessage {
  id: string;
  content: string;
  translatedContent?: string | null;
  senderRole: 'ADMIN' | 'HOSPITAL' | 'PATIENT';
  senderName: string;
  createdAt: string;
  isAiTranslated?: boolean;
}

export interface ChatLayoutProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  isSending?: boolean;
  patientInfo?: ReactNode;
  showTranslation?: boolean;
  showRetranslate?: boolean;
  onRetranslate?: (messageId: string) => void;
  currentUserRole?: string;
  emptyState?: ReactNode;
  className?: string;
}

export function ChatLayout({
  messages,
  onSend,
  isSending = false,
  patientInfo,
  showTranslation = true,
  showRetranslate = false,
  onRetranslate,
  currentUserRole = 'HOSPITAL',
  emptyState,
  className,
}: ChatLayoutProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isOwnMessage = (msg: ChatMessage) => msg.senderRole === currentUserRole;

  return (
    <div className={cn('flex h-full', className)}>
      {/* Messages area */}
      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && emptyState}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('mb-4 flex', isOwnMessage(msg) ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[70%] rounded-2xl px-4 py-3',
                  isOwnMessage(msg)
                    ? 'bg-cyan-50 text-slate-800'
                    : 'bg-slate-50 text-slate-800',
                )}
              >
                <div className="mb-1 text-xs font-medium text-slate-500">{msg.senderName}</div>
                <p className="text-sm">{msg.content}</p>
                {showTranslation && msg.translatedContent && (
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <p className="text-sm italic text-slate-500">{msg.translatedContent}</p>
                    {msg.isAiTranslated && (
                      <span className="mt-1 inline-block text-xs text-indigo-500">AI translated</span>
                    )}
                  </div>
                )}
                {showRetranslate && onRetranslate && (
                  <button
                    onClick={() => onRetranslate(msg.id)}
                    className="mt-1 text-xs text-indigo-500 hover:text-indigo-700"
                  >
                    Retranslate
                  </button>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-slate-200 p-4">
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={2}
              className="w-full resize-none rounded-xl border border-slate-200 p-3 pr-20 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="absolute bottom-3 right-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Patient info sidebar */}
      {patientInfo && (
        <div className="w-80 border-l border-slate-200 overflow-y-auto p-4">
          {patientInfo}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update index.ts**

```typescript
export { ChatLayout, type ChatMessage, type ChatLayoutProps } from './components/chat-layout';
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: Pass

- [ ] **Step 5: Commit**

```bash
git add packages/shared/ui/
git commit -m "feat(ui): add ChatLayout component with showRetranslate prop"
```

---

## Chunk 3: Portal Shell + Dashboard

### Task 17: Root Layout + Globals + PostCSS

**Files:**
- Modify: `apps/hospital/src/app/layout.tsx`
- Create: `apps/hospital/src/app/globals.css`
- Create: `apps/hospital/postcss.config.mjs`
- Modify: `apps/hospital/package.json` (add motion + lucide-react)

- [ ] **Step 1: Install frontend dependencies**

Note: `tailwindcss` and `@tailwindcss/postcss` are already in `apps/hospital/package.json` — do NOT re-add them.

```bash
pnpm --filter @medical-crm/hospital add motion lucide-react
```

- [ ] **Step 2: Create postcss.config.mjs**

```javascript
// apps/hospital/postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 3: Create globals.css**

```css
/* apps/hospital/src/app/globals.css */
@import "tailwindcss";
@source "../../../../packages/shared/ui/src/**/*.tsx";
```

- [ ] **Step 4: Update root layout.tsx**

```tsx
// apps/hospital/src/app/layout.tsx
import { Poppins } from 'next/font/google';
import { QueryProvider } from '@/lib/query-provider';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

export const metadata = {
  title: 'Medical CRM — Hospital Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="font-[family-name:var(--font-poppins)] bg-slate-50 antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Run dev to verify CSS + font loads**

Run: `pnpm --filter @medical-crm/hospital dev`
Expected: No build errors. Page loads with Poppins font and Tailwind working.

- [ ] **Step 6: Commit**

```bash
git add apps/hospital/
git commit -m "feat(hospital): root layout with Poppins font, Tailwind v4, QueryProvider"
```

---

### Task 18: Portal Layout (AuthGuard + Sidebar + Header)

**Files:**
- Create: `apps/hospital/src/app/(portal)/layout.tsx`
- Modify: `apps/hospital/src/app/page.tsx` → redirect to `/dashboard`
- Create: `apps/hospital/src/app/(portal)/page.tsx` → redirect to `/dashboard`
- Create: `apps/hospital/src/app/error.tsx`
- Create: `apps/hospital/src/app/loading.tsx`

**Context:** The `(portal)/layout.tsx` is a Server Component that reads the session, extracts user info, passes it to `AuthProvider`, and renders `SidebarNav` + `Header` + main content area. Reference `nexus-crm/src/App.tsx` for sidebar and header patterns.

- [ ] **Step 1: Create (portal)/layout.tsx**

```tsx
// apps/hospital/src/app/(portal)/layout.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AuthProvider, type AuthUser } from '@/lib/auth-context';
import { PortalShell } from '@/components/portal-shell';

// Decode JWT payload to extract user info (no verification — already verified by middleware)
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return {};
  }
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session.access_token) {
    redirect('/auth/login');
  }

  const payload = decodeJwtPayload(session.access_token);
  const user: AuthUser = {
    id: (payload.sub as string) ?? '',
    email: (payload.email as string) ?? '',
    roles: (payload.realm_access as { roles?: string[] })?.roles ?? [],
    hospitalId: (payload.hospital_id as string) ?? null,
  };

  return (
    <AuthProvider user={user}>
      <PortalShell>{children}</PortalShell>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Create portal-shell.tsx (client component for sidebar + nav)**

```tsx
// apps/hospital/src/components/portal-shell.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, FolderOpen, Video, MessageSquare, Megaphone, LogOut } from 'lucide-react';
import { SidebarNav, type NavItem } from '@medical-crm/ui';
import { useAuth } from '@/lib/auth-context';

const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, href: '/dashboard' },
  { key: 'cases', label: 'Cases', icon: <FolderOpen size={20} />, href: '/cases' },
  { key: 'consultations', label: 'Consultations', icon: <Video size={20} />, href: '/consultations' },
  { key: 'messages', label: 'Messages', icon: <MessageSquare size={20} />, href: '/messages' },
  { key: 'materials', label: 'Materials', icon: <Megaphone size={20} />, href: '/materials' },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const activeKey = navItems.find((item) => pathname.startsWith(item.href))?.key ?? 'dashboard';

  return (
    <div className="flex min-h-screen">
      <SidebarNav
        items={navItems}
        activeKey={activeKey}
        onNavigate={(href) => router.push(href)}
        footer={
          <button onClick={logout} className="text-slate-400 hover:text-rose-500" title="Logout">
            <LogOut size={20} />
          </button>
        }
      />
      <main className="ml-[72px] flex-1 p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Create redirect pages**

```tsx
// apps/hospital/src/app/page.tsx
import { redirect } from 'next/navigation';
export default function Home() {
  redirect('/dashboard');
}
```

```tsx
// apps/hospital/src/app/(portal)/page.tsx
import { redirect } from 'next/navigation';
export default function PortalHome() {
  redirect('/dashboard');
}
```

- [ ] **Step 4: Create error.tsx and loading.tsx**

```tsx
// apps/hospital/src/app/error.tsx
'use client';
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
        <p className="mt-2 text-sm text-slate-500">{error.message}</p>
        <button onClick={reset} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
          Try again
        </button>
      </div>
    </div>
  );
}
```

```tsx
// apps/hospital/src/app/loading.tsx
import { LoadingSpinner } from '@medical-crm/ui';
export default function GlobalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
```

- [ ] **Step 5: Run typecheck + dev**

Run: `pnpm --filter @medical-crm/hospital typecheck && pnpm --filter @medical-crm/hospital dev`
Expected: Compiles without errors. Visiting `/` redirects to `/dashboard`. Sidebar renders.

- [ ] **Step 6: Commit**

```bash
git add apps/hospital/src/
git commit -m "feat(hospital): portal layout with sidebar, auth guard, error/loading boundaries"
```

---

### Task 19: Dashboard Page + Query Hooks

**Files:**
- Create: `apps/hospital/src/lib/query-fetch.ts`
- Create: `apps/hospital/src/app/(portal)/dashboard/page.tsx`
- Create: `apps/hospital/src/components/dashboard-widgets.tsx`
- Create: `apps/hospital/src/queries/use-cases.ts`
- Create: `apps/hospital/src/queries/use-consultations.ts`
- Create: `apps/hospital/src/app/api/cases/route.ts`
- Create: `apps/hospital/src/app/api/cases/stats/route.ts`
- Create: `apps/hospital/src/app/api/consultations/route.ts`
- Create: `apps/hospital/src/app/api/consultations/stats/route.ts`

**Context:** Dashboard uses RSC for initial data load. Also set up the first Route Handlers and React Query hooks that will be reused by other pages.

- [ ] **Step 1: Create Route Handlers for dashboard data**

```typescript
// apps/hospital/src/app/api/cases/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler((p) => `/api/v2/cases?${p}`);
```

```typescript
// apps/hospital/src/app/api/cases/stats/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler(() => '/api/v2/cases/stats');
```

```typescript
// apps/hospital/src/app/api/consultations/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler((p) => `/api/v2/consultations?${p}`);
```

```typescript
// apps/hospital/src/app/api/consultations/stats/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler(() => '/api/v2/consultations/stats');
```

- [ ] **Step 2: Create queryFetch shared helper**

```typescript
// apps/hospital/src/lib/query-fetch.ts
import { ApiError } from './errors';

/** Fetch helper for client-side Route Handler queries. Throws ApiError on non-ok. */
export async function queryFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, body);
  }
  return res.json();
}
```

- [ ] **Step 3: Create cases query hooks**

```typescript
// apps/hospital/src/queries/use-cases.ts
import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useCases(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['cases', filters],
    queryFn: () => queryFetch(`/api/cases?${new URLSearchParams(filters)}`),
  });
}

export function useCaseStats() {
  return useQuery({
    queryKey: ['cases', 'stats'],
    queryFn: () => queryFetch('/api/cases/stats'),
  });
}

export function useCase(id: string) {
  return useQuery({
    queryKey: ['cases', id],
    queryFn: () => queryFetch(`/api/cases/${id}`),
    enabled: !!id,
  });
}
```

- [ ] **Step 4: Create consultations query hooks**

```typescript
// apps/hospital/src/queries/use-consultations.ts
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useConsultations(params: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: ['consultations', params],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(params);
      if (pageParam) p.set('cursor', pageParam as string);
      return queryFetch(`/api/consultations?${p}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: any) => lastPage.nextCursor ?? null,
  });
}

export function useConsultationStats() {
  return useQuery({
    queryKey: ['consultations', 'stats'],
    queryFn: () => queryFetch('/api/consultations/stats'),
  });
}
```

- [ ] **Step 5: Create dashboard-widgets.tsx (client component)**

```tsx
// apps/hospital/src/components/dashboard-widgets.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Calendar, FolderOpen, MessageSquare, TrendingUp } from 'lucide-react';
import { StatCard, Card, CardHeader, CardTitle, StatusBadge } from '@medical-crm/ui';

interface DashboardData {
  caseStats: { total: number; new: number; inProgress: number; completed: number };
  consultationStats: { total: number; scheduled: number; completed: number };
  recentCases: Array<{ id: string; caseNumber: string; patientName: string; status: string; createdAt: string }>;
  scheduledConsultations: Array<{ id: string; patientName: string; scheduledAt: string; status: string }>;
  pendingMessages: Array<{ id: string; patientName: string; lastMessage: string; updatedAt: string }>;
}

export function DashboardWidgets({ data }: { data: DashboardData }) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<FolderOpen size={24} />} value={data.caseStats.total} label="Total Cases" />
        <StatCard icon={<FolderOpen size={24} />} value={data.caseStats.new} label="New Cases" colorClass="text-blue-600 bg-blue-50" />
        <StatCard icon={<Calendar size={24} />} value={data.consultationStats.scheduled} label="Scheduled" colorClass="text-amber-600 bg-amber-50" />
        <StatCard icon={<TrendingUp size={24} />} value={data.consultationStats.completed} label="Completed" colorClass="text-emerald-600 bg-emerald-50" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's Consultations */}
        <Card>
          <CardHeader><CardTitle>Today's Consultations</CardTitle></CardHeader>
          {data.scheduledConsultations.length === 0 ? (
            <p className="text-sm text-slate-500">No consultations scheduled today</p>
          ) : (
            <div className="space-y-3">
              {data.scheduledConsultations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/consultations/${c.id}/room`)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">{c.patientName}</div>
                    <div className="text-xs text-slate-500">{new Date(c.scheduledAt).toLocaleTimeString()}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Cases */}
        <Card>
          <CardHeader><CardTitle>Recent Cases</CardTitle></CardHeader>
          {data.recentCases.length === 0 ? (
            <p className="text-sm text-slate-500">No recent cases</p>
          ) : (
            <div className="space-y-3">
              {data.recentCases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/cases/${c.id}`)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">{c.caseNumber}</div>
                    <div className="text-xs text-slate-500">{c.patientName}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Pending Messages */}
        <Card>
          <CardHeader><CardTitle>Pending Messages</CardTitle></CardHeader>
          {data.pendingMessages.length === 0 ? (
            <p className="text-sm text-slate-500">No pending messages</p>
          ) : (
            <div className="space-y-3">
              {data.pendingMessages.map((m) => (
                <div
                  key={m.id}
                  onClick={() => router.push(`/messages?conversation=${m.id}`)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">{m.patientName}</div>
                    <div className="line-clamp-1 text-xs text-slate-500">{m.lastMessage}</div>
                  </div>
                  <MessageSquare size={16} className="text-slate-400" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create dashboard page (RSC)**

```tsx
// apps/hospital/src/app/(portal)/dashboard/page.tsx
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@medical-crm/ui';
import { DashboardWidgets } from '@/components/dashboard-widgets';

export default async function DashboardPage() {
  const [cases, consultations, caseStats, consultationStats, conversations] = await Promise.all([
    apiClient<{ data: any[] }>('/api/v2/cases?limit=5&sort=createdAt:desc'),
    apiClient<{ data: any[] }>('/api/v2/consultations?status=SCHEDULED&limit=5'),
    apiClient<any>('/api/v2/cases/stats'),
    apiClient<any>('/api/v2/consultations/stats'),
    apiClient<{ data: any[] }>('/api/v2/conversations?limit=5'),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" subtitle="Welcome back" />
      <DashboardWidgets
        data={{
          caseStats,
          consultationStats,
          recentCases: cases.data ?? [],
          scheduledConsultations: consultations.data ?? [],
          pendingMessages: (conversations.data ?? []).map((c: any) => ({
            id: c.id,
            patientName: c.patientName ?? 'Unknown',
            lastMessage: c.lastMessagePreview ?? '',
            updatedAt: c.updatedAt,
          })),
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter @medical-crm/hospital typecheck`
Expected: Pass

- [ ] **Step 8: Commit**

```bash
git add apps/hospital/src/
git commit -m "feat(hospital): dashboard page with stat cards, route handlers, query hooks"
```

---

## Chunk 4: Cases (List + Detail)

### Task 20: Cases Route Handlers

**Files:**
- Create: `apps/hospital/src/app/api/cases/[id]/route.ts`
- Create: `apps/hospital/src/app/api/cases/[id]/documents/route.ts`
- Create: `apps/hospital/src/app/api/cases/[id]/progress/route.ts`
- Create: `apps/hospital/src/app/api/cases/[id]/consultations/route.ts`

- [ ] **Step 1: Create all case Route Handlers**

```typescript
// apps/hospital/src/app/api/cases/[id]/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/cases/${id}`);
```

```typescript
// apps/hospital/src/app/api/cases/[id]/documents/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/cases/${id}/documents`);
```

```typescript
// apps/hospital/src/app/api/cases/[id]/progress/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/cases/${id}/progress`);
```

```typescript
// apps/hospital/src/app/api/cases/[id]/consultations/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/cases/${id}/consultations`);
```

- [ ] **Step 2: Commit**

```bash
git add apps/hospital/src/app/api/cases/
git commit -m "feat(hospital): case route handlers (detail, documents, progress, consultations)"
```

---

### Task 21: Cases Query Hooks (extend) + Mutations

**Files:**
- Modify: `apps/hospital/src/queries/use-cases.ts` (add detail hooks: documents, progress, consultations)
- Create: `apps/hospital/src/actions/case-actions.ts`

- [ ] **Step 1: Add case detail hooks to use-cases.ts**

Append to `apps/hospital/src/queries/use-cases.ts`:
```typescript
export function useCaseDocuments(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'documents'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/documents`),
    enabled: !!caseId,
  });
}

export function useCaseProgress(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'progress'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/progress`),
    enabled: !!caseId,
  });
}

export function useCaseConsultations(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'consultations'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/consultations`),
    enabled: !!caseId,
  });
}
```

- [ ] **Step 2: Create case-actions.ts (Server Actions)**

```typescript
// apps/hospital/src/actions/case-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';

export async function updateCaseStatus(id: string, status: string) {
  const result = await apiClient(`/api/v2/cases/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath('/cases');
  revalidatePath('/dashboard');
  return result;
}

export async function updateCaseStage(id: string, stage: string) {
  const result = await apiClient(`/api/v2/cases/${id}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stage }),
  });
  revalidatePath(`/cases/${id}`);
  return result;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/queries/ apps/hospital/src/actions/case-actions.ts
git commit -m "feat(hospital): case query hooks and server actions"
```

---

### Task 22: Cases List Page

**Files:**
- Create: `apps/hospital/src/app/(portal)/cases/page.tsx`
- Reference: `nexus-crm/src/App.tsx` CasesView (lines 291-418)

- [ ] **Step 1: Create cases list page**

The page is an RSC that loads initial data, then renders a client component for interactive features (search, filter, pagination).

```tsx
// apps/hospital/src/app/(portal)/cases/page.tsx
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@medical-crm/ui';
import { CasesList } from '@/components/cases-list';

export default async function CasesPage() {
  const [cases, stats] = await Promise.all([
    apiClient<any>('/api/v2/cases?page=1&limit=20'),
    apiClient<any>('/api/v2/cases/stats'),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Cases" subtitle="Manage patient cases" />
      <CasesList initialCases={cases} initialStats={stats} />
    </div>
  );
}
```

- [ ] **Step 2: Create CasesList client component**

Create `apps/hospital/src/components/cases-list.tsx` — a `'use client'` component that:
- Renders stat cards (total, new, in progress, completed) from `initialStats`
- Renders tabs (All / New / In Progress / Completed) using `<Tabs>`
- Renders search input with 300ms debounce using `useDebounce`
- Uses `useCases({ search, page, status })` for client-side filtering/pagination
- Renders case cards in a grid, clicking navigates to `/cases/[id]`
- Uses `StatusBadge` for case status display

Reference `nexus-crm/src/App.tsx` lines 291-418 for the grid layout and card design.

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/app/\(portal\)/cases/ apps/hospital/src/components/cases-list.tsx
git commit -m "feat(hospital): cases list page with search, filter, pagination"
```

---

### Task 23: Case Detail Page (7 Tabs)

**Files:**
- Create: `apps/hospital/src/app/(portal)/cases/[id]/page.tsx`
- Create: `apps/hospital/src/components/case-detail-panel.tsx`

**Context:** Case detail has 7 tabs. Most data comes from the initial RSC load (`HospitalCaseDetailDTO`). Messages and Consultations tabs load additional data via React Query. Reference `nexus-crm/src/components/CaseDetail.tsx` for the tab layout.

- [ ] **Step 1: Create case detail RSC page**

```tsx
// apps/hospital/src/app/(portal)/cases/[id]/page.tsx
import { apiClient } from '@/lib/api-client';
import { CaseDetailPanel } from '@/components/case-detail-panel';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseDetail = await apiClient<any>(`/api/v2/cases/${id}`);

  return <CaseDetailPanel caseDetail={caseDetail} />;
}
```

- [ ] **Step 2: Create CaseDetailPanel client component**

Create `apps/hospital/src/components/case-detail-panel.tsx` — a `'use client'` component with 7 tabs:
1. **Intake** — read-only patient info + medical condition from `caseDetail`
2. **Documents** — list from `caseDetail.documents`, upload button (uses `uploadDocument` server action)
3. **Messages** — embedded `ChatLayout` with `showRetranslate={false}`, loads via `useConversations` + `useMessages`
4. **Diagnosis** — read-only display of `caseDetail.diagnoses[]`
5. **Marketing** — placeholder UI (no backend API)
6. **Invitation** — file upload for invitation letter
7. **Consultation** — list case consultations + create new button

Uses `<Tabs>` for tab switching, each tab renders a dedicated sub-component.

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/app/\(portal\)/cases/\[id\]/ apps/hospital/src/components/case-detail-panel.tsx
git commit -m "feat(hospital): case detail page with 7-tab panel"
```

---

## Chunk 5: Consultations + Video Room

### Task 24: Consultations Route Handlers

**Files:**
- Create: `apps/hospital/src/app/api/consultations/[id]/route.ts`
- Create: `apps/hospital/src/app/api/consultations/[id]/transcript/route.ts`

- [ ] **Step 1: Create consultation Route Handlers**

```typescript
// apps/hospital/src/app/api/consultations/[id]/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/consultations/${id}`);
```

```typescript
// apps/hospital/src/app/api/consultations/[id]/transcript/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/consultations/${id}/transcript`);
```

- [ ] **Step 2: Commit**

```bash
git add apps/hospital/src/app/api/consultations/
git commit -m "feat(hospital): consultation route handlers (detail + transcript)"
```

---

### Task 25: Consultations List Page + Mutations

**Files:**
- Create: `apps/hospital/src/app/(portal)/consultations/page.tsx`
- Create: `apps/hospital/src/components/consultations-list.tsx` (includes inline consultation cards)
- Create: `apps/hospital/src/actions/consultation-actions.ts`

**Context:** Consultations use cursor-based pagination (`useInfiniteQuery`). Cards are expandable to show AI summary. Consultation card rendering is inline in `consultations-list.tsx`. Reference `nexus-crm/src/components/ConsultationsView.tsx`.

- [ ] **Step 1: Create consultation-actions.ts**

```typescript
// apps/hospital/src/actions/consultation-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';

export async function createConsultation(data: {
  caseId: string;
  scheduledAt: string;
  durationMinutes?: number;
  notes?: string;
}) {
  const result = await apiClient('/api/v2/consultations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/consultations');
  revalidatePath('/dashboard');
  return result;
}

export async function updateConsultationStatus(id: string, action: string) {
  const result = await apiClient(`/api/v2/consultations/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
  revalidatePath('/consultations');
  revalidatePath('/dashboard');
  return result;
}
```

- [ ] **Step 2: Create consultations list page (RSC + client)**

```tsx
// apps/hospital/src/app/(portal)/consultations/page.tsx
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@medical-crm/ui';
import { ConsultationsList } from '@/components/consultations-list';

export default async function ConsultationsPage() {
  const [consultations, stats] = await Promise.all([
    apiClient<any>('/api/v2/consultations?status=SCHEDULED&limit=20'),
    apiClient<any>('/api/v2/consultations/stats'),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Consultations" subtitle="Manage video consultations" />
      <ConsultationsList initialData={consultations} initialStats={stats} />
    </div>
  );
}
```

- [ ] **Step 3: Create ConsultationsList client component**

Create `apps/hospital/src/components/consultations-list.tsx` — uses `useConsultations` hook with `useInfiniteQuery`, renders expandable consultation cards with AI summary, tab filter (Scheduled/Completed/All), create consultation modal.

- [ ] **Step 4: Commit**

```bash
git add apps/hospital/src/app/\(portal\)/consultations/ apps/hospital/src/components/consultations-list.tsx apps/hospital/src/actions/consultation-actions.ts
git commit -m "feat(hospital): consultations list page with cursor pagination and create modal"
```

---

### Task 26: Video Room Shell

**Files:**
- Create: `apps/hospital/src/app/(portal)/consultations/[id]/room/page.tsx`
- Create: `apps/hospital/src/components/video-room.tsx`

**Context:** Full-screen page that overrides the sidebar layout. Pre-join screen → in-call screen. WebRTC is deferred — UI shell only. Reference `nexus-crm/src/components/VideoConsultationRoom.tsx` (255 lines).

- [ ] **Step 1: Create video room page**

```tsx
// apps/hospital/src/app/(portal)/consultations/[id]/room/page.tsx
import { VideoRoom } from '@/components/video-room';

export default async function VideoRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VideoRoom consultationId={id} />;
}
```

- [ ] **Step 2: Create VideoRoom client component**

Create `apps/hospital/src/components/video-room.tsx` — `'use client'` component with:
- Pre-join screen (camera/mic toggle, join button)
- In-call screen (main video area, PiP, control bar)
- Control bar (mute, video, record, subtitles, end call)
- Subtitle overlay + history panel
- Timer display
- Uses `updateConsultationStatus` server action for start/complete

Reference `nexus-crm/src/components/VideoConsultationRoom.tsx` for the full layout.

**Important:** This page needs to override the sidebar layout. Use a route group or CSS to hide the sidebar. One approach: the `PortalShell` component checks if the pathname includes `/room` and hides the sidebar.

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/app/\(portal\)/consultations/\[id\]/room/ apps/hospital/src/components/video-room.tsx
git commit -m "feat(hospital): video room shell with pre-join and call UI"
```

---

## Chunk 6: Messages

### Task 27: Messages Route Handlers + Query Hooks

**Files:**
- Create: `apps/hospital/src/app/api/conversations/route.ts`
- Create: `apps/hospital/src/app/api/conversations/[id]/route.ts`
- Create: `apps/hospital/src/app/api/conversations/[id]/messages/route.ts`
- Create: `apps/hospital/src/queries/use-conversations.ts`
- Create: `apps/hospital/src/queries/use-messages.ts`

- [ ] **Step 1: Create conversation Route Handlers**

```typescript
// apps/hospital/src/app/api/conversations/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler((p) => `/api/v2/conversations?${p}`);
```

```typescript
// apps/hospital/src/app/api/conversations/[id]/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }) => `/api/v2/conversations/${id}`);
```

```typescript
// apps/hospital/src/app/api/conversations/[id]/messages/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }, p) => `/api/v2/conversations/${id}/messages?${p}`);
```

- [ ] **Step 2: Create query hooks**

```typescript
// apps/hospital/src/queries/use-conversations.ts
import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useConversations(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['conversations', params ?? {}],
    queryFn: () => queryFetch(`/api/conversations?${new URLSearchParams(params)}`),
  });
}
```

```typescript
// apps/hospital/src/queries/use-messages.ts
import { useQuery } from '@tanstack/react-query';
import { queryFetch } from './use-cases';

export function useMessages(conversationId: string, page = 1) {
  return useQuery({
    queryKey: ['conversations', conversationId, 'messages', { page }],
    queryFn: () => queryFetch(`/api/conversations/${conversationId}/messages?page=${page}&limit=50`),
    enabled: !!conversationId,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/app/api/conversations/ apps/hospital/src/queries/use-conversations.ts apps/hospital/src/queries/use-messages.ts
git commit -m "feat(hospital): conversation/message route handlers and query hooks"
```

---

### Task 28: Messages Page + Mutations

**Files:**
- Create: `apps/hospital/src/app/(portal)/messages/page.tsx`
- Create: `apps/hospital/src/components/messages-view.tsx`
- Create: `apps/hospital/src/actions/message-actions.ts`

**Context:** Split layout — left sidebar (conversation list) + right panel (ChatLayout). Reference `nexus-crm/src/components/MessagesView.tsx`.

- [ ] **Step 1: Create message-actions.ts**

```typescript
// apps/hospital/src/actions/message-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';

export async function sendMessage(conversationId: string, content: string) {
  const result = await apiClient(`/api/v2/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  return result;
}

export async function createConversation(data: { caseId: string; category: string }) {
  const result = await apiClient('/api/v2/conversations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/messages');
  return result;
}
```

- [ ] **Step 2: Create messages page (RSC)**

```tsx
// apps/hospital/src/app/(portal)/messages/page.tsx
import { apiClient } from '@/lib/api-client';
import { MessagesView } from '@/components/messages-view';

export default async function MessagesPage() {
  const conversations = await apiClient<any>('/api/v2/conversations');
  return <MessagesView initialConversations={conversations} />;
}
```

- [ ] **Step 3: Create MessagesView client component**

Create `apps/hospital/src/components/messages-view.tsx` — `'use client'` with:
- Left panel: conversation list grouped by category (ADMIN_HOSPITAL vs HOSPITAL_PATIENT)
- Client-side search filter on conversations
- Right panel: `ChatLayout` component from `@medical-crm/ui` with `showRetranslate={false}`
- Uses `useMessages(selectedConversationId)` for message loading
- Uses `sendMessage` server action + `invalidateQueries` on success
- "New Conversation" button with modal

- [ ] **Step 4: Commit**

```bash
git add apps/hospital/src/app/\(portal\)/messages/ apps/hospital/src/components/messages-view.tsx apps/hospital/src/actions/message-actions.ts
git commit -m "feat(hospital): messages page with conversation list and chat layout"
```

---

## Chunk 7: Materials Backend

### Task 29: Materials Domain Port

**Files:**
- Create: `packages/domain/src/ports/materials-repository.port.ts`
- Modify: `packages/domain/src/ports/index.ts` (if barrel export exists)

- [ ] **Step 0: Schema Discovery (MUST do first)**

Read `packages/infrastructure/supabase-main/types.ts` in full. The Supabase schema has:
- `hospitals` table: has `slug`, `hero_image`, `photos[]`, `highlights[]`, `crm_metadata`, `payment_methods[]` — NOT flat `address`/`phone`/`email` (those are in `hospital_locations`)
- `hospital_procedures` (join table: `price_range`, `price_min`, `price_max`, `is_popular`, `sort_order`) + `procedures` (lookup: `procedure_name`, `slug`, `description`)
- `surgeons`: has `image_url`, `title`, `experience_years`, `education[]`, `certifications[]`, `bio: {...}`, `images: {...}`, `translations: {...}`
- `procedure_cases` + `case_images`: one-to-many (case → multiple images of type `'before' | 'after' | 'combined'`)

The interfaces below are **simplified placeholders**. The implementer MUST read the actual types and adjust all interfaces to match the real schema before writing use cases or repository code.

- [ ] **Step 1: Create IMaterialsRepository interface**

```typescript
// packages/domain/src/ports/materials-repository.port.ts
// NOTE: "MaterialsHospitalInfo" avoids name collision with existing HospitalInfo in hospital-repository.port.ts

export interface MaterialsHospitalInfo {
  id: string;
  name: string;
  slug: string;
  heroImage: string | null;
  photos: string[];
  highlights: string[];
  // Add more fields from SupabaseHospital as needed — see types.ts
}

export interface MaterialsProcedure {
  id: string;
  hospitalId: string;
  procedureName: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceRange: string | null;
  isPopular: boolean;
  sortOrder: number;
}

export interface MaterialsSurgeon {
  id: string;
  hospitalId: string;
  name: string;
  title: string | null;
  imageUrl: string | null;
  experienceYears: number | null;
  specialties: string[];
  languages: string[];
}

export interface MaterialsBeforeAfterCase {
  id: string;
  hospitalId: string;
  procedureName: string;
  surgeonName: string | null;
  description: string | null;
  images: Array<{ url: string; type: 'before' | 'after' | 'combined' }>;
}

export interface IMaterialsRepository {
  // Hospital Info
  getHospitalInfo(hospitalId: string): Promise<MaterialsHospitalInfo | null>;
  updateHospitalInfo(hospitalId: string, data: Partial<MaterialsHospitalInfo>): Promise<MaterialsHospitalInfo>;

  // Procedures
  listProcedures(hospitalId: string): Promise<MaterialsProcedure[]>;
  createProcedure(data: Omit<MaterialsProcedure, 'id'>): Promise<MaterialsProcedure>;
  updateProcedure(id: string, data: Partial<MaterialsProcedure>): Promise<MaterialsProcedure>;
  deleteProcedure(id: string): Promise<void>;

  // Surgeons
  listSurgeons(hospitalId: string): Promise<MaterialsSurgeon[]>;
  createSurgeon(data: Omit<MaterialsSurgeon, 'id'>): Promise<MaterialsSurgeon>;
  updateSurgeon(id: string, data: Partial<MaterialsSurgeon>): Promise<MaterialsSurgeon>;
  deleteSurgeon(id: string): Promise<void>;

  // Before & After Cases
  listBeforeAfterCases(hospitalId: string): Promise<MaterialsBeforeAfterCase[]>;
  createBeforeAfterCase(data: Omit<MaterialsBeforeAfterCase, 'id'>): Promise<MaterialsBeforeAfterCase>;
  updateBeforeAfterCase(id: string, data: Partial<MaterialsBeforeAfterCase>): Promise<MaterialsBeforeAfterCase>;
  deleteBeforeAfterCase(id: string): Promise<void>;
}
```

**IMPORTANT:** These interfaces are simplified placeholders. The implementer MUST:
1. Read `packages/infrastructure/supabase-main/types.ts` for actual column names and types
2. Adjust all interfaces to match the real Supabase schema
3. Handle join tables (hospital_procedures → procedures) in the repository adapter
4. Handle one-to-many images (procedure_cases → case_images) in the repository adapter

- [ ] **Step 2: Commit**

```bash
git add packages/domain/src/ports/materials-repository.port.ts
git commit -m "feat(domain): add IMaterialsRepository port for materials module"
```

---

### Task 30: Materials Use Cases

**Files:**
- Create: `packages/application/src/use-cases/materials/get-hospital-info.use-case.ts`
- Create: `packages/application/src/use-cases/materials/get-procedures.use-case.ts`
- Create: `packages/application/src/use-cases/materials/get-surgeons.use-case.ts`
- Create: `packages/application/src/use-cases/materials/get-before-after-cases.use-case.ts`
- Create: `packages/application/src/use-cases/materials/update-hospital-info.use-case.ts`
- Create: `packages/application/src/use-cases/materials/create-procedure.use-case.ts`
- (+ update/delete for procedures, surgeons, before-after cases — 14 total)

**Context:** Each use case follows the existing pattern: constructor with repo injection, `execute(input, actor)` method. Authorization: HOSPITAL users can only access their own hospital's materials.

- [ ] **Step 1: Create read use cases (4 files)**

Each follows the same pattern:

```typescript
// packages/application/src/use-cases/materials/get-hospital-info.use-case.ts
import type { IMaterialsRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class GetHospitalInfoUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, actor: Actor) {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied');
    }
    const info = await this.materialsRepo.getHospitalInfo(hospitalId);
    if (!info) throw new NotFoundError(`Hospital ${hospitalId} not found`);
    return info;
  }
}
```

Repeat pattern for `GetProceduresUseCase`, `GetSurgeonsUseCase`, `GetBeforeAfterCasesUseCase`.

- [ ] **Step 2: Create write use cases (10 files)**

Follow existing CRUD patterns. Each validates `actor.hospitalId === hospitalId` for HOSPITAL role. Create, update, delete for procedures, surgeons, and before-after cases, plus updateHospitalInfo.

- [ ] **Step 3: Write unit tests for authorization logic**

Test that HOSPITAL users can only access their own hospital, ADMIN can access any.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @medical-crm/application test -- --run materials`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/materials/ packages/application/__tests__/materials/
git commit -m "feat(application): materials use cases with authorization"
```

---

### Task 31: Supabase Materials Repository

**Files:**
- Create: `packages/infrastructure/supabase-main/supabase-materials.repository.ts`

**Context:** Implements `IMaterialsRepository` using the existing Main Supabase client. Read the actual table structure from `packages/infrastructure/supabase-main/types.ts` to map fields correctly.

- [ ] **Step 1: Read Supabase types to understand table structure**

Read `packages/infrastructure/supabase-main/types.ts` to find the table names and column types for hospitals, procedures, surgeons, and before/after photos.

- [ ] **Step 2: Implement SupabaseMaterialsRepository**

```typescript
// packages/infrastructure/supabase-main/supabase-materials.repository.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IMaterialsRepository } from '@medical-crm/domain';

export class SupabaseMaterialsRepository implements IMaterialsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getHospitalInfo(hospitalId: string) {
    const { data, error } = await this.supabase
      .from('hospitals')
      .select('*')
      .eq('id', hospitalId)
      .single();
    if (error || !data) return null;
    return data;
  }

  // ... implement all methods using Supabase queries
}
```

- [ ] **Step 3: Wire into composition-root.ts**

Add `IMaterialsRepository` instantiation in `apps/api/src/composition-root.ts`, using the Main Supabase client.

- [ ] **Step 4: Commit**

```bash
git add packages/infrastructure/supabase-main/supabase-materials.repository.ts apps/api/src/composition-root.ts
git commit -m "feat(infrastructure): Supabase materials repository + DI wiring"
```

---

### Task 32: Materials API Routes

**Files:**
- Create: `apps/api/src/routes/materials.routes.ts`
- Modify: `apps/api/src/index.ts` (register routes)

**Context:** Hono routes for all materials endpoints. Follow the existing route pattern in `consultations.routes.ts`.

- [ ] **Step 1: Create materials.routes.ts**

14 routes following the Hono OpenAPI pattern:
- `GET /api/v2/hospitals/:id/materials/info`
- `POST /api/v2/hospitals/:id/materials/info`
- `GET /api/v2/hospitals/:id/materials/procedures` + CRUD
- `GET /api/v2/hospitals/:id/materials/surgeons` + CRUD
- `GET /api/v2/hospitals/:id/materials/cases` + CRUD

Each route: validate input with Zod, extract actor from session, call use case, return JSON.

- [ ] **Step 2: Register routes in index.ts**

Add `app.route('/', materialsRoutes)` in `apps/api/src/index.ts`.

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/materials.routes.ts apps/api/src/index.ts
git commit -m "feat(api): materials routes — 14 endpoints for hospital materials CRUD"
```

---

## Chunk 8: Materials Frontend

### Task 33: Materials Route Handlers + Query Hooks

**Files:**
- Create: `apps/hospital/src/lib/session-helpers.ts`
- Create: `apps/hospital/src/app/api/materials/route.ts`
- Create: `apps/hospital/src/app/api/materials/procedures/route.ts`
- Create: `apps/hospital/src/app/api/materials/surgeons/route.ts`
- Create: `apps/hospital/src/app/api/materials/cases/route.ts`
- Create: `apps/hospital/src/queries/use-materials.ts`

**Context:** Materials Route Handlers need the hospital ID from auth context. The `(portal)/layout.tsx` can pass `hospitalId` via a cookie or header, or the Route Handler can read it from the session.

- [ ] **Step 1: Create materials Route Handlers**

These need `hospitalId` from the session JWT. First, create a shared helper, then use it in each handler.

**Create `getSessionHospitalId` helper:**

```typescript
// apps/hospital/src/lib/session-helpers.ts
import { getSession } from './session';

/** Decode hospitalId from the session JWT access token. */
export async function getSessionHospitalId(): Promise<string | null> {
  const session = await getSession();
  if (!session.access_token) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split('.')[1], 'base64url').toString()
    );
    return (payload.hospital_id as string) ?? null;
  } catch {
    return null;
  }
}
```

**Then each Route Handler uses a compact pattern:**

```typescript
// apps/hospital/src/app/api/materials/route.ts
import { apiFetch } from '@/lib/api-fetch';
import { getSessionHospitalId } from '@/lib/session-helpers';

export async function GET(): Promise<Response> {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) return Response.json({ error: 'No hospital ID' }, { status: 403 });

  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/materials/info`);
  if (!res.ok) return Response.json(await res.json().catch(() => ({})), { status: res.status });
  return Response.json(await res.json());
}
```

Repeat pattern for procedures (`/api/v2/hospitals/${hospitalId}/materials/procedures`), surgeons, cases.

- [ ] **Step 2: Create use-materials.ts query hooks**

```typescript
// apps/hospital/src/queries/use-materials.ts
import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useMaterialsInfo() {
  return useQuery({
    queryKey: ['materials', 'info'],
    queryFn: () => queryFetch('/api/materials'),
  });
}

export function useProcedures() {
  return useQuery({
    queryKey: ['materials', 'procedures'],
    queryFn: () => queryFetch('/api/materials/procedures'),
  });
}

export function useSurgeons() {
  return useQuery({
    queryKey: ['materials', 'surgeons'],
    queryFn: () => queryFetch('/api/materials/surgeons'),
  });
}

export function useBeforeAfterCases() {
  return useQuery({
    queryKey: ['materials', 'cases'],
    queryFn: () => queryFetch('/api/materials/cases'),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/app/api/materials/ apps/hospital/src/queries/use-materials.ts
git commit -m "feat(hospital): materials route handlers and query hooks"
```

---

### Task 34: Materials Page (4 Tabs)

**Files:**
- Create: `apps/hospital/src/app/(portal)/materials/page.tsx`
- Create: `apps/hospital/src/components/materials-tabs.tsx`
- Create: `apps/hospital/src/actions/materials-actions.ts` (if not created)

**Context:** 4-tab page: Hospital Info, Procedures, Surgeons, Before & After. Reference `nexus-crm/src/components/MarketingMaterialsView.tsx` (699 lines). This is the largest frontend component.

- [ ] **Step 1: Create materials-actions.ts**

```typescript
// apps/hospital/src/actions/materials-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';
import { getSessionHospitalId } from '@/lib/session-helpers';

export async function updateHospitalInfo(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/info`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/materials');
  return result;
}

export async function createProcedure(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/procedures`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/materials');
  return result;
}

// ... similar for updateProcedure, deleteProcedure, createSurgeon, etc.
```

- [ ] **Step 2: Create materials page (RSC)**

```tsx
// apps/hospital/src/app/(portal)/materials/page.tsx
import { PageHeader } from '@medical-crm/ui';
import { MaterialsTabs } from '@/components/materials-tabs';

export default function MaterialsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Marketing Materials" subtitle="Manage your hospital's public profile" />
      <MaterialsTabs />
    </div>
  );
}
```

- [ ] **Step 3: Create MaterialsTabs client component**

Create `apps/hospital/src/components/materials-tabs.tsx` — `'use client'` component with 4 tabs:
1. **Hospital Info** — editable form (edit mode toggle), uses `useMaterialsInfo` + `updateHospitalInfo`
2. **Procedures** — `DataTable` + create/edit modal, uses `useProcedures` + CRUD actions
3. **Surgeons** — card grid + create/edit modal, uses `useSurgeons` + CRUD actions
4. **Before & After** — photo grid with before/after split, uses `useBeforeAfterCases` + CRUD actions

Reference `nexus-crm/src/components/MarketingMaterialsView.tsx` for all 4 tab layouts.

- [ ] **Step 4: Run typecheck + visual test**

Run: `pnpm --filter @medical-crm/hospital typecheck && pnpm --filter @medical-crm/hospital dev`
Expected: Compiles, all 4 tabs render

- [ ] **Step 5: Commit**

```bash
git add apps/hospital/src/app/\(portal\)/materials/ apps/hospital/src/components/materials-tabs.tsx apps/hospital/src/actions/materials-actions.ts
git commit -m "feat(hospital): materials page with 4-tab layout and CRUD"
```

---

## Final: Typecheck + Build Verification

### Task 35: Full Build Verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass

- [ ] **Step 2: Run full test suite**

Run: `pnpm turbo test`
Expected: All tests pass

- [ ] **Step 3: Build hospital app**

Run: `pnpm --filter @medical-crm/hospital build`
Expected: Next.js build completes without errors

- [ ] **Step 4: Commit any fixes**

If typecheck/build reveals issues, fix them and commit.

- [ ] **Step 5: Final commit summary**

```bash
git log --oneline -20
```

Review all commits for this phase.
