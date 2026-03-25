import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function GET(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.searchParams.get('path');
  if (!path) {
    return Response.json({ error: 'path is required' }, { status: 400 });
  }

  const res = await apiFetch(`/api/v2/documents/translate/file?path=${encodeURIComponent(path)}`);
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
