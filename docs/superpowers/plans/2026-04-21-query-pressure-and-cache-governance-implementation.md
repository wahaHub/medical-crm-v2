# Query Pressure And Cache Governance Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Supabase pooler pressure and hospital portal instability by removing auth-path DB amplification, buffering low-urgency activity writes, and governing hot list/detail query patterns in phased, test-driven increments.

**Architecture:** Add a small provider-abstracted cache layer plus a shared-storage-backed activity writeback buffer in `packages/infrastructure`, integrate both into the auth path via an explicit auth middleware factory/configuration seam, then progressively move high-frequency repositories and hospital portal entry pages onto shared list-query and fan-out reduction policies. Keep Phase 1 narrowly focused on system amplifiers and the hottest approved list paths; defer broader N+1, consultations/messages repository governance, and read-model work to later chunks.

**Tech Stack:** TypeScript, Hono, Next.js 15, Vitest, Drizzle ORM, Supabase Postgres, managed Redis-compatible cache, existing `@medical-crm/*` workspace packages

**Spec:** `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-04-21-query-pressure-and-cache-governance-design.md`

---

## File Map

### New files to create

- `packages/infrastructure/cache/cache-provider.ts`
  - Provider interface plus shared key/value option types.
- `packages/infrastructure/cache/in-memory-cache.provider.ts`
  - Local/dev fallback cache provider.
- `packages/infrastructure/cache/redis-cache.provider.ts`
  - First managed cache provider implementation.
- `packages/infrastructure/cache/index.ts`
  - Exports cache interfaces/providers.
- `packages/infrastructure/auth/identity-cache.service.ts`
  - Cache-backed auth identity resolver.
- `packages/infrastructure/auth/activity-writeback-buffer.ts`
  - Buffered activity marker and flush logic.
- `packages/infrastructure/auth/activity-buffer-backend.ts`
  - Shared-storage contract for pending activity enqueue/claim/flush behavior.
- `packages/infrastructure/__tests__/unit/identity-cache.service.test.ts`
  - Unit tests for cache miss/hit/fallback/invalidation behavior.
- `packages/infrastructure/__tests__/unit/activity-writeback-buffer.test.ts`
  - Unit tests for coalescing and batch flush.
- `docs/analysis/2026-04-21-query-pressure-audit-baseline.md`
  - Initial hotspot inventory and before/after metrics log.

### Existing files to modify

- `packages/infrastructure/auth/keycloak.middleware.ts`
  - Replace direct auth lookup/write amplification with cache + buffered activity integration, and introduce a factory/configuration seam for runtime dependencies.
- `packages/infrastructure/auth/index.ts`
  - Export new auth-side services and the configured auth middleware entrypoint.
- `packages/infrastructure/cache/cache-provider.ts`
  - Remains responsible for generic key/value cache behavior only; do not overload it with pending-activity queue semantics.
- `packages/infrastructure/database/transient-db-retry.ts`
  - Keep shared transient classification canonical.
- `packages/infrastructure/database/repositories/drizzle-case.repository.ts`
  - Normalize list/stats policy and optional cache usage.
- `packages/infrastructure/database/repositories/drizzle-conversation.repository.ts`
  - Apply governed list behavior.
- `packages/infrastructure/database/repositories/drizzle-email-template.repository.ts`
  - Move onto shared list policy helpers.
- `packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts`
  - Move FAQ lists/categories onto shared list policy helpers.
- `packages/infrastructure/database/repositories/index.ts`
  - Export any new repository helpers if needed.
- `packages/infrastructure/package.json`
  - Add dependencies/scripts if cache provider requires them.
- `apps/api/src/composition-root.ts`
  - Wire provider abstraction, identity cache service, writeback buffer, and any expanded hospital dashboard use case dependencies.
- `apps/api/src/index.ts`
  - Configure the auth middleware and wire metrics/logging hooks.
- `apps/api/src/routes/internal.routes.ts`
  - Reuse the existing internal route surface for activity flush if cron-triggered flush is selected.
