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
- faqItems: 336
- evaluationQueries: 80

## Domain Summary

- COSMETIC: 12 general categories, 18 hospital-scoped categories, 3 example hospitals
- REGULAR: 12 general categories, 18 hospital-scoped categories, 3 example hospitals

## Evaluation Buckets

- `GENERAL_ONLY`: queries that should stay in general FAQ only
- `HOSPITAL_AWARE`: queries that should use hospital-specific FAQ plus general support
- `MULTI_CATEGORY`: queries that should resolve to more than one FAQ region
- `AMBIGUOUS / EDGE`: queries that probe boundary handling
- `NEGATIVE / SHOULD-NOT-MIX`: queries that should not leak hospital-specific FAQ into general answers

## Seed Metadata Rules

- `scope` is seed metadata used during import and evaluation
- `scope` is not a persisted CRM category column
- CRM truth for categories remains `name + hospitalType + hospitalId`

## Regeneration

```bash
node scripts/generate-faq-seed.ts
node scripts/generate-faq-seed.ts --check
```
