-- A synthetic E2E approval is deliberately not a privacy/contract release.
-- Bind it one-to-one to a short-lived, server-recognizable synthetic
-- consultation so false privacy attestations can never authorize another room.

ALTER TABLE video_interpretation_release_approvals
  ADD COLUMN IF NOT EXISTS approval_scope text NOT NULL DEFAULT 'RELEASE',
  ADD COLUMN IF NOT EXISTS synthetic_consultation_id uuid
    REFERENCES video_consultations(id) ON DELETE CASCADE;

DO $$
BEGIN
  ALTER TABLE video_interpretation_release_approvals
    ADD CONSTRAINT video_interpretation_release_approvals_scope_check CHECK (
      (
        approval_scope = 'RELEASE'
        AND synthetic_consultation_id IS NULL
      )
      OR (
        approval_scope = 'SYNTHETIC_E2E'
        AND synthetic_consultation_id IS NOT NULL
        AND data_classification = 'DEIDENTIFIED_EVALUATION'
        AND contracts_approved = false
        AND privacy_verified = false
        AND observability_disabled = false
        AND retention_verified = false
        AND expires_at <= approved_at + interval '30 minutes'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS video_interpretation_release_approvals_synthetic_consultation_idx
  ON video_interpretation_release_approvals (synthetic_consultation_id)
  WHERE approval_scope = 'SYNTHETIC_E2E' AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION video_interpretation_is_synthetic_e2e_consultation(
  candidate_consultation_id uuid,
  evaluated_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  consultation public.video_consultations%ROWTYPE;
  metadata_expiry timestamptz;
BEGIN
  SELECT * INTO consultation
  FROM public.video_consultations
  WHERE id = candidate_consultation_id;

  IF NOT FOUND
    OR consultation.status NOT IN ('SCHEDULED', 'IN_PROGRESS')
    OR consultation.room_name !~ '^medora-deidentified-e2e-[0-9a-f]{16}$'
    OR consultation.case_id IS NOT NULL
    OR consultation.patient_id IS NOT NULL
    OR consultation.patient_name IS NOT NULL
    OR consultation.patient_email IS NOT NULL
    OR consultation.metadata IS NULL
    OR consultation.metadata -> 'synthetic' IS DISTINCT FROM 'true'::jsonb
    OR consultation.metadata ->> 'classification' IS DISTINCT FROM 'DEIDENTIFIED_EVALUATION'
    OR jsonb_typeof(consultation.metadata -> 'expiresAt') IS DISTINCT FROM 'string' THEN
    RETURN false;
  END IF;

  BEGIN
    metadata_expiry := (consultation.metadata ->> 'expiresAt')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RETURN false;
  END;

  RETURN metadata_expiry > evaluated_at
    AND metadata_expiry <= evaluated_at + interval '30 minutes';
END;
$$;

CREATE OR REPLACE FUNCTION video_interpretation_approval_authorized(
  candidate_approval_id uuid,
  candidate_consultation_id uuid,
  candidate_data_classification text,
  evaluated_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.video_interpretation_release_approvals approval
    WHERE approval.id = candidate_approval_id
      AND approval.data_classification = candidate_data_classification
      AND approval.revoked_at IS NULL
      AND approval.expires_at > evaluated_at
      AND (
        (
          approval.approval_scope = 'RELEASE'
          AND approval.synthetic_consultation_id IS NULL
          AND approval.privacy_verified = true
          AND approval.observability_disabled = true
          AND approval.retention_verified = true
          AND (candidate_data_classification <> 'REAL_PATIENT'
            OR approval.contracts_approved = true)
        )
        OR (
          approval.approval_scope = 'SYNTHETIC_E2E'
          AND candidate_data_classification = 'DEIDENTIFIED_EVALUATION'
          AND approval.synthetic_consultation_id = candidate_consultation_id
          AND approval.contracts_approved = false
          AND approval.privacy_verified = false
          AND approval.observability_disabled = false
          AND approval.retention_verified = false
          AND approval.expires_at <= approval.approved_at + interval '30 minutes'
          AND public.video_interpretation_is_synthetic_e2e_consultation(
            candidate_consultation_id,
            evaluated_at
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION video_interpretation_is_synthetic_e2e_consultation(uuid, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION video_interpretation_approval_authorized(uuid, uuid, text, timestamptz)
  FROM PUBLIC;
