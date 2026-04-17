-- Rollout order for canonical chatbot truth flags:
-- 1. Deploy read paths that fall back to legacy status fields.
-- 2. Deploy write paths that set these booleans on deterministic actions.
-- 3. Backfill legacy sessions after step 2 if historical queries need explicit booleans.
-- 4. Remove fallback assumptions only after the backfill is stable in production.

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS minimal_triage_complete BOOLEAN,
  ADD COLUMN IF NOT EXISTS recommendation_generated BOOLEAN,
  ADD COLUMN IF NOT EXISTS recommendation_selected BOOLEAN,
  ADD COLUMN IF NOT EXISTS consult_completed BOOLEAN,
  ADD COLUMN IF NOT EXISTS handoff_active BOOLEAN;
