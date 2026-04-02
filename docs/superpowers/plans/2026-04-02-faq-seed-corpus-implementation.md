# FAQ Seed Corpus Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a realistic FAQ seed corpus, import it into CRM, sync it into Dify through the existing FAQ sync path, and run category-aware retrieval evaluation against that seeded corpus.

**Architecture:** Keep CRM as the source of truth. Generate one seed JSON under `docs/seed-data/`, add a local import path that creates CRM FAQ categories and FAQ items from that JSON, then use the existing AI sync/outbox flow to refresh Dify datasets. Add an evaluation runner that exercises retrieval queries and records expected-vs-actual behavior.

**Tech Stack:** TypeScript, Node.js, pnpm, existing CRM application/use-case layer, Postgres/Drizzle repositories, Dify datasets via existing AI sync pipeline.

---

## File Map

### Existing files to modify

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts`
  - Wire any new seed-import or evaluation service entrypoints if needed.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/index.ts`
  - Export any new seed import / evaluation use cases.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/ai-sync-task.service.ts`
  - Only if seed import needs additional helper metadata behavior or explicit resync helpers.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/create-faq-category.use-case.ts`
  - Reuse for import flow if practical.
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/create-faq-item.use-case.ts`
  - Reuse for import flow if practical.

### New files to create

- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/seed-data/faq-category-aware-retrieval.seed.json`
  - The canonical seed corpus source file.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/seed-data/faq-category-aware-retrieval.readme.md`
  - Human-readable explanation of the seed structure, category model, example hospitals, and evaluation buckets.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts`
  - Imports categories and FAQ items from the seed JSON into CRM.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.test.ts`
  - Focused tests for seed import behavior.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.ts`
  - Loads evaluation queries and runs retrieval checks through the current backend/Dify-aware path or through a stubbed evaluator for local verification.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.test.ts`
  - Tests for query parsing and evaluation bookkeeping.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal-faq-eval.routes.ts`
  - Optional internal route for manual triggering/reporting if we decide route-based execution is useful.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/__tests__/internal-faq-eval.routes.test.ts`
  - API test only if the internal route is added.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/generate-faq-seed.ts`
  - Script that writes the large seed JSON and README from deterministic templates/content builders.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/import-faq-seed.ts`
  - Local operator script to load the seed into CRM.
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/evaluate-faq-retrieval.ts`
  - Local operator script to run evaluation queries and output a report.

### Likely existing docs to update later

- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/superpowers/specs/2026-03-31-dify-chatbot-workflow-explainer.md`
  - Only if the evaluation path changes how FAQ testing is explained.

## Chunk 1: Seed Corpus Source Files

### Task 1: Create deterministic seed corpus generator

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/generate-faq-seed.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/seed-data/faq-category-aware-retrieval.seed.json`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/seed-data/faq-category-aware-retrieval.readme.md`

- [ ] **Step 1: Write the failing generator test or smoke assertion**

Use a lightweight script-level assertion strategy:

```bash
node --import tsx /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/generate-faq-seed.ts --check
```

Expected initially:
- FAIL because generator does not exist.

- [ ] **Step 2: Implement the generator with deterministic content builders**

The script should:
- emit one JSON file with:
  - `categories`
  - `faqItems`
  - `evaluationQueries`
- include:
  - `COSMETIC` and `REGULAR`
  - 12 general categories per domain
  - 3 example hospitals per domain
  - 6 hospital-specific categories per hospital
  - realistic synonym and compound-question variation
- write a README summarizing:
  - category sets
  - example hospitals
  - counts
  - evaluation buckets

Implementation notes:
- Use stable IDs instead of random IDs
- Keep content deterministic so diffs stay reviewable
- Prefer helper functions such as:
  - `buildCosmeticGeneralFaq()`
  - `buildRegularGeneralFaq()`
  - `buildHospitalFaq()`
  - `buildEvaluationQueries()`

- [ ] **Step 3: Run the generator**

Run:

```bash
node --import tsx /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/generate-faq-seed.ts
```

Expected:
- seed JSON written to `docs/seed-data/faq-category-aware-retrieval.seed.json`
- README written to `docs/seed-data/faq-category-aware-retrieval.readme.md`

- [ ] **Step 4: Verify corpus shape and counts**

Run:

```bash
node --import tsx -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/seed-data/faq-category-aware-retrieval.seed.json','utf8')); console.log({categories:data.categories.length, faqItems:data.faqItems.length, evaluationQueries:data.evaluationQueries.length})"
```

Expected:
- category count matches the design target
- FAQ count is roughly 340-440
- evaluation query count is roughly 80

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/generate-faq-seed.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/seed-data/faq-category-aware-retrieval.seed.json /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/seed-data/faq-category-aware-retrieval.readme.md
git commit -m "feat: add faq retrieval seed corpus"
```

