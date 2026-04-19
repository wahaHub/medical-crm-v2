ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS recommendation_selection_status TEXT,
  ADD COLUMN IF NOT EXISTS recommendation_selected_hospital_ids JSONB;
