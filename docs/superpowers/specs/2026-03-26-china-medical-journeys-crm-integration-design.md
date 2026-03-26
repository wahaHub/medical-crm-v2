# China Medical Journeys — CRM v2 Full Integration Design Spec

**Date**: 2026-03-26
**Project**: china-medical-journeys → medical-crm-v2 integration
**Frontend**: `/medical-china-comb/china-medical-journeys` (React 18 + Vite + Tailwind + React Query)
**Backend**: `/medical-crm-v2` (Hono API + Drizzle + Keycloak)

## Overview

Fully integrate the china-medical-journeys patient frontend with the CRM v2 backend. The target product model is intentionally converged with Medora Health Beauty:

- both websites use a **marketing-site floating Chat Widget** as the primary patient entry point
- both websites follow **case-first onboarding**
- both websites open a larger **Patient Message Panel** after hospital selection
- both websites use the same CRM v2 patient auth, messaging, quote, intake, and dashboard contracts behind different visual branding

Replace the existing Supabase Auth + legacy API setup with CRM v2's patient auth system and API endpoints. The dashboard will have 7 tabs: Home, Support Tickets, Messages, Quotes, Journey, AI Summary, Orders, but the dashboard is only one part of the patient journey. The floating widget + message panel entry flow is first-class scope, not an optional add-on.

## Current Baseline Reality Check

This integration is directionally aligned with CRM v2, but the current backend baseline is mixed:

- **Already exists and is reusable**: patient cookie auth, `/api/patient/me`, onboarding init, magic link verify, basic conversations, patient quote actions, WebSocket channels, generic ticket/order/journey domain use cases
- **Exists but contract is too narrow**: patient messages are text-only, patient case detail DTO does not include journey/milestones/patient-facing AI summary aggregate, intake validation only supports `string | string[]`
- **Exists as stub and must be replaced**: `GET /api/patient/intake/:caseId/template`, `POST /api/patient/intake/:caseId`
- **Still needs new routes**: patient tickets routes, patient orders routes, intake upload route, patient draft-save route, guest-session restore route, optional patient password-login route

The implementation plan below is written against that real baseline, not against the earlier aspirational patient-dashboard spec.

## Architecture Decision

**Approach: BFF Proxy (方案 A)** — CRM v2's existing `/api/patient/*` route group serves as the patient API gateway. New patient-specific endpoints are added to CRM v2. The frontend proxies all calls through BFF (Vite dev proxy + production Nginx/serverless).

## Unified Marketing Entry Experience

Both websites must use the same patient-entry pattern:

1. Visitor opens the floating chat bubble from the marketing site.
2. The first expanded state shows:
   - a **structured onboarding widget** that collects the agreed 5 base patient fields
   - a companion assistant-style opening message such as `What can I help you with?`
3. The visitor's free-text answer is stored as part of the patient request context, not just UI-only copy.
4. Once the onboarding widget is submitted, CRM v2 creates or reuses a patient, creates a case immediately, and starts a patient session.
5. After hospital selection, the small bubble is no longer the main chat surface; the product opens a larger `PatientMessagePanel` for ongoing multi-hospital communication.

This means the floating widget is not a disposable landing-page toy. It is the top of the same patient journey that continues into conversations, quotes, intake, and dashboard pages.

### Widget First-Open State

The first-open chat state should be modeled as a hybrid surface, not as a plain chatbot transcript:

- **Primary block**: a compact onboarding widget/form with the 5 agreed base fields
- **Companion message**: an assistant-style prompt such as `What can I help you with?`
- **Free-text input**: optional but strongly preferred; if the visitor types a request, it should be persisted as the first patient intent/message

The form widget and the opening assistant message should appear together in the same floating window so the user immediately understands both:

- what information is required to start matching
- that they can also describe their concern in natural language

## Guest Persistence & Return Behavior

Patient conversation history must persist even before explicit login/password setup.

### Persistence Rules

