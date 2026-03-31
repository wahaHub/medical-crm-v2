# FAQ Category-Aware Retrieval Design

**Date:** 2026-03-31  
**Status:** Draft for review  
**Scope:** Medora CRM + Dify chatbot FAQ retrieval refinement

## 1. Goal

Improve FAQ retrieval so the chatbot does not search the entire FAQ corpus for every FAQ-like question.

The new design should:

- use CRM `chatbot_faq_categories.name` as the only topic/category truth source
- support large FAQ sets without sending broad retrieval results to the downstream LLM
- keep general FAQ answers separate from hospital-specific FAQ answers
- allow hospital-aware questions to use both:
  - hospital-specific FAQ for the active hospital
  - general FAQ as supporting context
- avoid showing hospital-specific FAQ when the user is asking a general question

This design intentionally stays within:

- `GLOBAL FAQ + hospitalType`
- hospital-aware FAQ only when the turn has clear hospital context

It does **not** introduce a second topic taxonomy or move FAQ retrieval fully into backend.

It also deliberately changes one current codebase rule:

- today only global FAQ reaches the shared Dify FAQ datasets
- this design requires hospital-scoped FAQ to join those same shared datasets, guarded by metadata filtering

## 2. Non-Goals

This design does not do the following:

- introduce alias tables or synonym management for FAQ categories
- create per-hospital FAQ datasets in Dify
- move all FAQ retrieval and ranking into CRM backend
- redesign package or hospital recommendation retrieval
- change the policy engine authority boundary

This means the current “hospital FAQ never enters Dify” behavior is **not** preserved.

The backend remains the decision authority. Dify remains the language and orchestration layer.

## 3. Current Problem

Today the workflow does two useful things:

- splits FAQ datasets by `hospitalType`
- uses top-k semantic retrieval instead of loading all FAQs

But it still has two gaps:

1. it does not explicitly narrow by CRM FAQ category before retrieval
2. it does not properly separate:
   - general FAQ
   - hospital-specific FAQ

At current scale that is tolerable. At larger FAQ volume it becomes unstable:

- retrieval can drift into the wrong topical region
- hospital-specific FAQ can leak into general answers
- multi-part questions can miss one of the relevant FAQ clusters

There is also a concrete implementation gap today:

- hospital-scoped FAQ is intentionally excluded from Dify sync
- only `hospitalId = null` FAQ is enqueued into the shared FAQ datasets

So this design is not just a retrieval tweak. It also requires widening the FAQ sync corpus that Dify can search.

## 4. Source of Truth

### 4.1 FAQ categories

The only topic/category truth source is:

- CRM `chatbot_faq_categories.name`

Admin users create categories in CRM. The chatbot must use those exact category names.

There will be no parallel Dify-only topic system and no separate alias table in v1.

### 4.2 FAQ scope model

Each FAQ item belongs to one of two scopes:

- `GENERAL`
  - global/admin FAQ
  - valid across users within the same `hospitalType`
- `HOSPITAL`
  - FAQ tied to a specific hospital
  - valid only when the current turn is hospital-aware for that hospital

This scope is not a new business taxonomy. It is a retrieval control property.

## 5. Target Retrieval Behavior

### 5.1 General-only questions

If the user is asking a general question and there is no active hospital context, retrieval must:

- search only FAQ documents where:
  - `hospital_type = current hospitalType`
  - `scope = GENERAL`
  - `category in resolved_categories`

The response must not include hospital-specific FAQ facts.

### 5.2 Hospital-aware questions

If the user is asking about a specific hospital, retrieval may use two sources:

- hospital-specific FAQ for the active hospital
- general FAQ as supporting context

The retrieval split should be:

- primary retrieval:
  - `hospital_type = current hospitalType`
  - `scope = HOSPITAL`
  - `hospital_id = activeHospitalId`
  - `category in resolved_categories`
- supporting retrieval:
  - `hospital_type = current hospitalType`
  - `scope = GENERAL`
  - `category in resolved_categories`

The response must:

- prioritize hospital-specific facts for that hospital
- use general FAQ only as general background
- never present hospital-specific facts as global policy

