# Phase 3: Hospital Portal UI — Design Specification

> **Scope**: Hospital Portal (COSMETIC type only) — shared UI components + full frontend integration with v2 backend
> **Deferred**: Admin Portal, Regular hospitals, WebRTC video, real-time subtitles, Patient Portal
> **Date**: 2026-03-15
> **Note**: Originally Phase 4 in the architecture design doc; re-prioritized to Phase 3 because Hospital Portal has a working prototype (nexus-crm) and Admin Portal needs redesign.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Monorepo Structure](#2-monorepo-structure)
- [3. Shared UI Package](#3-shared-ui-package)
- [4. Routing & Page Structure](#4-routing--page-structure)
- [5. Auth Flow](#5-auth-flow)
- [6. Data Fetching Architecture](#6-data-fetching-architecture)
- [7. State Management](#7-state-management)
- [8. Page-by-Page Feature Mapping](#8-page-by-page-feature-mapping)
- [9. Materials Backend Module](#9-materials-backend-module)
- [10. Error Handling](#10-error-handling)
- [11. File Upload](#11-file-upload)
- [12. Deferred Scope](#12-deferred-scope)
- [13. Technical Constraints & Conventions](#13-technical-constraints--conventions)
- [14. New Dependencies](#14-new-dependencies)

---

## 1. Overview

### Goal

Migrate the nexus-crm prototype (Vite + React 19, hardcoded data) into the medical-crm-v2 monorepo as a production Hospital Portal, connected to the v2 backend API.

### What We're Building

1. **Extend `packages/shared/ui/`** — extract 14+ reusable components from nexus-crm into the existing `@medical-crm/ui` package
2. **Hospital Portal** (`apps/hospital/`) — 5 main pages + auth, powered by Next.js 15 App Router
3. **Materials backend module** — new API routes in `apps/api/` for hospital marketing materials (reads Main Supabase)
4. **Data fetching layer** — RSC + narrow Route Handlers + Server Actions, integrated with React Query

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| UI Library | React 19 |
| Server state | TanStack React Query v5 |
| Styling | Tailwind CSS v4 |
| Animations | Motion (Framer Motion alternative) |
| Icons | Lucide React |
| Font | Poppins (300–700) |
| Auth | Keycloak PKCE + iron-session (existing) |
| API | Hono REST API (existing, port 3001) |

---

## 2. Monorepo Structure

```
medical-crm-v2/
├── apps/
│   ├── api/                          # Hono API (existing + new Materials routes)
│   ├── hospital/                     # Next.js 15 Hospital Portal ← PRIMARY WORK
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx        # Root: fonts, QueryProvider, globals
│   │   │   │   ├── auth/             # Login/callback/logout (existing)
│   │   │   │   ├── (portal)/         # Auth-guarded pages
│   │   │   │   │   ├── layout.tsx    # Sidebar + Header shell
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── cases/
│   │   │   │   │   ├── consultations/
│   │   │   │   │   ├── messages/
│   │   │   │   │   └── materials/
│   │   │   │   └── api/              # BFF Route Handlers (narrow, per-domain)
│   │   │   │       ├── cases/
│   │   │   │       ├── consultations/
│   │   │   │       ├── conversations/
│   │   │   │       └── materials/
│   │   │   ├── lib/
│   │   │   │   ├── api-fetch.ts      # Low-level fetch + JWT + token refresh (NO redirect)
│   │   │   │   ├── api-client.ts     # RSC/Server Actions wrapper (redirect on auth failure)
│   │   │   │   ├── route-handler-helpers.ts  # Route Handler factory (JSON 401/403)
│   │   │   │   ├── query-client.ts   # React Query config
│   │   │   │   ├── query-provider.tsx # QueryClientProvider ("use client")
│   │   │   │   └── auth-context.tsx  # useAuth() hook
│   │   │   ├── queries/              # React Query hooks per domain
│   │   │   │   ├── use-cases.ts
│   │   │   │   ├── use-consultations.ts
│   │   │   │   ├── use-conversations.ts
│   │   │   │   ├── use-messages.ts
│   │   │   │   ├── use-documents.ts   # useDocuments(caseId) → /api/cases/{caseId}/documents
│   │   │   │   ├── use-materials.ts
│   │   │   │   └── use-progress.ts   # useProgress(caseId) → /api/cases/{caseId}/progress
│   │   │   ├── actions/              # Server Actions (mutations only)
│   │   │   │   ├── case-actions.ts
│   │   │   │   ├── message-actions.ts
│   │   │   │   ├── consultation-actions.ts
│   │   │   │   └── document-actions.ts
│   │   │   └── components/           # Hospital-specific composite components
│   │   └── package.json
│   └── admin/                        # (deferred — shell exists)
│
├── packages/
│   └── shared/
│       ├── ui/                       # @medical-crm/ui ← EXTEND (currently: Button + cn)
│       │   ├── src/
│       │   │   ├── components/
│       │   │   │   ├── button.tsx    # (existing)
│       │   │   │   ├── stat-card.tsx
│       │   │   │   ├── status-badge.tsx
│       │   │   │   ├── data-table.tsx
│       │   │   │   ├── chat-layout.tsx
│       │   │   │   ├── modal.tsx
│       │   │   │   ├── search-input.tsx
│       │   │   │   ├── sidebar-nav.tsx
│       │   │   │   ├── page-header.tsx
│       │   │   │   ├── tabs.tsx
│       │   │   │   ├── avatar.tsx
│       │   │   │   ├── card.tsx
│       │   │   │   ├── empty-state.tsx
│       │   │   │   ├── loading-spinner.tsx
│       │   │   │   └── confirm-dialog.tsx
│       │   │   ├── hooks/
│       │   │   │   └── use-debounce.ts
│       │   │   ├── lib/
│       │   │   │   ├── cn.ts         # (existing)
│       │   │   │   ├── format-date.ts
│       │   │   │   └── theme.ts      # Design tokens
│       │   │   └── index.ts
│       │   └── package.json          # @medical-crm/ui (existing)
│       ├── config/                   # (existing)
│       ├── i18n/                     # (existing)
│       ├── validation/               # (existing)
│       └── utils/                    # (existing)
```

**Key decisions:**
- `packages/shared/ui/` is the ONLY shared UI package — no `packages/ui/`
- Components in `packages/shared/ui/` are pure presentational (no business logic, no API calls)
- Hospital-specific composite components (CaseDetailPanel, VideoRoom, etc.) live in `apps/hospital/src/components/`
- All shared components must be designed for admin portal reuse (deferred scope)
- New components use `class-variance-authority` (CVA) for variant management, following the existing `Button` pattern
- The existing flat structure (`button.tsx`, `cn.ts` at `src/` root) will be reorganized into subdirectories (`components/`, `hooks/`, `lib/`) for internal organization. The public API remains a **single root barrel export** — consumers always import from `@medical-crm/ui`:

```json
{
  "exports": {
    ".": "./src/index.ts"
  }
}
```

```typescript
// src/index.ts — root barrel export, all public API
export { Button } from './components/button';
export { StatCard } from './components/stat-card';
export { Modal } from './components/modal';
export { cn } from './lib/cn';
// ... etc.
```

Subpath exports (`@medical-crm/ui/components/*`) are NOT needed at this stage. Add them only if tree-shaking or bundle size becomes a measured problem.

- Tailwind v4 content scanning: the hospital app's CSS must include a `@source` directive pointing to the shared UI package so Tailwind scans its classes:

```css
/* apps/hospital/src/app/globals.css */
@import "tailwindcss";
@source "../../../../packages/shared/ui/src/**/*.tsx";
```

---

## 3. Shared UI Package

### Components to Extract from nexus-crm

| Component | Source File | Props Interface |
|-----------|------------|-----------------|
| `StatCard` | App.tsx, ConsultationsView | `icon: LucideIcon, value: string \| number, label: string, colorClass?: string` |
| `StatusBadge` | App.tsx | `status: string, variant?: 'pill' \| 'dot', size?: 'sm' \| 'md', colorMap?: Record<string, string>` |
| `SearchInput` | multiple | `value: string, onChange: (v: string) => void, placeholder?: string, debounceMs?: number` |
| `Modal` | MarketingMaterialsView | `open: boolean, onClose: () => void, title: string, maxWidth?: string, children: ReactNode` |
| `ChatLayout` | ChatLayout.tsx | `messages: Message[], onSend: (content: string) => void, patientInfo?: PatientInfo, showTranslation?: boolean` |
| `DataTable` | new | `columns: Column[], data: T[], pagination?: PaginationState, onPageChange?: (page: number) => void` |
| `SidebarNav` | App.tsx | `items: NavItem[], activeHref: string` |
| `PageHeader` | multiple | `title: string, subtitle?: string, actions?: ReactNode` |
| `Tabs` | multiple | `items: TabItem[], activeKey: string, onChange: (key: string) => void` |
| `Avatar` | multiple | `src?: string, name: string, size?: 'sm' \| 'md' \| 'lg'` |
| `Card` | multiple | `className?: string, children: ReactNode` |
| `EmptyState` | new | `icon: LucideIcon, title: string, description?: string, action?: ReactNode` |
| `LoadingSpinner` | new | `size?: 'sm' \| 'md' \| 'lg'` |
| `ConfirmDialog` | new | `open: boolean, title: string, message: string, onConfirm: () => void, onCancel: () => void` |

### ChatLayout — Hospital vs Admin Differences

The `ChatLayout` component in nexus-crm includes a "retranslate" button. The backend `RetranslateMessageUseCase` is **ADMIN-only** (throws `ForbiddenError` for non-ADMIN roles). Therefore:

- `ChatLayout` accepts a `showRetranslate?: boolean` prop (default: `false`)
- Hospital portal passes `showRetranslate={false}`
- Admin portal (future) passes `showRetranslate={true}`

### Design Tokens

```typescript
// packages/shared/ui/src/lib/theme.ts
export const theme = {
  colors: {
    primary: 'indigo',       // #6366f1
    success: 'emerald',
    warning: 'amber',
    danger: 'rose',
    info: 'cyan',
  },
  font: 'Poppins',
  radius: {
    card: '1.5rem',
    button: '9999px',        // full rounded
    input: '0.75rem',
    badge: '0.375rem',
  },
  shadow: {
    card: '0 4px 20px -4px rgba(0,0,0,0.02)',
    hover: '0 8px 30px -4px rgba(0,0,0,0.08)',
  },
} as const;
```

---

## 4. Routing & Page Structure

```
apps/hospital/src/app/
├── layout.tsx                        # Root: fonts, QueryProvider, globals
├── auth/                             # Auth routes (EXISTING — do not modify)
│   ├── login/route.ts                # GET → PKCE → redirect to Keycloak
│   ├── callback/route.ts             # GET → exchange code → store session → redirect /
│   └── logout/route.ts               # GET → destroy session → Keycloak end-session redirect
│
├── (portal)/                         # Auth-guarded route group
│   ├── layout.tsx                    # AuthGuard + SidebarNav + Header + main content area
│   ├── page.tsx                      # / → redirect to /dashboard
│   │
│   ├── dashboard/
│   │   └── page.tsx                  # Today's consultations, new cases, pending messages
│   │
│   ├── cases/
│   │   ├── page.tsx                  # Case list (stats + search + filter + grid)
│   │   └── [id]/
│   │       └── page.tsx              # Case detail (7 tabs)
│   │
│   ├── consultations/
│   │   ├── page.tsx                  # Consultation list (Scheduled/Completed/All)
│   │   └── [id]/
│   │       └── room/
│   │           └── page.tsx          # Video room (full-screen, override sidebar layout)
│   │
│   ├── messages/
│   │   └── page.tsx                  # Left: conversation list, Right: ChatLayout
│   │
│   └── materials/
│       └── page.tsx                  # 4 tabs: Info, Procedures, Surgeons, Before & After
│
├── api/                              # BFF Route Handlers (queries only)
│   ├── cases/
│   │   ├── route.ts                  # GET /api/cases
│   │   ├── stats/route.ts           # GET /api/cases/stats
│   │   └── [id]/
│   │       ├── route.ts             # GET /api/cases/:id
│   │       ├── documents/route.ts   # GET /api/cases/:id/documents
│   │       ├── progress/route.ts    # GET /api/cases/:id/progress
│   │       └── consultations/route.ts  # GET /api/cases/:id/consultations
│   ├── consultations/
│   │   ├── route.ts                  # GET /api/consultations
│   │   ├── stats/route.ts           # GET /api/consultations/stats
│   │   └── [id]/
│   │       ├── route.ts             # GET /api/consultations/:id
│   │       └── transcript/route.ts  # GET /api/consultations/:id/transcript
│   ├── conversations/
│   │   ├── route.ts                  # GET /api/conversations
│   │   └── [id]/
│   │       ├── route.ts             # GET /api/conversations/:id
│   │       └── messages/route.ts    # GET /api/conversations/:id/messages
│   └── materials/
│       ├── route.ts                  # GET /api/materials (hospital info)
│       ├── procedures/route.ts      # GET /api/materials/procedures
│       ├── surgeons/route.ts        # GET /api/materials/surgeons
│       └── cases/route.ts           # GET /api/materials/cases (before & after)
│
├── error.tsx                         # Global error boundary
└── loading.tsx                       # Global loading (Suspense fallback)
```

**Conventions:**
- Auth routes live under `/auth/*` (matching existing middleware redirect target)
- `(portal)` is a Next.js route group — does not affect URL
- Video Room (`consultations/[id]/room`) renders full-screen, overriding the sidebar layout
- Messages is a single-page design (left/right split), no sub-routes
- All Route Handlers under `app/api/` are GET-only (queries); mutations use Server Actions

---

## 5. Auth Flow

### Existing Implementation (No Changes Needed)

The auth flow is **already implemented** in `apps/hospital/`:

- `src/lib/session.ts` — iron-session config (`medical-crm-hospital-session`, httpOnly, 7 days)
- `src/app/auth/login/route.ts` — PKCE code challenge generation → Keycloak redirect
- `src/app/auth/callback/route.ts` — Code exchange → token storage in session
- `src/app/auth/logout/route.ts` — Session destroy → Keycloak end-session
- `src/middleware.ts` — Edge middleware, checks for session cookie, redirects to `/auth/login`

**Middleware update required:** The existing middleware matcher `/((?!auth|_next/static|_next/image|favicon.ico).*)` must be updated to exclude `/api` routes: `/((?!auth|api|_next/static|_next/image|favicon.ico).*)`. BFF Route Handlers have their own auth handling via `apiFetch` and must not be intercepted by the session-check middleware (avoids redirect loops when session cookie exists but tokens are expired).

### Keycloak Reuse

Same Keycloak instance as v1:
- Realm: `medical-crm`
- Client: `portal-web` (public OIDC)
- No Keycloak configuration changes needed

### New: Auth Context for Client Components

```typescript
// apps/hospital/src/lib/auth-context.tsx
'use client'

// Provides useAuth() hook with:
// - user: { id, email, roles, hospitalId } (decoded from session, passed via RSC → client)
// - logout: () => void (navigates to /auth/logout — GET request, matching existing route handler)
```

The `(portal)/layout.tsx` (Server Component) reads the session, extracts user info, and passes it to the `AuthProvider` client component as props. This avoids exposing the JWT to the client.

---

## 6. Data Fetching Architecture

### Three-Layer Design

```
┌───────────────────────────────────────────────────────────────────┐
│  Layer 1: RSC (initial page data)                                 │
│  Server Components call apiClient() directly                      │
│  Can use Promise.all for parallel fetching                        │
│  Example: Dashboard page fetches cases + consultations + messages │
├───────────────────────────────────────────────────────────────────┤
│  Layer 2: Route Handlers (client-side queries)                    │
│  React Query hooks call /api/* Route Handlers via fetch()         │
│  HTTP GET = naturally parallel                                    │
│  For: search, filter, paginate, poll, refetch on focus            │
├───────────────────────────────────────────────────────────────────┤
│  Layer 3: Server Actions (mutations)                              │
│  React Query useMutation calls Server Actions                     │
│  Sequential execution is fine for mutations                       │
│  For: create, update, delete, send message                        │
└───────────────────────────────────────────────────────────────────┘
```

**Why not Server Actions for queries:** Next.js dispatches Server Actions from the client **sequentially** (queued). A Dashboard that needs 3 parallel data fetches would take 3x longer. Route Handlers are standard HTTP GET endpoints — React Query can fire them in parallel.

Sources:
- https://nextjs.org/docs/app/guides/backend-for-frontend
- https://nextjs.org/docs/app/getting-started/updating-data

### Breaking Change: api-client.ts Refactor

The existing `api-client.ts` returns a raw `Response` object. The new `apiClient` returns parsed JSON (`Promise<T>`). This is a **breaking change** — any existing code calling `apiClient()` and then manually calling `.json()` will break. Existing tests in `apps/hospital/src/__tests__/session.test.ts` must be updated accordingly. The `server-only` npm package is recommended (add to `apps/hospital/package.json`) but not strictly required — `getSession()` → `cookies()` naturally prevents client-side usage.

### 6.1 api-fetch.ts — Low-Level Fetch (No Redirect)

```typescript
// apps/hospital/src/lib/api-fetch.ts
// NO 'server-only' — shared between apiClient and route-handler-helpers.
// Route Handlers are Node.js handlers, not React Server Components,
// so 'server-only' would incorrectly block them.
// Client-side import is naturally prevented because api-fetch.ts uses
// getSession() which calls cookies() from next/headers (server-only API).
//
// The refreshToken() function (currently in api-client.ts lines 36-65)
// moves here — it is the shared auth primitive used by both apiClient
// and route-handler-helpers.

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Low-level fetch wrapper. Attaches JWT from iron-session.
 * Refreshes token if within 60s of expiry.
 * Returns raw Response — caller decides how to handle errors.
 * Does NOT call redirect() — safe for all server contexts.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const session = await getSession();

  if (!session.access_token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Token refresh logic (same as existing api-client.ts lines 14-24)
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
```

### ApiError Class

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

### 6.2 api-client.ts — RSC / Server Actions (With Redirect)

```typescript
// apps/hospital/src/lib/api-client.ts
import 'server-only';  // RECOMMENDED: prevents accidental client-side import
import { redirect } from 'next/navigation';
import { apiFetch } from './api-fetch';
import { ApiError } from './errors';

/**
 * For use in Server Components and Server Actions ONLY.
 * Redirects to /auth/login on auth failure.
 */
export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
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

### 6.3 route-handler-helpers.ts — Route Handler Factory

```typescript
// apps/hospital/src/lib/route-handler-helpers.ts
import { NextRequest } from 'next/server';
import { apiFetch } from './api-fetch';

/**
 * Factory for GET Route Handlers.
 * Returns JSON on success, JSON error on failure. Never redirects.
 */
export function createQueryHandler(
  buildPath: (searchParams: URLSearchParams) => string
) {
  return async function GET(request: NextRequest): Promise<Response> {
    const res = await apiFetch(buildPath(request.nextUrl.searchParams));

    // Always return JSON — never redirect, never return HTML
    if (!res.ok) {
      const body = await res.text();
      return Response.json(
        safeParseJson(body) ?? { error: 'Upstream error', status: res.status },
        { status: res.status }
      );
    }

    // Handle empty body (e.g., 204)
    const text = await res.text();
    if (!text) return new Response(null, { status: 204 });

    return Response.json(JSON.parse(text));
  };
}

/**
 * Factory for GET Route Handlers with dynamic path segments.
 */
export function createParamQueryHandler(
  buildPath: (params: Record<string, string>, searchParams: URLSearchParams) => string
) {
  return async function GET(
    request: NextRequest,
    { params }: { params: Promise<Record<string, string>> }
  ): Promise<Response> {
    const resolvedParams = await params;
    const res = await apiFetch(
      buildPath(resolvedParams, request.nextUrl.searchParams)
    );

    if (!res.ok) {
      const body = await res.text();
      return Response.json(
        safeParseJson(body) ?? { error: 'Upstream error', status: res.status },
        { status: res.status }
      );
    }

    const text = await res.text();
    if (!text) return new Response(null, { status: 204 });

    return Response.json(JSON.parse(text));
  };
}

function safeParseJson(text: string): unknown | null {
  try { return JSON.parse(text); }
  catch { return null; }
}
```

**Usage — each Route Handler is one line:**

```typescript
// app/api/cases/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler((p) => `/api/v2/cases?${p}`);

// app/api/cases/[id]/route.ts
// Note: Next.js dynamic segment [id] maps to Hono's {caseId} path param.
// The factory's buildPath function handles this translation — param names
// do not need to match between Next.js file system and Hono routes.
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(
  ({ id }) => `/api/v2/cases/${id}`
);

// app/api/cases/stats/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler(() => '/api/v2/cases/stats');
```

### 6.4 Route Handler Caching Policy

All query Route Handlers under `app/api/` use Next.js **default dynamic behavior** (no caching). We do NOT set `export const dynamic = 'force-static'` or any revalidation config on these routes.

Rationale: CRM data changes frequently (cases, messages, consultations). Caching at the Route Handler level would cause stale data. Cache management is handled by React Query on the client side.

**Hard rule:** No `export const revalidate`, no `export const dynamic = 'force-static'` on any Route Handler in `app/api/`. If someone needs caching, it must go through React Query's `staleTime` configuration.

### 6.5 React Query Configuration

```typescript
// apps/hospital/src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,          // 30s — don't refetch within this window
        gcTime: 5 * 60_000,         // 5min — garbage collect unused cache
        retry: 1,                   // Retry once on failure
        refetchOnWindowFocus: true,  // Refetch when user returns to tab
      },
    },
  });
}
```

### 6.6 React Query Hooks (Example)

```typescript
// apps/hospital/src/queries/use-cases.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// All React Query hooks must throw ApiError (not generic Error) so the
// global QueryCache.onError handler can detect 401 and trigger login redirect.

import { ApiError } from '@/lib/errors';

async function queryFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, body);
  }
  return res.json();
}

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

### 6.7 Mutation Invalidation Strategy

After mutations, both RSC revalidation and React Query cache invalidation must happen. The table below specifies which keys to invalidate for each mutation:

| Mutation | Server Action | React Query `invalidateQueries` | `revalidatePath` |
|----------|--------------|--------------------------------|-------------------|
| Create case | `createCase()` | `['cases']`, `['cases', 'stats']` | `/dashboard`, `/cases` |
| Update case status | `updateCaseStatus()` | `['cases']`, `['cases', id]`, `['cases', 'stats']` | `/cases`, `/dashboard` |
| Update case stage | `updateCaseStage()` | `['cases', id]` | — |
| Assign case to hospital | `assignCase()` | `['cases']`, `['cases', id]` | `/cases` |
| Send message | `sendMessage()` | `['conversations', convId, 'messages']`, `['conversations']` | — |
| Create conversation | `createConversation()` | `['conversations']` | — |
| Create consultation | `createConsultation()` | `['consultations']`, `['consultations', 'stats']`, `['cases', caseId, 'consultations']` | `/consultations`, `/dashboard` |
| Update consultation status | `updateConsultationStatus()` | `['consultations']`, `['consultations', id]`, `['consultations', 'stats']` | `/consultations`, `/dashboard` |
| Upload document | `uploadDocument()` | `['cases', caseId, 'documents']` | — |
| Delete document | `deleteDocument()` | `['cases', caseId, 'documents']` | — |
| Update materials | `updateMaterials()` | `['materials', section]` | `/materials` |

**Convention:** Server Actions call `revalidatePath()` for RSC pages that showed the data. React Query hooks call `queryClient.invalidateQueries()` in `onSuccess` for client-side cache. Both must happen to keep UI consistent.

**Server Action pattern:**

```typescript
// apps/hospital/src/actions/case-actions.ts
'use server'
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
```

**React Query mutation pattern:**

```typescript
// apps/hospital/src/queries/use-cases.ts
export function useUpdateCaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; status: string }) =>
      updateCaseStatus(args.id, args.status),  // Server Action
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases', id] });
      queryClient.invalidateQueries({ queryKey: ['cases', 'stats'] });
    },
  });
}
```

---

## 7. State Management

```
┌─────────────────────────────────────────────────────────┐
│  Server State — React Query                             │
│  Cases, consultations, conversations, messages,         │
│  documents, progress, materials                         │
│  Auto cache / refetch / invalidate                      │
├─────────────────────────────────────────────────────────┤
│  Auth State — React Context (AuthProvider)               │
│  user: { id, email, roles, hospitalId }                 │
│  logout: () => void                                     │
├─────────────────────────────────────────────────────────┤
│  UI State — Component-local useState                    │
│  activeTab, searchQuery, modalOpen, selectedChatId,     │
│  expandedSections, etc.                                 │
│  No Zustand needed — page-level state, no cross-page    │
└─────────────────────────────────────────────────────────┘
```

**No Zustand.** All UI state is page-scoped (tabs, modals, search queries). React Query manages server state. Context provides auth. `useState` handles the rest.

---

## 8. Page-by-Page Feature Mapping

### 8.1 Dashboard (`/dashboard`)

**Data (RSC initial load):**

```typescript
// app/(portal)/dashboard/page.tsx — Server Component
const [cases, consultations, caseStats, consultationStats] = await Promise.all([
  apiClient('/api/v2/cases?limit=5&sort=createdAt:desc'),
  apiClient('/api/v2/consultations?status=SCHEDULED&limit=5'),
  apiClient('/api/v2/cases/stats'),
  apiClient('/api/v2/consultations/stats'),
]);
```

**UI Elements:**

| Widget | Data Source | Interaction |
|--------|-----------|-------------|
| Stat cards (4) | `caseStats` + `consultationStats` | Static display |
| Today's Consultations | `consultations` (SCHEDULED) | "Enter Consultation" → navigate to `/consultations/[id]/room` |
| New Cases | `cases` (recent 5) | Click → navigate to `/cases/[id]` |
| Pending Messages | `conversations` (recent 5) | Click → navigate to `/messages?chat=[id]` |

### 8.2 Cases List (`/cases`)

**RSC initial:** `apiClient('/api/v2/cases?page=1&limit=20')` + `apiClient('/api/v2/cases/stats')`

**Client interactions (React Query):**

| Action | Hook | Route Handler |
|--------|------|---------------|
| Search (300ms debounce) | `useCases({ search, page, status })` | `GET /api/cases?search=&page=&status=` |
| Tab filter (All/New/InProgress/Completed) | Same hook, different `status` | Same endpoint |
| Pagination | Same hook, different `page` | Same endpoint |
| Click case → detail | Navigate to `/cases/[id]` | — |

### 8.3 Case Detail (`/cases/[id]`)

**RSC initial:** `apiClient('/api/v2/cases/{id}')` → `HospitalCaseDetailDTO`

**7 Tabs:**

| Tab | Data | API | Notes |
|-----|------|-----|-------|
| **Intake** | `patient` + `medicalCondition` from case detail | Already loaded | Read-only medical form |
| **Documents** | `documents` from case detail | Already in DTO; upload via `POST /api/v2/cases/{id}/documents` | Grouped by type, click to download (presigned URL) |
| **Messages** | Conversation for this case | `GET /api/conversations?caseId={id}` → `GET /api/conversations/{convId}/messages` | ChatLayout component, `showRetranslate={false}` |
| **Diagnosis** | `diagnoses[]` from case detail | Already in DTO | Display only (no standalone CRUD in v2 backend) |
| **Marketing** | Manual outreach UI | No backend API | Email/phone campaign UI (display only for now) |
| **Invitation** | Upload invitation letter | `POST /api/v2/cases/{id}/documents` with `type=INVITATION` | File upload |
| **Consultation** | Case consultations | `GET /api/v2/cases/{id}/consultations` + `POST /api/v2/consultations` | List + create new booking |

### 8.4 Consultations (`/consultations`)

**RSC initial:** `apiClient('/api/v2/consultations?status=SCHEDULED')` + `apiClient('/api/v2/consultations/stats')`

**Client interactions:**

| Action | API | Notes |
|--------|-----|-------|
| Tab: Scheduled/Completed/All | `GET /api/consultations?status=&cursor=&limit=20` | `useInfiniteQuery` with cursor pagination (backend uses cursor, not offset) |
| Expand completed → AI Summary | `consultationDTO.aiSummary` | Already in list response |
| View Transcript | `GET /api/consultations/{id}/transcript` | Lazy load on click |
| "Enter Room" | Navigate to `/consultations/[id]/room` | — |
| Create new | `POST /api/v2/consultations` (Server Action) | Modal form. Frontend provides only `caseId` + scheduling fields (`scheduledAt`, `durationMinutes`, etc.). Backend use case derives `hospitalId` from `case.assignedHospitalId` and `patientId` from `case.patientId`. **Note**: the backend validation schema (`createConsultationSchema`) currently requires `hospitalId` and `patientId` as mandatory fields, but the use case ignores them — this is a backend contract mismatch that should be fixed (remove `hospitalId`/`patientId` from the schema, or make them optional). Until fixed, frontend should still send only `caseId` + scheduling info; do NOT send fabricated `hospitalId`/`patientId`. |

### 8.5 Video Room (`/consultations/[id]/room`)

**Full-screen page** overriding the sidebar layout.

| Feature | Implementation | Status |
|---------|---------------|--------|
| Pre-join screen (mic/video toggle) | Local UI state | ✅ Build |
| Video call | 3rd-party WebRTC (TBD) | ⏳ UI shell only |
| Control bar (mute, video, record, end) | Local UI state | ✅ Build |
| Real-time subtitles | AI speech recognition (TBD) | ⏳ UI shell only |
| Call status management | `PATCH /api/v2/consultations/{id}/status` action=start/complete | ✅ Build |
| Subtitle history panel | Mock data initially | ⏳ UI shell only |

### 8.6 Messages (`/messages`)

**RSC initial:** `apiClient('/api/v2/conversations')`

**Layout:** Left sidebar (conversation list) + Right panel (ChatLayout)

| Feature | API | Notes |
|---------|-----|-------|
| Conversation list | `GET /api/conversations` | Grouped by `category`: ADMIN_HOSPITAL vs HOSPITAL_PATIENT |
| Search conversations | Client-side filter on loaded list | Small dataset for single hospital |
| Select conversation → messages | `GET /api/conversations/{id}/messages?page=1&limit=50` | React Query, paginated |
| Send message | `POST /api/v2/conversations/{id}/messages` (Server Action) | Invalidates messages + conversations |
| New conversation | `POST /api/v2/conversations` (Server Action) | Modal with case selection |
| Translation display | `message.translatedContent` field | Auto-translated by backend async task |
| Unread count | **Not available** — backend has no unread API | Show `lastMessageAt` timestamp instead; unread count is future work |

### 8.7 Materials (`/materials`)

**Data source:** Hono API → Materials backend module → Main Supabase (see Section 9)

**4 Tabs:**

| Tab | API Endpoint (new) | Features |
|-----|-------------------|----------|
| **Hospital Info** | `GET /api/v2/hospitals/{id}/materials/info` | Name, address, phone, email, hours, photos, videos, certifications, amenities |
| **Procedures** | `GET /api/v2/hospitals/{id}/materials/procedures` | Table with search, price ranges, popular badge. CRUD via Server Actions |
| **Surgeons** | `GET /api/v2/hospitals/{id}/materials/surgeons` | Grid cards with photo, specialties, languages. CRUD via Server Actions |
| **Before & After** | `GET /api/v2/hospitals/{id}/materials/cases` | Grid with split before/after images, procedure, surgeon. CRUD via Server Actions |

---

## 9. Materials Backend Module

Materials data lives in **Main Supabase** (beauty hospital database), not in the CRM DB. Per the project's dependency rules ("Page components NEVER touch database directly"), we must NOT let hospital pages query Supabase directly.

### New Backend Routes (apps/api)

```
POST /api/v2/hospitals/{id}/materials/info          # Update hospital info
GET  /api/v2/hospitals/{id}/materials/info           # Get hospital info
GET  /api/v2/hospitals/{id}/materials/procedures     # List procedures
POST /api/v2/hospitals/{id}/materials/procedures     # Create procedure
PUT  /api/v2/hospitals/{id}/materials/procedures/{pid} # Update procedure
DELETE /api/v2/hospitals/{id}/materials/procedures/{pid}
GET  /api/v2/hospitals/{id}/materials/surgeons       # List surgeons
POST /api/v2/hospitals/{id}/materials/surgeons        # Create surgeon
PUT  /api/v2/hospitals/{id}/materials/surgeons/{sid}
DELETE /api/v2/hospitals/{id}/materials/surgeons/{sid}
GET  /api/v2/hospitals/{id}/materials/cases          # List before & after cases
POST /api/v2/hospitals/{id}/materials/cases
PUT  /api/v2/hospitals/{id}/materials/cases/{cid}
DELETE /api/v2/hospitals/{id}/materials/cases/{cid}
```

### Architecture

```
apps/api/src/routes/materials.routes.ts
  → packages/application/src/use-cases/materials/
      get-hospital-materials.use-case.ts
      update-procedure.use-case.ts
      ...
  → packages/domain/src/materials/
      materials.ports.ts (IMaterialsRepository interface)
  → packages/infrastructure/src/supabase/
      supabase-materials.repository.ts (implements IMaterialsRepository)
        → Main Supabase client (read/write)
```

This maintains Clean Architecture: the hospital page calls the Hono API, the use case orchestrates, the infrastructure adapter queries Supabase. No architectural boundary violations.

### Authorization Rules

- **HOSPITAL users**: Can only read/write materials for their own hospital (`actor.hospitalId === id`). The use case validates this.
- **ADMIN users**: Can read/write materials for any hospital.
- All material mutations require authentication (Keycloak JWT).
- The hospital ID in the URL path must match the actor's `hospitalId` claim for HOSPITAL role users.

---

## 10. Error Handling

### Global Error Boundary

```typescript
// app/(portal)/error.tsx — catches unhandled errors in portal pages
// app/(portal)/loading.tsx — Suspense fallback for RSC loading
```

### API Error Handling

| HTTP Status | Route Handler behavior | React Query behavior | User-facing |
|-------------|----------------------|---------------------|-------------|
| 401 | Return `{ error: 'Unauthorized' }` JSON | `onError` → redirect to `/auth/login` | Redirect to login |
| 403 | Return `{ error: 'Forbidden' }` JSON | Show toast: "No permission" | Toast notification |
| 404 | Return upstream JSON | Show "Not found" state | EmptyState component |
| 422/400 | Return upstream JSON with validation errors | Show field-level errors | Form validation UI |
| 500 | Return `{ error: 'Server error' }` | Show toast: "Server error, retry" | Toast + retry button |
| Network error | N/A | `retry: 1`, then show error | Toast + retry |

### React Query Global Error Handler

```typescript
// In query-client.ts
queryCache: new QueryCache({
  onError: (error) => {
    if (error instanceof ApiError && error.status === 401) {
      window.location.replace('/auth/login'); // replace, not href, to avoid polluting history
    }
  },
}),
```

---

## 11. File Upload

### Documents (Case Files)

1. Frontend calls Server Action `uploadDocument(caseId, file, metadata)`
2. Server Action calls `POST /api/v2/cases/{caseId}/documents` → returns presigned upload URL
3. Frontend uploads file directly to Supabase Storage using presigned URL (via `XMLHttpRequest` for progress tracking)
4. Progress bar shown during upload

**Constraints:**
- Max file size: 50 MB (enforced client-side before upload, backend validates too)
- Allowed types: `image/*, .pdf, .doc, .docx, .xls, .xlsx` (matching v1)
- If upload succeeds but metadata confirmation fails, show error and allow retry (presigned URL may have expired)

### Materials (Photos/Videos)

Same pattern through the new Materials backend module endpoints. Upload URLs generated server-side, direct upload from browser to Supabase Storage.

**Constraints:**
- Photos: max 10 MB, `image/*` only
- Videos: max 500 MB, `video/*` only

---

## 12. Deferred Scope

The following are explicitly **out of scope** for this spec:

| Item | Reason | When |
|------|--------|------|
| **Admin Portal** | Needs separate design; v1 admin UX was poor | Separate spec after hospital portal ships |
| **Regular hospitals (REGULAR type)** | Different Supabase instance, potentially different Materials structure | After COSMETIC hospital portal is stable |
| **WebRTC video calls** | Requires 3rd-party WebRTC service selection & integration | Future phase; Video Room has UI shell + status management |
| **Real-time subtitles** | Requires AI speech recognition + streaming translation | Future phase; UI shell built |
| **Message unread counts** | Backend has no unread tracking API | Backend must add unread endpoint first |
| **Patient Portal** | Explicitly excluded from v2 scope | Not planned |
| **Notification system** | No backend notification service | Future phase |

**Note on Admin Portal:** `apps/admin/` already exists as a Next.js shell with `@medical-crm/ui` dependency. All shared components in `packages/shared/ui/` MUST be designed for admin reuse. Hospital-specific logic stays in `apps/hospital/src/components/`.

---

## 13. Technical Constraints & Conventions

### Hard Constraints

1. **`api-client.ts` should have `import 'server-only'`** (recommended, not hard requirement) — prevents accidental client-side import that would leak credentials. If this causes build issues (e.g., Route Handler imports), remove and rely on `getSession()` → `cookies()` as the natural server-only guard
2. **Page components NEVER touch database directly** — all data flows through Hono API or BFF Route Handlers
3. **Route Handlers are always dynamic** — no `export const dynamic = 'force-static'`, no `export const revalidate` on any `app/api/*` file
4. **No catch-all proxy** — each Route Handler is domain-specific, created via `createQueryHandler` / `createParamQueryHandler` factory
5. **Server Actions are for mutations only** — never use as `queryFn` for React Query (sequential execution)
6. **`showRetranslate={false}` in hospital ChatLayout** — backend retranslate is ADMIN-only
7. **Auth paths are `/auth/*`** — login at `/auth/login`, callback at `/auth/callback`, logout at `/auth/logout`

### Conventions

- ESM throughout (`"type": "module"`)
- Tailwind CSS v4 with `@tailwindcss/postcss` plugin (for Next.js apps; nexus-crm prototype uses `@tailwindcss/vite`)
- Motion library for animations (not Framer Motion)
- Lucide React for icons
- Poppins font (300–700 weights)
- `cn()` utility from `@medical-crm/ui` for class merging
- File naming: kebab-case for files, PascalCase for components
- React Query keys: `[domain, ...params]` pattern (e.g., `['cases', { page: 1 }]`)
- New shared UI components use `class-variance-authority` (CVA) for variant management, following the existing `Button` pattern

---

## 14. New Dependencies

Packages that must be added to `apps/hospital/package.json`:

| Package | Purpose |
|---------|---------|
| `@tanstack/react-query` | Server state management |
| `motion` | Animations (Framer Motion alternative) |
| `lucide-react` | Icon library |
| `server-only` | Recommended: prevent accidental client-side import of server modules (can be removed if it causes build issues) |

Poppins font is loaded via `next/font/google` — no additional package needed.

Packages for `packages/shared/ui/package.json` (in addition to existing deps):

| Package | Purpose |
|---------|---------|
| `lucide-react` | Icons used in shared components (as peerDependency) |
| `motion` | Animations in shared components (as peerDependency) |

### PostCSS Configuration

The hospital app needs a `postcss.config.mjs` at `apps/hospital/postcss.config.mjs`:

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### Keycloak Client Clarification

The existing auth code passes `client_secret` in token requests, indicating `portal-web` is configured as a **confidential** OIDC client in Keycloak (not public, despite earlier documentation). This is the correct and more secure configuration — the client secret is only used server-side in the BFF layer, never exposed to the browser.
