# Hospital Portal Internationalization Design

Date: 2026-04-18

## Summary

We will internationalize the hospital portal in `apps/hospital` without changing the admin portal in `apps/admin`.

This iteration will:

- enable the full locale set already shipped in `@medical-crm/i18n`: `zh`, `en`, `fr`, `de`, `es`, `bn`
- introduce a hospital-only i18n runtime for server and client components
- migrate hospital portal navigation, page shells, and page-specific UI copy away from hard-coded English
- reuse existing shared locale JSON wherever possible and add hospital-specific keys only when the current catalog is missing coverage

This iteration will not:

- internationalize the admin portal
- redesign copy outside the hospital portal scope
- localize backend data values that arrive already authored by users or upstream systems

## Goals

- Keep all i18n work isolated to `apps/hospital` and shared translation infrastructure.
- Preserve the current hospital portal routes and behavior while making UI copy locale-aware.
- Respect the hospital user preference field `preferredLanguage` when available.
- Provide safe fallback behavior so missing keys never white-screen the portal.
- Split implementation into independent page clusters that can be parallelized safely.

## Non-Goals

- Localizing `apps/admin`
- Translating uploaded content, case notes, message bodies, or other user-generated text
- Rewriting every shared UI component in this repository for generic i18n support
- Adding language negotiation based on browser headers for this iteration

## Scope

Hospital portal entrypoints included in scope:

- `apps/hospital/src/app/layout.tsx`
- `apps/hospital/src/app/error.tsx`
- `apps/hospital/src/app/loading.tsx`
- `apps/hospital/src/app/auth/login/page.tsx`
- `apps/hospital/src/app/(portal)/layout.tsx`
- `apps/hospital/src/app/(portal)/dashboard/page.tsx`
- `apps/hospital/src/app/(portal)/cases/page.tsx`
- `apps/hospital/src/app/(portal)/cases/[id]/page.tsx`
- `apps/hospital/src/app/(portal)/consultations/page.tsx`
- `apps/hospital/src/app/(portal)/consultations/error.tsx`
- `apps/hospital/src/app/(portal)/messages/page.tsx`
- `apps/hospital/src/app/(portal)/materials/page.tsx`
- `apps/hospital/src/app/(portal)/email-templates/page.tsx`
- `apps/hospital/src/app/(portal)/faq/page.tsx`
- `apps/hospital/src/app/(portal)/settings/page.tsx`

Shared infrastructure included in scope:

- `packages/shared/i18n`
- hospital auth/context/provider helpers under `apps/hospital/src/lib`

Admin files are explicitly out of scope unless a shared helper change is required and has no behavioral impact on admin.

## Locale Model

Supported locales remain:

- `en`
- `zh`
- `fr`
- `de`
- `es`
- `bn`

Locale resolution order inside hospital portal:

1. authenticated user `preferredLanguage` if it is one of the supported locales
2. explicit in-session selection saved through the existing settings preference flow
3. shared default locale from `@medical-crm/i18n`

Unsupported values fall back to the shared default locale.

## Architecture

### Shared Translation Runtime

We will extend `packages/shared/i18n` with a minimal runtime that supports:

- loading locale messages
- reading nested keys from the existing JSON shape
- interpolating `{placeholders}`
- validating and normalizing locale values

The shared package remains framework-light so it can be used by both server and client code.

### Hospital-Only Provider

`apps/hospital` will own its own provider and hooks, for example:

- `HospitalI18nProvider`
- `useHospitalI18n()`

The provider will expose:

- `locale`
- `messages`
- `t(key, values?)`
- `has(key)`

This keeps the implementation isolated from admin while still reusing the shared message catalog.

### Server And Client Boundaries

Server layout will resolve the effective locale once, load messages, and pass them into a client-safe provider.

Client components will consume translations through the hospital-specific hook. Server components that only need a few strings may translate before render or pass translated labels down.

### Fallback Behavior

If a key is missing:

- `t()` should return a readable fallback, preferably the key itself
- the page must continue rendering
- we will add missing keys to locale files as part of this rollout when they are hospital portal UI copy

## Translation Strategy

### Reuse First

The current shared locale catalog already includes useful namespaces such as:

- `common`
- `hospital`
- `messaging`
- `caseDetail`
- `appointments`
- `status`
- `timeDate`

We will reuse these wherever they already match the hospital portal UI.

### Add Hospital-Specific Namespaces

We will add hospital-specific keys only for copy that is not already represented cleanly in the shared catalog, especially for:

- hospital portal shell/header text
- dashboard widget copy
- settings feedback and notification copy
- page-specific empty states and placeholders
- materials / FAQ / email templates management surfaces

### Leave Dynamic Domain Data Untouched

We will not auto-translate dynamic content such as:

- patient names
- case numbers
- user-authored notes
- message bodies
- uploaded file names
- backend enum values unless they are already rendered as UI labels

## Parallelization Plan

The work is intentionally decomposed into these independent clusters:

1. shell and auth
   - global layout
   - portal shell
   - login and global error/loading surfaces
2. dashboard and cases
   - dashboard widgets
   - cases list
   - top-level cases pages
3. consultations and messages
   - consultations page/list/error
   - messages page/view
   - shared consultation copy in case detail if needed
4. materials
   - materials page
   - materials tabs and modal copy
5. content management and preferences
   - email templates
   - FAQ
   - settings

All clusters can share the same i18n runtime but should not edit the same feature files.

## Testing And Verification

We will verify:

- `@medical-crm/i18n` tests
- hospital portal tests
- hospital typecheck
- shared i18n typecheck

We will also add focused regression coverage for:

- locale normalization
- nested translation lookup
- hospital provider fallback behavior where practical

## Risks And Mitigations

### Risk: Missing keys cause partial English UI

Mitigation:

- provide `t()` fallback behavior
- add missing keys during implementation
- verify key-heavy screens after integration

### Risk: Shared changes accidentally affect admin

Mitigation:

- keep admin runtime untouched
- make hospital own its provider and wiring
- limit shared package changes to generic helpers only

### Risk: Large files such as `materials-tabs.tsx` create merge conflicts

Mitigation:

- isolate the shared plumbing first
- assign one parallel worker ownership of `materials-tabs.tsx`
- avoid overlapping edits across workers

## Success Criteria

This work is complete when:

- hospital portal renders UI copy in `zh`, `en`, `fr`, `de`, `es`, and `bn`
- settings can save and reflect the preferred language
- hospital navigation and page shells are translated
- major hospital pages no longer depend on hard-coded English UI copy
- admin portal behavior remains unchanged
