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
  approvedRuntimeProfile,
  createOpaqueSecret,
  deidentifiedE2eModeEnabled,
  digestSecret,
  INTERPRETATION_POLICY_VERSION,
  HOSTED_BOOTSTRAP_TIMEOUT_SECONDS,
  HOSTED_DISPATCH_ABSENCE_BOUND_VERIFIED,
  HOSTED_DISPATCH_RECOVERY_SETTLE_SECONDS,
  interpretationFeatureEnabled,
  integratedTranslationTargetApproved,
  liveKitMediaPlaneRevocationApproved,
  MAX_ACTIVE_AI_ROOMS,
  MAX_DEIDENTIFIED_E2E_ACTIVE_AI_ROOMS,
  MAX_DEIDENTIFIED_E2E_DURATION_SECONDS,
  LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS,
  LIFECYCLE_RECONCILER_STALE_SECONDS,
  normalizeLaunchLanguage,
  oppositeLanguage,
  readHostedAgentConfig,
  readLiveKitConfig,
  reserveInterpretationBudgetMicrodollars,
  SELF_HOST_CLAIM_TIMEOUT_SECONDS,
  syntheticDeidentifiedE2eConsultationApproved,
  VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED,
  VIDEO_INTERPRETATION_SELF_HOSTED_RUNTIME_IMPLEMENTED,
  VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED,
  videoConsultationJoinEnabled,
  v1ConsentTopologySupported,
  v1CumulativeConsentLimitSatisfied,
} from '../video-interpretation/security.js';
import { reconcileExpiredProviderSessions } from '../video-interpretation/provider-session-reconciliation.js';
import { reconcileInterpretationBudget } from '../video-interpretation/budget-reconciliation.js';
import { uniquelyMatchesReturnedHostedDispatch } from '../video-interpretation/hosted-control-plane.js';

const app = new Hono();
const idSchema = z.string().uuid();
const consentSchema = z.object({
  // The V1 authority model supports exactly one operator and one patient.
  participantIdentities: z.array(z.string().min(1).max(160)).length(2),
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
  dataClassification: z.enum(['DEIDENTIFIED_EVALUATION', 'REAL_PATIENT']).default('DEIDENTIFIED_EVALUATION'),
});
const releaseApprovalSchema = z.object({
  approvalScope: z.enum(['RELEASE', 'SYNTHETIC_E2E']).default('RELEASE'),
  syntheticConsultationId: z.string().uuid().optional(),
  dataClassification: z.enum(['DEIDENTIFIED_EVALUATION', 'REAL_PATIENT']),
  provider: z.literal('openai'),
  providerModel: z.string().min(1).max(120),
  providerEndpoint: z.string().url().max(300),
  processingRegion: z.string().min(2).max(80),
  approvalReference: z.string().min(3).max(160),
  contractsApproved: z.boolean(),
  privacyVerified: z.boolean(),
  observabilityDisabled: z.boolean(),
  retentionVerified: z.boolean(),
  providerRateMicrodollarsPerMinute: z.number().int().positive().max(10_000_000),
  perRoomHardLimitMicrodollars: z.number().int().positive().max(1_000_000_000),
  dailyHardLimitMicrodollars: z.number().int().positive().max(10_000_000_000),
  monthlyHardLimitMicrodollars: z.number().int().positive().max(100_000_000_000),
  expiresAt: z.string().datetime(),
});
const allowlistSchema = z.object({
  releaseApprovalId: z.string().uuid(),
  expiresAt: z.string().datetime(),
});
export const selfHostSchema = z.object({
  hostName: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  maxJobs: z.literal(1).default(1),
});

interface ConsultationRow {
  id: string;
  case_id: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_email: string | null;
  room_name: string;
  room_generation: number;
  status: string;
  host_identity: string | null;
  patient_language: string | null;
  metadata: unknown;
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
  runtime_profile: 'HOSTED_AGENT_V1' | 'SELF_HOSTED_AGENT';
  data_classification: 'DEIDENTIFIED_EVALUATION' | 'REAL_PATIENT';
  reserved_microdollars: string | number;
  consumed_microdollars: string | number;
  hard_budget_microdollars: string | number | null;
  self_host_claim_deadline_at: string | null;
  provider_rate_microdollars_per_minute: string | number | null;
}

interface ReleaseApprovalRow {
  id: string;
  data_classification: 'DEIDENTIFIED_EVALUATION' | 'REAL_PATIENT';
  provider_rate_microdollars_per_minute: string | number;
  per_room_hard_limit_microdollars: string | number;
  daily_hard_limit_microdollars: string | number;
  monthly_hard_limit_microdollars: string | number;
  provider_model: string;
  provider_endpoint: string;
  expires_at: string;
}

function sqlClient() {
  return getCrmDb().$client;
}

async function invalidateSelfHostJobs(
  query: ReturnType<typeof sqlClient>,
  hostId: string,
  actorId: string,
  reason: string,
): Promise<void> {
  const affected = await query<{
    id: string;
    agent_execution_version: number;
    authorization_revision: string | number;
    provider_rate_microdollars_per_minute: string | number | null;
    hard_budget_microdollars: string | number | null;
  }[]>`
    UPDATE video_consultation_interpretation_jobs
    SET desired_state = 'STOPPED', status = 'STOPPING', exchange_available = false,
        job_capability_digest = NULL, capability_expires_at = NULL,
        agent_execution_version = agent_execution_version + 1,
        authorization_revision = authorization_revision + 1,
        lease_expires_at = NULL, agent_identity_revoked_at = NULL,
        failure_code = ${reason}, updated_at = now()
    WHERE self_host_id = ${hostId}
      AND desired_state = 'RUNNING'
      AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
    RETURNING id, agent_execution_version, authorization_revision,
              provider_rate_microdollars_per_minute, hard_budget_microdollars
  `;
  for (const job of affected) {
    const budget = await reconcileInterpretationBudget(query, job);
    await query`
      UPDATE video_consultation_interpretation_jobs
      SET consumed_microdollars = ${budget.consumedMicrodollars}
      WHERE id = ${job.id}
    `;
    await query`
      UPDATE video_consultation_source_tracks
      SET authorized = false, unpublished_at = COALESCE(unpublished_at, now()),
          authorization_revision = ${Number(job.authorization_revision)}
      WHERE job_id = ${job.id} AND authorized = true
    `;
    await query`
      UPDATE video_consultation_provider_sessions
      SET state = 'ORPHAN_WAIT', orphan_risk = true, updated_at = now()
      WHERE job_id = ${job.id} AND state IN ('CREATING', 'ACTIVE', 'CLOSING')
    `;
    await query`
      INSERT INTO video_consultation_interpretation_events (
        job_id, event_type, actor_type, actor_id, execution_version, details
      ) VALUES (
        ${job.id}, 'STOP', 'PRINCIPAL', ${actorId}, ${job.agent_execution_version},
        jsonb_build_object('reason', ${reason}::text)
      )
    `;
  }
}

