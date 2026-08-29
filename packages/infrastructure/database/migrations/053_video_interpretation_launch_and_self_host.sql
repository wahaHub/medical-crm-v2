-- Phase C/D readiness: explicit release approvals, enforceable budgets, and
-- optional self-host authority. This migration does not enable patient media
-- or select self-hosting; both remain separately reviewed runtime decisions.

CREATE TABLE IF NOT EXISTS video_interpretation_release_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_classification text NOT NULL CHECK (data_classification IN ('DEIDENTIFIED_EVALUATION', 'REAL_PATIENT')),
  provider text NOT NULL,
  provider_model text NOT NULL,
  provider_endpoint text NOT NULL,
  processing_region text NOT NULL,
  approval_reference text NOT NULL,
  contracts_approved boolean NOT NULL DEFAULT false,
  privacy_verified boolean NOT NULL DEFAULT false,
  observability_disabled boolean NOT NULL DEFAULT false,
  retention_verified boolean NOT NULL DEFAULT false,
  provider_rate_microdollars_per_minute bigint NOT NULL CHECK (provider_rate_microdollars_per_minute > 0),
  per_room_hard_limit_microdollars bigint NOT NULL CHECK (per_room_hard_limit_microdollars > 0),
  daily_hard_limit_microdollars bigint NOT NULL CHECK (daily_hard_limit_microdollars > 0),
  monthly_hard_limit_microdollars bigint NOT NULL CHECK (monthly_hard_limit_microdollars > 0),
  approved_by_principal_id text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > approved_at)
);

CREATE INDEX IF NOT EXISTS video_interpretation_release_approvals_active_idx
  ON video_interpretation_release_approvals (data_classification, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS video_consultation_interpretation_allowlist (
  consultation_id uuid PRIMARY KEY REFERENCES video_consultations(id) ON DELETE CASCADE,
  release_approval_id uuid NOT NULL REFERENCES video_interpretation_release_approvals(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  allowed_by_principal_id text NOT NULL,
  allowed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > allowed_at)
);

CREATE TABLE IF NOT EXISTS video_interpretation_self_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_name text NOT NULL UNIQUE,
  bearer_secret_digest text NOT NULL,
  credential_version bigint NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  max_jobs integer NOT NULL DEFAULT 1 CHECK (max_jobs = 1),
  enabled boolean NOT NULL DEFAULT true,
  created_by_principal_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  last_heartbeat_at timestamptz,
  revoked_at timestamptz
);

-- Cross-process single-flight for the independently scheduled hosted and
-- self-hosted cleanup passes. A lease is intentionally recoverable after a
-- worker/API crash; no database transaction is held across LiveKit calls.
CREATE TABLE IF NOT EXISTS video_interpretation_reconcile_leases (
  profile text PRIMARY KEY CHECK (profile IN ('HOSTED', 'SELF_HOSTED_FENCE', 'SELF_HOSTED_CLEANUP')),
  owner_id uuid,
  lease_expires_at timestamptz NOT NULL DEFAULT '-infinity',
  run_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((owner_id IS NULL) = (run_started_at IS NULL))
);

ALTER TABLE video_consultation_interpretation_jobs
  ADD COLUMN IF NOT EXISTS runtime_profile text NOT NULL DEFAULT 'HOSTED_AGENT_V1',
  ADD COLUMN IF NOT EXISTS data_classification text NOT NULL DEFAULT 'DEIDENTIFIED_EVALUATION',
  ADD COLUMN IF NOT EXISTS release_approval_id uuid REFERENCES video_interpretation_release_approvals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS provider_model text,
  ADD COLUMN IF NOT EXISTS provider_endpoint text,
  ADD COLUMN IF NOT EXISTS provider_rate_microdollars_per_minute bigint,
  ADD COLUMN IF NOT EXISTS hard_budget_microdollars bigint,
  ADD COLUMN IF NOT EXISTS self_host_id uuid REFERENCES video_interpretation_self_hosts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS self_host_credential_version bigint,
  ADD COLUMN IF NOT EXISTS lease_version bigint,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS self_host_claim_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_identity_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS hosted_dispatch_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS hosted_dispatch_creation_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hosted_dispatch_correlation_id text,
  ADD COLUMN IF NOT EXISTS hosted_dispatch_attempt_execution_version bigint,
  ADD COLUMN IF NOT EXISTS hosted_dispatch_attempt_agent_identity text,
  ADD COLUMN IF NOT EXISTS hosted_dispatch_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS hosted_dispatch_absence_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS hosted_dispatch_creation_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS hosted_bootstrap_deadline_at timestamptz;