- `apps/api/src/routes/index.ts`
  - Register any new route modules only if the existing dashboard router cannot absorb the contract changes.
- `apps/api/src/routes/dashboard.routes.ts`
  - Expand the existing hospital dashboard contract instead of introducing a parallel dashboard endpoint.
- `packages/application/src/dtos/dashboard.dto.ts`
  - Expand hospital dashboard DTO if the portal page is migrated to the existing route.
- `packages/application/src/use-cases/dashboard/hospital-dashboard.use-case.ts`
  - Evolve the existing use case to satisfy the page contract with degraded semantics.
- `apps/hospital/src/app/(portal)/dashboard/page.tsx`
  - Switch from fan-out to aggregation endpoint where appropriate.
- `apps/hospital/src/app/(portal)/cases/page.tsx`
  - Consume governed list/stats behavior; avoid unnecessary duplicate fetches.
- `apps/hospital/src/app/(portal)/consultations/page.tsx`
  - Reduce first-render fan-out.
- `apps/hospital/src/app/(portal)/messages/page.tsx`
  - Reduce first-render fan-out.
- `apps/hospital/src/lib/api-client.ts`
  - Preserve degraded handling for 503/partial list responses if new aggregation/list behavior requires it.
- `apps/hospital/src/__tests__/dashboard-page.test.tsx`
  - Lock new dashboard data flow.
- `packages/infrastructure/__tests__/unit/keycloak.middleware.test.ts`
  - Expand auth-path coverage to assert cache-first behavior.
- `packages/infrastructure/__tests__/unit/transient-db-retry.test.ts`
  - Keep transient classification aligned.
- `packages/infrastructure/__tests__/unit/drizzle-case.repository.resiliency.test.ts`
  - Extend list-policy behavior tests.
- `packages/infrastructure/__tests__/unit/drizzle-case-detail-repositories.resiliency.test.ts`
  - Preserve detail resiliency while Phase 1 changes land.
- `packages/infrastructure/__tests__/unit/drizzle-portal-list-repositories.resiliency.test.ts`
  - Expand governed list tests to consultations/messages if needed.

### Files likely deferred to later chunks

- `packages/application/src/use-cases/cases/get-hospital-case-detail.use-case.ts`
- `packages/infrastructure/database/repositories/drizzle-document.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-patient.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-case-progress.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-service-catalog.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-package.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-order.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-support-ticket.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-question-collector.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-consultation.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-message.repository.ts`

These are deliberately not part of the first PR unless a failing test proves a Phase 1 dependency.

## Execution Guardrails

1. **TDD first:** no production code before a failing test exists for the behavior being changed.
2. **Keep Phase 1 narrow:** do not sweep every repository into the first PR.
3. **Provider abstraction first:** application code must not depend directly on a concrete cache vendor.
4. **Do not overload `CacheProvider`:** if the buffered writeback flow needs enqueue/claim semantics, define a dedicated activity backend contract instead of stretching the generic key/value cache interface.
5. **No request-path direct activity writes:** once the buffer lands, `last_login_at` must not be written inline except behind an explicit emergency fallback flag.
6. **No parallel `rows + count(*)` on governed hot-list paths:** if exact counts are required, fetch after rows or return a degraded count contract.
7. **Prefer partial success over whole-page failure:** hospital pages should preserve existing degraded behavior where possible.
8. **Do not tune DB pool size as the first move:** gather cache hit/miss and fallback signals before any connection-limit changes.
9. **Do not assume a clean worktree:** checkpoint commits are only safe after verifying unrelated changes are excluded or the work is isolated in a dedicated worktree/branch.
10. **Shared storage required for production writeback:** the production activity buffer must persist pending work in a shared backend; instance-local memory is local-dev-only.

## Chunk 1: Cache Provider And Auth Services

### Task 1: Introduce provider-abstracted cache primitives

