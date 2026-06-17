# Admin Beauty Case Scope Design

Date: 2026-06-17

## Goal

Create a new admin account for `contact@medorabeauty.com` and introduce strict admin case isolation by email domain:

- Admins whose normalized email ends with `@medorabeauty.com` can see only cases whose patient has `users.patient_site = 'beauty'`.
- All other admins can no longer see beauty cases. They can see cases whose patient has `users.patient_site = 'china'` or `users.patient_site IS NULL`.
- Hospital and patient access rules remain unchanged.

The account must be usable at `https://admin.medicaltourismchina.health/` after provisioning.

## Definitions

Beauty case:

- A case joined through `cases.patient_id = users.id` where `users.patient_site = 'beauty'`.

Non-beauty case:

- A case where the joined patient has `users.patient_site = 'china'`.
- A case where the joined patient has `users.patient_site IS NULL`.

Beauty admin:

- An authenticated admin actor whose normalized email ends with `@medorabeauty.com`.

Regular admin:

- Any authenticated admin actor whose normalized email does not end with `@medorabeauty.com`.

## Current Context

The API already maps Keycloak sessions into application actors in `packages/application/src/types/actor.ts`.
The actor includes `email`, `role`, and `hospitalId`.

Cases do not currently store a site directly. Patient site is stored on the patient user record as `users.patient_site`, and `GetCaseUseCase` already maps that value into `CaseDTO.patientSite`.

The admin portal calls backend routes through BFF route handlers in `apps/admin/src/app/api/*`.
Filtering must be enforced in backend application and repository layers, not only in the frontend.

## Recommended Approach

Use email-domain-derived admin scope.

Keycloak continues to assign the normal `admin` role to `contact@medorabeauty.com`.
The CRM database stores the user as `users.role = 'ADMIN'`.
Application code derives case scope from the admin actor email:

```text
ADMIN + @medorabeauty.com email => { patientSite: 'beauty' }
ADMIN + other email             => { excludePatientSite: 'beauty' }
HOSPITAL / PATIENT              => existing access model
```

This keeps future onboarding simple: another `xxx@medorabeauty.com` admin automatically receives the same beauty-only case scope after it is created as an admin.

## Units

### Admin Case Scope Helper

Purpose:

- Normalize actor email.
- Derive the admin case access scope.
- Provide reusable assertions for case-level access.

Interface:

```ts
type AdminCaseScope =
  | { kind: 'BEAUTY_ONLY'; patientSite: 'beauty' }
  | { kind: 'NON_BEAUTY_ONLY'; excludedPatientSite: 'beauty' };

function getAdminCaseScope(actor: Actor): AdminCaseScope | null;
function assertAdminCanAccessPatientSite(actor: Actor, patientSite: 'beauty' | 'china' | null): void;
```

Behavior:

- Return `null` for non-admin actors so existing hospital and patient checks remain separate.
- Treat email matching as case-insensitive.
- Match only the exact domain suffix `@medorabeauty.com`.
- Treat `null` patient site as non-beauty.

### Case Repository Scope Support

Purpose:

- Enforce list and stats filtering in SQL where possible.

Interface changes:

- Extend `CaseListQuery` or repository options with an admin patient-site scope.
- Extend `CaseCountFilters` with the same scope.

Behavior:

- `BEAUTY_ONLY`: join `users` and filter `users.patient_site = 'beauty'`.
- `NON_BEAUTY_ONLY`: join `users` and filter `(users.patient_site <> 'beauty' OR users.patient_site IS NULL)`.
- Preserve existing hospital access filter behavior.
- Preserve search, assignment status, treatment stage, pagination, and ordering.

### Case-Derived Repository Scope Support

Purpose:

- Give conversations, tickets, orders, and dashboard counts correct scoped totals without unsafe post-filtered pagination.

Repository-level behavior:

- Conversation list queries that return admin-visible case-linked conversations must support the same admin patient-site scope by joining through `conversations.case_id -> cases.patient_id -> users.patient_site`.
- Quote list queries must support the same scope by joining through `quotes.case_id -> cases.patient_id -> users.patient_site`.
- Consultation list queries and consultation stats must support the same scope by joining through `consultations.case_id -> cases.patient_id -> users.patient_site`.
- Question collector response list queries must support the same scope by joining through `question_collector_responses.case_id -> cases.patient_id -> users.patient_site`.
- Support ticket list queries and dashboard ticket counts must support the same scope by joining through `support_tickets.case_id -> cases.patient_id -> users.patient_site` when `case_id` is present, and through `support_tickets.patient_id -> users.patient_site` when `case_id` is null.
- Order list queries and dashboard order counts must support the same scope by joining through `orders.case_id -> cases.patient_id -> users.patient_site` when `case_id` is present, and through `orders.patient_id -> users.patient_site` when `case_id` is null.
- If an existing repository cannot accept the scope cleanly, introduce a focused method or query option rather than returning unscoped data and filtering after pagination.

