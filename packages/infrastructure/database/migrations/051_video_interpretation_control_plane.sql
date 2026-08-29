-- Low-cost hosted video interpretation control plane.
-- Content is intentionally absent: these tables contain authority, lifecycle,
-- and non-content metering only. Audio/captions/transcripts stay in memory.

ALTER TABLE video_consultations
  ADD COLUMN IF NOT EXISTS room_generation integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  ALTER TABLE video_consultations
    ADD CONSTRAINT video_consultations_room_generation_positive CHECK (room_generation > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS video_consultation_hosted_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_name text NOT NULL UNIQUE,
  bootstrap_secret_digest text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS video_consultation_ai_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES video_consultations(id) ON DELETE CASCADE,
  participant_identity text NOT NULL,
  policy_version text NOT NULL,
  state text NOT NULL CHECK (state IN ('GRANTED', 'DECLINED', 'REVOKED')),
  recorded_by_principal_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (consultation_id, participant_identity, policy_version)
);

CREATE INDEX IF NOT EXISTS video_consultation_ai_consents_lookup_idx
  ON video_consultation_ai_consents (consultation_id, participant_identity, policy_version);

CREATE TABLE IF NOT EXISTS video_consultation_interpretation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES video_consultations(id) ON DELETE CASCADE,
  room_name text NOT NULL,
  room_generation integer NOT NULL CHECK (room_generation > 0),
  interpretation_generation integer NOT NULL CHECK (interpretation_generation > 0),
  agent_execution_version integer NOT NULL CHECK (agent_execution_version > 0),
  authorization_revision bigint NOT NULL DEFAULT 1 CHECK (authorization_revision > 0),
  desired_state text NOT NULL CHECK (desired_state IN ('RUNNING', 'STOPPED')),
  status text NOT NULL CHECK (status IN (
    'DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING', 'STOPPED', 'FAILED', 'BUDGET_EXHAUSTED'
  )),
  provider_profile text NOT NULL CHECK (provider_profile IN ('DISABLED', 'INTEGRATED_REALTIME')),
  source_language text NOT NULL CHECK (source_language IN ('zh', 'en')),
  target_language text NOT NULL CHECK (target_language IN ('zh', 'en') AND target_language <> source_language),
  consent_policy_version text NOT NULL,
  agent_identity text NOT NULL,
  hosted_deployment_id uuid REFERENCES video_consultation_hosted_deployments(id) ON DELETE RESTRICT,
  dispatch_id text,
  exchange_available boolean NOT NULL DEFAULT true,
  job_capability_digest text,
  capability_expires_at timestamptz,
  maximum_ai_duration_seconds integer NOT NULL CHECK (maximum_ai_duration_seconds BETWEEN 60 AND 7200),
  reserved_microdollars bigint NOT NULL DEFAULT 0 CHECK (reserved_microdollars >= 0),
  consumed_microdollars bigint NOT NULL DEFAULT 0 CHECK (consumed_microdollars >= 0),
  failure_code text,
  started_at timestamptz,
  stopped_at timestamptz,
  created_by_principal_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultation_id, room_generation, interpretation_generation)
);

CREATE UNIQUE INDEX IF NOT EXISTS video_consultation_interpretation_jobs_one_active_idx
  ON video_consultation_interpretation_jobs (consultation_id, room_generation)
  WHERE desired_state = 'RUNNING' AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING');

CREATE INDEX IF NOT EXISTS video_consultation_interpretation_jobs_capacity_idx
  ON video_consultation_interpretation_jobs (status)
  WHERE desired_state = 'RUNNING';

CREATE TABLE IF NOT EXISTS video_consultation_interpretation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES video_consultation_interpretation_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'START', 'DISPATCH', 'BOOTSTRAP_EXCHANGE', 'ACTIVE', 'STOP', 'FAIL', 'COMPLETE',
    'AUTHORIZATION_EXPIRED', 'CONSENT_CHANGED', 'PROVIDER_SESSION_CHANGED', 'BUDGET_CHANGED'
  )),
  actor_type text NOT NULL CHECK (actor_type IN ('PRINCIPAL', 'AGENT', 'SYSTEM')),
  actor_id text,
  execution_version integer NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_consultation_interpretation_events_job_idx
  ON video_consultation_interpretation_events (job_id, created_at);

CREATE TABLE IF NOT EXISTS video_consultation_source_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES video_consultation_interpretation_jobs(id) ON DELETE CASCADE,
  participant_identity text NOT NULL,
  track_sid text NOT NULL,
  track_source text NOT NULL CHECK (track_source = 'MICROPHONE'),
  expected_source_language text NOT NULL CHECK (expected_source_language IN ('zh', 'en')),
  target_language text NOT NULL CHECK (target_language IN ('zh', 'en') AND target_language <> expected_source_language),
  language_version integer NOT NULL DEFAULT 1 CHECK (language_version > 0),
  consent_version integer NOT NULL DEFAULT 1 CHECK (consent_version > 0),
  authorization_revision bigint NOT NULL DEFAULT 1 CHECK (authorization_revision > 0),
  authorized boolean NOT NULL DEFAULT false,
  set_by_principal_id text NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL,
  unpublished_at timestamptz,
  UNIQUE (job_id, track_sid)
);

