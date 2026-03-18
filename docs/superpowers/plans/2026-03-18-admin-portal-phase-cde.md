# Admin Portal Phase C+D+E Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 standalone pages to the Admin Portal — Messages center, Orders, Packages, Support Tickets, Question Collectors, Chatbot FAQ, and Settings.

**Architecture:** Same BFF pattern as Phase A+B: Next.js 15 Route Handlers proxy GET to backend API, Server Actions handle mutations via `apiFetch`. New backend APIs needed for Chatbot FAQ (full CRUD + analytics) and Settings (profile + password). All pages under `apps/admin/src/app/(portal)/`.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, TanStack React Query v5, Lucide React, @medical-crm/ui, @medical-crm/validation

**Spec:** `docs/superpowers/specs/2026-03-17-admin-portal-phase-cde-design.md`

**Assumptions:**
- Backend enum migration (packageType, orderType, ticketStatus) will be done separately by Codex. This plan uses the **new patientsflow-aligned enums** from the spec.
- Phase A+B code is already in place (admin shell, BFF helpers, React Query setup, auth).
- `013_align_admin_portal_enums.sql` is already reserved for enum alignment. Any new migration in this plan must use the **next available number** (currently `014_*`).

---

## Chunk 1: Backend API Prerequisites + Sidebar

### Task 1: Chatbot FAQ full-stack (schema + entity + repo + use cases + routes + migration)

Build the complete Chatbot FAQ backend from scratch, following existing patterns (e.g., how Support Tickets were built).

**Files:**
- Create: `packages/shared/validation/src/chatbot-faq.schema.ts`
- Create: `packages/domain/src/entities/chatbot-faq-item.entity.ts`
- Create: `packages/domain/src/ports/chatbot-faq-repository.port.ts`
- Modify: `packages/domain/src/index.ts` (export new entity + port)
- Create: `packages/application/src/dtos/chatbot-faq.dto.ts`
- Create: `packages/application/src/mappers/chatbot-faq.mapper.ts`
- Create: `packages/application/src/use-cases/chatbot-faq/create-faq-item.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot-faq/list-faq-items.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot-faq/get-faq-item.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot-faq/update-faq-item.use-case.ts`
- Create: `packages/application/src/use-cases/chatbot-faq/delete-faq-item.use-case.ts`
- Modify: `packages/application/src/index.ts` (export use cases + DTO)
- Create: `packages/infrastructure/database/migrations/014_chatbot_faq_items.sql` (or next available number)
- Modify: `packages/infrastructure/database/schema/schema.ts` (add chatbot_faq_items table)
- Create: `packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts`
- Modify: `packages/infrastructure/database/repositories/index.ts` (export)
- Create: `apps/api/src/routes/chatbot-faq.routes.ts`
- Modify: `apps/api/src/routes/index.ts` (mount route)
- Modify: `apps/api/src/composition-root.ts` (wire use cases into AppServices + getServices())

- [ ] **Step 1: Create validation schema**

```typescript
// packages/shared/validation/src/chatbot-faq.schema.ts
import { z } from 'zod';

export const createChatbotFaqSchema = z.object({
  category: z.string().min(1).max(100),
  questionEn: z.string().min(1).max(1000),
  questionZh: z.string().min(1).max(1000),
  answerEn: z.string().min(1),
  answerZh: z.string().min(1),
  keywords: z.array(z.string().min(1)).default([]),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateChatbotFaqSchema = createChatbotFaqSchema.partial();

export const chatbotFaqListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type CreateChatbotFaqInput = z.infer<typeof createChatbotFaqSchema>;
export type UpdateChatbotFaqInput = z.infer<typeof updateChatbotFaqSchema>;
export type ChatbotFaqListQuery = z.infer<typeof chatbotFaqListQuerySchema>;
```

Export from `packages/shared/validation/src/index.ts`.

- [ ] **Step 2: Create SQL migration**

Check latest migration number first (`ls packages/infrastructure/database/migrations/ | tail -1`), then create the next one:

```sql
-- packages/infrastructure/database/migrations/014_chatbot_faq_items.sql
CREATE TABLE chatbot_faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL,
  question_en TEXT NOT NULL,
  question_zh TEXT NOT NULL,
  answer_en TEXT NOT NULL,
  answer_zh TEXT NOT NULL,
  keywords JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL
);

CREATE INDEX chatbot_faq_items_category_idx ON chatbot_faq_items(category);
CREATE INDEX chatbot_faq_items_is_active_idx ON chatbot_faq_items(is_active);
```

> **Note:** `013_align_admin_portal_enums.sql` already exists. Use `014_chatbot_faq_items.sql` unless another migration has been added after 013.

- [ ] **Step 3: Add table to Drizzle schema**

In `packages/infrastructure/database/schema/schema.ts`, add the `chatbotFaqItems` table definition matching the SQL above.

- [ ] **Step 4: Create domain entity**

```typescript
// packages/domain/src/entities/chatbot-faq-item.entity.ts
export interface ChatbotFaqItemProps {
  id: string;
  category: string;
  questionEn: string;
  questionZh: string;
  answerEn: string;
  answerZh: string;
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ChatbotFaqItem {
  // ... standard entity pattern (readonly id, mutable fields, constructor)
}
```

- [ ] **Step 5: Create repository port**

```typescript
// packages/domain/src/ports/chatbot-faq-repository.port.ts
export interface ChatbotFaqListQuery {
  category?: string;
  isActive?: boolean;
  search?: string;
  page: number;
  limit: number;
}

export interface IChatbotFaqRepository {
  findById(id: string): Promise<ChatbotFaqItem | null>;
  findAll(query: ChatbotFaqListQuery): Promise<{ data: ChatbotFaqItem[]; total: number }>;
  save(entity: ChatbotFaqItem): Promise<ChatbotFaqItem>;
  delete(id: string): Promise<void>;
}
```

Export entity + port from `packages/domain/src/index.ts`.

- [ ] **Step 6: Create DTO + mapper**

Follow existing patterns (e.g., `hospital.dto.ts` + `hospital.mapper.ts`).

- [ ] **Step 7: Create 5 use cases**

All follow the standard Clean Architecture pattern:
- `CreateFaqItemUseCase` — ADMIN only, generates ID, saves, returns DTO
- `ListFaqItemsUseCase` — ADMIN only, delegates to repo.findAll
- `GetFaqItemUseCase` — ADMIN only, finds by ID or throws NotFoundError
- `UpdateFaqItemUseCase` — ADMIN only, finds by ID, updates fields, saves
- `DeleteFaqItemUseCase` — ADMIN only, finds by ID, deletes

Export all from `packages/application/src/index.ts`.

- [ ] **Step 8: Create Drizzle repository**

`packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts` — follow `drizzle-support-ticket.repository.ts` pattern:
- `findById`: SELECT WHERE id
- `findAll`: with pagination, optional category/isActive/search filters (search uses `ilike` on questionEn/questionZh)
- `save`: INSERT ON CONFLICT DO UPDATE
- `delete`: DELETE WHERE id

Export from `packages/infrastructure/database/repositories/index.ts`.

- [ ] **Step 9: Create API routes**

`apps/api/src/routes/chatbot-faq.routes.ts` — 6 endpoints following the OpenAPIHono pattern used in other route files:

```
POST   /api/v2/chatbot/faqs          — createChatbotFaq (ADMIN)
GET    /api/v2/chatbot/faqs          — listChatbotFaqs (ADMIN)
GET    /api/v2/chatbot/faqs/{id}     — getChatbotFaq (ADMIN)
PATCH  /api/v2/chatbot/faqs/{id}     — updateChatbotFaq (ADMIN)
DELETE /api/v2/chatbot/faqs/{id}     — deleteChatbotFaq (ADMIN)
GET    /api/v2/chatbot/analytics     — stub returning empty stats (ADMIN)
```

Mount in `apps/api/src/routes/index.ts`.

- [ ] **Step 10: Wire into composition-root.ts**

Add all 5 use cases to `AppServices` interface and `getServices()` factory. Import repository from `@medical-crm/infrastructure/repositories`.

- [ ] **Step 11: Typecheck + test**

