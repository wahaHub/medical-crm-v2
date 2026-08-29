import { randomUUID } from 'node:crypto';
import type { getCrmDb } from '@medical-crm/infrastructure/database';
import { LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS } from './security.js';

type CrmSql = ReturnType<typeof getCrmDb>['$client'];

export type ReconcileProfile = 'HOSTED' | 'SELF_HOSTED_FENCE' | 'SELF_HOSTED_CLEANUP';

export const RECONCILE_PASS_BUDGET_MS = 45_000;
export const RECONCILE_LEASE_TTL_SECONDS = 40;
export const RECONCILE_HTTP_TIMEOUT_MS = RECONCILE_PASS_BUDGET_MS + 10_000;

export interface ReconcileRunGuard {
  canStartExternalCalls(callCount?: number): boolean;
  beforeExternalCalls(callCount?: number): Promise<boolean>;
}

export interface ReconcilePassOutcome {
  retryableFailureCount: number;
  incomplete: boolean;
}

export const CLEAN_RECONCILE_PASS: ReconcilePassOutcome = {
  retryableFailureCount: 0,
  incomplete: false,
};

export function mergeReconcilePassOutcomes(
  ...outcomes: ReconcilePassOutcome[]
): ReconcilePassOutcome {
  return {
    retryableFailureCount: outcomes.reduce(
      (total, outcome) => total + outcome.retryableFailureCount,
      0,
    ),
    incomplete: outcomes.some((outcome) => outcome.incomplete),
  };
}

export interface AcquiredReconcileRun extends ReconcileRunGuard {
  markSucceeded(): Promise<boolean>;
  markFailed(errorCode: string): Promise<boolean>;
  release(): Promise<void>;
}

/**
 * Acquire a durable, cross-process single-flight lease. The lease is renewed
 * before each bounded group of LiveKit calls and can be stolen only after a
 * crashed owner stops renewing it.
 */
export async function acquireReconcileRun(
  sql: CrmSql,
  profile: ReconcileProfile,
  nowMs = Date.now(),
): Promise<AcquiredReconcileRun | null> {
  const ownerId = randomUUID();
  const [acquired] = await sql<{ owner_id: string }[]>`
    INSERT INTO video_interpretation_reconcile_leases (
      profile, owner_id, lease_expires_at, run_started_at, updated_at
    ) VALUES (
      ${profile}, ${ownerId}, now() + ${RECONCILE_LEASE_TTL_SECONDS} * interval '1 second', now(), now()
    )
    ON CONFLICT (profile) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        lease_expires_at = EXCLUDED.lease_expires_at,
        run_started_at = EXCLUDED.run_started_at,
        updated_at = now()
    WHERE video_interpretation_reconcile_leases.owner_id IS NULL
       OR video_interpretation_reconcile_leases.lease_expires_at <= now()
    RETURNING owner_id
  `;
  if (acquired?.owner_id !== ownerId) return null;

  const deadlineMs = nowMs + RECONCILE_PASS_BUDGET_MS;
  let leaseActive = true;
  const canStartExternalCalls = (callCount = 1): boolean => {
    const requiredMs = callCount * LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS * 1_000;
    return leaseActive && Date.now() + requiredMs <= deadlineMs;
  };

  return {
    canStartExternalCalls,
    async beforeExternalCalls(callCount = 1): Promise<boolean> {
      if (!canStartExternalCalls(callCount)) return false;
      const [renewed] = await sql<{ owner_id: string }[]>`
        UPDATE video_interpretation_reconcile_leases
        SET lease_expires_at = now() + ${RECONCILE_LEASE_TTL_SECONDS} * interval '1 second',
            updated_at = now()
        WHERE profile = ${profile} AND owner_id = ${ownerId}
          AND lease_expires_at > now()
        RETURNING owner_id
      `;
      leaseActive = renewed?.owner_id === ownerId;
      return leaseActive;
    },
    async markSucceeded(): Promise<boolean> {
      const [marked] = await sql<{ owner_id: string }[]>`
        UPDATE video_interpretation_reconcile_leases
        SET last_succeeded_at = now(), consecutive_failures = 0,
            last_error_code = NULL, updated_at = now()
        WHERE profile = ${profile} AND owner_id = ${ownerId}
        RETURNING owner_id
      `;
      return marked?.owner_id === ownerId;
    },
    async markFailed(errorCode: string): Promise<boolean> {
      const [marked] = await sql<{ owner_id: string }[]>`
        UPDATE video_interpretation_reconcile_leases
        SET last_failed_at = now(), consecutive_failures = consecutive_failures + 1,
            last_error_code = ${errorCode}, updated_at = now()
        WHERE profile = ${profile} AND owner_id = ${ownerId}
        RETURNING owner_id
      `;
      return marked?.owner_id === ownerId;
    },
    async release(): Promise<void> {
      leaseActive = false;
      await sql`
        UPDATE video_interpretation_reconcile_leases
        SET owner_id = NULL, lease_expires_at = now(), run_started_at = NULL, updated_at = now()
        WHERE profile = ${profile} AND owner_id = ${ownerId}
      `;
    },
  };
}