1. **Immediately after onboarding submit**, backend creates the patient, case, and `patient_session` cookie. This already gives the visitor a real patient identity without forcing email verification first.
2. **Same-browser return** must work even if the active auth cookie is gone. Frontend stores an opaque `visitorKey` / `guestSessionId` in browser storage. This key is not an auth token; it is only a restore handle.
3. **Restore flow**: frontend calls a dedicated restore endpoint (recommended: `POST /api/patient/session/restore`) with the opaque restore handle. Backend can then:
   - re-bind the browser to the existing patient if the restore handle is valid
   - re-issue a fresh `patient_session` cookie
   - return the active case / conversation bootstrap data
4. **Cross-device or cleared-browser return** falls back to email magic link. The same patient and case history must be restored after token verification.

### Important Constraint

Chat history may not live only in component state, only in localStorage, or only in an anonymous front-end transcript cache. Once the visitor finishes the onboarding widget, all subsequent messaging history must be stored against the real CRM patient / case / conversation records.

## Authentication

### Adopting CRM v2's "Try First, Register Later" Model

Per the existing spec (`2026-03-17-patient-dashboard-chatwidget-design.md`), the patient auth system is:

1. **Onboarding init**: Visitor submits the widget fields plus optional free-text request context → `POST /api/patient/onboarding/init` → backend creates patient + Case + sets `patient_session` httpOnly cookie (JWT, 24h)
2. **Immediate access**: After onboarding, user is logged in — no email verification required for initial session
3. **Guest restore**: Returning same-browser visitors can restore their session/history through a restore handle without a formal login screen
4. **Magic link**: Email sent for return visits when restore is unavailable — click link → `POST /api/patient/verify-token` → new session cookie
5. **Optional password**: User can set password via `POST /api/patient/set-password` for email + password login
6. **Dedicated middleware**: `patientAuthMiddleware` validates `patient_session` cookie, completely separate from Keycloak

### Auth Migration (Frontend)

- **Remove**: Supabase Auth (`AuthContext`, `supabaseClient`, `@supabase/supabase-js` dependency)
- **Add**: `PatientAuthContext` — cookie-based session, calls `GET /api/patient/me` to check login status
- **Login page**: Magic link flow (enter email → receive link → click → dashboard) + optional email/password login
- **BFF Proxy**: Vite `proxy` config (dev) / Nginx or serverless function (prod) forwards `/api/patient/*` to CRM v2

### Security Considerations

| Measure | Status |
|---------|--------|
| httpOnly cookie (prevents XSS token theft) | Existing |
| JWT 24h expiry | Existing |
| BFF proxy hides backend URL | Existing |
| Rate limiting | Existing, but current onboarding implementation is `20/hour` in production, not `5/IP/hour`; align doc and code before ship |
| Turnstile CAPTCHA on onboarding | Existing |
| `Secure` + `SameSite=Lax` cookie flags | Existing (`Lax` required — `Strict` would break magic link redirects from email) |
| Opaque guest restore handle (non-auth token) | New requirement |
| Magic link token one-time use | **Missing** in current implementation; JWT verify exists, but no server-side one-time-use tracking |
| Strong JWT secret in production | Verify (dev uses placeholder) |
| Ownership check on all patient queries | Verify per endpoint |

## Dashboard Structure

### Sidebar Navigation (7 tabs replacing existing 6)

| Tab | Route | Description |
|-----|-------|-------------|
| **Home** | `/dashboard` | Welcome + Case Intake (dynamic questionnaire) + stats |
| **Support Tickets** | `/dashboard/tickets` | Create tickets, view replies/status |
| **Messages** | `/dashboard/messages` | Multi-conversation real-time chat |
| **Quotes** | `/dashboard/quotes` | Multi-hospital quotes, accept/reject |
| **Journey** | `/dashboard/journey` | Visa/insurance/accommodation/transport/postCare + milestones |
| **AI Summary** | `/dashboard/ai-summary` | Case AI summaries (zh/en) |
| **Orders** | `/dashboard/orders` | Order list + details |

