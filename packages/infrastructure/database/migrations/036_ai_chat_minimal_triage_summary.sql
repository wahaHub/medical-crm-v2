ALTER TABLE ai_chat_sessions
ADD COLUMN IF NOT EXISTS minimal_triage_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE ai_chat_sessions
ADD COLUMN IF NOT EXISTS minimal_triage_answers_summary TEXT;
