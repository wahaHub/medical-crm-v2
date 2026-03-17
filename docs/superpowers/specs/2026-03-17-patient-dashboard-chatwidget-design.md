# Patient Dashboard & Chat Widget Design Spec

**Date**: 2026-03-17
**Project**: Medora Beauty (medora-health-beauty root project)
**Backend**: medical-crm-v2 Hono API

## Overview

Add a Patient Dashboard and a conversational Chat Widget to the Medora Beauty marketing website. The Chat Widget guides visitors through a step-by-step flow to match them with hospitals, then seamlessly transitions into a messaging interface. The Dashboard gives patients a logged-in area to manage their cases, view quotes, and complete medical intake forms.

## Architecture Decision

**Approach: Embedded (方案 A)** — Build directly inside the existing Vite + React 19 project. Shares Tailwind theme, i18n, React Query infrastructure. Fastest to implement for MVP scope.

## User Flow

```
Visitor lands on site
  → Clicks floating chat bubble (bottom-right)
  → Step 1: Select category (Face / Body / Breast / Non-Surgical)
  → Step 2: Select procedure (dynamic list from CRM v2 API)
  → Step 3: Select destination (country/city)
  → Step 4: Enter name, email, phone → "Find My Hospitals"
  → [Backend: create temp patient + Case + match hospitals]
  → Step 5: View 2-3 hospital recommendation cards → select one
  → [Backend: distribute Case to hospital + generate session token + send email]
  → Step 6: Chat widget switches to messaging interface with selected hospital
  → Email sent with:
    - Magic link to create account (optional)
    - Link to complete medical intake form
```

## Authentication

### "Try First, Register Later" Model

1. **Temp session**: When visitor submits name + email + phone, backend creates a temporary patient record and returns a short-lived session token (JWT, 24h). Stored in `localStorage`.
2. **Zero-friction entry**: After selecting a hospital, the chat widget uses this token to enter messaging immediately — no email verification required.
3. **Email with magic link**: Sent after hospital selection. Contains link to:
   - Set password (optional) to create a full account
   - Complete medical intake form
4. **Return visits**: Email + password login if password was set; otherwise request a new magic link (enter email → receive link).

### Auth Middleware

All `/api/patient/*` endpoints use a dedicated `patientAuthMiddleware` (not Keycloak). Validates the session token from `Authorization: Bearer <token>` header.

## Chat Widget (Floating)

### UI Specifications

- **Position**: Fixed bottom-right corner, all pages
- **Bubble**: ~56px circle with icon + unread badge
- **Window**: ~380×520px, expandable/collapsible
- **Replaces**: Current `ConsultationModal` functionality (existing `/get-quote` page retained as fallback)

### Dual Mode

| State | Behavior |
|-------|----------|
| **Not authenticated** | Shows onboarding flow (Steps 1-6 above) |
| **Authenticated** | Shows conversation list / active chat with hospital(s) |

### Onboarding Steps

| Step | UI Element | Data Source |
|------|-----------|-------------|
| 1. Category | Card grid: Face, Body, Breast, Non-Surgical | Static |
| 2. Procedure | Scrollable list filtered by category | `GET /api/patient/procedures?category=X` |
| 3. Destination | Country/city selector | `GET /api/patient/destinations` |
| 4. Contact Info | Form: name, email, phone + submit button | `POST /api/patient/register` |
| 5. Hospital Recommendations | 2-3 hospital cards (avatar, name, rating, tags) | `POST /api/patient/match-hospitals` |
| 6. Chat | Message list + input | `POST /api/patient/select-hospital` → messaging API |

### Chat Mode

- Message list with timestamps and read indicators
- Text input with send button
- Polling: 5s interval when chat window is open, stopped when closed
- Unread badge on bubble: polled every 30s via `GET /api/patient/cases`

### Technical Implementation

- State machine via `useReducer` to manage onboarding steps
- Component: `ChatWidget.tsx` (always rendered in `App.tsx`)
- Shares React Query cache with Dashboard for message data

## Patient Dashboard

### Route Structure

```
/dashboard                → Dashboard home (cases overview)
/dashboard/cases/:caseId  → Case detail (tabbed)
/dashboard/intake/:caseId → Medical intake form
/dashboard/account        → Account settings (set password, edit profile)
```

All `/dashboard/*` routes wrapped in `ProtectedRoute`. No token → redirect to login page (enter email → magic link).

### Dashboard Home (`/dashboard`)

**Top section**: Welcome message + patient name

**Action items banner** (conditional):
- "You have a new quote from Hospital X" → links to quote tab
- "Please complete your medical intake" → links to intake page
- "Quote from Hospital X expires in 3 days" → urgent highlight

**Cases list**: Card layout, each card shows:
- Case number + creation date
- Hospital name + logo
- Status badge: `Waiting for Quote` | `Quote Received` | `In Treatment` | `Completed`
- Latest message preview (1 line) + unread message count
- Click → navigate to `/dashboard/cases/:caseId`