## 6. Hospital-Aware Signal Rules

Hospital-aware FAQ retrieval is allowed only when the turn has a clear hospital signal.

Supported signals in v1:

- the user explicitly mentions a hospital name
- recent conversation is already discussing a hospital
- the active recommendation context points to a hospital
- the user is currently on a hospital detail page

The hospital detail page signal will be passed through the public chat API via `pageContext`.

Example:

```json
{
  "sessionId": "policy-e2e-1",
  "hospitalType": "COSMETIC",
  "message": "Can this hospital help with rhinoplasty?",
  "pageContext": {
    "type": "HOSPITAL_DETAIL",
    "hospitalId": "hosp_123",
    "hospitalName": "ABC Clinic"
  }
}
```

The backend should absorb this into the conversation context and expose an `activeHospitalContext` signal for policy and retrieval use.

## 7. Chosen Approach

Three candidate approaches were considered:

1. Keep category only in document text and rely on prompt steering
2. Single dataset with structured metadata plus metadata filtering
3. Move FAQ retrieval and ranking into backend

The chosen approach is:

- **single dataset + metadata filter**

This is the best balance for v1 because it:

- keeps category truth aligned with CRM admin
- avoids dataset explosion
- avoids building a second retrieval system in backend
- is much more stable than full-dataset semantic retrieval
- keeps the existing two shared FAQ datasets as the storage model, while allowing both:
  - general FAQ
  - hospital-scoped FAQ
  to coexist safely through metadata filtering

## 8. Backend Design

### 8.1 FAQ sync document model

FAQ sync should keep both:

- document text
- structured metadata

Document text remains useful for:

- semantic relevance
- grounded quoting/citations
- fallback retrieval behavior

Structured metadata is added for precise filtering.

This requires changing the current FAQ sync rule:

- active general FAQ stays eligible for sync
- active hospital-scoped FAQ becomes eligible for sync too
- both document types flow into the existing `FAQ_COSMETIC` / `FAQ_REGULAR` datasets
- retrieval guards, not dataset separation, prevent hospital FAQ leakage

### 8.2 FAQ document metadata

Each synced FAQ document should carry at least:

- `faq_id`
- `hospital_type`
- `scope`
- `category`
- `hospital_id`
- `keywords`

Suggested shape:

```json
{
  "faq_id": "faq_123",
  "hospital_type": "COSMETIC",
  "scope": "GENERAL",
  "category": "Consultation Process",
  "hospital_id": null,
  "keywords": ["consultation", "process", "timeline"]
}
```

For hospital-specific FAQ:

```json
{
  "faq_id": "faq_456",
  "hospital_type": "COSMETIC",
  "scope": "HOSPITAL",
  "category": "Documents",
  "hospital_id": "hosp_123",
  "keywords": ["report", "passport", "ct scan"]
}
```

Important implementation note:

- Dify document text create/update endpoints do not carry document metadata inline
- metadata must be managed through Dify's dataset/document metadata APIs as a separate step

So the real sync flow is:

1. create or update the document text
2. ensure required metadata fields exist on the dataset
3. upsert metadata bindings for the document

### 8.3 FAQ category list endpoint

Add an internal endpoint for Dify to fetch the currently valid category names from CRM.

Recommended shape:

- `GET /api/v2/internal/mcp/faq-categories?hospitalType=COSMETIC`
- `GET /api/v2/internal/mcp/faq-categories?hospitalType=COSMETIC&hospitalId=hosp_123`

Response:

```json
{
  "hospitalType": "COSMETIC",
  "hospitalId": null,
  "categories": [
    { "name": "Consultation Process", "sortOrder": 10 },
    { "name": "Documents", "sortOrder": 20 }
  ]
}
```

This endpoint ensures:

- Dify does not invent categories
- admin-created categories become available without DSL edits

Behavior rules:

- without `hospitalId`, return active general categories for that `hospitalType`
- with `hospitalId`, return the union of:
  - active general categories for that `hospitalType`
  - active hospital-specific categories for that `hospitalId`

If the same category `name` exists in both scopes:

