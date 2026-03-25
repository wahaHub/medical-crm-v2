# Materials Case Gallery Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace before/after case image semantics with an ordered multi-image gallery, and render only the first image as cover in hospital materials.

**Architecture:** Update the shared domain and API contracts so case images are a generic ordered array (`{ url: string }`). Propagate the contract through application use-cases, repository implementations, compatibility mappers, and hospital UI. Preserve existing DB schema compatibility by persisting `sort_order` and no longer relying on `image_type`.

**Tech Stack:** Next.js (hospital app), Hono + Zod (API), TypeScript monorepo packages, Supabase repositories, Vitest.

---

### Task 1: Contract refactor (domain + API + use-cases)

**Files:**
- Modify: `packages/domain/src/ports/materials-repository.port.ts`
- Modify: `packages/application/src/use-cases/materials/create-before-after-case.use-case.ts`
- Modify: `packages/application/src/use-cases/materials/update-before-after-case.use-case.ts`
- Modify: `apps/api/src/routes/materials.routes.ts`
- Modify: `apps/hospital/src/lib/api-types.ts`

- [ ] Change case image type to ordered gallery (`Array<{ url: string }>`).
- [ ] Remove `type` validation from materials case POST/PUT schemas.
- [ ] Keep endpoint paths stable, only update payload/response shape.

### Task 2: Infrastructure mapping and persistence

**Files:**
- Modify: `packages/infrastructure/services/materials-compat.ts`
- Modify: `packages/infrastructure/supabase-main/supabase-materials.repository.ts`
- Modify: `packages/infrastructure/supabase-china/china-medical-materials.repository.ts`
- Modify: `packages/infrastructure/supabase-main/types.ts`

- [ ] Update mapper to output ordered image URLs without semantic type labels.
- [ ] Persist case images by `image_url` + `sort_order`; avoid depending on `image_type`.
- [ ] Keep legacy fallbacks for URL derivation where required.

### Task 3: Hospital UI refactor (edit + display)

**Files:**
- Modify: `apps/hospital/src/components/materials-tabs.tsx`

- [ ] Replace before/after modal inputs with single multi-image uploader area.
- [ ] Save in upload order to `images: [{ url }]`.
- [ ] Render only first image on case cards and remove before/after split UI.

### Task 4: Tests and verification

**Files:**
- Modify: `packages/infrastructure/__tests__/unit/materials-compat.test.ts`
- Modify: `packages/infrastructure/__tests__/unit/materials-mappers.test.ts`
- (Optional) Modify: `apps/api/src/__tests__/materials.routes.test.ts`

- [ ] Update unit expectations for generic ordered gallery images.
- [ ] Run targeted tests for API/infrastructure/hospital as available.
- [ ] Run lint/type checks on touched areas.
