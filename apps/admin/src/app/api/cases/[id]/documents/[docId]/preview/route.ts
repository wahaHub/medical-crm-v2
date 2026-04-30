import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

interface RouteContext {
  params: Promise<{ id: string; docId: string }>;
}

const PREVIEW_HEADERS = ['Content-Type', 'Content-Disposition', 'Cache-Control'] as const;

export async function GET(_request: NextRequest, context: RouteContext): Promise<Response> {
  const { id, docId } = await context.params;
  const upstream = await apiFetch(`/api/v2/cases/${id}/documents/${docId}/preview`);

  if (!upstream.ok) {
    return Response.json(
      { error: 'Failed to preview document', status: upstream.status },
      { status: upstream.status },
    );
  }

  const headers = new Headers();
  for (const headerName of PREVIEW_HEADERS) {
    const headerValue = upstream.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
