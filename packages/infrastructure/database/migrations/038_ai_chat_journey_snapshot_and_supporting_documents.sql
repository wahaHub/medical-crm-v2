ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS journey_current_stage TEXT,
  ADD COLUMN IF NOT EXISTS journey_current_phase TEXT,
  ADD COLUMN IF NOT EXISTS supporting_documents JSONB;
