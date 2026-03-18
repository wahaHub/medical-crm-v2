# Hospital Portal Enhancements Design Spec

> Date: 2026-03-18
> Status: Approved
> Scope: Incremental feature additions to `apps/hospital/` in medical-crm-v2

---

## 1. Overview

Extend the existing Hospital Portal with new features aligned to the patientsflow design documents. The portal currently has 5 pages (Dashboard, Cases, Consultations, Messages, Materials) and will gain 3 new pages plus expanded functionality on existing pages.

### What's Changing

| Area | Change |
|------|--------|
| Case Detail | 7 tabs → 9 tabs (+ AI Summary, + Quote) |
| Materials — Procedures | Expand fields into a full Procedures Catalog |
| Email Templates | New top-level page + 5 new API endpoints |
| FAQ | New top-level page (reuse existing 5 chatbot-faq API endpoints) |
| Settings | New top-level page + 1 new API endpoint |
| Sidebar Nav | 5 items → 8 items |

### What's NOT Changing

- Dashboard (no Reply Task Queue)
- Case Timeline (not adding)
- Contact Logging (already in Case Marketing tab)
- Messages page
- Consultations page

---

## 2. Case Detail — Tab Expansion

### 2.1 New Tab Order (9 tabs)

```
1. AI Summary      (NEW — Sparkles icon)
2. Intake           (existing — FileText)
3. Documents        (existing — FileText)
4. Messages         (existing — MessageSquare)
5. Diagnosis        (existing — Stethoscope)
6. Quote            (NEW — Receipt icon)
7. Marketing        (existing — Megaphone)
8. Invitation Letter (existing — FileSignature)
9. Consultation     (existing — Video)
```

### 2.2 AI Summary Tab

**Data source**: `caseDetail.aiSummary` field (string | null), already present in `HospitalCaseDetail` type and returned by `GET /api/v2/cases/{id}`.

**Component**: Reuse pattern from Admin's `CaseAiSummaryTab`. Create `apps/hospital/src/components/tabs/case-ai-summary-tab.tsx`.

**Behavior**:
- If `aiSummary` exists: render text in an indigo-tinted card with `whitespace-pre-wrap`
- If null: render `<EmptyState>` with message "No AI summary available. An AI-generated summary will appear here once the case has been processed."

**No backend changes needed** — data already returned with case detail.

### 2.3 Quote Tab

**Data source**: `GET /api/v2/quotes?caseId={caseId}` — list quotes for this case.

**Component**: `apps/hospital/src/components/tabs/case-quote-tab.tsx`

**Features**:

1. **Quote List** — Display all quotes for this case with status badges (DRAFT / PENDING / ACCEPTED / REJECTED / EXPIRED)

2. **Create Quote Form** (Modal):
   - Dynamic line items list:
     - Each row: item name (text input) + price (number input) + delete button
     - "Add Item" button to append rows
   - Auto-calculated total at bottom
   - Notes / terms textarea
   - Valid until date picker
   - Save as draft / Send immediately actions

3. **Upload Quote Document**:
   - Upload a quote PDF/document via `POST /api/v2/cases/{caseId}/documents` with `documentType: "quote"`
   - Display uploaded quote documents in a section

4. **Quote Actions**:
   - Send: `POST /api/v2/quotes/{id}/send`
   - Edit (draft only): `PATCH /api/v2/quotes/{id}`
   - View status changes

**Existing API endpoints used**:
- `POST /api/v2/quotes` — create (requires `caseId`, `hospitalId`, `totalAmount`)
- `GET /api/v2/quotes?caseId={caseId}` — list (caseId filter supported in `quoteListQuerySchema`)
- `GET /api/v2/quotes/{id}` — get detail
- `PATCH /api/v2/quotes/{id}` — update (PATCH, not PUT)
- `POST /api/v2/quotes/{id}/send` — send to patient
- `POST /api/v2/cases/{caseId}/documents` — upload quote file

**No new backend endpoints needed.**

---

## 3. Materials — Procedures Catalog Expansion

### Context: Two Procedure Systems

The project has two separate procedure data sources:

