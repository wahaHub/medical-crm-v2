ALTER TABLE ai_chat_sessions
  ALTER COLUMN minimal_triage_complete DROP NOT NULL,
  ALTER COLUMN minimal_triage_complete DROP DEFAULT,
  ALTER COLUMN recommendation_generated DROP NOT NULL,
  ALTER COLUMN recommendation_generated DROP DEFAULT,
  ALTER COLUMN recommendation_selected DROP NOT NULL,
  ALTER COLUMN recommendation_selected DROP DEFAULT,
  ALTER COLUMN consult_completed DROP NOT NULL,
  ALTER COLUMN consult_completed DROP DEFAULT,
  ALTER COLUMN handoff_active DROP NOT NULL,
  ALTER COLUMN handoff_active DROP DEFAULT;
