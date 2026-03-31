# FAQ Category-Aware Retrieval Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CRM-category-aware FAQ retrieval so the chatbot narrows FAQ search by `chatbot_faq_categories.name`, keeps general FAQ separate from hospital-specific FAQ, and supports hospital-aware FAQ retrieval when active hospital context exists.

**Architecture:** Keep the backend as the authority for category truth and hospital context, but let Dify continue to orchestrate FAQ retrieval. Sync FAQ documents to Dify with structured metadata, expose a lightweight category-list endpoint from CRM, extend the chat/context contract with `pageContext` and active hospital context, then update the Dify FAQ branch to resolve `1-3` categories and filter retrieval by `scope`, `category`, `hospital_type`, and `hospital_id` when applicable.

**Tech Stack:** TypeScript, Hono, Zod, Drizzle schema/repositories, Dify dataset/document APIs, Vitest, YAML DSL

---

## File Map

### Existing files to modify

- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/ai-sync-task.service.ts`
  - Extend FAQ sync rendering and payload helpers to include structured metadata.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-sync/process-ai-sync-outbox.use-case.ts`
  - Pass metadata through the Dify document sync path.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/services/dify-api-client.service.ts`
  - Add metadata-aware document create/update support for Dify dataset APIs.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`
  - Add internal `faq-categories` endpoint and extend policy/context endpoints if needed for `pageContext`.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`
  - Accept `pageContext` in public chat input and pass it into backend context/policy handling.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
  - Extend public chatbot request schema with optional `pageContext`.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/context-builder.service.ts`
  - Add active hospital context derivation using page context + recent conversation + recommendation state.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`
  - Expose active hospital context to Dify-safe context output.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
  - Ensure decide output can safely support hospital-aware FAQ retrieval hints if needed.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`
  - Add category list lookup, category resolver, FAQ scope gate, and split general vs hospital FAQ retrieval.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts`
  - Add contract coverage for category-aware FAQ branches.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`
  - Add route coverage for `pageContext`.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/ai-sync-task.service.test.ts`
  - Add sync metadata coverage.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-sync/process-ai-sync-outbox.use-case.test.ts`
  - Add Dify metadata pass-through coverage.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/context-builder.service.test.ts`
  - Add active hospital context tests.

### New files likely needed

- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.ts`
  - Narrow internal endpoint use case for active category names by `hospitalType` and optional `hospitalId`.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.test.ts`
  - Tests for general vs hospital-aware category list behavior.
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/internal.faq-categories.test.ts`
  - Endpoint tests for internal FAQ category list.

### Files to inspect during implementation

- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/schema/schema.ts`
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/domain/src/ports/chatbot-faq-repository.port.ts`
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/database/migrations/023_faq_categories_hospital_id.sql`
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-31-faq-category-aware-retrieval-design.md`

## Chunk 1: FAQ Metadata Sync and Dify Document Support

### Task 1: Verify Dify document metadata write shape against vendored Dify

**Files:**
- Inspect: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify/api`
- Inspect: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/services/dify-api-client.service.ts`

- [ ] **Step 1: Inspect the vendored Dify API for document metadata support**

Run:

```bash
rg -n "create_by_text|update_by_text|doc_metadata|metadata" /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify/api
```

Expected:
- identify the exact request field names Dify expects for document metadata on create/update

- [ ] **Step 2: Record the confirmed metadata request shape in the implementation notes**

Expected:
- clear create/update payload shape for metadata
- no guessing during implementation

### Task 2: Add failing tests for FAQ sync metadata

**Files:**
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/ai-sync-task.service.test.ts`
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-sync/process-ai-sync-outbox.use-case.test.ts`

- [ ] **Step 1: Add failing unit test for rendered FAQ metadata**

Test should cover:
- general FAQ renders `scope = GENERAL`
- hospital FAQ renders `scope = HOSPITAL`
- metadata includes `faq_id`, `category`, `hospital_type`, `hospital_id`, `keywords`

- [ ] **Step 2: Run the focused tests to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/ai-sync-task.service.test.ts src/use-cases/ai-sync/process-ai-sync-outbox.use-case.test.ts
```

Expected:
- FAIL because metadata is not yet present in sync payloads

### Task 3: Implement metadata-aware FAQ sync

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/ai-sync-task.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-sync/process-ai-sync-outbox.use-case.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/services/dify-api-client.service.ts`

- [ ] **Step 1: Extend rendered FAQ sync output to return both text and metadata**

Implementation notes:
- keep existing text body intact
- add derived `scope = GENERAL` when `hospitalId` is null
- add derived `scope = HOSPITAL` when `hospitalId` is not null