async function invalidateReleaseApprovalJobs(
  query: ReturnType<typeof sqlClient>,
  approvalId: string,
  actorId: string,
): Promise<void> {
  const affected = await query<{
    id: string;
    agent_execution_version: number;
    authorization_revision: string | number;
    runtime_profile: 'HOSTED_AGENT_V1' | 'SELF_HOSTED_AGENT';
    provider_rate_microdollars_per_minute: string | number | null;
    hard_budget_microdollars: string | number | null;
  }[]>`
    UPDATE video_consultation_interpretation_jobs
    SET desired_state = 'STOPPED', status = 'STOPPING', exchange_available = false,
        job_capability_digest = NULL, capability_expires_at = NULL,
        agent_execution_version = agent_execution_version + 1,
        authorization_revision = authorization_revision + 1,
        lease_expires_at = CASE WHEN runtime_profile = 'SELF_HOSTED_AGENT' THEN NULL ELSE lease_expires_at END,
        agent_identity_revoked_at = CASE
          WHEN runtime_profile = 'SELF_HOSTED_AGENT' THEN NULL ELSE agent_identity_revoked_at
        END,
        hosted_dispatch_deleted_at = CASE
          WHEN runtime_profile = 'HOSTED_AGENT_V1' THEN NULL ELSE hosted_dispatch_deleted_at
        END,
        failure_code = 'RELEASE_APPROVAL_REVOKED', updated_at = now()
    WHERE release_approval_id = ${approvalId}
      AND desired_state = 'RUNNING'
      AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE', 'STOPPING')
    RETURNING id, agent_execution_version, authorization_revision, runtime_profile,
              provider_rate_microdollars_per_minute, hard_budget_microdollars
  `;
  for (const job of affected) {
    const budget = await reconcileInterpretationBudget(query, job);
    await query`
      UPDATE video_consultation_interpretation_jobs
      SET consumed_microdollars = ${budget.consumedMicrodollars}
      WHERE id = ${job.id}
    `;
    await query`
      UPDATE video_consultation_source_tracks
      SET authorized = false, unpublished_at = COALESCE(unpublished_at, now()),
          authorization_revision = ${Number(job.authorization_revision)}
      WHERE job_id = ${job.id} AND authorized = true
    `;
    await query`
      UPDATE video_consultation_provider_sessions
      SET state = 'ORPHAN_WAIT', orphan_risk = true, updated_at = now()
      WHERE job_id = ${job.id} AND state IN ('CREATING', 'ACTIVE', 'CLOSING')
    `;
    await query`
      INSERT INTO video_consultation_interpretation_events (
        job_id, event_type, actor_type, actor_id, execution_version, details
      ) VALUES (
        ${job.id}, 'STOP', 'PRINCIPAL', ${actorId}, ${job.agent_execution_version},
        jsonb_build_object('reason', 'RELEASE_APPROVAL_REVOKED')
      )
    `;
  }
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
    SELECT id, case_id, patient_id, patient_name, patient_email,
           room_name, room_generation, status, host_identity, patient_language, metadata
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
    runtimeProfile: job.runtime_profile,
    dataClassification: job.data_classification,
    reservedMicrodollars: Number(job.reserved_microdollars),
    consumedMicrodollars: Number(job.consumed_microdollars),
    hardBudgetMicrodollars: job.hard_budget_microdollars === null ? null : Number(job.hard_budget_microdollars),
    selfHostClaimDeadlineAt: job.self_host_claim_deadline_at,
  };
}

