# China Admin / Patient Email Notification Design

Date: 2026-04-18
Status: Design approved for spec handoff
Scope: `medical-crm-v2` notification flow for China patient intake, AI handoff, and admin-patient messaging
Audience: CRM backend owners, admin portal owners, chatbot owners, email/inbound processing owners

## 1. Goal

Add a reliable email notification layer around the China intake and messaging flow without splitting the source of truth away from CRM conversations.

The system must cover three outcomes:

- when a new China patient creates a new CRM case, all admins receive an alert email
- when the AI chatbot successfully hands the conversation off to a human path, all admins receive an alert email
- when a human admin replies to a patient, the patient can receive a batched email update and can reply directly by email back into the same CRM conversation

The design must keep email as a delivery channel, not as a second conversation system. Website chat and email replies must land in the same `ADMIN_PATIENT` CRM thread.

## 2. Product Decisions Locked In

The following rules are explicitly approved and are not open during implementation unless product direction changes:

- patient-facing admin reply emails use a `10 minute` batching window
- only human admin messages are eligible for patient notification emails
- mirrored AI chatbot messages must never trigger patient notification emails
- if the patient replies before the pending digest is sent, the pending digest is cancelled
- patient email replies use `reply-by-email`, not an interactive widget embedded inside the email
- inbound email replies are accepted only when both conditions pass:
  - the reply token is valid
  - the sender email exactly matches the patient email stored in CRM

## 3. Why Email Widget Is Not The Primary Design

An actual chat widget inside email is not the recommended path.

Reasons:

- major email clients heavily restrict interactive behavior
- deliverability and rendering consistency are worse than standard transactional email
- authentication and session semantics become fragile
- reply-by-email is much more natural for users and much easier to keep consistent with CRM threads

The patient-facing email should instead render like a conversation summary and clearly state that replying to the email continues the chat with the admin team.

## 4. Architecture Overview

The feature is split into four bounded units.

### 4.1 Admin Alert Notifier

Purpose:

- send immediate event emails to all admins for:
  - new China case created
  - AI handoff completed

Responsibilities:

- accept business events
- look up current admin recipients
- send one alert per recipient
- enforce event-level idempotency

Non-goals:

- batching patient-facing replies
- processing inbound patient replies

### 4.2 Patient Reply Digest Scheduler

Purpose:

- batch human admin replies into a single patient-facing email

Responsibilities:

- detect eligible admin messages in `ADMIN_PATIENT` conversations
- create or update a single pending digest job per conversation
- extend the send deadline while the admin keeps sending messages inside the window
- cancel pending jobs when the patient replies before send time

Non-goals:

- sending admin event alerts
- parsing inbound email replies

### 4.3 Inbound Reply Processor

Purpose:

- convert patient email replies back into the same CRM conversation used by website chat

Responsibilities:

- verify the reply alias / token
- verify sender email against the CRM patient email
- strip quoted history, signatures, and empty noise
- create a patient message in the matching `ADMIN_PATIENT` conversation
- cancel any pending digest for that conversation

Non-goals:

- interpreting AI messages
- sending outbound digest emails

### 4.4 Conversation Email Renderer

Purpose:

- generate patient-facing conversation update emails and admin alert emails in a consistent transactional format

Responsibilities:

- render recent conversation history
- show the latest admin messages included in the digest
- expose a reply-by-email address through the outbound `reply-to`
- render clear call-to-action links back into the website / CRM when needed

Non-goals:

- maintaining delivery state
- parsing replies

## 5. Core Flows

### 5.1 New China Case -> All Admins

Trigger:

- a new case is successfully created for a China patient during onboarding or chatbot conversion

Recommended hook:

- after `InitOnboardingUseCase` successfully persists the new `Case` and ensures the `ADMIN_PATIENT` conversation

Behavior:

- emit a `china.case.created` style internal event
- resolve all current admin emails from the CRM user repository
- send one alert email to each admin
- record an idempotency key so the same case does not generate duplicate alert emails on retry

Email payload should include:

- patient name
- case number
- source site (`China`)
- condition / request summary when available
- direct link to the case and conversation inside CRM

