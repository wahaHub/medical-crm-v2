# Query Pressure And Cache Governance Design

Date: 2026-04-21
Status: Draft
Scope: `medical-crm-v2` API and hospital portal stability hardening
Approach: phased governance with provider-abstracted managed cache

## Summary

We will reduce database connection pressure and route instability in `medical-crm-v2` by introducing a small cross-cutting resiliency layer instead of continuing to patch individual pages and repositories one by one.

The immediate drivers are:

- every authenticated `/api/v2/*` request currently depends on a CRM DB lookup
- authenticated requests also trigger `last_login_at` write amplification
- several high-frequency list endpoints still perform `rows + count(*)` under the same request path
- hospital portal pages fan out across many APIs on first render
- some detail flows still have multi-repository fan-out that becomes fragile when the pooler is under pressure

This design treats the current failures as a system-level query pressure problem first, not as isolated page bugs.

## Goals

- Reduce CRM DB round-trips for hot authenticated request paths.
- Move low-urgency activity writes out of the request critical path.
- Standardize retry, cache, and list-query behavior for high-frequency endpoints.
- Prioritize the highest-traffic portal surfaces first.
- Create a reusable governance model so new endpoints do not reintroduce the same failure modes.

## Non-Goals

- Full database schema redesign
- Replacing Supabase as the source of truth
- Building a generic distributed systems platform inside the repo
- Solving every long-tail query smell in the first rollout
- Rewriting all repositories at once

## Problem Statement

The recent failures are not best explained by a single broken route. The stronger pattern is system-wide connection pressure against Supabase pooler limits. The current codebase amplifies that pressure through three layers:

1. auth amplification
   - `packages/infrastructure/auth/keycloak.middleware.ts`
   - every authenticated request does identity lookup against CRM `users`
   - requests also try to refresh `last_login_at`

2. list-query amplification
   - many `drizzle-*repository.ts` list methods perform `rows + count(*)`
   - some run both in parallel
   - this multiplies connection demand under dashboard-style traffic

3. page fan-out
   - hospital portal pages such as dashboard, cases, consultations, and messages request multiple APIs at once
   - each API then incurs auth lookup plus its own repository work

The consequence is that pooler instability surfaces as:

- `CONNECTION_CLOSED`
- `CONNECT_TIMEOUT`
- `Max client connections reached`
- `MaxClientsInSessionMode`

The first objective is therefore to reduce request-path dependency on CRM DB and to flatten hot-list query patterns.

## Constraints

- Deployment targets are Vercel and/or Cloudflare.
- Backend database is Supabase Postgres.
- Managed cache should be provider-abstracted, but the initial implementation should support one recommended provider first.
- The first rollout must be incremental and low-risk.
- Existing unrelated workspace changes must not be bundled into this work.

## Recommended Long-Term Direction

Use a provider-abstracted managed cache layer with one concrete provider initially, rather than relying on process-local memory as the primary design.

Rationale:

- process-local cache is acceptable as a fallback, but not as the durable design on Vercel/Cloudflare
- auth identity and activity buffering benefit from cross-instance coordination
- a provider abstraction avoids hard-coupling business logic to a single platform or vendor

Recommended shape:

- `CacheProvider` interface
- initial concrete provider: managed Redis-compatible cache
- optional fallback provider: in-memory process cache for local development and emergency fallback only

## Architecture

### 1. Identity Cache Service

Purpose:

- cache `keycloak_user_id -> crm user identity context`

Used by:

- `packages/infrastructure/auth/keycloak.middleware.ts`

Responsibilities:

- resolve auth identity by cache key first
- fall back to CRM DB lookup on miss
- store minimal stable identity payload needed by the auth path
- support short TTL and explicit invalidation hooks later if needed

Suggested payload:

- CRM user id
- hospital id
- roles or role-derived scope if needed

This service should be the main mechanism that decouples authenticated request volume from per-request CRM DB lookups.

### 2. Activity Writeback Buffer

Purpose:

- collect “user was active” signals without writing `last_login_at` inside every request

Used by:

- auth middleware and any future presence-like signals

Responsibilities:

- accept lightweight activity events during requests
- coalesce repeated activity for the same user within a window
- flush in batches on an interval
- degrade safely if the buffer backend is unavailable

Primary deployment requirement:

- production buffering must use shared backing storage so enqueue and flush do not rely on the same app instance
- process-local memory may be used only for local development or explicit fallback mode, not as the default production queue

Writeback model:

- request path only enqueues activity
- background flush writes `last_login_at`
- batching window should prefer connection safety over second-level freshness
- the first production-ready implementation should flush from shared storage through an internal scheduled path rather than an instance-local queue

### 3. List Query Policy Layer

Purpose:

- standardize how high-frequency list endpoints behave

Responsibilities:

- define default query policy for list endpoints
- disallow parallel `rows + count(*)` by default
- allow `count` degradation or delayed fetch where acceptable
- apply transient retry consistently
- support short TTL cache for hot list and summary reads

This is not a new ORM. It is a small policy layer applied to the most pressure-sensitive repository methods.

### 4. Query Pressure Audit

Purpose:

- continuously identify hotspots and regressions

Responsibilities:

- log cache hit/miss and DB fallback
- count DB calls per request on high-value routes
- identify page fan-out hotspots
- identify classic N+1 patterns and detail fan-out chains

This phase starts with logs/metrics, not a large observability platform.

## Problem Taxonomy

### A. System Amplifiers

Highest priority. These magnify failures across many routes.

- auth identity lookup on every request
- request-path `last_login_at` updates
- inconsistent transient DB classification

### B. Page Fan-Out

High priority. One page causes many APIs, which each cause auth lookup plus business reads.

Key pages:

- `apps/hospital/src/app/(portal)/dashboard/page.tsx`
- `apps/hospital/src/app/(portal)/cases/page.tsx`
- `apps/hospital/src/app/(portal)/consultations/page.tsx`
- `apps/hospital/src/app/(portal)/messages/page.tsx`

Important repo reality:

- `apps/api/src/routes/dashboard.routes.ts` already exposes `/api/v2/hospital/dashboard`
- the first fan-out reduction step should expand or adapt that existing hospital dashboard contract instead of introducing a second parallel dashboard endpoint
- the current hospital dashboard DTO is narrower than the portal page needs today, so the design must treat this as an evolution of an existing route/use case, not a brand-new route family

### C. `rows + count(*)` Pressure

High priority for list repositories and summary-heavy admin/hospital pages where the endpoint contract explicitly asks for both paged rows and totals.

Known hotspots:

- `packages/infrastructure/database/repositories/drizzle-case.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-conversation.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-message.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-consultation.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-email-template.repository.ts`
- `packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts`

Second wave candidates:

- `drizzle-service-catalog.repository.ts`
- `drizzle-package.repository.ts`
- `drizzle-order.repository.ts`
- `drizzle-support-ticket.repository.ts`
- `drizzle-question-collector.repository.ts`
- `drizzle-hospital-management.repository.ts`
- `drizzle-quote.repository.ts`
- `drizzle-chc.repository.ts`

### D. Classic N+1 And Detail Fan-Out

Important, but lower priority than system amplifiers.

This category is broader than `rows + count(*)` pressure. It covers high-frequency reads that may not expose a classic paged-count contract, but still create too many query hops or too much page-level fan-out.

Primary audit targets:

- `packages/application/src/use-cases/cases/get-hospital-case-detail.use-case.ts`
- conversation/message detail flows
- patient/document/progress association paths

This category includes:

- true N+1 loops
- `Promise.all(items.map(...findById))`
- large multi-repository detail fan-out

## Priority Matrix

### P0

- `keycloak.middleware.ts` auth identity path
- `keycloak.middleware.ts` `last_login_at` write path
- `transient-db-retry.ts` and shared DB error taxonomy

### P1

- dashboard first-render fan-out
- cases list and case stats
- conversations list
- messages list
- consultations list

### P1.5

- email templates list
- chatbot FAQ list and categories
- materials routes revalidation after the system amplifiers are reduced

### P2

- case detail query fan-out
- patient/document/progress detail paths
- second-wave list repositories

### P3

- formal N+1 audit program
- default repository governance checklist for future features

## Phased Rollout

### Phase 1: Stop The Bleeding

Target outcome:

- fewer auth-path DB calls
- fewer request-path writes
- fewer immediate pooler pressure failures

Implementation:

- introduce `IdentityCacheService`
- introduce `ActivityWritebackBuffer`
- unify transient DB classification
- apply first-pass list policy to:
  - cases
  - conversations
  - FAQ
  - email templates

Explicitly deferred from Phase 1:

- consultations repository governance
- messages repository governance
- page-level fan-out reductions outside dashboard

### Phase 2: Fan-Out Reduction

Target outcome:

- lower first-render query burst on hospital portal

Implementation:

- add dashboard aggregation path
- separate summary/stats from table rows
- reduce unconditional multi-request first loads in hospital portal pages
- pull consultations and messages into the governed first-render reduction pass

### Phase 3: Detail Chain And N+1 Audit

Target outcome:

- detail views no longer fail or stall due to large fan-out

Implementation:

- audit detail use cases
- batch or join where practical
- split detail payloads into core and deferred sections

### Phase 4: Systematize

Target outcome:

- new endpoints inherit governance by default

Implementation:

- classify routes by query pressure profile
- register default policies per class
- write developer guidance for cache/retry/list behavior

## Route And Repository Governance Rules

### Auth-Critical Routes