### Case Detail (`/dashboard/cases/:caseId`)

Three tabs:

| Tab | Content |
|-----|---------|
| **Messages** (default) | Chat with hospital — shared data with ChatWidget. MessageList + MessageInput. |
| **Quote** | Quote details: line items, total price, validity period. Accept / Reject buttons. |
| **Overview** | Case info: diagnosis, treatment stage, timeline milestones. |

### Medical Intake (`/dashboard/intake/:caseId`)

- Accessed via magic link: `/dashboard/intake/:caseId?token=xxx`
- Multi-step form: medical history, allergies, medications, prior surgeries, expectations
- Template fetched from `GET /api/patient/intake/:caseId/template`
- Submitted to `POST /api/patient/intake/:caseId`
- Shows completion status after submission

### Account Page (`/dashboard/account`)

- Set/change password
- Edit name, email, phone
- Language preference

## CRM v2 API — New Endpoints

All endpoints prefixed with `/api/patient/` and protected by `patientAuthMiddleware`.

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/patient/register` | Create temp patient with email + name + phone, return session token |
| POST | `/api/patient/magic-link` | Send magic link email to given address |
| POST | `/api/patient/verify-token` | Verify magic link token, return session token |
| POST | `/api/patient/set-password` | Set password for account (optional) |

### Chat Widget Flow

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patient/procedures` | List procedures by category |
| GET | `/api/patient/destinations` | List available destinations |
| POST | `/api/patient/match-hospitals` | Match hospitals based on procedure + destination, return 2-3 recommendations |
| POST | `/api/patient/select-hospital` | Select hospital → create Case, distribute, generate token, trigger email |

### Dashboard Data

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patient/cases` | Patient's case list with status, hospital info, unread count |
| GET | `/api/patient/cases/:id` | Case detail |
| GET | `/api/patient/cases/:id/messages` | Message list for case |
| POST | `/api/patient/cases/:id/messages` | Send message |
| GET | `/api/patient/cases/:id/quote` | View quote |
| POST | `/api/patient/cases/:id/quote/accept` | Accept quote |
| POST | `/api/patient/cases/:id/quote/reject` | Reject quote |

### Medical Intake

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patient/intake/:caseId/template` | Get intake questionnaire template for case |
| POST | `/api/patient/intake/:caseId` | Submit intake form |

## Component Architecture

```
App.tsx
├── ChatWidget.tsx (global, always rendered)
│   ├── ChatBubble.tsx          — floating button + unread badge
│   ├── ChatWindow.tsx          — expandable window container
│   │   ├── OnboardingFlow.tsx  — step-by-step guide (Steps 1-5)
│   │   │   ├── CategoryStep.tsx
│   │   │   ├── ProcedureStep.tsx
│   │   │   ├── DestinationStep.tsx
│   │   │   ├── ContactInfoStep.tsx
│   │   │   └── HospitalCards.tsx
│   │   └── ChatView.tsx        — messaging UI (Step 6+)
│   │       ├── MessageList.tsx
│   │       └── MessageInput.tsx
│
├── pages/dashboard/
│   ├── DashboardLayout.tsx     — top bar + content area + Outlet
│   ├── DashboardHome.tsx       — cases list + action items
│   ├── CaseDetail.tsx          — tabbed layout (Messages/Quote/Overview)
│   ├── IntakePage.tsx          — multi-step medical intake form
│   └── AccountPage.tsx         — account settings
│
├── contexts/
│   └── PatientAuthContext.tsx   — token, patient, login(), logout()
│
├── services/
│   └── crmApiClient.ts         — fetch wrapper with CRM v2 base URL + auth header
│
└── hooks/
    ├── usePatientCases.ts       — React Query: GET /patient/cases
    ├── useCaseDetail.ts         — React Query: GET /patient/cases/:id
    ├── useMessages.ts           — React Query: GET /patient/cases/:id/messages (5s polling)
    └── useQuote.ts              — React Query: GET /patient/cases/:id/quote
```

## Data Synchronization

- **ChatWidget ↔ Dashboard**: Share the same React Query cache keys for messages. Data automatically in sync.
- **Message polling**: 5s interval when chat window or Messages tab is open; stopped when closed.
- **Unread badge**: ChatBubble polls `GET /patient/cases` every 30s for total unread count.

## Styling

- Reuse existing Tailwind theme: gold-600 (`#a6794b`), navy-900 (`#0f201b`), sage palette
- Fonts: Cormorant Garamond (headings) + Lato (body) — consistent with marketing site
- Dashboard uses same luxury/medical aesthetic as rest of site
- Responsive: Dashboard works on mobile; ChatWidget adapts to small screens

## Out of Scope (Post-MVP)

- Multi-hospital quote comparison (side-by-side)
- Timeline / milestone tracking with visual progress
- Document upload (medical records, photos)
- Online consultation booking (video calls)
- Order / payment management
- WebSocket real-time messaging (start with polling)
- Push notifications
