# CRM v2 Deploy Automation and Admin Logo Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the admin login/logo asset regression and add a repeatable deployment script that can deploy `apps/admin`, `apps/hospital`, and `apps/api`, with the branch configurable at runtime.

**Architecture:** Align `apps/admin` asset handling with `apps/hospital` by treating file-extension requests as public middleware passthroughs and shipping the logo as a real public asset. Add a Python deployment entrypoint that wraps the known-good Vercel and Lightsail deployment flow, validates required inputs, supports `--branch`, and runs post-deploy health checks.

**Tech Stack:** Next.js 15, Vitest, Python 3, Vercel CLI, SSH/rsync/systemd, existing CRM v2 monorepo.

---

## File Map

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin/src/middleware.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin/src/__tests__/session.test.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin/public/medora_logo.png`
- Modify or delete: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin/src/app/medora_logo.png/route.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/deploy_v2.py`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/deployment/crm-v2-deploy-script.md`

## Chunk 1: Fix the Admin Logo Regression

### Task 1: Add failing middleware coverage for public assets

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin/src/__tests__/session.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin/src/middleware.ts`

- [ ] **Step 1: Write a failing test**
Add an admin middleware test asserting `https://admin.example.com/medora_logo.png` returns `NextResponse.next()` instead of redirecting to `/auth/login`.

- [ ] **Step 2: Run the focused test to verify failure**
Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/admin test -- --run src/__tests__/session.test.ts
```
Expected: FAIL because the middleware currently redirects the asset request.

- [ ] **Step 3: Implement the minimal fix**
Update admin middleware to allow file-extension requests through, matching the hospital app’s public-asset handling.

- [ ] **Step 4: Re-run the focused test**
Run the same command and expect PASS.

### Task 2: Replace dynamic logo serving with a stable public asset

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin/public/medora_logo.png`
- Modify or delete: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/admin/src/app/medora_logo.png/route.ts`

- [ ] **Step 1: Copy the known-good logo asset**
Use the hospital app’s `public/medora_logo.png` as the admin app’s static asset source.

- [ ] **Step 2: Remove the fallback route if it is no longer needed**
Delete the dynamic route or leave a simple compatibility shim only if a static file cannot fully replace it.

- [ ] **Step 3: Re-run the admin test suite and a production build**
Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/admin test -- --run src/__tests__/session.test.ts
pnpm --filter @medical-crm/admin build
```
Expected: PASS.

## Chunk 2: Add a Branch-Aware Deploy Script

### Task 3: Create a repeatable deployment CLI

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/deploy_v2.py`

- [ ] **Step 1: Write failing smoke-oriented validation first**
Add script-level checks that fail when required CLIs, env vars, or target files are missing. The script must accept `--branch`, defaulting to `feature/phase-2bc`.

- [ ] **Step 2: Implement the minimal deployment flow**
Support subcommands or flags to:
- deploy `admin` via `vercel deploy --prod --archive=tgz`
- deploy `hospital` via `vercel deploy --prod --archive=tgz`
- deploy `api` to Lightsail over SSH using the known server and `systemd`
- run health checks after each deploy

Bake in these known pitfalls:
- always use `--archive=tgz` for Vercel
- verify the working tree is clean unless explicitly overridden
- verify required env names are present before deployment
- allow branch override via `--branch`
- use API health check to confirm the server restarted successfully

- [ ] **Step 3: Add concise usage docs**
Document examples for deploying:
- all targets
- only frontend apps
- only API
- a custom branch

- [ ] **Step 4: Run the script in validation mode and at least one real target**
Run validation locally, then perform at least one real deploy path to confirm the script works end to end.

## Chunk 3: Verify and Ship

### Task 4: End-to-end verification

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/deployment/crm-v2-deploy-script.md`

- [ ] **Step 1: Verify admin and hospital builds**
Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/admin build
pnpm --filter @medical-crm/hospital build
```

- [ ] **Step 2: Verify deploy script**
Run the script in dry-run or validation mode, then perform a targeted real deployment and record the output URL or health result in the docs.

- [ ] **Step 3: Commit**
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add apps/admin/src/middleware.ts apps/admin/src/__tests__/session.test.ts apps/admin/public/medora_logo.png apps/admin/src/app/medora_logo.png/route.ts scripts/deploy_v2.py docs/deployment/crm-v2-deploy-script.md docs/superpowers/plans/2026-04-06-v2-deploy-automation-and-admin-logo.md
git commit -m "feat: add crm v2 deploy automation"
```
