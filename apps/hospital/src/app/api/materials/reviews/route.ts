import { apiFetch } from '@/lib/api-fetch';
import { getSessionHospitalId } from '@/lib/session-helpers';

async function proxyMaterialsResponse(res: Response): Promise<Response> {
  const text = await res.text();

  if (!res.ok) {
    return Response.json(
      safeParseJson(text) ?? { error: 'Upstream error', status: res.status },
      { status: res.status },
    );
  }

  if (!text) {
    return new Response(null, { status: res.status });
  }

  return Response.json(JSON.parse(text), { status: res.status });
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) return Response.json({ error: 'No hospital ID' }, { status: 403 });

  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/materials/reviews`);
  return proxyMaterialsResponse(res);
}

export async function POST(request: Request): Promise<Response> {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) return Response.json({ error: 'No hospital ID' }, { status: 403 });

  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/materials/reviews`, {
    method: 'POST',
    body: await request.text(),
    headers: {
      'Content-Type': request.headers.get('content-type') ?? 'application/json',
    },
  });

  return proxyMaterialsResponse(res);
}
