# Phase 1: Auth + Core Dashboard Migration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase Auth with CRM v2 patient cookie session in china-medical-journeys, migrate dashboard to new 7-tab layout, and wire up Quotes + Messages (text-only) pages.

**Architecture:** Frontend-first migration. CRM v2 backend already has all needed patient endpoints for Phase 1. Frontend replaces Supabase auth with cookie-based session (`patient_session` httpOnly cookie), adds Vite BFF proxy, and rebuilds dashboard with new tab structure. Messages stay text-only in Phase 1.

**Tech Stack:** React 18, Vite 5, Tailwind CSS, React Query 5, React Router 6, CRM v2 Hono API (cookie auth)

**Codebase Paths:**
- Frontend: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys` (aliased as `$FE`)
- Backend: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2` (aliased as `$BE`)

---

## File Structure

### New Files (Frontend)

| File | Responsibility |
|------|---------------|
| `$FE/src/contexts/PatientAuthContext.tsx` | Cookie-session auth state, login/logout, `/api/patient/me` check |
| `$FE/src/services/api/crmApiClient.ts` | Fetch wrapper for `/api/patient/*`, cookie auto-sent, error handling |
| `$FE/src/services/api/quotes.ts` | Quote API calls (list per case, accept, reject) |
| `$FE/src/services/api/messages.ts` | Conversation + message API calls |
| `$FE/src/hooks/usePatientAuth.ts` | React Query hook for auth state |
| `$FE/src/hooks/usePatientCases.ts` | React Query hook for patient cases |
| `$FE/src/hooks/useQuotes.ts` | React Query hook for quotes |
| `$FE/src/hooks/useMessages.ts` | React Query hook for conversations + messages |
| `$FE/src/hooks/useWebSocket.ts` | WebSocket connection manager hook |
| `$FE/src/pages/PatientLoginPage.tsx` | Magic link login form |
| `$FE/src/components/dashboard/MessagesPage.tsx` | Conversation list + chat view (text-only) |
| `$FE/src/components/dashboard/QuotesPage.tsx` | Quotes grouped by case |
| `$FE/src/components/dashboard/ConversationList.tsx` | Left panel: conversation list with preview |
| `$FE/src/components/dashboard/ChatView.tsx` | Right panel: message list + input |
| `$FE/src/components/dashboard/MessageList.tsx` | Scrollable message list |
| `$FE/src/components/dashboard/MessageInput.tsx` | Text input + send button |
| `$FE/src/components/dashboard/QuoteCard.tsx` | Single quote with line items + accept/reject |

### Modified Files (Frontend)

| File | Change |
|------|--------|
| `$FE/src/types/patient.ts` | Shared patient types (PatientUser, PatientCase, etc.) |
| `$FE/src/components/auth/ProtectedRoute.tsx` | Auth guard — redirects to `/login` if not authenticated |

### Modified Files (Frontend)

| File | Change |
|------|--------|
| `$FE/vite.config.ts` | Add proxy: `/api/patient` + `/ws` → CRM v2 API server |
| `$FE/src/App.tsx` | Replace `AuthProvider` with `PatientAuthProvider`, update dashboard routes |
| `$FE/src/pages/Dashboard.tsx` | New 7-tab sidebar (Home, Tickets, Messages, Quotes, Journey, AI Summary, Orders) |
| `$FE/src/components/dashboard/DashboardHome.tsx` | Replace `useAuth()` with `usePatientAuth()`, replace API calls |
| `$FE/package.json` | Remove `@supabase/supabase-js`, `@supabase/auth-ui-react`, `@supabase/auth-ui-shared` |

### Deleted Files (Frontend)

| File | Reason |
|------|--------|
| `$FE/src/config/supabaseClient.ts` | Replaced by cookie session |
| `$FE/src/contexts/AuthContext.tsx` | Replaced by `PatientAuthContext.tsx` |
| `$FE/src/pages/AuthPage.tsx` | Replaced by `PatientLoginPage.tsx` |
| `$FE/src/pages/AuthCallback.tsx` | No longer needed (cookie auth, no OAuth redirect) |
| `$FE/src/services/api/user.ts` | Replaced by `/api/patient/me` via `crmApiClient` |

### Untouched Files (Keep for Hospital Portal)

| File | Reason |
|------|--------|
| `$FE/src/hooks/useAuth.ts` | Medplum auth for hospital portal — **do NOT modify** |
| `$FE/src/pages/Login.tsx` | Medplum login for hospital portal — **do NOT modify** |
| `$FE/src/lib/medplum.ts` | Hospital portal infrastructure — **do NOT modify** |

---

## Chunk 1: BFF Proxy + API Client + Auth Context

### Task 1: Add Vite BFF Proxy

**Files:**
- Modify: `$FE/vite.config.ts`

