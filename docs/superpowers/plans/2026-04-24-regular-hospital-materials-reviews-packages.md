# Regular Hospital Materials Reviews And Packages Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Reviews` and `Packages` tabs to the regular hospital `/materials` page so hospital staff can manage hospital-level patient reviews and full package detail content that powers the Hospital Navigator reviews section, package cards, and package detail pages.

**Architecture:** Keep `Reviews` in the hospital materials domain beside existing materials content, but model `Packages` as a dedicated hospital-owned materials resource edited from the same `/materials` page. Reuse the existing hospital portal stack end-to-end: API v2 materials routes, Next.js proxy routes, React Query hooks, server actions, upload flow, translation infrastructure, and materials tab chrome. Because `materials-tabs.tsx` is already very large, split the new UI into focused tab/editor components instead of adding another large inline block.

**Tech Stack:** Next.js 15 app router, React 19, TanStack Query, Hono + Zod OpenAPI, TypeScript, Vitest, pnpm workspaces, shared locale JSON bundles, existing Supabase-backed materials repositories.

---

## File Structure

### Existing files to modify

- `apps/api/src/routes/materials.routes.ts`
- `apps/api/src/__tests__/materials.routes.test.ts`
- `apps/hospital/src/app/(portal)/materials/page.tsx`
- `apps/hospital/src/app/api/materials/route.ts`
- `apps/hospital/src/app/api/materials/procedures/route.ts`
- `apps/hospital/src/app/api/materials/surgeons/route.ts`
- `apps/hospital/src/app/api/materials/cases/route.ts`
- `apps/hospital/src/actions/materials-actions.ts`
- `apps/hospital/src/components/materials-tabs.tsx`
- `apps/hospital/src/lib/materials-payload.ts`
- `apps/hospital/src/__tests__/materials-payload.test.ts`
- `apps/hospital/src/lib/api-types.ts`
- `apps/hospital/src/queries/use-materials.ts`
- `apps/hospital/src/__tests__/materials-tabs.test.ts`
- `packages/application/src/index.ts`
- `packages/domain/src/ports/materials-repository.port.ts`
- `packages/infrastructure/services/routing-materials.repository.ts`
- `packages/infrastructure/supabase-main/supabase-materials.repository.ts`
- `packages/infrastructure/supabase-china/china-medical-materials.repository.ts`
- `packages/infrastructure/database/migrations/040_materials_reviews_and_packages.sql`
- `packages/shared/i18n/src/locales/en.json`
- `packages/shared/i18n/src/locales/zh.json`
- `packages/shared/i18n/src/locales/fr.json`
- `packages/shared/i18n/src/locales/de.json`
- `packages/shared/i18n/src/locales/es.json`
- `packages/shared/i18n/src/locales/bn.json`

### New files to create

- `apps/hospital/src/app/api/materials/reviews/route.ts`
- `apps/hospital/src/app/api/materials/packages/route.ts`
- `apps/hospital/src/app/api/materials/reviews/[id]/route.ts`
- `apps/hospital/src/app/api/materials/packages/[id]/route.ts`
- `apps/hospital/src/components/materials/reviews-tab.tsx`
- `apps/hospital/src/components/materials/packages-tab.tsx`
- `apps/hospital/src/components/materials/package-editor.tsx`
- `packages/application/src/use-cases/materials/get-reviews.use-case.ts`
- `packages/application/src/use-cases/materials/create-review.use-case.ts`
- `packages/application/src/use-cases/materials/update-review.use-case.ts`
- `packages/application/src/use-cases/materials/delete-review.use-case.ts`
- `packages/application/src/use-cases/materials/get-packages.use-case.ts`
- `packages/application/src/use-cases/materials/get-package.use-case.ts`
- `packages/application/src/use-cases/materials/create-package.use-case.ts`
- `packages/application/src/use-cases/materials/update-package.use-case.ts`
- `packages/application/src/use-cases/materials/delete-package.use-case.ts`

### Responsibility map

