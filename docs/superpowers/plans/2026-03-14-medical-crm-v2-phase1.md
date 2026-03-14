# Medical CRM v2 — Phase 1: Foundation & Infrastructure

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a fully typed, tested, and CI-ready Turborepo monorepo with all shared packages, infrastructure adapters (CRM DB + 2 external Supabase clients + Keycloak auth), a Hono API server with security middleware, and two Next.js frontend shells with BFF auth flow.

**Architecture:** Clean Architecture with strict dependency inversion. Domain defines ports (interfaces); infrastructure implements them. A composition root in `apps/api` wires everything together. Frontend apps use a BFF proxy pattern — tokens live in httpOnly cookies, never in the browser.

**Tech Stack:** Turborepo + pnpm, Hono + @hono/zod-openapi, Drizzle ORM, Supabase JS, jose (JWT), iron-session, Next.js 16, React 19, Vitest, sanitize-html, TailwindCSS 4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-11-medical-crm-v2-design.md`

**Root directory:** All paths below are relative to `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/`

> **Important:** `medical-crm-v2/` is a **new standalone git repo**, sibling to `medical-crm/` (v1), NOT a subdirectory of v1.
> ```
> medora-health-beauty/          ← 主项目根
> ├── medical-crm/               ← v1（现有，gitignored）
> ├── medical-crm-v2/            ← v2（新建，独立 git repo）
> └── ...
> ```
> Task 1 Step 1 会执行 `git init` 初始化新 repo。

---

## Chunk 1: Monorepo Foundation + Shared Packages

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `eslint.config.js`

- [ ] **Step 1: Create the v2 root directory and init git**

```bash
mkdir -p /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git init
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "medical-crm-v2",
  "private": true,
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:coverage": "turbo test -- --coverage",
    "db:pull": "pnpm --filter @medical-crm/infrastructure drizzle-kit pull",
    "db:generate": "pnpm --filter @medical-crm/infrastructure drizzle-kit generate",
    "clean": "turbo clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/shared/*"
```

- [ ] **Step 4: Create `turbo.json`**

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
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "exclude": ["node_modules", "dist", ".next"]
}
```

- [ ] **Step 6: Create `.env.example`**

```env
# ===== CRM Database (Prisma-managed, accessed via Drizzle) =====
DATABASE_URL=postgresql://postgres:password@localhost:5432/crm
DIRECT_URL=postgresql://postgres:password@localhost:5432/crm

# ===== Main Project Supabase (beauty hospitals) =====
MAIN_SUPABASE_URL=https://yamlikuqgmqiigeaqzaz.supabase.co
MAIN_SUPABASE_SERVICE_KEY=your-main-supabase-service-key

# ===== China Medical Supabase (regular hospitals) =====
CHINA_MEDICAL_SUPABASE_URL=https://jjlrlwopsdmxkqyjshuc.supabase.co
CHINA_MEDICAL_SUPABASE_SERVICE_KEY=your-china-medical-service-key

# ===== Auth (Keycloak) =====
KEYCLOAK_ISSUER=http://localhost:8080/realms/medical-crm
KEYCLOAK_CLIENT_ID=portal-web
KEYCLOAK_CLIENT_SECRET=your-keycloak-secret
SESSION_SECRET=must-be-at-least-32-characters-long-change-me

# ===== AI =====
OPENAI_API_KEY=sk-your-openai-key

# ===== Storage (CRM file storage) =====
CRM_SUPABASE_URL=https://zysulhfukqgnhfjufoip.supabase.co
CRM_SUPABASE_SERVICE_ROLE_KEY=your-crm-supabase-service-key

# ===== Email =====
RESEND_API_KEY=re_your-resend-key

# ===== CORS =====
ADMIN_ORIGIN=http://localhost:3002
HOSPITAL_ORIGIN=http://localhost:3003

# ===== Internal API URL (server-side only) =====
API_URL=http://localhost:3001

# ===== Client-side =====
NEXT_PUBLIC_SUPABASE_URL=https://zysulhfukqgnhfjufoip.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=medical-crm
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=portal-web

NODE_ENV=development
```

- [ ] **Step 7: Create `.gitignore`**

```
node_modules/
dist/
.next/
.turbo/
.env
.env.local
*.tsbuildinfo
coverage/
```

- [ ] **Step 8: Create `.npmrc`**

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 9: Create `eslint.config.js`**

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**'],
  },
);
```

Add to root `package.json` devDependencies:
```json
    "@eslint/js": "^9.18.0",
    "eslint": "^9.18.0",
    "typescript-eslint": "^8.20.0",
```

- [ ] **Step 10: Run `pnpm install` to initialize**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm install
```

Expected: lockfile created, turbo installed.

- [ ] **Step 11: Commit scaffold**

```bash
git add .
git commit -m "chore: scaffold medical-crm-v2 Turborepo monorepo"
```

---

### Task 2: `@medical-crm/config` — Zod-validated env

**Files:**
- Create: `packages/shared/config/package.json`
- Create: `packages/shared/config/tsconfig.json`
- Create: `packages/shared/config/vitest.config.ts`
- Create: `packages/shared/config/src/env.ts`
- Create: `packages/shared/config/src/index.ts`
- Test: `packages/shared/config/src/__tests__/env.test.ts`

- [ ] **Step 1: Create package scaffold**

`packages/shared/config/package.json`:
```json
{
  "name": "@medical-crm/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/shared/config/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

`packages/shared/config/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 2: Write the failing test**

`packages/shared/config/src/__tests__/env.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { serverEnvSchema, clientEnvSchema } from '../env';

describe('serverEnvSchema', () => {
  const VALID_ENV = {
    DATABASE_URL: 'postgresql://localhost:5432/crm',
    DIRECT_URL: 'postgresql://localhost:5432/crm',
    MAIN_SUPABASE_URL: 'https://example.supabase.co',
    MAIN_SUPABASE_SERVICE_KEY: 'key123',
    CHINA_MEDICAL_SUPABASE_URL: 'https://china.supabase.co',
    CHINA_MEDICAL_SUPABASE_SERVICE_KEY: 'key456',
    KEYCLOAK_ISSUER: 'https://keycloak.example.com/realms/test',
    KEYCLOAK_CLIENT_ID: 'portal-web',
    KEYCLOAK_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'must-be-at-least-32-characters-long-change-me',
    OPENAI_API_KEY: 'sk-test',
    CRM_SUPABASE_URL: 'https://crm.supabase.co',
    CRM_SUPABASE_SERVICE_ROLE_KEY: 'role-key',
    ADMIN_ORIGIN: 'http://localhost:3002',
    HOSPITAL_ORIGIN: 'http://localhost:3003',
    API_URL: 'http://localhost:3001',
  };

  it('parses valid env without throwing', () => {
    expect(() => serverEnvSchema.parse(VALID_ENV)).not.toThrow();
  });

  it('fails on missing DATABASE_URL', () => {
    const { DATABASE_URL, ...rest } = VALID_ENV;
    expect(() => serverEnvSchema.parse(rest)).toThrow();
  });

  it('fails on SESSION_SECRET shorter than 32 chars', () => {
    expect(() =>
      serverEnvSchema.parse({ ...VALID_ENV, SESSION_SECRET: 'short' })
    ).toThrow();
  });

  it('defaults NODE_ENV to development', () => {
    const result = serverEnvSchema.parse(VALID_ENV);
    expect(result.NODE_ENV).toBe('development');
  });

  it('allows optional RESEND_API_KEY', () => {
    const result = serverEnvSchema.parse(VALID_ENV);
    expect(result.RESEND_API_KEY).toBeUndefined();
  });
});

describe('clientEnvSchema', () => {
  it('parses valid client env', () => {
    expect(() =>
      clientEnvSchema.parse({
        NEXT_PUBLIC_SUPABASE_URL: 'https://crm.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
        NEXT_PUBLIC_KEYCLOAK_URL: 'http://localhost:8080',
        NEXT_PUBLIC_KEYCLOAK_REALM: 'medical-crm',
        NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: 'portal-web',
      })
    ).not.toThrow();
  });

  it('fails on missing NEXT_PUBLIC_SUPABASE_URL', () => {
    expect(() => clientEnvSchema.parse({})).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/config test
```
Expected: FAIL — `../env` module does not exist yet.

- [ ] **Step 4: Implement `env.ts`**

`packages/shared/config/src/env.ts`:
```typescript
import { z } from 'zod';

export const serverEnvSchema = z.object({
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
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
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

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_KEYCLOAK_URL: z.string().url(),
  NEXT_PUBLIC_KEYCLOAK_REALM: z.string().min(1),
  NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
```

`packages/shared/config/src/index.ts`:
```typescript
import { serverEnvSchema, clientEnvSchema } from './env';
import type { ServerEnv, ClientEnv } from './env';

export { serverEnvSchema, clientEnvSchema };
export type { ServerEnv, ClientEnv };

// Lazy-parsed singletons for runtime use (fail-fast on first access)
let _serverEnv: ServerEnv | null = null;
let _clientEnv: ClientEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (!_serverEnv) {
    _serverEnv = serverEnvSchema.parse(process.env);
  }
  return _serverEnv!;
}

export function getClientEnv(): ClientEnv {
  if (!_clientEnv) {
    _clientEnv = clientEnvSchema.parse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_KEYCLOAK_URL: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
      NEXT_PUBLIC_KEYCLOAK_REALM: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
      NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID,
    });
  }
  return _clientEnv!;
}
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
pnpm --filter @medical-crm/config test
```
Expected: All 7 tests PASS (5 serverEnvSchema + 2 clientEnvSchema).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/config/
git commit -m "feat: add @medical-crm/config with Zod-validated env schemas"
```

---

### Task 3: `@medical-crm/utils` — Core Utilities

**Files:**
- Create: `packages/shared/utils/package.json`
- Create: `packages/shared/utils/tsconfig.json`
- Create: `packages/shared/utils/vitest.config.ts`
- Create: `packages/shared/utils/src/id.ts`
- Create: `packages/shared/utils/src/date.ts`
- Create: `packages/shared/utils/src/string.ts`
- Create: `packages/shared/utils/src/pagination.ts`
- Create: `packages/shared/utils/src/result.ts`
- Create: `packages/shared/utils/src/index.ts`
- Test: `packages/shared/utils/src/__tests__/result.test.ts`
- Test: `packages/shared/utils/src/__tests__/pagination.test.ts`

- [ ] **Step 1: Create package scaffold**

`packages/shared/utils/package.json`:
```json
{
  "name": "@medical-crm/utils",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/shared/utils/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

`packages/shared/utils/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 2: Write failing tests for Result type**

`packages/shared/utils/src/__tests__/result.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Ok, Err, type Result } from '../result';