```bash
pnpm turbo typecheck
pnpm turbo test --filter=@medical-crm/application --filter=@medical-crm/infrastructure
```

- [ ] **Step 12: Commit**

```bash
git commit -m "feat(chatbot-faq): add full-stack Chatbot FAQ CRUD (schema, entity, repo, use cases, routes, migration)"
```

---

### Task 2: Settings API (profile + password endpoints)

**Files:**
- Create: `packages/shared/validation/src/user-settings.schema.ts`
- Create: `packages/application/src/use-cases/users/get-profile.use-case.ts`
- Create: `packages/application/src/use-cases/users/update-profile.use-case.ts`
- Create: `packages/application/src/use-cases/users/change-password.use-case.ts`
- Modify: `packages/application/src/index.ts`
- Create: `apps/api/src/routes/user-settings.routes.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/composition-root.ts`

- [ ] **Step 1: Create validation schema**

```typescript
// packages/shared/validation/src/user-settings.schema.ts
import { z } from 'zod';

export const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  preferredLanguage: z.enum(['en', 'zh']).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

Export from validation index.

- [ ] **Step 2: Confirm `preferred_language` column exists (NO migration needed)**

The `users` table already has `preferredLanguage: varchar("preferred_language", { length: 10 }).default('zh').notNull()` in `schema.ts` line 83. **Do NOT create a migration for this column — it already exists.**

- [ ] **Step 3: Create use cases**

- `GetProfileUseCase` — reads user from IUserRepository by actor.userId, returns user DTO
- `UpdateProfileUseCase` — updates email/preferredLanguage in CRM DB. If email changed, also update in Keycloak via `IKeycloakAdminService.updateUser()`
- `ChangePasswordUseCase` — uses Keycloak Admin API to set new password. Verify old password by attempting a token grant with the old credentials first.

> **Note:** For `ChangePasswordUseCase`, read how `KeycloakAdminService` works in `packages/infrastructure/services/keycloak-admin.service.ts`. It likely has `setPassword(keycloakUserId, newPassword)`. For verifying the old password, you may need to attempt a direct grant (`grant_type=password`) against Keycloak's token endpoint.

- [ ] **Step 4: Create API routes**

`apps/api/src/routes/user-settings.routes.ts`:
```
GET    /api/v2/users/me                  — getProfile (authenticated)
PATCH  /api/v2/users/me                  — updateProfile (authenticated)
POST   /api/v2/users/me/change-password  — changePassword (authenticated)
```

These routes use `toActor(c.get('session'))` but don't require ADMIN — any authenticated user can manage their own profile.

- [ ] **Step 5: Wire into composition-root + mount routes**

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm turbo typecheck
git commit -m "feat(settings): add user profile and change-password API endpoints"
```

---

### Task 3: Update AdminShell sidebar

**Files:**
- Modify or Create: `apps/admin/src/components/admin-shell.tsx`

- [ ] **Step 0: Verify AdminShell file path before editing**

Run a quick symbol/path check first. If `apps/admin/src/components/admin-shell.tsx` does not exist in your branch, create it from the current Phase A+B shell baseline (the file imported by `apps/admin/src/app/(portal)/layout.tsx` as `@/components/admin-shell`) before adding nav items below.

- [ ] **Step 1: Add 7 new nav items**

```typescript
import { MessageSquare, ShoppingCart, Package, Ticket, ClipboardList, HelpCircle, Settings as SettingsIcon } from 'lucide-react';

// Add after existing Dashboard/Cases/Hospitals:
{ key: 'messages', icon: <MessageSquare className="h-5 w-5" />, label: 'Messages', href: '/messages' },
{ key: 'orders', icon: <ShoppingCart className="h-5 w-5" />, label: 'Orders', href: '/orders' },
{ key: 'packages', icon: <Package className="h-5 w-5" />, label: 'Packages', href: '/packages' },
{ key: 'support', icon: <Ticket className="h-5 w-5" />, label: 'Support', href: '/support' },
{ key: 'question-collectors', icon: <ClipboardList className="h-5 w-5" />, label: 'Q&A Templates', href: '/question-collectors' },
{ key: 'chatbot', icon: <HelpCircle className="h-5 w-5" />, label: 'Chatbot & FAQ', href: '/chatbot' },
{ key: 'settings', icon: <SettingsIcon className="h-5 w-5" />, label: 'Settings', href: '/settings' },
```

