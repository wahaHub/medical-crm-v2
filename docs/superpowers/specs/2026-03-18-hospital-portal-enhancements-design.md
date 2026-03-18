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
| Email Templates | New top-level page + 4 new API endpoints |
| FAQ | New top-level page + 4 new API endpoints |
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
   - Edit (draft only): `PUT /api/v2/quotes/{id}`
   - View status changes

**Existing API endpoints used**:
- `POST /api/v2/quotes` — create
- `GET /api/v2/quotes?caseId={caseId}` — list
- `GET /api/v2/quotes/{id}` — get detail
- `PUT /api/v2/quotes/{id}` — update
- `POST /api/v2/quotes/{id}/send` — send to patient
- `POST /api/v2/cases/{caseId}/documents` — upload quote file

**No new backend endpoints needed.**

---

## 3. Materials — Procedures Catalog Expansion

### Current State

The Procedures tab in Materials has these fields per `MaterialsProcedureDTO`:
- `procedureName`, `description`, `priceMin`, `priceMax`, `priceRange`, `isPopular`, `sortOrder`

### Expanded Fields

Add the following fields to the procedure model:

| Field | Type | Description |
|-------|------|-------------|
| `recoveryTime` | string | e.g. "2-4 weeks" |
| `duration` | string | e.g. "2-3 hours" |
| `hospitalStayDays` | string | e.g. "1-2 days" |
| `indications` | string | Suitable candidates / conditions |
| `risks` | string | Risks and precautions |
| `inclusions` | string[] | What's included (pre-op tests, follow-ups, etc.) |

### Backend Changes

1. **Database**: Add columns to the procedures table (all nullable, non-breaking)
2. **Validation schemas**: Extend `createServiceCatalogItemSchema` / `updateServiceCatalogItemSchema` in `@medical-crm/validation`
3. **API**: No new endpoints — existing CRUD endpoints serve the expanded fields

### Frontend Changes

- Expand the create/edit procedure modal with new fields
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

### Backend — 4 New API Endpoints

```
POST   /api/v2/hospitals/{hospitalId}/email-templates     — Create template
GET    /api/v2/hospitals/{hospitalId}/email-templates     — List templates (filter by type, status)
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

### Data Model

```typescript
interface FaqItem {
  id: string;
  hospitalId: string;
  question: string;
  answer: string;
  category: string;              // general | pricing | procedures | recovery | travel | insurance
  language: string;              // en | zh
  sortOrder: number;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}
```

### UI Components

1. **List View**:
   - Filter by category (tabs or dropdown)
   - Filter by language
   - Search by question text
   - Table/card list: Question, Category, Language, Status, Actions
   - "Add FAQ" button

2. **Create/Edit Modal**:
   - Question input
   - Answer textarea
   - Category selector
   - Language selector (en / zh)
   - Status toggle (active / inactive)

### Backend — 4 New API Endpoints

```
POST   /api/v2/hospitals/{hospitalId}/faqs     — Create FAQ
GET    /api/v2/hospitals/{hospitalId}/faqs     — List FAQs (filter by category, language, status)
PUT    /api/v2/faqs/{id}                       — Update FAQ
DELETE /api/v2/faqs/{id}                       — Delete FAQ (soft)
```

**Implementation**:
- New route file: `apps/api/src/routes/faq.routes.ts`
- New domain entity, repository, use cases
- New DB table: `chatbot_faqs`
- New validation schemas in `@medical-crm/validation`

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

- Keycloak password change: use Keycloak Account API or Admin REST API
- User preferences: new `user_preferences` table or JSONB column on users table

---

## 7. Sidebar Navigation Update

### New Navigation (8 items)

```typescript
const navItems: NavItem[] = [
  { key: 'dashboard',        label: 'Dashboard',        icon: LayoutDashboard, href: '/dashboard' },
  { key: 'cases',            label: 'Cases',             icon: FolderOpen,      href: '/cases' },
  { key: 'consultations',    label: 'Consultations',     icon: Video,           href: '/consultations' },
  { key: 'messages',         label: 'Messages',          icon: MessageSquare,   href: '/messages' },
  { key: 'materials',        label: 'Materials',         icon: Megaphone,       href: '/materials' },
  { key: 'email-templates',  label: 'Email Templates',   icon: Mail,            href: '/email-templates' },
  { key: 'faq',              label: 'FAQ',               icon: HelpCircle,      href: '/faq' },
  { key: 'settings',         label: 'Settings',          icon: Settings,        href: '/settings' },
];
```

Settings placed last, above Logout button.

---

## 8. Backend Changes Summary

### New API Endpoints (9 total)

| # | Method | Path | Module |
|---|--------|------|--------|
| 1 | POST | `/api/v2/hospitals/{hospitalId}/email-templates` | Email Templates |
| 2 | GET | `/api/v2/hospitals/{hospitalId}/email-templates` | Email Templates |
| 3 | PUT | `/api/v2/email-templates/{id}` | Email Templates |
| 4 | DELETE | `/api/v2/email-templates/{id}` | Email Templates |
| 5 | POST | `/api/v2/hospitals/{hospitalId}/faqs` | FAQ |
| 6 | GET | `/api/v2/hospitals/{hospitalId}/faqs` | FAQ |
| 7 | PUT | `/api/v2/faqs/{id}` | FAQ |
| 8 | DELETE | `/api/v2/faqs/{id}` | FAQ |
| 9 | PATCH | `/api/v2/users/me/preferences` | Settings |

### New DB Tables

1. **`email_templates`**: id, hospital_id, name, type, subject, body, variables (jsonb), status, created_at, updated_at, deleted_at
2. **`chatbot_faqs`**: id, hospital_id, question, answer, category, language, sort_order, status, created_at, updated_at, deleted_at
3. **`user_preferences`** (or JSONB column on users): preferred_language, notification_settings (jsonb)

### Schema Extensions

- **Procedures table**: Add columns `recovery_time`, `duration`, `hospital_stay_days`, `indications`, `risks`, `inclusions` (jsonb)
- **Validation schemas**: Extend procedure schemas, add email-template schemas, add FAQ schemas, add user-preferences schema

### Existing API Endpoints Used (no changes needed)

- Quotes: 7 endpoints (create, list, get, update, send, accept, reject)
- Service Catalog: 6 endpoints
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
│   ├── faq.routes.ts                   # New route file
│   └── user-preferences.routes.ts      # New route file
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