- [ ] **Step 1: Add proxy configuration to vite.config.ts**

Add `server.proxy` entries that forward `/api/patient` and `/ws` requests to the CRM v2 API server. This avoids CORS and keeps cookies on the same domain.

```typescript
// vite.config.ts — add proxy inside defineConfig
server: {
  host: "localhost",
  port: 3000,
  proxy: {
    '/api/patient': {
      target: 'http://localhost:3001', // CRM v2 API server (see $BE/apps/api/src/server.ts)
      changeOrigin: true,
    },
    '/ws': {
      target: 'http://localhost:3001',
      changeOrigin: true,
      ws: true, // enable WebSocket proxying
    },
  },
},
```

The CRM v2 API defaults to port 3001 (from `$BE/apps/api/src/server.ts` line 13: `const port = Number(process.env.PORT ?? 3001)`).

- [ ] **Step 2: Verify proxy works**

Run: `cd $FE && npm run dev`

In another terminal, start the CRM v2 API server. Then test:
```bash
curl -v http://localhost:3000/api/patient/me
```
Expected: 401 Unauthorized (no cookie — confirms proxy is working and reaching CRM v2)

- [ ] **Step 3: Commit**
```bash
git add vite.config.ts
git commit -m "feat: add Vite BFF proxy for /api/patient to CRM v2"
```

---

### Task 2: Create CRM API Client

**Files:**
- Create: `$FE/src/services/api/crmApiClient.ts`

- [ ] **Step 1: Create the fetch wrapper**

This client sends all requests to `/api/patient/*` (Vite proxy handles routing). Cookies are auto-sent via `credentials: 'include'`. No manual auth header needed.

```typescript
// src/services/api/crmApiClient.ts

const BASE_URL = '/api/patient';

export class CrmApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'CrmApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new CrmApiError(
      res.status,
      body?.message ?? body?.error ?? `Request failed: ${res.status}`,
      body,
    );
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

export const crmApi = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Commit**
```bash
git add src/services/api/crmApiClient.ts
git commit -m "feat: add CRM v2 API client with cookie auth"
```

---

### Task 3: Create PatientAuthContext

**Files:**
- Create: `$FE/src/contexts/PatientAuthContext.tsx`
- Create: `$FE/src/hooks/usePatientAuth.ts`

- [ ] **Step 0: Create shared patient types**

```typescript
// src/types/patient.ts
export interface PatientUser {
  id: string;
  email: string;
  name: string;
  preferredLanguage?: string;
}

export interface PatientCase {
  id: string;
  caseNumber: string;
  patientName: string;
  primaryDiagnosis: string | null;
  assignmentStatus: string;
  treatmentStage: string | null;
  hospitalName: string | null;
  aiSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

// Generic paginated response shape from CRM v2
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

- [ ] **Step 1: Create PatientAuthContext**

This context manages patient auth state using the CRM v2 cookie session. On mount, it calls `GET /api/patient/me` to check if the session cookie is valid. Provides `login`, `logout`, and `requestMagicLink` functions.

```typescript
// src/contexts/PatientAuthContext.tsx
import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { crmApi, CrmApiError } from '@/services/api/crmApiClient';
import { usePatientMe } from '@/hooks/usePatientAuth';
import type { PatientUser } from '@/types/patient';

interface PatientAuthContextValue {
  user: PatientUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requestMagicLink: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const PatientAuthContext = createContext<PatientAuthContextValue | null>(null);

export function PatientAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = usePatientMe();

  const requestMagicLink = useCallback(async (email: string) => {
    await crmApi.post('/magic-link', { email });
  }, []);

  const logout = useCallback(async () => {
    try {
      await crmApi.post('/logout');
    } catch {
      // Ignore logout errors
    }
    queryClient.setQueryData(['patient', 'me'], null);
    queryClient.clear();
  }, [queryClient]);

  const value: PatientAuthContextValue = {
    user: isError ? null : (user ?? null),
    isAuthenticated: !!user && !isError,
    isLoading,
    requestMagicLink,
    logout,
  };

  return (
    <PatientAuthContext.Provider value={value}>
      {children}
    </PatientAuthContext.Provider>
  );
}

export function usePatientAuthContext() {
  const ctx = useContext(PatientAuthContext);
  if (!ctx) throw new Error('usePatientAuthContext must be inside PatientAuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Create usePatientAuth hooks**

```typescript
// src/hooks/usePatientAuth.ts
import { useQuery } from '@tanstack/react-query';
import { crmApi, CrmApiError } from '@/services/api/crmApiClient';
import type { PatientUser } from '@/types/patient';

export function usePatientMe() {
  return useQuery<PatientUser | null>({
    queryKey: ['patient', 'me'],
    queryFn: async () => {
      try {
        return await crmApi.get<PatientUser>('/me');
      } catch (err) {
        if (err instanceof CrmApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  });
}
```

- [ ] **Step 3: Commit**
```bash
git add src/contexts/PatientAuthContext.tsx src/hooks/usePatientAuth.ts
git commit -m "feat: add PatientAuthContext with cookie session + usePatientMe hook"
```

---

### Task 4: Create Patient Login Page

**Files:**
- Create: `$FE/src/pages/PatientLoginPage.tsx`

- [ ] **Step 1: Create magic link login page**

Two-state form: (1) enter email → request magic link, (2) show "check your email" confirmation. Also handles magic link token verification when arriving from email link.

```typescript
// src/pages/PatientLoginPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePatientAuthContext } from '@/contexts/PatientAuthContext';
import { crmApi } from '@/services/api/crmApiClient';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, Loader2, CheckCircle } from 'lucide-react';

export default function PatientLoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated } = usePatientAuthContext();

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  // Handle magic link token from email
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) return;