**Files:**
- Create: `packages/infrastructure/cache/cache-provider.ts`
- Create: `packages/infrastructure/cache/in-memory-cache.provider.ts`
- Create: `packages/infrastructure/cache/redis-cache.provider.ts`
- Create: `packages/infrastructure/cache/index.ts`
- Modify: `packages/infrastructure/package.json`
- Test: `packages/infrastructure/__tests__/unit/identity-cache.service.test.ts`

- [ ] **Step 1: Write the failing tests for cache-backed auth identity lookup**

Add tests that describe:
- cache miss -> DB fallback -> cache write
- cache hit -> no DB call
- cache invalidation or TTL expiry -> DB fallback again

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:
```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
pnpm --filter @medical-crm/infrastructure test -- __tests__/unit/identity-cache.service.test.ts
```
Expected: FAIL because the service and cache abstractions do not exist yet.

- [ ] **Step 3: Write the minimal cache provider interfaces and implementations**

Include:
- a generic `CacheProvider` interface
- an in-memory provider for local/dev fallback
- a Redis-compatible provider behind the same interface
- a narrow export surface in `packages/infrastructure/cache/index.ts`

- [ ] **Step 4: Implement `IdentityCacheService` using the abstraction**

Keep the service small:
- cache key generation
- lookup by Keycloak user id
- write-through on miss
- short TTL configuration

- [ ] **Step 5: Run the targeted test to verify it passes**

Run:
```bash
pnpm --filter @medical-crm/infrastructure test -- __tests__/unit/identity-cache.service.test.ts
```
Expected: PASS.

- [ ] **Step 6: Run infrastructure typecheck**

Run:
```bash
pnpm --filter @medical-crm/infrastructure typecheck
```
Expected: PASS.

- [ ] **Step 7: Checkpoint commit (only if unrelated changes are excluded)**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 add \
  packages/infrastructure/cache \
  packages/infrastructure/auth/identity-cache.service.ts \
  packages/infrastructure/__tests__/unit/identity-cache.service.test.ts \
  packages/infrastructure/package.json

git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 commit -m "feat(infrastructure): add cache provider abstraction for auth identity"
```

### Task 2: Add buffered activity writeback service

**Files:**
- Create: `packages/infrastructure/auth/activity-writeback-buffer.ts`
- Create: `packages/infrastructure/auth/activity-buffer-backend.ts`
- Create: `packages/infrastructure/__tests__/unit/activity-writeback-buffer.test.ts`
- Modify: `packages/infrastructure/auth/index.ts`

- [ ] **Step 1: Write the failing tests for buffered activity behavior**

Cover:
- repeated activity for the same user within the window is coalesced
- flush writes a batch once
- flush returns the number of applied updates
- flush failures are surfaced/loggable without breaking the request path contract
- production behavior does not require enqueue and flush to happen on the same app instance

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:
```bash
pnpm --filter @medical-crm/infrastructure test -- __tests__/unit/activity-writeback-buffer.test.ts
```
Expected: FAIL because the buffer does not exist yet.

- [ ] **Step 3: Implement the minimal buffered writeback service**

Use the same provider abstraction when useful, but keep the first implementation intentionally small:
- `markUserActive`
- buffered dedupe
- `flushPending`
- explicit time-window configuration

The production path must persist pending activity in shared storage. An instance-local queue is acceptable only for local development fallback and must not be the default production behavior.
Define that shared-storage behavior behind a dedicated activity backend contract rather than by expanding the generic `CacheProvider`.

- [ ] **Step 4: Run the targeted test to verify it passes**

Run:
```bash
pnpm --filter @medical-crm/infrastructure test -- __tests__/unit/activity-writeback-buffer.test.ts
```
Expected: PASS.

- [ ] **Step 5: Re-run infrastructure typecheck**

Run:
```bash
pnpm --filter @medical-crm/infrastructure typecheck
```
Expected: PASS.

- [ ] **Step 6: Checkpoint commit (only if unrelated changes are excluded)**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 add \
  packages/infrastructure/auth/activity-buffer-backend.ts \
  packages/infrastructure/auth/activity-writeback-buffer.ts \
  packages/infrastructure/__tests__/unit/activity-writeback-buffer.test.ts \
  packages/infrastructure/auth/index.ts

git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 commit -m "feat(auth): add buffered activity writeback service"
```

