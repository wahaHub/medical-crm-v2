import type { getCrmDb } from '@medical-crm/infrastructure/database';
import {
  OPENAI_TRANSLATION_CONSERVATIVE_EXPIRY_SECONDS,
  STOPPED_ORPHAN_EXPIRY_SECONDS,
} from './security.js';

type CrmSql = ReturnType<typeof getCrmDb>['$client'];

type ReconciliationScope =
  | { jobId: string }
  | { consultationId: string };

/**
 * Fences a job's open provider sessions into ORPHAN_WAIT when the control
 * plane stops the job (operator stop, takeover, budget/deadline fence). The
 * agent has AGENT_CLOSURE_REPORT_GRACE_SECONDS to prove provider closure; a
 * fenced agent is fail-closed, so the orphan's provider fence is clamped to
 * STOPPED_ORPHAN_EXPIRY_SECONDS — a missed report must not wedge the room in
 * STOPPING (or block the next start) for the full provider-lifetime bound.
 */
export async function fenceJobProviderSessionsAsOrphans(sql: CrmSql, jobId: string): Promise<void> {
  await sql`
    UPDATE video_consultation_provider_sessions
    SET state = 'ORPHAN_WAIT', orphan_risk = true,
        provider_expires_at = LEAST(
          COALESCE(provider_expires_at, 'infinity'::timestamptz),
          now() + ${STOPPED_ORPHAN_EXPIRY_SECONDS} * interval '1 second'
        ),
        updated_at = now()
    WHERE job_id = ${jobId} AND state IN ('CREATING', 'ACTIVE', 'CLOSING')
  `;
}

/**
 * Releases a provider fence only after its server-owned conservative upper
 * bound. application_deadline_at is intentionally not consulted: it stops
 * Medora input, but is not evidence that the provider session is terminal.
 *
 * The operation is idempotent and writes the terminal row plus audit event in
 * the caller's transaction. Admission/START call it immediately before their
 * capacity checks, so an elapsed fence cannot block the next safe attempt.
 */
export async function reconcileExpiredProviderSessions(
  sql: CrmSql,
  scope: ReconciliationScope,
): Promise<void> {
  const scopePredicate = 'jobId' in scope
    ? sql`session.job_id = ${scope.jobId}`
    : sql`EXISTS (
        SELECT 1
        FROM video_consultation_interpretation_jobs scoped_job
        WHERE scoped_job.id = session.job_id
          AND scoped_job.consultation_id = ${scope.consultationId}
      )`;
  await sql`
    WITH expired AS (
      UPDATE video_consultation_provider_sessions session
      SET state = 'FAILED', orphan_risk = false,
          close_result = 'provider_conservative_expiry_elapsed',
          closed_at = COALESCE(closed_at, now()), updated_at = now()
      WHERE ${scopePredicate}
        AND session.state IN ('CREATING', 'ACTIVE', 'CLOSING', 'ORPHAN_WAIT')
        AND session.provider_expires_at IS NOT NULL
        AND session.provider_expires_at <= now()
      RETURNING session.id, session.job_id, session.agent_execution_version,
                session.provider_expires_at
    )
    INSERT INTO video_consultation_interpretation_events (
      job_id, event_type, actor_type, actor_id, execution_version, details
    )
    SELECT expired.job_id, 'PROVIDER_SESSION_CHANGED', 'SYSTEM', NULL,
           expired.agent_execution_version,
           jsonb_build_object(
             'providerSessionId', expired.id,
             'state', 'FAILED',
             'reason', 'provider_conservative_expiry_elapsed',
             'providerExpiresAt', expired.provider_expires_at,
             'profileBoundSeconds', ${OPENAI_TRANSLATION_CONSERVATIVE_EXPIRY_SECONDS}::int
           )
    FROM expired
  `;
}
