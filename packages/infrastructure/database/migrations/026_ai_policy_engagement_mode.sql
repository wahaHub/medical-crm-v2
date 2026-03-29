ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS engagement_mode VARCHAR(30) NOT NULL DEFAULT 'LIGHT_DISCOVERY',
  ADD COLUMN IF NOT EXISTS prequalification_reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS entered_deep_workflow_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ai_chat_sessions_engagement_mode_idx
  ON ai_chat_sessions (engagement_mode, updated_at DESC);
