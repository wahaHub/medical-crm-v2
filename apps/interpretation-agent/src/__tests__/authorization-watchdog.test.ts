import { describe, expect, it } from 'vitest';
import { AuthorizationWatchdog, type WatchdogRequest } from '../authorization-watchdog.js';
import type { AuthorizationResponse, DispatchMetadata } from '../runtime-types.js';

const execution: DispatchMetadata = {
  schema: 'medora.interpretation.dispatch.v1',
  jobId: 'job-1',
  roomName: 'room-1',
  roomGeneration: 1,
  interpretationGeneration: 2,
  executionVersion: 3,
  agentIdentity: 'translator-1',
};

function response(request: WatchdogRequest, overrides: Partial<AuthorizationResponse> = {}): AuthorizationResponse {
  return {
    success: true,
    authorized: true,
    requestSeq: request.requestSeq,
    nonce: request.nonce,
    jobId: execution.jobId,
    roomName: execution.roomName,
    roomGeneration: execution.roomGeneration,
    interpretationGeneration: execution.interpretationGeneration,
    executionVersion: execution.executionVersion,
    authorizationRevision: 5,
    tracks: [{
      id: 'track-1',
      participantIdentity: 'patient-1',
      trackSid: 'TR_1',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      languageVersion: 1,
      consentVersion: 1,
      authorizationRevision: 5,
      authorized: true,
    }],
    ...overrides,
  };
}

describe('AuthorizationWatchdog', () => {
  it('uses request-start TTL and exact track authorization', () => {
    const watchdog = new AuthorizationWatchdog(execution);
    const request = watchdog.begin(1_000)!;
    expect(watchdog.accept(request, response(request), 1_200)).toBe(true);
    expect(watchdog.authorizationDeadlineMonotonicMs).toBe(2_500);
    expect(watchdog.canForward('track-1', 2_500)).toBe(true);
    expect(watchdog.canForward('track-1', 2_501)).toBe(false);
    expect(watchdog.canForward('unknown', 1_300)).toBe(false);
  });

  it('rejects slow responses without extending an existing deadline', () => {
    const watchdog = new AuthorizationWatchdog(execution);
    const first = watchdog.begin(1_000)!;
    expect(watchdog.accept(first, response(first), 1_100)).toBe(true);
    const second = watchdog.begin(1_500)!;
    expect(watchdog.accept(second, response(second), 1_901)).toBe(false);
    expect(watchdog.authorizationDeadlineMonotonicMs).toBe(2_500);
  });

  it('rejects nonce, execution, revision, and track-version regression', () => {
    const watchdog = new AuthorizationWatchdog(execution);
    const first = watchdog.begin(100)!;
    expect(watchdog.accept(first, response(first), 200)).toBe(true);

    const badNonce = watchdog.begin(300)!;
    expect(watchdog.accept(badNonce, response(badNonce, { nonce: 'wrong' }), 350)).toBe(false);

    const staleExecution = watchdog.begin(400)!;
    expect(watchdog.accept(staleExecution, response(staleExecution, { executionVersion: 2 }), 450)).toBe(false);

    const revisionRegression = watchdog.begin(500)!;
    expect(watchdog.accept(revisionRegression, response(revisionRegression, { authorizationRevision: 4 }), 550)).toBe(false);

    const trackRegression = watchdog.begin(600)!;
    const regressing = response(trackRegression, {
      authorizationRevision: 6,
      tracks: [{ ...response(trackRegression).tracks[0]!, authorizationRevision: 6, consentVersion: 0 }],
    });
    expect(watchdog.accept(trackRegression, regressing, 650)).toBe(false);
  });

  it('allows at most one refresh in flight', () => {
    const watchdog = new AuthorizationWatchdog(execution);
    const request = watchdog.begin(100)!;
    expect(watchdog.begin(101)).toBeNull();
    watchdog.reject(request);
    expect(watchdog.begin(102)?.requestSeq).toBe(2);
  });
});
