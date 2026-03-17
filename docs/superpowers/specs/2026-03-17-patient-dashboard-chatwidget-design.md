# Patient Dashboard & Chat Widget Design Spec

**Date**: 2026-03-17
**Project**: Medora Beauty (medora-health-beauty root project)
**Backend**: medical-crm-v2 Hono API

## Overview

Add a Patient Dashboard and a conversational Chat Widget to the Medora Beauty marketing website. The Chat Widget guides visitors through a step-by-step onboarding flow, creates a Case early (Case-first), and lets users select multiple hospitals. After onboarding, users enter a larger multi-hospital messaging panel (modal/side panel) instead of chatting inside the small bubble window. The Dashboard gives patients a logged-in area to manage their cases, view quotes, and complete medical intake forms.

## Architecture Decision

**Approach: Embedded (方案 A)** — Build directly inside the existing Vite + React 19 project. Shares Tailwind theme, i18n, React Query infrastructure. Fastest to implement for MVP scope.

## User Flow

```
Visitor lands on site
  → Clicks floating chat bubble (bottom-right)
  → Step 1: Select category (Face / Body / Non-Surgical)
  → Step 2: Select procedure (dynamic list from CRM v2 API)
  → Step 3: Select destination (country/city)
  → Step 4: Enter name, email, phone, language → "Find My Hospitals"
  → [Backend: create temp patient + create Case + set session cookie]
  → Step 5: View recommendation cards (matched + explore more) → select multiple hospitals
  → [Backend: attach selected hospitals to case + create conversations]
  → Step 6: Open Patient Message Panel (large modal/side panel) with multi-hospital chat
  → Email sent with:
    - Magic link / set-password link (optional)
    - Link to complete medical intake form
```

**Note**: Categories match existing DB schema: `face`, `body`, `non-surgical` (3 categories). Breast procedures are under `body`.

## Authentication

### "Try First, Register Later" Model

1. **Temp session + Case-first init**: When visitor submits name + email + phone + language (Step 4), backend creates a temporary patient, creates a Case immediately, and sets a session token (JWT, 24h) via an `httpOnly` cookie through the BFF proxy endpoint.
2. **Zero-friction entry**: After selecting hospitals (Step 5), frontend opens the Patient Message Panel using this cookie-based session immediately — no email verification required.
3. **Email with magic link**: Sent after hospital selection. Contains link to:
   - Set password (optional) to create a full account
   - Complete medical intake form
4. **Return visits**: Email + password login if password was set; otherwise request a new magic link (enter email → receive link).

### Auth Middleware

Authenticated patient endpoints use a dedicated `patientAuthMiddleware` (not Keycloak), which validates the session token from `httpOnly` cookie. Public onboarding init endpoints are excluded from this middleware.

### BFF Proxy & CORS

The Medora Beauty frontend proxies all CRM v2 API calls through a local BFF layer:
- **Development**: Vite `proxy` config forwards `/api/patient/*` to CRM v2 server
- **Production**: Vercel serverless function at `/api/patient/[...path].ts` proxies to CRM v2, sets `httpOnly` cookies on the marketing site domain
- This avoids CORS issues and keeps session tokens out of JavaScript-accessible storage

### Abuse Protection

- `POST /api/patient/onboarding/init` is rate-limited: max 5 requests per IP per hour
- `POST /api/patient/magic-link` is rate-limited: max 3 requests per email per hour
- Cloudflare Turnstile CAPTCHA on the contact info step (Step 4) to prevent bot submissions

## Chat Widget (Floating)

### UI Specifications

- **Position**: Fixed bottom-right corner, all pages
- **Bubble**: ~56px circle with icon + unread badge
- **Window**: ~380×520px, expandable/collapsible
- **Replaces**: Existing `ChatWidget.tsx` (Gemini AI chat). The bubble now handles onboarding only. Existing `ConsultationModal` is replaced by `PatientMessagePanel` (large modal/side panel for multi-hospital chat). `ConsultationContext` is deprecated. Existing `/get-quote` page retained as fallback.

### Dual Mode

| State | Behavior |
|-------|----------|
| **Not authenticated** | Bubble shows onboarding flow (Steps 1-5) |
| **Authenticated** | Bubble shows compact entry point (unread + "Open Messages"), opens `PatientMessagePanel` |

