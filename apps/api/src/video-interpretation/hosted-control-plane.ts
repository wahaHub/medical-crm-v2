import type { getCrmDb } from '@medical-crm/infrastructure/database';
import type { LiveKitAPI } from 'livekit-server-sdk';
import { reconcileInterpretationBudget } from './budget-reconciliation.js';
import { reconcileExpiredProviderSessions } from './provider-session-reconciliation.js';
import { revokeSelfHostedParticipant } from './self-hosted-control-plane.js';
import {
  HOSTED_BOOTSTRAP_TIMEOUT_SECONDS,
  HOSTED_DISPATCH_ABSENCE_BOUND_VERIFIED,
  HOSTED_DISPATCH_RECOVERY_SETTLE_SECONDS,
} from './security.js';
import {
  mergeReconcilePassOutcomes,
  type ReconcilePassOutcome,
  type ReconcileRunGuard,
} from './reconcile-run-lease.js';

type CrmSql = ReturnType<typeof getCrmDb>['$client'];

export interface HostedDispatchCorrelation {
  id: string;
  room_name: string;
  room_generation: number;
  interpretation_generation: number;
  hosted_dispatch_correlation_id: string | null;
  hosted_dispatch_attempt_execution_version: string | number | null;
  hosted_dispatch_attempt_agent_identity: string | null;
  deployment_name: string | null;
}

interface HostedJob extends HostedDispatchCorrelation {
  agent_identity: string;
  agent_execution_version: number;
  dispatch_id: string | null;
  desired_state: 'RUNNING' | 'STOPPED';
  status: string;
  failure_code: string | null;
  started_at: string | null;
  maximum_ai_duration_seconds: number;
  provider_rate_microdollars_per_minute: string | number | null;
  hard_budget_microdollars: string | number | null;
  hosted_dispatch_deleted_at: string | null;
  hosted_dispatch_creation_pending: boolean;
  hosted_dispatch_requested_at: string | null;
  hosted_dispatch_absence_observed_at: string | null;
  hosted_dispatch_creation_deadline_at: string | null;
  hosted_bootstrap_deadline_at: string | null;
  agent_identity_revoked_at: string | null;
  application_deadline_elapsed: boolean;
  bootstrap_deadline_elapsed: boolean;
  authorization_valid: boolean;
}

interface ListedDispatch {
  id: string;
  room: string;
  agentName: string;
  metadata: string;
}

export function isExactHostedDispatch(
  dispatch: ListedDispatch,
  job: HostedDispatchCorrelation,
): boolean {
  if (!job.hosted_dispatch_correlation_id || !job.deployment_name
    || job.hosted_dispatch_attempt_execution_version === null
    || !job.hosted_dispatch_attempt_agent_identity) return false;
  try {
    const metadata = JSON.parse(dispatch.metadata) as Record<string, unknown>;
    return dispatch.room === job.room_name
      && dispatch.agentName === job.deployment_name
      && metadata.schema === 'medora.interpretation.dispatch.v1'
      && metadata.dispatchCorrelationId === job.hosted_dispatch_correlation_id
      && metadata.jobId === job.id
      && metadata.roomName === job.room_name
      && metadata.roomGeneration === job.room_generation
      && metadata.interpretationGeneration === job.interpretation_generation
      && metadata.executionVersion === Number(job.hosted_dispatch_attempt_execution_version)
      && metadata.agentIdentity === job.hosted_dispatch_attempt_agent_identity;
  } catch {
    return false;
  }
}

export function uniquelyMatchesReturnedHostedDispatch(
  dispatches: ListedDispatch[],
  job: HostedDispatchCorrelation,
  returnedDispatchId: string,
): boolean {
  const exact = dispatches.filter((dispatch) => isExactHostedDispatch(dispatch, job));
  return exact.length === 1 && exact[0]!.id === returnedDispatchId;
}

async function fenceRecoveredCreation(
  sql: CrmSql,
  job: HostedJob,
  dispatchId: string | null,
  dispatchAbsenceVerified: boolean,
  failureCode: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    const query = tx as unknown as CrmSql;
    const [fenced] = await query<{ agent_execution_version: number; authorization_revision: string | number }[]>`
      UPDATE video_consultation_interpretation_jobs
      SET desired_state = 'STOPPED', status = 'STOPPING',
          dispatch_id = COALESCE(${dispatchId}, dispatch_id),
          hosted_dispatch_creation_pending = false,
          hosted_dispatch_deleted_at = CASE
            WHEN ${dispatchAbsenceVerified} THEN now() ELSE NULL
          END,
          agent_identity_revoked_at = NULL,
          failure_code = CASE
            WHEN desired_state = 'RUNNING' THEN ${failureCode}
            ELSE COALESCE(failure_code, ${failureCode})
          END,
          exchange_available = false,
          job_capability_digest = NULL, capability_expires_at = NULL,
          agent_execution_version = CASE
            WHEN desired_state = 'RUNNING' THEN agent_execution_version + 1 ELSE agent_execution_version
          END,
          authorization_revision = CASE
            WHEN desired_state = 'RUNNING' THEN authorization_revision + 1 ELSE authorization_revision
          END,
          updated_at = now()
      WHERE id = ${job.id}
        AND hosted_dispatch_creation_pending = true
        AND hosted_dispatch_correlation_id = ${job.hosted_dispatch_correlation_id}
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
        jsonb_build_object('reason', ${failureCode}::text, 'state', 'HOSTED_CLEANUP_PENDING')
      )
    `;
  });
}

