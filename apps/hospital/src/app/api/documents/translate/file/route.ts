import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function GET(request: NextRequest): Promise<Response> {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  const res = await apiFetch(`/api/v2/documents/translate/file?id=${encodeURIComponent(id)}`);
  const headers = new Headers();
  const contentType = res.headers.get('content-type');
  const contentDisposition = res.headers.get('content-disposition');

  if (contentType) headers.set('Content-Type', contentType);
  if (contentDisposition) headers.set('Content-Disposition', contentDisposition);
  headers.set('Cache-Control', 'no-store');

  return new Response(res.body, {
    status: res.status,
    headers,
  });
}