    setVerifying(true);
    crmApi.post('/verify-token', { token })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['patient', 'me'] });
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        setError('This link has expired or is invalid. Please request a new one.');
        setVerifying(false);
      });
  }, [searchParams, navigate, queryClient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await crmApi.post('/magic-link', { email });
      setSent(true);
    } catch {
      setError('Failed to send login link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Verifying your login link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Check your email</h2>
            <p className="text-muted-foreground text-center">
              We sent a login link to <strong>{email}</strong>.
              Click the link in your email to sign in.
            </p>
            <Button
              variant="ghost"
              className="mt-6"
              onClick={() => { setSent(false); setEmail(''); }}
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Patient Login</CardTitle>
          <CardDescription>
            Enter your email to receive a login link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Login Link
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add src/pages/PatientLoginPage.tsx
git commit -m "feat: add PatientLoginPage with magic link flow"
```

---

### Task 5: Wire Auth into App.tsx + Remove Supabase

**Files:**
- Modify: `$FE/src/App.tsx`
- Delete: `$FE/src/config/supabaseClient.ts`
- Delete: `$FE/src/contexts/AuthContext.tsx`
- Delete: `$FE/src/pages/AuthPage.tsx`
- Delete: `$FE/src/pages/AuthCallback.tsx`
- Delete: `$FE/src/services/api/user.ts`
- Modify: `$FE/package.json`

- [ ] **Step 1: Update App.tsx**

Replace `AuthProvider` (Supabase) with `PatientAuthProvider`. Update routes:
- Remove `/auth` and `/auth/callback` routes
- Add `/login` route pointing to `PatientLoginPage`
- Keep all existing public routes unchanged
- Keep hospital routes unchanged (Medplum auth is separate)

Key changes in `App.tsx`:
```typescript
// Remove:
import { AuthProvider } from '@/contexts/AuthContext';
// Add:
import { PatientAuthProvider } from '@/contexts/PatientAuthContext';

// In the provider tree, replace <AuthProvider> with <PatientAuthProvider>

// Routes — remove:
<Route path="/auth" element={<AuthPage />} />
<Route path="/auth/callback" element={<AuthCallback />} />
// Routes — add:
<Route path="/login" element={<PatientLoginPage />} />
```

- [ ] **Step 2: Delete Supabase files**

```bash
rm src/config/supabaseClient.ts
rm src/contexts/AuthContext.tsx
rm src/pages/AuthPage.tsx
rm src/pages/AuthCallback.tsx
rm src/services/api/user.ts
```

- [ ] **Step 3: Remove Supabase dependencies**

```bash
npm uninstall @supabase/supabase-js @supabase/auth-ui-react @supabase/auth-ui-shared
```

- [ ] **Step 4: Fix all import errors**

Search for any remaining imports of deleted files and update:
- `import { useAuth } from '@/contexts/AuthContext'` → `import { usePatientAuthContext } from '@/contexts/PatientAuthContext'`
- `import { supabase } from '@/config/supabaseClient'` → remove
- `import apiService from '@/services/api/user'` → use `crmApi` instead

Run: `npx tsc --noEmit` to find all broken imports.

- [ ] **Step 5: Update services/api/config.ts**

Remove Supabase auth header injection. The cookie-based auth doesn't need manual headers.

```typescript
// src/services/api/config.ts — simplified
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.medicaltourismchina.health';

// For legacy non-patient APIs (hospital.ts, department.ts, etc.) that still use the old base URL.
// These public-page API services import getAuthHeaders — it now returns plain headers
// since patient auth is cookie-based (no Supabase token injection needed).
export async function getAuthHeaders(): Promise<HeadersInit> {
  return { 'Content-Type': 'application/json' };
}
```

Also clean up `.env.local` — remove Supabase variables that are no longer used:
```bash
# Remove these from .env.local:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
# VITE_USE_SUPABASE_AUTH=...
```

- [ ] **Step 6: Verify app compiles**

Run: `cd $FE && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "feat: replace Supabase auth with PatientAuthContext cookie session"
```

---

## Chunk 2: Dashboard Layout + Home Migration

### Task 6: Create ProtectedRoute Guard

**Files:**
- Create: `$FE/src/components/auth/ProtectedRoute.tsx`

- [ ] **Step 1: Create ProtectedRoute component**

Wraps all `/dashboard/*` routes. Redirects to `/login` if not authenticated.

```typescript
// src/components/auth/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { usePatientAuthContext } from '@/contexts/PatientAuthContext';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = usePatientAuthContext();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/auth/ProtectedRoute.tsx
git commit -m "feat: add ProtectedRoute guard for dashboard routes"
```

---

### Task 7: Update Dashboard Sidebar to 7 Tabs

**Files:**
- Modify: `$FE/src/pages/Dashboard.tsx`

- [ ] **Step 1: Update menu items**

Replace existing 6 tabs with new 7 tabs. Keep the sidebar layout pattern but update items.

```typescript
// Dashboard.tsx — new menu items
const menuItems = [
  { key: 'home', label: 'Home', icon: Home, path: '/dashboard' },
  { key: 'tickets', label: 'Support Tickets', icon: TicketIcon, path: '/dashboard/tickets' },
  { key: 'messages', label: 'Messages', icon: MessageSquare, path: '/dashboard/messages' },
  { key: 'quotes', label: 'Quotes', icon: FileText, path: '/dashboard/quotes' },
  { key: 'journey', label: 'Journey', icon: MapPin, path: '/dashboard/journey' },
  { key: 'ai-summary', label: 'AI Summary', icon: Brain, path: '/dashboard/ai-summary' },
  { key: 'orders', label: 'Orders', icon: ShoppingCart, path: '/dashboard/orders' },
];
```

Change the Dashboard to use React Router `<Outlet />` so child routes render in the content area:

```typescript
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  // ... sidebar with menuItems, onClick navigates
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-white p-4">
        {menuItems.map(item => (
          <button
            key={item.key}
            onClick={() => navigate(item.path)}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm',
              location.pathname === item.path
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
        {/* Bottom section: Account + Logout */}
        <div className="mt-auto pt-4 border-t space-y-1">
          <button
            onClick={() => navigate('/dashboard/account')}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            Account
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>
      {/* Content */}
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

// Dashboard needs usePatientAuthContext for logout:
// const { logout } = usePatientAuthContext();
// const handleLogout = async () => { await logout(); navigate('/login'); };
```

- [ ] **Step 2: Update App.tsx routes for nested dashboard**

```typescript
<Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
  <Route index element={<DashboardHome />} />
  <Route path="tickets" element={<PlaceholderPage title="Support Tickets" />} />
  <Route path="messages" element={<PlaceholderPage title="Messages" />} />
  <Route path="quotes" element={<PlaceholderPage title="Quotes" />} />
  <Route path="journey" element={<PlaceholderPage title="Journey" />} />
  <Route path="ai-summary" element={<PlaceholderPage title="AI Summary" />} />
  <Route path="orders" element={<PlaceholderPage title="Orders" />} />
  <Route path="account" element={<ProfileSettings />} />
</Route>
```

Create a simple placeholder component for tabs not yet implemented:

```typescript
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <p>{title} — Coming in Phase 2+</p>
    </div>
  );
}
```

- [ ] **Step 3: Verify layout renders**

Run: `npm run dev`, navigate to `http://localhost:3000/dashboard`
Expected: 7-tab sidebar with Home tab active, DashboardHome content in main area