- [ ] **Step 2: Update `getActiveKey()`**

```typescript
function getActiveKey(pathname: string): string {
  if (pathname.startsWith('/cases')) return 'cases';
  if (pathname.startsWith('/hospitals')) return 'hospitals';
  if (pathname.startsWith('/messages')) return 'messages';
  if (pathname.startsWith('/orders')) return 'orders';
  if (pathname.startsWith('/packages')) return 'packages';
  if (pathname.startsWith('/support')) return 'support';
  if (pathname.startsWith('/question-collectors')) return 'question-collectors';
  if (pathname.startsWith('/chatbot')) return 'chatbot';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'dashboard';
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
git commit -m "feat(admin): add Messages, Orders, Packages, Support, QC, Chatbot, Settings to sidebar"
```

---

## Chunk 2: Phase C + D Pages (Messages, Orders, Packages, Support)

### Task 4: Messages standalone page (`/messages`)

**Files:**
- Create: `apps/admin/src/app/(portal)/messages/page.tsx`
- Create: `apps/admin/src/components/messages-center.tsx`
- Create: `apps/admin/src/queries/use-conversations.ts`
- Create: `apps/admin/src/actions/message-actions.ts`

- [ ] **Step 0: Extract shared conversations hooks/actions from Case Messages tab**

Move data-fetching and mutation logic currently used by `case-messages-tab.tsx` into reusable modules first:
- `queries/use-conversations.ts`: `useConversations`, `useMessages`
- `actions/message-actions.ts`: `sendMessage`, `approveMessage`, `rejectMessage`

Then update `case-messages-tab.tsx` to consume these shared modules so the new standalone page reuses the same source of truth.

- [ ] **Step 1: Create messages-center.tsx**

Client component — full-screen messaging interface (NOT a tab inside case detail):
- **Left panel** (320px): All conversations, no caseId filter. Search + category filter dropdown (ADMIN_HOSPITAL / ADMIN_PATIENT / HOSPITAL_PATIENT). Each conversation shows: participant name, last message preview, unread count, category badge.
- **Right panel**: ChatLayout from `@medical-crm/ui`. Message input + send. Admin moderation (approve/reject for REVIEW status).
- **Info sidebar** (280px, optional): When a conversation is selected, show linked case info with link to `/cases/[id]`.

Reuse existing hooks: `useConversations`, `useMessages` from `queries/use-conversations.ts`. Reuse `sendMessage`, `approveMessage`, `rejectMessage` from `actions/message-actions.ts`.

Key difference from `case-messages-tab.tsx`: no `caseId` filter, category filter dropdown, case info sidebar.

- [ ] **Step 2: Create page.tsx**

```typescript
import { PageHeader } from '@medical-crm/ui';
import { MessagesCenter } from '@/components/messages-center';

export default function MessagesPage() {
  return (
    <>
      <PageHeader title="Messages" />
      <MessagesCenter />
    </>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm turbo typecheck --filter=@medical-crm/admin
git commit -m "feat(admin): add Messages standalone page with global conversation list"
```

---

### Task 5: Orders standalone page (`/orders`)

**Files:**
- Create: `apps/admin/src/app/api/orders/[id]/route.ts` (BFF route, was missing from Phase A+B)
- Create: `apps/admin/src/app/(portal)/orders/page.tsx`
- Create: `apps/admin/src/components/orders-list.tsx`
- Create: `apps/admin/src/queries/use-orders.ts`

- [ ] **Step 1: Add missing BFF route for order detail**

```typescript
// apps/admin/src/app/api/orders/[id]/route.ts
import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }, p) => `/api/v2/orders/${id}?${p}`);
```

- [ ] **Step 2: Create orders-list.tsx**

