# Reply-To Email Routing and Case Document Access Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make patient notification emails directly replyable through Resend Inbound, route replies into the correct CRM conversation with attachments, and make CRM case documents open reliably from admin and hospital portals.

**Architecture:** Add durable reply-token and inbound-event persistence, then wire outbound notifications to generate tokenized `Reply-To` addresses. Add a public Resend webhook that verifies signatures, fetches the received email payload from Resend, validates token/sender/auth/idempotency, uploads attachments, and writes through the existing `SendMessageUseCase`. Replace direct document open links with id-based preview routes that authorize by case/document before signing and streaming the file.

**Tech Stack:** TypeScript, Hono, Next.js route handlers, Drizzle/Postgres, Vitest, Resend Inbound/Webhooks, existing CRM media upload policies, existing R2/Supabase routed storage.

---

## References

- Spec: `docs/superpowers/specs/2026-04-28-reply-to-email-and-case-documents-design.md`
- Resend docs to consult during implementation:
  - `https://resend.com/docs/webhooks/introduction`
  - `https://resend.com/docs/webhooks/emails/received`
  - `https://resend.com/docs/receiving/introduction`
  - `https://resend.com/docs/api-reference/emails/retrieve`
  - `https://resend.com/docs/api-reference/attachments/retrieve`

## File Structure

### New backend/domain units

- `packages/infrastructure/database/migrations/040_email_reply_routing.sql`
  - Creates `email_reply_tokens` and `inbound_email_events`.
- `packages/infrastructure/database/schema/schema.ts`
  - Adds Drizzle table definitions and indexes.
- `packages/domain/src/entities/email-reply-token.entity.ts`
  - Small domain object for reply-token rows.
- `packages/domain/src/entities/inbound-email-event.entity.ts`
  - Small domain object for inbound-event rows.
- `packages/domain/src/ports/email-reply-token-repository.port.ts`
  - Token persistence contract.
- `packages/domain/src/ports/inbound-email-event-repository.port.ts`
  - Idempotency/event persistence contract.
- `packages/infrastructure/database/repositories/drizzle-email-reply-token.repository.ts`
  - Drizzle implementation for token records.
- `packages/infrastructure/database/repositories/drizzle-inbound-email-event.repository.ts`
  - Drizzle implementation with atomic event claim.
- `packages/application/src/services/email-reply-token.service.ts`
  - Generates and hashes tokens, parses reply addresses.
- `packages/application/src/use-cases/notifications/create-email-reply-token.use-case.ts`
  - Creates or reuses token records for outbound notifications.
- `packages/application/src/use-cases/inbound/process-inbound-email.use-case.ts`
  - Validates inbound email and writes patient message.
- `packages/infrastructure/services/resend-inbound.service.ts`
  - Verifies webhook signatures and retrieves email/attachment content from Resend.
- `packages/infrastructure/storage/server-side-upload.service.ts`
  - Uploads provider-fetched bytes to existing presigned upload URLs.
- `apps/api/src/routes/resend-inbound.routes.ts`
  - Public webhook route mounted before Keycloak auth.

### Existing backend files to modify

- `packages/domain/src/index.ts`
  - Export new entities and ports.
- `packages/domain/src/ports/email-service.port.ts`
  - Add optional `replyTo` to patient-facing mail params.
- `packages/application/src/index.ts`
  - Export new services/use cases.
- `packages/application/src/use-cases/notifications/notification-email.service.ts`
  - Generate reply tokens before patient emails.
- `packages/infrastructure/services/resend-email.service.ts`
  - Uses the fixed approved sender `Medora Care Team <customer@medicaltourismchina.health>` for patient-facing mail and passes `reply_to` to Resend when present.
- `packages/infrastructure/services/smtp-email.service.ts`
  - Uses the fixed approved sender `Medora Care Team <customer@medicaltourismchina.health>` for patient-facing mail and passes `replyTo` to Nodemailer when present.
- `packages/infrastructure/services/patient-new-message-email.template.ts`
  - Replace "do not reply" footer.
- `apps/api/src/composition-root.ts`
  - Instantiate new repositories/services/use cases.
- `apps/api/src/index.ts`
  - Mount Resend webhook route before `/api/v2/*` auth.
- `apps/api/src/routes/messages.routes.ts`
  - Pass conversation context into patient notification token generation.
- `apps/api/src/routes/documents.routes.ts`
  - Add id-based preview route and improve hospital document notification routing.
- `apps/api/src/routes/patient-protected.routes.ts`
  - Keep patient portal message path behavior unchanged; add tests to prove no regression.

### Existing frontend files to modify

- `apps/admin/src/app/api/cases/[id]/documents/[docId]/preview/route.ts`
  - New Next route handler proxying to CRM API preview route.
