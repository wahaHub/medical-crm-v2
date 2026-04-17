ALTER TABLE ai_chat_sessions
  DROP CONSTRAINT IF EXISTS ai_chat_sessions_session_id_key;

DROP INDEX IF EXISTS ai_chat_sessions_session_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ai_chat_sessions_session_id_site_key
  ON ai_chat_sessions USING btree (session_id text_ops, site enum_ops);
