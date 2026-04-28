# Reply-To Email Routing and Case Document Access Design

Date: 2026-04-28
Status: Approved for planning

## Context

The CRM supports admin and hospital portals. Patients use the China frontend at `medical-china-comb/china-medical-journeys`, while staff use `medical-crm-v2`.

Two changes are needed:

1. Documents in the case detail document tabs cannot reliably open from the admin and hospital portals.
2. Patient notification emails should become replyable. When a patient replies by email, the reply text and attachments should be written into the correct CRM message thread.

The approved product decision is:

- Outbound patient-facing emails use one sender identity: `customer@medicaltourismchina.health`.
- Admin and hospital replies are both routed by `Reply-To`, not by `From`.
- Resend Inbound will receive reply emails.
- Patient replies to hospital document upload emails enter the corresponding `HOSPITAL_PATIENT` conversation.

## Goals

- Patients can reply directly to relevant emails instead of opening the dashboard first.
- Reply text becomes a CRM message from the patient.
- Reply attachments become CRM message attachments.
- Admin-originated messages route into the `ADMIN_PATIENT` conversation.
- Hospital-originated messages and hospital document-upload notifications route into the relevant `HOSPITAL_PATIENT` conversation.
- Case document open/download actions work from both admin and hospital case detail pages.
- The implementation follows existing message, storage, notification, and upload policy boundaries.

## Non-Goals

- Do not create individual sending mailboxes for each admin or hospital.
- Do not infer reply routing from the visible `From` address.
- Do not build a full mailbox UI.
- Do not let unknown inbound emails create cases or conversations.
- Do not expose raw storage keys or bypass existing case/conversation access checks.

## Recommended Approach

Use a tokenized `Reply-To` address on every replyable outbound email:

```text
From: Medora Care Team <customer@medicaltourismchina.health>
Reply-To: Medora Reply <reply+<token>@medicaltourismchina.health>
```

Resend Inbound routes received mail to a webhook with structured fields including recipients. The implementation should prefer `reply+<token>@medicaltourismchina.health` if the configured receiving domain preserves plus addressing in the `to` field. If production DNS or Resend configuration cannot preserve plus addressing on the root domain, use an inbound subdomain and encode the token as the full local part:

```text
Reply-To: Medora Reply <<token>@reply.medicaltourismchina.health>
```

Both formats should be parsed by the same token extractor, but production should enable exactly one format after DNS verification.

The token maps to a server-side record containing:

- `conversationId`
- `caseId`
- `patientId`
- `channel`: `ADMIN_PATIENT` or `HOSPITAL_PATIENT`
- `hospitalId`, when the target channel is hospital-scoped
- `sourceKind`: message, case update, document upload, quote, consultation, or future notification type
- `sourceId`, when applicable
- `patientEmail`
- `expiresAt`
- `status`

The `From` address expresses trust and brand identity. The `Reply-To` token expresses routing authority.

## Architecture

### Outbound Email

Add a reply-routing service in the application layer. Before a patient-facing email is sent, the notification use case asks this service to create or reuse a reply token for the target conversation.

For admin messages:

- Source event: admin sends a message in `ADMIN_PATIENT`.
- Reply token target: the same `ADMIN_PATIENT` conversation.
- Patient reply: written as `PATIENT` into that conversation.

For hospital messages:

- Source event: hospital sends a message in `HOSPITAL_PATIENT`.
- Reply token target: the same `HOSPITAL_PATIENT` conversation.
- Patient reply: written as `PATIENT` into that conversation.

For hospital document uploads:

- Source event: hospital uploads diagnosis, invitation letter, or other case document and triggers a patient notification.
- Reply token target: the uploading hospital's `HOSPITAL_PATIENT` conversation for that case.
- The hospital id must come from the authenticated hospital actor that initiated the upload, not from the case alone.
- The document notification endpoint must receive or derive `hospitalId` from the authenticated session and persist it in the reply token.
- If multiple hospitals are attached to the case, only the uploading hospital's conversation is eligible for this token.
- If the case is distributed to a hospital but no `HOSPITAL_PATIENT` conversation exists yet, create or retrieve the conversation for `caseId + patientId + hospitalId` before sending the email.
- If a document upload is initiated by admin rather than a hospital, it should not create a hospital-routed reply token unless admin explicitly chooses a target hospital; otherwise route to `ADMIN_PATIENT`.