- [ ] **Step 2: Extend the Dify gateway interface to accept metadata on create/update**

Implementation notes:
- keep package sync behavior unchanged
- pass FAQ metadata only on FAQ documents

- [ ] **Step 3: Write the minimal production code to make the metadata tests pass**

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/ai-sync-task.service.test.ts src/use-cases/ai-sync/process-ai-sync-outbox.use-case.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit Chunk 1**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/ai-sync-task.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-sync/process-ai-sync-outbox.use-case.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/services/dify-api-client.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/ai-sync-task.service.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-sync/process-ai-sync-outbox.use-case.test.ts
git commit -m "feat: add faq sync metadata for category retrieval"
```

## Chunk 2: Internal FAQ Category Endpoint

### Task 4: Add failing tests for category list behavior

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.test.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/internal.faq-categories.test.ts`

- [ ] **Step 1: Add a failing application-layer test**

Test should cover:
- without `hospitalId`, only active general categories are returned
- with `hospitalId`, return union of active general categories + active hospital-specific categories
- duplicate names collapse cleanly if needed

- [ ] **Step 2: Add a failing API route test**

Test should cover:
- internal secret required
- `hospitalType` required
- response shape includes `hospitalType`, `hospitalId`, `categories`

- [ ] **Step 3: Run the new tests to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/internal.faq-categories.test.ts
```

Expected:
- FAIL because the use case and route do not exist yet

### Task 5: Implement internal FAQ category endpoint

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/index.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`

- [ ] **Step 1: Implement the use case on top of `IChatbotFaqRepository.listCategories`**

Implementation notes:
- filter to active categories only
- support optional `hospitalId`
- return general-only or union behavior exactly as specified

- [ ] **Step 2: Wire the use case into composition root**

- [ ] **Step 3: Add `GET /api/v2/internal/mcp/faq-categories`**

Implementation notes:
- require `X-Internal-Secret`
- accept `hospitalType`
- accept optional `hospitalId`
- keep response compact and stable

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/internal.faq-categories.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit Chunk 2**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/index.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/internal.faq-categories.test.ts
git commit -m "feat: add internal faq category lookup for chatbot"
```

## Chunk 3: Page Context and Active Hospital Context

### Task 6: Add failing schema and route tests for `pageContext`

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts`

- [ ] **Step 1: Add failing public route tests**

Test should cover:
- `/api/v2/chatbot/chat` accepts optional `pageContext`
- invalid page context is rejected
- valid page context reaches the service boundary

- [ ] **Step 2: Run the route tests to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts
```

Expected:
- FAIL because the request schema and route do not support `pageContext`

### Task 7: Add failing context-builder tests for active hospital context

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/context-builder.service.test.ts`

- [ ] **Step 1: Add failing tests for hospital context derivation**

Test should cover:
- `pageContext.hospitalId` wins when present
- recent hospital discussion can activate hospital-aware context
- recommendation/shortlist context can activate hospital-aware context
- no clear hospital signal results in no active hospital context

- [ ] **Step 2: Run the focused context-builder tests to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/context-builder.service.test.ts
```

Expected:
- FAIL because active hospital context is not built yet

### Task 8: Implement pageContext and active hospital context

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/context-builder.service.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`

- [ ] **Step 1: Extend public schema with optional `pageContext`**

Implementation notes:
- start with `HOSPITAL_DETAIL` only
- require `hospitalId` when `type = HOSPITAL_DETAIL`

- [ ] **Step 2: Pass `pageContext` into backend chat/policy inputs**

- [ ] **Step 3: Extend context builder output with `activeHospitalContext`**

Implementation notes:
- derive from pageContext first
- then recent conversation / shortlist / recommendation context
- keep output Dify-safe and deterministic

- [ ] **Step 4: Re-run route and context-builder tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot.routes.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/policy-engine/context-builder.service.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit Chunk 3**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot.schema.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal.routes.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/context-builder.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/chatbot.routes.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/policy-engine/context-builder.service.test.ts
git commit -m "feat: add hospital-aware faq context signals"
```

## Chunk 4: Dify FAQ Category Resolver and Scoped Retrieval

### Task 9: Add failing workflow contract tests

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts`

- [ ] **Step 1: Add failing contract tests for new FAQ branch behavior**

Test should cover:
- workflow contains `faq_categories_http`
- workflow contains `faq_category_resolver_llm`
- workflow contains `faq_scope_gate`
- general FAQ retrieval filters on:
  - `hospital_type`
  - `scope = GENERAL`
  - resolved categories
- hospital FAQ retrieval filters on:
  - `hospital_type`
  - `scope = HOSPITAL`
  - `hospital_id`
  - resolved categories