- [ ] **Step 4: Commit**
```bash
git add src/pages/Dashboard.tsx src/App.tsx
git commit -m "feat: update dashboard layout to 7-tab sidebar with nested routes"
```

---

### Task 8: Migrate DashboardHome to CRM v2 API

**Files:**
- Modify: `$FE/src/components/dashboard/DashboardHome.tsx`
- Create: `$FE/src/hooks/usePatientCases.ts`

- [ ] **Step 1: Create usePatientCases hook**

```typescript
// src/hooks/usePatientCases.ts
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '@/services/api/crmApiClient';
import type { PatientCase } from '@/types/patient';

export function usePatientCases() {
  return useQuery<PatientCase[]>({
    queryKey: ['patient', 'cases'],
    queryFn: () => crmApi.get<PatientCase[]>('/cases'),
  });
}
```

- [ ] **Step 2: Rewrite DashboardHome to use new hooks**

Replace the old `useAuth()` + `apiService.getDashboardData()` calls with `usePatientAuthContext()` + `usePatientCases()`.

Key changes:
- Replace: `const { user, isAuthenticated } = useAuth()` → `const { user, isAuthenticated } = usePatientAuthContext()`
- Replace: `apiService.getDashboardData(user.id)` → `usePatientCases()` hook
- Keep: Case list rendering, status badges, locale support
- Remove: Direct Supabase session checks
- Add: Redirect to `/login` if not authenticated