## Chunk 2: Auth Path Integration

### Task 3: Switch auth middleware to cache-first identity resolution and buffered activity

**Files:**
- Modify: `packages/infrastructure/auth/keycloak.middleware.ts`
- Modify: `packages/infrastructure/auth/index.ts`
- Modify: `packages/infrastructure/__tests__/unit/keycloak.middleware.test.ts`
- Modify: `apps/api/src/composition-root.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Extend the auth middleware tests to fail on the current behavior**

Add/keep tests that require:
- cache hit avoids DB identity lookup
- miss falls back to DB and stores cache
- transient DB failure still returns 503
- activity is buffered rather than written inline

- [ ] **Step 2: Run the targeted tests to verify failure**

Run:
```bash
pnpm --filter @medical-crm/infrastructure test -- __tests__/unit/keycloak.middleware.test.ts
```
Expected: FAIL until middleware uses the new services instead of direct request-path lookup/write logic.

- [ ] **Step 3: Implement the minimal auth middleware integration**

Requirements:
- keep JWT verification behavior unchanged
- resolve CRM identity through `IdentityCacheService`
- preserve 401 vs 503 distinction
- enqueue activity through the buffer
- remove inline `last_login_at` write behavior from the hot path
- expose the auth middleware through a factory or explicit configuration seam so `apps/api` can actually supply the new services

- [ ] **Step 4: Run the targeted auth tests**

Run:
```bash
pnpm --filter @medical-crm/infrastructure test -- __tests__/unit/keycloak.middleware.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run the existing resiliency tests to catch regressions**

Run:
```bash
pnpm --filter @medical-crm/infrastructure test -- \
  __tests__/unit/keycloak.middleware.test.ts \
  __tests__/unit/transient-db-retry.test.ts \
  __tests__/unit/drizzle-case.repository.resiliency.test.ts \
  __tests__/unit/drizzle-case-detail-repositories.resiliency.test.ts \
  __tests__/unit/drizzle-portal-list-repositories.resiliency.test.ts
```
Expected: PASS.

- [ ] **Step 6: Checkpoint commit (only if unrelated changes are excluded)**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 add \
  packages/infrastructure/auth/keycloak.middleware.ts \
  packages/infrastructure/auth/index.ts \
  packages/infrastructure/__tests__/unit/keycloak.middleware.test.ts \
  apps/api/src/composition-root.ts \
  apps/api/src/index.ts

git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 commit -m "feat(api): move auth identity and activity to managed cache services"
```

### Task 4: Add a bounded flush path for buffered activity

**Files:**
- Modify: `apps/api/src/routes/internal.routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/__tests__/internal.routes.test.ts`

- [ ] **Step 1: Write the failing tests for the flush path**

Cover:
- authenticated internal flush triggers `flushPending`
- response shape reports flushed count
- failures are surfaced as 503/500 according to the chosen internal route convention

- [ ] **Step 2: Run the targeted test to verify failure**

Run:
```bash
pnpm --filter @medical-crm/api test -- src/__tests__/internal.routes.test.ts
```
Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement the smallest flush entrypoint**

Choose one bounded path:
- internal route within the existing `internal.routes.ts` surface triggered by platform cron
- or explicit worker hook if already available in current runtime patterns

Do not add a broad job framework in this task.

- [ ] **Step 4: Run the targeted test to verify pass**

Run:
```bash
pnpm --filter @medical-crm/api test -- src/__tests__/internal.routes.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run API typecheck**

Run:
```bash
pnpm --filter @medical-crm/api typecheck
```
Expected: PASS, or if existing unrelated repo issues remain, verify no new errors are introduced in touched files.

