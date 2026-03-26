DO $$
BEGIN
  ALTER TYPE "TicketType" ADD VALUE IF NOT EXISTS 'AI_ESCALATION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) NOT NULL,
  session_secret_hash VARCHAR(255),
  dify_conversation_id VARCHAR(255),
  patient_id UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  hospital_type "HospitalType" NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_chat_sessions_session_id_key UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS ai_chat_sessions_session_id_idx
  ON ai_chat_sessions (session_id);

CREATE INDEX IF NOT EXISTS ai_chat_sessions_dify_conversation_id_idx
  ON ai_chat_sessions (dify_conversation_id);

CREATE INDEX IF NOT EXISTS ai_chat_sessions_patient_id_idx
  ON ai_chat_sessions (patient_id);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  intent VARCHAR(20),
  risk_level VARCHAR(20),
  can_answer BOOLEAN,
  next_action VARCHAR(50),
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_chat_messages_session_id_idx
  ON ai_chat_messages (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dify_document_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_key VARCHAR(255) NOT NULL,
  dify_dataset_id VARCHAR(255) NOT NULL,
  dify_document_id VARCHAR(255) NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dify_document_mappings_entity_key_unique UNIQUE (entity_type, entity_key)
);

CREATE INDEX IF NOT EXISTS dify_document_mappings_dataset_doc_idx
  ON dify_document_mappings (dify_dataset_id, dify_document_id);

CREATE TABLE IF NOT EXISTS ai_sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_key VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_sync_outbox_pending_idx
  ON ai_sync_outbox (status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS ai_sync_outbox_entity_idx
  ON ai_sync_outbox (entity_type, entity_key);
