# FAQ Seed Corpus Design

**Date:** 2026-04-02  
**Status:** Draft for review  
**Scope:** Seed corpus for CRM FAQ import, Dify sync, and category-aware retrieval evaluation

## 1. Goal

Create a large, realistic FAQ seed corpus so category-aware retrieval can be tested against a meaningful dataset instead of a toy corpus.

The corpus should support:

- CRM-first FAQ truth
- Dify FAQ sync through the existing outbox/sync flow
- category-aware retrieval evaluation
- separation of:
  - general FAQ
  - hospital-specific FAQ
- hospital-aware retrieval that can combine:
  - hospital-specific FAQ for the active hospital
  - general FAQ as supporting context

The corpus is not meant to be directly uploaded into Dify as final source-of-truth content.

The intended chain is:

```text
seed JSON
-> CRM import
-> CRM DB as source of truth
-> CRM sync to Dify datasets
-> Dify retrieval + evaluation queries
```

## 2. Non-Goals

This design does not:

- replace CRM admin as the long-term FAQ source of truth
- bypass CRM and upload FAQ directly into Dify as the canonical corpus
- redesign the chatbot policy engine
- redesign hospital recommendation logic
- create a second category taxonomy outside CRM
- solve production-grade FAQ authoring workflows

## 3. Deliverable

The output will be one seed file:

- `docs/seed-data/faq-category-aware-retrieval.seed.json`

This file is an intermediate seed source for:

- importing CRM categories
- importing CRM FAQ items
- producing evaluation queries for retrieval testing

It is not the final Dify import file.

## 4. Seed File Shape

The seed file will contain three top-level arrays:

```json
{
  "categories": [],
  "faqItems": [],
  "evaluationQueries": []
}
```

### 4.1 `categories`

Each category item should include:

- `id`
- `name`
- `hospitalType`
- `hospitalId`
- `scope`
- `sortOrder`
- `isActive`

Rules:

- `hospitalId = null` means general category
- `hospitalId != null` means hospital-specific category
- `scope` is `GENERAL` or `HOSPITAL`
- `name` must match the CRM category truth model

### 4.1a Import constraint

The current user-facing FAQ create/update paths in CRM are actor-derived:

- admin-created FAQ/category becomes global
- hospital-created FAQ/category becomes scoped to the actor hospital

That is correct for product behavior, but it is not sufficient for bulk seed import across multiple hospitals.

So the seed import path should be treated as a dedicated system/import path, not as a blind reuse of the current actor-driven HTTP flows.

In practice this means:

- hospital-specific seed records must be imported through an import-specific use case or repository-backed path
- the import flow must be allowed to set `hospitalId` explicitly for seeded hospital data
- the public/admin/hospital CRUD routes remain unchanged

Important clarification:

- `scope` is seed metadata used by the generator and importer
- it is not a persisted column on `chatbot_faq_categories`
- current CRM category truth remains:
  - `name`
  - `hospitalType`
  - `hospitalId`

### 4.2 `faqItems`

Each FAQ item should include:

- `id`
- `hospitalType`
- `hospitalId`
- `scope`
- `category`
- `question`
- `answer`
- `keywords`
- `isActive`
- `sortOrder`

Rules:

- `category` uses the exact CRM category name
- general FAQ uses `hospitalId = null`
- hospital FAQ uses a concrete `hospitalId`
- content should be varied enough to test retrieval quality rather than template memorization

### 4.3 `evaluationQueries`

Each evaluation query should include:

- `id`
- `hospitalType`
- `query`
- `expectedScope`
- `expectedCategories`
- `expectedHospitalId`
- `notes`

Rules:

- `expectedScope` is one of:
  - `GENERAL_ONLY`
  - `HOSPITAL_AWARE`
- `expectedHospitalId = null` for general-only cases
- `expectedCategories` should contain 1-3 CRM category names

## 5. Retrieval Semantics the Corpus Must Stress

The dataset must be large and messy enough to test:

1. category resolver choosing the right 1-3 CRM categories
2. general-only turns not leaking hospital FAQ
3. hospital-aware turns combining:
   - current-hospital FAQ
   - general FAQ
4. multi-category questions retrieving from more than one FAQ region
5. ambiguous wording and near-neighbor categories

This means the corpus must intentionally include:

- same-topic synonyms
- overlapping questions across nearby categories
- compound questions spanning multiple categories
- hospital-specific variations of otherwise general topics

## 6. Domain Split

The corpus is split into two main hospital types:

- `COSMETIC`
- `REGULAR`

Each domain gets:

- general categories
- general FAQ items
- three example hospitals
- hospital-specific categories
- hospital-specific FAQ items
- evaluation queries

## 7. Category Model

### 7.1 COSMETIC General Categories

The first version should use these 12 general categories:

1. `Consultation Process`
2. `Medical Documents`
3. `Procedure Eligibility`
4. `Recovery and Aftercare`
5. `Travel and Stay`
6. `Pricing and Package Scope`
7. `Risks and Limitations`
8. `Timeline and Scheduling`
9. `Companion and Support`
10. `Language and Translation Support`
11. `Why Medora / Care Coordination`
12. `Revision / Follow-up Planning`

### 7.2 REGULAR General Categories

The first version should use these 12 general categories:

1. `Case Review Process`
2. `Medical Records and Imaging`
3. `Treatment Eligibility`
4. `Diagnosis and Second Opinion`
5. `Hospital Selection Criteria`
6. `Travel and Admission Planning`
7. `Length of Stay and Follow-up`
8. `Pricing and Cost Scope`
9. `Interpreter and Coordination Support`
10. `Risks, Outcomes, and Limits`
11. `Caregiver / Family Support`
12. `Post-treatment Monitoring`