Client component:
- Filter bar: SearchInput (order number) + status dropdown (PENDING_PAYMENT/PAID/IN_PROGRESS/COMPLETED/CANCELLED/REFUNDED) + type dropdown (use patientsflow-aligned types from spec: CONSULTATION/HEALTH_CHECKUP/SECOND_OPINION/VISA_PACKAGE/INSURANCE/ACCOMMODATION/TREATMENT_DEPOSIT/TRANSLATION)
- DataTable: orderNumber, amount+currency, status Badge (6 colors from spec), type Badge, createdAt
- Row click → expand detail (payment info, refund info, linked case)
- No refund button (Patient only)

Reuse `useOrders` from `queries/use-orders.ts`.

- [ ] **Step 3: Create page.tsx + typecheck + commit**

```bash
git commit -m "feat(admin): add Orders standalone page with filters and detail expansion"
```

---

### Task 6: Packages management page (`/packages`)

**Files:**
- Create: `apps/admin/src/app/api/packages/route.ts`
- Verify: `apps/admin/src/app/api/packages/[id]/route.ts` (already exists from Phase A+B — do NOT recreate)
- Create: `apps/admin/src/queries/use-packages.ts`
- Create: `apps/admin/src/actions/package-actions.ts`
- Create: `apps/admin/src/app/(portal)/packages/page.tsx`
- Create: `apps/admin/src/components/packages-list.tsx`
- Create: `apps/admin/src/components/package-form-modal.tsx`

- [ ] **Step 1: Add BFF routes**

```typescript
// packages/route.ts (NEW)
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler((p) => `/api/v2/packages?${p}`);
```

> **Note:** `packages/[id]/route.ts` already exists from Phase A+B — do NOT recreate it.

- [ ] **Step 2: Create query hooks**

```typescript
// apps/admin/src/queries/use-packages.ts
export function usePackages(filters: Record<string, string>) { /* GET /api/packages?... */ }
export function usePackage(id: string) { /* GET /api/packages/${id} */ }
```

- [ ] **Step 3: Create server actions**

```typescript
// apps/admin/src/actions/package-actions.ts
'use server';
export async function createPackage(data: Record<string, unknown>) { /* POST /api/v2/packages */ }
export async function updatePackage(id: string, data: Record<string, unknown>) { /* PUT /api/v2/packages/${id} */ }
export async function publishPackage(id: string) { /* POST /api/v2/packages/${id}/publish */ }
export async function unpublishPackage(id: string) { /* POST /api/v2/packages/${id}/unpublish */ }
```

- [ ] **Step 4: Create package-form-modal.tsx**

Modal for create/edit with fields from spec §4.3:
- nameEn (required), nameZh, type (select, 8 patientsflow types), price (text, decimal string), currency (select USD/CNY/THB), descriptionEn, descriptionZh, inclusions (tag input), coverImageUrl, sortWeight, publishAt, takedownAt, config (JSON textarea)

> **Note:** `price` is a **string** in the backend schema (`z.string().regex()`), not a number. The form must submit it as string.

- [ ] **Step 5: Create packages-list.tsx**

Client component:
- Filter bar: SearchInput + type dropdown + status dropdown (DRAFT/PUBLISHED) + "New Package" button
- DataTable: nameEn, type Badge, price+currency, status Badge (DRAFT gray, PUBLISHED green), createdAt
- Row actions: Edit (opens modal), Publish/Unpublish toggle

- [ ] **Step 6: Create page.tsx + typecheck + commit**

```bash
git commit -m "feat(admin): add Packages management page with CRUD and publish/unpublish"
```

---

### Task 7: Support Tickets standalone page (`/support`)

**Files:**
- Create: `apps/admin/src/app/(portal)/support/page.tsx`
- Create: `apps/admin/src/components/support-list.tsx`
- Create: `apps/admin/src/queries/use-tickets.ts`

- [ ] **Step 1: Create support-list.tsx**

Client component — global ticket list (no caseId filter):
- Filter bar: SearchInput + status dropdown (OPEN/ASSIGNED/IN_PROGRESS/PENDING_INFO/RESOLVED/CLOSED — use patientsflow-aligned statuses) + type dropdown (7 types) + priority dropdown (HIGH/MEDIUM/LOW)
- DataTable: ticketNumber, subject, type Badge, priority Badge (HIGH red, MEDIUM amber, LOW slate), status Badge, createdAt, assignedTo
- Row click → expand detail panel with reply history, reply input, status management