### Onboarding Steps

| Step | UI Element | Data Source |
|------|-----------|-------------|
| 1. Category | Card grid: Face, Body, Non-Surgical | Static |
| 2. Procedure | Scrollable list filtered by category | `GET /api/patient/procedures?category=X` |
| 3. Destination | Country/city selector | `GET /api/patient/destinations` |
| 4. Contact Info | Form: name, email, phone, preferred language + CAPTCHA | `POST /api/patient/onboarding/init` |
| 5. Hospital Recommendations | Recommendation cards (matched + explore more), multi-select | `POST /api/patient/match-hospitals` + `POST /api/patient/select-hospitals` |
| 6. Messages | Open large `PatientMessagePanel` (modal/side panel), multi-hospital conversation list + active chat | `GET /api/patient/conversations` + messaging APIs |

### Message Panel Mode (`PatientMessagePanel`)

- Large modal/side panel optimized for multi-hospital messaging (not constrained to bubble size)
- Left pane: conversation list (hospital name, latest message, unread badge, quote alert)
- Right pane: active conversation (message list with timestamps/read indicators + message input)
- **Real-time via WebSocket**: connects to `ws://.../ws/conversations/:id` for live message push
- Fallback: if WebSocket disconnects, auto-fallback to 5s polling until reconnection
- Bubble unread badge: pushed via `ws://.../ws/patient/notifications` (authenticated only)

### Technical Implementation

- State machine via `useReducer` to manage onboarding steps in bubble
- Components:
  - `ChatWidget.tsx` (always rendered in `App.tsx`, onboarding + open-panel trigger)
  - `PatientMessagePanel.tsx` (large modal/side panel for multi-hospital messaging)
- Shared React Query cache with Dashboard for message/conversation data
- Chat UI: custom Tailwind components (ConversationList, MessageList, MessageInput) — no external chat UI library

## Error States & Edge Cases

| Scenario | Behavior |
|----------|----------|
| `match-hospitals` returns 0 results | Show "No matching hospitals found. Contact us directly at [email]" with a contact link |
| Network error during any onboarding step | Show inline error with "Retry" button; preserve user's previous answers |
| Session token expires mid-chat | Show "Session expired" banner with "Sign in again" link (triggers magic link flow) |
| Patient already exists (same email) | `POST /onboarding/init` reuses existing patient, creates/continues active case, and returns session |
| User clicks continue without selecting hospitals | Disable CTA and show "Please select at least one hospital" |
| Quote expired | Quote tab shows "This quote has expired" with option to message hospital for a new one |

## Dashboard Layout

`/dashboard/*` routes render **outside** the marketing site's `<Header />` and `<Footer />`. In `App.tsx`, dashboard routes use a separate route group with `DashboardLayout` (own top bar + navigation), not the marketing shell.

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
| **Quote** | Quote details: line items, total price, validity period. Accept / Reject buttons (with confirmation modal; actions are final and cannot be undone). |
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

All patient endpoints are prefixed with `/api/patient/`. Public onboarding init endpoints do not require auth; all others are protected by `patientAuthMiddleware`.

### Public Onboarding (No Auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/patient/onboarding/init` | Create/reuse temp patient, create Case (Case-first), set session cookie |
| GET | `/api/patient/procedures` | List procedures by category |
| GET | `/api/patient/destinations` | List available destinations |
| POST | `/api/patient/match-hospitals` | Match hospitals by procedure + destination |

### Authentication (Post-Session)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/patient/magic-link` | Send magic link email to given address |
| POST | `/api/patient/verify-token` | Verify magic link token, return session token |
| POST | `/api/patient/set-password` | Set password for account (optional) |

### Onboarding Finalization & Messaging (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/patient/select-hospitals` | Attach selected hospitals to existing Case, create conversations, trigger welcome email |
| GET | `/api/patient/conversations` | List patient conversations (multi-hospital) |

