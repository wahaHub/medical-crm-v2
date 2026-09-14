import { describe, expect, it } from 'vitest';
import {
  doctorVideoRoomIsOpen,
  doctorVideoRoomWindow,
} from '../lib/video-consultation-window';

describe('doctor video consultation room window', () => {
  const consultation = {
    status: 'SCHEDULED',
    scheduledAt: '2026-09-01T10:00:00.000Z',
    durationMinutes: 30,
  };

  it('shows the room as open from ten minutes before the appointment', () => {
    expect(doctorVideoRoomIsOpen({
      ...consultation,
      nowMs: Date.parse('2026-09-01T09:49:59.999Z'),
    })).toBe(false);
    expect(doctorVideoRoomIsOpen({
      ...consultation,
      nowMs: Date.parse('2026-09-01T09:50:00.000Z'),
    })).toBe(true);
  });

  it('reports the device-check opening time', () => {
    expect(doctorVideoRoomWindow(consultation)?.opensAtMs)
      .toBe(Date.parse('2026-09-01T09:50:00.000Z'));
  });
});