app.post('/api/v2/video-consultations/:id/token', async (c) => {
  if (!videoConsultationJoinEnabled()) {
    throw new HTTPException(503, { message: 'Video consultation joining is not enabled' });
  }
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

app.get('/api/v2/video-interpretation/release-approvals/active', async (c) => {
  requireOperator(c);
  const sql = sqlClient();
  const rows = await sql<{
    id: string;
    approval_reference: string;
    data_classification: string;
    approval_scope: string;
    expires_at: string;
  }[]>`
    SELECT id, approval_reference, data_classification, approval_scope, expires_at
    FROM video_interpretation_release_approvals
    WHERE revoked_at IS NULL AND expires_at > now()
    ORDER BY expires_at DESC
    LIMIT 20
  `;
  return c.json({
    success: true,
    approvals: rows.map((row) => ({
      id: row.id,
      approvalReference: row.approval_reference,
      dataClassification: row.data_classification,
      approvalScope: row.approval_scope,
      expiresAt: row.expires_at,
    })),
  });
});

app.post('/api/v2/video-interpretation/release-approvals', async (c) => {
  const actor = requireOperator(c);
  const body = releaseApprovalSchema.parse(await c.req.json());
  const expiresAt = new Date(body.expiresAt);
  const maximumApprovalLifetimeMs = body.approvalScope === 'SYNTHETIC_E2E'
    ? 30 * 60_000
    : 366 * 24 * 60 * 60_000;
  if (expiresAt.getTime() <= Date.now()
    || expiresAt.getTime() > Date.now() + maximumApprovalLifetimeMs) {
    throw new HTTPException(400, { message: 'RELEASE_APPROVAL_EXPIRY_INVALID' });
  }
  if (body.approvalScope === 'SYNTHETIC_E2E') {
    if (!deidentifiedE2eModeEnabled()
      || body.dataClassification !== 'DEIDENTIFIED_EVALUATION'
      || !body.syntheticConsultationId
      || body.contractsApproved
      || body.privacyVerified
      || body.observabilityDisabled
      || body.retentionVerified) {
      throw new HTTPException(409, { message: 'SYNTHETIC_E2E_APPROVAL_INVALID' });
    }
    const consultation = await loadConsultation(body.syntheticConsultationId);
    if (!syntheticDeidentifiedE2eConsultationApproved(consultation)) {
      throw new HTTPException(409, { message: 'SYNTHETIC_E2E_AUTHORITY_REQUIRED' });
    }
  } else if (body.syntheticConsultationId
    || !body.privacyVerified
    || !body.observabilityDisabled
    || !body.retentionVerified) {
    throw new HTTPException(409, { message: 'RELEASE_PRIVACY_ATTESTATIONS_REQUIRED' });
  }
  if (body.dataClassification === 'REAL_PATIENT') {
    if (!body.contractsApproved) {
      throw new HTTPException(409, { message: 'REAL_PATIENT_CONTRACTS_REQUIRED' });
    }
    const endpoint = new URL(body.providerEndpoint);
    if (endpoint.pathname === '/v1/realtime/translations') {
      throw new HTTPException(409, { message: 'EXACT_ENDPOINT_NOT_APPROVED_FOR_REAL_PATIENT_DATA' });
    }
  }
  if (!integratedTranslationTargetApproved(body.providerModel, body.providerEndpoint)) {
    throw new HTTPException(409, { message: 'PROVIDER_TARGET_NOT_IN_RUNTIME_ALLOWLIST' });
  }
  if (body.dailyHardLimitMicrodollars < body.perRoomHardLimitMicrodollars
    || body.monthlyHardLimitMicrodollars < body.dailyHardLimitMicrodollars) {
    throw new HTTPException(400, { message: 'Budget limits must increase from room to daily to monthly' });
  }
  const sql = sqlClient();
  const [approval] = await sql<{ id: string; expires_at: string }[]>`
    INSERT INTO video_interpretation_release_approvals (
      data_classification, provider, provider_model, provider_endpoint,
      processing_region, approval_reference, contracts_approved,
      privacy_verified, observability_disabled, retention_verified,
      provider_rate_microdollars_per_minute, per_room_hard_limit_microdollars,
      daily_hard_limit_microdollars, monthly_hard_limit_microdollars,
      approved_by_principal_id, expires_at, approval_scope, synthetic_consultation_id
    ) VALUES (
      ${body.dataClassification}, ${body.provider}, ${body.providerModel}, ${body.providerEndpoint},
      ${body.processingRegion}, ${body.approvalReference}, ${body.contractsApproved},
      ${body.privacyVerified}, ${body.observabilityDisabled}, ${body.retentionVerified},
      ${body.providerRateMicrodollarsPerMinute}, ${body.perRoomHardLimitMicrodollars},
      ${body.dailyHardLimitMicrodollars}, ${body.monthlyHardLimitMicrodollars},
      ${actor.userId}, ${body.expiresAt}, ${body.approvalScope},
      ${body.syntheticConsultationId ?? null}
    )
    RETURNING id, expires_at
  `;
  return c.json({ success: true, approval }, 201);
});

app.post('/api/v2/video-interpretation/release-approvals/:approvalId/revoke', async (c) => {
  const actor = requireOperator(c);
  const approvalId = idSchema.parse(c.req.param('approvalId'));
  const sql = sqlClient();
  const result = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    const [approval] = await query<{ id: string; revoked_at: string | null }[]>`
      SELECT id, revoked_at FROM video_interpretation_release_approvals
      WHERE id = ${approvalId} FOR UPDATE
    `;
    if (!approval) return 'missing' as const;
    if (approval.revoked_at) return 'idempotent' as const;
    await query`
      UPDATE video_interpretation_release_approvals SET revoked_at = now() WHERE id = ${approvalId}
    `;
    await query`
      UPDATE video_consultation_interpretation_allowlist
      SET enabled = false, revoked_at = now()
      WHERE release_approval_id = ${approvalId} AND revoked_at IS NULL
    `;
    await invalidateReleaseApprovalJobs(query, approvalId, actor.userId);
    return 'revoked' as const;
  });
  if (result === 'missing') throw new HTTPException(404, { message: 'Release approval not found' });
  return c.json({ success: true, revoked: result === 'revoked', idempotent: result === 'idempotent' });
});

app.post('/api/v2/video-consultations/:id/interpretation/allowlist', async (c) => {
  const actor = requireOperator(c);
  const consultationId = idSchema.parse(c.req.param('id'));
  const body = allowlistSchema.parse(await c.req.json());
  const sql = sqlClient();
  const result = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    const [consultation] = await query<{ id: string }[]>`
      SELECT id FROM video_consultations WHERE id = ${consultationId} FOR UPDATE
    `;
    if (!consultation) return 'missing' as const;
    const [approval] = await query<{ id: string; expires_at: string }[]>`
      SELECT id, expires_at
      FROM video_interpretation_release_approvals
      WHERE id = ${body.releaseApprovalId}
        AND revoked_at IS NULL AND expires_at > now()
        AND video_interpretation_approval_authorized(
          id, ${consultationId}, data_classification, now()
        )
      FOR UPDATE
    `;
    if (!approval) return 'approval' as const;
    if (new Date(body.expiresAt).getTime() <= Date.now()
      || new Date(body.expiresAt).getTime() > new Date(approval.expires_at).getTime()) return 'expiry' as const;
    await query`
      INSERT INTO video_consultation_interpretation_allowlist (
        consultation_id, release_approval_id, enabled,
        allowed_by_principal_id, expires_at, revoked_at
      ) VALUES (
        ${consultationId}, ${approval.id}, true, ${actor.userId}, ${body.expiresAt}, NULL
      )
      ON CONFLICT (consultation_id) DO UPDATE SET
        release_approval_id = EXCLUDED.release_approval_id,
        enabled = true,
        allowed_by_principal_id = EXCLUDED.allowed_by_principal_id,
        allowed_at = now(), expires_at = EXCLUDED.expires_at, revoked_at = NULL
    `;
    return 'allowed' as const;
  });
  if (result === 'missing') throw new HTTPException(404, { message: 'Video consultation not found' });
  if (result === 'approval') throw new HTTPException(409, { message: 'RELEASE_APPROVAL_UNAVAILABLE' });
  if (result === 'expiry') throw new HTTPException(400, { message: 'ALLOWLIST_EXPIRY_INVALID' });
  return c.json({ success: true, consultationId, releaseApprovalId: body.releaseApprovalId });
});