- [ ] **Step 6: Checkpoint commit (only if unrelated changes are excluded)**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 add \
  apps/api/src/routes/internal.routes.ts \
  apps/api/src/index.ts \
  apps/api/src/__tests__/internal.routes.test.ts

git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 commit -m "feat(api): add activity writeback flush endpoint"
```

## Chunk 3: Governed Hot-List Repository Policy

### Task 5: Extract shared hot-list helper behavior

**Files:**
- Create: `packages/infrastructure/database/list-query-policy.ts`
- Modify: `packages/infrastructure/database/repositories/drizzle-case.repository.ts`
- Modify: `packages/infrastructure/database/repositories/drizzle-conversation.repository.ts`
- Modify: `packages/infrastructure/database/repositories/drizzle-email-template.repository.ts`
- Modify: `packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts`
- Test: `packages/infrastructure/__tests__/unit/drizzle-case.repository.resiliency.test.ts`
- Test: `packages/infrastructure/__tests__/unit/drizzle-portal-list-repositories.resiliency.test.ts`

- [ ] **Step 1: Write the failing tests for the shared list-query policy**

Add/extend tests that require:
- rows fetched before count on governed repositories
- transient retry still works
- count may be omitted/degraded where the contract allows
- no repository reintroduces parallel `rows + count(*)`

- [ ] **Step 2: Run the targeted tests to verify failure**

Run:
```bash
pnpm --filter @medical-crm/infrastructure test -- \
  __tests__/unit/drizzle-case.repository.resiliency.test.ts \
  __tests__/unit/drizzle-portal-list-repositories.resiliency.test.ts
```
Expected: FAIL for any repository still bypassing the shared policy.

- [ ] **Step 3: Implement the minimal shared helper and migrate the first-wave repositories**

Rules:
- no new ORM abstraction
- helper may wrap retry + rows-first + optional count policy
- only migrate first-wave repositories from the spec: cases, conversations, FAQ, and email templates

- [ ] **Step 4: Re-run the targeted tests**

Run the same command and expect PASS.

- [ ] **Step 5: Run broader infrastructure regression tests**

Run:
```bash
pnpm --filter @medical-crm/infrastructure test -- \
  __tests__/unit/keycloak.middleware.test.ts \
  __tests__/unit/drizzle-case.repository.resiliency.test.ts \
  __tests__/unit/transient-db-retry.test.ts \
  __tests__/unit/drizzle-case-detail-repositories.resiliency.test.ts \
  __tests__/unit/drizzle-portal-list-repositories.resiliency.test.ts
```
Expected: PASS.

- [ ] **Step 6: Checkpoint commit (only if unrelated changes are excluded)**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 add \
  packages/infrastructure/database/list-query-policy.ts \
  packages/infrastructure/database/repositories/drizzle-case.repository.ts \
  packages/infrastructure/database/repositories/drizzle-conversation.repository.ts \
  packages/infrastructure/database/repositories/drizzle-email-template.repository.ts \
  packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts \
  packages/infrastructure/__tests__/unit/drizzle-case.repository.resiliency.test.ts \
  packages/infrastructure/__tests__/unit/drizzle-portal-list-repositories.resiliency.test.ts

git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 commit -m "refactor(infrastructure): govern hot-list query pressure"
```

## Chunk 4: Hospital Portal Fan-Out Reduction

### Task 6: Add a dashboard aggregation contract

**Files:**
- Modify: `apps/api/src/routes/dashboard.routes.ts`
- Modify: `apps/api/src/composition-root.ts`
- Modify: `packages/application/src/dtos/dashboard.dto.ts`
- Modify: `packages/application/src/use-cases/dashboard/hospital-dashboard.use-case.ts`
- Modify: `apps/api/src/__tests__/dashboard.routes.test.ts`

- [ ] **Step 1: Write the failing dashboard aggregation route tests**

The contract should lock:
- the existing `/api/v2/hospital/dashboard` endpoint returning the summary blocks needed by hospital portal
- partial/degraded behavior when one block fails
- no auth regression