- `apps/hospital/src/app/api/cases/[id]/documents/[docId]/preview/route.ts`
  - New Next route handler proxying to CRM API preview route.
- `apps/admin/src/components/tabs/case-overview-tab.tsx`
  - Open/view links use local id-based preview route.
- `apps/hospital/src/components/case-detail-panel.tsx`
  - Documents tab and invitation letter view links use local id-based preview route.

### Tests

- `packages/application/__tests__/email-reply-token.service.test.ts`
- `packages/application/__tests__/notifications-reply-to.test.ts`
- `packages/application/__tests__/process-inbound-email.use-case.test.ts`
- `packages/infrastructure/database/repositories/__tests__/drizzle-email-reply-token.repository.test.ts`
- `packages/infrastructure/database/repositories/__tests__/drizzle-inbound-email-event.repository.test.ts`
- `packages/infrastructure/services/__tests__/resend-inbound.service.test.ts`
- `apps/api/src/__tests__/resend-inbound.routes.test.ts`
- `apps/api/src/__tests__/documents.routes.test.ts`
- `apps/admin/src/__tests__/case-overview-tab.test.tsx`
- `apps/hospital/src/__tests__/case-detail-panel-i18n.test.ts` or a new focused document-link test

## Chunk 1: Persistence and Reply Token Core

### Task 1: Add reply-token and inbound-event schema

**Files:**
- Create: `packages/infrastructure/database/migrations/040_email_reply_routing.sql`
- Modify: `packages/infrastructure/database/schema/schema.ts`
- Modify: `packages/infrastructure/database/schema/relations.ts` only if local patterns require relations for new tables

- [ ] **Step 1: Write the migration**

Create `040_email_reply_routing.sql` with:

```sql
CREATE TYPE "EmailReplyChannel" AS ENUM ('ADMIN_PATIENT', 'HOSPITAL_PATIENT');
CREATE TYPE "EmailReplyTokenStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "InboundEmailStatus" AS ENUM (
  'PROCESSING',
  'PROCESSED',
  'TOKEN_NOT_FOUND',
  'TOKEN_EXPIRED',
  'SENDER_MISMATCH',
  'EMAIL_AUTH_FAILED',
  'CONVERSATION_INVALID',
  'EMPTY_REPLY',
  'FAILED'
);

CREATE TABLE IF NOT EXISTS email_reply_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash varchar(128) NOT NULL,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_email varchar(255) NOT NULL,
  channel "EmailReplyChannel" NOT NULL,
  hospital_id uuid REFERENCES hospitals(id) ON DELETE CASCADE,
  source_kind varchar(80) NOT NULL,
  source_id varchar(120),
  expires_at timestamptz NOT NULL,
  status "EmailReplyTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT email_reply_tokens_hospital_required
    CHECK (channel <> 'HOSPITAL_PATIENT' OR hospital_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS email_reply_tokens_token_hash_key
  ON email_reply_tokens(token_hash);
CREATE INDEX IF NOT EXISTS email_reply_tokens_conversation_idx
  ON email_reply_tokens(conversation_id);
CREATE INDEX IF NOT EXISTS email_reply_tokens_case_patient_idx
  ON email_reply_tokens(case_id, patient_id);
CREATE INDEX IF NOT EXISTS email_reply_tokens_source_idx
  ON email_reply_tokens(source_kind, source_id);

CREATE TABLE IF NOT EXISTS inbound_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL,
  provider_event_id varchar(160),
  provider_message_id varchar(160),
  reply_token_id uuid REFERENCES email_reply_tokens(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  from_email varchar(255),
  subject text,
  status "InboundEmailStatus" NOT NULL DEFAULT 'PROCESSING',
  error text,
  created_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbound_email_events_provider_event_key
  ON inbound_email_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inbound_email_events_provider_message_key
  ON inbound_email_events(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
```

- [ ] **Step 2: Add Drizzle schema entries**

Mirror the SQL in `packages/infrastructure/database/schema/schema.ts` using existing `pgEnum`, `pgTable`, `uuid`, `varchar`, `text`, `timestamp`, `uniqueIndex`, `index`, `foreignKey`, and `sql` patterns.

- [ ] **Step 3: Run schema typecheck**

Run:

```bash
pnpm --filter @medical-crm/infrastructure typecheck
```

Expected: PASS or only pre-existing unrelated errors. If it fails because of the new schema code, fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add packages/infrastructure/database/migrations/040_email_reply_routing.sql \
  packages/infrastructure/database/schema/schema.ts \
  packages/infrastructure/database/schema/relations.ts
