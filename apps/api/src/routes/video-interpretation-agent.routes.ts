import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';
import { getServerEnv } from '@medical-crm/config';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { AccessToken, LiveKitAPI, TrackSource } from 'livekit-server-sdk';
import {
  createOpaqueSecret,
  digestSecret,
  MAX_PROVIDER_SESSIONS_PER_ROOM,
  LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS,
  OPENAI_TRANSLATION_CONSERVATIVE_EXPIRY_SECONDS,
  providerSessionAllowedCurrentStates,
  oppositeLanguage,
  readLiveKitConfig,
  secretDigestMatches,
  WATCHDOG_AUTHORIZATION_TTL_MS,
  WATCHDOG_INTERVAL_MS,
  WATCHDOG_MAX_RTT_MS,
  VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED,
  SELF_HOST_HEARTBEAT_SECONDS,
  SELF_HOST_LEASE_SECONDS,
  selfHostedJoinTokenTtlSeconds,
  liveKitMediaPlaneRevocationApproved,
} from '../video-interpretation/security.js';
import { reconcileExpiredProviderSessions } from '../video-interpretation/provider-session-reconciliation.js';
import { reconcileInterpretationBudget } from '../video-interpretation/budget-reconciliation.js';
import {
  cleanupFencedSelfHostedExecutions,
  fenceExpiredOrUnauthorizedUnclaimedSelfHostedJobs,
  fenceExpiredSelfHostedLeases,
  fenceUnauthorizedSelfHostedExecutions,
} from '../video-interpretation/self-hosted-control-plane.js';
import { prepareHostedTerminations } from '../video-interpretation/hosted-control-plane.js';
import {
  acquireReconcileRun,
  type ReconcileProfile,
} from '../video-interpretation/reconcile-run-lease.js';

const app = new Hono();
const idSchema = z.string().uuid();
const bootstrapSchema = z.object({
  bootstrapSecret: z.string().min(32),
  jobId: z.string().uuid(),
  dispatchId: z.string().min(1),
  roomName: z.string().min(1),
  roomGeneration: z.number().int().positive(),
  interpretationGeneration: z.number().int().positive(),
  executionVersion: z.number().int().positive(),
  agentIdentity: z.string().min(1),
});
const watchdogSchema = z.object({
  requestSeq: z.number().int().positive(),
  nonce: z.string().min(16).max(160),
});
const providerOpenSchema = z.object({
  sourceTrackId: z.string().uuid(),
  provider: z.string().min(1).max(80),
  providerProfile: z.literal('INTEGRATED_REALTIME'),
  applicationDeadlineAt: z.string().datetime(),
});
const providerActivateSchema = z.object({
  providerSessionReference: z.string().min(1).max(160),
});
const selfHostHeartbeatSchema = z.object({
  jobId: z.string().uuid(),
  executionVersion: z.number().int().positive(),
  leaseVersion: z.number().int().positive(),
});

interface CapabilityJob {
  id: string;
  consultation_id: string;
  room_name: string;
  room_generation: number;
  interpretation_generation: number;
  agent_execution_version: number;
  authorization_revision: string | number;
  desired_state: string;
  status: string;
  provider_profile: string;
  agent_identity: string;
  dispatch_id: string | null;
  job_capability_digest: string | null;
  capability_expires_at: string | null;
  maximum_ai_duration_seconds?: number;
  started_at: string | null;
  runtime_profile: 'HOSTED_AGENT_V1' | 'SELF_HOSTED_AGENT';
  self_host_id: string | null;
  self_host_credential_version: string | number | null;
  lease_version: string | number | null;
  lease_expires_at: string | null;
  provider_rate_microdollars_per_minute: string | number | null;
  hard_budget_microdollars: string | number | null;
  data_classification: 'DEIDENTIFIED_EVALUATION' | 'REAL_PATIENT';
  release_approval_id: string | null;
  provider_model: string | null;
  provider_endpoint: string | null;
  source_language: 'zh' | 'en';
  target_language: 'zh' | 'en';
  consent_policy_version: string;
  created_by_principal_id: string;
}

interface SourceTrackRow {
  id: string;
  participant_identity: string;
  track_sid: string;
  expected_source_language: 'zh' | 'en';
  target_language: 'zh' | 'en';
  language_version: number;
  consent_version: number;
  authorization_revision: string | number;
  authorized: boolean;
}

interface AuthorizationSnapshot {
  job: CapabilityJob;
  authorizationRevision: number;
  tracks: SourceTrackRow[];
}

function sqlClient() {
  return getCrmDb().$client;
}