/** Recover the createDispatch unknown-outcome window without ever retrying create. */
export async function recoverUncertainHostedDispatchCreations(
  sql: CrmSql,
  livekit: LiveKitAPI,
  guard?: ReconcileRunGuard,
): Promise<ReconcilePassOutcome> {
  let retryableFailureCount = 0;
  const pending = await sql<HostedJob[]>`
    SELECT job.*, deployment.deployment_name,
           false AS application_deadline_elapsed,
           false AS bootstrap_deadline_elapsed,
           false AS authorization_valid
    FROM video_consultation_interpretation_jobs job
    LEFT JOIN video_consultation_hosted_deployments deployment
      ON deployment.id = job.hosted_deployment_id
    WHERE job.runtime_profile = 'HOSTED_AGENT_V1'
      AND job.hosted_dispatch_creation_pending = true
      AND job.hosted_dispatch_requested_at IS NOT NULL
      AND job.hosted_dispatch_requested_at
        <= now() - ${HOSTED_DISPATCH_RECOVERY_SETTLE_SECONDS} * interval '1 second'
    ORDER BY job.hosted_dispatch_requested_at
    LIMIT 4
  `;
  for (const job of pending) {
    if (guard && !await guard.beforeExternalCalls()) {
      return { retryableFailureCount, incomplete: true };
    }
    let listed: Awaited<ReturnType<LiveKitAPI['agentDispatch']['listDispatch']>>;
    try {
      listed = await livekit.agentDispatch.listDispatch(job.room_name);
    } catch {
      retryableFailureCount += 1;
      continue;
    }
    const exact = listed.filter((dispatch) => isExactHostedDispatch(dispatch, job));
    if (exact.length === 1) {
      if (job.desired_state === 'RUNNING') {
        await sql`
          UPDATE video_consultation_interpretation_jobs
          SET dispatch_id = ${exact[0]!.id}, status = 'AWAITING_AGENT',
              hosted_dispatch_creation_pending = false,
              hosted_bootstrap_deadline_at = now() + ${HOSTED_BOOTSTRAP_TIMEOUT_SECONDS} * interval '1 second',
              updated_at = now()
          WHERE id = ${job.id}
            AND desired_state = 'RUNNING' AND status = 'DISPATCHING'
            AND hosted_dispatch_creation_pending = true
            AND hosted_dispatch_correlation_id = ${job.hosted_dispatch_correlation_id}
            AND agent_execution_version = ${job.agent_execution_version}
        `;
      } else {
        await fenceRecoveredCreation(sql, job, exact[0]!.id, false, 'HOSTED_DISPATCH_RECOVERED_AFTER_STOP');
      }
      continue;
    }
    if (exact.length > 1) {
      let allDeleted = true;
      for (const dispatch of exact) {
        if (guard && !await guard.beforeExternalCalls(3)) {
          return { retryableFailureCount, incomplete: true };
        }
        try {
          await deleteExactDispatch(livekit.agentDispatch, job.room_name, dispatch.id);
        } catch {
          allDeleted = false;
          retryableFailureCount += 1;
        }
      }
      if (allDeleted) {
        await fenceRecoveredCreation(sql, job, null, true, 'HOSTED_DUPLICATE_DISPATCH_RECOVERED');
      }
      continue;
    }

    if (!job.hosted_dispatch_absence_observed_at) {
      await sql`
        UPDATE video_consultation_interpretation_jobs
        SET hosted_dispatch_absence_observed_at = now(), updated_at = now()
        WHERE id = ${job.id}
          AND hosted_dispatch_creation_pending = true
          AND hosted_dispatch_correlation_id = ${job.hosted_dispatch_correlation_id}
          AND hosted_dispatch_absence_observed_at IS NULL
      `;
      continue;
    }
    const absenceOldEnough = new Date(job.hosted_dispatch_absence_observed_at).getTime()
      <= Date.now() - HOSTED_DISPATCH_RECOVERY_SETTLE_SECONDS * 1_000;
    if (HOSTED_DISPATCH_ABSENCE_BOUND_VERIFIED && absenceOldEnough) {
      await fenceRecoveredCreation(sql, job, null, true, 'HOSTED_DISPATCH_ABSENCE_VERIFIED');
    }
  }
  return { retryableFailureCount, incomplete: false };
}

