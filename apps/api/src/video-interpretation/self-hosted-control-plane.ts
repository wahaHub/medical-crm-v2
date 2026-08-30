import type { getCrmDb } from '@medical-crm/infrastructure/database';
import { reconcileExpiredProviderSessions } from './provider-session-reconciliation.js';
import { reconcileInterpretationBudget } from './budget-reconciliation.js';
import type {
  ReconcilePassOutcome,
  ReconcileRunGuard,
} from './reconcile-run-lease.js';
import { SELF_HOST_CLAIM_TIMEOUT_SECONDS } from './security.js';

type CrmSql = ReturnType<typeof getCrmDb>['$client'];

interface ExpiredLease {
  id: string;
  room_name: string;
  agent_identity: string;
  agent_execution_version: number;
  desired_state: 'RUNNING' | 'STOPPED';
  failure_code: string | null;
  agent_identity_revoked_at: string | null;
  application_deadline_elapsed?: boolean;
}

interface UnclaimedSelfHostedJob extends ExpiredLease {
  self_host_id: string | null;
  self_host_credential_version: string | number | null;
  lease_version: string | number | null;
  lease_expires_at: string | null;
  dispatch_id: string | null;
  job_capability_digest: string | null;
  capability_expires_at: string | null;
  started_at: string | null;
  provider_session_count: string | number;
  source_track_count: string | number;
  claim_deadline_elapsed: boolean;
  claim_deadline_missing: boolean;
}

export function isProvablyNeverClaimed(job: Pick<UnclaimedSelfHostedJob,
  'self_host_id' | 'self_host_credential_version' | 'lease_version' | 'lease_expires_at'
  | 'dispatch_id' | 'job_capability_digest' | 'capability_expires_at' | 'started_at'
  | 'provider_session_count' | 'source_track_count'
>): boolean {
  return job.self_host_id === null
    && job.self_host_credential_version === null
    && job.lease_version === null
    && job.lease_expires_at === null
    && job.dispatch_id === null
    && job.job_capability_digest === null
    && job.capability_expires_at === null
    && job.started_at === null
    && Number(job.provider_session_count) === 0
    && Number(job.source_track_count) === 0;
}

