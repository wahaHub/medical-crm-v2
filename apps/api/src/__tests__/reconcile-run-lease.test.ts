import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireReconcileRun,
  RECONCILE_PASS_BUDGET_MS,
} from '../video-interpretation/reconcile-run-lease.js';

function fakeLeaseSql() {
  const owners = new Map<string, string>();
  const outcomes = new Map<string, {
    successes: number;
    failures: number;
    lastErrorCode: string | null;
  }>();
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = strings.join('?');
    if (statement.includes('INSERT INTO video_interpretation_reconcile_leases')) {
      const profile = String(values[0]);
      const requestedOwner = String(values[1]);
      if (owners.has(profile)) return [];
      owners.set(profile, requestedOwner);
      outcomes.set(profile, { successes: 0, failures: 0, lastErrorCode: null });
      return [{ owner_id: requestedOwner }];
    }
    if (statement.includes('SET lease_expires_at')) {
      const profile = String(values[1]);
      const requestedOwner = String(values[2]);
      return owners.get(profile) === requestedOwner ? [{ owner_id: requestedOwner }] : [];
    }
    if (statement.includes('SET owner_id = NULL')) {
      const profile = String(values[0]);
      const requestedOwner = String(values[1]);
      if (owners.get(profile) === requestedOwner) owners.delete(profile);
      return [];
    }
    if (statement.includes('SET last_succeeded_at')) {
      const profile = String(values[0]);
      const requestedOwner = String(values[1]);
      if (owners.get(profile) !== requestedOwner) return [];
      const outcome = outcomes.get(profile)!;
      outcome.successes += 1;
      outcome.failures = 0;
      outcome.lastErrorCode = null;
      return [{ owner_id: requestedOwner }];
    }
    if (statement.includes('SET last_failed_at')) {
      const errorCode = String(values[0]);
      const profile = String(values[1]);
      const requestedOwner = String(values[2]);
      if (owners.get(profile) !== requestedOwner) return [];
      const outcome = outcomes.get(profile)!;
      outcome.failures += 1;
      outcome.lastErrorCode = errorCode;
      return [{ owner_id: requestedOwner }];
    }
    throw new Error('unexpected_sql');
  });
  return { sql, outcomes };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('video interpretation reconciliation runner lease', () => {
  it('allows only one owner per profile until the durable owner releases', async () => {
    const { sql } = fakeLeaseSql();
    const first = await acquireReconcileRun(sql as never, 'HOSTED');
    expect(first).not.toBeNull();
    await expect(acquireReconcileRun(sql as never, 'SELF_HOSTED_FENCE')).resolves.not.toBeNull();
    await expect(acquireReconcileRun(sql as never, 'HOSTED')).resolves.toBeNull();
    await first!.release();
    expect(first!.canStartExternalCalls()).toBe(false);
    await expect(acquireReconcileRun(sql as never, 'HOSTED')).resolves.not.toBeNull();
  });

  it('will not start a LiveKit call group that can exceed the pass budget', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T00:00:00.000Z'));
    const { sql } = fakeLeaseSql();
    const run = await acquireReconcileRun(sql as never, 'SELF_HOSTED_CLEANUP', Date.now());
    expect(run).not.toBeNull();
    expect(RECONCILE_PASS_BUDGET_MS).toBe(45_000);
    expect(run!.canStartExternalCalls(4)).toBe(true);
    expect(run!.canStartExternalCalls(5)).toBe(false);
    vi.advanceTimersByTime(20_000);
    expect(run!.canStartExternalCalls(3)).toBe(false);
    await expect(run!.beforeExternalCalls(3)).resolves.toBe(false);
  });

  it('records pass outcomes separately from lease liveness', async () => {
    const { sql, outcomes } = fakeLeaseSql();
    const run = await acquireReconcileRun(sql as never, 'HOSTED');
    expect(run).not.toBeNull();
    await expect(run!.markFailed('REMOTE_CLEANUP_RETRY_REQUIRED')).resolves.toBe(true);
    expect(outcomes.get('HOSTED')).toEqual({
      successes: 0,
      failures: 1,
      lastErrorCode: 'REMOTE_CLEANUP_RETRY_REQUIRED',
    });
    await expect(run!.markSucceeded()).resolves.toBe(true);
    expect(outcomes.get('HOSTED')).toEqual({
      successes: 1,
      failures: 0,
      lastErrorCode: null,
    });
    await run!.release();
    await expect(run!.markSucceeded()).resolves.toBe(false);
  });
});
