# Hospital Portal Internationalization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development and requested parallel subagents where ownership is disjoint. Steps use checkbox syntax for tracking.

**Goal:** Internationalize `apps/hospital` across `zh`, `en`, `fr`, `de`, `es`, and `bn` while keeping `apps/admin` unchanged.

**Architecture:** Add shared locale utilities in `packages/shared/i18n`, introduce a hospital-only i18n provider in `apps/hospital`, wire locale resolution from hospital user preferences, and migrate hospital page clusters to translated UI copy with safe fallback behavior.

**Tech Stack:** Next.js 15 app router, React 19, workspace package `@medical-crm/i18n`, Vitest, TypeScript.

---

## Chunk 0: Shared Plumbing

### Task 0.1: Extend `@medical-crm/i18n` for runtime usage

**Files:**

- Modify: `packages/shared/i18n/src/index.ts`
- Modify: `packages/shared/i18n/src/__tests__/i18n.test.ts`
- Modify locale JSON files only if new shared keys are required

- [ ] Add locale normalization helper for supported locales.
- [ ] Add nested-key lookup helper for the existing JSON shape.
- [ ] Add a translation helper that combines lookup + interpolation with fallback behavior.
- [ ] Write failing tests first for nested lookup, interpolation, and unsupported locale fallback.
- [ ] Re-run `pnpm --filter @medical-crm/i18n test`.

### Task 0.2: Add hospital-only provider and locale resolution

**Files:**

- Create: `apps/hospital/src/lib/hospital-i18n.tsx` or equivalent split files
- Modify: `apps/hospital/src/lib/auth-context.tsx`
- Modify: `apps/hospital/src/app/layout.tsx`
- Modify: `apps/hospital/src/app/(portal)/layout.tsx`
- Modify: `apps/hospital/src/components/settings-view.tsx`

- [ ] Load effective locale in hospital layout from `preferredLanguage`.
- [ ] Pass locale + messages into a hospital-only provider.
- [ ] Expose `t`, `locale`, and `set/update` affordances needed by settings.
- [ ] Keep admin portal untouched.
- [ ] Add focused regression coverage where practical.

## Chunk 1: Parallel Feature Clusters

### Task 1.1: Shell and auth cluster

**Ownership:**

- `apps/hospital/src/components/portal-shell.tsx`
- `apps/hospital/src/app/error.tsx`
- `apps/hospital/src/app/loading.tsx`
- `apps/hospital/src/app/auth/login/page.tsx`

- [ ] Translate nav labels, header copy, tooltips, placeholders, and global error copy.
- [ ] Ensure login experience uses translated labels without changing admin login behavior.

### Task 1.2: Dashboard and cases cluster

**Ownership:**

- `apps/hospital/src/app/(portal)/dashboard/page.tsx`
- `apps/hospital/src/components/dashboard-widgets.tsx`
- `apps/hospital/src/app/(portal)/cases/page.tsx`
- `apps/hospital/src/app/(portal)/cases/[id]/page.tsx`
- `apps/hospital/src/components/cases-list.tsx`
- `apps/hospital/src/components/case-detail-panel.tsx`
- `apps/hospital/src/components/tabs/case-ai-summary-tab.tsx`
- `apps/hospital/src/components/tabs/case-quote-tab.tsx`

- [ ] Replace hard-coded labels, empty states, placeholders, and tab titles.
- [ ] Reuse `hospital`, `caseDetail`, `status`, and `common` keys where possible.

### Task 1.3: Consultations and messages cluster

**Ownership:**

- `apps/hospital/src/app/(portal)/consultations/page.tsx`
- `apps/hospital/src/app/(portal)/consultations/error.tsx`
- `apps/hospital/src/components/consultations-list.tsx`
- `apps/hospital/src/components/create-consultation-modal.tsx`
- `apps/hospital/src/components/messages-view.tsx`
- `apps/hospital/src/app/(portal)/messages/page.tsx`
- `apps/hospital/src/components/video-room.tsx`

- [ ] Translate page copy, filters, modal labels, message empty states, preview labels, and placeholders.
- [ ] Preserve message body content and translation-preview behavior.

### Task 1.4: Materials cluster

**Ownership:**

- `apps/hospital/src/app/(portal)/materials/page.tsx`
- `apps/hospital/src/components/materials-tabs.tsx`

- [ ] Translate materials shell, section titles, form labels, placeholders, confirmation copy, and empty states.
- [ ] Reuse shared keys when available and add new namespaced keys for materials-specific copy.

### Task 1.5: Content management and preferences cluster

**Ownership:**

- `apps/hospital/src/app/(portal)/email-templates/page.tsx`
- `apps/hospital/src/components/email-templates-list.tsx`
- `apps/hospital/src/app/(portal)/faq/page.tsx`
- `apps/hospital/src/components/faq-list.tsx`
- `apps/hospital/src/app/(portal)/settings/page.tsx`
- `apps/hospital/src/components/settings-view.tsx`

- [ ] Translate list copy, modal copy, form fields, feedback messages, and notification settings.
- [ ] Ensure settings locale options expose `zh/en/fr/de/es/bn`.

## Chunk 2: Integration And Verification

### Task 2.1: Integrate parallel changes and fill remaining missing keys

- [ ] Reconcile any duplicate locale additions.
- [ ] Ensure provider API usage is consistent across server and client components.
- [ ] Spot-check that no admin files were modified unintentionally.

### Task 2.2: Verify

- [ ] Run `pnpm --filter @medical-crm/i18n test`
- [ ] Run `pnpm --filter @medical-crm/i18n typecheck`
- [ ] Run `pnpm --filter @medical-crm/hospital test`
- [ ] Run `pnpm --filter @medical-crm/hospital typecheck`
- [ ] Report any residual untranslated dynamic content that is intentionally out of scope.