- dedupe by `name`
- return one logical category entry
- use the lowest `sortOrder` for stable ordering

This gives the resolver the right category universe for both:

- general-only FAQ turns
- hospital-aware FAQ turns

### 8.4 Public chat API extension

Extend the public chatbot request shape to optionally accept `pageContext`.

Recommended shape:

- `type`
- `hospitalId`
- optional `hospitalName`

The real transport path in v1 must be:

1. frontend sends `pageContext` to `POST /api/v2/chatbot/chat`
2. public chat route stores that `pageContext` on the current user message metadata
3. public chat route also passes `pageContext` into Dify `inputs`
4. Dify forwards `page_context` to:
   - `context_http`
   - `decide_http`
5. backend context building derives `activeHospitalContext` from:
   - current request `page_context`
   - recent user message metadata
   - recommendation / shortlist state

This keeps the signal on the real chat -> Dify -> internal-policy path instead of assuming backend sees page context automatically.

## 9. Dify Workflow Design

This change should be added only to the FAQ branch. It should not re-architect the whole policy engine graph.

### 9.1 New FAQ branch flow

Recommended shape:

```text
FAQ-related turn
  -> faq_categories_http
  -> faq_category_resolver_llm
  -> faq_scope_gate
     -> general_faq_kr
     -> optional hospital_faq_kr
  -> faq_result_normalizer
  -> prompt_inputs_aggregator
  -> response_composer
```

### 9.2 New nodes

#### `faq_categories_http`

Purpose:

- fetch active CRM categories for the current `hospitalType`
- use optional `hospitalId` when hospital-aware context is already known

#### `faq_category_resolver_llm`

Purpose:

- resolve `1-3` likely FAQ categories for the user question

Inputs:

- user question
- hospital type
- category list
- optional hospital-awareness hint

Outputs:

- ordered category names
- retrieval hint for:
  - `GENERAL_ONLY`
  - `HOSPITAL_AWARE`

This resolver is constrained to CRM-provided category names only.

For hospital-aware turns, the category list should come from the `hospitalId`-aware endpoint shape above so the resolver can pick from:

- general categories
- the current hospital's categories

#### `faq_scope_gate`

Purpose:

- choose whether to run:
  - only `general_faq_kr`
  - or both `hospital_faq_kr` and `general_faq_kr`

#### `general_faq_kr`

Metadata filter:

- `hospital_type`
- `scope = GENERAL`
- `category in resolved_categories`

#### `hospital_faq_kr`

Metadata filter:

- `hospital_type`
- `scope = HOSPITAL`
- `hospital_id = activeHospitalId`
- `category in resolved_categories`

#### `faq_result_normalizer`

Purpose:

- provide stable composer inputs
- clearly separate:
  - general FAQ hits
  - hospital-specific FAQ hits

### 9.3 Retrieval limits

Recommended v1 limits:

- resolved categories: max `3`
- general-only path: `4-6` FAQ hits total
- hospital-aware path:
  - hospital-specific: `2-4`
  - general support: `2-3`

This keeps the downstream LLM grounded without flooding it.

### 9.4 Inputs required from transport

For the FAQ branch to work, the workflow must explicitly carry:

- `hospitalType`
- `sessionId`
- optional `pageContext`
- optional `activeHospitalContext`

These are not assumed to exist automatically. They must be forwarded through the existing public chat request, Dify `inputs`, and internal policy request envelopes.

## 10. Response Composer Rules

The composer must explicitly understand the difference between:

- general FAQ context
- hospital-specific FAQ context

### 10.1 General-only path

Rules:

- only use general FAQ
- do not reference hospital-specific facts
- keep answer general and educational

### 10.2 Hospital-aware path

Rules:

- prefer hospital-specific FAQ for facts about the active hospital
- use general FAQ only as supporting context
- never restate hospital-specific facts as if they apply to all hospitals

### 10.3 Conservative fallback

If retrieval is sparse, conflicting, or partially missing:

- prefer general FAQ over invention
- avoid claiming hospital-specific requirements unless grounded

## 11. Example Flows

### 11.1 General question

User asks:

> What documents do I need before consultation?

Expected behavior:

- no hospital signal
- resolver selects categories such as:
  - `Documents`
  - `Consultation Process`
- retrieve only `GENERAL` FAQ
- answer uses only general FAQ

### 11.2 Hospital-specific question

User asks from a hospital page:

> What documents does this hospital need before review?

Expected behavior:

- page context supplies `hospitalId`
- resolver selects:
  - `Documents`
- retrieval gets:
  - hospital FAQ for that hospital
  - general FAQ for support
- response says:
  - generally, reports/imaging are needed
  - for this hospital specifically, these extra items are required

### 11.3 Multi-category question

User asks:

> What documents do I need, and how long does the consultation process usually take?

Expected behavior:

- resolver selects:
  - `Documents`
  - `Consultation Process`
- retrieval pulls a small cross-category set
- composer answers both parts without broad recall

## 12. Data Flow Summary

```text
CRM Admin creates category
  -> category stored in chatbot_faq_categories
  -> FAQ sync writes document text to Dify
  -> sync ensures dataset metadata fields exist
  -> sync writes document metadata bindings
  -> Dify fetches valid categories from backend at runtime
  -> resolver selects 1-3 CRM categories
  -> retrieval filters by hospitalType + scope + category (+ hospitalId when needed)
  -> composer answers from bounded FAQ set
```

## 13. Error Handling

### 13.1 Category endpoint failure

If category list lookup fails:

- do not invent category names
- fall back to existing FAQ retrieval path or conservative no-answer behavior
- emit diagnostic metadata for debugging

### 13.2 Resolver ambiguity

If the resolver cannot confidently choose categories:

- choose fewer categories, not more
- prefer a narrow retrieval set
- allow fallback to general FAQ-only retrieval if needed

### 13.3 Missing hospital context

If the user appears to ask about a hospital but no active hospital can be resolved:

- do not run hospital-specific FAQ retrieval
- use general FAQ only
- optionally prompt for clarification

## 14. Testing Strategy

Add test coverage across four layers:

### 14.1 Sync tests

- FAQ sync includes metadata fields
- general FAQ gets `scope = GENERAL`
- hospital FAQ gets `scope = HOSPITAL`

### 14.2 Backend API tests

- category list endpoint returns active categories by `hospitalType`
- pageContext is accepted and persisted into context-building inputs

### 14.3 Workflow contract tests

- resolver output is restricted to backend-provided categories
- general-only path never runs hospital FAQ retrieval
- hospital-aware path can combine hospital FAQ + general FAQ
- retrieval filters include category and scope selectors

### 14.4 End-to-end tests

- general FAQ question does not surface hospital-specific FAQ
- hospital-detail-page question can surface both:
  - hospital FAQ
  - general FAQ
- multi-category question retrieves a bounded cross-category FAQ set

## 15. Risks and Remaining Gaps

### 15.1 Dify metadata-filter capability risk

This design assumes Dify retrieval can reliably filter on the metadata fields we need.

If metadata filtering proves too weak or too inflexible, the fallback path is:

- move FAQ category scoping into backend retrieval later

### 15.2 Category naming quality

Because category names come directly from CRM admin:

- badly named or overlapping categories can weaken resolver quality

This is acceptable in v1 because CRM category names are still the required truth source.

### 15.3 Hospital name resolution

If hospital-aware mode depends on hospital name mention alone, name matching quality matters.

This is partially mitigated by:

- pageContext
- recent active hospital context
- recommendation context

### 15.4 No alias system in v1

This design intentionally avoids a category alias layer.

That keeps v1 simpler, but it means resolver quality depends on:

- clean category names
- good prompt design

## 16. Recommendation

Implement this as a focused FAQ retrieval upgrade with the following sequence:

1. add FAQ metadata support to sync
2. add internal FAQ category list endpoint
3. add `pageContext` to public chat input and backend context
4. add Dify category resolver + scoped FAQ retrieval branch
5. add contract and E2E tests for general vs hospital-aware behavior

This keeps the change tightly scoped while materially improving FAQ precision for large knowledge bases.