CREATE TABLE IF NOT EXISTS video_consultation_provider_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES video_consultation_interpretation_jobs(id) ON DELETE CASCADE,
  source_track_id uuid NOT NULL REFERENCES video_consultation_source_tracks(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_profile text NOT NULL,
  provider_session_reference text,
  room_generation integer NOT NULL,
  interpretation_generation integer NOT NULL,
  source_language text NOT NULL CHECK (source_language IN ('zh', 'en')),
  target_language text NOT NULL CHECK (target_language IN ('zh', 'en') AND target_language <> source_language),
  language_version integer NOT NULL CHECK (language_version > 0),
  agent_execution_version integer NOT NULL CHECK (agent_execution_version > 0),
  state text NOT NULL CHECK (state IN ('CREATING', 'ACTIVE', 'CLOSING', 'ORPHAN_WAIT', 'CLOSED', 'FAILED')),
  application_deadline_at timestamptz NOT NULL,
  provider_expires_at timestamptz,
  last_seen_at timestamptz,
  closed_at timestamptz,
  close_result text,
  orphan_risk boolean NOT NULL DEFAULT false,
  input_audio_milliseconds bigint NOT NULL DEFAULT 0 CHECK (input_audio_milliseconds >= 0),
  output_audio_milliseconds bigint NOT NULL DEFAULT 0 CHECK (output_audio_milliseconds >= 0),
  estimated_microdollars bigint NOT NULL DEFAULT 0 CHECK (estimated_microdollars >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS video_consultation_provider_sessions_active_fence_idx
  ON video_consultation_provider_sessions (job_id, source_track_id, interpretation_generation)
  WHERE state IN ('CREATING', 'ACTIVE', 'CLOSING', 'ORPHAN_WAIT');

CREATE INDEX IF NOT EXISTS video_consultation_provider_sessions_reconcile_idx
  ON video_consultation_provider_sessions (state, application_deadline_at)
  WHERE state IN ('CREATING', 'ACTIVE', 'CLOSING', 'ORPHAN_WAIT');

-- Completion can originate from the admin BFF, patient API, or a direct
-- application SQL path. Enforce fail-closed AI invalidation at the database
-- boundary so none of those paths can leave a watchdog capability authorized.
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
          updated_at = now()
      WHERE consultation_id = NEW.id
        AND desired_state = 'RUNNING'
        AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
      RETURNING id
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO affected_job_ids
    FROM affected;

    IF cardinality(affected_job_ids) = 0 THEN
      RETURN NEW;
    END IF;

    UPDATE video_consultation_source_tracks track
    SET authorized = false,
        authorization_revision = authorization_revision + 1,
        unpublished_at = COALESCE(unpublished_at, now())
    WHERE track.job_id = ANY(affected_job_ids)
      AND track.authorized = true;

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

    UPDATE video_consultation_interpretation_jobs
    SET status = 'STOPPED', stopped_at = COALESCE(stopped_at, now()), updated_at = now()
    WHERE id = ANY(affected_job_ids)
      AND desired_state = 'STOPPED' AND status = 'STOPPING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_consultation_close_invalidates_interpretation
  ON video_consultations;
CREATE TRIGGER video_consultation_close_invalidates_interpretation
AFTER UPDATE OF status ON video_consultations
FOR EACH ROW
EXECUTE FUNCTION invalidate_video_interpretation_on_consultation_close();

-- Rotating or revoking a deployment secret is also an authority change. The
-- row lock used by bootstrap serializes with this trigger's UPDATE; whichever
-- transaction commits last leaves every old capability unusable.
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
      SET desired_state = 'STOPPED',
          status = 'STOPPING',
          exchange_available = false,
          job_capability_digest = NULL,
          capability_expires_at = NULL,
          agent_execution_version = agent_execution_version + 1,
          authorization_revision = authorization_revision + 1,
          updated_at = now()
      WHERE hosted_deployment_id = NEW.id
        AND desired_state = 'RUNNING'
        AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
      RETURNING id
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO affected_job_ids
    FROM affected;

    IF cardinality(affected_job_ids) = 0 THEN
      RETURN NEW;
    END IF;

    UPDATE video_consultation_source_tracks track
    SET authorized = false,
        authorization_revision = authorization_revision + 1,
        unpublished_at = COALESCE(unpublished_at, now())
    WHERE track.job_id = ANY(affected_job_ids)
      AND track.authorized = true;

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

    UPDATE video_consultation_interpretation_jobs
    SET status = 'STOPPED', stopped_at = COALESCE(stopped_at, now()), updated_at = now()
    WHERE id = ANY(affected_job_ids)
      AND desired_state = 'STOPPED' AND status = 'STOPPING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_interpretation_deployment_change_invalidates_jobs
  ON video_consultation_hosted_deployments;
CREATE TRIGGER video_interpretation_deployment_change_invalidates_jobs
AFTER UPDATE OF enabled, revoked_at, bootstrap_secret_digest
ON video_consultation_hosted_deployments
FOR EACH ROW
EXECUTE FUNCTION invalidate_video_interpretation_on_deployment_change();
