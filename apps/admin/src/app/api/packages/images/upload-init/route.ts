import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await apiFetch('/api/v2/packages/images/upload-init', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const responseBody = await res.text();
  return new Response(responseBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
