export const PATIENT_JOIN_EARLY_MS = 15 * 60_000;
export const PATIENT_JOIN_OVERRUN_MS = 30 * 60_000;
export const PATIENT_TOKEN_MAX_TTL_SECONDS = 15 * 60;
export const PATIENT_JOIN_MAX_DURATION_MINUTES = 4 * 60;

export function canonicalPatientVideoIdentity(patientId: string, consultationId: string): string {
  return `patient-${patientId}-${consultationId}`;
}

export type PatientJoinDecision =
  | { allowed: true; ttlSeconds: number; closesAtMs: number }
  | { allowed: false; reason: 'missing_schedule' | 'too_early' | 'too_late' };

export function patientJoinDecision(input: {
  scheduledAt: string | null;
  startedAt?: string | null;
  durationMinutes: number | null | undefined;
  nowMs?: number;
}): PatientJoinDecision {
  const nowMs = input.nowMs ?? Date.now();
  const anchor = input.scheduledAt ?? input.startedAt;
  if (!anchor) return { allowed: false, reason: 'missing_schedule' };
  const scheduledAtMs = new Date(anchor).getTime();
  if (!Number.isFinite(scheduledAtMs)) return { allowed: false, reason: 'missing_schedule' };
  const durationMinutes = Math.min(
    Math.max(1, input.durationMinutes ?? 30),
    PATIENT_JOIN_MAX_DURATION_MINUTES,
  );
  const opensAtMs = input.scheduledAt ? scheduledAtMs - PATIENT_JOIN_EARLY_MS : scheduledAtMs;
  const closesAtMs = scheduledAtMs + durationMinutes * 60_000 + PATIENT_JOIN_OVERRUN_MS;
  if (nowMs < opensAtMs) return { allowed: false, reason: 'too_early' };
  if (nowMs >= closesAtMs) return { allowed: false, reason: 'too_late' };
  return {
    allowed: true,
    ttlSeconds: Math.max(1, Math.min(
      PATIENT_TOKEN_MAX_TTL_SECONDS,
      Math.floor((closesAtMs - nowMs) / 1_000),
    )),
    closesAtMs,
  };
}

export function isConsultationOver(input: {
  scheduledAt: string | null;
  startedAt?: string | null;
  durationMinutes: number | null | undefined;
  nowMs?: number;
}): boolean {
  const decision = patientJoinDecision(input);
  return !decision.allowed && decision.reason === 'too_late';
}

// Read-time derivation: a consultation whose join window has closed is shown
// as COMPLETED even if no one ever marked it ended. Deliberately not a
// database sweep, so rescheduling (a new future scheduled_at) revives the
// consultation without any state-machine surgery.
export function effectiveConsultationStatus<T extends string>(
  status: T,
  input: {
    scheduledAt: string | null;
    startedAt?: string | null;
    durationMinutes: number | null | undefined;
    nowMs?: number;
  },
): T | 'COMPLETED' {
  if ((status === 'SCHEDULED' || status === 'IN_PROGRESS') && isConsultationOver(input)) {
    return 'COMPLETED';
  }
  return status;
}

export interface PatientRoomAdmin {
  removeParticipant(
    roomName: string,
    identity: string,
    options: { revokeTokenTs: bigint },
  ): Promise<unknown>;
  deleteRoom(roomName: string): Promise<unknown>;
}

function roomMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { code?: unknown }).code === 'not_found';
}

export async function closePatientRoom(
  room: PatientRoomAdmin,
  roomName: string,
  patientIdentity: string,
  nowMs = Date.now(),
): Promise<void> {
  const revokeTokenTs = BigInt(Math.floor(nowMs / 1_000) + 1);
  try {
    await room.removeParticipant(roomName, patientIdentity, { revokeTokenTs });
  } catch (error) {
    if (!roomMissing(error)) throw error;
  }
  try {
    await room.deleteRoom(roomName);
  } catch (error) {
    if (!roomMissing(error)) throw error;
  }
}