git commit -m "feat(email): add reply routing persistence"
```

### Task 2: Add domain entities and repository ports

**Files:**
- Create: `packages/domain/src/entities/email-reply-token.entity.ts`
- Create: `packages/domain/src/entities/inbound-email-event.entity.ts`
- Create: `packages/domain/src/ports/email-reply-token-repository.port.ts`
- Create: `packages/domain/src/ports/inbound-email-event-repository.port.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write entities and ports**

Use small interfaces, no business logic beyond construction. Include these port methods:

```ts
export interface IEmailReplyTokenRepository {
  findByTokenHash(tokenHash: string): Promise<EmailReplyToken | null>;
  findReusable(input: {
    conversationId: string;
    patientId: string;
    sourceKind: string;
    sourceId?: string | null;
    now: Date;
  }): Promise<EmailReplyToken | null>;
  save(entity: EmailReplyToken): Promise<EmailReplyToken>;
  markUsed(id: string, usedAt: Date): Promise<void>;
}

export interface IInboundEmailEventRepository {
  claim(input: {
    provider: 'resend';
    providerEventId?: string | null;
    providerMessageId?: string | null;
  }): Promise<{ event: InboundEmailEvent; alreadyClaimed: boolean }>;
  complete(input: { id: string; status: InboundEmailStatus; createdMessageId?: string | null; error?: string | null }): Promise<void>;
}
```

- [ ] **Step 2: Export from domain index**

Add exports next to other entity/port exports.

- [ ] **Step 3: Run domain typecheck**

```bash
pnpm --filter @medical-crm/domain typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/entities/email-reply-token.entity.ts \
  packages/domain/src/entities/inbound-email-event.entity.ts \
  packages/domain/src/ports/email-reply-token-repository.port.ts \
  packages/domain/src/ports/inbound-email-event-repository.port.ts \
  packages/domain/src/index.ts
git commit -m "feat(email): add reply routing domain contracts"
```

### Task 3: Implement repositories with idempotent claim

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-email-reply-token.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-inbound-email-event.repository.ts`
- Modify: `packages/infrastructure/database/repositories/index.ts`
- Test: `packages/infrastructure/database/repositories/__tests__/drizzle-email-reply-token.repository.test.ts`
- Test: `packages/infrastructure/database/repositories/__tests__/drizzle-inbound-email-event.repository.test.ts`

- [ ] **Step 1: Write repository tests**

Test cases:

- `findReusable` returns only active, unexpired matching token.
- `findByTokenHash` returns the token and never raw token data.
- `claim` returns `alreadyClaimed: false` for first event.
- `claim` returns `alreadyClaimed: true` for duplicate `(provider, providerEventId)`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @medical-crm/infrastructure test -- database/repositories/__tests__/drizzle-email-reply-token.repository.test.ts database/repositories/__tests__/drizzle-inbound-email-event.repository.test.ts
```

Expected: FAIL because repositories do not exist.

- [ ] **Step 3: Implement repositories**

Follow `DrizzleMessageRepository` style. For `claim`, insert a `PROCESSING` row and catch unique violations; on conflict, load the existing row and return `alreadyClaimed: true`.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @medical-crm/infrastructure test -- database/repositories/__tests__/drizzle-email-reply-token.repository.test.ts database/repositories/__tests__/drizzle-inbound-email-event.repository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/database/repositories/drizzle-email-reply-token.repository.ts \
  packages/infrastructure/database/repositories/drizzle-inbound-email-event.repository.ts \
  packages/infrastructure/database/repositories/index.ts \
  packages/infrastructure/database/repositories/__tests__/drizzle-email-reply-token.repository.test.ts \
  packages/infrastructure/database/repositories/__tests__/drizzle-inbound-email-event.repository.test.ts
git commit -m "feat(email): persist reply tokens and inbound events"
```

## Chunk 2: Outbound Reply-To Wiring

### Task 4: Add token generation and reply-address parsing service

**Files:**
- Create: `packages/application/src/services/email-reply-token.service.ts`
- Create: `packages/application/__tests__/email-reply-token.service.test.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Write tests**

Cover:

- Generates high-entropy token and stores only SHA-256 hash.
- Builds preferred address `reply+<token>@medicaltourismchina.health`.
- Parses both `reply+<token>@medicaltourismchina.health` and `<token>@reply.medicaltourismchina.health`.
- Rejects malformed tokens.

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @medical-crm/application test -- email-reply-token.service.test.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement service**

Use `node:crypto`:

```ts
import { createHash, randomBytes } from 'node:crypto';

export function hashReplyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateReplyToken(): string {
  return randomBytes(32).toString('base64url');
}
```

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @medical-crm/application test -- email-reply-token.service.test.ts
pnpm --filter @medical-crm/application typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/services/email-reply-token.service.ts \
  packages/application/__tests__/email-reply-token.service.test.ts \
  packages/application/src/index.ts
