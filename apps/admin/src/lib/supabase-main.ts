import { getSession } from './session';
import { effectiveVideoConsultationStatus } from './video-consultation-window';
import postgres from 'postgres';

function getDbSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  return postgres(url, { max: 10 });
}

export interface VideoConsultation {
  id: string;
  case_id: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_email: string | null;
  room_name: string;
  status: 'PENDING_CONFIRMATION' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';
  scheduled_at: string | null;
  title: string | null;
  description: string | null;
  host_identity: string | null;
  timezone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  duration_minutes: number;
  doctor_response_at: string | null;
  doctor_response_note: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  patient_language: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function requireAdminSession() {
  const session = await getSession();
  if (!session?.access_token) {
    throw new Error('unauthorized');
  }
  return session;
}

export async function listVideoConsultations(options?: { status?: string; doctorId?: string }): Promise<VideoConsultation[]> {
  const sql = getDbSql();

  const statuses = options?.status
    ? options.status.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  const rows = await sql<VideoConsultation[]>`
    SELECT *
    FROM public.video_consultations
    WHERE 1 = 1
      ${statuses ? sql`AND status IN ${sql(statuses)}` : sql``}
      ${options?.doctorId ? sql`AND doctor_id = ${options.doctorId}` : sql``}
    ORDER BY scheduled_at DESC
  `;

  return rows.map((row) => ({
    ...row,
    status: effectiveVideoConsultationStatus(row.status, {
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      durationMinutes: row.duration_minutes,
    }),
  }));
}

export async function updateVideoConsultationStatus(
  id: string,
  status: VideoConsultation['status'],
  note?: string,
): Promise<VideoConsultation> {
  const sql = getDbSql();

  const [updated] = await sql<VideoConsultation[]>`
    UPDATE public.video_consultations
    SET
      status = ${status},
      doctor_response_at = ${new Date().toISOString()},
      doctor_response_note = ${note ?? null}
    WHERE id = ${id}
    RETURNING *
  `;

  if (!updated) {
    throw new Error(`Video consultation ${id} not found after update`);
  }
  return updated;
}

export async function completeVideoConsultation(id: string): Promise<VideoConsultation> {
  const sql = getDbSql();

  const [existing] = await sql<VideoConsultation[]>`
    SELECT * FROM public.video_consultations WHERE id = ${id}
  `;
  if (!existing) {
    throw new Error(`Video consultation ${id} not found`);
  }
  if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
    return existing;
  }

  const endedAt = new Date().toISOString();
  const durationSeconds = existing.started_at
    ? Math.max(
        0,
        Math.round(
          (new Date(endedAt).getTime() - new Date(existing.started_at).getTime()) / 1000,
        ),
      )
    : null;

  const [updated] = await sql<VideoConsultation[]>`
    UPDATE public.video_consultations
    SET status = ${'COMPLETED'}, ended_at = ${endedAt}, duration_seconds = ${durationSeconds}
    WHERE id = ${id}
    RETURNING *
  `;

  if (!updated) {
    throw new Error(`Video consultation ${id} not found after update`);
  }
  return updated;
}
