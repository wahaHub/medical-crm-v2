import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import {
  createOpaqueSecret,
  digestSecret,
  MAX_PROVIDER_SESSIONS_PER_ROOM,
  providerSessionAllowedCurrentStates,
  secretDigestMatches,
  WATCHDOG_AUTHORIZATION_TTL_MS,
  WATCHDOG_INTERVAL_MS,
  WATCHDOG_MAX_RTT_MS,
} from '../video-interpretation/security.js';

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
  providerExpiresAt: z.string().datetime().nullable().optional(),
});

interface CapabilityJob {
  id: string;
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
    SELECT id, room_name, room_generation, interpretation_generation,
           agent_execution_version, authorization_revision, desired_state, status,
           provider_profile, agent_identity, dispatch_id, job_capability_digest,
           capability_expires_at
    FROM video_consultation_interpretation_jobs
    WHERE id = ${jobId}
  `;
  if (!job?.job_capability_digest || !secretDigestMatches(capability, job.job_capability_digest)) return null;
  if (!job.capability_expires_at || new Date(job.capability_expires_at).getTime() <= Date.now()) return null;
  return job;
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
             j.capability_expires_at, j.maximum_ai_duration_seconds
      FROM video_consultation_interpretation_jobs j
      WHERE j.id = ${body.jobId}
        AND j.hosted_deployment_id = ${locator.hosted_deployment_id}
      FOR UPDATE OF j
    `;
    const matches = candidate
      && deployment.enabled
      && !deployment.revoked_at
      && secretDigestMatches(body.bootstrapSecret, deployment.bootstrap_secret_digest)
      && candidate.desired_state === 'RUNNING'
      && candidate.status === 'AWAITING_AGENT'
      && candidate.dispatch_id === body.dispatchId
      && candidate.room_name === body.roomName
      && candidate.room_generation === body.roomGeneration
      && candidate.interpretation_generation === body.interpretationGeneration
      && candidate.agent_execution_version === body.executionVersion
      && candidate.agent_identity === body.agentIdentity
      && !candidate.job_capability_digest;
    if (!matches) return null;

    const expiresAt = new Date(
      Date.now() + Math.min(candidate.maximum_ai_duration_seconds ?? 1800, 7200) * 1_000 + 5 * 60_000,
    ).toISOString();
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
    return { claimed, expiresAt };
  });
  if (!claimedResult) return c.json({ success: false, error: 'bootstrap_rejected' }, 401);
  const { claimed, expiresAt } = claimedResult;
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
      agentIdentity: claimed.agent_identity,
    },
    watchdog: {
      intervalMs: WATCHDOG_INTERVAL_MS,
      maxRttMs: WATCHDOG_MAX_RTT_MS,
      authorizationTtlMs: WATCHDOG_AUTHORIZATION_TTL_MS,
    },
  });
});

app.post('/api/v2/internal/video-interpretation/jobs/:id/authorization', async (c) => {
  const jobId = idSchema.parse(c.req.param('id'));
  const body = watchdogSchema.parse(await c.req.json());
  const job = await authorizedJob(jobId, bearer(c));
  if (!job || job.desired_state !== 'RUNNING' || job.status !== 'ACTIVE') {
    return c.json({ success: false, authorized: false, error: 'authorization_rejected' }, 401);
  }
  const sql = sqlClient();
  const tracks = await sql<{
    id: string;
    participant_identity: string;
    track_sid: string;
    expected_source_language: string;
    target_language: string;
    language_version: number;
    consent_version: number;
    authorization_revision: string | number;
    authorized: boolean;
  }[]>`
    SELECT id, participant_identity, track_sid, expected_source_language, target_language,
           language_version, consent_version, authorization_revision, authorized
    FROM video_consultation_source_tracks
    WHERE job_id = ${jobId} AND unpublished_at IS NULL
    ORDER BY participant_identity, track_sid
  `;
  return c.json({
    success: true,
    authorized: true,
    requestSeq: body.requestSeq,
    nonce: body.nonce,
    jobId,
    roomName: job.room_name,
    roomGeneration: job.room_generation,
    interpretationGeneration: job.interpretation_generation,
    executionVersion: job.agent_execution_version,
    authorizationRevision: Number(job.authorization_revision),
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
        SELECT id, room_name, room_generation, interpretation_generation,
               agent_execution_version, authorization_revision, desired_state, status,
               provider_profile, agent_identity, dispatch_id, job_capability_digest,
               capability_expires_at
        FROM video_consultation_interpretation_jobs
        WHERE id = ${jobId}
          AND desired_state = 'RUNNING'
          AND status = 'ACTIVE'
          AND capability_expires_at > now()
        FOR UPDATE
      `;
      if (!job?.job_capability_digest || !secretDigestMatches(capability, job.job_capability_digest)) {
        return 'unauthorized' as const;
      }
      if (job.provider_profile !== body.providerProfile) return 'profile' as const;
      await query`SELECT pg_advisory_xact_lock(hashtext(${`video_interpretation_provider_slots:${jobId}`}))`;
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
          ${body.applicationDeadlineAt}, ${body.providerExpiresAt ?? null}, now()
        )
        RETURNING id, state
      `;
      return session!;
    });
    if (created === 'unauthorized') return c.json({ success: false, error: 'authorization_rejected' }, 401);
    if (created === 'profile') return c.json({ success: false, error: 'provider_profile_not_enabled' }, 409);
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
      providerExpiresAt: z.string().datetime().nullable().optional(),
    }),
    z.object({
      state: z.literal('ORPHAN_WAIT'),
      closeResult: z.string().min(1).max(160),
      providerExpiresAt: z.string().datetime().nullable().optional(),
    }),
  ]).parse(await c.req.json());
  const sql = sqlClient();
  const allowedCurrentStates = providerSessionAllowedCurrentStates(body.state);
  const closeResult = body.state === 'CLOSED' ? body.providerCloseReference : body.closeResult;
  const providerExpiresAt = 'providerExpiresAt' in body ? body.providerExpiresAt ?? null : null;
  const [closed] = await sql<{ id: string; state: string }[]>`
    UPDATE video_consultation_provider_sessions
    SET state = ${body.state}, close_result = ${closeResult ?? null},
        provider_expires_at = COALESCE(${providerExpiresAt}, provider_expires_at),
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