```typescript
// DashboardHome.tsx — top of component
const { user, isAuthenticated, isLoading: authLoading } = usePatientAuthContext();
const navigate = useNavigate();
const { data: cases, isLoading: casesLoading } = usePatientCases();

useEffect(() => {
  if (!authLoading && !isAuthenticated) {
    navigate('/login', { replace: true });
  }
}, [authLoading, isAuthenticated, navigate]);

if (authLoading || casesLoading) return <LoadingSpinner />;
```

- [ ] **Step 3: Verify dashboard loads with CRM data**

Run: `npm run dev`, navigate to dashboard
Expected: Dashboard shows patient cases from CRM v2 API (or empty state if no cases)

- [ ] **Step 4: Commit**
```bash
git add src/hooks/usePatientCases.ts src/components/dashboard/DashboardHome.tsx
git commit -m "feat: migrate DashboardHome to CRM v2 patient cases API"
```

---

## Chunk 3: Quotes Page

### Task 9: Create Quotes API + Hook

**Files:**
- Create: `$FE/src/services/api/quotes.ts`
- Create: `$FE/src/hooks/useQuotes.ts`

- [ ] **Step 1: Create quotes API service**

```typescript
// src/services/api/quotes.ts
import { crmApi } from './crmApiClient';

export interface QuoteLineItem {
  description: string;
  amount: number;
  currency: string;
}

export interface Quote {
  id: string;
  caseId: string;
  hospitalId: string;
  hospitalName?: string;
  totalAmount: number;
  currency: string;
  validUntil: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  lineItems: QuoteLineItem[];
  isDraft: boolean;
  sentAt: string | null;
  createdAt: string;
}

// NOTE: Backend may return paginated { data, total } or flat array.
// Verify against GET /api/patient/cases/:id/quote response during integration.
export const quotesApi = {
  listForCase: async (caseId: string): Promise<Quote[]> => {
    const res = await crmApi.get<Quote[] | { data: Quote[] }>(`/cases/${caseId}/quote`);
    return Array.isArray(res) ? res : res.data;
  },

  accept: (caseId: string, quoteId: string) =>
    crmApi.post(`/cases/${caseId}/quote/accept`, { quoteId }),

  reject: (caseId: string, quoteId: string) =>
    crmApi.post(`/cases/${caseId}/quote/reject`, { quoteId }),
};
```

- [ ] **Step 2: Create useQuotes hook**

```typescript
// src/hooks/useQuotes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quotesApi, type Quote } from '@/services/api/quotes';

export function useQuotesForCase(caseId: string) {
  return useQuery<Quote[]>({
    queryKey: ['patient', 'quotes', caseId],
    queryFn: () => quotesApi.listForCase(caseId),
    enabled: !!caseId,
  });
}

export function useAcceptQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, quoteId }: { caseId: string; quoteId: string }) =>
      quotesApi.accept(caseId, quoteId),
    onSuccess: (_, { caseId }) => {
      queryClient.invalidateQueries({ queryKey: ['patient', 'quotes', caseId] });
    },
  });
}

export function useRejectQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, quoteId }: { caseId: string; quoteId: string }) =>
      quotesApi.reject(caseId, quoteId),
    onSuccess: (_, { caseId }) => {
      queryClient.invalidateQueries({ queryKey: ['patient', 'quotes', caseId] });
    },
  });
}
```

- [ ] **Step 3: Commit**
```bash
git add src/services/api/quotes.ts src/hooks/useQuotes.ts
git commit -m "feat: add quotes API service + React Query hooks"
```

---

### Task 10: Create QuotesPage + QuoteCard Components

**Files:**
- Create: `$FE/src/components/dashboard/QuotesPage.tsx`
- Create: `$FE/src/components/dashboard/QuoteCard.tsx`

- [ ] **Step 1: Create QuoteCard component**

Displays a single quote with hospital info, line items (expandable), total, status badge, and accept/reject buttons.

