import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = await request.json();
  const res = await apiFetch(`/api/v2/hospitals/${id}/registration-token`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}
