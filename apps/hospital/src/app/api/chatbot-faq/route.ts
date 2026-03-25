import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';
import { getSessionHospitalId } from '@/lib/session-helpers';

export async function GET(request: NextRequest): Promise<Response> {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) return Response.json({ error: 'No hospital ID' }, { status: 403 });

  const query = request.nextUrl.searchParams.toString();
  const path = query ? `/api/v2/chatbot/faqs?${query}` : '/api/v2/chatbot/faqs';
  const res = await apiFetch(path);
  if (!res.ok) return Response.json(await res.json().catch(() => ({})), { status: res.status });
  return Response.json(await res.json());
}
