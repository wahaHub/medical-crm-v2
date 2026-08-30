-- Consent recording admits only identities that are currently in the room,
-- the canonical host, or the authenticated operator. Production historically
-- received this table outside tracked SQL migrations; keep this migration
-- idempotent for both an existing deployment and the video-only staging schema.

CREATE TABLE IF NOT EXISTS video_consultation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES video_consultations(id) ON DELETE CASCADE,
  identity text NOT NULL,
  display_name text,
  role text CHECK (role IS NULL OR role IN ('PATIENT', 'DOCTOR', 'COORDINATOR', 'GUEST')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS video_consultation_participants_active_idx
  ON video_consultation_participants (consultation_id, identity)
  WHERE left_at IS NULL;