### Dashboard Data

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patient/cases` | Patient's case list with status, hospital info, unread count |
| GET | `/api/patient/cases/:id` | Case detail |
| GET | `/api/patient/cases/:id/messages` | Message list for case (paginated: `?cursor=X&limit=50`, polling fetches `?after=lastMessageId`) |
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
│   │   └── OnboardingSummary.tsx — completion state + open messages CTA
│
│   ├── PatientMessagePanel.tsx — large modal/side panel for multi-hospital chat
│   │   ├── ConversationList.tsx
│   │   ├── ChatView.tsx
│   │   │   ├── MessageList.tsx
│   │   │   └── MessageInput.tsx
│   │   └── PanelHeader.tsx
│
├── pages/dashboard/
│   ├── DashboardLayout.tsx     — top bar + content area + Outlet
│   ├── DashboardHome.tsx       — cases list + action items
│   ├── CaseDetail.tsx          — tabbed layout (Messages/Quote/Overview)
│   ├── IntakePage.tsx          — multi-step medical intake form
│   └── AccountPage.tsx         — account settings
│
├── contexts/
│   └── PatientAuthContext.tsx   — auth state + patient profile + login()/logout() (cookie session; no JS token storage)
│
├── services/
│   ├── crmApiClient.ts         — fetch wrapper through BFF, cookie-based auth
│   └── wsClient.ts             — WebSocket connection manager (connect, reconnect, subscribe)
│
└── hooks/
    ├── usePatientCases.ts       — React Query: GET /patient/cases
    ├── usePatientConversations.ts — React Query: GET /patient/conversations
    ├── useCaseDetail.ts         — React Query: GET /patient/cases/:id
    ├── useMessages.ts           — React Query + WebSocket: live messages with polling fallback
    ├── useQuote.ts              — React Query: GET /patient/cases/:id/quote
    └── useWebSocket.ts          — WebSocket lifecycle hook (connect/disconnect/reconnect)
```

## Real-time Messaging (WebSocket)

### Backend (`@hono/node-ws`)

Add WebSocket support to the CRM v2 Hono API server:

| Endpoint | Purpose |
|----------|---------|
| `ws://.../ws/conversations/:id` | Per-conversation channel. Receives new messages, typing indicators, read receipts. |
| `ws://.../ws/patient/notifications` | Per-patient channel. Receives unread count updates, new quote alerts, system notifications. |

**Message flow**:
1. Patient sends message → `POST /api/patient/cases/:id/messages` → DB insert
2. Server broadcasts the new message to all WebSocket clients connected to that conversation
3. Server pushes unread count update to the patient's notification channel

**Authentication**: WebSocket upgrade request carries the session cookie (same `httpOnly` cookie as REST). `patientAuthMiddleware` validates before upgrade.

**Reconnection**: If WebSocket disconnects, frontend auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s). During disconnect, falls back to REST polling (5s) until WebSocket is re-established.

### Frontend (`wsClient.ts`)

Lightweight WebSocket manager (~150 lines):
- `connect(url)` — establish connection with auth cookie
- `subscribe(event, callback)` — listen for message types
- `disconnect()` — clean close
- Auto-reconnect with exponential backoff
- `useWebSocket` hook manages lifecycle (connect on mount, disconnect on unmount)

### Data Synchronization

- **ChatWidget ↔ Dashboard**: Share the same React Query cache keys for messages. WebSocket events invalidate/update the cache, keeping both in sync automatically.
- **New message received via WS**: Appended to React Query cache → UI updates instantly.
- **Unread badge**: Updated via `ws://.../ws/patient/notifications` push — no polling needed when WebSocket is connected.

## Styling & i18n

- Reuse existing Tailwind theme: gold-600 (`#a6794b`), navy-900 (`#0f201b`), sage palette
- Fonts: Cormorant Garamond (headings) + Lato (body) — consistent with marketing site
- Dashboard uses same luxury/medical aesthetic as rest of site
- Responsive: Dashboard works on mobile; ChatWidget adapts to small screens

### Internationalization

- Chat Widget and Dashboard UI strings added to existing `translations.ts` (all 9 languages)
- CRM v2 patient API accepts `Accept-Language` header; returns localized content where available (procedure names, hospital descriptions)
- Onboarding flow respects `LanguageContext` — category/procedure names shown in user's selected language

## Out of Scope (Post-MVP)

- Multi-hospital quote comparison (side-by-side)
- Timeline / milestone tracking with visual progress
- Document upload (medical records, photos)
- Online consultation booking (video calls)
- Order / payment management
- Browser push notifications (Web Push API)
- Typing indicators and presence (online/offline status)
