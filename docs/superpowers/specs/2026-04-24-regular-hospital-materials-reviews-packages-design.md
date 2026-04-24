# Regular Hospital Materials Reviews And Packages Design Spec

> Date: 2026-04-24
> Status: Approved Design Draft
> Scope: Add `Reviews` and `Packages` tabs to the regular hospital portal `materials` page in `medical-crm-v2`

---

## 1. Overview

Extend the regular hospital portal materials workspace at `/materials` with two new tabs:

- `Reviews`
- `Packages`

These tabs are editorial back-office surfaces for content that powers the consumer-facing Hospital Navigator experience:

- `PATIENT REVIEWS`
- `RECOMMENDED PACKAGES`
- package detail pages opened from each recommended package card

This work is scoped to the regular hospital portal only. Cosmetic hospital behavior is unchanged in this phase.

### Goals

- Let hospital staff manage hospital-level patient reviews directly from `/materials`
- Let hospital staff manage recommended package cards and package detail content from `/materials`
- Preserve existing hospital portal patterns for upload, validation, i18n, and save feedback
- Keep package data structured enough to support future expansion without bloating `materials/info`

### Non-Goals

- Cosmetic hospital support
- Draft/publish workflow
- Review moderation or approval queues
- Analytics for reviews or packages
- Configurable PDF templates
- Sharing one review dataset between hospital reviews and package reviews

---

## 2. Product Decisions

### 2.1 Portal Scope

Only `regular` hospital portals receive the new tabs in this phase.

### 2.2 Publishing Model

Saving from `/materials` is immediately live. There is no separate draft or publish action.

### 2.3 Internationalization

These new tabs follow the same internationalization model already used elsewhere in hospital materials:

- UI labels use the hospital portal i18n bundles
- translatable content fields use the existing translation/writeback flow
- non-textual fields remain shared across locales

### 2.4 Review Separation

Two distinct review datasets are required:

- `hospital reviews` for the hospital-level `PATIENT REVIEWS` section
- `package reviews` nested inside each package for the package detail page

These datasets do not share records.

---

## 3. Reference Surfaces

The source behavior and content requirements come from the local `Hospital Navigator` project:

- [PatientReviews.tsx](/Users/haowang/Desktop/medora-health-beauty/Hospital%20Navigator/src/components/PatientReviews.tsx)
- [reviews.ts](/Users/haowang/Desktop/medora-health-beauty/Hospital%20Navigator/src/data/reviews.ts)
- [PackageList.tsx](/Users/haowang/Desktop/medora-health-beauty/Hospital%20Navigator/src/components/PackageList.tsx)
- [packages.ts](/Users/haowang/Desktop/medora-health-beauty/Hospital%20Navigator/src/data/packages.ts)
- [PackageDetail.tsx](/Users/haowang/Desktop/medora-health-beauty/Hospital%20Navigator/src/pages/PackageDetail.tsx)

The package detail page currently requires data for:

- gallery images
- tags
- title and subtitle
- price and currency
- duration
- overview / summary
- package includes
- treatment process
- patient cases
- package-level patient reviews
- hospital identity context
- PDF export content, which is derived from the same package detail fields

---

## 4. Data Ownership And Boundaries

### 4.1 Reviews

`Reviews` belong to hospital marketing materials and should live inside the hospital materials domain, alongside existing hospital profile content.

Reasoning:

- they are hospital-scoped promotional/editorial assets
- they match the shape of other materials-managed content
- they do not need to be reused as a standalone business entity outside hospital presentation

### 4.2 Packages

`Packages` are edited from `/materials`, but should be stored as a dedicated hospital-owned resource rather than embedded inside the existing `materials/info` object.

Reasoning:

- package data has a much larger and deeper structure than standard hospital info
- each package behaves like a first-class editable record
- package detail content will likely expand over time
- keeping packages separate avoids turning `materials/info` into a large mixed-content blob

This split is an implementation boundary only. In the hospital UI, both `Reviews` and `Packages` still appear as tabs on the `/materials` page.

---

## 5. Reviews Tab Design

### 5.1 Purpose

This tab manages hospital-level patient reviews that feed the consumer-facing `PATIENT REVIEWS` section.

### 5.2 Fields

Each hospital review record contains:

- `id`
- `sortOrder`
- `isActive`
- `featured`
- `patientName`
- `patientCountry`
- `patientAvatarUrl`
- `treatmentName`
- `reviewTitle`
- `reviewComment`
- `rating`
- `reviewDate`
- `media[]`

