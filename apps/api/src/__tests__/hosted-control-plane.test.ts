import { describe, expect, it, vi } from 'vitest';
import {
  deleteExactDispatch,
  isExactHostedDispatch,
  uniquelyMatchesReturnedHostedDispatch,
} from '../video-interpretation/hosted-control-plane.js';

describe('hosted interpretation dispatch cleanup', () => {
  it('matches recovery dispatches only by the full non-PHI correlation envelope', () => {
    const job = {
      id: 'job-1',
      room_name: 'consultation-room',
      room_generation: 2,
      interpretation_generation: 3,
      agent_execution_version: 4,
      agent_identity: 'translator-job-1-v4',
      hosted_dispatch_correlation_id: 'correlation-1',
      hosted_dispatch_attempt_execution_version: 4,
      hosted_dispatch_attempt_agent_identity: 'translator-job-1-v4',
      deployment_name: 'medora-interpretation-v1',
    };
    const dispatch = {
      id: 'dispatch-1',
      room: 'consultation-room',
      agentName: 'medora-interpretation-v1',
      metadata: JSON.stringify({
        schema: 'medora.interpretation.dispatch.v1',
        dispatchCorrelationId: 'correlation-1',
        jobId: 'job-1',
        roomName: 'consultation-room',
        roomGeneration: 2,
        interpretationGeneration: 3,
        executionVersion: 4,
        agentIdentity: 'translator-job-1-v4',
      }),
    };
    expect(isExactHostedDispatch(dispatch, job as never)).toBe(true);
    expect(isExactHostedDispatch({
      ...dispatch,
      metadata: JSON.stringify({
        ...JSON.parse(dispatch.metadata),
        executionVersion: 5,
      }),
    }, job as never)).toBe(false);
    expect(isExactHostedDispatch({ ...dispatch, metadata: '{bad json' }, job as never)).toBe(false);
  });

  it('deletes the exact dispatch and verifies it is absent', async () => {
    const agentDispatch = {
      deleteDispatch: vi.fn().mockResolvedValue(undefined),
      listDispatch: vi.fn().mockResolvedValue([]),
    };
    await deleteExactDispatch(agentDispatch as never, 'consultation-room', 'dispatch-1');
    expect(agentDispatch.deleteDispatch).toHaveBeenCalledWith('dispatch-1', 'consultation-room');
    expect(agentDispatch.listDispatch).toHaveBeenCalledWith('consultation-room');
  });

  it('adopts a create result only when the full envelope has exactly one matching ID', () => {
    const job = {
      id: 'job-1',
      room_name: 'consultation-room',
      room_generation: 2,
      interpretation_generation: 3,
      hosted_dispatch_correlation_id: 'correlation-1',
      hosted_dispatch_attempt_execution_version: 4,
      hosted_dispatch_attempt_agent_identity: 'translator-job-1-v4',
      deployment_name: 'medora-interpretation-v1',
    };
    const exact = {
      id: 'dispatch-1',
      room: 'consultation-room',
      agentName: 'medora-interpretation-v1',
      metadata: JSON.stringify({
        schema: 'medora.interpretation.dispatch.v1',
        dispatchCorrelationId: 'correlation-1',
        jobId: 'job-1',
        roomName: 'consultation-room',
        roomGeneration: 2,
        interpretationGeneration: 3,
        executionVersion: 4,
        agentIdentity: 'translator-job-1-v4',
      }),
    };
    const foreign = { ...exact, id: 'foreign', metadata: '{}' };
    expect(uniquelyMatchesReturnedHostedDispatch([exact, foreign], job, 'dispatch-1')).toBe(true);
    expect(uniquelyMatchesReturnedHostedDispatch([exact], job, 'different-id')).toBe(false);
    expect(uniquelyMatchesReturnedHostedDispatch([], job, 'dispatch-1')).toBe(false);
    expect(uniquelyMatchesReturnedHostedDispatch([
      exact,
      { ...exact, id: 'dispatch-2' },
    ], job, 'dispatch-1')).toBe(false);
  });

  it('converges after a crash gap when deletion now reports not found', async () => {
    const agentDispatch = {
      deleteDispatch: vi.fn().mockRejectedValue(new Error('not found')),
      listDispatch: vi.fn().mockResolvedValue([]),
    };
    await expect(deleteExactDispatch(
      agentDispatch as never,
      'consultation-room',
      'dispatch-1',
    )).resolves.toBeUndefined();
  });

  it('fails closed while the exact dispatch remains', async () => {
    const agentDispatch = {
      deleteDispatch: vi.fn().mockRejectedValue(new Error('timeout')),
      listDispatch: vi.fn().mockResolvedValue([{ id: 'dispatch-1' }]),
    };
    await expect(deleteExactDispatch(
      agentDispatch as never,
      'consultation-room',
      'dispatch-1',
    )).rejects.toThrow('hosted_dispatch_still_present');
  });
});
