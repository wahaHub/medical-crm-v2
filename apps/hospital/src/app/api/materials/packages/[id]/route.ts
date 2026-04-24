import { apiFetch } from '@/lib/api-fetch';
import { getSessionHospitalId } from '@/lib/session-helpers';

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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

async function proxyMutation(request: Request, method: 'PUT' | 'DELETE', id: string): Promise<Response> {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) return Response.json({ error: 'No hospital ID' }, { status: 403 });

  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/materials/packages/${id}`, {
    method,
    body: method === 'DELETE' ? undefined : await request.text(),
    headers: {
      'Content-Type': request.headers.get('content-type') ?? 'application/json',
    },
  });

  return proxyMaterialsResponse(res);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<Record<string, string>> },
): Promise<Response> {
  const { id } = await params;
  if (!id) return Response.json({ error: 'Missing package ID' }, { status: 400 });
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) return Response.json({ error: 'No hospital ID' }, { status: 403 });

  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/materials/packages/${id}`);
  return proxyMaterialsResponse(res);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<Record<string, string>> },
): Promise<Response> {
  const { id } = await params;
  if (!id) return Response.json({ error: 'Missing package ID' }, { status: 400 });
  return proxyMutation(request, 'PUT', id);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<Record<string, string>> },
): Promise<Response> {
  const { id } = await params;
  if (!id) return Response.json({ error: 'Missing package ID' }, { status: 400 });
  return proxyMutation(request, 'DELETE', id);
}