Replyable document notifications should initially be limited to patient-visible document types:

- `INVITATION`
- `DIAGNOSIS`
- `QUOTE`, if quote document notifications are sent through the same path

Other internal or ambiguous document types should not get a reply token until they are explicitly marked patient-visible.

Email templates should replace "Please do not reply directly to this message" with copy that allows direct replies, for example: "You can reply directly to this email. Your message and attachments will be added to your Medora case."

### Inbound Email

Add a Resend inbound webhook endpoint under the CRM API. The endpoint should:

1. Verify the Resend webhook signature.
2. Parse recipient addresses and find `reply+<token>@medicaltourismchina.health`.
3. Look up the token record.
4. Claim the inbound event idempotently before writing any message.
5. Validate token status, expiry, patient email, conversation, and case.
6. Validate available inbound email authentication metadata from Resend, including SPF/DKIM/DMARC results when present in the payload or headers.
7. Clean the email body by removing quoted previous messages where possible.
8. Upload inbound attachments through the existing message attachment storage policy.
9. Call the existing message write path so the reply appears like a patient message.
10. Broadcast websocket updates using the same behavior as portal-sent patient messages.
11. Record the inbound Resend event/message id for idempotency.

If validation fails, the webhook should acknowledge the event but record a structured failure for operators. It should not create messages from unknown or invalid emails.

### Persistence

Add a table for reply routing tokens, for example `email_reply_tokens`:

- `id`
- `tokenHash`
- `conversationId`
- `caseId`
- `patientId`
- `patientEmail`
- `channel`
- `hospitalId`
- `sourceKind`
- `sourceId`
- `expiresAt`
- `status`
- `createdAt`
- `lastUsedAt`

Constraints:

- Unique `tokenHash`.
- Foreign keys to conversation, case, and patient records.
- Nullable `hospitalId`, required when `channel = HOSPITAL_PATIENT`.

Add a table for inbound email processing, for example `inbound_email_events`:

- `id`
- `provider`: `resend`
- `providerEventId`
- `providerMessageId`
- `replyTokenId`
- `conversationId`
- `caseId`
- `fromEmail`
- `subject`
- `status`
- `error`
- `createdMessageId`
- `createdAt`

Constraints:

- Unique `(provider, providerEventId)` when `providerEventId` is present.
- Unique `(provider, providerMessageId)` when `providerMessageId` is present.
- The webhook should insert or claim this row in a transaction before message creation. If another worker already claimed it, return success without writing a duplicate message.

Store only metadata needed for idempotency, routing, and debugging. Avoid storing entire raw email payloads unless explicitly needed and protected.

### Attachment Handling

Inbound attachments should be normalized to the same shape used by existing CRM message attachments:

- `storageKey`
- `fileName`
- `mimeType`
- `fileSize`

The upload path should use the existing `message_attachment` policy and storage routing. Unsupported or oversized attachments should be skipped with a clear event error, without dropping the text reply if the text is valid.

### Document Tab Access

Admin and hospital document tabs currently render links directly from `downloadUrl`. Signed URLs can fail to open inline depending on the storage backend, response headers, browser behavior, or expired URLs.

Do not use a long-term preview API that accepts arbitrary `?url=<signedUrl>` input. That pattern is only acceptable as a temporary local helper because it can become an SSRF and authorization bypass risk.

Add or refactor to a document lookup preview endpoint that accepts an internal resource id, checks authorization, signs the storage key server-side, fetches the file, and returns it with inline content disposition.

Recommended routes:

- Admin app: `/api/cases/:caseId/documents/:documentId/preview`
- Hospital app: `/api/cases/:caseId/documents/:documentId/preview`
- Shared CRM API backing route: `/api/v2/cases/:caseId/documents/:documentId/preview`

The route must:

