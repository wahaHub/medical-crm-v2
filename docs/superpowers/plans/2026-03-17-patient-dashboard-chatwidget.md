# Patient Dashboard & Chat Widget Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conversational Chat Widget (onboarding → multi-hospital messaging) and Patient Dashboard (cases, quotes, intake) to the Medora Beauty website, backed by CRM v2 Hono API with WebSocket real-time messaging.

**Architecture:** Case-first onboarding in the floating chat bubble creates a temp patient + case at Step 4. Multi-hospital selection at Step 5 opens a large PatientMessagePanel (modal/side panel). Dashboard at `/dashboard/*` provides cases overview, quote management, and medical intake. All patient data flows through CRM v2 API via BFF proxy with httpOnly cookie auth. Real-time messaging via `@hono/node-ws` WebSocket.

**Tech Stack:** Hono + Drizzle ORM (backend), Vite + React 19 + Tailwind v4 (frontend), `@hono/node-ws` (WebSocket), Vitest (testing), React Query v5 (data fetching)

**Spec:** `docs/superpowers/specs/2026-03-17-patient-dashboard-chatwidget-design.md`

---

## File Structure

### Backend (medical-crm-v2)

#### New Files

| File | Responsibility |
|------|---------------|
| `packages/domain/src/services/patient-auth.service.ts` | Domain service: JWT sign/verify, magic link token generation |
| `packages/shared/validation/src/patient.schema.ts` | Zod schemas for all patient endpoints |
| `packages/application/src/use-cases/patient-onboarding/init-onboarding.use-case.ts` | Create temp patient + case + session |
| `packages/application/src/use-cases/patient-onboarding/match-hospitals.use-case.ts` | Match hospitals by procedure + destination |
| `packages/application/src/use-cases/patient-onboarding/select-hospitals.use-case.ts` | Attach hospitals to case, create conversations |
| `packages/application/src/use-cases/patient-auth/send-magic-link.use-case.ts` | Send magic link email |
| `packages/application/src/use-cases/patient-auth/verify-magic-link.use-case.ts` | Verify token, return session |
| `packages/application/src/use-cases/patient-auth/set-password.use-case.ts` | Set patient password |
| `packages/application/src/use-cases/patient-dashboard/get-patient-cases.use-case.ts` | List patient's cases with unread counts |
| `packages/application/src/use-cases/patient-dashboard/get-patient-case-detail.use-case.ts` | Single case detail for patient |
| `packages/application/src/use-cases/patient-dashboard/get-patient-conversations.use-case.ts` | List patient's conversations |
| `packages/application/src/use-cases/patient-dashboard/accept-quote.use-case.ts` | Patient accepts a quote |
| `packages/application/src/use-cases/patient-dashboard/reject-quote.use-case.ts` | Patient rejects a quote |
| `packages/application/src/use-cases/patient-intake/get-intake-template.use-case.ts` | Get intake questionnaire |
| `packages/application/src/use-cases/patient-intake/submit-intake.use-case.ts` | Submit intake form |
| `apps/api/src/middleware/patient-auth.middleware.ts` | httpOnly cookie validation middleware |
| `apps/api/src/middleware/rate-limit.middleware.ts` | IP/email rate limiting |
| `apps/api/src/routes/patient-public.routes.ts` | Public onboarding routes (no auth) |
| `apps/api/src/routes/patient-auth.routes.ts` | Magic link, verify, set-password routes |
| `apps/api/src/routes/patient-protected.routes.ts` | Authenticated patient routes (cases, messages, quotes, intake) |
| `apps/api/src/ws/patient-ws.ts` | WebSocket upgrade handlers for conversations + notifications |
| `apps/api/src/ws/ws-manager.ts` | In-memory WebSocket connection registry + broadcast |
| `packages/application/__tests__/patient-onboarding/*.test.ts` | Unit tests for onboarding use cases |
| `packages/application/__tests__/patient-auth/*.test.ts` | Unit tests for auth use cases |
| `packages/application/__tests__/patient-dashboard/*.test.ts` | Unit tests for dashboard use cases |
| `apps/api/src/__tests__/patient-routes.test.ts` | Route-level tests |

#### Modified Files

| File | Change |
|------|--------|
| `packages/infrastructure/database/schema/schema.ts` | Add `password_hash` + `phone` columns to `users` table |
| `packages/domain/src/ports/patient-repository.port.ts` | Extend with `findByEmail()`, `createTempPatient()`, `updatePassword()` |
| `packages/infrastructure/database/repositories/drizzle-patient.repository.ts` | Implement new port methods |
| `apps/api/src/composition-root.ts` | Wire new repos, services, and use cases |
| `apps/api/src/index.ts` | Mount patient routes, add WebSocket upgrade |
| `apps/api/src/server.ts` | Inject WebSocket into Node server |
| `apps/api/package.json` | Add `@hono/node-ws`, `bcryptjs` deps |
| `packages/domain/package.json` | Add `jose` dependency for ESM-safe JWT |

### Frontend (medora-health-beauty root)

#### New Files

| File | Responsibility |
|------|---------------|
| `contexts/PatientAuthContext.tsx` | Auth state + patient profile (cookie session, no JS token) |
| `services/crmApiClient.ts` | Fetch wrapper through BFF proxy, cookie-based auth |
| `services/wsClient.ts` | WebSocket connection manager (connect, reconnect, subscribe) |
| `hooks/useWebSocket.ts` | WebSocket lifecycle hook |
| `hooks/usePatientCases.ts` | React Query: GET /patient/cases |
| `hooks/usePatientConversations.ts` | React Query: GET /patient/conversations |
| `hooks/useCaseDetail.ts` | React Query: GET /patient/cases/:id |
| `hooks/useMessages.ts` | React Query + WebSocket: live messages |
| `hooks/useQuote.ts` | React Query: GET /patient/cases/:id/quote |
| `components/chat/ChatBubble.tsx` | Floating button + unread badge |
| `components/chat/ChatWindow.tsx` | Expandable window container |
| `components/chat/OnboardingFlow.tsx` | Step-by-step onboarding (Steps 1-5) |
| `components/chat/CategoryStep.tsx` | Step 1: category selection |
| `components/chat/ProcedureStep.tsx` | Step 2: procedure selection |
| `components/chat/DestinationStep.tsx` | Step 3: destination selection |
| `components/chat/ContactInfoStep.tsx` | Step 4: name/email/phone/language + CAPTCHA |
| `components/chat/HospitalCards.tsx` | Step 5: multi-select hospital cards |
| `components/chat/OnboardingSummary.tsx` | Completion state + open messages CTA |
| `components/messaging/PatientMessagePanel.tsx` | Large modal/side panel container |
| `components/messaging/ConversationList.tsx` | Left pane: hospital conversations |
| `components/messaging/ChatView.tsx` | Right pane: active conversation |
| `components/messaging/MessageList.tsx` | Message bubbles with timestamps |
| `components/messaging/MessageInput.tsx` | Text input + send button |
| `components/messaging/PanelHeader.tsx` | Panel title bar + close |
| `pages/dashboard/DashboardLayout.tsx` | Dashboard shell (top bar + Outlet) |
| `pages/dashboard/DashboardHome.tsx` | Cases list + action items |
| `pages/dashboard/CaseDetail.tsx` | Tabbed: Messages / Quote / Overview |
| `pages/dashboard/IntakePage.tsx` | Medical intake multi-step form |
| `pages/dashboard/AccountPage.tsx` | Account settings |
| `pages/dashboard/LoginPage.tsx` | Email + magic link login |
| `components/ProtectedRoute.tsx` | Auth guard for dashboard routes |

#### Modified Files

| File | Change |
|------|--------|
| `App.tsx` | Replace `ChatWidget` import, add dashboard routes outside Header/Footer, add PatientAuthProvider |
| `index.tsx` | No changes needed (QueryClient already set up) |
| `vite.config.ts` | Add proxy config for `/api/patient/*` → CRM v2 server |
| `components/ChatWidget.tsx` | Complete rewrite → new onboarding chat widget |
| `types.ts` | Add patient-related type interfaces |
| `package.json` | Add `@marsidev/react-turnstile` for Cloudflare Turnstile CAPTCHA |

---

## Chunk 1: Backend — Patient Auth Foundation

### Task 1: Database Schema Changes

**Files:**
- Modify: `packages/infrastructure/database/schema/schema.ts`

- [ ] **Step 1: Add `phone` and `password_hash` columns to `users` table**

In `schema.ts`, add to the `users` table definition:

```typescript
phone: varchar({ length: 20 }),
passwordHash: varchar("password_hash", { length: 255 }),
```

- [ ] **Step 2: Generate and apply migration**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: All packages pass

- [ ] **Step 4: Commit**

```bash
git add packages/infrastructure/database/
git commit -m "feat: add phone and password_hash fields for patient auth"
```

### Task 2: Patient Auth Domain Service

**Files:**
- Create: `packages/domain/src/services/patient-auth.service.ts`
- Modify: `packages/domain/src/ports/patient-repository.port.ts`

- [ ] **Step 1: Write tests for PatientAuthService**

Create `packages/application/__tests__/patient-auth/patient-auth.service.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { PatientAuthService } from '@medical-crm/domain';

describe('PatientAuthService', () => {
  it('generates a JWT with userId and role PATIENT', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createSessionToken('user-123');
    const payload = await service.verifySessionToken(token);
    expect(payload.userId).toBe('user-123');
    expect(payload.role).toBe('PATIENT');
  });

  it('throws on expired token', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createSessionToken('user-123', -1); // expired
    await expect(service.verifySessionToken(token)).rejects.toThrow();
  });

  it('generates a magic link token', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createMagicLinkToken('test@email.com');
    const payload = await service.verifyMagicLinkToken(token);
    expect(payload.email).toBe('test@email.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @medical-crm/application test -- --run patient-auth.service`
Expected: FAIL — module not found

- [ ] **Step 3: Extend IPatientRepository**

Add to `packages/domain/src/ports/patient-repository.port.ts`:

```typescript
export interface IPatientRepository {
  findById(id: string): Promise<PatientBasicInfo | null>;
  findByEmail(email: string): Promise<PatientBasicInfo | null>;
  createTempPatient(input: {
    email: string;
    name: string;
    phone: string;
    preferredLanguage: string;
  }): Promise<PatientBasicInfo>;
  updatePasswordHash(userId: string, hash: string): Promise<void>;
}
```

