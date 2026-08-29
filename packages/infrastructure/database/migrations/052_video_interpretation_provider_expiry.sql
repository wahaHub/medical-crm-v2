-- Adds the monotonic consent epoch used to prevent stale grants, and supports
-- bounded, idempotent recovery of provider fences whose server-owned expiry
-- has elapsed. application_deadline_at remains an input cutoff only and is
-- deliberately not used as provider-closure evidence.
ALTER TABLE video_consultation_ai_consents
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;

DO $$
BEGIN
  ALTER TABLE video_consultation_ai_consents
    ADD CONSTRAINT video_consultation_ai_consents_version_positive CHECK (version > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS video_consultation_provider_sessions_provider_expiry_idx
  ON video_consultation_provider_sessions (provider_expires_at)
  WHERE state IN ('CREATING', 'ACTIVE', 'CLOSING', 'ORPHAN_WAIT')
    AND provider_expires_at IS NOT NULL;