Reuse `useTickets` from `queries/use-tickets.ts` and actions from `actions/ticket-actions.ts`.

- [ ] **Step 2: Create page.tsx + typecheck + commit**

```bash
git commit -m "feat(admin): add Support Tickets standalone page with filters and detail panel"
```

---

## Chunk 3: Phase E Pages (Question Collectors, Chatbot FAQ, Settings)

### Task 8: Question Collectors page (`/question-collectors`)

**Files:**
- Create: `apps/admin/src/app/api/question-templates/route.ts`
- Create: `apps/admin/src/app/api/question-templates/[id]/route.ts`
- Create: `apps/admin/src/app/api/question-templates/[id]/customizations/route.ts`
- Create: `apps/admin/src/app/api/questionnaire-responses/route.ts`
- Create: `apps/admin/src/queries/use-question-collectors.ts`
- Create: `apps/admin/src/actions/qc-actions.ts`
- Create: `apps/admin/src/app/(portal)/question-collectors/page.tsx`
- Create: `apps/admin/src/components/qc-templates-list.tsx`
- Create: `apps/admin/src/components/qc-template-form.tsx`

- [ ] **Step 1: Add BFF routes**

```typescript
// question-templates/route.ts → GET /api/v2/question-templates
// question-templates/[id]/route.ts → GET /api/v2/question-templates/${id}
// question-templates/[id]/customizations/route.ts → GET /api/v2/question-templates/${id}/customizations
// questionnaire-responses/route.ts → GET /api/v2/questionnaire-responses
```

- [ ] **Step 2: Create query hooks**

```typescript
// apps/admin/src/queries/use-question-collectors.ts
export function useQuestionTemplates(filters) { /* ... */ }
export function useQuestionTemplate(id) { /* ... */ }
export function useQuestionnaireResponses(filters) { /* ... */ }
export function useTemplateCustomizations(templateId) { /* ... */ }
```

- [ ] **Step 3: Create server actions**

```typescript
// apps/admin/src/actions/qc-actions.ts
'use server';
export async function createTemplate(data) { /* POST /api/v2/question-templates */ }
export async function updateTemplate(id, data) { /* PUT /api/v2/question-templates/${id} */ }
export async function customizeQuestions(templateId, data) { /* POST /api/v2/question-templates/${templateId}/customizations */ }
```

- [ ] **Step 4: Create qc-template-form.tsx**

Form/modal for template create/edit:
- templateName (required), category (required), procedureTypes (tag input), version (number, required), questions (JSON editor or dynamic form builder), isActive (toggle)

Questions structure (bilingual with conditional logic, per spec §4.5):
```typescript
interface QuestionItem {
  questionId: string;
  questionType: string;
  questionTextZh: string;
  questionTextEn: string;
  required: boolean;
  options?: Array<{ value: string; labelZh: string; labelEn: string }>;
  conditionalLogic?: unknown;
}
```

For Phase E, use a JSON textarea for questions editing (no drag-and-drop builder). Validate structure on submit.

- [ ] **Step 5: Create qc-templates-list.tsx**

- Template list DataTable: templateName, category, version, isActive Badge, createdAt
- "New Template" button → opens form
- Row actions: Edit, View Responses

- [ ] **Step 6: Create page.tsx + typecheck + commit**

```bash
git commit -m "feat(admin): add Question Collectors management page with template CRUD"
```

---

### Task 9: Chatbot FAQ page (`/chatbot`)

**Files:**
- Create: `apps/admin/src/app/api/chatbot/faqs/route.ts`
- Create: `apps/admin/src/app/api/chatbot/faqs/[id]/route.ts`
- Create: `apps/admin/src/app/api/chatbot/analytics/route.ts`
- Create: `apps/admin/src/queries/use-chatbot-faq.ts`
- Create: `apps/admin/src/actions/chatbot-faq-actions.ts`
- Create: `apps/admin/src/app/(portal)/chatbot/page.tsx`
- Create: `apps/admin/src/components/chatbot-faq-list.tsx`
- Create: `apps/admin/src/components/chatbot-faq-form-modal.tsx`

