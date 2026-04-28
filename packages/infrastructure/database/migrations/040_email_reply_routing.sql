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