git commit -m "feat(email): add reply token service"
```

### Task 5: Wire Reply-To into email interfaces and providers

**Files:**
- Modify: `packages/domain/src/ports/email-service.port.ts`
- Modify: `packages/infrastructure/services/resend-email.service.ts`
- Modify: `packages/infrastructure/services/smtp-email.service.ts`
- Modify: `packages/infrastructure/services/stub-email.service.ts`
- Modify: `packages/infrastructure/services/patient-new-message-email.template.ts`
- Test: `packages/infrastructure/services/__tests__/resend-email.service.test.ts` or create if absent
- Test: `packages/application/__tests__/notifications-reply-to.test.ts`

- [ ] **Step 1: Add tests for email params**

Assert patient-facing email params accept:

```ts
replyTo?: string | null;
```

Assert Resend payload includes:

```json
{
  "from": "Medora Care Team <customer@medicaltourismchina.health>",
  "reply_to": "Medora Reply <reply+token@medicaltourismchina.health>"
}
```

Assert SMTP uses Nodemailer `from: "Medora Care Team <customer@medicaltourismchina.health>"` and `replyTo`.

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @medical-crm/infrastructure test -- services/__tests__/resend-email.service.test.ts
pnpm --filter @medical-crm/application test -- notifications-reply-to.test.ts
```

Expected: FAIL until provider params are added.

- [ ] **Step 3: Implement provider changes**

Add `replyTo?: string | null` to:

- `sendPatientNewMessageAlert`
- `sendPatientCaseUpdateAlert`

Optionally add to admin-facing methods later, but do not broaden beyond this feature.

Add a patient-facing sender constant in both providers:

```ts
const PATIENT_NOTIFICATION_FROM = 'Medora Care Team <customer@medicaltourismchina.health>';
```

Use this constant for patient-facing message and case-update notifications. Do not allow an env override for these notifications. If an existing env-driven sender helper is reused, add a guard that throws during provider construction when the configured patient notification sender is not exactly `Medora Care Team <customer@medicaltourismchina.health>`.

Keep auth emails on their current sender unless product explicitly wants magic-link/onboarding mail to change too.

Update template footer to:

```ts
'You can reply directly to this email. Your message and attachments will be added to your Medora case.'
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @medical-crm/domain typecheck
pnpm --filter @medical-crm/infrastructure test -- services/__tests__/resend-email.service.test.ts
pnpm --filter @medical-crm/application test -- notifications-reply-to.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/ports/email-service.port.ts \
  packages/infrastructure/services/resend-email.service.ts \
  packages/infrastructure/services/smtp-email.service.ts \
  packages/infrastructure/services/stub-email.service.ts \
  packages/infrastructure/services/patient-new-message-email.template.ts \
  packages/infrastructure/services/__tests__/resend-email.service.test.ts \
  packages/application/__tests__/notifications-reply-to.test.ts
git commit -m "feat(email): support patient reply-to headers"
```

### Task 6: Generate reply tokens for patient notifications

**Files:**
- Create: `packages/application/src/use-cases/notifications/create-email-reply-token.use-case.ts`
- Modify: `packages/application/src/use-cases/notifications/notification-email.service.ts`
- Modify: `apps/api/src/composition-root.ts`
- Modify: `apps/api/src/routes/messages.routes.ts`
- Modify: `apps/api/src/routes/documents.routes.ts`
- Test: `packages/application/__tests__/notifications-reply-to.test.ts`
- Test: `apps/api/src/__tests__/messages.routes.test.ts`
- Test: `apps/api/src/__tests__/documents.routes.test.ts`

- [ ] **Step 1: Add failing notification tests**

Cases:

- Admin message to patient creates token for `ADMIN_PATIENT` conversation and passes `replyTo`.
- Hospital message to patient creates token for `HOSPITAL_PATIENT` conversation and passes `replyTo`.
- Hospital invitation/diagnosis document notification creates token for uploading hospital conversation.
- Admin document notification routes to `ADMIN_PATIENT` unless explicit hospital is supplied.

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @medical-crm/application test -- notifications-reply-to.test.ts
pnpm --filter @medical-crm/api test -- documents.routes.test.ts messages.routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement use case**

`CreateEmailReplyTokenUseCase.execute(input)` should:

- Find reusable active token for same conversation/patient/source.
- Otherwise create a new token hash with 180-day expiry.
- Return formatted reply-to address.

- [ ] **Step 4: Update notification service**

Inject the use case as optional dependency to keep tests easy. For `notifyPatientOfAdminMessage` and `notifyPatientOfCaseUpdate`, request a token when `conversationId` is known.

For case update/document notification, extend input to include:

```ts
conversationId?: string;
channel?: 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
hospitalId?: string | null;
sourceKind?: string;
sourceId?: string | null;
```