### 5.2 AI Handoff -> All Admins

Trigger:

- a handoff is considered real only when CRM successfully creates the human-support artifact, not when the model merely suggests a handoff intent

Recommended hook:

- chatbot v2: after `POST /api/v2/chatbot/escalate` successfully creates the ticket and updates the session state
- chatbot v3: after the runtime actually creates the handoff / escalation ticket

Behavior:

- emit a `china.chatbot.handoff.created` style event
- send immediate alert emails to all admins
- dedupe by `ticketId` or handoff idempotency key

Email payload should include:

- patient
- case
- ticket id
- handoff reason summary
- recent conversation context
- direct CRM links

### 5.3 Human Admin Reply -> Patient Digest

Trigger:

- a human admin sends a message into an `ADMIN_PATIENT` conversation

Eligibility:

- sender must be a real admin user
- sender must not be an AI mirrored message
- conversation must belong to a valid patient / case pair

Behavior:

- if no pending digest job exists for the conversation, create one
- if one already exists, update the same pending job
- set or refresh `send_after = last_human_admin_message_at + 10 minutes`
- track the message window that will be included in the digest

Send behavior:

- a worker processes due digest jobs
- it loads all eligible admin messages since `window_started_at`
- it renders one patient email with those messages grouped together
- it sends the email with a secure `reply-to` alias
- it marks the job `SENT`

Cancellation:

- if the patient replies via website or inbound email before `send_after`, mark the job `CANCELLED`

### 5.4 Patient Reply By Email -> CRM Conversation

Trigger:

- inbound email provider webhook receives a reply addressed to a CRM-managed reply alias

Behavior:

1. parse reply alias / token
2. resolve target conversation and expected patient
3. verify:
   - token is valid
   - token is active
   - sender email exactly equals the patient email stored in CRM
4. extract only the newly authored body text
5. discard if the result is empty or automatic noise
6. create a `PATIENT` message in the same `ADMIN_PATIENT` conversation
7. cancel any pending digest job for that conversation

Result:

- admins see the email reply as a normal CRM patient message
- from the CRM thread perspective, website chat and email reply are equivalent channels

## 6. Data Model

This design adds two dedicated tables instead of overloading `cases` or `messages`.

### 6.1 `conversation_email_digest_jobs`

Purpose:

- track one pending or completed patient digest per conversation window

Suggested fields:

- `id`
- `conversation_id`
- `patient_id`
- `status` — `PENDING | CANCELLED | SENT | FAILED`
- `window_started_at`
- `send_after`
- `last_admin_message_at`
- `last_patient_message_at_snapshot`
- `message_count`
- `email_to`
- `sent_at`
- `cancelled_at`
- `failure_reason`
- `created_at`
- `updated_at`

Required constraint:

- at most one `PENDING` digest job per conversation

Reasoning:

- repeated admin sends should update the current window, not create a new pending email every time

### 6.2 `conversation_reply_tokens`

Purpose:

- bind a secure reply alias to a specific patient conversation

Suggested fields:

- `id`
- `conversation_id`
- `patient_id`
- `token_hash`
- `reply_alias`
- `expected_from_email`
- `status` — `ACTIVE | REVOKED | EXPIRED`
- `last_used_at`
- `expires_at`
- `created_at`
- `updated_at`

Rules:

- store token hashes, not raw tokens
- invalidate or rotate tokens when patient email changes
- optionally allow long-lived active tokens while the case remains active

## 7. Delivery And Channel Semantics

### 7.1 Admin Alerts

Admin alerts are event-driven and immediate.

Characteristics:

- one email per event
- no batching
- strong dedupe
- business flow must not roll back if email sending fails

### 7.2 Patient Digests

Patient digests are conversation-driven and delayed.

Characteristics:

- one pending digest window per conversation
- only human admin messages included
- 10-minute rolling window
- cancelled when patient becomes active first

### 7.3 Source Of Truth

CRM conversation messages remain the source of truth.

Implications:

- outbound emails are rendered from CRM messages
- inbound email replies become CRM messages
- no second transcript store is introduced for email-only conversation history

