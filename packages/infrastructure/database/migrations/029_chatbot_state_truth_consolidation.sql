-- Destructive cleanup for fields retired by the chatbot truth-consolidation refactor.
-- Rollout requirement: deploy the CRM/API code that no longer reads these columns
-- to every running instance before applying this migration.

DROP INDEX IF EXISTS ai_chat_sessions_selected_hospital_id_idx;
DROP INDEX IF EXISTS ai_chat_sessions_lead_maturity_idx;

ALTER TABLE ai_chat_sessions
  DROP COLUMN IF EXISTS selected_hospital_id,
  DROP COLUMN IF EXISTS lead_maturity,
  DROP COLUMN IF EXISTS prequalification_reason_codes,
  DROP COLUMN IF EXISTS pending_offer_type,
  DROP COLUMN IF EXISTS pending_offer_payload,
  DROP COLUMN IF EXISTS pending_question_type,
  DROP COLUMN IF EXISTS pending_question_payload,
  DROP COLUMN IF EXISTS last_next_action,
  DROP COLUMN IF EXISTS last_resolved_intent;
