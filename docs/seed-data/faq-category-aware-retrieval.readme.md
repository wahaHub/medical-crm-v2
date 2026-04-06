# FAQ Seed Corpus

This seed file is an intermediate CRM import source for category-aware FAQ retrieval.

## How It Fits

```text
seed JSON
-> CRM import
-> CRM DB as source of truth
-> CRM sync to Dify datasets
-> retrieval evaluation
```

## Counts

- categories: 60
- faqItems: 396
- evaluationQueries: 80

## Seed Shape

- top-level keys: `categories`, `faqItems`, `evaluationQueries`
- `categories`: category seed rows for general and hospital-scoped FAQ
- `faqItems`: FAQ seed rows bound to a category name plus hospital scope/context
- `evaluationQueries`: retrieval test prompts with expected categories, scope, and optional hospital target

## Domain Summary

- COSMETIC: 12 general categories, 18 hospital-scoped categories, 3 example hospitals
- REGULAR: 12 general categories, 18 hospital-scoped categories, 3 example hospitals

## Category Sets

### COSMETIC general categories

Consultation Process, Medical Documents, Procedure Eligibility, Recovery and Aftercare, Travel and Stay, Pricing and Package Scope, Risks and Limitations, Timeline and Scheduling, Companion and Support, Language and Translation Support, Why Medora / Care Coordination, Revision / Follow-up Planning

### REGULAR general categories

Case Review Process, Medical Records and Imaging, Treatment Eligibility, Diagnosis and Second Opinion, Hospital Selection Criteria, Travel and Admission Planning, Length of Stay and Follow-up, Pricing and Cost Scope, Interpreter and Coordination Support, Risks, Outcomes, and Limits, Caregiver / Family Support, Post-treatment Monitoring

## Shared Hospital-specific Category Set

- Hospital Review Requirements
- Hospital Scheduling Rules
- Hospital Stay and Companion Policy
- Hospital Recovery Instructions
- Hospital International Patient Process
- Hospital Pricing / Deposit Notes

## Example Hospitals

### COSMETIC example hospitals

- Seoul Aesthetic Center (4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0001): rhinoplasty, eyelid surgery, facial contouring
- Bangkok Beauty Institute (4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0002): body contouring, breast procedures, skin-focused packages
- Istanbul Aesthetics Hospital (4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0003): rhinoplasty, hair transplant, combo procedures

### REGULAR example hospitals

- Seoul Advanced Medical Center (4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0011): orthopedics, spine, sports injury
- Bangkok International Care Hospital (4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0012): digestive medicine, cardiovascular care, chronic disease support
- Tokyo Precision Treatment Center (4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0013): oncology second opinion, complex surgery planning, precision treatment review

## Evaluation Buckets

- `GENERAL_ONLY`: queries that should stay in general FAQ only (20)
- `HOSPITAL_AWARE`: queries that should use hospital-specific FAQ plus general support (20)
- `MULTI_CATEGORY`: queries that should resolve to more than one FAQ region (20)
- `AMBIGUOUS / EDGE`: queries that probe boundary handling (10)
- `NEGATIVE / SHOULD-NOT-MIX`: queries that should not leak hospital-specific FAQ into general answers (10)

## Seed Metadata Rules

- `scope` is seed metadata used during import and evaluation
- `scope` is not a persisted CRM category column
- CRM truth for categories remains `name + hospitalType + hospitalId`

## Regeneration

```bash
node scripts/generate-faq-seed.ts
node scripts/generate-faq-seed.ts --check
```

## Import and Sync

- import into CRM with `pnpm seed:faq:import` or `pnpm exec tsx scripts/import-faq-seed.ts`
- the import script loads `apps/api/.env` or repo `.env` to find `DATABASE_URL`
- import writes CRM FAQ rows first and enqueues FAQ sync outbox tasks
- after import, run the AI sync outbox processor to refresh the Dify datasets:

```bash
curl -X POST http://localhost:3001/api/v2/internal/process-ai-sync-outbox \
  -H 'X-Internal-Secret: <INTERNAL_API_SECRET>'
```

- repeat the outbox call until it returns `processed: 0` and `failed: 0`