```typescript
// src/components/dashboard/QuoteCard.tsx
import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type Quote } from '@/services/api/quotes';
import { useAcceptQuote, useRejectQuote } from '@/hooks/useQuotes';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-800',
};

interface QuoteCardProps {
  quote: Quote;
  caseId: string;
}

export function QuoteCard({ quote, caseId }: QuoteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'accept' | 'reject' | null>(null);
  const acceptMutation = useAcceptQuote();
  const rejectMutation = useRejectQuote();

  const isPending = quote.status === 'PENDING';
  const isExpired = quote.validUntil && new Date(quote.validUntil) < new Date();

  const handleConfirm = () => {
    if (confirmAction === 'accept') {
      acceptMutation.mutate({ caseId, quoteId: quote.id });
    } else if (confirmAction === 'reject') {
      rejectMutation.mutate({ caseId, quoteId: quote.id });
    }
    setConfirmAction(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <h4 className="font-medium">{quote.hospitalName ?? 'Hospital'}</h4>
          <p className="text-sm text-muted-foreground">
            {quote.currency} {quote.totalAmount.toLocaleString()}
          </p>
        </div>
        <Badge className={statusColors[quote.status] ?? ''}>
          {isExpired && quote.status === 'PENDING' ? 'EXPIRED' : quote.status}
        </Badge>
      </CardHeader>
      <CardContent>
        {quote.validUntil && (
          <p className="text-xs text-muted-foreground mb-2">
            Valid until: {new Date(quote.validUntil).toLocaleDateString()}
          </p>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-primary hover:underline mb-2"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Hide' : 'Show'} line items ({quote.lineItems?.length ?? 0})
        </button>

        {expanded && quote.lineItems && (
          <div className="space-y-1 mb-3 pl-2 border-l-2 border-muted">
            {quote.lineItems.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.description}</span>
                <span>{item.currency} {item.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {confirmAction ? (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <p className="text-sm flex-1">
              Are you sure you want to <strong>{confirmAction}</strong> this quote? This action cannot be undone.
            </p>
            <Button size="sm" variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={confirmAction === 'accept' ? 'default' : 'destructive'}
              onClick={handleConfirm}
              disabled={acceptMutation.isPending || rejectMutation.isPending}
            >
              Confirm
            </Button>
          </div>
        ) : (
          isPending && !isExpired && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setConfirmAction('accept')}>
                Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmAction('reject')}>
                Reject
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create QuotesPage**

Groups quotes by case. Fetches all patient cases, then loads quotes for each.

```typescript
// src/components/dashboard/QuotesPage.tsx
import { usePatientCases } from '@/hooks/usePatientCases';
import { useQuotesForCase } from '@/hooks/useQuotes';
import { QuoteCard } from './QuoteCard';
import { Loader2 } from 'lucide-react';

function CaseQuotesSection({ caseId, caseNumber, diagnosis }: {
  caseId: string;
  caseNumber: string;
  diagnosis: string | null;
}) {
  const { data: quotes, isLoading } = useQuotesForCase(caseId);

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (!quotes?.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">
        Case #{caseNumber}
        {diagnosis && <span className="text-sm text-muted-foreground ml-2">— {diagnosis}</span>}
      </h3>
      {quotes.map(quote => (
        <QuoteCard key={quote.id} quote={quote} caseId={caseId} />
      ))}
    </div>
  );
}