DO $$
BEGIN
  ALTER TABLE video_consultation_interpretation_jobs
    ADD CONSTRAINT video_interpretation_jobs_runtime_profile_check
    CHECK (runtime_profile IN ('HOSTED_AGENT_V1', 'SELF_HOSTED_AGENT'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE video_consultation_interpretation_jobs
    ADD CONSTRAINT video_interpretation_self_host_claim_deadline_check
    CHECK (
      runtime_profile <> 'SELF_HOSTED_AGENT'
      OR desired_state <> 'RUNNING'
      OR status <> 'DISPATCHING'
      OR self_host_claim_deadline_at IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE video_consultation_interpretation_jobs
    ADD CONSTRAINT video_interpretation_jobs_data_classification_check
    CHECK (data_classification IN ('DEIDENTIFIED_EVALUATION', 'REAL_PATIENT'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE video_consultation_interpretation_jobs
    ADD CONSTRAINT video_interpretation_jobs_budget_positive_check
    CHECK (
      (provider_rate_microdollars_per_minute IS NULL OR provider_rate_microdollars_per_minute > 0)
      AND (hard_budget_microdollars IS NULL OR hard_budget_microdollars > 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS video_interpretation_self_host_claim_idx
  ON video_consultation_interpretation_jobs (self_host_claim_deadline_at, created_at)
  WHERE runtime_profile = 'SELF_HOSTED_AGENT'
    AND desired_state = 'RUNNING'
    AND status = 'DISPATCHING';

CREATE INDEX IF NOT EXISTS video_interpretation_self_host_lease_idx
  ON video_consultation_interpretation_jobs (lease_expires_at)
  WHERE runtime_profile = 'SELF_HOSTED_AGENT'
    AND desired_state = 'RUNNING'
    AND status IN ('AWAITING_AGENT', 'ACTIVE');

CREATE INDEX IF NOT EXISTS video_interpretation_self_host_cleanup_idx
  ON video_consultation_interpretation_jobs (updated_at)
  WHERE runtime_profile = 'SELF_HOSTED_AGENT'
    AND status = 'STOPPING';

CREATE INDEX IF NOT EXISTS video_interpretation_hosted_cleanup_idx
  ON video_consultation_interpretation_jobs (updated_at)
  WHERE runtime_profile = 'HOSTED_AGENT_V1'
    AND status = 'STOPPING';

-- Migration 051 predates durable runtime cleanup. Leave both runtime profiles
-- in STOPPING until the independent reconciler proves dispatch/token/identity
-- cleanup and provider-fence finality.
CREATE OR REPLACE FUNCTION invalidate_video_interpretation_on_consultation_close()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_job_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NEW.status IN ('COMPLETED', 'CANCELLED', 'REJECTED')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    WITH affected AS (
      UPDATE video_consultation_interpretation_jobs
      SET desired_state = 'STOPPED',
          status = 'STOPPING',
          exchange_available = false,
          job_capability_digest = NULL,
          capability_expires_at = NULL,
          agent_execution_version = agent_execution_version + 1,
          authorization_revision = authorization_revision + 1,
          lease_expires_at = CASE WHEN runtime_profile = 'SELF_HOSTED_AGENT' THEN NULL ELSE lease_expires_at END,
          agent_identity_revoked_at = CASE
            WHEN runtime_profile = 'SELF_HOSTED_AGENT' THEN NULL ELSE agent_identity_revoked_at
          END,
          hosted_dispatch_deleted_at = CASE
            WHEN runtime_profile = 'HOSTED_AGENT_V1' THEN NULL ELSE hosted_dispatch_deleted_at
          END,
          failure_code = 'CONSULTATION_CLOSED',
          updated_at = now()
      WHERE consultation_id = NEW.id
        AND desired_state = 'RUNNING'
        AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
      RETURNING id
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO affected_job_ids
    FROM affected;

    IF cardinality(affected_job_ids) = 0 THEN RETURN NEW; END IF;

    UPDATE video_consultation_source_tracks track
    SET authorized = false,
        authorization_revision = authorization_revision + 1,
        unpublished_at = COALESCE(unpublished_at, now())
    WHERE track.job_id = ANY(affected_job_ids) AND track.authorized = true;

    UPDATE video_consultation_provider_sessions provider_session
    SET state = 'ORPHAN_WAIT', orphan_risk = true, updated_at = now()
    WHERE provider_session.job_id = ANY(affected_job_ids)
      AND provider_session.state IN ('CREATING', 'ACTIVE', 'CLOSING');

    INSERT INTO video_consultation_interpretation_events (
      job_id, event_type, actor_type, actor_id, execution_version, details
    )
    SELECT id, 'STOP', 'SYSTEM', NULL, agent_execution_version,
           jsonb_build_object('reason', 'consultation_status', 'status', NEW.status)
    FROM video_consultation_interpretation_jobs
    WHERE id = ANY(affected_job_ids);

  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION invalidate_video_interpretation_on_deployment_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_job_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NEW.enabled = false
     OR NEW.revoked_at IS NOT NULL
     OR OLD.bootstrap_secret_digest IS DISTINCT FROM NEW.bootstrap_secret_digest THEN
    WITH affected AS (
      UPDATE video_consultation_interpretation_jobs
      SET desired_state = 'STOPPED', status = 'STOPPING',
          exchange_available = false, job_capability_digest = NULL,
          capability_expires_at = NULL,
          agent_execution_version = agent_execution_version + 1,
          authorization_revision = authorization_revision + 1,
          hosted_dispatch_deleted_at = NULL,
          agent_identity_revoked_at = NULL,
          failure_code = 'HOSTED_DEPLOYMENT_AUTHORITY_CHANGED', updated_at = now()
      WHERE hosted_deployment_id = NEW.id
        AND desired_state = 'RUNNING'
        AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
      RETURNING id
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO affected_job_ids
    FROM affected;

    IF cardinality(affected_job_ids) = 0 THEN RETURN NEW; END IF;

    UPDATE video_consultation_source_tracks track
    SET authorized = false,
        authorization_revision = authorization_revision + 1,
        unpublished_at = COALESCE(unpublished_at, now())
    WHERE track.job_id = ANY(affected_job_ids) AND track.authorized = true;

    UPDATE video_consultation_provider_sessions provider_session
    SET state = 'ORPHAN_WAIT', orphan_risk = true, updated_at = now()
    WHERE provider_session.job_id = ANY(affected_job_ids)
      AND provider_session.state IN ('CREATING', 'ACTIVE', 'CLOSING');

    INSERT INTO video_consultation_interpretation_events (
      job_id, event_type, actor_type, actor_id, execution_version, details
    )
    SELECT id, 'STOP', 'SYSTEM', NULL, agent_execution_version,
           jsonb_build_object('reason', 'deployment_authority_changed')
    FROM video_consultation_interpretation_jobs
    WHERE id = ANY(affected_job_ids);
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE video_consultation_interpretation_events
  DROP CONSTRAINT IF EXISTS video_consultation_interpretation_events_event_type_check;

ALTER TABLE video_consultation_interpretation_events
  ADD CONSTRAINT video_consultation_interpretation_events_event_type_check CHECK (event_type IN (
    'START', 'DISPATCH', 'BOOTSTRAP_EXCHANGE', 'ACTIVE', 'STOP', 'FAIL', 'COMPLETE',
    'AUTHORIZATION_EXPIRED', 'CONSENT_CHANGED', 'PROVIDER_SESSION_CHANGED', 'BUDGET_CHANGED',
    'HUMAN_ESCALATION_REQUESTED', 'CLAIM', 'HEARTBEAT', 'TAKEOVER',
    'APPLICATION_DEADLINE_ELAPSED'
  ));