- [ ] **Step 4: Implement PatientAuthService using `jose` (ESM-safe)**

Create `packages/domain/src/services/patient-auth.service.ts`:

```typescript
import * as jose from 'jose';

export interface PatientSessionPayload {
  userId: string;
  role: 'PATIENT';
  exp: number;
}

export interface MagicLinkPayload {
  email: string;
  purpose: 'magic-link';
  exp: number;
}

export class PatientAuthService {
  private readonly secret: Uint8Array;

  constructor(secret: string) {
    this.secret = new TextEncoder().encode(secret);
  }

  async createSessionToken(userId: string, expiresInHours = 24): Promise<string> {
    return await new jose.SignJWT({ userId, role: 'PATIENT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(`${expiresInHours}h`)
      .sign(this.secret);
  }

  async verifySessionToken(token: string): Promise<PatientSessionPayload> {
    const { payload } = await jose.jwtVerify(token, this.secret);
    return payload as unknown as PatientSessionPayload;
  }

  async createMagicLinkToken(email: string): Promise<string> {
    return await new jose.SignJWT({ email, purpose: 'magic-link' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(this.secret);
  }

  async verifyMagicLinkToken(token: string): Promise<MagicLinkPayload> {
    const { payload } = await jose.jwtVerify(token, this.secret);
    const parsed = payload as unknown as MagicLinkPayload;
    if (parsed.purpose !== 'magic-link') throw new Error('Invalid token purpose');
    return parsed;
  }
}
```

- [ ] **Step 5: Export from domain package index**

Add exports to `packages/domain/src/index.ts`:
```typescript
export * from './services/patient-auth.service.js';
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @medical-crm/application test -- --run patient-auth.service`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add packages/domain/ packages/application/__tests__/
git commit -m "feat: add PatientAuthService with JWT session + magic link tokens"
```

### Task 3: Patient Auth Middleware

**Files:**
- Create: `apps/api/src/middleware/patient-auth.middleware.ts`

- [ ] **Step 1: Write test for middleware**

Create `apps/api/src/__tests__/patient-auth.middleware.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { patientAuthMiddleware } from '../middleware/patient-auth.middleware.js';
import { PatientAuthService } from '@medical-crm/domain';