### Case Detail Access

Purpose:

- Prevent deep-link access across admin scopes.

Affected case-level use cases must load the case patient site before returning data or mutating data:

- `CreateCaseUseCase`
- `GetCaseUseCase`
- `UpdateCaseUseCase`
- `UpdateCaseStatusUseCase`
- `AdvanceCaseStageUseCase`
- `AssignCaseUseCase`
- `SaveCaseDiagnosisUseCase`
- `GetCaseProgressUseCase`
- `AddCaseProgressUseCase`
- `ListDocumentsUseCase`
- `UploadDocumentUseCase`
- `GetDocumentPreviewUseCase`
- `DeleteDocumentUseCase`
- route-level document notification in `apps/api/src/routes/documents.routes.ts`
- `ListCaseEventsUseCase`
- `GetCaseTimelineUseCase`
- `ListCaseConsultationsUseCase`
- `ListCaseHospitalContactsUseCase`
- `AddHospitalToCaseUseCase`
- `AdminResetAssignmentUseCase`
- `CompareQuotesUseCase`
- `ListQuotesUseCase` for case-scoped admin queries
- `GetCaseJourneyUseCase`
- `UpdateCaseJourneyUseCase`
- `ListMilestonesUseCase`
- `CreateMilestoneUseCase`
- `UpdateMilestoneUseCase`
- `DeleteMilestoneUseCase`
- `GetResponseUseCase`
- `SubmitResponseUseCase`
- `SaveResponseDraftUseCase`
- `GetTemplateUseCase` when called with a `caseId` by an admin

Implementation should avoid duplicating the domain check in every use case if possible. A small shared helper can resolve the case patient site through `IUserRepository.findById(case.patientId)` or a dedicated repository method if that is cleaner.

Case creation behavior:

- `CreateCaseUseCase` must resolve the requested `patientId` through the user repository before creating the case.
- Beauty admins can create cases only for patients with `patient_site = 'beauty'`.
- Regular admins can create cases only for patients with `patient_site = 'china'` or `patient_site IS NULL`.
- Cross-scope case creation fails with 403 and must not create a partially initialized case.

Error handling:

- Case not found remains `NotFoundError`.
- Cross-scope admin access throws `ForbiddenError`.
- Hospital access continues to use `assertHospitalCaseAccess`.

### Admin Dashboard Access

Purpose:

- Prevent dashboard totals and recent-case widgets from leaking cross-scope case information.

Affected use case:

- `AdminDashboardUseCase`

Behavior:

- `caseRepo.countByFilters()` must receive the derived admin patient-site scope.
- `caseRepo.findMany({ page: 1, limit: 5 })` for recent cases must receive the same scope.
- Open support-ticket counts and pending-order counts must be scoped by linked case patient site because ticket and order DTOs expose `caseId` and `patientId`.
- If a ticket or order has `caseId = null`, it is scoped by the patient user's `patient_site`; `null` patient site remains non-beauty.
- If implementation cannot scope a dashboard field safely, the field must be withheld or returned as a clearly documented scoped-safe value. It must not use an unscoped total.

### Conversations And Messages Access

Purpose:

- Prevent the admin messages center from exposing cross-scope case-linked conversations, message previews, message bodies, or attachments.

Affected use cases:

- `ListConversationsUseCase`
- `GetConversationUseCase`
- `CreateConversationUseCase`
- `UpdateConversationUseCase`
- `ResumeConversationAiUseCase`
- `ListMessagesUseCase`
- `SendMessageUseCase`
- `GetMessageUseCase`
- `UpdateMessageUseCase`
- `DeleteMessageUseCase`
- message translation/retranslation and review actions when they resolve a case-linked conversation

Behavior:

- For conversations with `caseId`, admin access must resolve the linked case and apply the same admin case scope.
- `ListConversationsUseCase` must exclude case-linked conversations outside the admin scope before returning rows or totals.
- For conversations without `caseId`, existing admin behavior can remain unchanged only after implementation confirms they do not contain patient/case data.
- `ListMessagesUseCase` and message mutation use cases must verify the parent conversation is allowed before returning message bodies, signed attachment URLs, or mutating messages.
- `ADMIN_HOSPITAL` conversations linked to a hospital but not a case are not in this scope unless they include a `caseId`.

### Quotes Access

Purpose:

- Prevent standalone quote routes from exposing or mutating cross-scope quote details by direct quote id.

Affected use cases and routes:

- `CreateQuoteUseCase` via `POST /api/v2/quotes`
- `ListQuotesUseCase` via `GET /api/v2/quotes`
- `GetQuoteUseCase` via `GET /api/v2/quotes/{id}`
- `UpdateQuoteUseCase` via `PATCH /api/v2/quotes/{id}`
- `SendQuoteUseCase` via `POST /api/v2/quotes/{id}/send`
- `AcceptQuoteUseCase` via `POST /api/v2/quotes/{id}/accept`
- `RejectQuoteUseCase` via `POST /api/v2/quotes/{id}/reject`
- `ResendQuoteUseCase` via `POST /api/v2/quotes/{id}/resend`
- `CompareQuotesUseCase` via `GET /api/v2/cases/{caseId}/quotes/compare`

Behavior:

- Quote scope is determined by resolving `quote.caseId` to the linked case patient site.
- Admin quote lists must omit cross-scope quotes and return scoped totals.
- Admin quote detail, create, update, send, accept, reject, and resend endpoints must fail with 403 for cross-scope case ids.
- Hospital and patient quote behavior remains unchanged.

### Consultations Access

Purpose:

- Prevent standalone consultation routes, transcripts, and recording upload intents from exposing cross-scope case information.

Affected use cases and routes:

- `CreateConsultationUseCase` via `POST /api/v2/consultations`
- `ListConsultationsUseCase` via `GET /api/v2/consultations`
- `GetConsultationStatsUseCase` via `GET /api/v2/consultations/stats`
- `GetConsultationUseCase` via `GET /api/v2/consultations/{id}`
- `UpdateConsultationUseCase` via `PUT /api/v2/consultations/{id}`
- `UpdateConsultationStatusUseCase` via `PATCH /api/v2/consultations/{id}/status`
- `GetConsultationTranscriptUseCase` via `GET /api/v2/consultations/{id}/transcript`
- route-level recording upload intent in `POST /api/v2/consultations/{id}/recording/upload`
- `ListCaseConsultationsUseCase` via `GET /api/v2/cases/{caseId}/consultations`

Behavior:

- Consultation scope is determined by resolving `consultation.caseId` to the linked case patient site.
- Admin consultation lists and stats must omit cross-scope consultations and return scoped totals.
- Admin consultation detail, update, status, transcript, and upload-intent endpoints must fail with 403 for cross-scope consultations.
- Admin consultation creation must reject a `caseId` outside the admin scope.
- Hospital behavior remains unchanged.

### Question Collector Responses Access

Purpose:

- Prevent admin questionnaire response lists from exposing cross-scope `caseId`, `userId`, responses, extracted data, or risk flags.

Affected use cases and routes:

- `ListResponsesUseCase` via `GET /api/v2/questionnaire-responses`
- `GetResponseUseCase` via `GET /api/v2/cases/{caseId}/questionnaire`
- `SubmitResponseUseCase` via `POST /api/v2/cases/{caseId}/questionnaire`
- `SaveResponseDraftUseCase` via `PATCH /api/v2/cases/{caseId}/questionnaire`
- `GetTemplateUseCase` when called with a `caseId`

Behavior:

- Response scope is determined by resolving `response.caseId` to the linked case patient site.
- Admin response lists must omit cross-scope responses and return scoped totals.
- Admin case-scoped questionnaire reads/writes must fail with 403 for cross-scope case ids.
- Patient and hospital questionnaire behavior remains unchanged.

### Tickets Access

Purpose:

- Prevent admin support views from exposing cross-scope `caseId`, `patientId`, ticket content, internal notes, replies, or attachment upload intents.

Affected use cases and routes:

- `ListTicketsUseCase` via `GET /api/v2/tickets`
- `GetTicketUseCase` via `GET /api/v2/tickets/{id}`
- `AssignTicketUseCase` via `POST /api/v2/tickets/{id}/assign`
- `ReplyToTicketUseCase` via `POST /api/v2/tickets/{id}/reply`
- `UpdateTicketStatusUseCase` via `PATCH /api/v2/tickets/{id}/status`
- `CloseTicketUseCase` via `POST /api/v2/tickets/{id}/close`
- route-level attachment upload intent in `POST /api/v2/tickets/{id}/attachments/upload`

Behavior:

- Ticket scope is determined by `ticket.caseId` when present; resolve the linked case patient site.
- If `ticket.caseId` is null, resolve `ticket.patientId` through the user repository and apply the same patient-site rule.
- Admin ticket lists must omit cross-scope tickets and return scoped totals.
- Admin ticket detail, reply, status, assignment, close, and upload-intent endpoints must fail with 403 for cross-scope tickets.
- Patient ticket behavior remains unchanged.

### Orders Access

Purpose:

- Prevent admin order views and payment/refund actions from exposing or mutating cross-scope `caseId`, `patientId`, order status, or payment/refund state.

Affected use cases and routes:

- `ListOrdersUseCase` via `GET /api/v2/orders`
- `GetOrderUseCase` via `GET /api/v2/orders/{id}`
- `CreateOrderUseCase` via `POST /api/v2/orders`
- `UpdateOrderStatusUseCase` via `PATCH /api/v2/orders/{id}/status`
- `CreatePaymentIntentUseCase` via `POST /api/v2/orders/{id}/payment-intents`
- `RequestRefundUseCase` via `POST /api/v2/orders/{id}/refunds`

Behavior:

- Order scope is determined by `order.caseId` when present; resolve the linked case patient site.
- If `order.caseId` is null, resolve `order.patientId` through the user repository and apply the same patient-site rule.
- Admin order lists must omit cross-scope orders and return scoped totals.
- Admin order detail, status, payment-intent, and refund endpoints must fail with 403 for cross-scope orders.
- Admin order creation must reject a `caseId` or `patientId` outside the admin scope.
- Patient order behavior remains unchanged.

### Other Admin-Visible Case-Derived Surfaces

Purpose:

- Keep the implementation checklist explicit so a single missed page does not become a bypass.

The implementation plan must inspect and either scope or explicitly mark out of scope every admin-visible surface below:

- Cases list: `/api/v2/cases`
- Case creation: `POST /api/v2/cases`
- Case stats: `/api/v2/cases/stats`
- Case detail: `/api/v2/cases/{id}`
- Admin dashboard: `/api/v2/admin/dashboard`
- Progress: `/api/v2/cases/{caseId}/progress`
- Documents and previews: `/api/v2/cases/{caseId}/documents`, `/api/v2/cases/{caseId}/documents/{docId}/preview`, `/api/v2/documents/preview`
- Events and timeline: `/api/v2/cases/{caseId}/events`, `/api/v2/cases/{caseId}/timeline`
- Consultations: `/api/v2/consultations`, `/api/v2/consultations/stats`, `/api/v2/consultations/{id}`, `/api/v2/consultations/{id}/status`, `/api/v2/consultations/{id}/transcript`, `/api/v2/consultations/{id}/recording/upload`, `/api/v2/cases/{caseId}/consultations`
- Hospital contacts and assignment reset: `/api/v2/cases/{caseId}/hospital-contacts`, `/api/v2/cases/{caseId}/reset-assignment`
- Quotes and quote comparison: `/api/v2/quotes`, `/api/v2/quotes/{id}`, `/api/v2/quotes/{id}/send`, `/api/v2/quotes/{id}/accept`, `/api/v2/quotes/{id}/reject`, `/api/v2/quotes/{id}/resend`, `/api/v2/cases/{caseId}/quotes/compare`
- Journey and milestones: `/api/v2/cases/{caseId}/journey`, `/api/v2/cases/{caseId}/milestones`
- Question collector case responses: `/api/v2/questionnaire-responses`, `/api/v2/cases/{caseId}/questionnaire`
- Conversations and messages: `/api/v2/conversations`, `/api/v2/conversations/{id}`, `/api/v2/conversations/{id}/messages`
- Tickets: `/api/v2/tickets`, `/api/v2/tickets/{id}`, `/api/v2/tickets/{id}/assign`, `/api/v2/tickets/{id}/reply`, `/api/v2/tickets/{id}/status`, `/api/v2/tickets/{id}/close`, `/api/v2/tickets/{id}/attachments/upload`
- Orders: `/api/v2/orders`, `/api/v2/orders/{id}`, `/api/v2/orders/{id}/status`, `/api/v2/orders/{id}/payment-intents`, `/api/v2/orders/{id}/refunds`
- Upload-intent or signed-url endpoints if the object owner is a case, document, conversation message, ticket, or order.

