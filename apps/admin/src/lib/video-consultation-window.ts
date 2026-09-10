// Mirrors apps/api/src/video-interpretation/patient-video-access.ts — the
// admin app queries Supabase directly and cannot import the API's module.
// Keep the constants in sync with the API. Patient/status calculations use
// the 15-minute window; doctors can enter 10 minutes early for device checks.
// Both windows close 30 minutes after the scheduled end.

const JOIN_EARLY_MS = 15 * 60_000;
export const DOCTOR_JOIN_EARLY_MS = 10 * 60_000;
const JOIN_OVERRUN_MS = 30 * 60_000;
const JOIN_MAX_DURATION_MINUTES = 4 * 60;

function joinWindow(input: {
  scheduledAt: string | null;
  startedAt?: string | null;
  durationMinutes: number | null | undefined;
}): { opensAtMs: number; closesAtMs: number } | null {
  const anchor = input.scheduledAt ?? input.startedAt ?? null;
  if (!anchor) return null;
  const anchorMs = new Date(anchor).getTime();
  if (!Number.isFinite(anchorMs)) return null;
  const durationMinutes = Math.min(
    Math.max(1, input.durationMinutes ?? 30),
    JOIN_MAX_DURATION_MINUTES,
  );
  return {
    opensAtMs: input.scheduledAt ? anchorMs - JOIN_EARLY_MS : anchorMs,
    closesAtMs: anchorMs + durationMinutes * 60_000 + JOIN_OVERRUN_MS,
  };
}

export function doctorVideoRoomWindow(input: {
  scheduledAt: string | null;
  startedAt?: string | null;
  durationMinutes: number | null | undefined;
}): { opensAtMs: number; closesAtMs: number } | null {
  const window = joinWindow(input);
  if (!window || !input.scheduledAt) return window;
  return {
    ...window,
    opensAtMs: new Date(input.scheduledAt).getTime() - DOCTOR_JOIN_EARLY_MS,
  };
}

export function doctorVideoRoomIsOpen(input: {
  status: string;
  scheduledAt: string | null;
  startedAt?: string | null;
  durationMinutes: number | null | undefined;
  nowMs?: number;
}): boolean {
  if (input.status !== 'SCHEDULED' && input.status !== 'IN_PROGRESS') return false;
  const window = doctorVideoRoomWindow(input);
  if (!window) return false;
  const nowMs = input.nowMs ?? Date.now();
  return nowMs >= window.opensAtMs && nowMs < window.closesAtMs;
}

// Read-time derivation (same rule as the API's effectiveConsultationStatus):
// a consultation whose join window has ENDED displays as COMPLETED even if
// nobody marked it ended, so stale rooms stop showing "In Progress". A
// future ("too early") consultation is never affected, so rescheduling a
// stale booking revives it automatically.
export function effectiveVideoConsultationStatus<T extends string>(
  status: T,
  input: {
    scheduledAt: string | null;
    startedAt?: string | null;
    durationMinutes: number | null | undefined;
    nowMs?: number;
  },
): T | 'COMPLETED' {
  if (status !== 'SCHEDULED' && status !== 'IN_PROGRESS') return status;
  const window = joinWindow(input);
  if (!window) return status;
  return (input.nowMs ?? Date.now()) >= window.closesAtMs ? 'COMPLETED' : status;
}