## Chunk 2: CRM Import Path

### Task 2: Add a seed import use case that writes categories first, then FAQ items

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.test.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/index.ts`
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts`

- [ ] **Step 1: Write failing tests for import ordering and dedupe behavior**

Test cases:
- creates general categories before FAQ items
- creates hospital-specific categories before hospital FAQ items
- does not invent category names outside the seed
- safely handles reruns (skip/update rather than duplicate where appropriate)

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/use-cases/chatbot-faq/import-faq-seed.use-case.test.ts
```

Expected initially:
- FAIL because the use case does not exist.

- [ ] **Step 2: Implement the import use case**

Implementation rules:
- load the seed JSON from disk
- create or upsert categories first
- create or upsert FAQ items second
- preserve:
  - `hospitalType`
  - `hospitalId`
  - `category`
  - `keywords`
  - `isActive`
- use existing FAQ/category use-case patterns where practical rather than writing direct repository mutations unless the existing use cases are too UI-specific

- [ ] **Step 3: Add a local script wrapper**

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/import-faq-seed.ts`

The script should:
- bootstrap services from composition root or equivalent container
- call `ImportFaqSeedUseCase`
- print:
  - categories created/updated
  - FAQ items created/updated
  - skipped count

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/use-cases/chatbot-faq/import-faq-seed.use-case.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec tsc --noEmit
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/index.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/import-faq-seed.ts
git commit -m "feat: add faq seed import flow"
```

## Chunk 3: Sync Refresh and Dify Corpus Readiness

### Task 3: Ensure imported FAQ records flow into the existing AI sync pipeline

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/ai-sync-task.service.ts` (only if needed)
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts`
- Test: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/ai-sync-task.service.test.ts`

- [ ] **Step 1: Write or extend tests to verify imported hospital/general FAQ both enqueue sync tasks**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/ai-sync-task.service.test.ts
```

Expected initially:
- Add failing assertions only if current sync behavior does not already cover the imported data shape.

- [ ] **Step 2: Verify metadata matches the category-aware retrieval design**

The synced FAQ document metadata must include:
- `faq_id`
- `hospital_type`
- `scope`
- `category`
- `hospital_id`
- `keywords`

If any field is missing or lossy, patch it here.

- [ ] **Step 3: Add operator docs for refresh sequence**

Document or script the sequence:

```bash
node --import tsx /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/import-faq-seed.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api exec tsx src/scripts/bootstrap-ai-sync.ts
```

If a better existing sync trigger exists, use that instead and update the README/plan notes.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/services/__tests__/ai-sync-task.service.test.ts src/use-cases/chatbot-faq/import-faq-seed.use-case.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/ai-sync-task.service.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/__tests__/ai-sync-task.service.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts
git commit -m "feat: sync seeded faq corpus to dify"
```

## Chunk 4: Evaluation Query Runner

### Task 4: Add evaluation runner for category-aware retrieval

