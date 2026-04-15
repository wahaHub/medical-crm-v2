# Medical CRM v2 Local Setup

This is the setup path that gets a fresh machine to a working local CRM stack.

What you should end up with:

- admin portal on `http://localhost:3002`
- hospital portal on `http://localhost:3003`
- API on `http://localhost:3001`

## 1. Machine prerequisites

- Node.js `20.x`
- `corepack` enabled so the repo uses `pnpm@9.15.4`
- PostgreSQL `15+`
- `psql` CLI
- reachable dev or staging credentials for:
  - PostgreSQL
  - Keycloak
  - Main Supabase
  - China Medical Supabase
  - CRM storage Supabase
  - R2
  - AWS S3
  - OpenAI

Notes:

- Dify, Resend, SMTP, Turnstile, and BabelDOC are feature-specific. They are not needed for the most basic page boot, but they are still referenced by parts of the codebase. Keep the variables in `.env`, even if you only fill the ones your flow touches.
- The API app reads `apps/api/.env`.
- The Next.js apps read the repo-root `.env`.
- The current working convention is to keep one root `.env` and symlink `apps/api/.env` to it.

## 2. Install dependencies

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

## 3. Create environment files

```bash
cp .env.example .env
ln -sf ../../.env apps/api/.env
```

Then replace the placeholder values in `.env`.

Minimum variables that must be real before day-to-day development:

- `DATABASE_URL`
- `DIRECT_URL`
- `MAIN_SUPABASE_URL`
- `MAIN_SUPABASE_SERVICE_KEY`
- `MAIN_SUPABASE_ANON_KEY`
- `CHINA_MEDICAL_SUPABASE_URL`
- `CHINA_MEDICAL_SUPABASE_SERVICE_KEY`
- `CRM_SUPABASE_URL`
- `CRM_SUPABASE_SERVICE_ROLE_KEY`
- `KEYCLOAK_BASE_URL`
- `KEYCLOAK_ISSUER`
- `KEYCLOAK_REALM`
- `KEYCLOAK_CLIENT_ID`
- `KEYCLOAK_CLIENT_SECRET`
- `KEYCLOAK_ADMIN_USERNAME`
- `KEYCLOAK_ADMIN_PASSWORD`
- `SESSION_SECRET`
- `PATIENT_JWT_SECRET`
- `INTERNAL_API_SECRET`
- `OPENAI_API_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_MATERIALS_BEAUTY_BUCKET_NAME`
- `R2_MATERIALS_BEAUTY_PUBLIC_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

## 4. Bootstrap the database

There are two supported ways.

### Option A, fastest: import the full SQL snapshot

This repo now includes a generated full schema bootstrap file:

- `packages/infrastructure/database/full-bootstrap.sql`

Generate or refresh it:

```bash
pnpm db:export:full
```

Then import it into the database pointed to by `DATABASE_URL`:

```bash
set -a
source .env
set +a
psql "$DATABASE_URL" -f packages/infrastructure/database/full-bootstrap.sql
```

What this file contains:

- the base schema snapshot
- every SQL migration currently in `packages/infrastructure/database/migrations`
- a compatibility shim for `auth.uid()` so plain PostgreSQL can import it
- `_migrations` rows for all current migration files, so future `pnpm db:migrate` runs stay incremental

What it does not contain:

- business data
- seed data
- Supabase buckets, auth users, or Keycloak realm configuration

### Option B, incremental: run the migration runner

```bash
pnpm db:migrate
```

Use this when you want to reproduce the same path as the normal app migration runner.

## 5. Start the stack

Start everything:

```bash
pnpm dev
```

Or start services one by one:

```bash
pnpm --filter @medical-crm/api dev
pnpm --filter @medical-crm/admin dev
pnpm --filter @medical-crm/hospital dev
```

Default ports from the repo:

- API: `3001`
- Admin: `3002`
- Hospital: `3003`

## 6. Smoke check

After startup:

```bash
curl http://localhost:3001/health
```

Then open:

- `http://localhost:3002`
- `http://localhost:3003`

## 7. Common gotchas

- If admin and hospital start but API fails immediately, check whether `apps/api/.env` still points to `../../.env`.
- If SQL import fails on `gen_random_uuid()`, your database is missing `pgcrypto`. The generated `full-bootstrap.sql` now creates it automatically.
- If SQL import fails on `auth.uid()`, use the generated `full-bootstrap.sql` instead of the raw Drizzle snapshot. The generated file adds a local compatibility shim.
- If login redirects break, confirm `ADMIN_ORIGIN`, `HOSPITAL_ORIGIN`, `API_URL`, `KEYCLOAK_ISSUER`, and the `NEXT_PUBLIC_KEYCLOAK_*` variables all match the local ports and realm you are actually using.

## 8. Useful commands

```bash
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm db:export:full
```