Each `media[]` item contains:

- `id`
- `type` (`image` or `video`)
- `url`
- `thumbnailUrl`
- `caption`
- `sortOrder`

### 5.3 UI Interaction

The Reviews tab follows the interaction pattern already used by list-based materials sections such as surgeons and cases:

- top-level `Add Review` action
- card or list presentation of existing reviews
- edit, delete, reorder, enable/disable actions on each row
- modal or side-panel editing instead of large inline forms

### 5.4 Review Editor Sections

The review editor is split into three sections:

1. `Basic Info`
   - patient name
   - country
   - avatar
   - treatment
   - rating
   - review date
   - featured
   - active

2. `Content`
   - review title
   - review comment

3. `Media`
   - image and video uploads
   - thumbnail
   - caption
   - media ordering

---

## 6. Packages Tab Design

### 6.1 Purpose

This tab manages hospital-level recommended packages that feed both:

- the `RECOMMENDED PACKAGES` card list
- the package detail page opened from each package card

### 6.2 Fields

Each package record contains:

- `id`
- `slug`
- `sortOrder`
- `isActive`
- `title`
- `subtitle`
- `coverImageUrl`
- `gallery[]`
- `price`
- `currency`
- `duration`
- `summary`
- `tags[]`
- `includes[]`
- `process[]`
- `cases[]`
- `reviews[]`

`gallery[]` item:

- `id`
- `imageUrl`
- `sortOrder`

`tags[]` item:

- `id`
- `label`
- `category`

`includes[]` item:

- `id`
- `text`
- `sortOrder`

`process[]` item:

- `id`
- `stepTitle`
- `description`
- `sortOrder`

`cases[]` item:

- `id`
- `patientName`
- `patientAge`
- `patientCountry`
- `story`
- `result`
- `sortOrder`

`reviews[]` item for package-level reviews:

- `id`
- `reviewerName`
- `reviewerCountry`
- `rating`
- `reviewDate`
- `comment`
- `sortOrder`
- `isActive`

### 6.3 UI Interaction

The Packages tab uses a two-level workflow:

1. the tab page shows the package list
2. add or edit opens a dedicated package editor

The package list should support:

- add
- edit
- delete
- reorder
- active/inactive toggle

Each package card in the list should show:

- cover image
- title
- subtitle
- price and currency
- duration
- tags
- active state
- package review count
- patient case count

### 6.4 Package Editor Sections

The package editor is split into six sections to keep it usable:

1. `Basic`
   - title
   - subtitle
   - slug
   - cover image
   - gallery
   - active
   - sort order

2. `Commercial`
   - price
   - currency
   - duration
   - tags

3. `Overview`
   - summary

4. `Includes`
   - includes list

5. `Treatment Process`
   - process steps list

6. `Patient Evidence`
   - patient cases list
   - package reviews list

This structure is intentionally aligned with the consumer package detail page rather than the current CRM package schema.

---

## 7. Data Persistence And API Design

### 7.1 Reviews API

Add hospital-scoped reviews endpoints under the materials route family:

- `GET /api/v2/hospitals/:hospitalId/materials/reviews`
- `POST /api/v2/hospitals/:hospitalId/materials/reviews`
- `PUT /api/v2/hospitals/:hospitalId/materials/reviews/:id`
- `DELETE /api/v2/hospitals/:hospitalId/materials/reviews/:id`

These endpoints should follow the same actor, hospital access, and upload policy patterns already used by existing materials endpoints.

### 7.2 Packages API

Add hospital-scoped package endpoints under the materials route family:

- `GET /api/v2/hospitals/:hospitalId/materials/packages`
- `POST /api/v2/hospitals/:hospitalId/materials/packages`
- `GET /api/v2/hospitals/:hospitalId/materials/packages/:id`
- `PUT /api/v2/hospitals/:hospitalId/materials/packages/:id`
- `DELETE /api/v2/hospitals/:hospitalId/materials/packages/:id`

For this first pass, package nested content is saved through full-package payload updates rather than separate child-resource endpoints.

### 7.3 Why Not Reuse Existing Global Package CRUD

The existing package resource in the CRM is currently shaped around a smaller global package model:

- `nameEn`
- `nameZh`
- `type`
- `price`
- `currency`
- `descriptionEn`
- `descriptionZh`
- `inclusions`
- `coverImageUrl`
- `sortWeight`
- `config`