**Files:**
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.test.ts`
- Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/evaluate-faq-retrieval.ts`
- Optional Create: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/internal-faq-eval.routes.ts`

- [ ] **Step 1: Write failing tests for evaluation bookkeeping**

The evaluator should record per-query:
- query id
- query text
- expected scope
- expected categories
- actual categories
- actual scope
- pass/fail
- notes

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.test.ts
```

Expected initially:
- FAIL because evaluator does not exist.

- [ ] **Step 2: Implement a first-pass evaluation runner**

For v1, keep it pragmatic:
- load `evaluationQueries` from the seed JSON
- execute against whichever stable layer gives the best signal with the least fragility

Recommended v1 order:
1. call the current chatbot path or internal FAQ category path
2. capture:
   - resolved categories
   - chosen FAQ scope
   - active hospital id when relevant
3. compare with expected query metadata
4. emit a JSON or markdown report

Do not overbuild a full benchmark system yet.

- [ ] **Step 3: Add a local operator script**

The script should output a compact report, for example:

```text
GENERAL_ONLY pass rate: 18/20
HOSPITAL_AWARE pass rate: 16/20
MULTI_CATEGORY pass rate: 14/20
```

Plus detailed failures saved to:

- `docs/seed-data/faq-category-aware-retrieval.eval-report.json`

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec tsc --noEmit
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.test.ts /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/evaluate-faq-retrieval.ts
git commit -m "feat: add faq retrieval evaluation runner"
```

## Chunk 5: End-to-End Local Validation

### Task 5: Import, sync, publish, and run retrieval QA

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/seed-data/faq-category-aware-retrieval.readme.md`
  - Add the exact operator sequence and troubleshooting notes.

- [ ] **Step 1: Generate the seed corpus**

Run:

```bash
node --import tsx /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/generate-faq-seed.ts
```

- [ ] **Step 2: Import it into CRM**

Run:

```bash
node --import tsx /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/import-faq-seed.ts
```

- [ ] **Step 3: Trigger or verify Dify sync**

Run the chosen sync command from Chunk 3 and wait for the Dify datasets to refresh.

- [ ] **Step 4: Re-import and publish the latest Dify workflow if needed**

Use:
- `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`

Confirm:
- environment variables set
- datasets bound
- app published

- [ ] **Step 5: Run evaluation queries**

Run:

```bash
node --import tsx /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/evaluate-faq-retrieval.ts
```

Expected:
- report saved
- clear failure list for misrouted categories or scope leakage

- [ ] **Step 6: Manually spot-check representative live cases**

Cover:
- one `GENERAL_ONLY` cosmetic query
- one `GENERAL_ONLY` regular query
- one `HOSPITAL_AWARE` cosmetic query with `pageContext`
- one `HOSPITAL_AWARE` regular query with `pageContext`
- one `MULTI_CATEGORY` query
- one negative “should not mix hospital FAQ into general answer” query

- [ ] **Step 7: Final verification**

Run:

```bash
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec vitest run src/use-cases/chatbot-faq/import-faq-seed.use-case.test.ts src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.test.ts src/services/__tests__/ai-sync-task.service.test.ts
pnpm -C /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application exec tsc --noEmit
```

Expected:
- PASS

- [ ] **Step 8: Commit**

```bash
git add /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/seed-data/faq-category-aware-retrieval.readme.md
git commit -m "docs: add faq retrieval seed workflow notes"
```

## Notes for Execution

- Use `superpowers:subagent-driven-development` during execution because the work naturally decomposes into:
  - seed generation
  - CRM import
  - sync verification
  - evaluation runner
- Keep commits scoped to one chunk at a time.
- Do not touch unrelated patient auth or conversation changes currently in the working tree.
- Prefer importing into CRM and letting CRM sync to Dify rather than direct Dify document injection.

## Success Criteria

The work is complete when:

- the seed JSON exists and matches the agreed content model
- CRM can import categories and FAQ items from the seed
- imported FAQ records sync into Dify with correct metadata
- evaluation queries can be run repeatedly against the corpus
- we can measure:
  - category routing correctness
  - general vs hospital scope correctness
  - multi-category retrieval quality