Additional routes:
- `/dashboard/intake/:caseId` — Dynamic questionnaire form
- `/dashboard/account` — Account settings (retained)
- `/dashboard/cases/:caseId` — Optional deep-link detail view retained for Medora-style case drill-down

### Retained Page Semantics From Medora

To keep the shared product model compatible with both Medora and China Medical Journeys, the following semantics are retained even if the exact UI differs:

- **Home action-items banner** remains valid: quote ready, intake required, quote expiring, reply waiting
- **Empty-state CTA** on Home / Quotes / Messages should point back to the floating widget or intake start flow, not to a dead-end login page
- **Per-case detail deep link** can remain as a companion route for users who think in terms of a single case thread
- **PatientMessagePanel** remains the preferred high-focus messaging surface launched from the floating widget, even if `/dashboard/messages` also exists
- **Marketing site shell separation** remains valid for Medora-style sites: dashboard pages can sit outside the public header/footer while the floating widget still exists globally

### Data Grouping

Journey and AI Summary display data **grouped by case** — if patient has multiple cases, all are shown with case headers.

## Dynamic Questionnaire (Case Intake)

### Question Collector Type Extension

Existing 6 types + 3 new types:

| Type | Description | Example |
|------|-------------|---------|
| `text` | Single-line text | Name |
| `textarea` | Multi-line text | Symptom description |
| `select` | Single-choice dropdown | Budget range |
| `multiselect` | Multi-choice dropdown | Symptom types |
| `checkbox` | Checkbox group | Past conditions |
| `date` | Date picker | Surgery date |
| **`file_upload`** (new) | File upload with drag-drop | Medical reports, imaging |
| **`dynamic_list`** (new) | Add/remove item list | Medication list, surgery history, allergy list |
| **`yes_no_conditional`** (new) | Yes/No toggle with conditional sub-fields | "Any chronic conditions?" → expand details |

### Extended Question Structure

```typescript
interface QCTemplateQuestion {
  id: string;
  type: QCQuestionType;
  label: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  // New fields:
  accept?: string[];                      // file_upload: allowed file types
  maxFiles?: number;                      // file_upload: max file count
  maxFileSizeMB?: number;                 // file_upload: max size per file
  listFields?: QCTemplateQuestion[];      // dynamic_list: sub-field definitions per item
  conditionalFields?: QCTemplateQuestion[]; // yes_no_conditional: fields shown on "Yes"
}
```

### File Upload — Unified Uploader

File uploads in the questionnaire use CRM v2's unified `mediaUpload.createUploadIntent()` mechanism:

1. **New upload policy**: `intake_document` added to `UploadPolicyRegistry`
   - Allowed MIME types: pdf, jpg, png, doc, docx, dcm
   - Max file size: 20MB
   - S3 key namespace: `intake/{caseId}/{questionId}/{assetId}_{filename}`

2. **New patient endpoint**: `POST /api/patient/intake/:caseId/upload`
   - Verifies patient ownership of case
   - Calls `svc.mediaUpload.createUploadIntent({ policyId: 'intake_document', ownerType: 'case', ownerId: caseId, ... })`
   - Returns `{ uploadUrl, storageKey, expiresIn }`

3. **Frontend flow**:
   - Request presigned URL via endpoint above
   - PUT file directly to S3 presigned URL
   - Store `storageKey` in responses JSONB

4. **Response storage format**:
```json
{
  "q_ct_scan": [
    { "storageKey": "intake/case-123/q_ct_scan/abc123_report.pdf", "fileName": "report.pdf", "fileSize": 2048000 }
  ]
}
```

### Frontend Dynamic Renderer

```
IntakePage
├── IntakeProgress              — step / total (from template)
├── IntakeStepRenderer          — routes by question type
│   ├── TextField
│   ├── TextareaField
│   ├── SelectField
│   ├── MultiselectField
│   ├── CheckboxField
│   ├── DateField
│   ├── FileUploadField         — drag-drop + progress + file list
│   ├── DynamicListField        — add/remove items + render sub-fields
│   └── YesNoConditionalField   — toggle + conditional sub-fields
├── IntakeNavigation            — prev / next / submit
└── IntakeDraftSaver            — auto-save on step change (debounce 2s)
```

