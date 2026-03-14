# Medical CRM v2 — Architecture Design Spec

> Status: **Ready for implementation**
> Date: 2026-03-11
> Scope: Overall v2 architecture + Phase 1 detailed design
> Author: Human + Claude

---

## 1. Background & Goals

### Why v2?

The current medical-crm (v1) is in production and serving admin + hospital + patient portals for a medical tourism CRM platform. While functional, v1 has accumulated technical debt:

- Mixed concerns in API routes (auth, validation, business logic, DB queries in one file)
- No clear domain boundaries — UI components sometimes reach directly into DB
- Security gaps: no rate limiting, no input sanitization beyond Zod, no CSP headers
- Hard to test — business logic coupled to Prisma/Supabase

### v2 Goals

1. **Feature parity** with v1 for Admin and Hospital portals (Patient portal excluded)
2. **Clean Architecture** — domain logic is pure TypeScript with zero framework dependencies
3. **API-layer security** — rate limiting, CORS, CSP, input sanitization, audit logging
4. **Best practices** — strict dependency rules, repository pattern, comprehensive testing
5. **Zero disruption** to v1 — v2 lives in a new directory, shares the same database

### Non-Goals

- Patient portal (explicitly excluded)
- Database migration / schema changes (shared DB with v1)
- UI redesign (same features, cleaner code)
- Mobile app

---

## 2. Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Code location | `medical-crm-v2/` in same monorepo | Shared config, no risk to v1 |
| Architecture | Clean Architecture / Hexagonal | Testability, separation of concerns |
| Monorepo tool | Turborepo + pnpm | Lightweight, fast builds, Next.js ecosystem |
| Frontend | Next.js (App Router) | Team familiarity, SSR/RSC support |
| API framework | Hono + @hono/zod-openapi | Lightweight, native OpenAPI, middleware chain |
| ORM | Drizzle | SQL-first, lighter than Prisma, better TS inference |
| Auth | Keycloak (retained) | Shared user system with v1, enterprise-grade IdP |
| Auth middleware | Hono middleware (replaces NextAuth) | Cleaner, no session cookie dependency |
| Database | Multi-datasource (see Section 6.3) | CRM DB (Prisma/Drizzle) + Main Supabase + China Medical Supabase |
| Validation | Zod (shared schemas) | Single source of truth for API contracts + OpenAPI |
| i18n | 10 languages from v1 | zh, en, kr, jp, ar, th, es, ru, fr, de |

---

## 3. Monorepo Structure

```
medical-crm-v2/
├── turbo.json                    # Turborepo pipeline config
├── pnpm-workspace.yaml           # Workspace definition
├── package.json                  # Root scripts + devDependencies
├── tsconfig.base.json            # Shared TypeScript config
├── eslint.config.js              # Shared ESLint flat config (ESLint v9+)
├── .env.example                  # Environment variable template
│
├── apps/
│   ├── admin/                    # Next.js — Admin portal
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── app/              # Next.js App Router pages
│   │       └── components/       # Admin-specific UI components
│   │
│   ├── hospital/                 # Next.js — Hospital portal
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── app/
│   │       └── components/
│   │
│   └── api/                      # Hono — REST API server
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts          # Hono app entry
│           ├── middleware/       # Security, auth, logging
│           ├── routes/           # Route definitions (OpenAPI)
│           └── composition-root.ts  # Manual DI wiring (see Section 6.8)
│
├── packages/
│   ├── domain/                   # Pure business logic (ZERO external deps)
│   │   ├── package.json          # Only: typescript, vitest (devDeps)
│   │   ├── hospital/
│   │   │   ├── entity.ts         # Hospital aggregate root
│   │   │   ├── value-objects.ts  # HospitalStatus, HospitalType, etc.
│   │   │   ├── ports.ts          # Repository & service interfaces
│   │   │   ├── errors.ts         # Domain-specific errors
│   │   │   └── __tests__/
│   │   ├── case/
│   │   │   ├── entity.ts         # Case aggregate root
│   │   │   ├── value-objects.ts  # CaseStatus, CaseStage state machine
│   │   │   ├── ports.ts
│   │   │   ├── errors.ts
│   │   │   └── __tests__/
│   │   ├── surgeon/              # Surgeon (independent entity, external DB)
│   │   ├── conversation/         # Conversation aggregate (threads)
│   │   ├── consultation/
│   │   ├── message/              # Message entity (belongs to conversation)
│   │   ├── document/
│   │   ├── media/                # Materials: gallery photos, video testimonials
│   │   ├── quote/                # Quote/pricing management
│   │   ├── registration/         # Hospital registration tokens
│   │   └── shared/               # Cross-domain types (UserId, Role, etc.)
│   │       ├── types.ts
│   │       ├── errors.ts         # Base domain error classes
│   │       └── value-objects.ts
│   │
│   ├── application/              # Use case orchestration
│   │   ├── package.json
│   │   ├── admin/
│   │   │   ├── manage-hospitals.ts
│   │   │   ├── manage-cases.ts
│   │   │   ├── moderate-messages.ts
│   │   │   └── dashboard.ts
│   │   └── hospital/
│   │       ├── handle-cases.ts
│   │       ├── manage-consultations.ts
│   │       ├── manage-materials.ts
│   │       └── send-messages.ts
│   │
│   ├── infrastructure/           # External system adapters
│   │   ├── package.json
│   │   ├── database/
│   │   │   ├── crm-client.ts     # Drizzle client for CRM DB (Prisma-managed)
│   │   │   ├── schema/           # Drizzle table definitions (introspected from CRM DB)
│   │   │   └── repositories/     # Implements domain ports for CRM entities
│   │   ├── supabase-main/
│   │   │   ├── client.ts         # Main project Supabase client (beauty hospitals)
│   │   │   └── repositories/     # Surgeon, procedure, case-image repos
│   │   ├── supabase-china/
│   │   │   ├── client.ts         # China Medical Supabase client (regular hospitals)
│   │   │   └── repositories/     # Same ports, different DB
│   │   ├── storage/
│   │   │   ├── supabase.adapter.ts
│   │   │   └── r2.adapter.ts
│   │   ├── auth/
│   │   │   ├── keycloak.client.ts
│   │   │   └── keycloak.middleware.ts
│   │   ├── email/
│   │   │   └── resend.adapter.ts
│   │   ├── ai/
│   │   │   └── openai.adapter.ts
│   │   └── queue/
│   │       └── pgboss.adapter.ts
│   │
│   └── shared/                   # Cross-cutting utilities
│       ├── ui/                   # shadcn/ui component library
│       │   ├── package.json
│       │   └── src/
│       ├── utils/
│       │   ├── package.json
│       │   └── src/
│       ├── config/
│       │   ├── package.json
│       │   └── src/
│       │       ├── env.ts        # Zod-validated env vars
│       │       └── constants.ts
│       ├── i18n/
│       │   ├── package.json
│       │   └── src/
│       │       ├── locales/      # Translation JSON files
│       │       └── index.ts
│       └── validation/
│           ├── package.json
│           └── src/              # Zod schemas shared by API + frontend
│               ├── hospital.schema.ts
│               ├── case.schema.ts
│               ├── message.schema.ts
│               └── index.ts
│
└── docs/
    ├── feature-matrix.md
    ├── api-contracts.md
    ├── security-model.md
    └── specs/
```