### Account Provisioning

Purpose:

- Create a production-login-ready admin account for `contact@medorabeauty.com`.

Provisioning steps:

1. Use Keycloak Admin API credentials from the production API environment.
2. Create or find Keycloak user with email and username `contact@medorabeauty.com`.
3. Ensure the Keycloak user is enabled, email is marked verified, and blocking required actions are cleared.
4. Set the password from the approved runtime password input with `temporary = false`.
5. Assign the existing `admin` realm role.
6. Upsert the CRM `users` row:
   - `email = 'contact@medorabeauty.com'`
   - `name = 'Medora Beauty Admin'`
   - `role = 'ADMIN'`
   - `hospital_id = NULL`
   - `patient_site = NULL`
   - `status = 'active'`
   - `keycloak_user_id = <Keycloak user id>`
7. Make the provisioning process idempotent so it can be rerun if one side already exists.

The provisioning script must report a clear partial-success state if Keycloak succeeds but the CRM database write fails.

## Data Flow

### List Cases

1. Admin portal requests `/api/v2/cases`.
2. API middleware verifies the Keycloak token and creates a session.
3. `toActor()` creates an `Actor`.
4. `ListCasesUseCase` derives admin case scope from actor email.
5. `DrizzleCaseRepository.findMany()` applies the patient-site scope in SQL.
6. The admin portal receives only allowed cases.

### Create Case

1. Admin portal requests `POST /api/v2/cases` with a `patientId`.
2. `CreateCaseUseCase` derives the same admin case scope from actor email.
3. The use case resolves the target patient and checks `users.patient_site`.
4. Allowed requests create the case. Cross-scope requests fail with 403 before generating or saving the case.

### Case Detail

1. Admin portal requests `/api/v2/cases/{id}` or a case subresource.
2. Use case loads the case.
3. Use case resolves the patient site for `case.patientId`.
4. Shared guard checks the actor email domain against patient site.
5. Allowed requests continue. Cross-scope requests fail with 403.

### Dashboard

1. Admin portal requests `/api/v2/admin/dashboard`.
2. `AdminDashboardUseCase` derives the same admin case scope from actor email.
3. Case stats and recent cases are queried with that scope.
4. Linked ticket/order counts are scoped by linked case patient site or withheld until scoped.

### Messages

1. Admin portal requests conversations or messages.
2. Conversation queries either filter in SQL by linked case patient site or post-filter with correct totals only if SQL filtering is not practical.
3. Message queries and mutations resolve the parent conversation and linked case before exposing message content or attachment URLs.
4. Cross-scope conversations fail with 403 for detail/message endpoints and are omitted from list endpoints.

### Tickets And Orders

1. Admin portal requests ticket/order list, detail, or mutation endpoints.
2. The use case derives the same admin case scope from actor email.
3. If the entity has a `caseId`, the use case resolves the case patient site.
4. If the entity has no `caseId`, the use case resolves the entity `patientId` and uses that patient's `patient_site`.
5. List endpoints omit cross-scope entities and return scoped totals. Detail and mutation endpoints fail with 403.

### Quotes, Consultations, And Questionnaire Responses

1. Admin portal requests standalone quote, consultation, transcript, upload, or questionnaire response endpoints.
2. The use case derives the same admin case scope from actor email.
3. The use case resolves the entity's linked case and patient site.
4. List/stat endpoints omit cross-scope entities and return scoped totals. Detail and mutation endpoints fail with 403.

## Security Requirements

- Frontend filtering is not sufficient and must not be the only enforcement point.
- Non-`medorabeauty.com` admins must not see beauty cases in lists, stats, dashboard widgets, conversations, messages, details, or case subresources.
- `medorabeauty.com` admins must not see non-beauty cases in lists, stats, dashboard widgets, conversations, messages, details, or case subresources.
- Admin ticket and order surfaces must follow the same patient-site rule even when `caseId` is null.
- Standalone quote, consultation, transcript, and questionnaire response surfaces must follow the same patient-site rule.
- `users.patient_site IS NULL` is non-beauty.
- The scope rule applies only to `ADMIN` actors. It must not change hospital/patient access.
- The password must not be committed to documentation or code and must not be logged by provisioning commands.