- [ ] **Step 2: Run the targeted test to verify failure**

Run:
```bash
pnpm --filter @medical-crm/api test -- src/__tests__/dashboard.routes.test.ts
```
Expected: FAIL because the existing hospital dashboard contract/use case does not yet satisfy the portal needs.

- [ ] **Step 3: Implement the minimal aggregation route**

Keep scope small:
- include only the blocks currently needed by `apps/hospital/src/app/(portal)/dashboard/page.tsx`
- expand the existing hospital dashboard route/use case instead of adding a second endpoint
- reuse existing use cases/repositories where practical
- preserve degraded semantics rather than creating a hard all-or-nothing dependency

- [ ] **Step 4: Run the targeted test to verify pass**

Run:
```bash
pnpm --filter @medical-crm/api test -- src/__tests__/dashboard.routes.test.ts
```
Expected: PASS.

- [ ] **Step 5: Checkpoint commit (only if unrelated changes are excluded)**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 add \
  apps/api/src/routes/dashboard.routes.ts \
  apps/api/src/composition-root.ts \
  packages/application/src/dtos/dashboard.dto.ts \
  packages/application/src/use-cases/dashboard/hospital-dashboard.use-case.ts \
  apps/api/src/__tests__/dashboard.routes.test.ts

git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 commit -m "feat(api): expand hospital dashboard aggregation contract"
```

### Task 7: Move hospital dashboard onto the aggregation route

**Files:**
- Modify: `apps/hospital/src/app/(portal)/dashboard/page.tsx`
- Modify: `apps/hospital/src/__tests__/dashboard-page.test.tsx`
- Optionally modify: `apps/hospital/src/lib/api-client.ts`

- [ ] **Step 1: Write or extend the failing dashboard page test**

Require:
- dashboard uses one aggregated fetch instead of the previous fan-out pattern
- page still renders degraded blocks safely

- [ ] **Step 2: Run the targeted test to verify failure**

Run:
```bash
pnpm --filter @medical-crm/hospital test -- src/__tests__/dashboard-page.test.tsx
```
Expected: FAIL until the page is switched over.

- [ ] **Step 3: Implement the minimal page change**

Keep the UI unchanged unless a degraded-state contract needs small copy changes.

- [ ] **Step 4: Run the targeted test to verify pass**

Run:
```bash
pnpm --filter @medical-crm/hospital test -- src/__tests__/dashboard-page.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Run hospital typecheck**

Run:
```bash
pnpm --filter @medical-crm/hospital typecheck
```
Expected: PASS.

- [ ] **Step 6: Checkpoint commit (only if unrelated changes are excluded)**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 add \
  apps/hospital/src/app/\(portal\)/dashboard/page.tsx \
  apps/hospital/src/__tests__/dashboard-page.test.tsx \
  apps/hospital/src/lib/api-client.ts

git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 commit -m "refactor(hospital): reduce dashboard fan-out"
```

### Task 8: Reduce first-render fan-out on cases, consultations, and messages

**Files:**
- Modify: `apps/hospital/src/app/(portal)/cases/page.tsx`
- Modify: `apps/hospital/src/app/(portal)/consultations/page.tsx`
- Modify: `apps/hospital/src/app/(portal)/messages/page.tsx`
- Modify only if needed: `packages/infrastructure/database/repositories/drizzle-consultation.repository.ts`
- Modify only if needed: `packages/infrastructure/database/repositories/drizzle-message.repository.ts`
- Test: `apps/hospital/src/__tests__/session.test.ts`
- Add tests if missing for page-specific fetch behavior

- [ ] **Step 1: Write failing tests for one page at a time**

Start with the page that currently makes the most duplicate or avoidable requests. Do not batch three page rewrites behind one giant test.

- [ ] **Step 2: Run the targeted page test and verify failure**

Run only the page test you just added.

- [ ] **Step 3: Implement the smallest fan-out reduction for that page**

Examples:
- remove duplicate fetches
- reuse summary endpoints
- defer non-critical calls
- do not promote consultations/messages repository governance into this task unless page-level work proves it is required

- [ ] **Step 4: Re-run the targeted page test and verify pass**

- [ ] **Step 5: Repeat Steps 1-4 for the next page**

- [ ] **Step 6: Run hospital typecheck and relevant page tests**

Run:
```bash
pnpm --filter @medical-crm/hospital test -- src/__tests__/session.test.ts
pnpm --filter @medical-crm/hospital typecheck
```
Expected: PASS.

- [ ] **Step 7: Checkpoint commit (only if unrelated changes are excluded)**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 add \
  apps/hospital/src/app/\(portal\)/cases/page.tsx \
  apps/hospital/src/app/\(portal\)/consultations/page.tsx \
  apps/hospital/src/app/\(portal\)/messages/page.tsx \
  apps/hospital/src/__tests__/

git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 commit -m "refactor(hospital): reduce first-render list fan-out"
```