1. **Materials Procedures** (`MaterialsProcedureDTO`) — sourced from Supabase, displayed in the hospital portal Materials tab. Fields: `procedureName`, `description`, `priceMin`, `priceMax`, `priceRange`, `isPopular`, `sortOrder`. Managed via `materials-actions.ts`.

2. **Service Catalog Items** (`service_catalog_items` table in CRM DB) — used for quote generation. Already has: `estimatedStayDays` (integer), `estimatedRecoveryDays` (integer), `inclusions` (jsonb). Managed via `service-catalog.routes.ts`.

### Approach: Expand Materials Procedures

We expand the **Materials Procedures** (what hospital staff see and edit in the Materials tab) with richer detail fields. This keeps the UI change localized to the existing Procedures tab.

### Expanded Fields

Add the following fields to `MaterialsProcedureDTO` and the underlying Supabase table:

| Field | Type | Description |
|-------|------|-------------|
| `recoveryTime` | string \| null | e.g. "2-4 weeks" |
| `duration` | string \| null | e.g. "2-3 hours" |
| `hospitalStayDays` | string \| null | e.g. "1-2 days" |
| `indications` | string \| null | Suitable candidates / conditions |
| `risks` | string \| null | Risks and precautions |
| `inclusions` | string[] | What's included (pre-op tests, follow-ups, etc.) |

### Backend Changes

1. **Supabase procedures table**: Add columns (all nullable, non-breaking migration)
2. **Materials API** (Supabase sync layer): Return new fields in procedure read/write
3. **API**: No new endpoints — existing materials CRUD endpoints serve the expanded fields

### Frontend Changes

- Expand the create/edit procedure modal in `materials-tabs.tsx` with new fields
- Display new fields in the procedure card/table (collapsible details section)
- Existing file: `apps/hospital/src/components/materials-tabs.tsx` (Procedures section)

---

## 4. Email Templates — New Top-Level Page

### Route

`/email-templates` → `apps/hospital/src/app/(portal)/email-templates/page.tsx`

### Data Model

```typescript
interface EmailTemplate {
  id: string;
  hospitalId: string;
  name: string;                    // Template display name
  type: string;                    // intro | quote | marketing | followup | post_ops | custom
  subject: string;                 // Email subject line (supports variables)
  body: string;                    // Email body (supports variables)
  variables: string[];             // Available variable names for this template
  status: 'draft' | 'active';     // Only active templates appear in Case Marketing
  createdAt: string;
  updatedAt: string;
}
```

### Supported Variables

Templates support placeholder variables that get auto-replaced when used from Case Marketing:

- `{{patient_name}}` — Patient's full name
- `{{case_number}}` — Case reference number
- `{{hospital_name}}` — Hospital name
- `{{quote_total}}` — Quote total amount
- `{{doctor_name}}` — Assigned doctor name
- `{{procedure_name}}` — Procedure name

### UI Components

1. **List View**:
   - Filter by type (tabs or dropdown): All / Intro / Quote / Marketing / Follow-up / Post-Ops
   - Search by template name
   - Table columns: Name, Type, Subject, Status, Last Updated, Actions (Edit / Delete)
   - "Create Template" button

2. **Create/Edit Modal**:
   - Name input
   - Type selector (dropdown)
   - Subject input (with variable insert buttons)
   - Body textarea (with variable insert buttons)
   - Status toggle (draft / active)
   - Preview button — renders with sample data

3. **Variable Insert UI**:
   - Row of clickable chips/buttons above subject and body fields
   - Click to insert `{{variable}}` at cursor position

### Integration with Case Marketing

In `case-detail-panel.tsx` → Marketing tab → Email sub-tab:
- Add a "Load Template" dropdown that fetches `GET /api/v2/hospitals/{hospitalId}/email-templates?status=active`
- Selecting a template populates subject + body with variables auto-replaced using current case data
- Hospital can edit before sending

### Backend — 5 New API Endpoints

```
POST   /api/v2/hospitals/{hospitalId}/email-templates     — Create template
GET    /api/v2/hospitals/{hospitalId}/email-templates     — List templates (filter by type, status)
GET    /api/v2/email-templates/{id}                       — Get single template (for edit modal)
PUT    /api/v2/email-templates/{id}                       — Update template
DELETE /api/v2/email-templates/{id}                       — Delete template (soft)
```