That model does not directly match the Hospital Navigator detail-page structure. For this feature, the new hospital materials package resource should be shaped for the actual front-end content contract rather than squeezing the requirement into the existing global package schema.

---

## 8. Internationalization Strategy

These tabs use the same internationalization approach already established in the hospital portal.

### 8.1 UI Copy

New tab labels, form labels, help text, validation strings, and empty states should be added to the hospital i18n bundles following the current `hospital.materials.*` naming style.

### 8.2 Translatable Content

The following content fields are translatable and should participate in the same translation flow as other hospital materials content:

Hospital reviews:

- `treatmentName`
- `reviewTitle`
- `reviewComment`

Packages:

- `title`
- `subtitle`
- `summary`
- `includes[].text`
- `process[].stepTitle`
- `process[].description`
- `cases[].story`
- `cases[].result`
- `reviews[].comment`

### 8.3 Shared Non-Text Fields

These fields remain shared across locales:

- ids
- order fields
- booleans
- ratings
- dates
- asset URLs
- price
- currency
- duration
- age
- category enums

---

## 9. Validation And Error Handling

### 9.1 Reviews Validation

Required or constrained behavior:

- `patientName` is required
- `rating` must be an integer from 1 to 5
- `reviewComment` is required
- `reviewDate`, when present, must be a valid date
- uploaded media must be image or video only
- `sortOrder` must be an integer
- text fields should have reasonable max lengths to prevent layout overflow in the consumer UI

### 9.2 Packages Validation

Required or constrained behavior:

- `title` is required
- `slug` is required and unique within the same hospital
- `price` is required and must use a valid numeric format
- `currency` is required
- `summary` is required
- `coverImageUrl` should be required
- nested arrays may be empty, but when an item exists, its required fields must be complete
- package review `rating` must be an integer from 1 to 5

### 9.3 Error Handling

The user experience should match the rest of the materials page:

- list load failures render inline empty-state-style feedback
- save failures show toast feedback and retain user input
- upload failures use the existing upload progress and debug details patterns
- package editor save failures should surface enough detail to identify the failing section
- destructive actions require confirmation
- slug collisions return a specific user-facing error instead of a generic failure

---

## 10. Front-End Consumption Contract

The consumer-facing site should not be coupled directly to raw editor or storage shapes. The system should map stored hospital review and package data into the consumer payload contract used by the Hospital Navigator surfaces.

This means:

- hospital reviews map into the `PatientReviews` experience
- package list data maps into the `PackageList` experience
- package detail data maps into the `PackageDetail` experience

This mapping layer keeps editorial storage flexible while preserving a clean consumer contract.

---

## 11. Testing Scope

At minimum, cover:

- `Reviews` and `Packages` tabs appear for regular hospitals
- `Reviews` and `Packages` tabs do not appear for cosmetic hospitals
- hospital review create, edit, delete, reorder, activate/deactivate flows
- package create, edit, delete, reorder, activate/deactivate flows
- package nested content save and reload behavior for:
  - gallery
  - tags
  - includes
  - process
  - cases
  - package reviews
- translation-compatible fields pass through the existing i18n and translation flow correctly
- hospital-scoped package slug uniqueness enforcement
- consumer payload mapping correctness for:
  - hospital reviews
  - package list cards
  - package detail payload

---

## 12. Implementation Notes

### 12.1 Materials Page Placement

The new tabs are added to the existing hospital materials page:

- [page.tsx](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/hospital/src/app/(portal)/materials/page.tsx)
- [materials-tabs.tsx](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/hospital/src/components/materials-tabs.tsx)

### 12.2 Existing Patterns To Reuse

Reuse current hospital portal conventions for:

- query hooks and data loading
- server actions
- upload policy wiring
- save progress modal behavior
- materials page tab composition
- hospital portal translations

### 12.3 Scope Guardrail

Do not expand this first pass into a shared cross-portal package system or a generic package management rewrite. The goal is to make `/materials` capable of supplying the regular hospital consumer pages cleanly and safely.

---

## 13. Recommendation Summary

Implement the feature with this split:

- `Reviews` as part of hospital materials
- `Packages` as a dedicated hospital-owned resource edited from the materials page

This gives hospital staff the simple workflow they asked for, while keeping engineering boundaries maintainable as package detail content grows.
