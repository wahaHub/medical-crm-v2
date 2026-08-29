import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { AccessToken, LiveKitAPI } from 'livekit-server-sdk';
import {
  approvedProviderProfile,
  digestSecret,
  INTERPRETATION_POLICY_VERSION,
  interpretationFeatureEnabled,
  MAX_ACTIVE_AI_ROOMS,
  normalizeLaunchLanguage,
  oppositeLanguage,
  readHostedAgentConfig,
  readLiveKitConfig,
  VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED,
} from '../video-interpretation/security.js';
import { reconcileExpiredProviderSessions } from '../video-interpretation/provider-session-reconciliation.js';

const app = new Hono();
const idSchema = z.string().uuid();
const consentSchema = z.object({
  participantIdentities: z.array(z.string().min(1).max(160)).min(2).max(8),
  policyVersion: z.literal(INTERPRETATION_POLICY_VERSION),
  witnessConfirmed: z.literal(true),
});
const revokeConsentSchema = z.object({
  participantIdentity: z.string().min(1).max(160),
  policyVersion: z.literal(INTERPRETATION_POLICY_VERSION),
  witnessConfirmed: z.literal(true),
});
const startSchema = z.object({
  sourceLanguage: z.enum(['zh', 'en']).optional(),
  maximumAiDurationSeconds: z.number().int().min(60).max(7200).default(1800),
});

interface ConsultationRow {
  id: string;
  room_name: string;
  room_generation: number;
  status: string;
  host_identity: string | null;
  patient_language: string | null;
}

interface JobRow {
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
  source_language: 'zh' | 'en';
  target_language: 'zh' | 'en';
  agent_identity: string;
  dispatch_id: string | null;
  failure_code: string | null;
  created_at: string;
  started_at: string | null;
  stopped_at: string | null;
}

function sqlClient() {
  return getCrmDb().$client;
}

function requireOperator(c: Context) {
  const actor = toActor(c.get('session') as Session);
  if (actor.role !== 'ADMIN') {
    // Hospital/doctor membership is not yet represented by the legacy video
    // consultation table. Fail closed instead of granting cross-hospital room access.
    throw new HTTPException(403, { message: 'Video interpretation currently requires an admin operator' });
  }
  return actor;
}

function liveKitApiHost(url: string): string {
  return url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

async function loadConsultation(id: string): Promise<ConsultationRow> {
  const sql = sqlClient();
  const [consultation] = await sql<ConsultationRow[]>`
    SELECT id, room_name, room_generation, status, host_identity, patient_language
    FROM video_consultations
    WHERE id = ${id}
  `;
  if (!consultation) throw new HTTPException(404, { message: 'Video consultation not found' });
  return consultation;
}

function publicJob(job: JobRow) {
  return {
    id: job.id,
    consultationId: job.consultation_id,
    roomName: job.room_name,
    roomGeneration: job.room_generation,
    interpretationGeneration: job.interpretation_generation,
    executionVersion: job.agent_execution_version,
    authorizationRevision: Number(job.authorization_revision),
    desiredState: job.desired_state,
    status: job.status,
    providerProfile: job.provider_profile,
    sourceLanguage: job.source_language,
    targetLanguage: job.target_language,
    agentIdentity: job.agent_identity,
    failureCode: job.failure_code,
    createdAt: job.created_at,
    startedAt: job.started_at,
    stoppedAt: job.stopped_at,
  };
}

app.post('/api/v2/video-consultations/:id/token', async (c) => {
  const actor = requireOperator(c);
  const consultationId = idSchema.parse(c.req.param('id'));
  const consultation = await loadConsultation(consultationId);
  if (!['SCHEDULED', 'IN_PROGRESS'].includes(consultation.status)) {
    throw new HTTPException(409, { message: 'Consultation is not open for joining' });
  }

  const config = readLiveKitConfig();
  const identity = `operator-${actor.userId}-${consultation.id}`;
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name: actor.email,
    ttl: 15 * 60,
  });
  token.addGrant({
    room: consultation.room_name,
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
    token: await token.toJwt(),
    livekitUrl: config.livekitUrl,
    identity,
    roomName: consultation.room_name,
  });
});