function bearer(c: { req: { header(name: string): string | undefined } }): string | null {
  const header = c.req.header('Authorization');
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

async function authorizedJob(jobId: string, capability: string | null): Promise<CapabilityJob | null> {
  if (!capability) return null;
  const sql = sqlClient();
  const [job] = await sql<CapabilityJob[]>`
    SELECT id, consultation_id, room_name, room_generation, interpretation_generation,
           agent_execution_version, authorization_revision, desired_state, status,
           provider_profile, agent_identity, dispatch_id, job_capability_digest,
           capability_expires_at, source_language, target_language,
           consent_policy_version, created_by_principal_id,
           maximum_ai_duration_seconds, started_at, runtime_profile, self_host_id,
           self_host_credential_version, lease_version, lease_expires_at,
           provider_rate_microdollars_per_minute, hard_budget_microdollars,
           data_classification, release_approval_id, provider_model, provider_endpoint
    FROM video_consultation_interpretation_jobs
    WHERE id = ${jobId}
  `;
  if (!job?.job_capability_digest || !secretDigestMatches(capability, job.job_capability_digest)) return null;
  if (!job.capability_expires_at || new Date(job.capability_expires_at).getTime() <= Date.now()) return null;
  if (job.runtime_profile === 'SELF_HOSTED_AGENT'
    && (!job.lease_expires_at || new Date(job.lease_expires_at).getTime() <= Date.now())) return null;
  if (job.data_classification === 'REAL_PATIENT'
    && !VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED) return null;
  return job;
}

function liveKitApiHost(url: string): string {
  return url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

async function reconcileSourceTracks(
  job: CapabilityJob,
  capability: string,
): Promise<AuthorizationSnapshot | null> {
  const config = readLiveKitConfig();
  const livekit = new LiveKitAPI({
    host: liveKitApiHost(config.livekitUrl),
    apiKey: config.apiKey,
    secret: config.apiSecret,
    requestTimeout: LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS,
    failover: false,
  });
  const participants = await livekit.room.listParticipants(job.room_name);
  const sql = sqlClient();
  const reconciled = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    const [lockedJob] = await query<CapabilityJob[]>`
      SELECT id, consultation_id, room_name, room_generation, interpretation_generation,
             agent_execution_version, authorization_revision, desired_state, status,
             provider_profile, agent_identity, dispatch_id, job_capability_digest,
             capability_expires_at, source_language, target_language,
             consent_policy_version, created_by_principal_id,
             maximum_ai_duration_seconds, started_at, runtime_profile, self_host_id,
             self_host_credential_version, lease_version, lease_expires_at,
             provider_rate_microdollars_per_minute, hard_budget_microdollars,
             data_classification, release_approval_id, provider_model, provider_endpoint
      FROM video_consultation_interpretation_jobs
      WHERE id = ${job.id}
        AND capability_expires_at > now()
        AND started_at IS NOT NULL
        AND started_at + maximum_ai_duration_seconds * interval '1 second' > now()
        AND EXISTS (
          SELECT 1
          FROM video_consultation_interpretation_allowlist allowlist
          JOIN video_interpretation_release_approvals approval
            ON approval.id = allowlist.release_approval_id
          WHERE allowlist.consultation_id = video_consultation_interpretation_jobs.consultation_id
            AND approval.id = video_consultation_interpretation_jobs.release_approval_id
            AND approval.data_classification = video_consultation_interpretation_jobs.data_classification
            AND allowlist.enabled = true AND allowlist.revoked_at IS NULL
            AND allowlist.expires_at > now()
            AND approval.revoked_at IS NULL AND approval.expires_at > now()
            AND approval.privacy_verified = true
            AND approval.observability_disabled = true
            AND approval.retention_verified = true
            AND (video_consultation_interpretation_jobs.data_classification <> 'REAL_PATIENT'
              OR approval.contracts_approved = true)
        )
      FOR UPDATE
    `;
    if (!lockedJob || lockedJob.desired_state !== 'RUNNING' || lockedJob.status !== 'ACTIVE'
      || lockedJob.agent_execution_version !== job.agent_execution_version
      || !lockedJob.job_capability_digest
      || !secretDigestMatches(capability, lockedJob.job_capability_digest)
      || !lockedJob.capability_expires_at || !lockedJob.started_at) return null;
    if (lockedJob.runtime_profile === 'SELF_HOSTED_AGENT'
      && (!lockedJob.lease_expires_at || new Date(lockedJob.lease_expires_at).getTime() <= Date.now())) return null;
    if (lockedJob.data_classification === 'REAL_PATIENT'
      && !VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED) return null;

    const budget = await reconcileInterpretationBudget(query, lockedJob);
    if (!budget.authorized) return null;

    const consents = await query<{ participant_identity: string; version: string | number }[]>`
      SELECT participant_identity, version
      FROM video_consultation_ai_consents
      WHERE consultation_id = ${lockedJob.consultation_id}
        AND policy_version = ${lockedJob.consent_policy_version}
        AND state = 'GRANTED'
    `;
    const consentVersions = new Map(consents.map((row) => [row.participant_identity, Number(row.version)]));
    const operatorIdentity = `operator-${lockedJob.created_by_principal_id}-${lockedJob.consultation_id}`;
    const desired = participants.flatMap((participant) => {
      const consentVersion = consentVersions.get(participant.identity);
      if (!consentVersion || participant.identity === lockedJob.agent_identity) return [];
      const sourceLanguage = participant.identity === operatorIdentity
        ? oppositeLanguage(lockedJob.source_language)
        : lockedJob.source_language;
      return participant.tracks
        .filter((track) => track.source === TrackSource.MICROPHONE && Boolean(track.sid))
        .map((track) => ({
          participantIdentity: participant.identity,
          trackSid: track.sid,
          sourceLanguage,
          targetLanguage: oppositeLanguage(sourceLanguage),
          consentVersion,
        }));
    }).sort((a, b) => a.participantIdentity.localeCompare(b.participantIdentity)
      || a.trackSid.localeCompare(b.trackSid));

    const current = await query<SourceTrackRow[]>`
      SELECT id, participant_identity, track_sid, expected_source_language, target_language,
             language_version, consent_version, authorization_revision, authorized
      FROM video_consultation_source_tracks
      WHERE job_id = ${lockedJob.id} AND unpublished_at IS NULL
      ORDER BY participant_identity, track_sid
    `;
    const unchanged = current.length === desired.length && current.every((track, index) => {
      const expected = desired[index];
      return track.authorized && track.participant_identity === expected?.participantIdentity
        && track.track_sid === expected.trackSid
        && track.expected_source_language === expected.sourceLanguage
        && track.target_language === expected.targetLanguage
        && track.consent_version === expected.consentVersion;
    });

    let snapshotRevision = Number(lockedJob.authorization_revision);
    if (!unchanged) {
      const [revision] = await query<{ authorization_revision: string | number }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET authorization_revision = authorization_revision + 1, updated_at = now()
        WHERE id = ${lockedJob.id}
        RETURNING authorization_revision
      `;
      if (!revision) return [];
      const nextRevision = Number(revision.authorization_revision);
      snapshotRevision = nextRevision;
      const desiredSids = desired.map((track) => track.trackSid);
      if (desiredSids.length === 0) {
        await query`
          UPDATE video_consultation_source_tracks
          SET authorized = false, unpublished_at = COALESCE(unpublished_at, now()),
              authorization_revision = ${nextRevision}
          WHERE job_id = ${lockedJob.id} AND unpublished_at IS NULL
        `;
      } else {
        await query`
          UPDATE video_consultation_source_tracks
          SET authorized = false, unpublished_at = COALESCE(unpublished_at, now()),
              authorization_revision = ${nextRevision}
          WHERE job_id = ${lockedJob.id} AND unpublished_at IS NULL
            AND NOT (track_sid = ANY(${query.array(desiredSids)}::text[]))
        `;
      }
      for (const track of desired) {
        await query`
          INSERT INTO video_consultation_source_tracks (
            job_id, participant_identity, track_sid, track_source,
            expected_source_language, target_language, language_version,
            consent_version, authorization_revision, authorized,
            set_by_principal_id, published_at
          ) VALUES (
            ${lockedJob.id}, ${track.participantIdentity}, ${track.trackSid}, 'MICROPHONE',
            ${track.sourceLanguage}, ${track.targetLanguage}, 1,
            ${track.consentVersion}, ${nextRevision}, true, ${lockedJob.created_by_principal_id}, now()
          )
          ON CONFLICT (job_id, track_sid) DO UPDATE SET
            participant_identity = EXCLUDED.participant_identity,
            expected_source_language = EXCLUDED.expected_source_language,
            target_language = EXCLUDED.target_language,
            language_version = CASE
              WHEN video_consultation_source_tracks.expected_source_language IS DISTINCT FROM EXCLUDED.expected_source_language
                OR video_consultation_source_tracks.target_language IS DISTINCT FROM EXCLUDED.target_language
              THEN video_consultation_source_tracks.language_version + 1
              ELSE video_consultation_source_tracks.language_version
            END,
            consent_version = EXCLUDED.consent_version,
            authorization_revision = EXCLUDED.authorization_revision,
            authorized = true, unpublished_at = NULL, published_at = now()
        `;
      }
    }

    const tracks = await query<SourceTrackRow[]>`
      SELECT id, participant_identity, track_sid, expected_source_language, target_language,
             language_version, consent_version, authorization_revision, authorized
      FROM video_consultation_source_tracks
      WHERE job_id = ${lockedJob.id} AND unpublished_at IS NULL AND authorized = true
      ORDER BY participant_identity, track_sid
    `;
    return {
      job: { ...lockedJob, authorization_revision: snapshotRevision },
      authorizationRevision: snapshotRevision,
      // The transaction has re-derived authority for this exact revision. Stamp
      // the serialized snapshot uniformly so mixed-revision responses fail shut.
      tracks: tracks.map((track) => ({ ...track, authorization_revision: snapshotRevision })),
    };
  });
  return reconciled as unknown as AuthorizationSnapshot | null;
}

app.post('/api/v2/internal/video-interpretation/bootstrap', async (c) => {
  const body = bootstrapSchema.parse(await c.req.json());
  const sql = sqlClient();
  const capability = createOpaqueSecret();
  const claimedResult = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    const [locator] = await query<{ hosted_deployment_id: string }[]>`
      SELECT hosted_deployment_id
      FROM video_consultation_interpretation_jobs
      WHERE id = ${body.jobId}
    `;
    if (!locator?.hosted_deployment_id) return null;
    // Deployment authority is always locked before the job. Rotation/revocation
    // naturally takes the deployment lock first and its trigger then locks jobs.
    const [deployment] = await query<{
      bootstrap_secret_digest: string;
      enabled: boolean;
      revoked_at: string | null;
    }[]>`
      SELECT bootstrap_secret_digest, enabled, revoked_at
      FROM video_consultation_hosted_deployments
      WHERE id = ${locator.hosted_deployment_id}
      FOR UPDATE
    `;
    if (!deployment) return null;
    const [candidate] = await query<CapabilityJob[]>`
      SELECT j.id, j.room_name, j.room_generation, j.interpretation_generation,
             j.agent_execution_version, j.authorization_revision, j.desired_state, j.status,
             j.provider_profile, j.agent_identity, j.dispatch_id, j.job_capability_digest,
             j.capability_expires_at, j.maximum_ai_duration_seconds,
             j.runtime_profile, j.provider_model, j.provider_endpoint,
             j.data_classification, j.release_approval_id
      FROM video_consultation_interpretation_jobs j
      WHERE j.id = ${body.jobId}
        AND j.hosted_deployment_id = ${locator.hosted_deployment_id}
        AND j.hosted_bootstrap_deadline_at IS NOT NULL
        AND j.hosted_bootstrap_deadline_at > now()
      FOR UPDATE OF j
    `;
    const matches = candidate
      && deployment.enabled
      && !deployment.revoked_at
      && secretDigestMatches(body.bootstrapSecret, deployment.bootstrap_secret_digest)
      && candidate.desired_state === 'RUNNING'
      && candidate.status === 'AWAITING_AGENT'
      && candidate.runtime_profile === 'HOSTED_AGENT_V1'
      && Boolean(candidate.provider_model)
      && Boolean(candidate.provider_endpoint)
      && candidate.dispatch_id === body.dispatchId
      && candidate.room_name === body.roomName
      && candidate.room_generation === body.roomGeneration
      && candidate.interpretation_generation === body.interpretationGeneration
      && candidate.agent_execution_version === body.executionVersion
      && candidate.agent_identity === body.agentIdentity
      && !candidate.job_capability_digest;
    if (!matches) return null;

    const applicationDeadlineAt = new Date(
      Date.now() + Math.min(candidate.maximum_ai_duration_seconds ?? 1800, 7200) * 1_000,
    ).toISOString();
    const expiresAt = new Date(new Date(applicationDeadlineAt).getTime() + 5 * 60_000).toISOString();
    const [claimed] = await query<CapabilityJob[]>`
      UPDATE video_consultation_interpretation_jobs
      SET exchange_available = false,
          job_capability_digest = ${digestSecret(capability)},
          capability_expires_at = ${expiresAt},
          status = 'ACTIVE',
          started_at = COALESCE(started_at, now()),
          updated_at = now()
      WHERE id = ${body.jobId}
        AND exchange_available = true
        AND desired_state = 'RUNNING'
        AND status = 'AWAITING_AGENT'
        AND dispatch_id = ${body.dispatchId}
        AND room_name = ${body.roomName}
        AND room_generation = ${body.roomGeneration}
        AND interpretation_generation = ${body.interpretationGeneration}
        AND agent_execution_version = ${body.executionVersion}
        AND agent_identity = ${body.agentIdentity}
        AND job_capability_digest IS NULL
      RETURNING *
    `;
    if (!claimed) return null;
    await query`
      INSERT INTO video_consultation_interpretation_events (
        job_id, event_type, actor_type, actor_id, execution_version, details
      ) VALUES (
        ${claimed.id}, 'BOOTSTRAP_EXCHANGE', 'AGENT', ${claimed.agent_identity},
        ${claimed.agent_execution_version}, '{}'::jsonb
      )
    `;
    return { claimed, expiresAt, applicationDeadlineAt };
  });
  if (!claimedResult) return c.json({ success: false, error: 'bootstrap_rejected' }, 401);
  const { claimed, expiresAt, applicationDeadlineAt } = claimedResult;
  return c.json({
    success: true,
    capability,
    capabilityExpiresAt: expiresAt,
    job: {
      id: claimed.id,
      roomName: claimed.room_name,
      roomGeneration: claimed.room_generation,
      interpretationGeneration: claimed.interpretation_generation,
      executionVersion: claimed.agent_execution_version,
      authorizationRevision: Number(claimed.authorization_revision),
      providerProfile: claimed.provider_profile,
      providerModel: claimed.provider_model,
      providerEndpoint: claimed.provider_endpoint,
      agentIdentity: claimed.agent_identity,
      applicationDeadlineAt,
    },
    watchdog: {
      intervalMs: WATCHDOG_INTERVAL_MS,
      maxRttMs: WATCHDOG_MAX_RTT_MS,
      authorizationTtlMs: WATCHDOG_AUTHORIZATION_TTL_MS,
    },
  });
});

app.post('/api/v2/internal/video-interpretation/self-hosts/:hostId/claim', async (c) => {
  const hostId = idSchema.parse(c.req.param('hostId'));
  const hostBearer = bearer(c);
  if (!hostBearer) return c.json({ success: false, error: 'host_authorization_rejected' }, 401);
  const livekitConfig = readLiveKitConfig();
  if (!liveKitMediaPlaneRevocationApproved(livekitConfig.livekitUrl)) {
    return c.json({ success: false, error: 'livekit_cloud_revocation_not_verified' }, 503);
  }
  const sql = sqlClient();
  const [authenticatedHost] = await sql<{
    id: string;
    bearer_secret_digest: string;
    enabled: boolean;
    revoked_at: string | null;
  }[]>`
    SELECT id, bearer_secret_digest, enabled, revoked_at
    FROM video_interpretation_self_hosts
    WHERE id = ${hostId}
  `;
  if (!authenticatedHost?.enabled || authenticatedHost.revoked_at
    || !secretDigestMatches(hostBearer, authenticatedHost.bearer_secret_digest)) {
    return c.json({ success: false, error: 'host_authorization_rejected' }, 401);
  }

  const capability = createOpaqueSecret();
  const claim = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    const [host] = await query<{
      id: string;
      bearer_secret_digest: string;
      credential_version: string | number;
      max_jobs: number;
      enabled: boolean;
      revoked_at: string | null;
    }[]>`
      SELECT id, bearer_secret_digest, credential_version, max_jobs, enabled, revoked_at
      FROM video_interpretation_self_hosts
      WHERE id = ${hostId}
      FOR UPDATE
    `;
    if (!host?.enabled || host.revoked_at
      || !secretDigestMatches(hostBearer, host.bearer_secret_digest)) return 'unauthorized' as const;
    const [{ active_count: activeCount } = { active_count: host.max_jobs }] = await query<{ active_count: number }[]>`
      SELECT count(*)::int AS active_count
      FROM video_consultation_interpretation_jobs
      WHERE self_host_id = ${hostId}
        AND desired_state = 'RUNNING'
        AND status IN ('AWAITING_AGENT', 'ACTIVE')
        AND lease_expires_at > now()
    `;
    if (activeCount >= host.max_jobs) return 'capacity' as const;
    const [job] = await query<CapabilityJob[]>`
      SELECT *
      FROM video_consultation_interpretation_jobs candidate
      WHERE candidate.runtime_profile = 'SELF_HOSTED_AGENT'
        AND candidate.desired_state = 'RUNNING'
        AND candidate.status = 'DISPATCHING'
        AND candidate.self_host_id IS NULL
        AND candidate.self_host_claim_deadline_at > now()
        AND candidate.provider_model IS NOT NULL
        AND candidate.provider_endpoint IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM video_consultation_interpretation_allowlist allowlist
          JOIN video_interpretation_release_approvals approval
            ON approval.id = allowlist.release_approval_id
          WHERE allowlist.consultation_id = candidate.consultation_id
            AND approval.id = candidate.release_approval_id
            AND allowlist.enabled = true AND allowlist.revoked_at IS NULL
            AND allowlist.expires_at > now()
            AND approval.revoked_at IS NULL AND approval.expires_at > now()
            AND approval.privacy_verified = true
            AND approval.observability_disabled = true
            AND approval.retention_verified = true
            AND (candidate.data_classification <> 'REAL_PATIENT' OR approval.contracts_approved = true)
        )
      ORDER BY candidate.created_at
      LIMIT 1
      FOR UPDATE OF candidate SKIP LOCKED
    `;
    if (!job) return 'empty' as const;
    if (job.data_classification === 'REAL_PATIENT'
      && !VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED) return 'empty' as const;
    const startedAtMs = job.started_at ? new Date(job.started_at).getTime() : Date.now();
    const applicationDeadlineAt = new Date(
      startedAtMs + Math.min(job.maximum_ai_duration_seconds ?? 1800, 7200) * 1_000,
    ).toISOString();
    if (new Date(applicationDeadlineAt).getTime() <= Date.now()) return 'expired' as const;
    const capabilityExpiresAt = new Date(new Date(applicationDeadlineAt).getTime() + 5 * 60_000).toISOString();
    const dispatchId = `self-host-${createOpaqueSecret(12)}`;
    const [claimed] = await query<CapabilityJob[]>`
      UPDATE video_consultation_interpretation_jobs
      SET self_host_id = ${hostId},
          self_host_credential_version = ${Number(host.credential_version)},
          lease_version = COALESCE(lease_version, 0) + 1,
          lease_expires_at = LEAST(
            now() + ${SELF_HOST_LEASE_SECONDS} * interval '1 second',
            COALESCE(started_at, now()) + maximum_ai_duration_seconds * interval '1 second'
          ),
          agent_identity_revoked_at = NULL,
          dispatch_id = ${dispatchId}, exchange_available = false,
          job_capability_digest = ${digestSecret(capability)},
          capability_expires_at = ${capabilityExpiresAt}, status = 'ACTIVE',
          self_host_claim_deadline_at = NULL,
          started_at = COALESCE(started_at, now()), updated_at = now()
      WHERE id = ${job.id} AND status = 'DISPATCHING' AND self_host_id IS NULL
        AND self_host_claim_deadline_at > now()
        AND EXISTS (
          SELECT 1
          FROM video_consultation_interpretation_allowlist allowlist
          JOIN video_interpretation_release_approvals approval
            ON approval.id = allowlist.release_approval_id
          WHERE allowlist.consultation_id = video_consultation_interpretation_jobs.consultation_id
            AND approval.id = video_consultation_interpretation_jobs.release_approval_id
            AND approval.data_classification = video_consultation_interpretation_jobs.data_classification
            AND allowlist.enabled = true AND allowlist.revoked_at IS NULL
            AND allowlist.expires_at > now()
            AND approval.revoked_at IS NULL AND approval.expires_at > now()
            AND approval.privacy_verified = true
            AND approval.observability_disabled = true
            AND approval.retention_verified = true
            AND (video_consultation_interpretation_jobs.data_classification <> 'REAL_PATIENT'
              OR approval.contracts_approved = true)
        )
      RETURNING *
    `;
    if (!claimed) return 'empty' as const;
    await query`
      UPDATE video_interpretation_self_hosts SET last_heartbeat_at = now() WHERE id = ${hostId}
    `;
    await query`
      INSERT INTO video_consultation_interpretation_events (
        job_id, event_type, actor_type, actor_id, execution_version, details
      ) VALUES (
        ${claimed.id}, 'CLAIM', 'AGENT', ${hostId}, ${claimed.agent_execution_version},
        jsonb_build_object(
          'leaseVersion', ${Number(claimed.lease_version)},
          'credentialVersion', ${Number(host.credential_version)}
        )
      )
    `;
    return { claimed, applicationDeadlineAt, capabilityExpiresAt };
  });
  if (claim === 'unauthorized') return c.json({ success: false, error: 'host_authorization_rejected' }, 401);
  if (claim === 'capacity') return c.json({ success: true, job: null, retryAfterSeconds: SELF_HOST_HEARTBEAT_SECONDS });
  if (claim === 'empty' || claim === 'expired') {
    return c.json({ success: true, job: null, retryAfterSeconds: SELF_HOST_HEARTBEAT_SECONDS });
  }

  const { claimed, applicationDeadlineAt, capabilityExpiresAt } = claim;
  let tokenTtlSeconds: number;
  try {
    tokenTtlSeconds = selfHostedJoinTokenTtlSeconds(claimed.lease_expires_at!);
  } catch {
    return c.json({ success: false, error: 'lease_expired_before_token_issue' }, 503);
  }
  const token = new AccessToken(livekitConfig.apiKey, livekitConfig.apiSecret, {
    identity: claimed.agent_identity,
    name: 'Medora self-hosted interpretation',
    ttl: tokenTtlSeconds,
  });
  token.addGrant({
    room: claimed.room_name,
    roomJoin: true,
    roomAdmin: false,
    roomList: false,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });
  return c.json({
    success: true,
    capability,
    capabilityExpiresAt,
    livekitUrl: livekitConfig.livekitUrl,
    livekitToken: await token.toJwt(),
    job: {
      id: claimed.id,
      roomName: claimed.room_name,
      roomGeneration: claimed.room_generation,
      interpretationGeneration: claimed.interpretation_generation,
      executionVersion: claimed.agent_execution_version,
      authorizationRevision: Number(claimed.authorization_revision),
      providerProfile: claimed.provider_profile,
      providerModel: claimed.provider_model,
      providerEndpoint: claimed.provider_endpoint,
      agentIdentity: claimed.agent_identity,
      applicationDeadlineAt,
      leaseVersion: Number(claimed.lease_version),
    },
    watchdog: {
      intervalMs: WATCHDOG_INTERVAL_MS,
      maxRttMs: WATCHDOG_MAX_RTT_MS,
      authorizationTtlMs: WATCHDOG_AUTHORIZATION_TTL_MS,
    },
    heartbeat: {
      intervalSeconds: SELF_HOST_HEARTBEAT_SECONDS,
      leaseSeconds: SELF_HOST_LEASE_SECONDS,
    },
  });
});

app.post('/api/v2/internal/video-interpretation/reconcile-lifecycle', async (c) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!secret || secret !== getServerEnv().INTERNAL_API_SECRET) {
    return c.json({ success: false, error: 'internal_authorization_rejected' }, 401);
  }
  const requestedProfile = c.req.query('profile');
  if (requestedProfile !== 'HOSTED'
    && requestedProfile !== 'SELF_HOSTED_FENCE'
    && requestedProfile !== 'SELF_HOSTED_CLEANUP') {
    return c.json({ success: false, error: 'invalid_reconcile_profile' }, 400);
  }
  const profile: ReconcileProfile = requestedProfile;
  const sql = sqlClient();
  const run = await acquireReconcileRun(sql, profile);
  if (!run) return c.json({ success: true, profile, alreadyRunning: true });
  let outcomeRecorded = false;
  try {
    if (profile === 'SELF_HOSTED_FENCE') {
      await fenceExpiredOrUnauthorizedUnclaimedSelfHostedJobs(sql);
      await fenceUnauthorizedSelfHostedExecutions(sql);
      await fenceExpiredSelfHostedLeases(sql);
      outcomeRecorded = await run.markSucceeded();
      if (!outcomeRecorded) {
        return c.json({ success: false, profile, error: 'reconcile_lease_lost' }, 503);
      }
      return c.json({ success: true, profile, alreadyRunning: false });
    }
    const config = readLiveKitConfig();
    const livekit = new LiveKitAPI({
      host: liveKitApiHost(config.livekitUrl),
      apiKey: config.apiKey,
      secret: config.apiSecret,
      requestTimeout: LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS,
      failover: false,
    });
    const outcome = profile === 'HOSTED'
      ? await prepareHostedTerminations(sql, livekit, run)
      : await cleanupFencedSelfHostedExecutions(sql, livekit, run);
    if (outcome.incomplete || outcome.retryableFailureCount > 0) {
      const errorCode = outcome.incomplete
        ? 'RECONCILE_PASS_INCOMPLETE'
        : 'REMOTE_CLEANUP_RETRY_REQUIRED';
      outcomeRecorded = await run.markFailed(errorCode);
      return c.json({ success: false, profile, error: 'reconcile_pass_incomplete' }, 503);
    }
    outcomeRecorded = await run.markSucceeded();
    if (!outcomeRecorded) {
      return c.json({ success: false, profile, error: 'reconcile_lease_lost' }, 503);
    }
    return c.json({ success: true, profile, alreadyRunning: false });
  } catch (error) {
    if (!outcomeRecorded) {
      try {
        outcomeRecorded = await run.markFailed('RECONCILE_PASS_EXCEPTION');
      } catch {
        // Preserve the original exception. With no newer successful outcome,
        // START remains fail-closed even when failure recording also fails.
      }
    }
    throw error;
  } finally {
    await run.release();
  }
});

app.post('/api/v2/internal/video-interpretation/self-hosts/:hostId/heartbeat', async (c) => {
  const hostId = idSchema.parse(c.req.param('hostId'));
  const hostBearer = bearer(c);
  const body = selfHostHeartbeatSchema.parse(await c.req.json());
  if (!hostBearer) return c.json({ success: false, error: 'host_authorization_rejected' }, 401);
  const sql = sqlClient();
  const result = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    const [host] = await query<{
      bearer_secret_digest: string;
      credential_version: string | number;
      enabled: boolean;
      revoked_at: string | null;
    }[]>`
      SELECT bearer_secret_digest, credential_version, enabled, revoked_at
      FROM video_interpretation_self_hosts WHERE id = ${hostId} FOR UPDATE
    `;
    if (!host?.enabled || host.revoked_at
      || !secretDigestMatches(hostBearer, host.bearer_secret_digest)) return null;
    const [job] = await query<{ id: string; lease_expires_at: string }[]>`
      UPDATE video_consultation_interpretation_jobs
      SET lease_expires_at = LEAST(
            now() + ${SELF_HOST_LEASE_SECONDS} * interval '1 second',
            started_at + maximum_ai_duration_seconds * interval '1 second'
          ),
          updated_at = now()
      WHERE id = ${body.jobId}
        AND runtime_profile = 'SELF_HOSTED_AGENT'
        AND self_host_id = ${hostId}
        AND self_host_credential_version = ${Number(host.credential_version)}
        AND lease_version = ${body.leaseVersion}
        AND agent_execution_version = ${body.executionVersion}
        AND desired_state = 'RUNNING' AND status = 'ACTIVE'
        AND lease_expires_at > now()
        AND started_at IS NOT NULL
        AND started_at + maximum_ai_duration_seconds * interval '1 second' > now()
      RETURNING id, lease_expires_at
    `;
    if (!job) return null;
    await query`UPDATE video_interpretation_self_hosts SET last_heartbeat_at = now() WHERE id = ${hostId}`;
    return job;
  });
  if (!result) return c.json({ success: false, error: 'lease_rejected' }, 409);
  return c.json({ success: true, leaseExpiresAt: result.lease_expires_at });
});

app.post('/api/v2/internal/video-interpretation/jobs/:jobId/provider-sessions/:sessionId/activate', async (c) => {
  const jobId = idSchema.parse(c.req.param('jobId'));
  const sessionId = idSchema.parse(c.req.param('sessionId'));
  const body = providerActivateSchema.parse(await c.req.json());
  const job = await authorizedJob(jobId, bearer(c));
  if (!job || job.desired_state !== 'RUNNING' || job.status !== 'ACTIVE') {
    return c.json({ success: false, error: 'authorization_rejected' }, 401);
  }
  const sql = sqlClient();
  const [activated] = await sql<{ id: string; state: string }[]>`
    UPDATE video_consultation_provider_sessions session
    SET state = 'ACTIVE', provider_session_reference = ${body.providerSessionReference},
        last_seen_at = now(), updated_at = now()
    FROM video_consultation_source_tracks track
    WHERE session.id = ${sessionId} AND session.job_id = ${jobId}
      AND session.agent_execution_version = ${job.agent_execution_version}
      AND session.state = 'CREATING' AND session.application_deadline_at > now()
      AND track.id = session.source_track_id AND track.authorized = true
      AND track.unpublished_at IS NULL
    RETURNING session.id, session.state
  `;
  if (!activated) return c.json({ success: false, error: 'provider_session_not_activatable' }, 409);
  return c.json({ success: true, providerSession: activated });
});

app.post('/api/v2/internal/video-interpretation/jobs/:id/authorization', async (c) => {
  const jobId = idSchema.parse(c.req.param('id'));
  const body = watchdogSchema.parse(await c.req.json());
  const capability = bearer(c);
  if (!capability) return c.json({ success: false, authorized: false, error: 'authorization_rejected' }, 401);
  const job = await authorizedJob(jobId, capability);
  if (!job || job.desired_state !== 'RUNNING' || job.status !== 'ACTIVE') {
    return c.json({ success: false, authorized: false, error: 'authorization_rejected' }, 401);
  }
  if (!job.started_at || Date.now() >= new Date(job.started_at).getTime()
    + (job.maximum_ai_duration_seconds ?? 0) * 1_000) {
    return c.json({ success: false, authorized: false, error: 'application_deadline_elapsed' }, 403);
  }
  let snapshot: AuthorizationSnapshot | null;
  try {
    snapshot = await reconcileSourceTracks(job, capability);
  } catch {
    // A stale room listing must never extend source-track authority.
    return c.json({ success: false, authorized: false, error: 'livekit_track_authority_unavailable' }, 503);
  }
  if (!snapshot) {
    return c.json({ success: false, authorized: false, error: 'authorization_rejected' }, 401);
  }
  const { job: jobSnapshot, tracks, authorizationRevision } = snapshot;
  return c.json({
    success: true,
    authorized: true,
    requestSeq: body.requestSeq,
    nonce: body.nonce,
    jobId,
    roomName: jobSnapshot.room_name,
    roomGeneration: jobSnapshot.room_generation,
    interpretationGeneration: jobSnapshot.interpretation_generation,
    executionVersion: jobSnapshot.agent_execution_version,
    authorizationRevision,
    tracks: tracks.map((track) => ({
      id: track.id,
      participantIdentity: track.participant_identity,
      trackSid: track.track_sid,
      sourceLanguage: track.expected_source_language,
      targetLanguage: track.target_language,
      languageVersion: track.language_version,
      consentVersion: track.consent_version,
      authorizationRevision: Number(track.authorization_revision),
      authorized: track.authorized,
    })),
  });
});

app.post('/api/v2/internal/video-interpretation/jobs/:id/provider-sessions', async (c) => {
  const jobId = idSchema.parse(c.req.param('id'));
  const body = providerOpenSchema.parse(await c.req.json());
  const capability = bearer(c);
  if (!capability) return c.json({ success: false, error: 'authorization_rejected' }, 401);
  const sql = sqlClient();
  try {
    const created = await sql.begin(async (tx) => {
      const query = tx as unknown as typeof sql;
      const [job] = await query<CapabilityJob[]>`
        SELECT id, consultation_id, room_name, room_generation, interpretation_generation,
               agent_execution_version, authorization_revision, desired_state, status,
               provider_profile, agent_identity, dispatch_id, job_capability_digest,
               capability_expires_at, source_language, target_language,
               consent_policy_version, created_by_principal_id,
               maximum_ai_duration_seconds, started_at, runtime_profile, self_host_id,
               self_host_credential_version, lease_version, lease_expires_at,
               provider_rate_microdollars_per_minute, hard_budget_microdollars,
               data_classification, release_approval_id, provider_model, provider_endpoint
        FROM video_consultation_interpretation_jobs
        WHERE id = ${jobId}
          AND desired_state = 'RUNNING'
          AND status = 'ACTIVE'
          AND capability_expires_at > now()
          AND EXISTS (
            SELECT 1
            FROM video_consultation_interpretation_allowlist allowlist
            JOIN video_interpretation_release_approvals approval
              ON approval.id = allowlist.release_approval_id
            WHERE allowlist.consultation_id = video_consultation_interpretation_jobs.consultation_id
              AND approval.id = video_consultation_interpretation_jobs.release_approval_id
              AND allowlist.enabled = true AND allowlist.revoked_at IS NULL
              AND allowlist.expires_at > now()
              AND approval.revoked_at IS NULL AND approval.expires_at > now()
              AND approval.privacy_verified = true
              AND approval.observability_disabled = true
              AND approval.retention_verified = true
              AND (video_consultation_interpretation_jobs.data_classification <> 'REAL_PATIENT'
                OR approval.contracts_approved = true)
          )
        FOR UPDATE
      `;
      if (!job?.job_capability_digest || !secretDigestMatches(capability, job.job_capability_digest)) {
        return 'unauthorized' as const;
      }
      if (job.runtime_profile === 'SELF_HOSTED_AGENT'
        && (!job.lease_expires_at || new Date(job.lease_expires_at).getTime() <= Date.now())) {
        return 'unauthorized' as const;
      }
      if (job.provider_profile !== body.providerProfile) return 'profile' as const;
      if (!job.started_at) return 'deadline' as const;
      const applicationDeadlineAt = new Date(
        new Date(job.started_at).getTime() + (job.maximum_ai_duration_seconds ?? 0) * 1_000,
      ).toISOString();
      if (Date.now() >= new Date(applicationDeadlineAt).getTime()
        || new Date(body.applicationDeadlineAt).getTime() > new Date(applicationDeadlineAt).getTime()) {
        return 'deadline' as const;
      }
      await query`SELECT pg_advisory_xact_lock(hashtext(${`video_interpretation_provider_slots:${jobId}`}))`;
      await reconcileExpiredProviderSessions(query, { jobId });
      const [track] = await query<{
        id: string;
        expected_source_language: string;
        target_language: string;
        language_version: number;
      }[]>`
        SELECT id, expected_source_language, target_language, language_version
        FROM video_consultation_source_tracks
        WHERE id = ${body.sourceTrackId} AND job_id = ${jobId}
          AND authorized = true AND unpublished_at IS NULL
        FOR UPDATE
      `;
      if (!track) return null;
      const capacityRows = await query<{ active_count: number }[]>`
        SELECT count(*)::int AS active_count
        FROM video_consultation_provider_sessions
        WHERE job_id = ${jobId} AND state IN ('CREATING', 'ACTIVE', 'CLOSING', 'ORPHAN_WAIT')
      `;
      const activeCount = capacityRows[0]?.active_count ?? MAX_PROVIDER_SESSIONS_PER_ROOM;
      if (activeCount >= MAX_PROVIDER_SESSIONS_PER_ROOM) return 'capacity' as const;
      const [session] = await query<{ id: string; state: string }[]>`
        INSERT INTO video_consultation_provider_sessions (
          job_id, source_track_id, provider, provider_profile,
          room_generation, interpretation_generation, source_language, target_language,
          language_version, agent_execution_version, state,
          application_deadline_at, provider_expires_at, last_seen_at
        ) VALUES (
          ${jobId}, ${track.id}, ${body.provider}, ${body.providerProfile},
          ${job.room_generation}, ${job.interpretation_generation},
          ${track.expected_source_language}, ${track.target_language},
          ${track.language_version}, ${job.agent_execution_version}, 'CREATING',
          ${applicationDeadlineAt},
          now() + ${OPENAI_TRANSLATION_CONSERVATIVE_EXPIRY_SECONDS} * interval '1 second',
          now()
        )
        RETURNING id, state
      `;
      return session!;
    });
    if (created === 'unauthorized') return c.json({ success: false, error: 'authorization_rejected' }, 401);
    if (created === 'profile') return c.json({ success: false, error: 'provider_profile_not_enabled' }, 409);
    if (created === 'deadline') return c.json({ success: false, error: 'application_deadline_elapsed' }, 409);
    if (!created) return c.json({ success: false, error: 'source_track_not_authorized' }, 409);
    if (created === 'capacity') return c.json({ success: false, error: 'AI_CAPACITY_UNAVAILABLE_FOR_SPEAKER' }, 409);
    return c.json({ success: true, providerSession: created }, 201);
  } catch (error) {
    if (error instanceof Error && /active_fence_idx|duplicate key/i.test(error.message)) {
      return c.json({ success: false, error: 'provider_session_fence_active' }, 409);
    }
    throw error;
  }
});

app.post('/api/v2/internal/video-interpretation/jobs/:jobId/provider-sessions/:sessionId/close', async (c) => {
  const jobId = idSchema.parse(c.req.param('jobId'));
  const sessionId = idSchema.parse(c.req.param('sessionId'));
  const job = await authorizedJob(jobId, bearer(c));
  if (!job) return c.json({ success: false, error: 'authorization_rejected' }, 401);
  const body = z.discriminatedUnion('state', [
    z.object({ state: z.literal('CLOSING'), closeResult: z.string().max(160).optional() }),
    z.object({
      state: z.literal('CLOSED'),
      // The adapter must persist the provider's close acknowledgement/reference;
      // a local timeout or exception is not closure evidence.
      providerCloseReference: z.string().min(1).max(160),
    }),
    z.object({
      state: z.literal('ORPHAN_WAIT'),
      closeResult: z.string().min(1).max(160),
    }),
  ]).parse(await c.req.json());
  const sql = sqlClient();
  const allowedCurrentStates = providerSessionAllowedCurrentStates(body.state);
  const closeResult = body.state === 'CLOSED' ? body.providerCloseReference : body.closeResult;
  const [closed] = await sql<{ id: string; state: string }[]>`
    UPDATE video_consultation_provider_sessions
    SET state = ${body.state}, close_result = ${closeResult ?? null},
        closed_at = CASE WHEN ${body.state} = 'CLOSED' THEN now() ELSE closed_at END,
        orphan_risk = ${body.state === 'ORPHAN_WAIT'}, updated_at = now()
    WHERE id = ${sessionId} AND job_id = ${jobId}
      AND agent_execution_version = ${job.agent_execution_version}
      AND state = ANY(${sql.array(allowedCurrentStates)}::text[])
    RETURNING id, state
  `;
  if (!closed) return c.json({ success: false, error: 'provider_session_not_mutable' }, 409);
  return c.json({ success: true, providerSession: closed });
});

export default app;