app.get('/api/v2/video-consultations/:id/interpretation/readiness', async (c) => {
  requireOperator(c);
  const consultationId = idSchema.parse(c.req.param('id'));
  const sql = sqlClient();
  const [approval] = await sql<{
    data_classification: string;
    expires_at: string;
    approval_reference: string;
    approval_scope: 'RELEASE' | 'SYNTHETIC_E2E';
    privacy_verified: boolean;
    observability_disabled: boolean;
    retention_verified: boolean;
  }[]>`
    SELECT approval.data_classification, allowlist.expires_at, approval.approval_reference,
           approval.approval_scope, approval.privacy_verified,
           approval.observability_disabled, approval.retention_verified
    FROM video_consultation_interpretation_allowlist allowlist
    JOIN video_interpretation_release_approvals approval ON approval.id = allowlist.release_approval_id
    WHERE allowlist.consultation_id = ${consultationId}
      AND allowlist.enabled = true AND allowlist.revoked_at IS NULL AND allowlist.expires_at > now()
      AND approval.revoked_at IS NULL AND approval.expires_at > now()
      AND video_interpretation_approval_authorized(
        approval.id, ${consultationId}, approval.data_classification, now()
      )
  `;
  return c.json({
    success: true,
    mediaCodeGate: VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED,
    realPatientCodeGate: VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED,
    deidentifiedE2eMode: deidentifiedE2eModeEnabled(),
    deidentifiedE2eMaximumDurationSeconds: MAX_DEIDENTIFIED_E2E_DURATION_SECONDS,
    deidentifiedE2eMaximumActiveRooms: MAX_DEIDENTIFIED_E2E_ACTIVE_AI_ROOMS,
    selfHostedCodeReady: VIDEO_INTERPRETATION_SELF_HOSTED_RUNTIME_IMPLEMENTED,
    approval: approval ? {
      dataClassification: approval.data_classification,
      expiresAt: approval.expires_at,
      approvalReference: approval.approval_reference,
      approvalScope: approval.approval_scope,
      privacyVerified: approval.privacy_verified,
      observabilityDisabled: approval.observability_disabled,
      retentionVerified: approval.retention_verified,
    } : null,
  });
});

app.post('/api/v2/video-interpretation/self-hosts', async (c) => {
  const actor = requireOperator(c);
  const body = selfHostSchema.parse(await c.req.json());
  const bearerSecret = createOpaqueSecret();
  const sql = sqlClient();
  try {
    const [host] = await sql<{
      id: string;
      host_name: string;
      credential_version: string | number;
      max_jobs: number;
    }[]>`
      INSERT INTO video_interpretation_self_hosts (
        host_name, bearer_secret_digest, max_jobs, created_by_principal_id
      ) VALUES (${body.hostName}, ${digestSecret(bearerSecret)}, ${body.maxJobs}, ${actor.userId})
      RETURNING id, host_name, credential_version, max_jobs
    `;
    return c.json({
      success: true,
      host: {
        id: host!.id,
        hostName: host!.host_name,
        credentialVersion: Number(host!.credential_version),
        maxJobs: host!.max_jobs,
      },
      bearerSecret,
      warning: 'This bearer is returned once; store it only in a root-owned runtime credential file.',
    }, 201);
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      throw new HTTPException(409, { message: 'SELF_HOST_NAME_EXISTS' });
    }
    throw error;
  }
});

app.post('/api/v2/video-interpretation/self-hosts/:hostId/rotate', async (c) => {
  const actor = requireOperator(c);
  const hostId = idSchema.parse(c.req.param('hostId'));
  const bearerSecret = createOpaqueSecret();
  const sql = sqlClient();
  const host = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    const [current] = await query<{ id: string }[]>`
      SELECT id FROM video_interpretation_self_hosts WHERE id = ${hostId} FOR UPDATE
    `;
    if (!current) return null;
    const [rotated] = await query<{ id: string; credential_version: string | number }[]>`
      UPDATE video_interpretation_self_hosts
      SET bearer_secret_digest = ${digestSecret(bearerSecret)},
          credential_version = credential_version + 1,
          rotated_at = now(), enabled = true, revoked_at = NULL
      WHERE id = ${hostId}
      RETURNING id, credential_version
    `;
    await invalidateSelfHostJobs(query, hostId, actor.userId, 'SELF_HOST_CREDENTIAL_ROTATED');
    return rotated!;
  });
  if (!host) throw new HTTPException(404, { message: 'Self host not found' });
  return c.json({
    success: true,
    hostId,
    credentialVersion: Number(host.credential_version),
    bearerSecret,
    warning: 'All prior host credentials and active AI jobs were invalidated.',
  });
});