- general-only path does not require hospital FAQ node execution

- [ ] **Step 2: Run the contract test to confirm failure**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/dify-workflow.contract.test.ts
```

Expected:
- FAIL because the current DSL lacks category-aware FAQ branch nodes

### Task 10: Implement category-aware FAQ nodes in the DSL

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`

- [ ] **Step 1: Add `faq_categories_http`**

Implementation notes:
- use env-backed CRM base URL and internal secret
- pass `hospitalType`
- pass optional `hospitalId` when available from context

- [ ] **Step 2: Add `faq_category_resolver_llm`**

Implementation notes:
- constrain output to the provided category list
- output `1-3` category names max
- output FAQ scope hint only; backend remains authority for policy

- [ ] **Step 3: Add `faq_scope_gate`, `general_faq_kr`, `hospital_faq_kr`, and normalizer**

Implementation notes:
- keep general-only path free of hospital FAQ retrieval
- keep hospital-aware path able to combine hospital FAQ + general FAQ
- preserve current prompt input aggregation strategy

- [ ] **Step 4: Update composer input contract to distinguish general vs hospital FAQ context**

- [ ] **Step 5: Re-run workflow contract tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/dify-workflow.contract.test.ts
```

Expected:
- PASS

- [ ] **Step 6: Commit Chunk 4**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/dify-workflow.contract.test.ts
git commit -m "feat: add category-aware faq retrieval workflow"
```

## Chunk 5: Full Regression and Manual E2E

### Task 11: Run focused automated regression

**Files:**
- Verify only

- [ ] **Step 1: Run application and API tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/ai-sync-task.service.test.ts src/use-cases/ai-sync/process-ai-sync-outbox.use-case.test.ts src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.test.ts src/services/__tests__/policy-engine/context-builder.service.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec vitest run src/__tests__/internal.faq-categories.test.ts src/__tests__/chatbot.routes.test.ts src/__tests__/dify-workflow.contract.test.ts
```

Expected:
- PASS

- [ ] **Step 2: Run TypeScript validation**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec tsc --noEmit
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec tsc --noEmit
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure exec tsc --noEmit
```

Expected:
- PASS or only pre-existing unrelated failures documented

### Task 12: Manual Dify + CRM smoke test

**Files:**
- Verify only

- [ ] **Step 1: Re-import and publish the updated DSL in local Dify**

Expected:
- workflow environment variables still configured:
  - `crm_base_url`
  - `internal_api_secret`

- [ ] **Step 2: Run general FAQ smoke**

Run:

```bash
curl -i -c /tmp/chatbot.cookies \
  -X POST http://localhost:3001/api/v2/chatbot/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId":"faq-category-e2e-1",
    "hospitalType":"COSMETIC",
    "message":"What documents do I need before consultation?"
  }'
```

Expected:
- answer comes from general FAQ only
- no hospital-specific FAQ leakage

- [ ] **Step 3: Run hospital-aware FAQ smoke**

Run:

```bash
curl -i -b /tmp/chatbot.cookies \
  -X POST http://localhost:3001/api/v2/chatbot/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId":"faq-category-e2e-2",
    "hospitalType":"COSMETIC",
    "message":"What documents does this hospital need before review?",
    "pageContext":{
      "type":"HOSPITAL_DETAIL",
      "hospitalId":"hosp_123",
      "hospitalName":"ABC Clinic"
    }
  }'
```

Expected:
- answer can reference both:
  - hospital FAQ for `hosp_123`
  - general FAQ support
- hospital-specific facts are clearly framed as hospital-specific

- [ ] **Step 4: Run multi-category smoke**

Run:

```bash
curl -i -b /tmp/chatbot.cookies \
  -X POST http://localhost:3001/api/v2/chatbot/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId":"faq-category-e2e-3",
    "hospitalType":"COSMETIC",
    "message":"What documents do I need, and how long does the consultation process usually take?"
  }'
```

Expected:
- bounded cross-category answer
- no broad irrelevant FAQ drift

- [ ] **Step 5: Commit final regression-safe changes**

```bash
git add -A
git commit -m "feat: add category-aware faq retrieval"
```

## Notes for the Implementer

- Do not invent a new topic taxonomy. CRM category names are the only truth source.
- Do not allow hospital-specific FAQ retrieval without a real hospital signal.
- Keep general-only behavior conservative.
- Preserve the current backend-authoritative policy boundary.
- Prefer narrow retrieval over wide retrieval when category resolution is uncertain.
- Keep the Dify graph change scoped to the FAQ branch. Do not redesign unrelated hospital/package branches unless a test forces it.