## 8. Security Rules

### 8.1 Inbound Reply Acceptance

Accept an inbound reply only if all checks pass:

- reply token resolves successfully
- reply token is active and not expired
- token maps to the expected conversation and patient
- `from` email exactly matches the CRM patient email
- extracted reply body is non-empty and not automatic noise

Reject and log otherwise.

### 8.2 Idempotency

Need idempotency at three levels:

- admin alert events:
  - dedupe by `caseId` or `ticketId` event key
- patient digest sends:
  - do not send the same pending job twice
- inbound email processing:
  - dedupe by provider inbound message id

### 8.3 Token Hygiene

- tokens are opaque
- tokens are hashed at rest
- old tokens can be revoked
- patient email change invalidates old inbound access

## 9. Failure Handling

### 9.1 Outbound Email Failure

Rules:

- case creation, handoff creation, and message send flows must succeed even when email delivery fails
- failed notifications are recorded as `FAILED` and become retryable
- failures are visible in logs and admin tooling

### 9.2 Inbound Parsing Failure

Rules:

- never create a CRM message from an unverified or unreadable inbound email
- store provider message id, sender, subject, and failure reason for debugging

### 9.3 Empty / Automatic Replies

Drop without writing to CRM when the reply is:

- empty after quoted-text removal
- vacation responder / auto responder
- purely quoted history without new content

## 10. Implementation Boundaries

The implementation should preserve clear ownership:

- domain and application:
  - digest job and reply token entities / ports / use cases
- API:
  - event hooks and inbound webhook routes
- infrastructure email services:
  - new email methods and templates
- admin / patient frontend:
  - no new major frontend feature is required for v1 beyond links in email content

This is intentionally backend-heavy. The patient experience change is mostly through email delivery and conversation continuity, not a new frontend surface.

## 11. Recommended Rollout Order

### Phase 1

`new case -> all admins`

Why first:

- highest internal visibility value
- smallest implementation risk
- no inbound or batching complexity

### Phase 2

`AI handoff -> all admins`

Why second:

- same event-alert pattern as phase 1
- still internal only
- validates handoff event boundaries before patient-facing email begins

### Phase 3

`human admin -> patient 10-minute digest`

Why third:

- first patient-facing outbound flow
- still outbound only
- validates batching and cancellation semantics

### Phase 4

`patient reply-by-email -> CRM`

Why fourth:

- most security-sensitive path
- requires inbound provider integration, parsing, and idempotency

## 12. Testing Strategy

### 12.1 Admin Alert Tests

- new China case sends one email to each admin
- retrying the same case event does not duplicate alerts
- successful business creation still succeeds if email delivery fails

### 12.2 Handoff Alert Tests

- actual handoff ticket creation sends one admin alert event
- repeated repair / retry path does not duplicate alerts

### 12.3 Patient Digest Tests

- one admin message creates a pending digest job
- multiple admin messages within 10 minutes still produce one email
- AI mirrored messages do not create or extend digest jobs
- patient website reply before send cancels the pending digest
- patient email reply before send also cancels the pending digest

### 12.4 Inbound Reply Tests

- valid token + valid sender email writes a patient message into the target conversation
- invalid token rejects and logs
- wrong sender email rejects and logs
- duplicate webhook only writes once
- empty or quoted-only reply does not create a message

## 13. Open Implementation Notes

The current CRM already has:

- admin email lookup capability
- email service abstraction with Resend / SMTP / stub implementations
- chatbot v2 and v3 handoff points
- `ADMIN_PATIENT` formal conversation model

The missing pieces are:

- generalized event notification use cases
- digest scheduling persistence and worker behavior
- inbound email webhook processing
- patient-facing email templates for conversation updates
- reply token lifecycle management

## 14. Recommendation

Implement this as an event-driven notification layer on top of the existing CRM conversation system.

Recommended default behavior:

- immediate admin alert emails for new case and AI handoff
- 10-minute patient digest for human admin replies
- reply-by-email back into the same CRM conversation
- strict token plus sender-email validation

This delivers the user experience product wants while keeping the CRM conversation thread authoritative and auditable.
