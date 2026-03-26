# China Medical Journeys — CRM v2 Full Integration Design Spec

**Date**: 2026-03-26
**Project**: china-medical-journeys → medical-crm-v2 integration
**Frontend**: `/medical-china-comb/china-medical-journeys` (React 18 + Vite + Tailwind + React Query)
**Backend**: `/medical-crm-v2` (Hono API + Drizzle + Keycloak)

## Overview

Fully integrate the china-medical-journeys patient dashboard with the CRM v2 backend. Replace the existing Supabase Auth + legacy API setup with CRM v2's patient auth system and API endpoints. The dashboard will have 7 tabs: Home, Support Tickets, Messages, Quotes, Journey, AI Summary, Orders.

## Architecture Decision

**Approach: BFF Proxy (方案 A)** — CRM v2's existing `/api/patient/*` route group serves as the patient API gateway. New patient-specific endpoints are added to CRM v2. The frontend proxies all calls through BFF (Vite dev proxy + production Nginx/serverless).

## Authentication

### Adopting CRM v2's "Try First, Register Later" Model

Per the existing spec (`2026-03-17-patient-dashboard-chatwidget-design.md`), the patient auth system is:

1. **Onboarding init**: Visitor submits name + email + phone → `POST /api/patient/onboarding/init` → backend creates patient + Case + sets `patient_session` httpOnly cookie (JWT, 24h)
2. **Immediate access**: After onboarding, user is logged in — no email verification required for initial session
3. **Magic link**: Email sent for return visits — click link → `POST /api/patient/verify-token` → new session cookie
4. **Optional password**: User can set password via `POST /api/patient/set-password` for email + password login
5. **Dedicated middleware**: `patientAuthMiddleware` validates `patient_session` cookie, completely separate from Keycloak

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
| Rate limiting (magic link 3/hr, onboarding 5/IP/hr) | Existing |
| Turnstile CAPTCHA on onboarding | Existing |
| `Secure` + `SameSite=Lax` cookie flags | Existing (`Lax` required — `Strict` would break magic link redirects from email) |
| Magic link token one-time use | Verify implementation |
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

- `GET /api/patient/intake/:caseId/template` — returns default Question Collector template, with hospital customization if case has assigned hospital (replaces current stub)
- `POST /api/patient/intake/:caseId` — submit responses (existing route, needs real implementation connecting to Question Collector)
- `PATCH /api/patient/intake/:caseId` — save draft (**new route**, does not exist yet)

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

- `GET /api/patient/conversations` — add `unreadCount` to response
- `ws://.../ws/patient/notifications` — cross-conversation unread push channel (new)

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

- All patient ticket endpoints filter by `createdBy = session.userId` — patients can only see their own tickets
- `GET /api/patient/tickets/:id` filters replies: `isInternalNote = false` (admin-only notes hidden)
- Patient actor construction: `{ id: session.userId, role: 'PATIENT' }` — passed to use cases
- New patient-specific use cases needed: `CreatePatientTicket`, `ListPatientTickets`, `GetPatientTicketDetail`, `PatientReplyToTicket` — these wrap existing domain logic with patient ownership enforcement
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

New use cases needed: `ListPatientOrders`, `GetPatientOrderDetail` — filter by patient ownership. These require a new `DrizzleOrderRepository` (or extending existing repo) with patient-scoped queries. Orders are **read-only** for patients — no create/update/cancel endpoints.

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

No new endpoints. Extend `GET /api/patient/cases/:id` response DTO to include `journey` (JSONB) and `milestones` (array) fields.

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

No new endpoints. Read from `GET /api/patient/cases/:id` `aiSummary` field. Only show content where `isVisibleToPatient` is true.

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
3. If password set → email + password login (needs new `POST /api/patient/login` endpoint)

## New Backend Endpoints Summary

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | GET | `/api/patient/tickets` | Patient's ticket list |
| 2 | POST | `/api/patient/tickets` | Create ticket |
| 3 | GET | `/api/patient/tickets/:id` | Ticket detail (internal notes filtered) |
| 4 | POST | `/api/patient/tickets/:id/reply` | Reply to ticket |
| 5 | GET | `/api/patient/orders` | Patient's order list |
| 6 | GET | `/api/patient/orders/:id` | Order detail |
| 7 | POST | `/api/patient/intake/:caseId/upload` | Questionnaire file upload (presigned URL) |
| 8 | GET | `/api/patient/intake/:caseId/template` | Question Collector template (default + hospital customization) |
| 9 | PATCH | `/api/patient/intake/:caseId` | Save intake draft |
| 10 | POST | `/api/patient/login` | Email + password login (rate limited: 5 attempts/email/15min) |

### Existing Endpoints to Extend

| Endpoint | Change |
|----------|--------|
| `GET /api/patient/cases/:id` | DTO adds `journey`, `milestones`, `aiSummary` fields |
| `GET /api/patient/conversations` | Add `unreadCount` to response |

### Existing Endpoints Reused As-Is

- `GET /api/patient/cases` — case list
- `GET /api/patient/conversations/:convId/messages` — message list
- `POST /api/patient/conversations/:convId/messages` — send message
- `GET /api/patient/cases/:id/quote` — quotes for case
- `POST /api/patient/cases/:id/quote/accept` — accept quote
- `POST /api/patient/cases/:id/quote/reject` — reject quote
- `POST /api/patient/intake/:caseId` — submit intake

### New Backend Infrastructure

- `intake_document` upload policy in `UploadPolicyRegistry`
- `QCQuestionType` extended: `file_upload`, `dynamic_list`, `yes_no_conditional`
- `QCTemplateQuestion` extended: `accept`, `maxFiles`, `maxFileSizeMB`, `listFields`, `conditionalFields`
- WebSocket notification channel: `ws://.../ws/patient/notifications` (already partially implemented in patient-ws.ts, needs completion)

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
| Patient has no conversation yet | Messages page shows empty state with info about when conversations are created |
| Quote already accepted/rejected | Buttons disabled with status badge; actions are final |

## Out of Scope

- Multi-hospital quote comparison (side-by-side view)
- Browser push notifications (Web Push API)
- Typing indicators and presence
- Online consultation booking (video calls)
- Stripe payment flow in patient dashboard (orders are read-only for now)