- Authenticate the current admin or hospital user.
- Load the document by id and verify it belongs to `caseId`.
- Reuse existing case access checks, including hospital access through case-hospital contacts.
- Sign the document storage key with the routed storage service.
- Fetch only allowed storage hosts or, preferably, stream directly from the storage adapter if supported.
- Return `Content-Disposition: inline`.
- Reject message-attachment pseudo-documents unless a separate attachment preview route validates the parent conversation and message.

Apply this consistently to:

- Admin case overview documents card
- Hospital case documents tab
- Hospital invitation letter file view
- Any shared attachment preview entry points that already need inline viewing

Download actions may keep using the signed URL if direct download works and access is already authorized through the document listing response. If direct download behavior still varies by backend, add a sibling download route with `Content-Disposition: attachment`.

## Error Handling

- Missing token: record `TOKEN_NOT_FOUND`, acknowledge webhook, do not write a message.
- Expired token: record `TOKEN_EXPIRED`, acknowledge webhook, do not write a message.
- Sender mismatch: record `SENDER_MISMATCH`, acknowledge webhook, do not write a message.
- Email authentication failure: record `EMAIL_AUTH_FAILED`, acknowledge webhook, do not write a message.
- Conversation missing or unauthorized: record `CONVERSATION_INVALID`, acknowledge webhook, do not write a message.
- Duplicate event: return success without creating a second message.
- Attachment upload failure: write the text reply when possible, record attachment-level failures.
- Empty reply after cleanup and no attachments: record `EMPTY_REPLY`, do not create a message.

## Security

- Tokens must be random, high entropy, and stored hashed.
- Webhook signature verification is required.
- The sender email must match the token's patient email after normalization.
- The implementation must inspect Resend-provided authentication data or raw headers for SPF/DKIM/DMARC results when available. Accept only authenticated mail by default; if Resend does not expose a normalized auth result, document the header fields used and fail closed for clear failures.
- Forwarded messages and aliases should not bypass sender validation in the first version. A later iteration can add verified alternate patient emails.
- Reply tokens must never authorize access to another patient's case.
- Inbound attachments must pass existing size and mime-type policy checks.
- Logs should avoid raw PHI; include ids and short error codes instead.

## Testing

Unit tests:

- Reply token creation and hashing.
- Notification service passes reply routing context.
- Email services include `Reply-To` when provided.
- Inbound webhook validates token, sender, expiry, and idempotency.
- Inbound webhook rejects sender mismatch and failed email authentication.
- Inbound parser strips common quoted reply text.
- Attachment normalization and unsupported attachment handling.

Route/use-case tests:

- Admin message email reply lands in `ADMIN_PATIENT`.
- Hospital message email reply lands in `HOSPITAL_PATIENT`.
- Hospital document-upload reply lands in `HOSPITAL_PATIENT`.
- Duplicate Resend event does not create duplicate messages.
- Invalid token and sender mismatch do not create messages.
- Multiple hospitals attached to one case still route a document-upload reply to the uploading hospital only.
- Admin-uploaded document notifications route to `ADMIN_PATIENT` unless an explicit target hospital is supplied.

Frontend tests:

- Admin document open link uses id-based preview route.
- Hospital document open link uses id-based preview route.
- Hospital invitation letter open link uses id-based preview route.
- Download controls still point to a usable file URL.

Manual verification:

- Send an admin message to a patient, reply with text, confirm it appears in admin case messages.
- Send/upload a hospital document notification, reply with text and attachment, confirm it appears in the hospital-patient thread.
- Open PDF/image documents from admin and hospital case detail pages.

## Rollout

1. Add persistence and backend token service.
2. Add `Reply-To` support to email service interfaces and Resend/SMTP implementations.
3. Wire reply tokens into patient-facing notification emails.
4. Add Resend inbound webhook endpoint in disabled or logging-only mode.
5. Enable message creation for verified inbound replies.
6. Add id-based document preview routes and switch document open actions to them.
7. Configure Resend inbound DNS/routing for either plus-addressed `reply+token@medicaltourismchina.health` or token-local-part `<token>@reply.medicaltourismchina.health`.
8. Run end-to-end checks in staging before enabling production inbound processing.

## Open Questions for Implementation Planning

- How long reply tokens should remain valid. A practical default is 180 days for case communications.
- Whether operators need a small admin-only inbound email failure list in a later iteration.
