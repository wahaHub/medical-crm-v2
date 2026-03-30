ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS condition_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS form_status VARCHAR(20) NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS doc_upload_status VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recommendation_status VARCHAR(30) NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS consultation_status VARCHAR(30) NOT NULL DEFAULT 'not_introduced',
  ADD COLUMN IF NOT EXISTS package_status VARCHAR(30) NOT NULL DEFAULT 'not_introduced',
  ADD COLUMN IF NOT EXISTS handoff_status VARCHAR(20) NOT NULL DEFAULT 'not_needed',
  ADD COLUMN IF NOT EXISTS lead_maturity VARCHAR(20) NOT NULL DEFAULT 'browsing',
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS trust_or_objection VARCHAR(30) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS pending_offer_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS pending_offer_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_question_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS pending_question_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_next_action VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_resolved_intent VARCHAR(80),
  ADD COLUMN IF NOT EXISTS conversation_summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_policy_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_user_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_assistant_message_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ai_chat_sessions_handoff_status_idx
  ON ai_chat_sessions (handoff_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_chat_sessions_lead_maturity_idx
  ON ai_chat_sessions (lead_maturity, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_chat_sessions_risk_level_idx
  ON ai_chat_sessions (risk_level, updated_at DESC);

ALTER TABLE ai_chat_messages
  ALTER COLUMN intent TYPE VARCHAR(80);

ALTER TABLE ai_chat_messages
  ADD COLUMN IF NOT EXISTS resolved_intent VARCHAR(80),
  ADD COLUMN IF NOT EXISTS secondary_action VARCHAR(50),
  ADD COLUMN IF NOT EXISTS response_mode VARCHAR(40),
  ADD COLUMN IF NOT EXISTS reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shortlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS writeback_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tool_trace JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE ai_chat_messages
SET
  intent = COALESCE(intent, resolved_intent),
  next_action = COALESCE(next_action, secondary_action)
WHERE intent IS NULL OR next_action IS NULL;

CREATE INDEX IF NOT EXISTS ai_chat_messages_next_action_idx
  ON ai_chat_messages (next_action);

CREATE INDEX IF NOT EXISTS ai_chat_messages_role_created_at_idx
  ON ai_chat_messages (role, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anonymous_key VARCHAR(255),
  condition_or_goal TEXT,
  condition_category VARCHAR(50),
  preferred_destination JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_language VARCHAR(20),
  budget_band VARCHAR(20),
  urgency_level VARCHAR(20),
  existing_reports_status VARCHAR(20) NOT NULL DEFAULT 'none',
  objection_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  lead_stage VARCHAR(20) NOT NULL DEFAULT 'browsing',
  next_best_action VARCHAR(50),
  memory_summary TEXT NOT NULL DEFAULT '',
  source_confidence_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_user_profiles_patient_id_key UNIQUE (patient_id),
  CONSTRAINT ai_user_profiles_anonymous_key_key UNIQUE (anonymous_key)
);

CREATE INDEX IF NOT EXISTS ai_user_profiles_lead_stage_idx
  ON ai_user_profiles (lead_stage);

CREATE INDEX IF NOT EXISTS ai_user_profiles_updated_at_idx
  ON ai_user_profiles (updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor VARCHAR(20) NOT NULL,
  confidence NUMERIC(5, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_chat_timeline_events_session_id_idx
  ON ai_chat_timeline_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_chat_timeline_events_event_type_idx
  ON ai_chat_timeline_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_chat_timeline_events_patient_id_idx
  ON ai_chat_timeline_events (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_followup_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  trigger_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'crm_queue',
  reason TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_followup_triggers_status_due_at_idx
  ON ai_followup_triggers (status, due_at);

CREATE INDEX IF NOT EXISTS ai_followup_triggers_trigger_status_idx
  ON ai_followup_triggers (trigger_type, status);

CREATE INDEX IF NOT EXISTS ai_followup_triggers_patient_due_at_idx
  ON ai_followup_triggers (patient_id, due_at);

CREATE UNIQUE INDEX IF NOT EXISTS ai_followup_triggers_pending_unique_idx
  ON ai_followup_triggers (session_id, trigger_type)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS ai_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  support_ticket_id UUID REFERENCES support_tickets(id) ON DELETE SET NULL,
  handoff_type VARCHAR(40) NOT NULL,
  priority VARCHAR(20) NOT NULL,
  reason_code VARCHAR(60) NOT NULL,
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'requested',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_handoffs_status_priority_idx
  ON ai_handoffs (status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_handoffs_handoff_type_idx
  ON ai_handoffs (handoff_type, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_handoffs_patient_id_idx
  ON ai_handoffs (patient_id, created_at DESC);