export default function QuotesPage() {
  const { data: cases, isLoading } = usePatientCases();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!cases?.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>No quotes yet. Start a case intake to receive hospital quotes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Quotes</h2>
      {cases.map(c => (
        <CaseQuotesSection
          key={c.id}
          caseId={c.id}
          caseNumber={c.caseNumber}
          diagnosis={c.primaryDiagnosis}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire QuotesPage into Dashboard routes**

In `App.tsx`, replace the quotes placeholder:
```typescript
<Route path="quotes" element={<QuotesPage />} />
```

- [ ] **Step 4: Verify quotes page renders**

Run: `npm run dev`, navigate to `/dashboard/quotes`
Expected: Shows quotes grouped by case (or empty state)

- [ ] **Step 5: Commit**
```bash
git add src/components/dashboard/QuoteCard.tsx src/components/dashboard/QuotesPage.tsx src/App.tsx
git commit -m "feat: add QuotesPage with per-case quote cards + accept/reject"
```

---

## Chunk 4: Messages Page (Text-Only)

### Task 11: Create Messages API + Hook

**Files:**
- Create: `$FE/src/services/api/messages.ts`
- Create: `$FE/src/hooks/useMessages.ts`

- [ ] **Step 1: Create messages API service**

```typescript
// src/services/api/messages.ts
import { crmApi } from './crmApiClient';
import type { PaginatedResponse } from '@/types/patient';

export interface Conversation {
  id: string;
  caseId: string | null;
  hospitalId: string | null;
  hospitalName?: string;
  category: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: 'PATIENT' | 'HOSPITAL' | 'ADMIN';
  content: string;
  messageType: 'TEXT' | 'SYSTEM';
  createdAt: string;
}

// NOTE: The actual DTO shape from CRM v2 may differ slightly.
// Verify against GET /api/patient/conversations response during integration.
// The Conversation interface above is a best-guess from the backend's toConversationDTO mapper.

export const messagesApi = {
  listConversations: () =>
    crmApi.get<Conversation[]>('/conversations'),

  listMessages: async (convId: string, limit = 50): Promise<Message[]> => {
    // Backend returns paginated { data, total, page, limit }
    const res = await crmApi.get<PaginatedResponse<Message>>(
      `/conversations/${convId}/messages?limit=${limit}`
    );
    return res.data;
  },

  sendMessage: (convId: string, content: string) =>
    crmApi.post<Message>(`/conversations/${convId}/messages`, { content }),
};
```

- [ ] **Step 2: Create useMessages hooks**

```typescript
// src/hooks/useMessages.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messagesApi, type Conversation, type Message } from '@/services/api/messages';

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ['patient', 'conversations'],
    queryFn: () => messagesApi.listConversations(),
  });
}

export function useMessagesForConversation(convId: string | null) {
  return useQuery<Message[]>({
    queryKey: ['patient', 'messages', convId],
    queryFn: () => messagesApi.listMessages(convId!),
    enabled: !!convId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ convId, content }: { convId: string; content: string }) =>
      messagesApi.sendMessage(convId, content),
    onSuccess: (newMsg) => {
      // Optimistically append the new message to the cache
      queryClient.setQueryData<Message[]>(
        ['patient', 'messages', newMsg.conversationId],
        (old) => old ? [...old, newMsg] : [newMsg],
      );
      // Invalidate conversations to update lastMessage preview
      queryClient.invalidateQueries({ queryKey: ['patient', 'conversations'] });
    },
  });
}
```

- [ ] **Step 3: Commit**
```bash
git add src/services/api/messages.ts src/hooks/useMessages.ts
git commit -m "feat: add messages API service + React Query hooks"
```

---

### Task 12: Create WebSocket Hook

**Files:**
- Create: `$FE/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Create WebSocket manager hook**

Manages a single WebSocket connection per conversation. Auto-reconnects with exponential backoff. Falls back to polling when disconnected.

```typescript
// src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Message } from '@/services/api/messages';

interface UseWebSocketOptions {
  conversationId: string | null;
  enabled?: boolean;
}

export function useWebSocket({ conversationId, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    if (!conversationId || !enabled) return;

    // WS routes are mounted at root level in CRM v2 (not under /api/patient)
    // Vite proxy entry for '/ws' handles routing to backend
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/conversations/${conversationId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message') {
          const msg = data.data as Message;
          // Deduplicate: useSendMessage also appends optimistically
          queryClient.setQueryData<Message[]>(
            ['patient', 'messages', conversationId],
            (old) => {
              if (!old) return [msg];
              if (old.some(m => m.id === msg.id)) return old; // already exists
              return [...old, msg];
            },
          );
          queryClient.invalidateQueries({ queryKey: ['patient', 'conversations'] });
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!enabled) return;
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
      reconnectAttempts.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [conversationId, enabled, queryClient]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);
}
```

- [ ] **Step 2: Commit**
```bash
git add src/hooks/useWebSocket.ts
git commit -m "feat: add useWebSocket hook with auto-reconnect"
```

---

### Task 13: Create Messages UI Components

**Files:**
- Create: `$FE/src/components/dashboard/MessageList.tsx`
- Create: `$FE/src/components/dashboard/MessageInput.tsx`
- Create: `$FE/src/components/dashboard/ConversationList.tsx`
- Create: `$FE/src/components/dashboard/ChatView.tsx`
- Create: `$FE/src/components/dashboard/MessagesPage.tsx`

- [ ] **Step 1: Create MessageList component**

```typescript
// src/components/dashboard/MessageList.tsx
import { useEffect, useRef } from 'react';
import type { Message } from '@/services/api/messages';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((msg) => {
        const isOwn = msg.senderId === currentUserId;
        const isSystem = msg.messageType === 'SYSTEM';

        if (isSystem) {
          return (
            <div key={msg.id} className="text-center text-xs text-muted-foreground py-1">
              {msg.content}
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[70%] rounded-lg px-3 py-2 text-sm',
                isOwn
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              )}
            >
              {!isOwn && (
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {msg.senderRole === 'HOSPITAL' ? 'Hospital' : 'Admin'}
                </p>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className={cn(
                'text-xs mt-1',
                isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
              )}>
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Create MessageInput component**

```typescript
// src/components/dashboard/MessageInput.tsx
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2 } from 'lucide-react';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function MessageInput({ onSend, disabled, loading }: MessageInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message..."
        disabled={disabled}
        className="flex-1"
      />
      <Button type="submit" size="icon" disabled={disabled || loading || !text.trim()}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create ConversationList component**

```typescript
// src/components/dashboard/ConversationList.tsx
import type { Conversation } from '@/services/api/messages';
import { cn } from '@/lib/utils';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  if (!conversations.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        No conversations yet
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={cn(
            'w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors',
            selectedId === conv.id && 'bg-muted'
          )}
        >
          <p className="font-medium text-sm truncate">
            {conv.hospitalName ?? (conv.category === 'ADMIN_PATIENT' ? 'Support' : 'Conversation')}
          </p>
          {conv.lastMessagePreview && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {conv.lastMessagePreview}
            </p>
          )}
          {conv.lastMessageAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(conv.lastMessageAt).toLocaleDateString()}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create ChatView component**

```typescript
// src/components/dashboard/ChatView.tsx
import { useMessagesForConversation, useSendMessage } from '@/hooks/useMessages';
import { useWebSocket } from '@/hooks/useWebSocket';
import { usePatientAuthContext } from '@/contexts/PatientAuthContext';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { Loader2 } from 'lucide-react';

interface ChatViewProps {
  conversationId: string;
}

export function ChatView({ conversationId }: ChatViewProps) {
  const { user } = usePatientAuthContext();
  const { data: messages, isLoading } = useMessagesForConversation(conversationId);
  const sendMutation = useSendMessage();

  useWebSocket({ conversationId });

  const handleSend = (content: string) => {
    sendMutation.mutate({ convId: conversationId, content });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages ?? []} currentUserId={user?.id ?? ''} />
      <MessageInput onSend={handleSend} loading={sendMutation.isPending} />
    </div>
  );
}
```

- [ ] **Step 5: Create MessagesPage**

```typescript
// src/components/dashboard/MessagesPage.tsx
import { useState } from 'react';
import { useConversations } from '@/hooks/useMessages';
import { ConversationList } from './ConversationList';
import { ChatView } from './ChatView';
import { Loader2, MessageSquare } from 'lucide-react';

export default function MessagesPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const { data: conversations, isLoading } = useConversations();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] border rounded-lg overflow-hidden">
      {/* Left panel */}
      <div className="w-72 border-r flex-shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Messages</h2>
        </div>
        <ConversationList
          conversations={conversations ?? []}
          selectedId={selectedConvId}
          onSelect={setSelectedConvId}
        />
      </div>

      {/* Right panel */}
      <div className="flex-1">
        {selectedConvId ? (
          <ChatView conversationId={selectedConvId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-3" />
            <p>Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire MessagesPage into Dashboard routes**

In `App.tsx`, replace the messages placeholder:
```typescript
<Route path="messages" element={<MessagesPage />} />
```

- [ ] **Step 7: Verify messages page renders**

Run: `npm run dev`, navigate to `/dashboard/messages`
Expected: Left panel shows conversation list, clicking one shows chat view

- [ ] **Step 8: Commit**
```bash
git add src/components/dashboard/MessageList.tsx src/components/dashboard/MessageInput.tsx \
  src/components/dashboard/ConversationList.tsx src/components/dashboard/ChatView.tsx \
  src/components/dashboard/MessagesPage.tsx src/App.tsx
git commit -m "feat: add MessagesPage with conversation list + real-time chat"
```

---

## Chunk 5: Cleanup + Verification

### Task 14: Final Type Check + Build Verification

**Files:**
- All modified files

- [ ] **Step 1: Run TypeScript type check**

```bash
cd $FE && npx tsc --noEmit
```
Expected: 0 errors. Fix any remaining type issues.

- [ ] **Step 2: Run build**

```bash
cd $FE && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 3: Run lint**

```bash
cd $FE && npm run lint
```
Expected: No new lint errors introduced.

- [ ] **Step 4: Manual smoke test**

1. Start CRM v2 API: `cd $BE && pnpm dev`
2. Start frontend: `cd $FE && npm run dev`
3. Navigate to `http://localhost:3000/login` → enter email → check magic link flow
4. Navigate to `/dashboard` → verify 7-tab sidebar
5. Navigate to `/dashboard/quotes` → verify quotes grouped by case
6. Navigate to `/dashboard/messages` → verify conversation list + chat

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: cleanup type errors and lint issues from Phase 1 migration"
```

---

### Task 15: Update services/api/index.ts

**Files:**
- Modify: `$FE/src/services/api/index.ts`

- [ ] **Step 1: Update the API service barrel export**

Add new modules, remove deleted ones:

```typescript
// src/services/api/index.ts
export { crmApi, CrmApiError } from './crmApiClient';
export { quotesApi } from './quotes';
export { messagesApi } from './messages';

// Keep existing non-patient APIs that may still be used by public pages
export { hospitalApi } from './hospital';
export { departmentApi } from './department';
export { diseaseApi } from './disease';
export { procedureApi } from './procedure';
export { centerApi } from './center';
export { featuredTreatmentApi } from './featured-treatment';
```

- [ ] **Step 2: Commit**
```bash
git add src/services/api/index.ts
git commit -m "chore: update API barrel exports for Phase 1 migration"
```
