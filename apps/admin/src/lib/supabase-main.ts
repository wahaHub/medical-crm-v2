import { getSession } from './session';

const supabaseUrl = process.env.MAIN_SUPABASE_URL;
const serviceKey = process.env.MAIN_SUPABASE_SERVICE_KEY;

function getHeaders() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('MAIN_SUPABASE_URL and MAIN_SUPABASE_SERVICE_KEY are required');
  }
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function buildUrl(path: string, searchParams?: Record<string, string | undefined>) {
  if (!supabaseUrl) {
    throw new Error('MAIN_SUPABASE_URL is required');
  }
  const url = new URL(`${supabaseUrl}/rest/v1${path}`);
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }
  return url.toString();
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
  const params: Record<string, string> = {
    select: '*',
    order: 'scheduled_at.asc',
  };
  if (options?.status) {
    params.status = `in.(${options.status})`;
  }
  if (options?.doctorId) {
    params.doctor_id = `eq.${options.doctorId}`;
  }

  const res = await fetch(buildUrl('/video_consultations', params), {
    headers: getHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase query failed: ${res.status} ${text}`);
  }

  return (await res.json()) as VideoConsultation[];
}

export async function updateVideoConsultationStatus(
  id: string,
  status: VideoConsultation['status'],
  note?: string,
): Promise<VideoConsultation> {
  const body = {
    status,
    doctor_response_at: new Date().toISOString(),
    doctor_response_note: note ?? null,
  };

  const res = await fetch(buildUrl(`/video_consultations?id=eq.${id}`), {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase update failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as VideoConsultation[];
  if (!data[0]) {
    throw new Error(`Video consultation ${id} not found after update`);
  }
  return data[0];
}