- [ ] **Step 1: Add BFF routes**

```typescript
// chatbot/faqs/route.ts → GET /api/v2/chatbot/faqs
// chatbot/faqs/[id]/route.ts → GET /api/v2/chatbot/faqs/${id}
// chatbot/analytics/route.ts → GET /api/v2/chatbot/analytics
```

- [ ] **Step 2: Create query hooks**

```typescript
// apps/admin/src/queries/use-chatbot-faq.ts
export function useChatbotFaqs(filters) { /* ... */ }
export function useChatbotFaq(id) { /* ... */ }
export function useChatbotAnalytics() { /* ... */ }
```

- [ ] **Step 3: Create server actions**

```typescript
// apps/admin/src/actions/chatbot-faq-actions.ts
'use server';
export async function createFaq(data) { /* POST /api/v2/chatbot/faqs */ }
export async function updateFaq(id, data) { /* PATCH /api/v2/chatbot/faqs/${id} */ }
export async function deleteFaq(id) { /* DELETE /api/v2/chatbot/faqs/${id} */ }
```

- [ ] **Step 4: Create chatbot-faq-form-modal.tsx**

Modal for create/edit:
- questionEn (required), questionZh (required), answerEn (required), answerZh (required), category (required), keywords (tag input), sortOrder (number), isActive (toggle)

- [ ] **Step 5: Create chatbot-faq-list.tsx**

Client component:
- Filter bar: SearchInput + category dropdown + isActive filter + "New FAQ" button
- DataTable: question (EN truncated), question (ZH truncated), category Badge, keywords (truncated tags), isActive Badge, actions (Edit/Delete)
- Delete with ConfirmDialog

- [ ] **Step 6: Create page.tsx + typecheck + commit**

```bash
git commit -m "feat(admin): add Chatbot FAQ management page with CRUD"
```

---

### Task 10: Settings page (`/settings`)

**Files:**
- Create: `apps/admin/src/app/api/users/me/route.ts`
- Create: `apps/admin/src/queries/use-settings.ts`
- Create: `apps/admin/src/actions/settings-actions.ts`
- Create: `apps/admin/src/app/(portal)/settings/page.tsx`
- Create: `apps/admin/src/components/settings-page.tsx`

- [ ] **Step 1: Add BFF route**

```typescript
// apps/admin/src/app/api/users/me/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler(() => '/api/v2/users/me');
```

- [ ] **Step 2: Create query hook**

```typescript
// apps/admin/src/queries/use-settings.ts
export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: () => queryFetch('/api/users/me') });
}
```

- [ ] **Step 3: Create server actions**

```typescript
// apps/admin/src/actions/settings-actions.ts
'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function updateProfile(data: { email?: string; preferredLanguage?: string }) {
  const res = await apiFetch('/api/v2/users/me', { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed'); }
  revalidatePath('/settings');
  return res.json();
}

export async function changePassword(data: { currentPassword: string; newPassword: string }) {
  const res = await apiFetch('/api/v2/users/me/change-password', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed'); }
  return res.json();
}
```

- [ ] **Step 4: Create settings-page.tsx**

Client component with 3 Card sections:

**Email Card:**
- Shows current email (readonly)
- "Change Email" button → reveals input + save button
- Calls `updateProfile({ email: newEmail })`

**Password Card:**
- "Change Password" button → reveals form: current password + new password + confirm
- Client-side validation: passwords match, min 8 chars
- Calls `changePassword({ currentPassword, newPassword })`

**Language Card:**
- Dropdown select: English / 中文
- Save button → `updateProfile({ preferredLanguage })`

No DataTable — simple Card layout per spec §4.7.

- [ ] **Step 5: Create page.tsx + typecheck + commit**

```bash
git commit -m "feat(admin): add Settings page with email, password, and language preferences"
```

---

## Post-Implementation

- [ ] **Full typecheck**: `pnpm turbo typecheck`
- [ ] **Full test suite**: `pnpm turbo test`
- [ ] **Manual smoke test**: Start backend + admin portal, verify each of the 7 new pages + sidebar navigation
