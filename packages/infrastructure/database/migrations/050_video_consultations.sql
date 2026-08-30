-- Canonical video consultation table required by the interpretation control
-- plane. Production received this table before SQL migration tracking covered
-- it; keep this idempotent migration so a fresh staging database can bootstrap
-- without copying production data.

CREATE TABLE IF NOT EXISTS video_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid,
  patient_id uuid,
  room_name text NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN (
    'PENDING_CONFIRMATION', 'SCHEDULED', 'IN_PROGRESS',
    'COMPLETED', 'CANCELLED', 'REJECTED'
  )),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  created_by uuid,
  livekit_server_url text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz,
  title text,
  description text,
  host_identity text,
  timezone text DEFAULT 'UTC',
  doctor_id text,
  doctor_name text,
  duration_minutes integer NOT NULL DEFAULT 30,
  doctor_response_at timestamptz,
  doctor_response_note text,
  patient_name text,
  patient_email text,
  patient_language text DEFAULT 'en'
);

CREATE INDEX IF NOT EXISTS video_consultations_case_id_idx
  ON video_consultations (case_id);
CREATE INDEX IF NOT EXISTS video_consultations_doctor_id_idx
  ON video_consultations (doctor_id);
CREATE INDEX IF NOT EXISTS video_consultations_doctor_scheduled_at_idx
  ON video_consultations (doctor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS video_consultations_patient_id_idx
  ON video_consultations (patient_id);
CREATE INDEX IF NOT EXISTS video_consultations_patient_scheduled_at_idx
  ON video_consultations (patient_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS video_consultations_room_name_idx
  ON video_consultations (room_name);
CREATE INDEX IF NOT EXISTS video_consultations_scheduled_at_idx
  ON video_consultations (scheduled_at);
CREATE INDEX IF NOT EXISTS video_consultations_status_idx
  ON video_consultations (status);

-- The video-only staging bootstrap intentionally does not require the wider
-- CRM schema. Add the production surgeon relationship when that table exists,
-- while keeping an otherwise empty de-identified evaluation database valid.
DO $$
BEGIN
  IF to_regclass('public.surgeons') IS NOT NULL THEN
    ALTER TABLE video_consultations
      ADD CONSTRAINT video_consultations_doctor_id_fkey
      FOREIGN KEY (doctor_id) REFERENCES surgeons(surgeon_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