## Chunk 5: Audit Baseline And Deferred Work Handoff

### Task 9: Produce the first query-pressure audit baseline

**Files:**
- Create: `docs/analysis/2026-04-21-query-pressure-audit-baseline.md`

- [ ] **Step 1: Gather current route and repository hotspots from logs/tests**

Capture:
- auth cache hit/miss expectations
- governed hot-list routes
- remaining second-wave repositories
- known detail fan-out/N+1 suspects

- [ ] **Step 2: Write the baseline analysis doc**

Include:
- before/after observations from Phase 1
- pages still needing aggregation or read-model work
- P2/P3 backlog for detail fan-out and classic N+1 audit

- [ ] **Step 3: Checkpoint commit (only if unrelated changes are excluded)**

```bash
git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 add \
  docs/analysis/2026-04-21-query-pressure-audit-baseline.md

git -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 commit -m "docs: add query pressure audit baseline"
```

### Task 10: Final verification and execution handoff

**Files:**
- Modify only if the verification run reveals a real defect

- [ ] **Step 1: Run the final focused infrastructure verification**

Run:
```bash
pnpm --filter @medical-crm/infrastructure test -- \
  __tests__/unit/keycloak.middleware.test.ts \
  __tests__/unit/drizzle-case.repository.resiliency.test.ts \
  __tests__/unit/transient-db-retry.test.ts \
  __tests__/unit/drizzle-case-detail-repositories.resiliency.test.ts \
  __tests__/unit/drizzle-portal-list-repositories.resiliency.test.ts
pnpm --filter @medical-crm/infrastructure typecheck
```
Expected: PASS.

- [ ] **Step 2: Run the final focused API verification**

Run:
```bash
pnpm --filter @medical-crm/api test -- \
  src/__tests__/internal.routes.test.ts \
  src/__tests__/dashboard.routes.test.ts
pnpm --filter @medical-crm/api typecheck
```
Expected: PASS, or no newly introduced errors in touched files if the repo has pre-existing unrelated typecheck failures.

- [ ] **Step 3: Run the final focused hospital verification**

Run:
```bash
pnpm --filter @medical-crm/hospital test -- \
  src/__tests__/dashboard-page.test.tsx \
  src/__tests__/session.test.ts
pnpm --filter @medical-crm/hospital typecheck
```
Expected: PASS.

- [ ] **Step 4: Summarize what remains intentionally deferred**

Explicitly call out:
- second-wave list repositories
- case detail fan-out hardening
- formal N+1 audit program
- any provider-specific production rollout work

- [ ] **Step 5: Request final code review before shipping**

Use the repo’s normal review flow after the implementation chunks are complete.

## Deferred Backlog (Do Not Pull Into Phase 1 Without New Evidence)

- system-wide migration of every list repository to cache-aware policy
- detail read-model extraction for case/conversation/message flows
- service catalog/packages/orders/tickets/question-collector second-wave query governance
- full N+1 audit automation
- DB pool/resource tuning beyond measurement-backed adjustments