### Intake Backend Changes

- `GET /api/patient/intake/:caseId/template` — currently a stub; replace with Question Collector-backed template resolution:
  - resolve default template
  - merge hospital customization if case has assigned hospital
  - return existing draft/submitted response if present
- `POST /api/patient/intake/:caseId` — currently a stub; replace with Question Collector persistence instead of the current placeholder logger
- `PATCH /api/patient/intake/:caseId` — **new patient route** for draft save; can reuse existing `SaveResponseDraftUseCase`, but needs a patient-facing HTTP route and request contract

### Intake Contract Decision

The current patient intake route shape is **not reusable as-is** because it only accepts:

```typescript
{
  responses: Array<{
    questionId: string;
    answer: string | string[];
  }>
}
```

That shape cannot carry file uploads, nested list items, or conditional structured answers. For the CRM integration, patient intake should converge to a QC-style payload:

```typescript
{
  templateId: string;
  responses: QCResponsePayload;
}
```

This means the patient validation schema, patient route handler, and patient intake use case must be redesigned together rather than incrementally patched.

### QCResponsePayload Type Extension

The existing `QCResponsePayload` type (`Record<string, string | string[] | null>`) cannot accommodate `file_upload` (array of objects with storageKey/fileName/fileSize) or `dynamic_list` (array of objects with sub-field values). Must be extended to:

```typescript
export type QCResponseValue =
  | string
  | string[]
  | null
  | Array<{ storageKey: string; fileName: string; fileSize: number }>  // file_upload
  | Array<Record<string, string | string[] | null>>;                   // dynamic_list items

export type QCResponsePayload = Record<string, QCResponseValue>;
```

The normalization function `normalizeQCResponses()` must be updated to accept these new value shapes.

## Messages (Real-time)

### Data Model

```
Patient
├── Conversation 1 (Hospital A) — category: HOSPITAL_PATIENT
├── Conversation 2 (Hospital B) — category: HOSPITAL_PATIENT
└── Conversation 3 (Admin)      — category: ADMIN_PATIENT
```

### Page Structure

```
MessagesPage
├── ConversationList            — left panel
│   ├── Hospital/Admin name
│   ├── Last message preview
│   ├── Unread badge
│   └── Timestamp
└── ChatView                    — right panel
    ├── ChatHeader
    ├── MessageList             — scroll up for history, supports TEXT/IMAGE/FILE/SYSTEM
    └── MessageInput            — text + file upload (message_attachment policy)
```

### WebSocket Integration

Reuses CRM v2's existing `WsManager`:

1. **Connect**: On conversation open → join `conv:{convId}` room
2. **Receive**: `new_message` → append to React Query cache; `unread_update` → update badge
3. **Send**: `POST /api/patient/conversations/:convId/messages` → backend broadcasts to WS room
4. **Switch**: Disconnect old room, connect new room
5. **Reconnect**: Exponential backoff (1s → 2s → 4s → max 30s), fallback to 5s REST polling

### Backend Changes

- `GET /api/patient/conversations` — add `unreadCount` to response DTO
- `ws://.../ws/patient/notifications` — channel already exists; wire unread broadcast production logic and frontend consumption
- `POST /api/patient/conversations/:convId/messages` — extend contract if patient file/image messages are required; current patient route only supports plain text

## Support Tickets

### Page Structure

```
TicketsPage
├── TicketList                  — status badge, type label, priority, timestamp
├── CreateTicketModal           — type dropdown, title, description, attachment upload
└── TicketDetail                — info header + reply timeline + reply input
    └── ReplyTimeline           — admin + patient replies (isInternalNote filtered out)
```

### New Patient Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patient/tickets` | Patient's ticket list |
| POST | `/api/patient/tickets` | Create ticket (select type) |
| GET | `/api/patient/tickets/:id` | Ticket detail + replies (internal notes filtered) |
| POST | `/api/patient/tickets/:id/reply` | Reply to ticket + optional attachment |

