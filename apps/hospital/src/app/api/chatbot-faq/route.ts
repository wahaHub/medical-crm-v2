import { apiFetch } from '@/lib/api-fetch';
import { getSessionHospitalId } from '@/lib/session-helpers';

export async function GET(): Promise<Response> {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) return Response.json({ error: 'No hospital ID' }, { status: 403 });

  const res = await apiFetch(`/api/v2/chatbot/faqs?hospitalId=${hospitalId}`);
  if (!res.ok) return Response.json(await res.json().catch(() => ({})), { status: res.status });
  return Response.json(await res.json());
}