/** Fence hosted jobs without relying on a cooperative agent completion call. */
export async function fenceExpiredOrUnauthorizedHostedJobs(sql: CrmSql): Promise<void> {
  await sql.begin(async (tx) => {
    const query = tx as unknown as CrmSql;
    const jobs = await query<HostedJob[]>`
      SELECT job.*,
        (job.started_at IS NOT NULL AND
          job.started_at + job.maximum_ai_duration_seconds * interval '1 second' <= now()
        ) AS application_deadline_elapsed,
        (job.started_at IS NULL AND (
          (job.status = 'DISPATCHING'
            AND job.hosted_dispatch_creation_deadline_at IS NOT NULL
            AND job.hosted_dispatch_creation_deadline_at <= now())
          OR (job.status = 'AWAITING_AGENT'
            AND job.hosted_bootstrap_deadline_at IS NOT NULL
            AND job.hosted_bootstrap_deadline_at <= now())
        )
        ) AS bootstrap_deadline_elapsed,
        EXISTS (
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
            AND approval.privacy_verified = true
            AND approval.observability_disabled = true
            AND approval.retention_verified = true
            AND (job.data_classification <> 'REAL_PATIENT' OR approval.contracts_approved = true)
        ) AS authorization_valid
      FROM video_consultation_interpretation_jobs job
      WHERE job.runtime_profile = 'HOSTED_AGENT_V1'
        AND job.desired_state = 'RUNNING'
        AND job.status IN ('DISPATCHING', 'AWAITING_AGENT', 'ACTIVE')
        AND job.hosted_dispatch_creation_pending = false
      ORDER BY job.updated_at
      LIMIT 4
      FOR UPDATE OF job SKIP LOCKED
    `;
    for (const job of jobs) {
      const budget = await reconcileInterpretationBudget(query, job);
      if (!budget.authorized) continue;
      if (!job.application_deadline_elapsed && !job.bootstrap_deadline_elapsed
        && job.authorization_valid) continue;
      const failureCode = job.application_deadline_elapsed
        ? 'APPLICATION_DEADLINE_ELAPSED'
        : job.bootstrap_deadline_elapsed
          ? (job.status === 'DISPATCHING' ? 'HOSTED_DISPATCH_TIMEOUT' : 'HOSTED_BOOTSTRAP_TIMEOUT')
          : 'AUTHORIZATION_EXPIRED';
      const eventType = job.application_deadline_elapsed
        ? 'APPLICATION_DEADLINE_ELAPSED'
        : job.bootstrap_deadline_elapsed ? 'FAIL' : 'AUTHORIZATION_EXPIRED';
      const [fenced] = await query<{ agent_execution_version: number; authorization_revision: string | number }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET desired_state = 'STOPPED', status = 'STOPPING',
            failure_code = ${failureCode}, exchange_available = false,
            job_capability_digest = NULL, capability_expires_at = NULL,
            agent_execution_version = agent_execution_version + 1,
            authorization_revision = authorization_revision + 1,
            hosted_dispatch_deleted_at = NULL,
            agent_identity_revoked_at = NULL, updated_at = now()
        WHERE id = ${job.id}
          AND desired_state = 'RUNNING'
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
          jsonb_build_object('state', 'HOSTED_CLEANUP_PENDING', 'reason', ${failureCode}::text)
        )
      `;
    }
  });
}

export async function deleteExactDispatch(
  agentDispatch: LiveKitAPI['agentDispatch'],
  roomName: string,
  dispatchId: string,
): Promise<void> {
  try {
    await agentDispatch.deleteDispatch(dispatchId, roomName);
  } catch {
    const remaining = await agentDispatch.listDispatch(roomName);
    if (remaining.some((dispatch) => dispatch.id === dispatchId)) throw new Error('hosted_dispatch_still_present');
  }
  const remaining = await agentDispatch.listDispatch(roomName);
  if (remaining.some((dispatch) => dispatch.id === dispatchId)) throw new Error('hosted_dispatch_still_present');
}

/** Complete durable hosted dispatch/identity/provider cleanup, then release budget/capacity. */
export async function prepareHostedTerminations(
  sql: CrmSql,
  livekit: LiveKitAPI,
  guard?: ReconcileRunGuard,
): Promise<ReconcilePassOutcome> {
  const recoveryOutcome = await recoverUncertainHostedDispatchCreations(sql, livekit, guard);
  if (recoveryOutcome.incomplete) return recoveryOutcome;
  if (guard && !guard.canStartExternalCalls()) {
    return mergeReconcilePassOutcomes(recoveryOutcome, {
      retryableFailureCount: 0,
      incomplete: true,
    });
  }
  let retryableFailureCount = 0;
  await fenceExpiredOrUnauthorizedHostedJobs(sql);
  const pending = await sql<HostedJob[]>`
    SELECT *, NULL::text AS deployment_name,
           false AS application_deadline_elapsed,
           false AS bootstrap_deadline_elapsed, false AS authorization_valid
    FROM video_consultation_interpretation_jobs
    WHERE runtime_profile = 'HOSTED_AGENT_V1'
      AND desired_state = 'STOPPED' AND status = 'STOPPING'
      AND hosted_dispatch_creation_pending = false
    ORDER BY updated_at
    LIMIT 8
  `;
  for (const job of pending) {
    if (!job.hosted_dispatch_deleted_at) {
      if (guard && !await guard.beforeExternalCalls(job.dispatch_id ? 3 : 1)) {
        return mergeReconcilePassOutcomes(recoveryOutcome, {
          retryableFailureCount,
          incomplete: true,
        });
      }
      try {
        if (job.dispatch_id) {
          await deleteExactDispatch(livekit.agentDispatch, job.room_name, job.dispatch_id);
        }
      } catch {
        retryableFailureCount += 1;
        continue;
      }
      const [marked] = await sql<{ id: string }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET hosted_dispatch_deleted_at = now(), updated_at = now()
        WHERE id = ${job.id} AND status = 'STOPPING'
          AND agent_execution_version = ${job.agent_execution_version}
          AND hosted_dispatch_deleted_at IS NULL
        RETURNING id
      `;
      if (!marked) continue;
    }
    if (!job.agent_identity_revoked_at) {
      if (guard && !await guard.beforeExternalCalls(2)) {
        return mergeReconcilePassOutcomes(recoveryOutcome, {
          retryableFailureCount,
          incomplete: true,
        });
      }
      try {
        await revokeSelfHostedParticipant(livekit.room, job.room_name, job.agent_identity);
      } catch {
        retryableFailureCount += 1;
        continue;
      }
      const [marked] = await sql<{ id: string }[]>`
        UPDATE video_consultation_interpretation_jobs
        SET agent_identity_revoked_at = now(), updated_at = now()
        WHERE id = ${job.id} AND status = 'STOPPING'
          AND agent_execution_version = ${job.agent_execution_version}
          AND agent_identity = ${job.agent_identity}
          AND agent_identity_revoked_at IS NULL
        RETURNING id
      `;
      if (!marked) continue;
    }
    await sql.begin(async (tx) => {
      const query = tx as unknown as CrmSql;
      const [locked] = await query<HostedJob[]>`
        SELECT *, NULL::text AS deployment_name,
               false AS application_deadline_elapsed,
               false AS bootstrap_deadline_elapsed, false AS authorization_valid
        FROM video_consultation_interpretation_jobs
        WHERE id = ${job.id}
          AND runtime_profile = 'HOSTED_AGENT_V1'
          AND desired_state = 'STOPPED' AND status = 'STOPPING'
          AND hosted_dispatch_deleted_at IS NOT NULL
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
      const budget = await reconcileInterpretationBudget(query, locked);
      const finalStatus = locked.failure_code === 'BUDGET_EXHAUSTED'
        ? 'BUDGET_EXHAUSTED'
        : ['LIVEKIT_DISPATCH_FAILED', 'HOSTED_DISPATCH_TIMEOUT', 'HOSTED_BOOTSTRAP_TIMEOUT',
          'HOSTED_DUPLICATE_DISPATCH_RECOVERED', 'HOSTED_DISPATCH_ABSENCE_VERIFIED',
          'HOSTED_DISPATCH_OUTCOME_UNKNOWN']
            .includes(locked.failure_code ?? '') ? 'FAILED' : 'STOPPED';
      await query`
        UPDATE video_consultation_interpretation_jobs
        SET status = ${finalStatus}, consumed_microdollars = ${budget.consumedMicrodollars},
            reserved_microdollars = ${budget.consumedMicrodollars},
            stopped_at = COALESCE(stopped_at, now()), updated_at = now()
        WHERE id = ${job.id} AND status = 'STOPPING'
          AND agent_execution_version = ${locked.agent_execution_version}
      `;
    });
  }
  return mergeReconcilePassOutcomes(recoveryOutcome, {
    retryableFailureCount,
    incomplete: false,
  });
}