- `materials-repository.port.ts` owns the domain contracts for hospital materials, hospital reviews, and hospital packages.
- `packages/application/src/use-cases/materials/*` owns hospital access checks and CRUD orchestration.
- `materials.routes.ts` owns `/api/v2/hospitals/{hospitalId}/materials/*` route contracts and request validation.
- `apps/hospital/src/app/api/materials/*` owns session-aware proxying from the hospital app to API v2.
- `use-materials.ts` owns query hooks for reads.
- `materials-actions.ts` owns server actions for writes and upload-aware revalidation.
- `reviews-tab.tsx` owns the review list and review editor flow.
- `packages-tab.tsx` owns package list management.
- `package-editor.tsx` owns package section editing and nested sub-item management.
- `materials-tabs.tsx` remains the composition shell and conditional tab registration point.
- `materials-payload.ts` owns the consumer-facing review/package payload mapping helpers.

---

## Chunk 1: Backend Contracts And CRUD Surface

### Task 1: Add failing repository and route tests for reviews and packages

**Files:**
- Modify: `packages/domain/src/ports/materials-repository.port.ts`
- Modify: `apps/api/src/__tests__/materials.routes.test.ts`

- [ ] **Step 1: Write failing route assertions for the new endpoints**

```ts
it('registers hospital materials review CRUD routes', async () => {
  expect(routeSource).toContain('/api/v2/hospitals/{hospitalId}/materials/reviews');
  expect(routeSource).toContain('/api/v2/hospitals/{hospitalId}/materials/reviews/{id}');
});

it('registers hospital materials package CRUD routes', async () => {
  expect(routeSource).toContain('/api/v2/hospitals/{hospitalId}/materials/packages');
  expect(routeSource).toContain('/api/v2/hospitals/{hospitalId}/materials/packages/{id}');
});
```

- [ ] **Step 2: Run the API route test to verify it fails**

Run:

```bash
pnpm --filter @medical-crm/api exec vitest run src/__tests__/materials.routes.test.ts
```

Expected: FAIL because the new reviews/packages route paths are not present yet.

- [ ] **Step 3: Extend the materials repository port with review and package contracts**

Add focused interfaces and methods:

```ts
export interface MaterialsReview { /* hospital review fields from spec */ }
export interface MaterialsPackage { /* package fields including nested arrays */ }

listReviews(hospitalId: string): Promise<MaterialsReview[]>;
createReview(data: Omit<MaterialsReview, 'id'>): Promise<MaterialsReview>;
updateReview(id: string, hospitalId: string, data: Partial<MaterialsReview>): Promise<MaterialsReview>;
deleteReview(id: string, hospitalId: string): Promise<void>;

listPackages(hospitalId: string): Promise<MaterialsPackage[]>;
getPackage(id: string, hospitalId: string): Promise<MaterialsPackage | null>;
createPackage(data: Omit<MaterialsPackage, 'id'>): Promise<MaterialsPackage>;
updatePackage(id: string, hospitalId: string, data: Partial<MaterialsPackage>): Promise<MaterialsPackage>;
deletePackage(id: string, hospitalId: string): Promise<void>;
```

- [ ] **Step 4: Re-run the route test to keep it red for the right reason**

Run:

```bash
pnpm --filter @medical-crm/api exec vitest run src/__tests__/materials.routes.test.ts
```

Expected: still FAIL, but only because the routes are not implemented yet.

- [ ] **Step 5: Commit the contract-only checkpoint**

```bash
git add packages/domain/src/ports/materials-repository.port.ts apps/api/src/__tests__/materials.routes.test.ts
git commit -m "test(materials): add reviews and packages route expectations"
```

### Task 2: Add application use cases and API routes for reviews and packages