Defaults:

- cache-first identity resolution
- clear distinction between auth failure and infra failure
- no request-path profile activity writes
- auth dependencies must be injected through a middleware factory or explicit configuration hook; application wiring alone is not enough because the current auth middleware is imported directly from `@medical-crm/infrastructure/auth`

### Hot List Routes

Defaults:

- no parallel `rows + count(*)`
- short TTL cache allowed
- `count` may be degraded or delayed
- transient retry enabled

### Detail Routes

Defaults:

- return core data first
- treat secondary blocks as delayable or degradable
- avoid multi-hop repository fan-out where batching is possible

### Summary And Stats Routes

Defaults:

- prefer pre-aggregated or cached summary data
- do not force real-time exact count on every page render

## Proposed Interfaces

### Cache Provider

```ts
export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttlSeconds?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
```

### Identity Cache Service

```ts
export interface IdentityCacheService {
  getByKeycloakUserId(keycloakUserId: string): Promise<AuthIdentity | null>;
  setByKeycloakUserId(keycloakUserId: string, identity: AuthIdentity, ttlSeconds: number): Promise<void>;
  invalidateByKeycloakUserId(keycloakUserId: string): Promise<void>;
}
```

### Activity Writeback Buffer

```ts
export interface ActivityWritebackBuffer {
  markUserActive(userId: string, at: string): Promise<void>;
  flushPending(batchSize?: number): Promise<number>;
}
```

The exact implementation details may vary by provider, but the application code should depend only on these interfaces.
The production implementation must persist pending activity in shared storage before flush.
Implementation note: keep the pending-activity backend contract separate from the generic `CacheProvider` unless a future revision proves they should share the same abstraction.

## Data Flow

### Auth Request Flow

1. verify JWT
2. resolve identity from `IdentityCacheService`
3. on hit, continue without DB
4. on miss, query CRM DB once
5. write identity back into cache
6. enqueue user activity into `ActivityWritebackBuffer`
7. continue request

### Activity Flush Flow

1. request marks user active
2. buffer deduplicates within time window
3. scheduled flush writes batched `last_login_at` updates
4. flush records success/failure metrics

### Hot List Flow

1. route calls repository/service under list policy
2. optional cache lookup for list/stats
3. on miss, fetch rows first
4. fetch `count` only if required by the consumer contract
5. cache result if policy allows
6. return partial/degraded result rather than failing whole page when acceptable

## Metrics And Debug Signals

Minimum signals for the first rollout:

- auth identity cache hit/miss
- auth DB fallback count
- activity buffer enqueue count
- activity flush batch size and failure count
- route-level DB retry count
- route-level degraded count responses
- dashboard aggregation latency

These metrics should be cheap enough to add during the first phase.

## Risks And Mitigations

### Risk: stale auth identity cache

Mitigation:

- keep TTL short
- cache only identity data needed by request authorization
- add invalidation hook later for profile/role mutations

### Risk: writeback buffer loses activity events

Mitigation:

- define the data as low-urgency and lossy-tolerant
- treat direct request-path write as fallback only if explicitly enabled
- log buffer failures for operational review

### Risk: over-caching hides recent list changes

Mitigation:

- keep TTLs short for hospital portal reads
- separate admin mutation paths from read cache policy
- prefer cached summaries before cached mutable detail payloads

### Risk: Phase 1 scope expands into a repository rewrite

Mitigation:

- Phase 1 touches only the highest-pressure routes and repositories
- second-wave repositories remain explicitly deferred

## What Not To Bundle

- do not combine cache-provider introduction with broad schema migration
- do not rewrite every repository in the first PR
- do not bundle dashboard aggregation with large detail-page redesign
- do not tune DB pool settings blindly before gathering cache-hit and fallback data
- do not rely on resource upgrades alone as the primary fix

## Success Criteria

This design is successful when:

- authenticated request volume no longer maps one-to-one to CRM identity DB lookups
- `last_login_at` no longer writes on every request path
- known hot list routes stop being major contributors to connection spikes
- hospital dashboard and main list pages produce lower first-render query pressure
- the team has a reusable governance model for future high-frequency routes

## Recommended Execution Order

1. introduce `CacheProvider` abstraction with one managed provider
2. implement `IdentityCacheService`
3. implement `ActivityWritebackBuffer`
4. integrate auth middleware with both services
5. apply list policy to cases, conversations, FAQ, and email templates
6. extend the existing `/api/v2/hospital/dashboard` contract rather than creating a parallel dashboard endpoint
7. audit detail fan-out and classic N+1 candidates

## Open Questions

- Which managed cache provider should be the first concrete implementation?
- Should activity flush run via platform cron against the existing internal route surface, or via an already-established worker path?
- Which pages absolutely require exact real-time `count`, and which can tolerate degraded or delayed totals?
