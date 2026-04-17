-- Repair rows created by an older 031 rollout that materialized canonical truth flags as FALSE.
-- This is safe and idempotent: it only upgrades rows to TRUE when legacy deterministic statuses
-- already prove the canonical truth and leaves all other rows unchanged.

UPDATE ai_chat_sessions
SET minimal_triage_complete = TRUE
WHERE minimal_triage_complete IS DISTINCT FROM TRUE
  AND (
    UPPER(COALESCE(form_status, '')) IN ('COMPLETED', 'SUBMITTED')
    OR UPPER(COALESCE(doc_upload_status, '')) IN ('COMPLETED', 'SUBMITTED', 'READY')
  );

UPDATE ai_chat_sessions
SET recommendation_selected = TRUE
WHERE recommendation_selected IS DISTINCT FROM TRUE
  AND (
    UPPER(COALESCE(recommendation_status, '')) IN ('CONFIRMED', 'ACCEPTED')
    OR UPPER(COALESCE(package_status, '')) IN ('CONFIRMED', 'ACCEPTED')
    OR UPPER(COALESCE(consultation_status, '')) IN ('SCHEDULED', 'BOOKED', 'COMPLETED')
  );

UPDATE ai_chat_sessions
SET recommendation_generated = TRUE
WHERE recommendation_generated IS DISTINCT FROM TRUE
  AND (
    UPPER(COALESCE(recommendation_status, '')) IN ('CONFIRMED', 'ACCEPTED')
    OR UPPER(COALESCE(package_status, '')) IN ('CONFIRMED', 'ACCEPTED')
    OR UPPER(COALESCE(consultation_status, '')) IN ('SCHEDULED', 'BOOKED', 'COMPLETED')
    OR (
      UPPER(COALESCE(recommendation_status, '')) <> ''
      AND UPPER(COALESCE(recommendation_status, '')) <> 'NOT_STARTED'
    )
    OR (
      UPPER(COALESCE(package_status, '')) <> ''
      AND UPPER(COALESCE(package_status, '')) NOT IN ('NOT_INTRODUCED', 'NOT_STARTED')
    )
  );

UPDATE ai_chat_sessions
SET consult_completed = TRUE
WHERE consult_completed IS DISTINCT FROM TRUE
  AND UPPER(COALESCE(consultation_status, '')) = 'COMPLETED';

UPDATE ai_chat_sessions
SET handoff_active = TRUE
WHERE handoff_active IS DISTINCT FROM TRUE
  AND UPPER(COALESCE(handoff_status, '')) IN ('REQUESTED', 'OPEN', 'IN_PROGRESS');
