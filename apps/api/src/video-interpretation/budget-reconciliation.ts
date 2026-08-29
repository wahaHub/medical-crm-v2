import type { getCrmDb } from '@medical-crm/infrastructure/database';

type CrmSql = ReturnType<typeof getCrmDb>['$client'];

/**
 * Reconciles non-content usage from server timestamps. Active sessions are
 * conservatively charged by wall-clock lifetime, so agent loss cannot suppress
 * the hard budget. The caller must already hold the job row lock.
 */
export async function reconcileInterpretationBudget(
  sql: CrmSql,
  job: {
    id: string;
    agent_execution_version: number;
    provider_rate_microdollars_per_minute: string | number | null;
    hard_budget_microdollars: string | number | null;
  },
): Promise<{ authorized: boolean; consumedMicrodollars: number }> {
  const rate = Number(job.provider_rate_microdollars_per_minute ?? 0);
  const hardLimit = Number(job.hard_budget_microdollars ?? 0);
  if (!Number.isSafeInteger(rate) || rate <= 0 || !Number.isSafeInteger(hardLimit) || hardLimit <= 0) {
    return { authorized: false, consumedMicrodollars: 0 };
  }

  await sql`
    UPDATE video_consultation_provider_sessions
    SET estimated_microdollars = GREATEST(
      estimated_microdollars,
      CEIL(
        GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(closed_at, now()) - created_at)))
        / 60 * ${rate}
      )::bigint
    ), updated_at = now()
    WHERE job_id = ${job.id}
  `;
  const [{ consumed_microdollars: consumedRaw } = { consumed_microdollars: 0 }] = await sql<{
    consumed_microdollars: string | number;
  }[]>`
    SELECT COALESCE(SUM(estimated_microdollars), 0)::bigint AS consumed_microdollars
    FROM video_consultation_provider_sessions
    WHERE job_id = ${job.id}
  `;
  const consumed = Number(consumedRaw);
  if (!Number.isSafeInteger(consumed) || consumed < 0) {
    return { authorized: false, consumedMicrodollars: 0 };
  }
  if (consumed < hardLimit) {
    await sql`
      UPDATE video_consultation_interpretation_jobs
      SET consumed_microdollars = ${consumed}, updated_at = now()
      WHERE id = ${job.id}
    `;
    return { authorized: true, consumedMicrodollars: consumed };
  }

  const [stopped] = await sql<{ agent_execution_version: number; authorization_revision: string | number }[]>`
    UPDATE video_consultation_interpretation_jobs
    SET consumed_microdollars = ${consumed}, desired_state = 'STOPPED',
        status = 'STOPPING',
        failure_code = 'BUDGET_EXHAUSTED', exchange_available = false,
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
    WHERE id = ${job.id} AND desired_state = 'RUNNING'
    RETURNING agent_execution_version, authorization_revision
  `;
  if (stopped) {
    await sql`
      UPDATE video_consultation_source_tracks
      SET authorized = false, unpublished_at = COALESCE(unpublished_at, now()),
          authorization_revision = ${Number(stopped.authorization_revision)}
      WHERE job_id = ${job.id} AND authorized = true
    `;
    await sql`
      UPDATE video_consultation_provider_sessions
      SET state = 'ORPHAN_WAIT', orphan_risk = true, updated_at = now()
      WHERE job_id = ${job.id} AND state IN ('CREATING', 'ACTIVE', 'CLOSING')
    `;
    await sql`
      INSERT INTO video_consultation_interpretation_events (
        job_id, event_type, actor_type, actor_id, execution_version, details
      ) VALUES (
        ${job.id}, 'BUDGET_CHANGED', 'SYSTEM', NULL, ${stopped.agent_execution_version},
        jsonb_build_object(
          'state', 'BUDGET_EXHAUSTED',
          'consumedMicrodollars', ${consumed},
          'hardLimitMicrodollars', ${hardLimit}
        )
      )
    `;
  }
  return { authorized: false, consumedMicrodollars: consumed };
}