Ticket types: `ACCOUNT_ISSUES`, `PAYMENT_PROBLEMS`, `HOSPITAL_COMMUNICATION`, etc. (from existing schema).

Attachments use existing `ticket_reply_attachment` upload policy.

### Ticket Ownership & Authorization

- All patient ticket endpoints filter by `patientId = session.userId` — patients can only see their own tickets
- `GET /api/patient/tickets/:id` filters replies: `isInternalNote = false` (admin-only notes hidden)
- Patient actor construction: `{ userId: session.userId, role: 'PATIENT' }` — passed to existing generic ticket use cases
- **No new patient-specific ticket use cases required by default**:
  - reuse `CreateTicketUseCase`
  - reuse `ListTicketsUseCase`
  - reuse `GetTicketUseCase`
  - reuse `ReplyToTicketUseCase`
- What actually needs to be added is the patient route layer plus optional attachment upload-init route for ticket replies
- Patients can create tickets with or without a `caseId` (general account issues don't need a case)

## Quotes

### Page Structure

```
QuotesPage
├── CaseGroupHeader             — grouped by case (case number + diagnosis)
└── QuoteCards
    ├── Hospital name + logo
    ├── Total amount + currency
    ├── Validity period (expiry warning)
    ├── Line items (expand/collapse)
    ├── Accept / Reject buttons (with confirmation modal)
    └── Status badge (PENDING/ACCEPTED/REJECTED/EXPIRED)
```

### Backend

Reuses existing patient endpoints:
- `GET /api/patient/cases/:id/quote` — quotes for a case
- `POST /api/patient/cases/:id/quote/accept`
- `POST /api/patient/cases/:id/quote/reject`

Frontend aggregates quotes across all patient's cases.

## Orders

### Page Structure

```
OrdersPage
├── OrderList                   — order number, date, hospital, amount, status
└── OrderDetail
    ├── Source quote info
    ├── Line items
    ├── Payment status
    └── Refund info (if any)
```

### New Patient Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patient/orders` | Patient's order list (paginated) |
| GET | `/api/patient/orders/:id` | Order detail |

### Backend Requirements

Orders are **read-only** for patients at the route layer. Existing generic order use cases already support patient ownership filtering through `actor.role === 'PATIENT'`. Therefore:

- no patient-specific order use case is required by default
- no new order repository is required by default if `patientId` filtering continues to work through the existing repository query path
- what is required is a patient route layer exposing read-only list/detail endpoints

## Journey

### Page Structure

```
JourneyPage
├── CaseGroupHeader             — grouped by case
└── JourneyView
    ├── JourneyCards            — visa / insurance / accommodation / transportation / postCare
    └── MilestoneTimeline       — completed (✓) / current (highlighted) / future (grey)
```

### Backend

Do **not** assume current `GET /api/patient/cases/:id` can absorb this cleanly without DTO redesign. Current patient case detail returns a narrow `CaseDTO`.

Preferred options:

1. **Preferred**: add dedicated patient journey endpoints
   - `GET /api/patient/cases/:id/journey`
   - `GET /api/patient/cases/:id/milestones`
2. **Alternative**: introduce a new patient aggregate DTO for case detail and explicitly version/expand the route response

Either approach is acceptable, but the design must explicitly choose one. This spec prefers **dedicated patient journey endpoints** to avoid silently overloading the existing case detail contract.

## AI Summary

### Page Structure

```
AiSummaryPage
├── CaseGroupHeader             — grouped by case
└── SummaryCard
    ├── Chinese summary (aiSummary.zh)
    ├── English summary (aiSummary.en)
    ├── Generation status badge (PENDING/PROCESSING/COMPLETED/FAILED)
    └── Last updated timestamp
```

### Backend

Current patient case DTO only exposes a single flat `aiSummary: string | null`; it does **not** expose:

- bilingual `{ zh, en }`
- patient visibility metadata
- summary status timestamps suitable for the UI above

Preferred options:

1. **Preferred**: add `GET /api/patient/cases/:id/ai-summary`
2. **Alternative**: include a new `patientAiSummary` object in a redesigned patient case aggregate DTO

This spec prefers a **dedicated patient AI summary endpoint** unless the team is already committed to a broader patient case aggregate response.

## Frontend Architecture

### API Layer

```
services/
├── api/
│   ├── config.ts              — /api/patient/* base URL (BFF proxy)
│   ├── crmApiClient.ts        — fetch wrapper (cookie auto-sent, no manual auth header)
│   ├── tickets.ts             — new
│   ├── orders.ts              — new
│   ├── messages.ts            — new (replaces existing)
│   ├── quotes.ts              — new (replaces existing)
│   ├── journey.ts             — new
│   ├── intake.ts              — new (dynamic questionnaire)
│   └── index.ts               — re-export
├── wsClient.ts                — retained, connects to CRM v2 WebSocket
```

### Removed Code

- `contexts/AuthContext.tsx` → replaced by `PatientAuthContext.tsx`
- `config/supabaseClient.ts` → deleted
- `services/api/user.ts` → replaced by `/api/patient/me`
- `@supabase/supabase-js` dependency → removed

### React Query Hooks

```
hooks/
├── usePatientAuth.ts          — login state, /me query
├── useTickets.ts              — tickets CRUD
├── useOrders.ts               — orders list/detail
├── useQuotes.ts               — aggregated quotes across cases
├── useJourney.ts              — journey + milestones per case
├── useAiSummary.ts            — AI summary per case
├── useMessages.ts             — conversations + WebSocket real-time
├── useIntakeTemplate.ts       — Question Collector dynamic template
└── useWebSocket.ts            — retained, connects to CRM v2 WS
```

### Login Page

Replace existing login with magic link flow:
1. Enter email → `POST /api/patient/magic-link`
2. Click email link → `POST /api/patient/verify-token` → cookie set → redirect to dashboard
3. If password set → email + password login (optional phase-2; needs new `POST /api/patient/login` endpoint)

### Migration Scope Clarification

`china-medical-journeys` currently has deeper Supabase coupling than just auth:

- `AuthContext`
- API config that injects Supabase bearer tokens
- dashboard data services shaped around legacy endpoints
- case intake flows that create/authenticate users via Supabase

So this is a **patient frontend re-platforming**, not only an auth swap. The implementation plan should treat:

- auth/session migration
- API client migration
- dashboard route/data migration
- legacy case-intake flow replacement

as separate deliverables.

## New Backend Endpoints Summary

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | POST | `/api/patient/session/restore` | Restore same-browser guest patient session/history |
| 2 | GET | `/api/patient/tickets` | Patient's ticket list |
| 3 | POST | `/api/patient/tickets` | Create ticket |
| 4 | GET | `/api/patient/tickets/:id` | Ticket detail (internal notes filtered) |
| 5 | POST | `/api/patient/tickets/:id/reply` | Reply to ticket |
| 6 | GET | `/api/patient/orders` | Patient's order list |
| 7 | GET | `/api/patient/orders/:id` | Order detail |
| 8 | POST | `/api/patient/intake/:caseId/upload` | Questionnaire file upload (presigned URL) |
| 9 | GET | `/api/patient/intake/:caseId/template` | Question Collector template (default + hospital customization) |
| 10 | PATCH | `/api/patient/intake/:caseId` | Save intake draft |
| 11 | POST | `/api/patient/login` | Email + password login, optional phase-2 |
| 12 | GET | `/api/patient/cases/:id/journey` | Patient-visible journey payload |
| 13 | GET | `/api/patient/cases/:id/milestones` | Patient-visible milestones |
| 14 | GET | `/api/patient/cases/:id/ai-summary` | Patient-facing AI summary aggregate |

### Existing Endpoints to Extend

| Endpoint | Change |
|----------|--------|
| `GET /api/patient/cases/:id` | If the team rejects dedicated aggregate endpoints, this route must move to a new expanded patient DTO instead of silently changing the old shape |
| `GET /api/patient/conversations` | Add `unreadCount` to response |
| `POST /api/patient/conversations/:convId/messages` | If attachments are in scope, extend beyond text-only payload |

### Existing Endpoints Reused As-Is

- `GET /api/patient/cases` — case list
- `GET /api/patient/conversations/:convId/messages` — message list
- `GET /api/patient/cases/:id/quote` — quotes for case
- `POST /api/patient/cases/:id/quote/accept` — accept quote
- `POST /api/patient/cases/:id/quote/reject` — reject quote

### Existing Routes That Are Present But Not Production-Ready For This Integration

- `GET /api/patient/intake/:caseId/template` — currently stub-backed
- `POST /api/patient/intake/:caseId` — currently stub-backed
- `POST /api/patient/conversations/:convId/messages` — currently text-only

### New Backend Infrastructure

- `intake_document` upload policy in `UploadPolicyRegistry`
- `QCQuestionType` extended: `file_upload`, `dynamic_list`, `yes_no_conditional`
- `QCTemplateQuestion` extended: `accept`, `maxFiles`, `maxFileSizeMB`, `listFields`, `conditionalFields`
- patient intake request/response contract redesign around `templateId + QCResponsePayload`
- opaque guest restore handle storage + lookup
- magic-link one-time-use persistence if email login links must be single-use
- WebSocket notification channel: `ws://.../ws/patient/notifications` exists; unread broadcast behavior and frontend wiring need completion

## Pagination

All list endpoints use offset pagination consistent with existing CRM v2 patterns:
- Query params: `page` (default 1), `limit` (default 20, max 100)
- Response: `{ data: T[], total: number, page: number, limit: number }`
- Applies to: tickets, orders, quotes (per case), milestones, conversations, messages (cursor-based for messages)

## Error States & Edge Cases

| Scenario | Behavior |
|----------|----------|
| File upload exceeds size limit | Frontend validates before upload; backend returns 413 if bypassed |
| S3 presigned URL expires during upload | Frontend retries: request new presigned URL, re-upload |
| No cases exist for patient | Journey/AI Summary/Quotes pages show empty state with CTA to start case intake |
| No orders exist | Orders page shows empty state |
| WebSocket reconnect fails permanently (>5min) | Stay on REST polling (5s), show "Limited connectivity" banner |
| Draft save conflict (concurrent edits) | Last-write-wins; frontend shows "Saved" timestamp so user knows |
| Session cookie expired (24h) | API returns 401 → frontend shows "Session expired" modal → magic link re-login |
| Same-browser guest returns with expired cookie | Frontend attempts restore handle flow before showing login |
| Patient has no conversation yet | Messages page shows empty state with info about when conversations are created |
| Quote already accepted/rejected | Buttons disabled with status badge; actions are final |

## Out of Scope

- Multi-hospital quote comparison (side-by-side view)
- Browser push notifications (Web Push API)
- Typing indicators and presence
- Online consultation booking (video calls)
- Stripe payment flow in patient dashboard (orders are read-only for now)

## Recommended Delivery Phases

### Phase 1 — Auth + Core Dashboard Migration

- ship floating Chat Widget + first-open hybrid widget/message state
- ship PatientMessagePanel as the main post-selection chat surface
- replace Supabase auth/session usage with CRM patient cookie session
- add guest restore flow for same-browser return visits
- migrate login/logout/me flow
- migrate quotes, conversations, and basic dashboard home
- keep messages text-only

### Phase 2 — Tickets + Orders + Journey

- add patient ticket routes
- add patient order routes
- add dedicated journey/milestones endpoints and UI

### Phase 3 — Dynamic Intake Rebuild

- replace intake stub with QC-backed template resolution
- redesign patient intake contract
- add draft-save route
- add `intake_document` upload flow

### Phase 4 — Patient AI Summary + Optional Password Login

- add patient-facing AI summary endpoint/aggregate
- add optional email/password login
- add magic-link one-time-use hardening