**Implementation**:
- New route file: `apps/api/src/routes/email-template.routes.ts`
- New domain entity, repository, use cases following existing patterns (service-catalog as reference)
- New DB table: `email_templates`
- New validation schemas in `@medical-crm/validation`

---

## 5. FAQ Management — New Top-Level Page

### Route

`/faq` → `apps/hospital/src/app/(portal)/faq/page.tsx`

### Existing Backend — Reuse `chatbot-faq` API

A complete FAQ backend **already exists**:

- **DB table**: `chatbot_faq_items` with bilingual columns (`question_en`, `question_zh`, `answer_en`, `answer_zh`), `category`, `keywords` (jsonb), `is_active`, `sort_order`
- **API routes**: `apps/api/src/routes/chatbot-faq.routes.ts` — 5 endpoints + analytics:
  - `POST /api/v2/chatbot/faqs` — create
  - `GET /api/v2/chatbot/faqs` — list (with query filters)
  - `GET /api/v2/chatbot/faqs/{id}` — get single
  - `PATCH /api/v2/chatbot/faqs/{id}` — update
  - `DELETE /api/v2/chatbot/faqs/{id}` — delete
  - `GET /api/v2/chatbot/analytics` — analytics stub

**No new backend endpoints needed.** The frontend consumes the existing API.

### Data Model (matches existing `chatbot_faq_items` table)

