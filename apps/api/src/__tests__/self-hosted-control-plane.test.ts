import { describe, expect, it, vi } from 'vitest';
import {
  isProvablyNeverClaimed,
  liveKitRevocationCutoffSeconds,
  revokeSelfHostedParticipant,
} from '../video-interpretation/self-hosted-control-plane.js';

describe('self-hosted interpretation LiveKit fencing', () => {
  it('fast-finalizes only a job that provably never received remote authority', () => {
    const neverClaimed = {
      self_host_id: null,
      self_host_credential_version: null,
      lease_version: null,
      lease_expires_at: null,
      dispatch_id: null,
      job_capability_digest: null,
      capability_expires_at: null,
      started_at: null,
      provider_session_count: 0,
      source_track_count: 0,
    };
    expect(isProvablyNeverClaimed(neverClaimed)).toBe(true);
    expect(isProvablyNeverClaimed({ ...neverClaimed, provider_session_count: 1 })).toBe(false);
    expect(isProvablyNeverClaimed({ ...neverClaimed, dispatch_id: 'self-host-issued' })).toBe(false);
    expect(isProvablyNeverClaimed({ ...neverClaimed, lease_version: 1 })).toBe(false);
    expect(isProvablyNeverClaimed({ ...neverClaimed, started_at: new Date().toISOString() })).toBe(false);
  });

  it('revokes an old identity even when it is already offline', async () => {
    const room = {
      removeParticipant: vi.fn().mockResolvedValue(undefined),
      listParticipants: vi.fn().mockResolvedValue([{ identity: 'human-doctor' }]),
    };
    const now = Date.parse('2026-08-29T00:00:00.999Z');
    await revokeSelfHostedParticipant(room, 'consultation-room', 'translator-job-v1', now);
    expect(room.removeParticipant).toHaveBeenCalledWith(
      'consultation-room',
      'translator-job-v1',
      { revokeTokenTs: 1_787_961_601n },
    );
    expect(room.listParticipants).toHaveBeenCalledWith('consultation-room');
    expect(liveKitRevocationCutoffSeconds(now)).toBe(1_787_961_601n);
  });

  it('fails closed while the exact old identity remains', async () => {
    const room = {
      removeParticipant: vi.fn().mockResolvedValue(undefined),
      listParticipants: vi.fn().mockResolvedValue([
        { identity: 'human-patient' },
        { identity: 'translator-job-v1' },
      ]),
    };
    await expect(revokeSelfHostedParticipant(
      room,
      'consultation-room',
      'translator-job-v1',
    )).rejects.toThrow('self_hosted_identity_still_present_after_revocation');
  });

  it('propagates revocation failures instead of allowing takeover', async () => {
    const room = {
      removeParticipant: vi.fn().mockRejectedValue(new Error('LiveKit unavailable')),
      listParticipants: vi.fn(),
    };
    await expect(revokeSelfHostedParticipant(
      room,
      'consultation-room',
      'translator-job-v1',
    )).rejects.toThrow('LiveKit unavailable');
    expect(room.listParticipants).not.toHaveBeenCalled();
  });
});