## Testing

Application tests:

- Beauty admin list returns only `patient_site = 'beauty'` cases.
- Regular admin list excludes `patient_site = 'beauty'`.
- Regular admin list includes `patient_site = 'china'`.
- Regular admin list includes `patient_site IS NULL`.
- Beauty admin stats count only beauty cases.
- Regular admin stats exclude beauty cases.
- Beauty admin dashboard counts and recent cases include only beauty cases.
- Regular admin dashboard counts and recent cases exclude beauty cases.
- Beauty admin cannot fetch a china or null-site case detail.
- Regular admin cannot fetch a beauty case detail.
- Beauty admin can create a case only for a beauty patient.
- Regular admin cannot create a case for a beauty patient.
- Cross-scope case creation does not save a case.
- Beauty admin cannot fetch messages for a non-beauty case-linked conversation.
- Regular admin cannot fetch messages for a beauty case-linked conversation.
- Admin conversation lists omit cross-scope case-linked conversations and report scoped totals.
- Beauty admin ticket/order lists include only beauty-linked entities.
- Regular admin ticket/order lists exclude beauty-linked entities.
- Beauty admin cannot fetch or mutate non-beauty tickets/orders.
- Regular admin cannot fetch or mutate beauty tickets/orders.
- Tickets/orders with `caseId = null` are scoped through `patientId`.
- Beauty admin quote/consultation/questionnaire lists include only beauty-linked entities.
- Regular admin quote/consultation/questionnaire lists exclude beauty-linked entities.
- Beauty admin cannot fetch or mutate non-beauty quotes, consultations, transcripts, or questionnaire responses.
- Regular admin cannot fetch or mutate beauty quotes, consultations, transcripts, or questionnaire responses.
- Hospital user access remains governed by hospital assignment.

Repository tests:

- `findMany()` applies patient-site scope with existing search and pagination.
- `countByFilters()` applies patient-site scope.
- Conversation list scope is verified wherever the filtering lives, with correct scoped totals.
- Quote list scope is verified wherever the filtering lives, with correct scoped totals.
- Consultation list/stat scope is verified wherever the filtering lives, with correct scoped totals.
- Question collector response list scope is verified wherever the filtering lives, with correct scoped totals.
- Ticket list scope is verified wherever the filtering lives, with correct scoped totals.
- Order list scope is verified wherever the filtering lives, with correct scoped totals.

Route or integration tests:

- `/api/v2/cases`
- `POST /api/v2/cases`
- `/api/v2/cases/stats`
- `/api/v2/cases/{id}`
- `/api/v2/admin/dashboard`
- `/api/v2/conversations`
- `/api/v2/conversations/{id}/messages`
- `/api/v2/quotes`
- `/api/v2/quotes/{id}`
- `/api/v2/quotes/{id}/send`
- `/api/v2/questionnaire-responses`
- `/api/v2/consultations`
- `/api/v2/consultations/{id}`
- `/api/v2/consultations/{id}/transcript`
- `/api/v2/tickets`
- `/api/v2/tickets/{id}`
- `/api/v2/tickets/{id}/reply`
- `/api/v2/orders`
- `/api/v2/orders/{id}`
- `/api/v2/orders/{id}/status`
- `/api/v2/cases/{caseId}/documents`
- `/api/v2/cases/{caseId}/documents/{docId}/preview`
- `/api/v2/cases/{caseId}/timeline`
- One case mutation path, such as `/api/v2/cases/{id}/status` or `/api/v2/cases/{caseId}/progress`.

Provisioning verification:

- Keycloak user exists.
- User can authenticate with the configured password.
- Access token contains the `admin` role.
- CRM `users` row exists with matching `keycloak_user_id`.
- Login to `https://admin.medicaltourismchina.health/` succeeds.

## Rollout

1. Implement code and tests locally.
2. Deploy API changes before relying on the new account.
3. Run provisioning for `contact@medorabeauty.com`.
4. Verify with the new account in production.
5. Verify an existing non-beauty admin no longer sees beauty cases.

## Non-Goals

- Add a new Keycloak role such as `beauty_admin`.
- Add a new admin portal management UI for creating admins.
- Add a `cases.site` column.
- Change patient or hospital portal authorization behavior.