app.post('/api/v2/video-consultations/:id/interpretation/consents', async (c) => {
  const actor = requireOperator(c);
  const consultationId = idSchema.parse(c.req.param('id'));
  const body = consentSchema.parse(await c.req.json());
  const identities = [...new Set(body.participantIdentities)];
  if (identities.length !== body.participantIdentities.length) {
    throw new HTTPException(400, { message: 'Duplicate participant identity' });
  }
  const sql = sqlClient();
  const result = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    // All consent mutations serialize in consultation -> active job -> consent
    // order. A delayed legacy GRANT therefore observes a completed REVOKE and
    // cannot silently turn it back into GRANTED.
    const [consultation] = await query<ConsultationRow[]>`
      SELECT id, room_name, room_generation, status, host_identity, patient_language
      FROM video_consultations
      WHERE id = ${consultationId}
      FOR UPDATE
    `;
    if (!consultation) return { kind: 'missing_consultation' as const };
    const [job] = await query<{ id: string; agent_execution_version: number }[]>`
      SELECT id, agent_execution_version
      FROM video_consultation_interpretation_jobs
      WHERE consultation_id = ${consultationId}
        AND desired_state = 'RUNNING'
        AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
      ORDER BY interpretation_generation DESC
      LIMIT 1
      FOR UPDATE
    `;
    const admitted = await query<{ identity: string }[]>`
      SELECT DISTINCT identity
      FROM video_consultation_participants
      WHERE consultation_id = ${consultationId}
        AND left_at IS NULL
    `;
    const allowed = new Set(admitted.map((row) => row.identity));
    if (consultation.host_identity) allowed.add(consultation.host_identity);
    allowed.add(`operator-${actor.userId}-${consultation.id}`);
    const disallowed = identities.find((identity) => !allowed.has(identity));
    if (disallowed) return { kind: 'not_admitted' as const, identity: disallowed };

    const current = await query<{ participant_identity: string; state: string; version: string | number }[]>`
      SELECT participant_identity, state, version
      FROM video_consultation_ai_consents
      WHERE consultation_id = ${consultationId}
        AND policy_version = ${body.policyVersion}
        AND participant_identity = ANY(${query.array(identities)}::text[])
      ORDER BY participant_identity
      FOR UPDATE
    `;
    const existingByIdentity = new Map(current.map((row) => [row.participant_identity, row]));
    const requiresReconsent = current.find((row) => row.state !== 'GRANTED');
    if (requiresReconsent) {
      return {
        kind: 'explicit_reconsent_required' as const,
        identity: requiresReconsent.participant_identity,
        version: Number(requiresReconsent.version),
      };
    }

    const created: Array<{ participantIdentity: string; version: number }> = [];
    for (const identity of identities) {
      if (existingByIdentity.has(identity)) continue;
      await query`
        INSERT INTO video_consultation_ai_consents (
          consultation_id, participant_identity, policy_version, state, version, recorded_by_principal_id
        ) VALUES (
          ${consultationId}, ${identity}, ${body.policyVersion}, 'GRANTED', 1, ${actor.userId}
        )
      `;
      created.push({ participantIdentity: identity, version: 1 });
    }

    if (job && created.length > 0) {
      const [revision] = await query<{ authorization_revision: string | number }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET authorization_revision = authorization_revision + 1, updated_at = now()
        WHERE id = ${job.id}
        RETURNING authorization_revision
      `;
      if (!revision) throw new Error('failed to advance authorization revision');
      await query`
        INSERT INTO video_consultation_interpretation_events (
          job_id, event_type, actor_type, actor_id, execution_version, details
        ) VALUES (
          ${job.id}, 'CONSENT_CHANGED', 'PRINCIPAL', ${actor.userId},
          ${job.agent_execution_version},
          ${JSON.stringify({
            participantIdentities: created.map((row) => row.participantIdentity),
            state: 'GRANTED',
            policyVersion: body.policyVersion,
            authorizationRevision: Number(revision.authorization_revision),
          })}::jsonb
        )
      `;
    }
    return {
      kind: 'granted' as const,
      created,
      consents: identities.map((identity) => ({
        participantIdentity: identity,
        version: Number(existingByIdentity.get(identity)?.version ?? 1),
      })),
    };
  });

  if (result.kind === 'missing_consultation') {
    throw new HTTPException(404, { message: 'Video consultation not found' });
  }
  if (result.kind === 'not_admitted') {
    throw new HTTPException(409, { message: `Participant is not currently admitted: ${result.identity}` });
  }
  if (result.kind === 'explicit_reconsent_required') {
    return c.json({
      success: false,
      code: 'EXPLICIT_RECONSENT_REQUIRED',
      participantIdentity: result.identity,
      consentVersion: result.version,
    }, 409);
  }
  return c.json({
    success: true,
    policyVersion: body.policyVersion,
    granted: identities.length,
    created: result.created.length,
    consents: result.consents,
  });
});

app.post('/api/v2/video-consultations/:id/interpretation/consents/revoke', async (c) => {
  const actor = requireOperator(c);
  const consultationId = idSchema.parse(c.req.param('id'));
  const body = revokeConsentSchema.parse(await c.req.json());
  const sql = sqlClient();
  const result = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    // Preserve the consultation -> job -> consent/source lock order used by
    // START/STOP so revocation cannot splice two authorization revisions.
    const [consultation] = await query<{ id: string }[]>`
      SELECT id FROM video_consultations WHERE id = ${consultationId} FOR UPDATE
    `;
    if (!consultation) return 'missing_consultation' as const;
    const [job] = await query<{ id: string; agent_execution_version: number }[]>`
      SELECT id, agent_execution_version
      FROM video_consultation_interpretation_jobs
      WHERE consultation_id = ${consultationId}
        AND desired_state = 'RUNNING'
        AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
      ORDER BY interpretation_generation DESC
      LIMIT 1
      FOR UPDATE
    `;
    const [consent] = await query<{ id: string; state: string; version: string | number }[]>`
      SELECT id, state, version
      FROM video_consultation_ai_consents
      WHERE consultation_id = ${consultationId}
        AND participant_identity = ${body.participantIdentity}
        AND policy_version = ${body.policyVersion}
      FOR UPDATE
    `;
    if (!consent) return 'missing_consent' as const;
    if (consent.state === 'REVOKED') {
      return { kind: 'idempotent' as const, version: Number(consent.version) };
    }

    const [revokedConsent] = await query<{ version: string | number }[]>`
      UPDATE video_consultation_ai_consents
      SET state = 'REVOKED', revoked_at = now(), recorded_at = now(),
          recorded_by_principal_id = ${actor.userId}, version = version + 1
      WHERE id = ${consent.id}
      RETURNING version
    `;
    if (!revokedConsent) throw new Error('failed to advance consent version');
    const consentVersion = Number(revokedConsent.version);
    if (!job) return { kind: 'revoked' as const, version: consentVersion };
    const [revision] = await query<{ authorization_revision: string | number }[]>`
      UPDATE video_consultation_interpretation_jobs
      SET authorization_revision = authorization_revision + 1, updated_at = now()
      WHERE id = ${job.id}
      RETURNING authorization_revision
    `;
    if (!revision) throw new Error('failed to advance authorization revision');
    const nextRevision = Number(revision.authorization_revision);
    await query`
      UPDATE video_consultation_source_tracks
      SET authorized = false, consent_version = ${consentVersion},
          authorization_revision = ${nextRevision},
          unpublished_at = COALESCE(unpublished_at, now())
      WHERE job_id = ${job.id}
        AND participant_identity = ${body.participantIdentity}
        AND unpublished_at IS NULL
    `;
    await query`
      INSERT INTO video_consultation_interpretation_events (
        job_id, event_type, actor_type, actor_id, execution_version, details
      ) VALUES (
        ${job.id}, 'CONSENT_CHANGED', 'PRINCIPAL', ${actor.userId},
        ${job.agent_execution_version},
        jsonb_build_object(
          'participantIdentity', ${body.participantIdentity},
          'state', 'REVOKED',
          'policyVersion', ${body.policyVersion},
          'consentVersion', ${consentVersion},
          'authorizationRevision', ${nextRevision}
        )
      )
    `;
    return { kind: 'revoked' as const, version: consentVersion };
  });

  if (result === 'missing_consultation') {
    throw new HTTPException(404, { message: 'Video consultation not found' });
  }
  if (result === 'missing_consent') {
    throw new HTTPException(409, { message: 'No consent exists for this participant and policy' });
  }
  return c.json({
    success: true,
    policyVersion: body.policyVersion,
    participantIdentity: body.participantIdentity,
    consentVersion: typeof result === 'string' ? undefined : result.version,
    revoked: typeof result !== 'string' && result.kind === 'revoked',
    idempotent: typeof result !== 'string' && result.kind === 'idempotent',
  });
});

app.post('/api/v2/video-consultations/:id/interpretation/start', async (c) => {
  if (!interpretationFeatureEnabled()) {
    throw new HTTPException(503, { message: 'video_interpretation_disabled' });
  }
  if (!VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED) {
    // Keep this before authentication-dependent DB reads and every control-plane
    // mutation. Environment flags alone must never expose an incomplete media path.
    throw new HTTPException(503, { message: 'VIDEO_INTERPRETATION_SCAFFOLD_ONLY' });
  }
  const actor = requireOperator(c);
  const consultationId = idSchema.parse(c.req.param('id'));
  const body = startSchema.parse(await c.req.json().catch(() => ({})));
  const config = readHostedAgentConfig();
  const providerProfile = approvedProviderProfile();
  if (providerProfile === 'DISABLED') {
    throw new HTTPException(503, { message: 'AI_PROVIDER_NOT_APPROVED' });
  }
  const sql = sqlClient();
  const jobId = randomUUID();
  const agentIdentity = `translator-${jobId}`;

  const startResult = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    // Lock consultation first. Completion paths update this row before their
    // invalidation trigger touches jobs, so this also establishes a consistent
    // lock order and serializes simultaneous first START requests.
    const [consultation] = await query<ConsultationRow[]>`
      SELECT id, room_name, room_generation, status, host_identity, patient_language
      FROM video_consultations
      WHERE id = ${consultationId}
      FOR UPDATE
    `;
    if (!consultation) throw new HTTPException(404, { message: 'Video consultation not found' });
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(consultation.status)) {
      throw new HTTPException(409, { message: 'Consultation is not active' });
    }
    const sourceLanguage = body.sourceLanguage ?? normalizeLaunchLanguage(consultation.patient_language);
    if (!sourceLanguage) {
      throw new HTTPException(409, { message: 'A supported zh/en source language must be confirmed' });
    }
    const targetLanguage = oppositeLanguage(sourceLanguage);
    const [existing] = await query<JobRow[]>`
      SELECT * FROM video_consultation_interpretation_jobs
      WHERE consultation_id = ${consultationId}
        AND desired_state = 'RUNNING'
        AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
      ORDER BY interpretation_generation DESC
      LIMIT 1
      FOR UPDATE
    `;
    if (existing) return { job: existing, createdByThisRequest: false };

    await query`SELECT pg_advisory_xact_lock(hashtext('video_interpretation_capacity'))`;
    await reconcileExpiredProviderSessions(query, { consultationId });
    const [{ blocked_count: blockedProviderSessions } = { blocked_count: MAX_ACTIVE_AI_ROOMS }] = await query<{
      blocked_count: number;
    }[]>`
      SELECT count(*)::int AS blocked_count
      FROM video_consultation_provider_sessions ps
      JOIN video_consultation_interpretation_jobs old_job ON old_job.id = ps.job_id
      WHERE old_job.consultation_id = ${consultationId}
        AND ps.state IN ('CREATING', 'ACTIVE', 'CLOSING', 'ORPHAN_WAIT')
    `;
    if (blockedProviderSessions > 0) {
      throw new HTTPException(409, { message: 'PROVIDER_SESSION_CLOSURE_PENDING' });
    }
    const capacityRows = await query<{ active_count: number }[]>`
      SELECT count(*)::int AS active_count
      FROM video_consultation_interpretation_jobs
      WHERE desired_state = 'RUNNING'
        AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
    `;
    const activeCount = capacityRows[0]?.active_count ?? MAX_ACTIVE_AI_ROOMS;
    if (activeCount >= MAX_ACTIVE_AI_ROOMS) {
      throw new HTTPException(409, { message: 'AI_CAPACITY_UNAVAILABLE' });
    }

    const consentRows = await query<{ participant_identity: string }[]>`
      SELECT DISTINCT c.participant_identity
      FROM video_consultation_ai_consents c
      WHERE c.consultation_id = ${consultationId}
        AND c.policy_version = ${INTERPRETATION_POLICY_VERSION}
        AND c.state = 'GRANTED'
        AND (
          c.participant_identity = ${consultation.host_identity}
          OR c.participant_identity = ${`operator-${actor.userId}-${consultation.id}`}
          OR EXISTS (
            SELECT 1 FROM video_consultation_participants p
            WHERE p.consultation_id = c.consultation_id
              AND p.identity = c.participant_identity
              AND p.left_at IS NULL
          )
        )
    `;
    if (consentRows.length < 2) {
      throw new HTTPException(409, { message: 'AI_CONSENT_REQUIRED' });
    }

    const generationRows = await query<{ next_generation: number }[]>`
      SELECT COALESCE(MAX(interpretation_generation), 0)::int + 1 AS next_generation
      FROM video_consultation_interpretation_jobs
      WHERE consultation_id = ${consultationId} AND room_generation = ${consultation.room_generation}
    `;
    const generation = generationRows[0]?.next_generation;
    if (!generation) throw new Error('interpretation_generation_unavailable');
    // Provisioning, secret rotation, and revocation recovery are privileged
    // operational actions. A normal consultation START must never perform them.
    const [deployment] = await query<{ id: string }[]>`
      SELECT id
      FROM video_consultation_hosted_deployments
      WHERE deployment_name = ${config.deploymentName}
        AND bootstrap_secret_digest = ${digestSecret(config.bootstrapSecret)}
        AND enabled = true
        AND revoked_at IS NULL
      FOR UPDATE
    `;
    if (!deployment) {
      throw new HTTPException(503, { message: 'HOSTED_AGENT_DEPLOYMENT_UNAVAILABLE' });
    }

    const [created] = await query<JobRow[]>`
      INSERT INTO video_consultation_interpretation_jobs (
        id, consultation_id, room_name, room_generation, interpretation_generation,
        agent_execution_version, desired_state, status, provider_profile,
        source_language, target_language, consent_policy_version, agent_identity,
        hosted_deployment_id, maximum_ai_duration_seconds, created_by_principal_id
      ) VALUES (
        ${jobId}, ${consultationId}, ${consultation.room_name}, ${consultation.room_generation}, ${generation},
        1, 'RUNNING', 'DISPATCHING', ${providerProfile},
        ${sourceLanguage}, ${targetLanguage}, ${INTERPRETATION_POLICY_VERSION}, ${agentIdentity},
        ${deployment!.id}, ${body.maximumAiDurationSeconds}, ${actor.userId}
      )
      RETURNING *
    `;
    await query`
      INSERT INTO video_consultation_interpretation_events (
        job_id, event_type, actor_type, actor_id, execution_version, details
      ) VALUES (${jobId}, 'START', 'PRINCIPAL', ${actor.userId}, 1, ${JSON.stringify({ providerProfile })}::jsonb)
    `;
    return { job: created!, createdByThisRequest: true };
  });
  const { job } = startResult;

  if (!startResult.createdByThisRequest) {
    return c.json({ success: true, job: publicJob(job), idempotent: true });
  }

  const livekit = new LiveKitAPI({
    host: liveKitApiHost(config.livekitUrl),
    apiKey: config.apiKey,
    secret: config.apiSecret,
  });
  let createdDispatchId: string | null = null;
  try {
    const dispatch = await livekit.agentDispatch.createDispatch(
      job.room_name,
      config.deploymentName,
      {
        metadata: JSON.stringify({
          schema: 'medora.interpretation.dispatch.v1',
          jobId: job.id,
          roomName: job.room_name,
          roomGeneration: job.room_generation,
          interpretationGeneration: job.interpretation_generation,
          executionVersion: job.agent_execution_version,
          agentIdentity: job.agent_identity,
        }),
      },
    );
    createdDispatchId = dispatch.id;
    const updated = await sql.begin(async (tx) => {
      const query = tx as unknown as typeof sql;
      const [claimed] = await query<JobRow[]>`
        UPDATE video_consultation_interpretation_jobs
        SET dispatch_id = ${dispatch.id}, status = 'AWAITING_AGENT', updated_at = now()
        WHERE id = ${job.id}
          AND desired_state = 'RUNNING'
          AND status = 'DISPATCHING'
          AND dispatch_id IS NULL
          AND agent_execution_version = ${job.agent_execution_version}
        RETURNING *
      `;
      if (!claimed) return null;
      await query`
        INSERT INTO video_consultation_interpretation_events (
          job_id, event_type, actor_type, actor_id, execution_version, details
        ) VALUES (
          ${job.id}, 'DISPATCH', 'SYSTEM', NULL, ${job.agent_execution_version},
          ${JSON.stringify({ dispatchId: dispatch.id })}::jsonb
        )
      `;
      return claimed;
    });
    if (!updated) {
      await livekit.agentDispatch.deleteDispatch(dispatch.id, job.room_name).catch(() => undefined);
      throw new HTTPException(409, { message: 'Interpretation was stopped while dispatching' });
    }
    return c.json({
      success: true,
      job: publicJob(updated),
      providerReady: VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED,
    }, 201);
  } catch (error) {
    if (error instanceof HTTPException && error.status === 409) throw error;
    if (createdDispatchId) {
      await livekit.agentDispatch.deleteDispatch(createdDispatchId, job.room_name).catch(() => undefined);
    }
    await sql`
      UPDATE video_consultation_interpretation_jobs
      SET desired_state = 'STOPPED', status = 'FAILED', failure_code = 'LIVEKIT_DISPATCH_FAILED',
          exchange_available = false, agent_execution_version = agent_execution_version + 1,
          authorization_revision = authorization_revision + 1, stopped_at = now(), updated_at = now()
      WHERE id = ${job.id}
        AND desired_state = 'RUNNING'
        AND status = 'DISPATCHING'
        AND dispatch_id IS NULL
        AND agent_execution_version = ${job.agent_execution_version}
    `;
    throw error;
  }
});

app.get('/api/v2/video-consultations/:id/interpretation', async (c) => {
  requireOperator(c);
  const consultationId = idSchema.parse(c.req.param('id'));
  const sql = sqlClient();
  const [job] = await sql<JobRow[]>`
    SELECT * FROM video_consultation_interpretation_jobs
    WHERE consultation_id = ${consultationId}
    ORDER BY interpretation_generation DESC
    LIMIT 1
  `;
  return c.json({ success: true, job: job ? publicJob(job) : null });
});

app.post('/api/v2/video-consultations/:id/interpretation/stop', async (c) => {
  const actor = requireOperator(c);
  const consultationId = idSchema.parse(c.req.param('id'));
  const sql = sqlClient();
  const job = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    const [current] = await query<JobRow[]>`
      SELECT *
      FROM video_consultation_interpretation_jobs
      WHERE consultation_id = ${consultationId}
        AND desired_state = 'RUNNING'
        AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
      ORDER BY interpretation_generation DESC
      LIMIT 1
      FOR UPDATE
    `;
    if (!current) return null;
    const [invalidated] = await query<JobRow[]>`
      UPDATE video_consultation_interpretation_jobs
      SET desired_state = 'STOPPED', status = 'STOPPING', exchange_available = false,
          job_capability_digest = NULL, capability_expires_at = NULL,
          agent_execution_version = agent_execution_version + 1,
          authorization_revision = authorization_revision + 1,
          updated_at = now()
      WHERE id = ${current.id}
        AND desired_state = 'RUNNING'
        AND agent_execution_version = ${current.agent_execution_version}
      RETURNING *
    `;
    if (!invalidated) return null;
    // This shares the job row lock with provider-session admission. If admission
    // commits first we fence its session here; if STOP commits first, admission
    // revalidation rejects the stale capability.
    await query`
      UPDATE video_consultation_provider_sessions
      SET state = 'ORPHAN_WAIT', orphan_risk = true, updated_at = now()
      WHERE job_id = ${current.id} AND state IN ('CREATING', 'ACTIVE', 'CLOSING')
    `;
    await query`
      INSERT INTO video_consultation_interpretation_events (
        job_id, event_type, actor_type, actor_id, execution_version, details
      ) VALUES (
        ${current.id}, 'STOP', 'PRINCIPAL', ${actor.userId},
        ${invalidated.agent_execution_version}, '{}'::jsonb
      )
    `;
    return invalidated;
  });
  if (!job) return c.json({ success: true, stopped: false, idempotent: true });

  if (job.dispatch_id) {
    const config = readLiveKitConfig();
    const livekit = new LiveKitAPI({
      host: liveKitApiHost(config.livekitUrl),
      apiKey: config.apiKey,
      secret: config.apiSecret,
    });
    try {
      await livekit.agentDispatch.deleteDispatch(job.dispatch_id, job.room_name);
    } catch (error) {
      console.warn('Failed to delete LiveKit interpretation dispatch; watchdog remains invalidated', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const [stopped] = await sql<JobRow[]>`
    UPDATE video_consultation_interpretation_jobs
    SET status = 'STOPPED', stopped_at = now(), updated_at = now()
    WHERE id = ${job.id} AND desired_state = 'STOPPED'
    RETURNING *
  `;
  return c.json({ success: true, stopped: true, job: publicJob(stopped ?? job) });
});

export default app;