/** Fence jobs that no self-host worker claimed before the server deadline. */
export async function fenceExpiredOrUnauthorizedUnclaimedSelfHostedJobs(sql: CrmSql): Promise<void> {
  await sql.begin(async (tx) => {
    const query = tx as unknown as CrmSql;
    const jobs = await query<UnclaimedSelfHostedJob[]>`
      SELECT job.id, job.room_name, job.agent_identity, job.agent_execution_version,
             job.desired_state, job.failure_code, job.agent_identity_revoked_at,
             job.self_host_id, job.self_host_credential_version, job.lease_version,
             job.lease_expires_at, job.dispatch_id, job.job_capability_digest,
             job.capability_expires_at, job.started_at,
             (job.self_host_claim_deadline_at IS NULL) AS claim_deadline_missing,
             (job.self_host_claim_deadline_at IS NULL
              OR job.self_host_claim_deadline_at <= now()) AS claim_deadline_elapsed,
             (SELECT count(*) FROM video_consultation_provider_sessions provider_session
              WHERE provider_session.job_id = job.id) AS provider_session_count,
             (SELECT count(*) FROM video_consultation_source_tracks source_track
              WHERE source_track.job_id = job.id) AS source_track_count
      FROM video_consultation_interpretation_jobs job
      WHERE job.runtime_profile = 'SELF_HOSTED_AGENT'
        AND job.desired_state = 'RUNNING' AND job.status = 'DISPATCHING'
        AND (
          job.self_host_claim_deadline_at IS NULL
          OR job.self_host_claim_deadline_at <= now()
          OR NOT EXISTS (
            SELECT 1
            FROM video_consultation_interpretation_allowlist allowlist
            JOIN video_interpretation_release_approvals approval
              ON approval.id = allowlist.release_approval_id
            WHERE allowlist.consultation_id = job.consultation_id
              AND approval.id = job.release_approval_id
              AND approval.data_classification = job.data_classification
              AND allowlist.enabled = true AND allowlist.revoked_at IS NULL
              AND allowlist.expires_at > now()
              AND approval.revoked_at IS NULL AND approval.expires_at > now()
              AND video_interpretation_approval_authorized(
                approval.id, job.consultation_id, job.data_classification, now()
              )
          )
        )
      ORDER BY job.created_at
      LIMIT 4
      FOR UPDATE OF job SKIP LOCKED
    `;
    for (const job of jobs) {
      const failureCode = job.claim_deadline_missing
        ? 'SELF_HOST_CLAIM_DEADLINE_MISSING'
        : job.claim_deadline_elapsed ? 'SELF_HOST_CLAIM_TIMEOUT' : 'AUTHORIZATION_EXPIRED';
      const neverClaimed = isProvablyNeverClaimed(job);
      const [fenced] = await query<{
        agent_execution_version: number;
        authorization_revision: string | number;
      }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET desired_state = 'STOPPED', status = ${neverClaimed ? 'FAILED' : 'STOPPING'},
            failure_code = ${failureCode}, exchange_available = false,
            job_capability_digest = NULL, capability_expires_at = NULL,
            agent_execution_version = agent_execution_version + 1,
            authorization_revision = authorization_revision + 1,
            lease_expires_at = NULL,
            agent_identity_revoked_at = CASE WHEN ${neverClaimed} THEN now() ELSE NULL END,
            reserved_microdollars = CASE
              WHEN ${neverClaimed} THEN consumed_microdollars ELSE reserved_microdollars
            END,
            stopped_at = CASE WHEN ${neverClaimed} THEN COALESCE(stopped_at, now()) ELSE stopped_at END,
            updated_at = now()
        WHERE id = ${job.id}
          AND desired_state = 'RUNNING' AND status = 'DISPATCHING'
          AND agent_execution_version = ${job.agent_execution_version}
        RETURNING agent_execution_version, authorization_revision
      `;
      if (!fenced) continue;
      await query`
        UPDATE video_consultation_source_tracks
        SET authorized = false, unpublished_at = COALESCE(unpublished_at, now()),
            authorization_revision = ${Number(fenced.authorization_revision)}
        WHERE job_id = ${job.id} AND authorized = true
      `;
      if (!neverClaimed) {
        await query`
          UPDATE video_consultation_provider_sessions
          SET state = 'ORPHAN_WAIT', orphan_risk = true, updated_at = now()
          WHERE job_id = ${job.id} AND state IN ('CREATING', 'ACTIVE', 'CLOSING')
        `;
      }
      await query`
        INSERT INTO video_consultation_interpretation_events (
          job_id, event_type, actor_type, actor_id, execution_version, details
        ) VALUES (
          ${job.id}, 'FAIL', 'SYSTEM', NULL, ${fenced.agent_execution_version},
          jsonb_build_object(
            'reason', ${failureCode},
            'state', ${neverClaimed ? 'UNCLAIMED_FINAL' : 'SELF_HOST_CLEANUP_PENDING'}
          )
        )
      `;
    }
  });
}

export interface LiveKitRoomRevocationAdmin {
  removeParticipant(
    roomName: string,
    identity: string,
    options: { revokeTokenTs: bigint },
  ): Promise<unknown>;
  listParticipants(roomName: string): Promise<Array<{ identity: string }>>;
}

export function liveKitRevocationCutoffSeconds(nowMs = Date.now()): bigint {
  // LiveKit revokes tokens issued *before* the cutoff. Advance one second so a
  // token issued in the same whole-second bucket as fencing is also covered;
  // this remains inside Cloud's documented near-current cutoff window.
  return BigInt(Math.floor(nowMs / 1_000) + 1);
}

/**
 * LiveKit Cloud applies the cutoff even when the participant is currently
 * absent. Never preflight with listParticipants: an offline old execution may
 * still hold an otherwise valid original or server-refreshed token.
 * A destroyed room (not_found) proves the identity is absent; idle Cloud
 * rooms are deleted quickly, so cleanup must not retry forever on them.
 */
export async function revokeSelfHostedParticipant(
  room: LiveKitRoomRevocationAdmin,
  roomName: string,
  identity: string,
  nowMs = Date.now(),
): Promise<void> {
  const isRoomNotFound = (error: unknown): boolean =>
    typeof error === 'object' && error !== null
    && (error as { code?: unknown }).code === 'not_found';
  try {
    await room.removeParticipant(roomName, identity, {
      revokeTokenTs: liveKitRevocationCutoffSeconds(nowMs),
    });
  } catch (error) {
    if (!isRoomNotFound(error)) throw error;
  }
  let participants;
  try {
    participants = await room.listParticipants(roomName);
  } catch (error) {
    if (isRoomNotFound(error)) return;
    throw error;
  }
  if (participants.some((participant) => participant.identity === identity)) {
    throw new Error('self_hosted_identity_still_present_after_revocation');
  }
}

/**
 * Fences expired executions before any remote participant removal. The old
 * capability becomes unusable at commit; provider rows remain blocking until
 * proved closed or conservatively expired.
 */
export async function fenceExpiredSelfHostedLeases(sql: CrmSql): Promise<ExpiredLease[]> {
  return await sql.begin(async (tx) => {
    const query = tx as unknown as CrmSql;
    const expired = await query<ExpiredLease[]>`
      SELECT id, room_name, agent_identity, agent_execution_version,
             desired_state, failure_code, agent_identity_revoked_at
      FROM video_consultation_interpretation_jobs
      WHERE runtime_profile = 'SELF_HOSTED_AGENT'
        AND desired_state = 'RUNNING'
        AND status IN ('AWAITING_AGENT', 'ACTIVE')
        AND lease_expires_at <= now()
      ORDER BY lease_expires_at
      LIMIT 4
      FOR UPDATE SKIP LOCKED
    `;
    for (const job of expired) {
      const [fenced] = await query<{ agent_execution_version: number; authorization_revision: string | number }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET status = 'STOPPING', exchange_available = false,
            job_capability_digest = NULL, capability_expires_at = NULL,
            agent_execution_version = agent_execution_version + 1,
            authorization_revision = authorization_revision + 1,
            lease_expires_at = NULL, agent_identity_revoked_at = NULL,
            updated_at = now()
        WHERE id = ${job.id}
          AND agent_execution_version = ${job.agent_execution_version}
          AND lease_expires_at <= now()
        RETURNING agent_execution_version, authorization_revision
      `;
      if (!fenced) continue;
      job.agent_execution_version = fenced.agent_execution_version;
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
          ${job.id}, 'TAKEOVER', 'SYSTEM', NULL, ${fenced.agent_execution_version},
          jsonb_build_object('state', 'OLD_EXECUTION_FENCED')
        )
      `;
    }
    return expired;
  }) as unknown as ExpiredLease[];
}

/**
 * Application deadline, approval/allowlist expiry, and host-authority changes
 * terminate rather than take over an execution. The scheduler owns this check
 * so a hung or malicious agent cannot keep room access by renewing heartbeats.
 */
export async function fenceUnauthorizedSelfHostedExecutions(sql: CrmSql): Promise<void> {
  await sql.begin(async (tx) => {
    const query = tx as unknown as CrmSql;
    const unauthorized = await query<ExpiredLease[]>`
      SELECT job.id, job.room_name, job.agent_identity, job.agent_execution_version,
             job.desired_state, job.failure_code, job.agent_identity_revoked_at,
             (job.started_at IS NULL OR
               job.started_at + job.maximum_ai_duration_seconds * interval '1 second' <= now()
             ) AS application_deadline_elapsed
      FROM video_consultation_interpretation_jobs job
      WHERE job.runtime_profile = 'SELF_HOSTED_AGENT'
        AND job.desired_state = 'RUNNING'
        AND job.status IN ('AWAITING_AGENT', 'ACTIVE')
        AND (
          job.started_at IS NULL
          OR job.started_at + job.maximum_ai_duration_seconds * interval '1 second' <= now()
          OR NOT EXISTS (
            SELECT 1
            FROM video_consultation_interpretation_allowlist allowlist
            JOIN video_interpretation_release_approvals approval
              ON approval.id = allowlist.release_approval_id
            WHERE allowlist.consultation_id = job.consultation_id
              AND approval.id = job.release_approval_id
              AND approval.data_classification = job.data_classification
              AND allowlist.enabled = true AND allowlist.revoked_at IS NULL
              AND allowlist.expires_at > now()
              AND approval.revoked_at IS NULL AND approval.expires_at > now()
              AND video_interpretation_approval_authorized(
                approval.id, job.consultation_id, job.data_classification, now()
              )
          )
          OR NOT EXISTS (
            SELECT 1 FROM video_interpretation_self_hosts host
            WHERE host.id = job.self_host_id
              AND host.enabled = true AND host.revoked_at IS NULL
              AND host.credential_version = job.self_host_credential_version
          )
        )
      ORDER BY job.updated_at
      LIMIT 4
      FOR UPDATE OF job SKIP LOCKED
    `;
    for (const job of unauthorized) {
      const failureCode = job.application_deadline_elapsed
        ? 'APPLICATION_DEADLINE_ELAPSED'
        : 'AUTHORIZATION_EXPIRED';
      const eventType = job.application_deadline_elapsed
        ? 'APPLICATION_DEADLINE_ELAPSED'
        : 'AUTHORIZATION_EXPIRED';
      const [fenced] = await query<{ agent_execution_version: number; authorization_revision: string | number }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET desired_state = 'STOPPED', status = 'STOPPING',
            exchange_available = false, job_capability_digest = NULL,
            capability_expires_at = NULL,
            agent_execution_version = agent_execution_version + 1,
            authorization_revision = authorization_revision + 1,
            lease_expires_at = NULL, agent_identity_revoked_at = NULL,
            failure_code = ${failureCode}, updated_at = now()
        WHERE id = ${job.id}
          AND agent_execution_version = ${job.agent_execution_version}
          AND desired_state = 'RUNNING'
        RETURNING agent_execution_version, authorization_revision
      `;
      if (!fenced) continue;
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
          ${job.id}, ${eventType}, 'SYSTEM', NULL, ${fenced.agent_execution_version},
          jsonb_build_object('state', 'SELF_HOST_CLEANUP_PENDING', 'reason', ${failureCode}::text)
        )
      `;
    }
  });
}

/** Remove old room identities, then make only provider-fence-clean jobs claimable. */
export async function cleanupFencedSelfHostedExecutions(
  sql: CrmSql,
  livekit: { room: LiveKitRoomRevocationAdmin },
  guard?: ReconcileRunGuard,
): Promise<ReconcilePassOutcome> {
  let retryableFailureCount = 0;
  // Include previously fenced rows so a transient LiveKit removal failure or
  // provider ORPHAN_WAIT can make progress on a later claim attempt.
  const pending = await sql<ExpiredLease[]>`
    SELECT id, room_name, agent_identity, agent_execution_version,
           desired_state, failure_code, agent_identity_revoked_at
    FROM video_consultation_interpretation_jobs
    WHERE runtime_profile = 'SELF_HOSTED_AGENT'
      AND status = 'STOPPING'
    ORDER BY updated_at
    LIMIT 8
  `;
  for (const job of pending) {
    if (!job.agent_identity_revoked_at) {
      if (guard && !await guard.beforeExternalCalls(2)) {
        return { retryableFailureCount, incomplete: true };
      }
      try {
        await revokeSelfHostedParticipant(livekit.room, job.room_name, job.agent_identity);
      } catch {
        // Do not make a replacement claimable or a termination final until
        // Cloud token revocation and old-agent removal are both proved.
        retryableFailureCount += 1;
        continue;
      }
      const [marked] = await sql<{ id: string }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET agent_identity_revoked_at = now(), updated_at = now()
        WHERE id = ${job.id}
          AND runtime_profile = 'SELF_HOSTED_AGENT'
          AND status = 'STOPPING'
          AND agent_execution_version = ${job.agent_execution_version}
          AND agent_identity = ${job.agent_identity}
          AND agent_identity_revoked_at IS NULL
        RETURNING id
      `;
      if (!marked) continue;
    }
    await sql.begin(async (tx) => {
      const query = tx as unknown as CrmSql;
      const [locked] = await query<{
        id: string;
        agent_execution_version: number;
        desired_state: 'RUNNING' | 'STOPPED';
        failure_code: string | null;
        application_deadline_at: string | null;
        application_deadline_elapsed: boolean;
        provider_rate_microdollars_per_minute: string | number | null;
        hard_budget_microdollars: string | number | null;
      }[]>`
        SELECT id, agent_execution_version, desired_state, failure_code,
               provider_rate_microdollars_per_minute, hard_budget_microdollars,
               CASE WHEN started_at IS NOT NULL
                 THEN started_at + maximum_ai_duration_seconds * interval '1 second'
                 ELSE NULL END AS application_deadline_at,
               (started_at IS NULL
                 OR started_at + maximum_ai_duration_seconds * interval '1 second' <= now()
               ) AS application_deadline_elapsed
        FROM video_consultation_interpretation_jobs
        WHERE id = ${job.id}
          AND runtime_profile = 'SELF_HOSTED_AGENT'
          AND status = 'STOPPING'
          AND agent_identity_revoked_at IS NOT NULL
        FOR UPDATE
      `;
      if (!locked || locked.agent_execution_version !== job.agent_execution_version) return;
      await reconcileExpiredProviderSessions(query, { jobId: job.id });
      const [{ blocked_count: blocked } = { blocked_count: 1 }] = await query<{ blocked_count: number }[]>`
        SELECT count(*)::int AS blocked_count
        FROM video_consultation_provider_sessions
        WHERE job_id = ${job.id} AND state IN ('CREATING', 'ACTIVE', 'CLOSING', 'ORPHAN_WAIT')
      `;
      if (blocked > 0) return;
      let desiredState = locked.desired_state;
      let failureCode = locked.failure_code;
      if (desiredState === 'RUNNING' && locked.application_deadline_elapsed) {
        const deadlineFailureCode = locked.application_deadline_at
          ? 'APPLICATION_DEADLINE_ELAPSED'
          : 'SELF_HOST_TAKEOVER_INVARIANT_FAILED';
        const [expired] = await query<{ id: string }[]>`
          UPDATE video_consultation_interpretation_jobs
          SET desired_state = 'STOPPED', failure_code = ${deadlineFailureCode},
              updated_at = now()
          WHERE id = ${job.id} AND desired_state = 'RUNNING' AND status = 'STOPPING'
            AND agent_execution_version = ${locked.agent_execution_version}
          RETURNING id
        `;
        if (!expired) return;
        desiredState = 'STOPPED';
        failureCode = deadlineFailureCode;
        await query`
          INSERT INTO video_consultation_interpretation_events (
            job_id, event_type, actor_type, actor_id, execution_version, details
          ) VALUES (
            ${job.id}, ${locked.application_deadline_at ? 'APPLICATION_DEADLINE_ELAPSED' : 'FAIL'},
            'SYSTEM', NULL, ${locked.agent_execution_version},
            jsonb_build_object('reason', ${deadlineFailureCode}::text, 'state', 'SELF_HOST_CLEANUP_FINAL')
          )
        `;
      }
      if (desiredState === 'RUNNING') {
        const agentIdentity = `translator-${job.id}-v${locked.agent_execution_version}`;
        await query`
          UPDATE video_consultation_interpretation_jobs
          SET status = 'DISPATCHING', self_host_id = NULL,
              self_host_credential_version = NULL, lease_version = NULL,
              dispatch_id = NULL, agent_identity = ${agentIdentity},
              agent_identity_revoked_at = NULL,
              self_host_claim_deadline_at = LEAST(
                now() + ${SELF_HOST_CLAIM_TIMEOUT_SECONDS} * interval '1 second',
                ${locked.application_deadline_at}::timestamptz
              ),
              updated_at = now()
          WHERE id = ${job.id} AND agent_execution_version = ${locked.agent_execution_version}
        `;
        await query`
          INSERT INTO video_consultation_interpretation_events (
            job_id, event_type, actor_type, actor_id, execution_version, details
          ) VALUES (
            ${job.id}, 'TAKEOVER', 'SYSTEM', NULL, ${locked.agent_execution_version},
            jsonb_build_object('state', 'READY_FOR_CLAIM')
          )
        `;
      } else {
        const budget = await reconcileInterpretationBudget(query, locked);
        const finalStatus = failureCode === 'BUDGET_EXHAUSTED'
          ? 'BUDGET_EXHAUSTED'
          : failureCode === 'SELF_HOST_TAKEOVER_INVARIANT_FAILED' ? 'FAILED' : 'STOPPED';
        await query`
          UPDATE video_consultation_interpretation_jobs
          SET status = ${finalStatus}, consumed_microdollars = ${budget.consumedMicrodollars},
              reserved_microdollars = ${budget.consumedMicrodollars},
              stopped_at = COALESCE(stopped_at, now()), updated_at = now()
          WHERE id = ${job.id}
            AND desired_state = 'STOPPED'
            AND status = 'STOPPING'
            AND agent_execution_version = ${locked.agent_execution_version}
        `;
      }
    });
  }
  return { retryableFailureCount, incomplete: false };
}