describe('Result', () => {
  it('Ok wraps a value', () => {
    const r = Ok(42);
    expect(r.isOk()).toBe(true);
    expect(r.isErr()).toBe(false);
    expect(r.value).toBe(42);
  });

  it('Err wraps an error', () => {
    const r = Err('bad');
    expect(r.isOk()).toBe(false);
    expect(r.isErr()).toBe(true);
    expect(r.error).toBe('bad');
  });

  it('unwrap returns value on Ok', () => {
    expect(Ok('hello').unwrap()).toBe('hello');
  });

  it('unwrap throws on Err', () => {
    expect(() => Err('fail').unwrap()).toThrow('fail');
  });

  it('map transforms Ok value', () => {
    const r = Ok(5).map((n) => n * 2);
    expect(r.value).toBe(10);
  });

  it('map does not transform Err', () => {
    const r = Err<number, string>('err').map((n) => n * 2);
    expect(r.isErr()).toBe(true);
    expect(r.error).toBe('err');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @medical-crm/utils test
```
Expected: FAIL — cannot resolve `../result`.

- [ ] **Step 4: Implement Result type**

`packages/shared/utils/src/result.ts`:
```typescript
export type Result<T, E> = OkResult<T, E> | ErrResult<T, E>;

class OkResult<T, E> {
  readonly _tag = 'Ok' as const;
  constructor(readonly value: T) {}
  isOk(): this is OkResult<T, E> { return true; }
  isErr(): this is ErrResult<T, E> { return false; }
  unwrap(): T { return this.value; }
  map<U>(fn: (value: T) => U): Result<U, E> { return new OkResult(fn(this.value)); }
  get error(): never { throw new Error('Cannot access error on Ok'); }
}

class ErrResult<T, E> {
  readonly _tag = 'Err' as const;
  constructor(readonly error: E) {}
  isOk(): this is OkResult<T, E> { return false; }
  isErr(): this is ErrResult<T, E> { return true; }
  unwrap(): never { throw new Error(String(this.error)); }
  map<U>(_fn: (value: T) => U): Result<U, E> { return new ErrResult(this.error); }
  get value(): never { throw new Error('Cannot access value on Err'); }
}

export function Ok<T, E = never>(value: T): Result<T, E> {
  return new OkResult(value);
}

export function Err<T = never, E = string>(error: E): Result<T, E> {
  return new ErrResult(error);
}
```

- [ ] **Step 5: Run Result tests**

```bash
pnpm --filter @medical-crm/utils test -- result
```
Expected: All 6 PASS.

- [ ] **Step 6: Write failing pagination test**

`packages/shared/utils/src/__tests__/pagination.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { paginate } from '../pagination';

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('returns first page', () => {
    const result = paginate(items, 1, 10);
    expect(result.data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.total).toBe(25);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(3);
    expect(result.hasMore).toBe(true);
  });

  it('returns last page', () => {
    const result = paginate(items, 3, 10);
    expect(result.data).toEqual([21, 22, 23, 24, 25]);
    expect(result.hasMore).toBe(false);
  });

  it('returns empty for out-of-range page', () => {
    const result = paginate(items, 99, 10);
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});
```

- [ ] **Step 7: Implement pagination + remaining utils**

`packages/shared/utils/src/pagination.ts`:
```typescript
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export function paginate<T>(items: T[], page: number, limit: number): PaginatedResult<T> {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);
  return { data, total, page, limit, totalPages, hasMore: page < totalPages };
}
```

`packages/shared/utils/src/id.ts`:
```typescript
export function generateId(): string {
  return crypto.randomUUID();
}
```

`packages/shared/utils/src/date.ts`:
```typescript
export function formatDate(date: Date | string, locale = 'en-US'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function parseDate(input: string): Date {
  const d = new Date(input);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  return d;
}
```

`packages/shared/utils/src/string.ts`:
```typescript
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

`packages/shared/utils/src/index.ts`:
```typescript
export { generateId } from './id';
export { formatDate, parseDate } from './date';
export { slugify } from './string';
export { paginate, type PaginatedResult } from './pagination';
export type { Result } from './result';
export { Ok, Err } from './result';
```

- [ ] **Step 8: Run all utils tests**

```bash
pnpm --filter @medical-crm/utils test
```
Expected: All 9 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/utils/
git commit -m "feat: add @medical-crm/utils (Result, pagination, id, date, string)"
```

---

### Task 4: `@medical-crm/utils` — Sanitization

**Files:**
- Create: `packages/shared/utils/src/sanitize.ts`
- Modify: `packages/shared/utils/src/index.ts` (add export)
- Modify: `packages/shared/utils/package.json` (add sanitize-html dep)
- Test: `packages/shared/utils/src/__tests__/sanitize.test.ts`

- [ ] **Step 1: Add sanitize-html dependency**

```bash
pnpm --filter @medical-crm/utils add sanitize-html
pnpm --filter @medical-crm/utils add -D @types/sanitize-html
```

- [ ] **Step 2: Write failing tests**

`packages/shared/utils/src/__tests__/sanitize.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { sanitizePlainText, sanitizeRichText, sanitizeUrl } from '../sanitize';

describe('sanitizePlainText', () => {
  it('strips all HTML tags', () => {
    expect(sanitizePlainText('<b>hello</b>')).toBe('hello');
  });

  it('strips script tags and content', () => {
    expect(sanitizePlainText('hi<script>alert(1)</script>bye')).toBe('hibye');
  });

  it('preserves plain text', () => {
    expect(sanitizePlainText('hello world')).toBe('hello world');
  });
});

describe('sanitizeRichText', () => {
  it('preserves allowed tags', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    expect(sanitizeRichText(input)).toBe(input);
  });

  it('strips script tags', () => {
    expect(sanitizeRichText('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
  });

  it('strips img tags', () => {
    expect(sanitizeRichText('<p>text</p><img src="x" onerror="alert(1)">')).toBe('<p>text</p>');
  });

  it('strips iframe tags', () => {
    expect(sanitizeRichText('<iframe src="evil.com"></iframe>')).toBe('');
  });

  it('strips event handlers from allowed tags', () => {
    expect(sanitizeRichText('<p onclick="alert(1)">text</p>')).toBe('<p>text</p>');
  });

  it('adds rel=noopener to links', () => {
    const result = sanitizeRichText('<a href="https://example.com">link</a>');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('target="_blank"');
  });

  it('strips javascript: protocol from links', () => {
    const result = sanitizeRichText('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain('javascript');
  });
});

describe('sanitizeUrl', () => {
  it('accepts https URLs', () => {
    expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('rejects http URLs (https only)', () => {
    expect(sanitizeUrl('http://example.com')).toBeNull();
  });

  it('rejects javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects invalid URLs', () => {
    expect(sanitizeUrl('not a url')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @medical-crm/utils test -- sanitize
```
Expected: FAIL — cannot resolve `../sanitize`.

- [ ] **Step 4: Implement sanitize.ts**

`packages/shared/utils/src/sanitize.ts`:
```typescript
import sanitizeHtml from 'sanitize-html';

/** Strip ALL HTML — for plain text fields (names, titles, case numbers). */
export function sanitizePlainText(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
}

/** Limited HTML allowlist — for rich text fields (messages, bios, descriptions). */
export function sanitizeRichText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['https'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  });
}

/** Validate URL protocol — for image_url, video_url, website fields. */
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

- [ ] **Step 5: Add export to index.ts**

Append to `packages/shared/utils/src/index.ts`:
```typescript
export { sanitizePlainText, sanitizeRichText, sanitizeUrl } from './sanitize';
```

- [ ] **Step 6: Run all tests**

```bash
pnpm --filter @medical-crm/utils test
```
Expected: All 24 tests PASS (9 result+pagination + 15 sanitize).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/utils/
git commit -m "feat: add sanitization utilities (plain text, rich text, URL)"
```

---

### Task 5: `@medical-crm/validation` — Shared Zod Schemas

**Files:**
- Create: `packages/shared/validation/package.json`
- Create: `packages/shared/validation/tsconfig.json`
- Create: `packages/shared/validation/vitest.config.ts`
- Create: `packages/shared/validation/src/hospital.schema.ts`
- Create: `packages/shared/validation/src/case.schema.ts`
- Create: `packages/shared/validation/src/message.schema.ts`
- Create: `packages/shared/validation/src/index.ts`
- Test: `packages/shared/validation/src/__tests__/hospital.schema.test.ts`
- Test: `packages/shared/validation/src/__tests__/case.schema.test.ts`
- Test: `packages/shared/validation/src/__tests__/message.schema.test.ts`

- [ ] **Step 1: Create package scaffold**

`packages/shared/validation/package.json`:
```json
{
  "name": "@medical-crm/validation",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "zod": "^3.24.0",
    "@medical-crm/utils": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/shared/validation/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

`packages/shared/validation/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 2: Write failing test for hospital schema**

`packages/shared/validation/src/__tests__/hospital.schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createHospitalSchema, hospitalListQuerySchema } from '../hospital.schema';

describe('createHospitalSchema', () => {
  it('accepts valid input', () => {
    const result = createHospitalSchema.safeParse({
      name: 'Test Hospital',
      type: 'COSMETIC',
      contactEmail: 'test@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createHospitalSchema.safeParse({
      name: '',
      type: 'COSMETIC',
      contactEmail: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = createHospitalSchema.safeParse({
      name: 'Test',
      type: 'INVALID',
      contactEmail: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = createHospitalSchema.safeParse({
      name: 'Test',
      type: 'REGULAR',
      contactEmail: 'not-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('hospitalListQuerySchema', () => {
  it('applies defaults', () => {
    const result = hospitalListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('coerces string numbers', () => {
    const result = hospitalListQuerySchema.parse({ page: '3', limit: '50' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it('rejects limit > 100', () => {
    const result = hospitalListQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @medical-crm/validation test
```
Expected: FAIL.

- [ ] **Step 4: Implement schemas**

`packages/shared/validation/src/hospital.schema.ts`:
```typescript
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

export type CreateHospitalInput = z.infer<typeof createHospitalSchema>;
export type HospitalListQuery = z.infer<typeof hospitalListQuerySchema>;
```

`packages/shared/validation/src/case.schema.ts`:
```typescript
import { z } from 'zod';

export const caseStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED']);
export const caseStageSchema = z.enum([
  'PENDING_ASSIGNMENT',
  'TRANSFERRED_TO_HOSPITAL',
  'HOSPITAL_CONTACTED',
  'CONSULTATION_SCHEDULED',
  'IN_TREATMENT',
  'TREATMENT_COMPLETED',
]);
export const riskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const caseListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: caseStatusSchema.optional(),
  stage: caseStageSchema.optional(),
  hospitalId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type CaseListQuery = z.infer<typeof caseListQuerySchema>;
```

`packages/shared/validation/src/message.schema.ts`:
```typescript
import { z } from 'zod';
import { sanitizeRichText } from '@medical-crm/utils';

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000).transform(sanitizeRichText),
  conversationId: z.string().uuid(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
```

`packages/shared/validation/src/index.ts`:
```typescript
export * from './hospital.schema';
export * from './case.schema';
export * from './message.schema';
```

- [ ] **Step 5: Write failing tests for case schema**

`packages/shared/validation/src/__tests__/case.schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { caseListQuerySchema, caseStatusSchema, caseStageSchema } from '../case.schema';

describe('caseStatusSchema', () => {
  it('accepts valid statuses', () => {
    expect(caseStatusSchema.parse('DRAFT')).toBe('DRAFT');
    expect(caseStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
  });

  it('rejects invalid status', () => {
    const result = caseStatusSchema.safeParse('UNKNOWN');
    expect(result.success).toBe(false);
  });
});

describe('caseListQuerySchema', () => {
  it('applies defaults', () => {
    const result = caseListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('coerces string numbers', () => {
    const result = caseListQuerySchema.parse({ page: '2', limit: '50' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });

  it('rejects limit > 100', () => {
    const result = caseListQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });

  it('validates hospitalId as UUID', () => {
    const result = caseListQuerySchema.safeParse({ hospitalId: 'not-uuid' });
    expect(result.success).toBe(false);
  });

  it('accepts valid hospitalId UUID', () => {
    const result = caseListQuerySchema.safeParse({
      hospitalId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 6: Write failing tests for message schema**

`packages/shared/validation/src/__tests__/message.schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { sendMessageSchema } from '../message.schema';

describe('sendMessageSchema', () => {
  it('accepts valid message', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Hello doctor',
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = sendMessageSchema.safeParse({
      content: '',
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for conversationId', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Hello',
      conversationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('sanitizes HTML in content via transform', () => {
    const result = sendMessageSchema.parse({
      content: '<p>Safe</p><script>alert(1)</script>',
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.content).toBe('<p>Safe</p>');
    expect(result.content).not.toContain('script');
  });
});
```

- [ ] **Step 7: Run tests**

```bash
pnpm install
pnpm --filter @medical-crm/validation test
```
Expected: All 18 tests PASS (7 hospital + 7 case + 4 message).

- [ ] **Step 8: Commit**

```bash
git add packages/shared/validation/
git commit -m "feat: add @medical-crm/validation (hospital, case, message schemas)"
```

---

*End of Chunk 1*

---

## Chunk 2: Infrastructure Layer

### Task 6: `@medical-crm/infrastructure` — Package Scaffold + Drizzle CRM Client

**Files:**
- Create: `packages/infrastructure/package.json`
- Create: `packages/infrastructure/tsconfig.json`
- Create: `packages/infrastructure/vitest.config.ts`
- Create: `packages/infrastructure/drizzle.config.ts`
- Create: `packages/infrastructure/database/crm-client.ts`
- Create: `packages/infrastructure/database/schema/.gitkeep`

- [ ] **Step 1: Create infrastructure package scaffold**

`packages/infrastructure/package.json`:
```json
{
  "name": "@medical-crm/infrastructure",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./database": "./database/crm-client.ts",
    "./database/schema": "./database/schema/index.ts",
    "./supabase-main": "./supabase-main/client.ts",
    "./supabase-main/types": "./supabase-main/types.ts",
    "./supabase-china": "./supabase-china/client.ts",
    "./supabase-china/types": "./supabase-china/types.ts",
    "./auth": "./auth/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint .",
    "db:pull": "drizzle-kit pull",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "@medical-crm/config": "workspace:*",
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.0",
    "@supabase/supabase-js": "^2.49.0",
    "jose": "^6.0.0",
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/infrastructure/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist", "**/__tests__/**"]
}
```

`packages/infrastructure/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 2: Create Drizzle CRM client**

`packages/infrastructure/database/crm-client.ts`:
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getServerEnv } from '@medical-crm/config';

let _crmDb: ReturnType<typeof drizzle> | null = null;

export function getCrmDb() {
  if (!_crmDb) {
    const env = getServerEnv();
    const client = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _crmDb = drizzle(client);
  }
  return _crmDb;
}

export type CrmDb = ReturnType<typeof getCrmDb>;
```

Note: Schema imports will be added in Task 7 after `drizzle-kit pull`.

- [ ] **Step 3: Create schema placeholder**

```bash
mkdir -p packages/infrastructure/database/schema
touch packages/infrastructure/database/schema/.gitkeep
```

- [ ] **Step 4: Create `drizzle.config.ts`**

`packages/infrastructure/drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './database/schema',
  schema: './database/schema/*.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 5: Install deps and verify typecheck**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm install
pnpm --filter @medical-crm/infrastructure typecheck
```
Expected: Passes (no schema files yet, client is minimal).

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/
git commit -m "feat: add @medical-crm/infrastructure scaffold + Drizzle CRM client"
```

---

### Task 7: Drizzle Schema Introspection

This task pulls the live CRM DB schema into Drizzle table definitions.

**Files:**
- Create/generate: `packages/infrastructure/database/schema/*.ts` (generated by drizzle-kit)
- Create: `packages/infrastructure/database/schema/index.ts` (barrel re-export)

- [ ] **Step 1: Copy v1 .env DATABASE_URL for local dev**

Create `medical-crm-v2/.env.local` with the DATABASE_URL from v1's `.env`:
```bash
# Copy DATABASE_URL and DIRECT_URL from medical-crm/.env
cp /Users/haowang/Desktop/medora-health-beauty/medical-crm/.env ./tmp-env
grep -E '^(DATABASE_URL|DIRECT_URL)=' tmp-env > .env.local
rm tmp-env
```

- [ ] **Step 2: Run drizzle-kit pull**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/infrastructure db:pull
```
Expected: Schema files generated in `packages/infrastructure/database/schema/`.

- [ ] **Step 3: Verify generated schema matches v1 Prisma models**

Check that the following tables are present (from v1 `schema.prisma`):
- `users` (User)
- `hospitals` (Hospital)
- `hospital_registration_tokens` (HospitalRegistrationToken)
- `cases` (Case)
- `documents` (Document)
- `audit_logs` (AuditLog)
- `conversations` (Conversation)
- `messages` (Message)
- `case_progress` (CaseProgress)
- `consultation_transcripts` (ConsultationTranscript)
- `consultations` (Consultation)

Also verify all enums: `UserRole`, `HospitalStatus`, `HospitalType`, `CaseStatus`, `CaseStage`, `RiskLevel`, `DocumentType`, `Sensitivity`, `DocumentStatus`, `AuditEvent`, `ConversationCategory`, `MessageType`, `ModerationStatus`, `ProgressType`, `ConsultationStatus`, `AISummaryStatus`.

```bash
# Quick sanity check — count tables and enums
grep -c "export const" packages/infrastructure/database/schema/*.ts
```

- [ ] **Step 4: Update CRM client to import schema**

Modify `packages/infrastructure/database/crm-client.ts` — add schema import:
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getServerEnv } from '@medical-crm/config';
import * as schema from './schema';

let _crmDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getCrmDb() {
  if (!_crmDb) {
    const env = getServerEnv();
    const client = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _crmDb = drizzle(client, { schema });
  }
  return _crmDb;
}

export type CrmDb = ReturnType<typeof getCrmDb>;
```

- [ ] **Step 5: Create schema barrel file**

Create `packages/infrastructure/database/schema/index.ts` that re-exports everything from the generated files:
```typescript
// Re-export all drizzle-kit generated tables and enums.
// Adjust the import path below to match the generated file name(s).
// drizzle-kit typically generates a single `schema.ts` or one file per table.
export * from './schema';
```
If drizzle-kit generated multiple files (e.g., `relations.ts`), add additional `export * from './relations';` lines as needed.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @medical-crm/infrastructure typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/infrastructure/database/
git commit -m "feat: introspect CRM DB schema with drizzle-kit pull"
```

---

### Task 8: Supabase Main Client (Beauty Hospitals)

**Files:**
- Create: `packages/infrastructure/supabase-main/client.ts`
- Create: `packages/infrastructure/supabase-main/types.ts`
- Test: `packages/infrastructure/supabase-main/__tests__/client.test.ts`

- [ ] **Step 1: Write failing test**

`packages/infrastructure/supabase-main/__tests__/client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @medical-crm/config
vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    MAIN_SUPABASE_URL: 'https://test.supabase.co',
    MAIN_SUPABASE_SERVICE_KEY: 'test-service-key',
  }),
}));

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

describe('getMainSupabase', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a Supabase client with correct credentials', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { getMainSupabase } = await import('../client');

    getMainSupabase();

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-service-key',
      expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false },
      })
    );
  });

  it('returns singleton (same instance on second call)', async () => {
    const { getMainSupabase } = await import('../client');
    const a = getMainSupabase();
    const b = getMainSupabase();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @medical-crm/infrastructure test -- supabase-main
```
Expected: FAIL — cannot resolve `../client`.

- [ ] **Step 3: Implement client**

`packages/infrastructure/supabase-main/client.ts`:
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerEnv } from '@medical-crm/config';

let _client: SupabaseClient | null = null;

export function getMainSupabase(): SupabaseClient {
  if (!_client) {
    const env = getServerEnv();
    _client = createClient(env.MAIN_SUPABASE_URL, env.MAIN_SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
```

- [ ] **Step 4: Create types (complete copy from v1's `lib/mainSupabase.ts`)**

> **Source:** Copy ALL type definitions from `/Users/haowang/Desktop/medora-health-beauty/medical-crm/lib/mainSupabase.ts` (lines 60-259).
> Include every interface — do NOT omit any fields or types.

`packages/infrastructure/supabase-main/types.ts`:
```typescript
/**
 * TypeScript interfaces for the Main Supabase database tables.
 * Complete copy from v1's lib/mainSupabase.ts.
 * The Main Supabase is used for beauty hospitals (COSMETIC type).
 */

export interface SupabaseSurgeon {
  id: string;
  surgeon_id: string;
  name: string;
  title: string | null;
  experience_years: number | null;
  image_url: string | null;
  image_prompt: string | null;
  specialties: string[];
  languages: string[];
  education: string[];
  certifications: string[];
  procedures_count: Record<string, number>;
  bio: {
    intro?: string;
    expertise?: string;
    philosophy?: string;
    achievements?: string[];
  };
  images: {
    hero?: string;
    office?: string;
    surgery?: string;
  };
  translations: Record<string, {
    title?: string;
    bio?: { intro?: string; expertise?: string; philosophy?: string; achievements?: string[] };
    education?: string[];
    languages?: string[];
    specialties?: string[];
    certifications?: string[];
  }>;
  hospital_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMMetadata {
  bedCount?: number;
  patientCapacity?: number;
  multilingualStaff?: string[];
  airportServices?: string[];
  followUpCare?: string[];
  amenities?: string[];
  certifications?: Array<{
    id: string;
    name: string;
    nameEn: string;
    year?: number;
    isActive: boolean;
  }>;
  videoTestimonials?: Array<{
    id: string;
    title: string;
    thumbnailUrl: string;
    videoUrl: string;
    patientName?: string;
    procedureType?: string;
  }>;
}

export interface SupabaseHospital {
  id: string;
  slug: string;
  name: string;
  year_established: number | null;
  rating: number | null;
  review_count: number | null;
  hero_image: string | null;
  total_patients: number | null;
  recommend_rate: number | null;
  photos: string[];
  payment_methods: string[];
  highlights: Array<{ icon: string; text: string }>;
  crm_metadata: CRMMetadata | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SupabaseHospitalTranslation {
  id: string;
  hospital_id: string;
  language_code: string;
  tagline: string | null;
  description: string | null;
  highlights: Array<{ icon: string; text: string }> | null;
  nearby_attractions: Array<{ id: string; name: string; distance?: string; sort_order: number }> | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseHospitalLocation {
  id: string;
  hospital_id: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hours: string | null;
  map_embed: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseHospitalProcedure {
  id: string;
  hospital_id: string;
  procedure_id: string;
  price_range: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  is_popular: boolean;
  sort_order: number;
  created_at: string;
}

export interface SupabaseProcedure {
  id: string;
  procedure_name: string;
  name_zh?: string | null;
  slug: string;
  category_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseProcedureCase {
  id: string;
  procedure_id: string | null;
  case_number: string;
  procedure_name: string | null;
  description: string | null;
  provider_name: string | null;
  patient_age: string | null;
  patient_gender: string | null;
  image_count: number;
  sort_order: number;
  surgeon_id: string | null;
  hospital_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseCaseImage {
  id: string;
  case_id: string;
  image_type: 'before' | 'after' | 'combined';
  image_url: string;
  sort_order: number;
  created_at: string;
}

export interface SupabaseNearbyAttraction {
  id: string;
  hospital_id: string;
  name: string;
  name_zh: string | null;
  distance: string;
  sort_order: number;
  created_at: string;
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @medical-crm/infrastructure test -- supabase-main
```
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/supabase-main/
git commit -m "feat: add Main Supabase client + types (beauty hospitals)"
```

---

### Task 9: Supabase China Client (Regular Hospitals)

**Files:**
- Create: `packages/infrastructure/supabase-china/client.ts`
- Create: `packages/infrastructure/supabase-china/types.ts`
- Test: `packages/infrastructure/supabase-china/__tests__/client.test.ts`

- [ ] **Step 1: Write failing test**

`packages/infrastructure/supabase-china/__tests__/client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    CHINA_MEDICAL_SUPABASE_URL: 'https://china-test.supabase.co',
    CHINA_MEDICAL_SUPABASE_SERVICE_KEY: 'china-test-key',
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

describe('getChinaSupabase', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates client with China Medical credentials', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { getChinaSupabase } = await import('../client');

    getChinaSupabase();

    expect(createClient).toHaveBeenCalledWith(
      'https://china-test.supabase.co',
      'china-test-key',
      expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false },
      })
    );
  });

  it('returns singleton', async () => {
    const { getChinaSupabase } = await import('../client');
    expect(getChinaSupabase()).toBe(getChinaSupabase());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @medical-crm/infrastructure test -- supabase-china
```
Expected: FAIL.

- [ ] **Step 3: Implement client**

`packages/infrastructure/supabase-china/client.ts`:
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerEnv } from '@medical-crm/config';

let _client: SupabaseClient | null = null;

export function getChinaSupabase(): SupabaseClient {
  if (!_client) {
    const env = getServerEnv();
    _client = createClient(
      env.CHINA_MEDICAL_SUPABASE_URL,
      env.CHINA_MEDICAL_SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _client;
}
```

- [ ] **Step 4: Create types (mirroring v1's `chinaMedicalSupabase.ts`)**

`packages/infrastructure/supabase-china/types.ts`:
```typescript
/**
 * TypeScript interfaces for the China Medical Supabase database.
 * Mirrors v1's lib/chinaMedicalSupabase.ts types.
 * Used for regular hospitals (REGULAR type).
 */

// --- Supporting types ---

export interface GalleryImage {
  url: string;
  alt: string;
  type: 'facade' | 'interior' | 'department' | 'equipment' | 'room';
}

export interface Equipment {
  name: string;
  image_url?: string;
  description?: string;
}

export interface Certification {
  name: string;
  nameEn?: string;
  year?: number;
  isActive: boolean;
}

export interface CoreSpecialty {
  name: string;
  slug: string;
  image_url?: string;
  description: string;
  technologies: string[];
}

export interface ClinicalCapabilitiesDescription {
  icu?: string;
  emergency?: string;
  mdt?: string;
  imaging_center?: string;
  lab?: string;
  complex_case?: string;
}

// --- Main table types ---

export interface ChinaMedicalHospital {
  id: string;
  slug: string;
  city: string;
  district?: string;
  province?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  established_year?: number;
  bed_count?: number;
  patients_served_annually?: number;
  international_patients_annually?: number;
  staff_count?: number;
  hero_image_url?: string;
  gallery?: GalleryImage[];
  supported_languages?: string[];
  airport_services?: string[];
  followup_care?: string[];
  amenities?: string[];
  payment_methods?: string[];
  clinical_capabilities?: string[];
  equipment?: Equipment[];
  certifications?: Certification[];
  official_website?: string;
  wiki_link?: string;
  data_source?: string;
  credibility?: Record<string, unknown>;
  is_active: boolean;
  keycloak_user_id?: string;
  admin_email?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
}

export interface ChinaMedicalHospitalI18n {
  hospital_id: string;
  locale: string;
  name: string;
  display_name?: string;
  hospital_type?: string;
  tier?: string;
  ownership_type?: string;
  city_translated?: string;
  value_proposition?: string;
  overview?: string;
  short_description?: string;
  full_description?: string;
  core_specialties?: CoreSpecialty[];
  clinical_capabilities_description?: ClinicalCapabilitiesDescription;
  departments_info?: Record<string, unknown>[];
  facilities_info?: Record<string, unknown>;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  /** AI-translated equipment list. Array of {idx, name, description}. */
  equipment_translated?: Array<{ idx: number; name: string; description?: string }>;
  /** AI-translated video testimonial metadata. */
  video_testimonials_translated?: Array<{ id: string; procedure_name?: string; patient_country?: string }>;
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @medical-crm/infrastructure test -- supabase-china
```
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/supabase-china/
git commit -m "feat: add China Medical Supabase client + types (regular hospitals)"
```

---

### Task 10: Keycloak Auth Middleware

**Files:**
- Create: `packages/infrastructure/auth/keycloak.middleware.ts`
- Create: `packages/infrastructure/auth/index.ts`
- Test: `packages/infrastructure/auth/__tests__/keycloak.middleware.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/infrastructure/auth/__tests__/keycloak.middleware.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock jose
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}));

// Mock config
vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    KEYCLOAK_ISSUER: 'https://keycloak.test/realms/test',
    KEYCLOAK_CLIENT_ID: 'portal-web',
  }),
}));

describe('authMiddleware', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.resetModules();
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockResolvedValue({
      payload: {
        sub: 'user-123',
        email: 'test@example.com',
        realm_access: { roles: ['hospital'] },
        hospital_id: 'hospital-456',
      },
    });

    const { authMiddleware } = await import('../keycloak.middleware');
    app = new Hono();
    app.use('/*', authMiddleware);
    app.get('/test', (c) => {
      const session = c.get('session');
      return c.json(session);
    });
  });

  it('returns 401 when no Authorization header', async () => {
    const res = await app.request('/test');
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-Bearer token', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Basic abc' },
    });
    expect(res.status).toBe(401);
  });

  it('extracts session from valid JWT', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      userId: 'user-123',
      email: 'test@example.com',
      roles: ['hospital'],
      hospitalId: 'hospital-456',
    });
  });

  it('returns 401 for invalid JWT', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockRejectedValue(new Error('invalid'));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
  });
});

describe('requireRole', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('allows matching role', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockResolvedValue({
      payload: {
        sub: 'u1',
        email: 'a@b.com',
        realm_access: { roles: ['admin'] },
      },
    });

    const { authMiddleware, requireRole } = await import('../keycloak.middleware');
    const app = new Hono();
    app.use('/*', authMiddleware);
    app.use('/*', requireRole('admin'));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects non-matching role', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockResolvedValue({
      payload: {
        sub: 'u1',
        email: 'a@b.com',
        realm_access: { roles: ['hospital'] },
      },
    });

    const { authMiddleware, requireRole } = await import('../keycloak.middleware');
    const app = new Hono();
    app.use('/*', authMiddleware);
    app.use('/*', requireRole('admin'));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(403);
  });
});

describe('requireHospital', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects user without hospitalId', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockResolvedValue({
      payload: {
        sub: 'u1',
        email: 'a@b.com',
        realm_access: { roles: ['admin'] },
      },
    });

    const { authMiddleware, requireHospital } = await import('../keycloak.middleware');
    const app = new Hono();
    app.use('/*', authMiddleware);
    app.use('/*', requireHospital);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @medical-crm/infrastructure test -- keycloak
```
Expected: FAIL — cannot resolve `../keycloak.middleware`.

- [ ] **Step 3: Implement auth middleware**

`packages/infrastructure/auth/keycloak.middleware.ts`:
```typescript
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as jose from 'jose';
import { getServerEnv } from '@medical-crm/config';

let jwks: jose.JWTVerifyGetKey;

function getJWKS() {
  if (!jwks) {
    const env = getServerEnv();
    jwks = jose.createRemoteJWKSet(
      new URL(`${env.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`)
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
    const env = getServerEnv();

    try {
      const { payload } = await jose.jwtVerify(token, getJWKS(), {
        issuer: env.KEYCLOAK_ISSUER,
        audience: env.KEYCLOAK_CLIENT_ID,
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

export const requireRole = (...roles: string[]) =>
  createMiddleware(async (c, next) => {
    const session = c.get('session') as Session;
    if (!roles.some((r) => session.roles.includes(r))) {
      throw new HTTPException(403, { message: 'Insufficient permissions' });
    }
    await next();
  });

export const requireHospital = createMiddleware(async (c, next) => {
  const session = c.get('session') as Session;
  if (!session.hospitalId) {
    throw new HTTPException(403, { message: 'No hospital association' });
  }
  await next();
});
```

`packages/infrastructure/auth/index.ts`:
```typescript
export { authMiddleware, requireRole, requireHospital } from './keycloak.middleware';
export type { Session } from './keycloak.middleware';
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @medical-crm/infrastructure test -- keycloak
```
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/auth/
git commit -m "feat: add Keycloak JWT auth middleware (auth, RBAC, hospital isolation)"
```

---

*End of Chunk 2*

---

## Chunk 3: API Server + Error Handling + Composition Root

### Task 11: `apps/api` — Hono App Shell + Security Middleware

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/middleware/security.ts`
- Test: `apps/api/src/__tests__/health.test.ts`
- Test: `apps/api/src/__tests__/security.test.ts`

- [ ] **Step 1: Create `apps/api` package scaffold**

`apps/api/package.json`:
```json
{
  "name": "@medical-crm/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "hono-rate-limiter": "^0.4.0",
    "@medical-crm/config": "workspace:*",
    "@medical-crm/infrastructure": "workspace:*",
    "@medical-crm/utils": "workspace:*",
    "@medical-crm/validation": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

`apps/api/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 2: Write failing health check test**

`apps/api/src/__tests__/health.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('2.0.0');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm install
pnpm --filter @medical-crm/api test -- health
```
Expected: FAIL — `../index` does not exist.

- [ ] **Step 4: Implement security middleware**

`apps/api/src/middleware/security.ts`:
```typescript
import type { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { rateLimiter } from 'hono-rate-limiter';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { logger } from 'hono/logger';

/**
 * Extract client IP from proxy headers.
 * In single-proxy setups (ALB/nginx), the leftmost IP in x-forwarded-for
 * is the real client IP. For multi-proxy chains, upgrade to a proper
 * trusted-proxy library before production.
 */
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }
  return c.req.header('x-real-ip') ?? 'unknown';
}

export function applySecurityMiddleware(app: Hono) {
  // 1. Request ID for tracing
  app.use('*', requestId());

  // 2. Structured logging
  app.use('*', logger());

  // 3. CORS — strict whitelist from env
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

  // 4. Security headers (CSP intentionally omitted — this is a JSON API server)
  app.use('*', secureHeaders({
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
  }));

  // 5. Global rate limit: 100 req/min per IP
  app.use('*', rateLimiter({
    windowMs: 60_000,
    limit: 100,
    keyGenerator: getClientIp,
    standardHeaders: 'draft-7',
  }));

  // 6. Stricter rate limit for auth endpoints: 5 per 5 min
  app.use('/auth/*', rateLimiter({
    windowMs: 300_000,
    limit: 5,
    keyGenerator: getClientIp,
  }));

  // 7. Body size limit (10MB default, overridden per route for file uploads)
  app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 }));
}

/** Per-user rate limiter — applied AFTER auth middleware on authenticated routes. */
export const perUserRateLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 200,
  keyGenerator: (c) => {
    const session = c.get('session') as { userId?: string } | undefined;
    return session?.userId ?? 'anonymous';
  },
});
```

- [ ] **Step 5: Implement Hono app shell**

`apps/api/src/index.ts`:
```typescript
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DomainError, mapErrorToStatus } from '@medical-crm/utils';
import { applySecurityMiddleware, perUserRateLimiter } from './middleware/security';
import { authMiddleware } from '@medical-crm/infrastructure/auth';

const app = new Hono();

// Apply security middleware stack (runs before auth)
applySecurityMiddleware(app);

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', version: '2.0.0' }));

// All /api/v2/* routes require auth + per-user rate limiting
app.use('/api/v2/*', authMiddleware, perUserRateLimiter);

// Route registration (Phase 2 — use cases and route handlers)
// app.route('/api/v2/admin', adminRoutes);
// app.route('/api/v2/hospital', hospitalRoutes);

// Global error handler — maps domain errors and HTTP exceptions to proper responses
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof DomainError) {
    const status = mapErrorToStatus(err.code);
    return c.json({ error: err.message, code: err.code }, status as any);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
```

- [ ] **Step 6: Run health check test**

```bash
pnpm --filter @medical-crm/api test -- health
```
Expected: PASS — health endpoint returns `{ status: 'ok', version: '2.0.0' }`.

- [ ] **Step 7: Write security middleware integration tests**

`apps/api/src/__tests__/security.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Security middleware', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns security headers', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/health');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects CORS from unknown origin', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/health', {
      headers: { Origin: 'https://evil.com' },
    });
    // CORS middleware does not add Access-Control-Allow-Origin for unknown origins
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('accepts CORS from allowed origin', async () => {
    process.env.ADMIN_ORIGIN = 'http://localhost:3002';
    process.env.HOSPITAL_ORIGIN = 'http://localhost:3003';

    // Re-import to pick up env changes
    const { Hono } = await import('hono');
    const { applySecurityMiddleware } = await import('../middleware/security');
    const testApp = new Hono();
    applySecurityMiddleware(testApp);
    testApp.get('/health', (c) => c.json({ ok: true }));

    const res = await testApp.request('/health', {
      headers: { Origin: 'http://localhost:3002' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3002');
  });

  it('includes request-id header', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/health');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('returns 404 for unknown routes', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 8: Run all API tests**

```bash
pnpm --filter @medical-crm/api test
```
Expected: All 6 tests PASS (1 health + 5 security).

- [ ] **Step 9: Commit**

```bash
git add apps/api/
git commit -m "feat: add Hono API server with security middleware stack"
```

---

### Task 12: Domain Error Types + Error Handling Contract

> **Phase 1 deviation:** The spec places `DomainError` classes in `packages/domain/shared/errors.ts`,
> but the domain package does not exist yet in Phase 1. We temporarily place them in `@medical-crm/utils`
> so the API error handler can use them immediately. In Phase 2, when the domain package is created,
> relocate `DomainError` subclasses there and re-export from utils for backward compatibility.
> `mapErrorToStatus` stays in utils permanently (it is an API/HTTP concern, not domain).

**Files:**
- Create: `packages/shared/utils/src/errors.ts`
- Modify: `packages/shared/utils/src/index.ts` (add error exports)
- Test: `packages/shared/utils/src/__tests__/errors.test.ts`

- [ ] **Step 1: Write failing error type tests**

`packages/shared/utils/src/__tests__/errors.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  DomainError,
  mapErrorToStatus,
} from '../errors';

describe('DomainError subclasses', () => {
  it('NotFoundError has correct code and is DomainError', () => {
    const err = new NotFoundError('Hospital not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Hospital not found');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('ConflictError has correct code', () => {
    const err = new ConflictError('Already exists');
    expect(err.code).toBe('CONFLICT');
  });

  it('ValidationError has correct code and details', () => {
    const details = [{ field: 'name', message: 'required' }];
    const err = new ValidationError('Invalid input', details);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.details).toEqual(details);
  });

  it('ForbiddenError has correct code', () => {
    const err = new ForbiddenError('Not allowed');
    expect(err.code).toBe('FORBIDDEN');
  });
});

describe('mapErrorToStatus', () => {
  it('maps NOT_FOUND to 404', () => {
    expect(mapErrorToStatus('NOT_FOUND')).toBe(404);
  });

  it('maps VALIDATION_FAILED to 422', () => {
    expect(mapErrorToStatus('VALIDATION_FAILED')).toBe(422);
  });

  it('maps CONFLICT to 409', () => {
    expect(mapErrorToStatus('CONFLICT')).toBe(409);
  });

  it('maps FORBIDDEN to 403', () => {
    expect(mapErrorToStatus('FORBIDDEN')).toBe(403);
  });

  it('maps unknown code to 500', () => {
    expect(mapErrorToStatus('UNKNOWN')).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @medical-crm/utils test -- errors
```
Expected: FAIL — `../errors` does not exist.

- [ ] **Step 3: Implement domain errors and status mapping**

`packages/shared/utils/src/errors.ts`:
```typescript
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT' as const;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN' as const;
}

/** Map domain error codes to HTTP status codes. */
const ERROR_STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  FORBIDDEN: 403,
};

export function mapErrorToStatus(code: string): number {
  return ERROR_STATUS_MAP[code] ?? 500;
}
```

- [ ] **Step 4: Add exports to index.ts**

Append to `packages/shared/utils/src/index.ts`:
```typescript
export {
  DomainError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  mapErrorToStatus,
} from './errors';
```

- [ ] **Step 5: Run errors tests**

```bash
pnpm --filter @medical-crm/utils test -- errors
```
Expected: All 9 tests PASS (4 DomainError + 5 mapErrorToStatus).

- [ ] **Step 6: Run full utils test suite to check no regressions**

```bash
pnpm --filter @medical-crm/utils test
```
Expected: All 33 tests PASS (9 result+pagination + 15 sanitize + 9 errors).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/utils/src/errors.ts packages/shared/utils/src/__tests__/errors.test.ts packages/shared/utils/src/index.ts
git commit -m "feat: add domain error types and HTTP status mapping"
```

---

### Task 13: Composition Root (Skeleton)

**Files:**
- Create: `apps/api/src/composition-root.ts`
- Test: `apps/api/src/__tests__/composition-root.test.ts`

The composition root wires infrastructure adapters to use cases. In Phase 1 we create the skeleton with just the database and Supabase clients wired. Full use-case wiring happens in Phase 2.

- [ ] **Step 1: Write smoke test**

`apps/api/src/__tests__/composition-root.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all infrastructure modules so we don't need real DB/Supabase connections
vi.mock('@medical-crm/infrastructure/database', () => ({
  getCrmDb: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/supabase-main', () => ({
  getMainSupabase: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/supabase-china', () => ({
  getChinaSupabase: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/config', () => ({
  getServerEnv: vi.fn(() => ({
    DATABASE_URL: 'postgresql://localhost/test',
    MAIN_SUPABASE_URL: 'https://main.supabase.co',
    MAIN_SUPABASE_SERVICE_KEY: 'key',
    CHINA_MEDICAL_SUPABASE_URL: 'https://china.supabase.co',
    CHINA_MEDICAL_SUPABASE_SERVICE_KEY: 'key',
  })),
}));

describe('composition root', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates infrastructure clients without throwing', async () => {
    const { getInfrastructure } = await import('../composition-root');
    expect(() => getInfrastructure()).not.toThrow();
  });

  it('returns all expected clients', async () => {
    const { getInfrastructure } = await import('../composition-root');
    const infra = getInfrastructure();
    expect(infra).toHaveProperty('crmDb');
    expect(infra).toHaveProperty('mainSupabase');
    expect(infra).toHaveProperty('chinaSupabase');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @medical-crm/api test -- composition-root
```
Expected: FAIL — `../composition-root` does not exist.

- [ ] **Step 3: Implement composition root skeleton**

`apps/api/src/composition-root.ts`:
```typescript
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { getMainSupabase } from '@medical-crm/infrastructure/supabase-main';
import { getChinaSupabase } from '@medical-crm/infrastructure/supabase-china';

interface Infrastructure {
  crmDb: ReturnType<typeof getCrmDb>;
  mainSupabase: ReturnType<typeof getMainSupabase>;
  chinaSupabase: ReturnType<typeof getChinaSupabase>;
}

let _infra: Infrastructure | null = null;

/** Wire all infrastructure adapters. Lazy singleton — created on first call. */
export function getInfrastructure(): Infrastructure {
  if (!_infra) {
    _infra = {
      crmDb: getCrmDb(),
      mainSupabase: getMainSupabase(),
      chinaSupabase: getChinaSupabase(),
    };
  }
  return _infra;
}

// Phase 2: Add use-case factories here
// export function createUseCases(overrides?: Partial<Repositories>) { ... }
```

- [ ] **Step 4: Run composition root test**

```bash
pnpm --filter @medical-crm/api test -- composition-root
```
Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/composition-root.ts apps/api/src/__tests__/composition-root.test.ts
git commit -m "feat: add composition root skeleton (infrastructure wiring)"
```

---

### Task 14: API Error Handler Integration Test

**Files:**
- Test: `apps/api/src/__tests__/error-handler.test.ts`

Verify the global error handler maps domain errors and HTTPExceptions correctly.

- [ ] **Step 1: Write error handler tests**

`apps/api/src/__tests__/error-handler.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DomainError, NotFoundError, ForbiddenError, mapErrorToStatus } from '@medical-crm/utils';

/** Create a test Hono app with the same error handler pattern as index.ts */
function createTestApp() {
  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    if (err instanceof DomainError) {
      const status = mapErrorToStatus(err.code);
      return c.json({ error: err.message, code: err.code }, status as any);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });
  return app;
}

describe('Global error handler', () => {
  it('maps HTTPException to correct status', async () => {
    const app = createTestApp();
    app.get('/throw-http', () => {
      throw new HTTPException(422, { message: 'Invalid data' });
    });

    const res = await app.request('/throw-http');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('Invalid data');
  });

  it('maps NotFoundError to 404', async () => {
    const app = createTestApp();
    app.get('/throw-notfound', () => {
      throw new NotFoundError('Hospital not found');
    });

    const res = await app.request('/throw-notfound');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Hospital not found');
    expect(body.code).toBe('NOT_FOUND');
  });

  it('maps ForbiddenError to 403', async () => {
    const app = createTestApp();
    app.get('/throw-forbidden', () => {
      throw new ForbiddenError('Not allowed');
    });

    const res = await app.request('/throw-forbidden');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('maps unhandled error to 500', async () => {
    const app = createTestApp();
    app.get('/throw-generic', () => {
      throw new Error('Something broke');
    });

    const res = await app.request('/throw-generic');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('mapErrorToStatus utility works end-to-end', () => {
    expect(mapErrorToStatus('NOT_FOUND')).toBe(404);
    expect(mapErrorToStatus('FORBIDDEN')).toBe(403);
    expect(mapErrorToStatus('SOMETHING_ELSE')).toBe(500);
  });
});
```

- [ ] **Step 2: Run error handler tests**

```bash
pnpm --filter @medical-crm/api test -- error-handler
```
Expected: All 5 tests PASS.

- [ ] **Step 3: Run full API test suite**

```bash
pnpm --filter @medical-crm/api test
```
Expected: All 13 tests PASS (1 health + 5 security + 2 composition-root + 5 error-handler).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/__tests__/error-handler.test.ts
git commit -m "test: add error handler integration tests"
```

---

*End of Chunk 3*

---

## Chunk 4: Frontend Shells, Shared UI, i18n, ESLint Boundaries + CI

### Task 15: `@medical-crm/i18n` — Translation Files

**Files:**
- Create: `packages/shared/i18n/package.json`
- Create: `packages/shared/i18n/tsconfig.json`
- Create: `packages/shared/i18n/vitest.config.ts`
- Create: `packages/shared/i18n/src/index.ts`
- Create: `packages/shared/i18n/src/locales/en.json`
- Create: `packages/shared/i18n/src/locales/zh.json`
- Create: `packages/shared/i18n/src/locales/fr.json`
- Create: `packages/shared/i18n/src/locales/de.json`
- Create: `packages/shared/i18n/src/locales/es.json`
- Create: `packages/shared/i18n/src/locales/bn.json`
- Test: `packages/shared/i18n/src/__tests__/i18n.test.ts`

v1 translations live at `/Users/haowang/Desktop/medora-health-beauty/medical-crm/messages/{en,zh,fr,de,es,bn}.json`. Copy them into the i18n package.

> **Note:** The spec envisions 10 locales, but v1 only ships 6 (en, zh, fr, de, es, bn). Phase 1 migrates the existing 6. Additional locales (ar, ja, ko, th) will be added in a future phase when translations are ready.

- [ ] **Step 1: Create i18n package scaffold**

`packages/shared/i18n/package.json`:
```json
{
  "name": "@medical-crm/i18n",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./locales/*": "./src/locales/*"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/shared/i18n/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

`packages/shared/i18n/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 2: Copy locale files from v1**

```bash
mkdir -p /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/i18n/src/locales
cp /Users/haowang/Desktop/medora-health-beauty/medical-crm/messages/{en,zh,fr,de,es,bn}.json \
   /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/i18n/src/locales/
```

- [ ] **Step 3: Write failing test**

`packages/shared/i18n/src/__tests__/i18n.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, loadMessages, interpolate } from '../index';

describe('i18n', () => {
  it('exports supported locales', () => {
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(SUPPORTED_LOCALES).toContain('zh');
    expect(SUPPORTED_LOCALES).toHaveLength(6);
  });

  it('default locale is zh', () => {
    expect(DEFAULT_LOCALE).toBe('zh');
  });

  it('loads en messages', async () => {
    const messages = await loadMessages('en');
    expect(messages).toBeDefined();
    expect(typeof messages).toBe('object');
  });

  it('loads zh messages', async () => {
    const messages = await loadMessages('zh');
    expect(messages).toBeDefined();
  });
});

describe('interpolate', () => {
  it('replaces placeholders', () => {
    expect(interpolate('Hello {name}!', { name: 'World' })).toBe('Hello World!');
  });

  it('replaces numeric placeholders', () => {
    expect(interpolate('Count: {n}', { n: 42 })).toBe('Count: 42');
  });

  it('leaves unreplaced placeholders', () => {
    expect(interpolate('Hello {name}!', {})).toBe('Hello {name}!');
  });

  it('returns template when no values', () => {
    expect(interpolate('Hello World!')).toBe('Hello World!');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm --filter @medical-crm/i18n test
```
Expected: FAIL — `../index` module has no exports (index.ts doesn't exist yet).

- [ ] **Step 5: Implement i18n index**

`packages/shared/i18n/src/index.ts`:
```typescript
export const SUPPORTED_LOCALES = ['en', 'zh', 'fr', 'de', 'es', 'bn'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh';

/** Load messages for a given locale. Returns flat key-value object. */
export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const mod = await import(`./locales/${locale}.json`);
  return mod.default;
}

/**
 * Simple interpolation: replace {placeholder} with provided values.
 * Matches v1 behavior from lib/i18n-client.tsx.
 */
export function interpolate(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm install
pnpm --filter @medical-crm/i18n test
```
Expected: All 8 tests PASS (4 i18n + 4 interpolate).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/i18n/
git commit -m "feat: add @medical-crm/i18n with 6 locale files migrated from v1"
```

---

### Task 16: `@medical-crm/ui` — shadcn/ui Component Library Scaffold

**Files:**
- Create: `packages/shared/ui/package.json`
- Create: `packages/shared/ui/tsconfig.json`
- Create: `packages/shared/ui/src/cn.ts`
- Create: `packages/shared/ui/src/button.tsx` (one seed component)
- Create: `packages/shared/ui/src/index.ts`

This is a scaffold only — components will be populated as needed in Phase 2+. We seed one Button component to verify the setup works.

- [ ] **Step 1: Create ui package scaffold**

`packages/shared/ui/package.json`:
```json
{
  "name": "@medical-crm/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*.tsx"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@types/react": "^19.0.0"
  }
}
```

`packages/shared/ui/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Create utility and seed component**

`packages/shared/ui/src/cn.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`packages/shared/ui/src/button.tsx`:
```typescript
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
```

`packages/shared/ui/src/index.ts`:
```typescript
export { cn } from './cn';
export { Button, buttonVariants, type ButtonProps } from './button';
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm install
pnpm --filter @medical-crm/ui typecheck
```
Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/ui/
git commit -m "feat: add @medical-crm/ui scaffold with Button component (shadcn/ui)"
```

---

### Task 17: `apps/admin` — Next.js Admin Shell + BFF Auth

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/vitest.config.ts`
- Create: `apps/admin/next.config.ts`
- Create: `apps/admin/src/app/layout.tsx`
- Create: `apps/admin/src/app/page.tsx`
- Create: `apps/admin/src/app/auth/login/route.ts`
- Create: `apps/admin/src/app/auth/callback/route.ts`
- Create: `apps/admin/src/app/auth/logout/route.ts`
- Create: `apps/admin/src/lib/session.ts`
- Create: `apps/admin/src/lib/api-client.ts`
- Create: `apps/admin/src/middleware.ts`
- Test: `apps/admin/src/__tests__/session.test.ts`

- [ ] **Step 1: Create admin package scaffold**

`apps/admin/package.json`:
```json
{
  "name": "@medical-crm/admin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3002",
    "build": "next build",
    "start": "next start --port 3002",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "iron-session": "^8.0.0",
    "@medical-crm/config": "workspace:*",
    "@medical-crm/ui": "workspace:*",
    "@medical-crm/i18n": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/react": "^19.0.0",
    "vitest": "^3.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0"
  }
}
```

`apps/admin/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["src/**/*", "next-env.d.ts", ".next/types/**/*.ts"]
}
```

`apps/admin/next.config.ts`:
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@medical-crm/ui', '@medical-crm/i18n', '@medical-crm/config'],
};

export default nextConfig;
```

- [ ] **Step 2: Create session utility (iron-session)**

> **Spec deviation:** `SessionData` adds `id_token` (needed for Keycloak single sign-out via `id_token_hint`) and `code_verifier` (temporary, needed for PKCE flow). The spec's `SessionCookie` interface should be updated to match.

`apps/admin/src/lib/session.ts`:
```typescript
import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_at: number;
  /** PKCE code_verifier — stored during login, consumed during callback */
  code_verifier?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'medical-crm-admin-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function clearSession() {
  const session = await getSession();
  session.destroy();
}
```

- [ ] **Step 3: Create API client (BFF proxy)**

`apps/admin/src/lib/api-client.ts`:
```typescript
import { redirect } from 'next/navigation';
import { getSession } from './session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function apiClient(path: string, init?: RequestInit) {
  const session = await getSession();

  if (!session.access_token) {
    redirect('/auth/login');
  }

  // Check token expiry — refresh if within 60s
  if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
    const refreshed = await refreshToken(session.refresh_token);
    if (!refreshed) {
      session.destroy();
      redirect('/auth/login');
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

async function refreshToken(refreshToken: string) {
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
          refresh_token: refreshToken,
        }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      access_token: data.access_token as string,
      refresh_token: data.refresh_token as string,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in as number),
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Create auth route handlers**

`apps/admin/src/app/auth/login/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import crypto from 'node:crypto';

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

export async function GET() {
  const { verifier, challenge } = generatePKCE();

  // Store code_verifier in session for callback to use
  const session = await getSession();
  session.code_verifier = verifier;
  await session.save();

  const params = new URLSearchParams({
    client_id: process.env.KEYCLOAK_CLIENT_ID!,
    redirect_uri: `${process.env.ADMIN_ORIGIN}/auth/callback`,
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return NextResponse.redirect(
    `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/auth?${params}`,
  );
}
```

`apps/admin/src/app/auth/callback/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Retrieve PKCE code_verifier from session
  const session = await getSession();
  const codeVerifier = session.code_verifier;
  if (!codeVerifier) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Exchange authorization code for tokens (PKCE: include code_verifier)
  const tokenRes = await fetch(
    `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        code,
        code_verifier: codeVerifier,
        redirect_uri: `${process.env.ADMIN_ORIGIN}/auth/callback`,
      }),
    },
  );

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const data = await tokenRes.json();
  session.access_token = data.access_token;
  session.refresh_token = data.refresh_token;
  session.id_token = data.id_token;
  session.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
  delete session.code_verifier; // consumed
  await session.save();

  return NextResponse.redirect(new URL('/', request.url));
}
```

`apps/admin/src/app/auth/logout/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { clearSession, getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  const idToken = session.id_token;
  await clearSession();

  // Redirect to Keycloak end-session endpoint with id_token_hint for single sign-out
  const params = new URLSearchParams({
    client_id: process.env.KEYCLOAK_CLIENT_ID!,
    post_logout_redirect_uri: process.env.ADMIN_ORIGIN!,
    ...(idToken ? { id_token_hint: idToken } : {}),
  });

  return NextResponse.redirect(
    `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout?${params}`,
  );
}
```

- [ ] **Step 5: Create Next.js middleware (edge auth guard)**

`apps/admin/src/middleware.ts`:
```typescript
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check for session cookie — if absent, redirect to login.
  // We do NOT verify the JWT here (too slow at edge) — the Hono API does that.
  const sessionCookie = request.cookies.get('medical-crm-admin-session');

  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except auth, public assets, and Next.js internals
    '/((?!auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

- [ ] **Step 6: Create minimal app layout and page**

`apps/admin/src/app/layout.tsx`:
```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Medical CRM — Admin Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`apps/admin/src/app/page.tsx`:
```typescript
export default function AdminDashboard() {
  return (
    <main>
      <h1>Admin Dashboard</h1>
      <p>Medical CRM v2 — Admin Portal shell. Phase 2 will add content.</p>
    </main>
  );
}
```

- [ ] **Step 7: Write session utility test**

`apps/admin/src/__tests__/session.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock iron-session
vi.mock('iron-session', () => ({
  getIronSession: vi.fn(() =>
    Promise.resolve({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      id_token: 'test-id-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      save: vi.fn(),
      destroy: vi.fn(),
    }),
  ),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(new Map())),
}));

describe('admin session', () => {
  it('getSession returns session data', async () => {
    const { getSession } = await import('../lib/session');
    const session = await getSession();
    expect(session.access_token).toBe('test-token');
    expect(session.id_token).toBe('test-id-token');
  });
});
```

`apps/admin/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 8: Run admin tests**

```bash
pnpm install
pnpm --filter @medical-crm/admin test
```
Expected: All 1 test PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/
git commit -m "feat: add Next.js admin shell with Keycloak BFF auth flow"
```

---

### Task 18: `apps/hospital` — Next.js Hospital Shell + BFF Auth

**Files:**
- Create: `apps/hospital/package.json`
- Create: `apps/hospital/tsconfig.json`
- Create: `apps/hospital/vitest.config.ts`
- Create: `apps/hospital/next.config.ts`
- Create: `apps/hospital/src/app/layout.tsx`
- Create: `apps/hospital/src/app/page.tsx`
- Create: `apps/hospital/src/app/auth/login/route.ts`
- Create: `apps/hospital/src/app/auth/callback/route.ts`
- Create: `apps/hospital/src/app/auth/logout/route.ts`
- Create: `apps/hospital/src/lib/session.ts`
- Create: `apps/hospital/src/lib/api-client.ts`
- Create: `apps/hospital/src/middleware.ts`
- Test: `apps/hospital/src/__tests__/session.test.ts`

The hospital app follows the same BFF pattern as admin. The only differences:
- Port: `3003` (admin is `3002`)
- Cookie name: `medical-crm-hospital-session`
- Redirect origin: `HOSPITAL_ORIGIN`

- [ ] **Step 1: Create hospital package — copy from admin and adjust**

Repeat the same structure as Task 17 with these differences:

`apps/hospital/package.json`:
```json
{
  "name": "@medical-crm/hospital",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3003",
    "build": "next build",
    "start": "next start --port 3003",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "iron-session": "^8.0.0",
    "@medical-crm/config": "workspace:*",
    "@medical-crm/ui": "workspace:*",
    "@medical-crm/i18n": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/react": "^19.0.0",
    "vitest": "^3.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0"
  }
}
```

Key differences in `session.ts`:
```typescript
// cookieName: 'medical-crm-hospital-session' (not admin)
```

Key differences in auth routes:
```typescript
// redirect_uri uses HOSPITAL_ORIGIN (not ADMIN_ORIGIN)
// post_logout_redirect_uri uses HOSPITAL_ORIGIN
```

Key differences in `middleware.ts`:
```typescript
// Checks for cookie 'medical-crm-hospital-session'
```

`apps/hospital/src/app/page.tsx`:
```typescript
export default function HospitalDashboard() {
  return (
    <main>
      <h1>Hospital Dashboard</h1>
      <p>Medical CRM v2 — Hospital Portal shell. Phase 2 will add content.</p>
    </main>
  );
}
```

`apps/hospital/src/app/layout.tsx`:
```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Medical CRM — Hospital Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Copy the following files from `apps/admin/` into `apps/hospital/`, applying the search-and-replace listed below:

**Files to copy (unchanged except search-and-replace):**
- `src/lib/session.ts` — session utility (cookieName changes)
- `src/lib/api-client.ts` — BFF proxy (no changes needed unless origin differs)
- `src/app/auth/login/route.ts` — PKCE login flow (origin changes)
- `src/app/auth/callback/route.ts` — PKCE callback (origin changes)
- `src/app/auth/logout/route.ts` — id_token logout (origin changes)
- `src/middleware.ts` — edge auth guard (cookie name changes)
- `tsconfig.json` — copy unchanged
- `next.config.ts` — copy unchanged
- `vitest.config.ts` — copy unchanged (same ESM `__dirname` fix)

**Search-and-replace:**
- `medical-crm-admin-session` → `medical-crm-hospital-session`
- `ADMIN_ORIGIN` → `HOSPITAL_ORIGIN`
- `3002` → `3003`
- `Admin` → `Hospital`

- [ ] **Step 2: Write session test (copied from admin with adjusted cookie name)**

`apps/hospital/src/__tests__/session.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(() =>
    Promise.resolve({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      id_token: 'test-id-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      save: vi.fn(),
      destroy: vi.fn(),
    }),
  ),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(new Map())),
}));

describe('hospital session', () => {
  it('getSession returns session data', async () => {
    const { getSession } = await import('../lib/session');
    const session = await getSession();
    expect(session.access_token).toBe('test-token');
    expect(session.id_token).toBe('test-id-token');
  });
});
```

- [ ] **Step 3: Run hospital tests**

```bash
pnpm install
pnpm --filter @medical-crm/hospital test
```
Expected: 1 test PASS.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @medical-crm/hospital typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hospital/
git commit -m "feat: add Next.js hospital shell with Keycloak BFF auth flow"
```

---

### Task 19: ESLint Dependency Boundary Rules

**Files:**
- Modify: `eslint.config.js` (root, add no-restricted-imports rules)

This enforces the Clean Architecture dependency rules from the spec (Section 4).

- [ ] **Step 1: Add dependency boundary rules to root ESLint config**

Replace the root `eslint.config.js` content with:

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**'],
  },
  // Domain layer: ZERO external imports (only domain/shared allowed)
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['hono', 'hono/*'], message: 'Domain must not depend on Hono.' },
          { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Domain must not depend on Drizzle.' },
          { group: ['@supabase/*'], message: 'Domain must not depend on Supabase.' },
          { group: ['next', 'next/*'], message: 'Domain must not depend on Next.js.' },
          { group: ['react', 'react-dom'], message: 'Domain must not depend on React.' },
          { group: ['@medical-crm/infrastructure', '@medical-crm/infrastructure/*'], message: 'Domain must not depend on infrastructure.' },
          { group: ['@medical-crm/application', '@medical-crm/application/*'], message: 'Domain must not depend on application layer.' },
        ],
      }],
    },
  },
  // Application layer: may not import infrastructure or framework libraries
  {
    files: ['packages/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@medical-crm/infrastructure', '@medical-crm/infrastructure/*'], message: 'Application layer must not import infrastructure directly. Use dependency injection via ports.' },
          { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Application must not depend on Drizzle.' },
          { group: ['@supabase/*'], message: 'Application must not depend on Supabase.' },
          { group: ['hono', 'hono/*'], message: 'Application must not depend on Hono.' },
          { group: ['next', 'next/*'], message: 'Application must not depend on Next.js.' },
          { group: ['react', 'react-dom'], message: 'Application must not depend on React.' },
        ],
      }],
    },
  },
  // Infrastructure layer: may not import application layer or apps
  {
    files: ['packages/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@medical-crm/application', '@medical-crm/application/*'], message: 'Infrastructure must not depend on application layer.' },
          { group: ['@medical-crm/admin', '@medical-crm/hospital'], message: 'Infrastructure must not depend on apps.' },
        ],
      }],
    },
  },
  // Shared layer: imports nothing from other layers
  {
    files: ['packages/shared/**/*.ts', 'packages/shared/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@medical-crm/domain', '@medical-crm/domain/*'], message: 'Shared must not depend on domain.' },
          { group: ['@medical-crm/application', '@medical-crm/application/*'], message: 'Shared must not depend on application.' },
          { group: ['@medical-crm/infrastructure', '@medical-crm/infrastructure/*'], message: 'Shared must not depend on infrastructure.' },
        ],
      }],
    },
  },
);
```

- [ ] **Step 2: Verify lint passes**

```bash
pnpm run lint
```
Expected: PASS — no violations in current code (no domain/application packages yet, but rules are ready).

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: add ESLint dependency boundary rules for Clean Architecture"
```

---

### Task 20: Turbo CI Pipeline + Full Build Verification

**Files:**
- Modify: `turbo.json` (ensure build pipeline is complete)
- Verify: full `turbo build`, `turbo test`, `turbo typecheck`, `turbo lint`

- [ ] **Step 1: Verify Turbo pipeline runs end-to-end**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm turbo build
```
Expected: All packages build successfully.

```bash
pnpm turbo test
```
Expected: All tests across all packages pass.

```bash
pnpm turbo typecheck
```
Expected: No type errors.

```bash
pnpm turbo lint
```
Expected: No lint violations.

- [ ] **Step 2: Fix any issues discovered during full pipeline run**

If any package fails, fix the issue before proceeding.

- [ ] **Step 3: Final commit (only if pipeline fixes were needed)**

```bash
git status
# Only stage specific files that were fixed during pipeline verification
# git add <specific-files>
# git commit -m "chore: fix issues discovered during full CI pipeline verification"
```

- [ ] **Step 4: Summary of what was built**

At this point, Phase 1 delivers:

| Package | Description | Tests |
|---------|------------|-------|
| `@medical-crm/config` | Zod-validated env | 7 |
| `@medical-crm/utils` | Result, pagination, sanitize, errors | 33 |
| `@medical-crm/validation` | Hospital, case, message schemas | 18 |
| `@medical-crm/i18n` | 6 locales, interpolation | 8 |
| `@medical-crm/ui` | shadcn/ui scaffold (Button) | — |
| `@medical-crm/infrastructure` | DB + 2 Supabase + Keycloak auth | 11 |
| `@medical-crm/api` | Hono server + security + error handling | 13 |
| `@medical-crm/admin` | Next.js admin shell + BFF auth | 1 |
| `@medical-crm/hospital` | Next.js hospital shell + BFF auth | 1 |

---

*End of Chunk 4*