---

## 4. Dependency Rules (Iron Law)

```
Layer Dependency Graph (Clean Architecture — Dependency Inversion):

  ┌─────────┐   ┌───────────┐   ┌─────────┐
  │  admin   │   │  hospital  │   │   api   │    ← apps (deployable units)
  └────┬─────┘   └─────┬──────┘   └────┬────┘
       │               │               │
       └───────────────┼───────────────┘
                       ▼
          ┌──────────────────────┐
          │  composition root    │  ← wires ports to adapters (lives in apps/)
          │  (apps/api/src/      │
          │   composition-root)  │
          └──────┬───────┬───────┘
                 │       │
                 ▼       ▼
  ┌──────────────────┐  ┌─────────────────┐
  │  application/*   │  │ infrastructure/* │
  │  (imports domain │  │ (implements      │
  │   ports ONLY)    │  │  domain ports)   │
  └────────┬─────────┘  └────────┬────────┘
           │                     │
           ▼                     ▼
  ┌──────────────────────────────────────────┐
  │               domain/*                    │    ← pure business logic
  │  (defines Ports = repository interfaces)  │    ← ZERO framework deps
  └──────────────────────────────────────────┘
                       │
                       ▼
  ┌──────────────────────────────────────────┐
  │              shared/*                     │    ← utilities, config, i18n
  └──────────────────────────────────────────┘
```

### Rules