```typescript
interface FaqItem {
  id: string;
  category: string;              // general | pricing | procedures | recovery | travel | insurance
  questionEn: string;            // English question
  questionZh: string;            // Chinese question
  answerEn: string;              // English answer
  answerZh: string;              // Chinese answer
  keywords: string[];            // Search keywords
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### UI Components

1. **List View**:
   - Filter by category (tabs or dropdown)
   - Search by question text (matches keywords + question text)
   - Table/card list: Question (en/zh), Category, Status, Actions
   - "Add FAQ" button

2. **Create/Edit Modal**:
   - Question EN input + Question ZH input (bilingual)
   - Answer EN textarea + Answer ZH textarea (bilingual)
   - Category selector
   - Keywords input (comma-separated tags)
   - Active toggle

---

## 6. Settings — New Top-Level Page

### Route

`/settings` → `apps/hospital/src/app/(portal)/settings/page.tsx`

### UI — 3 Card Sections

#### 6.1 Password Management

- Current password input
- New password input
- Confirm new password input
- Save button
- **Backend**: Keycloak user account API — password update endpoint

#### 6.2 Preferred Language

- Dropdown: English / 中文 / (extensible)
- Save button
- **Backend**: `PATCH /api/v2/users/me/preferences` with `{ preferredLanguage: "en" | "zh" }`

#### 6.3 Email Notification Management

Toggle switches for:
- New case notifications
- New message notifications
- Quote status change notifications
- Consultation reminder notifications

Save button.
- **Backend**: `PATCH /api/v2/users/me/preferences` with `{ notifications: { newCase: true, ... } }`

### Backend — 1 New API Endpoint

```
PATCH /api/v2/users/me/preferences — Update user preferences (language + notifications)
```

- **Keycloak password change**: New BFF endpoint `POST /api/auth/change-password` in the hospital app's Next.js API routes. The BFF calls Keycloak Admin REST API (`PUT /admin/realms/{realm}/users/{userId}` with `credentials` payload) using the service account. The frontend never talks to Keycloak directly. Error handling: wrong current password returns 400 with message.
- **User preferences**: new `user_preferences` table or JSONB column on users table

---

## 7. Sidebar Navigation Update

### New Navigation (8 items)

```typescript
// Note: existing code uses JSX elements for icons (e.g. <LayoutDashboard size={20} />)
const navItems: NavItem[] = [
  { key: 'dashboard',        label: 'Dashboard',        icon: <LayoutDashboard size={20} />, href: '/dashboard' },
  { key: 'cases',            label: 'Cases',             icon: <FolderOpen size={20} />,      href: '/cases' },
  { key: 'consultations',    label: 'Consultations',     icon: <Video size={20} />,           href: '/consultations' },
  { key: 'messages',         label: 'Messages',          icon: <MessageSquare size={20} />,   href: '/messages' },
  { key: 'materials',        label: 'Materials',         icon: <Megaphone size={20} />,       href: '/materials' },
  { key: 'email-templates',  label: 'Email Templates',   icon: <Mail size={20} />,            href: '/email-templates' },
  { key: 'faq',              label: 'FAQ',               icon: <HelpCircle size={20} />,      href: '/faq' },
  { key: 'settings',         label: 'Settings',          icon: <Settings size={20} />,        href: '/settings' },
];
```

Settings placed last, above Logout button.

---

## 8. Backend Changes Summary

### New API Endpoints (7 total)

| # | Method | Path | Module |
|---|--------|------|--------|
| 1 | POST | `/api/v2/hospitals/{hospitalId}/email-templates` | Email Templates |
| 2 | GET | `/api/v2/hospitals/{hospitalId}/email-templates` | Email Templates |
| 3 | GET | `/api/v2/email-templates/{id}` | Email Templates |
| 4 | PUT | `/api/v2/email-templates/{id}` | Email Templates |
| 5 | DELETE | `/api/v2/email-templates/{id}` | Email Templates |
| 6 | PATCH | `/api/v2/users/me/preferences` | Settings |
| 7 | POST | `/api/auth/change-password` (BFF) | Settings |

### New DB Tables

1. **`email_templates`**: id, hospital_id, name, type, subject, body, variables (jsonb), status, created_at, updated_at, deleted_at
2. **`user_preferences`** (or JSONB column on users): preferred_language, notification_settings (jsonb)

### Existing DB Tables Used (no changes)

- **`chatbot_faq_items`**: Already exists with bilingual columns, keywords, categories — 5 API endpoints ready

### Schema Extensions

- **Supabase procedures table**: Add columns `recovery_time`, `duration`, `hospital_stay_days`, `indications`, `risks`, `inclusions` (jsonb array)
- **Validation schemas**: Add email-template schemas, add user-preferences schema

### Existing API Endpoints Used (no changes needed)

- Quotes: 7 endpoints (create, list, get, update via PATCH, send, accept, reject) — `quoteListQuerySchema` supports `caseId` filter
- Chatbot FAQ: 5 endpoints + analytics at `/api/v2/chatbot/faqs`
- Service Catalog: 6 service-catalog + 5 quote-template endpoints
- Documents: upload endpoint for quote files
- Cases: case detail returns `aiSummary` field

---

## 9. File Structure — New Files

```
apps/hospital/src/
├── app/(portal)/
│   ├── email-templates/
│   │   └── page.tsx                    # Email Templates page
│   ├── faq/
│   │   └── page.tsx                    # FAQ page
│   └── settings/
│       └── page.tsx                    # Settings page
├── components/
│   ├── tabs/
│   │   ├── case-ai-summary-tab.tsx     # AI Summary tab
│   │   └── case-quote-tab.tsx          # Quote tab
│   ├── email-templates-list.tsx        # Email Templates list component
│   ├── faq-list.tsx                    # FAQ list component
│   └── settings-view.tsx              # Settings component
├── actions/
│   ├── email-template-actions.ts       # Server actions for email templates
│   ├── faq-actions.ts                  # Server actions for FAQ
│   └── settings-actions.ts            # Server actions for settings
├── queries/
│   ├── use-email-templates.ts          # React Query hooks
│   ├── use-faqs.ts                     # React Query hooks
│   └── use-quotes.ts                   # React Query hooks for case quotes
└── lib/
    └── api-types.ts                    # Add new type interfaces

apps/api/src/
├── routes/
│   ├── email-template.routes.ts        # New route file
│   └── user-preferences.routes.ts      # New route file
# Note: FAQ uses existing chatbot-faq.routes.ts — no new route file needed
```

---

## 10. Non-Goals / Out of Scope

- AI agent auto-reply logic (FAQ is management only)
- Email sending infrastructure (template management only; actual send is in Case Marketing)
- Rebuild/regenerate AI Summary button
- Case Timeline tab
- Reply Task Queue
- Real-time WebSocket for messages
- Quote comparison from patient perspective