describe('patientAuthMiddleware', () => {
  const secret = 'test-secret';
  const authService = new PatientAuthService(secret);

  function createApp() {
    const app = new Hono();
    app.use('/*', patientAuthMiddleware(authService));
    app.get('/test', (c) => {
      const patient = c.get('patientSession');
      return c.json({ userId: patient.userId });
    });
    return app;
  }

  it('returns 401 when no cookie present', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid session cookie', async () => {
    const app = createApp();
    const token = await authService.createSessionToken('user-1');
    const res = await app.request('/test', {
      headers: { Cookie: `patient_session=${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
  });

  it('returns 401 with expired cookie', async () => {
    const app = createApp();
    const token = await authService.createSessionToken('user-1', -1);
    const res = await app.request('/test', {
      headers: { Cookie: `patient_session=${token}` },
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test -- --run patient-auth.middleware`
Expected: FAIL

- [ ] **Step 3: Implement middleware**

Create `apps/api/src/middleware/patient-auth.middleware.ts`:

```typescript
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { PatientAuthService, PatientSessionPayload } from '@medical-crm/domain';

declare module 'hono' {
  interface ContextVariableMap {
    patientSession: PatientSessionPayload;
  }
}

export function patientAuthMiddleware(
  authService: PatientAuthService,
): MiddlewareHandler {
  return async (c, next) => {
    const token = getCookie(c, 'patient_session');
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
      const payload = await authService.verifySessionToken(token);
      c.set('patientSession', payload);
      await next();
    } catch {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }
  };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter api test -- --run patient-auth.middleware`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/ apps/api/src/__tests__/
git commit -m "feat: add patientAuthMiddleware for httpOnly cookie session"
```

### Task 4: Rate Limiting Middleware

**Files:**
- Create: `apps/api/src/middleware/rate-limit.middleware.ts`

- [ ] **Step 1: Write test**

Create `apps/api/src/__tests__/rate-limit.middleware.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimitByIp } from '../middleware/rate-limit.middleware.js';

describe('rateLimitByIp', () => {
  it('allows requests under the limit', async () => {
    const app = new Hono();
    app.use('/*', rateLimitByIp({ maxRequests: 3, windowMs: 60_000 }));
    app.post('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('blocks requests over the limit', async () => {
    const app = new Hono();
    app.use('/*', rateLimitByIp({ maxRequests: 2, windowMs: 60_000 }));
    app.post('/test', (c) => c.json({ ok: true }));

    await app.request('/test', { method: 'POST' });
    await app.request('/test', { method: 'POST' });
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test -- --run rate-limit`
Expected: FAIL

- [ ] **Step 3: Implement rate limiter (in-memory)**

Create `apps/api/src/middleware/rate-limit.middleware.ts`:

```typescript
import type { MiddlewareHandler } from 'hono';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const ipHits = new Map<string, { count: number; resetAt: number }>();

export function rateLimitByIp(config: RateLimitConfig): MiddlewareHandler {
  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    const now = Date.now();
    const entry = ipHits.get(ip);

    if (!entry || now > entry.resetAt) {
      ipHits.set(ip, { count: 1, resetAt: now + config.windowMs });
      await next();
      return;
    }

    if (entry.count >= config.maxRequests) {
      return c.json({ error: 'Too many requests' }, 429);
    }

    entry.count++;
    await next();
  };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter api test -- --run rate-limit`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/ apps/api/src/__tests__/
git commit -m "feat: add in-memory IP rate limiting middleware"
```

### Task 5: Patient Repository Extensions

**Files:**
- Modify: `packages/infrastructure/database/repositories/drizzle-patient.repository.ts`

- [ ] **Step 1: Write tests for extended patient repo**

Create `packages/application/__tests__/patient-onboarding/patient-repo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IPatientRepository } from '@medical-crm/domain';

describe('IPatientRepository contract', () => {
  let repo: IPatientRepository;

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(null),
      createTempPatient: vi.fn().mockResolvedValue({
        id: 'new-id', patientCode: null, preferredLanguage: 'en',
      }),
      updatePasswordHash: vi.fn(),
    };
  });

  it('creates a temp patient with role PATIENT', async () => {
    const result = await repo.createTempPatient({
      email: 'test@test.com', name: 'Test', phone: '+1234', preferredLanguage: 'en',
    });
    expect(result.id).toBe('new-id');
    expect(repo.createTempPatient).toHaveBeenCalledOnce();
  });

  it('findByEmail returns null for unknown email', async () => {
    const result = await repo.findByEmail('unknown@test.com');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it passes (contract test with mocks)**

Run: `pnpm --filter @medical-crm/application test -- --run patient-repo`
Expected: PASS

- [ ] **Step 3: Implement extended DrizzlePatientRepository**

In `packages/infrastructure/database/repositories/drizzle-patient.repository.ts`, add:

```typescript
async findByEmail(email: string): Promise<PatientBasicInfo | null> {
  const [row] = await this.db
    .select({ id: users.id, patientCode: users.patientCode, preferredLanguage: users.preferredLanguage })
    .from(users)
    .where(and(eq(users.email, email), eq(users.role, 'PATIENT')))
    .limit(1);
  return row ?? null;
}

async createTempPatient(input: {
  email: string; name: string; phone: string; preferredLanguage: string;
}): Promise<PatientBasicInfo> {
  const [row] = await this.db.insert(users).values({
    email: input.email,
    name: input.name,
    phone: input.phone,
    role: 'PATIENT',
    preferredLanguage: input.preferredLanguage,
    status: 'active',
    updatedAt: new Date().toISOString(),
  }).returning({ id: users.id, patientCode: users.patientCode, preferredLanguage: users.preferredLanguage });
  return row;
}

async updatePasswordHash(userId: string, hash: string): Promise<void> {
  await this.db.update(users).set({ passwordHash: hash, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/ packages/domain/ packages/application/__tests__/
git commit -m "feat: extend patient repo with findByEmail and createTempPatient"
```

### Task 6: Validation Schemas

**Files:**
- Create: `packages/shared/validation/src/patient.schema.ts`

- [ ] **Step 1: Create Zod schemas for patient endpoints**

```typescript
import { z } from 'zod';

// POST /api/patient/onboarding/init
export const initOnboardingSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  phone: z.string().min(5).max(20),
  preferredLanguage: z.string().min(2).max(10).default('en'),
  procedureId: z.string().uuid().optional(),
  destination: z.string().max(100).optional(),
  category: z.enum(['face', 'body', 'non-surgical']).optional(),
  captchaToken: z.string().min(1),
});

// POST /api/patient/match-hospitals
export const matchHospitalsSchema = z.object({
  procedureId: z.string().uuid().optional(),
  procedureName: z.string().optional(),
  destination: z.string().max(100).optional(),
  category: z.enum(['face', 'body', 'non-surgical']).optional(),
});

// POST /api/patient/select-hospitals
export const selectHospitalsSchema = z.object({
  caseId: z.string().uuid(),
  hospitalIds: z.array(z.string().uuid()).min(1).max(5),
});

// POST /api/patient/magic-link
export const magicLinkSchema = z.object({
  email: z.string().email().max(255),
});

// POST /api/patient/verify-token
export const verifyTokenSchema = z.object({
  token: z.string().min(1),
});

// POST /api/patient/set-password
export const setPasswordSchema = z.object({
  password: z.string().min(8).max(100),
});

// POST /api/patient/conversations/:convId/messages
export const sendPatientMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

// GET /api/patient/conversations/:convId/messages
export const listMessagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  after: z.string().uuid().optional(),
});

// POST /api/patient/intake/:caseId
export const submitIntakeSchema = z.object({
  responses: z.array(z.object({
    questionId: z.string(),
    answer: z.union([z.string(), z.array(z.string())]),
  })),
});

// POST /api/patient/cases/:id/quote/accept & reject
export const quoteActionSchema = z.object({
  quoteId: z.string().uuid(),
});
```

- [ ] **Step 2: Export from validation index**

Add to `packages/shared/validation/src/index.ts`:
```typescript
export * from './patient.schema.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/validation/
git commit -m "feat: add Zod validation schemas for patient endpoints"
```

---

## Chunk 2: Backend — Onboarding Use Cases & Routes

### Task 7: InitOnboarding Use Case

**Files:**
- Create: `packages/application/src/use-cases/patient-onboarding/init-onboarding.use-case.ts`
- Test: `packages/application/__tests__/patient-onboarding/init-onboarding.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitOnboardingUseCase } from '../../src/use-cases/patient-onboarding/init-onboarding.use-case.js';

describe('InitOnboardingUseCase', () => {
  let useCase: InitOnboardingUseCase;
  let mockPatientRepo: any;
  let mockCaseRepo: any;
  let mockAuthService: any;

  beforeEach(() => {
    mockPatientRepo = {
      findByEmail: vi.fn().mockResolvedValue(null),
      createTempPatient: vi.fn().mockResolvedValue({
        id: 'patient-1', patientCode: null, preferredLanguage: 'en',
      }),
    };
    mockCaseRepo = {
      save: vi.fn().mockImplementation((c: any) => Promise.resolve(c)),
      nextCaseNumber: vi.fn().mockResolvedValue('CASE-2026-0001'),
    };
    mockAuthService = {
      createSessionToken: vi.fn().mockReturnValue('jwt-token-123'),
    };
    useCase = new InitOnboardingUseCase(mockPatientRepo, mockCaseRepo, mockAuthService);
  });

  it('creates a new patient and case when email is new', async () => {
    const result = await useCase.execute({
      email: 'new@test.com', name: 'New User', phone: '+1234', preferredLanguage: 'en',
    });
    expect(mockPatientRepo.createTempPatient).toHaveBeenCalledOnce();
    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    expect(result.token).toBe('jwt-token-123');
    expect(result.caseId).toBeDefined();
  });

  it('reuses existing patient when email exists', async () => {
    mockPatientRepo.findByEmail.mockResolvedValue({
      id: 'existing-1', patientCode: 'P001', preferredLanguage: 'zh',
    });
    const result = await useCase.execute({
      email: 'existing@test.com', name: 'Existing', phone: '+1234', preferredLanguage: 'zh',
    });
    expect(mockPatientRepo.createTempPatient).not.toHaveBeenCalled();
    expect(result.patientId).toBe('existing-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @medical-crm/application test -- --run init-onboarding`
Expected: FAIL

- [ ] **Step 3: Implement use case**

```typescript
import { randomUUID } from 'node:crypto';
import type { IPatientRepository } from '@medical-crm/domain';
import type { ICaseRepository } from '@medical-crm/domain';
import type { PatientAuthService } from '@medical-crm/domain';

export interface InitOnboardingInput {
  email: string;
  name: string;
  phone: string;
  preferredLanguage: string;
  procedureId?: string;
  destination?: string;
  category?: string;
}

export interface InitOnboardingOutput {
  patientId: string;
  caseId: string;
  token: string;
  isExistingPatient: boolean;
}

export class InitOnboardingUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: InitOnboardingInput): Promise<InitOnboardingOutput> {
    // 1. Find or create patient
    let patient = await this.patientRepo.findByEmail(input.email);
    const isExisting = !!patient;

    if (!patient) {
      patient = await this.patientRepo.createTempPatient({
        email: input.email,
        name: input.name,
        phone: input.phone,
        preferredLanguage: input.preferredLanguage,
      });
    }

    // 2. Create case (Case-first)
    const caseNumber = await this.caseRepo.nextCaseNumber();
    const caseId = randomUUID();
    await this.caseRepo.save({
      id: caseId,
      caseNumber,
      patientId: patient.id,
      patientName: input.name,
      patientLanguage: input.preferredLanguage,
      primaryDiagnosis: input.category ?? null,
      status: 'DRAFT',
      assignmentStatus: 'UNASSIGNED',
      treatmentStage: 'CONFIRMED',
    } as any);

    // 3. Create session token
    const token = await this.authService.createSessionToken(patient.id);

    return { patientId: patient.id, caseId, token, isExistingPatient: isExisting };
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @medical-crm/application test -- --run init-onboarding`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/application/
git commit -m "feat: add InitOnboardingUseCase — case-first patient onboarding"
```

### Task 8: MatchHospitals Use Case

**Files:**
- Create: `packages/application/src/use-cases/patient-onboarding/match-hospitals.use-case.ts`
- Test: `packages/application/__tests__/patient-onboarding/match-hospitals.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchHospitalsUseCase } from '../../src/use-cases/patient-onboarding/match-hospitals.use-case.js';

describe('MatchHospitalsUseCase', () => {
  let useCase: MatchHospitalsUseCase;
  let mockHospitalRepo: any;

  beforeEach(() => {
    mockHospitalRepo = {
      findByProcedureAndDestination: vi.fn().mockResolvedValue([
        { id: 'h1', name: 'Hospital A', rating: 4.8 },
        { id: 'h2', name: 'Hospital B', rating: 4.5 },
      ]),
    };
    useCase = new MatchHospitalsUseCase(mockHospitalRepo);
  });

  it('returns matched hospitals sorted by rating', async () => {
    const result = await useCase.execute({ destination: 'Seoul' });
    expect(result.hospitals).toHaveLength(2);
    expect(result.hospitals[0].name).toBe('Hospital A');
  });

  it('returns empty array when no match', async () => {
    mockHospitalRepo.findByProcedureAndDestination.mockResolvedValue([]);
    const result = await useCase.execute({ destination: 'Unknown' });
    expect(result.hospitals).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `pnpm --filter @medical-crm/application test -- --run match-hospitals`

- [ ] **Step 3: Implement use case**

```typescript
import type { IHospitalRepository } from '@medical-crm/domain';

export interface MatchHospitalsInput {
  procedureId?: string;
  procedureName?: string;
  destination?: string;
  category?: string;
}

export interface MatchedHospital {
  id: string;
  name: string;
  nameEn: string | null;
  rating: number | null;
  logoUrl: string | null;
  tags: string[];
  procedureCount: number;
}

export class MatchHospitalsUseCase {
  constructor(private readonly hospitalRepo: IHospitalRepository) {}

  async execute(input: MatchHospitalsInput): Promise<{ hospitals: MatchedHospital[] }> {
    const hospitals = await this.hospitalRepo.findByProcedureAndDestination({
      procedureId: input.procedureId,
      destination: input.destination,
      category: input.category,
    });
    return { hospitals };
  }
}
```

Note: `findByProcedureAndDestination` method needs to be added to `IHospitalRepository` port and implemented in `DrizzleHospitalRepository`. The implementation should query hospitals with matching procedures and location, returning up to 10 results sorted by rating.

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/application/
git commit -m "feat: add MatchHospitalsUseCase for hospital recommendations"
```

### Task 9: SelectHospitals Use Case

**Files:**
- Create: `packages/application/src/use-cases/patient-onboarding/select-hospitals.use-case.ts`
- Test: `packages/application/__tests__/patient-onboarding/select-hospitals.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectHospitalsUseCase } from '../../src/use-cases/patient-onboarding/select-hospitals.use-case.js';

describe('SelectHospitalsUseCase', () => {
  let useCase: SelectHospitalsUseCase;
  let mockCaseHospitalRepo: any;
  let mockConversationRepo: any;

  beforeEach(() => {
    mockCaseHospitalRepo = {
      createMany: vi.fn().mockResolvedValue(undefined),
    };
    mockConversationRepo = {
      create: vi.fn().mockResolvedValue({ id: 'conv-1' }),
    };
    useCase = new SelectHospitalsUseCase(mockCaseHospitalRepo, mockConversationRepo);
  });

  it('creates hospital contacts and conversations for each hospital', async () => {
    await useCase.execute({
      caseId: 'case-1',
      hospitalIds: ['h1', 'h2'],
      patientId: 'patient-1',
    });
    expect(mockCaseHospitalRepo.createMany).toHaveBeenCalledWith(
      'case-1',
      ['h1', 'h2'],
    );
    expect(mockConversationRepo.create).toHaveBeenCalledTimes(2);
  });

  it('throws if no hospitals selected', async () => {
    await expect(
      useCase.execute({ caseId: 'case-1', hospitalIds: [], patientId: 'p1' }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement use case**

```typescript
import type { ICaseHospitalContactRepository, IConversationRepository } from '@medical-crm/domain';
import { ValidationError } from '@medical-crm/shared-utils';

export interface SelectHospitalsInput {
  caseId: string;
  hospitalIds: string[];
  patientId: string;
}

export class SelectHospitalsUseCase {
  constructor(
    private readonly caseHospitalRepo: ICaseHospitalContactRepository,
    private readonly conversationRepo: IConversationRepository,
  ) {}

  async execute(input: SelectHospitalsInput): Promise<{ conversationIds: string[] }> {
    if (input.hospitalIds.length === 0) {
      throw new ValidationError('At least one hospital must be selected');
    }

    // 1. Create case_hospital_contact records (DISTRIBUTED status)
    await this.caseHospitalRepo.createMany(input.caseId, input.hospitalIds);

    // 2. Create a conversation for each hospital
    const conversationIds: string[] = [];
    for (const hospitalId of input.hospitalIds) {
      const conv = await this.conversationRepo.create({
        caseId: input.caseId,
        hospitalId,
        category: 'HOSPITAL_PATIENT',
        title: null,
      });
      conversationIds.push(conv.id);
    }

    return { conversationIds };
  }
}
```

- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add packages/application/
git commit -m "feat: add SelectHospitalsUseCase — multi-hospital case distribution"
```

### Task 10: Patient Public Routes

**Files:**
- Create: `apps/api/src/routes/patient-public.routes.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/composition-root.ts`

- [ ] **Step 1: Wire new use cases in composition-root.ts**

Add to the `getServices()` function:

```typescript
// Patient auth service
const patientAuthService = new PatientAuthService(
  process.env.PATIENT_JWT_SECRET ?? 'dev-patient-secret',
);

// Patient onboarding use cases
const initOnboarding = new InitOnboardingUseCase(patientRepo, caseRepo, patientAuthService);
const matchHospitals = new MatchHospitalsUseCase(hospitalRepo);
const selectHospitals = new SelectHospitalsUseCase(caseHospitalContactRepo, conversationRepo);
```

And add to the `_services` return object.

- [ ] **Step 2: Create patient-public.routes.ts**

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { setCookie } from 'hono/cookie';
import { getServices } from '../composition-root.js';
import { rateLimitByIp } from '../middleware/rate-limit.middleware.js';
import { initOnboardingSchema, matchHospitalsSchema } from '@medical-crm/validation';

const app = new OpenAPIHono();

// POST /api/patient/onboarding/init
app.post('/onboarding/init', rateLimitByIp({ maxRequests: 5, windowMs: 3600_000 }), async (c) => {
  const body = initOnboardingSchema.parse(await c.req.json());
  // TODO: Verify Turnstile captchaToken
  const { initOnboarding } = getServices();
  const result = await initOnboarding.execute(body);
  setCookie(c, 'patient_session', result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400, // 24h
  });
  return c.json({ patientId: result.patientId, caseId: result.caseId, isExistingPatient: result.isExistingPatient });
});

// GET /api/patient/procedures
app.get('/procedures', async (c) => {
  const category = c.req.query('category');
  // Query procedures from Supabase or CRM DB
  const { listProcedures } = getServices();
  const result = await listProcedures.execute({ category });
  return c.json(result);
});

// GET /api/patient/destinations
app.get('/destinations', async (c) => {
  const { listDestinations } = getServices();
  const result = await listDestinations.execute();
  return c.json(result);
});

// POST /api/patient/match-hospitals
app.post('/match-hospitals', async (c) => {
  const body = matchHospitalsSchema.parse(await c.req.json());
  const { matchHospitals } = getServices();
  const result = await matchHospitals.execute(body);
  return c.json(result);
});

export default app;
```

- [ ] **Step 3: Mount in index.ts**

In `apps/api/src/index.ts`, add before the auth middleware block:

```typescript
import patientPublicRoutes from './routes/patient-public.routes.js';

// Public patient routes (no auth)
app.route('/api/patient', patientPublicRoutes);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ packages/
git commit -m "feat: add public patient onboarding routes (init, procedures, destinations, match)"
```

### Task 11: Patient Auth Routes

**Files:**
- Create: `apps/api/src/routes/patient-auth.routes.ts`
- Create: `packages/application/src/use-cases/patient-auth/send-magic-link.use-case.ts`
- Create: `packages/application/src/use-cases/patient-auth/verify-magic-link.use-case.ts`
- Create: `packages/application/src/use-cases/patient-auth/set-password.use-case.ts`

- [ ] **Step 1: Write tests for auth use cases**

Create `packages/application/__tests__/patient-auth/send-magic-link.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SendMagicLinkUseCase } from '../../src/use-cases/patient-auth/send-magic-link.use-case.js';

describe('SendMagicLinkUseCase', () => {
  it('generates a token and sends email', async () => {
    const mockPatientRepo = { findByEmail: vi.fn().mockResolvedValue({ id: 'p1' }) };
    const mockAuthService = { createMagicLinkToken: vi.fn().mockReturnValue('magic-token') };
    const mockEmailService = { sendMagicLink: vi.fn().mockResolvedValue(undefined) };

    const useCase = new SendMagicLinkUseCase(mockPatientRepo as any, mockAuthService as any, mockEmailService as any);
    await useCase.execute({ email: 'test@test.com' });

    expect(mockEmailService.sendMagicLink).toHaveBeenCalledWith('test@test.com', expect.stringContaining('magic-token'));
  });

  it('does nothing silently for unknown email (no leak)', async () => {
    const mockPatientRepo = { findByEmail: vi.fn().mockResolvedValue(null) };
    const mockAuthService = { createMagicLinkToken: vi.fn() };
    const mockEmailService = { sendMagicLink: vi.fn() };

    const useCase = new SendMagicLinkUseCase(mockPatientRepo as any, mockAuthService as any, mockEmailService as any);
    await useCase.execute({ email: 'unknown@test.com' });

    expect(mockEmailService.sendMagicLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement SendMagicLinkUseCase**

```typescript
import type { IPatientRepository, PatientAuthService } from '@medical-crm/domain';

export interface IEmailService {
  sendMagicLink(email: string, link: string): Promise<void>;
}

export class SendMagicLinkUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly authService: PatientAuthService,
    private readonly emailService: IEmailService,
  ) {}

  async execute(input: { email: string }): Promise<void> {
    const patient = await this.patientRepo.findByEmail(input.email);
    if (!patient) return; // Silent — no email leak

    const token = await this.authService.createMagicLinkToken(input.email);
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/dashboard?token=${token}`;
    await this.emailService.sendMagicLink(input.email, link);
  }
}
```

- [ ] **Step 4: Implement VerifyMagicLinkUseCase**

```typescript
import type { IPatientRepository, PatientAuthService } from '@medical-crm/domain';

export class VerifyMagicLinkUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: { token: string }): Promise<{ sessionToken: string; patientId: string }> {
    const payload = await this.authService.verifyMagicLinkToken(input.token);
    const patient = await this.patientRepo.findByEmail(payload.email);
    if (!patient) throw new Error('Patient not found');
    const sessionToken = await this.authService.createSessionToken(patient.id);
    return { sessionToken, patientId: patient.id };
  }
}
```

- [ ] **Step 5: Implement SetPasswordUseCase**

```typescript
import bcrypt from 'bcryptjs';
import type { IPatientRepository } from '@medical-crm/domain';

export class SetPasswordUseCase {
  constructor(private readonly patientRepo: IPatientRepository) {}

  async execute(input: { userId: string; password: string }): Promise<void> {
    const hash = await bcrypt.hash(input.password, 12);
    await this.patientRepo.updatePasswordHash(input.userId, hash);
  }
}
```

- [ ] **Step 6: Create patient-auth.routes.ts**

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { setCookie } from 'hono/cookie';
import { getServices } from '../composition-root.js';
import { rateLimitByIp } from '../middleware/rate-limit.middleware.js';
import { patientAuthMiddleware } from '../middleware/patient-auth.middleware.js';
import { magicLinkSchema, verifyTokenSchema, setPasswordSchema } from '@medical-crm/validation';

const app = new OpenAPIHono();

app.post('/magic-link', rateLimitByIp({ maxRequests: 3, windowMs: 3600_000 }), async (c) => {
  const { email } = magicLinkSchema.parse(await c.req.json());
  const { sendMagicLink } = getServices();
  await sendMagicLink.execute({ email });
  return c.json({ ok: true }); // Always 200 — no email leak
});

app.post('/verify-token', async (c) => {
  const { token } = verifyTokenSchema.parse(await c.req.json());
  const { verifyMagicLink } = getServices();
  const result = await verifyMagicLink.execute({ token });
  setCookie(c, 'patient_session', result.sessionToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/', maxAge: 86400,
  });
  return c.json({ patientId: result.patientId });
});

app.post('/set-password', async (c, next) => {
  const { patientAuthService } = getServices();
  return patientAuthMiddleware(patientAuthService)(c, next);
}, async (c) => {
  const { password } = setPasswordSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { setPassword } = getServices();
  await setPassword.execute({ userId: session.userId, password });
  return c.json({ ok: true });
});

export default app;
```

- [ ] **Step 7: Mount in index.ts**

```typescript
import patientAuthRoutes from './routes/patient-auth.routes.js';
app.route('/api/patient', patientAuthRoutes);
```

- [ ] **Step 8: Run tests → PASS**
- [ ] **Step 9: Commit**

```bash
git add packages/ apps/api/src/
git commit -m "feat: add patient auth routes (magic link, verify, set-password)"
```

---

## Chunk 3: Backend — Dashboard & Messaging APIs

### Task 12: Patient Protected Routes (Cases, Messages, Quotes, Intake)

**Files:**
- Create: `apps/api/src/routes/patient-protected.routes.ts`
- Create: `packages/application/src/use-cases/patient-dashboard/get-patient-cases.use-case.ts`
- Create: `packages/application/src/use-cases/patient-dashboard/get-patient-conversations.use-case.ts`
- Create: `packages/application/src/use-cases/patient-dashboard/accept-quote.use-case.ts`
- Create: `packages/application/src/use-cases/patient-dashboard/reject-quote.use-case.ts`
- Create: `packages/application/src/use-cases/patient-intake/get-intake-template.use-case.ts`
- Create: `packages/application/src/use-cases/patient-intake/submit-intake.use-case.ts`

- [ ] **Step 1: Write tests for GetPatientCases**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GetPatientCasesUseCase } from '../../src/use-cases/patient-dashboard/get-patient-cases.use-case.js';

describe('GetPatientCasesUseCase', () => {
  it('returns cases with unread counts for the patient', async () => {
    const mockCaseRepo = {
      findByPatientId: vi.fn().mockResolvedValue([
        { id: 'c1', caseNumber: 'CASE-001', assignmentStatus: 'UNASSIGNED', treatmentStage: 'CONFIRMED' },
      ]),
    };
    const mockConversationRepo = {
      getUnreadCountsByCase: vi.fn().mockResolvedValue({ c1: 3 }),
    };

    const useCase = new GetPatientCasesUseCase(mockCaseRepo as any, mockConversationRepo as any);
    const result = await useCase.execute({ patientId: 'p1' });

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].unreadCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement GetPatientCasesUseCase**

```typescript
import type { ICaseRepository, IConversationRepository } from '@medical-crm/domain';

export class GetPatientCasesUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly conversationRepo: IConversationRepository,
  ) {}

  async execute(input: { patientId: string }) {
    const cases = await this.caseRepo.findByPatientId(input.patientId);
    const unreadCounts = await this.conversationRepo.getUnreadCountsByCase(input.patientId);

    return {
      cases: cases.map((c: any) => ({
        ...c,
        unreadCount: unreadCounts[c.id] ?? 0,
      })),
    };
  }
}
```

Note: `findByPatientId` needs to be added to `ICaseRepository`. It should join with `case_hospital_contacts` to include hospital info per case.

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Implement AcceptQuoteUseCase and RejectQuoteUseCase**

These delegate to the existing quote use cases but with patient-role authorization:

```typescript
// accept-quote.use-case.ts
export class AcceptQuoteUseCase {
  constructor(private readonly quoteRepo: IQuoteRepository) {}

  async execute(input: { quoteId: string; patientId: string }) {
    const quote = await this.quoteRepo.findById(input.quoteId);
    if (!quote) throw new NotFoundError('Quote not found');
    // Verify patient owns the case
    if (quote.case.patientId !== input.patientId) throw new ForbiddenError('Not your quote');
    if (quote.status !== 'PENDING') throw new ValidationError('Quote is not pending');

    await this.quoteRepo.updateStatus(input.quoteId, 'ACCEPTED');
    // Auto-reject other quotes for the same case
    await this.quoteRepo.rejectOthersByCase(quote.caseId, input.quoteId);
  }
}
```

- [ ] **Step 6: Implement GetIntakeTemplate and SubmitIntake use cases**

```typescript
// get-intake-template.use-case.ts
export class GetIntakeTemplateUseCase {
  constructor(private readonly questionCollectorRepo: IQuestionCollectorRepository) {}

  async execute(input: { caseId: string }) {
    const template = await this.questionCollectorRepo.findByCaseId(input.caseId);
    return template;
  }
}

// submit-intake.use-case.ts
export class SubmitIntakeUseCase {
  constructor(private readonly questionCollectorRepo: IQuestionCollectorRepository) {}

  async execute(input: { caseId: string; patientId: string; responses: Array<{ questionId: string; answer: string | string[] }> }) {
    await this.questionCollectorRepo.saveResponses(input.caseId, input.patientId, input.responses);
  }
}
```

- [ ] **Step 7: Create patient-protected.routes.ts**

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { getServices } from '../composition-root.js';
import { patientAuthMiddleware } from '../middleware/patient-auth.middleware.js';
import {
  selectHospitalsSchema, sendPatientMessageSchema,
  listMessagesQuerySchema, quoteActionSchema, submitIntakeSchema,
} from '@medical-crm/validation';

const app = new OpenAPIHono();

// Apply patient auth to all routes
app.use('/*', async (c, next) => {
  const { patientAuthService } = getServices();
  return patientAuthMiddleware(patientAuthService)(c, next);
});

// POST /select-hospitals
app.post('/select-hospitals', async (c) => {
  const body = selectHospitalsSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { selectHospitals } = getServices();
  const result = await selectHospitals.execute({ ...body, patientId: session.userId });
  return c.json(result);
});

// GET /conversations
app.get('/conversations', async (c) => {
  const session = c.get('patientSession');
  const { getPatientConversations } = getServices();
  const result = await getPatientConversations.execute({ patientId: session.userId });
  return c.json(result);
});

// GET /cases
app.get('/cases', async (c) => {
  const session = c.get('patientSession');
  const { getPatientCases } = getServices();
  const result = await getPatientCases.execute({ patientId: session.userId });
  return c.json(result);
});

// GET /cases/:id
app.get('/cases/:id', async (c) => {
  const session = c.get('patientSession');
  const { getPatientCaseDetail } = getServices();
  const result = await getPatientCaseDetail.execute({ caseId: c.req.param('id'), patientId: session.userId });
  return c.json(result);
});

// GET /conversations/:convId/messages
app.get('/conversations/:convId/messages', async (c) => {
  const query = listMessagesQuerySchema.parse(c.req.query());
  const session = c.get('patientSession');
  const { listMessages } = getServices();
  const result = await listMessages.execute({
    conversationId: c.req.param('convId'),
    ...query,
  }, { userId: session.userId, role: 'PATIENT', email: '', hospitalId: null });
  return c.json(result);
});

// POST /conversations/:convId/messages
app.post('/conversations/:convId/messages', async (c) => {
  const body = sendPatientMessageSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { sendMessage } = getServices();
  const result = await sendMessage.execute({
    conversationId: c.req.param('convId'),
    content: body.content,
    messageType: 'TEXT',
  }, { userId: session.userId, role: 'PATIENT', email: '', hospitalId: null });
  return c.json(result);
});

// GET /cases/:id/quote
app.get('/cases/:id/quote', async (c) => {
  const session = c.get('patientSession');
  const { getQuotesByCase } = getServices();
  const result = await getQuotesByCase.execute({ caseId: c.req.param('id'), patientId: session.userId });
  return c.json(result);
});

// POST /cases/:id/quote/accept
app.post('/cases/:id/quote/accept', async (c) => {
  const body = quoteActionSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { acceptQuote } = getServices();
  await acceptQuote.execute({ quoteId: body.quoteId, patientId: session.userId });
  return c.json({ ok: true });
});

// POST /cases/:id/quote/reject
app.post('/cases/:id/quote/reject', async (c) => {
  const body = quoteActionSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { rejectQuote } = getServices();
  await rejectQuote.execute({ quoteId: body.quoteId, patientId: session.userId });
  return c.json({ ok: true });
});

// GET /intake/:caseId/template
app.get('/intake/:caseId/template', async (c) => {
  const { getIntakeTemplate } = getServices();
  const result = await getIntakeTemplate.execute({ caseId: c.req.param('caseId') });
  return c.json(result);
});

// POST /intake/:caseId
app.post('/intake/:caseId', async (c) => {
  const body = submitIntakeSchema.parse(await c.req.json());
  const session = c.get('patientSession');
  const { submitIntake } = getServices();
  await submitIntake.execute({ caseId: c.req.param('caseId'), patientId: session.userId, responses: body.responses });
  return c.json({ ok: true });
});

export default app;
```

- [ ] **Step 8: Mount in index.ts**

```typescript
import patientProtectedRoutes from './routes/patient-protected.routes.js';
app.route('/api/patient', patientProtectedRoutes);
```

- [ ] **Step 9: Wire all new use cases in composition-root.ts**

- [ ] **Step 10: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 11: Run all tests**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/ packages/
git commit -m "feat: add patient protected routes (cases, messages, quotes, intake)"
```

---

## Chunk 4: Backend — WebSocket Real-time

### Task 13: WebSocket Manager

**Files:**
- Create: `apps/api/src/ws/ws-manager.ts`

- [ ] **Step 1: Write test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { WsManager } from '../ws/ws-manager.js';

describe('WsManager', () => {
  it('broadcasts message to all clients in a room', () => {
    const manager = new WsManager();
    const ws1 = { send: vi.fn(), readyState: 1 };
    const ws2 = { send: vi.fn(), readyState: 1 };

    manager.join('conv-1', ws1 as any);
    manager.join('conv-1', ws2 as any);
    manager.broadcast('conv-1', { type: 'new_message', data: {} });

    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).toHaveBeenCalledOnce();
  });

  it('removes client on leave', () => {
    const manager = new WsManager();
    const ws1 = { send: vi.fn(), readyState: 1 };

    manager.join('conv-1', ws1 as any);
    manager.leave('conv-1', ws1 as any);
    manager.broadcast('conv-1', { type: 'test', data: {} });

    expect(ws1.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement WsManager**

```typescript
import type { ServerWebSocket } from '@hono/node-ws';

export class WsManager {
  private rooms = new Map<string, Set<ServerWebSocket>>();

  join(roomId: string, ws: ServerWebSocket): void {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId)!.add(ws);
  }

  leave(roomId: string, ws: ServerWebSocket): void {
    this.rooms.get(roomId)?.delete(ws);
    if (this.rooms.get(roomId)?.size === 0) this.rooms.delete(roomId);
  }

  broadcast(roomId: string, message: { type: string; data: unknown }): void {
    const clients = this.rooms.get(roomId);
    if (!clients) return;
    const payload = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(payload);
    }
  }

  removeFromAll(ws: ServerWebSocket): void {
    for (const [roomId, clients] of this.rooms) {
      clients.delete(ws);
      if (clients.size === 0) this.rooms.delete(roomId);
    }
  }
}

export const wsManager = new WsManager();
```

- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ws/
git commit -m "feat: add WsManager for WebSocket room broadcasting"
```

### Task 14: WebSocket Upgrade Handlers

**Files:**
- Create: `apps/api/src/ws/patient-ws.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install @hono/node-ws**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter api add @hono/node-ws
```

- [ ] **Step 2: Create WebSocket route handlers**

Create `apps/api/src/ws/patient-ws.ts`:

```typescript
import type { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { PatientAuthService } from '@medical-crm/domain';
import { wsManager } from './ws-manager.js';
import type { UpgradeWebSocket } from '@hono/node-ws';

export function registerPatientWs(
  app: Hono,
  upgradeWebSocket: UpgradeWebSocket,
  authService: PatientAuthService,
) {
  // Per-conversation channel
  app.get('/ws/conversations/:id', upgradeWebSocket(async (c) => {
    const token = getCookie(c, 'patient_session');
    let userId: string | null = null;
    try {
      const payload = await authService.verifySessionToken(token!);
      userId = payload.userId;
    } catch {
      // Will close in onOpen
    }

    const conversationId = c.req.param('id');

    return {
      onOpen(_event, ws) {
        if (!userId) { ws.close(4001, 'Unauthorized'); return; }
        wsManager.join(`conv:${conversationId}`, ws);
      },
      onClose(_event, ws) {
        wsManager.leave(`conv:${conversationId}`, ws);
      },
    };
  }));

  // Per-patient notification channel
  app.get('/ws/patient/notifications', upgradeWebSocket(async (c) => {
    const token = getCookie(c, 'patient_session');
    let userId: string | null = null;
    try {
      const payload = await authService.verifySessionToken(token!);
      userId = payload.userId;
    } catch {
      // Will close in onOpen
    }

    return {
      onOpen(_event, ws) {
        if (!userId) { ws.close(4001, 'Unauthorized'); return; }
        wsManager.join(`patient:${userId}`, ws);
      },
      onClose(_event, ws) {
        if (userId) wsManager.leave(`patient:${userId}`, ws);
      },
    };
  }));
}
```

- [ ] **Step 3: Update server.ts to inject WebSocket**

```typescript
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import app from './index.js';
import { registerPatientWs } from './ws/patient-ws.js';
import { getServices } from './composition-root.js';

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Register WebSocket routes
registerPatientWs(app, upgradeWebSocket, getServices().patientAuthService);

const port = Number(process.env.PORT ?? 3001);
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API server listening on http://localhost:${info.port}`);
});

injectWebSocket(server);
```

- [ ] **Step 4: Add WS broadcast to message send**

In the existing `SendMessageUseCase` or in the patient message route handler, after saving a message:

```typescript
import { wsManager } from '../ws/ws-manager.js';

// After message is saved to DB:
wsManager.broadcast(`conv:${conversationId}`, {
  type: 'new_message',
  data: savedMessage,
});

// Push notification to patient
wsManager.broadcast(`patient:${patientId}`, {
  type: 'unread_update',
  data: { conversationId, unreadCount: newCount },
});
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/
git commit -m "feat: add WebSocket support — conversation channels + patient notifications"
```

---

## Chunk 5: Frontend — Foundation

### Task 15: Vite Proxy + CRM API Client

**Files:**
- Modify: `vite.config.ts`
- Create: `services/crmApiClient.ts`

- [ ] **Step 1: Add proxy config to vite.config.ts**

```typescript
server: {
  port: 3000,
  host: '0.0.0.0',
  proxy: {
    '/api/patient': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    },
    '/ws': {
      target: 'ws://localhost:3001',
      ws: true,
    },
  },
},
```

- [ ] **Step 2: Create crmApiClient.ts**

```typescript
const BASE_URL = '/api/patient';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include', // Send cookies
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const crmApi = {
  // Public onboarding
  getProcedures: (category?: string) =>
    request<any>(`/procedures${category ? `?category=${category}` : ''}`),
  getDestinations: () => request<any>('/destinations'),
  initOnboarding: (data: { email: string; name: string; phone: string; preferredLanguage: string; captchaToken: string }) =>
    request<{ patientId: string; caseId: string }>('/onboarding/init', { method: 'POST', body: JSON.stringify(data) }),
  matchHospitals: (data: { procedureId?: string; destination?: string; category?: string }) =>
    request<{ hospitals: any[] }>('/match-hospitals', { method: 'POST', body: JSON.stringify(data) }),

  // Auth
  sendMagicLink: (email: string) =>
    request<{ ok: true }>('/magic-link', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyToken: (token: string) =>
    request<{ patientId: string }>('/verify-token', { method: 'POST', body: JSON.stringify({ token }) }),
  setPassword: (password: string) =>
    request<{ ok: true }>('/set-password', { method: 'POST', body: JSON.stringify({ password }) }),

  // Authenticated
  selectHospitals: (data: { caseId: string; hospitalIds: string[] }) =>
    request<{ conversationIds: string[] }>('/select-hospitals', { method: 'POST', body: JSON.stringify(data) }),
  getConversations: () => request<any>('/conversations'),
  getCases: () => request<any>('/cases'),
  getCaseDetail: (id: string) => request<any>(`/cases/${id}`),
  getMessages: (conversationId: string, params?: { cursor?: string; limit?: number; after?: string }) => {
    const qs = new URLSearchParams();
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.after) qs.set('after', params.after);
    return request<any>(`/conversations/${conversationId}/messages?${qs}`);
  },
  sendMessage: (conversationId: string, content: string) =>
    request<any>(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),
  getQuote: (caseId: string) => request<any>(`/cases/${caseId}/quote`),
  acceptQuote: (caseId: string, quoteId: string) =>
    request<any>(`/cases/${caseId}/quote/accept`, { method: 'POST', body: JSON.stringify({ quoteId }) }),
  rejectQuote: (caseId: string, quoteId: string) =>
    request<any>(`/cases/${caseId}/quote/reject`, { method: 'POST', body: JSON.stringify({ quoteId }) }),
  getIntakeTemplate: (caseId: string) => request<any>(`/intake/${caseId}/template`),
  submitIntake: (caseId: string, responses: any[]) =>
    request<any>(`/intake/${caseId}`, { method: 'POST', body: JSON.stringify({ responses }) }),
};
```

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts services/crmApiClient.ts
git commit -m "feat: add BFF proxy config and CRM API client"
```

### Task 16: PatientAuthContext

**Files:**
- Create: `contexts/PatientAuthContext.tsx`

- [ ] **Step 1: Create PatientAuthContext**

```tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { crmApi } from '../services/crmApiClient';

interface PatientProfile {
  id: string;
  name?: string;
  email?: string;
}

interface PatientAuthState {
  isAuthenticated: boolean;
  patient: PatientProfile | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  loginWithOnboarding: (profile: PatientProfile) => void;
  logout: () => void;
}

const PatientAuthContext = createContext<PatientAuthState | null>(null);

export function PatientAuthProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check session on mount (cookie-based, call a /me endpoint or similar)
  useEffect(() => {
    crmApi.getCases()
      .then(() => {
        // If this succeeds, we have a valid session
        // We don't get patient profile from getCases, but we know we're authenticated
        setPatient({ id: 'session-active' });
      })
      .catch(() => {
        setPatient(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (token: string) => {
    const result = await crmApi.verifyToken(token);
    setPatient({ id: result.patientId });
  }, []);

  const loginWithOnboarding = useCallback((profile: PatientProfile) => {
    setPatient(profile);
  }, []);

  const logout = useCallback(() => {
    setPatient(null);
    // Cookie will expire naturally or we can call a logout endpoint
  }, []);

  return (
    <PatientAuthContext.Provider value={{
      isAuthenticated: !!patient,
      patient,
      isLoading,
      login,
      loginWithOnboarding,
      logout,
    }}>
      {children}
    </PatientAuthContext.Provider>
  );
}

export function usePatientAuth() {
  const ctx = useContext(PatientAuthContext);
  if (!ctx) throw new Error('usePatientAuth must be used within PatientAuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Create ProtectedRoute component**

Create `components/ProtectedRoute.tsx`:

```tsx
import { Navigate, useLocation } from 'react-router-dom';
import { usePatientAuth } from '../contexts/PatientAuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = usePatientAuth();
  const location = useLocation();

  if (isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
```

- [ ] **Step 3: Commit**

```bash
git add contexts/PatientAuthContext.tsx components/ProtectedRoute.tsx
git commit -m "feat: add PatientAuthContext and ProtectedRoute"
```

### Task 17: WebSocket Client + Hook

**Files:**
- Create: `services/wsClient.ts`
- Create: `hooks/useWebSocket.ts`

- [ ] **Step 1: Create wsClient.ts**

```typescript
type MessageHandler = (data: any) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private url: string = '';

  connect(url: string): void {
    this.url = url;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000; // Reset on success
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const typeHandlers = this.handlers.get(msg.type);
        if (typeHandlers) {
          for (const handler of typeHandlers) handler(msg.data);
        }
      } catch { /* ignore malformed */ }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  subscribe(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => { this.handlers.get(type)?.delete(handler); };
  }

  disconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.url);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }
}
```

- [ ] **Step 2: Create useWebSocket.ts**

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { WsClient } from '../services/wsClient';
import { usePatientAuth } from '../contexts/PatientAuthContext';

export function useWebSocket(path: string, enabled = true) {
  const clientRef = useRef<WsClient | null>(null);
  const { isAuthenticated } = usePatientAuth();

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}${path}`;

    const client = new WsClient();
    client.connect(url);
    clientRef.current = client;

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [path, enabled, isAuthenticated]);

  const subscribe = useCallback((type: string, handler: (data: any) => void) => {
    return clientRef.current?.subscribe(type, handler) ?? (() => {});
  }, []);

  return { subscribe };
}
```

- [ ] **Step 3: Commit**

```bash
git add services/wsClient.ts hooks/useWebSocket.ts
git commit -m "feat: add WebSocket client with auto-reconnect and useWebSocket hook"
```

### Task 18: React Query Hooks for Patient Data

**Files:**
- Create: `hooks/usePatientCases.ts`
- Create: `hooks/usePatientConversations.ts`
- Create: `hooks/useCaseDetail.ts`
- Create: `hooks/useMessages.ts`
- Create: `hooks/useQuote.ts`

- [ ] **Step 1: Create all hooks**

```typescript
// hooks/usePatientCases.ts
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '../services/crmApiClient';

export function usePatientCases() {
  return useQuery({
    queryKey: ['patient', 'cases'],
    queryFn: () => crmApi.getCases(),
    staleTime: 30_000,
  });
}

// hooks/usePatientConversations.ts
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '../services/crmApiClient';

export function usePatientConversations() {
  return useQuery({
    queryKey: ['patient', 'conversations'],
    queryFn: () => crmApi.getConversations(),
    staleTime: 10_000,
  });
}

// hooks/useCaseDetail.ts
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '../services/crmApiClient';

export function useCaseDetail(caseId: string) {
  return useQuery({
    queryKey: ['patient', 'cases', caseId],
    queryFn: () => crmApi.getCaseDetail(caseId),
    enabled: !!caseId,
  });
}

// hooks/useMessages.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { crmApi } from '../services/crmApiClient';
import { useWebSocket } from './useWebSocket';

export function useMessages(conversationId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['patient', 'messages', conversationId];

  const query = useQuery({
    queryKey,
    queryFn: () => crmApi.getMessages(conversationId),
    enabled: !!conversationId,
    refetchInterval: 5000, // Polling fallback
  });

  // WebSocket real-time updates
  const { subscribe } = useWebSocket(`/ws/conversations/${conversationId}`, !!conversationId);

  useEffect(() => {
    const unsub = subscribe('new_message', (message: any) => {
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return { ...old, messages: [...(old.messages ?? []), message] };
      });
    });
    return unsub;
  }, [subscribe, queryClient, conversationId]);

  return query;
}

// hooks/useQuote.ts
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '../services/crmApiClient';

export function useQuote(caseId: string) {
  return useQuery({
    queryKey: ['patient', 'quote', caseId],
    queryFn: () => crmApi.getQuote(caseId),
    enabled: !!caseId,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/usePatientCases.ts hooks/usePatientConversations.ts hooks/useCaseDetail.ts hooks/useMessages.ts hooks/useQuote.ts
git commit -m "feat: add React Query hooks for patient cases, messages, quotes"
```

---

## Chunk 6: Frontend — Chat Widget (Onboarding)

### Task 19: ChatWidget Rewrite + Onboarding Flow

**Files:**
- Rewrite: `components/ChatWidget.tsx`
- Create: `components/chat/ChatBubble.tsx`
- Create: `components/chat/ChatWindow.tsx`
- Create: `components/chat/OnboardingFlow.tsx`
- Create: `components/chat/CategoryStep.tsx`
- Create: `components/chat/ProcedureStep.tsx`
- Create: `components/chat/DestinationStep.tsx`
- Create: `components/chat/ContactInfoStep.tsx`
- Create: `components/chat/HospitalCards.tsx`
- Create: `components/chat/OnboardingSummary.tsx`

This is a large task. Each step component should be a focused file (~50-100 lines).

- [ ] **Step 1: Create ChatBubble.tsx**

Floating button with unread badge. When authenticated, shows unread count from notifications WebSocket.

- [ ] **Step 2: Create OnboardingFlow.tsx with useReducer state machine**

```typescript
type OnboardingState = {
  step: 'category' | 'procedure' | 'destination' | 'contact' | 'hospitals' | 'summary';
  category?: string;
  procedureId?: string;
  procedureName?: string;
  destination?: string;
  name?: string;
  email?: string;
  phone?: string;
  language?: string;
  caseId?: string;
  selectedHospitalIds?: string[];
};

type OnboardingAction =
  | { type: 'SELECT_CATEGORY'; category: string }
  | { type: 'SELECT_PROCEDURE'; procedureId: string; procedureName: string }
  | { type: 'SELECT_DESTINATION'; destination: string }
  | { type: 'SUBMIT_CONTACT'; name: string; email: string; phone: string; language: string; caseId: string }
  | { type: 'SELECT_HOSPITALS'; hospitalIds: string[] }
  | { type: 'COMPLETE' }
  | { type: 'BACK' };
```

- [ ] **Step 3: Create each step component (CategoryStep, ProcedureStep, DestinationStep, ContactInfoStep, HospitalCards)**

Each renders the appropriate UI and calls dispatch with the relevant action on user selection.

- [ ] **Step 4: Create OnboardingSummary.tsx**

Shows "You're all set!" with a CTA button to open the PatientMessagePanel.

- [ ] **Step 5: Create ChatWindow.tsx**

Container that renders either `OnboardingFlow` (not authenticated) or a compact "Open Messages" entry (authenticated).

- [ ] **Step 6: Rewrite ChatWidget.tsx**

```tsx
import { useState } from 'react';
import { ChatBubble } from './chat/ChatBubble';
import { ChatWindow } from './chat/ChatWindow';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <ChatBubble isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
      {isOpen && <ChatWindow onClose={() => setIsOpen(false)} />}
    </>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add components/ChatWidget.tsx components/chat/
git commit -m "feat: rewrite ChatWidget with onboarding flow (Steps 1-5)"
```

### Task 20: PatientMessagePanel

**Files:**
- Create: `components/messaging/PatientMessagePanel.tsx`
- Create: `components/messaging/ConversationList.tsx`
- Create: `components/messaging/ChatView.tsx`
- Create: `components/messaging/MessageList.tsx`
- Create: `components/messaging/MessageInput.tsx`
- Create: `components/messaging/PanelHeader.tsx`

- [ ] **Step 1: Create PanelHeader.tsx**

Title bar with close button.

- [ ] **Step 2: Create MessageInput.tsx**

Text input with send button. Calls `crmApi.sendMessage()` on submit.

- [ ] **Step 3: Create MessageList.tsx**

Renders message bubbles with timestamps, auto-scrolls to bottom on new messages.

- [ ] **Step 4: Create ChatView.tsx**

Combines MessageList + MessageInput for a single conversation. Uses `useMessages` hook.

- [ ] **Step 5: Create ConversationList.tsx**

Left pane showing hospital conversations with latest message preview and unread count. Click selects active conversation.

- [ ] **Step 6: Create PatientMessagePanel.tsx**

Large modal/side panel:

```tsx
export function PatientMessagePanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const { data: conversations } = usePatientConversations();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col">
        <PanelHeader onClose={onClose} />
        <div className="flex flex-1 overflow-hidden">
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={setActiveConversationId}
          />
          {activeConversationId && (
            <ChatView conversationId={activeConversationId} />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add components/messaging/
git commit -m "feat: add PatientMessagePanel with multi-hospital conversation UI"
```

---

## Chunk 7: Frontend — Dashboard Pages

### Task 21: Dashboard Routes & Layout

**Files:**
- Create: `pages/dashboard/DashboardLayout.tsx`
- Create: `pages/dashboard/DashboardHome.tsx`
- Create: `pages/dashboard/LoginPage.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Create DashboardLayout.tsx**

Top bar with patient name, navigation links (Cases, Account), logout button. Uses `<Outlet />` for nested routes.

- [ ] **Step 2: Create DashboardHome.tsx**

Action items banner + cases card list. Uses `usePatientCases()` hook.

- [ ] **Step 3: Create LoginPage.tsx**

Simple form: email input → "Send Magic Link" button. Shows success message after sending.

- [ ] **Step 4: Update App.tsx**

```tsx
import { PatientAuthProvider } from './contexts/PatientAuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import DashboardHome from './pages/dashboard/DashboardHome';
import CaseDetailPage from './pages/dashboard/CaseDetail';
import IntakePage from './pages/dashboard/IntakePage';
import AccountPage from './pages/dashboard/AccountPage';
import LoginPage from './pages/dashboard/LoginPage';

// In the App component, wrap with PatientAuthProvider:
<PatientAuthProvider>
  <LanguageProvider>
    <Router>
      {/* Marketing routes (with Header/Footer) */}
      <Routes>
        <Route path="/" element={<><Header /><HomePage /><Footer /></>} />
        {/* ... all existing marketing routes ... */}
        <Route path="/login" element={<LoginPage />} />

        {/* Dashboard routes (NO Header/Footer) */}
        <Route path="/dashboard" element={
          <ProtectedRoute><DashboardLayout /></ProtectedRoute>
        }>
          <Route index element={<DashboardHome />} />
          <Route path="cases/:caseId" element={<CaseDetailPage />} />
          <Route path="intake/:caseId" element={<IntakePage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Routes>

      {/* Floating widgets (available everywhere) */}
      <ChatWidget />
      <PatientMessagePanel />
    </Router>
  </LanguageProvider>
</PatientAuthProvider>
```

- [ ] **Step 5: Commit**

```bash
git add App.tsx pages/dashboard/ components/ProtectedRoute.tsx
git commit -m "feat: add dashboard routes with layout, login, and home page"
```

### Task 22: Case Detail Page

**Files:**
- Create: `pages/dashboard/CaseDetail.tsx`

- [ ] **Step 1: Create tabbed case detail page**

Three tabs: Messages (default), Quote, Overview.

```tsx
import { useParams } from 'react-router-dom';
import { useCaseDetail } from '../../hooks/useCaseDetail';
import { useMessages } from '../../hooks/useMessages';
import { useQuote } from '../../hooks/useQuote';

export default function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>();
  const [activeTab, setActiveTab] = useState<'messages' | 'quote' | 'overview'>('messages');
  const { data: caseData } = useCaseDetail(caseId!);
  // Render tab content based on activeTab
}
```

- Messages tab reuses `ChatView` component from PatientMessagePanel.
- Quote tab shows line items + Accept/Reject with confirmation modal.
- Overview tab shows case info, stage, hospitals involved.

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard/CaseDetail.tsx
git commit -m "feat: add Case Detail page with Messages/Quote/Overview tabs"
```

### Task 23: Intake + Account Pages

**Files:**
- Create: `pages/dashboard/IntakePage.tsx`
- Create: `pages/dashboard/AccountPage.tsx`

- [ ] **Step 1: Create IntakePage.tsx**

Multi-step form. Reads `?token=xxx` from URL for magic link access. Fetches template, renders questions, submits responses.

- [ ] **Step 2: Create AccountPage.tsx**

Form for: set/change password, edit name/email/phone, language preference.

- [ ] **Step 3: Commit**

```bash
git add pages/dashboard/IntakePage.tsx pages/dashboard/AccountPage.tsx
git commit -m "feat: add Intake and Account dashboard pages"
```

### Task 24: Cleanup & Integration

**Files:**
- Remove: `services/geminiService.ts` (no longer used)
- Deprecate: `contexts/ConsultationContext.tsx` (kept for `/get-quote` fallback)

- [ ] **Step 1: Remove Gemini service import from ChatWidget**

The old ChatWidget imported `geminiService`. The new ChatWidget does not use it. Verify no other component imports `geminiService`. If none, delete the file.

- [ ] **Step 2: Update ConsultationModal to not conflict**

If `ConsultationModal` is still rendered in App.tsx for `/get-quote` fallback, ensure it doesn't conflict with the new ChatWidget. Consider lazy-loading it only on the `/get-quote` route.

- [ ] **Step 3: Full typecheck**

Run: `pnpm typecheck` (from Medora Beauty root — uses `tsc --noEmit`)
Expected: PASS

- [ ] **Step 4: Manual smoke test**

Start both servers:
```bash
# Terminal 1: CRM v2 API
cd medical-crm-v2 && pnpm dev

# Terminal 2: Medora Beauty frontend
cd /Users/haowang/Desktop/medora-health-beauty && pnpm dev
```

Verify:
1. Chat bubble appears on homepage
2. Clicking bubble opens onboarding flow
3. Can select category → procedure → destination → submit contact info
4. Hospital cards appear
5. Selecting hospitals opens PatientMessagePanel
6. Dashboard at `/dashboard` shows cases (after login)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cleanup — remove Gemini chat, integrate new patient flow"
```

---

## Summary

| Chunk | Tasks | Scope |
|-------|-------|-------|
| 1 | Tasks 1-6 | Backend auth foundation (schema, JWT, middleware, repos, validation) |
| 2 | Tasks 7-11 | Backend onboarding use cases + routes |
| 3 | Task 12 | Backend dashboard + messaging routes |
| 4 | Tasks 13-14 | Backend WebSocket real-time |
| 5 | Tasks 15-18 | Frontend foundation (proxy, auth context, WS client, hooks) |
| 6 | Tasks 19-20 | Frontend ChatWidget + PatientMessagePanel |
| 7 | Tasks 21-24 | Frontend dashboard pages + cleanup |

**Total**: 24 tasks across 7 chunks. Backend-first (Chunks 1-4), then frontend (Chunks 5-7).

---

## Review Errata — Mandatory Corrections

The following corrections MUST be applied during implementation. They address issues found in the plan review.

### Backend Corrections (Chunks 1-4)

**B1. Use `jose` instead of `jsonwebtoken` in PatientAuthService (Task 2)**
The domain package is ESM. `jsonwebtoken` is CJS and will cause import issues. Replace with `jose` (pure ESM JWT library):
```bash
pnpm --filter @medical-crm/domain add jose
```
```typescript
import * as jose from 'jose';
// Use jose.SignJWT and jose.jwtVerify instead of jwt.sign/jwt.verify
```
Alternatively, move `PatientAuthService` to `packages/infrastructure/` and keep only an `IPatientAuthService` interface in domain.

**B2. IPatientRepository extension — update existing tests (Task 2)**
Adding `findByEmail()`, `createTempPatient()`, `updatePasswordHash()` to `IPatientRepository` is a breaking change. After modifying the port, search for all existing test files that mock `IPatientRepository` and add the new methods as `vi.fn()` stubs. Likely affected files:
- `packages/application/__tests__/messages/send-message.use-case.test.ts`
- `packages/application/__tests__/cases/get-hospital-case-detail.use-case.test.ts`

**B3. Use Case entity, not plain object (Task 7)**
`InitOnboardingUseCase` must not use `as any` to save a case. Use the existing `Case` entity constructor:
```typescript
const caseEntity = Case.create({
  patientId: patient.id,
  patientName: input.name,
  patientLanguage: input.preferredLanguage,
  primaryDiagnosis: input.category ?? null,
});
const caseNumber = await this.caseRepo.nextCaseNumber();
// Use caseNumber.value or caseNumber.toString() — check CaseNumber value object API
```

**B4. Add missing port methods and implementations (Tasks 8, 9, 12)**
These port methods are called but not defined. Add them before implementing the use cases:
| Port | Method to Add | Implementation File |
|------|---------------|-------------------|
| `IHospitalRepository` | `findByProcedureAndDestination(filters)` | `drizzle-hospital.repository.ts` |
| `ICaseHospitalContactRepository` | `createMany(caseId, hospitalIds[])` | `drizzle-chc.repository.ts` |
| `IConversationRepository` | `getUnreadCountsByCase(patientId)` | `drizzle-conversation.repository.ts` |
| `ICaseRepository` | `findByPatientId(patientId)` | `drizzle-case.repository.ts` |

**B5. Add missing use cases: ListProcedures and ListDestinations (Task 10)**
The routes reference `listProcedures` and `listDestinations` use cases that don't exist. Create:
- `packages/application/src/use-cases/patient-onboarding/list-procedures.use-case.ts` — queries procedures grouped by category from the CRM DB or Supabase
- `packages/application/src/use-cases/patient-onboarding/list-destinations.use-case.ts` — returns available destinations from hospital locations
Both need TDD (test first).

**B6. Extend existing IEmailService, don't duplicate (Task 11)**
Existing port is at `packages/domain/src/ports/email-service.port.ts`. Add `sendMagicLink(email, link)` and `sendWelcomeEmail(email, patientName)` to it instead of creating a local interface.

**B7. Call getServices() inside request handlers, not at module level (Tasks 11, 12)**
Route files must NOT call `getServices()` at module scope. Instead of:
```typescript
app.use('/*', patientAuthMiddleware(getServices().patientAuthService));
```
Use:
```typescript
app.use('/*', async (c, next) => {
  const { patientAuthService } = getServices();
  return patientAuthMiddleware(patientAuthService)(c, next);
});
```
Or create a lazy middleware factory.

**B8. Rename patient quote use cases to avoid conflicts (Task 12)**
Existing composition-root already has `AcceptQuoteUseCase` and `RejectQuoteUseCase`. Name the patient versions `PatientAcceptQuoteUseCase` and `PatientRejectQuoteUseCase`, or reuse the existing use cases by adding patient-role authorization.

**B9. Use conversation-level message routes end-to-end (Task 12)**
Do not route message APIs by case ID. Keep them conversation-first:
`GET /api/patient/conversations/:convId/messages` and
`POST /api/patient/conversations/:convId/messages`.
This avoids mixed message streams when one case has multiple hospitals.

**B10. Add missing TDD for use cases (Task 12)**
These use cases need tests written before implementation:
- `PatientAcceptQuoteUseCase`
- `PatientRejectQuoteUseCase`
- `GetPatientConversationsUseCase`
- `GetIntakeTemplateUseCase`
- `SubmitIntakeUseCase`

**B11. Add `GET /api/patient/me` endpoint (Tasks 10/12)**
Required for PatientAuthContext session check. Returns patient profile (id, name, email). Add to patient-protected routes:
```typescript
app.get('/me', async (c) => {
  const session = c.get('patientSession');
  const { patientRepo } = getServices();
  const patient = await patientRepo.findById(session.userId);
  return c.json(patient);
});
```

**B12. WsManager test file path (Task 13)**
Test should be at `apps/api/src/__tests__/ws-manager.test.ts`.

### Frontend Corrections (Chunks 5-7)

**F1. PatientAuthContext session check — use `/me` endpoint (Task 16)**
Replace `crmApi.getCases()` probe with `crmApi.getMe()`:
```typescript
// Add to crmApiClient.ts:
getMe: () => request<PatientProfile>('/me'),

// In PatientAuthContext useEffect:
crmApi.getMe()
  .then((profile) => setPatient(profile))
  .catch(() => setPatient(null))
  .finally(() => setIsLoading(false));
```

**F2. useMessages — conditional polling (Task 18)**
Polling should only be active when WebSocket is disconnected:
```typescript
const [wsConnected, setWsConnected] = useState(false);
// In useWebSocket, expose connection state
// Then:
refetchInterval: wsConnected ? false : 5000,
```

**F3. ChatView should use conversation-level message APIs (Task 20)**
Use conversation-level hooks and APIs to avoid mixing multiple hospital chats under one case:
```typescript
<ChatView conversation={activeConversation} />
// Inside ChatView:
const { id: conversationId } = conversation;
useMessages(conversationId);
```

**F4. App.tsx — use MarketingLayout wrapper (Task 21)**
Instead of wrapping each marketing route with `<Header />` and `<Footer />`, create a `MarketingLayout` component:
```tsx
function MarketingLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <Footer />
      <ConsultationModal />
    </>
  );
}

// In Routes:
<Route element={<MarketingLayout />}>
  <Route path="/" element={<HomePage />} />
  <Route path="/team" element={<OurTeam />} />
  {/* ... all 15+ existing marketing routes ... */}
</Route>
<Route path="/login" element={<LoginPage />} />
<Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
  {/* dashboard routes */}
</Route>
```
This avoids duplicating `<Header />` / `<Footer />` on every route and preserves `ConsultationProvider` for marketing pages only.

**F5. PatientMessagePanel state coordination (Task 21)**
Add a `MessagePanelContext` or use a simple state hook lifted to App-level:
```tsx
// In App.tsx:
const [isMessagePanelOpen, setIsMessagePanelOpen] = useState(false);
// Pass to ChatWidget and PatientMessagePanel via props or context
```
Or create a small context:
```tsx
const MessagePanelContext = createContext<{ isOpen: boolean; open: () => void; close: () => void }>(null!);
```

**F6. Keep ConsultationProvider for marketing pages (Task 21)**
`ConsultationProvider` wraps `MarketingLayout` only (not dashboard). Eight existing components depend on it (HospitalDetail, SurgeonProfile, ProcedureDetail, etc.). It must remain functional.

**F7. IntakePage magic link token — auto-verify before guard (Task 23)**
When arriving via `/dashboard/intake/:caseId?token=xxx`, `ProtectedRoute` blocks access before the token can be consumed. Fix: make `ProtectedRoute` check for `?token=` in URL and auto-verify:
```tsx
export function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, login } = usePatientAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (token && !isAuthenticated && !isLoading) {
      login(token).catch(() => {}); // Auto-verify magic link token
    }
  }, [token, isAuthenticated, isLoading, login]);

  if (isLoading) return <Loading />;
  if (!isAuthenticated && !token) return <Navigate to="/login" />;
  return <>{children}</>;
}
```

**F8. Add missing tasks**

**Task 25: i18n Strings** (add after Task 24)
- Add all new UI strings to `i18n/translations.ts` for all 9 languages
- Keys: `chatWidget.*`, `dashboard.*`, `messagePanel.*`, `onboarding.*`

**Task 26: Types + Dependencies** (add after Task 15)
- Update `types.ts` with patient-related interfaces
- Run `pnpm add @marsidev/react-turnstile` for Cloudflare Turnstile CAPTCHA
- Add `VITE_TURNSTILE_SITE_KEY` to `.env`

**F9. Error states in UI components (Tasks 19-23)**
Each component must handle the spec's error states:
- `HospitalCards.tsx`: show fallback message when 0 results from `match-hospitals`
- `OnboardingFlow.tsx`: show inline error + retry button on network failure, preserve previous answers
- `ChatView.tsx`: show "Session expired" banner on 401 errors
- `ContactInfoStep.tsx`: handle duplicate patient (API returns success either way)
- `CaseDetail.tsx` Quote tab: show "This quote has expired" for expired quotes

**F10. Dashboard CaseDetail name — avoid confusion (Task 22)**
The existing `pages/CaseDetail.tsx` is the marketing before/after case page. The dashboard version at `pages/dashboard/CaseDetail.tsx` should be imported with an alias in `App.tsx`:
```typescript
import MarketingCaseDetail from './pages/CaseDetail';
import DashboardCaseDetail from './pages/dashboard/CaseDetail';
```

**F11. ContactInfoStep Turnstile CAPTCHA (Task 19)**
```tsx
import { Turnstile } from '@marsidev/react-turnstile';

// In ContactInfoStep form:
<Turnstile
  siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
  onSuccess={(token) => setCaptchaToken(token)}
/>
// Pass captchaToken in the form submit to crmApi.initOnboarding()
```
