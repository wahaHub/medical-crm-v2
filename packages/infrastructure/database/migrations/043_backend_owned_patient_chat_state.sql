ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS automation_mode text NOT NULL DEFAULT 'mechanical';

ALTER TABLE ai_chat_sessions
  DROP CONSTRAINT IF EXISTS ai_chat_sessions_automation_mode_check;

ALTER TABLE ai_chat_sessions
  ADD CONSTRAINT ai_chat_sessions_automation_mode_check
  CHECK (automation_mode IN ('mechanical', 'ai', 'human'));

CREATE INDEX IF NOT EXISTS ai_chat_sessions_automation_mode_idx
  ON ai_chat_sessions (automation_mode, updated_at DESC);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_delivery_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN ('pending', 'uploading', 'sent', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_client_message_id_idx
  ON messages (conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