**Files:**
- Create: `packages/application/src/use-cases/materials/get-reviews.use-case.ts`
- Create: `packages/application/src/use-cases/materials/create-review.use-case.ts`
- Create: `packages/application/src/use-cases/materials/update-review.use-case.ts`
- Create: `packages/application/src/use-cases/materials/delete-review.use-case.ts`
- Create: `packages/application/src/use-cases/materials/get-packages.use-case.ts`
- Create: `packages/application/src/use-cases/materials/get-package.use-case.ts`
- Create: `packages/application/src/use-cases/materials/create-package.use-case.ts`
- Create: `packages/application/src/use-cases/materials/update-package.use-case.ts`
- Create: `packages/application/src/use-cases/materials/delete-package.use-case.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `apps/api/src/routes/materials.routes.ts`
- Modify: `apps/api/src/__tests__/materials.routes.test.ts`

- [ ] **Step 1: Write failing API tests for a regular hospital listing reviews and packages**

Add focused tests mirroring the current materials patterns:

```ts
it('returns materials reviews for a hospital actor', async () => {
  mockServices.getReviews.execute.mockResolvedValue([{ id: reviewId, patientName: 'Sarah', rating: 5 }]);
  const res = await app.request(`/api/v2/hospitals/${hospitalId}/materials/reviews`, { headers });
  expect(res.status).toBe(200);
});
```

```ts
it('creates a materials package with nested detail sections', async () => {
  const payload = { title: 'Premium LASIK', slug: 'premium-lasik', summary: '...', includes: [] };
  const res = await app.request(`/api/v2/hospitals/${hospitalId}/materials/packages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  expect(res.status).toBe(201);
});

it('rejects invalid review payloads', async () => {
  const res = await app.request(`/api/v2/hospitals/${hospitalId}/materials/reviews`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ patientName: '', rating: 6, reviewComment: '', reviewDate: 'not-a-date' }),
  });
  expect(res.status).toBe(400);
});

it('rejects invalid review media payloads', async () => {
  const res = await app.request(`/api/v2/hospitals/${hospitalId}/materials/reviews`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      patientName: 'Sarah',
      rating: 5,
      reviewComment: 'Great care',
      media: [{ type: 'gif', url: 'https://example.com/review.gif' }],
    }),
  });
  expect(res.status).toBe(400);
});

it('rejects invalid package payloads', async () => {
  const res = await app.request(`/api/v2/hospitals/${hospitalId}/materials/packages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: '', slug: '', price: 'abc', currency: '', summary: '', coverImageUrl: '' }),
  });
  expect(res.status).toBe(400);
});