1. **apps/** → may import `application/`, `shared/*` (ui, config, i18n, validation, utils). Exception: `apps/api` may also import `infrastructure/auth` for Hono middleware registration.
2. **application/** → may import `domain/*` (including ports) and `shared/validation` — **NOT infrastructure**
3. **domain/** → may ONLY import `domain/shared` — NO React, NO Supabase, NO Drizzle, NO Hono
4. **infrastructure/** → implements interfaces defined in `domain/*/ports.ts`, may import `domain/*` and `shared/*`
5. **shared/** → imported by all layers, imports nothing from other layers
6. **Page components** → NEVER touch database directly
7. **Composition root** → the ONLY place that imports both `application/` and `infrastructure/`, wires ports to concrete adapters

### Dependency Inversion in Practice

```typescript
// domain/hospital/ports.ts — defines the interface (port)
export interface HospitalRepository {
  findById(id: string): Promise<Hospital | null>;
}

// infrastructure/database/repositories/hospital.repository.ts — implements it
import type { HospitalRepository } from '@medical-crm/domain/hospital/ports';
export class DrizzleHospitalRepository implements HospitalRepository { ... }

// application/admin/manage-hospitals.ts — depends on the PORT, not the implementation
import type { HospitalRepository } from '@medical-crm/domain/hospital/ports';
export class ManageHospitalsUseCase {
  constructor(private hospitalRepo: HospitalRepository) {} // injected
}

// apps/api/src/composition-root.ts — wires everything together
import { DrizzleHospitalRepository } from '@medical-crm/infrastructure/database/repositories/hospital.repository';
import { ManageHospitalsUseCase } from '@medical-crm/application/admin/manage-hospitals';
const hospitalRepo = new DrizzleHospitalRepository(db);
export const manageHospitals = new ManageHospitalsUseCase(hospitalRepo);
```

### Enforcement

- ESLint `no-restricted-imports` rules per package (flat config, ESLint v9)
- TypeScript `references` ensure compile-time boundary checks
- **Critical rule:** `@medical-crm/application` package.json must NOT list `@medical-crm/infrastructure` as a dependency
- CI lint step fails on violation

---

## 5. Phase Breakdown

### Phase 1: Foundation & Infrastructure (this spec)

Detailed in Section 6 below.

### Phase 2: Domain + API

- Domain entities for all aggregates: hospital, surgeon, case, conversation, consultation, message, document, media, quote, registration, shared
- Note: `surgeon` is a first-class domain entity. The `surgeons` table lives in external Supabase databases (Main Supabase for beauty hospitals, China Medical for regular hospitals), NOT in the CRM Prisma DB. The `SurgeonRepository` port has two implementations: `MainSupabaseSurgeonRepository` and `ChinaMedicalSurgeonRepository`, selected at runtime based on hospital type.
- Repository port definitions (domain) + Drizzle implementations (infrastructure)
- Application use cases with constructor-injected ports
- Hono API routes with OpenAPI specs (versioned as `/api/v2/*`)
- Integration tests for all endpoints
- Error handling contract: domain errors → application Result types → HTTP status mapping

### Phase 3: Admin Portal

- Next.js App Router pages
- Dashboard (statistics, pending items)
- Hospital management (CRUD, approval)
- Case management (list, detail, assign)
- Message moderation (approve/reject)
- Settings

### Phase 4: Hospital Portal

- Dashboard (assigned cases, new inquiries)
- Case handling (list, detail, tabs)
- Consultation management
- Materials management (doctors, gallery, videos)
- Message communication
- Invitation letters

### Phase 5: AI + Real-time

- AI translation pipeline (OpenAI)
- Message real-time (Supabase Realtime)
- Task queue (pg-boss)
- Document summarization
- Batch translation jobs

---

## 6. Phase 1 Detailed Design: Foundation & Infrastructure

### 6.1 Turborepo Configuration

**`turbo.json`:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Root `package.json` scripts:**
```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:coverage": "turbo test -- --coverage",
    "db:pull": "pnpm --filter @medical-crm/infrastructure drizzle-kit pull",
    "db:generate": "pnpm --filter @medical-crm/infrastructure drizzle-kit generate"
  }
}
```

### 6.2 Shared Packages

#### `@medical-crm/config`

```typescript
// packages/shared/config/src/env.ts
import { z } from 'zod';

const serverSchema = z.object({
  // CRM Database (Prisma-managed, accessed via Drizzle)
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  // Main Project Supabase (beauty hospitals: surgeons, procedures, etc.)
  MAIN_SUPABASE_URL: z.string().url(),
  MAIN_SUPABASE_SERVICE_KEY: z.string().min(1),
  // China Medical Supabase (regular hospitals)
  CHINA_MEDICAL_SUPABASE_URL: z.string().url(),
  CHINA_MEDICAL_SUPABASE_SERVICE_KEY: z.string().min(1),
  // Auth
  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1), // Confidential client for BFF code exchange
  SESSION_SECRET: z.string().min(32),         // Cookie encryption key (iron-session)
  // AI
  OPENAI_API_KEY: z.string().min(1),
  // Storage (CRM file storage)
  CRM_SUPABASE_URL: z.string().url(),
  CRM_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  // Email
  RESEND_API_KEY: z.string().optional(),
  // CORS origins
  ADMIN_ORIGIN: z.string().url(),
  HOSPITAL_ORIGIN: z.string().url(),
  // Internal API URL (server-side only, used by BFF proxy)
  API_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Note: No NEXT_PUBLIC_API_URL — BFF pattern means browser never calls Hono API directly.
  // The API URL is server-side only (API_URL in serverSchema).
  NEXT_PUBLIC_KEYCLOAK_URL: z.string().url(),
  NEXT_PUBLIC_KEYCLOAK_REALM: z.string().min(1),
  NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: z.string().min(1),
});

// Fail-fast on startup
export const serverEnv = serverSchema.parse(process.env);
export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_KEYCLOAK_URL: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
  NEXT_PUBLIC_KEYCLOAK_REALM: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
  NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID,
});
```

#### `@medical-crm/validation`

Zod schemas shared between API (Hono route validation) and frontend (form validation):

```typescript
// packages/shared/validation/src/hospital.schema.ts
import { z } from 'zod';

export const hospitalStatusSchema = z.enum(['PENDING', 'ACTIVE', 'INACTIVE']);
export const hospitalTypeSchema = z.enum(['COSMETIC', 'REGULAR']);

export const createHospitalSchema = z.object({
  name: z.string().min(1).max(200),
  type: hospitalTypeSchema,
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
});

export const hospitalListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: hospitalStatusSchema.optional(),
  type: hospitalTypeSchema.optional(),
  search: z.string().optional(),
});

// Types auto-derived from schemas
export type CreateHospitalInput = z.infer<typeof createHospitalSchema>;
export type HospitalListQuery = z.infer<typeof hospitalListQuerySchema>;
```

#### `@medical-crm/utils`

```typescript
// Pure utility functions, zero external dependencies
export { generateId } from './id';           // UUID v4 generation
export { formatDate, parseDate } from './date';
export { slugify } from './string';
export { paginate, type PaginatedResult } from './pagination';
export { Result, Ok, Err } from './result';  // Result type for error handling
```

### 6.3 Infrastructure — Multi-Datasource Architecture

v1 uses **three separate Supabase instances**. v2 must handle all three:

```
┌─────────────────────────────────────────────────────────────────┐
│                     v2 Infrastructure Layer                      │
├───────────────────┬───────────────────┬─────────────────────────┤
│  CRM DB           │  Main Supabase    │  China Medical Supabase │
│  (Drizzle ORM)    │  (Supabase JS)    │  (Supabase JS)          │
├───────────────────┼───────────────────┼─────────────────────────┤
│  users            │  hospitals        │  hospitals              │
│  cases            │  surgeons         │  hospital_i18n          │
│  conversations    │  procedures       │  surgeons               │
│  messages         │  procedure_cases  │  procedure_cases        │
│  consultations    │  case_images      │  case_images            │
│  documents        │  hospital_trans.  │                         │
│  audit_logs       │  hospital_loc.    │                         │
│  hospital_reg.    │  hospital_proc.   │                         │
│  hospitals (CRM)  │  nearby_attract.  │                         │
├───────────────────┼───────────────────┼─────────────────────────┤
│  Owner: v1 Prisma │  Owner: external  │  Owner: external        │
│  Access: Drizzle  │  Access: Supabase │  Access: Supabase JS    │
│                   │  JS (service_role)│  (service_role)         │
└───────────────────┴───────────────────┴─────────────────────────┘

Hospital type mapping (Keycloak role → DB enum → external DB):
  Keycloak Role         DB HospitalType    External DB
  ─────────────         ───────────────    ────────────────────────
  hospital              COSMETIC           Main Supabase
  regular_hospital      REGULAR            China Medical Supabase
```

#### CRM Database (Drizzle)

```typescript
// packages/infrastructure/database/crm-client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '@medical-crm/config';
import * as schema from './schema';

const client = postgres(serverEnv.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const crmDb = drizzle(client, { schema });
export type CrmDb = typeof crmDb;
```

#### External Supabase Clients

```typescript
// packages/infrastructure/supabase-main/client.ts
import { createClient } from '@supabase/supabase-js';
import { serverEnv } from '@medical-crm/config';

export const mainSupabase = createClient(
  serverEnv.MAIN_SUPABASE_URL,
  serverEnv.MAIN_SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// packages/infrastructure/supabase-china/client.ts
export const chinaSupabase = createClient(
  serverEnv.CHINA_MEDICAL_SUPABASE_URL,
  serverEnv.CHINA_MEDICAL_SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
```

#### Multi-Datasource Repository Pattern

The domain defines a single port; infrastructure provides multiple implementations:

```typescript
// domain/surgeon/ports.ts
export interface SurgeonRepository {
  findByHospitalId(hospitalId: string): Promise<Surgeon[]>;
  findById(id: string): Promise<Surgeon | null>;
  save(surgeon: Surgeon): Promise<void>;
}

// infrastructure/supabase-main/repositories/surgeon.repository.ts
export class MainSupabaseSurgeonRepository implements SurgeonRepository { ... }

// infrastructure/supabase-china/repositories/surgeon.repository.ts
export class ChinaMedicalSurgeonRepository implements SurgeonRepository { ... }

// The composition root selects the implementation based on hospital type.
// Use cases receive the appropriate repository via constructor injection.
```

#### Schema Governance

**CRM DB (Drizzle):**
1. Run `drizzle-kit pull` against the CRM Supabase DB
2. Manually clean up the generated schema
3. Verify parity with v1's `schema.prisma`
4. v1 is the **schema owner** — only v1 runs Prisma migrations
5. v2 is a **schema consumer** — never writes migrations to CRM DB

**External Supabase DBs (Main + China Medical):**
- Accessed via Supabase JS client, NOT Drizzle (no SQL-level access)
- Schema defined by TypeScript interfaces (mirroring v1's `mainSupabase.ts` and `chinaMedicalSupabase.ts` types)
- No migration concerns — v2 reads/writes through the Supabase REST API

**CI schema drift check (CRM DB only):**
- On every CI run: `drizzle-kit pull` → diff against committed schema
- If they differ, CI fails: "CRM DB schema changed, run `pnpm db:pull`"

**Bidirectional schema protocol:**
- **v1 → v2 (additive changes):** v1 adds columns/tables → v2 CI detects drift → v2 updates Drizzle schema. Non-breaking.
- **v1 → v2 (destructive changes):** v1 renames/drops → requires coordinated PR with label `schema-breaking`. v2 must update before v1 deploys.
- **v2 needs new fields/tables:** v2 creates a PR against v1 adding a Prisma migration. v1 team reviews and merges. v2 then pulls the updated schema. v2 NEVER runs migrations directly — all schema changes go through v1's Prisma pipeline.
- **Contract source of truth:** v1's `schema.prisma` for CRM DB; v1's TypeScript interfaces (`mainSupabase.ts`, `chinaMedicalSupabase.ts`) for external DBs.

### 6.4 Infrastructure — Auth (Keycloak Middleware)

```typescript
// packages/infrastructure/auth/keycloak.middleware.ts
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as jose from 'jose';
import { serverEnv } from '@medical-crm/config';

// Cache JWKS for performance
let jwks: jose.JWTVerifyGetKey;

function getJWKS() {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(
      new URL(`${serverEnv.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`)
    );
  }
  return jwks;
}

export type Session = {
  userId: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
};

export const authMiddleware = createMiddleware<{ Variables: { session: Session } }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);

    try {
      const { payload } = await jose.jwtVerify(token, getJWKS(), {
        issuer: serverEnv.KEYCLOAK_ISSUER,
        audience: serverEnv.KEYCLOAK_CLIENT_ID,
      });

      c.set('session', {
        userId: payload.sub!,
        email: payload.email as string,
        roles: (payload.realm_access as any)?.roles ?? [],
        hospitalId: (payload as any).hospital_id ?? null,
      });
    } catch {
      throw new HTTPException(401, { message: 'Invalid or expired token' });
    }

    await next();
  }
);

// Role guard
export const requireRole = (...roles: string[]) =>
  createMiddleware(async (c, next) => {
    const session = c.get('session') as Session;
    if (!roles.some((r) => session.roles.includes(r))) {
      throw new HTTPException(403, { message: 'Insufficient permissions' });
    }
    await next();
  });

// Hospital isolation guard
export const requireHospital = createMiddleware(async (c, next) => {
  const session = c.get('session') as Session;
  if (!session.hospitalId) {
    throw new HTTPException(403, { message: 'No hospital association' });
  }
  await next();
});
```

### 6.5 Security Middleware Stack

```typescript
// apps/api/src/middleware/security.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { rateLimiter } from 'hono-rate-limiter';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { logger } from 'hono/logger';

export function applySecurityMiddleware(app: Hono) {
  // 1. Request ID for tracing
  app.use('*', requestId());

  // 2. Structured logging
  app.use('*', logger());

  // 3. CORS — strict whitelist
  app.use('*', cors({
    origin: [
      process.env.ADMIN_ORIGIN!,
      process.env.HOSPITAL_ORIGIN!,
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: true,
    maxAge: 86400,
  }));

  // 4. Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
  // Note: CSP is NOT applied here — CSP is for HTML responses and belongs on
  // the Next.js frontends (apps/admin, apps/hospital), not on the JSON API.
  app.use('*', secureHeaders({
    // CSP intentionally omitted — this is a JSON API server
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
  }));

  // 5. Trusted proxy IP extraction
  // In single-proxy setups (ALB/nginx in front of app), the leftmost IP
  // in x-forwarded-for is the real client IP. For multi-proxy chains,
  // upgrade to a proper trusted-proxy library before production.
  const getClientIp = (c: any) => {
    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      return xff.split(',')[0].trim();
    }
    return c.req.header('x-real-ip') ?? 'unknown';
  };

  // 6. Global rate limit: 100 req/min per IP (pre-auth, uses IP only)
  app.use('*', rateLimiter({
    windowMs: 60_000,
    limit: 100,
    keyGenerator: getClientIp,
    standardHeaders: 'draft-7',
  }));

  // 7. Stricter rate limit for auth endpoints
  app.use('/auth/*', rateLimiter({
    windowMs: 300_000,  // 5 minutes
    limit: 5,           // 5 attempts
    keyGenerator: getClientIp,
  }));

  // 8. Body size limit (10MB default, overridden per route for file uploads)
  app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 }));
}

// Per-user rate limiter (applied AFTER auth middleware on authenticated routes)
export const perUserRateLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 200,
  keyGenerator: (c) => {
    const session = c.get('session') as any;
    return session?.userId ?? 'anonymous';
  },
});
```

### 6.6 Hono API App Shell

```typescript
// apps/api/src/index.ts
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { applySecurityMiddleware, perUserRateLimiter } from './middleware/security';
import { authMiddleware } from '@medical-crm/infrastructure/auth';

const app = new Hono();

// Apply security middleware stack (runs before auth)
applySecurityMiddleware(app);

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', version: '2.0.0' }));

// All /api/v2/* routes require auth + per-user rate limiting
app.use('/api/v2/*', authMiddleware, perUserRateLimiter);

// Route registration (Phase 2)
// app.route('/api/v2/admin', adminRoutes);
// app.route('/api/v2/hospital', hospitalRoutes);

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
```

### 6.7 Next.js App Shells + Frontend Auth Flow

Both `apps/admin` and `apps/hospital` start as minimal Next.js apps:

- App Router with `src/` directory
- Tailwind CSS configured
- `@medical-crm/ui` imported for shared components
- `@medical-crm/config` for client-side env
- `@medical-crm/i18n` for translations

#### Frontend ↔ Hono API Auth Architecture

**Pattern: Next.js BFF (Backend-for-Frontend) proxy**

The Next.js apps do NOT call the Hono API directly from the browser. Instead:

```
Browser → Next.js Server (Route Handler) → Hono API
                ↕
         httpOnly cookie (session)
```

**Why BFF, not direct browser → Hono:**
- httpOnly cookies cannot be read by JavaScript (XSS protection)
- Access tokens never touch the browser — only the Next.js server sees them
- SSR/RSC pages can attach the token on the server side without client-side JS
- Single point for token refresh logic

**Auth Flow:**

```
1. Login:
   Browser → /auth/login → redirect to Keycloak
   Keycloak → /auth/callback?code=xxx
   Next.js Route Handler:
     - Exchanges code for tokens (PKCE) via Keycloak token endpoint
     - Stores { access_token, refresh_token, expires_at } in httpOnly cookie
     - Redirects to dashboard

2. Authenticated API request (SSR/RSC):
   Next.js Server Component:
     - Reads httpOnly cookie
     - Checks expires_at, refreshes if needed (see step 4)
     - Forwards request to Hono API with Authorization: Bearer {access_token}
     - Returns data to the page

3. Authenticated API request (Client Component):
   Browser → Next.js Route Handler (/api/proxy/*)
     - Route Handler reads httpOnly cookie
     - Forwards to Hono API with Bearer token
     - Returns response to browser

4. Token Refresh:
   Before any API call, check expires_at on the cookie:
     - If token expires in < 60 seconds → refresh via Keycloak token endpoint
     - Update the httpOnly cookie with new tokens
     - If refresh fails → clear cookie, redirect to /auth/login

5. Logout:
   Browser → /auth/logout
   Next.js Route Handler:
     - Calls Keycloak end_session_endpoint
     - Clears httpOnly cookie
     - Redirects to login page
```

**Cookie structure:**
```typescript
// httpOnly, secure, sameSite=lax, path=/, maxAge=7d
interface SessionCookie {
  access_token: string;     // Keycloak JWT
  refresh_token: string;    // For silent refresh
  expires_at: number;       // Unix timestamp
}
// Encrypted with iron-session using SESSION_SECRET env var
```

**Next.js middleware (edge):**
```typescript
// apps/admin/src/middleware.ts
// Checks for session cookie on protected routes
// If absent or expired → redirect to /auth/login
// Does NOT verify JWT (too slow at edge) — Hono API does that
```

**SSR/RSC token injection:**
```typescript
// apps/admin/src/lib/api-client.ts
import { cookies } from 'next/headers';
import { decrypt } from './session';

export async function apiClient(path: string, init?: RequestInit) {
  const session = await decrypt((await cookies()).get('session')?.value);
  if (!session) redirect('/auth/login');

  // Refresh if needed
  const token = await ensureFreshToken(session);

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
}
```

### 6.8 Composition Root (Dependency Injection)

No DI framework — use manual constructor injection via a composition root function:

```typescript
// apps/api/src/composition-root.ts
import { crmDb } from '@medical-crm/infrastructure/database/crm-client';
import { DrizzleHospitalRepository } from '@medical-crm/infrastructure/database/repositories/hospital.repository';
import { DrizzleCaseRepository } from '@medical-crm/infrastructure/database/repositories/case.repository';
import { ManageHospitalsUseCase } from '@medical-crm/application/admin/manage-hospitals';
import { ManageCasesUseCase } from '@medical-crm/application/admin/manage-cases';
// ... more imports

// Wire repositories (infrastructure implements domain ports)
const hospitalRepo = new DrizzleHospitalRepository(crmDb);
const caseRepo = new DrizzleCaseRepository(crmDb);

// Wire use cases (application depends on domain ports, receives implementations)
export const manageHospitals = new ManageHospitalsUseCase(hospitalRepo);
export const manageCases = new ManageCasesUseCase(caseRepo, hospitalRepo);
// ... more use cases

// For testing: export a factory that accepts mock repositories
export function createUseCases(overrides?: Partial<Repositories>) {
  const repos = { hospitalRepo, caseRepo, ...overrides };
  return {
    manageHospitals: new ManageHospitalsUseCase(repos.hospitalRepo),
    manageCases: new ManageCasesUseCase(repos.caseRepo, repos.hospitalRepo),
  };
}
```

**Why manual DI (no tsyringe/inversify):**
- Zero runtime overhead
- Full type safety without decorators
- Easy to understand and debug
- Test factories are explicit

### 6.9 Error Handling Contract

Errors flow through layers with clear mapping:

```
Domain Layer          → Application Layer       → API Layer (Hono)
─────────────────     ──────────────────────     ────────────────────
DomainError           Result<T, AppError>        HTTP Response
  ├─ NotFoundError    → Err(NotFound)            → 404 { error, code }
  ├─ ValidationError  → Err(ValidationFailed)    → 422 { error, details }
  ├─ ConflictError    → Err(Conflict)            → 409 { error, code }
  └─ ForbiddenError   → Err(Forbidden)           → 403 { error, code }
```

```typescript
// domain/shared/errors.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
}
export class NotFoundError extends DomainError { code = 'NOT_FOUND'; }
export class ConflictError extends DomainError { code = 'CONFLICT'; }

// application layer returns Result types
import { Result, Ok, Err } from '@medical-crm/utils';
export type AppError = { code: string; message: string; details?: unknown };

// Use case example
async execute(id: string): Promise<Result<Hospital, AppError>> {
  const hospital = await this.hospitalRepo.findById(id);
  if (!hospital) return Err({ code: 'NOT_FOUND', message: `Hospital ${id} not found` });
  return Ok(hospital);
}

// API route maps Result to HTTP
app.get('/api/v2/admin/hospitals/:id', async (c) => {
  const result = await manageHospitals.getById(c.req.param('id'));
  if (result.isErr()) return c.json({ error: result.error }, mapErrorToStatus(result.error.code));
  return c.json(result.value);
});
```

### 6.10 API Versioning

All v2 API routes are prefixed with `/api/v2/`:

```
/api/v2/admin/*       — Admin endpoints
/api/v2/hospital/*    — Hospital endpoints
/health               — Unversioned health check
```

This allows v1 (`/api/admin/*`) and v2 (`/api/v2/admin/*`) to coexist during the transition period. Frontend apps are version-locked: `apps/admin` only calls `/api/v2/admin/*`.

### 6.11 Deployment Target

**API server (`apps/api`):** Deployed as a **long-running Node.js process** (not serverless).

Rationale:
- pg-boss (Phase 5) requires persistent connections
- WebSocket support for real-time messaging (Phase 5)
- Rate limiter uses in-memory store (sufficient for single-instance; upgrade to Redis for multi-instance)
- `postgres` driver needs connection pooling

**Deployment options:** AWS ECS / Fly.io / Railway / DigitalOcean App Platform
**Not suitable for:** Vercel Edge Functions, Cloudflare Workers (no persistent connections)

**Frontend apps (`apps/admin`, `apps/hospital`):** Standard Next.js deployment (Vercel, AWS Amplify, or self-hosted).

### 6.12 Keycloak Integration Details

**`hospital_id` custom claim:**
- v1 already configures a Keycloak Protocol Mapper (type: "User Attribute") that adds `hospital_id` to the JWT access token
- Claim name: `hospital_id`, mapped from user attribute `hospital_id`
- Present for hospital/regular_hospital role users; absent for admin users
- v2 reuses the same Keycloak realm and mapper — no configuration changes needed

**Token structure (relevant fields):**
```json
{
  "sub": "uuid",
  "email": "user@example.com",
  "realm_access": { "roles": ["hospital"] },
  "hospital_id": "uuid-or-null"
}
```

### 6.13 Hospital Type / Datasource Resolution

**Problem:** The Keycloak JWT contains a role (`hospital` or `regular_hospital`) and the CRM DB contains a `hospital.type` column (`COSMETIC` or `REGULAR`). If they diverge, API calls could route to the wrong external database.

**Source of truth:** The CRM DB `hospitals.type` column is the **canonical source** for datasource routing.

**Resolution rules:**

```
1. At registration time:
   - Admin creates hospital in CRM DB with type = COSMETIC | REGULAR
   - Admin creates Keycloak user with matching role (hospital | regular_hospital)
   - The registration use case enforces consistency: type ↔ role mapping is validated

2. At runtime (every authenticated API request):
   - Auth middleware extracts role from JWT → sets session.roles
   - Use case loads hospital from CRM DB by session.hospitalId
   - The hospital.type field determines which external Supabase to query
   - If JWT role and hospital.type conflict:
     → Log warning: "Role/type mismatch: role={role}, type={type}, hospitalId={id}"
     → Use CRM DB hospital.type as canonical (it's our data, JWT role is Keycloak's)
     → Do NOT silently proceed — the mismatch indicates a configuration error

3. Mismatch detection (defensive):
   - Add a startup health check that queries all hospitals and verifies
     their CRM DB type matches their Keycloak user's role
   - Run as a scheduled job (daily) or as part of CI integration tests
   - Alert on mismatches so admin can fix Keycloak or CRM DB
```

**Mapping (canonical):**

| CRM DB `hospitals.type` | Expected Keycloak role | External DB |
|-------------------------|----------------------|-------------|
| `COSMETIC` | `hospital` | Main Supabase |
| `REGULAR` | `regular_hospital` | China Medical Supabase |

**Key principle:** Keycloak roles determine *authorization* (what can you do). CRM DB `hospitals.type` determines *routing* (which database). They should always agree, but if they don't, routing follows CRM DB.

### 6.14 Input Sanitization Policy

**Scope:** Any user-supplied text that is stored and later rendered (messages, doctor bios, hospital descriptions, case notes, consultation notes).

**Threat model:**
- Stored XSS via rich text fields (messages, bios, descriptions)
- HTML injection in user-facing content
- Markdown injection in fields rendered as markdown
- SQL injection (already mitigated by Drizzle parameterized queries + Supabase JS client)

**Strategy: sanitize on write, escape on read.**

```
                   ┌─────────────────────────────────────────┐
  User input  →    │  1. Zod structural validation            │
                   │  2. Sanitize (strip dangerous HTML/JS)   │
                   │  3. Store clean data in DB                │
                   └─────────────────────────────────────────┘

  DB read     →    │  4. Escape on render (React auto-escapes) │
                   │  5. CSP on frontend as defense-in-depth   │
                   └──────────────────────────────────────────┘
```

**Field categories and sanitization rules:**

| Category | Examples | Allowed content | Sanitizer |
|----------|----------|-----------------|-----------|
| Plain text | patient names, case numbers, titles | No HTML, no markdown | Strip all HTML tags (`sanitize-html` with empty allowlist) |
| Rich text | message body, doctor bio, hospital description | Limited HTML subset | `sanitize-html` with allowlist: `<p>`, `<br>`, `<strong>`, `<em>`, `<ul>`, `<ol>`, `<li>`, `<a href>` (rel=noopener). NO `<script>`, `<iframe>`, `<img>`, `<style>`, event handlers |
| Markdown | internal notes (admin) | Markdown syntax | Store raw markdown; render with `remark` + `rehype-sanitize` on frontend |
| URLs | image_url, video_url, website | Valid URL only | Zod `.url()` validation + protocol whitelist (`https://` only) |
| JSON/structured | translations, procedures_count, bio | Schema-defined structure | Zod schema validation (no free-form HTML inside JSON values); recursively sanitize string values in JSONB fields |

**Implementation (Phase 1 — `@medical-crm/utils`):**

```typescript
// packages/shared/utils/src/sanitize.ts
import sanitizeHtml from 'sanitize-html';

// Plain text: strip ALL HTML
export function sanitizePlainText(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
}

// Rich text: limited HTML allowlist
export function sanitizeRichText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['https'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}

// URL: protocol whitelist
export function sanitizeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
```

**Integration with Zod schemas:**

```typescript
// packages/shared/validation/src/message.schema.ts
import { sanitizeRichText } from '@medical-crm/utils';

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000).transform(sanitizeRichText),
  conversationId: z.string().uuid(),
});
// After Zod validation, content is already sanitized — no further processing needed
```

**Defense-in-depth layers:**
1. **Zod + sanitize on write** — primary defense (API layer)
2. **React auto-escaping** — secondary defense (prevents rendering raw HTML by default)
3. **CSP headers on frontends** — tertiary defense (`script-src 'self'` blocks inline scripts even if XSS gets through)
4. **`sanitize-html` as dev dependency** — added to `@medical-crm/utils` in Phase 1

### 6.15 Testing Strategy for Phase 1

| Layer | Test Type | Tool | What to Test |
|-------|-----------|------|-------------|
| shared/config | Unit | Vitest | Env validation (valid + invalid + missing vars) |
| shared/validation | Unit | Vitest | Zod schema edge cases, coercion, defaults |
| infrastructure/database | Integration | Vitest + test DB | Drizzle queries against real CRM schema |
| infrastructure/supabase-main | Integration | Vitest + MSW | Surgeon/hospital queries, error handling |
| infrastructure/supabase-china | Integration | Vitest + MSW | China hospital queries, i18n data |
| infrastructure/auth | Unit + Integration | Vitest + MSW | Token verification, JWKS rotation, expired tokens, malformed JWTs |
| apps/api middleware | Integration | Vitest + Hono test client | Rate limiting, CORS, auth chain, error responses |
| composition root | Smoke | Vitest | `createUseCases()` wires without throwing; all ports satisfied |
| frontend auth flow | Integration | Vitest + MSW | Keycloak login redirect, callback code exchange, token refresh, logout, cookie encryption/decryption |
| shared/utils (sanitize) | Unit | Vitest | XSS payloads stripped, allowlisted tags preserved, URL protocol whitelist, JSONB recursive sanitize |
| OpenAPI contract | CI | `@hono/zod-openapi` + snapshot | Export OpenAPI JSON in CI, diff against committed snapshot to detect unintended contract changes |

**Additional testing requirements:**

- **Keycloak auth E2E (CI):** Test against a real Keycloak instance (Docker in CI) with pre-seeded users for admin, hospital, and regular_hospital roles. Verify: login → code exchange → JWT issued → API accepts token → role guards work → token refresh → logout → API rejects stale token.
- **Composition root wiring smoke test:** Import `createUseCases()` and verify it completes without throwing. This catches missing adapter registrations early.
- **Frontend auth redirect flow:** Mock Keycloak responses with MSW. Verify: unauthenticated user → redirected to `/auth/login` → Keycloak mock → callback handler stores cookie → dashboard accessible. Test cookie expiry → automatic refresh. Test refresh failure → redirect to login.
- **Multi-datasource isolation:** Verify that a `beauty_hospital` user's API calls route to Main Supabase and a `regular_hospital` user's calls route to China Medical Supabase. Use MSW to intercept both Supabase endpoints and assert the correct one was called.

### 6.16 Phase 1 Deliverables Checklist

- [ ] Turborepo + pnpm workspace configured and building
- [ ] `@medical-crm/config` — Zod-validated env, fail-fast
- [ ] `@medical-crm/validation` — initial Zod schemas (hospital, case)
- [ ] `@medical-crm/utils` — core utilities (ID, date, pagination, Result, sanitize)
- [ ] `@medical-crm/ui` — shadcn/ui component library scaffold (used by admin + hospital shells)
- [ ] `@medical-crm/i18n` — translation files migrated from v1
- [ ] `@medical-crm/infrastructure` — single package with sub-path exports:
  - `@medical-crm/infrastructure/database` — Drizzle CRM client + introspected schema
  - `@medical-crm/infrastructure/supabase-main` — Main Supabase client (beauty hospitals)
  - `@medical-crm/infrastructure/supabase-china` — China Medical Supabase client (regular hospitals)
  - `@medical-crm/infrastructure/auth` — Keycloak JWT verification + RBAC middleware
- [ ] `apps/api` — Hono server with security middleware, `/health` endpoint
- [ ] `apps/admin` — Next.js shell with Keycloak redirect
- [ ] `apps/hospital` — Next.js shell with Keycloak redirect
- [ ] All packages pass `pnpm typecheck` and `pnpm lint`
- [ ] Integration tests for DB connectivity and auth middleware
- [ ] ESLint dependency boundary rules configured
- [ ] CI-ready (turbo build + test + typecheck)

---

## 7. v1 Feature Matrix (Admin + Hospital)

Features to align in Phases 2-5:

### Admin Portal

| Feature | v1 Status | v2 Phase |
|---------|-----------|----------|
| Dashboard (KPIs, pending items) | ✅ | Phase 3 |
| Hospital CRUD + approval | ✅ | Phase 3 |
| Case management (list, detail, assign) | ✅ | Phase 3 |
| Message moderation | ✅ | Phase 3 |
| Patient directory | ✅ | Phase 3 |
| Settings & profile | ✅ | Phase 3 |

### Hospital Portal

| Feature | v1 Status | v2 Phase |
|---------|-----------|----------|
| Dashboard | ✅ | Phase 4 |
| Case handling (list, detail, tabs) | ✅ | Phase 4 |
| Consultation scheduling + video | ✅ | Phase 4 |
| Materials (doctors, gallery, videos) | ✅ | Phase 4 |
| Messages (patient communication) | ✅ | Phase 4 |
| Invitation letters | ✅ | Phase 4 |
| Quote management | ✅ | Phase 4 |

### Cross-cutting

| Feature | v1 Status | v2 Phase |
|---------|-----------|----------|
| AI translation (10 languages) | ✅ | Phase 5 |
| Real-time messaging | ✅ | Phase 5 |
| Task queue (pg-boss) | ✅ | Phase 5 |
| Document AI summarization | ✅ | Phase 5 |
| Audit logging (request-level) | ✅ | Phase 1 (HTTP request logging via middleware) |
| Audit logging (domain-level PHI access) | ✅ | Phase 2 (repository-level audit events) |
| File upload/download | ✅ | Phase 2 (API) |

---

## 8. Security Model Summary

### API Layer (Phase 1)

1. **Rate Limiting** — Per-IP pre-auth (100/min global, 5/5min for auth) + per-user post-auth (200/min)
2. **CORS** — Strict origin whitelist (admin + hospital domains only)
3. **CSP** — Content Security Policy on Next.js frontends (not on JSON API)
4. **Secure Headers** — X-Frame-Options, X-Content-Type-Options, Referrer-Policy on API
5. **Body Size Limit** — 10MB default, configurable per route
6. **Input Validation** — Zod schemas on every endpoint (via @hono/zod-openapi)
7. **Request ID** — UUID per request for tracing
8. **Structured Logging** — All requests logged with duration, status, user

### Auth Layer (Phase 1)

1. **JWT Verification** — JWKS rotation, audience + issuer checks
2. **RBAC** — Role-based middleware (admin, hospital, regular_hospital)
3. **Hospital Isolation** — Hospital users can only access their own data
4. **Token Expiry** — Enforce Keycloak token TTL

### Data Layer (Phase 2+)

1. **Repository Pattern** — All DB access through typed repositories
2. **Audit Logging** — PHI access tracked (view, download, delete)
3. **Soft Deletes** — No hard deletes for compliance
4. **Idempotency** — Idempotency-Key header for POST mutations

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Drizzle schema drift from v1 Prisma migrations | DB errors | CI check: introspect + diff against committed schema |
| Keycloak token format changes | Auth failures | Integration tests with real Keycloak |
| v1 schema migration breaks v2 | Runtime errors | v2 treats schema as read-only; coordinate any v1 migrations |
| Monorepo build complexity | Slow CI | Turborepo cache + remote caching |
| Feature parity gaps | Missing functionality | feature-matrix.md checklist, manual QA before each phase close |
| In-memory rate limiter | Ineffective with multiple API instances | Single-instance for Phase 1; upgrade to Redis store before multi-instance deployment |
