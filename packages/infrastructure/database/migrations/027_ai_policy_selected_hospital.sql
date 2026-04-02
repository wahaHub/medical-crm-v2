ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS selected_hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS ai_chat_sessions_selected_hospital_id_idx
  ON ai_chat_sessions (selected_hospital_id, updated_at DESC);