- [ ] **Step 5: Update route wiring**

In `messages.routes.ts`, when notifying patient about staff message, pass the existing conversation id and category.

In `documents.routes.ts`, for hospital document notification:

- Require hospital actor.
- Use actor `hospitalId`.
- Find or create `HOSPITAL_PATIENT` conversation through existing conversation repository/use case.
- Only notify for `INVITATION`, `DIAGNOSIS`, and `QUOTE`.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @medical-crm/application test -- notifications-reply-to.test.ts
pnpm --filter @medical-crm/api test -- documents.routes.test.ts messages.routes.test.ts
pnpm --filter @medical-crm/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/use-cases/notifications/create-email-reply-token.use-case.ts \
  packages/application/src/use-cases/notifications/notification-email.service.ts \
  packages/application/__tests__/notifications-reply-to.test.ts \
  apps/api/src/composition-root.ts \
  apps/api/src/routes/messages.routes.ts \
  apps/api/src/routes/documents.routes.ts \
  apps/api/src/__tests__/messages.routes.test.ts \
  apps/api/src/__tests__/documents.routes.test.ts
git commit -m "feat(email): add reply tokens to patient notifications"
```

## Chunk 3: Resend Inbound Processing

### Task 7: Implement Resend inbound service

**Files:**
- Modify: `packages/infrastructure/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/infrastructure/services/resend-inbound.service.ts`
- Modify: `packages/infrastructure/services/index.ts`
- Test: `packages/infrastructure/services/__tests__/resend-inbound.service.test.ts`

- [ ] **Step 1: Add Svix dependency**

Run:

```bash
pnpm --filter @medical-crm/infrastructure add svix
```

Expected: `packages/infrastructure/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Write tests**

Mock `fetch` and cover:

- Verifies Svix webhook headers using `RESEND_WEBHOOK_SECRET`.
- Extracts event id and Resend email id from `email.received`.
- Retrieves full email content from Resend API.
- Retrieves attachment bytes from Resend attachment API.
- Maps missing API key/secret to clear configuration errors.

- [ ] **Step 3: Run failing tests**

```bash
pnpm --filter @medical-crm/infrastructure test -- services/__tests__/resend-inbound.service.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement service**

Keep provider-specific details out of application use cases. Return normalized input:

```ts
export interface NormalizedInboundEmail {
  provider: 'resend';
  providerEventId: string | null;
  providerMessageId: string | null;
  fromEmail: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  auth: { spf?: string | null; dkim?: string | null; dmarc?: string | null };
  attachments: Array<{ providerAttachmentId: string; fileName: string; mimeType: string; fileSize: number }>;
}
```

- [ ] **Step 5: Run tests and typecheck**

```bash
pnpm --filter @medical-crm/infrastructure test -- services/__tests__/resend-inbound.service.test.ts
pnpm --filter @medical-crm/infrastructure typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/package.json pnpm-lock.yaml
git add packages/infrastructure/services/resend-inbound.service.ts \
  packages/infrastructure/services/index.ts \
  packages/infrastructure/services/__tests__/resend-inbound.service.test.ts
