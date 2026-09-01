import { describe, expect, it, vi } from 'vitest';
import {
  canonicalPatientVideoIdentity,
  closePatientRoom,
  patientJoinDecision,
  PATIENT_TOKEN_MAX_TTL_SECONDS,
} from '../video-interpretation/patient-video-access.js';

describe('patient video access window', () => {
  const scheduledAt = '2026-09-01T10:00:00.000Z';

  it('derives a consultation-bound canonical patient identity', () => {
    expect(canonicalPatientVideoIdentity('patient-1', 'consultation-1'))
      .toBe('patient-patient-1-consultation-1');
  });

  it('fails closed without a schedule and outside the bounded join window', () => {
    expect(patientJoinDecision({ scheduledAt: null, durationMinutes: 30 })).toEqual({
      allowed: false,
      reason: 'missing_schedule',
    });
    expect(patientJoinDecision({
      scheduledAt,
      durationMinutes: 30,
      nowMs: Date.parse('2026-09-01T09:44:59.999Z'),
    })).toEqual({ allowed: false, reason: 'too_early' });
    expect(patientJoinDecision({
      scheduledAt,
      durationMinutes: 30,
      nowMs: Date.parse('2026-09-01T11:00:00.000Z'),
    })).toEqual({ allowed: false, reason: 'too_late' });
  });

  it('caps token lifetime even when the stored duration is excessive', () => {
    const decision = patientJoinDecision({
      scheduledAt,
      durationMinutes: 100_000,
      nowMs: Date.parse('2026-09-01T10:00:00.000Z'),
    });
    expect(decision).toMatchObject({ allowed: true, ttlSeconds: PATIENT_TOKEN_MAX_TTL_SECONDS });
  });

  it('allows an immediate consultation only after its server start time', () => {
    expect(patientJoinDecision({
      scheduledAt: null,
      startedAt: '2026-09-01T10:00:00.000Z',
      durationMinutes: 30,
      nowMs: Date.parse('2026-09-01T10:00:01.000Z'),
    })).toMatchObject({ allowed: true, ttlSeconds: PATIENT_TOKEN_MAX_TTL_SECONDS });
    expect(patientJoinDecision({
      scheduledAt: null,
      startedAt: '2026-09-01T10:00:00.000Z',
      durationMinutes: 30,
      nowMs: Date.parse('2026-09-01T09:59:59.999Z'),
    })).toEqual({ allowed: false, reason: 'too_early' });
  });

  it('shortens the token to the remaining join window', () => {
    const decision = patientJoinDecision({
      scheduledAt,
      durationMinutes: 30,
      nowMs: Date.parse('2026-09-01T10:59:50.000Z'),
    });
    expect(decision).toMatchObject({ allowed: true, ttlSeconds: 10 });
  });
});

describe('patient room closure', () => {
  it('revokes the patient token generation and deletes the room', async () => {
    const room = {
      removeParticipant: vi.fn().mockResolvedValue(undefined),
      deleteRoom: vi.fn().mockResolvedValue(undefined),
    };
    await closePatientRoom(
      room,
      'consultation-room',
      'patient-1-consultation-1',
      Date.parse('2026-09-01T00:00:00.999Z'),
    );
    expect(room.removeParticipant).toHaveBeenCalledWith(
      'consultation-room',
      'patient-1-consultation-1',
      { revokeTokenTs: 1_788_220_801n },
    );
    expect(room.deleteRoom).toHaveBeenCalledWith('consultation-room');
  });

  it('surfaces remote cleanup failures for an explicit retry', async () => {
    const room = {
      removeParticipant: vi.fn().mockRejectedValue(new Error('LiveKit unavailable')),
      deleteRoom: vi.fn(),
    };
    await expect(closePatientRoom(room, 'room', 'patient')).rejects.toThrow('LiveKit unavailable');
    expect(room.deleteRoom).not.toHaveBeenCalled();
  });
});