### 7.3 Hospital-Specific Categories

Each example hospital should use these 6 hospital-specific categories:

1. `Hospital Review Requirements`
2. `Hospital Scheduling Rules`
3. `Hospital Stay and Companion Policy`
4. `Hospital Recovery Instructions`
5. `Hospital International Patient Process`
6. `Hospital Pricing / Deposit Notes`

The point is not to invent a second taxonomy. The point is to create hospital-specific FAQ that can safely coexist beside general FAQ in shared Dify datasets through metadata filtering.

## 8. Example Hospitals

### 8.1 COSMETIC Example Hospitals

1. `Seoul Aesthetic Center`
   - strengths: rhinoplasty, eyelid surgery, facial contouring
   - tone: structured international workflow, clear pre-op document expectations

2. `Bangkok Beauty Institute`
   - strengths: body contouring, breast procedures, skin-focused packages
   - tone: stronger package language, recovery/stay planning more prominent

3. `Istanbul Aesthetics Hospital`
   - strengths: rhinoplasty, hair transplant, combo procedures
   - tone: more specific photo/document requirements, pre-review detail heavy

### 8.2 REGULAR Example Hospitals

1. `Seoul Advanced Medical Center`
   - strengths: orthopedics, spine, sports injury
   - tone: imaging-heavy review process, second-opinion style

2. `Bangkok International Care Hospital`
   - strengths: digestive medicine, cardiovascular care, chronic disease support
   - tone: coordination-heavy, family and admission logistics more visible

3. `Tokyo Precision Treatment Center`
   - strengths: oncology second opinion, complex surgery planning, precision treatment review
   - tone: strict case review, tighter timelines, more document specificity

## 9. Corpus Size

### 9.1 General FAQ

For each main domain:

- 12 general categories
- 8-10 FAQ items per category

Target:

- `COSMETIC`: 100-120 general FAQ items
- `REGULAR`: 100-120 general FAQ items

### 9.2 Hospital FAQ

For each main domain:

- 3 example hospitals
- 6 hospital categories per hospital
- 4-6 FAQ items per hospital category

Target:

- `COSMETIC`: 70-100 hospital-specific FAQ items
- `REGULAR`: 70-100 hospital-specific FAQ items

### 9.3 Total FAQ Target

Expected total:

- roughly 340-440 FAQ items

This is large enough to create meaningful retrieval pressure without becoming unmanageable for local seed review.

## 10. Evaluation Query Set

The seed file should include roughly 80 evaluation queries split across five buckets:

1. `GENERAL_ONLY`
   - 20 queries
2. `HOSPITAL_AWARE`
   - 20 queries
3. `MULTI_CATEGORY`
   - 20 queries
4. `AMBIGUOUS / EDGE`
   - 10 queries
5. `NEGATIVE / SHOULD-NOT-MIX`
   - 10 queries

The query set exists to test retrieval behavior, not just answer quality.

Each query should explicitly encode:

- expected scope
- expected categories
- expected hospital where relevant

## 11. Content Design Rules

The seed corpus must avoid over-templated FAQ writing.

Each category should include:

- synonym variation
- short and long questions
- direct and indirect phrasings
- compound multi-part questions
- category-borderline examples

Examples:

- `What documents do I need before consultation?`
- `Which records should I prepare for review?`
- `Do you need scans before recommending hospitals?`
- `How long does review take and what files are usually required?`

This variation is necessary to expose whether retrieval is truly category-aware or merely matching repeated wording.

## 12. Scope Rules in the Seed Corpus

The corpus must support these runtime expectations:

### 12.1 General-only

General-only evaluation queries should map only to:

- `scope = GENERAL`

They must not rely on hospital-specific FAQ.

### 12.2 Hospital-aware

Hospital-aware evaluation queries should support:

- hospital-specific FAQ for one hospital
- general FAQ as supporting context

They should not be answerable by the wrong hospital’s FAQ.

## 13. Why This Design Matches the Current Architecture

This design is intentionally aligned with the current architecture already chosen for the chatbot:

- CRM remains the source of truth for categories and FAQ records
- Dify remains the retrieval/orchestration layer
- shared Dify datasets continue to hold synced FAQ
- metadata filtering continues to enforce scope boundaries

The seed corpus is therefore designed to validate the current architecture, not replace it.

## 14. Risks and Known Gaps

This design improves the realism of FAQ testing, but it does not automatically solve:

1. poor category resolver prompts
2. bad retrieval ranking quality inside a category
3. inconsistent FAQ authoring voice
4. weak hospital-specific differentiation
5. lack of an automated CRM import script

In particular:

- the seed file alone does not load anything into CRM
- an import path still needs to be implemented
- Dify sync still needs to run after import
- evaluation still needs either:
  - semi-automated scripted execution
  - or additional instrumentation for full automatic scoring

There is also a current observability gap:

- the existing public chatbot answer contract does not expose the Dify FAQ category resolver output directly
- so v1 cannot honestly promise fully automatic scoring of:
  - actual resolved FAQ categories
  - actual FAQ scope chosen inside the workflow

For v1, the realistic target is:

- automate corpus generation
- automate CRM import
- automate Dify sync refresh
- automate case execution and report capture
- keep category/scope adjudication either:
  - semi-automated
  - or gated on adding explicit diagnostic instrumentation later

## 15. Recommended Next Step

The next implementation plan should cover:

1. seed file generation
2. CRM import path for categories and FAQ items
3. Dify sync refresh
4. scripted evaluation query execution
5. reporting with realistic v1 boundaries:
   - seed integrity
   - import coverage
   - sync coverage
   - answer/log capture
   - category/scope scoring only where instrumentation exists