app.post('/api/v2/video-interpretation/self-hosts/:hostId/revoke', async (c) => {
  const actor = requireOperator(c);
  const hostId = idSchema.parse(c.req.param('hostId'));
  const sql = sqlClient();
  const revoked = await sql.begin(async (tx) => {
    const query = tx as unknown as typeof sql;
    const [host] = await query<{ id: string; revoked_at: string | null }[]>`
      SELECT id, revoked_at FROM video_interpretation_self_hosts WHERE id = ${hostId} FOR UPDATE
    `;
    if (!host) return 'missing' as const;
    if (host.revoked_at) return 'idempotent' as const;
    await query`
      UPDATE video_interpretation_self_hosts
      SET enabled = false, revoked_at = now(), credential_version = credential_version + 1
      WHERE id = ${hostId}
    `;
    await invalidateSelfHostJobs(query, hostId, actor.userId, 'SELF_HOST_REVOKED');
    return 'revoked' as const;
  });
  if (revoked === 'missing') throw new HTTPException(404, { message: 'Self host not found' });
  return c.json({ success: true, hostId, revoked: revoked === 'revoked', idempotent: revoked === 'idempotent' });
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
      SELECT id, case_id, patient_id, patient_name, patient_email,
             room_name, room_generation, status, host_identity, patient_language, metadata
      FROM video_consultations
      WHERE id = ${consultationId}
      FOR UPDATE
    `;
    if (!consultation) return { kind: 'missing_consultation' as const };
    const operatorIdentity = `operator-${actor.userId}-${consultation.id}`;
    const patientIdentity = consultation.patient_id
      ? `patient-${consultation.patient_id}-${consultation.id}`
      : null;
    if (!v1ConsentTopologySupported({
      identities,
      operatorIdentity,
      patientIdentity,
      synthetic: syntheticDeidentifiedE2eConsultationApproved(consultation),
    })) {
      return { kind: 'unsupported_participant_topology' as const };
    }
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
    allowed.add(operatorIdentity);
    const disallowed = identities.find((identity) => !allowed.has(identity));
    if (disallowed) return { kind: 'not_admitted' as const, identity: disallowed };

    const current = await query<{ participant_identity: string; state: string; version: string | number }[]>`
      SELECT participant_identity, state, version
      FROM video_consultation_ai_consents
      WHERE consultation_id = ${consultationId}
        AND policy_version = ${body.policyVersion}
      ORDER BY participant_identity
      FOR UPDATE
    `;
    const grantedIdentities = current
      .filter((row) => row.state === 'GRANTED')
      .map((row) => row.participant_identity);
    if (!v1CumulativeConsentLimitSatisfied(grantedIdentities, identities)) {
      return { kind: 'unsupported_participant_topology' as const };
    }
    const existingByIdentity = new Map(current.map((row) => [row.participant_identity, row]));
    const requiresReconsent = current.find((row) => identities.includes(row.participant_identity)
      && row.state !== 'GRANTED');
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
  if (result.kind === 'unsupported_participant_topology') {
    throw new HTTPException(409, { message: 'V1 supports exactly one operator and one patient' });
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

app.post('/api/v2/video-consultations/:id/interpretation/escalate', async (c) => {
  const actor = requireOperator(c);
  const consultationId = idSchema.parse(c.req.param('id'));
  const sql = sqlClient();
  const [job] = await sql<JobRow[]>`
    SELECT * FROM video_consultation_interpretation_jobs
    WHERE consultation_id = ${consultationId}
      AND desired_state = 'RUNNING'
      AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE')
    ORDER BY interpretation_generation DESC
    LIMIT 1
  `;
  if (!job) throw new HTTPException(409, { message: 'No active interpretation job' });
  await sql`
    INSERT INTO video_consultation_interpretation_events (
      job_id, event_type, actor_type, actor_id, execution_version, details
    ) VALUES (
      ${job.id}, 'HUMAN_ESCALATION_REQUESTED', 'PRINCIPAL', ${actor.userId},
      ${job.agent_execution_version}, jsonb_build_object('status', 'REQUESTED')
    )
  `;
  return c.json({
    success: true,
    requested: true,
    message: 'Escalation was recorded; the original call remains active.',
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
  if (body.dataClassification === 'REAL_PATIENT'
    && !VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED) {
    throw new HTTPException(503, { message: 'REAL_PATIENT_INTERPRETATION_NOT_RELEASED' });
  }
  const stagingE2eRequested = body.dataClassification === 'DEIDENTIFIED_EVALUATION'
    && deidentifiedE2eModeEnabled();
  if (stagingE2eRequested
    && body.maximumAiDurationSeconds > MAX_DEIDENTIFIED_E2E_DURATION_SECONDS) {
    throw new HTTPException(400, { message: 'DEIDENTIFIED_E2E_DURATION_EXCEEDS_LIMIT' });
  }
  const preflightConsultation = stagingE2eRequested
    ? await loadConsultation(consultationId)
    : null;
  const deidentifiedE2e = preflightConsultation !== null
    && syntheticDeidentifiedE2eConsultationApproved(preflightConsultation);
  if (stagingE2eRequested && !deidentifiedE2e) {
    throw new HTTPException(409, { message: 'SYNTHETIC_E2E_AUTHORITY_REQUIRED' });
  }
  const runtimeProfile = approvedRuntimeProfile();
  if (runtimeProfile === 'DISABLED') {
    throw new HTTPException(503, { message: 'VIDEO_INTERPRETATION_RUNTIME_NOT_APPROVED' });
  }
  if (runtimeProfile === 'HOSTED_AGENT_V1'
    && !HOSTED_DISPATCH_ABSENCE_BOUND_VERIFIED
    && !deidentifiedE2e) {
    throw new HTTPException(503, { message: 'HOSTED_DISPATCH_RECOVERY_NOT_QUALIFIED' });
  }
  const hostedConfig = runtimeProfile === 'HOSTED_AGENT_V1' ? readHostedAgentConfig() : null;
  const effectiveLiveKitUrl = hostedConfig?.livekitUrl ?? readLiveKitConfig().livekitUrl;
  if (!liveKitMediaPlaneRevocationApproved(effectiveLiveKitUrl) && !deidentifiedE2e) {
    throw new HTTPException(503, { message: 'LIVEKIT_CLOUD_REVOCATION_NOT_QUALIFIED' });
  }
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
      SELECT id, case_id, patient_id, patient_name, patient_email,
             room_name, room_generation, status, host_identity, patient_language, metadata
      FROM video_consultations
      WHERE id = ${consultationId}
      FOR UPDATE
    `;
    if (!consultation) throw new HTTPException(404, { message: 'Video consultation not found' });
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(consultation.status)) {
      throw new HTTPException(409, { message: 'Consultation is not active' });
    }
    if (deidentifiedE2e && !syntheticDeidentifiedE2eConsultationApproved(consultation)) {
      throw new HTTPException(409, { message: 'SYNTHETIC_E2E_AUTHORITY_REQUIRED' });
    }
    const [{ healthy_profiles: healthyProfiles } = { healthy_profiles: 0 }] = await query<{
      healthy_profiles: number;
    }[]>`
      SELECT count(*)::int AS healthy_profiles
      FROM video_interpretation_reconcile_leases
      WHERE last_succeeded_at > now() - ${LIFECYCLE_RECONCILER_STALE_SECONDS} * interval '1 second'
        AND (last_failed_at IS NULL OR last_succeeded_at >= last_failed_at)
        AND (
          (${runtimeProfile} = 'HOSTED_AGENT_V1' AND profile = 'HOSTED')
          OR (${runtimeProfile} = 'SELF_HOSTED_AGENT'
            AND profile IN ('SELF_HOSTED_FENCE', 'SELF_HOSTED_CLEANUP'))
        )
    `;
    const requiredProfiles = runtimeProfile === 'HOSTED_AGENT_V1' ? 1 : 2;
    if (healthyProfiles !== requiredProfiles) {
      throw new HTTPException(503, { message: 'VIDEO_INTERPRETATION_RECONCILER_UNHEALTHY' });
    }
    const sourceLanguage = body.sourceLanguage ?? normalizeLaunchLanguage(consultation.patient_language);
    if (!sourceLanguage) {
      throw new HTTPException(409, { message: 'A supported zh/en source language must be confirmed' });
    }
    const targetLanguage = oppositeLanguage(sourceLanguage);
    const [pendingRuntimeCleanup] = await query<{ id: string }[]>`
      SELECT id FROM video_consultation_interpretation_jobs
      WHERE consultation_id = ${consultationId}
        AND status = 'STOPPING'
      ORDER BY interpretation_generation DESC
      LIMIT 1
      FOR UPDATE
    `;
    if (pendingRuntimeCleanup) {
      throw new HTTPException(409, { message: 'INTERPRETATION_CLEANUP_PENDING' });
    }
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

    const [releaseApproval] = await query<ReleaseApprovalRow[]>`
      SELECT approval.id, approval.data_classification,
             approval.provider_model, approval.provider_endpoint,
             approval.provider_rate_microdollars_per_minute,
             approval.per_room_hard_limit_microdollars,
             approval.daily_hard_limit_microdollars,
             approval.monthly_hard_limit_microdollars,
             approval.expires_at
      FROM video_consultation_interpretation_allowlist allowlist
      JOIN video_interpretation_release_approvals approval
        ON approval.id = allowlist.release_approval_id
      WHERE allowlist.consultation_id = ${consultationId}
        AND allowlist.enabled = true AND allowlist.revoked_at IS NULL
        AND allowlist.expires_at > now()
        AND approval.data_classification = ${body.dataClassification}
        AND approval.revoked_at IS NULL AND approval.expires_at > now()
        AND video_interpretation_approval_authorized(
          approval.id, ${consultationId}, ${body.dataClassification}, now()
        )
      FOR UPDATE OF allowlist, approval
    `;
    if (!releaseApproval) {
      throw new HTTPException(409, { message: 'INTERPRETATION_RELEASE_APPROVAL_REQUIRED' });
    }
    const providerRate = Number(releaseApproval.provider_rate_microdollars_per_minute);
    const reservedMicrodollars = reserveInterpretationBudgetMicrodollars(
      body.maximumAiDurationSeconds,
      providerRate,
    );
    if (reservedMicrodollars > Number(releaseApproval.per_room_hard_limit_microdollars)) {
      throw new HTTPException(409, { message: 'AI_ROOM_BUDGET_RESERVATION_EXCEEDS_LIMIT' });
    }

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
      WHERE status = 'STOPPING'
        OR (desired_state = 'RUNNING' AND status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE'))
    `;
    const activeCount = capacityRows[0]?.active_count ?? MAX_ACTIVE_AI_ROOMS;
    const activeRoomLimit = deidentifiedE2e
      ? MAX_DEIDENTIFIED_E2E_ACTIVE_AI_ROOMS
      : MAX_ACTIVE_AI_ROOMS;
    if (activeCount >= activeRoomLimit) {
      throw new HTTPException(409, { message: 'AI_CAPACITY_UNAVAILABLE' });
    }
    const [budgetUsage] = await query<{
      daily_used: string | number;
      monthly_used: string | number;
    }[]>`
      SELECT
        COALESCE(SUM(
          CASE WHEN created_at >= date_trunc('day', now())
            THEN CASE WHEN desired_state = 'RUNNING' OR status = 'STOPPING'
              THEN reserved_microdollars ELSE consumed_microdollars END
            ELSE 0 END
        ), 0)::bigint AS daily_used,
        COALESCE(SUM(
          CASE WHEN created_at >= date_trunc('month', now())
            THEN CASE WHEN desired_state = 'RUNNING' OR status = 'STOPPING'
              THEN reserved_microdollars ELSE consumed_microdollars END
            ELSE 0 END
        ), 0)::bigint AS monthly_used
      FROM video_consultation_interpretation_jobs
      WHERE release_approval_id = ${releaseApproval.id}
    `;
    if (Number(budgetUsage?.daily_used ?? 0) + reservedMicrodollars
      > Number(releaseApproval.daily_hard_limit_microdollars)) {
      throw new HTTPException(409, { message: 'AI_DAILY_BUDGET_EXHAUSTED' });
    }
    if (Number(budgetUsage?.monthly_used ?? 0) + reservedMicrodollars
      > Number(releaseApproval.monthly_hard_limit_microdollars)) {
      throw new HTTPException(409, { message: 'AI_MONTHLY_BUDGET_EXHAUSTED' });
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
    if (!v1ConsentTopologySupported({
      identities: consentRows.map((row) => row.participant_identity),
      operatorIdentity: `operator-${actor.userId}-${consultation.id}`,
      patientIdentity: consultation.patient_id
        ? `patient-${consultation.patient_id}-${consultation.id}`
        : null,
      synthetic: deidentifiedE2e,
    })) {
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
    let hostedDeploymentId: string | null = null;
    if (hostedConfig) {
      const [deployment] = await query<{ id: string }[]>`
        SELECT id
        FROM video_consultation_hosted_deployments
        WHERE deployment_name = ${hostedConfig.deploymentName}
          AND bootstrap_secret_digest = ${digestSecret(hostedConfig.bootstrapSecret)}
          AND enabled = true
          AND revoked_at IS NULL
        FOR UPDATE
      `;
      if (!deployment) {
        throw new HTTPException(503, { message: 'HOSTED_AGENT_DEPLOYMENT_UNAVAILABLE' });
      }
      hostedDeploymentId = deployment.id;
    }

    const [created] = await query<JobRow[]>`
      INSERT INTO video_consultation_interpretation_jobs (
        id, consultation_id, room_name, room_generation, interpretation_generation,
        agent_execution_version, desired_state, status, provider_profile,
        source_language, target_language, consent_policy_version, agent_identity,
        hosted_deployment_id, maximum_ai_duration_seconds, created_by_principal_id,
        runtime_profile, data_classification, release_approval_id,
        provider_model, provider_endpoint,
        provider_rate_microdollars_per_minute, hard_budget_microdollars,
        reserved_microdollars, hosted_dispatch_creation_deadline_at,
        self_host_claim_deadline_at
      ) VALUES (
        ${jobId}, ${consultationId}, ${consultation.room_name}, ${consultation.room_generation}, ${generation},
        1, 'RUNNING', 'DISPATCHING', ${providerProfile},
        ${sourceLanguage}, ${targetLanguage}, ${INTERPRETATION_POLICY_VERSION}, ${agentIdentity},
        ${hostedDeploymentId}, ${body.maximumAiDurationSeconds}, ${actor.userId},
        ${runtimeProfile}, ${body.dataClassification}, ${releaseApproval.id},
        ${releaseApproval.provider_model}, ${releaseApproval.provider_endpoint},
        ${providerRate}, ${reservedMicrodollars}, ${reservedMicrodollars},
        CASE WHEN ${runtimeProfile} = 'HOSTED_AGENT_V1'
          THEN now() + ${HOSTED_DISPATCH_RECOVERY_SETTLE_SECONDS} * interval '1 second'
          ELSE NULL END,
        CASE WHEN ${runtimeProfile} = 'SELF_HOSTED_AGENT'
          THEN now() + ${SELF_HOST_CLAIM_TIMEOUT_SECONDS} * interval '1 second'
          ELSE NULL END
      )
      RETURNING *
    `;
    await query`
      INSERT INTO video_consultation_interpretation_events (
        job_id, event_type, actor_type, actor_id, execution_version, details
      ) VALUES (
        ${jobId}, 'START', 'PRINCIPAL', ${actor.userId}, 1,
        ${JSON.stringify({
          providerProfile,
          runtimeProfile,
          dataClassification: body.dataClassification,
          releaseApprovalId: releaseApproval.id,
          reservedMicrodollars,
        })}::jsonb
      )
    `;
    return { job: created!, createdByThisRequest: true };
  });
  const { job } = startResult;

  if (!startResult.createdByThisRequest) {
    return c.json({ success: true, job: publicJob(job), idempotent: true });
  }

  if (job.runtime_profile === 'SELF_HOSTED_AGENT') {
    return c.json({
      success: true,
      job: publicJob(job),
      providerReady: VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED,
      awaitingSelfHostClaim: true,
    }, 202);
  }

  if (!hostedConfig) throw new Error('hosted agent configuration unavailable');

  const livekit = new LiveKitAPI({
    host: liveKitApiHost(hostedConfig.livekitUrl),
    apiKey: hostedConfig.apiKey,
    secret: hostedConfig.apiSecret,
    requestTimeout: LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS,
    failover: false,
  });
  let createdDispatchId: string | null = null;
  let dispatchSetVerified = false;
  const dispatchCorrelationId = `dispatch-${job.id}-v${job.agent_execution_version}-${createOpaqueSecret(12)}`;
  try {
    const [creationMarked] = await sql<{ id: string }[]>`
      UPDATE video_consultation_interpretation_jobs
      SET hosted_dispatch_creation_pending = true,
          hosted_dispatch_correlation_id = ${dispatchCorrelationId},
          hosted_dispatch_attempt_execution_version = ${job.agent_execution_version},
          hosted_dispatch_attempt_agent_identity = ${job.agent_identity},
          hosted_dispatch_requested_at = now(),
          hosted_dispatch_absence_observed_at = NULL,
          updated_at = now()
      WHERE id = ${job.id}
        AND desired_state = 'RUNNING' AND status = 'DISPATCHING'
        AND dispatch_id IS NULL
        AND hosted_dispatch_creation_pending = false
        AND hosted_dispatch_creation_deadline_at > now()
        AND agent_execution_version = ${job.agent_execution_version}
      RETURNING id
    `;
    if (!creationMarked) {
      throw new HTTPException(409, { message: 'Interpretation was stopped before dispatching' });
    }
    const dispatch = await livekit.agentDispatch.createDispatch(
      job.room_name,
      hostedConfig.deploymentName,
      {
        metadata: JSON.stringify({
          schema: 'medora.interpretation.dispatch.v1',
          jobId: job.id,
          roomName: job.room_name,
          roomGeneration: job.room_generation,
          interpretationGeneration: job.interpretation_generation,
          executionVersion: job.agent_execution_version,
          agentIdentity: job.agent_identity,
          dispatchCorrelationId,
        }),
      },
    );
    createdDispatchId = dispatch.id;
    await sql`
      UPDATE video_consultation_interpretation_jobs
      SET dispatch_id = ${dispatch.id}, updated_at = now()
      WHERE id = ${job.id}
        AND desired_state = 'RUNNING' AND status = 'DISPATCHING'
        AND hosted_dispatch_creation_pending = true
        AND hosted_dispatch_correlation_id = ${dispatchCorrelationId}
        AND agent_execution_version = ${job.agent_execution_version}
    `;
    const listed = await livekit.agentDispatch.listDispatch(job.room_name);
    const dispatchCorrelation = {
      id: job.id,
      room_name: job.room_name,
      room_generation: job.room_generation,
      interpretation_generation: job.interpretation_generation,
      hosted_dispatch_correlation_id: dispatchCorrelationId,
      hosted_dispatch_attempt_execution_version: job.agent_execution_version,
      hosted_dispatch_attempt_agent_identity: job.agent_identity,
      deployment_name: hostedConfig.deploymentName,
    };
    if (!uniquelyMatchesReturnedHostedDispatch(listed, dispatchCorrelation, dispatch.id)) {
      throw new Error('hosted_dispatch_set_not_uniquely_verified');
    }
    dispatchSetVerified = true;
    const updated = await sql.begin(async (tx) => {
      const query = tx as unknown as typeof sql;
      const [claimed] = await query<JobRow[]>`
        UPDATE video_consultation_interpretation_jobs
        SET dispatch_id = ${dispatch.id}, status = 'AWAITING_AGENT',
            hosted_dispatch_creation_pending = false,
            hosted_bootstrap_deadline_at = now() + ${HOSTED_BOOTSTRAP_TIMEOUT_SECONDS} * interval '1 second',
            updated_at = now()
        WHERE id = ${job.id}
          AND desired_state = 'RUNNING'
          AND status = 'DISPATCHING'
          AND dispatch_id = ${dispatch.id}
          AND hosted_dispatch_creation_pending = true
          AND hosted_dispatch_correlation_id = ${dispatchCorrelationId}
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
      await sql`
        UPDATE video_consultation_interpretation_jobs
        SET dispatch_id = ${dispatch.id}, hosted_dispatch_creation_pending = false,
            hosted_dispatch_deleted_at = NULL, agent_identity_revoked_at = NULL,
            hosted_bootstrap_deadline_at = now() + ${HOSTED_BOOTSTRAP_TIMEOUT_SECONDS} * interval '1 second',
            updated_at = now()
        WHERE id = ${job.id}
          AND desired_state = 'STOPPED' AND status = 'STOPPING'
          AND hosted_dispatch_creation_pending = true
          AND hosted_dispatch_correlation_id = ${dispatchCorrelationId}
      `;
      throw new HTTPException(409, { message: 'Interpretation was stopped while dispatching' });
    }
    return c.json({
      success: true,
      job: publicJob(updated),
      providerReady: VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED,
    }, 201);
  } catch (error) {
    if (error instanceof HTTPException && error.status === 409) throw error;
    await sql.begin(async (tx) => {
      const query = tx as unknown as typeof sql;
      const failureCode = dispatchSetVerified
        ? 'LIVEKIT_DISPATCH_FAILED'
        : 'HOSTED_DISPATCH_OUTCOME_UNKNOWN';
      const [fenced] = await query<{
        agent_execution_version: number;
        authorization_revision: string | number;
      }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET desired_state = 'STOPPED', status = 'STOPPING',
            dispatch_id = CASE
              WHEN ${dispatchSetVerified} THEN ${createdDispatchId}
              ELSE dispatch_id
            END,
            failure_code = ${failureCode},
            exchange_available = false, agent_execution_version = agent_execution_version + 1,
            authorization_revision = authorization_revision + 1,
            job_capability_digest = NULL, capability_expires_at = NULL,
            hosted_dispatch_deleted_at = NULL, agent_identity_revoked_at = NULL,
            hosted_dispatch_creation_pending = ${!dispatchSetVerified},
            updated_at = now()
        WHERE id = ${job.id}
          AND desired_state = 'RUNNING'
          AND status = 'DISPATCHING'
          AND hosted_dispatch_creation_pending = true
          AND hosted_dispatch_correlation_id = ${dispatchCorrelationId}
          AND agent_execution_version = ${job.agent_execution_version}
        RETURNING agent_execution_version, authorization_revision
      `;
      if (!fenced) return;
      await query`
        UPDATE video_consultation_source_tracks
        SET authorized = false, unpublished_at = COALESCE(unpublished_at, now()),
            authorization_revision = ${Number(fenced.authorization_revision)}
        WHERE job_id = ${job.id} AND authorized = true
      `;
      await query`
        UPDATE video_consultation_provider_sessions
        SET state = 'ORPHAN_WAIT', orphan_risk = true, updated_at = now()
        WHERE job_id = ${job.id} AND state IN ('CREATING', 'ACTIVE', 'CLOSING')
      `;
      await query`
        INSERT INTO video_consultation_interpretation_events (
          job_id, event_type, actor_type, actor_id, execution_version, details
        ) VALUES (
          ${job.id}, 'FAIL', 'SYSTEM', NULL, ${fenced.agent_execution_version},
          jsonb_build_object(
            'reason', ${failureCode},
            'state', 'HOSTED_CLEANUP_PENDING',
            'dispatchSetVerified', ${dispatchSetVerified}
          )
        )
      `;
    });
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
    const budget = await reconcileInterpretationBudget(query, current);
    if (!budget.authorized) {
      const [exhausted] = await query<JobRow[]>`
        SELECT * FROM video_consultation_interpretation_jobs WHERE id = ${current.id}
      `;
      return exhausted ?? null;
    }
    const [invalidated] = await query<JobRow[]>`
      UPDATE video_consultation_interpretation_jobs
      SET desired_state = 'STOPPED', status = 'STOPPING', exchange_available = false,
          job_capability_digest = NULL, capability_expires_at = NULL,
          agent_execution_version = agent_execution_version + 1,
          authorization_revision = authorization_revision + 1,
          lease_expires_at = CASE WHEN runtime_profile = 'SELF_HOSTED_AGENT' THEN NULL ELSE lease_expires_at END,
          agent_identity_revoked_at = CASE
            WHEN runtime_profile = 'SELF_HOSTED_AGENT' THEN NULL ELSE agent_identity_revoked_at
          END,
          hosted_dispatch_deleted_at = CASE
            WHEN runtime_profile = 'HOSTED_AGENT_V1' THEN NULL ELSE hosted_dispatch_deleted_at
          END,
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

  // Cleanup is intentionally asynchronous. Only the durable, leased
  // reconciler performs LiveKit side effects, preventing STOP requests from
  // racing a scheduler pass or another API replica.
  const [cleaned] = await sql<JobRow[]>`
    SELECT * FROM video_consultation_interpretation_jobs WHERE id = ${job.id}
  `;
  return c.json({
    success: true,
    stopped: true,
    cleanupPending: cleaned?.status === 'STOPPING',
    job: publicJob(cleaned ?? job),
  });
});

export default app;
