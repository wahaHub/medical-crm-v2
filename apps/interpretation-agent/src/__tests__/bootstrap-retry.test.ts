import { describe, expect, it, vi } from 'vitest';
import { bootstrapWithBoundedRetry } from '../bootstrap-retry.js';
import { BootstrapNotReadyError } from '../control-plane-client.js';

const execution = {
  schema: 'medora.interpretation.dispatch.v1' as const,
  dispatchCorrelationId: 'correlation-1',
  jobId: '00000000-0000-4000-8000-000000000001',
  roomName: 'room-1',
  roomGeneration: 1,
  interpretationGeneration: 1,
  executionVersion: 1,
  agentIdentity: 'translator-1',
};

const success = {
  success: true as const,
  capability: 'capability',
  capabilityExpiresAt: '2026-09-01T01:00:00.000Z',
  job: {
    id: execution.jobId,
    roomName: execution.roomName,
    roomGeneration: 1,
    interpretationGeneration: 1,
    executionVersion: 1,
    authorizationRevision: 1,
    providerProfile: 'INTEGRATED_REALTIME' as const,
    providerModel: 'model',
    providerEndpoint: 'https://api.openai.com/v1/realtime',
    agentIdentity: execution.agentIdentity,
    applicationDeadlineAt: '2026-09-01T00:05:00.000Z',
  },
  watchdog: { intervalMs: 1_000, maxRttMs: 2_000, authorizationTtlMs: 5_000 },
};

describe('hosted bootstrap retry', () => {
  it('retries only authenticated not-ready responses at a bounded rate', async () => {
    let nowMs = 0;
    const bootstrap = vi.fn()
      .mockRejectedValueOnce(new BootstrapNotReadyError())
      .mockResolvedValueOnce(success);
    const sleep = vi.fn(async (delayMs: number) => { nowMs += delayMs; });

    await expect(bootstrapWithBoundedRetry(
      { bootstrap }, execution, 'dispatch-1',
      { now: () => nowMs, sleep, jitter: () => 0, deadlineMs: 60_000 },
    )).resolves.toBe(success);
    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3_000);
  });

  it('does not retry invalid credentials or metadata', async () => {
    const failure = new Error('bootstrap_rejected');
    const bootstrap = vi.fn().mockRejectedValue(failure);
    await expect(bootstrapWithBoundedRetry(
      { bootstrap }, execution, 'dispatch-1', { sleep: vi.fn() },
    )).rejects.toBe(failure);
    expect(bootstrap).toHaveBeenCalledOnce();
  });

  it('stops at the absolute bootstrap deadline', async () => {
    let nowMs = 0;
    const bootstrap = vi.fn().mockRejectedValue(new BootstrapNotReadyError());
    await expect(bootstrapWithBoundedRetry(
      { bootstrap }, execution, 'dispatch-1',
      { now: () => nowMs, deadlineMs: 3_000, jitter: () => 0, sleep: async (delay) => { nowMs += delay; } },
    )).rejects.toThrow('hosted_bootstrap_timeout');
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });
});