it('rejects invalid package review rating payloads', async () => {
  const res = await app.request(`/api/v2/hospitals/${hospitalId}/materials/packages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Premium LASIK',
      slug: 'premium-lasik',
      price: '1200',
      currency: 'USD',
      summary: 'Summary',
      coverImageUrl: 'https://example.com/cover.jpg',
      reviews: [{ reviewerName: 'Jane', reviewerCountry: 'US', rating: 6, reviewDate: '2026-04-24', comment: 'Great' }],
    }),
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run the API route tests to verify they fail**

Run:

```bash
pnpm --filter @medical-crm/api exec vitest run src/__tests__/materials.routes.test.ts
```

Expected: FAIL because the services/routes do not exist.

- [ ] **Step 3: Implement the new materials application use cases**

Follow the existing materials use-case style:

- require hospital access via actor checks
- delegate to `IMaterialsRepository`
- keep validation close to route schema or entity shape, not duplicated in UI

Use concise classes like:

```ts
export class GetReviewsUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}
  async execute(hospitalId: string, actor: Actor) { /* authorize + list */ }
}
```

- [ ] **Step 4: Export the new use cases from `packages/application/src/index.ts`**

Add named exports beside the existing materials exports so `getServices()` can wire them.

- [ ] **Step 5: Extend `apps/api/src/routes/materials.routes.ts`**

Add:

- review list/create/update/delete routes
- package list/get/create/update/delete routes
- Zod schemas for nested arrays:
  - review media
  - package gallery
  - tags
  - includes
  - process
  - cases
  - package reviews
- explicit field-level validation for:
  - review `patientName` required
  - review `rating` integer 1-5
  - review `reviewComment` required
  - review `reviewDate` valid when present
  - package `title` required
  - package `slug` required and unique per hospital
  - package `price` required numeric format
  - package `currency` required
  - package `summary` required
  - package `coverImageUrl` required
  - reasonable text length caps to prevent consumer layout overflow

Keep request schemas route-local unless a second caller needs shared validation immediately.

- [ ] **Step 6: Re-run the API route tests to verify they pass**

Run:

```bash
pnpm --filter @medical-crm/api exec vitest run src/__tests__/materials.routes.test.ts
```

Expected: PASS for the new review/package route coverage.

- [ ] **Step 7: Commit the application and route layer**

```bash
git add packages/application/src/use-cases/materials packages/application/src/index.ts apps/api/src/routes/materials.routes.ts apps/api/src/__tests__/materials.routes.test.ts
git commit -m "feat(materials): add review and package api use cases"
```

### Task 3: Implement repository wiring for Supabase-backed materials storage

**Files:**
- Modify: `packages/infrastructure/services/routing-materials.repository.ts`
- Modify: `packages/infrastructure/supabase-main/supabase-materials.repository.ts`
- Modify: `packages/infrastructure/supabase-china/china-medical-materials.repository.ts`
- Create: `packages/infrastructure/database/migrations/040_materials_reviews_and_packages.sql`

- [ ] **Step 1: Write failing repository-level tests for list/create/update coverage where test seams already exist**

If a dedicated materials repository test exists, extend it. If not, add focused route tests first and use typecheck as the lower-cost guardrail for this task.

Suggested failing shape:

```ts
expect(await repo.listReviews(hospitalId)).toEqual(expect.arrayContaining([
  expect.objectContaining({ patientName: 'Sarah', rating: 5 }),
]));
```

- [ ] **Step 2: Run the affected repository or integration test**

Run one of:

```bash
pnpm --filter @medical-crm/infrastructure exec vitest run supabase-main/supabase-materials.repository.test.ts
```

or, if no such test file exists yet:

```bash
pnpm --filter @medical-crm/infrastructure typecheck
```

Expected: FAIL or type errors because the new repository methods are not implemented.

- [ ] **Step 3: Implement repository method forwarding in `routing-materials.repository.ts`**

Mirror the existing patterns:

```ts
async listReviews(hospitalId: string) {
  const repo = await this.getRepoForHospital(hospitalId);
  return repo.listReviews(hospitalId);
}
```

- [ ] **Step 4: Add the concrete storage migration before repository writes**

Create `packages/infrastructure/database/migrations/040_materials_reviews_and_packages.sql` with the hospital-scoped storage needed for:

- hospital materials reviews
- hospital materials packages
- any nested package substructures, either as JSON columns or normalized child tables
- per-hospital package slug uniqueness enforcement

Run:

```bash
pnpm --filter @medical-crm/infrastructure db:generate
```

Expected: the new migration is recorded and ready before repository code depends on it.

- [ ] **Step 5: Implement review/package persistence in `supabase-materials.repository.ts`**

Store:

- reviews in a hospital-scoped reviews table or equivalent backing store
- packages in a hospital-scoped packages table or equivalent backing store

Requirements:

- preserve hospital ownership on all operations
- map nested arrays consistently
- reject duplicate slugs within the same hospital
- round-trip all fields needed by the spec

- [ ] **Step 6: Implement interface-complete behavior in `china-medical-materials.repository.ts`**

Regular hospital materials route through the China materials repository, so these methods must be fully implemented against the same concrete storage contract. Do not leave the China path as a no-op, an empty array fallback, or a stub that hides missing persistence work.

- [ ] **Step 7: Re-run repository/infrastructure checks**

Run:

```bash
pnpm --filter @medical-crm/infrastructure exec vitest run __tests__/unit/translation-writeback.service.test.ts
pnpm --filter @medical-crm/infrastructure typecheck
pnpm --filter @medical-crm/api exec vitest run src/__tests__/materials.routes.test.ts
```

Expected: PASS with no missing method errors.

- [ ] **Step 8: Commit the repository layer**

```bash
git add packages/infrastructure/services/routing-materials.repository.ts packages/infrastructure/supabase-main/supabase-materials.repository.ts packages/infrastructure/supabase-china/china-medical-materials.repository.ts packages/infrastructure/database/migrations/040_materials_reviews_and_packages.sql
git commit -m "feat(materials): persist hospital reviews and packages"
```

---

## Chunk 2: Hospital App Data Plumbing

### Task 4: Add Next.js proxy routes, DTOs, hooks, and server actions

**Files:**
- Create: `apps/hospital/src/app/api/materials/reviews/route.ts`
- Create: `apps/hospital/src/app/api/materials/packages/route.ts`
- Modify: `apps/hospital/src/lib/api-types.ts`
- Modify: `apps/hospital/src/queries/use-materials.ts`
- Modify: `apps/hospital/src/actions/materials-actions.ts`

- [ ] **Step 1: Write failing hospital app tests or source assertions for the new data plumbing**

Extend the source-based materials tab test with expectations such as:

```ts
expect(source).toContain("queryKey: ['materials', 'reviews']");
expect(source).toContain("queryKey: ['materials', 'packages']");
expect(source).toContain("/api/materials/reviews");
expect(source).toContain("/api/materials/packages");
expect(source).toContain("/api/materials/packages/${id}");
```

- [ ] **Step 2: Run the hospital materials test to verify it fails**

Run:

```bash
pnpm --filter @medical-crm/hospital exec vitest run src/__tests__/materials-tabs.test.ts
```

Expected: FAIL because the new hooks/routes/actions are not present.

- [ ] **Step 3: Add app proxy routes for reviews and packages**

Use the same shape as existing proxy files:

```ts
export async function GET(): Promise<Response> {
  const hospitalId = await getSessionHospitalId();
  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/materials/reviews`);
  return Response.json(await res.json(), { status: res.status });
}
```

Do the same for packages, and add the id-based proxy routes needed by item-level operations:

- `apps/hospital/src/app/api/materials/reviews/[id]/route.ts` for review update/delete
- `apps/hospital/src/app/api/materials/packages/[id]/route.ts` for package detail/update/delete

Follow the existing `cases/[id]/route.ts` style for param-driven reads, and keep the collection routes separate from the item routes.

- [ ] **Step 4: Extend `api-types.ts` with `MaterialsReviewDTO` and `MaterialsPackageDTO`**

Model nested DTOs explicitly so the React tab components do not operate on `Record<string, unknown>`.

- [ ] **Step 5: Extend `use-materials.ts` with `useReviews()`, `usePackages()`, and a package detail hook**

```ts
export function useReviews() {
  return useQuery({ queryKey: ['materials', 'reviews'], queryFn: () => queryFetch('/api/materials/reviews') });
}

export function usePackage(id: string) {
  return useQuery({
    queryKey: ['materials', 'packages', id],
    queryFn: () => queryFetch(`/api/materials/packages/${id}`),
    enabled: !!id,
  });
}
```

- [ ] **Step 6: Extend `materials-actions.ts` with CRUD server actions**

Add:

- `createReview`
- `updateReview`
- `deleteReview`
- `createMaterialsPackage`
- `updateMaterialsPackage`
- `deleteMaterialsPackage`

Requirements:

- use `getSessionHospitalId()`
- revalidate `/materials`
- preserve the current debug/upload conventions
- add package slug collision summaries when possible
- enqueue translation tasks for the spec's translatable fields:
  - hospital reviews: `treatmentName`, `reviewTitle`, `reviewComment`
  - packages: `title`, `subtitle`, `summary`, `includes[].text`, `process[].stepTitle`, `process[].description`, `cases[].story`, `cases[].result`, `reviews[].comment`

- [ ] **Step 7: Re-run the hospital materials test to verify the plumbing expectations pass**

Run:

```bash
pnpm --filter @medical-crm/hospital exec vitest run src/__tests__/materials-tabs.test.ts
```

Expected: PASS for the new route/hook/action string coverage, or fail only on missing UI references not yet added.

- [ ] **Step 8: Commit the hospital app data layer**

```bash
git add apps/hospital/src/app/api/materials apps/hospital/src/lib/api-types.ts apps/hospital/src/queries/use-materials.ts apps/hospital/src/actions/materials-actions.ts apps/hospital/src/__tests__/materials-tabs.test.ts
git commit -m "feat(hospital): wire reviews and packages materials data"
```

---

## Chunk 3: Materials UI, I18n, And Verification

### Task 5: Register the new tabs and extract focused UI components

**Files:**
- Modify: `apps/hospital/src/components/materials-tabs.tsx`
- Create: `apps/hospital/src/components/materials/reviews-tab.tsx`
- Create: `apps/hospital/src/components/materials/packages-tab.tsx`
- Create: `apps/hospital/src/components/materials/package-editor.tsx`
- Modify: `apps/hospital/src/__tests__/materials-tabs.test.ts`

- [ ] **Step 1: Write failing tests for regular-only tab visibility and new translation keys**

Add assertions like:

```ts
expect(source).toContain("hospital.materials.tabs.reviews");
expect(source).toContain("hospital.materials.tabs.packages");
expect(source).toContain("isRegular &&");
```

Add a runtime behavior test that mounts the materials tabs and proves:

- regular hospitals see `Reviews` and `Packages`
- cosmetic hospitals do not see `Reviews` and `Packages`

- [ ] **Step 2: Run the hospital materials test to verify it fails**

Run:

```bash
pnpm --filter @medical-crm/hospital exec vitest run src/__tests__/materials-tabs.test.ts
```

Expected: FAIL because the tab chrome and components are missing.

- [ ] **Step 3: Add the tab registration in `materials-tabs.tsx`**

Requirements:

- show `Reviews` and `Packages` only for regular hospitals
- keep the tab shell localized
- import focused components instead of implementing both tabs inline inside the already-large file
- make the package list card surface show the spec-required summary fields:
  - cover image
  - title
  - subtitle
  - price and currency
  - duration
  - tags
  - active state
  - package review count
  - patient case count
- include list-level controls for add, edit, delete, reorder, and active/inactive toggle

- [ ] **Step 4: Implement `reviews-tab.tsx`**

Behavior:

- list reviews
- add/edit modal or side panel with `Basic Info`, `Content`, and `Media` sections
- `Basic Info` fields:
  - patient name
  - patient country
  - patient avatar
  - treatment name
  - rating
  - review date
  - featured
  - active
- `Content` fields:
  - review title
  - review comment
- `Media` fields:
  - image and video uploads
  - thumbnail URL
  - caption
  - media ordering / sort order
- inline load failures in the editor should render inside the panel instead of collapsing the tab
- save failures should toast and preserve the current input state
- active toggle
- delete confirmation
- ordering controls
- media upload and preview

Use the current materials component vocabulary:

- `Button`
- `Modal`
- `EmptyState`
- `LoadingSpinner`
- the existing upload helpers and error formatting

- [ ] **Step 5: Implement `packages-tab.tsx` and `package-editor.tsx`**

Behavior:

- package list card grid or list
- edit button opens the package editor
- add/delete/reorder/active toggle controls in the list header or each card row
- inline load failures in the editor should render inside the panel instead of collapsing the tab
- save failures should toast and preserve the current input state
- section-specific package save errors should identify the failing editor section
- delete confirmation is required before destructive actions
- slug collisions must surface a concrete user-facing error
- package editor sections:
  - Basic
  - Commercial
  - Overview
  - Includes
  - Treatment Process
  - Patient Evidence

Support nested array editing for:

- gallery
- tags
- includes
- process
- patient cases
- package reviews

- [ ] **Step 6: Re-run the hospital materials tests**

Run:

```bash
pnpm --filter @medical-crm/hospital exec vitest run src/__tests__/materials-tabs.test.ts
```

Expected: PASS for new tab visibility and source coverage.

- [ ] **Step 7: Commit the materials UI**

```bash
git add apps/hospital/src/components/materials-tabs.tsx apps/hospital/src/components/materials apps/hospital/src/__tests__/materials-tabs.test.ts
git commit -m "feat(hospital): add materials reviews and packages tabs"
```

### Task 6: Add locale coverage for the new reviews and packages strings

**Files:**
- Modify: `packages/shared/i18n/src/locales/en.json`
- Modify: `packages/shared/i18n/src/locales/zh.json`
- Modify: `packages/shared/i18n/src/locales/fr.json`
- Modify: `packages/shared/i18n/src/locales/de.json`
- Modify: `packages/shared/i18n/src/locales/es.json`
- Modify: `packages/shared/i18n/src/locales/bn.json`
- Modify: `apps/hospital/src/__tests__/materials-tabs.test.ts`

- [ ] **Step 1: Write failing locale bundle expectations**

Add keys such as:

- `hospital.materials.tabs.reviews`
- `hospital.materials.tabs.packages`
- `hospital.materials.reviews.*`
- `hospital.materials.packages.*`

- [ ] **Step 2: Run the locale coverage test to verify it fails**

Run:

```bash
pnpm --filter @medical-crm/hospital exec vitest run src/__tests__/materials-tabs.test.ts
```

Expected: FAIL because the new keys are missing from one or more locale files.

- [ ] **Step 3: Add the translations to every locale bundle**

Cover:

- tab labels
- empty states
- form sections
- field labels
- validation summaries
- review and package row actions
- package editor section headings

Also verify the new fields participate in the existing translation/writeback flow by extending the relevant materials translation tests, not just the UI copy catalog.

- [ ] **Step 4: Re-run the locale coverage test**

Run:

```bash
pnpm --filter @medical-crm/hospital exec vitest run src/__tests__/materials-tabs.test.ts
```

Expected: PASS for locale key coverage.

- [ ] **Step 5: Commit the locale bundle update**

```bash
git add packages/shared/i18n/src/locales apps/hospital/src/__tests__/materials-tabs.test.ts
git commit -m "feat(i18n): add materials reviews and packages copy"
```

### Task 7: Verify translation writeback and consumer payload mapping

**Files:**
- Modify: `packages/infrastructure/__tests__/unit/translation-writeback.service.test.ts`
- Modify: `apps/hospital/src/lib/materials-payload.ts`
- Modify: `apps/hospital/src/__tests__/materials-payload.test.ts`

- [ ] **Step 1: Add failing translation writeback coverage for reviews and packages**

Extend the existing translation writeback tests so they assert the new review/package translatable fields are merged back into the correct storage shape.

- [ ] **Step 2: Add failing consumer payload mapping coverage**

Extend the hospital materials payload tests so they verify the stored review/package shapes map into the consumer-facing Hospital Navigator payloads for:

- `PatientReviews`
- `PackageList`
- `PackageDetail`

For `PackageDetail`, make the contract explicit about:

- gallery images
- tags
- title and subtitle
- price and currency
- duration
- summary
- includes
- treatment process
- hospital identity context used in the detail page and PDF export path
- cases
- package-level patient reviews
- PDF-exported fields derived from the same package detail surface

- [ ] **Step 3: Implement the mapping helpers and writeback assertions**

Keep the editor/storage shapes separate from the consumer contract. The tests should prove that translation-writeback and consumer mapping both preserve the fields required by the spec while omitting editor-only metadata.

- [ ] **Step 4: Re-run the translation and payload tests**

Run:

```bash
pnpm --filter @medical-crm/infrastructure exec vitest run __tests__/unit/translation-writeback.service.test.ts
pnpm --filter @medical-crm/hospital exec vitest run src/__tests__/materials-payload.test.ts
```

Expected: PASS.

### Task 8: Run end-to-end verification for the new slice

**Files:**
- Verify only; no new files required unless a missing test seam is discovered

- [ ] **Step 1: Run focused hospital UI tests**

```bash
pnpm --filter @medical-crm/hospital exec vitest run src/__tests__/materials-tabs.test.ts src/__tests__/materials-operating-hours-modal.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused API tests**

```bash
pnpm --filter @medical-crm/api exec vitest run src/__tests__/materials.routes.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run workspace typechecks for touched packages**

```bash
pnpm --filter @medical-crm/hospital typecheck
pnpm --filter @medical-crm/api typecheck
pnpm --filter @medical-crm/application typecheck
pnpm --filter @medical-crm/infrastructure typecheck
```

Expected: PASS with no new type errors.

- [ ] **Step 4: Run one final git diff review before handoff**

```bash
git diff --stat
git diff -- apps/api/src/routes/materials.routes.ts apps/hospital/src/components/materials-tabs.tsx
```

Expected: only the planned reviews/packages changes plus any intentionally added supporting files.

- [ ] **Step 5: Commit the verification checkpoint if any final cleanup was needed**

```bash
git add -A
git commit -m "test(materials): verify regular hospital reviews and packages flow"
```

Only do this step if verification required follow-up cleanup edits.

---

## Notes And Guardrails

- Keep package storage hospital-scoped and separate from the existing global package entity exposed at `/api/v2/packages`.
- Do not add cosmetic-hospital support in this pass.
- Do not introduce a publish workflow.
- Keep hospital reviews and package reviews as separate data models.
- Prefer extracting new UI into `apps/hospital/src/components/materials/*` rather than further growing `materials-tabs.tsx`.
- If persistence requires new backing tables or columns, land the migration first and then wire both Supabase repositories to that concrete schema. Do not leave the regular-hospital China repository as a no-op or empty fallback, because regular hospital materials route through it.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-24-regular-hospital-materials-reviews-packages.md`. Ready to execute?