git commit -m "feat(email): add resend inbound adapter"
```

### Task 8: Add server-side attachment byte uploader

**Files:**
- Create: `packages/infrastructure/storage/server-side-upload.service.ts`
- Test: `packages/infrastructure/storage/__tests__/server-side-upload.service.test.ts`

- [ ] **Step 1: Write tests**

Cases:

- Uploads `Uint8Array` bytes to a presigned URL with the exact MIME type.
- Throws a readable error when the storage upload response is not ok.
- Does not log or persist file bytes.

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @medical-crm/infrastructure test -- storage/__tests__/server-side-upload.service.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement service**

Create:

```ts
export class ServerSideUploadService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async uploadBytes(input: {
    uploadUrl: string;
    bytes: Uint8Array;
    mimeType: string;
    label: string;
  }): Promise<void> {
    const response = await this.fetchImpl(input.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': input.mimeType },
      body: input.bytes,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${input.label} upload failed: ${response.status}${detail ? ` ${detail}` : ''}`);
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @medical-crm/infrastructure test -- storage/__tests__/server-side-upload.service.test.ts
pnpm --filter @medical-crm/infrastructure typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/storage/server-side-upload.service.ts \
  packages/infrastructure/storage/__tests__/server-side-upload.service.test.ts
git commit -m "feat(storage): add server-side upload helper"
```

### Task 9: Add inbound parser and processing use case

**Files:**
- Create: `packages/application/src/use-cases/inbound/process-inbound-email.use-case.ts`
- Create: `packages/application/src/services/email-reply-body-parser.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/__tests__/process-inbound-email.use-case.test.ts`

- [ ] **Step 1: Write failing tests**

Cases:

- Valid token/sender/auth writes patient message with text.
- Valid reply with attachment uploads attachment and writes message as `FILE`.
- Duplicate claimed event creates no second message.
- Missing token records `TOKEN_NOT_FOUND`.
- Expired token records `TOKEN_EXPIRED`.
- Sender mismatch records `SENDER_MISMATCH`.
- Failed SPF/DKIM/DMARC records `EMAIL_AUTH_FAILED`.
- Empty cleaned body and no attachments records `EMPTY_REPLY`.

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @medical-crm/application test -- process-inbound-email.use-case.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement body parser**

Start simple and deterministic:

- Prefer `text`.
- Strip lines after common markers: `On ... wrote:`, `-----Original Message-----`, `From:`, `Sent:`.
- Trim whitespace.
- If only `html` exists, strip tags using existing sanitize utilities if available; otherwise keep a conservative helper in this file.

- [ ] **Step 4: Implement use case**

Dependencies:

- `IEmailReplyTokenRepository`
- `IInboundEmailEventRepository`
- `IConversationRepository`
- `ICaseRepository`
- `IPatientRepository`
- `MediaUploadService`
- `InboundAttachmentSource`, a provider-neutral interface implemented in composition by a small adapter over `ResendInboundService`:

```ts
export interface InboundAttachmentSource {
  getAttachmentBytes(input: {
    provider: 'resend';
    providerMessageId: string;
    providerAttachmentId: string;
  }): Promise<Uint8Array>;
}
```

- `InboundAttachmentUploader`, a small interface implemented by `ServerSideUploadService` from Task 8:

```ts
export interface InboundAttachmentUploader {
  uploadBytes(input: { uploadUrl: string; bytes: Uint8Array; mimeType: string; label: string }): Promise<void>;
}
```

- `SendMessageUseCase`

Construct patient actor:

```ts
const actor = {
  userId: token.patientId,
  email: token.patientEmail,
  role: 'PATIENT' as const,
  hospitalId: null,
};
```

Call `sendMessage.execute(token.conversationId, { content, messageType, attachments }, actor)`.

For each inbound attachment:

1. Retrieve bytes through `InboundAttachmentSource.getAttachmentBytes(...)`.
2. Call `mediaUpload.createUploadIntent({ policyId: 'message_attachment', ownerType: 'conversation', ownerId: token.conversationId, fileName, fileSize, mimeType })`.
3. Call `inboundAttachmentUploader.uploadBytes(...)`.
4. Add the upload intent's asset shape to the message `attachments`.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @medical-crm/application test -- process-inbound-email.use-case.test.ts
pnpm --filter @medical-crm/application typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/inbound/process-inbound-email.use-case.ts \
  packages/application/src/services/email-reply-body-parser.ts \
  packages/application/src/index.ts \
  packages/application/__tests__/process-inbound-email.use-case.test.ts
git commit -m "feat(email): process inbound patient replies"
```

### Task 10: Add public Resend webhook route

**Files:**
- Create: `apps/api/src/routes/resend-inbound.routes.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/composition-root.ts`
- Test: `apps/api/src/__tests__/resend-inbound.routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Cases:

- Rejects missing/invalid signature.
- Returns `204` without processing when `INBOUND_EMAIL_ENABLED` is not `true`.
- Accepts duplicate event without duplicate message.
- Valid `email.received` event invokes `processInboundEmail`.
- Non-`email.received` event returns 204.

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @medical-crm/api test -- resend-inbound.routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement route**

Mount before Keycloak auth:

```ts
import resendInboundRoutes from './routes/resend-inbound.routes.js';
app.route('/api/webhooks/resend', resendInboundRoutes);
```

Route:

```ts
app.post('/inbound', async (c) => {
  if (process.env['INBOUND_EMAIL_ENABLED'] !== 'true') {
    return c.body(null, 204);
  }
  const rawBody = await c.req.text();
  const normalized = await svc.resendInbound.parseWebhook(rawBody, c.req.raw.headers);
  if (normalized.eventType !== 'email.received') return c.body(null, 204);
  await svc.processInboundEmail.execute(normalized.email);
  return c.body(null, 204);
});
```

Use exact normalized shape from Task 7.

The route must stay mounted before Keycloak auth because Resend cannot send CRM credentials. The webhook signature and `INBOUND_EMAIL_ENABLED` flag are the route boundary.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @medical-crm/api test -- resend-inbound.routes.test.ts
pnpm --filter @medical-crm/api typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/resend-inbound.routes.ts \
  apps/api/src/index.ts \
  apps/api/src/composition-root.ts \
  apps/api/src/__tests__/resend-inbound.routes.test.ts
git commit -m "feat(email): receive resend inbound replies"
```

## Chunk 4: Id-Based Document Preview

### Task 11: Add backend document preview route

**Files:**
- Modify: `packages/application/src/use-cases/documents/list-documents.use-case.ts` only if shared auth helper extraction is needed
- Create: `packages/application/src/use-cases/documents/get-document-preview.use-case.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `apps/api/src/routes/documents.routes.ts`
- Modify: `apps/api/src/composition-root.ts`
- Test: `apps/api/src/__tests__/documents.routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Cases:

- Admin can preview a document in a case.
- Hospital can preview only if hospital has case access.
- Mismatched case/document returns 404.
- Deleted document returns 404.
- Preview route never accepts arbitrary `url`.

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @medical-crm/api test -- documents.routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement use case**

`GetDocumentPreviewUseCase.execute(caseId, documentId, actor)` should:

- Load document.
- Verify `doc.caseId === caseId` and `doc.status !== 'DELETED'`.
- Load case and run existing `assertHospitalCaseAccess` for hospital actors.
- Get signed URL from routed storage.
- Fetch only that signed URL server-side.
- Return `{ body, contentType, fileName }`.

- [ ] **Step 4: Implement API route**

Add:

```text
GET /api/v2/cases/{caseId}/documents/{docId}/preview
```

Return `Content-Disposition: inline; filename="<safe filename>"`.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @medical-crm/api test -- documents.routes.test.ts
pnpm --filter @medical-crm/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/documents/get-document-preview.use-case.ts \
  packages/application/src/index.ts \
  apps/api/src/routes/documents.routes.ts \
  apps/api/src/composition-root.ts \
  apps/api/src/__tests__/documents.routes.test.ts
git commit -m "feat(documents): add authorized preview route"
```

### Task 12: Wire admin and hospital document open links

**Files:**
- Create: `apps/admin/src/app/api/cases/[id]/documents/[docId]/preview/route.ts`
- Create: `apps/hospital/src/app/api/cases/[id]/documents/[docId]/preview/route.ts`
- Modify: `apps/admin/src/app/api/documents/preview/route.ts`
- Modify: `apps/hospital/src/app/api/documents/preview/route.ts`
- Modify: `apps/admin/src/components/tabs/case-overview-tab.tsx`
- Modify: `apps/hospital/src/components/case-detail-panel.tsx`
- Test: `apps/admin/src/__tests__/case-overview-tab.test.tsx`
- Test: `apps/hospital/src/__tests__/case-detail-panel-created-at.test.tsx` or create `case-detail-panel-documents.test.tsx`

- [ ] **Step 1: Add failing component tests**

Assert the view/open href is:

```text
/api/cases/<caseId>/documents/<documentId>/preview
```

Assert download href still uses `downloadUrl` for now.

Add route tests or smoke tests for legacy preview routes:

- `GET /api/documents/preview?url=https://example.com/file.pdf` returns `410` or `400` and does not fetch the URL.

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @medical-crm/admin test -- case-overview-tab.test.tsx
pnpm --filter @medical-crm/hospital test -- case-detail-panel-documents.test.tsx
```

Expected: FAIL until links are changed.

- [ ] **Step 3: Add Next route handlers**

Do not use `createParamQueryHandler` because the existing helpers are JSON-oriented. Create bespoke binary streaming route handlers in both apps.

Each route should:

1. Resolve `params`.
2. Call `apiFetch('/api/v2/cases/:id/documents/:docId/preview')`.
3. If not ok, return JSON error with upstream status.
4. If ok, return `new Response(upstream.body, { status, headers })`.
5. Preserve only safe upstream headers: `Content-Type`, `Content-Disposition`, `Cache-Control`.

The route proxies to:

```text
/api/v2/cases/:id/documents/:docId/preview
```

- [ ] **Step 4: Disable or lock down legacy arbitrary URL preview routes**

For both:

- `apps/admin/src/app/api/documents/preview/route.ts`
- `apps/hospital/src/app/api/documents/preview/route.ts`

Replace arbitrary `url` fetching with:

```ts
export async function GET(): Promise<Response> {
  return Response.json(
    { error: 'Legacy URL preview is disabled. Use case document preview routes.' },
    { status: 410 },
  );
}
```

Do not leave any server-side fetch of a user-supplied URL in these routes.

- [ ] **Step 5: Update links**

Admin:

```ts
const previewHref = `/api/cases/${caseId}/documents/${row.id}/preview`;
```

Hospital:

```ts
const previewHref = `/api/cases/${caseDetail.id}/documents/${doc.id}/preview`;
```

Guard message-attachment pseudo-documents: if `doc.id.startsWith('message-attachment:')`, keep using the existing signed `downloadUrl` for now or hide the document-tab eye button until a real attachment preview route is added. Do not send pseudo ids to the case document preview route.

- [ ] **Step 6: Run frontend tests**

```bash
pnpm --filter @medical-crm/admin test -- case-overview-tab.test.tsx
pnpm --filter @medical-crm/hospital test -- case-detail-panel-documents.test.tsx
pnpm --filter @medical-crm/admin typecheck
pnpm --filter @medical-crm/hospital typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/api/cases/[id]/documents/[docId]/preview/route.ts \
  apps/hospital/src/app/api/cases/[id]/documents/[docId]/preview/route.ts \
  apps/admin/src/app/api/documents/preview/route.ts \
  apps/hospital/src/app/api/documents/preview/route.ts \
  apps/admin/src/components/tabs/case-overview-tab.tsx \
  apps/hospital/src/components/case-detail-panel.tsx \
  apps/admin/src/__tests__/case-overview-tab.test.tsx \
  apps/hospital/src/__tests__/case-detail-panel-documents.test.tsx
git commit -m "fix(documents): open case files through authorized preview"
```

## Chunk 5: Integration, Configuration, and Verification

### Task 13: Add environment documentation and deployment notes

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/deployment/crm-v2-deploy-script.md`

- [ ] **Step 1: Add env vars**

Document:

```text
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
EMAIL_REPLY_DOMAIN=medicaltourismchina.health
EMAIL_REPLY_LOCAL_PART=reply
EMAIL_REPLY_SUBDOMAIN=reply.medicaltourismchina.health
EMAIL_REPLY_TOKEN_TTL_DAYS=180
INBOUND_EMAIL_ENABLED=false
```

- [ ] **Step 2: Add Resend setup notes**

Include:

- Configure Resend Inbound DNS for `medicaltourismchina.health` or `reply.medicaltourismchina.health`.
- Subscribe webhook to `email.received`.
- Store webhook signing secret as `RESEND_WEBHOOK_SECRET`.
- Turn `INBOUND_EMAIL_ENABLED=true` only after staging E2E passes.

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md docs/deployment/crm-v2-deploy-script.md
git commit -m "docs(email): document resend inbound setup"
```

### Task 14: Full verification pass

**Files:**
- No planned source changes unless verification exposes defects.

- [ ] **Step 1: Run targeted package tests**

```bash
pnpm --filter @medical-crm/domain test
pnpm --filter @medical-crm/application test
pnpm --filter @medical-crm/infrastructure test
pnpm --filter @medical-crm/api test
pnpm --filter @medical-crm/admin test
pnpm --filter @medical-crm/hospital test
```

Expected: PASS or documented pre-existing unrelated failures.

- [ ] **Step 2: Run typechecks**

```bash
pnpm --filter @medical-crm/domain typecheck
pnpm --filter @medical-crm/application typecheck
pnpm --filter @medical-crm/infrastructure typecheck
pnpm --filter @medical-crm/api typecheck
pnpm --filter @medical-crm/admin typecheck
pnpm --filter @medical-crm/hospital typecheck
```

Expected: PASS.

- [ ] **Step 3: Run integrated test command if targeted tests pass**

```bash
pnpm test
```

Expected: PASS or documented pre-existing failures unrelated to this change.

- [ ] **Step 4: Manual staging checklist**

Do this only after Resend inbound DNS/webhook config exists:

- Send admin message to test patient; verify email has `From: customer@medicaltourismchina.health` and tokenized `Reply-To`.
- Reply with text; verify message appears in admin-patient thread.
- Upload hospital invitation or diagnosis document; verify email has hospital-thread `Reply-To`.
- Reply with text and PDF attachment; verify message appears in uploading hospital's hospital-patient thread.
- Attach two hospitals to a case; verify reply to hospital A document notification does not appear in hospital B thread.
- Open PDF/image from admin case document tab.
- Open PDF/image from hospital case document tab and invitation tab.

- [ ] **Step 5: Final commit if fixes were needed**

Only commit if verification required source fixes. Use `git status --short` and explicitly list changed paths in `git add`; do not stage unrelated worktree changes.

Example for a route-only verification fix:

```bash
git status --short
git add apps/api/src/routes/resend-inbound.routes.ts apps/api/src/__tests__/resend-inbound.routes.test.ts
git commit -m "fix(email): address inbound verification issues"
```

## Execution Notes

- The current repository already has unrelated uncommitted changes. Do not stage or revert them.
- Keep commits small as listed above.
- Use `rg` before editing any file that may already have parallel changes.
- Do not enable production inbound processing until Resend DNS, webhook signing, and staging manual tests are complete.
- If Resend payload fields differ from docs, adapt only the `ResendInboundService`; keep application use cases provider-neutral.
